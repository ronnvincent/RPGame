/**
 * Pet/Companion system - core logic.
 *
 * Pure data + pure functions on purpose: no DOM, no engine imports, so the
 * whole thing is unit-testable and safe to persist as plain JSON inside the
 * existing save blob. Combat rendering and AI wiring live elsewhere; this file
 * answers every question ABOUT a pet: what it is, how it grows, when it
 * evolves, and what stats it contributes to its owner.
 */

export type PetRole = 'damage' | 'tank' | 'support';

export interface PetSpeciesDef {
  id: string;
  name: string;
  role: PetRole;
  /** Base stats at level 1. */
  base: { atk: number; def: number; hp: number };
  /** Growth per level, applied linearly. */
  growth: { atk: number; def: number; hp: number };
  /** Evolves into this species id at `evolveLevel`. */
  evolvesTo?: string;
  evolveLevel?: number;
  description: string;
}

export interface PetInstance {
  speciesId: string;
  nickname?: string;
  level: number;
  exp: number;
  /** Total kills while summoned - flavor plus a feed requirement. */
  kills: number;
}

/** XP to advance FROM the given level. Mild quadratic curve. */
export function petExpToNext(level: number): number {
  const safe = Math.max(1, Math.floor(level));
  return Math.round(40 * Math.pow(1.28, safe - 1));
}

export const PET_MAX_LEVEL = 60;

export function grantPetExp(pet: PetInstance, amount: number): { leveled: boolean; evolvedTo?: string } {
  let leveled = false;
  let evolvedTo: string | undefined;
  pet.exp += Math.max(0, Math.round(amount));
  while (pet.level < PET_MAX_LEVEL && pet.exp >= petExpToNext(pet.level)) {
    pet.exp -= petExpToNext(pet.level);
    pet.level++;
    leveled = true;
    const def = getSpecies(pet.speciesId);
    if (def?.evolvesTo && def.evolveLevel === pet.level) {
      pet.speciesId = def.evolvesTo;
      evolvedTo = def.evolvesTo;
    }
  }
  if (pet.level >= PET_MAX_LEVEL) pet.exp = 0;
  return { leveled, evolvedTo };
}

export interface PetStats {
  atk: number;
  def: number;
  hp: number;
  /** Fraction of the owner's damage added while summoned (support pets heal instead). */
  assistPercent: number;
}

export function petStats(species: PetSpeciesDef, level: number): PetStats {
  const lv = Math.max(1, Math.floor(level)) - 1;
  const roleAssist: Record<PetRole, number> = { damage: 0.12, tank: 0.05, support: 0.04 };
  return {
    atk: Math.round(species.base.atk + species.growth.atk * lv),
    def: Math.round(species.base.def + species.growth.def * lv),
    hp: Math.round(species.base.hp + species.growth.hp * lv),
    assistPercent: roleAssist[species.role],
  };
}

const SPECIES: PetSpeciesDef[] = [
  {
    id: 'wolf_cub',
    name: 'Wolf Cub',
    role: 'damage',
    base: { atk: 8, def: 3, hp: 40 },
    growth: { atk: 2.4, def: 0.8, hp: 9 },
    evolvesTo: 'dire_wolf',
    evolveLevel: 15,
    description: 'A runt that never stopped biting.',
  },
  {
    id: 'dire_wolf',
    name: 'Dire Wolf',
    role: 'damage',
    base: { atk: 26, def: 8, hp: 110 },
    growth: { atk: 3.6, def: 1.2, hp: 14 },
    description: 'The cub, all grown into teeth.',
  },
  {
    id: 'stone_golem_shard',
    name: 'Golem Shard',
    role: 'tank',
    base: { atk: 4, def: 10, hp: 90 },
    growth: { atk: 1.1, def: 2.6, hp: 18 },
    evolvesTo: 'obsidian_golem',
    evolveLevel: 20,
    description: 'A piece of Gallet\'s forge that learned to walk.',
  },
  {
    id: 'obsidian_golem',
    name: 'Obsidian Golem',
    role: 'tank',
    base: { atk: 12, def: 30, hp: 240 },
    growth: { atk: 1.8, def: 3.4, hp: 26 },
    description: 'Forge-glass armor with a heartbeat.',
  },
  {
    id: 'fairy_wisp',
    name: 'Fairy Wisp',
    role: 'support',
    base: { atk: 5, def: 5, hp: 50 },
    growth: { atk: 1.4, def: 1.4, hp: 11 },
    evolvesTo: 'ember_sylph',
    evolveLevel: 18,
    description: 'Drawn to heroes by the smell of courage.',
  },
  {
    id: 'ember_sylph',
    name: 'Ember Sylph',
    role: 'support',
    base: { atk: 14, def: 12, hp: 120 },
    growth: { atk: 2.2, def: 2.0, hp: 16 },
    description: 'Its touch closes wounds and starts fires.',
  },
];

export function getSpecies(id: string): PetSpeciesDef | null {
  return SPECIES.find(s => s.id === id) || null;
}

/** All species, for the adoption UI. */
export function getAllSpecies(): PetSpeciesDef[] {
  return SPECIES;
}
