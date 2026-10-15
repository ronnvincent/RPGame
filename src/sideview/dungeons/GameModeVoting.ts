/**
 * Game Mode & Wave Modifier Voting System
 * Provides synchronized multiplayer voting for gameplay modifiers between dungeon waves.
 */

export type DungeonFlowState = 'WAVE_ACTIVE' | 'WAVE_CLEARED' | 'GAMEMODE_VOTING' | 'APPLYING_GAMEMODE';

export interface GameModeModifiers {
  playerDamageMult?: number;
  playerSpeedMult?: number;
  enemyHpMult?: number;
  enemyAtkMult?: number;
  goldMult?: number;
  expMult?: number;
  cooldownReduction?: number;
  healOnKillPct?: number;
}

export interface GameModeOption {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  icon: string;
  badge: string;
  color: string;
  modifiers: GameModeModifiers;
}

export interface StartGameModeVotePacket {
  options: GameModeOption[];
  duration: number; // 5000 ms
  endTime: number; // Date.now() + 5000
  nextWave: number;
}

export interface CastGameModeVotePacket {
  playerId: string;
  selectedModeId: string;
}

export interface GameModeVoteResultPacket {
  winningModeId: string;
  nextWave: number;
}

/**
 * Curated catalog of exciting, distinct wave modifiers.
 */
export const ALL_GAME_MODES: readonly GameModeOption[] = Object.freeze([
  {
    id: 'berserk_rush',
    name: 'Berserker Rush',
    subtitle: 'High Risk, Colossal Bounty',
    description: 'Enemies deal +35% damage, but players gain +25% attack speed and +60% Gold & EXP.',
    icon: '⚡',
    badge: 'HIGH RISK',
    color: '#ef4444',
    modifiers: {
      enemyAtkMult: 1.35,
      playerSpeedMult: 1.25,
      goldMult: 1.6,
      expMult: 1.6,
    },
  },
  {
    id: 'golden_bounty',
    name: 'Golden Treasury',
    subtitle: 'Wealth Beyond Measure',
    description: 'Enemies have +40% HP, but drop +100% Gold and double gem find chance.',
    icon: '💰',
    badge: 'BOUNTY',
    color: '#f59e0b',
    modifiers: {
      enemyHpMult: 1.4,
      goldMult: 2.0,
      expMult: 1.25,
    },
  },
  {
    id: 'chrono_surge',
    name: 'Chrono Surge',
    subtitle: 'Accelerated Battlefield',
    description: 'Movement and attack speed +30% for all heroes, and skill cooldowns are reduced by 25%.',
    icon: '⏳',
    badge: 'FAST PACED',
    color: '#06b6d4',
    modifiers: {
      playerSpeedMult: 1.3,
      cooldownReduction: 0.25,
    },
  },
  {
    id: 'blood_pact',
    name: 'Vampiric Pact',
    subtitle: 'Life for Life',
    description: 'Defeating any monster restores 6% Max HP. Monsters gain +15% attack power.',
    icon: '🩸',
    badge: 'SUSTAIN',
    color: '#ec4899',
    modifiers: {
      healOnKillPct: 0.06,
      enemyAtkMult: 1.15,
    },
  },
  {
    id: 'colossal_titans',
    name: 'Titan Onslaught',
    subtitle: 'Fewer, Stronger Beasts',
    description: 'Monsters spawn as hulking titans with +70% HP, but grant +80% EXP and rare loot.',
    icon: '👹',
    badge: 'ELITE TRIAL',
    color: '#8b5cf6',
    modifiers: {
      enemyHpMult: 1.7,
      expMult: 1.8,
      goldMult: 1.5,
    },
  },
  {
    id: 'glass_cannon',
    name: 'Glass Arsenal',
    subtitle: 'Lethal Lethality',
    description: 'Both heroes and monsters deal +50% damage. Every swing is devastating.',
    icon: '💥',
    badge: 'LETHAL',
    color: '#f97316',
    modifiers: {
      playerDamageMult: 1.5,
      enemyAtkMult: 1.5,
    },
  },
  {
    id: 'arcane_tempest',
    name: 'Arcane Tempest',
    subtitle: 'Spellstorm Unleashed',
    description: 'Skill cooldowns are reduced by 40%, but monsters move 20% faster.',
    icon: '🌀',
    badge: 'COOLDOWNS',
    color: '#3b82f6',
    modifiers: {
      cooldownReduction: 0.4,
      playerSpeedMult: 1.1,
    },
  },
  {
    id: 'iron_citadel',
    name: 'Iron Citadel',
    subtitle: 'Steadfast Defense',
    description: 'Monsters deal -25% damage. A steady, resilient trial with +30% Gold rewards.',
    icon: '🛡️',
    badge: 'DEFENSIVE',
    color: '#10b981',
    modifiers: {
      enemyAtkMult: 0.75,
      goldMult: 1.3,
    },
  },
]);

/**
 * Deterministically or randomly selects 3 distinct Game Mode options from the pool.
 */
export function selectThreeGameModes(seed?: string | number): GameModeOption[] {
  const pool = [...ALL_GAME_MODES];
  const selected: GameModeOption[] = [];

  let hash = typeof seed === 'number'
    ? seed
    : typeof seed === 'string'
    ? seed.split('').reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 1337)
    : Date.now();

  while (selected.length < 3 && pool.length > 0) {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507) >>> 0;
    const index = hash % pool.length;
    selected.push(pool.splice(index, 1)[0]);
  }

  return selected;
}

/**
 * Resolves votes strictly according to the specified rules:
 * - Rule 1 (Majority Wins): The option with highest votes wins.
 * - Rule 2 (Tie-Breaker): If two or more top options are tied, randomly pick one among tied top choices.
 * - Rule 3 (Zero Votes Fallback): If 0 votes total, randomly pick one of the available options.
 *
 * @param options The 3 options offered in the vote
 * @param votes Map of playerId -> selectedModeId
 * @param randomRoll Optional custom roll [0, 1) for deterministic testing
 */
export function resolveVote(
  options: GameModeOption[],
  votes: Map<string, string>,
  randomRoll: number = Math.random(),
): string {
  if (!options || options.length === 0) {
    return ALL_GAME_MODES[0].id;
  }

  // Count votes per option
  const voteCounts = new Map<string, number>();
  for (const opt of options) {
    voteCounts.set(opt.id, 0);
  }

  for (const selectedId of votes.values()) {
    if (voteCounts.has(selectedId)) {
      voteCounts.set(selectedId, (voteCounts.get(selectedId) || 0) + 1);
    }
  }

  const totalVotes = Array.from(voteCounts.values()).reduce((sum, count) => sum + count, 0);

  // Rule 3 (Zero Votes Fallback): If 0 votes total, randomly pick one of the available options
  if (totalVotes === 0) {
    const clampedRoll = Math.max(0, Math.min(0.99999, randomRoll));
    const fallbackIndex = Math.floor(clampedRoll * options.length);
    return options[fallbackIndex].id;
  }

  // Find max votes
  let maxCount = -1;
  for (const count of voteCounts.values()) {
    if (count > maxCount) {
      maxCount = count;
    }
  }

  const topOptions = options.filter(opt => (voteCounts.get(opt.id) || 0) === maxCount);

  // Rule 1 (Majority Wins): Exactly one top choice
  if (topOptions.length === 1) {
    return topOptions[0].id;
  }

  // Rule 2 (Tie-Breaker): Randomly pick one among the tied top choices
  const clampedRoll = Math.max(0, Math.min(0.99999, randomRoll));
  const tieBreakerIndex = Math.floor(clampedRoll * topOptions.length);
  return topOptions[tieBreakerIndex].id;
}
