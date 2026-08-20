import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const hud = readFileSync('src/sideview/ui/GameHUD.ts', 'utf8');

test('dungeon run HUD uses licensed manifest sprite ids and exposes integration setters', () => {
  assert.match(hud, /getGameplaySpriteFiles/);
  assert.match(hud, /OBJECTIVE_SPRITES/);
  assert.match(hud, /COMBAT_FEEDBACK_SPRITES/);
  assert.match(hud, /public setDungeonObjective\(/);
  assert.match(hud, /public setDungeonRelics\(/);
  assert.match(hud, /public setDungeonContextAction\(/);
  assert.doesNotMatch(hud, /terrain\.png/);
});

test('objective and relic UI is compact, progress-aware, and does not add a white fill mask', () => {
  const start = hud.indexOf('/* Compact dungeon-run readout.');
  const end = hud.indexOf('/* Combo Display */', start);
  const styles = hud.slice(start, end);
  assert.match(styles, /\.dungeon-run-status\.is-active/);
  assert.match(styles, /\.run-objective-meter/);
  assert.match(styles, /\.run-relic-chip/);
  assert.match(hud, /width: min\(228px, calc\(100vw - 18px\)\)/);
  assert.doesNotMatch(styles, /border-image:[^;]*\bfill\b/);
  assert.doesNotMatch(styles, /background:\s*(?:#fff|white)\b/i);
});

test('dungeon context action remains a semantic touch and click target with PARRY fallback', () => {
  assert.match(hud, /<button class="touch-action-btn touch-talk-btn" id="touch-talk-btn">/);
  assert.match(hud, /this\.game\.bindInputAction\(talkBtn, 'interact', \{ hold: true, vibrateMs: 8 \}\)/);
  assert.match(hud, /text = 'PARRY'/);
  assert.match(hud, /COMBAT_FEEDBACK_SPRITES\.parry/);
  assert.match(hud, /aria-label/);
  assert.match(hud, /@media \(hover: none\) and \(pointer: coarse\), \(max-width: 860px\)/);
});
