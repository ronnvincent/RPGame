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

test('Zone hazard anchors never overlap the boss arena anchor (2860)', () => {
  const zoneContentSrc = readFileSync('src/sideview/maps/ZoneContent.ts', 'utf8');
  const hazardMatch = zoneContentSrc.match(/anchors:\s*\[([0-9,\s]+)\]/);
  assert.ok(hazardMatch, 'Must find hazard anchors in ZoneContent.ts');
  const anchors = hazardMatch[1].split(',').map(s => parseInt(s.trim(), 10));
  for (const anchor of anchors) {
    const distToBoss = Math.abs(anchor - 2860);
    assert.ok(distToBoss > 150, `Hazard anchor ${anchor} must not overlap boss spawn 2860 (distance was ${distToBoss})`);
  }
});

test('Map 3 boss (Ancient Red Dragon Ignis) defeat clears Burn DoT and prevents post-victory defeat', () => {
  const engine = new game.SideViewEngine(character('warrior'), true);
  engine.setBattleTheme('inferno');
  engine.player.x = 2860;
  engine.player.hp = 10; // Low HP

  let runLostCalled = false;
  engine.onRunLost = () => {
    runLostCalled = true;
  };

  // Boss Ancient Red Dragon Ignis
  const boss = {
    id: 'boss_ignis',
    name: 'Ancient Red Dragon Ignis',
    type: 'boss',
    icon: '👑',
    color: '#b71c1c',
    x: 2860,
    y: engine.groundY,
    width: 92,
    height: 90,
    hp: 100,
    maxHp: 4200,
    atk: 88,
    def: 45,
    speed: 3.6,
    facing: -1,
    isDead: false,
    goldReward: 1950,
    expReward: 2800,
  };
  engine.enemies = [boss];

  // Inflict severe burn on player (like Ignis's Infernal Breath)
  engine.playerNegativeStatuses.push({
    kind: 'burn',
    sourceId: 'boss_ignis',
    remaining: 3.0,
    magnitude: 0.1,
    tickInterval: 1.0,
    tickTimer: 0.2, // Will tick in 0.2s!
    rawTickDamage: 50, // Lethal to player's 10 HP
  });

  assert.equal(engine.playerNegativeStatuses.length, 1);
  assert.equal(engine.isVictoryOrWaveCleared, false);

  // Deliver lethal blow to boss
  engine.applyDamageToEnemy(boss, 500, true, 1);

  assert.ok(boss.isDead, 'Boss should be dead');
  assert.equal(engine.isVictoryOrWaveCleared, true, 'isVictoryOrWaveCleared must be set to true');
  assert.equal(engine.playerNegativeStatuses.length, 0, 'playerNegativeStatuses must be cleared');
  assert.ok(engine.player.iframeTimer >= 4.0, 'Player should have safety iframes');

  // Simulate multiple engine update frames (over 2 seconds)
  for (let frame = 0; frame < 120; frame++) {
    engine.update(1 / 60);
  }

  assert.equal(runLostCalled, false, 'onRunLost must NEVER be called after boss defeat');
  assert.ok(engine.player.hp > 0, 'Player must remain alive');
});

test('Wave clear safety prevents defeat when last living mob dies with lingering DoT', () => {
  const engine = new game.SideViewEngine(character('mage'), true);
  engine.setBattleTheme('crypt');
  engine.player.hp = 5;

  let runLostCalled = false;
  engine.onRunLost = () => {
    runLostCalled = true;
  };

  const mob = {
    id: 'mob_last',
    name: 'Skeleton Archer',
    type: 'mob',
    icon: '🏹',
    color: '#b0bec5',
    x: 1200,
    y: engine.groundY,
    width: 38,
    height: 50,
    hp: 50,
    maxHp: 150,
    atk: 26,
    def: 8,
    speed: 2.3,
    facing: -1,
    isDead: false,
    goldReward: 52,
    expReward: 91,
  };
  engine.enemies = [mob];

  // Inflict poison
  engine.playerNegativeStatuses.push({
    kind: 'poison',
    sourceId: 'mob_last',
    remaining: 4.0,
    magnitude: 0.1,
    tickInterval: 1.0,
    tickTimer: 0.1,
    rawTickDamage: 30,
  });

  // Kill the last mob in the wave
  engine.applyDamageToEnemy(mob, 200, false, 1);

  assert.ok(mob.isDead, 'Mob should be dead');
  assert.equal(engine.isVictoryOrWaveCleared, true, 'isVictoryOrWaveCleared must be true when last mob dies');
  assert.equal(engine.playerNegativeStatuses.length, 0, 'Negative statuses must be wiped');

  // Tick for 2 seconds
  for (let frame = 0; frame < 120; frame++) {
    engine.update(1 / 60);
  }

  assert.equal(runLostCalled, false, 'onRunLost must not be called');
  assert.ok(engine.player.hp > 0, 'Player must be alive');
});

test('Zone hazards do not damage the player when isVictoryOrWaveCleared is true', () => {
  const engine = new game.SideViewEngine(character('paladin'), true);
  engine.setBattleTheme('inferno');
  const initialHp = engine.player.hp;

  engine.isVictoryOrWaveCleared = true;

  // Position player directly on a hazard anchor
  engine.player.x = 1080;
  engine.player.y = engine.groundY;

  // Advance time past active hazard phase
  for (let frame = 0; frame < 300; frame++) {
    engine.update(1 / 60);
  }

  assert.equal(engine.player.hp, initialHp, 'Player HP must not decrease from hazards during victory');
});
