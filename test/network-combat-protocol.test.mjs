import assert from 'node:assert/strict';
import test from 'node:test';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'test/network-combat-protocol-fixture.ts', platform: 'browser' });
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find(chunk => chunk.type === 'chunk')?.code;
assert.ok(code, 'network combat protocol fixture should bundle');
const protocol = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

function runState(overrides = {}) {
  const actorIds = ['actor:host', 'actor:guest'];
  return {
    schemaVersion: 1,
    contentVersion: '1.0.0',
    runId: 'run:test:00000001',
    dungeonId: 'goblin_catacombs',
    seed: 1,
    authorityEpoch: 1,
    revision: 3,
    lastCommandSequence: 2,
    elapsedMs: 1000,
    status: 'active',
    currentRoomId: 'room:entry',
    graph: {
      entryRoomId: 'room:entry',
      finaleRoomId: 'room:entry',
      nodes: [{
        id: 'room:entry', templateId: 'run-entry-skirmish', kind: 'combat', access: 'normal',
        depth: 0, sceneId: 'run-entry', sprites: {}, enemyGroupIds: [], worldObjectIds: [],
        choices: [], completion: { type: 'objective' }, tags: ['entry'],
      }],
      exits: [],
    },
    activeActorIds: actorIds,
    visitedRoomIds: ['room:entry'],
    revealedSecretRoomIds: [],
    roomStates: {
      'room:entry': { roomId: 'room:entry', status: 'active', choiceSelections: [] },
    },
    relicsByActorId: Object.fromEntries(actorIds.map(actorId => [actorId, []])),
    relicOffers: [],
    ...overrides,
  };
}

function encounterSnapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    room: { id: 'room:entry', kind: 'combat', access: 'normal' },
    seed: 1,
    arenaWidth: 1600,
    groundY: 420,
    elapsedSeconds: 2.5,
    objectiveElapsedMs: 2500,
    objectiveStatus: 'active',
    eventSequence: 4,
    worldObjects: [],
    hazards: [],
    routeProps: [],
    escort: null,
    activeActorIds: ['actor:host', 'actor:guest'],
    escapedActorIds: [],
    knownEnemyIds: ['enemy:1'],
    defeatedEnemyIds: [],
    spawnsSealed: false,
    pendingExplosions: [],
    ...overrides,
  };
}

test('DungeonRunState boundary accepts its current schema and rejects stale or unbounded snapshots', () => {
  const valid = runState();
  assert.equal(protocol.isBoundedDungeonRunState(valid), true);
  assert.equal(protocol.isBoundedDungeonRunState({ ...valid, schemaVersion: 2 }), false);
  assert.equal(protocol.isBoundedDungeonRunState({ ...valid, currentRoomId: 'room:missing' }), false);
  assert.equal(protocol.isBoundedDungeonRunState({
    ...valid,
    graph: { ...valid.graph, nodes: Array.from({ length: 33 }, (_, index) => ({
      ...valid.graph.nodes[0], id: `room:${index}`,
    })) },
  }), false);
  assert.equal(protocol.isBoundedDungeonRunState({ ...valid, failureReason: 'x'.repeat(300) }), false);
  assert.equal(protocol.RUN_SYNC_MAX_BYTES, 128 * 1024);
  assert.equal(protocol.isBoundedDungeonEncounterSnapshot(encounterSnapshot()), true);
  assert.equal(protocol.isBoundedDungeonEncounterSnapshot(encounterSnapshot({ hazards: Array(17).fill({}) })), false);
  assert.equal(protocol.isBoundedDungeonEncounterSnapshot(encounterSnapshot({
    activeActorIds: ['actor:host'], escapedActorIds: ['actor:guest'],
  })), false);
});

test('run_sync includes a bounded optional encounter snapshot and remains compatible when absent', () => {
  const host = protocol.createProtocolHarness(true);
  const state = runState();
  const encounter = encounterSnapshot();
  host.sendRunSync(state, encounter);
  assert.deepEqual(host.socket.emitted[0], {
    event: 'run_sync',
    payload: {
      protocolVersion: protocol.RUN_SYNC_PROTOCOL_VERSION,
      runState: state,
      encounterSnapshot: encounter,
    },
  });

  host.sendRunSync(state, encounterSnapshot({ schemaVersion: 2 }));
  assert.equal(host.socket.emitted.length, 1, 'invalid encounter state is rejected before transport');
});

test('client methods enforce host/guest direction and emit versioned bounded packets', () => {
  const state = runState();
  const host = protocol.createProtocolHarness(true);
  host.sendRunSync(state);
  assert.deepEqual(host.socket.emitted[0], {
    event: 'run_sync',
    payload: { protocolVersion: protocol.RUN_SYNC_PROTOCOL_VERSION, runState: state },
  });
  host.sendCombatDefense({ intentId: 'intent:1', sourceEnemyId: 'enemy:1', outcome: 'parry' });
  assert.equal(host.socket.emitted.length, 1, 'host cannot originate a guest defence result');

  const guest = protocol.createProtocolHarness(false);
  guest.sendRunSync(state);
  assert.equal(guest.socket.emitted.length, 0, 'guest cannot originate run state');
  guest.sendCombatDefense({ intentId: 'intent:1', sourceEnemyId: 'enemy:1', outcome: 'perfect-dodge' });
  assert.deepEqual(guest.socket.emitted[0], {
    event: 'combat_defense',
    payload: { intentId: 'intent:1', sourceEnemyId: 'enemy:1', outcome: 'perfect-dodge' },
  });
  guest.sendCombatDefense({ intentId: '../unsafe', sourceEnemyId: 'enemy:1', outcome: 'dodge' });
  assert.equal(guest.socket.emitted.length, 1, 'unsafe ids are rejected before transport');
});

test('full_sync carries optional run state and tactical enemy fields without world-Y mutation', () => {
  const host = protocol.createProtocolHarness(true);
  const state = runState();
  const enemy = {
    id: 'enemy:shield:1', name: 'Shield Guard', type: 'elite', icon: '', color: '#fff',
    maxHp: 500, hp: 400, atk: 30, def: 20, speed: 3, expReward: 1, goldReward: 1,
    width: 40, height: 50, attackRange: 80, attackCooldown: 2, attackTimer: 1,
    x: 250, y: 175, vx: 0, vy: 0, isGrounded: true, facing: -1, isAttacking: true,
    isActive: true, spawnDelay: 0, hitStun: 0, isDead: false,
    role: 'shield-tank', formationId: 'shield-wall', formationSlotId: 'tank-a',
    eliteModifiers: ['bulwark'], guardState: { guard: 80, maxGuard: 120 },
    attackProfileId: 'shield-bash', intentSequence: 4, roleActionCooldown: 1.25,
    attackIntent: {
      intentId: 'intent:4', profileId: 'shield-bash', sourceEnemyId: 'enemy:shield:1',
      sourceX: 250, sourceY: 175, facing: -1, target: { actorId: 'actor:guest', x: 180, y: 175 },
      elapsed: 0.2, sceneEpoch: 2, hasResolved: false,
    },
    bossCastName: 'Guard Crush', bossCastTimer: 0.4, bossCastDuration: 0.8,
  };

  host.sendFullSync({
    waveIndex: 2,
    dungeonIndex: 0,
    dungeonId: 'goblin_catacombs',
    enemies: [enemy],
    runState: state,
    encounterSnapshot: encounterSnapshot(),
  });
  const sent = host.socket.emitted[0];
  assert.equal(sent.event, 'full_sync');
  assert.equal(sent.payload.runState.revision, 3);
  assert.equal(sent.payload.encounterSnapshot.eventSequence, 4);
  assert.equal(sent.payload.enemies[0].y, 75);
  assert.equal(enemy.y, 175, 'serialization must not mutate host world coordinates');
  assert.deepEqual(sent.payload.enemies[0].eliteModifiers, ['bulwark']);
  assert.equal(sent.payload.enemies[0].guardState.guard, 80);
  assert.equal(sent.payload.enemies[0].attackIntent.intentId, 'intent:4');
  assert.equal(sent.payload.enemies[0].attackIntent.sourceY, 75);
  assert.equal(sent.payload.enemies[0].attackIntent.target.y, 75);
  assert.equal(sent.payload.enemies[0].roleActionCooldown, 1.25);
  assert.equal(sent.payload.enemies[0].bossCastName, 'Guard Crush');
});
