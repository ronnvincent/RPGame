/**
 * Chierit "Elementals" hero animation sets.
 *
 * Each animation is a folder of individual 288x128 frames, normalised to
 * `/assets/heroes/<class>/<anim>/<n>.png` by the import step. Frame counts were
 * read from the packs, not assumed.
 *
 * Classes not listed here keep their original sprite model - this is additive.
 */

export interface HeroSpriteSet {
  frameW: number;
  frameH: number;
  /** Draw scale relative to the 288x128 source frame. */
  scale: number;
  anims: Record<string, number>;
}

export const HERO_SPRITES: Record<string, HeroSpriteSet> = {
  warrior: {
    frameW: 288, frameH: 128, scale: 1.15,
    anims: { idle: 8, run: 8, jump_up: 3, jump_down: 3, roll: 7, atk1: 6, atk2: 8, atk3: 18, air_atk: 8 }
  },
  archer: {
    frameW: 288, frameH: 128, scale: 1.15,
    anims: { idle: 12, run: 10, jump_up: 3, jump_down: 3, roll: 8, atk1: 10, atk2: 15, atk3: 12,
             air_atk: 10, sp_atk: 17, defend: 19, hurt: 6, death: 19 }
  },
  berserker: {
    frameW: 288, frameH: 128, scale: 1.15,
    anims: { idle: 6, run: 8, jump_up: 3, jump_down: 3, roll: 6, atk1: 6, atk2: 12, atk3: 23,
             air_atk: 7, sp_atk: 25, defend: 13, hurt: 6, death: 18 }
  }
};

export function heroFrame(cls: string, anim: string, index: number): string {
  return `/assets/heroes/${cls}/${anim}/${index}.png`;
}

/** Playback speed per animation, in frames per second. */
export const HERO_FPS: Record<string, number> = {
  idle: 8, run: 14, jump_up: 10, jump_down: 10, roll: 14,
  atk1: 14, atk2: 14, atk3: 16, air_atk: 14, sp_atk: 16,
  defend: 12, hurt: 12, death: 10
};

/**
 * Which attack animation a skill slot uses, so the six skills do not all play
 * the same swing. Falls back to atk1 when a set lacks the richer animations.
 */
export function attackAnimFor(set: HeroSpriteSet, skillIndex: number): string {
  const order = ['atk1', 'atk2', 'atk3', 'sp_atk', 'air_atk', 'atk3'];
  const want = order[Math.max(0, Math.min(order.length - 1, skillIndex))];
  return set.anims[want] ? want : 'atk1';
}
