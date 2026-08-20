/**
 * Canonical combat and presentation contract for the game's sixty skills.
 *
 * ClassDefinitions owns tuning values such as cooldown and total potency. This
 * file owns what a cast actually does. Keeping delivery, payload, movement and
 * presentation in data prevents the engine from becoming a sixty-branch switch.
 */

import type { CombatStatusKind, ElementalReactionTag } from './CombatStatusRegistry';

export const SKILL_IDS = [
  'w_1', 'w_2', 'w_3', 'w_4', 'w_5', 'w_6',
  'as_1', 'as_2', 'as_3', 'as_4', 'as_5', 'as_6',
  'm_1', 'm_2', 'm_3', 'm_4', 'm_5', 'm_6',
  'p_1', 'p_2', 'p_3', 'p_4', 'p_5', 'p_6',
  'ar_1', 'ar_2', 'ar_3', 'ar_4', 'ar_5', 'ar_6',
  'n_1', 'n_2', 'n_3', 'n_4', 'n_5', 'n_6',
  'b_1', 'b_2', 'b_3', 'b_4', 'b_5', 'b_6',
  'pr_1', 'pr_2', 'pr_3', 'pr_4', 'pr_5', 'pr_6',
  'ni_1', 'ni_2', 'ni_3', 'ni_4', 'ni_5', 'ni_6',
  'd_1', 'd_2', 'd_3', 'd_4', 'd_5', 'd_6',
] as const;

export type SkillId = typeof SKILL_IDS[number];
export type PlayerBuffStat =
  | 'atk'
  | 'def'
  | 'speed'
  | 'crit'
  | 'attackSpeed'
  | 'damageReduction'
  | 'shield'
  | 'airMobility'
  | 'deathPrevention';
/** Backwards-compatible engine name backed by the canonical combat registry. */
export type EnemyStatusKind = CombatStatusKind;
export type DeliveryKind =
  | 'melee'
  | 'area'
  | 'projectile'
  | 'chain'
  | 'zone'
  | 'trap'
  | 'targeted'
  | 'distributed'
  | 'corpses'
  | 'support'
  | 'summon';
export type HitShape = 'cone' | 'line' | 'radial' | 'point' | 'lane' | 'wall';
export type ProjectileKind =
  | 'arrow'
  | 'fireball'
  | 'ice_shard'
  | 'lightning_orb'
  | 'dark_skull'
  | 'kunai'
  | 'dagger'
  | 'shuriken'
  | 'spear'
  | 'meteor'
  | 'energy_ball';

export interface StatusApplication {
  kind: EnemyStatusKind;
  duration: number;
  /** slow/frailty are fractions (0.5 = 50%); taunt/stun ignore magnitude. */
  magnitude?: number;
  chance?: number;
  tickInterval?: number;
  /** Portion of the tooltip's total potency reserved for this damage-over-time. */
  damageShare?: number;
}

export interface BuffApplication {
  stat: PlayerBuffStat;
  multiplier: number;
  duration: number;
  scope: 'self' | 'party';
  /** Used by fixed shields and one-charge death prevention. */
  amount?: number;
}

export interface SkillDelivery {
  kind: DeliveryKind;
  shape?: HitShape;
  origin?: 'caster' | 'aim' | 'nearest' | 'ground' | 'corpses';
  projectile?: ProjectileKind;
  speed?: number;
  piercing?: boolean;
  radial?: boolean;
  maxTargets?: number;
  duration?: number;
  tickInterval?: number;
  zoneType?: 'holy_consecration' | 'poison_cloud' | 'blizzard' | 'sanctuary_ward';
  /** Corpse Explosion keeps some utility when no corpse is available. */
  fallbackDamageScale?: number;
}

export interface HitSequence {
  count: number;
  intervalMs?: number;
  targeting?: 'same-area' | 'distributed' | 'distinct' | 'radial' | 'rain' | 'forward';
  /** Relative weights are normalized, so their sum can never multiply potency. */
  falloff?: readonly number[];
}

export interface SkillMovement {
  kind: 'dash' | 'teleport-behind' | 'leap' | 'substitution' | 'drift' | 'charge';
  distance?: number;
  iframeSeconds?: number;
  delayMs?: number;
  knockUp?: number;
}

export interface SkillPayload {
  damage: boolean;
  /** Remaining potency is available to damage-over-time payloads. */
  directDamageShare?: number;
  forceCrit?: boolean;
  backHitCritBonus?: number;
  executeBelowHp?: number;
  executeMultiplier?: number;
  knockback?: number;
  knockUp?: number;
  lifesteal?: number;
  statuses?: readonly StatusApplication[];
  /**
   * Elemental triggers resolved against the target's pre-hit status snapshot.
   * A skill may therefore apply a status and carry a reaction tag without
   * priming its own reaction on the same hit.
   */
  reactionTags?: readonly ElementalReactionTag[];
  buffs?: readonly BuffApplication[];
  heal?: {
    kind: 'flat' | 'max-hp-percent' | 'scaling';
    amount: number;
    atkScale?: number;
    scope: 'self' | 'party' | 'lowest-party';
  };
  cleanse?: { count: number; scope: 'self' | 'party' };
  resurrection?: { reviveHpPercent: number; preventionDuration: number };
  zoneAllyMitigation?: number;
  zoneHealPercentPerTick?: number;
  stealthSeconds?: number;
  threatDrop?: boolean;
}

export interface SkillSummon {
  kind: 'skeleton' | 'shadow_clones' | 'dragon_avatar' | 'reaper_waves';
  count: number;
  duration: number;
  damageScale: number;
}

export interface BasicAttackContract {
  comboMultipliers?: readonly number[];
  aerialPlunge?: boolean;
}

export interface SkillMechanics {
  delivery: SkillDelivery;
  hits: HitSequence;
  payload: SkillPayload;
  movement?: SkillMovement;
  summon?: SkillSummon;
  basic?: BasicAttackContract;
}

export interface SkillVisualIdentity {
  id: string;
  palette: readonly [string, string, string];
  paletteRow: number;
  silhouette: string;
  motion: string;
  impactBeat: 'instant' | 'projectile' | 'sequence' | 'zone-tick' | 'ultimate-impact';
  /** Declarative marker resolved by the sprite catalogue; never an asset path. */
  statusMarker?: SkillVisualMarker;
}

export type SkillVisualMarker = CombatStatusKind
  | ElementalReactionTag
  | 'shield'
  | 'aegis'
  | 'sanctuary'
  | 'revive';

export interface SkillIdentityEntry {
  description: string;
  mechanics: SkillMechanics;
  visual: SkillVisualIdentity;
  /** Rare correction for a seed whose old damage value contradicted its role. */
  damageMultiplier?: number;
}

const PALETTE = {
  warrior: ['#d8dee9', '#dc2626', '#8b5a2b'],
  assassin: ['#7e22ce', '#111827', '#65a30d'],
  mage: ['#f97316', '#38bdf8', '#a855f7'],
  paladin: ['#facc15', '#fff7d6', '#16a34a'],
  archer: ['#65a30d', '#d9f99d', '#854d0e'],
  necromancer: ['#14b8a6', '#6b21a8', '#e5e7eb'],
  berserker: ['#b91c1c', '#f97316', '#3f1d1d'],
  priest: ['#22d3ee', '#fef3c7', '#4ade80'],
  ninja: ['#22c55e', '#67e8f9', '#111827'],
  dragoon: ['#14b8a6', '#fb923c', '#e0f2fe'],
} as const;

function visual(
  id: SkillId,
  palette: keyof typeof PALETTE,
  paletteRow: number,
  silhouette: string,
  motion: string,
  impactBeat: SkillVisualIdentity['impactBeat'],
  statusMarker?: SkillVisualMarker,
): SkillVisualIdentity {
  return { id: `skill-${id}`, palette: PALETTE[palette], paletteRow, silhouette, motion, impactBeat, statusMarker };
}

const direct = (extra: Omit<SkillPayload, 'damage'> = {}): SkillPayload => ({ damage: true, ...extra });
const utility = (extra: Omit<SkillPayload, 'damage'> = {}): SkillPayload => ({ damage: false, ...extra });
const hits = (count = 1, targeting: HitSequence['targeting'] = 'same-area', intervalMs?: number): HitSequence => ({ count, targeting, intervalMs });

/** Exactly sixty explicit entries. Tests assert both key count and key equality. */
export const SKILL_IDENTITY_MATRIX: Record<SkillId, SkillIdentityEntry> = {
  w_1: { description: 'Three-step grounded greatsword combo dealing 75% physical damage per cast; aerial casts plunge downward.', mechanics: { delivery: { kind: 'melee', shape: 'cone', origin: 'aim' }, hits: hits(), payload: direct(), basic: { comboMultipliers: [1, 1.15, 1.35], aerialPlunge: true } }, visual: visual('w_1', 'warrior', 5, 'alternating-greatsword-arcs', 'horizontal-upward-heavy', 'instant') },
  w_2: { description: 'Spin through nearby foes in 3 evenly split hits for 240% total physical damage while retaining movement.', mechanics: { delivery: { kind: 'area', shape: 'radial', origin: 'caster' }, hits: hits(3, 'same-area', 150), payload: direct(), movement: { kind: 'drift' } }, visual: visual('w_2', 'warrior', 5, 'circular-steel-trail', 'three-drifting-spins', 'sequence') },
  w_3: { description: 'Shield-bash a short cone for 110% physical damage, strong stagger, a 1.2 second stun, and Shatter against Frozen foes.', mechanics: { delivery: { kind: 'melee', shape: 'cone', origin: 'aim' }, hits: hits(), payload: direct({ knockback: 1.8, statuses: [{ kind: 'stun', duration: 1.2 }], reactionTags: ['shatter'] }) }, visual: visual('w_3', 'warrior', 5, 'shield-shock-ring', 'hard-forward-impact', 'instant', 'shatter') },
  w_4: { description: 'Rally the party with +35% ATK and +20% DEF for 8 seconds.', mechanics: { delivery: { kind: 'support', origin: 'caster' }, hits: hits(), payload: utility({ buffs: [{ stat: 'atk', multiplier: 1.35, duration: 8, scope: 'party' }, { stat: 'def', multiplier: 1.2, duration: 8, scope: 'party' }] }) }, visual: visual('w_4', 'warrior', 7, 'crimson-rally-ring', 'rising-embers-and-roar', 'instant') },
  w_5: { description: 'Dash 220px through foes, cleaving once for 180% physical damage with 0.35 seconds of invulnerability.', mechanics: { delivery: { kind: 'area', shape: 'line', origin: 'caster' }, hits: hits(), payload: direct({ knockback: 0.6 }), movement: { kind: 'dash', distance: 220, iframeSeconds: 0.35 } }, visual: visual('w_5', 'warrior', 7, 'long-blade-streak', 'red-white-afterimage', 'instant') },
  w_6: { description: 'Leap into a telegraphed Earth Shatter for 570% physical damage, heavy knock-up, and Shatter against Frozen foes.', mechanics: { delivery: { kind: 'area', shape: 'radial', origin: 'ground' }, hits: hits(), payload: direct({ knockUp: 5, reactionTags: ['shatter'] }), movement: { kind: 'leap', distance: 150, delayMs: 360, knockUp: 9 } }, visual: visual('w_6', 'warrior', 4, 'golden-earth-fissure', 'leap-crack-rock-burst', 'ultimate-impact', 'shatter') },

  as_1: { description: 'A fast two-hit dagger chain dealing 70% total physical damage with +25% back-hit critical chance.', mechanics: { delivery: { kind: 'melee', shape: 'cone', origin: 'aim' }, hits: hits(2, 'same-area', 90), payload: direct({ backHitCritBonus: 0.25 }) }, visual: visual('as_1', 'assassin', 1, 'opposed-dagger-cuts', 'two-thin-crossing-cuts', 'sequence') },
  as_2: { description: 'Throw a venom dagger for 120% total dark damage; 25% of its potency becomes poison over 5 seconds.', mechanics: { delivery: { kind: 'projectile', origin: 'aim', projectile: 'dagger', speed: 13 }, hits: hits(), payload: direct({ directDamageShare: 0.75, statuses: [{ kind: 'poison', duration: 5, tickInterval: 1, damageShare: 0.25 }] }) }, visual: visual('as_2', 'assassin', 3, 'venom-dagger', 'green-trail-and-splatter', 'projectile', 'poison') },
  as_3: { description: 'Drop enemy threat, become partially hidden, gain +40% movement speed for 4 seconds, and take no direct-damage action.', mechanics: { delivery: { kind: 'support', origin: 'caster' }, hits: hits(), payload: utility({ stealthSeconds: 4, threatDrop: true, buffs: [{ stat: 'speed', multiplier: 1.4, duration: 4, scope: 'self' }] }) }, visual: visual('as_3', 'assassin', 1, 'charcoal-smoke-cloud', 'expanding-violet-rim', 'instant') },
  as_4: { description: 'Throw 8 real radial piercing daggers whose combined potency is 160% physical damage.', mechanics: { delivery: { kind: 'projectile', origin: 'caster', projectile: 'dagger', speed: 12, piercing: true, radial: true }, hits: hits(8, 'radial'), payload: direct() }, visual: visual('as_4', 'assassin', 1, 'eight-readable-daggers', 'full-radial-spin', 'projectile') },
  as_5: { description: 'Vanish behind the nearest target and force a critical backstab for 240% dark damage.', mechanics: { delivery: { kind: 'targeted', shape: 'point', origin: 'nearest', maxTargets: 1 }, hits: hits(), payload: direct({ forceCrit: true }), movement: { kind: 'teleport-behind', distance: 280, iframeSeconds: 0.3 } }, visual: visual('as_5', 'assassin', 1, 'shadow-puncture-line', 'vanish-reappear-flash', 'instant') },
  as_6: { description: 'Distribute 8 executions across valid enemies for 680% total dark damage on the ultimate impact sequence.', mechanics: { delivery: { kind: 'distributed', origin: 'nearest', maxTargets: 8 }, hits: hits(8, 'distributed', 65), payload: direct({ forceCrit: true }) }, visual: visual('as_6', 'assassin', 1, 'screen-shadow-cuts', 'eight-timed-executions', 'ultimate-impact') },

  m_1: { description: 'Launch a ranged fire bolt for 75% total fire damage with a 25% chance to leave a short burn.', mechanics: { delivery: { kind: 'projectile', origin: 'aim', projectile: 'fireball', speed: 11 }, hits: hits(), payload: direct({ directDamageShare: 0.85, statuses: [{ kind: 'burn', duration: 3, tickInterval: 1, damageShare: 0.15, chance: 0.25 }] }) }, visual: visual('m_1', 'mage', 7, 'compact-fireball', 'ember-trail-and-flame-pop', 'projectile', 'burn') },
  m_2: { description: 'Release a self-centered frost nova for 130% ice damage, applying Freeze for 1.25 seconds and a 50% slow for 4 seconds.', mechanics: { delivery: { kind: 'area', shape: 'radial', origin: 'caster' }, hits: hits(), payload: direct({ statuses: [{ kind: 'slow', duration: 4, magnitude: 0.5 }, { kind: 'freeze', duration: 1.25 }] }) }, visual: visual('m_2', 'mage', 2, 'ice-ring-and-shards', 'outward-freeze', 'instant', 'freeze') },
  m_3: { description: 'Chain 180% total lightning damage through up to 4 distinct targets and trigger Conductive Chain on Wet foes.', mechanics: { delivery: { kind: 'chain', origin: 'nearest', maxTargets: 4 }, hits: { count: 4, targeting: 'distinct', intervalMs: 80, falloff: [1, 0.8, 0.65, 0.5] }, payload: direct({ reactionTags: ['lightning'] }) }, visual: visual('m_3', 'mage', 2, 'connected-lightning-arcs', 'ordered-target-jumps', 'sequence', 'lightning') },
  m_4: { description: 'Create an arcane barrier that absorbs a fixed 250 damage pool for up to 10 seconds.', mechanics: { delivery: { kind: 'support', origin: 'caster' }, hits: hits(), payload: utility({ buffs: [{ stat: 'shield', multiplier: 1, amount: 250, duration: 10, scope: 'self' }] }) }, visual: visual('m_4', 'mage', 1, 'cracking-arcane-barrier', 'layered-orbiting-shield', 'instant', 'shield') },
  m_5: { description: 'Create a 5-second blizzard zone dealing 220% total ice damage over 10 ticks, applying brief Freeze and a 40% slow.', mechanics: { delivery: { kind: 'zone', shape: 'radial', origin: 'aim', duration: 5, tickInterval: 0.5, zoneType: 'blizzard' }, hits: hits(10, 'same-area', 500), payload: direct({ statuses: [{ kind: 'slow', duration: 1.2, magnitude: 0.4 }, { kind: 'freeze', duration: 0.65 }] }) }, visual: visual('m_5', 'mage', 2, 'confined-hail-zone', 'falling-shards-and-mist', 'zone-tick', 'freeze') },
  m_6: { description: 'Land 4 meteors for 780% total fire damage, detonating pre-existing Burn before applying its own 4-second Burn.', mechanics: { delivery: { kind: 'distributed', shape: 'radial', origin: 'aim', maxTargets: 4 }, hits: hits(4, 'rain', 140), payload: direct({ directDamageShare: 0.92, statuses: [{ kind: 'burn', duration: 4, tickInterval: 1, damageShare: 0.08 }], reactionTags: ['detonate'] }) }, visual: visual('m_6', 'mage', 7, 'descending-meteor-rocks', 'warning-circles-then-impacts', 'ultimate-impact', 'detonate') },

  p_1: { description: 'Swing a weighty holy hammer for 80% damage with a small frontal holy splash.', mechanics: { delivery: { kind: 'melee', shape: 'cone', origin: 'aim' }, hits: hits(), payload: direct({ knockback: 0.8 }) }, visual: visual('p_1', 'paladin', 0, 'gold-hammer-arc', 'weighty-starburst', 'instant') },
  p_2: { description: 'Reduce incoming damage for the whole party by 60% for 6 seconds.', mechanics: { delivery: { kind: 'support', origin: 'caster' }, hits: hits(), payload: utility({ buffs: [{ stat: 'damageReduction', multiplier: 0.4, duration: 6, scope: 'party' }] }) }, visual: visual('p_2', 'paladin', 0, 'layered-shield-crests', 'ally-protection-rise', 'instant', 'aegis') },
  p_3: { description: 'Command nearby enemies to target the paladin, deal 60% physical damage, and stagger them for 0.6 seconds.', mechanics: { delivery: { kind: 'area', shape: 'radial', origin: 'caster' }, hits: hits(), payload: direct({ statuses: [{ kind: 'taunt', duration: 5 }, { kind: 'stun', duration: 0.6 }], knockback: 0.5 }) }, visual: visual('p_3', 'paladin', 0, 'gold-command-wave', 'expanding-roar-pulse', 'instant', 'taunt') },
  p_4: { description: 'Consecrate the ground for 6 seconds, dealing 180% total holy damage over 12 ticks while allies inside take 20% less damage.', mechanics: { delivery: { kind: 'zone', shape: 'radial', origin: 'caster', duration: 6, tickInterval: 0.5, zoneType: 'holy_consecration' }, hits: hits(12, 'same-area', 500), payload: direct({ zoneAllyMitigation: 0.2 }) }, visual: visual('p_4', 'paladin', 0, 'holy-runic-floor', 'upward-gold-sparks', 'zone-tick') },
  p_5: { description: 'Restore 45% maximum HP to the lowest-health party member without dealing damage.', mechanics: { delivery: { kind: 'support', origin: 'caster' }, hits: hits(), payload: utility({ heal: { kind: 'max-hp-percent', amount: 0.45, scope: 'lowest-party' } }) }, visual: visual('p_5', 'paladin', 0, 'descending-light-hand', 'green-gold-heal-bloom', 'instant') },
  p_6: { description: 'Drop a celestial hammer for 600% holy damage, knockdown, a 1.5 second stun, and Shatter against Frozen foes.', mechanics: { delivery: { kind: 'area', shape: 'radial', origin: 'aim' }, hits: hits(), payload: direct({ knockUp: 4, statuses: [{ kind: 'stun', duration: 1.5 }], reactionTags: ['shatter'] }) }, visual: visual('p_6', 'paladin', 0, 'descending-celestial-hammer', 'pillar-crush-and-starburst', 'ultimate-impact', 'shatter') },

  ar_1: { description: 'Fire a real physical arrow projectile for 75% damage; it never enters a melee combo.', mechanics: { delivery: { kind: 'projectile', origin: 'aim', projectile: 'arrow', speed: 14 }, hits: hits(), payload: direct() }, visual: visual('ar_1', 'archer', 3, 'wood-and-metal-arrow', 'pale-wind-trail', 'projectile') },
  ar_2: { description: 'Rain 10 arrows into a marked area for 220% combined physical damage.', mechanics: { delivery: { kind: 'projectile', shape: 'radial', origin: 'aim', projectile: 'arrow', speed: 15 }, hits: hits(10, 'rain', 55), payload: direct() }, visual: visual('ar_2', 'archer', 3, 'ten-falling-arrows', 'rise-mark-fall', 'sequence') },
  ar_3: { description: 'Set an armed floor trap that triggers once for 150% total dark damage and leaves a 5-second poison cloud.', mechanics: { delivery: { kind: 'trap', origin: 'ground', duration: 18, zoneType: 'poison_cloud' }, hits: hits(5, 'same-area', 1000), payload: direct({ directDamageShare: 0.7, statuses: [{ kind: 'poison', duration: 5, tickInterval: 1, damageShare: 0.3 }] }) }, visual: visual('ar_3', 'archer', 3, 'armed-ground-trap', 'blink-then-toxic-cloud', 'zone-tick', 'poison') },
  ar_4: { description: 'Fire a burning arrow for 200% fire damage in an 80px area, detonating Burn already on the target.', mechanics: { delivery: { kind: 'projectile', origin: 'aim', projectile: 'arrow', speed: 13 }, hits: hits(), payload: direct({ knockback: 1, reactionTags: ['detonate'] }) }, visual: visual('ar_4', 'archer', 7, 'burning-arrowhead', 'arrow-flight-then-explosion', 'projectile', 'detonate') },
  ar_5: { description: 'Increase existing critical chance by 40% and attack/cast speed by 30% for 8 seconds.', mechanics: { delivery: { kind: 'support', origin: 'caster' }, hits: hits(), payload: utility({ buffs: [{ stat: 'crit', multiplier: 1.4, duration: 8, scope: 'self' }, { stat: 'attackSpeed', multiplier: 1.3, duration: 8, scope: 'self' }] }) }, visual: visual('ar_5', 'archer', 3, 'focus-eye-reticle', 'glint-and-wind-lines', 'instant') },
  ar_6: { description: 'Channel 30 spectral piercing arrows whose combined potency is 720% physical damage.', mechanics: { delivery: { kind: 'projectile', shape: 'lane', origin: 'caster', projectile: 'arrow', speed: 18, piercing: true }, hits: hits(30, 'forward', 30), payload: direct() }, visual: visual('ar_6', 'archer', 3, 'emerald-dragon-arrow-stream', 'channelled-piercing-volley', 'ultimate-impact') },

  n_1: { description: 'Launch a drifting soul projectile for 75% dark damage.', mechanics: { delivery: { kind: 'projectile', origin: 'aim', projectile: 'dark_skull', speed: 9 }, hits: hits(), payload: direct() }, visual: visual('n_1', 'necromancer', 1, 'teal-skull-wisp', 'drifting-spirit-trail', 'projectile') },
  n_2: { description: 'Tether the nearest enemy for 160% dark damage, heal for 50% dealt, and siphon Cursed targets for bonus healing.', mechanics: { delivery: { kind: 'targeted', origin: 'nearest', maxTargets: 1 }, hits: hits(), payload: direct({ lifesteal: 0.5, reactionTags: ['siphon'] }) }, visual: visual('n_2', 'necromancer', 1, 'crimson-violet-tether', 'target-to-caster-return', 'instant', 'siphon') },
  n_3: { description: 'Raise one allied skeleton for 15 seconds; it follows its owner and attacks nearby enemies.', mechanics: { delivery: { kind: 'summon', origin: 'ground' }, hits: hits(), payload: utility(), summon: { kind: 'skeleton', count: 1, duration: 15, damageScale: 0.9 } }, visual: visual('n_3', 'necromancer', 1, 'bone-summoning-circle', 'hands-rise-then-skeleton', 'instant') },
  n_4: { description: 'Curse nearby enemies for 7 seconds and reduce their defense by 40%, without dealing direct damage.', mechanics: { delivery: { kind: 'area', shape: 'radial', origin: 'caster' }, hits: hits(), payload: utility({ statuses: [{ kind: 'frailty', duration: 7, magnitude: 0.4 }, { kind: 'curse', duration: 7 }] }) }, visual: visual('n_4', 'necromancer', 1, 'overhead-curse-sigils', 'purple-decay-pulse', 'instant', 'curse'), damageMultiplier: 0 },
  n_5: { description: 'Consume recent corpses and split 240% total dark area damage across their blast zones; without one, release a 55%-strength fallback blast.', mechanics: { delivery: { kind: 'corpses', shape: 'radial', origin: 'corpses', fallbackDamageScale: 0.55 }, hits: hits(), payload: direct() }, visual: visual('n_5', 'necromancer', 1, 'corpse-ring-and-bones', 'dark-red-fragment-burst', 'instant') },
  n_6: { description: 'Send 6 spectral reaper waves across the arena for 750% total dark damage on the ultimate impact sequence.', mechanics: { delivery: { kind: 'distributed', shape: 'wall', origin: 'caster', maxTargets: 6 }, hits: hits(6, 'forward', 110), payload: direct(), summon: { kind: 'reaper_waves', count: 6, duration: 1.4, damageScale: 1 } }, visual: visual('n_6', 'necromancer', 1, 'spectral-reaper-waves', 'teal-purple-arena-crossing', 'ultimate-impact') },

  b_1: { description: 'Alternate dual-axe swings for 80% physical damage per cast with a short aggressive step.', mechanics: { delivery: { kind: 'melee', shape: 'cone', origin: 'aim' }, hits: hits(), payload: direct(), movement: { kind: 'drift', distance: 18 }, basic: { comboMultipliers: [1, 1.08] } }, visual: visual('b_1', 'berserker', 7, 'crossed-axe-arcs', 'alternating-red-orange-cuts', 'instant') },
  b_2: { description: 'Gain +50% ATK and +30% attack speed but lose 15% DEF for 6 seconds.', mechanics: { delivery: { kind: 'support', origin: 'caster' }, hits: hits(), payload: utility({ buffs: [{ stat: 'atk', multiplier: 1.5, duration: 6, scope: 'self' }, { stat: 'attackSpeed', multiplier: 1.3, duration: 6, scope: 'self' }, { stat: 'def', multiplier: 0.85, duration: 6, scope: 'self' }] }) }, visual: visual('b_2', 'berserker', 7, 'pulsing-blood-aura', 'heartbeat-ring-and-edge', 'instant') },
  b_3: { description: 'Leap to the target point for 190% physical area damage, heavy knock-up, and Shatter against Frozen foes.', mechanics: { delivery: { kind: 'area', shape: 'radial', origin: 'aim' }, hits: hits(), payload: direct({ knockUp: 5, reactionTags: ['shatter'] }), movement: { kind: 'leap', distance: 240, delayMs: 260, knockUp: 13 } }, visual: visual('b_3', 'berserker', 7, 'red-leap-crater', 'trail-dust-rock-impact', 'sequence', 'shatter') },
  b_4: { description: 'Cleave for 260% physical damage, increased by 60% when the target is below 30% HP.', mechanics: { delivery: { kind: 'targeted', shape: 'cone', origin: 'nearest', maxTargets: 1 }, hits: hits(), payload: direct({ executeBelowHp: 0.3, executeMultiplier: 1.6, knockback: 1.3 }) }, visual: visual('b_4', 'berserker', 7, 'vertical-execution-axe', 'mark-then-heavy-cleave', 'instant') },
  b_5: { description: 'Deliver 5 alternating axe hits whose combined potency is 280% physical damage.', mechanics: { delivery: { kind: 'area', shape: 'cone', origin: 'aim' }, hits: hits(5, 'same-area', 120), payload: direct() }, visual: visual('b_5', 'berserker', 7, 'five-axe-arcs', 'escalating-left-right-flurry', 'sequence') },
  b_6: { description: 'Become unstoppable, charge through 5 split axe hits, then slam for 630% total physical damage.', mechanics: { delivery: { kind: 'distributed', shape: 'line', origin: 'caster', maxTargets: 6 }, hits: { count: 6, targeting: 'forward', intervalMs: 90, falloff: [1, 1, 1, 1, 1, 1.5] }, payload: direct({ knockUp: 4 }), movement: { kind: 'charge', distance: 180, iframeSeconds: 1 } }, visual: visual('b_6', 'berserker', 7, 'blood-titan-charge', 'axe-trails-then-shockwave', 'ultimate-impact') },

  pr_1: { description: 'Fire a thin cyan-gold holy bolt for 75% damage and leave its target Wet for 4 seconds.', mechanics: { delivery: { kind: 'projectile', origin: 'aim', projectile: 'energy_ball', speed: 12 }, hits: hits(), payload: direct({ statuses: [{ kind: 'wet', duration: 4 }] }) }, visual: visual('pr_1', 'priest', 2, 'thin-celestial-ray', 'clean-light-impact', 'projectile', 'wet') },
  pr_2: { description: 'Deterministically heal the party for 200 HP and grant +25% DEF for 6 seconds.', mechanics: { delivery: { kind: 'support', origin: 'caster' }, hits: hits(), payload: utility({ heal: { kind: 'flat', amount: 200, scope: 'party' }, buffs: [{ stat: 'def', multiplier: 1.25, duration: 6, scope: 'party' }] }) }, visual: visual('pr_2', 'priest', 0, 'halo-heal-motes', 'warm-rise-and-bloom', 'instant') },
  pr_3: { description: 'Deal 170% holy damage in an area and cleanse one negative status from nearby allies.', mechanics: { delivery: { kind: 'area', shape: 'radial', origin: 'caster' }, hits: hits(), payload: direct({ cleanse: { count: 1, scope: 'party' } }) }, visual: visual('pr_3', 'priest', 0, 'white-gold-purge-flame', 'outward-cleansing-rings', 'instant') },
  pr_4: { description: 'Create a 7-second sanctuary that reduces party damage taken by 35% and heals 2% max HP every second while inside.', mechanics: { delivery: { kind: 'zone', shape: 'radial', origin: 'caster', duration: 7, tickInterval: 1, zoneType: 'sanctuary_ward' }, hits: hits(7, 'same-area', 1000), payload: utility({ zoneAllyMitigation: 0.35, zoneHealPercentPerTick: 0.02 }) }, visual: visual('pr_4', 'priest', 2, 'cyan-sanctuary-dome', 'persistent-runes-and-motes', 'zone-tick', 'sanctuary') },
  pr_5: { description: 'Send a broad holy wall forward for 230% damage, strong pushback, and 5 seconds of Wet.', mechanics: { delivery: { kind: 'area', shape: 'wall', origin: 'aim' }, hits: hits(), payload: direct({ knockback: 2.2, statuses: [{ kind: 'wet', duration: 5 }] }) }, visual: visual('pr_5', 'priest', 2, 'broad-cyan-gold-wall', 'single-expanding-wave', 'instant', 'wet') },
  pr_6: { description: 'Revive one downed ally at 45% HP, or grant 20 seconds of death prevention if none is down; also deal 690% holy area damage on impact.', mechanics: { delivery: { kind: 'area', shape: 'radial', origin: 'caster' }, hits: hits(), payload: direct({ resurrection: { reviveHpPercent: 0.45, preventionDuration: 20 } }) }, visual: visual('pr_6', 'priest', 0, 'angelic-revive-column', 'sigil-and-outward-starlight', 'ultimate-impact', 'revive') },

  ni_1: { description: 'Use a low-recovery three-step katana chain for 75% physical damage per cast.', mechanics: { delivery: { kind: 'melee', shape: 'cone', origin: 'aim' }, hits: hits(), payload: direct(), basic: { comboMultipliers: [1, 1.08, 1.16] } }, visual: visual('ni_1', 'ninja', 3, 'fine-katana-lines', 'three-distinct-directions', 'instant') },
  ni_2: { description: 'Create 2 temporary clones that each repeat a reduced slash; combined potency is 150% physical damage.', mechanics: { delivery: { kind: 'summon', shape: 'cone', origin: 'aim' }, hits: hits(2, 'same-area', 110), payload: direct(), summon: { kind: 'shadow_clones', count: 2, duration: 0.8, damageScale: 0.5 } }, visual: visual('ni_2', 'ninja', 3, 'two-translucent-ninjas', 'synchronized-cross-cuts', 'sequence') },
  ni_3: { description: 'Substitute 200px forward with 0.4 seconds of invulnerability and counter for 50% physical damage at the exit.', mechanics: { delivery: { kind: 'area', shape: 'cone', origin: 'caster' }, hits: hits(), payload: direct(), movement: { kind: 'substitution', distance: 200, iframeSeconds: 0.4 } }, visual: visual('ni_3', 'ninja', 3, 'log-smoke-substitution', 'rapid-green-exit-streak', 'instant') },
  ni_4: { description: 'Cut a dragon-shaped fire arc for 210% fire damage and burn targets for 3 seconds.', mechanics: { delivery: { kind: 'area', shape: 'cone', origin: 'aim' }, hits: hits(), payload: direct({ directDamageShare: 0.88, statuses: [{ kind: 'burn', duration: 3, tickInterval: 1, damageShare: 0.12 }] }) }, visual: visual('ni_4', 'ninja', 7, 'fire-dragon-katana-arc', 'dragon-head-over-green-trail', 'instant', 'burn') },
  ni_5: { description: 'Teleport through up to 4 distinct targets for 250% lightning damage and trigger Conductive Chain on Wet foes.', mechanics: { delivery: { kind: 'distributed', origin: 'nearest', maxTargets: 4 }, hits: hits(4, 'distinct', 75), payload: direct({ forceCrit: true, reactionTags: ['lightning'] }) }, visual: visual('ni_5', 'ninja', 2, 'four-lightning-paths', 'individually-timed-teleports', 'sequence', 'lightning') },
  ni_6: { description: 'Freeze the scene, then distribute 12 dimensional slashes for 740% dark damage and Shatter Frozen foes.', mechanics: { delivery: { kind: 'distributed', origin: 'nearest', maxTargets: 12 }, hits: hits(12, 'distributed', 38), payload: direct({ forceCrit: true, reactionTags: ['shatter'] }) }, visual: visual('ni_6', 'ninja', 3, 'emerald-dimensional-cuts', 'time-stop-twelve-slashes', 'ultimate-impact', 'shatter') },

  d_1: { description: 'Thrust a long narrow spear line for 80% physical damage with real piercing reach.', mechanics: { delivery: { kind: 'melee', shape: 'line', origin: 'aim' }, hits: hits(), payload: direct({ knockback: 0.5 }) }, visual: visual('d_1', 'dragoon', 2, 'teal-white-lance-line', 'point-first-thrust', 'instant') },
  d_2: { description: 'Rise, mark the landing, then plunge for 220% physical area damage, knock-up, and Shatter against Frozen foes.', mechanics: { delivery: { kind: 'area', shape: 'radial', origin: 'aim' }, hits: hits(), payload: direct({ knockUp: 5, reactionTags: ['shatter'] }), movement: { kind: 'leap', distance: 220, delayMs: 250, knockUp: 13 } }, visual: visual('d_2', 'dragoon', 2, 'wing-gust-and-spear-marker', 'rise-mark-plunge-crater', 'sequence', 'shatter') },
  d_3: { description: 'Breathe a facing-aligned flame cone in 4 split ticks for 190% total fire damage and a short burn.', mechanics: { delivery: { kind: 'area', shape: 'cone', origin: 'aim' }, hits: hits(4, 'same-area', 120), payload: direct({ directDamageShare: 0.9, statuses: [{ kind: 'burn', duration: 3, tickInterval: 1, damageShare: 0.1 }] }) }, visual: visual('d_3', 'dragoon', 7, 'continuous-dragon-flame-cone', 'four-facing-aligned-pulses', 'sequence', 'burn') },
  d_4: { description: 'Drive a corkscrew spear projectile down a narrow lane for 240% physical damage, piercing multiple targets once each.', mechanics: { delivery: { kind: 'projectile', shape: 'lane', origin: 'aim', projectile: 'spear', speed: 13, piercing: true }, hits: hits(), payload: direct() }, visual: visual('d_4', 'dragoon', 2, 'corkscrew-spear-trail', 'moving-point-sparks', 'projectile') },
  d_5: { description: 'Unfurl spectral wings for +30% speed, +25% ATK, and temporary air mobility for 8 seconds.', mechanics: { delivery: { kind: 'support', origin: 'caster' }, hits: hits(), payload: utility({ buffs: [{ stat: 'speed', multiplier: 1.3, duration: 8, scope: 'self' }, { stat: 'atk', multiplier: 1.25, duration: 8, scope: 'self' }, { stat: 'airMobility', multiplier: 1, duration: 8, scope: 'self' }] }) }, visual: visual('d_5', 'dragoon', 2, 'persistent-spectral-wings', 'teal-wing-unfurl', 'instant') },
  d_6: { description: 'Summon an elder-dragon for 760% fire damage, detonating pre-existing Burn before applying its own 4-second Burn.', mechanics: { delivery: { kind: 'distributed', shape: 'line', origin: 'caster', maxTargets: 6 }, hits: hits(6, 'forward', 100), payload: direct({ directDamageShare: 0.92, statuses: [{ kind: 'burn', duration: 4, tickInterval: 1, damageShare: 0.08 }], reactionTags: ['detonate'] }), summon: { kind: 'dragon_avatar', count: 1, duration: 2.2, damageScale: 1 } }, visual: visual('d_6', 'dragoon', 7, 'elder-dragon-fire-beam', 'entrance-sweep-ground-fire', 'ultimate-impact', 'detonate') },
};

export function isSkillId(value: string): value is SkillId {
  return (SKILL_IDS as readonly string[]).includes(value);
}
