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

function character(id) {
  const found = game.CHARACTER_CLASSES.find(entry => entry.id === id);
  assert.ok(found, `missing character class ${id}`);
  return found;
}

function enemyAt(x, y, hp = 100_000) {
  return {
    id: `dummy-${x}-${y}`,
    name: 'Training Dummy',
    type: 'normal',
    icon: '',
    color: '#fff',
    x,
    y,
    vx: 0,
    vy: 0,
    facing: -1,
    width: 40,
    height: 40,
    hp,
    maxHp: hp,
    atk: 0,
    def: 0,
    speed: 0,
    expReward: 0,
    goldReward: 0,
    isDead: false,
    hitStun: 0,
    attackCooldown: 999,
  };
}

function silenceWorld(engine) {
  // These systems are irrelevant to the unit under test. Replacing them keeps
  // update() deterministic while retaining its real defeat/regen/physics order.
  engine.updateEnemies = () => {};
  engine.updateLoot = () => {};
  engine.checkProjectileCollisions = () => {};
  engine.checkSpecialSkillEntities = () => {};
  engine.tickPartyChatter = () => {};
}

test('lethal HP resolves before regen and only announces defeat once', () => {
  const engine = new game.SideViewEngine(character('warrior'));
  silenceWorld(engine);
  engine.isTownMode = false;
  let losses = 0;
  engine.onRunLost = () => { losses++; };
  engine.player.hp = 0;

  engine.update(1 / 60);
  engine.update(1 / 60);

  assert.equal(engine.player.hp, 0);
  assert.equal(engine.player.animState, 'dead');
  assert.equal(engine.runOver, true);
  assert.equal(losses, 1);
});

test('downed players stay at zero HP and cannot regenerate or drink', () => {
  game.network.room = 'behavior-test-room';
  game.network.remotePlayers = {
    ally: { name: 'Ally', x: 0, y: 0, facing: 1, isGrounded: true, isAttacking: false, animState: 'idle' },
  };
  try {
    const engine = new game.SideViewEngine(character('warrior'));
    silenceWorld(engine);
    engine.isTownMode = false;
    engine.player.hp = 0;
    engine.player.mp = 10;
    engine.player.inventory.push({
      id: 'test-potion',
      name: 'Test Potion',
      rarity: 'common',
      type: 'consumable',
      consumableEffect: { type: 'heal_hp', value: 100 },
    });

    engine.update(0.25);

    assert.equal(engine.player.downed, true);
    assert.equal(engine.player.hp, 0);
    assert.equal(engine.player.mp, 10);
    assert.equal(engine.quickHeal(), 'blocked');
    assert.equal(engine.player.inventory.length, 1);
  } finally {
    game.network.room = null;
    game.network.remotePlayers = {};
  }
});

test('HP waits for the combat grace period while MP can recover', () => {
  const engine = new game.SideViewEngine(character('warrior'));
  silenceWorld(engine);
  engine.isTownMode = false;
  engine.player.hp = engine.player.maxHp / 2;
  engine.player.mp = engine.player.maxMp / 2;
  engine.lastHurtAt = performance.now();
  const hpAfterHit = engine.player.hp;
  const mpAfterHit = engine.player.mp;

  engine.update(0.25);
  assert.equal(engine.player.hp, hpAfterHit);
  assert.ok(engine.player.mp > mpAfterHit);

  engine.lastHurtAt = performance.now() - 6000;
  engine.update(0.25);
  assert.ok(engine.player.hp > hpAfterHit);
});

test('ranged basics create projectiles instead of melee combos or plunges', () => {
  for (const classId of ['mage', 'archer', 'necromancer', 'priest']) {
    const engine = new game.SideViewEngine(character(classId));
    engine.isTownMode = false;
    engine.player.isGrounded = false;
    engine.player.vy = -2;
    const before = engine.particles.projectiles.length;

    engine.castSkill(0);

    assert.equal(engine.particles.projectiles.length, before + 1, classId);
    assert.equal(engine.player.comboStep, 0, classId);
    assert.notEqual(engine.player.vy, 14, classId);
    engine.cancelDelayedCombatTasks();
  }
});

test('fast projectiles use swept collision instead of tunnelling on a long frame', () => {
  const engine = new game.SideViewEngine(character('archer'));
  engine.isTownMode = false;
  const startX = engine.player.x;
  const target = enemyAt(startX + 60, engine.player.y);
  engine.enemies = [target];
  const before = target.hp;

  engine.particles.addProjectile(
    startX,
    target.y - 24,
    20,
    0,
    'arrow',
    50,
    false,
    true,
    '#fff',
    8,
  );
  engine.particles.update(0.1); // 120px travel: both endpoints miss the target.
  engine.checkProjectileCollisions();

  assert.ok(target.hp < before);
  assert.equal(engine.particles.projectiles.length, 0);
});

test('hit-stop still resolves swept projectiles and recycles impact removals', () => {
  const engine = new game.SideViewEngine(character('archer'));
  engine.isTownMode = false;
  const startX = engine.player.x;
  const target = enemyAt(startX + 60, engine.player.y);
  engine.enemies = [target];
  const beforeHp = target.hp;

  engine.particles.addProjectile(
    startX,
    target.y - 24,
    20,
    0,
    'arrow',
    50,
    false,
    true,
    '#fff',
    8,
  );
  engine.hitStopTimer = 0.05;
  engine.update(0.1);

  assert.ok(target.hp < beforeHp, 'the segment travelled during hit-stop must collide');
  assert.equal(engine.particles.projectiles.length, 0);
  assert.equal(engine.particles.getPerformanceMetrics().pools.projectiles, 1);

  engine.particles.addProjectile(startX, target.y - 24, 1, 0, 'arrow', 10);
  assert.equal(engine.particles.getPerformanceMetrics().reused.projectiles, 1);
});

test('Fan of Knives deals a real radial hit', () => {
  const engine = new game.SideViewEngine(character('assassin'));
  engine.isTownMode = false;
  const target = enemyAt(engine.player.x + 20, engine.player.y);
  engine.enemies = [target];
  const before = target.hp;

  engine.castSkill(3);

  assert.ok(target.hp < before);
});

test('ultimate damage lands on the cinematic impact, not button-down', () => {
  const engine = new game.SideViewEngine(character('mage'));
  engine.isTownMode = false;
  const target = enemyAt(engine.player.x + 180, engine.player.y);
  engine.enemies = [target];
  const before = target.hp;

  engine.castSkill(5);
  assert.equal(target.hp, before);

  engine.ultimate.update(0.56);
  assert.ok(target.hp < before);
  engine.cancelDelayedCombatTasks();
});

test('scene cancellation prevents queued multi-hits from leaking forward', async () => {
  const engine = new game.SideViewEngine(character('warrior'));
  engine.isTownMode = false;
  const target = enemyAt(engine.player.x + 20, engine.player.y);
  engine.enemies = [target];

  engine.castSkill(1); // Whirlwind: one immediate hit, two delayed hits.
  const afterImmediateHit = target.hp;
  engine.cancelDelayedCombatTasks();
  await new Promise(resolve => setTimeout(resolve, 350));

  assert.equal(target.hp, afterImmediateHit);
});

test('going down cancels a queued ultimate payload and delayed combat work', () => {
  const previousRoom = game.network.room;
  const previousRemotes = game.network.remotePlayers;
  game.network.room = 'downed-cancel-room';
  game.network.remotePlayers = { ally: {} };
  try {
    const engine = new game.SideViewEngine(character('warrior'));
    silenceWorld(engine);
    engine.isTownMode = false;
    const target = enemyAt(engine.player.x + 150, engine.player.y);
    engine.enemies = [target];
    const before = target.hp;

    engine.castSkill(5);
    assert.equal(engine.ultimate.active, true);
    engine.player.hp = 0;
    engine.update(1 / 60);

    assert.equal(engine.player.downed, true);
    assert.equal(engine.ultimate.active, false);
    engine.update(0.6);
    assert.equal(target.hp, before);
  } finally {
    game.network.room = previousRoom;
    game.network.remotePlayers = previousRemotes;
  }
});

test('a fast descending melee basic triggers its landing impact', () => {
  const engine = new game.SideViewEngine(character('warrior'));
  silenceWorld(engine);
  engine.isTownMode = false;
  const target = enemyAt(engine.player.x + 10, engine.groundY);
  engine.enemies = [target];
  engine.player.y = engine.groundY - 20;
  engine.player.vy = 14;
  engine.player.isGrounded = false;
  engine.player.attackTimer = 0.4;
  engine.player.animState = 'attack';
  const before = target.hp;

  engine.update(0.05);

  assert.ok(target.hp < before);
  assert.equal(engine.player.isGrounded, true);
});

test('Q is heal-only and every skill key maps to exactly one slot', () => {
  assert.equal(game.skillIndexForInput('KeyQ'), null);
  assert.equal(game.skillIndexForInput('KeyE'), null);
  assert.deepEqual(
    ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].map(game.skillIndexForInput),
    [0, 1, 2, 3, 4, 5],
  );
});

test('the three late-game bosses expose two executable skills each', () => {
  for (const name of ['Warband Chief Hadrik', 'Alpha Greymane', 'Castellan Mordred']) {
    const skills = game.bossSkillsFor(name);
    assert.equal(skills.length, 2, name);
    assert.ok(skills.every(skill => skill.telegraph > 0 && skill.cooldown > skill.telegraph), name);
  }
});

test('combat touch controls use one activation event per gesture', () => {
  const hud = readFileSync('src/sideview/ui/GameHUD.ts', 'utf8');
  assert.doesNotMatch(hud, /jumpBtn\.addEventListener\('touchstart'/);
  assert.doesNotMatch(hud, /dashBtn\.addEventListener\('touchstart'/);
  assert.doesNotMatch(hud, /slot\.addEventListener\('click', triggerSkill/);
  assert.match(hud, /querySelectorAll\('\.hotbar-slot\[data-skill-idx\]'/);
});
