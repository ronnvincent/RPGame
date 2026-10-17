/**
 * REGRESSION TEST: Colosseum seats belong to the players.
 *
 * Reported behaviour: tapping a lobby slot only ever moved you to the top
 * chair. The handler knew teams, not positions, so picking a second or third
 * slot in your own team called "switch team" - which the server ignored
 * because you were already on that side.
 *
 * Desired behaviour: any chair is claimable, picking an occupied chair swaps
 * the two players, and the spectator bench above the teams is a real seat -
 * you can move onto it, off it, and swap with someone sitting there. A bench
 * spectator watches the bout and is never deployed onto a team.
 */
import { io } from 'socket.io-client';
import { readFileSync } from 'node:fs';

const URL = process.env.COOP_TEST_URL || 'http://localhost:3001';
const SLOW = !!process.env.COOP_TEST_URL;
const T = ms => (SLOW ? ms * 3 : ms);
const RUN = Math.random().toString(36).slice(2, 8);
const mk = n => ({
  uuid: `uuid-pvpseat-${RUN}-${n}`,
  name: `Seat${n}`,
  shortId: `PS${RUN}${n}`.toUpperCase(),
  classId: 'warrior',
  level: 12,
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
const seatOf = (state, actorId) => state?.members?.find(m => m.actorId === actorId);
const refresh = async (sock, state, emit) => {
  const next = waitFor(sock, 'lobby_state');
  emit();
  return (await next) || state;
};

const lobbyUi = readFileSync('src/sideview/ui/TournamentLobbyUI.ts', 'utf8');
const net = readFileSync('src/sideview/network/NetworkManager.ts', 'utf8');
const server = readFileSync('server/index.js', 'utf8');
const game = readFileSync('src/sideview/SideViewGame.ts', 'utf8');

const run = async () => {
  console.log('\n=== PVP LOBBY SEATS ===\n');

  // --- Static guards ------------------------------------------------------
  check('the lobby renders a spectator bench above the teams',
    /pvp-spectator-bench/.test(lobbyUi) && /renderBenchSlots/.test(lobbyUi));
  check('empty and occupied cards are both seat targets',
    /data-action="pick-seat" data-seat="\$\{team\}" data-slot="\$\{i\}"/.test(lobbyUi)
    && /data-action="pick-seat" data-seat="spectator"/.test(lobbyUi));
  check('a seat tile is reachable from the keyboard',
    /addEventListener\('keydown'/.test(lobbyUi) && /key === 'Enter' \|\| key === ' '/.test(lobbyUi));
  check('the client sends the seat index, not just the team',
    /emit\('pvp_pick_seat', \{ seat, slot \}\)/.test(net));
  check('the server swaps seats instead of silently ignoring a same-team pick',
    /function pvpTakeSeat/.test(server) && /Swap: the other player inherits exactly where we were sitting/.test(server));
  check('the bench is excluded from the match roster',
    /filter\(m => m\.seat !== PVP_SPECTATOR_SEAT\)/.test(server));
  check('the launch roster tells a benched client it is spectating',
    /isSpectator: spectating/.test(server) && /roomData\?\.isSpectator === true/.test(game));
  check('seat order drives the match lineup',
    /seat !== 'spectator'/.test(readFileSync('src/sideview/pvp/TournamentSystem.ts', 'utf8')));

  // --- Live protocol ------------------------------------------------------
  const A = mk(1), B = mk(2), C = mk(3);

  const a = await connect();
  a.emit('register_player', A);
  const made = waitFor(a, 'lobby_state');
  a.emit('create_lobby', {
    dungeonId: 'tournament_colosseum',
    isPvp: true,
    pvpFormat: '2v2',
    ...A,
  });
  const st0 = await made;
  check('the room opens with the host seated', !!st0 && st0.members.length === 1
    && st0.members[0].seat === 'red' && st0.members[0].slot === 0);
  if (!st0) throw new Error('lobby was not created');

  const b = await connect();
  b.emit('register_player', B);
  await new Promise(r => setTimeout(r, 120));
  const joinedB = await refresh(a, st0, () => b.emit('accept_invite', { roomId: st0.roomCode, ...B }));

  const c = await connect();
  c.emit('register_player', C);
  await new Promise(r => setTimeout(r, 120));
  const st2 = await refresh(a, joinedB, () => c.emit('accept_invite', { roomId: st0.roomCode, ...C }));
  const aId = st2.members.find(m => m.isHost)?.actorId;
  const cId = st2.members.find(m => m.name === C.name)?.actorId;
  const bId = st2.members.find(m => m.name === B.name)?.actorId;
  check('joiners take real, distinct seats', !!st2
    && new Set(st2.members.map(m => m.team + '#' + m.slot)).size === st2.members.length);

  // C readies up, then takes the host's current chair: the two must swap, not
  // pile up, and a chair move inside the same team must not cost readiness.
  const stReadyC = await refresh(a, st2, () => c.emit('lobby_ready', { ready: true }));
  const hostSeat = seatOf(stReadyC, aId);
  const beforeC = seatOf(stReadyC, cId);
  const stSwap = await refresh(a, stReadyC, () => c.emit('pvp_pick_seat', {
    seat: hostSeat.team,
    slot: hostSeat.slot,
  }));
  check('re-ordering chairs inside your team keeps you ready',
    seatOf(stSwap, cId)?.ready === true);
  check('picking an occupied chair swaps the two players',
    !!stSwap
    && seatOf(stSwap, cId)?.team === hostSeat.team
    && seatOf(stSwap, cId)?.slot === hostSeat.slot
    && seatOf(stSwap, aId)?.slot === beforeC.slot,
    JSON.stringify(stSwap?.members?.map(m => `${m.name}:${m.team}#${m.slot}`)));

  // The host moves across the aisle into a free chair.
  const stCross = await refresh(a, stSwap, () => a.emit('pvp_pick_seat', { seat: 'blue', slot: 1 }));
  const hostCross = seatOf(stCross, aId);
  check('a player can take any free chair on either side',
    hostCross?.team === 'blue' && hostCross?.slot === 1);

  // Onto the bench, and back off it by swapping with a seated player.
  const stBench = await refresh(a, stCross, () => a.emit('pvp_pick_seat', { seat: 'spectator', slot: 0 }));
  check('the bench is a seat a player can take',
    seatOf(stBench, aId)?.seat === 'spectator' && seatOf(stBench, aId)?.slot === 0);
  check('a bench seat is not a team seat',
    !stBench.pvpTeams[aId] && stBench.pvpTeams[cId] === 'red');
  check('the room reports how many bench chairs exist', stBench.pvpBenchSize >= 2);

  const stBack = await refresh(a, stBench, () => a.emit('pvp_pick_seat', {
    seat: seatOf(stBench, cId).team,
    slot: seatOf(stBench, cId).slot,
  }));
  check('swapping off the bench puts you back in a team chair',
    seatOf(stBack, aId)?.team === seatOf(stBench, cId).team
    && seatOf(stBack, aId)?.seat !== 'spectator');
  check('and the player you swapped with takes the bench',
    seatOf(stBack, cId)?.seat === 'spectator');

  // Bench the host again, ready everyone who is still a fighter, and launch.
  const stReadyRoom = await refresh(a, stBack, () => a.emit('pvp_pick_seat', { seat: 'spectator', slot: 0 }));
  const fighters = stReadyRoom.members.filter(m => m.seat !== 'spectator');
  const readyUps = fighters.filter(m => !m.isHost);
  const sockets = { [A.name]: a, [B.name]: b, [C.name]: c };
  let lastState = stReadyRoom;
  for (const member of readyUps) {
    const sock = sockets[member.name];
    if (!sock) continue;
    lastState = await refresh(a, lastState, () => sock.emit('lobby_ready', { ready: true }));
  }
  check('a spectator does not have to ready up',
    !!lastState && lastState.members.filter(m => m.seat !== 'spectator').every(m => m.isHost || m.ready));

  const aStart = waitFor(a, 'dungeon_start', T(2500));
  const bStart = waitFor(b, 'dungeon_start', T(2500));
  const cStart = waitFor(c, 'dungeon_start', T(2500));
  const aErr = waitFor(a, 'lobby_error', T(800));
  a.emit('lobby_start');
  const [aRun, bRun, cRun, refused] = await Promise.all([aStart, bStart, cStart, aErr]);
  check('the match launches with a spectator in the room', !!aRun && !!bRun && !!cRun);
  check('the roster only holds the fighters', !!aRun && aRun.players.length === 2);
  check('the benched host is told it is spectating', !!aRun && aRun.isSpectator === true);
  check('the fighters are not labelled spectators', !!bRun && bRun.isSpectator === false);
  check('the spectator is not on the roster they receive',
    !!aRun && aRun.players.length === 2 && !aRun.players.some(p => p.actorId === aId));
  check('the fighters receive both roster slots',
    !!cRun && cRun.players.length === 2 && cRun.players.some(p => p.actorId === cId));
  check('the launch is not refused', !refused);

  // A bench spectator has no team. The wipe check must not count them, or the
  // team they fell back to could never be fully downed and the round would
  // hang forever.
  const blueFighter = cRun?.players.find(m => m.seat === 'blue');
  const redFighter = cRun?.players.find(m => m.seat === 'red');
  const blueSock = blueFighter?.actorId === aId || blueFighter?.name === A.name ? a : b;
  const redSock = redFighter?.name === C.name ? c : b;
  const spectatorSawRound = waitFor(a, 'pvp_round_result', T(2500));
  const fighterSawRound = waitFor(b, 'pvp_round_result', T(2500));
  blueSock.emit('pvp_player_downed', {
    killerActorId: redFighter?.actorId,
    killerName: redFighter?.name || 'Fighter',
  });
  const [benchRound, fighterRound] = await Promise.all([spectatorSawRound, fighterSawRound]);
  check('a team wipe still settles with a spectator on the bench',
    !!fighterRound && fighterRound.winner === 'red');
  check('the spectator receives the round result too', !!benchRound);

  a.disconnect(); b.disconnect(); c.disconnect();
  console.log(`\n${failures === 0 ? 'PVP LOBBY SEATS OK' : failures + ' FAILURE(S)'}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch(e => { console.error('ERROR:', e.message); process.exit(2); });
