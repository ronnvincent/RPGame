/**
 * Comprehensive Item & Equipment Database
 * Equipment paperdoll slots: helmet, armor, boots, weapon, wings, ring, amulet, shield
 * Consumables: Potions, Elixirs, Buff Flasks, Resurrection Feathers.
 * Fully mapped to Kyrise's 16x16 / 32x32 Pixel-Art RPG Icons Pack & UI Sprites!
 * Built using the Weighted Drop Tables & Rarity Tiers pattern from SKILL.md.
 */

import {
  RARITY_ORDER,
  RARITY_WEIGHTS_BY_TIER,
  computeGearScore,
  weightedRarityRoll,
} from './darkrise/rarities';
import { rollAffixes } from './darkrise/affixes';
import { getDifficultyConfig } from '../dungeons/Difficulty';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythical';
export type ItemType = 'helmet' | 'armor' | 'boots' | 'weapon' | 'wings' | 'ring' | 'amulet' | 'shield' | 'consumable' | 'gem' | 'card' | 'material';

export interface ItemStats {
  hp?: number;
  mp?: number;
  atk?: number;
  def?: number;
  crit?: number; // 0.05 = +5%
  speed?: number;
}

/**
 * Rolled bonus stats (see darkrise/affixes). Part of the item once dropped, so
 * two drops of the same catalog entry are never quite equal - Darkrise's
 * "randomly generated stats".
 */
export interface ItemAffixData {
  id: string;
  label: string;
  stat: string;
  value: number;
}

export interface ItemData {
  id: string;
  name: string;
  type: ItemType;
  rarity: ItemRarity;
  icon: string;
  image: string;
  description: string;
  price: number;
  stats?: ItemStats;
  consumableEffect?: {
    type: 'heal_hp' | 'heal_mp' | 'buff_atk' | 'buff_speed' | 'revive';
    value: number;
    duration?: number;
  };
  /** Randomly rolled bonuses from the drop roll. */
  affixes?: ItemAffixData[];
  /** Socket array; null = empty slot, string = seated gem id. */
  sockets?: Array<string | null>;
  /** Slotted monster card id (darkrise/cards). */
  cardId?: string;
  /** Blacksmith enchant level, +8% item stats per level. */
  enchantLevel?: number;
  /** One-number upgrade check, recomputed on drop and on any change. */
  gearScore?: number;
}

export interface RarityConfig {
  name: string;
  color: string;
  bgColor: string;
  borderColor: string;
  glowColor: string;
  beamColor: string;
  textColor: string;
}

export const RARITY_CONFIGS: Record<ItemRarity, RarityConfig> = {
  common: {
    name: 'Common',
    color: '#94a3b8',
    bgColor: 'rgba(148, 163, 184, 0.15)',
    borderColor: '#64748b',
    glowColor: 'rgba(148, 163, 184, 0.4)',
    beamColor: 'rgba(203, 213, 225, 0.5)',
    textColor: '#f1f5f9'
  },
  uncommon: {
    name: 'Uncommon',
    color: '#4ade80',
    bgColor: 'rgba(74, 222, 128, 0.18)',
    borderColor: '#16a34a',
    glowColor: 'rgba(74, 222, 128, 0.5)',
    beamColor: 'rgba(134, 239, 172, 0.6)',
    textColor: '#dcfce7'
  },
  rare: {
    name: 'Rare',
    color: '#38bdf8',
    bgColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#0284c7',
    glowColor: 'rgba(56, 189, 248, 0.65)',
    beamColor: 'rgba(56, 189, 248, 0.75)',
    textColor: '#e0f2fe'
  },
  epic: {
    name: 'Epic',
    color: '#c084fc',
    bgColor: 'rgba(192, 132, 252, 0.25)',
    borderColor: '#9333ea',
    glowColor: 'rgba(192, 132, 252, 0.8)',
    beamColor: 'rgba(192, 132, 252, 0.85)',
    textColor: '#f3e8ff'
  },
  legendary: {
    name: 'Legendary',
    color: '#fbbf24',
    bgColor: 'rgba(251, 191, 36, 0.3)',
    borderColor: '#d97706',
    glowColor: 'rgba(251, 191, 36, 0.95)',
    beamColor: 'rgba(251, 191, 36, 0.9)',
    textColor: '#fef3c7'
  },
  mythical: {
    name: 'Mythical',
    color: '#22d3ee',
    bgColor: 'rgba(34, 211, 238, 0.3)',
    borderColor: '#0891b2',
    glowColor: 'rgba(34, 211, 238, 1)',
    beamColor: 'rgba(103, 232, 249, 0.95)',
    textColor: '#cffafe'
  }
};

export const ITEM_DATABASE: ItemData[] = [
  // --- WEAPONS ---
  {
    id: 'wep_excalibur',
    name: 'Excalibur Holy Blade',
    type: 'weapon',
    rarity: 'legendary',
    icon: 'Sword',
    image: '/assets/ui_sprites/icons/W_Sword015.png',
    description: 'A legendary divine blade forged in heavenly fires. Emits a glorious golden aura.',
    price: 1200,
    stats: { atk: 65, crit: 0.15, hp: 120 }
  },
  {
    id: 'wep_muramasa',
    name: 'Cursed Katana Muramasa',
    type: 'weapon',
    rarity: 'epic',
    icon: 'Katana',
    image: '/assets/rpg-icons/32x32/sword_01a.png',
    description: 'A blood-drinking ancient blade that thirsts for combat with extreme critical strikes.',
    price: 750,
    stats: { atk: 58, crit: 0.22, speed: 1.0 }
  },
  {
    id: 'wep_void_daggers',
    name: 'Twin Void Daggers',
    type: 'weapon',
    rarity: 'epic',
    icon: 'Dagger',
    image: '/assets/ui_sprites/icons/W_Dagger004.png',
    description: 'Daggers carved from shadow crystals. Slices the air with eerie silent lethality.',
    price: 650,
    stats: { atk: 48, crit: 0.25, speed: 1.2 }
  },
  {
    id: 'wep_phoenix_staff',
    name: 'Phoenix Flame Staff',
    type: 'weapon',
    rarity: 'epic',
    icon: 'Staff',
    image: '/assets/ui_sprites/icons/W_Staff03.png',
    description: 'Infused with the fiery spirit of an immortal phoenix. Enhances all magic potency.',
    price: 700,
    stats: { atk: 55, mp: 150, crit: 0.10 }
  },
  {
    id: 'wep_dragon_lance',
    name: 'Dragon King Greatlance',
    type: 'weapon',
    rarity: 'legendary',
    icon: 'Spear',
    image: '/assets/ui_sprites/icons/W_Spear002.png',
    description: 'An ancient draconian spear capable of piercing through mountains and dragons.',
    price: 1100,
    stats: { atk: 70, def: 20, hp: 100 }
  },
  {
    id: 'wep_artemis_bow',
    name: 'Artemis Celestial Bow',
    type: 'weapon',
    rarity: 'epic',
    icon: 'Bow',
    image: '/assets/rpg-icons/32x32/bow_03a.png',
    description: 'A sacred bow blessed by the goddess of the hunt. Never misses its prey.',
    price: 600,
    stats: { atk: 50, crit: 0.20, speed: 1.0 }
  },
  {
    id: 'wep_iron_sword',
    name: 'Iron Broadsword',
    type: 'weapon',
    rarity: 'common',
    icon: 'Sword',
    image: '/assets/rpg-icons/32x32/sword_03a.png',
    description: 'Standard reliable steel broadsword favored by town guardsmen.',
    price: 120,
    stats: { atk: 18 }
  },

  // --- HELMETS ---
  {
    id: 'helm_iron',
    name: 'Iron Knight Greathelm',
    type: 'helmet',
    rarity: 'common',
    icon: 'Helm',
    image: '/assets/rpg-icons/32x32/helmet_01a.png',
    description: 'Sturdy iron helmet providing standard skull protection.',
    price: 150,
    stats: { def: 12, hp: 40 }
  },
  {
    id: 'helm_shadow_cowl',
    name: 'Shadow Stalker Cowl',
    type: 'helmet',
    rarity: 'rare',
    icon: 'Hood',
    image: '/assets/rpg-icons/32x32/hat_01a.png',
    description: 'Enchanted dark cowl that obscures the wearers face in shadow.',
    price: 320,
    stats: { def: 18, crit: 0.08, speed: 0.5 }
  },
  {
    id: 'helm_archmage_cowl',
    name: 'Archmage Mystic Cowl',
    type: 'helmet',
    rarity: 'rare',
    icon: 'Hood',
    image: '/assets/rpg-icons/32x32/hat_01a.png',
    description: 'A velvet cowl saturated with primordial mana for arcane masters.',
    price: 360,
    stats: { def: 16, mp: 120, atk: 15 }
  },
  {
    id: 'helm_valkyrie_crown',
    name: 'Valkyrie Winged Crown',
    type: 'helmet',
    rarity: 'legendary',
    icon: 'Crown',
    image: '/assets/rpg-icons/32x32/helmet_02a.png',
    description: 'Radiant battle crown of the heavenly Valkyries. Immense power and defense.',
    price: 950,
    stats: { def: 35, hp: 160, atk: 25, mp: 80 }
  },

  // --- ARMOR ---
  {
    id: 'armor_plate',
    name: 'Heavy Steel Plate',
    type: 'armor',
    rarity: 'common',
    icon: 'Armor',
    image: '/assets/rpg-icons/32x32/armor_01a.png',
    description: 'Thick overlapping steel plates designed to deflect blade strikes.',
    price: 200,
    stats: { def: 20, hp: 80 }
  },
  {
    id: 'armor_paladin_chest',
    name: 'Paladin Radiant Cuirass',
    type: 'armor',
    rarity: 'rare',
    icon: 'Cuirass',
    image: '/assets/rpg-icons/32x32/armor_01a.png',
    description: 'Blessed breastplate inscribed with sacred protection runes.',
    price: 450,
    stats: { def: 32, hp: 140, mp: 40 }
  },
  {
    id: 'armor_dragon_mail',
    name: 'Dragon Scale Hauberk',
    type: 'armor',
    rarity: 'epic',
    icon: 'Scale',
    image: '/assets/rpg-icons/32x32/armor_01c.png',
    description: 'Armor forged from the Molten scales of an ancient red dragon. Highly heat resistant.',
    price: 800,
    stats: { def: 45, hp: 220, atk: 15 }
  },
  {
    id: 'armor_celestial_vestment',
    name: 'Celestial Robe of Eternity',
    type: 'armor',
    rarity: 'legendary',
    icon: 'Robe',
    image: '/assets/rpg-icons/32x32/armor_01e.png',
    description: 'Sacred vestment woven with starlight threads. Imbues bearer with immense arcane energy.',
    price: 1300,
    stats: { def: 38, mp: 250, hp: 180, atk: 30 }
  },

  // --- BOOTS ---
  {
    id: 'boots_leather',
    name: 'Reinforced Leather Boots',
    type: 'boots',
    rarity: 'common',
    icon: 'Boots',
    image: '/assets/ui_sprites/icons/A_Shoes03.png',
    description: 'Comfortable traveling boots with steel-toed caps.',
    price: 120,
    stats: { speed: 0.8, def: 8 }
  },
  {
    id: 'boots_windwalker',
    name: 'Windwalker Swift Treads',
    type: 'boots',
    rarity: 'rare',
    icon: 'Boots',
    image: '/assets/rpg-icons/32x32/boots_01c.png',
    description: 'Lightweight boots enchanted with gale currents. Greatly boosts dash and run speed.',
    price: 450,
    stats: { speed: 2.2, crit: 0.06 }
  },
  {
    id: 'boots_hermes',
    name: 'Hermes Winged Greaves',
    type: 'boots',
    rarity: 'legendary',
    icon: 'Greaves',
    image: '/assets/rpg-icons/32x32/boots_01e.png',
    description: 'Divine greaves carrying the blessing of the god of speed.',
    price: 900,
    stats: { speed: 3.5, def: 22, crit: 0.12 }
  },

  // --- WINGS ---
  {
    id: 'wings_angelic',
    name: 'Angelic Seraph Wings',
    type: 'wings',
    rarity: 'legendary',
    icon: 'Wings',
    image: '/assets/rpg-icons/32x32/crystal_01g.png',
    description: 'Glorious golden feather wings. Unlocks limitless aerial double-jumping and celestial glide.',
    price: 1500,
    stats: { speed: 2.0, hp: 150, mp: 100, def: 20 }
  },
  {
    id: 'wings_valkyrie',
    name: 'Valkyrie Feather Wings',
    type: 'wings',
    rarity: 'epic',
    icon: 'Wings',
    image: '/assets/rpg-icons/32x32/crystal_01g.png',
    description: 'Wings of sacred silver feathers that empower aerial double jumping.',
    price: 1200,
    stats: { speed: 1.8, atk: 25, hp: 120 }
  },
  {
    id: 'wings_demon',
    name: 'Abyssal Dragon Wings',
    type: 'wings',
    rarity: 'epic',
    icon: 'Wings',
    image: '/assets/rpg-icons/32x32/crystal_01d.png',
    description: 'Dark demonic wings of the nether realm. Grants aerial double-jump and ruthless attack power.',
    price: 1100,
    stats: { atk: 35, speed: 1.5, crit: 0.15 }
  },

  // --- RINGS ---
  {
    id: 'ring_ruby',
    name: 'Ruby Blood Ring',
    type: 'ring',
    rarity: 'rare',
    icon: 'Ring',
    image: '/assets/rpg-icons/32x32/ring_01a.png',
    description: 'Crimson gemstone ring that surges with vital bloodflow and raw attack.',
    price: 350,
    stats: { atk: 22, hp: 80 }
  },
  {
    id: 'ring_celestial_band',
    name: 'Celestial Starlight Band',
    type: 'ring',
    rarity: 'rare',
    icon: 'Ring',
    image: '/assets/rpg-icons/32x32/ring_02a.png',
    description: 'An ethereal band pulsing with starry equilibrium and spell crit.',
    price: 420,
    stats: { atk: 18, mp: 100, crit: 0.12 }
  },
  {
    id: 'ring_diamond',
    name: 'Omniscient Diamond Band',
    type: 'ring',
    rarity: 'legendary',
    icon: 'Ring',
    image: '/assets/rpg-icons/32x32/ring_03a.png',
    description: 'Flawless diamond ring radiating universal combat prowess.',
    price: 1000,
    stats: { atk: 30, def: 25, crit: 0.18, speed: 1.0 }
  },

  // --- AMULETS ---
  {
    id: 'amulet_star',
    name: 'Amulet of the Northern Star',
    type: 'amulet',
    rarity: 'rare',
    icon: 'Amulet',
    image: '/assets/rpg-icons/32x32/necklace_01a.png',
    description: 'Glowing silver pendant that replenishes magical energies.',
    price: 400,
    stats: { mp: 120, crit: 0.10 }
  },
  {
    id: 'amulet_dragons_heart',
    name: 'Dragon Heart Talisman',
    type: 'amulet',
    rarity: 'rare',
    icon: 'Talisman',
    image: '/assets/rpg-icons/32x32/necklace_01a.png',
    description: 'A crimson talisman pulsing with draconian vitality.',
    price: 450,
    stats: { hp: 160, atk: 20 }
  },
  {
    id: 'amulet_heart_of_titans',
    name: 'Heart of Titans Talisman',
    type: 'amulet',
    rarity: 'legendary',
    icon: 'Talisman',
    image: '/assets/rpg-icons/32x32/necklace_03a.png',
    description: 'Ancient titan relic providing titanic life force and damage reduction.',
    price: 1250,
    stats: { hp: 300, def: 35, atk: 20 }
  },

  // --- SHIELDS ---
  {
    id: 'shield_aegis',
    name: 'Divine Aegis Bulwark',
    type: 'shield',
    rarity: 'legendary',
    icon: 'Shield',
    image: '/assets/rpg-icons/32x32/shield_03a.png',
    description: 'Godly shield capable of absorbing and nullifying direct boss impacts.',
    price: 1100,
    stats: { def: 55, hp: 200 }
  },
  {
    id: 'shield_spiked',
    name: 'Spiked Barricade Shield',
    type: 'shield',
    rarity: 'rare',
    icon: 'Shield',
    image: '/assets/rpg-icons/32x32/shield_01a.png',
    description: 'Heavy oak shield with jagged steel spikes that reflect melee blows.',
    price: 380,
    stats: { def: 28, atk: 15 }
  },

  // --- CONSUMABLES ---
  {
    id: 'pot_hp_small',
    name: 'Small Health Potion',
    type: 'consumable',
    rarity: 'common',
    icon: 'Potion',
    image: '/assets/ui_sprites/icons/P_Green01.png',
    description: 'Restores 120 HP instantly when consumed.',
    price: 25,
    consumableEffect: { type: 'heal_hp', value: 120 }
  },
  {
    id: 'pot_hp_large',
    name: 'Large Health Potion',
    type: 'consumable',
    rarity: 'common',
    icon: 'Potion',
    image: '/assets/ui_sprites/icons/P_Green01.png',
    description: 'Restores 280 HP instantly when consumed.',
    price: 60,
    consumableEffect: { type: 'heal_hp', value: 280 }
  },
  {
    id: 'pot_hp_greater',
    name: 'Greater Health Potion',
    type: 'consumable',
    rarity: 'common',
    icon: 'Potion',
    image: '/assets/ui_sprites/icons/P_Green01.png',
    description: 'Restores 250 HP instantly when consumed.',
    price: 50,
    consumableEffect: { type: 'heal_hp', value: 250 }
  },
  {
    id: 'pot_mp_large',
    name: 'Large Mana Potion',
    type: 'consumable',
    rarity: 'common',
    icon: 'Potion',
    image: '/assets/rpg-icons/32x32/potion_02a.png',
    description: 'Restores 200 MP instantly when consumed.',
    price: 60,
    consumableEffect: { type: 'heal_mp', value: 200 }
  },
  {
    id: 'pot_mp_greater',
    name: 'Greater Mana Elixir',
    type: 'consumable',
    rarity: 'common',
    icon: 'Elixir',
    image: '/assets/rpg-icons/32x32/potion_02a.png',
    description: 'Restores 180 MP instantly when consumed.',
    price: 50,
    consumableEffect: { type: 'heal_mp', value: 180 }
  },
  {
    id: 'pot_elixir',
    name: 'Elixir of Full Restoration',
    type: 'consumable',
    rarity: 'rare',
    icon: 'Elixir',
    image: '/assets/rpg-icons/32x32/potion_01a.png',
    description: 'Fully restores 450 HP and 250 MP simultaneously.',
    price: 180,
    consumableEffect: { type: 'heal_hp', value: 450 }
  },
  {
    id: 'pot_atk_flask',
    name: 'Heroic Strength Flask',
    type: 'consumable',
    rarity: 'rare',
    icon: 'Flask',
    image: '/assets/ui_sprites/icons/P_Red01.png',
    description: 'Boosts ATK by 35% for 12 seconds.',
    price: 120,
    consumableEffect: { type: 'buff_atk', value: 1.35, duration: 12 }
  },
  {
    id: 'pot_fury_flask',
    name: 'Berserk Fury Flask',
    type: 'consumable',
    rarity: 'rare',
    icon: 'Flask',
    image: '/assets/ui_sprites/icons/P_Red01.png',
    description: 'Empowers bearer, boosting ATK by 40% for 15 seconds.',
    price: 150,
    consumableEffect: { type: 'buff_atk', value: 1.40, duration: 15 }
  },
  {
    id: 'pot_revive_feather',
    name: 'Phoenix Resurrection Feather',
    type: 'consumable',
    rarity: 'epic',
    icon: 'Feather',
    image: '/assets/rpg-icons/32x32/crystal_01j.png',
    description: 'Mystic phoenix plume that restores the bearer to life with 500 HP.',
    price: 300,
    consumableEffect: { type: 'revive', value: 500 }
  }
];

export type LootTier = 'boss' | 'mid' | 'low';

export interface WeightedDrop {
  item: ItemData | null;
  weight: number;
}

/**
 * Weighted Table Drop Roller (SKILL.md standard pattern)
 * Rolls one number across the accumulated weight sum.
 */
export function rollDrop(table: WeightedDrop[]): ItemData | null {
  const total = table.reduce((sum, d) => sum + d.weight, 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const drop of table) {
    if ((r -= drop.weight) <= 0) {
      return drop.item;
    }
  }
  return table[table.length - 1]?.item || null;
}

/**
 * Generates balanced weighted drop tables per tier with guaranteed totals.
 *
 * Darkrise-style drops: rarity comes from the tier table (extended to six
 * rarities and re-rolled upward on Hard/Fatal), then the item gets freshly
 * rolled affixes, a chance of open sockets, and a gear score. The catalog
 * entry itself is never mutated - every drop is a copy.
 */
export function getRandomLoot(tier: LootTier = 'mid'): ItemData {
  const base = weightedRarityRoll(RARITY_WEIGHTS_BY_TIER[tier]);

  // Hard/Fatal can promote a roll up the ladder. One roll per promotion step
  // keeps Fatal's mythical chance small but real.
  const config = getDifficultyConfig();
  let rarity = base;
  for (let i = 0; i < 2; i++) {
    if (rarity !== 'mythical' && Math.random() < config.lootUpgradeChance * 0.5) {
      const idx = RARITY_ORDER.indexOf(rarity);
      rarity = RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, idx + 1)];
    }
  }

  const pool = ITEM_DATABASE.filter(i => i.rarity === rarity && !['consumable', 'gem', 'card', 'material'].includes(i.type));
  if (!pool.length) return ITEM_DATABASE[0];
  const source = pool[Math.floor(Math.random() * pool.length)];

  const drop: ItemData = { ...source, stats: source.stats ? { ...source.stats } : undefined };
  drop.affixes = rollAffixes(rarity);
  if (drop.affixes.length === 0 && Math.random() < config.bonusAffixChance) {
    drop.affixes = rollAffixes('uncommon');
  }

  // Drops may arrive with carved sockets already in place - better rarities
  // come pre-slotted, like Darkrise's higher-tier gear.
  const socketChance = { common: 0, uncommon: 0.15, rare: 0.3, epic: 0.5, legendary: 0.7, mythical: 1 }[rarity];
  if (Math.random() < socketChance) {
    const count = rarity === 'mythical' ? 3 : rarity === 'legendary' ? 2 : 1;
    drop.sockets = Array(count).fill(null);
  }

  computeGearScore(drop);
  return drop;
}

