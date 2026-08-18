/**
 * Verifies asset paths that are BUILT AT RUNTIME rather than written out.
 *
 * asset-paths.test.mjs can only see literal strings and template constants, so
 * a frame loaded as `${dir}/${i}.png` inside a for loop is invisible to it -
 * which is how a screen full of 404s for 1.png, 2.png and 04.png reached
 * production while the asset test reported a clean pass.
 *
 * This expands the loops instead: it finds the numeric range, evaluates the
 * template for every value, and checks the result on disk.
 *
 * Usage:  node tools/check-generated-paths.mjs [--list]
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const showAll = process.argv.includes('--list');

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(join(dir, e.name))
    : e.name.endsWith('.ts') ? [join(dir, e.name)] : []);
}

/** Build a function from a template literal body so ${...} is really evaluated. */
function templateFn(literal, varName) {
  try {
    return new Function(varName, 'return `' + literal + '`;');
  } catch {
    return null;
  }
}

const generated = [];

for (const file of sourceFiles('src')) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');

  // Form 1: addToArray(target, (i) => `...`, START, END)
  //         addToGroup('key',  (i) => `...`, START, END)
  const callRe = /add(?:ToArray|ToGroup)\(\s*[^,]+,\s*\((\w+)\)\s*=>\s*`([^`]+)`\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g;
  for (const m of src.matchAll(callRe)) {
    const [, varName, literal, start, end] = m;
    const fn = templateFn(literal, varName);
    if (!fn) continue;
    for (let i = Number(start); i <= Number(end); i++) {
      generated.push({ path: fn(i), file, form: 'addTo*' });
    }
  }

  // Form 2: a for loop, then template literals inside it using its variable.
  for (let n = 0; n < lines.length; n++) {
    const loop = lines[n].match(/for\s*\(\s*let\s+(\w+)\s*=\s*(-?\d+)\s*;\s*\1\s*<=\s*(-?\d+)\s*;\s*\1\+\+\s*\)/);
    if (!loop) continue;
    const [, varName, start, end] = loop;

    // A one-line `for (...) statement;` body ends with that line. Brace counting
    // cannot tell, because `${i}` contributes a balanced pair of its own: the
    // count read as "block closed", the scan ran on into the NEXT loop, and its
    // templates were expanded over this loop's range - inventing missing frames
    // that no code ever asks for.
    const afterHeader = lines[n].slice(loop.index + loop[0].length).trim();
    const singleLine = afterHeader.length > 0 && !afterHeader.startsWith('{');

    // Scan the loop body: the same line after the header, plus following lines
    // until braces balance.
    let depth = 0;
    let seenBrace = false;
    for (let k = n; k < lines.length && k < n + 40; k++) {
      const line = lines[k];
      for (const ch of line) {
        if (ch === '{') { depth++; seenBrace = true; }
        else if (ch === '}') depth--;
      }
      for (const t of line.matchAll(/`(\/assets\/[^`]*\$\{[^`]*)`/g)) {
        const fn = templateFn(t[1], varName);
        if (!fn) continue;
        for (let i = Number(start); i <= Number(end); i++) {
          try {
            const p = fn(i);
            if (p.includes('${') || p.includes('undefined')) continue;
            generated.push({ path: p, file, form: 'for-loop' });
          } catch { /* uses another variable */ }
        }
      }
      // A brace-less `for (...) statement;` is one line. Reading on past it
      // attributed the NEXT loop's templates to this loop's range, which
      // reported frames as missing that no code ever asks for.
      if (singleLine) break;
      if (!seenBrace) break;
      if (depth <= 0 && k > n) break;
    }
  }
}

const seen = new Map();
for (const g of generated) if (!seen.has(g.path)) seen.set(g.path, g);

const missing = [];
for (const [p, g] of seen) {
  if (!existsSync('public' + p)) missing.push(g);
}

console.log(`runtime-built paths checked: ${seen.size}`);
if (showAll) for (const p of seen.keys()) console.log('  ' + p);

// Group the misses by folder - a whole missing sprite set is one problem, not
// twenty, and reading twenty near-identical lines hides that.
const byDir = new Map();
for (const m of missing) {
  const dir = m.path.slice(0, m.path.lastIndexOf('/'));
  if (!byDir.has(dir)) byDir.set(dir, { names: [], file: m.file, exists: existsSync('public' + dir) });
  byDir.get(dir).names.push(m.path.slice(dir.length + 1));
}

for (const [dir, info] of byDir) {
  console.log(`  MISSING ${info.names.length} frame(s) in ${dir}`);
  console.log(`          wanted: ${info.names.join(' ')}`);
  console.log(`          folder ${info.exists ? 'exists - the frame names differ' : 'does not exist'}   <- ${info.file.split(/[\/]/).pop()}`);
  if (info.exists) {
    const have = readdirSync('public' + dir).slice(0, 6).join(' ');
    console.log(`          on disk: ${have}${readdirSync('public' + dir).length > 6 ? ' ...' : ''}`);
  }
}

console.log(`missing runtime-built assets: ${missing.length}`);
process.exit(missing.length === 0 ? 0 : 1);
