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
// Power must not move when a buff lands: it describes what you have built, not
// what you are doing this second.
// Bounded to the method itself. A fixed character count ran past the end of it
// and picked up a neighbour's use of totalAtk, so the check failed on code that
// was already correct.
const powerStart = engine.indexOf('public computePower');
const powerBody = engine.slice(powerStart, engine.indexOf(String.fromCharCode(10) + '  }', powerStart));
// Comments stripped: the method explains what it used to read, and the check
// was matching that explanation rather than the code it describes.
const powerCode = powerBody.split(String.fromCharCode(10))
  .filter((l) => !l.trim().startsWith('//'))
  .join(String.fromCharCode(10));
check('power ignores buffed totals', !/totalAtk|totalDef|totalCrit|totalSpeed/.test(powerCode));
check('and is built from base stats instead', /p\.baseAtk/.test(powerBody) && /p\.baseDef/.test(powerBody));
check('counting equipment', /p\.equipment/.test(powerBody));
check('and forge upgrades', /forge_hp/.test(powerBody));
check('and level', /p\.level/.test(powerBody));

for (const part of ['baseAtk', 'baseDef', 'p.level']) {
  check(`  it counts ${part}`, new RegExp(part.replace('.', '\.')).test(powerBody));
}
check('  and equipment rarity on top of its stats', /rarityValue/.test(powerBody));
check('power travels with the save', /power,\s*\n\s*className/.test(saveMgr) || /power,/.test(saveMgr));
check('and is recomputed on every save', /this\.computePower\(\)\)/.test(engine));

// An account that existed before the power column defaults to zero and is
// filtered off the board. A returning player used to only load, never save, so
// they stayed invisible - which makes a played-in game look like an empty
// leaderboard.
const gameSrc = readFileSync('src/sideview/SideViewGame.ts', 'utf8');
check('opening the game registers power once', /this\.engine\.triggerSave\(\);/.test(gameSrc));
check('for returning players too, not only new ones',
      !/else \{[\s\S]{0,200}SaveManager\.saveGame/.test(gameSrc));

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
// The point is that the ordering uses a stored figure, whichever column or
// JSON field it came from - not that the SQL is spelled a particular way.
check('it ranks by the stored figure', /ORDER BY power DESC/.test(server));
check('and the figure falls back to the save when the column is empty',
      /NULLIF\(save_data->'playerState'->>'power', ''\)::int/.test(server));
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

  // The level board is the same rows in a different order, so the thing worth
  // checking is that the order actually changes.
  const byLevel = await fetch(`${URL}/api/leaderboard?limit=25&sort=level`).then((r) => r.json());
  const lvlEntries = byLevel.entries || [];
  const lvlStrong = lvlEntries.findIndex((e) => e.shortId === strong.shortId);
  const lvlWeak = lvlEntries.findIndex((e) => e.shortId === weak.shortId);
  check('there is a level board', Array.isArray(lvlEntries) && lvlEntries.length > 0);
  check('the higher level ranks first on it', lvlStrong >= 0 && lvlWeak >= 0 && lvlStrong < lvlWeak);
  check('and it is ordered by level, not power', lvlEntries.every((e, i, a) => i === 0 || a[i - 1].level >= e.level));

  // An account that has a save but has never reported power is the common case
  // for anyone who played before power existed. Its real level lives in
  // save_data, and reading power_level instead is what showed a board full of
  // level 1 players to someone who knew better.
  const old = { uuid: `lb-old-${RUN}`, username: `Old${RUN}`, shortId: `LO${RUN}`.toUpperCase() };
  await post('/api/register_guest', old);
  await post('/api/save', {
    uuid: old.uuid,
    saveData: { playerState: { level: 33, characterClass: { name: 'Paladin' } } },
    // No power sent, exactly like a client from before the column existed.
  });

  const board = await fetch(`${URL}/api/leaderboard?limit=50&sort=level`).then((r) => r.json());
  const found = (board.entries || []).find((e) => e.shortId === old.shortId);
  check('a player who never reported power still appears', !!found);
  check('with the real level from their save, not the column default', found?.level === 33);
  check('and the real class from their save', found?.className === 'Paladin');
  check('they are not claimed to have power', (found?.power || 0) === 0);

  const powerBoard = await fetch(`${URL}/api/leaderboard?limit=50`).then((r) => r.json());
  check('they appear on the power board too', (powerBoard.entries || []).some((e) => e.shortId === old.shortId));
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
