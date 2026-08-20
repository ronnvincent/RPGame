import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(path, 'utf8');

test('browser clients share one validated backend configuration module', () => {
  const consumers = [
    'src/standalone.ts',
    'src/sideview/engine/SaveManager.ts',
    'src/sideview/network/NetworkManager.ts',
    'src/sideview/ui/LeaderboardUI.ts',
  ];

  for (const path of consumers) {
    const source = read(path);
    assert.match(source, /RuntimeConfig/);
    assert.doesNotMatch(source, /rpgame-production-[\w.-]+\.railway\.app/);
    assert.doesNotMatch(source, /localhost:3001/);
  }
});
test('runtime configuration accepts only HTTP origins and strips an API suffix', () => {
  const source = read('src/sideview/config/RuntimeConfig.ts');
  assert.match(source, /url\.protocol !== 'http:'/);
  assert.match(source, /url\.protocol !== 'https:'/);
  assert.match(source, /url\.username \|\| url\.password/);
  assert.match(source, /pathname !== '\/' && pathname !== '\/api'/);
  assert.match(source, /VITE_GAME_SERVER_ORIGIN/);
  assert.match(source, /window\.__SIDEVIEW_CONFIG__/);
});

test('public env bridge contains no server-side secret values', () => {
  const source = read('public/env.js');
  assert.match(source, /__SIDEVIEW_CONFIG__/);
  assert.doesNotMatch(source, /postgres(?:ql)?:\/\//i);
  assert.doesNotMatch(source, /DATABASE_URL\s*[:=]\s*['"][^'"]+/i);
  assert.doesNotMatch(source, /SESSION_SECRET\s*[:=]\s*['"][^'"]+/i);
  assert.doesNotMatch(source, /service[_-]?role\s*[:=]\s*['"][^'"]+/i);
});
