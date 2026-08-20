/**
 * Deterministic enemy roles, formations, elite affixes, and mini-boss phases.
 *
 * The host can build a plan from a run seed and sync the resulting ids. There
 * is deliberately no Math.random call here: reconnects and host migration can
 * reconstruct the same encounter from the same seed.
 */

import {
  ENEMY_ROLE_SPRITES,
  type EnemyRoleId,
  type GameplaySpriteId,
  isGameplaySpriteId,
} from '../assets/GameplaySpriteManifest.ts';

export type TacticalLane = 'frontline' | 'support' | 'backline' | 'flank';
export type TargetRule = 'nearest-player' | 'lowest-health-ally' | 'farthest-visible-player' | 'isolated-player';
export type RoleAction = 'raise-guard' | 'restore-ally' | 'aimed-shot' | 'summon-minion' | 'ambush-dash';

export interface EnemyRoleTactic {
  lane: TacticalLane;
  targetRule: TargetRule;
  preferredRange: number;
  retreatRange: number;
  moveSpeedMultiplier: number;
  action: {
    id: RoleAction;
    cooldownSeconds: number;
    telegraphSeconds: number;
    range: number;
    magnitude: number;
    maxActiveSummons?: number;
  };
  guard: { capacity: number; frontalReduction: number; recoveryPerSecond: number } | null;
  stagger: { threshold: number; punishSeconds: number };
  sprites: typeof ENEMY_ROLE_SPRITES[EnemyRoleId];
}

export const ENEMY_ROLE_TACTICS = Object.freeze({
  'shield-tank': {
    lane: 'frontline', targetRule: 'nearest-player', preferredRange: 54, retreatRange: 0,
    moveSpeedMultiplier: 0.78,
    action: { id: 'raise-guard', cooldownSeconds: 5.5, telegraphSeconds: 0.35, range: 72, magnitude: 0.72 },
    guard: { capacity: 120, frontalReduction: 0.72, recoveryPerSecond: 8 },
    stagger: { threshold: 105, punishSeconds: 2.2 }, sprites: ENEMY_ROLE_SPRITES['shield-tank'],
  },
  healer: {
    lane: 'support', targetRule: 'lowest-health-ally', preferredRange: 210, retreatRange: 105,
    moveSpeedMultiplier: 0.88,
    action: { id: 'restore-ally', cooldownSeconds: 7, telegraphSeconds: 0.8, range: 260, magnitude: 0.18 },
    guard: null, stagger: { threshold: 62, punishSeconds: 1.8 }, sprites: ENEMY_ROLE_SPRITES.healer,
  },
  'ranged-sniper': {
    lane: 'backline', targetRule: 'farthest-visible-player', preferredRange: 330, retreatRange: 190,
    moveSpeedMultiplier: 0.92,
    action: { id: 'aimed-shot', cooldownSeconds: 4.8, telegraphSeconds: 1, range: 520, magnitude: 1.65 },
    guard: null, stagger: { threshold: 70, punishSeconds: 1.7 }, sprites: ENEMY_ROLE_SPRITES['ranged-sniper'],
  },
  summoner: {
    lane: 'backline', targetRule: 'nearest-player', preferredRange: 285, retreatRange: 150,
    moveSpeedMultiplier: 0.82,
    action: {
      id: 'summon-minion', cooldownSeconds: 9, telegraphSeconds: 1.1, range: 360,
      magnitude: 0.55, maxActiveSummons: 2,
    },
    guard: null, stagger: { threshold: 78, punishSeconds: 2 }, sprites: ENEMY_ROLE_SPRITES.summoner,
  },
  assassin: {
    lane: 'flank', targetRule: 'isolated-player', preferredRange: 64, retreatRange: 32,
    moveSpeedMultiplier: 1.38,
    action: { id: 'ambush-dash', cooldownSeconds: 5.2, telegraphSeconds: 0.42, range: 260, magnitude: 1.45 },
    guard: null, stagger: { threshold: 58, punishSeconds: 1.45 }, sprites: ENEMY_ROLE_SPRITES.assassin,
  },
} as const satisfies Record<EnemyRoleId, EnemyRoleTactic>);

export type FormationId = 'shield-wall' | 'ritual-guard' | 'hunter-pincer' | 'arcane-echelon';

export interface FormationSlot {
  id: string;
  role: EnemyRoleId;
  /** Local X: zero is the leading edge; negative values stand behind it. */
  localX: number;
  spawnDelaySeconds: number;
}

export interface EnemyFormation {
  id: FormationId;
  minimumWave: number;
  weight: number;
  slots: readonly FormationSlot[];
}

export const ENEMY_FORMATIONS = Object.freeze({
  'shield-wall': {
    id: 'shield-wall', minimumWave: 0, weight: 5,
    slots: [
      { id: 'tank-a', role: 'shield-tank', localX: 0, spawnDelaySeconds: 0 },
      { id: 'tank-b', role: 'shield-tank', localX: -48, spawnDelaySeconds: 0.12 },
      { id: 'healer', role: 'healer', localX: -168, spawnDelaySeconds: 0.35 },
      { id: 'sniper', role: 'ranged-sniper', localX: -260, spawnDelaySeconds: 0.5 },
    ],
  },
  'ritual-guard': {
    id: 'ritual-guard', minimumWave: 1, weight: 4,
    slots: [
      { id: 'tank', role: 'shield-tank', localX: 0, spawnDelaySeconds: 0 },
      { id: 'assassin', role: 'assassin', localX: -92, spawnDelaySeconds: 0.18 },
      { id: 'summoner', role: 'summoner', localX: -190, spawnDelaySeconds: 0.42 },
      { id: 'healer', role: 'healer', localX: -252, spawnDelaySeconds: 0.58 },
    ],
  },
  'hunter-pincer': {
    id: 'hunter-pincer', minimumWave: 2, weight: 3,
    slots: [
      { id: 'assassin-a', role: 'assassin', localX: 18, spawnDelaySeconds: 0 },
      { id: 'tank', role: 'shield-tank', localX: -76, spawnDelaySeconds: 0.1 },
      { id: 'sniper-a', role: 'ranged-sniper', localX: -220, spawnDelaySeconds: 0.35 },
      { id: 'sniper-b', role: 'ranged-sniper', localX: -292, spawnDelaySeconds: 0.52 },
      { id: 'assassin-b', role: 'assassin', localX: -350, spawnDelaySeconds: 0.68 },
    ],
  },
  'arcane-echelon': {
    id: 'arcane-echelon', minimumWave: 3, weight: 2,
    slots: [
      { id: 'tank', role: 'shield-tank', localX: 0, spawnDelaySeconds: 0 },
      { id: 'assassin', role: 'assassin', localX: -74, spawnDelaySeconds: 0.12 },
      { id: 'healer', role: 'healer', localX: -154, spawnDelaySeconds: 0.28 },
      { id: 'summoner', role: 'summoner', localX: -228, spawnDelaySeconds: 0.42 },
      { id: 'sniper', role: 'ranged-sniper', localX: -312, spawnDelaySeconds: 0.58 },
    ],
  },
} as const satisfies Record<FormationId, EnemyFormation>);

export interface BuiltFormationSlot extends FormationSlot {
  formationId: FormationId;
  worldX: number;
  facing: -1 | 1;
}

export type EliteModifierId = 'bulwark' | 'vampiric' | 'volatile' | 'frostbound' | 'stormbound' | 'summoning';

export interface EliteModifierDefinition {
  allowedRoles: readonly EnemyRoleId[];
  incompatibleWith: readonly EliteModifierId[];
  stats: { hp: number; attack: number; defence: number; speed: number };
  rewardMultiplier: number;
  visualSprite: GameplaySpriteId;
  behavior: 'guard-regeneration' | 'damage-leech' | 'death-burst' | 'chill-aura' | 'chain-strike' | 'reinforcements';
}

const ALL_ROLES: readonly EnemyRoleId[] = ['shield-tank', 'healer', 'ranged-sniper', 'summoner', 'assassin'];

export const ELITE_MODIFIERS = Object.freeze({
  bulwark: {
    allowedRoles: ['shield-tank'], incompatibleWith: ['vampiric'],
    stats: { hp: 1.45, attack: 1.05, defence: 1.45, speed: 0.9 }, rewardMultiplier: 1.35,
    visualSprite: 'elite.bulwark', behavior: 'guard-regeneration',
  },
  vampiric: {
    allowedRoles: ALL_ROLES, incompatibleWith: ['bulwark'],
    stats: { hp: 1.2, attack: 1.22, defence: 1, speed: 1.05 }, rewardMultiplier: 1.35,
    visualSprite: 'elite.vampiric', behavior: 'damage-leech',
  },
  volatile: {
    allowedRoles: ALL_ROLES, incompatibleWith: ['frostbound'],
    stats: { hp: 0.9, attack: 1.35, defence: 0.9, speed: 1.1 }, rewardMultiplier: 1.3,
    visualSprite: 'elite.volatile', behavior: 'death-burst',
  },
  frostbound: {
    allowedRoles: ALL_ROLES, incompatibleWith: ['volatile'],
    stats: { hp: 1.15, attack: 1.08, defence: 1.18, speed: 0.92 }, rewardMultiplier: 1.3,
    visualSprite: 'elite.frostbound', behavior: 'chill-aura',
  },
  stormbound: {
    allowedRoles: ['ranged-sniper', 'healer', 'summoner', 'assassin'], incompatibleWith: [],
    stats: { hp: 1.08, attack: 1.28, defence: 1, speed: 1.18 }, rewardMultiplier: 1.4,
    visualSprite: 'elite.stormbound', behavior: 'chain-strike',
  },
  summoning: {
    allowedRoles: ['healer', 'summoner'], incompatibleWith: [],
    stats: { hp: 1.18, attack: 1.12, defence: 1.08, speed: 1 }, rewardMultiplier: 1.45,
    visualSprite: 'elite.summoning', behavior: 'reinforcements',
  },
} as const satisfies Record<EliteModifierId, EliteModifierDefinition>);

export type MiniBossMechanicId = 'enrage' | 'fortify' | 'reinforcements' | 'nova';

export const MINIBOSS_MECHANICS = Object.freeze({
  enrage: { healthGate: 0.65, cooldownSeconds: 12, telegraphSeconds: 0.8, visualSprite: 'miniboss.enrage' },
  fortify: { healthGate: 0.5, cooldownSeconds: 14, telegraphSeconds: 1, visualSprite: 'miniboss.guard' },
  reinforcements: { healthGate: 0.45, cooldownSeconds: 16, telegraphSeconds: 1.2, visualSprite: 'miniboss.summon' },
  nova: { healthGate: 0.3, cooldownSeconds: 11, telegraphSeconds: 1.05, visualSprite: 'miniboss.nova' },
} as const satisfies Record<MiniBossMechanicId, {
  healthGate: number;
  cooldownSeconds: number;
  telegraphSeconds: number;
  visualSprite: GameplaySpriteId;
}>);

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizedSeed(seed: number | string, salt: string): number {
  const numeric = typeof seed === 'number' && Number.isFinite(seed) ? Math.trunc(seed) : hashText(String(seed));
  return hashText(`${numeric}:${salt}`);
}

function deterministicUnit(seed: number | string, salt: string): number {
  let state = normalizedSeed(seed, salt) || 0x6d2b79f5;
  state += 0x6d2b79f5;
  let value = state;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
}

export function chooseFormation(seed: number | string, waveIndex: number): FormationId {
  const wave = Math.max(0, Math.floor(Number.isFinite(waveIndex) ? waveIndex : 0));
  const eligible = Object.values(ENEMY_FORMATIONS).filter((formation) => formation.minimumWave <= wave);
  const totalWeight = eligible.reduce((sum, formation) => sum + formation.weight, 0);
  let roll = deterministicUnit(seed, `formation:${wave}`) * totalWeight;
  for (const formation of eligible) {
    roll -= formation.weight;
    if (roll < 0) return formation.id;
  }
  return eligible[eligible.length - 1]?.id ?? 'shield-wall';
}

export function buildFormation(
  formationId: FormationId,
  anchorX: number,
  facing: -1 | 1,
  seed: number | string,
): BuiltFormationSlot[] {
  const formation = ENEMY_FORMATIONS[formationId];
  const safeAnchor = Number.isFinite(anchorX) ? anchorX : 0;
  return formation.slots.map((slot, index) => {
    const jitter = Math.round((deterministicUnit(seed, `${formationId}:${slot.id}:${index}`) - 0.5) * 14);
    return {
      ...slot,
      formationId,
      facing,
      worldX: Math.round(safeAnchor + (slot.localX + jitter) * facing),
    };
  });
}

export function selectEliteModifiers(
  seed: number | string,
  role: EnemyRoleId,
  requestedCount: number = 1,
): EliteModifierId[] {
  const candidates = (Object.keys(ELITE_MODIFIERS) as EliteModifierId[])
    .filter((id) => ELITE_MODIFIERS[id].allowedRoles.includes(role));
  const count = Math.max(0, Math.min(2, Math.floor(requestedCount), candidates.length));
  const selected: EliteModifierId[] = [];
  const start = candidates.length ? Math.floor(deterministicUnit(seed, `elite:${role}`) * candidates.length) : 0;

  for (let offset = 0; offset < candidates.length && selected.length < count; offset += 1) {
    const id = candidates[(start + offset) % candidates.length];
    const definition = ELITE_MODIFIERS[id];
    const conflicts = selected.some((other) => (
      definition.incompatibleWith.includes(other) || ELITE_MODIFIERS[other].incompatibleWith.includes(id)
    ));
    if (!conflicts) selected.push(id);
  }
  return selected;
}

export function combineEliteStats(modifierIds: readonly EliteModifierId[]) {
  return modifierIds.reduce((combined, id) => {
    const modifier = ELITE_MODIFIERS[id];
    return {
      hp: combined.hp * modifier.stats.hp,
      attack: combined.attack * modifier.stats.attack,
      defence: combined.defence * modifier.stats.defence,
      speed: combined.speed * modifier.stats.speed,
      reward: combined.reward * modifier.rewardMultiplier,
    };
  }, { hp: 1, attack: 1, defence: 1, speed: 1, reward: 1 });
}

export function validateEnemyTactics(): string[] {
  const errors: string[] = [];
  const coveredRoles = new Set<EnemyRoleId>();

  for (const [role, tactic] of Object.entries(ENEMY_ROLE_TACTICS) as [EnemyRoleId, EnemyRoleTactic][]) {
    if (tactic.preferredRange < 0 || tactic.retreatRange < 0 || tactic.action.cooldownSeconds <= 0) {
      errors.push(`${role}: invalid role distance or cooldown`);
    }
    if (tactic.action.telegraphSeconds < 0.3) errors.push(`${role}: telegraph is too short to read`);
    for (const sprite of Object.values(tactic.sprites)) {
      if (!isGameplaySpriteId(sprite)) errors.push(`${role}: unknown sprite ${sprite}`);
    }
  }

  for (const formation of Object.values(ENEMY_FORMATIONS)) {
    const slotIds = new Set<string>();
    for (const slot of formation.slots) {
      coveredRoles.add(slot.role);
      if (slotIds.has(slot.id)) errors.push(`${formation.id}: duplicate slot ${slot.id}`);
      slotIds.add(slot.id);
      if (!ENEMY_ROLE_TACTICS[slot.role]) errors.push(`${formation.id}: unknown role ${slot.role}`);
      if (slot.spawnDelaySeconds < 0) errors.push(`${formation.id}: negative spawn delay`);
    }
  }
  for (const role of ALL_ROLES) if (!coveredRoles.has(role)) errors.push(`no formation uses ${role}`);

  for (const [id, modifier] of Object.entries(ELITE_MODIFIERS) as [EliteModifierId, EliteModifierDefinition][]) {
    if (!modifier.allowedRoles.length) errors.push(`${id}: no compatible roles`);
    if (!isGameplaySpriteId(modifier.visualSprite)) errors.push(`${id}: unknown modifier sprite`);
    if (modifier.rewardMultiplier < 1) errors.push(`${id}: elite reward cannot be reduced`);
    for (const incompatible of modifier.incompatibleWith) {
      if (!ELITE_MODIFIERS[incompatible]) errors.push(`${id}: unknown incompatibility ${incompatible}`);
    }
  }
  for (const [id, mechanic] of Object.entries(MINIBOSS_MECHANICS)) {
    if (mechanic.healthGate <= 0 || mechanic.healthGate >= 1) errors.push(`${id}: invalid health gate`);
    if (mechanic.telegraphSeconds < 0.3 || !isGameplaySpriteId(mechanic.visualSprite)) {
      errors.push(`${id}: invalid mini-boss presentation`);
    }
  }
  return errors;
}
