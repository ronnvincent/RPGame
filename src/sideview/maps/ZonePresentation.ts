import type { BattleTheme } from '../dungeons/DungeonManager';
import {
  getZoneContent,
  type ZoneAtmosphereMotif,
  type ZoneAtmosphereProfile,
  type ZoneFrameStyle,
} from './ZoneContent';

export type ZonePresentationLayer = 'behind-entities' | 'above-entities';
export type ZonePresentationQuality = 'low' | 'balanced' | 'high';

export interface ZonePresentationOptions {
  /** SpriteManager supplies its existing animation clock when this is omitted. */
  elapsedSeconds?: number;
  /** Freezes all autonomous drift while keeping a static sense of depth. */
  reducedMotion?: boolean;
  quality?: ZonePresentationQuality;
}

export interface ZonePresentationMetrics {
  layer: ZonePresentationLayer;
  motif: ZoneAtmosphereMotif;
  animated: boolean;
  motes: number;
  shafts: number;
  fogBands: number;
  frameShapes: number;
  totalPrimitives: number;
}

export const ZONE_PRESENTATION_BUDGETS = Object.freeze({
  motes: 18,
  shafts: 4,
  fogBands: 3,
  frameShapes: 5,
  totalBackgroundPrimitives: 27,
  totalForegroundPrimitives: 5,
});

const QUALITY_SCALE: Record<ZonePresentationQuality, number> = {
  low: 0.42,
  balanced: 0.72,
  high: 1,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

function positiveModulo(value: number, divisor: number): number {
  if (divisor <= 0) return 0;
  return ((value % divisor) + divisor) % divisor;
}

function mixSeed(seed: number, index: number): number {
  let value = (seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return value >>> 0;
}

function unit(seed: number): number {
  return (seed >>> 0) / 0x1_0000_0000;
}

function scaledCount(authored: number, maximum: number, quality: ZonePresentationQuality): number {
  return Math.min(maximum, Math.max(1, Math.ceil(authored * QUALITY_SCALE[quality])));
}

export function getZonePresentationMetrics(
  theme: BattleTheme,
  layer: ZonePresentationLayer,
  options: ZonePresentationOptions = {},
): ZonePresentationMetrics {
  const profile = getZoneContent(theme).atmosphere;
  const quality = options.quality ?? 'balanced';
  if (layer === 'above-entities') {
    const frameShapes = ZONE_PRESENTATION_BUDGETS.frameShapes;
    return {
      layer,
      motif: profile.motes.motif,
      animated: false,
      motes: 0,
      shafts: 0,
      fogBands: 0,
      frameShapes,
      totalPrimitives: frameShapes,
    };
  }

  const motes = scaledCount(profile.motes.count, ZONE_PRESENTATION_BUDGETS.motes, quality);
  const shafts = scaledCount(profile.shafts.count, ZONE_PRESENTATION_BUDGETS.shafts, quality);
  const fogBands = quality === 'low' ? 1 : quality === 'balanced' ? 2 : 3;
  // Two constant primitives are the vertical haze and the horizon glow.
  const totalPrimitives = 2 + motes + shafts + fogBands;
  return {
    layer,
    motif: profile.motes.motif,
    animated: !options.reducedMotion,
    motes,
    shafts,
    fogBands,
    frameShapes: 0,
    totalPrimitives,
  };
}

function drawMotePath(
  ctx: CanvasRenderingContext2D,
  motif: ZoneAtmosphereMotif,
  x: number,
  y: number,
  size: number,
  phase: number,
) {
  if (motif === 'bubble') {
    ctx.moveTo(x + size, y);
    ctx.arc(x, y, size, 0, Math.PI * 2);
    return;
  }

  if (
    motif === 'lantern-dust'
    || motif === 'root-spore'
    || motif === 'firefly'
    || motif === 'pollen'
  ) {
    ctx.moveTo(x + size, y);
    ctx.arc(x, y, size, 0, Math.PI * 2);
    return;
  }

  if (motif === 'leaf') {
    const tilt = Math.sin(phase) * size;
    ctx.moveTo(x - size, y);
    ctx.quadraticCurveTo(x + tilt, y - size, x + size, y);
    ctx.quadraticCurveTo(x - tilt, y + size, x - size, y);
    return;
  }

  if (motif === 'void-star' || motif === 'constellation') {
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y);
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
    if (motif === 'constellation') {
      ctx.moveTo(x - size * 0.55, y - size * 0.55);
      ctx.lineTo(x + size * 0.55, y + size * 0.55);
    }
    return;
  }

  if (motif === 'soul-wisp') {
    ctx.moveTo(x - size, y + size);
    ctx.quadraticCurveTo(x + size * 1.4, y, x, y - size * 1.8);
    return;
  }

  // Embers, snow, forge sparks, and siege ash read better as short directional
  // strokes than circles. They remain in one batched path for the whole zone.
  const direction = motif === 'wind-snow' || motif === 'siege-ash' ? 1 : -0.45;
  ctx.moveTo(x - size, y - size * direction);
  ctx.lineTo(x + size, y + size * direction);
}

function drawMotes(
  ctx: CanvasRenderingContext2D,
  profile: ZoneAtmosphereProfile,
  cameraX: number,
  viewportWidth: number,
  safeBottom: number,
  elapsedSeconds: number,
  count: number,
) {
  const margin = 20;
  const cycleWidth = viewportWidth + margin * 2;
  const top = 18;
  const verticalSpan = Math.max(36, safeBottom - top - 16);
  const motes = profile.motes;

  ctx.beginPath();
  for (let index = 0; index < count; index += 1) {
    const a = mixSeed(profile.seed, index * 3);
    const b = mixSeed(profile.seed, index * 3 + 1);
    const c = mixSeed(profile.seed, index * 3 + 2);
    const phase = unit(c) * Math.PI * 2;
    const drift = Math.sin(elapsedSeconds * 0.72 + phase) * (2 + unit(b) * 5);
    const x = positiveModulo(
      unit(a) * cycleWidth
        - cameraX * motes.parallax
        + elapsedSeconds * motes.velocityX
        + drift,
      cycleWidth,
    ) - margin;
    const y = top + positiveModulo(
      unit(b) * verticalSpan + elapsedSeconds * motes.velocityY,
      verticalSpan,
    );
    const size = motes.size * (0.65 + unit(c) * 0.7);
    drawMotePath(ctx, motes.motif, x, y, size, phase + elapsedSeconds);
  }

  ctx.globalAlpha = motes.alpha;
  ctx.fillStyle = motes.color;
  ctx.strokeStyle = motes.color;
  ctx.lineWidth = Math.max(0.8, motes.size * 0.72);
  if (
    motes.motif === 'bubble'
    || motes.motif === 'soul-wisp'
    || motes.motif === 'void-star'
    || motes.motif === 'constellation'
    || motes.motif === 'ember'
    || motes.motif === 'forge-spark'
    || motes.motif === 'wind-snow'
    || motes.motif === 'siege-ash'
  ) {
    ctx.stroke();
  } else {
    ctx.fill();
  }
}

function drawBehindEntities(
  ctx: CanvasRenderingContext2D,
  profile: ZoneAtmosphereProfile,
  cameraX: number,
  viewportWidth: number,
  viewportHeight: number,
  groundY: number,
  elapsedSeconds: number,
  metrics: ZonePresentationMetrics,
) {
  const safeBottom = clamp(groundY - profile.readability.clearBand, 72, viewportHeight);

  ctx.save();

  const haze = ctx.createLinearGradient(0, 0, 0, safeBottom);
  haze.addColorStop(0, profile.haze.upper);
  haze.addColorStop(0.72, profile.haze.lower);
  haze.addColorStop(1, 'transparent');
  ctx.globalAlpha = profile.haze.alpha;
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, viewportWidth, safeBottom);

  const horizonY = Math.max(42, safeBottom * 0.72);
  const horizon = ctx.createRadialGradient(
    viewportWidth * 0.5,
    horizonY,
    0,
    viewportWidth * 0.5,
    horizonY,
    Math.max(80, viewportWidth * 0.55),
  );
  horizon.addColorStop(0, profile.haze.horizon);
  horizon.addColorStop(1, 'transparent');
  ctx.globalAlpha = profile.haze.horizonAlpha;
  ctx.fillStyle = horizon;
  ctx.fillRect(0, Math.max(0, horizonY - safeBottom * 0.45), viewportWidth, safeBottom * 0.55);

  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = profile.shafts.color;
  ctx.globalAlpha = profile.shafts.alpha;
  for (let index = 0; index < metrics.shafts; index += 1) {
    const seed = mixSeed(profile.seed, 100 + index);
    const width = 38 + unit(seed) * 54;
    const originX = unit(mixSeed(seed, 1)) * viewportWidth;
    const wobble = Math.sin(elapsedSeconds * 0.18 + unit(seed) * Math.PI * 2) * 7;
    const bottomX = originX + profile.shafts.slant * safeBottom + wobble;
    ctx.beginPath();
    ctx.moveTo(originX - width * 0.22, -4);
    ctx.lineTo(originX + width * 0.22, -4);
    ctx.lineTo(bottomX + width, safeBottom);
    ctx.lineTo(bottomX - width, safeBottom);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  ctx.fillStyle = profile.haze.lower;
  for (let index = 0; index < metrics.fogBands; index += 1) {
    const seed = mixSeed(profile.seed, 180 + index);
    const bandWidth = viewportWidth * (0.55 + unit(seed) * 0.32);
    const travel = viewportWidth + bandWidth;
    const x = positiveModulo(
      unit(seed) * travel - cameraX * (0.035 + index * 0.015) + elapsedSeconds * (1.2 + index),
      travel,
    ) - bandWidth;
    const y = safeBottom - 18 - index * 22;
    ctx.globalAlpha = profile.haze.alpha * (0.2 + index * 0.045);
    ctx.beginPath();
    ctx.ellipse(x + bandWidth * 0.5, y, bandWidth * 0.5, 14 + index * 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawMotes(ctx, profile, cameraX, viewportWidth, safeBottom, elapsedSeconds, metrics.motes);
  ctx.restore();
}

function drawFrameSilhouette(
  ctx: CanvasRenderingContext2D,
  style: ZoneFrameStyle,
  viewportWidth: number,
  viewportHeight: number,
  groundY: number,
  sideWidth: number,
) {
  const bottom = Math.min(viewportHeight, groundY + 22);
  ctx.beginPath();

  if (style === 'canopy') {
    ctx.moveTo(0, 0);
    ctx.lineTo(sideWidth * 1.5, 0);
    ctx.quadraticCurveTo(sideWidth * 0.95, 18, sideWidth * 0.7, 54);
    ctx.quadraticCurveTo(sideWidth * 0.38, 34, 0, 72);
    ctx.closePath();
    ctx.moveTo(viewportWidth, 0);
    ctx.lineTo(viewportWidth - sideWidth * 1.5, 0);
    ctx.quadraticCurveTo(viewportWidth - sideWidth * 0.95, 18, viewportWidth - sideWidth * 0.7, 54);
    ctx.quadraticCurveTo(viewportWidth - sideWidth * 0.38, 34, viewportWidth, 72);
    ctx.closePath();
  } else if (style === 'arch') {
    ctx.moveTo(0, 0);
    ctx.lineTo(sideWidth * 0.95, 0);
    ctx.lineTo(sideWidth * 0.62, bottom * 0.45);
    ctx.lineTo(sideWidth * 0.38, bottom);
    ctx.lineTo(0, bottom);
    ctx.closePath();
    ctx.moveTo(viewportWidth, 0);
    ctx.lineTo(viewportWidth - sideWidth * 0.95, 0);
    ctx.lineTo(viewportWidth - sideWidth * 0.62, bottom * 0.45);
    ctx.lineTo(viewportWidth - sideWidth * 0.38, bottom);
    ctx.lineTo(viewportWidth, bottom);
    ctx.closePath();
  } else if (style === 'crag') {
    ctx.moveTo(0, bottom);
    ctx.lineTo(0, bottom * 0.38);
    ctx.lineTo(sideWidth * 0.35, bottom * 0.52);
    ctx.lineTo(sideWidth * 0.65, bottom * 0.44);
    ctx.lineTo(sideWidth * 0.42, bottom);
    ctx.closePath();
    ctx.moveTo(viewportWidth, bottom);
    ctx.lineTo(viewportWidth, bottom * 0.34);
    ctx.lineTo(viewportWidth - sideWidth * 0.32, bottom * 0.5);
    ctx.lineTo(viewportWidth - sideWidth * 0.68, bottom * 0.41);
    ctx.lineTo(viewportWidth - sideWidth * 0.4, bottom);
    ctx.closePath();
  } else if (style === 'current') {
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(sideWidth, viewportHeight * 0.18, -sideWidth * 0.2, viewportHeight * 0.58, sideWidth * 0.45, bottom);
    ctx.lineTo(0, bottom);
    ctx.closePath();
    ctx.moveTo(viewportWidth, 0);
    ctx.bezierCurveTo(viewportWidth - sideWidth, viewportHeight * 0.18, viewportWidth + sideWidth * 0.2, viewportHeight * 0.58, viewportWidth - sideWidth * 0.45, bottom);
    ctx.lineTo(viewportWidth, bottom);
    ctx.closePath();
  } else {
    ctx.moveTo(0, 0);
    ctx.lineTo(sideWidth * 0.8, 0);
    ctx.lineTo(sideWidth * 0.35, viewportHeight * 0.24);
    ctx.lineTo(sideWidth * 0.72, viewportHeight * 0.42);
    ctx.lineTo(0, viewportHeight * 0.62);
    ctx.closePath();
    ctx.moveTo(viewportWidth, 0);
    ctx.lineTo(viewportWidth - sideWidth * 0.72, 0);
    ctx.lineTo(viewportWidth - sideWidth * 0.32, viewportHeight * 0.26);
    ctx.lineTo(viewportWidth - sideWidth * 0.78, viewportHeight * 0.44);
    ctx.lineTo(viewportWidth, viewportHeight * 0.64);
    ctx.closePath();
  }

  ctx.fill();
}

function drawAboveEntities(
  ctx: CanvasRenderingContext2D,
  profile: ZoneAtmosphereProfile,
  viewportWidth: number,
  viewportHeight: number,
  groundY: number,
) {
  const alpha = Math.min(profile.frame.alpha, profile.readability.maxForegroundAlpha);
  const sideWidth = Math.min(
    viewportWidth * (1 - profile.readability.centerClearRatio) * 0.5,
    112,
  );
  const topDepth = Math.min(54, viewportHeight * 0.11);
  const bottomStart = clamp(groundY + 10, 0, viewportHeight);

  ctx.save();
  ctx.fillStyle = profile.frame.color;
  ctx.globalAlpha = alpha * 0.72;
  drawFrameSilhouette(ctx, profile.frame.style, viewportWidth, viewportHeight, groundY, sideWidth);

  const top = ctx.createLinearGradient(0, 0, 0, topDepth);
  top.addColorStop(0, profile.frame.color);
  top.addColorStop(1, 'transparent');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, viewportWidth, topDepth);

  const left = ctx.createLinearGradient(0, 0, sideWidth, 0);
  left.addColorStop(0, profile.frame.color);
  left.addColorStop(1, 'transparent');
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, sideWidth, bottomStart);

  const right = ctx.createLinearGradient(viewportWidth, 0, viewportWidth - sideWidth, 0);
  right.addColorStop(0, profile.frame.color);
  right.addColorStop(1, 'transparent');
  ctx.fillStyle = right;
  ctx.fillRect(viewportWidth - sideWidth, 0, sideWidth, bottomStart);

  if (bottomStart < viewportHeight) {
    const floor = ctx.createLinearGradient(0, bottomStart, 0, viewportHeight);
    floor.addColorStop(0, 'transparent');
    floor.addColorStop(1, profile.frame.color);
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = floor;
    ctx.fillRect(0, bottomStart, viewportWidth, viewportHeight - bottomStart);
  }
  ctx.restore();
}

/**
 * Draws a bounded, texture-free presentation pass. Call `behind-entities`
 * after the base parallax map and `above-entities` after world entities/VFX.
 */
export function drawZonePresentation(
  ctx: CanvasRenderingContext2D,
  theme: BattleTheme,
  layer: ZonePresentationLayer,
  cameraX: number,
  viewportWidth: number,
  viewportHeight: number,
  groundY: number,
  options: ZonePresentationOptions = {},
): ZonePresentationMetrics {
  const metrics = getZonePresentationMetrics(theme, layer, options);
  const width = Math.max(0, Number.isFinite(viewportWidth) ? viewportWidth : 0);
  const height = Math.max(0, Number.isFinite(viewportHeight) ? viewportHeight : 0);
  if (!width || !height) return { ...metrics, motes: 0, shafts: 0, fogBands: 0, frameShapes: 0, totalPrimitives: 0 };

  const profile = getZoneContent(theme).atmosphere;
  const elapsed = options.reducedMotion
    ? 0
    : positiveModulo(options.elapsedSeconds ?? 0, 4_096);
  const safeCameraX = Number.isFinite(cameraX) ? cameraX : 0;
  const safeGroundY = clamp(groundY, 0, height);

  if (layer === 'behind-entities') {
    drawBehindEntities(ctx, profile, safeCameraX, width, height, safeGroundY, elapsed, metrics);
  } else {
    drawAboveEntities(ctx, profile, width, height, safeGroundY);
  }
  return metrics;
}
