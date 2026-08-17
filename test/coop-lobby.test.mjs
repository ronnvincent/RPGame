/**
 * MLBB-style lobby protocol: 4 slots, ready-up, host-launched start, leaving.
 */
import { io } from 'socket.io-client';

const URL = process.env.COOP_TEST_URL || 'http://localhost:3001';
// A remote deployment adds real round-trip latency; local waits are too tight.
const SLOW = !!process.env.COOP_TEST_URL;
const T = ms => (SLOW ? ms * 3 : ms);
const RUN = Math.random().toString(36).slice(2, 8); // unique per run so a long-lived server cannot leak state between runs
const mk = n => ({ uuid: `uuid-lob-${RUN}-${n}`, name: `Player${n}`, shortId: `L${RUN}${n}`.toUpperCase(), classId: 'mage', level: 7 + n });

let failures = 0;
const check = (label, cond) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
};
const connect = () => new Promise(res => {
  const s = io(URL, { forceNew: true, reconnection: false });
  s.on('connect', () => res(s));
});
const waitFor = (sock, ev, ms = T(2000)) => new Promise(resolve => {
  const t = setTimeout(() => resolve(null), ms);
  sock.once(ev, d => { clearTimeout(t); resolve(d); });
});

const run = async () => {
  console.log('\n=== CO-OP LOBBY ===\n');

  const A = mk(1), B = mk(2), C = mk(3);
  const a = await connect();
  a.emit('register_player', A);
  a.emit('create_lobby', { dungeonId: 'goblin_catacombs', ...A });

  let st = await waitFor(a, 'lobby_state');
  check('host receives lobby_state on create', !!st);
  check('capacity is 4', st && st.maxPlayers === 4);
  check('host slot carries class and level', !!st && st.members[0].classId === 'mage' && st.members[0].level === 8);
  check('host is marked ready', !!st && st.members[0].ready === true);
  const room = st.roomId;

  // Guest joins -> lobby, NOT an immediate run.
  const b = await connect();
  b.emit('register_player', B);
  await new Promise(r => setTimeout(r, 120));
  const aSaw = waitFor(a, 'lobby_state');
  const bStartedTooEarly = waitFor(b, 'dungeon_start', T(900));
  b.emit('accept_invite', { roomId: room, ...B });
  st = await aSaw;
  check('joining updates the lobby to 2 slots', !!st && st.members.length === 2);
  check('joining does NOT auto-start the run', !(await bStartedTooEarly));
  check('guest starts un-ready', !!st && st.members[1].ready === false);

  // Host cannot start while someone is not ready.
  const errEarly = waitFor(a, 'lobby_error', T(900));
  a.emit('lobby_start');
  check('start refused while a member is not ready', !!(await errEarly));

  // Guest readies up.
  const aSawReady = waitFor(a, 'lobby_state');
  b.emit('lobby_ready', { ready: true });
  st = await aSawReady;
  check('ready state propagates to the party', !!st && st.members[1].ready === true);

  // Third player fits.
  const c = await connect();
  c.emit('register_player', C);
  await new Promise(r => setTimeout(r, 120));
  const aSaw3 = waitFor(a, 'lobby_state');
  c.emit('accept_invite', { roomId: room, ...C });
  st = await aSaw3;
  check('third player joins (cap is not 2)', !!st && st.members.length === 3);

  // A non-host cannot launch.
  const guestErr = waitFor(b, 'lobby_error', T(900));
  b.emit('lobby_start');
  check('non-host cannot start the run', !!(await guestErr));

  // Leaving frees the slot.
  const aSawLeave = waitFor(a, 'lobby_state');
  c.emit('leave_lobby');
  st = await aSawLeave;
  check('leaving frees the slot', !!st && st.members.length === 2);

  // Host launches for real.
  const aRun = waitFor(a, 'dungeon_start');
  const bRun = waitFor(b, 'dungeon_start');
  a.emit('lobby_start');
  const [ar, br] = await Promise.all([aRun, bRun]);
  check('host launch reaches the host', !!ar && ar.isHost === true);
  check('host launch reaches the guest', !!br && br.isHost === false);

  a.disconnect(); b.disconnect(); c.disconnect();
  console.log(`\n${failures === 0 ? 'LOBBY OK' : failures + ' FAILURE(S)'}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch(e => { console.error('ERROR:', e.message); process.exit(2); });
