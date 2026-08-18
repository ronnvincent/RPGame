/**
 * The visual effects of an ultimate must last as long as its voice line.
 *
 * That is a timing contract between three separate files - the measured clip
 * length in SfxLibrary, the frame count and fps of the effect in VfxLibrary,
 * and the pacing in SideViewEngine - so nothing in the code makes it obvious
 * when one drifts from the others. This recomputes the schedule the engine
 * uses and checks the last effect finishes inside the clip, and close enough
 * to the end that the screen is not empty while the character is still
 * speaking.
 */
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { ULTIMATE_VOICES } from '../src/sideview/engine/SfxLibrary.ts';
import { vfxDuration } from '../src/sideview/engine/VfxLibrary.ts';
import { ULT_LEAD_IN } from '../src/sideview/engine/UltimateDirector.ts';

// Must match playUltimatePayload.
const SPACING = 0.42;
/** Largest acceptable silence-with-no-effect at the end of a clip. */
const MAX_TAIL_GAP = 0.9;

const classes = readFileSync('src/sideview/classes/ClassDefinitions.ts', 'utf8');

function ultimateVfxFor(classId) {
  // The ultimate is the skill in that class's block carrying isUltimate.
  const start = classes.indexOf(`id: '${classId}'`);
  if (start < 0) return null;
  const block = classes.slice(start, start + 12000);
  const line = block.split('\n').find((l) => l.includes('isUltimate: true'));
  if (!line) return null;
  const m = line.match(/ultimate: '([^']+)'/);
  return m ? m[1] : null;
}

let failures = 0;
const names = Object.keys(ULTIMATE_VOICES);
console.log(`voice lines: ${names.length}`);

for (const cls of names) {
  const voice = ULTIMATE_VOICES[cls];

  if (!existsSync('public' + voice.src)) {
    console.log(`  ${cls}: MISSING FILE ${voice.src}`);
    failures++;
    continue;
  }

  const vfxId = ultimateVfxFor(cls);
  if (!vfxId) {
    console.log(`  ${cls}: no ultimate vfx found in ClassDefinitions`);
    failures++;
    continue;
  }

  const effectLen = vfxDuration(vfxId) || 0.5;
  const holdFor = Math.max(0, voice.duration - ULT_LEAD_IN);
  const window_ = Math.max(0, holdFor - effectLen);

  let lastStart = 0;
  for (let t = SPACING; t <= window_ + 1e-6; t += SPACING) lastStart = t;

  const endsAt = ULT_LEAD_IN + lastStart + effectLen;
  const gap = voice.duration - endsAt;
  const waves = lastStart > 0 ? Math.round(lastStart / SPACING) + 1 : 1;

  const overruns = endsAt > voice.duration + 1e-6;
  const tooShort = gap > MAX_TAIL_GAP;
  const status = overruns ? 'OVERRUNS THE CLIP' : tooShort ? 'STOPS TOO EARLY' : 'ok';
  if (overruns || tooShort) failures++;

  console.log(
    `  ${cls.padEnd(12)} clip ${voice.duration.toFixed(2)}s  ` +
    `effect ${vfxId} ${effectLen.toFixed(2)}s  ` +
    `${waves} waves  ends ${endsAt.toFixed(2)}s  gap ${gap.toFixed(2)}s  ${status}`
  );
}

console.log(failures === 0 ? 'ULTIMATE TIMING OK' : `ULTIMATE TIMING FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
