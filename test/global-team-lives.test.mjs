import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rolldown } from 'rolldown';

class FakeImage {
  width = 64;
  height = 64;
  naturalWidth = 64;
  naturalHeight = 64;
  complete = true;
  onload = null;
  onerror = null;
  set src(value) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }
  get src() { return this._src || ''; }
}

const storage = new Map();
globalThis.window = globalThis;
globalThis.location = { hostname: 'localhost', origin: 'http://localhost' };
globalThis.Image = FakeImage;
globalThis.localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
  clear: () => storage.clear(),
};

const bundle = await rolldown({
  input: 'test/combat-correctness-fixture.ts',
  platform: 'browser',
});
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find(chunk => chunk.type === 'chunk')?.code;
assert.ok(code, 'combat fixture should bundle');
const game = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
game.audio.soundEnabled = false;

function character(id = 'warrior') {
  const found = game.CHARACTER_CLASSES.find(entry => entry.id === id);
  assert.ok(found, `missing character class ${id}`);
  return found;
}

test('Global team lives: Party starts with 3 lives and resets per dungeon run', () => {
  const engine = new game.SideViewEngine(character('warrior'), true);
  assert.equal(game.SideViewEngine.MAX_TEAM_LIVES, 3, 'Maximum team lives must be 3');
  assert.equal(engine.teamLivesRemaining, 3, 'Initial team lives must be 3');
  assert.equal(engine.teamDeaths, 0, 'Initial team deaths must be 0');

  engine.teamDeaths = 2;
  engine.teamLivesRemaining = 1;
  engine.resetRunStats();

  assert.equal(engine.teamLivesRemaining, 3, 'Team lives must reset to 3 on resetRunStats');
  assert.equal(engine.teamDeaths, 0, 'Team deaths must reset to 0 on resetRunStats');
});

test('Global team lives: 3 deaths across party causes automatic defeat (User Example sequence)', () => {
  const engine = new game.SideViewEngine(character('warrior'), true);
  engine.isTownMode = false;

  let runLostCount = 0;
  engine.onRunLost = () => {
    runLostCount++;
  };

  // Mock partied state
  game.network.room = 'test-room';
  game.network.remotePlayers = {
    'ally-socket-1': {
      socketId: 'ally-socket-1',
      name: 'Ally Knight',
      classId: 'paladin',
      x: 300,
      y: 0,
      hpPct: 100,
      downed: false,
      isTownMode: false,
    }
  };

  const sentPartySupport = [];
  const originalSend = game.network.sendPartySupport;
  game.network.sendPartySupport = (payload) => {
    sentPartySupport.push(payload);
  };

  try {
    // 1st DEATH (Local Player): -1 Life -> 2 Lives Remaining
    engine.player.hp = 0;
    // update(0.016) resolves defeat
    engine.update(1 / 60);

    assert.equal(engine.teamDeaths, 1, '1st death recorded');
    assert.equal(engine.teamLivesRemaining, 2, '2 lives remaining after 1st death');
    assert.equal(engine.player.downed, true, 'Player should be downed, not dead');
    assert.equal(engine.runOver, false, 'Run should not be over yet');
    assert.equal(runLostCount, 0, 'onRunLost should not be called on 1st death');
    assert.equal(sentPartySupport.at(-1)?.kind, 'downed');
    assert.equal(sentPartySupport.at(-1)?.count, 2);

    // Teammate revives local player
    engine.acceptRevive('Ally Knight');
    assert.equal(engine.player.downed, false, 'Player is back on feet');
    assert.equal(engine.teamLivesRemaining, 2, 'Team lives remain 2');

    // 2nd DEATH (Teammate dies): Simulated via network payload
    // Teammate drops to 0 HP and broadcasts downed with count 1
    engine.teamDeaths++;
    engine.teamLivesRemaining = Math.max(0, game.SideViewEngine.MAX_TEAM_LIVES - engine.teamDeaths);

    assert.equal(engine.teamDeaths, 2, '2nd death recorded');
    assert.equal(engine.teamLivesRemaining, 1, '1 life remaining after 2nd death');
    assert.equal(engine.runOver, false, 'Run should not be over yet');
    assert.equal(runLostCount, 0, 'onRunLost should not be called on 2nd death');

    // 3rd DEATH (Local Player drops to 0 HP again): -1 Life -> 0 Remaining -> OUT NA!
    engine.player.hp = 0;
    engine.update(1 / 60);

    assert.equal(engine.teamDeaths, 3, '3rd death recorded');
    assert.equal(engine.teamLivesRemaining, 0, '0 lives remaining');
    assert.equal(engine.player.downed, false, 'Player should not be downed on 3rd death');
    assert.equal(engine.runOver, true, 'Run MUST be over on 3rd death (automatic defeat)');
    assert.equal(runLostCount, 1, 'onRunLost MUST be called on 3rd death');
    assert.equal(sentPartySupport.at(-1)?.kind, 'team_defeat');
    assert.equal(sentPartySupport.at(-1)?.count, 0);

  } finally {
    game.network.sendPartySupport = originalSend;
    game.network.room = null;
    game.network.remotePlayers = {};
  }
});

test('Bleed out in co-op triggers team_defeat packet and ends the run', () => {
  const engine = new game.SideViewEngine(character('warrior'), true);
  engine.isTownMode = false;

  let runLostCalled = false;
  engine.onRunLost = () => {
    runLostCalled = true;
  };

  game.network.room = 'test-room';
  game.network.remotePlayers = {
    'ally-socket-1': {
      socketId: 'ally-socket-1',
      name: 'Ally',
      classId: 'paladin',
      x: 300,
      y: 0,
      hpPct: 100,
      downed: false,
      isTownMode: false,
    }
  };

  const sentPartySupport = [];
  const originalSend = game.network.sendPartySupport;
  game.network.sendPartySupport = (payload) => {
    sentPartySupport.push(payload);
  };

  try {
    engine.player.hp = 0;
    engine.update(1 / 60);
    assert.equal(engine.player.downed, true);

    // Simulate bleed out countdown expiry
    engine.player.downTimer = 0.01;
    engine.update(0.05);

    assert.equal(engine.player.downed, false);
    assert.equal(engine.runOver, true);
    assert.equal(runLostCalled, true);
    assert.equal(sentPartySupport.at(-1)?.kind, 'team_defeat');
  } finally {
    game.network.sendPartySupport = originalSend;
    game.network.room = null;
    game.network.remotePlayers = {};
  }
});
