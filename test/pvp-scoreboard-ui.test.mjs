/**
 * REGRESSION TEST: the Colosseum scoreboard is a compact, asset-built strip.
 *
 * The old readout was a 320 x 36 rounded card drawn in WORLD units, filled
 * with `[RED] 0` / `0 [BLUE]` text, plus full-width black banners. Because the
 * camera draws the world at `scale(zoom)` - at least 1.8 on a phone - that card
 * covered about two thirds of the viewport and read as a web notification
 * pasted over a pixel-art arena.
 *
 * The replacement is drawn in screen pixels, sized from the viewport, and uses
 * the project's own Kenney RPG UI textures. These checks pin all three: the
 * screen-space call, the asset-only chrome, and the responsive geometry.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { rolldown } from 'rolldown';

const engineSource = readFileSync(
  new URL('../src/sideview/engine/SideViewEngine.ts', import.meta.url),
  'utf8',
);
const hudSource = readFileSync(
  new URL('../src/sideview/ui/GameHUD.ts', import.meta.url),
  'utf8',
);

// ---------------------------------------------------------------------------
// Minimal browser shims - enough to instantiate the engine and draw the HUD.
// ---------------------------------------------------------------------------
const images = new Map();

class FakeImage {
  width = 0;
  height = 0;
  naturalWidth = 0;
  naturalHeight = 0;
  complete = false;
  onload = null;
  onerror = null;

  constructor() {
    images.set(this, '');
  }

  set src(value) {
    images.set(this, value);
    // The Kenney panels are 93 x 94; the bars are 18 px squares. The exact
    // size only matters to the nine-slice, which needs something to slice.
    this.width = 93;
    this.height = 94;
    this.naturalWidth = 93;
    this.naturalHeight = 94;
    this.complete = true;
    queueMicrotask(() => this.onload?.());
  }

  get src() {
    return images.get(this) || '';
  }

  decode() {
    return Promise.resolve();
  }
}

const storage = new Map();
globalThis.window = globalThis;
globalThis.location = { hostname: 'localhost', origin: 'http://localhost' };
globalThis.Image = FakeImage;
globalThis.localStorage = {
  getItem: key => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
  clear: () => storage.clear(),
};

/** Records the primitives the overlay uses, keeping the last style per call. */
class RecordingContext {
  constructor() {
    this.draws = [];
    this.fills = [];
    this.texts = [];
    this.saveDepth = 0;
    this.font = '10px sans-serif';
    this.textAlign = 'left';
    this.textBaseline = 'alphabetic';
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.globalAlpha = 1;
    this.imageSmoothingEnabled = true;
    this.shadowColor = 'transparent';
    this.shadowBlur = 0;
    this.shadowOffsetX = 0;
    this.shadowOffsetY = 0;
    this.filter = 'none';
  }

  save() { this.saveDepth += 1; }
  restore() { this.saveDepth -= 1; }
  scale() {}
  translate() {}
  rotate() {}
  clearRect() {}
  beginPath() {}
  closePath() {}
  rect() {}
  roundRect() {}
  arc() {}
  ellipse() {}
  moveTo() {}
  lineTo() {}
  fill() {}
  stroke() {}
  clip() {}
  createLinearGradient() { return { addColorStop() {} }; }

  fillRect(x, y, w, h) {
    this.fills.push({ x, y, w, h, style: this.fillStyle });
  }

  strokeRect() {}

  drawImage(image, ...args) {
    this.draws.push({ src: images.get(image) || '', args });
  }

  measureText(text) {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] || 10);
    return { width: text.length * size * 0.58 };
  }

  fillText(text, x, y) {
    this.texts.push({ text, x, y, font: this.font, fill: this.fillStyle });
  }

  strokeText() {}
}

const bundle = await rolldown({ input: 'test/pvp-scoreboard-fixture.ts', platform: 'browser' });
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find(chunk => chunk.type === 'chunk')?.code;
assert.ok(code, 'scoreboard fixture should bundle');
const { SideViewEngine, CHARACTER_CLASSES } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);

const className = CHARACTER_CLASSES.find(c => c.id === 'warrior') || CHARACTER_CLASSES[0];

function makeMatch(overrides = {}) {
  return {
    config: { roundsToWin: 2, format: '2v2', roundDurationSec: 180 },
    redScore: 1,
    blueScore: 0,
    currentRound: 2,
    roundTimeRemaining: 164.2,
    countdownRemaining: 0,
    status: 'active',
    bannerText: '',
    bannerSubtext: '',
    bannerTimer: 0,
    ...overrides,
  };
}

async function draw(width, height, overrides = {}) {
  const engine = new SideViewEngine(className);
  engine.tournamentMatch = makeMatch(overrides);
  const ctx = new RecordingContext();
  engine.drawTournamentOverlay(ctx, width, height);
  // Let the lazily loaded textures finish (each FakeImage resolves on a microtask).
  await Promise.resolve();
  await Promise.resolve();
  return { ctx, engine };
}

/** Bounding box of every slice drawn from one texture. */
function span(ctx, file) {
  const calls = ctx.draws.filter(d => d.src.endsWith(`/${file}`));
  assert.ok(calls.length > 0, `${file} should be drawn by the scoreboard`);
  const boxes = calls.map(d => {
    // Sliced draws carry (sx, sy, sw, sh, dx, dy, dw, dh); the degenerate
    // one-blit path carries (dx, dy, dw, dh).
    const a = d.args;
    const [dx, dy, dw, dh] = a.length === 8 ? a.slice(4) : a;
    return { x: dx, y: dy, w: dw, h: dh };
  });
  const x = Math.min(...boxes.map(b => b.x));
  const y = Math.min(...boxes.map(b => b.y));
  const right = Math.max(...boxes.map(b => b.x + b.w));
  const bottom = Math.max(...boxes.map(b => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y, calls: calls.length };
}

test('the readout is drawn in screen space, not under the camera zoom', () => {
  const block = engineSource.slice(
    engineSource.indexOf('this.ultimate.draw(ctx, virtualWidth, virtualHeight)'),
    engineSource.indexOf('private renderTownEntities'),
  );
  assert.match(
    block,
    /ctx\.scale\(1 \/ zoom, 1 \/ zoom\);\s*this\.drawTournamentOverlay\(ctx, width, height\);/,
    'the zoom must be undone and the overlay given CSS pixels',
  );
  assert.doesNotMatch(
    block,
    /drawTournamentOverlay\(ctx, virtualWidth, virtualHeight\)/,
    'sizing the HUD in world units is what made it enormous on phones',
  );
});

test('the scoreboard is built from the project UI pack, not painted rectangles', () => {
  const assets = engineSource.slice(
    engineSource.indexOf('const PVP_HUD_ASSETS'),
    engineSource.indexOf('} as const;', engineSource.indexOf('const PVP_HUD_ASSETS')),
  );
  const overlay = engineSource.slice(
    engineSource.indexOf('public drawTournamentOverlay'),
    engineSource.indexOf('\n  }\n', engineSource.indexOf('public drawTournamentOverlay')),
  );
  for (const file of [
    'panel_brown.png',
    'panel_beigeLight.png',
    'barRed_horizontalMid.png',
    'barBlue_horizontalBlue.png',
    'barBack_horizontalMid.png',
  ]) {
    assert.ok(assets.includes(`kenney-rpg-ui/${file}`), `${file} must supply the chrome`);
    assert.ok(
      existsSync(new URL(`../public/assets/kenney-rpg-ui/${file}`, import.meta.url)),
      `${file} must exist in the asset folder`,
    );
  }
  assert.doesNotMatch(overlay, /\[RED\]|\[BLUE\]/, 'team names are labels, not bracketed chat tags');
  assert.doesNotMatch(overlay, /MATCH STARTS IN/, 'the old full-sentence banner is gone');
});

test('desktop scoreboard stays a small strip across the top', async () => {
  const { ctx } = await draw(960, 540);
  const panel = span(ctx, 'panel_brown.png');
  assert.equal(panel.calls, 9, 'the frame is a nine-slice, so its corners keep their shape');
  assert.ok(panel.w <= 960 * 0.4, `bar should be a slim strip, got ${panel.w}px of 960`);
  assert.ok(panel.h <= 34, `bar should stay short, got ${panel.h}px`);
  assert.ok(panel.y <= 14, 'the strip belongs at the top edge');

  const texts = ctx.texts.map(t => t.text);
  assert.ok(texts.includes('1') && texts.includes('0'), 'both scores are shown');
  assert.ok(texts.includes('R2  2:44'), 'round and clock stay in the middle');
  assert.ok(!texts.some(t => t.includes('[')), 'no bracketed team tags');
});

test('phone scoreboard shrinks with the viewport instead of growing', async () => {
  const { ctx } = await draw(844, 390);
  const panel = span(ctx, 'panel_brown.png');
  assert.ok(panel.w <= 844 * 0.45, `phone bar should not span the screen, got ${panel.w}px of 844`);
  assert.ok(panel.h <= 34);

  const { ctx: small } = await draw(568, 320);
  const compact = span(small, 'panel_brown.png');
  assert.ok(compact.w <= 280, `the small-screen variant must fit between the corner HUD panels, got ${compact.w}px`);
  assert.ok(compact.h <= 26, `the small-screen variant must be shorter, got ${compact.h}px`);
});

test('round wins are pips on the pack bar track, not words', async () => {
  const { ctx } = await draw(960, 540, { redScore: 1, blueScore: 0 });
  const sockets = ctx.draws.filter(d => d.src.endsWith('/barBack_horizontalMid.png'));
  const redGems = ctx.draws.filter(d => d.src.endsWith('/barRed_horizontalMid.png'));
  const blueGems = ctx.draws.filter(d => d.src.endsWith('/barBlue_horizontalBlue.png'));

  assert.equal(sockets.length, 4, 'two sockets per side for a best of three');
  assert.equal(redGems.length, 1, 'red has won exactly one round');
  assert.equal(blueGems.length, 0, 'blue has not won a round yet');
  const box = args => {
    const [dx, dy, dw, dh] = args.length === 8 ? args.slice(4) : args;
    return { x: dx, y: dy, w: dw, h: dh, right: dx + dw, bottom: dy + dh };
  };
  for (const gem of [...redGems, ...blueGems]) {
    const g = box(gem.args);
    const inside = sockets.some(socket => {
      const s = box(socket.args);
      return g.x >= s.x && g.y >= s.y && g.right <= s.right && g.bottom <= s.bottom;
    });
    assert.ok(inside, 'every coloured pip sits inside its socket');
  }
});

test('the round plaque is a compact panel, never a full-width black bar', async () => {
  const { ctx } = await draw(960, 540, {
    bannerText: 'TEAM RED VICTORY!',
    bannerSubtext: 'Score: Red 2 - 0 Blue',
    bannerTimer: 2.4,
  });

  const fullWidth = ctx.fills.filter(f => f.x <= 0 && f.w >= 960 * 0.95);
  assert.equal(fullWidth.length, 0, 'no full-width strip is painted behind the announcement');

  const plaque = span(ctx, 'panel_beigeLight.png');
  assert.ok(plaque.w < 960 * 0.6, `plaque should hug its text, got ${plaque.w}px`);
  assert.ok(plaque.h <= 48, `plaque should be an announcement, not a billboard, got ${plaque.h}px`);

  const title = ctx.texts.find(t => t.text === 'TEAM RED VICTORY!');
  assert.ok(title, 'the result is still announced');
  assert.ok(plaque.y > span(ctx, 'panel_brown.png').y, 'the plaque hangs under the scoreboard');
});

test('the DOM HUD no longer repeats the score next to the canvas board', () => {
  const block = hudSource.slice(
    hudSource.indexOf('} else if (this.engine.inTournamentMode && waveTitle && waveMobs) {'),
  );
  const branch = block.slice(0, block.indexOf('const leaveBtn'));
  assert.doesNotMatch(branch, /\[RED\]/, 'one scoreboard is enough');
  assert.match(branch, /Gladiators standing:/, 'the wave banner keeps its own job');
});
