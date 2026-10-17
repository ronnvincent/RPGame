/**
 * REGRESSION TEST: a Colosseum joiner must reach the staging lobby, not the arena.
 *
 * Reported behaviour: sending a room code to a friend launched the match the
 * instant they joined. Two independent causes were involved:
 *   1. the guest auto-readied itself on every lobby update and the server let
 *      the host launch PvP without checking readiness at all, and
 *   2. the host answered the newcomer's role-assignment full_sync request while
 *      still standing in town, and `currentDungeonId` could still say
 *      `tournament_colosseum` from the previous match - a snapshot labelled
 *      that way reads as a live match and pulls the newcomer into the arena.
 *
 * Desired behaviour: joiners arrive un-ready, the host cannot launch until
 * every challenger has readied up, and nothing short of the server's
 * dungeon_start moves anyone out of the lobby.
 */
import { io } from 'socket.io-client';
import { readFileSync } from 'node:fs';

const URL = process.env.COOP_TEST_URL || 'http://localhost:3001';
const SLOW = !!process.env.COOP_TEST_URL;
const T = ms => (SLOW ? ms * 3 : ms);
const RUN = Math.random().toString(36).slice(2, 8);
const mk = n => ({
  uuid: `uuid-pvplob-${RUN}-${n}`,
  name: `Champion${n}`,
  shortId: `PL${RUN}${n}`.toUpperCase(),
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
const server = readFileSync('server/index.js', 'utf8');

const run = async () => {
  console.log('\n=== PVP LOBBY READY-UP ===\n');

  // --- Static guards ------------------------------------------------------
  check('the lobby UI no longer auto-readies every guest',
    !/if \(!network\.isHost && network\.room\) \{\s*network\.sendReady\(true\);\s*\}/.test(lobbyUi));
  check('the ready button reads the server member, not a hard-coded true',
    /const me = rawMembers\.find\(m => m\.actorId === myId \|\| m\.uuid === myId\) \|\| self;/.test(lobbyUi)
    && /ready: false,\n\s+isHost: network\.isHost,/.test(lobbyUi));
  check('the host does not answer sync requests while the Colosseum is staging',
    /const stagingPvp = this\.tournamentLobby\?\.isOpen/.test(game)
    && /if \(stagingPvp\) return;/.test(game));
  check('a match handshake cannot leave the lobby while it is open',
    /if \(handshake\.phase === 'match'\) \{[\s\S]{0,700}if \(this\.tournamentLobby\?\.isOpen\) return;/.test(game));
  check('the guest only trusts snapshot metadata, not its own session flag',
    !/Boolean\(mod\.network\.isPvpSession\)\s*\n\s*\|\| Boolean\(mod\.network\.isPvpFallback\);/.test(game));
  check('the server enforces ready-up for PvP as well',
    /const notReady = room\.members\.filter\(actorId =>[\s\S]{0,180}!room\.ready\[actorId\]\);[\s\S]{0,400}Waiting for every challenger to ready up\./.test(server)
    && /!isPvpSpectator\(room, actorId\)/.test(server.slice(server.indexOf('const notReady'), server.indexOf('const notReady') + 400)),
    'a bench spectator is not a challenger who must ready');
  check('a stray combat packet cannot mark the staging room started',
    !/if \(!room\.started\) room\.started = true;/.test(server));
  check('movement uses the room\'s real scene id, not the fallback guess',
    /sceneId: isPvpActive \? this\.pvpSceneId : sceneId,/.test(net));

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
  check('host opens a Colosseum lobby without starting it',
    !!st0 && st0.isPvp === true && st0.started === false);
  if (!st0) throw new Error('lobby was not created');

  const b = await connect();
  b.emit('register_player', B);
  await new Promise(r => setTimeout(r, 120));
  const joined = waitFor(a, 'lobby_state');
  b.emit('accept_invite', { roomId: st0.roomCode, ...B });
  const st1 = await joined;
  check('the joiner is seated in the staging lobby', !!st1 && st1.members.length === 2);
  check('the joiner arrives un-ready', !!st1 && st1.members.find(m => !m.isHost)?.ready === false);

  // Host presses START far too early.
  const earlyRun = waitFor(b, 'dungeon_start', T(800));
  const refusal = waitFor(a, 'lobby_error', T(800));
  a.emit('lobby_start');
  const [booted, refused] = await Promise.all([earlyRun, refusal]);
  check('the match does NOT start while the joiner is un-ready', !booted);
  check('the host is told why the launch was refused', !!refused);

  // A stray hit from a stale client must not lock the staging room.
  a.emit('pvp_attack_hit', { targetSocketId: b.id, damage: 100 });
  await new Promise(r => setTimeout(r, 150));
  const c = await connect();
  c.emit('register_player', C);
  await new Promise(r => setTimeout(r, 120));
  const thirdJoin = waitFor(a, 'lobby_state');
  c.emit('accept_invite', { roomId: st0.roomCode, ...C });
  const st2 = await thirdJoin;
  check('a stray PvP hit does not mark the lobby started', !!st2 && st2.members.length === 3);

  // A staging snapshot must never look like a running match.
  const request = waitFor(a, 'request_full_sync');
  b.emit('request_full_sync');
  const req = await request;
  const snapshot = waitFor(b, 'full_sync');
  a.emit('full_sync', {
    requesterId: req?.requesterId,
    waveIndex: 0,
    dungeonIndex: 0,
    dungeonId: 'tournament_colosseum',
    enemies: [],
  });
  const snap = await snapshot;
  check('the staging snapshot reaches the newcomer', !!snap);
  check('the staging snapshot is not labelled as a live match', !!snap && snap.isPvpMatch !== true && snap.tournamentMode !== true);
  check('the staging snapshot still carries the arena team map', !!snap && !!snap.pvpTeams && Object.keys(snap.pvpTeams).length === 3);

  // Everyone readies, and only then does the server launch.
  const hostSawReadyOne = waitFor(a, 'lobby_state');
  b.emit('lobby_ready', { ready: true });
  await hostSawReadyOne;
  const hostSawReadyTwo = waitFor(a, 'lobby_state');
  c.emit('lobby_ready', { ready: true });
  const stReady = await hostSawReadyTwo;
  check('every challenger can ready up', !!stReady && stReady.members.filter(m => !m.isHost).every(m => m.ready));

  const aRun = waitFor(a, 'dungeon_start');
  const bRun = waitFor(b, 'dungeon_start');
  a.emit('lobby_start');
  const [ar, br] = await Promise.all([aRun, bRun]);
  check('the launch reaches the host once everyone is ready', !!ar && ar.isHost === true);
  check('the launch reaches the joiner once everyone is ready', !!br && br.isHost === false);

  a.disconnect(); b.disconnect(); c.disconnect();
  console.log(`\n${failures === 0 ? 'PVP LOBBY READY OK' : failures + ' FAILURE(S)'}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch(e => { console.error('ERROR:', e.message); process.exit(2); });
