/**
 * Every dungeon must state the level it requires, and the map must gate on it.
 *
 * minLevel was declared on the dungeon interface and never given a value, so
 * `nextDungeon.minLevel || 1` always read 1 and the check passed for everyone.
 * The world map, meanwhile, unlocked a dungeon purely on having cleared the one
 * before it - the level printed on each card was decoration. Between them there
 * was no working requirement anywhere, which is why a level 1 character could
 * walk into a dungeon meant for level 14.
 */
import { readFileSync } from 'node:fs';

// Read the source rather than importing it: DungeonManager imports its
// neighbours without file extensions, which Node's ESM resolver rejects.
const dungeonSrc = readFileSync('src/sideview/dungeons/DungeonManager.ts', 'utf8');
const game = readFileSync('src/sideview/SideViewGame.ts', 'utf8');
const hud = readFileSync('src/sideview/ui/GameHUD.ts', 'utf8');
const mapSrc = readFileSync('src/sideview/ui/WorldMapUI.ts', 'utf8');

// Walk the lines: an id line, then minLevel if the dungeon declares one.
const DUNGEONS = [];
const lines = dungeonSrc.split('\n');
for (let i = 0; i < lines.length; i++) {
  const idMatch = lines[i].match(/^    id: '([a-z_]+)',$/);
  if (!idMatch) continue;
  let minLevel;
  for (let k = i + 1; k < Math.min(i + 6, lines.length); k++) {
    const lv = lines[k].match(/^    minLevel: (\d+),$/);
    if (lv) { minLevel = Number(lv[1]); break; }
    if (/^    id: '/.test(lines[k])) break;
  }
  DUNGEONS.push({ id: idMatch[1], minLevel });
}

let failures = 0;

console.log('dungeon              minLevel');
console.log('-'.repeat(34));
for (const d of DUNGEONS) {
  const lvl = d.minLevel;
  console.log(d.id.padEnd(21) + (lvl === undefined ? 'MISSING' : String(lvl)));
  if (lvl === undefined) failures++;
}

// The map has to read the requirement from the dungeon, not keep its own copy,
// or the number on the card drifts from the number enforced.
if (!/requiredLevel\s*=\s*dungeon\?\.minLevel/.test(mapSrc)) {
  console.log('\n  world map does not take its requirement from the dungeon');
  failures++;
}
// And it has to actually gate on it.
if (!/const isUnlocked = isTown \|\| \(cleared && levelMet\)/.test(mapSrc)) {
  console.log('  world map does not gate on the level');
  failures++;
}

console.log('');
// The prologue had no gate at all and replayed on every open. Keyed to the
// account, so a new character still gets the story and a returning player does
// not sit through it again.
if (!/prologueSeen:\$\{uuid\}/.test(game) || !/localStorage.setItem\(seenKey/.test(game)) {
  console.log('  FAIL  the prologue is shown once per account');
  failures++;
} else console.log('  PASS  the prologue is shown once per account');

// The wave index has already advanced when the last wave clears, so the banner
// read "Wave 5/4" on the final one.
if (!/Math\.min\(this\.currentWaveIndex \+ 1, total\)/.test(game)) {
  console.log('  FAIL  the wave counter cannot exceed its own total');
  failures++;
} else console.log('  PASS  the wave counter cannot exceed its own total');

// Every run needs its own rung on the ladder - two at Lv 12 read as a
// duplicate, and the cards came out in the order the runs were added rather
// than the order you meet them.
{
  const lv = [...dungeonSrc.matchAll(/minLevel: (\d+)/g)].map((m) => Number(m[1]));
  const dupes = [...new Set(lv.filter((v, i) => lv.indexOf(v) !== i))];
  if (dupes.length) {
    console.log('  FAIL  no two runs share a level (found ' + dupes.join(', ') + ')');
    failures++;
  } else console.log('  PASS  no two runs share a level (' + lv.length + ' runs)');

  const map = readFileSync('src/sideview/ui/WorldMapUI.ts', 'utf8');
  const sortedForReading = /const ordered = \[\.\.\.WorldMapUI\.LOCATIONS\]\.sort/.test(map)
    && /const ordered = DUNGEONS\.map\(\(d, i\) => \(\{ d, i \}\)\)/.test(hud);
  if (!sortedForReading) {
    console.log('  FAIL  the map and the picker list runs in level order');
    failures++;
  } else console.log('  PASS  the map and the picker list runs in level order');

  // Sorting the array itself would change which runs unlock which.
  if (/DUNGEONS\.sort\(/.test(hud) || /LOCATIONS\.sort\(/.test(map)) {
    console.log('  FAIL  the source arrays are sorted in place, which moves story order');
    failures++;
  } else console.log('  PASS  and neither sorts the array itself, so story order holds');
}

console.log(failures === 0 ? 'PROGRESSION OK' : `PROGRESSION FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
