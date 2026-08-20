import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/sideview/ui/LeaderboardUI.ts', 'utf8');

test('leaderboard does not reuse opaque fantasy image frames for nested surfaces', () => {
  assert.doesNotMatch(source, /class="rpg-panel[^\"]*lb-panel/);
  assert.doesNotMatch(source, /class="rpg-card[^\"]*lb-mine/);
  assert.doesNotMatch(source, /class="rpg-card[^\"]*lb-row/);
  assert.match(source, /\.lb-panel\{[^}]*border-image:none/);
  assert.match(source, /\.lb-mine\{[^}]*border-image:none/);
  assert.match(source, /\.lb-row\{[^}]*border-image:none/);
});

test('leaderboard list owns the remaining panel height and scrolls independently', () => {
  assert.match(source, /\.lb-list\{[^}]*flex:1 1 auto/);
  assert.match(source, /\.lb-list\{[^}]*min-height:0/);
  assert.match(source, /\.lb-list\{[^}]*overflow-y:auto/);
  assert.match(source, /grid-template-columns:36px minmax\(0,1fr\) auto/);
});

test('short landscape viewports use the full safe height without hiding the controls', () => {
  const compact = source.match(/@media\(max-height:520px\)\{([\s\S]*?)\n\s*@media\(max-width:520px\)/)?.[1] ?? '';
  assert.match(compact, /height:calc\(100dvh - 16px\)/);
  assert.match(compact, /\.lb-head \.rpg-kicker,\.lb-head \.rpg-help\{display:none\}/);
  assert.match(compact, /\.lb-list\{gap:4px\}/);
  assert.match(compact, /\.lb-row\{min-height:46px/);
});
