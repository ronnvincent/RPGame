import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { rolldown } from 'rolldown';

const bundle = await rolldown({
  input: 'test/combat-systems-fixture.ts',
  platform: 'browser',
});
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find(chunk => chunk.type === 'chunk')?.code;
assert.ok(code, 'combat systems fixture should bundle');
const combat = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

function status(kind, overrides = {}) {
  return { kind, remaining: 4, ...overrides };
}

function reactionContext(overrides = {}) {
  return {
    targetId: 'primary',
    castToken: 'cast-1',
    sourceDamage: 100,
    triggerTags: [],
    statusesBeforeHit: [],
    nearbyTargets: [],
    ...overrides,
  };
}

test('status/reaction registries reference real catalogue sprites and sounds, never asset paths', () => {
  for (const kind of combat.COMBAT_STATUS_KINDS) {
    const definition = combat.COMBAT_STATUS_REGISTRY[kind];
    assert.equal(definition.id, kind);
    assert.ok(combat.VFX[definition.markerSpriteId], `${kind} marker sprite`);
    assert.ok(combat.VFX[definition.applySpriteId], `${kind} apply sprite`);
    assert.ok(combat.SFX[definition.soundId], `${kind} sound`);
    assert.doesNotMatch(definition.markerSpriteId, /[\\/]/);
    assert.doesNotMatch(definition.applySpriteId, /[\\/]/);
  }
  for (const id of combat.ELEMENTAL_REACTION_IDS) {
    const definition = combat.ELEMENTAL_REACTIONS[id];
    assert.ok(combat.VFX[definition.impactSpriteId], `${id} impact sprite`);
    assert.ok(combat.SFX[definition.soundId], `${id} sound`);
    assert.doesNotMatch(definition.impactSpriteId, /[\\/]/);
  }

  const sources = [
    'src/sideview/combat/CombatStatusRegistry.ts',
    'src/sideview/combat/EnemyAttackProfiles.ts',
  ].map(file => readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(sources, /CanvasRenderingContext2D|\bctx\.|\/assets\//);
});

test('wet-lightning chains deterministically to the three nearest unique targets once per cast', () => {
  const inputStatuses = [status('wet')];
  const context = reactionContext({
    triggerTags: ['lightning'],
    statusesBeforeHit: inputStatuses,
    nearbyTargets: [
      { id: 'far', distance: 250 },
      { id: 'near-b', distance: 40 },
      { id: 'near-a', distance: 40 },
      { id: 'outside', distance: 999 },
      { id: 'far', distance: 90 },
      { id: 'mid', distance: 120 },
      { id: 'fourth', distance: 180 },
      { id: 'primary', distance: 0 },
    ],
  });
  const [reaction] = combat.resolveElementalReactions(context);

  assert.equal(reaction.reactionId, 'wet-lightning-chain');
  assert.deepEqual(reaction.consumeStatusKinds, ['wet']);
  assert.deepEqual(reaction.damageEvents.map(event => event.targetId), ['primary', 'near-a', 'near-b', 'far']);
  assert.deepEqual(reaction.damageEvents.map(event => event.amount), [35, 26, 19, 14]);
  assert.ok(reaction.damageEvents.every(event => event.sourceKind === 'reaction'));
  assert.deepEqual(inputStatuses, [status('wet')], 'resolver must not mutate status snapshots');

  const deduped = combat.resolveElementalReactions({
    ...context,
    alreadyResolvedKeys: new Set([reaction.dedupeKey]),
  });
  assert.deepEqual(deduped, []);
});

test('burn explosion converts bounded unpaid burn damage and cannot recursively trigger', () => {
  const [reaction] = combat.resolveElementalReactions(reactionContext({
    sourceDamage: 200,
    triggerTags: ['detonate'],
    statusesBeforeHit: [
      status('burn', { remainingDamage: 80 }),
      status('burn', { remainingDamage: 40, sourceSkillId: 'other' }),
    ],
    nearbyTargets: Array.from({ length: 20 }, (_, index) => ({ id: `mob-${index}`, distance: 10 + index })),
  }));

  assert.equal(reaction.reactionId, 'burn-explosion');
  assert.equal(reaction.damageEvents[0].amount, 150, '60 direct scale + 90 converted burn');
  assert.equal(reaction.damageEvents.length, 6, 'primary plus five bounded secondary targets');
  assert.deepEqual(reaction.damageEvents.slice(1).map(event => event.amount), [98, 83, 68, 53, 45]);
  assert.deepEqual(combat.resolveElementalReactions(reactionContext({
    sourceKind: 'reaction',
    triggerTags: ['detonate'],
    statusesBeforeHit: [status('burn', { remainingDamage: 999 })],
  })), []);
  assert.deepEqual(combat.resolveElementalReactions(reactionContext({
    sourceKind: 'dot',
    triggerTags: ['detonate'],
    statusesBeforeHit: [status('burn')],
  })), []);
});

test('freeze shatter produces stagger while curse siphon heals from actual dealt damage', () => {
  const [shatter] = combat.resolveElementalReactions(reactionContext({
    sourceDamage: 101,
    triggerTags: ['shatter'],
    statusesBeforeHit: [status('freeze')],
  }));
  assert.equal(shatter.reactionId, 'freeze-shatter');
  assert.equal(shatter.damageEvents.length, 1);
  assert.equal(shatter.damageEvents[0].amount, 45);
  assert.equal(shatter.staggerDamage, 65);

  const [siphon] = combat.resolveElementalReactions(reactionContext({
    sourceDamage: 77,
    triggerTags: ['siphon'],
    statusesBeforeHit: [status('curse')],
  }));
  assert.equal(siphon.reactionId, 'curse-lifesteal');
  assert.equal(siphon.damageEvents.length, 0);
  assert.equal(siphon.healing, 27);
  assert.deepEqual(siphon.consumeStatusKinds, ['curse']);
});

test('reaction inputs and outputs remain finite and bounded under hostile values', () => {
  const resolutions = combat.resolveElementalReactions(reactionContext({
    castToken: Number.POSITIVE_INFINITY,
    sourceDamage: Number.POSITIVE_INFINITY,
    triggerTags: ['lightning', 'detonate', 'shatter', 'siphon'],
    statusesBeforeHit: [
      status('wet'), status('burn', { remainingDamage: Number.POSITIVE_INFINITY }),
      status('freeze'), status('curse'),
    ],
    nearbyTargets: Array.from({ length: 100 }, (_, index) => ({ id: `target-${index}`, distance: index })),
  }));
  assert.ok(resolutions.length <= combat.REACTION_LIMITS.maxReactionsPerHit);
  for (const resolution of resolutions) {
    assert.ok(resolution.healing <= combat.REACTION_LIMITS.maxHealing);
    assert.ok(resolution.damageEvents.length <= 1 + 5);
    for (const event of resolution.damageEvents) {
      assert.ok(Number.isFinite(event.amount));
      assert.ok(event.amount <= combat.REACTION_LIMITS.maxDamagePerEvent);
    }
  }
});

test('dodge exposes one perfect window, while cooldown and recovery prevent spam', () => {
  const idle = combat.createPlayerDefenseState();
  const started = combat.startDodge(idle);
  assert.equal(started.started, true);

  const first = combat.resolveIncomingDefense(started.state, {
    parryability: 'dodge-only', sourceDirection: 1, defenderFacing: 1,
  });
  assert.equal(first.outcome, 'perfect-dodge');
  const second = combat.resolveIncomingDefense(first.state, {
    parryability: 'parryable', sourceDirection: -1, defenderFacing: 1,
  });
  assert.equal(second.outcome, 'dodge', 'dodge i-frames remain but perfect reward is consumed');
  assert.equal(combat.startDodge(second.state).started, false);

  const ready = combat.tickPlayerDefenseState(second.state, combat.DEFENSE_TIMING.dodgeCooldown + 0.01);
  assert.equal(combat.startDodge(ready).started, true);
  const unavoidable = combat.resolveIncomingDefense(started.state, {
    parryability: 'unavoidable', sourceDirection: 1, defenderFacing: 1,
  });
  assert.equal(unavoidable.outcome, 'hit');
});

test('parry requires a frontal parryable intent and returns bounded interrupt pressure', () => {
  const started = combat.startParry(combat.createPlayerDefenseState());
  assert.equal(started.started, true);
  const backHit = combat.resolveIncomingDefense(started.state, {
    parryability: 'parryable', sourceDirection: -1, defenderFacing: 1,
  });
  assert.equal(backHit.outcome, 'hit');

  const dodgeOnly = combat.resolveIncomingDefense(started.state, {
    parryability: 'dodge-only', sourceDirection: 1, defenderFacing: 1,
  });
  assert.equal(dodgeOnly.outcome, 'hit');

  const parried = combat.resolveIncomingDefense(started.state, {
    parryability: 'parryable', sourceDirection: 1, defenderFacing: 1,
  });
  assert.equal(parried.outcome, 'parry');
  assert.equal(parried.negatesDamage, true);
  assert.equal(parried.interruptAttacker, true);
  assert.equal(parried.attackerGuardDamage, combat.DEFENSE_TIMING.parryGuardDamage);
  assert.equal(parried.attackerStaggerDamage, combat.DEFENSE_TIMING.parryStaggerDamage);
  assert.equal(combat.resolveIncomingDefense(parried.state, {
    parryability: 'parryable', sourceDirection: 1, defenderFacing: 1,
  }).outcome, 'hit', 'one parry press cannot answer multiple intents');
});

test('front guard reduces damage, back hits bypass it, and guard break interrupts once', () => {
  const guarding = combat.createGuardStaggerState({ maxGuard: 100, staggerThreshold: 80, guarding: true });
  const blocked = combat.resolveGuardStaggerImpact(guarding, {
    incomingDamage: 100, guardDamage: 40, staggerDamage: 20,
    sourceDirection: 1, defenderFacing: 1,
  });
  assert.equal(blocked.guarded, true);
  assert.equal(blocked.guardBroken, false);
  assert.equal(blocked.resolvedDamage, 35);
  assert.equal(blocked.state.guard, 60);

  const backHit = combat.resolveGuardStaggerImpact(guarding, {
    incomingDamage: 100, guardDamage: 200, staggerDamage: 20,
    sourceDirection: -1, defenderFacing: 1,
  });
  assert.equal(backHit.guarded, false);
  assert.equal(backHit.resolvedDamage, 100);
  assert.equal(backHit.state.guard, 100);

  const broken = combat.resolveGuardStaggerImpact(blocked.state, {
    incomingDamage: 100, guardDamage: 100, staggerDamage: 20,
    sourceDirection: 1, defenderFacing: 1,
  });
  assert.equal(broken.guardBroken, true);
  assert.equal(broken.staggered, true);
  assert.equal(broken.interrupted, true);
  assert.equal(broken.resolvedDamage, 65);
  assert.equal(combat.setGuarding(broken.state, true).guarding, false);
});

test('stagger reaches its threshold deterministically and both meters recover after delays', () => {
  let state = combat.createGuardStaggerState({ maxGuard: 100, staggerThreshold: 50 });
  const first = combat.resolveGuardStaggerImpact(state, {
    incomingDamage: 10, guardDamage: 0, staggerDamage: 30,
    sourceDirection: 1, defenderFacing: 1,
  });
  assert.equal(first.staggered, false);
  const second = combat.resolveGuardStaggerImpact(first.state, {
    incomingDamage: 10, guardDamage: 0, staggerDamage: 30,
    sourceDirection: 1, defenderFacing: 1,
  });
  assert.equal(second.staggered, true);
  assert.equal(second.interrupted, true);

  state = { ...second.state, guard: 20, guardRecoveryDelayRemaining: 0.1 };
  state = combat.tickGuardStaggerState(state, 2);
  assert.ok(state.guard > 20);
  assert.equal(state.staggeredRemaining, 0);
  assert.ok(Object.values(state).filter(value => typeof value === 'number').every(Number.isFinite));
});

test('every enemy attack profile is data-only, readable, and references real sprite/sound ids', () => {
  for (const profileId of combat.ENEMY_ATTACK_PROFILE_IDS) {
    const profile = combat.ENEMY_ATTACK_PROFILES[profileId];
    assert.equal(profile.id, profileId);
    assert.ok(profile.telegraphSeconds >= 0.3, `${profileId} readable tell`);
    assert.ok(profile.activeSeconds > 0);
    assert.ok(profile.recoverySeconds > 0);
    for (const spriteId of [profile.telegraphSpriteId, profile.activeSpriteId, profile.impactSpriteId]) {
      assert.ok(combat.VFX[spriteId], `${profileId}: ${spriteId}`);
      assert.doesNotMatch(spriteId, /[\\/]/);
    }
    assert.ok(combat.SFX[profile.chargeSoundId], `${profileId} charge sound`);
    assert.ok(combat.SFX[profile.impactSoundId], `${profileId} impact sound`);
  }
  assert.deepEqual(new Set(Object.keys(combat.DEFAULT_ATTACK_PROFILE_BY_ROLE)), new Set([
    'bruiser', 'shield-tank', 'healer', 'ranged-sniper', 'summoner', 'assassin', 'boss',
  ]));
});

test('enemy intent state machine cannot resolve before the telegraph boundary or twice', () => {
  let intent = combat.createEnemyAttackIntent({
    intentId: 'intent-1',
    profileId: 'melee-light',
    sourceEnemyId: 'enemy-1',
    sourceX: 100,
    sourceY: 200,
    facing: 1,
    target: { actorId: 'player-1', x: 150, y: 200 },
    sceneEpoch: 7,
  });
  const profile = combat.getEnemyAttackProfile(intent.profileId);
  intent = combat.advanceEnemyAttackIntent(intent, profile.telegraphSeconds - 0.001);
  assert.equal(combat.enemyAttackIntentPhase(intent).phase, 'telegraph');
  assert.equal(combat.canResolveEnemyAttackIntent(intent), false);

  intent = combat.advanceEnemyAttackIntent(intent, 0.001);
  assert.equal(combat.enemyAttackIntentPhase(intent).phase, 'active');
  assert.equal(combat.canResolveEnemyAttackIntent(intent), true);
  intent = combat.markEnemyAttackIntentResolved(intent);
  assert.equal(combat.canResolveEnemyAttackIntent(intent), false);

  intent = combat.advanceEnemyAttackIntent(intent, profile.activeSeconds);
  assert.equal(combat.enemyAttackIntentPhase(intent).phase, 'recovery');
  intent = combat.advanceEnemyAttackIntent(intent, profile.recoverySeconds);
  assert.equal(combat.enemyAttackIntentPhase(intent).phase, 'complete');
});

test('intent construction is deterministic and clamps untrusted coordinates/timing', () => {
  const options = {
    intentId: 'intent unsafe!', profileId: 'boss-slam', sourceEnemyId: 'boss unsafe!',
    sourceX: Number.POSITIVE_INFINITY, sourceY: Number.NaN, facing: -1,
    target: { actorId: 'actor unsafe!', x: 99_000_000, y: -99_000_000 }, sceneEpoch: -5,
  };
  const first = combat.createEnemyAttackIntent(options);
  const second = combat.createEnemyAttackIntent(options);
  assert.deepEqual(first, second);
  assert.equal(first.intentId, 'intentunsafe');
  assert.equal(first.sourceEnemyId, 'bossunsafe');
  assert.equal(first.sourceX, 0);
  assert.equal(first.target.x, 10_000_000);
  assert.equal(first.target.y, -10_000_000);
  assert.equal(first.sceneEpoch, 0);
  assert.equal(combat.advanceEnemyAttackIntent(first, Number.POSITIVE_INFINITY).elapsed, 0);
});
