/**
 * Your level, as everyone else sees it.
 *
 * Two bugs wore the same face - a high level character treated as Lv 1:
 *
 *   1. The HUD's MAP button called worldMap.open(maxDungeonCleared) and left
 *      the second argument to its default of 1, so every dungeon was gated
 *      against level 1 and a Lv 11 character was told to "REACH Lv. 5".
 *   2. The server learned a level only from lobby packets, so a friend who had
 *      not opened a lobby - or was offline - read as Lv 1 in the friends list,
 *      on lobby cards, and to the invite gate that then refused them dungeons.
 *
 * The socket half runs against the in-memory store when no DATABASE_URL is set.
 */
import { io } from 'socket.io-client';
import { readFileSync } from 'node:fs';

const URL = process.env.COOP_TEST_URL || 'http://localhost:3001';
const SLOW = !!process.env.COOP_TEST_URL;
const T = ms => (SLOW ? ms * 3 : ms);
const RUN = Math.random().toString(36).slice(2, 8);
const A = { uuid: `uuid-lva-${RUN}`, name: 'Watcher', shortId: `LA${RUN}`.toUpperCase(), classId: 'mage', level: 4 };
const B = { uuid: `uuid-lvb-${RUN}`, name: 'Climber', shortId: `LB${RUN}`.toUpperCase(), classId: 'warrior', level: 11 };

let failures = 0;
const check = (l, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const connect = () => new Promise(r => {
  const s = io(URL, { forceNew: true, reconnection: false });
  s.on('connect', () => r(s));
});
const waitFor = (s, ev, ms = T(2000)) => new Promise(res => {
  const t = setTimeout(() => res(null), ms);
  s.once(ev, d => { clearTimeout(t); res(d); });
});

const run = async () => {
  console.log('\n=== LEVEL VISIBILITY ===\n');

  // --- The map gate, read straight from the source ---
  const worldMap = readFileSync('src/sideview/ui/WorldMapUI.ts', 'utf8');
  const hud = readFileSync('src/sideview/ui/GameHUD.ts', 'utf8');
  const openSig = (worldMap.match(/public open\([^)]*\)/) || [''])[0];

  check(
    'the world map cannot be opened without a level',
    !/playerLevel\s*:\s*number\s*=/.test(openSig),
  );

  // The HUD used to call worldMapUI.open directly; every screen goes through
  // showScreen now, which is the single place the level is read.
  const game = readFileSync('src/sideview/SideViewGame.ts', 'utf8');
  const opener = game.slice(game.indexOf('public showScreen('), game.indexOf('public interactWithActiveNpc'));
  check('the map is opened from one place', /this\.worldMap\?\.open\(/.test(opener));
  check('and that place passes the real level, not the default',
    /player\.level \|\| 1/.test(opener));
  check('the HUD asks for the screen rather than opening it itself',
    /showScreen\('map'\)/.test(hud) && !/worldMapUI\?\.open\(/.test(hud));

  // --- The level other players see ---
  const a = await connect(); a.emit('register_player', A);
  const b = await connect(); b.emit('register_player', B);
  await new Promise(r => setTimeout(r, T(250)));

  a.emit('friend_add', { shortId: B.shortId });
  await new Promise(r => setTimeout(r, T(400)));

  let list = (a.emit('friends_request_list'), await waitFor(a, 'friends_list'));
  let climber = list?.friends?.find(f => f.uuid === B.uuid);
  check('a friend appears in the list', !!climber);
  check(
    `their real level shows without them opening a lobby (saw Lv ${climber?.level})`,
    climber?.level === 11,
  );

  // Levelling up mid-session reaches everyone watching.
  const pushed = waitFor(a, 'friends_list', T(2500));
  b.emit('profile_update', { classId: 'warrior', level: 17 });
  const after = await pushed;
  const climbed = after?.friends?.find(f => f.uuid === B.uuid);
  check(
    `a level gained mid-session is pushed to friends (saw Lv ${climbed?.level})`,
    climbed?.level === 17,
  );

  // The invite gate reads that same level, so it must not refuse an eligible friend.
  const lobbyReady = waitFor(a, 'lobby_update', T(2500));
  a.emit('create_lobby', { dungeonId: 'dragon_lair', minLevel: 1, ...A });
  await lobbyReady;
  const blocked = waitFor(b, 'invite_blocked', T(900));
  const invited = new Promise(res => a.emit('send_invite', { targetShortId: B.shortId, ...A }, res));
  const [wasBlocked, reply] = await Promise.all([blocked, invited]);
  check(
    'and a friend who meets the requirement is not blocked from the invite',
    !wasBlocked && reply?.success !== false,
  );

  a.close(); b.close();
  console.log(failures ? `\nLEVEL VISIBILITY FAILURES: ${failures}\n` : '\nLEVEL VISIBILITY OK\n');
  process.exitCode = failures ? 1 : 0;
};

run().catch(e => { console.error(e); process.exitCode = 1; });
