/**
 * REGRESSION TEST: a Colosseum match is best-of-three.
 *
 * The server used to emit `pvp_match_result` the moment one team was wiped, so
 * the first kill of round 1 ended the whole match and threw everyone back to
 * town with the series at 1-0. A `pvp_player_downed` packet is a ROUND result:
 * the server now keeps the scoreboard, and only a team reaching `roundsToWin`
 * ends the match.
 *
 * It also covers the shared scoreboard: rounds that expire on the clock are
 * reported by the host, mirrored by the server, and applied by every client.
 */
import { io } from 'socket.io-client';
import { readFileSync } from 'node:fs';

const URL = process.env.COOP_TEST_URL || 'http://localhost:3001';
const SLOW = !!process.env.COOP_TEST_URL;
const T = ms => (SLOW ? ms * 3 : ms);
const RUN = Math.random().toString(36).slice(2, 8);
const mk = n => ({
  uuid: `uuid-score-${RUN}-${n}`,
  name: `Duelist${n}`,
  shortId: `DS${RUN}${n}`.toUpperCase(),
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

const lobbyUi = readFileSync('src/sideview/ui/TournamentLobbyUI.ts', 'utf8');
const game = readFileSync('src/sideview/SideViewGame.ts', 'utf8');
const net = readFileSync('src/sideview/network/NetworkManager.ts', 'utf8');
const engineSource = readFileSync('src/sideview/engine/SideViewEngine.ts', 'utf8');
const tournament = readFileSync('src/sideview/pvp/TournamentSystem.ts', 'utf8');
const server = readFileSync('server/index.js', 'utf8');

const run = async () => {
  console.log('\n=== PVP SCORING (BEST OF THREE) ===\n');

  // --- Static guards ------------------------------------------------------
  check('a team wipe no longer emits pvp_match_result directly', !/if \(allDowned\) \{\s*io\.to\(p\.room\)\.emit\('pvp_match_result'/.test(server));
  check('the server settles a wiped round instead', /settlePvpRound\(p\.room, killerTeam, 'wipe'/.test(server));
  check('the match only ends at roundsToWin', /room\.pvpScore\.red >= room\.roundsToWin \|\| room\.pvpScore\.blue >= room\.roundsToWin/.test(server));
  check('a fresh scoreboard is created when the host launches', /room\.pvpScore = \{ red: 0, blue: 0 \};[\s\S]{0,120}room\.pvpRound = 1;/.test(server));
  check('host clock reports are accepted for the round in play only', /if \(data\.roundNumber !== room\.pvpRound\) return;/.test(server));
  check('replayed downed packets cannot re-score a settled round', /PVP_ROUND_SETTLE_COOLDOWN_MS/.test(server));
  check('the round model notifies the host when a round settles', /onRoundResolved\?\.\(record\)/.test(tournament));
  check('the host mirrors settled rounds to the server', /onPvpRoundResolved = \(record\) => \{[\s\S]{0,120}sendPvpRoundReport\(record\)/.test(game));
  check('clients apply the server round result', /onPvpRoundResult\(\(packet: any\) => \{[\s\S]{0,160}applyPvpRoundResult\(packet\)/.test(game));
  check('the engine adopts the server scoreboard', /match\.redScore = Math\.round\(redScore\)/.test(engineSource)
    && /match\.blueScore = Math\.round\(blueScore\)/.test(engineSource));
  check('the network layer exposes the round result channel', /'pvp_round_result'/.test(net) && /emit\('pvp_round_report'/.test(net));
  check('rounds shown on the lobby never claim an instant match defeat', !/defeated/i.test(lobbyUi));

  // --- Live protocol ------------------------------------------------------
  const HOST = mk(1), GUEST = mk(2);
  const a = await connect();
  a.emit('register_player', HOST);
  const made = waitFor(a, 'lobby_state');
  a.emit('create_lobby', { dungeonId: 'tournament_colosseum', isPvp: true, pvpFormat: '1v1', ...HOST });
  const st = await made;
  if (!st) throw new Error('lobby was not created');

  const b = await connect();
  b.emit('register_player', GUEST);
  await new Promise(r => setTimeout(r, 120));
  const joined = waitFor(a, 'lobby_state');
  b.emit('accept_invite', { roomId: st.roomCode, ...GUEST });
  await joined;
  b.emit('lobby_ready', { ready: true });
  await new Promise(r => setTimeout(r, T(180)));

  const hostRounds = [];
  const guestRounds = [];
  const hostMatchEnds = [];
  a.on('pvp_round_result', d => hostRounds.push(d));
  b.on('pvp_round_result', d => guestRounds.push(d));
  a.on('pvp_match_result', d => hostMatchEnds.push(d));
  b.on('pvp_match_result', d => hostMatchEnds.push(d));

  const started = waitFor(a, 'dungeon_start');
  a.emit('lobby_start');
  await started;

  console.log('  -- round 1: one death --');
  const r1 = waitFor(a, 'pvp_round_result');
  const g1 = waitFor(b, 'pvp_round_result');
  b.emit('pvp_player_downed', { killerActorId: HOST.uuid, killerName: HOST.name });
  const [round1, guestRound1] = await Promise.all([r1, g1]);
  check('a death settles round 1', !!round1 && round1.roundNumber === 1);
  check('round 1 scores the surviving team', !!round1 && round1.redScore === 1 && round1.blueScore === 0);
  check('round 1 does not end the match', !!round1 && round1.isMatchEnd === false);
  check('the guest sees the same round result', !!guestRound1 && guestRound1.redScore === 1 && guestRound1.roundNumber === 1);
  check('a single death no longer ejects anyone to town', hostMatchEnds.length === 0);

  // Replayed death packets must not award a second round.
  b.emit('pvp_player_downed', { killerActorId: HOST.uuid, killerName: HOST.name });
  await new Promise(r => setTimeout(r, T(300)));
  check('a replayed downed packet does not score twice', hostRounds.length === 1);

  // Only the host may report a clock result.
  b.emit('pvp_round_report', { roundNumber: 2, winner: 'blue', reason: 'health_lead', redScore: 1, blueScore: 1 });
  await new Promise(r => setTimeout(r, T(300)));
  check('a guest cannot report a round result', hostRounds.length === 1);

  console.log('  -- round 2: host reports the clock running out --');
  const r2 = waitFor(a, 'pvp_round_result');
  const g2 = waitFor(b, 'pvp_round_result');
  a.emit('pvp_round_report', { roundNumber: 2, winner: 'blue', reason: 'health_lead', redScore: 1, blueScore: 1 });
  const [round2, guestRound2] = await Promise.all([r2, g2]);
  check('the host can settle a round on the clock', !!round2 && round2.roundNumber === 2 && round2.reason === 'health_lead');
  check('the scoreboard is now 1-1', !!round2 && round2.redScore === 1 && round2.blueScore === 1);
  check('the match continues at 1-1', !!round2 && round2.isMatchEnd === false);
  check('the guest receives the tied scoreboard', !!guestRound2 && guestRound2.redScore === 1 && guestRound2.blueScore === 1);

  // A duplicate report for the same round must not award another point.
  a.emit('pvp_round_report', { roundNumber: 2, winner: 'blue', reason: 'health_lead', redScore: 1, blueScore: 1 });
  await new Promise(r => setTimeout(r, T(300)));
  check('a duplicate round report is ignored', hostRounds.filter(r => r.roundNumber === 2).length === 1);

  console.log('  -- round 3: the decider --');
  await new Promise(r => setTimeout(r, T(3200)));
  const r3 = waitFor(a, 'pvp_round_result');
  const matchEnd = waitFor(a, 'pvp_match_result');
  b.emit('pvp_player_downed', { killerActorId: HOST.uuid, killerName: HOST.name });
  const [round3, final] = await Promise.all([r3, matchEnd]);
  check('round 3 settles at 2-1', !!round3 && round3.redScore === 2 && round3.blueScore === 1);
  check('the deciding round marks the match as ended', !!round3 && round3.isMatchEnd === true);
  check('the match result is sent only now', !!final && final.winningTeam === 'red' && final.redScore === 2 && final.blueScore === 1);

  a.disconnect(); b.disconnect();
  console.log(`\n${failures === 0 ? 'PVP SCORING OK' : failures + ' FAILURE(S)'}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch(e => { console.error('ERROR:', e.message); process.exit(2); });
