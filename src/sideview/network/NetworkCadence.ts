/**
 * Suppresses identical high-frequency snapshots while preserving a heartbeat.
 * The game loop may call a sender every frame; networking decides whether the
 * state is new enough to justify bytes on the wire.
 */
export class PayloadCadence {
  private lastSignature = '';
  private lastSentAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly heartbeatMs: number) {}

  public shouldSend(signature: string, nowMs: number): boolean {
    const clockReset = nowMs < this.lastSentAt;
    const changed = signature !== this.lastSignature;
    const heartbeatDue = nowMs - this.lastSentAt >= this.heartbeatMs;
    if (!clockReset && !changed && !heartbeatDue) return false;
    this.lastSignature = signature;
    this.lastSentAt = nowMs;
    return true;
  }

  public reset(): void {
    this.lastSignature = '';
    this.lastSentAt = Number.NEGATIVE_INFINITY;
  }
}

export function quantizeNetworkCoordinate(value: unknown, step = 0.25): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const safeStep = Number.isFinite(step) && step > 0 ? step : 0.25;
  return Math.round(numeric / safeStep) * safeStep;
}

export function smoothNetworkCoordinate(
  current: number,
  target: number,
  dt: number,
  response = 18,
  snapDistance = 420,
): number {
  if (![current, target, dt].every(Number.isFinite)) return Number.isFinite(target) ? target : 0;
  const distance = target - current;
  if (Math.abs(distance) >= snapDistance) return target;
  const frame = Math.max(0, Math.min(0.1, dt));
  const blend = 1 - Math.exp(-Math.max(1, response) * frame);
  const next = current + distance * blend;
  return Math.abs(target - next) < 0.02 ? target : next;
}
