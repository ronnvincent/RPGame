import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { isGameplaySpriteId } from '../src/sideview/assets/GameplaySpriteManifest.ts';
import {
  DungeonEncounterRuntime,
  ENCOUNTER_RUNTIME_LIMITS,
} from '../src/sideview/dungeons/DungeonEncounterRuntime.ts';

function fakeRenderer() {
  return {
    draws: [],
    warmed: [],
    draw(_ctx, spriteId, x, y, options) {
      this.draws.push({ spriteId, x, y, options });
      return true;
    },
    warm(spriteIds) {
      this.warmed.push([...spriteIds]);
    },
  };
}

function room(objective, options = {}) {
  return {
    id: options.id ?? `room.${objective?.type ?? options.kind ?? 'event'}`,
    templateId: 'test-template',
    kind: options.kind ?? 'objective',
    access: options.access ?? 'normal',
    depth: 1,
    sceneId: 'test-scene',
    sprites: {
      backgroundLayers: [], groundSpriteId: 'hazard.moving-platform', foregroundLayers: [],
      entryDoorSpriteId: 'route.branch-gate', exitDoorSpriteId: 'route.branch-gate',
      lockedExitSpriteId: 'route.secret-door', secretExitSpriteId: 'route.secret-door',
      objectiveMarkerSpriteId: 'combat.telegraph.area', roomIconSpriteId: 'route.branch-gate',
    },
    enemyGroupIds: [],
    worldObjectIds: [],
    ...(objective ? { objective } : {}),
    choices: [],
    completion: objective ? { type: 'objective' } : { type: 'on_enter' },
    tags: [],
  };
}

function configured(objective, options = {}) {
  const renderer = fakeRenderer();
  const runtime = new DungeonEncounterRuntime(renderer);
  runtime.configureRoom(room(objective, options), options.width ?? 1_200, options.groundY ?? 500, options.seed ?? 'test-seed');
  return { renderer, runtime };
}

function spriteIds(snapshot) {
  return [
    ...snapshot.worldObjects.flatMap(object => [object.spriteId, ...(object.secondarySpriteId ? [object.secondarySpriteId] : [])]),
    ...snapshot.hazards.flatMap(hazard => [hazard.bodySpriteId, hazard.telegraphSpriteId, hazard.impactSpriteId]),
    ...snapshot.routeProps.map(prop => prop.spriteId),
    ...(snapshot.escort ? [snapshot.escort.idleSpriteId, snapshot.escort.walkSpriteId] : []),
  ];
}

test('room configuration is deterministic, serializable, bounded, and contains all five sprite hazards', () => {
  const objective = {
    id: 'objective.nests', type: 'destroy_nests',
    nestObjectIds: ['nest.a', 'nest.b', 'nest.c'], spawnGroupIds: ['nest-wave'],
  };
  const first = configured(objective).runtime.snapshot();
  const second = configured(objective).runtime.snapshot();
  assert.deepEqual(second, first);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.ok(first.worldObjects.length <= ENCOUNTER_RUNTIME_LIMITS.maxWorldObjects);
  assert.ok(first.hazards.length <= ENCOUNTER_RUNTIME_LIMITS.maxHazards);
  assert.ok(first.routeProps.length <= ENCOUNTER_RUNTIME_LIMITS.maxRouteProps);

  const hazardKinds = new Set([
    ...first.hazards.map(({ kind }) => kind),
    ...first.worldObjects.map(({ kind }) => kind),
  ]);
  for (const kind of ['falling-rocks', 'breakable-bridge', 'explosive-barrel', 'traps', 'moving-platform']) {
    assert.ok(hazardKinds.has(kind), `${kind} must be authored into dangerous rooms`);
  }
  for (const spriteId of spriteIds(first)) assert.ok(isGameplaySpriteId(spriteId), `${spriteId} is not manifest-backed`);

  const different = configured(objective, { seed: 'another-seed' }).runtime.snapshot();
  assert.notDeepEqual(
    different.hazards.map(({ baseX }) => baseX),
    first.hazards.map(({ baseX }) => baseX),
    'seed should vary safe authored placement without runtime randomness',
  );
});

test('defend, escort, survive, destroy-nests, and timed-escape emit reducer-ready ObjectiveEvents', () => {
  const defend = configured({
    id: 'objective.defend', type: 'defend_relic', targetObjectId: 'relic',
    durationMs: 2_000, maxHp: 100, spawnGroupIds: ['wave'],
  }).runtime;
  const relic = defend.getObjectiveTargetForEnemy();
  assert.equal(relic.kind, 'world-object');
  const defendResult = defend.update(0.25, {
    enemies: [{ enemyId: 'attacker', x: relic.x, y: relic.y, objectiveDamagePerSecond: 80 }],
  });
  assert.ok(defendResult.objectiveEvents.some(event => event.type === 'world_object_damaged'));
  assert.ok(defendResult.objectiveEvents.some(event => event.type === 'tick'));
  assert.equal(defendResult.worldDamage.length, 1);

  const escort = configured({
    id: 'objective.escort', type: 'escort', escortActorId: 'sage', maxHp: 500,
    checkpointIds: ['cp.a', 'cp.b', 'cp.c'], spawnGroupIds: ['ambush'],
  }).runtime;
  const escortEvents = [];
  for (let step = 0; step < 80 && escort.snapshot().objectiveStatus === 'active'; step += 1) {
    const target = escort.getObjectiveTargetForEnemy();
    const result = escort.update(0.25, { localActor: { actorId: 'hero', x: target.x, y: target.y } });
    escortEvents.push(...result.objectiveEvents);
  }
  assert.deepEqual(
    escortEvents.filter(event => event.type === 'escort_checkpoint_reached').map(event => event.checkpointId),
    ['cp.a', 'cp.b', 'cp.c'],
  );
  assert.equal(escort.snapshot().objectiveStatus, 'succeeded');

  const survive = configured({
    id: 'objective.survive', type: 'survive', durationMs: 500, spawnGroupIds: ['waves'],
  }).runtime;
  const surviveEvents = [
    ...survive.update(0.25, {}).objectiveEvents,
    ...survive.update(0.25, {}).objectiveEvents,
  ];
  assert.equal(surviveEvents.filter(event => event.type === 'tick').reduce((sum, event) => sum + event.deltaMs, 0), 500);
  assert.equal(survive.snapshot().objectiveStatus, 'succeeded');

  const destroy = configured({
    id: 'objective.destroy', type: 'destroy_nests', nestObjectIds: ['nest.a', 'nest.b'], spawnGroupIds: ['wave'],
  }).runtime;
  const nestEvents = [];
  for (const nest of destroy.snapshot().worldObjects.filter(object => object.kind === 'nest')) {
    nestEvents.push(...destroy.hitWorldObjects({ x: nest.x, y: nest.y, radius: 8, sourceId: 'hero-skill' }, 999).objectiveEvents);
  }
  assert.deepEqual(
    nestEvents.filter(event => event.type === 'world_object_destroyed').map(event => event.objectId).sort(),
    ['nest.a', 'nest.b'],
  );
  assert.equal(destroy.snapshot().objectiveStatus, 'succeeded');

  const escape = configured({
    id: 'objective.escape', type: 'timed_escape', durationMs: 2_000,
    exitTriggerId: 'exit', participation: 'all_active',
  }, { kind: 'escape' }).runtime;
  const gate = escape.snapshot().worldObjects.find(object => object.kind === 'escape-gate');
  const escapeResult = escape.update(0.1, {
    localActor: { actorId: 'hero', x: gate.x, y: gate.y },
    remoteActors: [{ actorId: 'friend', x: gate.x, y: gate.y }],
  });
  assert.equal(escapeResult.objectiveEvents.filter(event => event.type === 'actor_escaped').length, 2);
  assert.ok(escapeResult.objectiveEvents.some(event => event.type === 'active_actors_changed'));
  assert.equal(escape.snapshot().objectiveStatus, 'succeeded');
});

test('world hits, explosions, platforms, rocks, and traps produce bounded damage records', () => {
  const { runtime } = configured({
    id: 'objective.survive', type: 'survive', durationMs: 60_000, spawnGroupIds: ['waves'],
  });
  const initial = runtime.snapshot();
  const bridge = initial.worldObjects.find(object => object.kind === 'breakable-bridge');
  const barrel = initial.worldObjects.find(object => object.kind === 'explosive-barrel');
  assert.deepEqual(new Set(runtime.getDynamicPlatforms().map(({ kind }) => kind)), new Set(['breakable-bridge', 'moving-platform']));

  const bridgeHit = runtime.hitWorldObjects({ x: bridge.x, y: bridge.y, radius: 10 }, 999);
  assert.ok(bridgeHit.events.some(event => event.type === 'world-object-destroyed'));
  assert.ok(!runtime.getDynamicPlatforms().some(platform => platform.kind === 'breakable-bridge'));

  runtime.hitWorldObjects({ x: barrel.x, y: barrel.y, radius: 10 }, 999);
  const manyActors = Array.from({ length: 100 }, (_, index) => ({ actorId: `actor.${index}`, x: barrel.x, y: barrel.y }));
  const manyEnemies = Array.from({ length: 100 }, (_, index) => ({ enemyId: `enemy.${index}`, x: barrel.x, y: barrel.y }));
  const explosion = runtime.update(0.01, { localActor: manyActors[0], remoteActors: manyActors.slice(1), enemies: manyEnemies });
  assert.ok(explosion.playerDamage.every(event => event.kind === 'barrel-explosion'));
  assert.ok(explosion.enemyDamage.every(event => event.kind === 'barrel-explosion'));
  assert.ok(explosion.playerDamage.length <= ENCOUNTER_RUNTIME_LIMITS.maxActors);
  assert.ok(explosion.enemyDamage.length <= ENCOUNTER_RUNTIME_LIMITS.maxEnemies);
  assert.ok(explosion.playerDamage.every(event => event.amount <= ENCOUNTER_RUNTIME_LIMITS.maxDamagePerEvent));

  const hazardSnapshot = runtime.snapshot();
  const damagingHazards = hazardSnapshot.hazards.filter(hazard => hazard.kind !== 'moving-platform');
  const actors = damagingHazards.map((hazard, index) => ({ actorId: `hazard-actor.${index}`, x: hazard.baseX, y: hazard.baseY }));
  const enemies = damagingHazards.map((hazard, index) => ({ enemyId: `hazard-enemy.${index}`, x: hazard.baseX, y: hazard.baseY }));
  const damageKinds = new Set();
  const platformBefore = runtime.getDynamicPlatforms().find(platform => platform.kind === 'moving-platform').x;
  for (let step = 0; step < 80; step += 1) {
    const result = runtime.update(0.25, { localActor: actors[0], remoteActors: actors.slice(1), enemies });
    for (const event of [...result.playerDamage, ...result.enemyDamage]) damageKinds.add(event.kind);
  }
  assert.ok(damageKinds.has('falling-rock'));
  assert.ok(damageKinds.has('spike-trap'));
  assert.notEqual(runtime.getDynamicPlatforms().find(platform => platform.kind === 'moving-platform').x, platformBefore);
});

test('snapshots replay exactly and reject unbounded or unknown-sprite payloads', () => {
  const objective = {
    id: 'objective.survive', type: 'survive', durationMs: 30_000, spawnGroupIds: ['waves'],
  };
  const first = configured(objective).runtime;
  first.update(0.25, { localActor: { actorId: 'hero', x: 300, y: 500 } });
  const saved = first.snapshot();
  const second = new DungeonEncounterRuntime(fakeRenderer());
  second.applySnapshot(saved);
  assert.deepEqual(second.snapshot(), saved);

  const context = {
    localActor: { actorId: 'hero', x: 300, y: 500 },
    enemies: [{ enemyId: 'enemy', x: 450, y: 500 }],
  };
  assert.deepEqual(second.update(0.25, context), first.update(0.25, context));
  assert.deepEqual(second.snapshot(), first.snapshot());

  saved.worldObjects.length = 0;
  assert.notEqual(first.snapshot().worldObjects.length, 0, 'snapshot callers cannot mutate live state');

  const oversized = second.snapshot();
  oversized.routeProps = Array.from({ length: ENCOUNTER_RUNTIME_LIMITS.maxRouteProps + 1 }, () => oversized.routeProps[0]);
  assert.throws(() => second.applySnapshot(oversized), /unbounded/);
  const unknown = second.snapshot();
  unknown.hazards[0].bodySpriteId = 'placeholder.canvas-shape';
  assert.throws(() => second.applySnapshot(unknown), /unknown sprite/);
});

test('rendering uses only GameplaySpriteRenderer calls, including room-kind and atlas sprites', () => {
  const cases = [
    { kind: 'event', expected: 'route.event-well' },
    { kind: 'treasure', expected: 'route.treasure.closed' },
    { kind: 'shrine', expected: 'route.risk-shrine' },
  ];
  for (const { kind, expected } of cases) {
    const { renderer, runtime } = configured(null, { kind, id: `room.${kind}` });
    assert.ok(runtime.render({}, 1) > 0);
    assert.ok(renderer.draws.some(({ spriteId }) => spriteId === expected));
    assert.ok(renderer.draws.every(({ spriteId }) => isGameplaySpriteId(spriteId)));
  }

  const secret = configured(null, { kind: 'event', access: 'secret', id: 'room.secret' });
  secret.runtime.render({}, 1);
  assert.ok(secret.renderer.draws.some(({ spriteId }) => spriteId === 'route.secret-door'));

  const nest = configured({
    id: 'objective.nest', type: 'destroy_nests', nestObjectIds: ['nest'], spawnGroupIds: ['wave'],
  });
  nest.runtime.render({}, 1);
  assert.ok(nest.renderer.draws.some(({ spriteId }) => spriteId === 'objective.root-nest'));

  const runtimeSource = readFileSync(new URL('../src/sideview/dungeons/DungeonEncounterRuntime.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(runtimeSource, /ctx\.(?:save|restore|fillRect|strokeRect|fillText|arc|ellipse|beginPath|fill|stroke)\s*\(/);
  assert.match(runtimeSource, /this\.renderer\.draw\(/);

  const rendererSource = readFileSync(new URL('../src/sideview/engine/GameplaySpriteRenderer.ts', import.meta.url), 'utf8');
  assert.ok((rendererSource.match(/layout\.kind === 'atlas'/g) ?? []).length >= 3);
  assert.match(rendererSource, /sx:\s*clip\.layout\.x/);
  assert.match(rendererSource, /sw:\s*clip\.layout\.width/);
});
