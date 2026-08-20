import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';
import { io } from 'socket.io-client';

const PORT = 34000 + Math.floor(Math.random() * 1000);
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
  throw new Error('player-damage test backend did not start');
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

function waitFor(socket, event, timeout = 1500) {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve(null);
    }, timeout);
    const handler = payload => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, handler);
  });
}

function identity(label) {
  return {
    uuid: `pd_uuid_${label}`,
    actorId: `pd_actor_${label}`,
    name: `Hero${label}`,
    shortId: `PD${label}`.toUpperCase().slice(0, 16),
  };
}

async function register(socket, who) {
  socket.emit('register_player', who);
  await delay(40);
}

before(async () => {
  backend = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      AUTH_REQUIRED: 'false',
      SESSION_SECRET: 'player-damage-integration-secret',
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

test('only the room host can send bounded damage to one same-scene guest', async () => {
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
    const lobbyReady = waitFor(host, 'lobby_update');
    host.emit('create_lobby', { ...H, dungeonId: 'goblin_catacombs' });
    const roomId = (await lobbyReady)?.roomId;
    assert.ok(roomId);

    await register(guest, G);
    await register(observer, O);
    guest.emit('accept_invite', { ...G, roomId });
    observer.emit('accept_invite', { ...O, roomId });
    await delay(120);
    guest.emit('lobby_ready', { ready: true });
    observer.emit('lobby_ready', { ready: true });
    await delay(80);

    const hostStart = waitFor(host, 'dungeon_start');
    const guestStart = waitFor(guest, 'dungeon_start');
    const observerStart = waitFor(observer, 'dungeon_start');
    host.emit('lobby_start');
    assert.equal((await hostStart)?.isHost, true);
    assert.equal((await guestStart)?.isHost, false);
    assert.equal((await observerStart)?.isHost, false);

    await register(outsider, X);
    const outsideLobby = waitFor(outsider, 'lobby_update');
    outsider.emit('create_lobby', { ...X, dungeonId: 'undead_crypt' });
    assert.ok((await outsideLobby)?.roomId);

    const move = (socket, x) => socket.emit('player_move', {
      classId: 'warrior',
      x,
      y: 0,
      facing: 1,
      isGrounded: true,
      isTownMode: false,
      sceneId: 'goblin_catacombs',
    });
    move(host, 100);
    move(guest, 180);
    move(observer, 260);
    await delay(80);

    const validPacket = {
      targetSocketId: guest.id,
      hitId: 'pd_valid_hit_1',
      rawDamage: 125.5,
      sourceX: 100,
      knockbackDir: 1,
      isTownMode: false,
      sceneId: 'goblin_catacombs',
      status: { kind: 'poison', duration: 4, magnitude: 0.1, tickInterval: 1, rawTickDamage: 8 },
      parryability: 'parryable',
      intentId: 'intent:pd:valid:1',
      sourceEnemyId: 'enemy:pd:melee:1',
      profileId: 'melee-light',
    };
    const delivered = waitFor(guest, 'player_damage');
    const leaked = waitFor(observer, 'player_damage', 300);
    host.emit('player_damage', validPacket);
    const received = await delivered;
    assert.equal(received?.hitId, validPacket.hitId);
    assert.equal(received?.rawDamage, validPacket.rawDamage);
    assert.equal(received?.sceneId, 'goblin_catacombs');
    assert.equal(received?.status?.kind, 'poison');
    assert.equal(received?.parryability, 'parryable');
    assert.equal(received?.intentId, 'intent:pd:valid:1');
    assert.equal(received?.sourceEnemyId, 'enemy:pd:melee:1');
    assert.equal(received?.profileId, 'melee-light');
    assert.equal(await leaked, null, 'non-target party members must not receive the hit');

    const forged = waitFor(observer, 'player_damage', 300);
    guest.emit('player_damage', { ...validPacket, targetSocketId: observer.id, hitId: 'pd_guest_forgery' });
    assert.equal(await forged, null, 'a guest cannot forge enemy damage');

    const crossRoom = waitFor(outsider, 'player_damage', 300);
    host.emit('player_damage', { ...validPacket, targetSocketId: outsider.id, hitId: 'pd_cross_room' });
    assert.equal(await crossRoom, null, 'a host cannot target a socket in another room');

    const invalidTarget = waitFor(guest, 'player_damage', 300);
    host.emit('player_damage', { ...validPacket, targetSocketId: 'missing_socket', hitId: 'pd_missing_target' });
    assert.equal(await invalidTarget, null, 'invalid target ids are rejected');

    const duplicate = waitFor(guest, 'player_damage', 300);
    host.emit('player_damage', { ...validPacket, rawDamage: 999 });
    assert.equal(await duplicate, null, 'a hit id can only be relayed once');

    guest.emit('player_move', {
      classId: 'warrior', x: 180, y: 0, facing: 1,
      isGrounded: true, isTownMode: true, sceneId: 'town',
    });
    await delay(60);
    const crossScene = waitFor(guest, 'player_damage', 300);
    host.emit('player_damage', { ...validPacket, hitId: 'pd_cross_scene' });
    assert.equal(await crossScene, null, 'town/dungeon scene mismatch is rejected');

    move(guest, 180);
    await delay(60);
    const invalidStatus = waitFor(guest, 'player_damage', 300);
    host.emit('player_damage', {
      ...validPacket,
      hitId: 'pd_invalid_status',
      status: { kind: 'godmode', duration: 999, magnitude: 99 },
    });
    assert.equal(await invalidStatus, null, 'non-allowlisted status payloads are rejected');

    const partialIntent = waitFor(guest, 'player_damage', 300);
    host.emit('player_damage', {
      ...validPacket,
      hitId: 'pd_partial_intent',
      profileId: undefined,
    });
    assert.equal(await partialIntent, null, 'partial or unknown enemy intent metadata is rejected');
  } finally {
    host.close();
    guest.close();
    observer.close();
    outsider.close();
  }
});
