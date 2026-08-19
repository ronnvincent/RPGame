/**
 * The lobby as a staging screen.
 *
 * It used to be a stacked panel: slots, two input boxes and a friends list in
 * one column. Everything it could do is still here, but it moved into tabs
 * behind a stage - your character standing large, the run's details listed
 * under them, and the open party slots as crests beside them.
 *
 * Two things it could not do before are the point of the change: joining a
 * party without knowing anybody, and seeing that who you brought matters.
 */
import { io } from 'socket.io-client';
import { readFileSync } from 'node:fs';

const URL = process.env.COOP_TEST_URL || 'http://localhost:3001';
const SLOW = !!process.env.COOP_TEST_URL;
const T = ms => (SLOW ? ms * 3 : ms);
const RUN = Math.random().toString(36).slice(2, 8);
const HOST = { uuid: `uuid-lsa-${RUN}`, name: 'Opener', shortId: `SA${RUN}`.toUpperCase(), classId: 'warrior', level: 12, power: 4200 };
const SEEKER = { uuid: `uuid-lsb-${RUN}`, name: 'Seeker', shortId: `SB${RUN}`.toUpperCase(), classId: 'priest', level: 12, power: 3100 };
const LOWBIE = { uuid: `uuid-lsc-${RUN}`, name: 'Novice', shortId: `SC${RUN}`.toUpperCase(), classId: 'mage', level: 2, power: 300 };

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

const lobby = readFileSync('src/sideview/ui/CoopLobbyUI.ts', 'utf8');
const synergy = readFileSync('src/sideview/network/PartySynergy.ts', 'utf8');
const mobileCss = readFileSync('src/sideview/ui/MobileUI.ts', 'utf8');
const net = readFileSync('src/sideview/network/NetworkManager.ts', 'utf8');
const game = readFileSync('src/sideview/SideViewGame.ts', 'utf8');

const run = async () => {
  console.log('\n=== LOBBY STAGE ===\n');

  // --- Nothing the old panel did was dropped -----------------------------
  ['cl-inv', 'cl-addf', 'cl-finv', 'cl-frem', 'cl-mic', 'cl-spk', 'cl-leave', 'cl-start', 'cl-ready']
    .forEach(hook => check(`the ${hook} control survived the redesign`, lobby.includes(hook)));

  // --- The stage ---------------------------------------------------------
  check('there is a stage rather than a panel', /cl-stage/.test(lobby) && /cl-topo/.test(lobby));
  check('the party slots are crests', /clip-path: polygon/.test(lobby));
  check('your character stands on it', /cl-hero-img/.test(lobby) && /heroFrame\(cls, 'idle'/.test(lobby));
  check('and breathes, rather than being one still frame',
    /setInterval/.test(lobby) && /this\.idleFrame\+\+/.test(lobby));
  check('the loop is torn down with the lobby, not left running',
    /clearInterval\(this\.idleTimer\)/.test(lobby));
  check('the key legend is bound, not decorative',
    /bindKeys/.test(lobby) && /e\.code === 'Escape'/.test(lobby) && /e\.code === 'KeyQ'/.test(lobby));
  check('and typing in a box does not trigger those keys', /tagName === 'INPUT'/.test(lobby));
  check('the key listener is removed on close, so it cannot pile up',
    /removeEventListener\('keydown', this\.keyHandler\)/.test(lobby));
  check('a member crest shows what they bring', /cl-crest-power/.test(lobby) && /PWR/.test(lobby));

  // --- It is a screen, not a dialog ---------------------------------------
  // Measured in the browser: the lobby came out 1229px wide in a 1280 viewport,
  // exactly 96vw, because MobileUI listed it among the centred modals and
  // capped it at 96vw / 94dvh with padding. It was a panel when that was
  // written. It is fixed, full bleed and above the HUD layer now.
  check('the lobby fills the screen rather than sitting in it',
    /position: fixed; inset: 0/.test(lobby));
  check('and is no longer sized like a dialog', !/coop-lobby/.test(mobileCss));
  check('it out-ranks the HUD, which used to paint over it',
    /z-index: 400/.test(lobby));

  // --- Four cards, and yours is one of them --------------------------------
  check('your character stands in your own card, not beside the stage',
    /crests: string\[\] = \[this\.crest\(me, heroSrc\)\]/.test(lobby) && !/cl-hero">/.test(lobby));
  check('and there are four of them', /for \(let i = 0; i < max - 1; i\+\+\)/.test(lobby));
  check('yours is marked so you can find it', /cl-crest\.is-me/.test(lobby));
  check('the cards keep their width instead of collapsing', /flex: none;/.test(lobby));

  // --- Somebody is always listening for the start --------------------------
  // The start handler was set only by createLobby and by an accepted invite.
  // Quick join deliberately passes none, so anyone who had not been invited yet
  // this session had it null: the host pressed START, the rest of the party
  // entered the dungeon, and that player sat in the lobby watching nothing.
  check('there is a standing dungeon-start handler', /public onDungeonStart\(/.test(net));
  check('and it is registered once at startup, not per invite',
    /mod\.network\.onDungeonStart\(/.test(game));
  check('so quick join can pass none without leaving nobody to receive it',
    /if \(data\?\.roomId\) this\.acceptInvite\(data\.roomId\);/.test(net)
    && /if \(onStart\) this\.onDungeonStartCb = onStart;/.test(net));

  // Power moves when you equip or forge, while the level stands still.
  check('a power change alone still reaches the party cards',
    /this\.profile\.power === profile\.power/.test(net));

  // --- Composition means something ---------------------------------------
  check('a party of one gets no bonus', /present\.length < 2\) return NO_SYNERGY/.test(synergy));
  check('the strongest bonus applies rather than a stack', /Read in order, best first/.test(synergy));
  check('and a party of clones trades safety for damage', /warband/.test(synergy) && /def: 0\.95/.test(synergy));

  // --- Joining without knowing anybody -----------------------------------
  const a = await connect(); a.emit('register_player', HOST);
  const b = await connect(); b.emit('register_player', SEEKER);
  const c = await connect(); c.emit('register_player', LOWBIE);
  await new Promise(r => setTimeout(r, T(300)));

  const made = waitFor(a, 'lobby_update', T(2500));
  a.emit('create_lobby', { dungeonId: 'crypt_damned', minLevel: 9, ...HOST });
  const room = await made;
  const roomId = room?.roomId || room?.room?.roomId;
  check('a party can be opened', !!roomId);

  b.emit('browse_lobbies');
  const list = await waitFor(b, 'lobby_list', T(2000));
  const found = list?.lobbies?.find(l => l.roomId === roomId);
  check('a stranger can see it without an invite', !!found);
  check('and is told who and what before joining',
    found?.hostName === HOST.name && found?.minLevel === 9 && found?.members === 1);

  c.emit('browse_lobbies');
  const lowList = await waitFor(c, 'lobby_list', T(2000));
  check(
    'but a party above their level is not offered to them',
    !lowList?.lobbies?.some(l => l.roomId === roomId),
  );

  // lobby_state is the one that carries the roster; lobby_update is the
  // lighter create/join acknowledgement.
  const joined = new Promise(res => {
    const onState = d => {
      if ((d?.members || []).length === 2) { a.off('lobby_state', onState); res(d); }
    };
    a.on('lobby_state', onState);
    setTimeout(() => { a.off('lobby_state', onState); res(null); }, T(3000));
  });
  b.emit('quick_join');
  const room2 = await waitFor(b, 'quick_join_room', T(2000));
  check('quick join finds a party for them', room2?.roomId === roomId);
  b.emit('accept_invite', { roomId: room2.roomId, ...SEEKER });
  const full = await joined;

  const members = full?.members || [];
  check('and they land in the same room', members.length === 2);

  const seeker = members.find(m => m.name === SEEKER.name);
  check('carrying the power their crest will show', (seeker?.power || 0) === SEEKER.power);

  c.emit('quick_join');
  const denied = await waitFor(c, 'lobby_error', T(2000));
  check('someone with nothing to join is told plainly', /No open parties/.test(denied?.msg || ''));

  a.close(); b.close(); c.close();
  console.log(failures ? `\nLOBBY STAGE FAILURES: ${failures}\n` : '\nLOBBY STAGE OK\n');
  process.exitCode = failures ? 1 : 0;
};

run().catch(e => { console.error(e); process.exitCode = 1; });
