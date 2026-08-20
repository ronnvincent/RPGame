import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';
import { io } from 'socket.io-client';

const PORT = 35000 + Math.floor(Math.random() * 1000);
const URL = `http://127.0.0.1:${PORT}`;
let backend;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitUntilReady() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(URL);
      if (response.ok) return;
    } catch { /* backend is still starting */ }
    await delay(40);
  }
  throw new Error('combat protocol test backend did not start');
}

function connect() {
  return new Promise((resolve, reject) => {
    const socket = io(URL, { forceNew: true, reconnection: false });
    const timer = setTimeout(() => reject(new Error('socket connect timed out')), 3000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', reject);
  });
}

function waitFor(socket, event, timeout = 1200) {
  return new Promise(resolve => {
    const handler = payload => {
      clearTimeout(timer);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve(null);
    }, timeout);
    socket.once(event, handler);
  });
}

function identity(label) {
  return {
    uuid: `cp_uuid_${label}`,
    actorId: `cp_actor_${label}`,
    name: `Hero${label}`,
    shortId: `CP${label}`.toUpperCase().slice(0, 16),
  };
}

async function register(socket, who) {
  socket.emit('register_player', who);
  await delay(35);
}

function runState(actorIds, overrides = {}) {
  return {
    schemaVersion: 1,
    contentVersion: '1.0.0',
    runId: 'run:network:00000001',
    dungeonId: 'goblin_catacombs',
    seed: 1,
    authorityEpoch: 1,
    revision: 7,
    lastCommandSequence: 6,
    elapsedMs: 2500,
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

function encounterSnapshot(actorIds, overrides = {}) {
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
    worldObjects: [], hazards: [], routeProps: [], escort: null,
    activeActorIds: actorIds,
    escapedActorIds: [],
    knownEnemyIds: ['enemy:1'],
    defeatedEnemyIds: [],
    spawnsSealed: false,
    pendingExplosions: [],
    ...overrides,
  };
}

before(async () => {
  backend = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      AUTH_REQUIRED: 'false',
      SESSION_SECRET: 'combat-protocol-integration-secret',
      CORS_ORIGINS: 'http://localhost:3000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  await waitUntilReady();
});

after(async () => {
  if (!backend || backend.killed) return;
  backend.kill();
  await Promise.race([
    new Promise(resolve => backend.once('exit', resolve)),
    delay(1000),
  ]);
});

test('run snapshots are host-only/versioned/bounded and combat defence is guest-only/server-stamped', async () => {
  const host = await connect();
  const guest = await connect();
  const observer = await connect();
  const outsider = await connect();
  const H = identity('HOST');
  const G = identity('GUEST');
  const O = identity('WATCH');
  const X = identity('OTHER');

  try {
    await register(host, H);
    const created = waitFor(host, 'lobby_update');
    host.emit('create_lobby', { ...H, dungeonId: 'goblin_catacombs' });
    const roomId = (await created)?.roomId;
    assert.ok(roomId);

    await register(guest, G);
    await register(observer, O);
    guest.emit('accept_invite', { ...G, roomId });
    observer.emit('accept_invite', { ...O, roomId });
    await delay(120);
    guest.emit('lobby_ready', { ready: true });
    observer.emit('lobby_ready', { ready: true });
    await delay(80);
    const guestStart = waitFor(guest, 'dungeon_start');
    const observerStart = waitFor(observer, 'dungeon_start');
    host.emit('lobby_start');
    assert.equal((await guestStart)?.isHost, false);
    assert.equal((await observerStart)?.isHost, false);

    await register(outsider, X);
    const outsideCreated = waitFor(outsider, 'lobby_update');
    outsider.emit('create_lobby', { ...X, dungeonId: 'undead_crypt' });
    assert.ok((await outsideCreated)?.roomId);

    const state = runState([H.actorId, G.actorId, O.actorId]);
    const encounter = encounterSnapshot([H.actorId, G.actorId, O.actorId]);
    const guestRun = waitFor(guest, 'run_sync');
    const observerRun = waitFor(observer, 'run_sync');
    host.emit('run_sync', { protocolVersion: 1, runState: state, encounterSnapshot: encounter });
    const guestRunPacket = await guestRun;
    assert.equal(guestRunPacket?.runState?.revision, 7);
    assert.equal(guestRunPacket?.encounterSnapshot?.eventSequence, 4);
    assert.equal((await observerRun)?.protocolVersion, 1);

    const forgedRunAtHost = waitFor(host, 'run_sync', 250);
    guest.emit('run_sync', { protocolVersion: 1, runState: { ...state, revision: 999 } });
    assert.equal(await forgedRunAtHost, null, 'guest cannot author run state');

    const staleVersion = waitFor(guest, 'run_sync', 250);
    host.emit('run_sync', { protocolVersion: 2, runState: state });
    assert.equal(await staleVersion, null);

    const oversizedGraph = waitFor(guest, 'run_sync', 250);
    host.emit('run_sync', {
      protocolVersion: 1,
      runState: {
        ...state,
        graph: {
          ...state.graph,
          nodes: Array.from({ length: 33 }, (_, index) => ({
            ...state.graph.nodes[0], id: `room:${index}`,
          })),
        },
      },
    });
    assert.equal(await oversizedGraph, null);

    const mismatchedEncounter = waitFor(guest, 'run_sync', 250);
    host.emit('run_sync', {
      protocolVersion: 1,
      runState: state,
      encounterSnapshot: encounterSnapshot([H.actorId], {
        room: { id: 'room:forged', kind: 'combat', access: 'normal' },
      }),
    });
    assert.equal(await mismatchedEncounter, null, 'encounter room must match the authoritative run room');

    const request = waitFor(host, 'request_full_sync');
    guest.emit('request_full_sync');
    const requesterId = (await request)?.requesterId;
    assert.equal(requesterId, guest.id);
    const full = waitFor(guest, 'full_sync');
    host.emit('full_sync', {
      requesterId,
      waveIndex: 2,
      dungeonIndex: 0,
      dungeonId: 'goblin_catacombs',
      enemies: [{ id: 'enemy:1', hp: 50 }],
      runState: state,
      encounterSnapshot: encounter,
    });
    const fullPacket = await full;
    assert.equal(fullPacket?.runState?.runId, state.runId);
    assert.equal(fullPacket?.runState?.schemaVersion, 1);
    assert.equal(fullPacket?.encounterSnapshot?.room?.id, 'room:entry');

    const invalidRequest = waitFor(host, 'request_full_sync');
    guest.emit('request_full_sync');
    const invalidRequesterId = (await invalidRequest)?.requesterId;
    const invalidFull = waitFor(guest, 'full_sync', 250);
    host.emit('full_sync', {
      requesterId: invalidRequesterId,
      waveIndex: 2,
      dungeonIndex: 0,
      dungeonId: 'goblin_catacombs',
      enemies: [],
      runState: { ...state, schemaVersion: 2 },
    });
    assert.equal(await invalidFull, null, 'full_sync rejects an incompatible embedded run schema');

    const defenseAtHost = waitFor(host, 'combat_defense');
    const leakedDefense = waitFor(observer, 'combat_defense', 250);
    guest.emit('combat_defense', {
      intentId: 'intent:enemy:1:7',
      sourceEnemyId: 'enemy:1',
      outcome: 'perfect-dodge',
    });
    const defense = await defenseAtHost;
    assert.deepEqual(defense, {
      socketId: guest.id,
      intentId: 'intent:enemy:1:7',
      sourceEnemyId: 'enemy:1',
      outcome: 'perfect-dodge',
    });
    assert.equal(await leakedDefense, null, 'defence result is routed only to the host');

    const duplicate = waitFor(host, 'combat_defense', 250);
    guest.emit('combat_defense', {
      intentId: 'intent:enemy:1:7',
      sourceEnemyId: 'enemy:1',
      outcome: 'parry',
    });
    assert.equal(await duplicate, null, 'one guest can resolve an intent only once');

    const unsafe = waitFor(host, 'combat_defense', 250);
    guest.emit('combat_defense', {
      intentId: '../unsafe',
      sourceEnemyId: 'enemy:1',
      outcome: 'dodge',
    });
    assert.equal(await unsafe, null);

    const invalidOutcome = waitFor(host, 'combat_defense', 250);
    guest.emit('combat_defense', {
      intentId: 'intent:invalid-outcome',
      sourceEnemyId: 'enemy:1',
      outcome: 'invulnerable',
    });
    assert.equal(await invalidOutcome, null);

    const oversizedDefense = waitFor(host, 'combat_defense', 250);
    guest.emit('combat_defense', {
      intentId: 'intent:oversized',
      sourceEnemyId: 'enemy:1',
      outcome: 'dodge',
      padding: 'x'.repeat(1500),
    });
    assert.equal(await oversizedDefense, null);

    const hostCannotForge = waitFor(guest, 'combat_defense', 250);
    host.emit('combat_defense', {
      intentId: 'intent:host-forgery',
      sourceEnemyId: 'enemy:1',
      outcome: 'parry',
    });
    assert.equal(await hostCannotForge, null);

    const crossRoom = waitFor(host, 'combat_defense', 250);
    outsider.emit('combat_defense', {
      intentId: 'intent:outsider',
      sourceEnemyId: 'enemy:1',
      outcome: 'dodge',
    });
    assert.equal(await crossRoom, null);

    // Middleware rate limiting is independent from handler validation.
    await delay(1050);
    const defenseRateLimited = waitFor(guest, 'protocol_error');
    for (let index = 0; index < 35; index++) {
      guest.emit('combat_defense', {
        intentId: `intent:rate:${index}`,
        sourceEnemyId: 'enemy:1',
        outcome: 'dodge',
      });
    }
    assert.deepEqual(await defenseRateLimited, { event: 'combat_defense', reason: 'rate_limited' });

    await delay(1050);
    const runRateLimited = waitFor(host, 'protocol_error');
    for (let index = 0; index < 12; index++) {
      host.emit('run_sync', {
        protocolVersion: 1,
        runState: { ...state, revision: 20 + index },
      });
    }
    assert.deepEqual(await runRateLimited, { event: 'run_sync', reason: 'rate_limited' });
  } finally {
    host.close();
    guest.close();
    observer.close();
    outsider.close();
  }
});
