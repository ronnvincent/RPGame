/**
 * Every boss has skills, and no two bosses share one.
 *
 * The bosses all fought identically - walk into range, swing - even though the
 * enemy record already carried specialAttackTimer and currentPhase for exactly
 * this, unread. The requirement was two each and none the same, which is the
 * kind of thing that quietly stops being true as bosses are added, so it is
 * checked rather than remembered.
 */
import { readFileSync } from 'node:fs';

const src = readFileSync('src/sideview/dungeons/BossSkills.ts', 'utf8');
const dungeons = readFileSync('src/sideview/dungeons/DungeonManager.ts', 'utf8');
const vfx = readFileSync('src/sideview/engine/VfxLibrary.ts', 'utf8');
const engine = readFileSync('src/sideview/engine/SideViewEngine.ts', 'utf8');

// Parse the table: a boss name line, then its skills until the closing bracket.
const bosses = new Map();
let current = null;
for (const line of src.split('\n')) {
  const nameLine = line.match(/^  '([^']+)': \[/);
  if (nameLine) { current = nameLine[1]; bosses.set(current, []); continue; }
  if (!current) continue;
  const skill = line.match(/name: '([^']+)', vfx: '([^']+)'/);
  if (skill) bosses.get(current).push({ name: skill[1], vfx: skill[2] });
  if (/^  \],?$/.test(line)) current = null;
}

const vfxIds = new Set([...vfx.matchAll(/^  ([a-z_0-9]+): \{/gm)].map((m) => m[1]));
const bossNames = [...dungeons.matchAll(/name: '([^']+)', type: 'boss'/g)].map((m) => m[1]);

let failures = 0;
const seenVfx = new Map();

console.log(`bosses in the dungeons: ${bossNames.length}`);
console.log('');

for (const name of bossNames) {
  const skills = bosses.get(name);
  if (!skills || skills.length < 2) {
    console.log(`  ${name}: ${skills ? skills.length : 0} skills - needs at least 2`);
    failures++;
    continue;
  }
  console.log(`  ${name.padEnd(26)} ${skills.map((s) => s.name).join(', ')}`);
  for (const s of skills) {
    if (!vfxIds.has(s.vfx)) { console.log(`    unknown effect ${s.vfx}`); failures++; }
    if (seenVfx.has(s.vfx)) { console.log(`    ${s.vfx} is already used by ${seenVfx.get(s.vfx)}`); failures++; }
    seenVfx.set(s.vfx, name);
  }
}

// The table is worthless if nothing reads it.
if (!/updateBossSkills\(enemy, dt\)/.test(engine)) {
  console.log('\n  the engine never runs boss skills');
  failures++;
}

console.log('');
console.log(`distinct effects across all bosses: ${seenVfx.size}`);
console.log(failures === 0 ? 'BOSS SKILLS OK' : `BOSS SKILL FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
