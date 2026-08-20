import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rolldown } from 'rolldown';

const bundle = await rolldown({
  input: 'test/input-system-fixture.ts',
  platform: 'browser',
});
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find(chunk => chunk.type === 'chunk')?.code;
assert.ok(code, 'input fixture should bundle');
const input = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

function buttons(count, pressed = []) {
  const active = new Set(pressed);
  return Array.from({ length: count }, (_, index) => ({
    pressed: active.has(index),
    value: active.has(index) ? 1 : 0,
  }));
}

function pad(index, axes = [0], pressed = [], count = 17) {
  return { index, connected: true, axes, buttons: buttons(count, pressed), id: `Pad ${index}` };
}

test('contexts gate actions and release held gameplay state on transition', () => {
  const router = new input.InputRouter();
  const events = [];
  router.subscribe(event => events.push(event));

  assert.equal(router.press('moveRight', 'keyboard', 'keyboard:KeyD'), true);
  router.setAxis('touch:joystick', 0.75);
  assert.equal(router.moveAxis(), 1);

  router.setContext('menu');
  assert.equal(router.isHeld('moveRight'), false, 'movement cannot stick under a menu');
  assert.equal(router.moveAxis(), 0, 'analog movement is cleared under a menu');
  assert.equal(router.press('skill1', 'keyboard', 'keyboard:Digit1'), false);
  assert.equal(router.tap('menuCancel', 'keyboard', 'keyboard:Escape'), true);
  assert.ok(events.some(event => event.action === 'moveRight' && event.phase === 'released'));

  router.setContext('chat');
  assert.equal(router.tap('chatSubmit', 'keyboard', 'keyboard:Enter'), true);
  assert.equal(router.tap('skill2', 'keyboard', 'keyboard:Digit2'), false);
  assert.equal(router.tap('chatCancel', 'keyboard', 'keyboard:Escape'), true);
});

test('discrete repeats are suppressed while deliberate menu navigation repeats', () => {
  const router = new input.InputRouter();
  const presses = [];
  router.subscribe(event => {
    if (event.phase === 'pressed') presses.push(event);
  });

  assert.equal(router.press('skill1', 'keyboard', 'keyboard:Digit1'), true);
  assert.equal(router.press('skill1', 'keyboard', 'keyboard:Digit1', true), false);
  assert.equal(presses.filter(event => event.action === 'skill1').length, 1);

  router.setContext('menu');
  assert.equal(router.press('menuDown', 'keyboard', 'keyboard:ArrowDown'), true);
  assert.equal(router.press('menuDown', 'keyboard', 'keyboard:ArrowDown', true), true);
  assert.equal(presses.filter(event => event.action === 'menuDown').length, 2);
});

test('the same physical exits cannot trap menu or chat contexts', () => {
  const store = new input.InputBindingStore(null);
  assert.deepEqual(store.actionsForKeyboard('Escape', 'gameplay'), ['menuToggle']);
  assert.deepEqual(store.actionsForKeyboard('Escape', 'menu'), ['menuCancel']);
  assert.deepEqual(store.actionsForKeyboard('Escape', 'chat'), ['chatCancel']);
  assert.deepEqual(store.actionsForKeyboard('KeyY', 'gameplay'), ['chatToggle']);
  assert.deepEqual(store.actionsForKeyboard('KeyY', 'menu'), ['chatToggle']);
  assert.deepEqual(store.actionsForKeyboard('KeyY', 'chat'), ['chatToggle']);
});

test('remaps report conflicts, allow explicit replacement, and ignore disjoint contexts', () => {
  const store = new input.InputBindingStore(null);
  const rejected = store.remap('keyboard', 'skill1', 'KeyQ');
  assert.deepEqual(rejected, { ok: false, conflictWith: 'quickHeal' });
  assert.deepEqual(store.actionsForKeyboard('KeyQ', 'gameplay'), ['quickHeal']);

  const replaced = store.remap('keyboard', 'skill1', 'KeyQ', 'replace');
  assert.deepEqual(replaced, { ok: true, conflictWith: 'quickHeal' });
  assert.deepEqual(store.actionsForKeyboard('KeyQ', 'gameplay'), ['skill1']);
  assert.deepEqual(store.actionsForKeyboard('Digit1', 'gameplay'), ['quickHeal'], 'replacement swaps to a safe prior binding');

  const crossContext = store.remap('keyboard', 'menuCancel', 'KeyQ');
  assert.deepEqual(crossContext, { ok: true, conflictWith: null });
  assert.deepEqual(store.actionsForKeyboard('KeyQ', 'menu'), ['menuCancel']);
  assert.deepEqual(store.actionsForKeyboard('KeyQ', 'gameplay'), ['skill1']);
});

test('keyboard and gamepad remaps persist, while invalid storage falls back safely', () => {
  const storage = memoryStorage();
  const first = new input.InputBindingStore(storage);
  assert.equal(first.remap('keyboard', 'dash', 'KeyV').ok, true);
  assert.equal(first.remap('gamepad', 'dash', 8).ok, true);

  const reloaded = new input.InputBindingStore(storage);
  assert.deepEqual(reloaded.bindingsFor('keyboard', 'dash'), ['KeyV']);
  assert.deepEqual(reloaded.bindingsFor('gamepad', 'dash'), [8]);

  storage.setItem(input.INPUT_BINDINGS_STORAGE_KEY, '{broken json');
  const recovered = new input.InputBindingStore(storage);
  assert.ok(recovered.bindingsFor('keyboard', 'jump').includes('Space'));

  storage.setItem(input.INPUT_BINDINGS_STORAGE_KEY, JSON.stringify({
    version: 1,
    bindings: { keyboard: { menuToggle: [], menuCancel: [], chatCancel: [] } },
  }));
  const cannotTrap = new input.InputBindingStore(storage);
  assert.deepEqual(cannotTrap.actionsForKeyboard('Escape', 'gameplay'), ['menuToggle']);
  assert.deepEqual(cannotTrap.actionsForKeyboard('Escape', 'menu'), ['menuCancel']);
  assert.deepEqual(cannotTrap.actionsForKeyboard('Escape', 'chat'), ['chatCancel']);

  const throwing = {
    getItem() { throw new Error('storage denied'); },
    setItem() { throw new Error('storage denied'); },
  };
  assert.doesNotThrow(() => new input.InputBindingStore(throwing).remap('keyboard', 'dash', 'KeyV'));
});

test('gamepad polling applies deadzone and emits button transitions once', () => {
  const router = new input.InputRouter();
  const store = new input.InputBindingStore(null);
  const gamepad = new input.GamepadInput(router, store, 0.2);
  const presses = [];
  router.subscribe(event => {
    if (event.phase === 'pressed') presses.push(event.action);
  });

  gamepad.update([pad(0, [0.1], [2])]);
  assert.equal(router.moveAxis(), 0);
  assert.deepEqual(presses, ['basicAttack']);

  gamepad.update([pad(0, [0.6], [2])]);
  assert.ok(Math.abs(router.moveAxis() - 0.5) < 1e-9);
  assert.deepEqual(presses, ['basicAttack'], 'held button does not fire each poll');

  gamepad.update([pad(0, [-0.6], [])]);
  assert.ok(Math.abs(router.moveAxis() + 0.5) < 1e-9);
  assert.equal(router.isHeld('basicAttack'), false);
});

test('disconnect, active-pad changes, and a shrinking button array clear held state', () => {
  const router = new input.InputRouter();
  const store = new input.InputBindingStore(null);
  const gamepad = new input.GamepadInput(router, store);

  gamepad.update([pad(0, [0.7], [15])]);
  assert.equal(router.isHeld('moveRight'), true);
  gamepad.disconnect(1);
  assert.equal(router.isHeld('moveRight'), true, 'unrelated disconnect must not drop the active pad');

  gamepad.update([{ index: 0, connected: true, axes: [0], buttons: [], id: 'short report' }]);
  assert.equal(router.isHeld('moveRight'), false, 'shorter browser snapshot releases a high button');

  gamepad.update([pad(0, [0.8], [2])]);
  assert.equal(router.isHeld('basicAttack'), true);
  gamepad.update([]);
  assert.equal(router.isHeld('basicAttack'), false);
  assert.equal(router.moveAxis(), 0);
  assert.equal(gamepad.connectedIndex, null);

  gamepad.update([null, pad(1, [0], [0])]);
  assert.equal(gamepad.connectedIndex, 1);
  assert.equal(router.isHeld('jump'), true);
});

test('pointer gate drops compatibility clicks but keeps keyboard activation', () => {
  const gate = new input.PointerGestureGate(700);
  assert.equal(gate.pointerDown('skill1', 5, 1_000), true);
  assert.equal(gate.pointerDown('skill1', 5, 1_010), false, 'duplicate pointerdown is ignored');
  assert.equal(gate.click('skill1', 1, 1_100), false, 'synthetic mouse click is ignored');
  assert.equal(gate.click('skill1', 0, 1_100), true, 'keyboard-generated click stays accessible');
  assert.equal(gate.click('skill1', 1, 1_800), true, 'a later independent click is accepted');
});

test('focus routing enters chat and returns to the resolved menu context', () => {
  const controller = new input.InputController({ storage: null, context: () => 'menu' });
  assert.equal(controller.refreshContext({ tagName: 'INPUT', type: 'text', isContentEditable: false }), 'chat');
  assert.equal(controller.router.getContext(), 'chat');
  assert.equal(controller.refreshContext({ tagName: 'INPUT', type: 'checkbox', isContentEditable: false }), 'menu',
    'checkbox/range settings are controls, not chat fields');
  assert.equal(controller.refreshContext({ tagName: 'DIV', isContentEditable: false }), 'menu');
  assert.equal(controller.router.getContext(), 'menu');

  const source = readFileSync('src/sideview/input/InputController.ts', 'utf8');
  assert.match(source, /queueMicrotask\(\(\) => this\.refreshContext\(\)\)/,
    'focus listener must inspect the newly active element, not relatedTarget');
});

test('accessibility preferences persist independently', () => {
  const storage = memoryStorage();
  const first = new input.InputPreferenceStore(storage, false);
  first.update({
    reducedMotion: true,
    vibration: false,
    largeTouchTargets: true,
    screenShake: false,
    screenFlashes: false,
    gamepadDeadzone: 0.35,
    touchControls: 'always',
  });
  assert.deepEqual(new input.InputPreferenceStore(storage, false).snapshot(), {
    reducedMotion: true,
    vibration: false,
    largeTouchTargets: true,
    screenShake: false,
    screenFlashes: false,
    gamepadDeadzone: 0.35,
    touchControls: 'always',
  });
});

test('remap capture intercepts keyboard/gamepad input and suppresses the captured hold', () => {
  const controller = new input.InputController({ storage: null, context: () => 'gameplay' });
  let keyboardResult = null;
  controller.beginRemap('keyboard', 'dash', result => { keyboardResult = result; });
  let prevented = 0;
  controller.onKeyDown({
    code: 'KeyV', repeat: false, target: { tagName: 'DIV', isContentEditable: false },
    preventDefault() { prevented++; }, stopImmediatePropagation() {},
  });
  assert.equal(prevented, 1);
  assert.equal(keyboardResult.result.ok, true);
  assert.deepEqual(controller.bindings.bindingsFor('keyboard', 'dash'), ['KeyV']);
  assert.equal(controller.router.isHeld('dash'), false, 'captured key never reaches gameplay');

  let gamepadResult = null;
  controller.beginRemap('gamepad', 'dash', result => { gamepadResult = result; });
  controller.pollGamepads([pad(0, [0], [8])]);
  assert.equal(gamepadResult.result.ok, true);
  assert.deepEqual(controller.bindings.bindingsFor('gamepad', 'dash'), [8]);
  controller.pollGamepads([pad(0, [0], [8])]);
  assert.equal(controller.router.isHeld('dash'), false, 'captured button stays suppressed until released');
  controller.pollGamepads([pad(0, [0], [])]);
  controller.pollGamepads([pad(0, [0], [8])]);
  assert.equal(controller.router.isHeld('dash'), true, 'a fresh press uses the new binding');
});

test('controls panel contract exposes bindings, conflicts and sensory preferences', () => {
  const panel = readFileSync('src/sideview/input/InputSettingsPanel.ts', 'utf8');
  const game = readFileSync('src/sideview/SideViewGame.ts', 'utf8');
  const hud = readFileSync('src/sideview/ui/GameHUD.ts', 'utf8');

  assert.match(panel, /role=\"tab\" data-device=\"keyboard\"/);
  assert.match(panel, /role=\"tab\" data-device=\"gamepad\"/);
  assert.match(panel, /beginRemap\(this\.device, action/);
  assert.match(panel, /input-conflict-replace/);
  assert.match(panel, /resetBindings\(this\.device\)/);
  for (const preference of ['reducedMotion', 'screenShake', 'screenFlashes', 'vibration', 'largeTouchTargets', 'touchControls', 'gamepadDeadzone']) {
    assert.match(panel, new RegExp(preference), preference);
  }
  assert.match(panel, /aria-live=\"polite\"/);
  assert.match(hud, /id=\"toggle-controls-btn\"/);
  assert.match(hud, /controlsPanel\?\.isOpen/);
  assert.match(hud, /input-touch-always/);
  assert.match(hud, /input-touch-never/);
  assert.match(game, /!preferences\.screenShake/);
  assert.match(game, /!preferences\.screenFlashes/);
});

test('game loop reuses one callback and HUD actions use the shared layer', () => {
  const game = readFileSync('src/sideview/SideViewGame.ts', 'utf8');
  const hud = readFileSync('src/sideview/ui/GameHUD.ts', 'utf8');

  assert.match(game, /readonly boundGameLoop = \(timestamp: number\) => this\.gameLoop\(timestamp\)/);
  assert.doesNotMatch(game, /requestAnimationFrame\(this\.gameLoop\.bind\(this\)\)/);
  assert.equal((game.match(/requestAnimationFrame\(this\.boundGameLoop\)/g) || []).length, 2);
  assert.match(hud, /bindInputAction\(potionSlot, 'quickHeal'/);
  assert.match(hud, /bindInputAction\(slot as HTMLElement, action/);
  assert.doesNotMatch(hud, /potionSlot\?\.addEventListener\('pointerdown'/);
});
