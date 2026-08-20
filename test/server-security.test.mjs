import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { io } from 'socket.io-client';

const PORT = 32000 + Math.floor(Math.random() * 1000);
const URL = `http://127.0.0.1:${PORT}`;
const ALLOWED_ORIGIN = 'https://game.test';
const TEST_SESSION_SECRET = 'integration-test-secret-that-is-long-and-stable';
let backend;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitUntilReady() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(URL);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await delay(50);
  }
  throw new Error('security test backend did not start');
}

async function json(path, { method = 'GET', token, body, origin } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  const response = await fetch(`${URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await response.json(); } catch { /* an intentionally rejected CORS request may be text */ }
  return { response, data };
}

async function createAccount(suffix) {
  const account = {
    username: `Hero${suffix}`,
    shortId: `H${suffix}`.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12),
    uuid: `account_${suffix}`.replace(/[^A-Za-z0-9_-]/g, '_'),
  };
  const result = await json('/api/register_guest', { method: 'POST', body: account });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.success, true);
  assert.ok(result.data.password);
  assert.ok(result.data.token);
  return { ...account, password: result.data.password, token: result.data.token };
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(URL, {
      forceNew: true,
      reconnection: false,
      auth: token ? { token } : {},
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('socket connect timed out'));
    }, 3000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', error => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
  });
}

function signTestSession({ uuid, name, shortId }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ sub: uuid, name, shortId, iat: now, exp: now + 3600 })).toString('base64url');
  const signature = createHmac('sha256', TEST_SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function waitFor(socket, event, timeout = 1500) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), timeout);
    socket.once(event, payload => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

before(async () => {
  backend = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      AUTH_REQUIRED: 'true',
      SESSION_SECRET: TEST_SESSION_SECRET,
      CORS_ORIGINS: ALLOWED_ORIGIN,
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

test('guest credentials are returned once, passwords are hashed, and login issues a session', async () => {
  const account = await createAccount('AUTH01');

  const duplicate = await json('/api/register_guest', {
    method: 'POST',
    body: { username: account.username, shortId: account.shortId, uuid: account.uuid },
  });
  assert.equal(duplicate.response.status, 409);
  assert.equal(Object.hasOwn(duplicate.data, 'password'), false);

  const wrong = await json('/api/login', {
    method: 'POST',
    body: { username: account.username, password: 'wrong-password' },
  });
  assert.equal(wrong.response.status, 401);

  const login = await json('/api/login', {
    method: 'POST',
    body: { username: account.username, password: account.password },
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.data.uuid, account.uuid);
  assert.ok(login.data.token);

  const source = readFileSync('server/index.js', 'utf8');
  assert.match(source, /crypto\.scrypt/);
  assert.doesNotMatch(source, /SELECT \* FROM users WHERE username = \$1 AND password = \$2/);
});

test('unsafe display names are rejected at account and socket boundaries', async () => {
  for (const [index, username] of ['<img src=x>', 'Bad&Name', 'Bad`Name'].entries()) {
    const result = await json('/api/register_guest', {
      method: 'POST',
      body: { username, shortId: `EVIL${index}`, uuid: `unsafe_name_${index}` },
    });
    assert.equal(result.response.status, 400);
  }

  // Defence in depth for old/forged signed claims: socket registration uses
  // the same display-name policy instead of trusting a token string blindly.
  const unsafeToken = signTestSession({
    uuid: 'unsafe_socket_account',
    name: '<svg onload=alert(1)>',
    shortId: 'EVIL99',
  });
  const socket = await connectSocket(unsafeToken);
  const rejected = waitFor(socket, 'protocol_error');
  socket.emit('register_player', {
    uuid: 'unsafe_socket_account',
    actorId: 'actor_unsafe_socket',
    name: 'SafeFallback',
    shortId: 'EVIL99',
  });
  assert.equal((await rejected)?.reason, 'invalid_identity');
  socket.close();
});

test('save/load and socket identity require and enforce the signed account session', async () => {
  const account = await createAccount('SAVE01');
  const otherUuid = 'account_someone_else';

  const anonymousSave = await json('/api/save', {
    method: 'POST',
    body: { uuid: account.uuid, saveData: { playerState: {} } },
  });
  assert.equal(anonymousSave.response.status, 401);

  const crossAccount = await json('/api/save', {
    method: 'POST',
    token: account.token,
    body: { uuid: otherUuid, saveData: { playerState: {} } },
  });
  assert.equal(crossAccount.response.status, 403);

  const ownSave = await json('/api/save', {
    method: 'POST',
    token: account.token,
    body: { uuid: account.uuid, saveData: { playerState: { level: 4 } }, power: 100, level: 4 },
  });
  assert.equal(ownSave.response.status, 200);

  const anonymousLoad = await json(`/api/load/${account.uuid}`);
  assert.equal(anonymousLoad.response.status, 401);
  const crossLoad = await json(`/api/load/${otherUuid}`, { token: account.token });
  assert.equal(crossLoad.response.status, 403);
  const ownLoad = await json(`/api/load/${account.uuid}`, { token: account.token });
  assert.equal(ownLoad.response.status, 200);
  assert.equal(ownLoad.data.saveData.playerState.level, 4);

  await assert.rejects(connectSocket(null), /Authentication required/);
  const authenticated = await connectSocket(account.token);
  authenticated.emit('register_player', {
    // A signed socket cannot change accounts by lying in register_player.
    uuid: otherUuid,
    actorId: 'actor_identity_check',
    name: 'Impostor',
    shortId: 'FAKE01',
  });
  authenticated.emit('create_lobby', {
    uuid: otherUuid,
    actorId: 'actor_identity_check',
    name: 'Impostor',
    shortId: 'FAKE01',
    dungeonId: 'goblin_catacombs',
  });
  const lobby = await waitFor(authenticated, 'lobby_state');
  assert.ok(lobby);
  assert.equal(lobby.members[0].name, account.username);
  assert.notEqual(lobby.members[0].uuid, account.uuid);
  authenticated.close();
});

test('CORS is an exact allowlist', async () => {
  const allowed = await json('/', { origin: ALLOWED_ORIGIN });
  assert.equal(allowed.response.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);

  const production = await json('/', { origin: 'https://rpg-game-three.vercel.app' });
  assert.equal(
    production.response.headers.get('access-control-allow-origin'),
    'https://rpg-game-three.vercel.app'
  );

  const preview = await json('/', { origin: 'https://rpg-game-three-fix-login-4tvon.vercel.app' });
  assert.equal(
    preview.response.headers.get('access-control-allow-origin'),
    'https://rpg-game-three-fix-login-4tvon.vercel.app'
  );

  const denied = await json('/', { origin: 'https://evil.test' });
  assert.notEqual(denied.response.headers.get('access-control-allow-origin'), 'https://evil.test');
});

test('guest registration preflight returns the browser CORS contract', async () => {
  const origin = 'https://rpg-game-three.vercel.app';
  const response = await fetch(`${URL}/api/register_guest`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.match(response.headers.get('access-control-allow-methods') || '', /POST/);
  assert.match(response.headers.get('access-control-allow-headers') || '', /Content-Type/i);
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
});

test('dungeon requirements are canonical and unknown dungeon ids are rejected', async () => {
  const dungeonSource = readFileSync('src/sideview/dungeons/DungeonManager.ts', 'utf8');
  const serverSource = readFileSync('server/index.js', 'utf8');
  const gameRequirements = Object.fromEntries(
    [...dungeonSource.matchAll(/\bid:\s*'([^']+)'[\s\S]{0,800}?\bminLevel:\s*(\d+)/g)]
      .map(match => [match[1], Number(match[2])])
  );
  const serverBlock = /DUNGEON_MIN_LEVELS = Object\.freeze\(\{([\s\S]*?)\}\)/.exec(serverSource)?.[1] || '';
  const serverRequirements = Object.fromEntries(
    [...serverBlock.matchAll(/^\s*([a-z0-9_]+):\s*(\d+),?$/gm)]
      .map(match => [match[1], Number(match[2])])
  );
  assert.deepEqual(serverRequirements, gameRequirements);

  const account = await createAccount('ZONE01');
  const host = await connectSocket(account.token);
  const observer = await connectSocket(account.token);
  const hostIdentity = {
    uuid: account.uuid,
    actorId: 'actor_zone_host',
    name: account.username,
    shortId: account.shortId,
    level: 20,
  };
  const observerIdentity = { ...hostIdentity, actorId: 'actor_zone_observer' };
  host.emit('register_player', hostIdentity);
  observer.emit('register_player', observerIdentity);

  const invalid = waitFor(host, 'lobby_error');
  const invalidLobby = waitFor(host, 'lobby_update', 250);
  host.emit('create_lobby', { ...hostIdentity, dungeonId: 'client_invented_zone', minLevel: 1 });
  assert.match((await invalid)?.msg || '', /invalid dungeon/i);
  assert.equal(await invalidLobby, null);

  const dragonLobby = waitFor(host, 'lobby_update');
  host.emit('create_lobby', { ...hostIdentity, dungeonId: 'dragon_lair', minLevel: 1 });
  const dragonRoom = await dragonLobby;
  observer.emit('browse_lobbies');
  const dragonList = await waitFor(observer, 'lobby_list');
  assert.equal(dragonList?.lobbies?.find(room => room.roomId === dragonRoom.roomId)?.minLevel, 9);

  const endlessLobby = waitFor(host, 'lobby_update');
  host.emit('create_lobby', { ...hostIdentity, dungeonId: 'endless_arena', minLevel: 1 });
  const endlessRoom = await endlessLobby;
  observer.emit('browse_lobbies');
  const endlessList = await waitFor(observer, 'lobby_list');
  assert.equal(endlessList?.lobbies?.find(room => room.roomId === endlessRoom.roomId)?.minLevel, 16);

  host.close();
  observer.close();
});

test('host authority migrates immediately while the disconnected actor retains its slot', async () => {
  const account = await createAccount('MIGR01');
  const host = await connectSocket(account.token);
  const guest = await connectSocket(account.token);
  const hostIdentity = {
    uuid: account.uuid,
    actorId: 'actor_migration_host',
    name: account.username,
    shortId: account.shortId,
    level: 10,
  };
  const guestIdentity = { ...hostIdentity, actorId: 'actor_migration_guest' };
  host.emit('register_player', hostIdentity);
  guest.emit('register_player', guestIdentity);

  const created = waitFor(host, 'lobby_update');
  host.emit('create_lobby', { ...hostIdentity, dungeonId: 'goblin_catacombs' });
  const lobby = await created;
  guest.emit('accept_invite', { ...guestIdentity, roomId: lobby.roomId });
  await waitFor(guest, 'lobby_state');
  guest.emit('lobby_ready', { ready: true });
  await delay(50);
  const started = waitFor(guest, 'dungeon_start');
  host.emit('lobby_start');
  assert.equal((await started)?.isHost, false);

  const promoted = waitFor(guest, 'role_assign', 1000);
  host.close();
  assert.equal((await promoted)?.isHost, true);

  const returningHost = await connectSocket(account.token);
  const rejoined = waitFor(returningHost, 'room_rejoined');
  returningHost.emit('register_player', hostIdentity);
  const rejoinState = await rejoined;
  assert.equal(rejoinState?.roomId, lobby.roomId);
  assert.equal(rejoinState?.isHost, false);

  const receivesNewAuthority = waitFor(returningHost, 'enemy_sync');
  guest.emit('enemy_sync', { enemies: [{ id: 'e_after_migration' }], waveIndex: 2 });
  assert.equal((await receivesNewAuthority)?.enemies?.[0]?.id, 'e_after_migration');

  guest.close();
  returningHost.close();
});

test('per-device actors, host authority, room isolation, payload bounds, and voice isolation hold', async () => {
  const shared = await createAccount('COOP01');
  const outsider = await createAccount('COOP02');
  const host = await connectSocket(shared.token);
  const guest = await connectSocket(shared.token);
  const other = await connectSocket(outsider.token);

  const hostIdentity = {
    uuid: shared.uuid,
    actorId: 'actor_shared_pc',
    name: shared.username,
    shortId: shared.shortId,
    level: 10,
  };
  const guestIdentity = { ...hostIdentity, actorId: 'actor_shared_phone' };
  const otherIdentity = {
    uuid: outsider.uuid,
    actorId: 'actor_outsider_pc',
    name: outsider.username,
    shortId: outsider.shortId,
    level: 10,
  };
  host.emit('register_player', hostIdentity);
  guest.emit('register_player', guestIdentity);
  other.emit('register_player', otherIdentity);

  host.emit('create_lobby', { ...hostIdentity, dungeonId: 'goblin_catacombs', minLevel: 1 });
  const hostLobby = await waitFor(host, 'lobby_update');
  assert.ok(hostLobby?.roomId);
  guest.emit('accept_invite', { ...guestIdentity, roomId: hostLobby.roomId });
  const sharedRoster = await waitFor(guest, 'lobby_state');
  assert.equal(sharedRoster.members.length, 2);
  assert.equal(new Set(sharedRoster.members.map(member => member.actorId)).size, 2);

  guest.emit('lobby_ready', { ready: true });
  await delay(50);
  const guestStart = waitFor(guest, 'dungeon_start');
  host.emit('lobby_start');
  assert.equal((await guestStart)?.isHost, false);

  // Host-only world state cannot be forged by a guest.
  const forgedEnemySync = waitFor(host, 'enemy_sync', 250);
  guest.emit('enemy_sync', { enemies: [{ id: 'forged' }], waveIndex: 3 });
  assert.equal(await forgedEnemySync, null);
  const forgedHit = waitFor(host, 'enemy_hit', 250);
  guest.emit('enemy_hit', { enemyId: 'e1', damage: 999, isCrit: true, knockbackDir: 1, newHp: 0 });
  assert.equal(await forgedHit, null);
  const forgedNext = waitFor(host, 'party_next_dungeon', 250);
  guest.emit('party_next_dungeon', { dungeonId: 'void', dungeonIndex: 9 });
  assert.equal(await forgedNext, null);

  const realEnemyId = 'enemy_0_Goblin Warrior_0_123';
  const authoritative = waitFor(guest, 'enemy_sync');
  host.emit('enemy_sync', { enemies: [{ id: realEnemyId, hp: 10 }], waveIndex: 0, dungeonIndex: 0, dungeonId: 'goblin_catacombs' });
  assert.equal((await authoritative)?.enemies[0].id, realEnemyId);
  const damageIntent = waitFor(host, 'damage_enemy');
  guest.emit('damage_enemy', { enemyId: realEnemyId, damage: 12, facing: 1 });
  assert.equal((await damageIntent)?.enemyId, realEnemyId);

  // Invalid movement never crosses the room, while a bounded packet does.
  const invalidMove = waitFor(host, 'remote_player_move', 250);
  guest.emit('player_move', { x: 999_999_999, y: 0, facing: 1 });
  assert.equal(await invalidMove, null);
  const validMove = waitFor(host, 'remote_player_move');
  guest.emit('player_move', { classId: 'warrior', x: 20, y: -10, facing: -1, isGrounded: true });
  assert.equal((await validMove)?.x, 20);

  other.emit('create_lobby', { ...otherIdentity, dungeonId: 'undead_crypt', minLevel: 1 });
  const otherLobby = await waitFor(other, 'lobby_update');
  assert.ok(otherLobby?.roomId);

  // A second invite is rejected instead of leaving the socket subscribed to
  // two rooms at once; the original host can still reach the guest afterwards.
  const inviteError = waitFor(guest, 'invite_error');
  guest.emit('accept_invite', { ...guestIdentity, roomId: otherLobby.roomId });
  assert.match((await inviteError)?.msg || '', /current party/i);
  const stillTogether = waitFor(guest, 'enemy_sync');
  host.emit('enemy_sync', { enemies: [{ id: 'e2' }], waveIndex: 1 });
  assert.equal((await stillTogether)?.enemies[0].id, 'e2');

  host.emit('voice_join');
  guest.emit('voice_join');
  other.emit('voice_join');
  await delay(50);
  const crossRoomSignal = waitFor(other, 'voice_signal', 250);
  guest.emit('voice_signal', { to: other.id, signal: { sdp: 'must-not-cross' } });
  assert.equal(await crossRoomSignal, null);

  const sameRoomSignal = waitFor(host, 'voice_signal');
  guest.emit('voice_signal', { to: host.id, signal: { sdp: 'same-room' } });
  assert.equal((await sameRoomSignal)?.signal.sdp, 'same-room');

  // Replacing the same actor retires the old socket render key immediately,
  // while preserving its room membership for the new connection.
  const oldGuestSocketId = guest.id;
  const replacement = await connectSocket(shared.token);
  const oldKeyRemoved = waitFor(host, 'player_left');
  const oldSessionReplaced = waitFor(guest, 'session_replaced');
  const roomRejoined = waitFor(replacement, 'room_rejoined');
  replacement.emit('register_player', guestIdentity);
  assert.equal((await oldKeyRemoved)?.socketId, oldGuestSocketId);
  assert.ok(await oldSessionReplaced);
  assert.equal((await roomRejoined)?.roomId, hostLobby.roomId);

  host.close();
  guest.close();
  replacement.close();
  other.close();
});

test('party support relays canonical cleanse and rejects unsafe heal or buff payloads', async () => {
  const account = await createAccount('SUPP01');
  const host = await connectSocket(account.token);
  const guest = await connectSocket(account.token);
  const hostIdentity = {
    uuid: account.uuid,
    actorId: 'actor_support_host',
    name: account.username,
    shortId: account.shortId,
    level: 10,
  };
  const guestIdentity = { ...hostIdentity, actorId: 'actor_support_guest' };
  host.emit('register_player', hostIdentity);
  guest.emit('register_player', guestIdentity);

  const created = waitFor(host, 'lobby_update');
  host.emit('create_lobby', { ...hostIdentity, dungeonId: 'goblin_catacombs' });
  const lobby = await created;
  guest.emit('accept_invite', { ...guestIdentity, roomId: lobby.roomId });
  await waitFor(guest, 'lobby_state');

  const cleanse = waitFor(guest, 'remote_party_support');
  host.emit('party_support', { kind: 'cleanse', count: 1 });
  const cleansePayload = await cleanse;
  assert.deepEqual(
    { kind: cleansePayload?.kind, count: cleansePayload?.count },
    { kind: 'cleanse', count: 1 },
  );

  const percentHeal = waitFor(guest, 'remote_party_support');
  host.emit('party_support', { kind: 'heal', percent: 0.45, targetSocketId: guest.id });
  const percentHealPayload = await percentHeal;
  assert.deepEqual(
    {
      kind: percentHealPayload?.kind,
      percent: percentHealPayload?.percent,
      targetSocketId: percentHealPayload?.targetSocketId,
    },
    { kind: 'heal', percent: 0.45, targetSocketId: guest.id },
  );

  const skillRevive = waitFor(guest, 'remote_party_support');
  host.emit('party_support', { kind: 'revive', percent: 0.45, targetSocketId: guest.id });
  const revivePayload = await skillRevive;
  assert.deepEqual(
    { kind: revivePayload?.kind, percent: revivePayload?.percent },
    { kind: 'revive', percent: 0.45 },
  );

  const hugeHeal = waitFor(guest, 'remote_party_support', 250);
  host.emit('party_support', { kind: 'heal', amount: 1_000_000 });
  assert.equal(await hugeHeal, null);

  const forgedBuff = waitFor(guest, 'remote_party_support', 250);
  host.emit('party_support', { kind: 'buff', stat: 'godMode', multiplier: 100, duration: 3600 });
  assert.equal(await forgedBuff, null);

  host.close();
  guest.close();
});

test('browser auth wiring stores and sends the session token', () => {
  const entry = readFileSync('src/standalone.ts', 'utf8');
  const save = readFileSync('src/sideview/engine/SaveManager.ts', 'utf8');
  const network = readFileSync('src/sideview/network/NetworkManager.ts', 'utf8');
  assert.match(entry, /playerSessionToken/);
  assert.match(save, /Authorization: `Bearer \$\{sessionToken\}`/);
  assert.match(network, /auth: token \? \{ token \} : \{\}/);
  assert.match(network, /multiplayerActorId/);
});

test('authentication endpoints throttle repeated attempts', async () => {
  let limited = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = await json('/api/login', {
      method: 'POST',
      body: { username: 'NoSuchAccount', password: `wrong-${attempt}` },
    });
    if (result.response.status === 429) {
      limited = result;
      break;
    }
  }
  assert.ok(limited, 'login attempts should eventually be rate limited');
  assert.ok(Number(limited.response.headers.get('retry-after')) >= 1);
});
