/**
 * Data-driven enemy attack intent profiles and a pure phase state machine.
 * Visuals are VFX catalogue ids; this module contains no asset paths or drawing.
 */

import type { SfxId } from '../engine/SfxLibrary';
import type { VfxId } from '../engine/VfxLibrary';
import type { IncomingAttackDefense } from './DefenseMechanics';

export const ENEMY_ATTACK_PROFILE_IDS = [
  'melee-light',
  'melee-heavy',
  'shield-bash',
  'ranged-shot',
  'healer-cast',
  'summoner-cast',
  'assassin-lunge',
  'boss-slam',
  'boss-volley',
  'boss-nova',
  'boss-beam',
] as const;

export type EnemyAttackProfileId = typeof ENEMY_ATTACK_PROFILE_IDS[number];
export type EnemyRole =
  | 'bruiser'
  | 'shield-tank'
  | 'healer'
  | 'ranged-sniper'
  | 'summoner'
  | 'assassin'
  | 'boss';
export type EnemyIntentPhase = 'telegraph' | 'active' | 'recovery' | 'complete';
export type EnemyHitShape = 'contact' | 'line' | 'cone' | 'circle' | 'targeted';
export type EnemyTargetMode = 'locked-position' | 'locked-actor' | 'self';

export interface EnemyAttackProfile {
  id: EnemyAttackProfileId;
  role: EnemyRole;
  telegraphSeconds: number;
  activeSeconds: number;
  recoverySeconds: number;
  defense: IncomingAttackDefense;
  targetMode: EnemyTargetMode;
  hitShape: EnemyHitShape;
  range: number;
  radius: number;
  damageMultiplier: number;
  telegraphSpriteId: VfxId;
  activeSpriteId: VfxId;
  impactSpriteId: VfxId;
  chargeSoundId: SfxId;
  impactSoundId: SfxId;
}

export const ENEMY_ATTACK_PROFILES = Object.freeze({
  'melee-light': {
    id: 'melee-light', role: 'bruiser', telegraphSeconds: 0.42, activeSeconds: 0.1, recoverySeconds: 0.48,
    defense: 'parryable', targetMode: 'locked-actor', hitShape: 'contact', range: 70, radius: 40,
    damageMultiplier: 1, telegraphSpriteId: 'fx_ring_a', activeSpriteId: 'fx_slash_h',
    impactSpriteId: 'hit_small', chargeSoundId: 'swing_light', impactSoundId: 'hit_sharp',
  },
  'melee-heavy': {
    id: 'melee-heavy', role: 'bruiser', telegraphSeconds: 0.72, activeSeconds: 0.14, recoverySeconds: 0.72,
    defense: 'parryable', targetMode: 'locked-actor', hitShape: 'cone', range: 105, radius: 65,
    damageMultiplier: 1.45, telegraphSpriteId: 'charged_energy', activeSpriteId: 'fx_slash_big',
    impactSpriteId: 'hit_heavy', chargeSoundId: 'ult_charge', impactSoundId: 'hit_blunt',
  },
  'shield-bash': {
    id: 'shield-bash', role: 'shield-tank', telegraphSeconds: 0.58, activeSeconds: 0.12, recoverySeconds: 0.66,
    defense: 'parryable', targetMode: 'locked-actor', hitShape: 'cone', range: 82, radius: 54,
    damageMultiplier: 1.15, telegraphSpriteId: 'shield_bubble', activeSpriteId: 'fx_punch',
    impactSpriteId: 'fx_pulse_a', chargeSoundId: 'metal_ring', impactSoundId: 'hit_blunt',
  },
  'ranged-shot': {
    id: 'ranged-shot', role: 'ranged-sniper', telegraphSeconds: 0.7, activeSeconds: 0.08, recoverySeconds: 0.62,
    defense: 'parryable', targetMode: 'locked-position', hitShape: 'line', range: 520, radius: 24,
    damageMultiplier: 1.2, telegraphSpriteId: 'aura_sparks', activeSpriteId: 'proj_magic_orb',
    impactSpriteId: 'hit_spark', chargeSoundId: 'buff_focus', impactSoundId: 'hit_sharp',
  },
  'healer-cast': {
    id: 'healer-cast', role: 'healer', telegraphSeconds: 0.85, activeSeconds: 0.12, recoverySeconds: 0.8,
    defense: 'parryable', targetMode: 'locked-actor', hitShape: 'targeted', range: 420, radius: 90,
    damageMultiplier: 0, telegraphSpriteId: 'aura_glow', activeSpriteId: 'ult_spell_heal_001',
    impactSpriteId: 'fx_bloom_a', chargeSoundId: 'holy_ward', impactSoundId: 'holy_heal',
  },
  'summoner-cast': {
    id: 'summoner-cast', role: 'summoner', telegraphSeconds: 0.95, activeSeconds: 0.12, recoverySeconds: 0.9,
    defense: 'parryable', targetMode: 'self', hitShape: 'circle', range: 0, radius: 120,
    damageMultiplier: 0, telegraphSpriteId: 'dark_swirl', activeSpriteId: 'ult_portal',
    impactSpriteId: 'dark_column', chargeSoundId: 'summon', impactSoundId: 'dark_curse',
  },
  'assassin-lunge': {
    id: 'assassin-lunge', role: 'assassin', telegraphSeconds: 0.34, activeSeconds: 0.09, recoverySeconds: 0.5,
    defense: 'parryable', targetMode: 'locked-actor', hitShape: 'line', range: 240, radius: 42,
    damageMultiplier: 1.35, telegraphSpriteId: 'spark_trail', activeSpriteId: 'fx_swipe_b',
    impactSpriteId: 'hit_dark', chargeSoundId: 'blink', impactSoundId: 'hit_sharp',
  },
  'boss-slam': {
    id: 'boss-slam', role: 'boss', telegraphSeconds: 1, activeSeconds: 0.16, recoverySeconds: 0.82,
    defense: 'dodge-only', targetMode: 'locked-position', hitShape: 'circle', range: 500, radius: 130,
    damageMultiplier: 1.85, telegraphSpriteId: 'fx_ring_d', activeSpriteId: 'ground_explosion',
    impactSpriteId: 'explosion_big', chargeSoundId: 'ult_charge', impactSoundId: 'slam',
  },
  'boss-volley': {
    id: 'boss-volley', role: 'boss', telegraphSeconds: 0.62, activeSeconds: 0.22, recoverySeconds: 0.72,
    defense: 'parryable', targetMode: 'locked-position', hitShape: 'line', range: 560, radius: 55,
    damageMultiplier: 1.2, telegraphSpriteId: 'aura_sparks', activeSpriteId: 'proj_dark_orb',
    impactSpriteId: 'hit_dark', chargeSoundId: 'ult_charge', impactSoundId: 'dark_bolt',
  },
  'boss-nova': {
    id: 'boss-nova', role: 'boss', telegraphSeconds: 0.8, activeSeconds: 0.16, recoverySeconds: 0.76,
    defense: 'dodge-only', targetMode: 'self', hitShape: 'circle', range: 0, radius: 200,
    damageMultiplier: 1.65, telegraphSpriteId: 'fx_ring_c', activeSpriteId: 'energy_field',
    impactSpriteId: 'fx_burst_b', chargeSoundId: 'ult_charge', impactSoundId: 'force_pulse',
  },
  'boss-beam': {
    id: 'boss-beam', role: 'boss', telegraphSeconds: 0.78, activeSeconds: 0.24, recoverySeconds: 0.82,
    defense: 'dodge-only', targetMode: 'locked-position', hitShape: 'line', range: 520, radius: 58,
    damageMultiplier: 1.55, telegraphSpriteId: 'charged_energy', activeSpriteId: 'ray_magic',
    impactSpriteId: 'fx_flare_b', chargeSoundId: 'ult_charge', impactSoundId: 'zap_heavy',
  },
} as const satisfies Record<EnemyAttackProfileId, EnemyAttackProfile>);

export const DEFAULT_ATTACK_PROFILE_BY_ROLE = Object.freeze({
  bruiser: 'melee-light',
  'shield-tank': 'shield-bash',
  healer: 'healer-cast',
  'ranged-sniper': 'ranged-shot',
  summoner: 'summoner-cast',
  assassin: 'assassin-lunge',
  boss: 'boss-slam',
} as const satisfies Record<EnemyRole, EnemyAttackProfileId>);

export const BOSS_ATTACK_PROFILE_BY_KIND = Object.freeze({
  slam: 'boss-slam',
  volley: 'boss-volley',
  nova: 'boss-nova',
  beam: 'boss-beam',
} as const satisfies Record<'slam' | 'volley' | 'nova' | 'beam', EnemyAttackProfileId>);

export interface EnemyAttackIntentTarget {
  actorId?: string;
  x: number;
  y: number;
}

export interface EnemyAttackIntent {
  intentId: string;
  profileId: EnemyAttackProfileId;
  sourceEnemyId: string;
  sourceX: number;
  sourceY: number;
  facing: -1 | 1;
  target: EnemyAttackIntentTarget;
  elapsed: number;
  sceneEpoch: number;
  hasResolved: boolean;
}

export interface CreateEnemyAttackIntentOptions {
  intentId: string;
  profileId: EnemyAttackProfileId;
  sourceEnemyId: string;
  sourceX: number;
  sourceY: number;
  facing: -1 | 1;
  target: EnemyAttackIntentTarget;
  sceneEpoch: number;
}

export interface EnemyAttackIntentPhaseSnapshot {
  phase: EnemyIntentPhase;
  progress: number;
  elapsed: number;
  totalDuration: number;
}

const MAX_WORLD_COORDINATE = 10_000_000;
const MAX_INTENT_ELAPSED = 60;

function safeId(value: string): string {
  return String(value || 'unknown').replace(/[^A-Za-z0-9:_.-]/g, '').slice(0, 96) || 'unknown';
}

function safeCoordinate(value: number): number {
  return Number.isFinite(value)
    ? Math.max(-MAX_WORLD_COORDINATE, Math.min(MAX_WORLD_COORDINATE, value))
    : 0;
}

function safeElapsed(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(MAX_INTENT_ELAPSED, value)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isEnemyAttackProfileId(value: unknown): value is EnemyAttackProfileId {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(ENEMY_ATTACK_PROFILES, value);
}

/**
 * Network snapshots and older live clients are runtime data even when the
 * local TypeScript type says otherwise. Never let an unknown profile take the
 * render/update loop down; normalize it to the basic readable melee tell.
 */
export function getEnemyAttackProfile(profileId: unknown): EnemyAttackProfile {
  return isEnemyAttackProfileId(profileId)
    ? ENEMY_ATTACK_PROFILES[profileId]
    : ENEMY_ATTACK_PROFILES['melee-light'];
}

export function createEnemyAttackIntent(
  options: CreateEnemyAttackIntentOptions,
): EnemyAttackIntent {
  const profileId = getEnemyAttackProfile(options.profileId).id;
  return {
    intentId: safeId(options.intentId),
    profileId,
    sourceEnemyId: safeId(options.sourceEnemyId),
    sourceX: safeCoordinate(options.sourceX),
    sourceY: safeCoordinate(options.sourceY),
    facing: options.facing < 0 ? -1 : 1,
    target: {
      ...(options.target.actorId ? { actorId: safeId(options.target.actorId) } : {}),
      x: safeCoordinate(options.target.x),
      y: safeCoordinate(options.target.y),
    },
    elapsed: 0,
    sceneEpoch: Number.isFinite(options.sceneEpoch) ? Math.max(0, Math.trunc(options.sceneEpoch)) : 0,
    hasResolved: false,
  };
}

/** Validate an intent received from an untyped network snapshot. */
export function sanitizeEnemyAttackIntent(value: unknown): EnemyAttackIntent | undefined {
  if (!isRecord(value) || !isRecord(value.target)
    || typeof value.intentId !== 'string' || typeof value.sourceEnemyId !== 'string') return undefined;
  const target = value.target;
  return {
    intentId: safeId(value.intentId),
    profileId: getEnemyAttackProfile(value.profileId).id,
    sourceEnemyId: safeId(value.sourceEnemyId),
    sourceX: safeCoordinate(Number(value.sourceX)),
    sourceY: safeCoordinate(Number(value.sourceY)),
    facing: Number(value.facing) < 0 ? -1 : 1,
    target: {
      ...(typeof target.actorId === 'string' && target.actorId ? { actorId: safeId(target.actorId) } : {}),
      x: safeCoordinate(Number(target.x)),
      y: safeCoordinate(Number(target.y)),
    },
    elapsed: safeElapsed(Number(value.elapsed)),
    sceneEpoch: Number.isFinite(Number(value.sceneEpoch)) ? Math.max(0, Math.trunc(Number(value.sceneEpoch))) : 0,
    hasResolved: value.hasResolved === true,
  };
}

export function enemyAttackIntentPhase(
  intent: EnemyAttackIntent,
): EnemyAttackIntentPhaseSnapshot {
  const profile = getEnemyAttackProfile(intent.profileId);
  const elapsed = safeElapsed(intent.elapsed);
  const activeStart = profile.telegraphSeconds;
  const recoveryStart = activeStart + profile.activeSeconds;
  const totalDuration = recoveryStart + profile.recoverySeconds;
  if (elapsed < activeStart) {
    return {
      phase: 'telegraph',
      progress: activeStart > 0 ? elapsed / activeStart : 1,
      elapsed,
      totalDuration,
    };
  }
  if (elapsed < recoveryStart) {
    return {
      phase: 'active',
      progress: profile.activeSeconds > 0 ? (elapsed - activeStart) / profile.activeSeconds : 1,
      elapsed,
      totalDuration,
    };
  }
  if (elapsed < totalDuration) {
    return {
      phase: 'recovery',
      progress: profile.recoverySeconds > 0 ? (elapsed - recoveryStart) / profile.recoverySeconds : 1,
      elapsed,
      totalDuration,
    };
  }
  return { phase: 'complete', progress: 1, elapsed, totalDuration };
}

export function advanceEnemyAttackIntent(
  intent: EnemyAttackIntent,
  dt: number,
): EnemyAttackIntent {
  const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  return { ...intent, elapsed: safeElapsed(intent.elapsed + elapsed) };
}

export function canResolveEnemyAttackIntent(intent: EnemyAttackIntent): boolean {
  return !intent.hasResolved && enemyAttackIntentPhase(intent).phase === 'active';
}

export function markEnemyAttackIntentResolved(intent: EnemyAttackIntent): EnemyAttackIntent {
  return { ...intent, hasResolved: true };
}
