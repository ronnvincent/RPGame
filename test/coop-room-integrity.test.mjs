/**
 * REGRESSION TEST: a party member must not be able to silently split off into
 * their own room.
 *
 * Evidence from the user's two devices (2026-08-17):
 *   PC     : room 75_792  ROLE HOST (dungeon_start)  MODE DUNGEON W3  syncs 0
 *   Mobile : room 15_449  ROLE HOST (role_assign)    MODE TOWN    W1  syncs 0
 *
 * Two different rooms, both host, zero syncs - they were in one room briefly
 * (mobile skills out 1 / PC skills in 1) and then diverged. The World Map
 * auto-opens near the town portal, and picking a dungeon there calls
 * create_lobby, which overwrote the guest's room and made it host of a new
 * empty room.
 *
 * Desired behaviour: create_lobby from a player already in a started room is
 * refused; the party stays intact.
 */
import { io } from 'socket.io-client';

const URL = process.env.COOP_TEST_URL || 'http://localhost:3001';
const A = { uuid: 'uuid-room-host', name: 'HostA', shortId: 'ROOMHA' };
const B = { uuid: 'uuid-room-guest', name: 'GuestB', shortId: 'ROOMGB' };

let failures = 0;
const check = (label, cond) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
};

const connect = () => new Promise(res => {
  const s = io(URL, { forceNew: true, reconnection: false });
  s.on('connect', () => res(s));
});
const waitFor = (sock, event, ms = 2000) => new Promise(resolve => {
  const t = setTimeout(() => resolve(null), ms);
  sock.once(event, d => { clearTimeout(t); resolve(d); });
});

const run = async () => {
  console.log('\n=== ROOM INTEGRITY ===\n');

  const a = await connect();
  a.emit('register_player', A);
  a.emit('create_lobby', { dungeonId: 'goblin_catacombs', ...A });
  const lobby = await waitFor(a, 'lobby_update');
  const room1 = lobby && lobby.roomId;
  check('host created a lobby', !!room1);

  const b = await connect();
  b.emit('register_player', B);
  await new Promise(r => setTimeout(r, 150));

  b.emit('accept_invite', { roomId: room1, ...B });
  await new Promise(r => setTimeout(r, 200));
  b.emit('lobby_ready', { ready: true });
  await new Promise(r => setTimeout(r, 150));

  const bStart = waitFor(b, 'dungeon_start');
  a.emit('lobby_start');
  const started = await bStart;
  check('guest joined and got dungeon_start', !!started);
  check('guest is NOT host', started && started.isHost === false);

  // Baseline relay before the split attempt.
  const bSees1 = waitFor(b, 'enemy_sync', 1200);
  a.emit('enemy_sync', { enemies: [{ id: 'e1', hp: 9 }], waveIndex: 0, dungeonIndex: 0 });
  check('relay works before split attempt', !!(await bSees1));

  // THE SPLIT: guest picks a dungeon from the World Map while already partied.
  console.log('\n  -- guest calls create_lobby while already in a party --');
  const bNewLobby = waitFor(b, 'lobby_update', 1200);
  const bError = waitFor(b, 'lobby_error', 1200);
  b.emit('create_lobby', { dungeonId: 'undead_crypt', ...B });
  const [newLobby, err] = await Promise.all([bNewLobby, bError]);

  check('guest was NOT moved into a new room', !newLobby || newLobby.roomId === room1);
  check('server refused with lobby_error', !!err);

  // The party must still be intact afterwards.
  const bSees2 = waitFor(b, 'enemy_sync', 1200);
  a.emit('enemy_sync', { enemies: [{ id: 'e2', hp: 5 }], waveIndex: 1, dungeonIndex: 0 });
  check('HOST -> GUEST relay survives', !!(await bSees2));

  const aSees = waitFor(a, 'damage_enemy', 1200);
  b.emit('damage_enemy', { enemyId: 'e2', damage: 7, facing: 1 });
  check('GUEST -> HOST relay survives', !!(await aSees));

  a.disconnect(); b.disconnect();
  console.log(`\n${failures === 0 ? 'ROOM INTEGRITY OK' : failures + ' FAILURE(S)'}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch(e => { console.error('ERROR:', e.message); process.exit(2); });
