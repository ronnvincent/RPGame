/**
 * REGRESSION TEST: a Colosseum room can run another bout without a rebuild.
 *
 * The end-of-match card offers REMATCH, but `lobby_start` is deliberately
 * one-shot: it refuses a room that has already started. A rematch therefore
 * has to be its own event. It must:
 *
 *   - need every member, not just the host (nobody gets dragged into a match
 *     they did not agree to);
 *   - relaunch through the ordinary dungeon_start packet, so a client has one
 *     way into the arena;
 *   - reset the scoreboard, or round 3 of the rematch would instantly end the
 *     series 2-0;
 *   - refuse a room that no longer has a fighter on each side.
 *
 * Start the server (node server/index.js) before running.
 */
import { io } from 'socket.io-client';

const URL = process.env.COOP_TEST_URL || 'http://localhost:3001';
const T = ms => (process.env.COOP_TEST_URL ? ms * 3 : ms);
const RUN = Math.random().toString(36).slice(2, 8);
const mk = n => ({
  uuid: `uuid-rematch-${RUN}-${n}`,
  name: `Rematcher${n}`,
  shortId: `RM${RUN}${n}`.toUpperCase(),
  classId: 'warrior',
  level: 9,
});

let failures = 0;
const check = (label, cond) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
};
const connect = () => new Promise(res => {
  const s = io(URL, { forceNew: true, reconnection: false });
  s.on('connect', () => res(s));
});
const waitFor = (sock, event, ms = T(1500)) => new Promise(resolve => {
  const t = setTimeout(() => resolve(null), ms);
  sock.once(event, d => { clearTimeout(t); resolve(d); });
});
const sleep = ms => new Promise(r => setTimeout(r, T(ms)));

const run = async () => {
  console.log('\n=== PVP REMATCH ===\n');

  const HOST = mk(1);
  const GUEST = mk(2);
  const OUTSIDER = mk(3);

  const a = await connect();
  a.emit('register_player', HOST);
  const created = waitFor(a, 'lobby_state');
  a.emit('create_lobby', { dungeonId: 'tournament_colosseum', isPvp: true, pvpFormat: '1v1', ...HOST });
  const hostState = await created;
  if (!hostState) throw new Error('lobby was not created');

  const b = await connect();
  b.emit('register_player', GUEST);
  await sleep(120);
  const joined = waitFor(a, 'lobby_state');
  b.emit('accept_invite', { roomId: hostState.roomCode, ...GUEST });
  await joined;
  b.emit('lobby_ready', { ready: true });
  await sleep(180);

  const hostStarts = [];
  const guestStarts = [];
  const hostVotes = [];
  const guestVotes = [];
  a.on('dungeon_start', d => hostStarts.push(d));
  b.on('dungeon_start', d => guestStarts.push(d));
  a.on('pvp_rematch_state', d => hostVotes.push(d));
  b.on('pvp_rematch_state', d => guestVotes.push(d));

  const firstStart = waitFor(a, 'dungeon_start');
  a.emit('lobby_start');
  const start1 = await firstStart;
  await sleep(120);
  check('the first launch reaches the host', !!start1);
  check('the guest is in the launch too', guestStarts.length === 1);

  // Settle round 1 so there is a scoreboard to reset.
  const round1 = waitFor(a, 'pvp_round_result');
  await sleep(60);
  b.emit('pvp_player_downed', { killerActorId: HOST.uuid, killerName: HOST.name });
  const r1 = await round1;
  check('round 1 scores before the rematch', !!r1 && r1.redScore === 1 && r1.blueScore === 0);

  // --- One vote is not enough ------------------------------------------
  console.log('  -- one vote --');
  a.emit('pvp_rematch_vote');
  await sleep(300);
  const firstVote = hostVotes[hostVotes.length - 1];
  check('the vote is broadcast to the room', !!firstVote && firstVote.votes === 1);
  check('the room needs both players', !!firstVote && firstVote.needed === 2);
  check('a single vote does not relaunch', guestStarts.length === 1,
    'being pulled into a rematch you did not ask for is worse than no rematch');

  // A replay of the same vote must not count twice.
  a.emit('pvp_rematch_vote');
  await sleep(150);
  const replayed = hostVotes[hostVotes.length - 1];
  check('a duplicate vote is idempotent', !!replayed && replayed.votes === 1);

  // --- The room votes together -----------------------------------------
  console.log('  -- unanimous --');
  const relaunchA = waitFor(a, 'dungeon_start');
  const relaunchB = waitFor(b, 'dungeon_start');
  b.emit('pvp_rematch_vote');
  const [secondA, secondB] = await Promise.all([relaunchA, relaunchB]);
  check('the host receives a second dungeon_start', !!secondA);
  check('the guest receives the same launch', !!secondB);
  check('the room is still the same room', !!secondA && secondA.roomId === start1.roomId);
  check('the teams are preserved', !!secondA && secondA.pvpTeams && Object.keys(secondA.pvpTeams).length === 2);
  check('exactly one relaunch was sent', guestStarts.length === 2);

  // --- The fresh board is fresh ---------------------------------------
  console.log('  -- clean board --');
  await sleep(60);
  const round1Again = waitFor(b, 'pvp_round_result');
  b.emit('pvp_player_downed', { killerActorId: HOST.uuid, killerName: HOST.name });
  const r1b = await round1Again;
  check('a death after the rematch scores round 1 again', !!r1b && r1b.roundNumber === 1);
  check('the scoreboard started at zero', !!r1b && r1b.redScore === 1 && r1b.blueScore === 0);

  a.disconnect();
  b.disconnect();

  console.log(`\n${failures === 0 ? 'PVP REMATCH OK' : failures + ' FAILURE(S)'}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch(e => { console.error('ERROR:', e.message); process.exit(2); });
