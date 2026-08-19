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

// On mobile every slot is positioned individually, so a slot with no rule of
// its own lands wherever the container happens to default to. The potion had no
// rule and sat on the joystick. Rather than trust the eye, do the arithmetic:
// pull both rules out of the stylesheet and prove they cannot touch.
//
// The rules are found by what they contain, not by where they sit. Slicing from
// the first @media broke the moment an unrelated media query was added above.
const ruleFor = (selector, mustHave) => {
  const found = [];
  const needle = selector + ' {';
  for (let i = hud.indexOf(needle); i !== -1; i = hud.indexOf(needle, i + 1)) {
    const end = hud.indexOf('}', i);
    if (end === -1) break;
    found.push(hud.slice(i, end + 1));
  }
  return found.find(r => r.includes(mustHave)) || '';
};

const px = (rule, prop) => {
  const m = rule.match(new RegExp(prop + ':[^;]*?([0-9]+)px'));
  return m ? Number(m[1]) : NaN;
};

const potionRule = ruleFor('.potion-slot', 'right: auto');
const joystickRule = ruleFor('.mobile-joystick-area', 'width');
const potionLeft = px(potionRule, 'left');
const potionWidth = px(potionRule, 'width');
const stickLeft = px(joystickRule, 'left');
const stickWidth = px(joystickRule, 'width');

check('the potion has a place of its own on mobile', Number.isFinite(potionLeft) && Number.isFinite(potionWidth));
check('it is not pinned to the right with the skills', /right: auto/.test(potionRule));
check(
  'it clears the joystick horizontally, so a heal is never a stray step',
  Number.isFinite(stickLeft) && Number.isFinite(stickWidth) && potionLeft >= stickLeft + stickWidth,
);
check('and is a full-size target, not the smallest button on screen', potionWidth >= 58);

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
