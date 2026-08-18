/**
 * Shows how long representative fights actually last.
 *
 * Balance was one-sided in both directions at once: a mid-tier skill killed
 * most monsters outright, while flat defence subtraction meant weak monsters
 * dealt exactly the 1-damage minimum no matter what they hit. Numbers alone in
 * a diff cannot show whether that is fixed, so this recomputes the same
 * formulas the engine uses and prints the resulting fight lengths.
 *
 * It fails only on the extremes - a monster dying to one hit, or a fight so
 * long it is a chore - so the numbers stay tunable without the test fighting
 * the designer.
 */
import { readFileSync } from 'node:fs';

const engine = readFileSync('src/sideview/engine/SideViewEngine.ts', 'utf8');
const dungeons = readFileSync('src/sideview/dungeons/DungeonManager.ts', 'utf8');

const num = (src, re, label) => {
  const m = src.match(re);
  if (!m) throw new Error('could not read ' + label);
  return Number(m[1]);
};

const B = {
  enemyAtk: num(engine, /enemyAtk:\s*([\d.]+)/, 'enemyAtk'),
  playerDamage: num(engine, /playerDamage:\s*([\d.]+)/, 'playerDamage'),
  crit: num(engine, /critMultiplier:\s*([\d.]+)/, 'critMultiplier'),
  defenceK: num(engine, /defenceK:\s*([\d.]+)/, 'defenceK'),
  hpScale: num(dungeons, /ENEMY_HP_SCALE = ([\d.]+)/, 'ENEMY_HP_SCALE'),
};

const afterDef = (raw, def) => raw * (1 - def / (def + B.defenceK));

// A level-appropriate hero and the monsters of the first dungeon.
const hero = { atk: 70, def: 22 };
const foes = [
  { name: 'Green Slime', hp: 80, atk: 12, def: 5 },
  { name: 'Goblin Rogue', hp: 130, atk: 18, def: 8 },
  { name: 'Orc Berserker', hp: 350, atk: 30, def: 18, elite: true },
  { name: 'Warlord Grimjaw', hp: 1000, atk: 42, def: 25, boss: true },
];
const skills = [
  { name: 'basic', mult: 0.75 },
  { name: 'mid skill', mult: 2.2 },
  { name: 'ultimate', mult: 7.2 },
];

console.log(`balance: playerDamage x${B.playerDamage}, enemyAtk x${B.enemyAtk}, hp x${B.hpScale}, defenceK ${B.defenceK}`);
console.log('');
console.log('monster            hp   hits(basic/mid/ult)   its hit on you   hits to kill you');
console.log('-'.repeat(80));

let failures = 0;
const HERO_HP = 500;

for (const f of foes) {
  const hp = Math.round(f.hp * B.hpScale);
  const hits = skills.map((s) => {
    const dmg = Math.max(1, Math.round(afterDef(hero.atk * s.mult * B.playerDamage, f.def)));
    return Math.ceil(hp / dmg);
  });
  const incoming = Math.max(1, Math.round(afterDef(f.atk * B.enemyAtk, hero.def)));
  const toKillHero = Math.ceil(HERO_HP / incoming);

  console.log(
    f.name.padEnd(18) + String(hp).padStart(4) + '   ' +
    hits.join(' / ').padEnd(21) + '   ' +
    String(incoming).padStart(3) + ' dmg' + '        ' +
    String(toKillHero).padStart(3)
  );

  // A monster that dies to one mid-tier hit is the original complaint.
  if (!f.boss && hits[1] < 2) { console.log(`    ${f.name} still dies to one mid skill`); failures++; }
  // And one that takes forever is the opposite mistake. An elite is meant to
  // outlast ordinary monsters, so it gets its own ceiling rather than being
  // waved through under the general one.
  const ceiling = f.boss ? Infinity : f.elite ? 20 : 12;
  if (hits[1] > ceiling) { console.log(`    ${f.name} takes ${hits[1]} mid hits - too spongy`); failures++; }
  // Being unable to hurt the hero was the other half of the imbalance.
  if (toKillHero > 60) { console.log(`    ${f.name} needs ${toKillHero} hits to threaten the hero`); failures++; }
}

console.log('');
console.log(failures === 0 ? 'COMBAT BALANCE OK' : `COMBAT BALANCE FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
