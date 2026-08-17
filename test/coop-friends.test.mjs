/**
 * Friends list: add by ID, live presence, invite straight into the party.
 *
 * Runs against the in-memory store when no DATABASE_URL is set, and against
 * Postgres when there is one - the server exposes the same events either way.
 */
import { io } from 'socket.io-client';

const URL = process.env.COOP_TEST_URL || 'http://localhost:3001';
const A = { uuid: 'uuid-fr-a', name: 'Aria', shortId: 'FRAAAA', classId: 'mage', level: 12 };
const B = { uuid: 'uuid-fr-b', name: 'Borin', shortId: 'FRBBBB', classId: 'warrior', level: 9 };

let failures = 0;
const check = (l, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const connect = () => new Promise(r => {
  const s = io(URL, { forceNew: true, reconnection: false });
  s.on('connect', () => r(s));
});
const waitFor = (s, ev, ms = 2000) => new Promise(res => {
  const t = setTimeout(() => res(null), ms);
  s.once(ev, d => { clearTimeout(t); res(d); });
});

const run = async () => {
  console.log('\n=== FRIENDS ===\n');

  const a = await connect(); a.emit('register_player', A);
  const b = await connect(); b.emit('register_player', B);
  await new Promise(r => setTimeout(r, 200));

  // Empty to start.
  let list = (a.emit('friends_request_list'), await waitFor(a, 'friends_list'));
  check('friend list starts empty', !!list && list.friends.length === 0);

  // Unknown id is rejected.
  const errUnknown = waitFor(a, 'friend_error');
  a.emit('friend_add', { shortId: 'NOPE99' });
  check('unknown ID is rejected', !!(await errUnknown));

  // Cannot add yourself.
  const errSelf = waitFor(a, 'friend_error');
  a.emit('friend_add', { shortId: A.shortId });
  check('cannot add yourself', !!(await errSelf));

  // Add B, lowercase to prove the lookup is case-insensitive.
  const aList = waitFor(a, 'friends_list');
  const bList = waitFor(b, 'friends_list');
  a.emit('friend_add', { shortId: B.shortId.toLowerCase() });
  const [al, bl] = await Promise.all([aList, bList]);
  check('adding a friend by ID works (case-insensitive)', !!al && al.friends.length === 1);
  check('friendship is mutual - B sees A too', !!bl && bl.friends.length === 1);
  check('friend entry carries name', !!al && al.friends[0].name === 'Borin');
  check('friend shows as online', !!al && al.friends[0].online === true);
  check('friend shows class and level', !!al && al.friends[0].classId === 'warrior' && al.friends[0].level === 9);
  check('friend is not in a party yet', !!al && al.friends[0].inParty === false);

  // Inviting before having a party is refused.
  const noParty = waitFor(a, 'friend_error');
  a.emit('friend_invite', { uuid: B.uuid });
  const npMsg = await noParty;
  check('invite refused without a party', !!npMsg && /party first/i.test(npMsg.msg));

  // Make a party, then invite the friend into it.
  a.emit('create_lobby', { dungeonId: 'goblin_catacombs', ...A });
  await waitFor(a, 'lobby_state');
  const gotInvite = waitFor(b, 'invite_received');
  a.emit('friend_invite', { uuid: B.uuid });
  const inv = await gotInvite;
  check('friend receives the party invite', !!inv && inv.fromName === 'Aria');
  check('invite carries the room and dungeon', !!inv && !!inv.roomId && inv.dungeonId === 'goblin_catacombs');

  // Accepting shows the friend as partied.
  b.emit('accept_invite', { roomId: inv.roomId, ...B });
  await new Promise(r => setTimeout(r, 250));
  a.emit('friends_request_list');
  const afterJoin = await waitFor(a, 'friends_list');
  check('friend now shows as in a party', !!afterJoin && afterJoin.friends[0].inParty === true);

  // Removal is mutual.
  const aGone = waitFor(a, 'friends_list');
  a.emit('friend_remove', { uuid: B.uuid });
  const ag = await aGone;
  check('removing a friend empties the list', !!ag && ag.friends.length === 0);

  a.disconnect(); b.disconnect();
  console.log(`\n${failures === 0 ? 'FRIENDS OK' : failures + ' FAILURE(S)'}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch(e => { console.error('ERROR:', e.message); process.exit(2); });
