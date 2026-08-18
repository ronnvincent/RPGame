/**
 * Cinematic sequencing for ultimates.
 *
 * What makes an ultimate land is not the size of the explosion - it is the
 * pause before it. This runs a three-beat sequence and exposes a time scale the
 * engine multiplies its own dt by, so the whole world slows without any system
 * needing to know a cinematic is happening.
 *
 *   anticipation - world slows, screen dims, the declaration appears
 *   impact       - everything freezes for a beat, then the effect fires
 *   recovery     - dim lifts and normal speed returns
 *
 * The director itself always advances on unscaled real time; only the world it
 * is directing is slowed.
 */

export type UltPhase = 'idle' | 'anticipation' | 'impact' | 'recovery' | 'linger';

const ANTICIPATION = 0.55;
const IMPACT_FREEZE = 0.14;
const RECOVERY = 0.45;
/**
 * Real seconds between the cinematic starting and the payload firing.
 *
 * The voice line starts with the cinematic but the blast only lands after the
 * freeze, so anything timing effects against the clip has to subtract this.
 */
export const ULT_LEAD_IN = ANTICIPATION + IMPACT_FREEZE;

/** How long the declaration takes to fade once the voice line is done. */
const LINGER_FADE = 0.7;

export class UltimateDirector {
  private phase: UltPhase = 'idle';
  private t = 0;
  /** Real seconds since start, across all phases. */
  private total = 0;
  /**
   * How long the declaration stays up, normally the voice clip's length.
   *
   * The slow-motion beats stay short - seven seconds of dimmed, crawling world
   * would be unplayable - but the line should not vanish while the character is
   * still saying it, so it holds at full speed until the clip ends.
   */
  private holdFor = 0;
  private line = '';
  private accent = '#ffd77a';
  /** Fired once when anticipation ends, so the caller can spawn the payload. */
  private onImpact: (() => void) | null = null;

  public get active(): boolean {
    return this.phase !== 'idle';
  }

  /** The caster cannot be harmed mid-cinematic - committing should feel safe. */
  public get invulnerable(): boolean {
    return this.phase === 'anticipation' || this.phase === 'impact';
  }

  /** Multiplier the engine applies to its own dt. */
  public get timeScale(): number {
    switch (this.phase) {
      case 'anticipation': {
        // Ease from normal speed down to a crawl as the moment builds.
        const k = Math.min(1, this.t / ANTICIPATION);
        return 1 - 0.72 * k;
      }
      case 'impact':
        return 0;
      case 'recovery': {
        // Ease back up rather than snapping, so the release has weight.
        const k = Math.min(1, this.t / RECOVERY);
        return 0.28 + 0.72 * k;
      }
      case 'linger':
        return 1;
      default:
        return 1;
    }
  }

  public start(line: string, accent: string, onImpact: () => void, holdFor = 0) {
    this.phase = 'anticipation';
    this.t = 0;
    this.total = 0;
    this.holdFor = holdFor;
    this.line = line;
    this.accent = accent;
    this.onImpact = onImpact;
  }

  /** @param realDt unscaled seconds - the director must not slow itself. */
  public update(realDt: number) {
    if (this.phase === 'idle') return;
    this.t += realDt;
    this.total += realDt;

    if (this.phase === 'anticipation' && this.t >= ANTICIPATION) {
      this.phase = 'impact';
      this.t = 0;
      const fire = this.onImpact;
      this.onImpact = null;
      fire?.();
    } else if (this.phase === 'impact' && this.t >= IMPACT_FREEZE) {
      this.phase = 'recovery';
      this.t = 0;
    } else if (this.phase === 'recovery' && this.t >= RECOVERY) {
      // Hold the line at normal speed for whatever is left of the voice clip.
      if (this.total < this.holdFor) {
        this.phase = 'linger';
        this.t = 0;
      } else {
        this.phase = 'idle';
        this.t = 0;
        this.line = '';
      }
    } else if (this.phase === 'linger' && this.total >= this.holdFor) {
      this.phase = 'idle';
      this.t = 0;
      this.total = 0;
      this.line = '';
    }
  }

  /** Screen darkening, 0..1. Peaks during the freeze. */
  private get dim(): number {
    switch (this.phase) {
      case 'anticipation': return 0.66 * Math.min(1, this.t / (ANTICIPATION * 0.6));
      case 'impact': return 0.66;
      case 'recovery': return 0.66 * Math.max(0, 1 - this.t / (RECOVERY * 0.7));
      case 'linger': return 0;
      default: return 0;
    }
  }

  /** Draw over the world, under the HUD. */
  public draw(ctx: CanvasRenderingContext2D, width: number, height: number) {
    if (this.phase === 'idle') return;

    const dim = this.dim;
    if (dim > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(4, 2, 10, ${dim})`;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    if (!this.line) return;

    // The declaration slams in, holds, then fades with the dim.
    let alpha = 1, slide = 0, scale = 1;
    if (this.phase === 'anticipation') {
      const k = Math.min(1, this.t / (ANTICIPATION * 0.45));
      alpha = k;
      slide = (1 - k) * 40;
      scale = 1.25 - 0.25 * k;
    } else if (this.phase === 'recovery') {
      // With a voice line still playing the line stays up; without one it fades
      // out with the dim as before.
      alpha = this.holdFor > 0 ? 1 : Math.max(0, 1 - this.t / (RECOVERY * 0.8));
    } else if (this.phase === 'linger') {
      const remaining = this.holdFor - this.total;
      alpha = remaining < LINGER_FADE ? Math.max(0, remaining / LINGER_FADE) : 1;
    }
    if (alpha <= 0) return;

    const cx = width / 2;
    const cy = height * 0.34;
    const size = Math.max(20, Math.min(46, width * 0.045));

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy + slide);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${size}px 'Cinzel', serif`;

    // A dark bar keeps the text readable over any background.
    const w = ctx.measureText(this.line).width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(-w / 2 - 24, -size * 0.85, w + 48, size * 1.7);

    ctx.lineWidth = Math.max(3, size * 0.14);
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.strokeText(this.line, 0, 0);
    ctx.fillStyle = this.accent;
    ctx.fillText(this.line, 0, 0);

    ctx.restore();
  }
}

/**
 * The declaration each class shouts. One line per class, matched to its
 * ultimate rather than a generic shout.
 */
export const ULTIMATE_LINES: Record<string, string> = {
  warrior:     'THE EARTH ANSWERS TO ME',
  assassin:    'YOU NEVER SAW ME COMING',
  mage:        'FALL, AND BE FORGOTTEN',
  paladin:     'BY MY OATH — JUDGEMENT',
  archer:      'ONE ARROW. ONE ENDING',
  necromancer: 'RISE — THE DEAD OBEY ME',
  berserker:   'I AM WRATH INCARNATE',
  priest:      'NONE SHALL FALL TODAY',
  ninja:       'TIME BENDS TO MY BLADE',
  dragoon:     'FROM THE SKY, I DESCEND'
};
