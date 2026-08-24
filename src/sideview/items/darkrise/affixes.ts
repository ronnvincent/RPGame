/**
 * Randomly generated bonus stats on dropped gear - Darkrise's "randomly
 * generated stats, directly dictating the gear score".
 *
 * Affixes are flat or percent-flavoured extras layered on top of an item's base
 * stats. They are rolled once when the item drops and are part of the save.
 */

import type { ItemData, ItemRarity } from '../ItemDatabase';

export interface ItemAffix {
  id: string;
  label: string;
  stat: keyof NonNullable<ItemData['stats']>;
  /** Flat value for hp/mp/atk/def/speed; fraction (0.04 = +4%) for crit. */
  value: number;
}

interface AffixDef {
  id: string;
  label: string;
  stat: keyof NonNullable<ItemData['stats']>;
  min: number;
  max: number;
}

const AFFIX_POOL: AffixDef[] = [
  { id: 'of_might', label: 'of Might', stat: 'atk', min: 3, max: 14 },
  { id: 'of_warding', label: 'of Warding', stat: 'def', min: 2, max: 10 },
  { id: 'of_vitality', label: 'of Vitality', stat: 'hp', min: 15, max: 90 },
  { id: 'of_clarity', label: 'of Clarity', stat: 'mp', min: 8, max: 45 },
  { id: 'of_precision', label: 'of Precision', stat: 'crit', min: 0.02, max: 0.09 },
  { id: 'of_swiftness', label: 'of Swiftness', stat: 'speed', min: 2, max: 9 },
  { id: 'of_siphoning', label: 'of Siphoning', stat: 'energyShield', min: 12, max: 70 },
  { id: 'of_alacrity', label: 'of Alacrity', stat: 'rechargeSpeed', min: 0.03, max: 0.12 },
  { id: 'of_piercing', label: 'of Piercing', stat: 'armorPen', min: 0.03, max: 0.15 },
];

/** How many affixes a fresh drop rolls, per rarity. */
const AFFIX_COUNT_BY_RARITY: Record<ItemRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythical: 5,
};

function rollAffix(def: AffixDef, rng: () => number): ItemAffix {
  const raw = def.min + rng() * (def.max - def.min);
  const value = def.stat === 'crit' ? Number(raw.toFixed(2)) : Math.max(1, Math.round(raw));
  return { id: def.id, label: def.label, stat: def.stat, value };
}

/** Rarity decides how many; no duplicates within one item. */
export function rollAffixes(rarity: ItemRarity, rng: () => number = Math.random): ItemAffix[] {
  const count = AFFIX_COUNT_BY_RARITY[rarity] ?? 0;
  if (count <= 0) return [];
  const pool = [...AFFIX_POOL];
  const picked: ItemAffix[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(rollAffix(pool.splice(idx, 1)[0], rng));
  }
  return picked;
}

/** Re-roll affixes in place (used by fusion). Keeps count tied to rarity. */
export function rerollAffixes(item: ItemData, rng: () => number = Math.random): void {
  item.affixes = rollAffixes(item.rarity, rng);
}

export function affixLabel(affix: { stat: string; value: number }): string {
  switch (affix.stat) {
    case 'crit': return `+${Math.round(affix.value * 100)}% CRIT`;
    case 'rechargeSpeed': return `+${Math.round(affix.value * 100)}% Recharge`;
    case 'armorPen': return `+${Math.round(affix.value * 100)}% Armor Pen`;
    case 'energyShield': return `+${affix.value} Energy Shield`;
    case 'atk': return `+${affix.value} ATK`;
    case 'def': return `+${affix.value} DEF`;
    case 'hp': return `+${affix.value} HP`;
    case 'mp': return `+${affix.value} MP`;
    case 'speed': return `+${affix.value} SPD`;
    default: return `+${affix.value}`;
  }
}
