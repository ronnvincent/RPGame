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
  set src(value) { this._src = value; queueMicrotask(() => this.onload?.()); }
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

const bundle = await rolldown({ input: 'test/combat-correctness-fixture.ts', platform: 'browser' });
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find(chunk => chunk.type === 'chunk')?.code;
assert.ok(code, 'skill fixture should bundle');
const game = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
game.audio.soundEnabled = false;

function character(id) {
  const found = game.CHARACTER_CLASSES.find(entry => entry.id === id);
  assert.ok(found, `missing class ${id}`);
  return found;
}

let enemySequence = 0;
function enemyAt(x, y, hp = 100_000, def = 0, atk = 0) {
  return {
    id: `mechanics-dummy-${++enemySequence}`,
    name: 'Training Dummy',
    type: 'mob',
    icon: '',
    color: '#fff',
    x, y, vx: 0, vy: 0, facing: -1,
    width: 40, height: 40,
    hp, maxHp: hp, atk, def, speed: 4,
    expReward: 0, goldReward: 0,
    isDead: false, isActive: true, spawnDelay: 0,
    isGrounded: true, isAttacking: false, hitStun: 0,
    attackRange: 45, attackCooldown: 1, attackTimer: 1,
  };
}

async function deterministic(run) {
  const original = Math.random;
  Math.random = () => 0.5;
  try { return await run(); } finally { Math.random = original; }
}

test('the canonical contract enumerates exactly the 60 rendered skills', () => {
  const skills = game.CHARACTER_CLASSES.flatMap(cls => cls.skills);
  assert.equal(game.SKILL_IDS.length, 60);
  assert.equal(new Set(game.SKILL_IDS).size, 60);
  assert.equal(skills.length, 60);
  assert.deepEqual(new Set(skills.map(skill => skill.id)), new Set(game.SKILL_IDS));

  for (const skill of skills) {
    const canonical = game.SKILL_IDENTITY_MATRIX[skill.id];
    assert.ok(canonical, skill.id);
    assert.equal(skill.description, canonical.description, `${skill.id} HUD description`);
    assert.equal(skill.mechanics, canonical.mechanics, `${skill.id} mechanics attachment`);
    assert.equal(skill.vfx.identity, canonical.visual, `${skill.id} visual attachment`);
    assert.ok(skill.mechanics.delivery.kind, `${skill.id} delivery`);
    assert.ok(skill.mechanics.hits.count >= 1, `${skill.id} hit count`);
    assert.equal(typeof skill.mechanics.payload.damage, 'boolean', `${skill.id} payload`);
  }
});

test('every skill has a unique identity and every class keeps its own palette/silhouette grammar', () => {
  const skills = game.CHARACTER_CLASSES.flatMap(cls => cls.skills);
  assert.equal(new Set(skills.map(skill => skill.vfx.identity.id)).size, 60);
  assert.equal(new Set(game.CHARACTER_CLASSES.map(cls => cls.skills[0].vfx.identity.palette.join('|'))).size, 10);
  for (const cls of game.CHARACTER_CLASSES) {
    assert.equal(new Set(cls.skills.map(skill => skill.vfx.identity.silhouette)).size, 6, cls.id);
    assert.ok(cls.skills.every(skill => skill.vfx.identity.palette.length === 3), cls.id);
  }
});

test('damage-over-time shares and direct shares never exceed the tooltip potency budget', () => {
  for (const cls of game.CHARACTER_CLASSES) {
    for (const skill of cls.skills) {
      const payload = skill.mechanics.payload;
      const dotShare = (payload.statuses || []).reduce((sum, status) => sum + (status.damageShare || 0), 0);
      const directShare = payload.damage ? (payload.directDamageShare ?? 1) : 0;
      assert.ok(directShare + dotShare <= 1.000001, `${skill.id}: ${directShare} direct + ${dotShare} DoT`);
      if (dotShare > 0) assert.ok(payload.directDamageShare !== undefined, `${skill.id} must reserve its DoT share`);
    }
  }
});

test('all ranged basics are projectiles and never advertise melee delivery', () => {
  for (const [classId, skillId] of [['mage', 'm_1'], ['archer', 'ar_1'], ['necromancer', 'n_1'], ['priest', 'pr_1']]) {
    const skill = character(classId).skills[0];
    assert.equal(skill.id, skillId);
    assert.equal(skill.mechanics.delivery.kind, 'projectile');
    assert.ok(skill.mechanics.delivery.projectile);
  }
});

test('three-hit Whirlwind splits one total potency budget instead of tripling it', async () => deterministic(async () => {
  const engine = new game.SideViewEngine(character('warrior'));
  engine.isTownMode = false;
  const target = enemyAt(engine.player.x + 20, engine.player.y);
  engine.enemies = [target];
  const before = target.hp;

  engine.castSkill(1);
  const afterFirst = before - target.hp;
  assert.ok(afterFirst > 0 && afterFirst < 40, `first split hit was ${afterFirst}`);
  await new Promise(resolve => setTimeout(resolve, 340));
  const total = before - target.hp;

  assert.ok(total >= 70 && total <= 75, `total was ${total}, expected one ~73 potency budget`);
  engine.cancelDelayedCombatTasks();
}));

test('B3 and D2 land at their exact declared leap distance and damage only after the delay', async () => deterministic(async () => {
  const cases = [
    { classId: 'berserker', skillIndex: 2, distance: 240, delayMs: 260 },
    { classId: 'dragoon', skillIndex: 1, distance: 220, delayMs: 250 },
  ];
  const engines = cases.map(({ classId, skillIndex, distance }) => {
    const engine = new game.SideViewEngine(character(classId));
    engine.isTownMode = false;
    engine.player.x = 500;
    engine.player.facing = 1;
    const target = enemyAt(500 + distance, engine.player.y);
    engine.enemies = [target];
    const hp = target.hp;
    engine.castSkill(skillIndex);
    assert.equal(engine.player.x, 500, `${classId} must not teleport on button-down`);
    assert.equal(target.hp, hp, `${classId} must not damage before landing`);
    return { engine, target, hp, distance };
  });

  await new Promise(resolve => setTimeout(resolve, Math.max(...cases.map(entry => entry.delayMs)) + 30));

  for (const { engine, target, hp, distance } of engines) {
    assert.equal(engine.player.x, 500 + distance);
    assert.ok(target.hp < hp, `${engine.player.characterClass.id} landing must own the damage`);
    engine.cancelDelayedCombatTasks();
  }
}));

test('W6 moves its declared leap distance and centers damage on the cinematic impact', () => deterministic(() => {
  const engine = new game.SideViewEngine(character('warrior'));
  engine.isTownMode = false;
  engine.player.x = 500;
  engine.player.facing = 1;
  const target = enemyAt(650, engine.player.y);
  engine.enemies = [target];
  const hp = target.hp;

  engine.castSkill(5);
  assert.equal(engine.player.x, 500);
  assert.equal(target.hp, hp);

  engine.ultimate.update(0.56);
  assert.equal(engine.player.x, 650);
  assert.ok(target.hp < hp);
  engine.cancelDelayedCombatTasks();
}));

test('a replicated ultimate cannot replace the local W6 impact callback', () => deterministic(() => {
  const engine = new game.SideViewEngine(character('warrior'));
  engine.isTownMode = false;
  engine.player.x = 500;
  const target = enemyAt(650, engine.player.y);
  engine.enemies = [target];
  const hp = target.hp;

  engine.castSkill(5);
  engine.castRemoteSkill('mage', 5, 900, engine.player.y, -1, 'remote-mage', 200);
  engine.ultimate.update(0.56);

  assert.equal(engine.player.x, 650);
  assert.ok(target.hp < hp, 'local W6 damage callback must survive the overlapping remote ultimate');
  engine.cancelDelayedCombatTasks();
}));

test('remote-only ultimates stay off the local director and resolve independently', async () => {
  const engine = new game.SideViewEngine(character('warrior'));
  engine.isTownMode = false;
  const played = [];
  const originalPlayVfx = engine.particles.playVfx.bind(engine.particles);
  engine.particles.playVfx = (...args) => {
    played.push(args[0]);
    return originalPlayVfx(...args);
  };

  engine.castRemoteSkill('mage', 5, 800, engine.player.y, 1, 'remote-mage', 200);
  engine.castRemoteSkill('archer', 5, 1100, engine.player.y, -1, 'remote-archer', 200);
  const castOnlyCount = played.length;
  assert.equal(engine.ultimate.active, false);
  assert.equal(engine.ultimate.invulnerable, false);
  assert.equal(engine.ultimate.timeScale, 1);

  await new Promise(resolve => setTimeout(resolve, 580));
  assert.ok(played.length >= castOnlyCount + 4, 'both remote impact and payload visuals should resolve');
  assert.equal(engine.ultimate.active, false);
  assert.equal(engine.ultimate.timeScale, 1);
  engine.cancelDelayedCombatTasks();
});

test('scene cancellation discards a queued remote ultimate impact', async () => {
  const engine = new game.SideViewEngine(character('warrior'));
  engine.isTownMode = false;
  let impactVisuals = 0;
  const originalPlayVfx = engine.particles.playVfx.bind(engine.particles);
  engine.particles.playVfx = (...args) => {
    if (args[0] === 'ult_epic_explosion_002') impactVisuals++;
    return originalPlayVfx(...args);
  };

  engine.castRemoteSkill('mage', 5, 800, engine.player.y, 1, 'remote-mage', 200);
  engine.cancelDelayedCombatTasks();
  await new Promise(resolve => setTimeout(resolve, 580));
  assert.equal(impactVisuals, 0);
});

test('Blade Dash damages a target midway through its old-to-new sweep', () => deterministic(() => {
  const engine = new game.SideViewEngine(character('warrior'));
  engine.isTownMode = false;
  engine.player.x = 500;
  engine.player.facing = 1;
  const midpoint = enemyAt(610, engine.player.y);
  engine.enemies = [midpoint];
  const hp = midpoint.hp;

  engine.castSkill(4);

  assert.equal(engine.player.x, 720);
  assert.ok(midpoint.hp < hp);
  engine.cancelDelayedCombatTasks();
}));

test('chain lightning normalizes across actual targets and hits one available target once', () => deterministic(() => {
  const engine = new game.SideViewEngine(character('mage'));
  engine.isTownMode = false;
  const target = enemyAt(engine.player.x + 40, engine.player.y);
  engine.enemies = [target];
  const before = target.hp;

  engine.castSkill(2);
  const dealt = before - target.hp;

  assert.ok(dealt >= 82 && dealt <= 86, `one-target chain dealt ${dealt}`);
  assert.equal(engine.statusesForEnemy(target).length, 0);
  engine.cancelDelayedCombatTasks();
}));

test('Fan of Knives creates eight actual piercing dagger entities with split damage', () => deterministic(() => {
  const engine = new game.SideViewEngine(character('assassin'));
  engine.isTownMode = false;
  engine.castSkill(3);

  assert.equal(engine.particles.projectiles.length, 8);
  assert.ok(engine.particles.projectiles.every(projectile => projectile.type === 'dagger' && projectile.piercing));
  assert.ok(engine.particles.projectiles.every(projectile => projectile.damage <= 9));
  engine.cancelDelayedCombatTasks();
}));

test('Dragon Piercer keeps 30 visible arrows but bounds damage feedback to six carriers', async () => deterministic(async () => {
  const engine = new game.SideViewEngine(character('archer'));
  engine.isTownMode = false;
  const skill = character('archer').skills[5];

  engine.spawnSkillProjectiles(skill, 720, false, engine.player.x + skill.range, 42);
  await new Promise(resolve => setTimeout(resolve, 920));

  const arrows = engine.particles.projectiles.filter(projectile => projectile.type === 'arrow');
  const damageCarriers = arrows.filter(projectile => !projectile.visualOnly);
  assert.equal(arrows.length, 30, 'the channel silhouette still contains all thirty arrows');
  assert.equal(damageCarriers.length, 6, 'five adjacent visuals share one feedback/network hit');
  assert.equal(arrows.filter(projectile => projectile.visualOnly).length, 24);
  assert.equal(damageCarriers.reduce((sum, projectile) => sum + projectile.damage, 0), 720);
  assert.ok(damageCarriers.every(projectile => projectile.virtualHitDamages?.length === 5));
  assert.ok(damageCarriers.every(projectile => projectile.impactVfx && projectile.identity));
  assert.ok(arrows.filter(projectile => projectile.visualOnly).every(projectile => !projectile.impactVfx && !projectile.identity));
  engine.cancelDelayedCombatTasks();
}));

test('Dragon Piercer carriers preserve thirty-hit defence and crit rounding at collision', async () => deterministic(async () => {
  const resolveCast = async (rolledCrit) => {
    const engine = new game.SideViewEngine(character('archer'));
    engine.isTownMode = false;
    const skill = character('archer').skills[5];
    const instantSkill = {
      ...skill,
      mechanics: {
        ...skill.mechanics,
        hits: { ...skill.mechanics.hits, intervalMs: 0 },
      },
    };
    const target = enemyAt(engine.player.x + 120, engine.player.y, 100_000, 4);
    engine.enemies = [target];
    const before = target.hp;

    engine.spawnSkillProjectiles(instantSkill, 269, rolledCrit, target.x, 77);
    await new Promise(resolve => setTimeout(resolve, 20));
    for (const projectile of engine.particles.projectiles) {
      projectile.previousX = target.x;
      projectile.previousY = target.y - 24;
      projectile.x = target.x;
      projectile.y = target.y - 24;
    }
    engine.checkProjectileCollisions();
    engine.cancelDelayedCombatTasks();
    return before - target.hp;
  };

  assert.equal(await resolveCast(false), 270, '30 x 9-point virtual arrows retain their post-defence total');
  assert.equal(await resolveCast(true), 390, 'crit rounding remains per authored arrow before grouping');
}));

test('queued generic ultimate secondaries obey live reduced-motion quality', async () => deterministic(async () => {
  const engine = new game.SideViewEngine(character('archer'));
  const skill = character('archer').skills[5];
  const played = [];
  engine.particles.playVfx = (...args) => { played.push(args); };

  engine.playUltimatePayload(skill, 100, 100, 1, skill.vfx.identity.paletteRow, false);
  assert.equal(played.length, 1, 'the centered payload remains immediate');
  engine.particles.setReducedMotion(true);
  await new Promise(resolve => setTimeout(resolve, 240));

  assert.equal(played.length, 1, 'queued high-tier secondaries are cancelled after the downgrade');
  engine.cancelDelayedCombatTasks();
}));

test('poison conserves one exact direct-plus-DoT potency budget through all five ticks', () => deterministic(() => {
  const engine = new game.SideViewEngine(character('assassin'));
  engine.isTownMode = false;
  const target = enemyAt(engine.player.x + 20, engine.player.y);
  engine.enemies = [target];
  const before = target.hp;

  engine.castSkill(1);
  engine.checkProjectileCollisions();
  const poison = engine.statusesForEnemy(target).find(status => status.kind === 'poison');
  assert.ok(poison);
  assert.equal(poison.duration, 5);
  assert.equal(before - target.hp, 36, 'impact owns 75% of the 48-point potency budget');
  assert.equal(poison.damageRemaining, 12, 'poison reserves the remaining 25%');

  for (let tick = 0; tick < 5; tick++) engine.updateCombatStatuses(1);

  assert.equal(before - target.hp, 48, 'impact plus poison must equal one 120%-potency budget');
  assert.equal(engine.statusesForEnemy(target).length, 0, 'poison expires after paying its fifth tick');
  engine.cancelDelayedCombatTasks();
}));

test('refreshing poison preserves each cast budget without loss or duplicate timers', () => deterministic(() => {
  const engine = new game.SideViewEngine(character('assassin'));
  engine.isTownMode = false;
  const skill = character('assassin').skills[1];
  const target = enemyAt(engine.player.x + 20, engine.player.y);
  engine.enemies = [target];
  const before = target.hp;

  engine.executeSkillMechanics(skill, 48, false, engine.player.x, engine.player.y);
  engine.checkProjectileCollisions();
  engine.executeSkillMechanics(skill, 48, false, engine.player.x, engine.player.y);
  engine.checkProjectileCollisions();

  const poison = engine.statusesForEnemy(target).find(status => status.kind === 'poison');
  assert.ok(poison);
  assert.equal(before - target.hp, 72, 'two impacts each deal their own 36-point direct share');
  assert.equal(poison.damageRemaining, 24, 'both unpaid poison shares are retained in one status timer');
  assert.equal(poison.ticksRemaining, 5, 'refresh keeps one timer instead of duplicating status entities');

  for (let tick = 0; tick < 5; tick++) engine.updateCombatStatuses(1);

  assert.equal(before - target.hp, 96, 'two complete casts pay exactly two 48-point budgets');
  assert.equal(engine.statusesForEnemy(target).length, 0);
  engine.cancelDelayedCombatTasks();
}));

test('Frost Nova applies a real 50% slow and fixed Arcane Shield intercepts normal damage', () => deterministic(() => {
  const frostEngine = new game.SideViewEngine(character('mage'));
  frostEngine.isTownMode = false;
  const slowed = enemyAt(frostEngine.player.x + 20, frostEngine.player.y);
  frostEngine.enemies = [slowed];
  frostEngine.castSkill(1);
  const slow = frostEngine.statusesForEnemy(slowed).find(status => status.kind === 'slow');
  assert.ok(slow);
  assert.equal(slow.magnitude, 0.5);

  const shieldEngine = new game.SideViewEngine(character('mage'));
  shieldEngine.isTownMode = false;
  shieldEngine.castSkill(3);
  const shield = shieldEngine.player.activeBuffs.find(buff => buff.stat === 'shield');
  assert.equal(shield?.amount, 250);
  const hp = shieldEngine.player.hp;
  shieldEngine.applyIncomingPlayerDamage(20, shieldEngine.player.x + 10);
  assert.equal(shieldEngine.player.hp, hp);
  assert.ok(shield.amount < 250 && shield.amount > 0);
  frostEngine.cancelDelayedCombatTasks();
  shieldEngine.cancelDelayedCombatTasks();
}));

test('support payloads are deterministic and Eagle Eye states its relative crit math honestly', () => deterministic(() => {
  const priest = new game.SideViewEngine(character('priest'));
  priest.isTownMode = false;
  priest.player.hp = 100;
  priest.castSkill(1);
  assert.equal(priest.player.hp, 300);
  assert.equal(priest.player.totalDef, 40);

  const archer = new game.SideViewEngine(character('archer'));
  archer.isTownMode = false;
  const beforeCrit = archer.player.totalCrit;
  archer.castSkill(4);
  assert.equal(archer.player.totalCrit, Number((beforeCrit * 1.4).toFixed(2)));
  assert.equal(archer.player.totalAttackSpeed, 1.3);
  assert.match(character('archer').skills[4].description, /existing critical chance by 40%/i);
  priest.cancelDelayedCombatTasks();
  archer.cancelDelayedCombatTasks();
}));

test('duplicate remote buffs refresh by stable actor source instead of multiplying twice', () => {
  const engine = new game.SideViewEngine(character('priest'));
  engine.applyPartyBuff('def', 1.25, 8, 'Priest Ally', 'actor-123');
  engine.applyPartyBuff('def', 1.25, 12, 'Renamed Ally', 'actor-123');

  const remoteDefBuffs = engine.player.activeBuffs.filter(buff => (
    buff.stat === 'def' && buff.sourceSkillId === 'remote:actor-123'
  ));
  assert.equal(remoteDefBuffs.length, 1);
  assert.equal(remoteDefBuffs[0].timer, 12);
  assert.equal(engine.player.totalDef, 40);
});

test('percent heals and revives use the recipient max HP with bounded semantics', () => {
  const engine = new game.SideViewEngine(character('priest'));
  engine.player.hp = 100;
  engine.applyPartyPercentHeal(0.45);
  assert.equal(engine.player.hp, 325);

  engine.player.hp = 100;
  engine.applyPartyPercentHeal(2);
  assert.equal(engine.player.hp, engine.player.maxHp);

  engine.player.downed = true;
  engine.player.hp = 0;
  engine.acceptRevive(undefined, 0.45);
  assert.equal(engine.player.hp, 225);
});

test('P5 and PR6 relay percent semantics instead of caster-derived HP amounts', () => deterministic(() => {
  const emitted = [];
  const originalSocket = game.network.socket;
  const originalRemotePlayers = game.network.remotePlayers;
  game.network.socket = { id: 'local', emit: (event, payload) => emitted.push({ event, payload }) };
  try {
    game.network.remotePlayers = {
      wounded: {
        name: 'Wounded', x: 600, y: 0, facing: 1, isGrounded: true,
        isAttacking: false, animState: 'idle', hpPct: 10, downed: false,
      },
    };
    const paladin = new game.SideViewEngine(character('paladin'));
    paladin.isTownMode = false;
    paladin.castSkill(4);
    const heal = emitted.find(entry => entry.event === 'party_support' && entry.payload.kind === 'heal');
    assert.equal(heal?.payload.percent, 0.45);
    assert.equal(heal?.payload.amount, undefined);

    emitted.length = 0;
    game.network.remotePlayers.wounded.downed = true;
    const priest = new game.SideViewEngine(character('priest'));
    const resurrection = character('priest').skills[5];
    priest.executeSkillMechanics(resurrection, 100, false, priest.player.x, priest.player.y);
    const revive = emitted.find(entry => entry.event === 'party_support' && entry.payload.kind === 'revive');
    assert.equal(revive?.payload.percent, 0.45);
  } finally {
    game.network.socket = originalSocket;
    game.network.remotePlayers = originalRemotePlayers;
  }
}));

test('Resurrection Blessing prevention intercepts the ordinary lethal path', () => deterministic(() => {
  const engine = new game.SideViewEngine(character('priest'));
  engine.isTownMode = false;
  const skill = character('priest').skills[5];
  engine.executeSkillMechanics(skill, 100, false, engine.player.x + 80, engine.player.y);
  assert.ok(engine.player.activeBuffs.some(buff => buff.stat === 'deathPrevention'));

  engine.player.hp = 0;
  engine.update(1 / 60);

  assert.equal(engine.runOver, false);
  assert.equal(engine.player.downed, false);
  assert.equal(engine.player.hp, Math.round(engine.player.maxHp * 0.45));
  assert.ok(!engine.player.activeBuffs.some(buff => buff.stat === 'deathPrevention'));
  engine.cancelDelayedCombatTasks();
}));
