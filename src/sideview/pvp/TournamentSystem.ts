/**
 * Tournament Mode & PvP Balancing Engine
 *
 * Implements 1v1, 2v2, 3v3, and 4v4 competitive combat with strict Action RPG
 * balance guidelines:
 * - Stat normalization (standardized HP brackets, TTK ~20-30s)
 * - Global PvP damage dampening (0.22 multiplier against 1-shot burst)
 * - Anti-Burst reactive window (30% DR upon taking >35% HP in 1.5s)
 * - Crowd Control (CC) diminishing returns with 3s immunity trigger
 * - Sustain / healing dampening (40% cut)
 * - Crit damage ceiling capped at 135%
 * - Symmetrical arena platform geometry & tight grounding
 */

/**
 * Length of a single Colosseum round, in seconds.
 *
 * 90s ended most rounds on the clock rather than on a kill - a dampened
 * damage multiplier means a full HP bar takes a while to strip, so the
 * players spent the last third of every round racing a timer they could not
 * beat. Three minutes gives a duel room to breathe and lets a round end the
 * way it should: with someone down.
 */
export const PVP_ROUND_DURATION_SEC = 180;

/**
 * Overtime.
 *
 * A round that expires with both teams on the same total health percentage used
 * to settle as a draw, which is the least satisfying result a duel can produce -
 * and in a best-of-three it can happen twice. Instead the round continues for a
 * short sudden-death window with damage dialled up, so the deadlock resolves
 * into a kill. If the window runs out too, the team that did more damage in the
 * round takes it, and only a genuinely identical round is a draw.
 */
export const PVP_SUDDEN_DEATH_SEC = 30;
export const PVP_SUDDEN_DEATH_DAMAGE_MULTIPLIER = 1.7;
/** Health percentages within this margin count as tied. */
export const PVP_SUDDEN_DEATH_TIE_MARGIN = 0.5;

export const PVP_ROUNDS_TO_WIN = 2;

/**
 * How long a round must be live before a team wipe can settle it.
 *
 * A client used to re-run its round-end check on the first frame of the new
 * round, while the enemy's "downed" flag from the previous round was still in
 * the movement cache. Two rounds were awarded in the same instant and a
 * best-of-three showed its victory card after the first kill. A short floor
 * gives the round-start reset a chance to reach every client first.
 */
export const PVP_WIPE_GRACE_SEC = 0.75;

/** The winner of a wipe, or null while both teams still have someone up. */
export function pvpWipeWinner(
  fighters: ReadonlyArray<{ team: 'red' | 'blue'; isAlive: boolean }>,
): 'red' | 'blue' | 'draw' | null {
  const hasRed = fighters.some(f => f.team === 'red');
  const hasBlue = fighters.some(f => f.team === 'blue');
  if (!hasRed || !hasBlue) return null;
  const redAlive = fighters.some(f => f.team === 'red' && f.isAlive);
  const blueAlive = fighters.some(f => f.team === 'blue' && f.isAlive);
  if (redAlive && blueAlive) return null;
  if (!redAlive && !blueAlive) return 'draw';
  return redAlive ? 'red' : 'blue';
}

/**
 * Put every remote fighter back on their feet for a new round.
 *
 * The match record resets itself, but the render cache did not: a fighter who
 * died in round one stayed `downed` in `network.remotePlayers`, and the first
 * alive-sync of round two copied that corpse straight back into the match.
 * Bots were reset by the practice loop; real opponents were not.
 */
export function resetRemoteCombatants(
  remotes: Record<string, {
    downed?: boolean;
    hpPct?: number;
    isAttacking?: boolean;
    animState?: string;
    isTownMode?: boolean;
  } | undefined>,
): void {
  for (const remote of Object.values(remotes)) {
    if (!remote || remote.isTownMode) continue;
    remote.downed = false;
    remote.hpPct = 100;
    remote.isAttacking = false;
    if (remote.animState === 'dead') remote.animState = 'idle';
  }
}

export type TournamentFormat = '1v1' | '2v2' | '3v3' | '4v4';
export type TournamentTeam = 'red' | 'blue';
export type TournamentStatus = 'idle' | 'countdown' | 'active' | 'round_end' | 'match_end';

export interface TournamentMatchConfig {
  format: TournamentFormat;
  roundsToWin: number;
  roundDurationSec: number;
  mapTheme: string;
}

export interface TournamentFighter {
  id: string;
  name: string;
  team: TournamentTeam;
  isLocal: boolean;
  isBot: boolean;
  className: string;
  maxHp: number;
  currentHp: number;
  kills: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
  isAlive: boolean;
  x: number;
  y: number;
  antiBurstUntil: number;
  recentDamageTaken: { amount: number; time: number }[];
  ccCount: number;
  lastCcTime: number;
  ccImmunityUntil: number;
}

export interface TournamentRoundRecord {
  roundNumber: number;
  winner: TournamentTeam | 'draw';
  reason: 'wipe' | 'health_lead' | 'sudden_death';
  redScore: number;
  blueScore: number;
}

export const TOURNAMENT_FORMAT_TEAM_SIZES: Record<TournamentFormat, number> = {
  '1v1': 1,
  '2v2': 2,
  '3v3': 3,
  '4v4': 4,
};

/**
 * Normalized base HP brackets by class archetype to guarantee fair TTK (~20-30s).
 */
export function getNormalizedPvpBaseHp(className: string): number {
  const normalized = (className || '').toLowerCase();
  if (['knight', 'heroknight', 'paladin', 'dark knight', 'guardian'].some(s => normalized.includes(s))) {
    return 1800; // Heavy armored frontliner
  }
  if (['warrior', 'martial', 'martial hero', 'nightborne', 'berserker'].some(s => normalized.includes(s))) {
    return 1550; // Medium skirmisher
  }
  // Light archetype: rogue, wizard, mage, priestess, huntress
  return 1350;
}

/** Global damage multiplier applied to all skills & attacks against player targets in PvP */
export const PVP_DAMAGE_MULTIPLIER = 0.22;

/** Sustain dampener (heals and shield absorptions are 40% less effective in PvP) */
export const PVP_HEALING_MULTIPLIER = 0.60;

/** PvP Critical Hit Damage Ceiling (normal PvE can be 200%+, PvP is capped at 135%) */
export const PVP_MAX_CRIT_MULTIPLIER = 1.35;

/** Max duration of any individual stun / freeze crowd control in PvP */
export const PVP_MAX_CC_DURATION_SEC = 1.0;

/** Time window within which consecutive CC triggers diminishing returns */
export const PVP_CC_DIMINISHING_WINDOW_MS = 6000;

/** Anti-burst threshold: % of max HP taken within window to trigger emergency damage resistance */
export const PVP_ANTI_BURST_THRESHOLD = 0.35;
export const PVP_ANTI_BURST_WINDOW_MS = 1500;
export const PVP_ANTI_BURST_DURATION_MS = 2500;
export const PVP_ANTI_BURST_DAMAGE_REDUCTION = 0.30;

export interface PvpDamageCalculationResult {
  finalDamage: number;
  isCrit: boolean;
  wasMitigated: boolean;
  triggeredAntiBurst: boolean;
  wasShielded: boolean;
}

/**
 * Evaluates PvP damage with anti-burst protection, global dampener, and crit ceiling.
 */
export function calculatePvpDamage(
  rawDamage: number,
  isCrit: boolean,
  target: TournamentFighter,
  nowMs: number = Date.now()
): PvpDamageCalculationResult {
  let damage = rawDamage * PVP_DAMAGE_MULTIPLIER;

  if (isCrit) {
    damage = Math.min(damage * 1.5, rawDamage * PVP_DAMAGE_MULTIPLIER * PVP_MAX_CRIT_MULTIPLIER);
  }

  // Clean old entries from recent damage window
  target.recentDamageTaken = (target.recentDamageTaken || []).filter(entry => nowMs - entry.time <= PVP_ANTI_BURST_WINDOW_MS);

  // Check if anti-burst is already active
  let wasMitigated = false;
  if (nowMs < target.antiBurstUntil) {
    damage *= (1 - PVP_ANTI_BURST_DAMAGE_REDUCTION);
    wasMitigated = true;
  }

  damage = Math.max(1, Math.round(damage));
  target.recentDamageTaken.push({ amount: damage, time: nowMs });

  // Check if total damage taken in the recent window exceeds threshold
  const totalRecent = target.recentDamageTaken.reduce((sum, entry) => sum + entry.amount, 0);
  let triggeredAntiBurst = false;
  if (totalRecent >= target.maxHp * PVP_ANTI_BURST_THRESHOLD && nowMs >= target.antiBurstUntil) {
    target.antiBurstUntil = nowMs + PVP_ANTI_BURST_DURATION_MS;
    triggeredAntiBurst = true;
  }

  return {
    finalDamage: damage,
    isCrit,
    wasMitigated,
    triggeredAntiBurst,
    wasShielded: false,
  };
}

/**
 * Applies Diminishing Returns and CC immunity to prevent infinite stun locks.
 */
export function applyPvpCrowdControl(
  requestedDurationSec: number,
  target: TournamentFighter,
  nowMs: number = Date.now()
): { allowedDurationSec: number; isImmune: boolean } {
  // If under CC immunity window, reject entirely
  if (nowMs < target.ccImmunityUntil) {
    return { allowedDurationSec: 0, isImmune: true };
  }

  // Reset CC counter if last CC was outside diminishing window
  if (nowMs - target.lastCcTime > PVP_CC_DIMINISHING_WINDOW_MS) {
    target.ccCount = 0;
  }

  target.lastCcTime = nowMs;
  target.ccCount++;

  let allowedDuration = Math.min(requestedDurationSec, PVP_MAX_CC_DURATION_SEC);

  if (target.ccCount === 2) {
    // 2nd CC: 50% reduced duration
    allowedDuration *= 0.5;
  } else if (target.ccCount >= 3) {
    // 3rd CC: Grant 3.0s total CC immunity immediately
    target.ccImmunityUntil = nowMs + 3000;
    target.ccCount = 0;
    return { allowedDurationSec: 0, isImmune: true };
  }

  return { allowedDurationSec: Math.max(0.2, allowedDuration), isImmune: false };
}

/**
 * Tournament match manager tracking teams, round clock, scoring, and win conditions.
 */
export class TournamentMatch {
  public config: TournamentMatchConfig;
  public status: TournamentStatus = 'idle';
  public fighters: TournamentFighter[] = [];
  public currentRound: number = 1;
  public redScore: number = 0;
  public blueScore: number = 0;
  public roundTimeRemaining: number = PVP_ROUND_DURATION_SEC;
  /** Seconds the current round has actually been live (not counting). */
  public roundActiveSeconds: number = 0;
  public countdownRemaining: number = 3;
  /** True while the round is in its overtime window. */
  public suddenDeath: boolean = false;
  public suddenDeathRemaining: number = 0;
  /** Damage each team dealt this round, used as the overtime tiebreak. */
  public roundTeamDamage: { red: number; blue: number } = { red: 0, blue: 0 };
  public roundHistory: TournamentRoundRecord[] = [];
  public matchWinner: TournamentTeam | null = null;
  public bannerText: string = '';
  public bannerSubtext: string = '';
  public bannerTimer: number = 0;
  /**
   * Called once per settled round, before any match-end decision. The host
   * mirrors these results to the server so both clients score from the same
   * board, and so a round that ends on the clock is recorded too.
   */
  public onRoundResolved?: (record: TournamentRoundRecord) => void;

  /** The fighter who contributed most this match: kills first, then damage. */
  public get mvp(): TournamentFighter | null {
    if (!this.fighters.length) return null;
    return [...this.fighters].sort((a, b) => (
      (b.kills - a.kills) || (b.damageDealt - a.damageDealt) || (a.deaths - b.deaths)
    ))[0] || null;
  }

  /** Credit a blow to the team that landed it. Drives the overtime tiebreak. */
  public recordTeamDamage(team: TournamentTeam, amount: number): void {
    const rounded = Math.max(0, Math.round(amount));
    if (!rounded) return;
    this.roundTeamDamage[team] += rounded;
  }

  constructor(config?: Partial<TournamentMatchConfig>) {
    this.config = {
      format: config?.format || '1v1',
      roundsToWin: config?.roundsToWin || 2, // Best of 3
      roundDurationSec: config?.roundDurationSec || PVP_ROUND_DURATION_SEC,
      mapTheme: config?.mapTheme || 'tournament_colosseum',
    };
    this.roundTimeRemaining = this.config.roundDurationSec;
  }

  public setupTeamsFromLobby(
    members: {
      actorId?: string;
      uuid?: string;
      name: string;
      classId?: string | null;
      team?: 'red' | 'blue';
      socketId?: string;
      /** A bench spectator is in the lobby but never in the match. */
      seat?: 'red' | 'blue' | 'spectator';
      /** The chair they chose; spawn order follows it. */
      slot?: number;
    }[],
    localActorId: string,
    format: TournamentFormat = this.config.format,
    pvpTeams?: Record<string, 'red' | 'blue'>,
    assignedTeam?: 'red' | 'blue',
    options: { practiceBots?: boolean } = {}
  ): void {
    this.config.format = format;
    this.fighters = [];
    let redIndex = 0;
    let blueIndex = 0;

    // Seats are part of the lineup: two players who picked chairs 0 and 2 must
    // stand in that order, not in whatever order the roster happened to list
    // them. The bench is not on the field at all.
    const seeded = members
      .filter(m => m.seat !== 'spectator')
      .map((m, order) => {
        const id = m.actorId || m.uuid || m.socketId || '';
        const team = (pvpTeams && (pvpTeams[m.actorId || ''] || pvpTeams[m.uuid || ''])) || m.team || 'red';
        return { m, order, team, slot: Number.isInteger(m.slot) ? Number(m.slot) : Number.MAX_SAFE_INTEGER };
      })
      .sort((a, b) => {
        if (a.team !== b.team) return a.team === 'red' ? -1 : 1;
        return (a.slot - b.slot) || (a.order - b.order);
      })
      .map(entry => entry.m);

    for (const m of seeded) {
      const id = m.actorId || m.uuid || m.socketId || `actor_${Math.random()}`;
      const isLocal = id === localActorId || m.uuid === localActorId || (Boolean(m.socketId) && m.socketId === localActorId);
      let team: TournamentTeam = (pvpTeams && (pvpTeams[m.actorId || ''] || pvpTeams[m.uuid || '']))
        || m.team
        || (isLocal ? (assignedTeam || 'red') : 'blue');
      if (team !== 'red' && team !== 'blue') team = 'blue';

      const className = m.classId || 'warrior';
      const hp = getNormalizedPvpBaseHp(className);
      const spawnX = team === 'red' ? (480 + redIndex * 70) : (2950 - blueIndex * 70);
      if (team === 'red') redIndex++;
      else blueIndex++;

      this.fighters.push({
        id,
        name: m.name || 'Gladiator',
        team,
        isLocal,
        isBot: false,
        className,
        maxHp: hp,
        currentHp: hp,
        kills: 0,
        deaths: 0,
        damageDealt: 0,
        damageTaken: 0,
        isAlive: true,
        x: spawnX,
        y: 0,
        antiBurstUntil: 0,
        recentDamageTaken: [],
        ccCount: 0,
        lastCcTime: 0,
        ccImmunityUntil: 0,
      });
    }

    const teamSize = TOURNAMENT_FORMAT_TEAM_SIZES[format] || 1;

    // Teams are the room's decision, never this function's.
    //
    // It used to "balance" a roster that arrived all on one side by moving a
    // real player to the other colour. That is how allies ended up fighting
    // each other: the lobby said Azure, the arena said Crimson, and both
    // clients drew a different match. A real launch always has a player on
    // each side (the server refuses it otherwise), so a one-sided roster can
    // only mean practice.
    const humans = this.fighters.filter(f => !f.isBot);
    const practiceBots = options.practiceBots ?? (humans.length === 1 && humans[0].isLocal);

    // If opponent team is still completely empty (a practice bout), spawn bot gladiators
    if (practiceBots && this.fighters.filter(f => f.team === 'blue').length === 0) {
      const enemyArchetypes = [
        { name: 'Gladiator Marcus', class: 'warrior' },
        { name: 'Valkyrie Freya', class: 'heroknight' },
        { name: 'Shadowblade Kael', class: 'nightborne' },
        { name: 'Archmage Zephyr', class: 'wizard' },
      ];
      for (let i = 0; i < teamSize; i++) {
        const arch = enemyArchetypes[i % enemyArchetypes.length];
        const hp = getNormalizedPvpBaseHp(arch.class);
        this.fighters.push({
          id: `blue_bot_${i}`,
          name: arch.name,
          team: 'blue',
          isLocal: false,
          isBot: true,
          className: arch.class,
          maxHp: hp,
          currentHp: hp,
          kills: 0,
          deaths: 0,
          damageDealt: 0,
          damageTaken: 0,
          isAlive: true,
          x: 2950 - i * 70,
          y: 0,
          antiBurstUntil: 0,
          recentDamageTaken: [],
          ccCount: 0,
          lastCcTime: 0,
          ccImmunityUntil: 0,
        });
      }
    }
  }

  public setupTeams(localPlayerName: string, localClassName: string, format: TournamentFormat = this.config.format): void {
    this.config.format = format;
    this.fighters = [];
    const teamSize = TOURNAMENT_FORMAT_TEAM_SIZES[format];

    // Local player on Team Red
    const localHp = getNormalizedPvpBaseHp(localClassName);
    this.fighters.push({
      id: 'local_player',
      name: localPlayerName || 'Challenger',
      team: 'red',
      isLocal: true,
      isBot: false,
      className: localClassName,
      maxHp: localHp,
      currentHp: localHp,
      kills: 0,
      deaths: 0,
      damageDealt: 0,
      damageTaken: 0,
      isAlive: true,
      x: 480,
      y: 0,
      antiBurstUntil: 0,
      recentDamageTaken: [],
      ccCount: 0,
      lastCcTime: 0,
      ccImmunityUntil: 0,
    });

    // Fill remaining Team Red slots with ally bots if teamSize > 1
    const allyArchetypes = [
      { name: 'Paladin Roland', class: 'heroknight' },
      { name: 'Huntress Lyra', class: 'huntress' },
      { name: 'Priestess Serena', class: 'priestess' },
    ];
    for (let i = 1; i < teamSize; i++) {
      const arch = allyArchetypes[(i - 1) % allyArchetypes.length];
      const hp = getNormalizedPvpBaseHp(arch.class);
      this.fighters.push({
        id: `red_bot_${i}`,
        name: arch.name,
        team: 'red',
        isLocal: false,
        isBot: true,
        className: arch.class,
        maxHp: hp,
        currentHp: hp,
        kills: 0,
        deaths: 0,
        damageDealt: 0,
        damageTaken: 0,
        isAlive: true,
        x: 480 - i * 70,
        y: 0,
        antiBurstUntil: 0,
        recentDamageTaken: [],
        ccCount: 0,
        lastCcTime: 0,
        ccImmunityUntil: 0,
      });
    }

    // Team Blue Gladiator Opponents
    const enemyArchetypes = [
      { name: 'Gladiator Marcus', class: 'warrior' },
      { name: 'Valkyrie Freya', class: 'heroknight' },
      { name: 'Shadowblade Kael', class: 'nightborne' },
      { name: 'Archmage Zephyr', class: 'wizard' },
    ];
    for (let i = 0; i < teamSize; i++) {
      const arch = enemyArchetypes[i % enemyArchetypes.length];
      const hp = getNormalizedPvpBaseHp(arch.class);
      this.fighters.push({
        id: `blue_bot_${i}`,
        name: arch.name,
        team: 'blue',
        isLocal: false,
        isBot: true,
        className: arch.class,
        maxHp: hp,
        currentHp: hp,
        kills: 0,
        deaths: 0,
        damageDealt: 0,
        damageTaken: 0,
        isAlive: true,
        x: 1620 - i * 70,
        y: 0,
        antiBurstUntil: 0,
        recentDamageTaken: [],
        ccCount: 0,
        lastCcTime: 0,
        ccImmunityUntil: 0,
      });
    }
  }

  public startMatch(): void {
    this.currentRound = 1;
    this.redScore = 0;
    this.blueScore = 0;
    this.matchWinner = null;
    this.roundHistory = [];
    this.startRoundCountdown();
  }

  public startRoundCountdown(): void {
    this.status = 'countdown';
    this.countdownRemaining = 3;
    this.roundTimeRemaining = this.config.roundDurationSec;
    this.roundActiveSeconds = 0;
    this.suddenDeath = false;
    this.suddenDeathRemaining = 0;
    this.roundTeamDamage = { red: 0, blue: 0 };
    this.bannerText = 'ROUND ' + this.currentRound;
    this.bannerSubtext = 'Prepare for Battle!';
    this.bannerTimer = 1.2;

    // Reset fighter HP and positions
    for (const f of this.fighters) {
      f.currentHp = f.maxHp;
      f.isAlive = true;
      f.antiBurstUntil = 0;
      f.ccImmunityUntil = 0;
      f.ccCount = 0;
      f.recentDamageTaken = [];
      if (f.team === 'red') {
        f.x = 450 + (f.isLocal ? 0 : 80);
      } else {
        f.x = 2950;
      }
    }
  }

  public update(dt: number): void {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
    }

    if (this.status === 'countdown') {
      this.countdownRemaining -= dt;
      if (this.countdownRemaining <= 0) {
        this.status = 'active';
        this.bannerText = 'FIGHT!';
        this.bannerSubtext = `${this.config.format.toUpperCase()} MATCH`;
        this.bannerTimer = 1.0;
      }
      return;
    }

    if (this.status === 'active' && this.suddenDeath) {
      this.suddenDeathRemaining -= dt;
      if (this.suddenDeathRemaining <= 0) {
        this.suddenDeathRemaining = 0;
        this.settleExpiredRound(true);
        return;
      }
    }

    if (this.status === 'active') {
      this.roundActiveSeconds += dt;
      if (!this.suddenDeath) this.roundTimeRemaining -= dt;

      // Check win condition: Team Wipe (both teams must have fighters registered).
      // A dead fighter carried over from the previous round cannot settle the
      // new one before the round-start reset has gone out to both clients.
      if (this.canSettleWipe()) {
        const wiped = pvpWipeWinner(this.fighters);
        if (wiped) {
          this.resolveRoundEnd(wiped, 'wipe');
          return;
        }
      }

      // Check win condition: Timeout Health Lead
      if (!this.suddenDeath && this.roundTimeRemaining <= 0) {
        this.roundTimeRemaining = 0;
        this.settleExpiredRound(false);
      }
    }
  }

  /**
   * The round clock ran out. A clear health lead wins it; a tie sends the round
   * to sudden death, and only a sudden death that also expires falls back to
   * the damage tiebreak (and finally, a draw).
   */
  private settleExpiredRound(wasSuddenDeath: boolean): void {
    const redHpPercent = this.getTeamTotalHpPercent('red');
    const blueHpPercent = this.getTeamTotalHpPercent('blue');
    const tied = Math.abs(redHpPercent - blueHpPercent) <= PVP_SUDDEN_DEATH_TIE_MARGIN;

    let roundWinner: TournamentTeam | 'draw' = 'draw';
    if (!tied) {
      roundWinner = redHpPercent > blueHpPercent ? 'red' : 'blue';
    } else if (!wasSuddenDeath) {
      this.beginSuddenDeath();
      return;
    } else {
      // Overtime expired level. The team that dealt more damage earned the
      // round; identical damage is the only honest draw left.
      const { red, blue } = this.roundTeamDamage;
      if (red !== blue) roundWinner = red > blue ? 'red' : 'blue';
    }

    this.resolveRoundEnd(roundWinner, wasSuddenDeath ? 'sudden_death' : 'health_lead');
  }

  private beginSuddenDeath(): void {
    this.suddenDeath = true;
    this.suddenDeathRemaining = PVP_SUDDEN_DEATH_SEC;
    this.bannerText = 'SUDDEN DEATH';
    this.bannerSubtext = 'First team to fall loses the round';
    this.bannerTimer = 2.4;
    this.roundTimeRemaining = 0;
  }

  /** True once a wipe may legitimately settle the round. */
  public canSettleWipe(): boolean {
    return this.status === 'active' && this.roundActiveSeconds >= PVP_WIPE_GRACE_SEC;
  }

  public resolveRoundEnd(winner: TournamentTeam | 'draw', reason: 'wipe' | 'health_lead' | 'sudden_death'): void {
    // One settlement per round. A wipe packet and the local simulation can
    // both end up here on the same frame; the second must not score again.
    if (this.status !== 'active') return;
    this.status = 'round_end';
    this.suddenDeath = false;
    this.suddenDeathRemaining = 0;
    if (winner === 'red') this.redScore++;
    else if (winner === 'blue') this.blueScore++;

    const record: TournamentRoundRecord = {
      roundNumber: this.currentRound,
      winner,
      reason,
      redScore: this.redScore,
      blueScore: this.blueScore,
    };
    this.roundHistory.push(record);
    this.onRoundResolved?.(record);

    // A round is not the match. "TEAM RED VICTORY!" after the first kill read
    // as the end of the bout even while the scoreboard still said 1-0, so the
    // banner says what was actually won and repeats the series target.
    if (winner === 'red') {
      this.bannerText = `ROUND ${this.currentRound} - CRIMSON WINS`;
    } else if (winner === 'blue') {
      this.bannerText = `ROUND ${this.currentRound} - AZURE WINS`;
    } else {
      this.bannerText = `ROUND ${this.currentRound} - DRAW`;
    }
    this.bannerSubtext = `Match score ${this.redScore}-${this.blueScore} · first to ${this.config.roundsToWin} rounds`;
    this.bannerTimer = 2.5;

    // Check if match won. The headline is written from the LOCAL player's
    // side: a blue player used to see "DEFEAT!" while their own team won.
    if (this.redScore >= this.config.roundsToWin || this.blueScore >= this.config.roundsToWin) {
      const winner: TournamentTeam = this.redScore >= this.config.roundsToWin ? 'red' : 'blue';
      this.matchWinner = winner;
      this.status = 'match_end';
      const localTeam = this.fighters.find(f => f.isLocal)?.team ?? 'red';
      const mvp = this.mvp;
      const teamName = winner === 'red' ? 'Crimson' : 'Azure';
      this.bannerText = winner === localTeam ? 'CHAMPION OF THE ARENA!' : 'DEFEAT!';
      this.bannerSubtext = mvp
        ? `${mvp.name} takes MVP · ${teamName} claims the match`
        : `${teamName} claims the match`;
      this.bannerTimer = 4.0;
    } else {
      // Advance to next round after delay
      const timerFn = typeof window !== 'undefined' ? window.setTimeout : setTimeout;
      timerFn(() => {
        if (this.status === 'round_end') {
          this.currentRound++;
          this.startRoundCountdown();
        }
      }, 2600);
    }
  }

  public getTeamTotalHpPercent(team: TournamentTeam): number {
    const teamFighters = this.fighters.filter(f => f.team === team);
    if (!teamFighters.length) return 0;
    const current = teamFighters.reduce((s, f) => s + Math.max(0, f.currentHp), 0);
    const max = teamFighters.reduce((s, f) => s + f.maxHp, 0);
    return max > 0 ? (current / max) : 0;
  }
}

/** One row of the post-match scoreboard. */
export interface PvpScoreboardRow {
  id: string;
  name: string;
  team: TournamentTeam;
  className: string;
  isLocal: boolean;
  isBot: boolean;
  kills: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
}

export interface PvpMatchSummary {
  winningTeam: TournamentTeam | null;
  redScore: number;
  blueScore: number;
  rounds: TournamentRoundRecord[];
  rows: PvpScoreboardRow[];
  /** Best performer: kills first, then damage dealt. */
  mvp: PvpScoreboardRow | null;
  localTeam: TournamentTeam;
  localWon: boolean;
  /** How many rounds needed overtime. Worth calling out on the card. */
  suddenDeathRounds: number;
  format: TournamentFormat;
}

/**
 * A plain-data snapshot of a finished match.
 *
 * The results card, the reward breakdown and the local PvP record all read
 * from this one object, so the number a player sees on the card is the same
 * number written into their record.
 */
export function buildPvpMatchSummary(
  match: TournamentMatch,
  localTeam: TournamentTeam,
): PvpMatchSummary {
  const rows: PvpScoreboardRow[] = match.fighters.map(f => ({
    id: f.id,
    name: f.name,
    team: f.team,
    className: f.className,
    isLocal: f.isLocal,
    isBot: f.isBot,
    kills: Math.max(0, f.kills | 0),
    deaths: Math.max(0, f.deaths | 0),
    damageDealt: Math.max(0, Math.round(f.damageDealt)),
    damageTaken: Math.max(0, Math.round(f.damageTaken || 0)),
  }));

  const mvpRow = [...rows].sort((a, b) => (
    (b.kills - a.kills) || (b.damageDealt - a.damageDealt) || (a.deaths - b.deaths)
  ))[0] || null;

  const winningTeam = match.matchWinner
    || (match.redScore === match.blueScore ? null : match.redScore > match.blueScore ? 'red' : 'blue');

  return {
    winningTeam,
    redScore: match.redScore,
    blueScore: match.blueScore,
    rounds: [...match.roundHistory],
    rows,
    mvp: mvpRow,
    localTeam,
    localWon: winningTeam === localTeam,
    suddenDeathRounds: match.roundHistory.filter(r => r.reason === 'sudden_death').length,
    format: match.config.format,
  };
}
