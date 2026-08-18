/**
 * Catalogue of skill sounds. DATA ONLY.
 *
 * Chosen for WEIGHT as much as character. The spell pack ships 75 clips but 65
 * of them are uncompressed RIFF/WAV mislabelled as .ogg, up to 1.5 MB each -
 * fetching and decoding one mid-fight is a visible stall, which is exactly what
 * made casting lag. Only 10 of them are genuinely compressed.
 *
 * So: tiny compressed files carry most of the roster, a small number of large
 * ones are kept for the sounds nothing else can make, and the whole set is
 * warmed at startup so a cast never waits on a decode. Variety comes from pitch
 * and volume - AudioManager already randomises pitch per play - rather than
 * from hoarding megabytes of near-identical samples.
 */

export interface SfxDef {
  src: string;
  /** 0..1. */
  volume: number;
  /** Playback rate. Above 1 reads lighter/faster, below 1 heavier. */
  rate?: number;
  /** Clip the sample so a skill lands as a hit, not a drone. */
  maxDuration?: number;
}

const BATTLE = '/assets/audio/sfx/RPG Sound Pack/battle';
const SPELL = '/assets/audio/spell-sfx';
const CC0 = '/assets/audio/cc0-sfx';
const RPGG = '/assets/audio/rpgg-sfx';
const ULTVOICE = '/assets/audio/ultimates';

const s = (src: string, volume: number, rate = 1.0, maxDuration?: number): SfxDef =>
  ({ src, volume, rate, maxDuration });

export const SFX: Record<string, SfxDef> = {
  // ---- Melee: small foley, pitched per weapon weight ----
  swing_light:  s(`${BATTLE}/swing.wav`, 0.34, 1.15, 0.22),
  swing_heavy:  s(`${BATTLE}/swing2.wav`, 0.42, 0.80, 0.30),
  swing_spear:  s(`${BATTLE}/swing3.wav`, 0.36, 1.05, 0.26),
  swing_dagger: s(`${RPGG}/knifeSlice.ogg`, 0.36, 1.25, 0.18),
  blade_draw:   s(`${RPGG}/drawKnife2.ogg`, 0.36, 1.0, 0.35),
  cleave:       s(`${RPGG}/chop.ogg`, 0.44, 0.85, 0.30),

  // ---- Impacts ----
  hit_sharp:    s(`${CC0}/hit_01.ogg`, 0.34, 1.15, 0.20),
  hit_blunt:    s(`${CC0}/hit_03.ogg`, 0.38, 0.90, 0.26),
  slam:         s(`${CC0}/slam_02.ogg`, 0.42, 0.85, 0.35),
  metal_ring:   s(`${CC0}/metal_05.ogg`, 0.32, 1.10, 0.30),

  // ---- Fire ----
  fire_bolt:    s(`${CC0}/explosion.ogg`, 0.30, 1.45, 0.26),
  fire_burst:   s(`${CC0}/explosion.ogg`, 0.38, 1.05, 0.40),
  fire_breath:  s(`${CC0}/noise_01.ogg`, 0.34, 0.85, 0.55),
  fire_big:     s(`${SPELL}/explode4.ogg`, 0.50, 0.80, 0.90),

  // ---- Ice / water ----
  ice_shard:    s(`${CC0}/glass_02.ogg`, 0.34, 1.30, 0.28),
  ice_nova:     s(`${CC0}/glass_04.ogg`, 0.38, 0.85, 0.45),
  water_burst:  s(`${CC0}/splash_01.ogg`, 0.34, 1.0, 0.40),

  // ---- Lightning: the compressed zap family ----
  zap_light:    s(`${SPELL}/zap2e.ogg`, 0.32, 1.20, 0.26),
  zap_chain:    s(`${SPELL}/zap2.ogg`, 0.36, 1.0, 0.38),
  zap_heavy:    s(`${SPELL}/zap2g.ogg`, 0.42, 0.85, 0.50),

  // ---- Holy ----
  holy_strike:  s(`${CC0}/bell_02.ogg`, 0.32, 1.25, 0.35),
  holy_ward:    s(`${CC0}/gong_01.ogg`, 0.34, 1.10, 0.50),
  holy_heal:    s(`${CC0}/bell_01.ogg`, 0.36, 1.0, 0.55),
  holy_judge:   s(`${SPELL}/blessing2.ogg`, 0.48, 0.85, 0.95),

  // ---- Dark ----
  dark_bolt:    s(`${CC0}/weird_02.ogg`, 0.32, 1.15, 0.30),
  dark_drain:   s(`${CC0}/weird_04.ogg`, 0.34, 0.95, 0.42),
  dark_curse:   s(`${CC0}/weird_01.ogg`, 0.34, 0.85, 0.45),
  dark_plague:  s(`${CC0}/weird_05.ogg`, 0.36, 0.90, 0.50),
  dark_nova:    s(`${SPELL}/curse3.ogg`, 0.48, 0.80, 0.95),

  // ---- Movement / utility ----
  dash_warp:    s(`${SPELL}/warp2.ogg`, 0.32, 1.20, 0.28),
  blink:        s(`${SPELL}/warp2.ogg`, 0.32, 1.45, 0.24),
  smoke_vanish: s(`${CC0}/noise_02.ogg`, 0.30, 1.10, 0.35),
  wind_shot:    s(`${SPELL}/forcepush.ogg`, 0.30, 1.30, 0.24),
  wind_gust:    s(`${SPELL}/forcepush.ogg`, 0.34, 0.90, 0.40),
  force_push:   s(`${SPELL}/forcepush.ogg`, 0.38, 1.0, 0.35),
  force_pulse:  s(`${CC0}/slam_05.ogg`, 0.40, 0.85, 0.45),

  // ---- Buffs / summons ----
  buff_roar:    s(`${CC0}/gong_02.ogg`, 0.36, 0.90, 0.50),
  buff_focus:   s(`${CC0}/spring_03.ogg`, 0.32, 1.20, 0.40),
  summon:       s(`${CC0}/machine_02.ogg`, 0.36, 0.90, 0.55),
  trap_set:     s(`${CC0}/switch_01.ogg`, 0.32, 1.10, 0.28),

  // ---- Ultimate layers ----
  ult_charge:   s(`${CC0}/machine_03.ogg`, 0.40, 0.85, 0.55),
  ult_boom:     s(`${SPELL}/explode4.ogg`, 0.55, 0.72, 1.10),
  ult_holy:     s(`${SPELL}/blessing2.ogg`, 0.52, 0.82, 1.10),
  ult_dark:     s(`${SPELL}/curse3.ogg`, 0.52, 0.78, 1.10),
  ult_storm:    s(`${SPELL}/zap2g.ogg`, 0.52, 0.80, 0.95)
};

export type SfxId = keyof typeof SFX;

/** Every distinct file, for warming and validation. */
export function allSfxPaths(): string[] {
  // Voice lines are deliberately excluded. They are two orders of magnitude
  // larger than the foley - a full set is comparable to the entire rest of the
  // catalogue - and only one of them can ever play, since a player has one
  // class. Warming all ten at startup is the same mistake that made casting
  // lag before; warmUltimateVoice fetches just the one that matters.
  const voices = new Set(Object.values(ULTIMATE_VOICES).map((v) => v.id));
  return [...new Set(
    Object.entries(SFX).filter(([id]) => !voices.has(id)).map(([, d]) => d.src)
  )];
}

/**
 * The voice line each class gets on its ultimate, with the clip's exact length.
 *
 * Measured at build time rather than read from an Audio element: by the time a
 * browser reports duration the cinematic has already begun, and a clip still
 * buffering reports NaN.
 */
export interface UltimateVoice {
  /** Key registered into SFX below. */
  id: string;
  src: string;
  /** Seconds, measured from the file. */
  duration: number;
}

// BEGIN GENERATED ultimate voices
// Regenerate with: node tools/sync-ultimate-voices.mjs
// Durations are measured from the files, never estimated - the director has to
// know how long to hold before it draws its first frame.
export const ULTIMATE_VOICES: Record<string, UltimateVoice> = {
  archer: { id: 'ult_voice_archer', src: `${ULTVOICE}/archer-ultimate.ogg`, duration: 6.526 },
  warrior: { id: 'ult_voice_warrior', src: `${ULTVOICE}/warrior-ultimate.ogg`, duration: 6.973 },
};
// END GENERATED ultimate voices

// Voice clips play in full, so no maxDuration: the cinematic is timed to the
// clip, not the clip cut to fit the cinematic.
for (const voice of Object.values(ULTIMATE_VOICES)) {
  SFX[voice.id] = { src: voice.src, volume: 0.9, rate: 1.0 };
}
