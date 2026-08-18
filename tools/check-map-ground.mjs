/**
 * Checks that every theme actually has something under the characters.
 *
 * Two different faults produce the same complaint of "no ground". A pack whose
 * art stops above the play line leaves a bare band; a pack whose art reaches the
 * bottom but fades out has no edge to read as a surface. Both look like
 * standing on nothing, and neither is visible from the theme data alone.
 *
 * Usage:  node tools/check-map-ground.mjs
 */
import { existsSync } from 'node:fs';
import { decodePng } from './analyze-spritesheet.mjs';
import { MAPS } from '../src/sideview/engine/MapLibrary.ts';

// The engine's own geometry: the play line sits 75px above the bottom of a
// 440px virtual view.
const VIEW_H = 440;
const PLAY_LINE = (VIEW_H - 75) / VIEW_H;

function artExtent(file) {
  const { width, height, alpha } = decodePng(file);
  let lastAny = -1;
  let firstSolid = -1;
  for (let y = 0; y < height; y++) {
    let n = 0;
    for (let x = 0; x < width; x++) if (alpha[y * width + x] > 8) n++;
    if (firstSolid < 0 && n > width * 0.5) firstSolid = y;
    if (n > 0) lastAny = y;
  }
  return { solid: firstSolid / height, bottom: (lastAny + 1) / height };
}

console.log(`play line sits at ${PLAY_LINE.toFixed(4)} of the view`);
console.log('');

let problems = 0;

for (const [name, map] of Object.entries(MAPS)) {
  const kind = map.ground ? 'ground tiles'
    : map.groundLine ? (map.softGround ? 'baked ground, softened' : 'baked ground')
    : 'floor band';

  if (!map.layers.length) { console.log(`${name.padEnd(11)} no layers`); continue; }

  // The frontmost layer is the one the characters stand against.
  const last = map.layers[map.layers.length - 1];
  const file = 'public' + last.src;
  if (!existsSync(file)) { console.log(`${name.padEnd(11)} MISSING ${last.src}`); problems++; continue; }

  const { bottom } = artExtent(file);
  const anchored = map.groundLine ? 'groundLine' : (last.anchor || 'fill');

  // A floor band drawn in front covers any shortfall, so only a baked-ground
  // theme without softening can leave a visible gap.
  const covered = Boolean(map.ground) || Boolean(map.floor && (!map.groundLine || map.softGround));
  const gap = !covered && bottom < PLAY_LINE + 0.02;

  console.log(
    name.padEnd(11) + kind.padEnd(24) + anchored.padEnd(11) +
    'art ends ' + bottom.toFixed(4) + (gap ? '   <- BARE BAND under the play line' : '   ok')
  );
  if (gap) problems++;
}

console.log('');
console.log(problems === 0 ? 'ALL THEMES HAVE GROUND' : `THEMES WITHOUT GROUND: ${problems}`);
process.exit(problems === 0 ? 0 : 1);
