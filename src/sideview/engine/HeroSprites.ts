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
  /** Draw scale, chosen per class so every hero lands on the same height. */
  scale: number;
  anims: Record<string, number>;
  /**
   * Packs that ship one horizontal strip per animation instead of a folder of
   * frames. Maps animation name -> sheet path; the frame is sliced at draw
   * time using frameW/frameH.
   */
  strips?: Record<string, string>;
}

export const HERO_SPRITES: Record<string, HeroSpriteSet> = {
  archer: {
    frameW: 288, frameH: 128, scale: 1.148,
    anims: { air_atk: 10, atk1: 10, atk2: 15, atk3: 12, death: 19, defend: 19, hurt: 6, idle: 12, jump_down: 3, jump_up: 3, roll: 8, run: 10, sp_atk: 17 }
  },
  assassin: {
    frameW: 288, frameH: 128, scale: 1.148,
    anims: { air_atk: 7, atk1: 8, atk2: 18, atk3: 26, death: 19, defend: 8, hurt: 6, idle: 8, jump_down: 3, jump_up: 3, roll: 6, run: 8, sp_atk: 30 }
  },
  berserker: {
    frameW: 288, frameH: 128, scale: 1.148,
    anims: { air_atk: 7, atk1: 6, atk2: 12, atk3: 23, death: 18, defend: 13, hurt: 6, idle: 6, jump_down: 3, jump_up: 3, roll: 6, run: 8, sp_atk: 25 }
  },
  dragoon: {
    frameW: 725, frameH: 445, scale: 0.33,
    anims: { atk1: 40, idle: 40, run: 40 }
  },
  mage: {
    frameW: 288, frameH: 128, scale: 1.148,
    anims: { air_atk: 8, atk1: 7, atk2: 7, atk3: 17, death: 15, defend: 9, hurt: 6, idle: 8, jump_down: 3, jump_up: 3, roll: 8, run: 8, sp_atk: 15 }
  },
  necromancer: {
    frameW: 140, frameH: 93, scale: 1.581,
    anims: { atk1: 10, death: 10, hurt: 3, idle: 8, run: 8, sp_atk: 9 }
  },
  paladin: {
    frameW: 288, frameH: 128, scale: 1.148,
    anims: { air_atk: 8, atk1: 11, atk2: 19, atk3: 28, death: 13, defend: 10, hurt: 6, idle: 8, jump_down: 3, jump_up: 3, roll: 8, run: 8, sp_atk: 18 }
  },
  priest: {
    frameW: 288, frameH: 128, scale: 1.148,
    anims: { air_atk: 8, atk1: 7, atk2: 21, atk3: 27, idle: 8, jump_down: 3, jump_up: 3, roll: 6, run: 10 }
  },
  ninja: {
    // LuizMelo Martial Hero - one horizontal strip per animation, 200x200
    // frames, measured with tools/analyze-spritesheet.mjs.
    frameW: 200, frameH: 200, scale: 0.735,
    anims: { idle: 8, run: 8, jump_up: 2, jump_down: 2, atk1: 6, atk2: 6, atk3: 6, hurt: 4, death: 6 },
    strips: {
      idle: '/assets/martial-hero/Sprites/Idle.png',
      run: '/assets/martial-hero/Sprites/Run.png',
      jump_up: '/assets/martial-hero/Sprites/Jump.png',
      jump_down: '/assets/martial-hero/Sprites/Fall.png',
      atk1: '/assets/martial-hero/Sprites/Attack1.png',
      atk2: '/assets/martial-hero/Sprites/Attack2.png',
      atk3: '/assets/martial-hero/Sprites/Attack1.png',
      hurt: '/assets/martial-hero/Sprites/Take Hit.png',
      death: '/assets/martial-hero/Sprites/Death.png'
    }
  },
  warrior: {
    frameW: 288, frameH: 128, scale: 1.148,
    anims: { air_atk: 8, atk1: 6, atk2: 8, atk3: 18, idle: 8, jump_down: 3, jump_up: 3, roll: 7, run: 8 }
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
