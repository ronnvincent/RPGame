/**
 * Object measurer for sheets that are not grids.
 *
 * analyze-spritesheet.mjs finds frame grids from transparent gutters, which is
 * right for animation strips but wrong for asset sheets like PolyStyle's
 * Houses/Props, where objects sit at irregular positions and sizes. This walks
 * the alpha channel and flood-fills each opaque blob instead, so every object's
 * box is measured rather than assumed.
 *
 * Usage:  node tools/measure-blobs.mjs <file.png> [minPixels]
 */
import { decodePng } from './analyze-spritesheet.mjs';

const file = process.argv[2];
const minPixels = Number(process.argv[3] || 4000);
const { width, height, alpha } = decodePng(file);
const alphaAt = (x, y) => alpha[y * width + x];

const seen = new Uint8Array(width * height);
const boxes = [];
const stack = [];

for (let sy = 0; sy < height; sy++) {
  for (let sx = 0; sx < width; sx++) {
    const start = sy * width + sx;
    if (seen[start] || alphaAt(sx, sy) < 8) continue;

    let x0 = sx, x1 = sx, y0 = sy, y1 = sy, count = 0;
    stack.push(start);
    seen[start] = 1;

    while (stack.length) {
      const i = stack.pop();
      const x = i % width;
      const y = (i / width) | 0;
      count++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;

      // Eight-way, so a one-pixel diagonal join does not split an object.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (seen[j] || alphaAt(nx, ny) < 8) continue;
          seen[j] = 1;
          stack.push(j);
        }
      }
    }

    if (count >= minPixels) boxes.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
}

boxes.sort((a, b) => a.x - b.x || a.y - b.y);
console.log(`${width}x${height}  ->  ${boxes.length} objects (min ${minPixels}px)`);
for (const b of boxes) {
  console.log(`  x:${String(b.x).padStart(4)} y:${String(b.y).padStart(4)}` +
              ` w:${String(b.w).padStart(4)} h:${String(b.h).padStart(4)}` +
              `   ratio ${(b.w / b.h).toFixed(2)}`);
}
