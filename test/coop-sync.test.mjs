/**
 * End-to-end co-op sync test against server/index.js.
 * Verifies: role assignment, bidirectional relay, reconnect room rejoin, full_sync.
 */
import { io } from 'socket.io-client';

// Defaults to the local dev server; pass COOP_TEST_URL to point at a deployment.
const URL = process.env.COOP_TEST_URL || 'http://localhost:3001';
const RUN = Math.random().toString(36).slice(2, 8); // unique per run so a long-lived server cannot leak state between runs
const A = { uuid: `uuid-host-${RUN}`, name: 'HostPC', shortId: `H${RUN}`.toUpperCase() };
const B = { uuid: `uuid-guest-${RUN}`, name: 'GuestMobile', shortId: `G${RUN}`.toUpperCase() };

let failures = 0;
function check(label, cond) {
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${label}`);
  if (!cond) failures++;
}

const waitFor = (sock, event, ms = 3000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), ms);
  sock.once(event, (data) => { clearTimeout(t); resolve(data); });
});

const connect = () => new Promise((resolve) => {
  const s = io(URL, { forceNew: true, reconnection: false });
  s.on('connect', () => resolve(s));
});

const run = async () => {
  console.log('\n--- 1. Lobby creation and role assignment ---');
  let hostSock = await connect();
  hostSock.emit('register_player', A);
  hostSock.emit('create_lobby', { dungeonId: 'goblin_catacombs', ...A });
  const lobby = await waitFor(hostSock, 'lobby_update');
  check('host receives lobby_update', !!lobby.roomId);
  check('host is flagged isHost', lobby.isHost === true);
  const roomId = lobby.roomId;

  let guestSock = await connect();
  guestSock.emit('register_player', B);
  await new Promise(r => setTimeout(r, 100));

  // Joining now lands in the LOBBY; the host launches the run explicitly.
  guestSock.emit('accept_invite', { roomId, ...B });
  await new Promise(r => setTimeout(r, 200));
  guestSock.emit('lobby_ready', { ready: true });
  await new Promise(r => setTimeout(r, 150));

  const hostStart = waitFor(hostSock, 'dungeon_start');
  const guestStart = waitFor(guestSock, 'dungeon_start');
  hostSock.emit('lobby_start');
  const [hs, gs] = await Promise.all([hostStart, guestStart]);
  check('host dungeon_start isHost=true', hs.isHost === true);
  check('guest dungeon_start isHost=false', gs.isHost === false);

  console.log('\n--- 2. Bidirectional relay (the reported asymmetry) ---');
  const guestGotSkill = waitFor(guestSock, 'remote_player_skill');
  hostSock.emit('player_skill', { skillIndex: 5, classId: 'warrior', x: 100, y: 0, facing: 1 });
  const gskill = await guestGotSkill;
  check('HOST -> GUEST skill relayed', gskill.skillIndex === 5 && gskill.classId === 'warrior');

  const hostGotSkill = waitFor(hostSock, 'remote_player_skill');
  guestSock.emit('player_skill', { skillIndex: 2, classId: 'mage', x: 200, y: 0, facing: -1 });
  const hskill = await hostGotSkill;
  check('GUEST -> HOST skill relayed', hskill.skillIndex === 2 && hskill.classId === 'mage');

  const guestGotEnemies = waitFor(guestSock, 'enemy_sync');
  hostSock.emit('enemy_sync', { enemies: [{ id: 'e1', hp: 50 }], waveIndex: 0, dungeonIndex: 0 });
  const esync = await guestGotEnemies;
  check('HOST -> GUEST enemy_sync relayed', esync.enemies.length === 1);

  const guestGotWave = waitFor(guestSock, 'wave_sync');
  hostSock.emit('wave_sync', { waveIndex: 1, cleared: false });
  const wsync = await guestGotWave;
  check('HOST -> GUEST wave_sync relayed', wsync.waveIndex === 1);

  const hostGotDamage = waitFor(hostSock, 'damage_enemy');
  guestSock.emit('damage_enemy', { enemyId: 'e1', damage: 12, facing: 1 });
  const dmg = await hostGotDamage;
  check('GUEST -> HOST damage_enemy relayed', dmg.damage === 12);

  console.log('\n--- 3. Mobile reconnect: guest drops and comes back ---');
  guestSock.disconnect();
  await new Promise(r => setTimeout(r, 300));

  guestSock = await connect();
  const rejoined = waitFor(guestSock, 'room_rejoined');
  guestSock.emit('register_player', B);
  const rj = await rejoined;
  check('guest receives room_rejoined', rj.roomId === roomId);
  check('guest still flagged isHost=false', rj.isHost === false);

  const guestGotAfterReconnect = waitFor(guestSock, 'enemy_sync');
  await new Promise(r => setTimeout(r, 100));
  hostSock.emit('enemy_sync', { enemies: [{ id: 'e2', hp: 99 }], waveIndex: 3, dungeonIndex: 0 });
  const post = await guestGotAfterReconnect;
  check('host broadcasts STILL REACH guest after reconnect', post.enemies[0].id === 'e2');
  check('wave index survives reconnect', post.waveIndex === 3);

  console.log('\n--- 4. full_sync snapshot request ---');
  const hostGotRequest = waitFor(hostSock, 'request_full_sync');
  guestSock.emit('request_full_sync');
  const req = await hostGotRequest;
  check('host receives request_full_sync with requesterId', !!req.requesterId);

  const guestGotSnapshot = waitFor(guestSock, 'full_sync');
  hostSock.emit('full_sync', {
    requesterId: req.requesterId,
    waveIndex: 3, dungeonIndex: 0, dungeonId: 'goblin_catacombs',
    enemies: [{ id: 'e2', hp: 99 }, { id: 'e3', hp: 40 }]
  });
  const snap = await guestGotSnapshot;
  check('guest receives full_sync snapshot', snap.enemies.length === 2 && snap.waveIndex === 3);

  console.log('\n--- 5. Host migration when host leaves ---');
  hostSock.emit('leave_dungeon_room');
  const role = await waitFor(guestSock, 'role_assign');
  check('guest promoted to host after host leaves', role.isHost === true);

  guestSock.disconnect();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch(e => { console.error('\nTEST ERROR:', e.message, '\n'); process.exit(1); });
