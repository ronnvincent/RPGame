import test from 'node:test';
import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'test/dungeon-run-fixture.ts', platform: 'browser' });
const generatedBundle = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generatedBundle.output.find(chunk => chunk.type === 'chunk')?.code;
assert.ok(code, 'dungeon run fixture should bundle');
const run = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

function generated(seed = 0x1234abcd) {
  return run.generateDungeonRun({
    blueprint: run.DEFAULT_DUNGEON_RUN_BLUEPRINT,
    content: run.DUNGEON_RUN_CONTENT,
    seed,
  });
}

function spriteIds(node) {
  return [
    node.sprites.groundSpriteId,
    node.sprites.entryDoorSpriteId,
    node.sprites.exitDoorSpriteId,
    node.sprites.lockedExitSpriteId,
    node.sprites.secretExitSpriteId,
    node.sprites.objectiveMarkerSpriteId,
    node.sprites.roomIconSpriteId,
    ...node.sprites.backgroundLayers.map(layer => layer.spriteId),
    ...node.sprites.foregroundLayers.map(layer => layer.spriteId),
    ...node.choices.map(choice => choice.iconSpriteId),
  ];
}

test('authored catalogue generates a bounded deterministic graph with special and secret routes', () => {
  assert.doesNotThrow(() => run.validateRunDefinition(run.DEFAULT_DUNGEON_RUN_BLUEPRINT, run.DUNGEON_RUN_CONTENT));
  assert.deepEqual(
    [...new Set(run.DUNGEON_RUN_CONTENT.roomTemplates.map(room => room.objective?.type).filter(Boolean))].sort(),
    ['defend_relic', 'destroy_nests', 'escort', 'kill_all', 'survive', 'timed_escape'],
  );
  const first = generated();
  const second = generated();
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, generated(0x1234abce));
  assert.ok(first.graph.nodes.length <= run.RUN_LIMITS.maxRooms);
  assert.ok(first.graph.nodes.some(node => node.kind === 'event'));
  assert.ok(first.graph.nodes.some(node => node.kind === 'treasure'));
  assert.ok(first.graph.nodes.some(node => node.kind === 'shrine'));
  assert.ok(first.graph.nodes.some(node => node.kind === 'elite'));
  assert.ok(first.graph.nodes.some(node => node.kind === 'miniboss'));
  assert.ok(first.graph.nodes.some(node => node.kind === 'boss'));
  assert.ok(first.graph.nodes.some(node => node.kind === 'escape'));
  assert.ok(first.graph.nodes.some(node => node.access === 'secret'));
  assert.ok(first.graph.exits.some(exit => exit.kind === 'secret'));
  assert.ok(first.graph.nodes.every(node => spriteIds(node).every(run.isGameplaySpriteId)));
  assert.equal(run.validateGameplaySpriteManifest().length, 0);
  const authoredJson = JSON.stringify({ content: run.DUNGEON_RUN_CONTENT, graph: first.graph });
  assert.doesNotMatch(authoredJson, /(?:terrain\.png|\/assets\/|\\assets\\|https?:\/\/)/i);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first, 'generated runs must be plain JSON data');
});

function objective(type) {
  const found = run.DUNGEON_RUN_CONTENT.roomTemplates.find(room => room.objective?.type === type)?.objective;
  assert.ok(found, `missing authored ${type} objective`);
  return found;
}

function tick(definition, state, totalMs) {
  let elapsed = 0;
  let next = state;
  while (elapsed < totalMs) {
    const deltaMs = Math.min(run.RUN_LIMITS.maxTickMs, totalMs - elapsed);
    next = run.reduceObjective(definition, next, { type: 'tick', deltaMs });
    elapsed += deltaMs;
  }
  return next;
}

test('all six objective reducers are deterministic, bounded, and independently completable', () => {
  const context = { activeActorIds: ['actor-a', 'actor-b'] };

  const kill = objective('kill_all');
  let killState = run.createObjectiveState(kill, context);
  killState = run.reduceObjective(kill, killState, { type: 'enemy_spawned', enemyIds: ['enemy-b', 'enemy-a', 'enemy-a'] });
  killState = run.reduceObjective(kill, killState, { type: 'enemy_defeated', enemyId: 'enemy-a' });
  killState = run.reduceObjective(kill, killState, { type: 'spawns_sealed' });
  assert.equal(killState.status, 'active');
  killState = run.reduceObjective(kill, killState, { type: 'enemy_defeated', enemyId: 'enemy-b' });
  assert.equal(killState.status, 'succeeded');
  assert.deepEqual(killState.spawnedEnemyIds, ['enemy-a', 'enemy-b']);

  const defend = objective('defend_relic');
  let defendState = run.createObjectiveState(defend, context);
  defendState = run.reduceObjective(defend, defendState, { type: 'world_object_damaged', objectId: defend.targetObjectId, damage: 100 });
  defendState = tick(defend, defendState, defend.durationMs);
  assert.equal(defendState.status, 'succeeded');
  const destroyedRelic = run.reduceObjective(defend, run.createObjectiveState(defend, context), { type: 'world_object_destroyed', objectId: defend.targetObjectId });
  assert.equal(destroyedRelic.status, 'failed');

  const escort = objective('escort');
  let escortState = run.createObjectiveState(escort, context);
  for (const checkpointId of escort.checkpointIds) {
    escortState = run.reduceObjective(escort, escortState, { type: 'escort_checkpoint_reached', escortActorId: escort.escortActorId, checkpointId });
  }
  assert.equal(escortState.status, 'succeeded');

  const survive = objective('survive');
  const survived = tick(survive, run.createObjectiveState(survive, context), survive.durationMs);
  assert.equal(survived.status, 'succeeded');

  const nests = objective('destroy_nests');
  let nestState = run.createObjectiveState(nests, context);
  for (const objectId of nests.nestObjectIds) nestState = run.reduceObjective(nests, nestState, { type: 'world_object_destroyed', objectId });
  assert.equal(nestState.status, 'succeeded');

  const escape = objective('timed_escape');
  let escapeState = run.createObjectiveState(escape, context);
  escapeState = run.reduceObjective(escape, escapeState, { type: 'actor_escaped', actorId: 'actor-a', exitTriggerId: escape.exitTriggerId });
  escapeState = run.reduceObjective(escape, escapeState, { type: 'actor_escaped', actorId: 'actor-b', exitTriggerId: escape.exitTriggerId });
  assert.equal(escapeState.status, 'succeeded');
  const timedOut = tick(escape, run.createObjectiveState(escape, context), escape.durationMs);
  assert.equal(timedOut.status, 'failed');
});

test('controller enforces authority ordering, advances rooms, and snapshots only serializable state', () => {
  const registry = new run.RelicRegistry(run.RUN_RELIC_DEFINITIONS);
  const controller = run.DungeonRunController.create(generated(), ['actor-a', 'actor-b'], registry, 7);
  let sequence = 0;
  const command = body => ({ commandId: `command-${++sequence}`, authorityEpoch: 7, sequence, ...body });

  const hotPathView = controller.getStateView();
  assert.strictEqual(controller.getStateView(), hotPathView, 'read-only state views do not clone the graph');
  assert.notStrictEqual(controller.getSnapshot(), hotPathView, 'network snapshots remain defensive copies');

  assert.equal(controller.dispatch(command({ type: 'objective_event', event: { type: 'enemy_spawned', enemyIds: ['entry-enemy'] } })).accepted, true);
  assert.notStrictEqual(controller.getStateView(), hotPathView, 'dispatch replaces the internal immutable view');
  assert.equal(controller.dispatch(command({ type: 'objective_event', event: { type: 'spawns_sealed' } })).accepted, true);
  const completion = controller.dispatch(command({ type: 'objective_event', event: { type: 'enemy_defeated', enemyId: 'entry-enemy' } }));
  assert.equal(completion.accepted, true);
  assert.ok(completion.effects.some(effect => effect.type === 'room_completed'));

  const entryId = controller.getSnapshot().currentRoomId;
  const exit = controller.getSnapshot().graph.exits.find(candidate => candidate.fromRoomId === entryId && candidate.kind === 'critical');
  assert.ok(exit);
  const entered = controller.dispatch(command({ type: 'choose_exit', exitId: exit.id }));
  assert.equal(entered.accepted, true);
  assert.ok(entered.effects.some(effect => effect.type === 'room_entered'));

  const stale = controller.dispatch({ commandId: 'stale', authorityEpoch: 6, sequence: sequence + 1, type: 'advance_time', deltaMs: 16 });
  assert.equal(stale.accepted, false);
  assert.equal(stale.reason, 'stale_authority_epoch');
  assert.doesNotThrow(() => JSON.stringify(controller.getSnapshot()));
});

test('relic offers are deterministic and enforce stacks and incompatibilities', () => {
  const registry = new run.RelicRegistry(run.RUN_RELIC_DEFINITIONS);
  const input = { runSeed: 99, actorId: 'actor-a', sourceId: 'elite-room-1', count: 3, ownedRelicIds: [] };
  assert.deepEqual(registry.createOffer(input), registry.createOffer(input));
  const guarded = registry.grant([], 'relic.guardian-sigil');
  assert.equal(registry.canGrant(guarded, 'relic.glass-edge'), false);
  assert.throws(() => registry.grant(guarded, 'relic.glass-edge'));
});
