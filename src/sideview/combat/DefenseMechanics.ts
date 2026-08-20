/** Pure timing and hit-resolution rules for dodge, parry, guard, and stagger. */

export type IncomingAttackDefense = 'parryable' | 'dodge-only' | 'unavoidable';
export type DefenseOutcome = 'hit' | 'dodge' | 'perfect-dodge' | 'parry';

export interface PlayerDefenseState {
  dodgeWindowRemaining: number;
  perfectDodgeWindowRemaining: number;
  perfectDodgeAvailable: boolean;
  dodgeCooldownRemaining: number;
  parryWindowRemaining: number;
  parryCooldownRemaining: number;
  recoveryRemaining: number;
}

export interface DefenseStartResult {
  started: boolean;
  state: PlayerDefenseState;
}

export interface IncomingDefenseCheck {
  parryability: IncomingAttackDefense;
  /** Direction from the defender to the source: -1 left, +1 right. */
  sourceDirection: -1 | 1;
  defenderFacing: -1 | 1;
}

export interface DefenseResolution {
  outcome: DefenseOutcome;
  state: PlayerDefenseState;
  negatesDamage: boolean;
  attackerStaggerDamage: number;
  attackerGuardDamage: number;
  interruptAttacker: boolean;
}

export const DEFENSE_TIMING = Object.freeze({
  dodgeWindow: 0.34,
  perfectDodgeWindow: 0.11,
  dodgeCooldown: 1.05,
  dodgeRecovery: 0.18,
  parryWindow: 0.18,
  parryCooldown: 0.72,
  parryRecovery: 0.3,
  parryStaggerDamage: 45,
  parryGuardDamage: 60,
});

function nonNegativeFinite(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function cloneDefenseState(state: PlayerDefenseState): PlayerDefenseState {
  return {
    dodgeWindowRemaining: nonNegativeFinite(state.dodgeWindowRemaining),
    perfectDodgeWindowRemaining: nonNegativeFinite(state.perfectDodgeWindowRemaining),
    perfectDodgeAvailable: Boolean(state.perfectDodgeAvailable),
    dodgeCooldownRemaining: nonNegativeFinite(state.dodgeCooldownRemaining),
    parryWindowRemaining: nonNegativeFinite(state.parryWindowRemaining),
    parryCooldownRemaining: nonNegativeFinite(state.parryCooldownRemaining),
    recoveryRemaining: nonNegativeFinite(state.recoveryRemaining),
  };
}
export function createPlayerDefenseState(): PlayerDefenseState {
  return {
    dodgeWindowRemaining: 0,
    perfectDodgeWindowRemaining: 0,
    perfectDodgeAvailable: false,
    dodgeCooldownRemaining: 0,
    parryWindowRemaining: 0,
    parryCooldownRemaining: 0,
    recoveryRemaining: 0,
  };
}

export function tickPlayerDefenseState(
  state: PlayerDefenseState,
  dt: number,
): PlayerDefenseState {
  const elapsed = nonNegativeFinite(dt);
  const next = cloneDefenseState(state);
  next.dodgeWindowRemaining = Math.max(0, next.dodgeWindowRemaining - elapsed);
  next.perfectDodgeWindowRemaining = Math.max(0, next.perfectDodgeWindowRemaining - elapsed);
  next.dodgeCooldownRemaining = Math.max(0, next.dodgeCooldownRemaining - elapsed);
  next.parryWindowRemaining = Math.max(0, next.parryWindowRemaining - elapsed);
  next.parryCooldownRemaining = Math.max(0, next.parryCooldownRemaining - elapsed);
  next.recoveryRemaining = Math.max(0, next.recoveryRemaining - elapsed);
  if (next.perfectDodgeWindowRemaining <= 0) next.perfectDodgeAvailable = false;
  return next;
}

export function startDodge(state: PlayerDefenseState): DefenseStartResult {
  const next = cloneDefenseState(state);
  if (
    next.dodgeCooldownRemaining > 0
    || next.recoveryRemaining > 0
    || next.parryWindowRemaining > 0
  ) return { started: false, state: next };

  next.dodgeWindowRemaining = DEFENSE_TIMING.dodgeWindow;
  next.perfectDodgeWindowRemaining = DEFENSE_TIMING.perfectDodgeWindow;
  next.perfectDodgeAvailable = true;
  next.dodgeCooldownRemaining = DEFENSE_TIMING.dodgeCooldown;
  next.recoveryRemaining = DEFENSE_TIMING.dodgeRecovery;
  return { started: true, state: next };
}

export function startParry(state: PlayerDefenseState): DefenseStartResult {
  const next = cloneDefenseState(state);
  if (
    next.parryCooldownRemaining > 0
    || next.recoveryRemaining > 0
    || next.dodgeWindowRemaining > 0
  ) return { started: false, state: next };

  next.parryWindowRemaining = DEFENSE_TIMING.parryWindow;
  next.parryCooldownRemaining = DEFENSE_TIMING.parryCooldown;
  next.recoveryRemaining = DEFENSE_TIMING.parryRecovery;
  return { started: true, state: next };
}

export function isSourceInFront(sourceDirection: -1 | 1, defenderFacing: -1 | 1): boolean {
  return sourceDirection === defenderFacing;
}

export function resolveIncomingDefense(
  state: PlayerDefenseState,
  attack: IncomingDefenseCheck,
): DefenseResolution {
  const next = cloneDefenseState(state);
  const inFront = isSourceInFront(attack.sourceDirection, attack.defenderFacing);
  if (
    attack.parryability === 'parryable'
    && inFront
    && next.parryWindowRemaining > 0
  ) {
    // One press answers one hostile intent. A multi-hit action needs distinct
    // intent ids if the designer wants each hit to be independently parried.
    next.parryWindowRemaining = 0;
    next.recoveryRemaining = Math.max(next.recoveryRemaining, DEFENSE_TIMING.parryRecovery);
    return {
      outcome: 'parry',
      state: next,
      negatesDamage: true,
      attackerStaggerDamage: DEFENSE_TIMING.parryStaggerDamage,
      attackerGuardDamage: DEFENSE_TIMING.parryGuardDamage,
      interruptAttacker: true,
    };
  }

  if (attack.parryability !== 'unavoidable' && next.dodgeWindowRemaining > 0) {
    const perfect = next.perfectDodgeAvailable && next.perfectDodgeWindowRemaining > 0;
    if (perfect) next.perfectDodgeAvailable = false;
    return {
      outcome: perfect ? 'perfect-dodge' : 'dodge',
      state: next,
      negatesDamage: true,
      attackerStaggerDamage: 0,
      attackerGuardDamage: 0,
      interruptAttacker: false,
    };
  }

  return {
    outcome: 'hit',
    state: next,
    negatesDamage: false,
    attackerStaggerDamage: 0,
    attackerGuardDamage: 0,
    interruptAttacker: false,
  };
}

export interface GuardStaggerState {
  guard: number;
  maxGuard: number;
  guarding: boolean;
  guardBrokenRemaining: number;
  guardRecoveryDelayRemaining: number;
  stagger: number;
  staggerThreshold: number;
  staggeredRemaining: number;
  staggerRecoveryDelayRemaining: number;
}

export interface GuardStaggerConfig {
  maxGuard?: number;
  staggerThreshold?: number;
  guarding?: boolean;
}

export interface GuardStaggerImpact {
  incomingDamage: number;
  guardDamage: number;
  staggerDamage: number;
  sourceDirection: -1 | 1;
  defenderFacing: -1 | 1;
  bypassGuard?: boolean;
}

export interface GuardStaggerResolution {
  state: GuardStaggerState;
  guarded: boolean;
  guardBroken: boolean;
  staggered: boolean;
  interrupted: boolean;
  guardDamageApplied: number;
  staggerDamageApplied: number;
  damageMultiplier: number;
  resolvedDamage: number;
}

export const GUARD_STAGGER_RULES = Object.freeze({
  guardedDamageMultiplier: 0.35,
  breakingHitDamageMultiplier: 0.65,
  staggeredDamageMultiplier: 1.25,
  guardedStaggerScale: 0.2,
  guardBreakSeconds: 1.5,
  staggerSeconds: 1.15,
  guardRecoveryDelay: 2.4,
  staggerRecoveryDelay: 0.85,
  guardRecoveryPerSecond: 0.18,
  staggerRecoveryPerSecond: 12,
  maxImpactValue: 10_000,
  maxIncomingDamage: 250_000,
});

function cloneGuardState(state: GuardStaggerState): GuardStaggerState {
  const maxGuard = nonNegativeFinite(state.maxGuard);
  const staggerThreshold = Math.max(1, nonNegativeFinite(state.staggerThreshold));
  return {
    guard: Math.min(maxGuard, nonNegativeFinite(state.guard)),
    maxGuard,
    guarding: Boolean(state.guarding),
    guardBrokenRemaining: nonNegativeFinite(state.guardBrokenRemaining),
    guardRecoveryDelayRemaining: nonNegativeFinite(state.guardRecoveryDelayRemaining),
    stagger: Math.min(staggerThreshold, nonNegativeFinite(state.stagger)),
    staggerThreshold,
    staggeredRemaining: nonNegativeFinite(state.staggeredRemaining),
    staggerRecoveryDelayRemaining: nonNegativeFinite(state.staggerRecoveryDelayRemaining),
  };
}

export function createGuardStaggerState(config: GuardStaggerConfig = {}): GuardStaggerState {
  const maxGuard = nonNegativeFinite(config.maxGuard ?? 0);
  return {
    guard: maxGuard,
    maxGuard,
    guarding: Boolean(config.guarding) && maxGuard > 0,
    guardBrokenRemaining: 0,
    guardRecoveryDelayRemaining: 0,
    stagger: 0,
    staggerThreshold: Math.max(1, nonNegativeFinite(config.staggerThreshold ?? 100)),
    staggeredRemaining: 0,
    staggerRecoveryDelayRemaining: 0,
  };
}

export function setGuarding(state: GuardStaggerState, guarding: boolean): GuardStaggerState {
  const next = cloneGuardState(state);
  next.guarding = Boolean(guarding)
    && next.maxGuard > 0
    && next.guard > 0
    && next.guardBrokenRemaining <= 0
    && next.staggeredRemaining <= 0;
  return next;
}

export function tickGuardStaggerState(
  state: GuardStaggerState,
  dt: number,
): GuardStaggerState {
  const elapsed = nonNegativeFinite(dt);
  const next = cloneGuardState(state);
  next.guardBrokenRemaining = Math.max(0, next.guardBrokenRemaining - elapsed);
  next.guardRecoveryDelayRemaining = Math.max(0, next.guardRecoveryDelayRemaining - elapsed);
  next.staggeredRemaining = Math.max(0, next.staggeredRemaining - elapsed);
  next.staggerRecoveryDelayRemaining = Math.max(0, next.staggerRecoveryDelayRemaining - elapsed);

  if (next.guardRecoveryDelayRemaining <= 0 && next.guardBrokenRemaining <= 0 && next.maxGuard > 0) {
    next.guard = Math.min(
      next.maxGuard,
      next.guard + next.maxGuard * GUARD_STAGGER_RULES.guardRecoveryPerSecond * elapsed,
    );
  }
  if (next.staggerRecoveryDelayRemaining <= 0 && next.staggeredRemaining <= 0) {
    next.stagger = Math.max(0, next.stagger - GUARD_STAGGER_RULES.staggerRecoveryPerSecond * elapsed);
  }
  if (next.guard <= 0 || next.guardBrokenRemaining > 0 || next.staggeredRemaining > 0) {
    next.guarding = false;
  }
  return next;
}

export function resolveGuardStaggerImpact(
  state: GuardStaggerState,
  impact: GuardStaggerImpact,
): GuardStaggerResolution {
  const next = cloneGuardState(state);
  const incomingDamage = Math.min(
    GUARD_STAGGER_RULES.maxIncomingDamage,
    nonNegativeFinite(impact.incomingDamage),
  );
  const guardDamage = Math.min(
    GUARD_STAGGER_RULES.maxImpactValue,
    nonNegativeFinite(impact.guardDamage),
  );
  const staggerDamage = Math.min(
    GUARD_STAGGER_RULES.maxImpactValue,
    nonNegativeFinite(impact.staggerDamage),
  );
  const alreadyStaggered = next.staggeredRemaining > 0;
  const guardEligible = !impact.bypassGuard
    && next.guarding
    && next.guard > 0
    && next.guardBrokenRemaining <= 0
    && !alreadyStaggered
    && isSourceInFront(impact.sourceDirection, impact.defenderFacing);

  let guarded = false;
  let guardBroken = false;
  let staggered = alreadyStaggered;
  let interrupted = false;
  let guardDamageApplied = 0;
  let staggerDamageApplied = 0;
  let damageMultiplier = alreadyStaggered ? GUARD_STAGGER_RULES.staggeredDamageMultiplier : 1;

  if (guardEligible) {
    guarded = true;
    guardDamageApplied = Math.min(next.guard, guardDamage);
    next.guard = Math.max(0, next.guard - guardDamageApplied);
    next.guardRecoveryDelayRemaining = GUARD_STAGGER_RULES.guardRecoveryDelay;
    staggerDamageApplied = Math.min(
      next.staggerThreshold - next.stagger,
      staggerDamage * GUARD_STAGGER_RULES.guardedStaggerScale,
    );
    next.stagger += staggerDamageApplied;
    damageMultiplier = GUARD_STAGGER_RULES.guardedDamageMultiplier;

    if (next.guard <= 0 && guardDamage > 0) {
      guardBroken = true;
      staggered = true;
      interrupted = true;
      next.guarding = false;
      next.guardBrokenRemaining = GUARD_STAGGER_RULES.guardBreakSeconds;
      next.staggeredRemaining = Math.max(next.staggeredRemaining, GUARD_STAGGER_RULES.guardBreakSeconds);
      next.stagger = 0;
      next.staggerRecoveryDelayRemaining = GUARD_STAGGER_RULES.staggerRecoveryDelay;
      damageMultiplier = GUARD_STAGGER_RULES.breakingHitDamageMultiplier;
    }
  } else if (!alreadyStaggered) {
    staggerDamageApplied = Math.min(next.staggerThreshold - next.stagger, staggerDamage);
    next.stagger += staggerDamageApplied;
    next.staggerRecoveryDelayRemaining = GUARD_STAGGER_RULES.staggerRecoveryDelay;
    if (next.stagger >= next.staggerThreshold) {
      staggered = true;
      interrupted = true;
      next.stagger = 0;
      next.staggeredRemaining = GUARD_STAGGER_RULES.staggerSeconds;
      next.guarding = false;
    }
  }

  return {
    state: next,
    guarded,
    guardBroken,
    staggered,
    interrupted,
    guardDamageApplied,
    staggerDamageApplied,
    damageMultiplier,
    resolvedDamage: Math.max(0, Math.round(incomingDamage * damageMultiplier)),
  };
}
