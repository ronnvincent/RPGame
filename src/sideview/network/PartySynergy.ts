import { CHARACTER_CLASSES } from '../classes/ClassDefinitions';
import type { LobbyMember } from './NetworkManager';

/**
 * What your party composition is worth.
 *
 * The lobby was a waiting room: pick a dungeon, press ready, leave. Nothing
 * about who you brought mattered, so there was nothing to discuss and no
 * reason to swap. These are small, readable bonuses that give the slots a
 * consequence.
 */
export interface SynergyBonus {
  id: string;
  label: string;
  detail: string;
  /** Multipliers applied to the run. 1 means no change. */
  atk: number;
  def: number;
  exp: number;
}

export const NO_SYNERGY: SynergyBonus = {
  id: 'none',
  label: 'NO BONUS',
  detail: 'A larger, more varied party earns more',
  atk: 1, def: 1, exp: 1,
};

const roleOf = (classId?: string | null): string => {
  const cls = CHARACTER_CLASSES.find(c => c.id === classId);
  return cls?.role || '';
};

/**
 * Read in order, best first: a party that qualifies for several gets the
 * strongest one rather than a stack, so the number on the banner is the number
 * that applies.
 */
export function synergyFor(members: Pick<LobbyMember, 'classId'>[]): SynergyBonus {
  const present = members.filter(m => m.classId);
  if (present.length < 2) return NO_SYNERGY;

  const roles = new Set(present.map(m => roleOf(m.classId)).filter(Boolean));
  const hasSupport = present.some(m => /support|healer/i.test(roleOf(m.classId)));

  if (roles.size >= 3 && hasSupport) {
    return {
      id: 'balanced',
      label: 'BALANCED PARTY',
      detail: 'Three roles and a healer',
      atk: 1.08, def: 1.08, exp: 1.10,
    };
  }
  if (roles.size >= 3) {
    return {
      id: 'varied',
      label: 'VARIED PARTY',
      detail: 'Three different roles',
      atk: 1.05, def: 1.05, exp: 1.05,
    };
  }
  if (hasSupport) {
    return {
      id: 'supported',
      label: 'SUPPORTED',
      detail: 'A healer is with you',
      atk: 1, def: 1.10, exp: 1,
    };
  }
  if (roles.size === 1 && present.length >= 3) {
    return {
      id: 'warband',
      label: 'WARBAND',
      detail: 'Three of a kind - all offence, no cover',
      atk: 1.12, def: 0.95, exp: 1,
    };
  }
  return NO_SYNERGY;
}
