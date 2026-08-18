/**
 * The endless mode is endless, and the forge stops being a shortcut.
 *
 * "Endless Celestial Arena", subtitled "infinite trial", gated behind level 16,
 * held exactly one wave. And the forge sold permanent stats at a flat price
 * with no limit, so a few thousand gold bought more attack than any drop in the
 * game.
 */
import { readFileSync } from 'node:fs';

const dungeons = readFileSync('src/sideview/dungeons/DungeonManager.ts', 'utf8');
const game = readFileSync('src/sideview/SideViewGame.ts', 'utf8');
const town = readFileSync('src/sideview/town/TownHub.ts', 'utf8');

let failures = 0;
const check = (l, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };

// --- Endless ------------------------------------------------------------
check('the arena is marked endless', /endless: true/.test(dungeons));
check('waves past the list are generated', /buildEndlessWave\(dungeon, waveIndex\)/.test(dungeons));
check('generated from the dungeon\'s own cast', /seeds\[waveIndex % seeds\.length\]/.test(dungeons));
check('an endless dungeon never completes', /!dungeon\.endless && this\.currentWaveIndex >= dungeon\.waves\.length/.test(game));
check('the depth reached is recorded', /recordEndlessDepth/.test(game));
check('and survives a restart', /localStorage\.setItem\('bestEndlessWave'/.test(game));
check('the HUD stops claiming a total', /waveLabel\(dungeon\)/.test(game));

// The curve has to be gentle per wave and compounding, or it is either
// trivial forever or a wall at wave three.
const growth = dungeons.match(/Math\.pow\(1\.(\d+), beyond\)/);
check('difficulty compounds with depth', !!growth);
if (growth) {
  const rate = 1 + Number(growth[1]) / 100;
  const at10 = Math.pow(rate, 10).toFixed(1);
  const at30 = Math.pow(rate, 30).toFixed(1);
  console.log(`        +${((rate - 1) * 100).toFixed(0)}% per wave -> x${at10} by wave 10, x${at30} by wave 30`);
  check('wave 10 is harder but not a wall', Number(at10) > 1.4 && Number(at10) < 3);
  check('wave 30 is a real wall', Number(at30) > 4);
}
check('milestones bring the boss back', /isMilestone/.test(dungeons) && /depth % 10 === 0/.test(dungeons));
check('spawn counts are capped', /Math\.min\(9, template\.count/.test(dungeons));

// --- The forge ----------------------------------------------------------
check('the forge price rises with each purchase', /Math\.pow\(1\.4, bought\)/.test(town));
check('purchases are remembered', /localStorage\.setItem\(`forge_\$\{kind\}`/.test(town));
check('each button quotes its own price', (town.match(/this\.forgePrice\('(atk|def|hp)'\)\}G Upgrade/g) || []).length === 3);
check('and each handler charges it', (town.match(/const cost = this\.forgePrice\(/g) || []).length === 3);

const price = (n) => Math.round(150 * Math.pow(1.4, n));
console.log(`        forge attack: ${price(0)}g, ${price(1)}g, ${price(2)}g, ... ${price(9)}g by the tenth`);
check('ten upgrades cost real money now', price(9) > 3000);

console.log('');
console.log(failures === 0 ? 'ENDGAME OK' : `ENDGAME FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
