/**
 * Catalogue of every usable pixel-art visual effect.
 *
 * This file is DATA ONLY - no drawing logic. Every entry points at real sprite
 * frames in public/assets and describes how to slice and time them. Adding a new
 * effect is one object literal; nothing here should ever draw with canvas
 * primitives.
 *
 * All layouts below were measured from the actual PNG headers, not guessed.
 */

import type { SheetLayout, Anchor } from './SpriteSheet';

export interface VfxDef {
  /** Image path for grid/strip layouts. Empty for 'frames'. */
  src: string;
  layout: SheetLayout;
  fps: number;
  /** Base render scale. Source art is small (32-128px) so most need scaling up. */
  scale: number;
  anchor?: Anchor;
  /** 'lighter' for additive glow - magic, light, energy. Omit for solid art. */
  blend?: GlobalCompositeOperation;
  /** Effect reads as directional and should mirror with the caster's facing. */
  directional?: boolean;
}

const ANSIMUZ = '/assets/vfx/ansimuz';
const GROTTO = `${ANSIMUZ}/Grotto-escape-2-FX/sprites`;
const WARPED = `${ANSIMUZ}/Warped shooting fx`;
const PIXEL_SPELLS = '/assets/aaa_spells/pixel/Pixelart Spells/PNG Files';
const SPECIAL2D = '/assets/sanju_vfx/special2d';

/** Grotto frames are named `_0000_Layer-1.png`, `_0001_Layer-2.png`, ... */
function grotto(dir: string, count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => `${GROTTO}/${dir}/_000${i}_Layer-${i + 1}.png`
  );
}

/** Horizontal strip helper - the most common layout in these packs. */
function hstrip(frameW: number, frameH: number, count: number): SheetLayout {
  return { kind: 'strip', dir: 'h', frameW, frameH, count };
}

/** Vertical strip helper - used by the sanju special2d set. */
function vstrip(frameW: number, frameH: number, count: number): SheetLayout {
  return { kind: 'strip', dir: 'v', frameW, frameH, count };
}

// ---------------------------------------------------------------------------
// AAAAA download packs, copied to public/assets/fxpack.
// Every layout below was measured with tools/analyze-spritesheet.mjs, which
// reads the alpha channel and finds frame gutters, rather than inferred from
// image dimensions.
// ---------------------------------------------------------------------------

const FXP = '/assets/fxpack';
const ANIMPACK = `${FXP}/Animation Pack/Animation Pack`;
const MAGIC = `${FXP}/free-pixel-magic-sprite-effects-pack/1 Magic`;
const ATTACK = `${FXP}/ATTACK FREE`;
const FIRE1 = `${FXP}/Fire Effect 1/Fire Effect 1`;

/**
 * BDragon "Effect and FX Pixel" sheets: a 64x64 grid, N columns of animation
 * by 9 rows of colour. Verified identical row order across every pack:
 *   0 orange/gold  1 magenta  2 cyan  3 green  4 tan
 *   5 white/grey   6 mauve    7 red   8 navy
 * The row is chosen at play time from the skill's damage type, so one entry
 * covers all nine variants - see FX_COLOUR_ROW.
 */
function palette(pack: string, file: string, cols: number): VfxDef {
  return {
    src: `${FXP}/${pack}/${file}.png`,
    layout: { kind: 'grid', frameW: 64, frameH: 64, cols, rows: 9 },
    fps: 20, scale: 1.5, blend: 'lighter'
  };
}

/** Damage type -> colour row in the palette sheets. */
export const FX_COLOUR_ROW: Record<string, number> = {
  fire: 7, holy: 0, dark: 1, ice: 2, lightning: 2, physical: 5, magical: 1
};

const P1 = 'Effect and FX Pixel Part 1 Free/Free';
const P8 = 'Effect and FX Pixel Part 8 Free/Free';
const P10 = 'Effect and FX Pixel Part 10 Free/Free';
const P12 = 'Effect and FX Pixel Part 12 Free/Effect and FX Pixel Part 12 Free';

export const VFX: Record<string, VfxDef> = {
  // ---------- Palette sheets (auto-tinted by damage type) ----------
  fx_swirl_a: palette(P1, '03', 13), fx_swirl_b: palette(P1, '04', 14),
  fx_swirl_c: palette(P1, '05', 14), fx_swirl_d: palette(P1, '06', 15),
  fx_ring_a: palette(P1, '13', 13), fx_ring_b: palette(P1, '14', 14),
  fx_ring_c: palette(P1, '15', 14), fx_ring_d: palette(P1, '16', 14),
  fx_burst_a: palette(P1, '23', 14), fx_burst_b: palette(P1, '24', 14),
  fx_burst_c: palette(P1, '25', 14), fx_burst_d: palette(P1, '26', 14),

  fx_swipe_a: palette(P8, '375', 8), fx_swipe_b: palette(P8, '376', 8),
  fx_swipe_c: palette(P8, '377', 8), fx_swipe_d: palette(P8, '378', 8),
  fx_arc_a: palette(P8, '385', 8), fx_arc_b: palette(P8, '386', 9),
  fx_arc_c: palette(P8, '387', 8), fx_arc_d: palette(P8, '388', 9),
  fx_cleave_a: palette(P8, '395', 9), fx_cleave_b: palette(P8, '396', 8),
  fx_cleave_c: palette(P8, '397', 9), fx_cleave_d: palette(P8, '398', 9),

  fx_pulse_a: palette(P10, '464', 11), fx_pulse_b: palette(P10, '465', 12),
  fx_pulse_c: palette(P10, '466', 11), fx_pulse_d: palette(P10, '467', 11),
  fx_wave_a: palette(P10, '474', 11), fx_wave_b: palette(P10, '475', 12),
  fx_wave_c: palette(P10, '476', 12), fx_wave_d: palette(P10, '477', 12),
  fx_spiral_a: palette(P10, '484', 12), fx_spiral_b: palette(P10, '485', 12),
  fx_spiral_c: palette(P10, '486', 12), fx_spiral_d: palette(P10, '487', 11),

  fx_star_a: palette(P12, '566', 13), fx_star_b: palette(P12, '567', 13),
  fx_star_c: palette(P12, '568', 14), fx_star_d: palette(P12, '569', 13),
  fx_bloom_a: palette(P12, '576', 14), fx_bloom_b: palette(P12, '577', 14),
  fx_bloom_c: palette(P12, '578', 11), fx_bloom_d: palette(P12, '579', 14),
  fx_flare_a: palette(P12, '586', 14), fx_flare_b: palette(P12, '587', 13),
  fx_flare_c: palette(P12, '588', 14), fx_flare_d: palette(P12, '589', 14),

  // ---------- Named elemental sheets ----------
  fx_thunder: { src: `${ANIMPACK}/Thunder.png`, layout: hstrip(256, 256, 2), fps: 12, scale: 1.4, blend: 'lighter' },
  fx_hit_big: { src: `${ANIMPACK}/Hit Effect.png`, layout: vstrip(128, 128, 5), fps: 18, scale: 1.2, blend: 'lighter' },
  fx_magic_mirror: { src: `${ANIMPACK}/Magic Mirror.png`, layout: vstrip(128, 128, 5), fps: 14, scale: 1.3, blend: 'lighter' },
  fx_explosion_big: { src: `${ANIMPACK}/explosioneffect.png`, layout: vstrip(128, 128, 8), fps: 18, scale: 1.5 },
  fx_energy_ball: { src: `${ANIMPACK}/Energy ball/EnergyBall.png`, layout: hstrip(128, 128, 9), fps: 18, scale: 1.1, blend: 'lighter', directional: true },
  fx_energy_impact: { src: `${ANIMPACK}/Energy ball/energyBallImpact.png`, layout: vstrip(128, 128, 8), fps: 20, scale: 1.2, blend: 'lighter' },
  fx_burn: { src: `${ANIMPACK}/Fire/Burn.png`, layout: vstrip(128, 128, 10), fps: 16, scale: 1.3, anchor: 'bottom' },
  fx_shine: { src: `${ANIMPACK}/Fire/Shine.png`, layout: hstrip(64, 64, 6), fps: 16, scale: 1.6, blend: 'lighter' },
  fx_ice_ball: { src: `${ANIMPACK}/Ice/Ball of ice.png`, layout: vstrip(128, 128, 4), fps: 14, scale: 1.1, blend: 'lighter', directional: true },
  fx_ice_burst: { src: `${ANIMPACK}/Ice/Burst of ice.png`, layout: vstrip(128, 128, 7), fps: 18, scale: 1.3, blend: 'lighter' },

  fx_firebolt: { src: `${FIRE1}/Firebolt SpriteSheet.png`, layout: hstrip(48, 48, 10), fps: 18, scale: 1.8, blend: 'lighter', directional: true },

  // ---------- Melee sheets (Sangoro attack pack) ----------
  fx_slash_big: { src: `${ATTACK}/BigSlashV.png`, layout: hstrip(64, 48, 5), fps: 22, scale: 2.0, directional: true },
  fx_slash_h: { src: `${ATTACK}/Hslash1.png`, layout: hstrip(64, 32, 5), fps: 22, scale: 2.0, directional: true },
  fx_punch: { src: `${ATTACK}/PunchImp1.png`, layout: hstrip(48, 32, 5), fps: 22, scale: 1.9, directional: true },
  fx_slash_small: { src: `${ATTACK}/VslashSmall1.png`, layout: hstrip(32, 48, 4), fps: 22, scale: 1.9, directional: true },
  fx_slash_v: { src: `${ATTACK}/vSlash1.png`, layout: hstrip(64, 48, 4), fps: 22, scale: 2.0, directional: true },

  // ---------- Thrusts ----------
  fx_thrust_a: { src: `${FXP}/Thrust/Thrusts 1 SpriteSheet.png`, layout: vstrip(64, 32, 5), fps: 20, scale: 2.0, directional: true },
  fx_thrust_b: { src: `${FXP}/Thrust/Thrust 2 SpriteSheet.png`, layout: vstrip(64, 32, 5), fps: 20, scale: 2.0, directional: true },

  // ---------- Small effects ----------
  fx_spark_a: { src: `${FXP}/Effects/Effect 1 - Sprite Sheet.png`, layout: vstrip(64, 32, 4), fps: 18, scale: 2.0, blend: 'lighter' },
  fx_spark_b: { src: `${FXP}/Effects/Effect 2 - Sprite Sheet.png`, layout: vstrip(64, 32, 4), fps: 18, scale: 2.0, blend: 'lighter' },
  fx_spark_c: { src: `${FXP}/Effects/Effect 3 - Sprite Sheet.png`, layout: vstrip(32, 32, 4), fps: 18, scale: 2.2, blend: 'lighter' },
  fx_spark_d: { src: `${FXP}/Effects/Effect 4 - Sprite Sheet.png`, layout: vstrip(32, 32, 4), fps: 18, scale: 2.2, blend: 'lighter' },

  // ---------- Magic pack (uniform 72x72; the detector over-split these
  //            because the art has internal transparent bands) ----------
  fx_magic_a: { src: `${MAGIC}/1.png`, layout: hstrip(72, 72, 8), fps: 18, scale: 1.5, blend: 'lighter' },
  fx_magic_b: { src: `${MAGIC}/2.png`, layout: hstrip(72, 72, 8), fps: 18, scale: 1.5, blend: 'lighter' },
  fx_magic_c: { src: `${MAGIC}/3.png`, layout: hstrip(72, 72, 8), fps: 18, scale: 1.5, blend: 'lighter' },
  fx_magic_d: { src: `${MAGIC}/5.png`, layout: hstrip(72, 72, 8), fps: 18, scale: 1.5, blend: 'lighter' },
  fx_magic_e: { src: `${MAGIC}/7.png`, layout: hstrip(72, 72, 8), fps: 18, scale: 1.5, blend: 'lighter' },
  fx_magic_f: { src: `${MAGIC}/8.png`, layout: hstrip(72, 72, 8), fps: 18, scale: 1.5, blend: 'lighter' },
  fx_magic_g: { src: `${MAGIC}/9.png`, layout: hstrip(72, 72, 8), fps: 18, scale: 1.5, blend: 'lighter' },
  fx_magic_h: { src: `${MAGIC}/10.png`, layout: hstrip(72, 72, 6), fps: 18, scale: 1.5, blend: 'lighter' },
  fx_magic_i: { src: `${MAGIC}/6_2.png`, layout: hstrip(72, 72, 4), fps: 16, scale: 1.5, blend: 'lighter' },
  fx_magic_j: { src: `${MAGIC}/4_1.png`, layout: hstrip(72, 72, 4), fps: 16, scale: 1.5, blend: 'lighter' },
  fx_magic_k: { src: `${MAGIC}/4_2.png`, layout: hstrip(72, 72, 4), fps: 16, scale: 1.5, blend: 'lighter' },
  fx_magic_l: { src: `${MAGIC}/3_2.png`, layout: hstrip(72, 72, 8), fps: 18, scale: 1.5, blend: 'lighter' },
  fx_magic_m: { src: `${MAGIC}/1_2.png`, layout: hstrip(72, 72, 8), fps: 18, scale: 1.5, blend: 'lighter' },


  // ---------- Slashes (physical melee) ----------
  slash_horizontal: {
    src: '', layout: { kind: 'frames', paths: grotto('slash-horizontal', 5) },
    fps: 24, scale: 1.6, directional: true
  },
  slash_upward: {
    src: '', layout: { kind: 'frames', paths: grotto('slash-upward', 5) },
    fps: 24, scale: 1.6, directional: true
  },
  slash_circular: {
    src: '', layout: { kind: 'frames', paths: grotto('slash-circular', 6) },
    fps: 22, scale: 1.9
  },

  // ---------- Impacts / hits ----------
  hit_small: {
    src: `${ANSIMUZ}/Hit/hit.png`, layout: hstrip(31, 32, 3),
    fps: 20, scale: 1.8, blend: 'lighter'
  },
  hit_spark: {
    src: `${WARPED}/hits/hits-1/spritesheet.png`, layout: hstrip(32, 32, 5),
    fps: 22, scale: 1.8, blend: 'lighter'
  },
  hit_burst: {
    src: `${WARPED}/hits/Hits-2/spritesheet.png`, layout: hstrip(32, 32, 7),
    fps: 22, scale: 2.0, blend: 'lighter'
  },
  hit_ring: {
    src: `${WARPED}/hits/Hits-3/spritesheet.png`, layout: hstrip(32, 32, 5),
    fps: 22, scale: 2.0, blend: 'lighter'
  },
  hit_heavy: {
    src: `${WARPED}/hits/hits-4/spritesheet.png`, layout: hstrip(32, 32, 7),
    fps: 20, scale: 2.4, blend: 'lighter'
  },
  hit_dark: {
    src: `${WARPED}/hits/Hits-5/spritesheet.png`, layout: hstrip(32, 32, 7),
    fps: 22, scale: 2.1, blend: 'lighter'
  },
  hit_holy: {
    src: `${WARPED}/hits/Hits-6/spritesheet.png`, layout: hstrip(32, 32, 7),
    fps: 22, scale: 2.1, blend: 'lighter'
  },
  energy_smack: {
    src: '', layout: { kind: 'frames', paths: grotto('energy-smack', 8) },
    fps: 22, scale: 1.3, blend: 'lighter', directional: true
  },

  // ---------- Explosions ----------
  explosion_tiny: {
    src: `${ANSIMUZ}/Explosions pack/explosion-1-a/spritesheet.png`, layout: hstrip(32, 32, 8),
    fps: 20, scale: 2.0
  },
  explosion_small: {
    src: `${ANSIMUZ}/Explosions pack/explosion-1-b/spritesheet.png`, layout: hstrip(64, 64, 8),
    fps: 20, scale: 1.6
  },
  explosion_wide: {
    src: `${ANSIMUZ}/Explosions pack/explosion-1-c/spritesheet.png`, layout: hstrip(128, 80, 10),
    fps: 20, scale: 1.5
  },
  // Filename typo 'spritsheet' is in the source pack, not a mistake here.
  explosion_big: {
    src: `${ANSIMUZ}/Explosions pack/explosion-1-d/spritsheet.png`, layout: hstrip(128, 128, 12),
    fps: 22, scale: 1.6
  },
  explosion_huge: {
    src: `${ANSIMUZ}/Explosions pack/explosion-1-e/explosion-5.png`, layout: hstrip(192, 192, 22),
    fps: 24, scale: 1.8
  },
  explosion_puff: {
    src: `${ANSIMUZ}/Explosions pack/explosion-1-f/Sprites.png`, layout: hstrip(48, 48, 8),
    fps: 20, scale: 1.8
  },
  explosion_smoke: {
    src: `${ANSIMUZ}/Explosions pack/explosion-1-g/spritesheet.png`, layout: hstrip(48, 48, 7),
    fps: 18, scale: 2.0
  },
  ground_explosion: {
    src: `${ANSIMUZ}/Ground Explosion/spritesheet/explosion-animation.png`,
    layout: hstrip(112, 128, 9),
    fps: 20, scale: 1.8, anchor: 'bottom'
  },
  enemy_death: {
    src: `${ANSIMUZ}/EnemyDeath/spritesheet.png`, layout: hstrip(48, 48, 8),
    fps: 18, scale: 1.8
  },

  // ---------- Projectiles (pixel spell strips, 16x16 @ 6 frames) ----------
  proj_fireball: { src: `${PIXEL_SPELLS}/Fireball.png`, layout: hstrip(16, 16, 6), fps: 16, scale: 2.4, blend: 'lighter', directional: true },
  proj_firebomb: { src: `${PIXEL_SPELLS}/Firebomb.png`, layout: hstrip(16, 16, 6), fps: 16, scale: 2.4, blend: 'lighter', directional: true },
  proj_ice_lance: { src: `${PIXEL_SPELLS}/Ice Lance.png`, layout: hstrip(16, 16, 4), fps: 16, scale: 2.4, blend: 'lighter', directional: true },
  proj_arcane: { src: `${PIXEL_SPELLS}/Arcane Bolt.png`, layout: hstrip(16, 16, 6), fps: 16, scale: 2.4, blend: 'lighter', directional: true },
  proj_darkness: { src: `${PIXEL_SPELLS}/Darkness Bolt.png`, layout: hstrip(16, 16, 6), fps: 16, scale: 2.4, blend: 'lighter', directional: true },
  proj_dark_orb: { src: `${PIXEL_SPELLS}/Darkness Orb.png`, layout: hstrip(16, 16, 6), fps: 16, scale: 2.6, blend: 'lighter', directional: true },
  proj_light: { src: `${PIXEL_SPELLS}/Light Bolt.png`, layout: hstrip(16, 16, 6), fps: 16, scale: 2.4, blend: 'lighter', directional: true },
  proj_purity: { src: `${PIXEL_SPELLS}/Bolt Of Purity.png`, layout: hstrip(16, 16, 6), fps: 16, scale: 2.4, blend: 'lighter', directional: true },
  proj_magic_orb: { src: `${PIXEL_SPELLS}/Magic Orb.png`, layout: hstrip(16, 16, 6), fps: 16, scale: 2.4, blend: 'lighter', directional: true },
  proj_wind: { src: `${PIXEL_SPELLS}/Wind Bolt.png`, layout: hstrip(16, 16, 6), fps: 16, scale: 2.4, blend: 'lighter', directional: true },
  proj_plant: { src: `${PIXEL_SPELLS}/Plant Missle.png`, layout: hstrip(16, 16, 6), fps: 16, scale: 2.4, blend: 'lighter', directional: true },
  proj_water: { src: `${PIXEL_SPELLS}/Water Bolt.png`, layout: hstrip(16, 16, 6), fps: 16, scale: 2.4, blend: 'lighter', directional: true },
  proj_rock: { src: `${PIXEL_SPELLS}/Rock Sling.png`, layout: hstrip(16, 16, 1), fps: 12, scale: 2.4, directional: true },

  // ---------- Beams / rays ----------
  ray_magic: { src: `${PIXEL_SPELLS}/Magic Ray.png`, layout: hstrip(16, 16, 8), fps: 18, scale: 2.6, blend: 'lighter', directional: true },
  ray_mono: { src: `${PIXEL_SPELLS}/Black And White Ray.png`, layout: hstrip(16, 16, 8), fps: 18, scale: 2.6, blend: 'lighter', directional: true },
  sparks_magic: { src: `${PIXEL_SPELLS}/Magic Sparks.png`, layout: hstrip(16, 16, 6), fps: 18, scale: 2.6, blend: 'lighter' },
  sparks_mono: { src: `${PIXEL_SPELLS}/Black And White Sparks.png`, layout: hstrip(16, 16, 6), fps: 18, scale: 2.6, blend: 'lighter' },
  splash: { src: `${PIXEL_SPELLS}/Splash.png`, layout: hstrip(32, 32, 6), fps: 18, scale: 2.0, blend: 'lighter' },
  water_blast: { src: `${PIXEL_SPELLS}/Water Blast.png`, layout: hstrip(16, 16, 6), fps: 18, scale: 2.6, blend: 'lighter', directional: true },
  shield_bubble: { src: `${PIXEL_SPELLS}/Pixelart Shield.png`, layout: hstrip(48, 48, 6), fps: 14, scale: 1.8, blend: 'lighter' },

  // ---------- Energy / arcane (warped pack) ----------
  bolt_energy: { src: `${WARPED}/Bolt/spritesheet.png`, layout: hstrip(48, 32, 4), fps: 18, scale: 1.8, blend: 'lighter', directional: true },
  pulse_energy: { src: `${WARPED}/Pulse/spritesheet.png`, layout: hstrip(63, 32, 4), fps: 18, scale: 1.8, blend: 'lighter' },
  charged_energy: { src: `${WARPED}/charged/spritesheet.png`, layout: hstrip(63, 48, 6), fps: 18, scale: 1.8, blend: 'lighter' },
  crossed_energy: { src: `${WARPED}/crossed/spritesheet.png`, layout: hstrip(32, 32, 6), fps: 20, scale: 2.0, blend: 'lighter' },
  spark_trail: { src: `${WARPED}/spark/spritesheet.png`, layout: hstrip(63, 32, 5), fps: 20, scale: 1.7, blend: 'lighter', directional: true },
  waveform: { src: `${WARPED}/waveform/spritesheet.png`, layout: hstrip(95, 32, 4), fps: 18, scale: 1.8, blend: 'lighter', directional: true },
  electro_shock: {
    src: '', layout: { kind: 'frames', paths: grotto('electro-shock', 9) },
    fps: 22, scale: 1.4, blend: 'lighter'
  },
  energy_field: {
    src: '', layout: { kind: 'frames', paths: grotto('energy-field', 8) },
    fps: 16, scale: 2.2, blend: 'lighter'
  },
  fire_ball_small: {
    src: '', layout: { kind: 'frames', paths: grotto('fire-ball', 3) },
    fps: 14, scale: 1.8, blend: 'lighter', directional: true
  },

  // ---------- Dark magic (grid layouts) ----------
  // 400x64 sheet, 40x32 frames => 10 cols x 2 rows, 17 frames used.
  dark_swirl: {
    src: '/assets/vfx/dark_vfx/Dark VFX 1/Dark VFX 1 (40x32).png',
    layout: { kind: 'grid', frameW: 40, frameH: 32, cols: 10, rows: 2, count: 17 },
    fps: 20, scale: 2.2, blend: 'lighter'
  },
  dark_column: {
    src: '/assets/vfx/dark_vfx/Dark VFX 2/Dark VFX 2 (48x64).png',
    layout: hstrip(48, 64, 16),
    fps: 20, scale: 2.0, blend: 'lighter', anchor: 'bottom'
  },

  // ---------- Ambient loops (sanju special2d, vertical strips) ----------
  aura_green: { src: `${SPECIAL2D}/green_effect.png`, layout: vstrip(32, 32, 10), fps: 14, scale: 2.0, blend: 'lighter' },
  aura_glow: { src: `${SPECIAL2D}/light_glow_effect.png`, layout: vstrip(64, 64, 10), fps: 14, scale: 1.6, blend: 'lighter' },
  aura_magic: { src: `${SPECIAL2D}/magic_effect.png`, layout: vstrip(32, 32, 10), fps: 14, scale: 2.0, blend: 'lighter' },
  aura_magic2: { src: `${SPECIAL2D}/magic_effect_2.png`, layout: vstrip(32, 32, 10), fps: 14, scale: 2.0, blend: 'lighter' },
  aura_sparks: { src: `${SPECIAL2D}/sparks_effect.png`, layout: vstrip(64, 64, 12), fps: 16, scale: 1.6, blend: 'lighter' },

  // ---------- Water ----------
  water_splash: {
    src: `${ANSIMUZ}/Water splash/spritesheet.png`, layout: hstrip(26, 32, 3),
    fps: 16, scale: 2.0, anchor: 'bottom'
  }
};

export type VfxId = keyof typeof VFX;

/** Every distinct image path in the catalogue, for background warming. */
export function allVfxImagePaths(): string[] {
  const set = new Set<string>();
  for (const def of Object.values(VFX)) {
    if (def.layout.kind === 'frames') {
      for (const p of def.layout.paths) set.add(p);
    } else if (def.src) {
      set.add(def.src);
    }
  }
  return [...set];
}
