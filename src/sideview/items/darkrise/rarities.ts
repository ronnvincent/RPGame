/**
 * Six-tier rarity ladder and Gear Score, modelled on Darkrise's structure:
 * Common -> Uncommon -> Rare -> Epic -> Legendary -> Mythical.
 *
 * Every dropped piece of gear carries a Gear Score so "is this an upgrade" is
 * one number instead of six stat subtractions, exactly like Darkrise.
 */

import type { ItemData, ItemRarity } from '../ItemDatabase';

export const RARITY_ORDER: ItemRarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythical',
];

export function rarityIndex(rarity: ItemRarity): number {
  return RARITY_ORDER.indexOf(rarity);
}

export function nextRarity(rarity: ItemRarity): ItemRarity | null {
  const idx = rarityIndex(rarity);
  return idx >= 0 && idx < RARITY_ORDER.length - 1 ? RARITY_ORDER[idx + 1] : null;
}

/** Power weight per tier - also what computePower() multiplies by. */
export const RARITY_POWER_WEIGHT: Record<ItemRarity, number> = {
  common: 15,
  uncommon: 28,
  rare: 45,
  epic: 110,
  legendary: 260,
  mythical: 600,
};

/**
 * Drop weights per loot tier, extended for the two extra rarities. The old
 * four-bucket tables are preserved as the backbone: low keeps mostly commons,
 * boss still showers legendaries. Mythical never falls out of a normal mob -
 * it is fused or farmed from Fatal bosses, like Darkrise's unification loop.
 */
export type LootTier = 'boss' | 'mid' | 'low';

export const RARITY_WEIGHTS_BY_TIER: Record<LootTier, Record<ItemRarity, number>> = {
  low: { common: 50, uncommon: 26, rare: 20, epic: 3.5, legendary: 0.5, mythical: 0 },
  mid: { common: 24, uncommon: 30, rare: 30, epic: 12, legendary: 4, mythical: 0 },
  boss: { common: 6, uncommon: 14, rare: 30, epic: 32, legendary: 17, mythical: 1 },
};

export function weightedRarityRoll(
  weights: Record<ItemRarity, number>,
  rng: () => number = Math.random,
): ItemRarity {
  const entries = Object.entries(weights) as Array<[ItemRarity, number]>;
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [rarity, w] of entries) {
    roll -= w;
    if (roll <= 0) return rarity;
  }
  return entries[entries.length - 1][0];
}

/** Flat score for an item: base stats + rarity weight + sockets/enchant/card. */
export function computeGearScore(item: ItemData): number {
  const s = item.stats || {};
  const statScore =
    (s.hp || 0) * 0.5 +
    (s.mp || 0) * 0.5 +
    (s.atk || 0) * 2 +
    (s.def || 0) * 2 +
    Math.round((s.crit || 0) * 100) * 8 +
    (s.speed || 0) * 10;
  const affixScore = (item.affixes?.length || 0) * 25;
  const socketScore = (item.sockets?.filter(Boolean).length || 0) * 20;
  const enchantScore = (item.enchantLevel || 0) * 35;
  const cardScore = item.cardId ? 60 : 0;
  const total = Math.round(statScore + RARITY_POWER_WEIGHT[item.rarity] + affixScore + socketScore + enchantScore + cardScore);
  // Stored so saves and tooltips agree without recomputing everywhere.
  item.gearScore = total;
  return total;
}
