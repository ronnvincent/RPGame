/**
 * Every theme must draw ground under the player.
 *
 * Nothing in the renderer ever filled below groundY - each branch painted the
 * sky down to the play line and stopped - and backdrop art is transparent under
 * its silhouette, so the band beneath the character was whatever colour the sky
 * happened to be. The platform support legs ran down through it and disguised
 * the gap for a long time; removing them exposed a void in every dungeon.
 *
 * A theme therefore has to declare either ground tiles or a floor colour, and a
 * theme still on the legacy branch has to have a legacy floor.
 */
import { MAPS, THEMES_WITHOUT_ART, LEGACY_FLOORS } from '../src/sideview/engine/MapLibrary.ts';
import { readFileSync } from 'node:fs';

let failures = 0;

// Themes the engine can actually select, read from the union type so a new one
// cannot be added to the game and quietly skipped here.
const src = readFileSync('src/sideview/engine/SpriteManager.ts', 'utf8');
const line = src.split('\n').find((l) => l.startsWith('type BattleTheme'));
const themes = [...line.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);

console.log(`themes the engine can select: ${themes.length}`);

for (const theme of themes) {
  const map = MAPS[theme];

  if (!map) {
    if (!THEMES_WITHOUT_ART.includes(theme)) {
      console.log(`  ${theme}: no map entry and not listed in THEMES_WITHOUT_ART`);
      failures++;
    } else if (!LEGACY_FLOORS[theme]) {
      console.log(`  ${theme}: on the legacy branch with no floor - renders a void`);
      failures++;
    } else {
      console.log(`  ${theme.padEnd(11)} legacy branch, floor ${LEGACY_FLOORS[theme].body}`);
    }
    continue;
  }

  if (!map.ground && !map.floor) {
    console.log(`  ${theme}: has neither ground tiles nor a floor colour - renders a void`);
    failures++;
    continue;
  }

  const kind = map.ground ? `ground tiles (${map.ground.tile}px)` : `floor ${map.floor.body}`;
  // A theme with no layers still renders - sky over ground - but it is a
  // placeholder, so say so rather than letting it read as finished.
  const note = map.layers.length === 0 ? '   <- awaiting new art' : '';
  console.log(`  ${theme.padEnd(11)} ${String(map.layers.length).padStart(2)} layers, ${kind}${note}`);
}

console.log(failures === 0 ? 'MAP COMPLETENESS OK' : `MAP COMPLETENESS FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
