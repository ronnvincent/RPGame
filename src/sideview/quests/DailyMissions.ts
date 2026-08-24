/**
 * Daily & hourly missions - Darkrise's retention loop.
 *
 * The mayor's dailies pay Unification Stones; the hourly quest pays gold and a
 * Key of Power. Progress is tracked from gameplay events and claimed from an
 * NPC; resets are keyed to calendar day / hour in localStorage so they survive
 * reloads without a server round-trip.
 */

export interface MissionDef {
  id: string;
  title: string;
  description: string;
  /** 'daily' resets each calendar day, 'hourly' every hour. */
  cadence: 'daily' | 'hourly';
  goal: number;
  counter: MissionCounter;
  reward: {
    gold?: number;
    diamonds?: number;
    keysOfPower?: number;
    unificationStones?: number;
  };
}

export type MissionCounter = 'dungeons_cleared' | 'bosses_killed' | 'elites_killed' | 'enemies_killed';

export const MISSIONS: MissionDef[] = [
  {
    id: 'daily_clears',
    title: "Mayor's Daily: Clear the Wilds",
    description: 'Clear any dungeon 3 times.',
    cadence: 'daily',
    goal: 3,
    counter: 'dungeons_cleared',
    reward: { unificationStones: 2, gold: 400 },
  },
  {
    id: 'daily_bosses',
    title: "Mayor's Daily: Heads Will Roll",
    description: 'Defeat 2 bosses.',
    cadence: 'daily',
    goal: 2,
    counter: 'bosses_killed',
    reward: { unificationStones: 1, diamonds: 5 },
  },
  {
    id: 'hourly_hunt',
    title: 'Hourly Hunt',
    description: 'Slay 40 enemies.',
    cadence: 'hourly',
    goal: 40,
    counter: 'enemies_killed',
    reward: { gold: 250, keysOfPower: 1 },
  },
];

interface MissionProgress {
  [missionId: string]: { periodKey: string; progress: number; claimed: boolean };
}

const STORAGE_KEY = 'darkrise_missions_v1';

/** '2026-08-24' for dailies, '2026-08-24T14' for hourlies. */
function periodKey(cadence: 'daily' | 'hourly'): string {
  const now = new Date();
  if (cadence === 'daily') return now.toISOString().slice(0, 10);
  return `${now.toISOString().slice(0, 13)}`;
}

function loadProgress(): MissionProgress {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveProgress(progress: MissionProgress): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function entry(progress: MissionProgress, mission: MissionDef): { periodKey: string; progress: number; claimed: boolean } {
  const key = periodKey(mission.cadence);
  const existing = progress[mission.id];
  if (!existing || existing.periodKey !== key) {
    progress[mission.id] = { periodKey: key, progress: 0, claimed: false };
  }
  return progress[mission.id];
}

export function recordEvent(counter: MissionCounter, amount: number = 1): void {
  const progress = loadProgress();
  let dirty = false;
  for (const mission of MISSIONS) {
    if (mission.counter !== counter) continue;
    const state = entry(progress, mission);
    if (!state.claimed && state.progress < mission.goal) {
      state.progress = Math.min(mission.goal, state.progress + amount);
      dirty = true;
    }
  }
  if (dirty) saveProgress(progress);
}

export interface MissionView extends MissionDef {
  progress: number;
  complete: boolean;
  claimed: boolean;
}

export function getMissionViews(): MissionView[] {
  const progress = loadProgress();
  return MISSIONS.map(mission => {
    const state = entry(progress, mission);
    return {
      ...mission,
      progress: state.progress,
      complete: state.progress >= mission.goal,
      claimed: state.claimed,
    };
  });
}

/**
 * Claim a completed mission's reward. Returns the reward payload or null when
 * the mission is not finished or was already paid out.
 */
export function claimMission(missionId: string): MissionDef['reward'] | null {
  const mission = MISSIONS.find(m => m.id === missionId);
  if (!mission) return null;
  const progress = loadProgress();
  const state = entry(progress, mission);
  if (state.claimed || state.progress < mission.goal) return null;
  state.claimed = true;
  saveProgress(progress);
  return mission.reward;
}
