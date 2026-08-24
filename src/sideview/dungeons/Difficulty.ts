/**
 * Per-dungeon difficulty tiers, Darkrise-style: every stage can be replayed on
 * Normal, Hard, or Fatal. Fatal consumes Keys of Power and pays out the best
 * loot; Hard sits in between. Difficulty is global run state - the launcher
 * sets it before a dungeon starts.
 */

export type DungeonDifficulty = 'normal' | 'hard' | 'fatal';

export interface DifficultyConfig {
  id: DungeonDifficulty;
  name: string;
  /** Enemy multipliers applied at spawn time. */
  hpMult: number;
  atkMult: number;
  defMult: number;
  /** Reward multipliers. */
  expMult: number;
  goldMult: number;
  /** How many rarity tiers a drop may climb (probability-weighted upgrade). */
  lootUpgradeChance: number;
  /** Extra affixes rolled onto drops from this difficulty. */
  bonusAffixChance: number;
  /** Keys of Power consumed to enter. */
  keyCost: number;
  color: string;
}

export const DIFFICULTY_CONFIGS: Record<DungeonDifficulty, DifficultyConfig> = {
  normal: {
    id: 'normal',
    name: 'Normal',
    hpMult: 1,
    atkMult: 1,
    defMult: 1,
    expMult: 1,
    goldMult: 1,
    lootUpgradeChance: 0,
    bonusAffixChance: 0,
    keyCost: 0,
    color: '#94a3b8',
  },
  hard: {
    id: 'hard',
    name: 'Hard',
    hpMult: 2.2,
    atkMult: 1.6,
    defMult: 1.4,
    expMult: 1.8,
    goldMult: 2,
    lootUpgradeChance: 0.35,
    bonusAffixChance: 0.5,
    keyCost: 0,
    color: '#fbbf24',
  },
  fatal: {
    id: 'fatal',
    name: 'Fatal',
    hpMult: 4.5,
    atkMult: 2.6,
    defMult: 2,
    expMult: 3.2,
    goldMult: 3.5,
    lootUpgradeChance: 0.65,
    bonusAffixChance: 1,
    keyCost: 10,
    color: '#f87171',
  },
};

let activeDifficulty: DungeonDifficulty = 'normal';

export function setActiveDifficulty(difficulty: DungeonDifficulty): void {
  activeDifficulty = difficulty;
}

export function getActiveDifficulty(): DungeonDifficulty {
  return activeDifficulty;
}

export function getDifficultyConfig(difficulty: DungeonDifficulty = activeDifficulty): DifficultyConfig {
  return DIFFICULTY_CONFIGS[difficulty];
}
