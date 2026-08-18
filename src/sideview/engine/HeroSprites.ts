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
  /**
   * Where the character actually sits inside its frame, measured by
   * tools/measure-hero-anchors.mjs.
   *
   * The packs do not agree on framing. Chierit's put the character centred and
   * standing on the bottom edge, so the draw code assumed that for everyone -
   * but the necromancer sits 36px right of centre, and the dragoon and ninja
   * leave 98px and 78px of empty space under their feet. That is why those
   * three stood beside the platform or floated above it.
   */
  content?: {
    /** Pixels the character's centre sits right of the frame's centre. */
    centreOff: number;
    /** Empty pixels between the feet and the bottom of the frame. */
    feetGap: number;
  };
}

export const HERO_SPRITES: Record<string, HeroSpriteSet> = {
  archer: {
    frameW: 288, frameH: 128, scale: 1.148,
    anims: { air_atk: 10, atk1: 10, atk2: 15, atk3: 12, death: 19, defend: 19, hurt: 6, idle: 12, jump_down: 3, jump_up: 3, roll: 8, run: 10, sp_atk: 17 },
    content: { centreOff: -1.5, feetGap: 1 }
  },
  assassin: {
    frameW: 288, frameH: 128, scale: 1.148,
    anims: { air_atk: 7, atk1: 8, atk2: 18, atk3: 26, death: 19, defend: 8, hurt: 6, idle: 8, jump_down: 3, jump_up: 3, roll: 6, run: 8, sp_atk: 30 },
    content: { centreOff: 5.0, feetGap: 1 }
  },
  berserker: {
    frameW: 288, frameH: 128, scale: 1.148,
    anims: { air_atk: 7, atk1: 6, atk2: 12, atk3: 23, death: 18, defend: 13, hurt: 6, idle: 6, jump_down: 3, jump_up: 3, roll: 6, run: 8, sp_atk: 25 },
    content: { centreOff: 1.0, feetGap: 7 }
  },
  dragoon: {
    // Medieval Warrior 3 - the halberd and polearm spearman, which is what the
    // class description promises: "wields long lances".
    //
    // This entry previously pointed at the Elder Dragon art. That is the
    // dragoon's summon, not the dragoon - and it is the boss sprite too, so the
    // player character was identical to a boss. SpriteManager already had a
    // working drawDragoonHero using these sheets, but drawHero checks
    // HERO_SPRITES first, so the dragon entry shadowed it and that branch had
    // been unreachable ever since.
    frameW: 135, frameH: 135, scale: 1.20,
    anims: { idle: 10, run: 6, atk1: 4, atk2: 4, atk3: 5, jump_up: 2, jump_down: 2, hurt: 3, death: 9 },
    strips: {
      idle: '/assets/warrior3/Sprites/Idle.png',
      run: '/assets/warrior3/Sprites/Run.png',
      atk1: '/assets/warrior3/Sprites/Attack1.png',
      atk2: '/assets/warrior3/Sprites/Attack2.png',
      atk3: '/assets/warrior3/Sprites/Attack3.png',
      jump_up: '/assets/warrior3/Sprites/Jump.png',
      jump_down: '/assets/warrior3/Sprites/Fall.png',
      hurt: '/assets/warrior3/Sprites/Get Hit.png',
      death: '/assets/warrior3/Sprites/Death.png'
    },
    content: { centreOff: -0.5, feetGap: 49 }
  },

  mage: {
    frameW: 288, frameH: 128, scale: 1.148,
    anims: { air_atk: 8, atk1: 7, atk2: 7, atk3: 17, death: 15, defend: 9, hurt: 6, idle: 8, jump_down: 3, jump_up: 3, roll: 8, run: 8, sp_atk: 15 },
    content: { centreOff: 5.5, feetGap: 1 }
  },
  necromancer: {
    // Evil Wizard - a caster, which is what the class is.
    //
    // This entry used to point at /assets/heroes/necromancer, which is the
    // Bringer of Death reaper: byte for byte the same file the reaper boss uses,
    // and one of the necromancer's own summons. So the player character was
    // identical both to a boss and to a thing it conjures. Same fault as the
    // dragoon, and the same cause - drawHero checks HERO_SPRITES before its
    // hand-written branches, so drawEvilWizardHero has been unreachable.
    //
    // The pack has no jump or fall frames; drawElementalsHero falls back to idle
    // for any animation a set does not carry.
    frameW: 150, frameH: 150, scale: 0.84,
    anims: { idle: 8, run: 8, atk1: 8, atk2: 8, atk3: 8, hurt: 4, death: 5 },
    strips: {
      idle: '/assets/evil-wizard/Sprites/Idle.png',
      run: '/assets/evil-wizard/Sprites/Move.png',
      atk1: '/assets/evil-wizard/Sprites/Attack.png',
      atk2: '/assets/evil-wizard/Sprites/Attack.png',
      atk3: '/assets/evil-wizard/Sprites/Attack.png',
      hurt: '/assets/evil-wizard/Sprites/Take Hit.png',
      death: '/assets/evil-wizard/Sprites/Death.png'
    },
    content: { centreOff: -2.0, feetGap: 50 }
  },

  paladin: {
    frameW: 288, frameH: 128, scale: 1.148,
    anims: { air_atk: 8, atk1: 11, atk2: 19, atk3: 28, death: 13, defend: 10, hurt: 6, idle: 8, jump_down: 3, jump_up: 3, roll: 8, run: 8, sp_atk: 18 },
    content: { centreOff: -14.0, feetGap: 1 }
  },
  priest: {
    frameW: 288, frameH: 128, scale: 1.148,
    anims: { air_atk: 8, atk1: 7, atk2: 21, atk3: 27, idle: 8, jump_down: 3, jump_up: 3, roll: 6, run: 10 },
    content: { centreOff: 2.0, feetGap: 1 }
  },
  ninja: {
    // LuizMelo Martial Hero - one horizontal strip per animation, 200x200
    // frames, measured with tools/analyze-spritesheet.mjs.
    frameW: 200, frameH: 200, scale: 0.890,
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
    },
    content: { centreOff: -5.5, feetGap: 78 }
  },
  warrior: {
    frameW: 288, frameH: 128, scale: 1.148,
    anims: { air_atk: 8, atk1: 6, atk2: 8, atk3: 18, idle: 8, jump_down: 3, jump_up: 3, roll: 7, run: 8 },
    content: { centreOff: 2.5, feetGap: 1 }
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
  // sp_atk is the artist's signature move for each character, so it belongs to
  // the ultimate (slot 5) rather than a mid-list skill.
  const order = ['atk1', 'atk2', 'atk3', 'atk1', 'atk2', 'sp_atk'];
  const want = order[Math.max(0, Math.min(order.length - 1, skillIndex))];
  return set.anims[want] ? want : 'atk1';
}
