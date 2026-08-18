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

const SOURCES = [
  'src/sideview/engine/SpriteManager.ts', 'src/sideview/engine/AudioManager.ts',
  'src/sideview/ui/GameHUD.ts', 'src/sideview/ui/WorldMapUI.ts',
  'src/sideview/ui/CharacterSelectUI.ts', 'src/sideview/town/TownHub.ts',
  'src/sideview/items/ItemDatabase.ts', 'src/standalone.ts',
];

const missing = new Map();

// 1. Literal /assets/... paths.
for (const f of SOURCES) {
  if (!existsSync(f)) continue;
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/['"`](\/assets\/[^'"`$]+?\.(png|wav|ogg|mp3|jpg))['"`]/g)) {
    if (!existsSync('public' + m[1]) && !missing.has(m[1])) missing.set(m[1], f);
  }
}

// 2. Sound catalogue paths are built from template literals, so resolve the
//    two base constants rather than regexing the raw string.
const sfxSrc = readFileSync('src/sideview/engine/SfxLibrary.ts', 'utf8');
const BASES = {
  BATTLE: '/assets/audio/sfx/RPG Sound Pack/battle',
  SPELL: '/assets/audio/spell-sfx',
};
for (const m of sfxSrc.matchAll(/\$\{(BATTLE|SPELL)\}\/([^`]+)`/g)) {
  const rel = BASES[m[1]] + '/' + m[2];
  if (!existsSync('public' + rel)) missing.set(rel, 'SfxLibrary.ts');
}

// 3. Map layer paths, also built from template literals.
const mapSrc = readFileSync('src/sideview/engine/MapLibrary.ts', 'utf8');
const MAP_BASES = {
  POLY: '/assets/maps/PolyStyle',
  FOREST: '/assets/maps/parallax_forest/parallax_forest',
  CITY: '/assets/maps/Futuristic City Parallax',
};
let mapLayers = 0;
for (const m of mapSrc.matchAll(/\$\{(POLY|FOREST|CITY)\}\/([^`]+)`/g)) {
  mapLayers++;
  const rel = MAP_BASES[m[1]] + '/' + m[2];
  if (!existsSync('public' + rel)) missing.set(rel, 'MapLibrary.ts');
}
console.log(`map layers: ${mapLayers} referenced`);

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
for (const [p, f] of missing) console.log('  MISSING ' + p + '   <- ' + f.split('/').pop());
console.log(`missing referenced assets: ${missing.size}`);

process.exit(missing.size === 0 && badIds === 0 ? 0 : 1);
