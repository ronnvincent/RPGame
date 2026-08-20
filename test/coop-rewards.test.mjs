/**
 * What a run leaves behind: a record of who did what, and a reason to bring
 * people along.
 *
 * A cleared dungeon used to end with a fanfare and nothing else. Nothing
 * tracked contribution, so four people in a party learned nothing about the
 * run they had just shared - and co-op paid exactly the same as going alone,
 * which made playing alone the sensible choice.
 */
import { io } from 'socket.io-client';
import { readFileSync } from 'node:fs';

const URL = process.env.COOP_TEST_URL || 'http://localhost:3001';
const SLOW = !!process.env.COOP_TEST_URL;
const T = ms => (SLOW ? ms * 3 : ms);
const RUN = Math.random().toString(36).slice(2, 8);
const A = { uuid: `uuid-rwa-${RUN}`, name: 'Striker', shortId: `WA${RUN}`.toUpperCase(), classId: 'berserker', level: 12 };
const B = { uuid: `uuid-rwb-${RUN}`, name: 'Medic', shortId: `WB${RUN}`.toUpperCase(), classId: 'priest', level: 12 };

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

const engine = readFileSync('src/sideview/engine/SideViewEngine.ts', 'utf8');
const game = readFileSync('src/sideview/SideViewGame.ts', 'utf8');
const summary = readFileSync('src/sideview/ui/RunSummaryUI.ts', 'utf8');

const run = async () => {
  console.log('\n=== RUN SUMMARY & PARTY REWARDS ===\n');

  // --- The tally is honest ---------------------------------------------
  check(
    'damage dealt is credited only for blows we struck',
    /if \(!fromRemote\) this\.damageDealt \+= finalDamage/.test(engine),
  );
  check(
    'and so are kills, so a replayed packet cannot inflate a teammate',
    /if \(!fromRemote\) this\.killCount\+\+/.test(engine),
  );
  check('damage taken is counted too', /this\.damageTaken \+= finalDamage/.test(engine));
  check('and revives given', /this\.revivesGiven\+\+/.test(engine));

  // --- The card ---------------------------------------------------------
  check('the summary ranks by damage', /sort\(\(a, b\) => b\.damageDealt - a\.damageDealt\)/.test(summary));
  check('and awards an MVP badge', /rs-badge">MVP/.test(summary));
  check('but not to a party of one', /ranked\.length > 1/.test(summary));
  check('it shows after a clear and after a defeat',
    /showRunSummary\(\s*'DUNGEON CLEARED'/.test(game) && /showRunSummary\('DEFEATED'/.test(game));
  check('a missing teammate does not hold up the card', /setTimeout\(draw, 900\)/.test(game));

  // --- One panel at a time at the end of a run ----------------------------
  // The summary and the victory gateway both opened on a clear, so two panels
  // sat on screen together, one half behind the other, and neither said which
  // to answer first.
  check('the gateway waits for the summary to be dismissed',
    /const openGateway = \(\) =>/.test(game) && /this\.runSummary\.onClose = openGateway/.test(game));
  check('rematch goes straight back in without asking where next',
    /onRematch = \(\) => this\.loadDungeon\(this\.currentDungeonIndex, true\)/.test(game));
  check('and a defeat cannot inherit the gateway from the last clear',
    /this\.runSummary\.onClose = null/.test(game));

  // --- Bringing people pays ---------------------------------------------
  check('party size scales EXP', /PARTY_EXP_PER_MEMBER/.test(engine) && /\(members - 1\) \* SideViewEngine\.PARTY_EXP_PER_MEMBER/.test(engine));
  check('and the bonus is visible when it applies', /% party\)/.test(engine));
  check('a common drop does not spam the party', /rarity !== 'common' && network\.isPartied/.test(engine));

  // --- The wire ---------------------------------------------------------
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

  const heardStats = waitFor(b, 'remote_party_stats', T(2000));
  a.emit('party_stats', { name: A.name, classId: A.classId, damageDealt: 48120, damageTaken: 3300, kills: 41, revives: 1 });
  const stats = await heardStats;
  check('a teammate learns what you contributed', stats?.damageDealt === 48120 && stats?.kills === 41);
  check('and who it belongs to', stats?.name === A.name && !!stats?.socketId);

  const heardLoot = waitFor(b, 'remote_party_support', T(2000));
  a.emit('party_support', { kind: 'loot', casterName: A.name, itemName: 'Dragonfang', rarity: 'legendary' });
  const loot = await heardLoot;
  check('and sees what you found', loot?.kind === 'loot' && loot?.itemName === 'Dragonfang');

  a.close(); b.close();
  console.log(failures ? `\nREWARDS FAILURES: ${failures}\n` : '\nREWARDS OK\n');
  process.exitCode = failures ? 1 : 0;
};

run().catch(e => { console.error(e); process.exitCode = 1; });
