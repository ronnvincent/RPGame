/**
 * Comprehensive Item & Equipment Database (20+ Items)
 * Equipment paperdoll slots: helmet, armor, boots, weapon, wings, ring, amulet, shield
 * Consumables: Potions, Elixirs, Buff Flasks, Resurrection Feathers.
 * Fully mapped to Kyrise's 16x16 / 32x32 Pixel-Art RPG Icons Pack!
 */

export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type ItemType = 'helmet' | 'armor' | 'boots' | 'weapon' | 'wings' | 'ring' | 'amulet' | 'shield' | 'consumable';

export interface ItemStats {
  hp?: number;
  mp?: number;
  atk?: number;
  def?: number;
  crit?: number; // 0.05 = +5%
  speed?: number;
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
}

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
    id: 'pot_fury_flask',
    name: 'Berserk Fury Flask',
    type: 'consumable',
    rarity: 'rare',
    icon: 'Flask',
    image: '/assets/ui_sprites/icons/P_Red01.png',
    description: 'Empowers bearer, boosting ATK by 40% for 15 seconds.',
    price: 150,
    consumableEffect: { type: 'buff_atk', value: 1.40, duration: 15 }
  }
];

export type LootTier = 'boss' | 'mid' | 'low';

export function getRandomLoot(tier: LootTier = 'mid'): ItemData {
  const roll = Math.random();
  let pool: ItemData[] = [];

  if (tier === 'boss') {
    if (roll < 0.20) {
      pool = ITEM_DATABASE.filter(i => i.rarity === 'legendary');
    } else if (roll < 0.55) {
      pool = ITEM_DATABASE.filter(i => i.rarity === 'epic');
    } else if (roll < 0.85) {
      pool = ITEM_DATABASE.filter(i => i.rarity === 'rare');
    } else {
      pool = ITEM_DATABASE.filter(i => i.rarity === 'common');
    }
  } else if (tier === 'mid') {
    if (roll < 0.06) {
      pool = ITEM_DATABASE.filter(i => i.rarity === 'legendary');
    } else if (roll < 0.22) {
      pool = ITEM_DATABASE.filter(i => i.rarity === 'epic');
    } else if (roll < 0.60) {
      pool = ITEM_DATABASE.filter(i => i.rarity === 'rare');
    } else {
      pool = ITEM_DATABASE.filter(i => i.rarity === 'common');
    }
  } else {
    if (roll < 0.02) {
      pool = ITEM_DATABASE.filter(i => i.rarity === 'legendary');
    } else if (roll < 0.12) {
      pool = ITEM_DATABASE.filter(i => i.rarity === 'epic');
    } else if (roll < 0.45) {
      pool = ITEM_DATABASE.filter(i => i.rarity === 'rare');
    } else {
      pool = ITEM_DATABASE.filter(i => i.rarity === 'common');
    }
  }
  return pool[Math.floor(Math.random() * pool.length)] || ITEM_DATABASE[0];
}
