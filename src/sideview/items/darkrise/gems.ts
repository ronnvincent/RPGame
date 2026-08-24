/**
 * Gem system, modelled on Darkrise: gear can hold up to four sockets, sockets
 * are unlocked with gold at the jeweler, gems come in colours and tiers, and
 * three gems of one colour combine into the next tier.
 *
 * Gems live in the normal inventory as ItemData entries (type 'gem') so drops,
 * pickups, saves and the bag UI all work unchanged; their stat bonus rides in
 * `stats` like any other item. Socketing writes a *copy* of that data into the
 * equipment piece's `sockets` array.
 */

import type { ItemData } from '../ItemDatabase';

export const MAX_SOCKETS = 4;

export type GemColor = 'red' | 'green' | 'orange' | 'violet';

export interface GemTierDef {
  color: GemColor;
  tier: number;
  name: string;
  /** Flat bonuses; crit is a fraction (0.02 = +2%). */
  stats: NonNullable<ItemData['stats']>;
  price: number;
}

const GEM_NAMES: Record<GemColor, string[]> = {
  red: ['Chip of Fury', 'Ruby', 'Flawless Ruby', 'Brilliant Ruby', 'Heart of the Inferno'],
  green: ['Chip of Vigor', 'Emerald', 'Flawless Emerald', 'Brilliant Emerald', 'Bloom of the Grove'],
  orange: ['Chip of Warding', 'Topaz', 'Flawless Topaz', 'Brilliant Topaz', 'Aegis Sunstone'],
  violet: ['Chip of Focus', 'Amethyst', 'Flawless Amethyst', 'Brilliant Amethyst', 'Eye of the Void'],
};

function buildGemCatalog(): Record<GemColor, ItemData[]> {
  const catalog = {} as Record<GemColor, ItemData[]>;
  (Object.keys(GEM_NAMES) as GemColor[]).forEach((color) => {
    catalog[color] = GEM_NAMES[color].map((name, i) => {
      const tier = i + 1;
      // Each tier roughly doubles the previous; crit stays a small fraction.
      const scale = Math.pow(2.1, i);
      return {
        id: `gem_${color}_${tier}`,
        name,
        type: 'gem' as const,
        rarity: (['common', 'uncommon', 'rare', 'epic', 'legendary'] as const)[i],
        icon: 'Gem',
        image: `/assets/rpg-icons/32x32/gem_01${String.fromCharCode(97 + (color === 'red' ? 0 : color === 'green' ? 1 : color === 'orange' ? 2 : 3))}.png`,
        description: `${['Rough', 'Cut', 'Faceted', 'Perfect', 'Mythical'][i]} ${color} gem. Socket it into matching gear at the jeweler.`,
        price: Math.round((60 * scale) / 5) * 5,
        stats: {
          ...(color === 'red' ? { atk: Math.round(4 * scale) } : {}),
          ...(color === 'green' ? { hp: Math.round(20 * scale) } : {}),
          ...(color === 'orange' ? { def: Math.round(3 * scale) } : {}),
          ...(color === 'violet' ? { crit: Number((0.01 * Math.pow(1.9, i)).toFixed(2)) } : {}),
        },
      };
    });
  });
  return catalog;
}

export const GEM_CATALOG: Record<GemColor, ItemData[]> = buildGemCatalog();

export function getGemById(id: string): ItemData | null {
  for (const color of Object.keys(GEM_CATALOG) as GemColor[]) {
    const gem = GEM_CATALOG[color].find(g => g.id === id);
    if (gem) return gem;
  }
  return null;
}

/** A socket is either empty (null) or holds gem item data. */
export type ItemSocket = string | null;

export function isSocketable(item: ItemData): boolean {
  return !['consumable', 'gem', 'card', 'material'].includes(item.type);
}

/** Lazily give an old item its socket array (Darkrise items drop with slots). */
export function ensureSockets(item: ItemData): ItemSocket[] {
  if (!item.sockets) item.sockets = [];
  while (item.sockets.length < MAX_SOCKETS) item.sockets.push(null);
  return item.sockets;
}

export function countOpenSockets(item: ItemData): number {
  if (!isSocketable(item)) return 0;
  return ensureSockets(item).filter(s => s === null).length;
}

/**
 * Unlocking the Nth socket costs escalating gold - Darkrise's jeweler charges
 * more for each new slot.
 */
export function nextSocketUnlockCost(item: ItemData): number {
  const used = ensureSockets(item).filter(s => s !== null).length;
  const carved = ensureSockets(item).length - countOpenSockets(item) - used;
  void carved;
  const filled = used;
  return Math.round(250 * Math.pow(1.8, filled));
}

export function insertGem(item: ItemData, gem: ItemData): boolean {
  const sockets = ensureSockets(item);
  const open = sockets.findIndex(s => s === null);
  if (open === -1) return false;
  sockets[open] = gem.id;
  return true;
}

export function removeGemAt(item: ItemData, socketIndex: number): string | null {
  const sockets = ensureSockets(item);
  const gemId = sockets[socketIndex];
  if (!gemId) return null;
  sockets[socketIndex] = null;
  return gemId;
}

/** Total stats contributed by every seated gem. */
export function socketBonusStats(item: ItemData): NonNullable<ItemData['stats']> {
  const total: NonNullable<ItemData['stats']> = {};
  ensureSockets(item).forEach(id => {
    if (!id) return;
    const gem = getGemById(id);
    if (!gem?.stats) return;
    (Object.keys(gem.stats) as Array<keyof NonNullable<ItemData['stats']>>).forEach(key => {
      total[key] = (total[key] || 0) + (gem.stats![key] || 0);
    });
  });
  return total;
}

/** Three of one colour and tier become one of the next tier. */
export function findCombineTarget(gems: ItemData[]): { input: number[]; result: ItemData } | null {
  const byKey = new Map<string, number[]>();
  gems.forEach((g, idx) => {
    if (g.type !== 'gem') return;
    const match = /^(gem_[a-z]+)_(\d)$/.exec(g.id);
    if (!match) return;
    const key = `${match[1]}_${match[2]}`;
    const list = byKey.get(key) || [];
    list.push(idx);
    byKey.set(key, list);
  });
  for (const [key, indices] of byKey) {
    if (indices.length < 3) continue;
    const match = /^gem_([a-z]+)_(\d)$/.exec(key);
    if (!match) continue;
    const color = match[1] as GemColor;
    const tier = Number(match[2]);
    if (tier >= 5) continue;
    return { input: [indices[0], indices[1], indices[2]], result: GEM_CATALOG[color][tier] };
  }
  return null;
}

/**
 * Chance a defeated enemy's loot slot becomes a raw gem instead of gear -
 * Darkrise mobs feed the gem economy constantly.
 */
export const GEM_DROP_CHANCE = 0.08;

export function rollGemDrop(rng: () => number = Math.random): ItemData {
  const colors = Object.keys(GEM_CATALOG) as GemColor[];
  const color = colors[Math.floor(rng() * colors.length)];
  // Tiers 1-2 from ordinary play; higher tiers come from fusing or Fatal runs.
  const roll = rng();
  const tier = getActiveDifficultyTier(roll);
  return { ...GEM_CATALOG[color][tier - 1], stats: { ...GEM_CATALOG[color][tier - 1].stats } };
}

function getActiveDifficultyTier(roll: number): number {
  // ~80% tier 1, ~18% tier 2, ~2% tier 3.
  if (roll < 0.02) return 3;
  if (roll < 0.2) return 2;
  return 1;
}
