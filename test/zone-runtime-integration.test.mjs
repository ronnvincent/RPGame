import test from 'node:test';
import assert from 'node:assert/strict';
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
  input: 'test/zone-runtime-fixture.ts',
  platform: 'browser',
});
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find(chunk => chunk.type === 'chunk')?.code;
assert.ok(code, 'zone runtime fixture should bundle');
const game = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
game.audio.soundEnabled = false;
game.network.room = null;
game.network.remotePlayers = {};

function character(id = 'warrior') {
  const found = game.CHARACTER_CLASSES.find(entry => entry.id === id);
  assert.ok(found, `missing character class ${id}`);
  return found;
}

function silenceWorld(engine) {
  engine.updateEnemies = () => {};
  engine.updateLoot = () => {};
  engine.checkProjectileCollisions = () => {};
  engine.checkSpecialSkillEntities = () => {};
  engine.tickPartyChatter = () => {};
}

function advance(engine, seconds, step = 1 / 60) {
  let remaining = seconds;
  while (remaining > 0.000001) {
    const dt = Math.min(step, remaining);
    engine.update(dt);
    remaining -= dt;
  }
}

function combatEngine(theme = 'catacombs', classId = 'warrior') {
  const engine = new game.SideViewEngine(character(classId));
  silenceWorld(engine);
  engine.isTownMode = false;
  engine.setBattleTheme(theme);
  engine.player.hp = engine.player.maxHp;
  engine.player.iframeTimer = 0;
  engine.player.vx = 0;
  engine.player.vy = 0;
  engine.player.isGrounded = true;
  return engine;
}

function putPlayerOnFirstHazard(engine) {
  const hazard = engine.getZoneHazardSnapshot()[0];
  assert.ok(hazard, 'battle theme should expose a runtime hazard');
  engine.player.x = hazard.x;
  engine.player.y = hazard.y;
  engine.player.vx = 0;
  engine.player.vy = 0;
  engine.player.isGrounded = true;
  return hazard;
}

let enemySequence = 0;
function enemyAt(x, y, hp = 100_000) {
  return {
    id: `zone-runtime-dummy-${++enemySequence}`,
    name: 'Training Dummy', type: 'mob', icon: '', color: '#fff',
    x, y, vx: 0, vy: 0, facing: -1, width: 40, height: 40,
    hp, maxHp: hp, atk: 0, def: 0, speed: 0,
    expReward: 0, goldReward: 0, isDead: false, isActive: true,
    spawnDelay: 0, isGrounded: true, isAttacking: false, hitStun: 0,
    attackRange: 45, attackCooldown: 999, attackTimer: 999,
  };
}

function fakeCanvasContext() {
  const gradient = { addColorStop() {} };
  const target = {
    canvas: { width: 960, height: 540 },
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: value => ({ width: String(value).length * 6 }),
  };
  return new Proxy(target, {
    get(object, property) {
      if (property in object) return object[property];
      const noop = () => {};
      object[property] = noop;
      return noop;
    },
    set(object, property, value) {
      object[property] = value;
      return true;
    },
  });
}

test('engine builds authored platforms and keeps them grounded after a responsive resize', () => {
  const engine = combatEngine('crypt');
  assert.deepEqual(
    engine.platforms.map(({ type, ...platform }) => platform),
    game.buildZonePlatforms('crypt', engine.groundY, engine.arenaWidth),
  );

  const first = engine.platforms[0];
  engine.player.x = first.x + first.width / 2;
  engine.player.y = first.y;
  engine.player.isGrounded = true;

  engine.groundY = 620;
  engine.update(0);
  const resized = game.buildZonePlatforms('crypt', 620, engine.arenaWidth);
  assert.deepEqual(engine.platforms.map(({ type, ...platform }) => platform), resized);
  assert.equal(engine.player.y, resized[0].y, 'grounded player should remain attached to the resized ledge');
});

test('wave spawning consumes deterministic authored safe anchors, including the boss anchor', () => {
  const dungeon = game.DUNGEONS.find(entry => entry.id === 'goblin_catacombs');
  assert.ok(dungeon);
  const playerX = 300;
  const layout = game.getZoneSpawnLayout(dungeon.theme, 0, 3600);
  const expected = layout.enemies.filter(x => Math.abs(x - playerX) >= layout.minimumSeparation);
  const spawned = game.spawnWaveEnemies(dungeon, 0, 3600, playerX);
  assert.deepEqual(spawned.map(enemy => enemy.x), expected.slice(0, spawned.length));
  assert.ok(spawned.every(enemy => Math.abs(enemy.x - playerX) >= layout.minimumSeparation));

  const bossWaveIndex = dungeon.waves.findIndex(wave => wave.enemies.some(enemy => enemy.type === 'boss'));
  const bossLayout = game.getZoneSpawnLayout(dungeon.theme, bossWaveIndex, 3600);
  const boss = game.spawnWaveEnemies(dungeon, bossWaveIndex, 3600, playerX).find(enemy => enemy.type === 'boss');
  assert.ok(boss);
  assert.equal(boss.x, bossLayout.boss);
});

test('renderer places authored planes behind gameplay and in front of effects at the intended depths', () => {
  const engine = combatEngine('inferno');
  const calls = [];
  const replacements = [
    ['drawEnvironment', () => calls.push('environment')],
    ['drawZoneContentPlane', (_ctx, _theme, plane) => calls.push(`zone:${plane}`)],
    ['drawPlatforms', () => calls.push('platforms')],
    ['drawHero', () => calls.push('hero')],
    ['drawEnvironmentForeground', () => calls.push('environment-foreground')],
  ];
  const originals = new Map(replacements.map(([name]) => [name, game.sprites[name]]));
  for (const [name, replacement] of replacements) game.sprites[name] = replacement;
  const originalParticleDraw = engine.particles.draw;
  const originalUltimateDraw = engine.ultimate.draw;
  engine.particles.draw = () => calls.push('particles');
  engine.ultimate.draw = () => calls.push('ultimate');

  try {
    engine.render(fakeCanvasContext(), 960, 540);
  } finally {
    for (const [name, original] of originals) game.sprites[name] = original;
    engine.particles.draw = originalParticleDraw;
    engine.ultimate.draw = originalUltimateDraw;
  }

  assert.ok(calls.indexOf('environment') < calls.indexOf('zone:background'));
  assert.ok(calls.indexOf('zone:background') < calls.indexOf('zone:gameplay-back'));
  assert.ok(calls.indexOf('zone:gameplay-back') < calls.indexOf('platforms'));
  assert.ok(calls.indexOf('platforms') < calls.indexOf('hero'));
  assert.ok(calls.indexOf('particles') < calls.indexOf('zone:foreground'));
  assert.equal(calls.filter(call => call.startsWith('zone:')).length, 3);
});

test('hazards telegraph before damage, throttle repeats, and enter a cooldown window', () => {
  const engine = combatEngine('catacombs');
  putPlayerOnFirstHazard(engine);
  const initialHp = engine.player.hp;

  advance(engine, game.SideViewEngine.ZONE_HAZARD_TELEGRAPH_SECONDS - 0.04);
  assert.equal(engine.player.hp, initialHp, 'telegraph window must never deal damage');
  assert.equal(engine.getZoneHazardSnapshot()[0].phase, 'telegraph');

  advance(engine, 0.08);
  assert.ok(engine.player.hp < initialHp, 'active window should damage a player who stayed in the warning');
  const hpAfterFirstHit = engine.player.hp;

  engine.player.iframeTimer = 0;
  engine.player.x = engine.getZoneHazardSnapshot()[0].x;
  engine.player.y = engine.groundY;
  engine.player.vx = 0;
  engine.player.vy = 0;
  advance(engine, 0.2);
  assert.equal(engine.player.hp, hpAfterFirstHit, 'authored damage cooldown must block repeat damage in one active window');

  advance(engine, game.SideViewEngine.ZONE_HAZARD_ACTIVE_SECONDS);
  assert.equal(engine.getZoneHazardSnapshot()[0].phase, 'cooldown');
});

test('hazards honor shields, accessibility effects, incapacitation, and town safety', () => {
  storage.set('rpg.input.accessibility.v1', JSON.stringify({
    reducedMotion: true,
    screenShake: false,
    screenFlashes: false,
  }));
  const shielded = combatEngine('void');
  putPlayerOnFirstHazard(shielded);
  shielded.player.activeBuffs.push({ stat: 'shield', multiplier: 1, timer: 10, amount: 100 });
  let shakes = 0;
  let flashes = 0;
  shielded.particles.triggerScreenShake = () => { shakes++; };
  shielded.particles.addScreenFlash = () => { flashes++; };
  const hpBeforeShield = shielded.player.hp;
  advance(shielded, game.SideViewEngine.ZONE_HAZARD_TELEGRAPH_SECONDS + 0.05);
  assert.equal(shielded.player.hp, hpBeforeShield);
  assert.ok(shielded.player.activeBuffs[0].amount < 100, 'hazard damage should consume the normal shield pool');
  assert.equal(shakes, 0);
  assert.equal(flashes, 0);

  const downed = combatEngine('swamp');
  putPlayerOnFirstHazard(downed);
  downed.player.downed = true;
  downed.player.downTimer = 20;
  const downedHp = downed.player.hp;
  advance(downed, game.SideViewEngine.ZONE_HAZARD_TELEGRAPH_SECONDS + 0.05);
  assert.equal(downed.player.hp, downedHp, 'downed players cannot be finished by an environmental hazard');

  shielded.isTownMode = true;
  shielded.player.hp = shielded.player.maxHp;
  shielded.player.iframeTimer = 0;
  shielded.player.x = 1280;
  shielded.player.y = shielded.groundY;
  advance(shielded, 4);
  assert.equal(shielded.player.hp, shielded.player.maxHp);
  assert.deepEqual(shielded.getZoneHazardSnapshot(), [], 'town must not instantiate damage hazards');
  storage.clear();
});

test('lowest-party healing compares remote percentage and local ratio in the same unit', () => {
  const engine = combatEngine('catacombs', 'paladin');
  engine.player.hp = Math.round(engine.player.maxHp * 0.8);
  const localHpBefore = engine.player.hp;
  const previousRemotePlayers = game.network.remotePlayers;
  const previousSendPartySupport = game.network.sendPartySupport;
  let supportPayload = null;
  game.network.remotePlayers = {
    woundedAlly: {
      name: 'Wounded Ally', x: 600, y: 0, facing: 1, isGrounded: true,
      isAttacking: false, animState: 'idle', hpPct: 50, downed: false,
    },
  };
  game.network.sendPartySupport = payload => { supportPayload = payload; };

  try {
    engine.castSkill(4);
  } finally {
    game.network.remotePlayers = previousRemotePlayers;
    game.network.sendPartySupport = previousSendPartySupport;
  }

  assert.equal(supportPayload?.kind, 'heal');
  assert.equal(supportPayload?.targetSocketId, 'woundedAlly');
  assert.equal(engine.player.hp, localHpBefore, 'heal should not be diverted to a healthier local player');
});

test('Shadow Clone has no instant hit and its two entities pay exactly two half-strength strikes', () => {
  const originalRandom = Math.random;
  Math.random = () => 0.5;
  try {
    const engine = new game.SideViewEngine(character('ninja'));
    const realSpecialUpdate = engine.checkSpecialSkillEntities.bind(engine);
    silenceWorld(engine);
    engine.checkSpecialSkillEntities = realSpecialUpdate;
    engine.isTownMode = false;
    engine.setBattleTheme('catacombs');
    const target = enemyAt(engine.player.x + 10, engine.player.y);
    engine.enemies = [target];
    const before = target.hp;
    const skill = engine.player.characterClass.skills[1];
    const totalDamage = Math.max(1, Math.round(engine.player.totalAtk * skill.damageMultiplier * 0.55));
    const expectedCombined = Math.max(1, Math.round(totalDamage * skill.mechanics.summon.damageScale)) * 2;

    engine.castSkill(1);
    assert.equal(target.hp, before, 'summon delivery must not apply its old button-down area hit');
    assert.equal(engine.particles.shadowClones.length, 2);
    assert.ok(engine.particles.shadowClones.every(clone => !clone.hasStruck));

    advance(engine, 0.12);
    assert.equal(before - target.hp, expectedCombined);
    assert.ok(engine.particles.shadowClones.every(clone => clone.hasStruck));
    const afterStrikes = target.hp;
    advance(engine, 0.25);
    assert.equal(target.hp, afterStrikes, 'each clone can consume its strike only once');
  } finally {
    Math.random = originalRandom;
  }
});

test('party cleanse removes local debuffs through one method and emits the party relay', () => {
  const engine = combatEngine('catacombs', 'priest');
  engine.playerNegativeStatuses.push(
    { kind: 'slow', remaining: 5, magnitude: 0.4 },
    { kind: 'poison', remaining: 5, magnitude: 0.2 },
  );
  const previousSendPartySupport = game.network.sendPartySupport;
  let supportPayload = null;
  game.network.sendPartySupport = payload => { supportPayload = payload; };

  try {
    engine.castSkill(2);
  } finally {
    game.network.sendPartySupport = previousSendPartySupport;
  }

  assert.equal(engine.playerNegativeStatuses.length, 1);
  assert.equal(supportPayload?.kind, 'cleanse');
  assert.equal(supportPayload?.count, 1);
  assert.equal(engine.applyPartyCleanse(5, 'Ally Priest'), 1);
  assert.equal(engine.playerNegativeStatuses.length, 0);
});

test('grounded remote teammates use world-space Y for revive range and feedback', () => {
  const engine = combatEngine('catacombs');
  engine.player.x = 500;
  engine.player.y = engine.groundY;
  const previousRoom = game.network.room;
  const previousRemotePlayers = game.network.remotePlayers;
  game.network.room = 'REVIVE_TEST';
  game.network.remotePlayers = {
    downedAlly: {
      name: 'Downed Ally', x: 520, y: 0, facing: 1, isGrounded: true,
      isAttacking: false, animState: 'dead', hpPct: 0, downed: true,
      isTownMode: false,
    },
  };

  try {
    const target = engine.nearestDownedAlly();
    assert.equal(target?.socketId, 'downedAlly');
    assert.equal(target?.y, engine.groundY, 'network-relative ground zero must normalize to world groundY');
  } finally {
    game.network.room = previousRoom;
    game.network.remotePlayers = previousRemotePlayers;
  }
});
