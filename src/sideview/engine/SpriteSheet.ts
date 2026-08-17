/**
 * Sprite sheet slicing and frame animation.
 *
 * The asset library uses four different frame layouts, so one loader has to
 * handle all of them:
 *   grid   - 2D grid in a single image  (dark_vfx, holy_pack, codemanu 5x5)
 *   strip  - single row or column       (ansimuz effects, aaa_spells/pixel)
 *   frames - one PNG per frame          (sanju_vfx, ansimuz Grotto sprites)
 *
 * Everything here is pixel-art oriented: destination coordinates are snapped to
 * whole pixels so sprites never land on a half-pixel and shimmer.
 */

export type SheetLayout =
  /**
   * 2D grid. Set `row` to play a single row instead of every cell - several
   * packs ship one animation per row, with each row a different colour, so the
   * effect can be tinted by choosing a row rather than by recolouring at
   * runtime.
   */
  | { kind: 'grid'; frameW: number; frameH: number; cols: number; rows: number; count?: number; row?: number }
  | { kind: 'strip'; dir: 'h' | 'v'; frameW: number; frameH: number; count: number }
  | { kind: 'frames'; paths: string[] };

export type Anchor = 'center' | 'bottom' | 'top';

/** Resolves an asset path to an image element. Injected so this module stays
 *  independent of SpriteManager and is easy to test. */
export type ImageResolver = (src: string) => HTMLImageElement | undefined;

export interface FrameRect {
  img: HTMLImageElement;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface DrawOptions {
  scale?: number;
  alpha?: number;
  /** -1 mirrors the frame horizontally. */
  facing?: number;
  anchor?: Anchor;
  /** 'lighter' gives additive glow, which is what most magic VFX want. */
  blend?: GlobalCompositeOperation;
  /** Radians. */
  rotation?: number;
}

function isReady(img: HTMLImageElement | undefined): img is HTMLImageElement {
  return !!img && img.complete && img.naturalWidth > 0;
}

export class SpriteSheet {
  public readonly frameCount: number;
  private readonly layout: SheetLayout;
  private readonly src: string;
  private readonly resolve: ImageResolver;

  /**
   * @param src   Image path for 'grid'/'strip'. Ignored for 'frames'.
   * @param layout How to slice it.
   */
  constructor(src: string, layout: SheetLayout, resolve: ImageResolver) {
    this.src = src;
    this.layout = layout;
    this.resolve = resolve;

    if (layout.kind === 'frames') {
      this.frameCount = layout.paths.length;
    } else if (layout.kind === 'strip') {
      this.frameCount = layout.count;
    } else if (layout.row !== undefined) {
      // A single row of the grid.
      this.frameCount = layout.count ?? layout.cols;
    } else {
      this.frameCount = layout.count ?? layout.cols * layout.rows;
    }
  }

  /** Source rectangle for a frame, or null if its image has not loaded yet. */
  public frame(index: number): FrameRect | null {
    if (this.frameCount <= 0) return null;
    const i = ((index % this.frameCount) + this.frameCount) % this.frameCount;
    const l = this.layout;

    if (l.kind === 'frames') {
      const img = this.resolve(l.paths[i]);
      if (!isReady(img)) return null;
      return { img, sx: 0, sy: 0, sw: img.naturalWidth, sh: img.naturalHeight };
    }

    const img = this.resolve(this.src);
    if (!isReady(img)) return null;

    if (l.kind === 'strip') {
      const sx = l.dir === 'h' ? i * l.frameW : 0;
      const sy = l.dir === 'v' ? i * l.frameH : 0;
      return { img, sx, sy, sw: l.frameW, sh: l.frameH };
    }

    const col = l.row !== undefined ? i : i % l.cols;
    const row = l.row !== undefined ? l.row : Math.floor(i / l.cols);
    return { img, sx: col * l.frameW, sy: row * l.frameH, sw: l.frameW, sh: l.frameH };
  }
}

/**
 * Draws one frame at a world position. `x`/`y` are the anchor point, not the
 * top-left corner.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  frame: FrameRect | null,
  x: number,
  y: number,
  opts: DrawOptions = {}
) {
  if (!frame) return;

  const scale = opts.scale ?? 1;
  const alpha = opts.alpha ?? 1;
  const facing = opts.facing ?? 1;
  const anchor = opts.anchor ?? 'center';
  const rotation = opts.rotation ?? 0;

  if (alpha <= 0 || scale <= 0) return;

  const w = frame.sw * scale;
  const h = frame.sh * scale;

  // Offset from the anchor point to the frame's top-left.
  const offX = -w / 2;
  const offY = anchor === 'center' ? -h / 2 : anchor === 'bottom' ? -h : 0;

  ctx.save();
  ctx.globalAlpha = alpha;
  if (opts.blend) ctx.globalCompositeOperation = opts.blend;

  // Snap the anchor to whole pixels; sub-pixel placement makes pixel art crawl.
  ctx.translate(Math.round(x), Math.round(y));
  if (rotation) ctx.rotate(rotation);
  if (facing < 0) ctx.scale(-1, 1);

  ctx.drawImage(
    frame.img,
    frame.sx, frame.sy, frame.sw, frame.sh,
    Math.round(offX), Math.round(offY), Math.round(w), Math.round(h)
  );

  ctx.restore();
}

export interface AnimatedSpriteOptions {
  fps?: number;
  loop?: boolean;
  /** Hold on the last frame instead of reporting finished. */
  holdLast?: boolean;
}

/**
 * Plays a SpriteSheet over time. One-shot by default, which is what VFX want -
 * the owner drops it once `finished` is true.
 */
export class AnimatedSprite {
  public readonly sheet: SpriteSheet;
  public index: number = 0;
  public finished: boolean = false;

  private readonly fps: number;
  private readonly loop: boolean;
  private readonly holdLast: boolean;
  private elapsed: number = 0;

  constructor(sheet: SpriteSheet, opts: AnimatedSpriteOptions = {}) {
    this.sheet = sheet;
    this.fps = opts.fps ?? 16;
    this.loop = opts.loop ?? false;
    this.holdLast = opts.holdLast ?? false;
  }

  public update(dt: number) {
    if (this.finished || this.sheet.frameCount <= 0) return;

    this.elapsed += dt;
    const frameDur = 1 / this.fps;

    while (this.elapsed >= frameDur) {
      this.elapsed -= frameDur;
      this.index++;

      if (this.index >= this.sheet.frameCount) {
        if (this.loop) {
          this.index = 0;
        } else if (this.holdLast) {
          this.index = this.sheet.frameCount - 1;
          this.elapsed = 0;
          return;
        } else {
          this.finished = true;
          this.index = this.sheet.frameCount - 1;
          return;
        }
      }
    }
  }

  /** Progress through the animation, 0..1. Useful for fade-out curves. */
  public get progress(): number {
    if (this.sheet.frameCount <= 1) return this.finished ? 1 : 0;
    return this.index / (this.sheet.frameCount - 1);
  }

  public draw(ctx: CanvasRenderingContext2D, x: number, y: number, opts: DrawOptions = {}) {
    drawFrame(ctx, this.sheet.frame(this.index), x, y, opts);
  }
}
