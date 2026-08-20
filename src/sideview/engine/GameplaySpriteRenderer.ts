/**
 * Small renderer for the licensed, data-driven gameplay sprite catalogue.
 *
 * Feature systems pass catalogue ids only. This class owns sheet slicing,
 * animation clocks, anchoring, lazy loading, and cache warming; it never draws
 * a procedural fallback when an image is unavailable.
 */

import {
  GAMEPLAY_SPRITES,
  getGameplaySpriteFiles,
  type GameplaySpriteClip,
  type GameplaySpriteId,
} from '../assets/GameplaySpriteManifest';
import { sprites } from './SpriteManager';

export interface GameplaySpriteDrawOptions {
  /** Animation clock supplied by the simulation, in seconds. */
  time?: number;
  facing?: -1 | 1;
  alpha?: number;
  scale?: number;
  /** Optional authored display size. Supplying one dimension preserves ratio. */
  width?: number;
  height?: number;
  /** Select a stable frame for non-looping state snapshots. */
  normalizedProgress?: number;
}

export interface GameplaySpriteMetrics {
  sourceWidth: number;
  sourceHeight: number;
  displayWidth: number;
  displayHeight: number;
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function frameIndex(clip: GameplaySpriteClip, options: GameplaySpriteDrawOptions): number {
  const count = clip.layout.kind === 'image' || clip.layout.kind === 'atlas'
    ? 1
    : clip.layout.kind === 'frames'
      ? clip.layout.paths.length
      : clip.layout.frameCount;
  if (count <= 1) return 0;

  const progress = options.normalizedProgress;
  if (typeof progress === 'number' && Number.isFinite(progress)) {
    return Math.min(count - 1, Math.floor(clamp01(progress) * count));
  }
  const raw = Math.max(0, Math.floor(finite(options.time, 0) * clip.fps));
  return clip.loop ? raw % count : Math.min(count - 1, raw);
}

function sourceSize(clip: GameplaySpriteClip, image: HTMLImageElement): { width: number; height: number } {
  if (clip.layout.kind === 'atlas') {
    return { width: clip.layout.width, height: clip.layout.height };
  }
  if (clip.layout.kind === 'strip' || clip.layout.kind === 'grid') {
    return { width: clip.layout.frameWidth, height: clip.layout.frameHeight };
  }
  return {
    width: Math.max(1, image.naturalWidth || image.width || 1),
    height: Math.max(1, image.naturalHeight || image.height || 1),
  };
}

function sourceRect(
  clip: GameplaySpriteClip,
  index: number,
  image: HTMLImageElement,
): { sx: number; sy: number; sw: number; sh: number } {
  if (clip.layout.kind === 'strip') {
    const horizontal = clip.layout.direction === 'horizontal';
    return {
      sx: horizontal ? index * clip.layout.frameWidth : 0,
      sy: horizontal ? 0 : index * clip.layout.frameHeight,
      sw: clip.layout.frameWidth,
      sh: clip.layout.frameHeight,
    };
  }
  if (clip.layout.kind === 'grid') {
    return {
      sx: (index % clip.layout.columns) * clip.layout.frameWidth,
      sy: Math.floor(index / clip.layout.columns) * clip.layout.frameHeight,
      sw: clip.layout.frameWidth,
      sh: clip.layout.frameHeight,
    };
  }
  if (clip.layout.kind === 'atlas') {
    return {
      sx: clip.layout.x,
      sy: clip.layout.y,
      sw: clip.layout.width,
      sh: clip.layout.height,
    };
  }
  return {
    sx: 0,
    sy: 0,
    sw: Math.max(1, image.naturalWidth || image.width || 1),
    sh: Math.max(1, image.naturalHeight || image.height || 1),
  };
}

function imageFor(clip: GameplaySpriteClip, index: number): HTMLImageElement | undefined {
  const path = clip.layout.kind === 'frames'
    ? clip.layout.paths[Math.min(index, Math.max(0, clip.layout.paths.length - 1))]
    : clip.src;
  return path ? sprites.getImage(path) : undefined;
}

function isDrawable(image: HTMLImageElement | undefined): image is HTMLImageElement {
  return Boolean(image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
}

export class GameplaySpriteRenderer {
  /** Warm only the small encounter tier used on room entry. */
  public warmEncounterSprites(): void {
    const paths = (Object.entries(GAMEPLAY_SPRITES) as Array<[GameplaySpriteId, GameplaySpriteClip]>)
      .filter(([, clip]) => clip.preload === 'encounter')
      .flatMap(([id]) => getGameplaySpriteFiles(id));
    sprites.warmPathsIncrementally(paths, 4);
  }

  public warm(ids: readonly GameplaySpriteId[]): void {
    sprites.warmPathsIncrementally(
      [...new Set(ids.flatMap(id => getGameplaySpriteFiles(id)))],
      4,
    );
  }

  public metrics(
    id: GameplaySpriteId,
    options: GameplaySpriteDrawOptions = {},
  ): GameplaySpriteMetrics | null {
    const clip = GAMEPLAY_SPRITES[id];
    const image = imageFor(clip, frameIndex(clip, options));
    if (!isDrawable(image)) return null;
    const source = sourceSize(clip, image);
    const authoredScale = Math.max(0.01, clip.scale * finite(options.scale, 1));
    let displayWidth = Math.max(1, finite(options.width, source.width * authoredScale));
    let displayHeight = Math.max(1, finite(options.height, source.height * authoredScale));
    if (options.width !== undefined && options.height === undefined) {
      displayHeight = displayWidth * source.height / source.width;
    } else if (options.height !== undefined && options.width === undefined) {
      displayWidth = displayHeight * source.width / source.height;
    }
    return {
      sourceWidth: source.width,
      sourceHeight: source.height,
      displayWidth,
      displayHeight,
    };
  }

  /**
   * Draw one catalogue sprite and return whether an actual image was painted.
   * A false result means the lazy image is still loading or failed validation;
   * callers intentionally leave that frame empty instead of drawing a shape.
   */
  public draw(
    ctx: CanvasRenderingContext2D,
    id: GameplaySpriteId,
    x: number,
    y: number,
    options: GameplaySpriteDrawOptions = {},
  ): boolean {
    const clip = GAMEPLAY_SPRITES[id];
    const index = frameIndex(clip, options);
    const image = imageFor(clip, index);
    if (!isDrawable(image)) return false;

    const rect = sourceRect(clip, index, image);
    const metrics = this.metrics(id, options);
    if (!metrics) return false;

    const alpha = clamp01(finite(options.alpha, 1));
    const facing: -1 | 1 = options.facing === -1 ? -1 : 1;
    const dx = -metrics.displayWidth / 2;
    // Actor sheets keep generous transparent gutters below their feet. Anchor
    // the measured foot line to world Y rather than the bottom of the PNG
    // frame; otherwise a correctly grounded enemy visibly floats above it.
    const feetGap = clip.anchor === 'feet'
      ? Math.max(0, finite(clip.feetGap, 0)) * (metrics.displayHeight / rect.sh)
      : 0;
    const dy = clip.anchor === 'center'
      ? -metrics.displayHeight / 2
      : -metrics.displayHeight + feetGap;

    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(Math.round(finite(x, 0)), Math.round(finite(y, 0)));
    if (facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(
      image,
      rect.sx,
      rect.sy,
      rect.sw,
      rect.sh,
      dx,
      dy,
      metrics.displayWidth,
      metrics.displayHeight,
    );
    ctx.restore();
    return true;
  }
}

export const gameplaySprites = new GameplaySpriteRenderer();
