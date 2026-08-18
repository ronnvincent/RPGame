/**
 * Measures every monster sheet: frame count, and where the creature sits inside
 * its frame.
 *
 * drawFantasyMob hardcoded 4 or 8 frames per animation and a magic offset of 85
 * for the feet, for every monster regardless of its sheet. Frame counts that do
 * not match the sheet play blank or clipped frames, and one offset cannot suit
 * creatures of different sizes - which is why they sat above or sank into the
 * ground.
 *
 * Usage:  node tools/measure-mob-frames.mjs
 */
import { existsSync } from 'node:fs';
import { decodePng } from './analyze-spritesheet.mjs';

const SHEETS = {
  skel: { dir: '/assets/monsters/Skeleton', files: { idle: 'Idle', walk: 'Walk', atk: 'Attack', hit: 'Take Hit', death: 'Death' } },
  gob:  { dir: '/assets/monsters/Goblin', files: { idle: 'Idle', run: 'Run', atk: 'Attack', hit: 'Take Hit', death: 'Death' } },
  eye:  { dir: '/assets/monsters/Flying eye', files: { flight: 'Flight', atk: 'Attack', hit: 'Take Hit', death: 'Death' } },
  mush: { dir: '/assets/monsters/Mushroom', files: { idle: 'Idle', run: 'Run', atk: 'Attack', hit: 'Take Hit', death: 'Death' } },
};

const FRAME = 150;

// The bosses and the orc use their own frame sizes and layouts: the orc is a
// grid of 100px cells, NightBorne one 80x100 strip, and the reaper a folder of
// numbered frames per animation.
const WIDE = {
  orc: {
    frameW: 100, frameH: 100,
    dir: '/assets/tiny-rpg/Characters(100x100 split)/Orc/Orc with shadows',
    files: { idle: 'Orc_Idle', walk: 'Orc_Walk', atk1: 'Orc_Attack01', atk2: 'Orc_Attack02', hurt: 'Orc_Hurt', death: 'Orc_Death' },
  },
  nightborne: {
    frameW: 80, frameH: 100,
    dir: '/assets/nightborne', files: { sheet: 'NightBorne' },
  },
};

function frameBox(file, frameIndex, frameW, frameH) {
  const { width, alpha } = decodePng(file);
  const x0 = frameIndex * frameW;
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = 0; y < frameH; y++) {
    for (let x = x0; x < x0 + frameW; x++) {
      if (alpha[y * width + x] < 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX - x0, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

for (const [mob, def] of Object.entries(WIDE)) {
  for (const [anim, base] of Object.entries(def.files)) {
    const file = 'public' + def.dir + '/' + base + '.png';
    if (!existsSync(file)) { console.log(`${mob} ${anim}: MISSING ${file}`); continue; }
    const { width, height } = decodePng(file);
    const frames = Math.round(width / def.frameW);
    const rows = Math.round(height / def.frameH);
    const box = frameBox(file, 0, def.frameW, def.frameH);
    const centreOff = box ? (box.x + box.w / 2) - def.frameW / 2 : 0;
    const feetGap = box ? def.frameH - (box.y + box.h) : 0;
    console.log(
      `${mob} ${anim}`.padEnd(20) + `${width}x${height}`.padEnd(12) +
      `${frames}x${rows} frames`.padEnd(14) +
      (box ? `${box.w}x${box.h}`.padEnd(10) : 'empty'.padEnd(10)) +
      `centreOff ${centreOff.toFixed(1).padStart(6)}   feetGap ${String(feetGap).padStart(4)}`
    );
  }
}
console.log('');

console.log('mob   anim     sheet        frames  content        centreOff  feetGap');
console.log('-'.repeat(76));

for (const [mob, def] of Object.entries(SHEETS)) {
  for (const [anim, base] of Object.entries(def.files)) {
    const file = 'public' + def.dir + '/' + base + '.png';
    if (!existsSync(file)) { console.log(`${mob.padEnd(6)}${anim.padEnd(9)}MISSING ${file}`); continue; }
    const { width, height } = decodePng(file);
    const frames = Math.round(width / FRAME);
    const box = frameBox(file, 0, FRAME, height);
    const centreOff = box ? (box.x + box.w / 2) - FRAME / 2 : 0;
    const feetGap = box ? height - (box.y + box.h) : 0;
    console.log(
      mob.padEnd(6) + anim.padEnd(9) +
      `${width}x${height}`.padEnd(13) +
      String(frames).padStart(4) + '   ' +
      (box ? `${box.w}x${box.h}`.padEnd(14) : 'empty'.padEnd(14)) +
      (centreOff >= 0 ? '+' : '') + centreOff.toFixed(1).padStart(6) +
      String(feetGap).padStart(9)
    );
  }
}
