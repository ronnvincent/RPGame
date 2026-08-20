import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const hud = read('src/sideview/ui/GameHUD.ts');
const game = read('src/sideview/SideViewGame.ts');
const engine = read('src/sideview/engine/SideViewEngine.ts');
const dialogue = read('src/sideview/dialogue/DialogueSystem.ts');

test('HUD uses cached, throttled patches and preserves a quiet exploration layout', () => {
  assert.match(hud, /private hudNodes = new Map/);
  assert.match(hud, /now - this\.lastHudPatchAt < 33/);
  assert.match(hud, /Restrained exploration layout for a fine pointer/);
  assert.match(hud, /right: calc\(22px \+ env\(safe-area-inset-right\)\)/);
  assert.match(hud, /\.hud-calm \.player-status-panel/);
});

test('RPG dialogs expose labels, focus containment, Escape and reduced-motion behavior', () => {
  const modalSources = [
    'src/sideview/ui/CharacterSelectUI.ts',
    'src/sideview/ui/WorldMapUI.ts',
    'src/sideview/ui/QuestLogUI.ts',
    'src/sideview/ui/RunSummaryUI.ts',
    'src/sideview/ui/LeaderboardUI.ts',
    'src/sideview/ui/CoopLobbyUI.ts',
    'src/sideview/dialogue/DialogueSystem.ts',
  ].map(read).join('\n');
  assert.match(modalSources, /aria-modal/);
  assert.match(modalSources, /installModalFocusTrap/);
  assert.match(modalSources, /prefers-reduced-motion/);
  assert.match(modalSources, /pointer: coarse/);
});

test('network and persistence-facing UI surfaces contain no emoji or mojibake placeholders', () => {
  const sources = [
    hud,
    game,
    dialogue,
    read('src/sideview/ui/CoopLobbyUI.ts'),
    read('src/sideview/ui/LeaderboardUI.ts'),
    read('src/sideview/ui/RunSummaryUI.ts'),
    read('src/standalone.ts'),
  ].join('\n');
  assert.doesNotMatch(sources, /[\u2600-\u27bf\u{1f000}-\u{1faff}]/u);
  assert.doesNotMatch(sources, /(?:â|ðŸ|Â)/);
});

test('remote skill/support routing rejects stale scenes and honors recipient-relative support', () => {
  const guard = game.indexOf('Boolean(isTownMode) !== Boolean(this.engine.isTownMode)');
  const mutation = game.indexOf('remoteP.classId = classId');
  assert.ok(guard >= 0 && guard < mutation, 'scene guard must run before remote avatar/VFX mutation');
  assert.match(game, /applyPartyPercentHeal\(percent, payload\.casterName\)/);
  assert.match(game, /acceptRevive\(payload\.casterName,[\s\S]{0,120}percent/);
  assert.match(game, /payload\.casterName,\s*payload\.socketId/);
  assert.match(game, /payload\.kind === 'cleanse'/);
  assert.match(engine, /sourceActorId[\s\S]{0,260}remote:\$\{sourceActorId\}/);
});

test('runtime fantasy frame assets referenced by the shared theme exist locally', () => {
  const theme = read('src/sideview/ui/RpgUiTheme.ts');
  const paths = [...theme.matchAll(/url\('([^']+)'\)/g)].map(match => match[1]);
  assert.ok(paths.length >= 3);
  for (const path of paths) {
    assert.ok(path.startsWith('/assets/'));
    assert.ok(existsSync(`public${path}`), `missing local UI asset ${path}`);
  }
});

test('opaque white fantasy masks are border-only on every dark RPG surface', () => {
  const theme = read('src/sideview/ui/RpgUiTheme.ts');
  const directSurfaces = [
    read('src/sideview/ui/CoopLobbyUI.ts'),
    hud,
    read('src/sideview/input/InputSettingsPanel.ts'),
    dialogue,
  ].join('\n');

  assert.doesNotMatch(
    theme,
    /border-image:\s*var\(--rpg-panel-image\)[^;]*\bfill\b/,
    'the shared dark panel background must not be covered by the white asset center',
  );
  assert.doesNotMatch(
    directSurfaces,
    /border-image:[^;]*runtime\/ui\/fantasy-borders\/default-panel[^;]*\bfill\b/,
    'direct dark surfaces must use only the decorative border slices',
  );
  assert.match(theme, /background:\s*linear-gradient\(rgba\(16, 21, 29, \.96\), rgba\(9, 12, 17, \.98\)\)/);
  assert.match(directSurfaces, /\.cl-pane, \.cl-crest, \.cl-syn[\s\S]{0,240}border-image:[^;]+16 \/ 10px/);
});
