/**
 * Every sprite method the game calls must actually exist.
 *
 * The engine reaches SpriteManager through `(sprites as any).method(...)` in
 * places, and `as any` switches off every check TypeScript would otherwise make.
 * So when two public methods were deleted by accident, the compiler stayed
 * silent, the build passed, and the failure appeared only as a runtime
 * TypeError inside the game loop - which aborted the frame partway, leaving the
 * scenery drawn and the characters missing.
 *
 * This closes that hole: it reads the call sites and the class, and reports any
 * method that is called but not defined.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(join(dir, e.name))
    : e.name.endsWith('.ts') ? [join(dir, e.name)] : []);
}

const manager = readFileSync('src/sideview/engine/SpriteManager.ts', 'utf8');

// Method definitions on the class, public or private.
const defined = new Set(
  [...manager.matchAll(/^  (?:public |private )?([a-zA-Z_]\w*)\s*\(/gm)].map((m) => m[1])
);

// Call sites, including the ones laundered through `as any`.
const called = new Map();
for (const file of sources('src')) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/(?:\(sprites as any\)|sprites)\.([a-zA-Z_]\w*)\s*\(/g)) {
    if (!called.has(m[1])) called.set(m[1], file);
  }
}

const missing = [...called].filter(([name]) => !defined.has(name));

console.log(`sprite methods defined: ${defined.size}`);
console.log(`sprite methods called:  ${called.size}`);
for (const [name, file] of missing) {
  console.log(`  MISSING ${name}()   called from ${file.split(/[\/]/).pop()}`);
}
console.log(`called but not defined: ${missing.length}`);

process.exit(missing.length === 0 ? 0 : 1);
