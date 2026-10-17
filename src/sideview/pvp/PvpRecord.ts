/**
 * A player's Colosseum record and the spoils of a match.
 *
 * Until now a match ended in a flat pile of gold that vanished from the screen
 * the moment the arena closed, and nothing anywhere remembered that you had
 * won it. This keeps a small, local record - wins, losses, streaks, MVPs - and
 * turns a finished match into an itemised reward the results card can show and
 * the player can believe.
 *
 * Deliberately local: no account, no server round-trip, no new database
 * column before an exhibition. The shape is plain data so it can be synced
 * later without touching the callers.
 */
import type { PvpMatchSummary, TournamentFormat } from './TournamentSystem';

const STORAGE_KEY = 'rpg-pvp-record-v1';

export interface PvpRecord {
  matches: number;
  wins: number;
  losses: number;
  roundsWon: number;
  roundsLost: number;
  winStreak: number;
  bestStreak: number;
  mvps: number;
  suddenDeathWins: number;
  /** Local calendar day (YYYY-MM-DD) of the last victory, for the daily bonus. */
  lastWinDay: string;
  goldEarned: number;
}

export interface PvpRewardBreakdown {
  base: number;
  rounds: number;
  mvp: number;
  streak: number;
  firstWin: number;
  total: number;
}

export interface PvpSettlement {
  record: PvpRecord;
  rewards: PvpRewardBreakdown;
  title: string;
  /** Set when this match promoted the player to a new title. */
  newTitle: string | null;
}

export function defaultPvpRecord(): PvpRecord {
  return {
    matches: 0,
    wins: 0,
    losses: 0,
    roundsWon: 0,
    roundsLost: 0,
    winStreak: 0,
    bestStreak: 0,
    mvps: 0,
    suddenDeathWins: 0,
    lastWinDay: '',
    goldEarned: 0,
  };
}

/** Accepts a save blob, a localStorage blob or junk and always returns a record. */
export function coercePvpRecord(raw: unknown): PvpRecord {
  const base = defaultPvpRecord();
  if (!raw || typeof raw !== 'object') return base;
  const parsed = raw as Partial<PvpRecord>;
  return {
    matches: coerceCount(parsed.matches),
    wins: coerceCount(parsed.wins),
    losses: coerceCount(parsed.losses),
    roundsWon: coerceCount(parsed.roundsWon),
    roundsLost: coerceCount(parsed.roundsLost),
    winStreak: coerceCount(parsed.winStreak),
    bestStreak: coerceCount(parsed.bestStreak),
    mvps: coerceCount(parsed.mvps),
    suddenDeathWins: coerceCount(parsed.suddenDeathWins),
    lastWinDay: typeof parsed.lastWinDay === 'string' ? parsed.lastWinDay.slice(0, 10) : '',
    goldEarned: coerceCount(parsed.goldEarned),
  };
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function coerceCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function loadPvpRecord(): PvpRecord {
  const base = defaultPvpRecord();
  const storage = safeStorage();
  if (!storage) return base;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return base;
    return coercePvpRecord(JSON.parse(raw));
  } catch {
    return base;
  }
}

export function savePvpRecord(record: PvpRecord): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // A full quota or a locked-down browser must never break the results card.
  }
}

/**
 * Fold two copies of a career together, keeping the better of each counter.
 *
 * The record is written on every match but the cloud save is written whenever
 * the game saves, so the two can be a few bouts apart. Taking the cloud copy
 * blindly rolled a fresh win back; taking the local copy blindly lost the wins
 * from another device. Counters never legitimately decrease, so the maximum is
 * the honest answer for both.
 */
export function mergePvpRecords(a: PvpRecord, b: PvpRecord): PvpRecord {
  const latestDay = [a.lastWinDay, b.lastWinDay].sort().pop() || '';
  return {
    matches: Math.max(a.matches, b.matches),
    wins: Math.max(a.wins, b.wins),
    losses: Math.max(a.losses, b.losses),
    roundsWon: Math.max(a.roundsWon, b.roundsWon),
    roundsLost: Math.max(a.roundsLost, b.roundsLost),
    winStreak: Math.max(a.winStreak, b.winStreak),
    bestStreak: Math.max(a.bestStreak, b.bestStreak),
    mvps: Math.max(a.mvps, b.mvps),
    suddenDeathWins: Math.max(a.suddenDeathWins, b.suddenDeathWins),
    lastWinDay: latestDay,
    goldEarned: Math.max(a.goldEarned, b.goldEarned),
  };
}

/**
 * A single number for "how good is this career".
 *
 * Deliberately derived from the same rows the card already shows rather than
 * from hidden opponent ratings: the player must be able to check it. Wins are
 * worth more than losses cost, and the best streak rewards consistency. The
 * server board ranks wins, so this figure is a profile flourish, not a second
 * ranking nobody can audit.
 */
export function pvpRating(record: PvpRecord): number {
  const base = 1000 + record.wins * 28 - record.losses * 12 + record.bestStreak * 15;
  return Math.max(100, Math.round(base));
}

export function pvpWinRate(record: PvpRecord): number {
  if (record.matches <= 0) return 0;
  return record.wins / record.matches;
}

/**
 * Titles are ordered strongest-first; the first one the record qualifies for
 * wins. They are cosmetic-only and derived, so a lost save degrades to
 * "Challenger" rather than an error.
 */
export function pvpTitleFor(record: PvpRecord): string {
  if (record.wins >= 50) return 'Arena Legend';
  if (record.bestStreak >= 10) return 'The Unbroken';
  if (record.matches >= 20 && pvpWinRate(record) >= 0.6) return 'Colosseum Champion';
  if (record.mvps >= 10) return 'Crowd Favorite';
  if (record.mvps >= 3) return 'Arena Darling';
  if (record.wins >= 5) return 'Arena Veteran';
  if (record.wins >= 1) return 'Gladiator';
  return 'Challenger';
}

/**
 * The title ladder, weakest first, with the requirement printed next to it.
 *
 * `pvpTitleFor` answers "what is this player called"; this answers "how far
 * along the ladder are they", which is what a career page needs. The two share
 * the same thresholds by construction: each tier's `earned` is the condition
 * the name function tests.
 */
export interface PvpTitleTier {
  title: string;
  requirement: string;
  earned: boolean;
  /** 0..1 toward this tier's own requirement. */
  progress: number;
}

function ratio(value: number, target: number): number {
  if (target <= 0) return 1;
  return Math.max(0, Math.min(1, value / target));
}

export function pvpTitleTiers(record: PvpRecord): PvpTitleTier[] {
  const winRate = pvpWinRate(record);
  const championProgress = Math.min(ratio(record.matches, 20), ratio(winRate, 0.6));
  return [
    { title: 'Challenger', requirement: 'Step into the arena', earned: true, progress: 1 },
    {
      title: 'Gladiator',
      requirement: 'Win 1 bout',
      earned: record.wins >= 1,
      progress: ratio(record.wins, 1),
    },
    {
      title: 'Arena Veteran',
      requirement: 'Win 5 bouts',
      earned: record.wins >= 5,
      progress: ratio(record.wins, 5),
    },
    {
      title: 'Arena Darling',
      requirement: 'Earn 3 MVPs',
      earned: record.mvps >= 3,
      progress: ratio(record.mvps, 3),
    },
    {
      title: 'Crowd Favorite',
      requirement: 'Earn 10 MVPs',
      earned: record.mvps >= 10,
      progress: ratio(record.mvps, 10),
    },
    {
      title: 'Colosseum Champion',
      requirement: '20 bouts at a 60% win rate',
      earned: record.matches >= 20 && winRate >= 0.6,
      progress: championProgress,
    },
    {
      title: 'The Unbroken',
      requirement: 'Win 10 in a row',
      earned: record.bestStreak >= 10,
      progress: ratio(record.bestStreak, 10),
    },
    {
      title: 'Arena Legend',
      requirement: 'Win 50 bouts',
      earned: record.wins >= 50,
      progress: ratio(record.wins, 50),
    },
  ];
}

function localDayKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Every figure the purse is built from, in one place.
 *
 * The career panel prints these numbers and `settlePvpMatch` spends them; a
 * single table means the rules on screen cannot drift from the rules that pay.
 */
export const PVP_REWARDS = {
  winByFormat: { '1v1': 1000, '2v2': 2000, '3v3': 3000, '4v4': 4000 },
  loss: 250,
  perRound: 300,
  mvp: 400,
  streakStep: 150,
  /** Streak pay stops counting after this many consecutive wins. */
  streakCap: 5,
  firstWinOfDay: 500,
} as const;

function baseWinGold(format: TournamentFormat): number {
  if (format === '1v1') return PVP_REWARDS.winByFormat['1v1'];
  if (format === '2v2') return PVP_REWARDS.winByFormat['2v2'];
  if (format === '3v3') return PVP_REWARDS.winByFormat['3v3'];
  return PVP_REWARDS.winByFormat['4v4'];
}

/**
 * Fold a finished match into the record and compute the reward.
 *
 * Pure apart from the clock: pass `now` to make a test deterministic. The
 * caller is responsible for adding `rewards.total` to the player's gold and
 * calling `savePvpRecord(result.record)`.
 */
export function settlePvpMatch(
  previous: PvpRecord,
  summary: PvpMatchSummary,
  now: Date = new Date(),
): PvpSettlement {
  const record: PvpRecord = { ...previous };
  const localRow = summary.rows.find(row => row.isLocal) || null;
  const localWon = summary.localWon;
  const today = localDayKey(now);

  // A draw has no winner: it counts as a match, breaks neither streak, and
  // pays the consolation purse so a stalemate is not a waste of three minutes.
  const isDraw = summary.winningTeam === null;

  record.matches += 1;
  if (localWon) {
    record.wins += 1;
    record.winStreak += 1;
    record.bestStreak = Math.max(record.bestStreak, record.winStreak);
  } else if (!isDraw) {
    record.losses += 1;
    record.winStreak = 0;
  }

  const wonRounds = summary.winningTeam === 'red'
    ? summary.redScore
    : summary.winningTeam === 'blue'
      ? summary.blueScore
      : 0;
  const lostRounds = summary.winningTeam === 'red'
    ? summary.blueScore
    : summary.winningTeam === 'blue'
      ? summary.redScore
      : 0;
  record.roundsWon += localWon ? wonRounds : lostRounds;
  record.roundsLost += localWon ? lostRounds : wonRounds;

  const localIsMvp = Boolean(summary.mvp && localRow && summary.mvp.id === localRow.id);
  if (localIsMvp && localWon) record.mvps += 1;
  if (localWon && summary.suddenDeathRounds > 0) record.suddenDeathWins += 1;

  const rewards: PvpRewardBreakdown = {
    base: localWon ? baseWinGold(summary.format) : PVP_REWARDS.loss,
    rounds: (summary.winningTeam
      ? (localWon ? wonRounds : lostRounds)
      : 0) * PVP_REWARDS.perRound,
    // The card can crown a standout from the losing side, but the purse only
    // pays for a winning performance - otherwise a stomp still hands the
    // defeated team's best player a bonus.
    mvp: localIsMvp && localWon ? PVP_REWARDS.mvp : 0,
    streak: localWon ? Math.min(record.winStreak, PVP_REWARDS.streakCap) * PVP_REWARDS.streakStep : 0,
    firstWin: localWon && record.lastWinDay !== today ? PVP_REWARDS.firstWinOfDay : 0,
    total: 0,
  };
  rewards.total = rewards.base + rewards.rounds + rewards.mvp + rewards.streak + rewards.firstWin;

  if (localWon) record.lastWinDay = today;
  record.goldEarned += rewards.total;

  const titleBefore = pvpTitleFor(previous);
  const title = pvpTitleFor(record);
  const newTitle = title !== titleBefore ? title : null;

  return { record, rewards, title, newTitle };
}

/** One-line record summary for a lobby or the results card. */
export function describePvpRecord(record: PvpRecord): string {
  const rate = record.matches > 0 ? Math.round(pvpWinRate(record) * 100) : 0;
  const streak = record.winStreak > 0 ? ` · ${record.winStreak} win${record.winStreak === 1 ? '' : 's'} in a row` : '';
  return `${record.wins}W - ${record.losses}L · ${rate}%${streak}`;
}
