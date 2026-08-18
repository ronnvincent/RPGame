/**
 * The project compiles clean.
 *
 * Three type errors were carried all through this work as "pre-existing", and
 * every one of them turned out to be a real bug: two asked for beaconColor when
 * the property is beamColor, so the beacon marking a legendary drop had never
 * been drawn even once, and one asked for bg instead of bgColor, so every
 * rarity fell back to the same white halo.
 *
 * Errors that are known and tolerated stop being read. This keeps the count at
 * zero so the next one is noticed on the day it appears.
 */
import { execFileSync } from 'node:child_process';

let output = '';
try {
  // No shell: passing args through one concatenates rather than escapes them,
  // which Node now warns about.
  const tsc = process.platform === 'win32' ? 'node_modules/.bin/tsc.cmd' : 'node_modules/.bin/tsc';
  output = execFileSync(tsc, ['--noEmit'], { encoding: 'utf8', maxBuffer: 1 << 24 });
} catch (err) {
  output = (err.stdout || '') + (err.stderr || '');
}

const errors = output.split('\n').filter((l) => /error TS\d+/.test(l));

console.log(`type errors: ${errors.length}`);
for (const line of errors.slice(0, 20)) console.log('  ' + line.trim());

console.log('');
console.log(errors.length === 0 ? 'TYPECHECK OK' : `TYPECHECK FAILURES: ${errors.length}`);
process.exitCode = errors.length === 0 ? 0 : 1;
