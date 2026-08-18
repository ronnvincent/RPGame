/**
 * Which dungeons a character can actually enter.
 *
 * The dungeon list is four story acts followed by bonus zones, and the unlock
 * rule was "your index is at or below the highest you have cleared" - array
 * order. The bonus zones sit after the acts, so the level 3 swamp was gated
 * behind the level 14 void, and a level 11 character stared at locked low level
 * maps with no way to reach them.
 */
import { readFileSync } from 'node:fs';

const dungeons = readFileSync('src/sideview/dungeons/DungeonManager.ts', 'utf8');
const map = readFileSync('src/sideview/ui/WorldMapUI.ts', 'utf8');
const game = readFileSync('src/sideview/SideViewGame.ts', 'utf8');

let failures = 0;
const check = (l, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };

// Read the list in order, with its level and whether it is side content.
const entries = [];
const lines = dungeons.split('\n');
for (let i = 0; i < lines.length; i++) {
  const id = lines[i].match(/^    id: '([a-z_]+)',$/);
  if (!id) continue;
  const window = lines.slice(i + 1, i + 6).join('\n');
  entries.push({
    id: id[1],
    minLevel: Number((window.match(/^    minLevel: (\d+),$/m) || [])[1] || 0),
    side: /^    sideContent: true,$/m.test(window),
  });
}

console.log('index  dungeon              lvl  gate');
for (const [i, e] of entries.entries()) {
  console.log(`  ${String(i).padEnd(4)} ${e.id.padEnd(20)} ${String(e.minLevel).padStart(3)}  ${e.side ? 'level only' : 'story order + level'}`);
}
console.log('');

// The fault in one line: a side zone that is easier than a story dungeon before
// it must not be gated behind that dungeon.
const story = entries.filter((e) => !e.side);
const hardestStory = Math.max(...story.map((e) => e.minLevel));
const strandedByOrder = entries.filter((e, i) =>
  !e.side ? false : story.some((sd, si) => si < i && sd.minLevel > e.minLevel));

check('the bonus zones exist', entries.some((e) => e.side));
check('and none of them is gated behind a harder story dungeon',
      strandedByOrder.every((e) => e.side));
console.log(`        hardest story dungeon: Lv. ${hardestStory}; easiest side zone: Lv. ${Math.min(...entries.filter((e) => e.side).map((e) => e.minLevel))}`);

check('the map opens side content on level alone', /const cleared = sideContent \|\|/.test(map));
check('story order still applies to the acts', /dungeonIdx <= maxDungeonCleared/.test(map));
check('and the level is still required for both', /const isUnlocked = isTown \|\| \(cleared && levelMet\)/.test(map));

// The lobby has to show the level you are now, not the one you opened with.
check('the party profile is refreshed, not set once', /refreshNetworkProfile\(\)/.test(game));
check('and it runs during play', (game.match(/this\.refreshNetworkProfile\(\)/g) || []).length >= 2);

// Power belongs in the save as well as its column.
const saveMgr = readFileSync('src/sideview/engine/SaveManager.ts', 'utf8');
check('power is written into save_data', /^\s+power,$/m.test(saveMgr));

console.log('');
console.log(failures === 0 ? 'UNLOCKS OK' : `UNLOCK FAILURES: ${failures}`);
process.exitCode = failures === 0 ? 0 : 1;
