/**
 * A friend below the dungeon's level cannot be invited into it.
 *
 * Nothing stopped this before: the requirement existed only as a number printed
 * on a world map card, so a high level host could pull a level 1 friend into a
 * dungeon meant for level 14. Both sides are told now, because from the
 * invitee's side an invite that silently never arrives looks like a broken
 * connection rather than a refusal.
 */
import { io } from 'socket.io-client';

const URL = process.env.COOP_TEST_URL || 'http://localhost:3001';
const SLOW = !!process.env.COOP_TEST_URL;
const T = ms => (SLOW ? ms * 3 : ms);
const RUN = Math.random().toString(36).slice(2, 8);

const HOST = { uuid: `uuid-lgh-${RUN}`, name: 'Vera', shortId: `LH${RUN}`.toUpperCase(), classId: 'mage', level: 20 };
const LOW  = { uuid: `uuid-lgl-${RUN}`, name: 'Pip', shortId: `LL${RUN}`.toUpperCase(), classId: 'archer', level: 1 };
const HIGH = { uuid: `uuid-lgx-${RUN}`, name: 'Rook', shortId: `LX${RUN}`.toUpperCase(), classId: 'warrior', level: 14 };

let failures = 0;
const check = (l, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const connect = () => new Promise(r => {
  const s = io(URL, { forceNew: true, reconnection: false });
  s.on('connect', () => r(s));
});
const waitFor = (s, ev, ms = T(1500)) => new Promise(res => {
  const t = setTimeout(() => res(null), ms);
  s.once(ev, d => { clearTimeout(t); res(d); });
});
const invite = (s, targetShortId, who) => new Promise(res => {
  s.emit('send_invite', { targetShortId, uuid: who.uuid, name: who.name, shortId: who.shortId }, res);
  setTimeout(() => res(null), T(1500));
});

const run = async () => {
  console.log('\n=== CO-OP LEVEL GATE ===\n');

  const host = await connect(); host.emit('register_player', HOST);
  const low = await connect(); low.emit('register_player', LOW);
  const high = await connect(); high.emit('register_player', HIGH);
  await new Promise(r => setTimeout(r, T(250)));

  // A level 9 dungeon.
  host.emit('create_lobby', { dungeonId: 'dragon_lair', minLevel: 9, ...HOST });
  await waitFor(host, 'lobby_update');

  // The under-levelled friend is refused, and hears about it.
  const blocked = waitFor(low, 'invite_blocked', T(2000));
  const lowRes = await invite(host, LOW.shortId, HOST);
  const lowMsg = await blocked;

  check('host is told the invite failed', !!lowRes && lowRes.success === false);
  check('the reason names the level needed', !!lowRes && /Lv\. 9/.test(lowRes.msg || ''));
  check('the reason names the friend', !!lowRes && /Pip/.test(lowRes.msg || ''));
  check('the invited player is told too', !!lowMsg && /Lv\. 9/.test(lowMsg.msg || ''));
  check('no invite reached the under-levelled player', !(await waitFor(low, 'invite_received', T(500))));

  // Someone who meets it goes through as before.
  const received = waitFor(high, 'invite_received', T(2000));
  const highRes = await invite(host, HIGH.shortId, HOST);
  check('a friend who meets the level is invited', !!highRes && highRes.success === true);
  check('and actually receives the invite', !!(await received));

  [host, low, high].forEach(s => s.close());
  console.log('');
  console.log(failures === 0 ? 'LEVEL GATE OK' : `LEVEL GATE FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch(e => { console.error(e); process.exit(1); });
