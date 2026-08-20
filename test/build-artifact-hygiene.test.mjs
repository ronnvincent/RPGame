import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { test } from 'node:test';

const BLOCKED_DIRECTORIES = new Set(['.git', '.godot', '.idea', '__MACOSX', 'shader_cache']);
const BLOCKED_EXTENSIONS = new Set([
  '.ase', '.aseprite', '.blend', '.bz2', '.cache', '.ctex', '.docx', '.import',
  '.kra', '.md5', '.oggvorbisstr', '.pdf', '.psd', '.swf', '.tps', '.tres',
  '.tscn', '.xcf', '.zip',
]);

function collectBlocked(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (BLOCKED_DIRECTORIES.has(entry.name)) found.push(target);
      else collectBlocked(target, found);
    } else if (!/license|licence|credit|attribution/i.test(entry.name) && (
      entry.name === '.DS_Store'
      || entry.name.startsWith('._')
      || BLOCKED_EXTENSIONS.has(extname(entry.name).toLowerCase())
    )) {
      found.push(target);
    }
  }
  return found;
}

test('production output contains browser assets, not editor sources or caches', () => {
  assert.equal(existsSync('dist/index.html'), true, 'run the production build before this test');
  const blocked = collectBlocked(resolve('dist'));
  assert.deepEqual(blocked, []);
  assert.equal(existsSync('dist/assets/runtime/manifest.json'), true);
  assert.equal(existsSync('dist/env.js'), true);
});
