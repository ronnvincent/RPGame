import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/sideview/ui/Fullscreen.ts', platform: 'browser' });
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find(chunk => chunk.type === 'chunk')?.code;
assert.ok(code, 'fullscreen/orientation controller should bundle');
const orientationUi = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

class FakeElement extends EventTarget {
  constructor(id = '') {
    super();
    this.id = id;
    this.hidden = false;
    this.dataset = {};
    this.attributes = new Map();
    this.textContent = '';
    this.isConnected = true;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  focus() { globalThis.document.activeElement = this; }
  contains(node) { return node === this; }
}

class FakeDocument extends EventTarget {
  constructor(elements) {
    super();
    this.elements = elements;
    this.documentElement = elements.root;
    this.activeElement = null;
    this.fullscreenElement = null;
    this.webkitFullscreenElement = null;
    this.visibilityState = 'visible';
  }
  getElementById(id) { return this.elements[id] ?? null; }
}

function replaceGlobal(name, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  return () => {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else delete globalThis[name];
  };
}

function makeEnvironment({ portrait = true, ios = false, fullscreen = true, orientationLock = true } = {}) {
  const state = { portrait };
  const calls = { fullscreen: 0, lock: 0, unlock: 0 };
  const root = new FakeElement('root');
  const gate = new FakeElement('orientation-rotate-shield');
  const action = new FakeElement('orientation-enable-btn');
  const status = new FakeElement('orientation-lock-status');
  const game = new FakeElement('rpg');
  const document = new FakeDocument({
    root,
    'orientation-rotate-shield': gate,
    'orientation-enable-btn': action,
    'orientation-lock-status': status,
    rpg: game,
  });
  const orientation = new EventTarget();
  if (orientationLock) {
    orientation.lock = async requested => {
      calls.lock++;
      assert.equal(requested, 'landscape');
    };
    orientation.unlock = () => { calls.unlock++; };
  }
  if (fullscreen) {
    root.requestFullscreen = async () => {
      calls.fullscreen++;
      document.fullscreenElement = root;
    };
  }

  const portraitQuery = new EventTarget();
  Object.defineProperty(portraitQuery, 'matches', { get: () => state.portrait });
  const coarseQuery = new EventTarget();
  Object.defineProperty(coarseQuery, 'matches', { get: () => true });
  const window = new EventTarget();
  window.innerWidth = state.portrait ? 430 : 900;
  window.innerHeight = state.portrait ? 900 : 430;
  window.matchMedia = query => query.includes('orientation') ? portraitQuery : coarseQuery;

  const restore = [
    replaceGlobal('HTMLElement', FakeElement),
    replaceGlobal('window', window),
    replaceGlobal('document', document),
    replaceGlobal('screen', { orientation }),
    replaceGlobal('navigator', {
      userAgent: ios ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)' : 'Mozilla/5.0 (Linux; Android 15; Mobile)',
      platform: ios ? 'iPhone' : 'Linux armv8l',
      maxTouchPoints: 5,
    }),
  ];

  return {
    state,
    calls,
    root,
    gate,
    action,
    status,
    game,
    document,
    window,
    restore: () => restore.reverse().forEach(fn => fn()),
  };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('initial mobile portrait fully blocks and hides the game before activation', async t => {
  const env = makeEnvironment();
  const controller = orientationUi.installLandscapeMode();
  t.after(() => { controller.destroy(); env.restore(); });

  assert.equal(controller.isBlocked(), true);
  assert.equal(env.root.dataset.landscapeBlocked, 'true');
  assert.equal(env.gate.hidden, false);
  assert.equal(env.gate.getAttribute('aria-hidden'), 'false');
  assert.equal(env.game.getAttribute('inert'), '');
  assert.equal(env.game.getAttribute('aria-hidden'), 'true');
  assert.equal(env.document.activeElement, env.action);
  assert.deepEqual(env.calls, { fullscreen: 0, lock: 0, unlock: 0 }, 'no immersive API runs on load');
});

test('physical rotation to landscape releases inert state and announces readiness', async t => {
  const env = makeEnvironment();
  let readyEvents = 0;
  env.window.addEventListener(orientationUi.LANDSCAPE_READY_EVENT, () => { readyEvents++; });
  const controller = orientationUi.installLandscapeMode();
  t.after(() => { controller.destroy(); env.restore(); });

  env.state.portrait = false;
  assert.equal(controller.refresh(), false);
  assert.equal(controller.isBlocked(), false);
  assert.equal(env.gate.hidden, true);
  assert.equal(env.game.getAttribute('inert'), null);
  assert.equal(env.game.getAttribute('aria-hidden'), null);
  assert.equal(readyEvents, 1);
});

test('fullscreen and landscape lock wait for an explicit gate action, then retry on state changes', async t => {
  const env = makeEnvironment();
  const controller = orientationUi.installLandscapeMode();
  t.after(() => { controller.destroy(); env.restore(); });

  assert.equal(env.calls.fullscreen, 0);
  assert.equal(env.calls.lock, 0);
  env.action.dispatchEvent(new Event('click', { cancelable: true }));
  await settle();
  await settle();
  assert.equal(env.calls.fullscreen, 1);
  assert.equal(env.calls.lock, 1);

  env.document.dispatchEvent(new Event('visibilitychange'));
  env.document.dispatchEvent(new Event('fullscreenchange'));
  env.window.dispatchEvent(new Event('orientationchange'));
  await settle();
  assert.ok(env.calls.lock >= 4, 'visible/fullscreen/orientation changes retry the lock after activation');
});

test('iOS or unsupported APIs keep the honest manual-rotation fallback', async t => {
  const env = makeEnvironment({ ios: true, fullscreen: false, orientationLock: false });
  const controller = orientationUi.installLandscapeMode();
  t.after(() => { controller.destroy(); env.restore(); });

  env.action.dispatchEvent(new Event('click', { cancelable: true }));
  await settle();
  await settle();
  assert.equal(controller.isBlocked(), true);
  assert.equal(env.calls.fullscreen, 0);
  assert.equal(env.calls.lock, 0);
  assert.match(env.status.textContent, /unavailable in this browser/i);

  env.state.portrait = false;
  controller.refresh();
  assert.equal(controller.isBlocked(), false, 'manual rotation still releases the game');
});

test('startup, HTML gate and PWA manifest enforce the landscape contract', () => {
  const standalone = readFileSync('src/standalone.ts', 'utf8');
  const html = readFileSync('index.html', 'utf8');
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));

  assert.match(standalone, /installLandscapeMode\(\)/);
  assert.match(standalone, /landscapeMode\.isBlocked\(\)/);
  assert.match(standalone, /LANDSCAPE_READY_EVENT/);
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(html, /id="orientation-enable-btn"/);
  assert.match(html, /data-landscape-blocked/);
  assert.equal(manifest.display, 'fullscreen');
  assert.equal(manifest.orientation, 'landscape');
  assert.match(html, /rel="manifest"/);
  assert.match(html, /apple-mobile-web-app-capable/);

  for (const size of [192, 512]) {
    const file = `public/icon-${size}.png`;
    assert.ok(existsSync(file), `${file} exists`);
    const bytes = readFileSync(file);
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
    assert.ok(manifest.icons.some(icon => icon.sizes === `${size}x${size}`));
  }
  assert.ok(manifest.icons.some(icon => /maskable/.test(icon.purpose || '')));
});
