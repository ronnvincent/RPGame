/**
 * Set bonuses - Darkrise's Dragonslayer/Eruption model: wear enough pieces of
 * a matched set and threshold bonuses kick in on top of each piece's stats.
 *
 * Sets are tagged onto catalog items via `setId`, so any drop of that item
 * counts toward its set regardless of rolled affixes.
 */

import type { ItemStats } from '../ItemDatabase';

export interface SetThreshold {
  pieces: number;
  label: string;
  stats: ItemStats;
}

export interface SetDef {
  id: string;
  name: string;
  thresholds: SetThreshold[];
}

export const SET_DEFINITIONS: SetDef[] = [
  {
    id: 'set_dragon',
    name: 'Dragonblood',
    thresholds: [
      { pieces: 2, label: '+12% ATK', stats: { atk: 18 } },
      { pieces: 3, label: '+25% ATK, +40 HP', stats: { atk: 38, hp: 40 } },
    ],
  },
  {
    id: 'set_celestial',
    name: 'Celestial Choir',
    thresholds: [
      { pieces: 2, label: '+80 Energy Shield', stats: { energyShield: 80 } },
      {
        pieces: 3,
        label: '+150 Energy Shield, +15% Recharge',
        stats: { energyShield: 150, rechargeSpeed: 0.15 },
      },
      {
        pieces: 4,
        label: '+260 Energy Shield, +30% Recharge, +10% Crit',
        stats: { energyShield: 260, rechargeSpeed: 0.3, crit: 0.1 },
      },
    ],
  },
];

export function getSetById(id: string): SetDef | null {
  return SET_DEFINITIONS.find(s => s.id === id) || null;
}

/** Active bonuses for a count of equipped pieces of one set. */
export function activeSetBonuses(setId: string, pieceCount: number): SetThreshold[] {
  if (pieceCount < 2) return [];
  const def = getSetById(setId);
  if (!def) return [];
  return def.thresholds.filter(t => pieceCount >= t.pieces);
}

/** Summed set bonuses across every equipped piece. */
export function totalSetBonusStats(equippedSetIds: Array<string | undefined>): {
  stats: ItemStats;
  labels: string[];
} {
  const counts = new Map<string, number>();
  equippedSetIds.forEach(id => {
    if (!id) return;
    counts.set(id, (counts.get(id) || 0) + 1);
  });
  const stats: ItemStats = {};
  const labels: string[] = [];
  for (const [setId, count] of counts) {
    for (const bonus of activeSetBonuses(setId, count)) {
      (Object.keys(bonus.stats) as Array<keyof ItemStats>).forEach(key => {
        stats[key] = (stats[key] || 0) + (bonus.stats[key] || 0);
      });
      const def = getSetById(setId);
      labels.push(def ? `${def.name} (${count}): ${bonus.label}` : bonus.label);
    }
  }
  return { stats, labels };
}
