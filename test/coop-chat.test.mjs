/**
 * Talking without a microphone.
 *
 * Voice chat existed, but it excludes how this game is mostly played: a phone
 * in landscape, no headset, often no microphone at all. A party that cannot
 * say "help" is not really a party.
 *
 * Only a line id crosses the wire - never text a player typed - so there is no
 * free-text channel to moderate.
 */
import { io } from 'socket.io-client';
import { readFileSync } from 'node:fs';

const URL = process.env.COOP_TEST_URL || 'http://localhost:3001';
const SLOW = !!process.env.COOP_TEST_URL;
const T = ms => (SLOW ? ms * 3 : ms);
const RUN = Math.random().toString(36).slice(2, 8);
const A = { uuid: `uuid-qca-${RUN}`, name: 'Caller', shortId: `QA${RUN}`.toUpperCase(), classId: 'ranger', level: 8 };
const B = { uuid: `uuid-qcb-${RUN}`, name: 'Listener', shortId: `QB${RUN}`.toUpperCase(), classId: 'knight', level: 8 };

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

const lines = readFileSync('src/sideview/network/QuickChat.ts', 'utf8');
const engine = readFileSync('src/sideview/engine/SideViewEngine.ts', 'utf8');
const hud = readFileSync('src/sideview/ui/GameHUD.ts', 'utf8');
const server = readFileSync('server/index.js', 'utf8');

const run = async () => {
  console.log('\n=== QUICK CHAT & PINGS ===\n');

  const ids = [...lines.matchAll(/id: '([a-z]+)'/g)].map(m => m[1]);
  check(`there are enough lines to hold a fight together (${ids.length})`, ids.length >= 6);
  check('including a call for help', ids.includes('help'));
  check('the menu is built from that same table, not a second copy',
    /QUICK_CHAT[\s\S]{0,200}data-line="\$\{l\.id\}"/.test(hud));

  check('nothing a player types is ever relayed',
    !/data\.text/.test(server) && /typeof data\.lineId === 'string'/.test(server));
  check('and a malformed id is dropped rather than passed on',
    /\/\^\[a-z\]\+\$\/\.test\(lineId\)/.test(server));

  check('a line appears over the speaker', /showChatBubble/.test(engine) && /drawPartyChatter/.test(engine));
  check('and fades instead of piling up', /timer <= 0\) delete this\.chatBubbles/.test(engine));
  check('pings expire too', /pings\.splice\(i, 1\)/.test(engine));
  check('and are capped, so a spammer cannot fill the screen', /pings\.length > 6/.test(engine));

  const a = await connect(); a.emit('register_player', A);
  const b = await connect(); b.emit('register_player', B);
  await new Promise(r => setTimeout(r, T(250)));

  const lobbied = waitFor(a, 'lobby_update', T(2500));
  a.emit('create_lobby', { dungeonId: 'goblin_catacombs', minLevel: 999, ...A });
  const lobby = await lobbied;
  const roomId = lobby?.roomId || lobby?.room?.roomId;
  const joined = waitFor(a, 'lobby_update', T(2500));
  b.emit('accept_invite', { roomId, ...B });
  await joined;

  const heard = waitFor(b, 'remote_party_chat', T(2000));
  a.emit('party_chat', { lineId: 'help' });
  const msg = await heard;
  check('a teammate hears the call', msg?.lineId === 'help' && !!msg?.socketId);

  const junk = waitFor(b, 'remote_party_chat', T(800));
  a.emit('party_chat', { lineId: '<script>alert(1)</script>' });
  check('but not anything shaped like an injection', (await junk) === null);

  const pinged = waitFor(b, 'remote_party_ping', T(2000));
  a.emit('party_ping', { x: 420, y: -30 });
  const ping = await pinged;
  check('a ping lands where it was dropped', ping?.x === 420 && ping?.y === -30);

  const badPing = waitFor(b, 'remote_party_ping', T(800));
  a.emit('party_ping', { x: 'over there' });
  check('and a ping without coordinates is ignored', (await badPing) === null);

  a.close(); b.close();
  console.log(failures ? `\nQUICK CHAT FAILURES: ${failures}\n` : '\nQUICK CHAT OK\n');
  process.exitCode = failures ? 1 : 0;
};

run().catch(e => { console.error(e); process.exitCode = 1; });
