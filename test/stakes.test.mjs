/**
 * The three things that make a fight matter: a cost to casting, a cost to
 * dying, and a boss that changes when it is hurt.
 *
 * All three existed as dead scaffolding. Every skill cost 0 mana and mana was
 * never spent, so the blue bar filled up and did nothing and the correct play
 * was to press whatever was off cooldown. Dying set an animation state and
 * nothing else - no defeat, nothing lost, so the game could not be lost.
 * `phases: 2` was declared on three bosses and never read.
 */
import { readFileSync } from 'node:fs';

const classes = readFileSync('src/sideview/classes/ClassDefinitions.ts', 'utf8');
const engine = readFileSync('src/sideview/engine/SideViewEngine.ts', 'utf8');
const game = readFileSync('src/sideview/SideViewGame.ts', 'utf8');

let failures = 0;
const check = (l, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };

// --- Casting costs something -------------------------------------------
const skills = [...classes.matchAll(/manaCost: (\d+)[^\n]*?damageMultiplier: ([\d.]+)/g)]
  .map((m) => ({ cost: Number(m[1]), mult: Number(m[2]), ult: /isUltimate: true/.test(m[0]) }));
const ults = [...classes.matchAll(/manaCost: (\d+)[^\n]*isUltimate: true/g)].map((m) => Number(m[1]));

console.log(`skills read: ${skills.length}, ultimates: ${ults.length}`);
check('not every skill is free any more', skills.some((s) => s.cost > 0));
check('ultimates are the most expensive', ults.length > 0 && ults.every((c) => c >= 60));
check('mana is actually deducted', /p\.mp = Math\.max\(0, p\.mp - cost\)/.test(engine));
check('and a cast is refused when short', /NOT ENOUGH MANA/.test(engine));

// The bar has to be able to refill, or a cost is just a lockout.
const regen = engine.match(/p\.mp \+ \(p\.maxMp \* ([\d.]+)\) \* dt/);
check('mana regenerates', !!regen);
if (regen) {
  const perSecond = Number(regen[1]) * 100;
  const worst = Math.max(...ults);
  console.log(`        regen ${perSecond}%/s, dearest ultimate ${worst} of 100 -> ~${(worst / perSecond).toFixed(1)}s to afford`);
  check('an ultimate is affordable again within its own cooldown', worst / perSecond < 22);
}

// --- Dying costs something ---------------------------------------------
check('death raises a defeat', /this\.onRunLost\?\.\(\)/.test(engine));
check('and only once per run', /if \(!this\.runOver\)/.test(engine));
check('the run returns to town', /loadTownHub\(true\)/.test(game));
check('unclaimed loot is left behind', /droppedLoots = \[\]/.test(game));
check('but banked progress is kept', !/player\.gold = 0|player\.exp = 0/.test(game));

// --- The boss changes when hurt ----------------------------------------
check('phase two triggers at half health', /enemy\.hp <= enemy\.maxHp \* 0\.5/.test(engine));
check('only for bosses that declare two phases', /\(enemy\.phases \|\| 1\) >= 2/.test(engine));
check('and it is announced', /IS ENRAGED/.test(engine));
check('phase two presses harder', /skill\.cooldown \* 0\.6/.test(engine));
check('the skill rotation no longer borrows currentPhase', /bossRotation/.test(engine));

console.log('');
console.log(failures === 0 ? 'STAKES OK' : `STAKES FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
