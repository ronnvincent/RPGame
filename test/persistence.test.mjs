/**
 * What the loader reads must be what the saver writes.
 *
 * Equipping moves an item out of the inventory and into a slot. The inventory
 * was persisted and the slots were not, so equipping something and reloading
 * lost it from both places at once - it did not come back as equipped, and it
 * was no longer in the bag either.
 *
 * The two halves live in different files, so nothing made the mismatch visible.
 * This compares them: every field the loader restores must be written by the
 * saver, and every field the saver writes should be restored by the loader.
 */
import { readFileSync } from 'node:fs';

const saveSrc = readFileSync('src/sideview/engine/SaveManager.ts', 'utf8');
const engineSrc = readFileSync('src/sideview/engine/SideViewEngine.ts', 'utf8');

// Fields written into the saved player state.
const savedBlock = saveSrc.slice(saveSrc.indexOf('const stateToSave'), saveSrc.indexOf('const saveData'));
const saved = new Set([...savedBlock.matchAll(/^\s{8}(\w+):/gm)].map((m) => m[1]));

// Fields the loader pulls back off it.
const loadBlock = engineSrc.slice(engineSrc.indexOf('public loadSaveData'));
const loadEnd = loadBlock.indexOf('\n  }');
const restored = new Set([...loadBlock.slice(0, loadEnd).matchAll(/ps\.(\w+)/g)].map((m) => m[1]));

console.log('saved:    ' + [...saved].sort().join(', '));
console.log('restored: ' + [...restored].sort().join(', '));

let failures = 0;

for (const field of restored) {
  if (!saved.has(field)) {
    console.log(`  loader reads ${field} but the saver never writes it`);
    failures++;
  }
}
// characterClass is written for identification and applied when the run is
// built rather than in loadSaveData, so it is not expected back here.
const expectedUnrestored = new Set(['characterClass']);
for (const field of saved) {
  if (!restored.has(field) && !expectedUnrestored.has(field)) {
    console.log(`  saver writes ${field} but the loader never restores it`);
    failures++;
  }
}

// The specific loss reported, named so a regression is unmistakable.
if (!saved.has('equipment')) { console.log('  equipment is not saved - equipped items will vanish on reload'); failures++; }
if (!/ps\.equipment/.test(loadBlock.slice(0, loadEnd))) { console.log('  equipment is not restored'); failures++; }

// --- Every change that matters has to reach disk ------------------------
const engineSrc2 = readFileSync('src/sideview/engine/SideViewEngine.ts', 'utf8');
const pickup = engineSrc2.slice(engineSrc2.indexOf('p.inventory.push(loot.item)'));
if (!/this\.triggerSave\(\)/.test(pickup.slice(0, 400))) {
  console.log('  picking up loot does not save - it will vanish on reload');
  failures++;
}

// --- A stale cloud must not overwrite newer local progress --------------
const save = readFileSync('src/sideview/engine/SaveManager.ts', 'utf8');
if (!/cloudAt > localAt \? cloud : local/.test(save)) {
  console.log('  load does not compare timestamps - a stale cloud save can clobber local progress');
  failures++;
}
if (!/if \(winner === cloud\) await db\.put/.test(save)) {
  console.log('  a losing cloud save is still written to local, making the loss permanent');
  failures++;
}
if (!/lastUpdated: Date\.now\(\)/.test(save)) {
  console.log('  saves carry no timestamp, so newer cannot be told from older');
  failures++;
}

console.log('');
console.log(failures === 0 ? 'PERSISTENCE OK' : `PERSISTENCE FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
