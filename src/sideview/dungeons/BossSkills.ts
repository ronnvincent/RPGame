/**
 * Boss abilities. DATA ONLY.
 *
 * Every boss did the same thing: walk into range and swing. The enemy record
 * already carried specialAttackTimer and currentPhase from an earlier attempt,
 * and nothing in the engine ever read either - so the scaffolding for this
 * existed while every fight played out identically.
 *
 * Each boss gets two, and no effect is shared between any of them: twenty-two
 * distinct ids, so no two bosses read the same way in play. Effects are drawn
 * from the existing catalogue rather than new art.
 */

export type BossSkillKind =
  /** Lands on the player's position after a wind-up. Dodgeable by moving. */
  | 'slam'
  /** Several projectiles fanned across the arena. */
  | 'volley'
  /** Expands from the boss, punishing melee range. */
  | 'nova'
  /** A line along the boss's facing. */
  | 'beam';

export interface BossSkill {
  name: string;
  /** Key into VfxLibrary. */
  vfx: string;
  /** Multiplier on the boss's own attack stat. */
  damage: number;
  /** Seconds before it can be used again. */
  cooldown: number;
  kind: BossSkillKind;
  /**
   * Seconds of warning before the damage lands.
   *
   * A boss that hits the instant it decides to is not difficulty, it is a coin
   * toss; the wind-up is what makes the fight readable.
   */
  telegraph: number;
  /** Colour of the warning flash and the shout. */
  colour: string;
}

export const BOSS_SKILLS: Record<string, BossSkill[]> = {
  'Chief Warlord Grimjaw': [
    { name: 'Warcry Slam', vfx: 'ground_explosion', damage: 1.7, cooldown: 7.5, kind: 'slam', telegraph: 0.8, colour: '#f97316' },
    { name: 'Cleaving Arc', vfx: 'slash_circular', damage: 1.3, cooldown: 5.5, kind: 'nova', telegraph: 0.5, colour: '#fbbf24' },
  ],
  'Arch-Lich Malakar': [
    { name: 'Soul Harvest', vfx: 'dark_column', damage: 1.9, cooldown: 8.0, kind: 'slam', telegraph: 0.9, colour: '#a855f7' },
    { name: 'Bone Volley', vfx: 'proj_dark_orb', damage: 1.0, cooldown: 5.0, kind: 'volley', telegraph: 0.4, colour: '#c084fc' },
  ],
  'Ancient Red Dragon Ignis': [
    { name: 'Infernal Breath', vfx: 'proj_fireball', damage: 1.5, cooldown: 6.0, kind: 'beam', telegraph: 0.7, colour: '#ef4444' },
    { name: 'Meteor Fall', vfx: 'explosion_huge', damage: 2.1, cooldown: 9.0, kind: 'slam', telegraph: 1.1, colour: '#f87171' },
  ],
  'NightBorne Void Overlord': [
    { name: 'Void Rift', vfx: 'ult_portal', damage: 1.8, cooldown: 8.0, kind: 'nova', telegraph: 0.8, colour: '#818cf8' },
    { name: 'Eclipse Lance', vfx: 'ray_magic', damage: 1.4, cooldown: 5.5, kind: 'beam', telegraph: 0.6, colour: '#6366f1' },
  ],
  'Broodmother Queen': [
    { name: 'Venom Spray', vfx: 'proj_plant', damage: 1.1, cooldown: 4.5, kind: 'volley', telegraph: 0.4, colour: '#84cc16' },
    { name: 'Web Snare', vfx: 'aura_green', damage: 1.6, cooldown: 7.0, kind: 'nova', telegraph: 0.7, colour: '#65a30d' },
  ],
  'Blood Moon Behemoth': [
    { name: 'Crimson Howl', vfx: 'ult_round_light_burst_001', damage: 1.7, cooldown: 7.0, kind: 'nova', telegraph: 0.7, colour: '#f43f5e' },
    { name: 'Boulder Toss', vfx: 'proj_rock', damage: 1.3, cooldown: 5.0, kind: 'volley', telegraph: 0.5, colour: '#a8a29e' },
  ],
  'Leviathan of the Deep': [
    { name: 'Tidal Crush', vfx: 'water_blast', damage: 1.9, cooldown: 8.0, kind: 'slam', telegraph: 0.9, colour: '#06b6d4' },
    { name: 'Abyssal Current', vfx: 'proj_water', damage: 1.2, cooldown: 5.0, kind: 'volley', telegraph: 0.4, colour: '#0891b2' },
  ],
  'Gallet Forge Overlord': [
    { name: 'Molten Hammer', vfx: 'explosion_wide', damage: 1.8, cooldown: 7.5, kind: 'slam', telegraph: 0.8, colour: '#fb923c' },
    { name: 'Forge Sparks', vfx: 'sparks_magic', damage: 1.0, cooldown: 4.5, kind: 'volley', telegraph: 0.4, colour: '#fdba74' },
  ],
  'Warband Chief Hadrik': [
    { name: 'Pikebreaker Charge', vfx: 'fx_thrust_a', damage: 1.5, cooldown: 6.0, kind: 'beam', telegraph: 0.65, colour: '#84cc16' },
    { name: 'Warband Quake', vfx: 'charged_energy', damage: 1.8, cooldown: 8.0, kind: 'nova', telegraph: 0.85, colour: '#a3e635' },
  ],
  'Alpha Greymane': [
    { name: 'Moonfang Rush', vfx: 'spark_trail', damage: 1.45, cooldown: 5.5, kind: 'beam', telegraph: 0.55, colour: '#22c55e' },
    { name: 'Packlord Cyclone', vfx: 'dark_swirl', damage: 1.75, cooldown: 7.5, kind: 'nova', telegraph: 0.75, colour: '#16a34a' },
  ],
  'Castellan Mordred': [
    { name: 'Blacksteel Decree', vfx: 'ray_mono', damage: 1.65, cooldown: 6.0, kind: 'beam', telegraph: 0.65, colour: '#94a3b8' },
    { name: 'Citadel Ruin', vfx: 'energy_field', damage: 2.0, cooldown: 8.5, kind: 'slam', telegraph: 1.0, colour: '#64748b' },
  ],
  'Celestial Arbiter': [
    { name: 'Astral Verdict', vfx: 'ult_lightning_strike_001', damage: 2.05, cooldown: 8.5, kind: 'slam', telegraph: 1.0, colour: '#fde68a' },
    { name: 'Constellation Divide', vfx: 'waveform', damage: 1.55, cooldown: 6.0, kind: 'beam', telegraph: 0.65, colour: '#c4b5fd' },
  ],
};

/** The skills for a boss, or none if this enemy is not one. */
export function bossSkillsFor(name: string): BossSkill[] {
  return BOSS_SKILLS[name] || [];
}
