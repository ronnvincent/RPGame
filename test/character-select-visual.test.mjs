import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/sideview/ui/CharacterSelectUI.ts', 'utf8');

test('character select keeps the complete data-driven, accessible class roster', () => {
  assert.match(source, /CHARACTER_CLASSES\.map\(option =>/);
  assert.match(source, /data-class-id=/);
  assert.match(source, /aria-pressed=/);
  assert.match(source, /aria-label="Available classes"/);
  assert.doesNotMatch(
    source,
    /\.character-roster\s*\{[^}]*display\s*:\s*none/s,
    'responsive layouts must not hide the ten class controls',
  );
});

test('character select overrides light frame fills with scoped dark fantasy surfaces', () => {
  assert.match(source, /\.character-select-screen \.character-showcase,[\s\S]*?border-image:\s*none/);
  assert.match(source, /\.character-select-screen \.character-stat,[\s\S]*?border-image:none/);
  assert.match(source, /linear-gradient\(165deg, rgba\(39,32,25,\.97\), rgba\(15,16,20,\.985\)/);
});

test('hero previews use adaptive nearest-neighbour enlargement without exceeding measured bounds', () => {
  assert.match(source, /const SHOWCASE_MAX_SCALE = 3/);
  assert.match(source, /horizontalFit = \(width - 32\) \/ \(SHOWCASE_CONTENT_HALF_WIDTH \* 2\)/);
  assert.match(source, /verticalFit = \(floor - 16\) \/ SHOWCASE_CONTENT_HEIGHT/);
  assert.match(source, /ctx\.imageSmoothingEnabled = false/);
  assert.match(source, /ctx\.scale\(showcaseScale, showcaseScale\)/);
  assert.match(source, /sprites\.drawHero\(ctx, 0, 0, this\.selectedClass\.id/);
});

test('desktop, phone and short-landscape layouts retain explicit preview sizing', () => {
  assert.match(source, /@media \(max-width:980px\), \(orientation:portrait\)/);
  assert.match(source, /@media \(max-width:560px\)/);
  assert.match(source, /@media \(max-height:520px\) and \(orientation:landscape\)/);
  assert.match(source, /#hero-showcase-canvas \{ min-height:120px; height:100%; \}/);
});
