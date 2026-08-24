/**
 * Monster cards, modelled on Darkrise's card system: specific bosses drop their
 * own card, and a card slots into a *specific* gear piece for a persistent
 * bonus. One card per item; the boss cards are the backbone of endgame builds.
 */

import type { ItemData, ItemType } from '../ItemDatabase';

export interface MonsterCardDef {
  id: string;
  name: string;
  /** Which dungeon's boss drops it. */
  sourceDungeonId: string;
  bossName: string;
  /** The single slot this card fits - Darkrise cards are slot-locked. */
  allowedSlots: ItemType[];
  stats: NonNullable<ItemData['stats']>;
  lore: string;
}

export const MONSTER_CARDS: MonsterCardDef[] = [
  {
    id: 'card_grimjaw',
    name: 'Card of Grimjaw',
    sourceDungeonId: 'goblin_catacombs',
    bossName: 'Chief Warlord Grimjaw',
    allowedSlots: ['weapon'],
    stats: { atk: 12 },
    lore: 'The warlord\'s last swing, pressed into pasteboard.',
  },
  {
    id: 'card_broodmother',
    name: 'Card of the Broodmother',
    sourceDungeonId: 'venomous_swamp',
    bossName: 'Broodmother Queen',
    allowedSlots: ['helmet', 'armor'],
    stats: { hp: 60, def: 4 },
    lore: 'Her children still cling to it.',
  },
  {
    id: 'card_hadrik',
    name: 'Card of Hadrik',
    sourceDungeonId: 'sunlit_vale',
    bossName: 'Warband Chief Hadrik',
    allowedSlots: ['boots', 'ring'],
    stats: { speed: 6 },
    lore: 'Swift as a raid at dawn.',
  },
  {
    id: 'card_malakar',
    name: 'Card of Malakar',
    sourceDungeonId: 'undead_crypt',
    bossName: 'Arch-Lich Malakar',
    allowedSlots: ['amulet', 'helmet'],
    stats: { mp: 50, crit: 0.04 },
    lore: 'A lich condensed to one thin square.',
  },
  {
    id: 'card_behemoth',
    name: 'Card of the Behemoth',
    sourceDungeonId: 'twilight_peaks',
    bossName: 'Blood Moon Behemoth',
    allowedSlots: ['armor', 'shield'],
    stats: { hp: 110, def: 8 },
    lore: 'Heavy as the mountain it slept under.',
  },
  {
    id: 'card_greymane',
    name: 'Card of Greymane',
    sourceDungeonId: 'emerald_ridge',
    bossName: 'Alpha Greymane',
    allowedSlots: ['boots', 'ring'],
    stats: { crit: 0.06, speed: 3 },
    lore: 'The pack follows it still.',
  },
  {
    id: 'card_ignis',
    name: 'Card of Ignis',
    sourceDungeonId: 'dragon_lair',
    bossName: 'Ancient Red Dragon Ignis',
    allowedSlots: ['weapon', 'amulet'],
    stats: { atk: 26, crit: 0.05 },
    lore: 'Warm to the touch, forever.',
  },
  {
    id: 'card_leviathan',
    name: 'Card of the Leviathan',
    sourceDungeonId: 'sunken_abyss',
    bossName: 'Leviathan of the Deep',
    allowedSlots: ['armor', 'wings'],
    stats: { hp: 90, mp: 40 },
    lore: 'Drowned sailors swore the sea itself wore a crown.',
  },
  {
    id: 'card_forge_overlord',
    name: 'Card of the Forge Overlord',
    sourceDungeonId: 'gallet_depths',
    bossName: 'Gallet Forge Overlord',
    allowedSlots: ['weapon', 'shield'],
    stats: { atk: 18, def: 10 },
    lore: 'Stamped with the seal of the deep furnace.',
  },
  {
    id: 'card_mordred',
    name: 'Card of Mordred',
    sourceDungeonId: 'castle_approach',
    bossName: 'Castellan Mordred',
    allowedSlots: ['armor', 'shield'],
    stats: { def: 14, hp: 70 },
    lore: 'The gate opened; the castellan did not yield.',
  },
  {
    id: 'card_nightborne',
    name: 'Card of NightBorne',
    sourceDungeonId: 'void_nexus',
    bossName: 'NightBorne Void Overlord',
    allowedSlots: ['amulet', 'wings'],
    stats: { atk: 20, mp: 60, crit: 0.05 },
    lore: 'An eclipse folded until it fit in a pocket.',
  },
];

export function getCardById(id: string): MonsterCardDef | null {
  return MONSTER_CARDS.find(c => c.id === id) || null;
}

export function getCardForDungeon(dungeonId: string): MonsterCardDef | null {
  return MONSTER_CARDS.find(c => c.sourceDungeonId === dungeonId) || null;
}

export function cardFitsSlot(card: MonsterCardDef, slotType: ItemType): boolean {
  return card.allowedSlots.includes(slotType);
}

/** Chance a defeated boss drops its own card (Darkrise bosses are farmed for these). */
export const BOSS_CARD_DROP_CHANCE = 0.22;

export function makeCardItem(card: MonsterCardDef): ItemData {
  return {
    id: `item_${card.id}`,
    name: card.name,
    type: 'card',
    rarity: 'epic',
    icon: 'Card',
    image: '/assets/rpg-icons/32x32/scroll_01a.png',
    description: `${card.bossName}'s card. Fits: ${card.allowedSlots.join(', ')}. ${card.lore}`,
    price: 400,
    stats: { ...card.stats },
  };
}
