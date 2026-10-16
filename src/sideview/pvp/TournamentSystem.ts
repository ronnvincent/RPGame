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
  damageDealt: number;
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
  public roundTimeRemaining: number = 90;
  public countdownRemaining: number = 3;
  public roundHistory: TournamentRoundRecord[] = [];
  public matchWinner: TournamentTeam | null = null;
  public bannerText: string = '';
  public bannerSubtext: string = '';
  public bannerTimer: number = 0;

  constructor(config?: Partial<TournamentMatchConfig>) {
    this.config = {
      format: config?.format || '1v1',
      roundsToWin: config?.roundsToWin || 2, // Best of 3
      roundDurationSec: config?.roundDurationSec || 90,
      mapTheme: config?.mapTheme || 'tournament_colosseum',
    };
    this.roundTimeRemaining = this.config.roundDurationSec;
  }

  public setupTeamsFromLobby(
    members: { actorId?: string; uuid?: string; name: string; classId?: string | null; team?: 'red' | 'blue'; socketId?: string }[],
    localActorId: string,
    format: TournamentFormat = this.config.format,
    pvpTeams?: Record<string, 'red' | 'blue'>,
    assignedTeam?: 'red' | 'blue'
  ): void {
    this.config.format = format;
    this.fighters = [];
    let redIndex = 0;
    let blueIndex = 0;

    for (const m of members) {
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
        damageDealt: 0,
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

    // Balance teams if all human participants were placed on the same team
    const initialRed = this.fighters.filter(f => f.team === 'red');
    const initialBlue = this.fighters.filter(f => f.team === 'blue');

    if (initialBlue.length === 0 && this.fighters.length >= 2) {
      const opponent = this.fighters.find(f => !f.isLocal);
      if (opponent) {
        opponent.team = 'blue';
        opponent.x = 2950;
      }
    } else if (initialRed.length === 0 && this.fighters.length >= 2) {
      const opponent = this.fighters.find(f => !f.isLocal);
      if (opponent) {
        opponent.team = 'red';
        opponent.x = 480;
      }
    }

    // If opponent team is still completely empty (e.g. 1-player testing or bot battle), spawn bot gladiators
    if (this.fighters.filter(f => f.team === 'blue').length === 0) {
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
          damageDealt: 0,
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
      damageDealt: 0,
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
        damageDealt: 0,
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
        damageDealt: 0,
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

    if (this.status === 'active') {
      this.roundTimeRemaining -= dt;

      // Check win condition: Team Wipe (only after at least 3.0s elapsed into active combat)
      const totalRed = this.fighters.filter(f => f.team === 'red').length;
      const totalBlue = this.fighters.filter(f => f.team === 'blue').length;
      const redAlive = this.fighters.filter(f => f.team === 'red' && f.isAlive).length;
      const blueAlive = this.fighters.filter(f => f.team === 'blue' && f.isAlive).length;
      const roundElapsed = this.config.roundDurationSec - this.roundTimeRemaining;

      if (totalRed > 0 && totalBlue > 0 && roundElapsed >= 3.0) {
        if (redAlive === 0 || blueAlive === 0) {
          const roundWinner: TournamentTeam | 'draw' = redAlive > 0 ? 'red' : blueAlive > 0 ? 'blue' : 'draw';
          this.resolveRoundEnd(roundWinner, 'wipe');
          return;
        }
      }

      // Check win condition: Timeout Health Lead
      if (this.roundTimeRemaining <= 0) {
        this.roundTimeRemaining = 0;
        const redHpPercent = this.getTeamTotalHpPercent('red');
        const blueHpPercent = this.getTeamTotalHpPercent('blue');

        let roundWinner: TournamentTeam | 'draw' = 'draw';
        if (redHpPercent > blueHpPercent) roundWinner = 'red';
        else if (blueHpPercent > redHpPercent) roundWinner = 'blue';

        this.resolveRoundEnd(roundWinner, 'health_lead');
      }
    }
  }

  public resolveRoundEnd(winner: TournamentTeam | 'draw', reason: 'wipe' | 'health_lead' | 'sudden_death'): void {
    this.status = 'round_end';
    if (winner === 'red') this.redScore++;
    else if (winner === 'blue') this.blueScore++;

    this.roundHistory.push({
      roundNumber: this.currentRound,
      winner,
      reason,
      redScore: this.redScore,
      blueScore: this.blueScore,
    });

    if (winner === 'red') {
      this.bannerText = 'TEAM RED VICTORY!';
    } else if (winner === 'blue') {
      this.bannerText = 'TEAM BLUE VICTORY!';
    } else {
      this.bannerText = 'ROUND DRAW!';
    }
    this.bannerSubtext = `Score: Red ${this.redScore} - ${this.blueScore} Blue`;
    this.bannerTimer = 2.5;

    // Check if match won
    if (this.redScore >= this.config.roundsToWin) {
      this.matchWinner = 'red';
      this.status = 'match_end';
      this.bannerText = 'CHAMPION OF THE ARENA!';
      this.bannerSubtext = 'Team Red claims match victory!';
      this.bannerTimer = 4.0;
    } else if (this.blueScore >= this.config.roundsToWin) {
      this.matchWinner = 'blue';
      this.status = 'match_end';
      this.bannerText = 'DEFEAT!';
      this.bannerSubtext = 'Team Blue claims match victory!';
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
