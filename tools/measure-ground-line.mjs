/**
 * Finds where a pack's walkable surface sits inside its layer art.
 *
 * Packs that bake the ground into a full-scene layer put the surface at some
 * fraction of the image height that only the artist knows. Guessing it leaves
 * the characters standing in the dirt or hovering over the grass, so the theme
 * declares the fraction and the renderer aligns the scene to the play line.
 *
 * Usage:  node tools/measure-ground-line.mjs <ground-layer.png>
 */
import { decodePng } from './analyze-spritesheet.mjs';

const file = process.argv[2];
if (!file) { console.error('usage: measure-ground-line.mjs <file.png>'); process.exit(2); }

const { width, height, alpha } = decodePng(file);
const rowCoverage = (y) => {
  let n = 0;
  for (let x = 0; x < width; x++) if (alpha[y * width + x] > 8) n++;
  return n / width;
};

// Scan from the middle down: the grass tips come first, then the row where the
// surface is properly solid. The solid row is the one to stand on.
let tips = -1;
let solid = -1;
for (let y = Math.floor(height * 0.35); y < height; y++) {
  const c = rowCoverage(y);
  if (tips < 0 && c > 0.02) tips = y;
  if (solid < 0 && c > 0.5) { solid = y; break; }
}

if (solid < 0) {
  console.log('no solid ground row found - is this a ground layer?');
  process.exit(1);
}

console.log(`${width}x${height}  ${file}`);
console.log(`  grass tips   y=${tips}`);
console.log(`  solid surface y=${solid}`);
console.log(`  groundLine: ${(solid / height).toFixed(4)}   <- fraction of image height`);
