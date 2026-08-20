import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const engineSource = readFileSync(
  new URL('../src/sideview/engine/SideViewEngine.ts', import.meta.url),
  'utf8',
);
const particlesSource = readFileSync(
  new URL('../src/sideview/engine/ParticleSystem.ts', import.meta.url),
  'utf8',
);

test('tactical enemy art uses manifest presentation scale, not collision height', () => {
  const start = engineSource.indexOf('private drawTacticalEnemy');
  const end = engineSource.indexOf('private gameplayStatusSprite', start);
  assert.ok(start >= 0 && end > start, 'tactical enemy renderer must exist');

  const renderer = engineSource.slice(start, end);
  assert.match(renderer, /gameplaySprites\.draw\(ctx, spriteId/);
  assert.doesNotMatch(
    renderer,
    /height\s*:\s*Math\.max\([^\n]*enemy\.height/,
    'a collision box must never resize the transparent authored sprite frame',
  );
});

test('catalogue VFX do not add preview-page magnification before camera zoom', () => {
  assert.match(particlesSource, /private static readonly VFX_SCALE = 1\.0;/);
  assert.match(
    particlesSource,
    /scale:\s*def\.scale\s*\*\s*\(opts\.scale\s*\?\?\s*1\)\s*\*\s*ParticleSystem\.VFX_SCALE/,
    'effect definitions and callsite modifiers remain data driven',
  );
});
