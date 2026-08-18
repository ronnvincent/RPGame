/**
 * Potions reachable in a fight, and elites that are worth the risk.
 *
 * Potions existed but only through the inventory screen, which cannot be opened
 * while a boss is chasing you - so in the one fight where a potion matters it
 * may as well not have been there. And a wave of identical monsters is the same
 * fight every time.
 */
import { readFileSync } from 'node:fs';

const engine = readFileSync('src/sideview/engine/SideViewEngine.ts', 'utf8');
const hud = readFileSync('src/sideview/ui/GameHUD.ts', 'utf8');
const game = readFileSync('src/sideview/SideViewGame.ts', 'utf8');
const dungeons = readFileSync('src/sideview/dungeons/DungeonManager.ts', 'utf8');

let failures = 0;
const check = (l, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };

// --- Potion in reach ----------------------------------------------------
check('there is a quick heal', /public quickHeal\(\)/.test(engine));
check('it is on the hotbar with the skills', /potion-slot/.test(hud));
check('and on the keyboard', /e\.code === 'KeyQ'/.test(game));
check('it spends the smallest potion that covers the wound',
      /candidates\.find\(\(c\) => c\.item\.consumableEffect!\.value >= missing\)/.test(engine));
check('it says why nothing happened', /No healing potions/.test(hud) && /Already at full health/.test(hud));
check('the slot shows how many are left', /potionCount/.test(engine) && /potion-count/.test(hud));

// --- Elites -------------------------------------------------------------
const chance = dungeons.match(/ELITE_SPAWN_CHANCE = ([\d.]+)/);
check('elites can spawn', !!chance);
if (chance) {
  const pct = Number(chance[1]) * 100;
  console.log(`        elite chance ${pct}% of ordinary monsters`);
  check('rare enough to be an event', pct > 0 && pct <= 20);
}
check('only the rank and file are promoted', /enemyTemplate\.type === 'mob' && Math\.random\(\)/.test(dungeons));
check('an elite is tougher', /ENEMY_HP_SCALE \* \(isElite \? 2\.4 : 1\)/.test(dungeons));
check('and hits harder', /isElite \? 1\.45 : 1/.test(dungeons));
check('it is named as one', /Elite \$\{enemyTemplate\.name\}/.test(dungeons));
check('it is marked on screen before you engage it', /isElite/.test(engine) && /rgba\(248, 113, 113/.test(engine));
check('and it pays better', /isElite \? 2\.5 : 1/.test(dungeons) && /isElite \? 3 : 1/.test(dungeons));
check('with a better drop table', /isElite\s*\n?\s*\? getRandomLoot\('mid'\)/.test(dungeons));

console.log('');
console.log(failures === 0 ? 'ENCOUNTERS OK' : `ENCOUNTER FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
