import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { rolldown } from 'rolldown';

const bundle = await rolldown({
  input: 'test/zone-presentation-fixture.ts',
  platform: 'browser',
});
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find(chunk => chunk.type === 'chunk')?.code;
assert.ok(code, 'zone presentation fixture should bundle');
const {
  ZONE_CONTENT,
  ZONE_PRESENTATION_BUDGETS,
  drawZonePresentation,
  getZonePreloadPaths,
  getZonePresentationMetrics,
} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const THEMES = Object.keys(ZONE_CONTENT);

function rounded(value) {
  if (typeof value === 'number') return Math.round(value * 10_000) / 10_000;
  if (value && typeof value === 'object') return '[canvas-resource]';
  return value;
}

function recordingContext() {
  const operations = [];
  const record = (name, args = []) => operations.push([name, ...args.map(rounded)]);
  const gradient = (kind, args) => {
    record(kind, args);
    return { addColorStop: (...stop) => record('colorStop', stop) };
  };
  const target = {
    save: () => record('save'),
    restore: () => record('restore'),
    createLinearGradient: (...args) => gradient('linearGradient', args),
    createRadialGradient: (...args) => gradient('radialGradient', args),
    fillRect: (...args) => record('fillRect', args),
    beginPath: () => record('beginPath'),
    closePath: () => record('closePath'),
    moveTo: (...args) => record('moveTo', args),
    lineTo: (...args) => record('lineTo', args),
    quadraticCurveTo: (...args) => record('quadraticCurveTo', args),
    bezierCurveTo: (...args) => record('bezierCurveTo', args),
    arc: (...args) => record('arc', args),
    ellipse: (...args) => record('ellipse', args),
    fill: () => record('fill'),
    stroke: () => record('stroke'),
    drawImage: () => assert.fail('procedural atmosphere must never request or draw a texture'),
  };
  const ctx = new Proxy(target, {
    set(object, property, value) {
      object[property] = value;
      record(`set:${String(property)}`, [value]);
      return true;
    },
  });
  return { ctx, operations };
}

test('every zone has a distinct, readable atmosphere identity', () => {
  const motifs = new Set();
  const signatures = new Set();

  for (const theme of THEMES) {
    const profile = ZONE_CONTENT[theme].atmosphere;
    motifs.add(profile.motes.motif);
    signatures.add([
      profile.motes.motif,
      profile.haze.upper,
      profile.haze.lower,
      profile.frame.style,
      profile.frame.color,
    ].join(':'));

    assert.ok(profile.readability.clearBand >= 48, `${theme} must reserve a clear feet/hazard band`);
    assert.ok(profile.readability.centerClearRatio >= 0.68, `${theme} must keep the combat center unobscured`);
    assert.ok(profile.readability.maxForegroundAlpha <= 0.18, `${theme} foreground framing is too opaque`);
    assert.ok(profile.motes.count <= ZONE_PRESENTATION_BUDGETS.motes);
    assert.ok(profile.shafts.count <= ZONE_PRESENTATION_BUDGETS.shafts);
  }

  assert.equal(motifs.size, THEMES.length, 'each zone needs a unique ambient motif');
  assert.equal(signatures.size, THEMES.length, 'atmosphere signatures must not silently alias another biome');
});

test('quality tiers and both integration stages stay inside strict primitive caps', () => {
  for (const theme of THEMES) {
    for (const quality of ['low', 'balanced', 'high']) {
      const back = getZonePresentationMetrics(theme, 'behind-entities', { quality });
      const front = getZonePresentationMetrics(theme, 'above-entities', { quality });
      assert.ok(back.motes <= ZONE_PRESENTATION_BUDGETS.motes);
      assert.ok(back.shafts <= ZONE_PRESENTATION_BUDGETS.shafts);
      assert.ok(back.fogBands <= ZONE_PRESENTATION_BUDGETS.fogBands);
      assert.ok(back.totalPrimitives <= ZONE_PRESENTATION_BUDGETS.totalBackgroundPrimitives);
      assert.ok(front.frameShapes <= ZONE_PRESENTATION_BUDGETS.frameShapes);
      assert.ok(front.totalPrimitives <= ZONE_PRESENTATION_BUDGETS.totalForegroundPrimitives);
    }
  }
});

test('reduced motion freezes autonomous drift while the normal pass remains animated', () => {
  const first = recordingContext();
  const second = recordingContext();
  drawZonePresentation(first.ctx, 'inferno', 'behind-entities', 240, 960, 540, 465, {
    elapsedSeconds: 0,
    reducedMotion: true,
    quality: 'high',
  });
  drawZonePresentation(second.ctx, 'inferno', 'behind-entities', 240, 960, 540, 465, {
    elapsedSeconds: 91.25,
    reducedMotion: true,
    quality: 'high',
  });
  assert.deepEqual(second.operations, first.operations);

  const moving = recordingContext();
  drawZonePresentation(moving.ctx, 'inferno', 'behind-entities', 240, 960, 540, 465, {
    elapsedSeconds: 91.25,
    reducedMotion: false,
    quality: 'high',
  });
  assert.notDeepEqual(moving.operations, first.operations);
});

test('background primitives stop above the protected ground readability band', () => {
  const groundY = 465;
  for (const theme of THEMES) {
    const output = recordingContext();
    drawZonePresentation(output.ctx, theme, 'behind-entities', 180, 960, 540, groundY, {
      elapsedSeconds: 12,
      quality: 'high',
    });
    const safeBottom = groundY - ZONE_CONTENT[theme].atmosphere.readability.clearBand;

    for (const [operation, ...args] of output.operations) {
      if (operation === 'moveTo' || operation === 'lineTo') {
        assert.ok(args[1] <= safeBottom, `${theme} ${operation} crossed into the hazard band`);
      } else if (operation === 'quadraticCurveTo') {
        assert.ok(args[1] <= safeBottom && args[3] <= safeBottom, `${theme} curve crossed into the hazard band`);
      } else if (operation === 'arc') {
        assert.ok(args[1] + args[2] <= safeBottom, `${theme} mote crossed into the hazard band`);
      } else if (operation === 'ellipse') {
        assert.ok(args[1] + args[3] <= safeBottom, `${theme} fog crossed into the hazard band`);
      }
    }
  }
});

test('presentation is Canvas-only and adds no boot or zone texture dependency', () => {
  const source = readFileSync('src/sideview/maps/ZonePresentation.ts', 'utf8');
  assert.doesNotMatch(source, /new\s+Image|drawImage|warmPaths|getImage|\/assets\//);

  for (const theme of THEMES) {
    assert.deepEqual(getZonePreloadPaths(theme), []);

    const output = recordingContext();
    const back = drawZonePresentation(output.ctx, theme, 'behind-entities', 0, 960, 540, 465, {
      elapsedSeconds: 1,
      quality: 'high',
    });
    const front = drawZonePresentation(output.ctx, theme, 'above-entities', 0, 960, 540, 465);
    assert.ok(back.totalPrimitives <= ZONE_PRESENTATION_BUDGETS.totalBackgroundPrimitives);
    assert.ok(front.totalPrimitives <= ZONE_PRESENTATION_BUDGETS.totalForegroundPrimitives);
    assert.ok(output.operations.length < 220, `${theme} atmosphere issued an excessive number of Canvas operations`);
  }
});
