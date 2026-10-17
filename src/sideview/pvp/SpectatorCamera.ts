/**
 * Spectator camera maths.
 *
 * A downed player used to be a passenger: the director cut between teammates
 * on a timer and there was no way to look anywhere else. This is the model
 * behind a free camera - where the view is centred, how far it can be pushed,
 * and how far in or out it may zoom - kept as plain numbers so the rules can
 * be tested without a canvas.
 *
 * The arena is a side view, so the camera only travels along x: the ground is
 * always the bottom of the screen. "Anywhere" therefore means any point of the
 * arena, not a top-down map.
 */

export const SPECTATOR_VIEW = {
  /** Zoom is a multiplier on the renderer's own pixel scale. */
  minZoom: 0.7,
  maxZoom: 1.8,
  /** One wheel notch / button press. Multiplicative, so it feels even. */
  zoomStep: 1.12,
  /** Keys move the free camera at this many world pixels per second. */
  keyPanSpeed: 1100,
  /** Exponential blend rate: follow shots ease, manual pans are snappier. */
  followRate: 6,
  freeRate: 14,
} as const;

export type SpectatorMode = 'auto' | 'free';

export interface SpectatorView {
  /** `auto` is the director cutting between teammates; `free` is the player. */
  mode: SpectatorMode;
  zoom: number;
  /** World x at the centre of the view while the camera is not following. */
  focusX: number;
  /**
   * A fighter the free camera is following. Set by cycling through the roster
   * and cleared the moment the player drags the view themselves.
   */
  lockedTargetId: string | null;
}

export function createSpectatorView(): SpectatorView {
  return { mode: 'auto', zoom: 1, focusX: 0, lockedTargetId: null };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function setSpectatorZoom(view: SpectatorView, zoom: number): SpectatorView {
  const next = clamp(Number.isFinite(zoom) ? zoom : 1, SPECTATOR_VIEW.minZoom, SPECTATOR_VIEW.maxZoom);
  view.zoom = Math.round(next * 100) / 100;
  return view;
}

/** Positive steps zoom in; negative steps zoom out. */
export function nudgeSpectatorZoom(view: SpectatorView, steps: number): SpectatorView {
  if (!Number.isFinite(steps) || steps === 0) return view;
  return setSpectatorZoom(view, view.zoom * Math.pow(SPECTATOR_VIEW.zoomStep, steps));
}

/**
 * Convert a wheel event into zoom steps.
 *
 * Browsers report a wheel notch as 100 pixels, three lines, or one page
 * depending on the platform and the input device. Treating all three the same
 * keeps a trackpad pinch from jumping the whole zoom range in one gesture.
 */
export function wheelZoomSteps(deltaY: number, deltaMode = 0): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
  const perStep = deltaMode === 1 ? 3 : deltaMode === 2 ? 0.75 : 100;
  const steps = clamp(deltaY / perStep, -3, 3);
  // Scrolling down (positive deltaY) should zoom out.
  return -steps;
}

export function setSpectatorFollow(view: SpectatorView, auto: boolean): SpectatorView {
  view.mode = auto ? 'auto' : 'free';
  if (auto) view.lockedTargetId = null;
  return view;
}

/**
 * A focus point the camera can actually centre on.
 *
 * The centre of the view cannot pass the first or last half-screen of the
 * arena, or a drag would accumulate "off-screen" distance the player has to
 * drag back through before the camera moves again.
 */
export function clampFocusX(focusX: number, viewWidth: number, arenaWidth: number): number {
  if (!Number.isFinite(focusX)) return arenaWidth / 2;
  if (viewWidth >= arenaWidth) return arenaWidth / 2;
  return clamp(focusX, viewWidth / 2, arenaWidth - viewWidth / 2);
}

/** Point the free camera at a world position (clamped to the arena). */
export function focusSpectatorOn(
  view: SpectatorView,
  worldX: number,
  arenaWidth: number,
  viewWidth = 0,
): SpectatorView {
  view.mode = 'free';
  view.lockedTargetId = null;
  const target = Number.isFinite(worldX) ? worldX : 0;
  view.focusX = viewWidth > 0
    ? clampFocusX(target, viewWidth, arenaWidth)
    : clamp(target, 0, Math.max(0, arenaWidth));
  return view;
}

/** Move the free camera by a world-space delta. */
export function panSpectatorView(
  view: SpectatorView,
  worldDelta: number,
  arenaWidth: number,
  viewWidth = 0,
): SpectatorView {
  if (!Number.isFinite(worldDelta) || worldDelta === 0) return view;
  return focusSpectatorOn(view, view.focusX + worldDelta, arenaWidth, viewWidth);
}

/** Lock the free camera onto a fighter; the player can still zoom. */
export function lockSpectatorTarget(view: SpectatorView, id: string): SpectatorView {
  view.mode = 'free';
  view.lockedTargetId = id;
  return view;
}

/**
 * Where the camera may sit: never showing past either end of the arena.
 * A viewport wider than the arena has nowhere to pan, so it parks at zero.
 */
export function clampCameraX(cameraX: number, viewWidth: number, arenaWidth: number): number {
  const limit = arenaWidth - viewWidth;
  if (!Number.isFinite(cameraX)) return 0;
  if (limit <= 0) return 0;
  return clamp(cameraX, 0, limit);
}

/** Desired camera x for a world point that should sit in the middle. */
export function cameraXForFocus(focusX: number, viewWidth: number, arenaWidth: number): number {
  return clampCameraX(focusX - viewWidth / 2, viewWidth, arenaWidth);
}

/** Frame-rate independent approach toward a target. */
export function blendCamera(current: number, target: number, dt: number, rate: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return current;
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}
