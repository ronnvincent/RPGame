import type { VfxQuality } from './ParticleSystem';

const QUALITY_DPR_SCALE: Record<VfxQuality, number> = {
  high: 1,
  medium: 0.85,
  low: 0.7,
};

/**
 * Resolve a stable canvas backing-store ratio for the current visual tier.
 * The result is quarter-stepped so adaptive quality changes resize the canvas
 * only on tier transitions, while high-DPR phones can shed fill-rate pressure.
 */
export function canvasDprForQuality(
  devicePixelRatio: number,
  coarsePointer: boolean,
  quality: VfxQuality,
): number {
  const nativeDpr = Number.isFinite(devicePixelRatio)
    ? Math.max(1, devicePixelRatio)
    : 1;
  const deviceCap = coarsePointer ? 1.5 : 2;
  const scaled = Math.min(nativeDpr, deviceCap) * QUALITY_DPR_SCALE[quality];
  return Math.max(1, Math.round(scaled * 4) / 4);
}
