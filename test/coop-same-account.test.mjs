/**
 * Regression: two devices signed into the same account are distinct actors.
 * Saves/friends still use the shared account UUID; party membership uses a
 * stable per-device actorId so PC and phone do not replace one another.
 */
import { io } from 'socket.io-client';

const URL = process.env.COOP_TEST_URL || 'http://localhost:3001';
const RUN = Math.random().toString(36).slice(2, 8);
const UUID = `uuid-shared-account-${RUN}`;
const PC = { uuid: UUID, actorId: `actor-pc-${RUN}`, name: 'MyPC', shortId: `SP${RUN}`.toUpperCase() };
const PHONE = { uuid: UUID, actorId: `actor-phone-${RUN}`, name: 'MyPhone', shortId: `SP${RUN}`.toUpperCase() };

let failures = 0;
const check = (label, condition) => {
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}`);
  if (!condition) failures++;
};

const connect = () => new Promise(resolve => {
  const socket = io(URL, { forceNew: true, reconnection: false });
  socket.on('connect', () => resolve(socket));
});

const waitFor = (socket, event, ms = 2500) => new Promise(resolve => {
  const timer = setTimeout(() => resolve(null), ms);
  socket.once(event, data => { clearTimeout(timer); resolve(data); });
});

const run = async () => {
  console.log('\n=== SAME-ACCOUNT CO-OP ===\n');

  const phone = await connect();
  phone.emit('register_player', PHONE);
  phone.emit('create_lobby', { dungeonId: 'goblin_catacombs', ...PHONE });
  const lobby = await waitFor(phone, 'lobby_update');
  check('phone created a lobby', !!lobby?.roomId);
  if (!lobby) {
    phone.close();
    process.exit(1);
  }

  const pc = await connect();
  pc.emit('register_player', PC);
  pc.emit('accept_invite', { roomId: lobby.roomId, ...PC });
  const joined = await waitFor(pc, 'lobby_state');
  check('same-account PC joins as a second actor', joined?.members?.length === 2);
  check('party actor keys are distinct', new Set(joined?.members?.map(member => member.uuid)).size === 2);
  check('raw account UUID is not exposed in the lobby', joined?.members?.every(member => member.uuid !== UUID));

  pc.emit('lobby_ready', { ready: true });
  await new Promise(resolve => setTimeout(resolve, 100));
  const phoneStart = waitFor(phone, 'dungeon_start');
  const pcStart = waitFor(pc, 'dungeon_start');
  phone.emit('lobby_start');
  const [hostStart, guestStart] = await Promise.all([phoneStart, pcStart]);
  check('phone enters as host', hostStart?.isHost === true);
  check('PC enters as guest', guestStart?.isHost === false);
  check('run roster contains both devices', hostStart?.players?.length === 2);

  const pcSees = waitFor(pc, 'enemy_sync', 1500);
  phone.emit('enemy_sync', { enemies: [{ id: 'e1', hp: 10 }], waveIndex: 0, dungeonIndex: 0 });
  check('host phone state reaches PC', (await pcSees)?.enemies?.[0]?.id === 'e1');

  const phoneSees = waitFor(phone, 'damage_enemy', 1500);
  pc.emit('damage_enemy', { enemyId: 'e1', damage: 50, facing: 1 });
  check('PC damage intent reaches host phone', (await phoneSees)?.damage === 50);

  phone.close();
  pc.close();
  console.log(`\n${failures ? `${failures} FAILURE(S)` : 'SAME-ACCOUNT CO-OP OK'}\n`);
  process.exit(failures ? 1 : 0);
};

run().catch(error => {
  console.error('ERROR:', error.message);
  process.exit(2);
});
