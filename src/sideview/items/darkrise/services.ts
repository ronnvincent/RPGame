/**
 * Gear services - the blacksmith/jeweler economy that gives Darkrise its
 * between-fight texture: enchant, melt (disenchant), and the Mythical
 * Unification fusion loop.
 *
 * All operations are pure-ish helpers over ItemData + a wallet; the town UI
 * calls them and then triggers a save.
 */

import type { ItemData, ItemRarity } from '../ItemDatabase';
import { nextRarity } from './rarities';
import { rerollAffixes } from './affixes';
import { ensureSockets, socketBonusStats } from './gems';
import type { Wallet } from './currencies';

export const MAX_ENCHANT_LEVEL = 10;
/** Each enchant level multiplies the item's own stats by +8%. */
export const ENCHANT_BONUS_PER_LEVEL = 0.08;

export function enchantCost(item: ItemData): { gold: number; magicSubstance: number } {
  const level = item.enchantLevel || 0;
  return {
    gold: Math.round(300 * Math.pow(1.5, level)),
    magicSubstance: 2 + level,
  };
}

export function canEnchant(item: ItemData): boolean {
  return (item.enchantLevel || 0) < MAX_ENCHANT_LEVEL && !['consumable', 'gem', 'card', 'material'].includes(item.type);
}

/** Returns true when the enchant was applied. */
export function applyEnchant(item: ItemData): boolean {
  if (!canEnchant(item)) return false;
  item.enchantLevel = (item.enchantLevel || 0) + 1;
  return true;
}

/** Enchant multiplier applied to an item's stats wherever they are summed. */
export function enchantMultiplier(item: ItemData): number {
  return 1 + (item.enchantLevel || 0) * ENCHANT_BONUS_PER_LEVEL;
}

/**
 * Melt (disenchant) an item into Magic Substance. Rarity decides the yield -
 * this is how trash gear becomes enchant fuel.
 */
export function meltYield(item: ItemData): { magicSubstance: number; gold: number; diamonds: number } {
  const rarityYield: Record<ItemRarity, number> = {
    common: 1,
    uncommon: 2,
    rare: 4,
    epic: 8,
    legendary: 15,
    mythical: 30,
  };
  return {
    magicSubstance: rarityYield[item.rarity] ?? 1,
    gold: Math.round((item.price || 50) * 0.25),
    diamonds: item.rarity === 'mythical' ? 5 : item.rarity === 'legendary' ? 2 : 0,
  };
}

/**
 * Mythical Unification - Darkrise's endgame treadmill. Feed a piece plus stones
 * to promote it one rarity tier with freshly rolled affixes. Sockets, seated
 * gems, cards and enchant survive the reforging.
 */
export function unificationStoneCost(rarity: ItemRarity): number {
  switch (rarity) {
    case 'common': return 3;
    case 'uncommon': return 5;
    case 'rare': return 8;
    case 'epic': return 12;
    case 'legendary': return 20;
    default: return Infinity; // Mythical is terminal.
  }
}

export function fuseResult(item: ItemData): ItemData | null {
  const next = nextRarity(item.rarity);
  if (!next) return null;
  const fused: ItemData = {
    ...item,
    rarity: next,
  };
  // Base stats scale up so promotion always feels like promotion.
  if (fused.stats) {
    const lift = 1.35;
    (Object.keys(fused.stats) as Array<keyof NonNullable<ItemData['stats']>>).forEach(key => {
      fused.stats![key] = Math.max(1, Math.round((fused.stats![key] || 0) * lift));
    });
  }
  rerollAffixes(fused);
  ensureSockets(fused);
  computeFusedScore(fused);
  return fused;
}

function computeFusedScore(item: ItemData): void {
  void socketBonusStats(item);
}

/** Spend check + deduction against the player's wallet-shaped state. */
export function trySpend(wallet: Wallet, cost: Partial<Record<keyof Wallet, number>>): boolean {
  for (const key of Object.keys(cost) as Array<keyof Wallet>) {
    const amount = cost[key] || 0;
    if ((wallet[key] ?? 0) < amount) return false;
  }
  for (const key of Object.keys(cost) as Array<keyof Wallet>) {
    wallet[key] = (wallet[key] ?? 0) - (cost[key] || 0);
  }
  return true;
}
