/**
 * Measures where each hero actually sits inside its frame.
 *
 * The packs do not agree on framing. Chierit's are 288x128 with the character
 * centred and standing on the bottom edge; the necromancer's 140x93 frames put
 * it 36px right of centre; the dragoon's 725x445 frames leave 98px of empty
 * space under its feet. Drawing them all with one anchor is why some heroes
 * stand off to the side of the platform and others float above it.
 *
 * This reports the tight content box of each class's first idle frame, plus the
 * correction needed to put the character's centre on the centre line and its
 * feet on the floor.
 *
 * Usage:  node tools/measure-hero-anchors.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { decodePng } from './analyze-spritesheet.mjs';
import { HERO_SPRITES } from '../src/sideview/engine/HeroSprites.ts';

/** Tight alpha bounds within a sub-rectangle of an image. */
function contentBox(file, x0, y0, w, h) {
  const { width, alpha } = decodePng(file);
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (alpha[y * width + x] < 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX - x0, y: minY - y0, w: maxX - minX + 1, h: maxY - minY + 1 };
}

console.log('class         frame      content box            centre off   feet gap   drawn h');
console.log('-'.repeat(84));

for (const [cls, set] of Object.entries(HERO_SPRITES)) {
  const strip = set.strips?.idle;
  const file = strip ? 'public' + strip : `public/assets/heroes/${cls}/idle/0.png`;
  if (!existsSync(file)) {
    console.log(`${cls.padEnd(13)} MISSING ${file}`);
    continue;
  }

  const box = contentBox(file, 0, 0, set.frameW, set.frameH);
  if (!box) {
    console.log(`${cls.padEnd(13)} empty first frame`);
    continue;
  }

  // How far the character's horizontal centre is from the frame's centre, and
  // how much dead space sits between its feet and the bottom of the frame.
  const centreOff = (box.x + box.w / 2) - set.frameW / 2;
  const feetGap = set.frameH - (box.y + box.h);

  console.log(
    cls.padEnd(13) +
    `${set.frameW}x${set.frameH}`.padEnd(11) +
    `x:${String(box.x).padStart(4)} y:${String(box.y).padStart(4)} ${String(box.w).padStart(4)}x${String(box.h).padStart(4)}`.padEnd(23) +
    (centreOff >= 0 ? '+' : '') + centreOff.toFixed(1).padStart(6) +
    feetGap.toString().padStart(11) +
    (box.h * set.scale).toFixed(0).padStart(10)
  );
}

console.log('');
console.log('centre off: pixels the character sits right of frame centre (frame space)');
console.log('feet gap  : empty pixels below the feet - anything above 0 floats');
console.log('drawn h   : on-screen height after scale - these should be close to equal');
