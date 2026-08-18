/**
 * Every literal /assets/... path in the source must resolve to a real file.
 *
 * These fail silently at runtime - a missing sprite just never draws, a missing
 * sound throws in the console and is ignored - so they accumulate unnoticed.
 * A sweep catches them at build time instead of in the player's console.
 */
import { readFileSync, existsSync } from 'node:fs';
const files = [
  'src/sideview/engine/SpriteManager.ts','src/sideview/engine/AudioManager.ts',
  'src/sideview/ui/GameHUD.ts','src/sideview/ui/WorldMapUI.ts',
  'src/sideview/ui/CharacterSelectUI.ts','src/sideview/town/TownHub.ts',
  'src/sideview/items/ItemDatabase.ts','src/standalone.ts',
];
const missing = new Map();
for (const f of files) {
  if (!existsSync(f)) continue;
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/['"`](\/assets\/[^'"`$]+?\.(png|wav|ogg|mp3|jpg))['"`]/g)) {
    const p = 'public' + m[1];
    if (!existsSync(p)) {
      if (!missing.has(m[1])) missing.set(m[1], f);
    }
  }
}
console.log(`missing referenced assets: ${missing.size}\n`);
for (const [p, f] of missing) console.log('  ' + p + '   <- ' + f.split('/').pop());

process.exit(missing.size === 0 ? 0 : 1);
