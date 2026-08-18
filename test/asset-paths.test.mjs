/**
 * Every asset the source references must resolve to a real file, and every
 * skill sound id must exist in the catalogue.
 *
 * These fail silently at runtime - a missing sprite just never draws, a missing
 * sound throws once in the console and is ignored - so they accumulate
 * unnoticed. A sweep catches them at build time instead of in the player's
 * console.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SOURCES = [
  'src/sideview/engine/SpriteManager.ts', 'src/sideview/engine/AudioManager.ts',
  'src/sideview/ui/GameHUD.ts', 'src/sideview/ui/WorldMapUI.ts',
  'src/sideview/ui/CharacterSelectUI.ts', 'src/sideview/town/TownHub.ts',
  'src/sideview/items/ItemDatabase.ts', 'src/standalone.ts',
];

const missing = new Map();
const referenced = new Set();

function need(rel, from) {
  referenced.add(rel);
  if (!existsSync('public' + rel) && !missing.has(rel)) missing.set(rel, from);
}

// 1. Literal /assets/... paths.
for (const f of SOURCES) {
  if (!existsSync(f)) continue;
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/['"`](\/assets\/[^'"`$]+?\.(png|wav|ogg|mp3|jpg))['"`]/g)) {
    need(m[1], f);
  }
}

// 2 & 3. Sound and map paths are built from template literals. Read the base
//    constants out of each file rather than listing them here: the old version
//    hardcoded BATTLE and SPELL, so entries under CC0, RPGG and any newly added
//    base were silently skipped - a guard that quietly checks nothing is worse
//    than no guard, because it reads as a pass.
const BASE_RE = /const (\w+)\s*=\s*'(\/assets\/[^']*)'/g;
const TEMPLATE_RE = /\$\{(\w+)\}([^`]*)`/g;
const ASSET_EXT = /\.(png|wav|ogg|mp3|jpg)$/;

function basesOf(src) {
  const bases = {};
  for (const m of src.matchAll(BASE_RE)) bases[m[1]] = m[2];
  return bases;
}

function checkTemplates(file, label) {
  const src = readFileSync(file, 'utf8');
  const bases = basesOf(src);
  let count = 0;
  for (const m of src.matchAll(TEMPLATE_RE)) {
    const base = bases[m[1]];
    if (!base) continue;
    const rel = base + m[2];
    if (!ASSET_EXT.test(rel)) continue;
    need(rel, label);
    count++;
  }
  return { count, names: Object.keys(bases) };
}

const sfxFile = 'src/sideview/engine/SfxLibrary.ts';
const sfxSrc = readFileSync(sfxFile, 'utf8');
const sfx = checkTemplates(sfxFile, 'SfxLibrary.ts');
console.log(`sound files referenced: ${sfx.count}  (bases: ${sfx.names.join(', ')})`);

const map = checkTemplates('src/sideview/engine/MapLibrary.ts', 'MapLibrary.ts');
console.log(`map layers: ${map.count} referenced  (bases: ${map.names.join(', ')})`);

// 4. Every skill's sound id must exist in the catalogue.
const catalogueIds = new Set(
  [...sfxSrc.matchAll(/^  ([a-z_0-9]+):\s*s\(/gm)].map(m => m[1])
);
const classes = readFileSync('src/sideview/classes/ClassDefinitions.ts', 'utf8');
let badIds = 0;
let withSound = 0;
for (const m of classes.matchAll(/sound: '([a-z_0-9]+)'/g)) {
  withSound++;
  if (!catalogueIds.has(m[1])) { console.log('  unknown sound id: ' + m[1]); badIds++; }
}

console.log(`sound catalogue: ${catalogueIds.size} ids`);
console.log(`skills with a sound: ${withSound}/60${badIds ? `  (${badIds} unknown)` : '  (all resolve)'}`);

// 5. Present on disk is not enough. An asset git ignores never reaches Vercel,
// and nothing else in the pipeline notices: the file opens locally, the build
// succeeds, the test passes. An unanchored `maps/` rule hid all 39 map layers
// exactly this way, and the deployed town rendered as a bare blue sky.
const tracked = new Set(
  execFileSync('git', ['ls-files', '-z', 'public/assets'], { encoding: 'utf8', maxBuffer: 1 << 26 })
    .split('\0')
    .filter(Boolean)
    .map((f) => f.replace(/^public/, '').replaceAll(String.fromCharCode(92), '/'))
);
// Case matters too. Windows resolves paths case-insensitively, so a wrongly
// cased reference opens fine here and 404s on Vercel's Linux hosts; git records
// the real name, which makes it the only local source of truth for spelling.
const byLower = new Map([...tracked].map((t) => [t.toLowerCase(), t]));
let unshipped = 0;
for (const r of referenced) {
  if (!existsSync('public' + r) || tracked.has(r)) continue;
  const real = byLower.get(r.toLowerCase());
  if (real) {
    console.log('  WRONG CASE ' + r);
    console.log('          -> ' + real + '   (404s on Linux)');
  } else {
    console.log('  NOT IN GIT ' + r + '   (exists locally, will 404 in production)');
  }
  unshipped++;
}
console.log(`referenced assets that would 404 in production: ${unshipped}`);

for (const [p, f] of missing) console.log('  MISSING ' + p + '   <- ' + f.split('/').pop());
console.log(`missing referenced assets: ${missing.size}`);

process.exit(missing.size === 0 && badIds === 0 && unshipped === 0 ? 0 : 1);
