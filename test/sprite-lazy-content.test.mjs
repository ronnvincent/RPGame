import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { getEnemyVisualAssetPaths } from '../src/sideview/maps/EnemyVisualRegistry.ts';

test('fresh SpriteManager does not request runtime zone or monster families', () => {
  const source = readFileSync('src/sideview/engine/SpriteManager.ts', 'utf8');
  const preloadStart = source.indexOf('  private preloadAll()');
  const preloadEnd = source.indexOf('  public update(', preloadStart);
  assert.ok(preloadStart > 0 && preloadEnd > preloadStart, 'preloadAll boundary must remain inspectable');
  const bootPreload = source.slice(preloadStart, preloadEnd);
  assert.doesNotMatch(bootPreload, /\/assets\/runtime\/monsters\//);
  assert.doesNotMatch(bootPreload, /\/assets\/runtime\/maps\/pixel-platformer\/terrain\.png/);

  const slime = getEnemyVisualAssetPaths('Green Slime');
  assert.ok(slime.length >= 5 && slime.every((path) => path.includes('/luizmelo-fantasy-2/slime/')));
  assert.equal(slime.some((path) => path.includes('/bat/')), false);
  assert.equal(slime.some((path) => path.includes('/mimic/')), false);
  assert.deepEqual(getEnemyVisualAssetPaths('Dusk Wolf'), [
    '/assets/runtime/monsters/opengameart-pixel-wolf/wolf-tail.png',
    '/assets/runtime/monsters/opengameart-pixel-wolf/wolf-run.png',
  ]);
  assert.match(source, /public warmEnemyVisual\(mobType: string\)/);
  assert.match(source, /public warmZoneContent\(theme: BattleTheme\)/);
});
