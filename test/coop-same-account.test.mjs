/**
 * REPRODUCTION TEST: two devices logged into the SAME account.
 *
 * Both sockets register with the same uuid (what happens when a player logs
 * into one account on their PC and their phone). This is the scenario the main
 * coop-sync suite does NOT cover - it uses two different uuids.
 *
 * Expected if the same-uuid diagnosis is correct: the room ends up with one
 * member, only one socket receives dungeon_start, and relay between the two
 * devices is dead in at least one direction.
 */
import { io } from 'socket.io-client';

const URL = process.env.COOP_TEST_URL || 'http://localhost:3001';

// Same uuid on purpose. Different shortId/name so we can tell them apart.
const UUID = 'uuid-shared-account-xyz';
const PC = { uuid: UUID, name: 'MyPC', shortId: 'SAME01' };
const PHONE = { uuid: UUID, name: 'MyPhone', shortId: 'SAME01' };

const connect = () => new Promise(res => {
  const s = io(URL, { forceNew: true, reconnection: false });
  s.on('connect', () => res(s));
});

const waitFor = (sock, event, ms = 2500) => new Promise(resolve => {
  const t = setTimeout(() => resolve(null), ms);
  sock.once(event, d => { clearTimeout(t); resolve(d); });
});

const run = async () => {
  console.log('\n=== SAME-ACCOUNT CO-OP REPRODUCTION ===');
  console.log(`Both devices use uuid "${UUID}"\n`);

  // Phone hosts.
  const phone = await connect();
  phone.emit('register_player', PHONE);
  phone.emit('create_lobby', { dungeonId: 'goblin_catacombs', ...PHONE });
  const lobby = await waitFor(phone, 'lobby_update');
  console.log(`1. Phone created lobby      : ${lobby ? lobby.roomId : 'FAILED'}`);
  if (!lobby) { phone.disconnect(); process.exit(1); }

  // PC joins on the same account.
  const pc = await connect();
  pc.emit('register_player', PC);
  await new Promise(r => setTimeout(r, 200));

  const phoneStart = waitFor(phone, 'dungeon_start');
  const pcStart = waitFor(pc, 'dungeon_start');
  pc.emit('accept_invite', { roomId: lobby.roomId, ...PC });
  const [ps, cs] = await Promise.all([phoneStart, pcStart]);

  console.log(`2. Phone got dungeon_start  : ${ps ? 'YES  isHost=' + ps.isHost : 'NO  <-- never entered'}`);
  console.log(`3. PC    got dungeon_start  : ${cs ? 'YES  isHost=' + cs.isHost : 'NO  <-- never entered'}`);
  const roster = (ps || cs)?.players;
  console.log(`4. Room member count        : ${roster ? roster.length : 'unknown'}  (should be 2)`);

  // Relay both directions.
  const pcSees = waitFor(pc, 'enemy_sync', 1500);
  phone.emit('enemy_sync', { enemies: [{ id: 'e1', hp: 10 }], waveIndex: 0, dungeonIndex: 0 });
  console.log(`5. HOST(phone) -> PC relay  : ${await pcSees ? 'OK' : 'DEAD'}`);

  const phoneSees = waitFor(phone, 'damage_enemy', 1500);
  pc.emit('damage_enemy', { enemyId: 'e1', damage: 50, facing: 1 });
  console.log(`6. PC -> HOST(phone) relay  : ${await phoneSees ? 'OK' : 'DEAD'}`);

  const broken = !ps || !cs || (roster && roster.length < 2);
  console.log(`\nRESULT: ${broken
    ? 'REPRODUCED - same account collapses the two devices into one player.'
    : 'NOT reproduced - same-uuid theory is WRONG, look elsewhere.'}\n`);

  phone.disconnect(); pc.disconnect();
  process.exit(broken ? 1 : 0);
};

run().catch(e => { console.error('ERROR:', e.message); process.exit(2); });
