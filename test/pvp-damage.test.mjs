/**
 * REGRESSION TEST: one swing paints one number.
 *
 * A hit travels two ways: the authoritative `pvp_hit_received` packet (which
 * applies the defender's defence, shield and i-frames) and a `pvp_hit_effect`
 * broadcast for everyone watching. The server used to send the effect to the
 * target as well, so the defender saw the real -312 and a raw -400 stacked on
 * top of it. The relay fallback could also beat the real packet to the same
 * `hitId`, delivering the hit with no team and no position.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import { io } from 'socket.io-client';

const serverSource = readFileSync(new globalThis.URL('../server/index.js', import.meta.url), 'utf8');
const engineSource = readFileSync(
  new URL('../src/sideview/engine/SideViewEngine.ts', import.meta.url),
  'utf8',
);
const networkSource = readFileSync(
  new URL('../src/sideview/network/NetworkManager.ts', import.meta.url),
  'utf8',
);

const PORT = 3211;
const SERVER_URL = `http://localhost:${PORT}`;
const RUN = Math.random().toString(36).slice(2, 8);
const mk = n => ({
  uuid: `uuid-dmg-${RUN}-${n}`,
  actorId: `actor_dmg_${RUN}_${n}`,
  name: `Blade${n}`,
  shortId: `BD${RUN}${n}`.toUpperCase(),
  classId: 'warrior',
  level: 9,
});

const waitForPort = (port, timeoutMs = 15000) => new Promise((resolve, reject) => {
  const started = Date.now();
  const attempt = () => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(); });
    socket.once('error', () => {
      socket.destroy();
      if (Date.now() - started > timeoutMs) reject(new Error(`server never listened on ${port}`));
      else setTimeout(attempt, 120);
    });
  };
  attempt();
});

const connect = () => new Promise(resolve => {
  const socket = io(SERVER_URL, { forceNew: true, reconnection: false });
  socket.on('connect', () => resolve(socket));
});
const waitFor = (socket, event, ms = 2000) => new Promise(resolve => {
  const timer = setTimeout(() => resolve(null), ms);
  socket.once(event, data => { clearTimeout(timer); resolve(data); });
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Source guards: the shape of the fix must survive a refactor.
// ---------------------------------------------------------------------------
assert.match(
  serverSource,
  /\(targetSid \? effect\.except\(targetSid\) : effect\)\.emit\('pvp_hit_effect'/,
  'the target must be excluded from the cosmetic effect broadcast',
);
assert.match(
  serverSource,
  /io\.to\(targetSid\)\.emit\('pvp_hit_received'/,
  'the authoritative packet still goes to the target',
);
assert.match(
  engineSource,
  /if \(packet\.targetActorId && packet\.targetActorId === network\.getActorId\(\)\) return;/,
  'a client must ignore an effect addressed to its own player',
);
assert.match(
  networkSource,
  /private markPvpHitDelivered\(hitId: string\): void \{/,
  'a delivered hit is remembered through one helper',
);
assert.match(
  networkSource,
  /on\('pvp_hit_received'[\s\S]{0,240}this\.markPvpHitDelivered\(hitId\)/,
  'the real packet claims the hitId',
);
assert.match(
  networkSource,
  /pendingPvpFallbacks\.set\(hitId, timer\)/,
  'the fallback waits for the real packet first',
);

// ---------------------------------------------------------------------------
// Live protocol.
// ---------------------------------------------------------------------------
const server = spawn(process.execPath, ['server/index.js'], {
  cwd: new globalThis.URL('..', import.meta.url),
  env: { ...process.env, PORT: String(PORT), DATABASE_URL: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', chunk => { serverLog += chunk.toString(); });
server.stderr.on('data', chunk => { serverLog += chunk.toString(); });

let host = null;
let guest = null;
let failures = 0;
const check = (label, condition) => {
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}`);
  if (!condition) failures += 1;
};

try {
  await waitForPort(PORT);

  const hostInfo = mk(1);
  const guestInfo = mk(2);

  host = await connect();
  host.emit('register_player', hostInfo);
  const lobbyState = waitFor(host, 'lobby_state');
  host.emit('create_lobby', {
    dungeonId: 'tournament_colosseum',
    isPvp: true,
    pvpFormat: '1v1',
    ...hostInfo,
  });
  const state = await lobbyState;
  assert.ok(state?.roomCode, 'the host could open a Colosseum lobby');

  guest = await connect();
  guest.emit('register_player', guestInfo);
  await sleep(150);
  const joined = waitFor(host, 'lobby_state');
  guest.emit('accept_invite', { roomId: state.roomCode, ...guestInfo });
  await joined;
  guest.emit('lobby_ready', { ready: true });
  await sleep(200);

  const started = waitFor(host, 'dungeon_start');
  host.emit('lobby_start');
  await started;

  const hits = [];
  const effects = [];
  const guestHits = [];
  const relays = [];
  host.on('pvp_hit_received', data => hits.push(data));
  host.on('pvp_hit_effect', data => effects.push(data));
  host.on('remote_party_support', data => relays.push(data));
  guest.on('pvp_hit_received', data => guestHits.push(data));

  guest.emit('pvp_attack_hit', {
    targetSocketId: host.id,
    targetActorId: hostInfo.actorId,
    damage: 400,
    isCrit: false,
    skillName: 'Test Slash',
    hitX: 320,
    hitY: 410,
    hitId: `probe_${RUN}`,
  });
  await sleep(400);

  check('the defender gets exactly one authoritative hit', hits.length === 1);
  check('the hit carries the attacker team', hits[0]?.attackerTeam === 'blue');
  check('the hit names the attacker', hits[0]?.attackerActorId === guestInfo.actorId);
  check('the hit carries the damage the attacker rolled', hits[0]?.damage === 400);
  check('the hit echo is not painted at the defender', effects.length === 0);
  check('the attacker is not told it was hit', guestHits.length === 0);

  // The relay fallback is the blind channel. It must still work on a server
  // that never answers pvp_attack_hit -- so it is sent on its own here.
  effects.length = 0;
  hits.length = 0;
  relays.length = 0;
  guest.emit('party_support', {
    kind: 'downed',
    amount: 250,
    targetSocketId: host.id,
    itemName: `PVPHIT:0:fallback:hit_fallback_${RUN}`,
  });
  await sleep(300);
  check('the guaranteed fallback still reaches the target', relays.length === 1);
  check(
    'the fallback carries no team or position to draw from',
    relays.length === 1 && relays[0].itemName?.startsWith('PVPHIT:') && relays[0].kind === 'downed',
  );
  check('the fallback is not mistaken for the real packet', hits.length === 0);
} catch (error) {
  console.error('ERROR:', error?.message || error);
  failures += 1;
} finally {
  host?.disconnect();
  guest?.disconnect();
  server.kill('SIGKILL');
}

if (failures > 0) {
  console.error('\nserver log tail:\n' + serverLog.split('\n').slice(-12).join('\n'));
}
assert.equal(failures, 0, `${failures} damage-relay check(s) failed`);
console.log('\nPVP DAMAGE RELAY OK\n');
