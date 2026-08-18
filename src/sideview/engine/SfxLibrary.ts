/**
 * Catalogue of skill sounds. DATA ONLY.
 *
 * The audio folder ships 300+ clips but only about ten were ever wired, routed
 * through a handful of generic profiles - so sixty skills shared a few sounds
 * and combat read as silent. Each entry here points at a real file with its own
 * volume, pitch and clip length.
 *
 * `maxDuration` matters: several of these clips run for seconds, and a skill
 * needs a hit, not a tail.
 */

export interface SfxDef {
  src: string;
  /** 0..1. The old wiring sat at 0.10-0.15, which is why nothing registered. */
  volume: number;
  /** Playback rate. Above 1 reads lighter/faster, below 1 heavier. */
  rate?: number;
  /** Clip the sample so a skill lands as a hit rather than a drone. */
  maxDuration?: number;
}

const BATTLE = '/assets/audio/sfx/RPG Sound Pack/battle';
const SPELL = '/assets/audio/spell-sfx';

const s = (src: string, volume: number, rate = 1.0, maxDuration?: number): SfxDef =>
  ({ src, volume, rate, maxDuration });

export const SFX: Record<string, SfxDef> = {
  // ---- Melee ----
  swing_light:  s(`${BATTLE}/swing.wav`, 0.34, 1.15, 0.22),
  swing_heavy:  s(`${BATTLE}/swing2.wav`, 0.40, 0.85, 0.30),
  swing_spear:  s(`${BATTLE}/swing3.wav`, 0.36, 1.05, 0.26),
  swing_dagger: s(`${BATTLE}/swing.wav`, 0.30, 1.45, 0.18),
  blade_draw:   s(`${BATTLE}/sword-unsheathe.wav`, 0.34, 1.0, 0.45),
  cleave:       s(`${BATTLE}/swing2.wav`, 0.42, 0.70, 0.38),

  // ---- Fire ----
  fire_bolt:    s(`${SPELL}/shot.ogg`, 0.30, 1.15, 0.30),
  fire_burst:   s(`${SPELL}/explode2.ogg`, 0.36, 0.95, 0.45),
  fire_breath:  s(`${SPELL}/flamethrower.ogg`, 0.34, 1.0, 0.70),
  fire_big:     s(`${SPELL}/explode5.ogg`, 0.46, 0.80, 0.90),

  // ---- Ice / water ----
  ice_shard:    s(`${SPELL}/freeze2.ogg`, 0.32, 1.20, 0.35),
  ice_nova:     s(`${SPELL}/freeze.ogg`, 0.38, 0.95, 0.60),
  water_burst:  s(`${SPELL}/water.ogg`, 0.32, 1.0, 0.45),

  // ---- Lightning ----
  zap_light:    s(`${SPELL}/zap.ogg`, 0.30, 1.25, 0.28),
  zap_chain:    s(`${SPELL}/zap2.ogg`, 0.34, 1.0, 0.40),
  zap_heavy:    s(`${SPELL}/zap10.ogg`, 0.40, 0.85, 0.55),

  // ---- Holy ----
  holy_strike:  s(`${SPELL}/blessing2.ogg`, 0.32, 1.10, 0.40),
  holy_ward:    s(`${SPELL}/magicshield.ogg`, 0.34, 1.0, 0.55),
  holy_heal:    s(`${SPELL}/heal.ogg`, 0.38, 1.0, 0.70),
  holy_judge:   s(`${SPELL}/blessing.ogg`, 0.46, 0.85, 0.95),

  // ---- Dark ----
  dark_bolt:    s(`${SPELL}/curse2.ogg`, 0.30, 1.15, 0.32),
  dark_drain:   s(`${SPELL}/curse3.ogg`, 0.32, 0.95, 0.45),
  dark_curse:   s(`${SPELL}/curse4.ogg`, 0.34, 0.90, 0.50),
  dark_plague:  s(`${SPELL}/pestilence.ogg`, 0.36, 1.0, 0.60),
  dark_nova:    s(`${SPELL}/curse5.ogg`, 0.46, 0.80, 0.95),

  // ---- Movement / utility ----
  dash_warp:    s(`${SPELL}/warp.ogg`, 0.30, 1.20, 0.30),
  blink:        s(`${SPELL}/teleport.ogg`, 0.32, 1.10, 0.35),
  smoke_vanish: s(`${SPELL}/steam.ogg`, 0.30, 1.0, 0.40),
  wind_shot:    s(`${SPELL}/wind.ogg`, 0.28, 1.20, 0.30),
  wind_gust:    s(`${SPELL}/wind2.ogg`, 0.32, 1.0, 0.45),
  force_push:   s(`${SPELL}/forcepush.ogg`, 0.36, 1.0, 0.45),
  force_pulse:  s(`${SPELL}/forcepulse.ogg`, 0.40, 0.90, 0.60),

  // ---- Buffs / summons ----
  buff_roar:    s(`${SPELL}/enchant.ogg`, 0.36, 0.95, 0.55),
  buff_focus:   s(`${SPELL}/enchant2.ogg`, 0.32, 1.05, 0.50),
  summon:       s(`${SPELL}/entrance.ogg`, 0.38, 1.0, 0.70),
  trap_set:     s(`${SPELL}/magicdrop.ogg`, 0.30, 1.10, 0.35),

  // ---- Ultimate layers ----
  ult_charge:   s(`${SPELL}/interlude.ogg`, 0.40, 1.0, 0.60),
  ult_boom:     s(`${SPELL}/explode4.ogg`, 0.52, 0.75, 1.10),
  ult_holy:     s(`${SPELL}/blessing3.ogg`, 0.50, 0.85, 1.10),
  ult_dark:     s(`${SPELL}/curse.ogg`, 0.50, 0.80, 1.10),
  ult_storm:    s(`${SPELL}/zap16.ogg`, 0.50, 0.85, 1.00)
};

export type SfxId = keyof typeof SFX;

/** Every distinct file in the catalogue, for validation and warming. */
export function allSfxPaths(): string[] {
  return [...new Set(Object.values(SFX).map(d => d.src))];
}
