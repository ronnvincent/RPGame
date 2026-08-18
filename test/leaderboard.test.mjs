/**
 * Total Power and the rankings it feeds.
 *
 * Power is computed on the client and stored with the save it was computed
 * from, so the board can never show a figure for state the server does not
 * have. The server ranks the stored number and never recomputes it - a second
 * copy of the formula would drift from the first and nobody would know which
 * was right.
 */
import { readFileSync } from 'node:fs';

const URL = process.env.COOP_TEST_URL || 'http://localhost:3001';
const engine = readFileSync('src/sideview/engine/SideViewEngine.ts', 'utf8');
const saveMgr = readFileSync('src/sideview/engine/SaveManager.ts', 'utf8');
const hud = readFileSync('src/sideview/ui/GameHUD.ts', 'utf8');
const board = readFileSync('src/sideview/ui/LeaderboardUI.ts', 'utf8');
const server = readFileSync('server/index.js', 'utf8');

let failures = 0;
const check = (l, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };

// --- The number ---------------------------------------------------------
check('power is computed from the totals', /public computePower\(\)/.test(engine));
for (const part of ['totalAtk', 'totalDef', 'maxHp', 'maxMp', 'totalCrit', 'totalSpeed', 'p.level']) {
  check(`  it counts ${part}`, new RegExp(part.replace('.', '\.')).test(engine.slice(engine.indexOf('public computePower'), engine.indexOf('public computePower') + 1600)));
}
check('  and equipment rarity on top of its stats', /rarityValue/.test(engine));
check('power travels with the save', /power,\s*\n\s*className/.test(saveMgr) || /power,/.test(saveMgr));
check('and is recomputed on every save', /this\.computePower\(\)\)/.test(engine));

// --- The display --------------------------------------------------------
check('it is on the player panel', /hud-power/.test(hud));
check('kept live rather than only at render', /computePower\(\)\.toLocaleString\(\)/.test(hud));
check('there is a rankings button', /toggle-rank-btn/.test(hud));
check('your own row is marked', /lb-row-me/.test(board));
check('the top three are marked', /lb-row-top/.test(board));
check('an empty board explains itself', /No ranked players yet/.test(board));
check('and an unreachable one does too', /Could not reach the rankings/.test(board));

// --- The server ---------------------------------------------------------
check('the server stores power with the save', /UPDATE users SET save_data = \$1, power = \$2/.test(server));
check('it works without a database too', /if \(!HAS_DB\)[\s\S]{0,400}rec\.power = score/.test(server));
check('it ranks by the stored figure', /ORDER BY power DESC/.test(server));
check('and never recomputes it', !/computePower/.test(server));

// --- Live, against the running server ------------------------------------
try {
  const res = await fetch(`${URL}/api/leaderboard?limit=5`);
  const body = await res.json();
  check('the endpoint answers', body && body.success === true);
  check('with an entries list', Array.isArray(body.entries));
  console.log(`        ranked players right now: ${body.entries?.length ?? 0}`);
} catch (err) {
  check(`the endpoint answers (${err.message})`, false);
}

// --- The whole round trip ------------------------------------------------
// Shape checks pass happily while the flow is broken, so this actually writes
// two players and reads the board back.
const RUN = Math.random().toString(36).slice(2, 7);
const post = (path, body) => fetch(`${URL}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).then((r) => r.json());

try {
  const weak = { uuid: `lb-weak-${RUN}`, username: `Weak${RUN}`, shortId: `LW${RUN}`.toUpperCase() };
  const strong = { uuid: `lb-strong-${RUN}`, username: `Strong${RUN}`, shortId: `LS${RUN}`.toUpperCase() };

  await post('/api/register_guest', weak);
  await post('/api/register_guest', strong);

  await post('/api/save', { uuid: weak.uuid, saveData: { playerState: {} }, power: 4200, className: 'Mage', level: 11 });
  await post('/api/save', { uuid: strong.uuid, saveData: { playerState: {} }, power: 9100, className: 'Warrior', level: 20 });

  const body = await fetch(`${URL}/api/leaderboard?limit=25`).then((r) => r.json());
  const entries = body.entries || [];
  const iWeak = entries.findIndex((e) => e.shortId === weak.shortId);
  const iStrong = entries.findIndex((e) => e.shortId === strong.shortId);

  check('a saved player appears on the board', iStrong >= 0 && iWeak >= 0);
  check('higher power ranks first', iStrong >= 0 && iWeak >= 0 && iStrong < iWeak);
  check('the stored power is what comes back', entries[iStrong]?.power === 9100);
  check('with the class and level shown', entries[iStrong]?.className === 'Warrior' && entries[iStrong]?.level === 20);
  check('ranks are numbered from one', entries[0]?.rank === 1);
} catch (err) {
  check(`the round trip completes (${err.message})`, false);
}

console.log('');
console.log(failures === 0 ? 'LEADERBOARD OK' : `LEADERBOARD FAILURES: ${failures}`);

// Set the code and let the process drain. Calling process.exit() here killed it
// while fetch still held handles open, and Node aborted on the way out - so the
// exit code reported a crash whatever the tests had found, which makes the
// result unusable to anything reading it.
process.exitCode = failures === 0 ? 0 : 1;
