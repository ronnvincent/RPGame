/**
 * Emits the VFX catalogue as plain JSON so the browser preview page can render
 * it without a TypeScript build step. Run after editing VfxLibrary.
 */
import { writeFileSync } from 'node:fs';
import { VFX, FX_COLOUR_ROW } from '../src/sideview/engine/VfxLibrary.ts';
writeFileSync('public/vfx-catalogue.json', JSON.stringify({ VFX, FX_COLOUR_ROW }, null, 1));
console.log(`wrote public/vfx-catalogue.json (${Object.keys(VFX).length} effects)`);
