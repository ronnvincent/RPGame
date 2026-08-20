import assert from 'node:assert/strict';
import test from 'node:test';
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
  input: 'test/player-damage-gameplay-fixture.ts',
  platform: 'browser',
});
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find(chunk => chunk.type === 'chunk')?.code;
assert.ok(code, 'player damage fixture should bundle');
const game = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
game.audio.soundEnabled = false;

function character(id = 'warrior') {
  const found = game.CHARACTER_CLASSES.find(entry => entry.id === id);
  assert.ok(found);
  return found;
}

function enemyAt(x, y, overrides = {}) {
  return {
    id: `hostile-${x}-${y}-${Math.random().toString(36).slice(2)}`,
    name: 'Network Training Ogre',
    type: 'normal',
    icon: '',
    color: '#fff',
    x,
    y,
    vx: 0,
    vy: 0,
    facing: 1,
    width: 40,
    height: 40,
    hp: 1000,
    maxHp: 1000,
    atk: 80,
    def: 0,
    speed: 3,
    expReward: 0,
    goldReward: 0,
    isDead: false,
    hitStun: 0,
    attackRange: 60,
    attackCooldown: 1,
    attackTimer: 0,
    isGrounded: true,
    ...overrides,
  };
}

function packet(hitId, overrides = {}) {
  return {
    hitId,
    rawDamage: 100,
    sourceX: 0,
    knockbackDir: 1,
    isTownMode: false,
    sceneId: 'goblin_catacombs',
    ...overrides,
  };
}

function enterGuestScene(engine) {
  game.network.isHost = false;
  game.network.room = 'player-damage-fixture';
  game.network.remotePlayers = {
    host: {
      name: 'Host', x: 0, y: 0, facing: 1,
      isGrounded: true, isAttacking: false, animState: 'idle',
      isTownMode: false, sceneId: 'goblin_catacombs', hpPct: 100,
    },
  };
  engine.isTownMode = false;
  engine.currentDungeonId = 'goblin_catacombs';
}

function resetNetwork() {
  game.network.isHost = true;
  game.network.room = null;
  game.network.remotePlayers = {};
}

test('guest resolves defence, shields and i-frames, and deduplicates hit ids', () => {
  const engine = new game.SideViewEngine(character());
  enterGuestScene(engine);
  try {
    engine.player.totalDef = 90;
    const hpBefore = engine.player.hp;
    const dealt = engine.applyNetworkPlayerDamage(packet('pd_defence_1', { rawDamage: 100 }));
    assert.ok(dealt > 0 && dealt < 100, 'recipient defence mitigates raw host damage');
    assert.equal(engine.player.hp, hpBefore - dealt);

    const afterFirst = engine.player.hp;
    assert.equal(engine.applyNetworkPlayerDamage(packet('pd_defence_1', { rawDamage: 999 })), 0);
    assert.equal(engine.player.hp, afterFirst, 'duplicate hit id cannot damage twice');

    engine.player.iframeTimer = 1;
    assert.equal(engine.applyNetworkPlayerDamage(packet('pd_iframe_1')), 0);
    assert.equal(engine.player.hp, afterFirst, 'recipient i-frame rejects a new hit');

    engine.player.iframeTimer = 0;
    engine.player.totalDef = 0;
    engine.player.activeBuffs.push({ stat: 'shield', multiplier: 1, timer: 5, amount: 500 });
    assert.equal(engine.applyNetworkPlayerDamage(packet('pd_shield_1', { rawDamage: 120 })), 0);
    assert.equal(engine.player.hp, afterFirst, 'recipient shield absorbs before HP');
  } finally {
    resetNetwork();
  }
});

test('guest enters the real downed flow once, while town and cross-scene hits are ignored', () => {
  const engine = new game.SideViewEngine(character());
  enterGuestScene(engine);
  try {
    const initialHp = engine.player.hp;
    assert.equal(engine.applyNetworkPlayerDamage(packet('pd_wrong_scene', { sceneId: 'undead_crypt' })), 0);
    assert.equal(engine.applyNetworkPlayerDamage(packet('pd_town_packet', { isTownMode: true, sceneId: 'town' })), 0);
    assert.equal(engine.player.hp, initialHp);

    engine.player.totalDef = 0;
    engine.player.iframeTimer = 0;
    engine.applyNetworkPlayerDamage(packet('pd_lethal_1', { rawDamage: 250_000 }));
    assert.equal(engine.player.hp, 0);
    assert.equal(engine.player.downed, true);
    assert.equal(engine.runOver, false, 'a same-scene party member keeps the revive window open');

    assert.equal(engine.applyNetworkPlayerDamage(packet('pd_after_down')), 0);
    assert.equal(engine.player.revivesUsed, 1);
  } finally {
    resetNetwork();
  }
});

test('host melee selects the nearest eligible same-scene remote target', () => {
  const engine = new game.SideViewEngine(character());
  engine.isTownMode = false;
  engine.currentDungeonId = 'goblin_catacombs';
  engine.player.x = 900;
  game.network.isHost = true;
  game.network.room = 'host-target-fixture';
  game.network.remotePlayers = {
    guest: {
      name: 'Guest', x: 120, y: 0, targetX: 120, targetY: 0, facing: 1,
      isGrounded: true, isAttacking: false, animState: 'idle',
      isTownMode: false, sceneId: 'goblin_catacombs', hpPct: 100,
    },
    staleTownGuest: {
      name: 'Town Guest', x: 101, y: 0, targetX: 101, targetY: 0, facing: 1,
      isGrounded: true, isAttacking: false, animState: 'idle',
      isTownMode: true, sceneId: 'town', hpPct: 100,
    },
  };
  const sent = [];
  const originalSend = game.network.sendPlayerDamage;
  game.network.sendPlayerDamage = (targetSocketId, payload) => sent.push({ targetSocketId, payload });
  try {
    const enemy = enemyAt(100, engine.groundY);
    engine.enemies = [enemy];
    // First frame authors the readable intent; damage resolves only after its
    // telegraph reaches the active phase.
    engine.updateEnemies(1 / 60);
    engine.updateEnemies(0.43);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].targetSocketId, 'guest');
    assert.equal(sent[0].payload.sceneId, 'goblin_catacombs');
  } finally {
    game.network.sendPlayerDamage = originalSend;
    resetNetwork();
  }
});

test('cross-scene remotes are not aggro targets and host local damage still works', () => {
  const engine = new game.SideViewEngine(character());
  engine.isTownMode = false;
  engine.currentDungeonId = 'goblin_catacombs';
  engine.player.x = 140;
  engine.player.totalDef = 0;
  game.network.isHost = true;
  game.network.room = 'host-local-fixture';
  game.network.remotePlayers = {
    wrongScene: {
      name: 'Wrong Scene', x: 101, y: 0, targetX: 101, targetY: 0, facing: 1,
      isGrounded: true, isAttacking: false, animState: 'idle',
      isTownMode: false, sceneId: 'undead_crypt', hpPct: 100,
    },
  };
  const sent = [];
  const originalSend = game.network.sendPlayerDamage;
  game.network.sendPlayerDamage = (...args) => sent.push(args);
  try {
    const enemy = enemyAt(100, engine.groundY);
    engine.enemies = [enemy];
    const before = engine.player.hp;
    engine.updateEnemies(1 / 60);
    engine.updateEnemies(0.43);
    assert.equal(sent.length, 0);
    assert.ok(engine.player.hp < before, 'the host player retains the local damage path');
  } finally {
    game.network.sendPlayerDamage = originalSend;
    resetNetwork();
  }
});

test('boss area skills resolve every affected local and remote target and apply real statuses', () => {
  const engine = new game.SideViewEngine(character());
  engine.isTownMode = false;
  engine.currentDungeonId = 'goblin_catacombs';
  engine.player.x = 150;
  engine.player.totalDef = 0;
  game.network.isHost = true;
  game.network.room = 'boss-target-fixture';
  game.network.remotePlayers = {
    guest: {
      name: 'Guest', x: 170, y: 0, targetX: 170, targetY: 0, facing: 1,
      isGrounded: true, isAttacking: false, animState: 'idle',
      isTownMode: false, sceneId: 'goblin_catacombs', hpPct: 100,
    },
  };
  const sent = [];
  const originalSend = game.network.sendPlayerDamage;
  game.network.sendPlayerDamage = (targetSocketId, payload) => sent.push({ targetSocketId, payload });
  engine.scheduleCombatTask = task => task();
  try {
    const boss = enemyAt(100, engine.groundY, { id: 'broodmother', name: 'Broodmother Queen', type: 'boss' });
    const before = engine.player.hp;
    engine.castBossSkill(boss, {
      name: 'Web Snare', vfx: 'aura_green', damage: 1.6,
      cooldown: 7, kind: 'nova', telegraph: 0.7, colour: '#65a30d',
    });
    assert.ok(engine.player.hp < before, 'local host was inside the nova');
    assert.equal(sent.length, 1, 'affected remote was independently targeted');
    assert.equal(sent[0].targetSocketId, 'guest');
    assert.equal(sent[0].payload.status?.kind, 'slow');
    assert.equal(engine.playerNegativeStatuses.some(status => status.kind === 'slow'), true);
    assert.equal(engine.applyPartyCleanse(1), 1, 'cleanse removes the applied hostile status');
  } finally {
    game.network.sendPlayerDamage = originalSend;
    resetNetwork();
  }
});

test('owned run relics alter real stats and mitigation without compounding recomputes', () => {
  const engine = new game.SideViewEngine(character());
  engine.isTownMode = false;
  engine.player.totalDef = 0;
  const baseAttack = engine.player.totalAtk;
  const baseMaxHp = engine.player.maxHp;
  const relics = [{
    id: 'relic.glass-edge',
    effects: [
      { type: 'multiply_stat', statId: 'attack', multiplierPermille: 1450 },
      { type: 'multiply_stat', statId: 'max-hp', multiplierPermille: 700 },
    ],
  }, {
    id: 'relic.guardian-sigil',
    effects: [{ type: 'flat_stat', statId: 'guard-capacity', amount: 18 }],
  }];

  engine.setRunRelics(relics);
  const relicAttack = engine.player.totalAtk;
  assert.equal(relicAttack, Math.round(baseAttack * 1.45));
  assert.equal(engine.player.maxHp, Math.round(baseMaxHp * 0.7));
  engine.recalculateStats();
  assert.equal(engine.player.totalAtk, relicAttack, 'recompute does not compound relic multipliers');

  engine.player.totalDef = 0;
  const before = engine.player.hp;
  assert.equal(engine.applyEncounterPlayerDamage(100, engine.player.x - 10), 97);
  assert.equal(before - engine.player.hp, 97, 'guard-capacity provides bounded mitigation');

  engine.setRunRelics([]);
  assert.equal(engine.player.totalAtk, baseAttack);
  assert.equal(engine.player.maxHp, baseMaxHp);
});

test('enemy defeat emits one objective event before corpse removal', () => {
  const engine = new game.SideViewEngine(character());
  const defeated = [];
  engine.onEnemyDefeatedEvent = enemyId => defeated.push(enemyId);
  const enemy = enemyAt(100, engine.groundY, { id: 'objective-enemy' });
  engine.onEnemyDefeated(enemy);
  assert.deepEqual(defeated, ['objective-enemy']);
});

test('kill-all sealing waits for every explicit reinforcement source', () => {
  const engine = new game.SideViewEngine(character());
  const summoner = enemyAt(100, engine.groundY, { role: 'summoner' });
  engine.enemies = [summoner];
  assert.equal(engine.hasPendingEnemyReinforcements(), true);

  const elite = enemyAt(120, engine.groundY, { role: 'healer', eliteModifiers: ['summoning'] });
  engine.enemies = [elite];
  assert.equal(engine.hasPendingEnemyReinforcements(), true);

  const miniboss = enemyAt(140, engine.groundY, { featureSpriteId: 'run:miniboss', roleActionCooldown: 0 });
  engine.enemies = [miniboss];
  engine.miniBossTriggered.set(miniboss.id, new Set());
  assert.equal(engine.hasPendingEnemyReinforcements(), true, 'untriggered health-gate summon keeps roster open');
  engine.miniBossTriggered.set(miniboss.id, new Set(['reinforcements']));
  miniboss.roleActionCooldown = 1.2;
  assert.equal(engine.hasPendingEnemyReinforcements(), true, 'telegraphed delayed spawn keeps roster open');
  miniboss.roleActionCooldown = 0;
  assert.equal(engine.hasPendingEnemyReinforcements(), false, 'roster seals after the delayed spawn window');
  miniboss.isDead = true;
  assert.equal(engine.hasPendingEnemyReinforcements(), false);
});
