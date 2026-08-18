/**
 * Syncs the ultimate voice clips into public/ and regenerates their catalogue.
 *
 * The clips arrive in a working folder outside public/, so they neither deploy
 * nor get measured on their own. This copies them where the build can see them,
 * measures each one exactly, and rewrites the generated block in SfxLibrary so
 * the cinematic timings are always the real lengths of the real files.
 *
 * Drop `<class>-ultimate.ogg` into the source folder and run:
 *   node tools/sync-ultimate-voices.mjs
 */
import { readdirSync, copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { audioDuration } from './audio-duration.mjs';
import { ULTIMATE_LINES } from '../src/sideview/engine/UltimateDirector.ts';

const SOURCE = 'character-ulti-sound effects';
const DEST = 'public/assets/audio/ultimates';
const CATALOGUE = 'src/sideview/engine/SfxLibrary.ts';
const BEGIN = '// BEGIN GENERATED ultimate voices';
const END = '// END GENERATED ultimate voices';

if (!existsSync(SOURCE)) {
  console.error('no source folder: ' + SOURCE);
  process.exit(1);
}
mkdirSync(DEST, { recursive: true });

const voices = [];
for (const file of readdirSync(SOURCE)) {
  if (!['.ogg', '.wav', '.opus'].includes(extname(file).toLowerCase())) continue;
  const cls = basename(file, extname(file)).replace(/-ultimate$/, '').toLowerCase();
  copyFileSync(join(SOURCE, file), join(DEST, file));
  voices.push({ cls, file, duration: audioDuration(join(DEST, file)) });
}
voices.sort((a, b) => a.cls.localeCompare(b.cls));

const lines = voices
  .map((v) => `  ${v.cls}: { id: 'ult_voice_${v.cls}', src: \`\${ULTVOICE}/${v.file}\`, duration: ${v.duration.toFixed(3)} },`)
  .join('\n');

const block = `${BEGIN}
// Regenerate with: node tools/sync-ultimate-voices.mjs
// Durations are measured from the files, never estimated - the director has to
// know how long to hold before it draws its first frame.
export const ULTIMATE_VOICES: Record<string, UltimateVoice> = {
${lines}
};
${END}`;

const src = readFileSync(CATALOGUE, 'utf8');
const start = src.indexOf(BEGIN);
const stop = src.indexOf(END);
if (start < 0 || stop < 0) {
  console.error('markers not found in ' + CATALOGUE);
  process.exit(1);
}
const updated = src.slice(0, start) + block + src.slice(stop + END.length);
writeFileSync(CATALOGUE, updated);

for (const v of voices) console.log(v.duration.toFixed(3).padStart(7) + ' s  ' + v.cls);
console.log(voices.length + ' voice clip(s) synced to ' + DEST);

// Classes without a clip are not broken - they fall back to the short charge
// sting - so say which are still waiting rather than leaving it to memory.
const have = new Set(voices.map((v) => v.cls));
const missing = Object.keys(ULTIMATE_LINES).filter((c) => !have.has(c));
console.log('');
if (missing.length) {
  console.log('still without a voice line (' + missing.length + '):');
  for (const c of missing) console.log('  ' + c.padEnd(12) + '  ' + ULTIMATE_LINES[c]);
  console.log('');
  console.log('drop <class>-ultimate.ogg into "' + SOURCE + '" and run this again');
} else {
  console.log('every class has a voice line');
}
