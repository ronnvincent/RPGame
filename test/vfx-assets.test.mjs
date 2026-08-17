/**
 * Validates that every sprite path in VfxLibrary points at a file that actually
 * exists, and that each declared layout fits inside the real PNG dimensions.
 *
 * A missing or mis-sliced sheet fails silently at runtime (the effect just never
 * draws), so this catches the whole class of bug at build time.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { VFX, allVfxImagePaths } from '../src/sideview/engine/VfxLibrary.ts';
import { CHARACTER_CLASSES } from '../src/sideview/classes/ClassDefinitions.ts';

const PUBLIC = 'public';
let failures = 0;

function fail(msg) {
  console.log(`  FAIL  ${msg}`);
  failures++;
}

function pngSize(file) {
  const b = readFileSync(file);
  if (b.slice(1, 4).toString() !== 'PNG') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

console.log(`\nChecking ${Object.keys(VFX).length} effects / ${allVfxImagePaths().length} images\n`);

// 1. Every referenced image exists.
for (const p of allVfxImagePaths()) {
  if (!existsSync(join(PUBLIC, p))) fail(`missing file: ${p}`);
}

// 2. Declared slicing fits the real image.
for (const [id, def] of Object.entries(VFX)) {
  const l = def.layout;

  if (l.kind === 'frames') {
    if (l.paths.length === 0) fail(`${id}: no frames`);
    continue;
  }

  const file = join(PUBLIC, def.src);
  if (!existsSync(file)) continue; // already reported above
  const size = pngSize(file);
  if (!size) { fail(`${id}: not a PNG`); continue; }

  if (l.kind === 'strip') {
    const needW = l.dir === 'h' ? l.frameW * l.count : l.frameW;
    const needH = l.dir === 'v' ? l.frameH * l.count : l.frameH;
    if (needW > size.w || needH > size.h) {
      fail(`${id}: strip needs ${needW}x${needH} but image is ${size.w}x${size.h}`);
    } else if (l.dir === 'h' && size.w % l.frameW !== 0) {
      fail(`${id}: width ${size.w} is not a multiple of frameW ${l.frameW}`);
    } else if (l.dir === 'v' && size.h % l.frameH !== 0) {
      fail(`${id}: height ${size.h} is not a multiple of frameH ${l.frameH}`);
    }
  } else {
    const needW = l.frameW * l.cols;
    const needH = l.frameH * l.rows;
    if (needW > size.w || needH > size.h) {
      fail(`${id}: grid needs ${needW}x${needH} but image is ${size.w}x${size.h}`);
    }
    if ((l.count ?? 0) > l.cols * l.rows) {
      fail(`${id}: count ${l.count} exceeds ${l.cols}x${l.rows} cells`);
    }
  }
}

// 3. Every skill's declared effect ids resolve, and every skill has visuals.
let skillCount = 0;
for (const cls of CHARACTER_CLASSES) {
  for (const skill of cls.skills) {
    skillCount++;
    const v = skill.vfx || {};
    for (const slot of ['cast', 'projectile', 'impact']) {
      const id = v[slot];
      if (id && !VFX[id]) fail(`${cls.id}/${skill.name}: unknown ${slot} effect "${id}"`);
    }
    if (!v.cast && !v.projectile && !v.impact) {
      fail(`${cls.id}/${skill.name}: has no visuals at all`);
    }
  }
}

// 4. Damage numbers quoted in descriptions match the real multiplier.
for (const cls of CHARACTER_CLASSES) {
  for (const skill of cls.skills) {
    const m = skill.description.match(/(\d+)%/g);
    if (!m || skill.damageMultiplier === 0) continue;
    const actual = Math.round(skill.damageMultiplier * 100);
    const quoted = m.map(s => parseInt(s));
    // A description may quote per-hit values, so only flag when nothing matches
    // the total and the total is not derivable from a quoted per-hit number.
    const plausible = quoted.some(q => q === actual || (actual % q === 0) || (q % actual === 0));
    if (!plausible) {
      fail(`${cls.id}/${skill.name}: description says ${quoted.join('/')}% but multiplier is ${actual}%`);
    }
  }
}

console.log(`Checked ${skillCount} skills across ${CHARACTER_CLASSES.length} classes`);
console.log(`\n${failures === 0 ? 'ALL VFX ASSETS OK' : failures + ' PROBLEM(S)'}\n`);
process.exit(failures === 0 ? 0 : 1);
