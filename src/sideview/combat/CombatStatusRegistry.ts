/**
 * Data and pure resolution rules for combat statuses and elemental reactions.
 *
 * This module deliberately does not draw, spawn particles, mutate enemies, or
 * schedule work. It returns bounded gameplay events plus catalogue sprite/sound
 * ids; the engine remains the only place that may apply those events.
 */

import type { SfxId } from '../engine/SfxLibrary';
import type { VfxId } from '../engine/VfxLibrary';

export const COMBAT_STATUS_KINDS = [
  'slow',
  'poison',
  'burn',
  'stun',
  'frailty',
  'taunt',
  'wet',
  'freeze',
  'curse',
] as const;

export type CombatStatusKind = typeof COMBAT_STATUS_KINDS[number];
export type ElementalReactionStatus = 'wet' | 'burn' | 'freeze' | 'curse';

export interface CombatStatusDefinition {
  id: CombatStatusKind;
  displayName: string;
  /** Catalogue sprites only. No asset path or Canvas drawing contract lives here. */
  markerSpriteId: VfxId;
  applySpriteId: VfxId;
  soundId: SfxId;
  elemental: boolean;
}

export const COMBAT_STATUS_REGISTRY = Object.freeze({
  slow: {
    id: 'slow', displayName: 'Slowed', markerSpriteId: 'fx_ring_b',
    applySpriteId: 'water_splash', soundId: 'water_burst', elemental: false,
  },
  poison: {
    id: 'poison', displayName: 'Poisoned', markerSpriteId: 'aura_green',
    applySpriteId: 'aura_green', soundId: 'dark_plague', elemental: false,
  },
  burn: {
    id: 'burn', displayName: 'Burning', markerSpriteId: 'fx_burn',
    applySpriteId: 'fx_burn', soundId: 'fire_burst', elemental: true,
  },
  stun: {
    id: 'stun', displayName: 'Stunned', markerSpriteId: 'fx_star_a',
    applySpriteId: 'fx_star_a', soundId: 'hit_blunt', elemental: false,
  },
  frailty: {
    id: 'frailty', displayName: 'Frail', markerSpriteId: 'dark_swirl',
    applySpriteId: 'dark_swirl', soundId: 'dark_curse', elemental: false,
  },
  taunt: {
    id: 'taunt', displayName: 'Taunted', markerSpriteId: 'fx_wave_a',
    applySpriteId: 'fx_wave_a', soundId: 'buff_roar', elemental: false,
  },
  wet: {
    id: 'wet', displayName: 'Wet', markerSpriteId: 'water_splash',
    applySpriteId: 'splash', soundId: 'water_burst', elemental: true,
  },
  freeze: {
    id: 'freeze', displayName: 'Frozen', markerSpriteId: 'fx_ice_ball',
    applySpriteId: 'fx_ice_burst', soundId: 'ice_nova', elemental: true,
  },
  curse: {
    id: 'curse', displayName: 'Cursed', markerSpriteId: 'dark_column',
    applySpriteId: 'dark_swirl', soundId: 'dark_curse', elemental: true,
  },
} as const satisfies Record<CombatStatusKind, CombatStatusDefinition>);

export const ELEMENTAL_REACTION_IDS = [
  'wet-lightning-chain',
  'burn-explosion',
  'freeze-shatter',
  'curse-lifesteal',
] as const;

export type ElementalReactionId = typeof ELEMENTAL_REACTION_IDS[number];
export type ElementalReactionTag = 'lightning' | 'detonate' | 'shatter' | 'siphon';
export type ReactionDamageKind = 'lightning' | 'fire' | 'physical' | 'dark';

export interface ElementalReactionDefinition {
  id: ElementalReactionId;
  displayName: string;
  requiredStatus: ElementalReactionStatus;
  triggerTag: ElementalReactionTag;
  damageKind: ReactionDamageKind;
  baseDamageScale: number;
  residualStatusDamageScale: number;
  secondaryDamageFalloff: readonly number[];
  radius: number;
  maxSecondaryTargets: number;
  healingScale: number;
  staggerDamage: number;
  impactSpriteId: VfxId;
  soundId: SfxId;
}

/**
 * All reaction tuning is authored here. Consumers must never infer a reaction
 * from a colour, class name, sprite path, or effect filename.
 */
export const ELEMENTAL_REACTIONS = Object.freeze({
  'wet-lightning-chain': {
    id: 'wet-lightning-chain',
    displayName: 'Conductive Chain',
    requiredStatus: 'wet',
    triggerTag: 'lightning',
    damageKind: 'lightning',
    baseDamageScale: 0.35,
    residualStatusDamageScale: 0,
    secondaryDamageFalloff: [0.75, 0.55, 0.4],
    radius: 280,
    maxSecondaryTargets: 3,
    healingScale: 0,
    staggerDamage: 12,
    impactSpriteId: 'electro_shock',
    soundId: 'zap_chain',
  },
  'burn-explosion': {
    id: 'burn-explosion',
    displayName: 'Combustion',
    requiredStatus: 'burn',
    triggerTag: 'detonate',
    damageKind: 'fire',
    baseDamageScale: 0.3,
    // Detonation converts, rather than silently discards, unpaid burn damage.
    residualStatusDamageScale: 0.75,
    secondaryDamageFalloff: [0.65, 0.55, 0.45, 0.35, 0.3],
    radius: 150,
    maxSecondaryTargets: 5,
    healingScale: 0,
    staggerDamage: 24,
    impactSpriteId: 'explosion_wide',
    soundId: 'fire_burst',
  },
  'freeze-shatter': {
    id: 'freeze-shatter',
    displayName: 'Shatter',
    requiredStatus: 'freeze',
    triggerTag: 'shatter',
    damageKind: 'physical',
    baseDamageScale: 0.45,
    residualStatusDamageScale: 0,
    secondaryDamageFalloff: [],
    radius: 0,
    maxSecondaryTargets: 0,
    healingScale: 0,
    staggerDamage: 65,
    impactSpriteId: 'crossed_energy',
    soundId: 'ice_nova',
  },
  'curse-lifesteal': {
    id: 'curse-lifesteal',
    displayName: 'Soul Siphon',
    requiredStatus: 'curse',
    triggerTag: 'siphon',
    damageKind: 'dark',
    baseDamageScale: 0,
    residualStatusDamageScale: 0,
    secondaryDamageFalloff: [],
    radius: 0,
    maxSecondaryTargets: 0,
    healingScale: 0.35,
    staggerDamage: 0,
    impactSpriteId: 'ult_spell_absorb_001',
    soundId: 'dark_drain',
  },
} as const satisfies Record<ElementalReactionId, ElementalReactionDefinition>);

export interface ReactionStatusSnapshot {
  kind: CombatStatusKind;
  remaining: number;
  /** Unpaid DoT budget. Only burn detonation reads this value. */
  remainingDamage?: number;
  sourceSkillId?: string;
}

export interface NearbyReactionTarget {
  id: string;
  distance: number;
}

export interface ElementalReactionContext {
  targetId: string;
  /** Stable per cast; repeated packets from one multi-hit cast dedupe on it. */
  castToken: string | number;
  /** Post-mitigation direct damage actually dealt by the triggering skill hit. */
  sourceDamage: number;
  triggerTags: readonly ElementalReactionTag[];
  /** Snapshot from before this hit applies its own statuses, preventing self-priming. */
  statusesBeforeHit: readonly ReactionStatusSnapshot[];
  nearbyTargets?: readonly NearbyReactionTarget[];
  alreadyResolvedKeys?: ReadonlySet<string>;
  /** Reaction/DoT/hazard damage can never recursively trigger another reaction. */
  sourceKind?: 'skill' | 'reaction' | 'dot' | 'hazard';
}

export interface ReactionDamageEvent {
  targetId: string;
  amount: number;
  damageKind: ReactionDamageKind;
  /** Integrators pass this back as sourceKind to preserve the non-recursive contract. */
  sourceKind: 'reaction';
}

export interface ElementalReactionResolution {
  reactionId: ElementalReactionId;
  displayName: string;
  dedupeKey: string;
  consumeStatusKinds: readonly ElementalReactionStatus[];
  damageEvents: readonly ReactionDamageEvent[];
  healing: number;
  staggerDamage: number;
  impactSpriteId: VfxId;
  soundId: SfxId;
}

export const REACTION_LIMITS = Object.freeze({
  maxSourceDamage: 250_000,
  maxDamagePerEvent: 250_000,
  maxHealing: 250_000,
  maxNearbyCandidates: 32,
  maxReactionsPerHit: ELEMENTAL_REACTION_IDS.length,
});

function finiteClamped(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}

function activeStatus(
  statuses: readonly ReactionStatusSnapshot[],
  kind: ElementalReactionStatus,
): ReactionStatusSnapshot[] {
  return statuses.filter((status) => (
    status.kind === kind
    && Number.isFinite(status.remaining)
    && status.remaining > 0
  ));
}

function safeCastToken(value: string | number): string {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(Math.trunc(value)) : 'invalid';
  }
  return String(value || 'invalid').replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 96) || 'invalid';
}

function safeTargetId(value: string): string {
  return String(value || 'unknown').replace(/[^A-Za-z0-9:_.-]/g, '').slice(0, 96) || 'unknown';
}

export function elementalReactionDedupeKey(
  castToken: string | number,
  targetId: string,
  reactionId: ElementalReactionId,
): string {
  return `${safeCastToken(castToken)}:${safeTargetId(targetId)}:${reactionId}`;
}

function sortedNearbyTargets(
  targets: readonly NearbyReactionTarget[] | undefined,
  primaryTargetId: string,
  radius: number,
  limit: number,
): NearbyReactionTarget[] {
  if (!targets || limit <= 0 || radius <= 0) return [];
  const unique = new Map<string, NearbyReactionTarget>();
  for (const candidate of targets.slice(0, REACTION_LIMITS.maxNearbyCandidates)) {
    const id = safeTargetId(candidate.id);
    if (id === safeTargetId(primaryTargetId)) continue;
    const distance = Number(candidate.distance);
    if (!Number.isFinite(distance) || distance < 0 || distance > radius) continue;
    const prior = unique.get(id);
    if (!prior || distance < prior.distance) unique.set(id, { id, distance });
  }
  return [...unique.values()]
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))
    .slice(0, limit);
}

function reactionDamage(
  definition: ElementalReactionDefinition,
  sourceDamage: number,
  matchingStatuses: readonly ReactionStatusSnapshot[],
): number {
  const residualDamage = matchingStatuses.reduce((sum, status) => (
    sum + finiteClamped(Number(status.remainingDamage || 0), 0, REACTION_LIMITS.maxSourceDamage)
  ), 0);
  const raw = sourceDamage * definition.baseDamageScale
    + Math.min(REACTION_LIMITS.maxSourceDamage, residualDamage) * definition.residualStatusDamageScale;
  return Math.min(REACTION_LIMITS.maxDamagePerEvent, Math.max(0, Math.round(raw)));
}

function damageEventsFor(
  definition: ElementalReactionDefinition,
  context: ElementalReactionContext,
  matchingStatuses: readonly ReactionStatusSnapshot[],
  sourceDamage: number,
): ReactionDamageEvent[] {
  const primaryDamage = reactionDamage(definition, sourceDamage, matchingStatuses);
  if (primaryDamage <= 0) return [];

  const events: ReactionDamageEvent[] = [{
    targetId: safeTargetId(context.targetId),
    amount: primaryDamage,
    damageKind: definition.damageKind,
    sourceKind: 'reaction',
  }];
  const secondaryTargets = sortedNearbyTargets(
    context.nearbyTargets,
    context.targetId,
    definition.radius,
    definition.maxSecondaryTargets,
  );
  secondaryTargets.forEach((target, index) => {
    const falloff = finiteClamped(definition.secondaryDamageFalloff[index] ?? 0, 0, 1);
    const amount = Math.min(
      REACTION_LIMITS.maxDamagePerEvent,
      Math.max(0, Math.round(primaryDamage * falloff)),
    );
    if (amount > 0) {
      events.push({
        targetId: target.id,
        amount,
        damageKind: definition.damageKind,
        sourceKind: 'reaction',
      });
    }
  });
  return events;
}

/**
 * Resolve reaction events from an immutable pre-hit snapshot.
 *
 * No output is applied here, so callers cannot accidentally recurse by merely
 * asking what a hit should do. Apply each `damageEvent` with sourceKind
 * `reaction`, consume the returned status kind once, and record `dedupeKey`.
 */
export function resolveElementalReactions(
  context: ElementalReactionContext,
): readonly ElementalReactionResolution[] {
  if ((context.sourceKind ?? 'skill') !== 'skill') return [];
  const sourceDamage = finiteClamped(
    Number(context.sourceDamage),
    0,
    REACTION_LIMITS.maxSourceDamage,
  );
  if (sourceDamage <= 0) return [];

  const tags = new Set(context.triggerTags);
  const resolved: ElementalReactionResolution[] = [];
  for (const reactionId of ELEMENTAL_REACTION_IDS) {
    if (resolved.length >= REACTION_LIMITS.maxReactionsPerHit) break;
    const definition = ELEMENTAL_REACTIONS[reactionId];
    if (!tags.has(definition.triggerTag)) continue;
    const matchingStatuses = activeStatus(context.statusesBeforeHit, definition.requiredStatus);
    if (!matchingStatuses.length) continue;

    const dedupeKey = elementalReactionDedupeKey(context.castToken, context.targetId, reactionId);
    if (context.alreadyResolvedKeys?.has(dedupeKey)) continue;
    resolved.push({
      reactionId,
      displayName: definition.displayName,
      dedupeKey,
      consumeStatusKinds: [definition.requiredStatus],
      damageEvents: damageEventsFor(definition, context, matchingStatuses, sourceDamage),
      healing: Math.min(
        REACTION_LIMITS.maxHealing,
        Math.max(0, Math.round(sourceDamage * definition.healingScale)),
      ),
      staggerDamage: Math.max(0, Math.round(definition.staggerDamage)),
      impactSpriteId: definition.impactSpriteId,
      soundId: definition.soundId,
    });
  }
  return resolved;
}
