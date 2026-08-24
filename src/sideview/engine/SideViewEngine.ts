/**
 * Core 2D Side-View Action Physics & Combat Engine
 * Implements dedicated mechanics, real Shadow Clones, Summoned Skeletons, Traps,
 * Persistent Elemental Zones, Omnislash, Chain Lightning, and 60 Unique Skills.
 */

import { CharacterClass, SkillDefinition, CHARACTER_CLASSES } from '../classes/ClassDefinitions';
import { POLY_SHEETS, POLY_PROPS, POLY_HOUSES, POLY_NATURE } from './MapLibrary';
import { bossSkillsFor, BossSkill } from '../dungeons/BossSkills';
import { BattleTheme, EnemyInstance } from '../dungeons/DungeonManager';
import { ItemData, RARITY_CONFIGS } from '../items/ItemDatabase';
import { getCardById, getCardForDungeon, makeCardItem, BOSS_CARD_DROP_CHANCE } from '../items/darkrise/cards';
import { socketBonusStats } from '../items/darkrise/gems';
import { enchantMultiplier } from '../items/darkrise/services';
import { WALLET_DEFAULTS } from '../items/darkrise/currencies';
import { recordEvent } from '../quests/DailyMissions';
import { ParticleSystem } from './ParticleSystem';
import { FX_COLOUR_ROW } from './VfxLibrary';
import { UltimateDirector, ULTIMATE_LINES } from './UltimateDirector';
import { audio } from './AudioManager';
import { sprites } from './SpriteManager';
import { quests } from '../quests/QuestManager';
import { TownHub } from '../town/TownHub';
import { SaveManager } from './SaveManager';
import {
  network,
  type PlayerDamagePacket,
  type PlayerDamageStatus,
} from '../network/NetworkManager';
import { quickChatById } from '../network/QuickChat';
import {
  buildZoneHazards,
  buildZonePlatforms,
  type BuiltZoneHazard,
  type HazardKind,
} from '../maps/ZoneContent';
import { drawZonePresentation } from '../maps/ZonePresentation';
import type {
  BuffApplication,
  EnemyStatusKind,
  PlayerBuffStat,
  SkillMechanics,
  StatusApplication,
} from '../combat/SkillMechanics';
import {
  COMBAT_STATUS_REGISTRY,
  resolveElementalReactions,
  type ReactionStatusSnapshot,
} from '../combat/CombatStatusRegistry';
import {
  createGuardStaggerState,
  createPlayerDefenseState,
  resolveGuardStaggerImpact,
  resolveIncomingDefense,
  setGuarding,
  startDodge,
  startParry,
  tickGuardStaggerState,
  tickPlayerDefenseState,
  type IncomingAttackDefense,
  type PlayerDefenseState,
} from '../combat/DefenseMechanics';
import {
  DEFAULT_ATTACK_PROFILE_BY_ROLE,
  BOSS_ATTACK_PROFILE_BY_KIND,
  advanceEnemyAttackIntent,
  canResolveEnemyAttackIntent,
  createEnemyAttackIntent,
  enemyAttackIntentPhase,
  getEnemyAttackProfile,
  markEnemyAttackIntentResolved,
  type EnemyAttackProfileId,
} from '../combat/EnemyAttackProfiles';
import {
  ELITE_MODIFIERS,
  ENEMY_ROLE_TACTICS,
  MINIBOSS_MECHANICS,
  type MiniBossMechanicId,
} from '../dungeons/EnemyTactics';
import {
  COMBAT_FEEDBACK_SPRITES,
  ELEMENT_REACTION_SPRITES,
  ENEMY_ROLE_SPRITES,
  GAMEPLAY_SPRITES,
  type EnemyRoleId,
  type GameplaySpriteId,
} from '../assets/GameplaySpriteManifest';
import { gameplaySprites } from './GameplaySpriteRenderer';
import type { RelicDefinition } from '../dungeons/run/RunTypes';

interface ActivePlayerBuff {
  stat: PlayerBuffStat;
  multiplier: number;
  timer: number;
  amount?: number;
  sourceSkillId?: string;
}

interface EnemyCombatStatus {
  kind: EnemyStatusKind;
  remaining: number;
  duration: number;
  magnitude: number;
  tickInterval: number;
  tickTimer: number;
  damagePerTick: number;
  damageRemaining: number;
  ticksRemaining: number;
  sourceSkillId: string;
  colour: string;
  lastCastToken: number;
}

interface PlayerNegativeStatus {
  kind: 'slow' | 'poison' | 'burn' | 'stun';
  remaining: number;
  magnitude: number;
  tickInterval: number;
  tickTimer: number;
  rawTickDamage: number;
  sourceId: string;
}

interface CombatPlayerTarget {
  kind: 'local' | 'remote';
  socketId: string | null;
  x: number;
  y: number;
  facing: -1 | 1;
}

interface CombatSpriteEffect {
  id: GameplaySpriteId;
  x: number;
  y: number;
  facing: -1 | 1;
  elapsed: number;
  duration: number;
  scale: number;
}

interface IncomingAttackContext {
  parryability: IncomingAttackDefense;
  intentId?: string;
  sourceEnemyId?: string;
  profileId?: EnemyAttackProfileId;
}

interface EncounterRuntimeBridge {
  render(ctx: CanvasRenderingContext2D, time: number): number;
  getDynamicPlatforms(): Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    active: boolean;
  }>;
  getObjectiveTargetForEnemy(): { x: number; y: number; targetId: string } | null;
}

export type ZoneHazardPhase = 'idle' | 'telegraph' | 'active' | 'cooldown';

export interface ZoneHazardSnapshot {
  id: string;
  kind: HazardKind;
  x: number;
  y: number;
  radius: number;
  telegraph: string;
  phase: ZoneHazardPhase;
  phaseProgress: number;
}

interface ZoneAccessibilityPreferences {
  reducedMotion: boolean;
  screenShake: boolean;
  screenFlashes: boolean;
}

export interface PlayerEquipment {
  helmet?: ItemData;
  armor?: ItemData;
  boots?: ItemData;
  weapon?: ItemData;
  wings?: ItemData;
  ring?: ItemData;
  amulet?: ItemData;
  shield?: ItemData;
}

export interface DroppedLoot {
  id: string;
  item: ItemData;
  x: number;
  y: number;
  vx: number;
  vy: number;
  isGrounded: boolean;
  bobTimer: number;
  despawnTimer: number;
  maxLifetime: number;
}

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'one-way' | 'solid';
}

export interface PlayerState {
  characterClass: CharacterClass;
  maxDungeonCleared: number;
  level: number;
  exp: number;
  maxExp: number;
  gold: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number; // 1 = right, -1 = left
  isGrounded: boolean;
  canDoubleJump: boolean;
  hasJumpedOnce: boolean;
  isDashing: boolean;
  dashTimer: number;
  dashCooldown: number;
  iframeTimer: number;
  attackTimer: number;
  stealthTimer: number;
  animState: 'idle' | 'run' | 'attack' | 'jump' | 'dead';
  /**
   * Downed, not dead. In a party a killing blow drops you to your knees with a
   * bleed-out timer instead of ending the run, so a teammate has a window to
   * reach you. Alone there is nobody coming, so the run ends as before.
   */
  downed?: boolean;
  /** Seconds of bleed-out left. Reaching zero ends the run. */
  downTimer?: number;
  /** One rescue per run: an unlimited one removes the cost of dying. */
  revivesUsed?: number;
  width: number;
  height: number;
  // Dynamic Combat Stats
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  baseAtk: number;
  baseDef: number;
  baseSpeed: number;
  baseCrit: number;
  // Computed total stats including equipment & buffs
  totalAtk: number;
  totalDef: number;
  totalSpeed: number;
  totalCrit: number;
  totalAttackSpeed: number;
  // Active Buffs
  activeBuffs: ActivePlayerBuff[];
  // Skill Cooldowns
  skillCooldowns: { [skillId: string]: number };
  /** Unspent points, one per level. */
  skillPoints?: number;
  /** Points sunk into each skill, by skill id. */
  skillLevels?: { [skillId: string]: number };
  equipment: PlayerEquipment;
  inventory: ItemData[];
  // Darkrise-style currencies beyond gold. Optional so old saves load as
  // "never had any" and createState seeds the starting values.
  diamonds?: number;
  keysOfPower?: number;
  unificationStones?: number;
  magicSubstance?: number;
  comboCount: number;
  comboTimer: number;
  comboStep: number;
  comboResetTimer: number;
  dropThroughTimer: number;
  ghostTrailTimer: number;
}

type SkillCastProcProfile =
  | 'light_slash'
  | 'heavy_slash'
  | 'dagger'
  | 'spear'
  | 'sword_impact'
  | 'fire_shot'
  | 'fire_burst'
  | 'ice_shot'
  | 'ice_wave'
  | 'lightning_shot'
  | 'lightning_chain'
  | 'holy_cast'
  | 'holy_shield'
  | 'holy_wave'
  | 'dark_shot'
  | 'dark_wave'
  | 'poison_shot'
  | 'earth_shock'
  | 'buff'
  | 'dash'
  | 'heal';

/** How long a monster's attack animation is shown after a swing begins. */
const ENEMY_ATTACK_ANIM = 0.55;

/**
 * Combat balance.
 *
 * The fight was one-sided in both directions at once. Skill multipliers run
 * from 0.75 up to 7.8 and were applied to the full attack stat, so a mid skill
 * killed most monsters outright, while defence was subtracted as a FLAT number
 * on both sides - a slime with 12 attack against 22 defence dealt exactly the
 * minimum of 1, every time.
 *
 * Flat subtraction is the root of it: it makes weak attackers useless and
 * strong ones barely dented. Both sides now mitigate by a fraction that rises
 * with defence but never reaches immunity, so a slime stays a slime and a boss
 * still hurts. The scalars then set the pace of a fight.
 */
const BALANCE = {
  /** Monster health, against the values written in the dungeon tables. */
  enemyHp: 2.8,
  /** Monster damage. */
  enemyAtk: 1.6,
  /** Player skill damage - the single biggest cause of one-hit clears. */
  playerDamage: 0.55,
  /** Crit was 1.8x on top of everything else. */
  critMultiplier: 1.55,
  /**
   * Softening constant for defence. mitigation = def / (def + K), so K is the
   * defence at which half of incoming damage is absorbed.
   */
  defenceK: 90,
};

/** Fraction of damage that gets through against a given defence. */
function afterDefence(raw: number, def: number): number {
  const mitigation = Math.max(0, def) / (Math.max(0, def) + BALANCE.defenceK);
  return raw * (1 - mitigation);
}

export class SideViewEngine {
  /** Remote ultimates keep the same anticipation beat without owning our cinematic director. */
  private static readonly REMOTE_ULTIMATE_ANTICIPATION_MS = 550;
  /** A danger mark must stay visible long enough to read before it can hurt. */
  public static readonly ZONE_HAZARD_TELEGRAPH_SECONDS = 1.2;
  /** The damaging window is deliberately shorter than the authored cooldown. */
  public static readonly ZONE_HAZARD_ACTIVE_SECONDS = 0.72;
  /** A quiet beat separates one authored anchor from the next. */
  public static readonly ZONE_HAZARD_RECOVERY_SECONDS = 1.08;

  public player: PlayerState;
  public enemies: EnemyInstance[] = [];
  public droppedLoots: DroppedLoot[] = [];
  public platforms: Platform[] = [];
  public particles: ParticleSystem;
  public arenaWidth: number = 3600;
  public arenaHeight: number = 600;
  public groundY: number = 480;
  public gravity: number = 0.65;
  public cameraX: number = 0;
  public canvasWidth: number = 960;
  public canvasHeight: number = 540;
  public isTownMode: boolean = true;
  /**
   * Read-only view of the server-assigned role. Never assign to this - the
   * server owns it via NetworkManager. Solo play reports true, which is correct
   * since a lone player is authoritative over their own world.
   */
  public get isHost(): boolean {
    return network.isHost;
  }
  public currentWaveIndex: number = 0;
  public currentDungeonIndex: number = 0;
  public currentDungeonId: string = 'goblin_catacombs';
  /** Canonical id shared with movement and targeted-damage packets. */
  public get networkSceneId(): string {
    return this.isTownMode ? 'town' : this.currentDungeonId;
  }
  private syncTimer: number = 0;
  /** Skill slot of the swing in progress, so the attack animation can vary. */
  private lastSkillIndex: number = 0;
  /** Duration the current swing was given, so elapsed time can be derived. */
  private attackHold: number = 0;
  /** Short global cooldown between casts, independent of the swing animation. */
  private castLock: number = 0;
  /**
   * Every delayed combat action belongs to the run that scheduled it. Changing
   * scenes advances the epoch and clears the timers, preventing an old boss
   * telegraph, projectile volley, or multi-hit from landing in town/the next
   * dungeon.
   */
  private combatTaskEpoch = 0;
  private delayedCombatTasks = new Set<number>();
  /** Set when the run has been lost, so defeat is announced exactly once. */
  public runOver = false;

  // What you actually did this run. Nothing tracked contribution before, so a
  // finished dungeon said nothing about who carried it - and a co-op run with
  // no record of who did what is just four people in the same room.
  public damageDealt = 0;
  public damageTaken = 0;
  public killCount = 0;
  public revivesGiven = 0;

  /** Wipe the run tally. Called when a dungeon starts, not when it ends. */
  public resetRunStats() {
    this.resetCombatScene();
    this.player.revivesUsed = 0;
    this.enemyStatuses.clear();
    this.playerNegativeStatuses.length = 0;
    this.enemyPlayerTargets.clear();
    this.receivedPlayerDamageHits.clear();
    this.playerDefense = createPlayerDefenseState();
    this.resolvedReactionKeys.clear();
    this.combatSpriteEffects.length = 0;
    this.damageDealt = 0;
    this.damageTaken = 0;
    this.killCount = 0;
    this.revivesGiven = 0;
    this.player.downed = false;
    this.player.downTimer = 0;
    this.player.mp = this.player.maxMp;
    Object.keys(this.player.skillCooldowns).forEach(skillId => {
      this.player.skillCooldowns[skillId] = 0;
    });
    this.player.activeBuffs.length = 0;
    this.player.stealthTimer = 0;
    this.player.iframeTimer = 0;
    this.recomputeStats();
  }

  /** Cancel delayed hits/VFX owned by the previous scene or run. */
  public cancelDelayedCombatTasks() {
    this.combatTaskEpoch++;
    this.delayedCombatTasks.forEach(handle => window.clearTimeout(handle));
    this.delayedCombatTasks.clear();
    this.particles.cancelDelayedTasks();
    this.ultimate.cancel();
  }

  /** Full transition boundary for town/dungeon changes, never for a downed tick. */
  public resetCombatScene() {
    this.cancelDelayedCombatTasks();
    this.particles.clearGameplayEntities();
    this.combatSpriteEffects.length = 0;
    this.resolvedReactionKeys.clear();
    this.playerDefense = createPlayerDefenseState();
    this.miniBossTriggered.clear();
    if (this.runRelicFingerprint) {
      this.runRelicFingerprint = '';
      this.runRelicAttackMultiplier = 1;
      this.runRelicMaxHpMultiplier = 1;
      this.runRelicGuardCapacity = 0;
      this.runRelicReactionPower.clear();
      this.recomputeStats();
      this.player.hp = Math.min(this.player.hp, this.player.maxHp);
    }
  }

  /** Small bounded sprite queue shared by defense, reactions, and enemy intents. */
  private addCombatSpriteEffect(
    id: GameplaySpriteId,
    x: number,
    y: number,
    duration: number = 0.45,
    facing: number = this.player.facing,
    scale: number = 1,
  ) {
    if (this.combatSpriteEffects.length >= 48) this.combatSpriteEffects.shift();
    this.combatSpriteEffects.push({
      id,
      x: Number.isFinite(x) ? x : this.player.x,
      y: Number.isFinite(y) ? y : this.player.y,
      facing: facing < 0 ? -1 : 1,
      elapsed: 0,
      duration: Math.max(0.08, Math.min(3, duration)),
      scale: Math.max(0.1, Math.min(4, scale)),
    });
    gameplaySprites.warm([id]);
  }

  private updateCombatSpriteEffects(dt: number) {
    for (let index = this.combatSpriteEffects.length - 1; index >= 0; index -= 1) {
      const effect = this.combatSpriteEffects[index];
      effect.elapsed += Math.max(0, dt);
      if (effect.elapsed >= effect.duration) this.combatSpriteEffects.splice(index, 1);
    }
  }

  private drawCombatSpriteEffects(ctx: CanvasRenderingContext2D) {
    for (const effect of this.combatSpriteEffects) {
      gameplaySprites.draw(ctx, effect.id, effect.x, effect.y, {
        time: effect.elapsed,
        normalizedProgress: effect.elapsed / effect.duration,
        facing: effect.facing,
        scale: effect.scale,
        alpha: Math.min(1, (effect.duration - effect.elapsed) * 5),
      });
    }
  }

  /** Schedule work that is safe to discard when the combat scene changes. */
  private scheduleCombatTask(task: () => void, delayMs: number) {
    const epoch = this.combatTaskEpoch;
    const handle = window.setTimeout(() => {
      this.delayedCombatTasks.delete(handle);
      if (epoch !== this.combatTaskEpoch) return;
      task();
    }, delayMs);
    this.delayedCombatTasks.add(handle);
  }
  /** Raised when the player dies with no revive left. */
  public onRunLost: (() => void) | null = null;
  /** Authored destructibles consume the same area hits as enemies. */
  public onPlayerWorldHit: ((area: { x: number; y: number; radius: number }, damage: number) => void) | null = null;
  /** Objective controllers need an event even when the next frame removes the corpse. */
  public onEnemyDefeatedEvent: ((enemyId: string) => void) | null = null;
  /** Which of a boss's abilities comes next, per boss. */
  private bossRotation = new Map<string, number>();
  /** Stable aggro target per enemy; invalid/downed/cross-scene targets are replaced. */
  private enemyPlayerTargets = new Map<string, string>();
  /** Targeted hits are idempotent across retransmit/reconnect races. */
  private receivedPlayerDamageHits = new Map<string, number>();
  private playerDamageSequence = 0;
  private readonly playerDamageNonce = Math.random().toString(36).slice(2, 10);
  private playerSyncTimer: number = 0;
  public townHub: TownHub | null = null;
  public readonly portalX: number = 2560;
  public isPlayerNearPortal: boolean = false;
  public hitStopTimer: number = 0;
  /** Runs the slow-motion / freeze / declaration sequence for ultimates. */
  public readonly ultimate = new UltimateDirector();
  public battleTheme: BattleTheme = 'catacombs';
  private zoneHazards: BuiltZoneHazard[] = [];
  private zoneHazardClock = 0;
  private readonly zoneHazardLastDamageMs = new Map<string, number>();
  private zoneGeometryTheme: BattleTheme | null = null;
  private zoneGeometryGroundY = Number.NaN;
  private zoneGeometryArenaWidth = Number.NaN;
  private visualPreferencesOverride: ZoneAccessibilityPreferences | null = null;
  private readonly cameraFollowSpeed = 10;
  private readonly cameraLookAheadPx = 140;
  private readonly cameraLeadRecoverySpeed = 12;
  private cameraLeadOffset = 0;
  private readonly physicsFrameScale = 60;
  private playerRunBob = 0;
  private skillCastToken = 0;
  public recentCorpsePositions: { x: number; y: number }[] = [];
  /** Timed enemy effects are engine-owned so dungeon/network records stay serializable. */
  public readonly enemyStatuses = new Map<string, EnemyCombatStatus[]>();
  /** Future enemy skills can use this same list; Purge Flame already cleans it. */
  public readonly playerNegativeStatuses: PlayerNegativeStatus[] = [];
  /** Pure timing state for dodge/parry; rendering resolves through sprite ids. */
  private playerDefense: PlayerDefenseState = createPlayerDefenseState();
  /** One elemental reaction per cast/target/reaction, including multi-hit skills. */
  private readonly resolvedReactionKeys = new Set<string>();
  /** Bounded sprite-only combat feedback; no procedural warning geometry. */
  private readonly combatSpriteEffects: CombatSpriteEffect[] = [];
  private combatIntentNonce = 0;
  private readonly miniBossTriggered = new Map<string, Set<MiniBossMechanicId>>();
  private runRelicAttackMultiplier = 1;
  private runRelicMaxHpMultiplier = 1;
  private runRelicGuardCapacity = 0;
  private readonly runRelicReactionPower = new Map<string, number>();
  private runRelicFingerprint = '';
  /** Optional authored room simulation injected by SideViewGame. */
  private dungeonEncounterRuntime: EncounterRuntimeBridge | null = null;

  constructor(characterClass: CharacterClass) {
    this.particles = new ParticleSystem();
    this.player = this.createInitialPlayer(characterClass);
    this.recomputeStats();
    this.buildMapPlatforms(this.battleTheme);
    gameplaySprites.warmEncounterSprites();
  }

  public recalculateStats() {
    this.recomputeStats();
  }

  public setDungeonEncounterRuntime(runtime: EncounterRuntimeBridge | null) {
    this.dungeonEncounterRuntime = runtime;
  }

  /** Applies the owned, already-validated run relic definitions exactly once. */
  public setRunRelics(relics: readonly RelicDefinition[]) {
    const fingerprint = relics.map(relic => relic.id).sort().join('|');
    if (fingerprint === this.runRelicFingerprint) return;
    const oldMaxHp = Math.max(1, this.player.maxHp);
    const hpRatio = this.player.hp / oldMaxHp;
    this.runRelicFingerprint = fingerprint;
    this.runRelicAttackMultiplier = 1;
    this.runRelicMaxHpMultiplier = 1;
    this.runRelicGuardCapacity = 0;
    this.runRelicReactionPower.clear();

    for (const relic of relics.slice(0, 24)) {
      for (const effect of relic.effects) {
        if (effect.type === 'multiply_stat') {
          const multiplier = Math.max(0.25, Math.min(3, effect.multiplierPermille / 1_000));
          if (effect.statId === 'attack') this.runRelicAttackMultiplier *= multiplier;
          if (effect.statId === 'max-hp') this.runRelicMaxHpMultiplier *= multiplier;
        } else if (effect.type === 'flat_stat' && effect.statId === 'guard-capacity') {
          this.runRelicGuardCapacity += Math.max(0, Math.min(250, effect.amount));
        } else if (effect.type === 'status_combo') {
          const prior = this.runRelicReactionPower.get(effect.comboId) || 0;
          this.runRelicReactionPower.set(
            effect.comboId,
            Math.min(1.5, prior + Math.max(0, effect.powerPermille / 1_000)),
          );
        }
      }
    }
    this.runRelicAttackMultiplier = Math.max(0.25, Math.min(4, this.runRelicAttackMultiplier));
    this.runRelicMaxHpMultiplier = Math.max(0.4, Math.min(3, this.runRelicMaxHpMultiplier));
    this.runRelicGuardCapacity = Math.min(600, this.runRelicGuardCapacity);
    this.recomputeStats();
    this.player.hp = Math.max(1, Math.min(this.player.maxHp, Math.round(this.player.maxHp * hpRatio)));
  }

  /** Applies authored run-room rank without coupling DungeonManager to run nodes. */
  public prepareEnemiesForRunRoom(kind: string) {
    const living = this.enemies.filter(enemy => !enemy.isDead && !enemy.objectiveEntity);
    if (!living.length) return;
    if (kind === 'elite') {
      for (const enemy of living) {
        enemy.isElite = true;
        if (enemy.type === 'mob') enemy.type = 'elite';
      }
      return;
    }
    if (kind !== 'miniboss') return;
    const champion = [...living].sort((a, b) => b.maxHp - a.maxHp)[0];
    if (!champion || champion.featureSpriteId === 'run:miniboss') return;
    champion.featureSpriteId = 'run:miniboss';
    champion.type = 'elite';
    champion.isElite = true;
    champion.maxHp = Math.max(1, Math.round(champion.maxHp * 1.85));
    champion.hp = champion.maxHp;
    champion.atk = Math.max(1, Math.round(champion.atk * 1.25));
    champion.def = Math.max(0, Math.round(champion.def * 1.2));
    champion.expReward = Math.max(1, Math.round(champion.expReward * 2));
    champion.goldReward = Math.max(0, Math.round(champion.goldReward * 2));
    this.miniBossTriggered.set(champion.id, new Set());
  }

  /**
   * Whether a living enemy can still add members to the current encounter.
   * Kill-all objectives use this authority signal before sealing their spawn
   * roster, so delayed mini-boss mechanics and elite summons cannot appear
   * after the room has already declared itself complete.
   */
  public hasPendingEnemyReinforcements(): boolean {
    return this.enemies.some(enemy => {
      if (enemy.isDead) return false;
      if (enemy.role === 'summoner' || enemy.eliteModifiers?.includes('summoning')) return true;
      if (enemy.featureSpriteId !== 'run:miniboss') return false;

      const triggered = this.miniBossTriggered.get(enemy.id);
      // roleActionCooldown spans the reinforcement telegraph and its delayed
      // spawn callback, keeping the roster open until the new ids are visible
      // to DungeonEncounterRuntime on a subsequent host update.
      return !triggered?.has('reinforcements') || (enemy.roleActionCooldown || 0) > 0;
    });
  }

  private collisionPlatforms(): Platform[] {
    const dynamic = this.dungeonEncounterRuntime?.getDynamicPlatforms() || [];
    if (!dynamic.length) return this.platforms;
    return [
      ...this.platforms,
      ...dynamic.filter(platform => platform.active).map(platform => ({
        // Encounter objects use their sprite centre; engine platforms use a
        // left edge and a top surface.
        x: platform.x - platform.width / 2,
        y: platform.y,
        width: platform.width,
        height: platform.height,
        type: 'one-way' as const,
      })),
    ];
  }

  /** Receives the shared input settings once per frame without polling DOM/storage in hot paths. */
  public setVisualPreferences(preferences: ZoneAccessibilityPreferences) {
    const normalized = {
      reducedMotion: Boolean(preferences.reducedMotion),
      screenShake: Boolean(preferences.screenShake),
      screenFlashes: Boolean(preferences.screenFlashes),
    };
    if (this.visualPreferencesOverride) Object.assign(this.visualPreferencesOverride, normalized);
    else this.visualPreferencesOverride = normalized;
    this.particles.setReducedMotion(normalized.reducedMotion);
  }

  public addItemToInventory(item: ItemData) {
    this.player.inventory.push(item);
    audio.playClick();
  }

  private createInitialPlayer(charClass: CharacterClass): PlayerState {
    const stats = charClass.stats;
    const cooldowns: { [id: string]: number } = {};
    charClass.skills.forEach(s => { cooldowns[s.id] = 0; });

    return {
      characterClass: charClass,
      level: 1,
      exp: 0,
      maxExp: 100,
      gold: WALLET_DEFAULTS.gold,
      diamonds: WALLET_DEFAULTS.diamonds,
      keysOfPower: WALLET_DEFAULTS.keysOfPower,
      unificationStones: WALLET_DEFAULTS.unificationStones,
      magicSubstance: WALLET_DEFAULTS.magicSubstance,
      x: 240,
      y: this.groundY,
      vx: 0,
      vy: 0,
      maxDungeonCleared: 0,
      facing: 1,
      isGrounded: true,
      canDoubleJump: true,
      hasJumpedOnce: false,
      comboStep: 0,
      comboResetTimer: 0,
      dropThroughTimer: 0,
      ghostTrailTimer: 0,
      isDashing: false,
      dashTimer: 0,
      dashCooldown: 0,
      iframeTimer: 0,
      attackTimer: 0,
      stealthTimer: 0,
      animState: 'idle',
      width: 44,
      height: 56,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      mp: stats.maxMp,
      maxMp: stats.maxMp,
      baseAtk: stats.atk,
      baseDef: stats.def,
      baseSpeed: stats.speed,
      baseCrit: stats.critChance,
      totalAtk: stats.atk,
      totalDef: stats.def,
      totalSpeed: stats.speed,
      totalCrit: stats.critChance,
      totalAttackSpeed: 1,
      activeBuffs: [],
      skillCooldowns: cooldowns,
      equipment: {},
      inventory: [],
      comboCount: 0,
      comboTimer: 0
    };
  }

  public recomputeStats() {
    const p = this.player;
    let bonusHp = 0;
    let bonusMp = 0;
    let bonusAtk = 0;
    let bonusDef = 0;
    let bonusCrit = 0;
    let bonusSpeed = 0;

    // Equipment bonuses. An item's contribution is base stats x enchant level,
    // plus its rolled affixes, seated gems and slotted card - the four layers
    // Darkrise stacks on every piece of gear.
    Object.values(p.equipment).forEach((item?: ItemData) => {
      if (!item) return;
      const mult = enchantMultiplier(item);
      if (item.stats) {
        if (item.stats.hp) bonusHp += Math.round(item.stats.hp * mult);
        if (item.stats.mp) bonusMp += Math.round(item.stats.mp * mult);
        if (item.stats.atk) bonusAtk += Math.round(item.stats.atk * mult);
        if (item.stats.def) bonusDef += Math.round(item.stats.def * mult);
        if (item.stats.crit) bonusCrit += item.stats.crit * mult;
        if (item.stats.speed) bonusSpeed += item.stats.speed * mult;
      }
      (item.affixes || []).forEach(affix => {
        const value = affix.value;
        if (affix.stat === 'hp') bonusHp += value;
        else if (affix.stat === 'mp') bonusMp += value;
        else if (affix.stat === 'atk') bonusAtk += value;
        else if (affix.stat === 'def') bonusDef += value;
        else if (affix.stat === 'crit') bonusCrit += value;
        else if (affix.stat === 'speed') bonusSpeed += value;
      });
      const gemStats = socketBonusStats(item);
      if (gemStats.hp) bonusHp += gemStats.hp;
      if (gemStats.mp) bonusMp += gemStats.mp;
      if (gemStats.atk) bonusAtk += gemStats.atk;
      if (gemStats.def) bonusDef += gemStats.def;
      if (gemStats.crit) bonusCrit += gemStats.crit;
      if (gemStats.speed) bonusSpeed += gemStats.speed;
      const card = item.cardId ? getCardById(item.cardId) : null;
      if (card?.stats) {
        if (card.stats.hp) bonusHp += card.stats.hp;
        if (card.stats.mp) bonusMp += card.stats.mp;
        if (card.stats.atk) bonusAtk += card.stats.atk;
        if (card.stats.def) bonusDef += card.stats.def;
        if (card.stats.crit) bonusCrit += card.stats.crit;
        if (card.stats.speed) bonusSpeed += card.stats.speed;
      }
    });

    // Level scaling (+8% per level)
    const lvlMultiplier = 1 + (p.level - 1) * 0.08;
    // The forge adds to maxHp directly, and this recomputes maxHp from the class
    // and equipment - so every purchased +50 was silently erased on the next
    // recompute, which happens on equipping anything. The purchase count is the
    // durable record of it.
    const forgedHp = 50 * (Number(localStorage.getItem('forge_hp')) || 0);
    p.maxHp = Math.max(1, Math.round(
      (Math.round((p.characterClass.stats.maxHp + bonusHp) * lvlMultiplier) + forgedHp)
      * this.runRelicMaxHpMultiplier,
    ));
    p.maxMp = Math.round((p.characterClass.stats.maxMp + bonusMp) * lvlMultiplier);
    
    let atk = (p.baseAtk + bonusAtk) * lvlMultiplier;
    let def = (p.baseDef + bonusDef) * lvlMultiplier;
    let spd = p.baseSpeed + bonusSpeed;
    let crit = p.baseCrit + bonusCrit;
    let attackSpeed = 1;

    // Active Buffs
    p.activeBuffs.forEach(buff => {
      if (buff.stat === 'atk') atk *= buff.multiplier;
      if (buff.stat === 'def') def *= buff.multiplier;
      if (buff.stat === 'speed') spd *= buff.multiplier;
      if (buff.stat === 'crit') crit *= buff.multiplier;
      if (buff.stat === 'attackSpeed') attackSpeed *= buff.multiplier;
    });

    p.totalAtk = Math.round(atk * this.runRelicAttackMultiplier);
    p.totalDef = Math.round(def);
    p.totalSpeed = Number(spd.toFixed(1));
    p.totalCrit = Number(crit.toFixed(2));
    p.totalAttackSpeed = Number(attackSpeed.toFixed(2));
  }

  public setBattleTheme(theme: BattleTheme) {
    this.battleTheme = theme;
    // Every wave begins with a complete warning window. Carrying the prior
    // zone clock into a new encounter could make the first hazard arrive
    // already active while the wave banner is still leaving the screen.
    this.rebuildZoneGeometry(theme, true);
  }

  public buildMapPlatforms(theme: BattleTheme) {
    this.rebuildZoneGeometry(theme, this.zoneGeometryTheme !== theme);
  }

  private rebuildZoneGeometry(theme: BattleTheme, resetHazardCycle: boolean) {
    const previousGroundY = this.zoneGeometryGroundY;
    const previousPlatforms = this.platforms;
    const playerSupportIndex = previousPlatforms.findIndex(platform => (
      this.player.isGrounded
      && this.player.x >= platform.x - 12
      && this.player.x <= platform.x + platform.width + 12
      && Math.abs(this.player.y - platform.y) <= 4
    ));
    const playerWasOnFloor = this.player.isGrounded
      && Number.isFinite(previousGroundY)
      && Math.abs(this.player.y - previousGroundY) <= 4;

    this.platforms = buildZonePlatforms(theme, this.groundY, this.arenaWidth).map(platform => ({
      ...platform,
      type: 'one-way' as const,
    }));
    this.zoneHazards = buildZoneHazards(theme, this.groundY, this.arenaWidth);

    // Canvas resizes move the play line. Keep grounded actors attached to the
    // surface that supported them instead of leaving them floating at the old
    // y until gravity catches up on a later frame.
    if (Number.isFinite(previousGroundY) && previousGroundY !== this.groundY) {
      if (playerWasOnFloor) {
        this.player.y = this.groundY;
      } else if (playerSupportIndex >= 0) {
        const priorSupport = previousPlatforms[playerSupportIndex];
        const nextSupport = this.platforms.find(platform => (
          platform.x === priorSupport.x && platform.width === priorSupport.width
        ));
        if (nextSupport) this.player.y = nextSupport.y;
      }

      for (const enemy of this.enemies) {
        if (enemy.isGrounded && Math.abs(enemy.y - previousGroundY) <= 4) {
          enemy.y = this.groundY;
        }
      }
      for (const loot of this.droppedLoots) {
        if (loot.isGrounded && Math.abs(loot.y - previousGroundY + 10) <= 6) {
          loot.y += this.groundY - previousGroundY;
        }
      }
    }

    this.zoneGeometryTheme = theme;
    this.zoneGeometryGroundY = this.groundY;
    this.zoneGeometryArenaWidth = this.arenaWidth;
    if (resetHazardCycle) {
      this.zoneHazardClock = 0;
      this.zoneHazardLastDamageMs.clear();
    }
    sprites.warmZoneContent(theme);
  }

  private activeZoneTheme(): BattleTheme {
    return this.isTownMode ? 'town' : this.battleTheme;
  }

  private ensureZoneGeometry() {
    const theme = this.activeZoneTheme();
    if (
      this.zoneGeometryTheme !== theme
      || this.zoneGeometryGroundY !== this.groundY
      || this.zoneGeometryArenaWidth !== this.arenaWidth
    ) {
      this.rebuildZoneGeometry(theme, this.zoneGeometryTheme !== theme);
    }
  }

  private zoneHazardPhase(index: number): { phase: ZoneHazardPhase; progress: number } {
    if (this.zoneHazards.length === 0) return { phase: 'idle', progress: 0 };
    const telegraph = SideViewEngine.ZONE_HAZARD_TELEGRAPH_SECONDS;
    const active = SideViewEngine.ZONE_HAZARD_ACTIVE_SECONDS;
    const slotDuration = telegraph + active + SideViewEngine.ZONE_HAZARD_RECOVERY_SECONDS;
    const turn = Math.floor(this.zoneHazardClock / slotDuration);
    if (turn % this.zoneHazards.length !== index) return { phase: 'idle', progress: 0 };

    const elapsed = this.zoneHazardClock - turn * slotDuration;
    if (elapsed < telegraph) {
      return { phase: 'telegraph', progress: Math.max(0, Math.min(1, elapsed / telegraph)) };
    }
    if (elapsed < telegraph + active) {
      return { phase: 'active', progress: Math.max(0, Math.min(1, (elapsed - telegraph) / active)) };
    }
    return {
      phase: 'cooldown',
      progress: Math.max(0, Math.min(1, (elapsed - telegraph - active) / SideViewEngine.ZONE_HAZARD_RECOVERY_SECONDS)),
    };
  }

  /** Stable, read-only runtime data for the HUD, diagnostics, and integration tests. */
  public getZoneHazardSnapshot(): ZoneHazardSnapshot[] {
    this.ensureZoneGeometry();
    return this.zoneHazards.map((hazard, index) => {
      const state = this.zoneHazardPhase(index);
      return {
        id: hazard.id,
        kind: hazard.kind,
        x: hazard.anchors[0],
        y: hazard.y,
        radius: hazard.radius,
        telegraph: hazard.telegraph,
        phase: state.phase,
        phaseProgress: state.progress,
      };
    });
  }

  private zoneAccessibilityPreferences(): ZoneAccessibilityPreferences {
    if (this.visualPreferencesOverride) return this.visualPreferencesOverride;
    let reducedMotion = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let screenShake = true;
    let screenFlashes = true;

    if (typeof document !== 'undefined') {
      const classes = document.documentElement?.classList;
      reducedMotion ||= Boolean(classes?.contains('input-reduced-motion'));
      screenShake = !classes?.contains('input-disable-shake');
      screenFlashes = !classes?.contains('input-disable-flashes');
    } else if (typeof localStorage !== 'undefined') {
      try {
        const stored = JSON.parse(localStorage.getItem('rpg.input.accessibility.v1') || 'null') as Partial<ZoneAccessibilityPreferences> | null;
        if (stored) {
          if (typeof stored.reducedMotion === 'boolean') reducedMotion = stored.reducedMotion;
          if (typeof stored.screenShake === 'boolean') screenShake = stored.screenShake;
          if (typeof stored.screenFlashes === 'boolean') screenFlashes = stored.screenFlashes;
        }
      } catch {
        // Accessibility storage is optional; malformed local data uses the
        // system preference and conservative visual defaults above.
      }
    }
    return { reducedMotion, screenShake, screenFlashes };
  }

  private applyZoneHazardToPlayer(hazard: BuiltZoneHazard) {
    const p = this.player;
    if (
      this.isTownMode
      || p.downed
      || this.runOver
      || p.hp <= 0
      || p.iframeTimer > 0
      || p.stealthTimer > 0
      || this.ultimate.invulnerable
    ) return;

    const hazardX = hazard.anchors[0];
    const withinHorizontalRange = Math.abs(p.x - hazardX) <= hazard.radius + p.width * 0.35;
    // Ledges are an intentional evade route for ground hazards. Checking the
    // player's feet, rather than the sprite centre, keeps the collision aligned
    // with the warning ellipse painted on the floor.
    const withinGroundBand = Math.abs(p.y - hazard.y) <= hazard.radius * 0.75;
    if (!withinHorizontalRange || !withinGroundBand) return;

    const nowMs = this.zoneHazardClock * 1000;
    const lastDamageMs = this.zoneHazardLastDamageMs.get(hazard.id) ?? Number.NEGATIVE_INFINITY;
    if (nowMs - lastDamageMs < hazard.damageCooldownMs) return;
    this.zoneHazardLastDamageMs.set(hazard.id, nowMs);

    const rawDamage = Math.max(14, Math.round(p.maxHp * 0.1));
    const mitigated = Math.max(
      1,
      Math.round(afterDefence(rawDamage, p.totalDef) * this.incomingDamageMultiplier()),
    );
    const { hpDamage, absorbed } = this.absorbPlayerDamage(mitigated);

    p.hp = Math.max(0, p.hp - hpDamage);
    this.damageTaken += hpDamage;
    this.lastHurtAt = performance.now();
    p.iframeTimer = Math.max(p.iframeTimer, 0.42);

    const direction = p.x === hazardX ? -p.facing : Math.sign(p.x - hazardX);
    if (hazard.kind === 'abyss-current' || hazard.kind === 'ridge-gust') {
      p.vx = direction * Math.max(4.5, p.totalSpeed * 1.15);
    } else {
      p.vx = direction * 3.2;
      p.vy = -2.2;
      p.isGrounded = false;
    }

    const preferences = this.zoneAccessibilityPreferences();
    audio.playHit(false);
    if (preferences.screenShake && !preferences.reducedMotion) {
      this.particles.triggerScreenShake(hpDamage > 0 ? 5 : 2, 0.18);
    }
    if (preferences.screenFlashes) {
      this.particles.addScreenFlash('#ef4444', 0.12, 0.025);
    }
    if (absorbed > 0) {
      this.particles.addFloatingText(p.x, p.y - p.height / 2 - 14, `SHIELD -${absorbed}`, '#60a5fa', false, 14);
    }
    if (hpDamage > 0) {
      this.particles.addFloatingText(p.x, p.y - p.height / 2, `HAZARD -${hpDamage}`, '#fb7185', false, 16);
    }
    this.resolvePlayerDefeat();
  }

  private updateZoneHazards(dt: number) {
    this.ensureZoneGeometry();
    if (this.isTownMode || this.zoneHazards.length === 0 || dt <= 0) return;

    // Do not let a restored background tab jump over the warning and land in
    // an active damage frame. A stalled frame advances this system by at most
    // 100 ms, preserving the full readable telegraph.
    this.zoneHazardClock += Math.min(dt, 0.1);
    for (let index = 0; index < this.zoneHazards.length; index += 1) {
      if (this.zoneHazardPhase(index).phase === 'active') {
        this.applyZoneHazardToPlayer(this.zoneHazards[index]);
        break;
      }
    }
  }


  // --- PLAYER ACTIONS ---

  public movePlayer(direction: number) {
    // Downed players are out of the fight until somebody reaches them.
    if (this.player.downed || this.playerStatusMagnitude('stun') > 0) return;

    if (this.player.isDashing) return;
    const slow = Math.min(0.8, this.playerStatusMagnitude('slow'));
    this.player.vx = direction * this.player.totalSpeed * (1 - slow);
    if (direction !== 0) {
      this.player.facing = direction > 0 ? 1 : -1;
    }
  }

  public jumpPlayer(holdingDown: boolean = false) {
    // Downed players are out of the fight until somebody reaches them.
    if (this.player.downed || this.playerStatusMagnitude('stun') > 0) return;

    const p = this.player;

    // Drop through one-way platforms when holding Down + Jump
    if (holdingDown && p.y < this.groundY - 10) {
      p.dropThroughTimer = 0.35;
      p.vy = 3.5;
      p.isGrounded = false;
      audio.playJump();
      return;
    }

    if (p.isGrounded) {
      p.vy = -p.characterClass.stats.jumpPower;
      p.isGrounded = false;
      p.hasJumpedOnce = true;
      audio.playJump();
    } else if (p.hasJumpedOnce && (
      p.equipment.wings
      || p.characterClass.id === 'ninja'
      || p.characterClass.id === 'dragoon'
      || p.activeBuffs.some(buff => buff.stat === 'airMobility')
    )) {
      // Double jump
      p.vy = -p.characterClass.stats.jumpPower * 0.9;
      p.hasJumpedOnce = false;
      audio.playJump();
    }
  }

  public dashPlayer(): boolean {
    // Downed players are out of the fight until somebody reaches them.
    if (this.player.downed || this.playerStatusMagnitude('stun') > 0) return false;

    const p = this.player;
    if (p.dashTimer > 0 || p.isDashing) return false;
    const dodge = startDodge(this.playerDefense);
    if (!dodge.started) return false;
    this.playerDefense = dodge.state;
    p.isDashing = true;
    p.dashTimer = 0.25;
    p.dashCooldown = this.playerDefense.dodgeCooldownRemaining;
    // I-frames are resolved by the defense state, while this timer preserves
    // blink feedback and compatibility with legacy hazards.
    p.iframeTimer = this.playerDefense.dodgeWindowRemaining;
    p.vx = p.facing * (p.totalSpeed * 2.6);
    audio.playDash();
    this.addCombatSpriteEffect(COMBAT_FEEDBACK_SPRITES.dodge, p.x, p.y, 0.34, p.facing, 0.82);
    this.particles.addGhostTrail(p.x, p.y, p.facing, p.characterClass.id, 'run', 0, p.characterClass.accentColor);
    return true;
  }

  /** Context action in combat: a short front-facing parry window. */
  public parryPlayer(): boolean {
    if (this.isTownMode || this.player.downed || this.playerStatusMagnitude('stun') > 0) return false;
    const parry = startParry(this.playerDefense);
    if (!parry.started) return false;
    this.playerDefense = parry.state;
    this.player.vx *= 0.25;
    this.addCombatSpriteEffect(
      COMBAT_FEEDBACK_SPRITES.parry,
      this.player.x + this.player.facing * 18,
      this.player.y - 12,
      0.3,
      this.player.facing,
      0.85,
    );
    audio.playId('metal_ring', 0.72);
    return true;
  }

  public getDefenseState(): Readonly<PlayerDefenseState> {
    return { ...this.playerDefense };
  }

  private getSkillCastSoundProfile(skill: SkillDefinition, classId: string): SkillCastProcProfile {
    const slot = Number(skill.id.split('_')[1]);
    const role = classId.toLowerCase();
    const sfxProfileByType: Record<SkillDefinition['sfx'], SkillCastProcProfile> = {
      light_slash: 'light_slash',
      heavy_slash: 'heavy_slash',
      fire: 'fire_shot',
      ice: 'ice_shot',
      lightning: 'lightning_shot',
      holy: 'holy_cast',
      dark: 'dark_shot',
      heal: 'heal',
      dash: 'dash'
    };

    const directProfile = sfxProfileByType[skill.sfx];
    if (directProfile) return directProfile;

    const classProfiles: Record<string, SkillCastProcProfile[]> = {
      warrior: ['light_slash', 'heavy_slash', 'sword_impact', 'holy_cast', 'dash', 'earth_shock'],
      assassin: ['dagger', 'poison_shot', 'dark_shot', 'dark_wave', 'dash', 'dark_wave'],
      mage: ['fire_shot', 'ice_shot', 'lightning_chain', 'holy_shield', 'ice_wave', 'fire_burst'],
      paladin: ['holy_cast', 'holy_shield', 'sword_impact', 'holy_wave', 'heal', 'holy_wave'],
      archer: ['light_slash', 'light_slash', 'poison_shot', 'fire_shot', 'buff', 'dark_wave'],
      necromancer: ['dark_shot', 'poison_shot', 'earth_shock', 'dark_wave', 'dark_wave', 'dark_wave'],
      berserker: ['heavy_slash', 'buff', 'earth_shock', 'sword_impact', 'lightning_shot', 'fire_burst'],
      priest: ['holy_cast', 'heal', 'holy_wave', 'holy_shield', 'holy_wave', 'holy_wave'],
      ninja: ['dagger', 'dash', 'dash', 'fire_shot', 'lightning_chain', 'dark_shot'],
      dragoon: ['spear', 'earth_shock', 'fire_shot', 'sword_impact', 'buff', 'fire_burst']
    };

    const profile = classProfiles[role]?.[slot - 1];
    return profile || 'light_slash';
  }

  private playSkillCastSfx(skill: SkillDefinition) {
    const profile = this.getSkillCastSoundProfile(skill, this.player.characterClass.id);
    switch (profile) {
      case 'light_slash':
        audio.playSlash('light', 0.95);
        break;
      case 'heavy_slash':
        audio.playSlash('heavy', 1.05);
        break;
      case 'dagger':
        audio.playSlash('dagger', 1.2);
        break;
      case 'spear':
        audio.playSlash('spear', 1.2);
        break;
      case 'sword_impact':
        audio.playSlash('heavy', 1.2);
        break;
      case 'fire_shot':
        audio.playMagic('fire', 1.0);
        break;
      case 'fire_burst':
        audio.playMagic('fire', 1.35);
        break;
      case 'ice_shot':
        audio.playMagic('ice', 1.0);
        break;
      case 'ice_wave':
        audio.playMagic('ice', 1.3);
        break;
      case 'lightning_shot':
        audio.playMagic('lightning', 1.0);
        break;
      case 'lightning_chain':
        audio.playMagic('lightning', 1.2);
        break;
      case 'holy_cast':
        audio.playMagic('holy', 0.95);
        break;
      case 'holy_shield':
        audio.playMagic('holy', 0.82);
        break;
      case 'holy_wave':
        audio.playMagic('holy', 1.2);
        break;
      case 'dark_shot':
        audio.playMagic('dark', 0.95);
        break;
      case 'dark_wave':
        audio.playMagic('dark', 1.2);
        break;
      case 'poison_shot':
        audio.playMagic('dark', 0.85);
        break;
      case 'earth_shock':
        audio.playMagic('dark', 1.05);
        break;
      case 'buff':
        audio.playHeal();
        break;
      case 'dash':
        audio.playDash();
        break;
      case 'heal':
        audio.playHeal();
        break;
      default:
        audio.playSlash('light', 0.95);
    }
  }

  /**
   * Bespoke cinematic set pieces and gameplay summons, keyed by
   * `${classId}:${skillIndex}`.
   *
   * These are the hand-authored "big moment" visuals and the entities that
   * actually fight for you - they cannot come from the VFX catalogue because
   * they spawn state, not just frames. Everything else is pure data in
   * ClassDefinitions.vfx.
   */
  private static readonly SKILL_SET_PIECES: Record<string, { signature?: string; summon?: { kind: string; scale: number } }> = {
    'warrior:5':     { signature: 'titan_earth_shatter' },
    'assassin:5':    { signature: 'shadow_tempest' },
    'mage:5':        { signature: 'armageddon_meteors' },
    'paladin:5':     { signature: 'holy_hammer' },
    'archer:5':      { signature: 'astral_dragon_piercer' },
    'necromancer:2': { summon: { kind: 'skeleton', scale: 0.9 } },
    'necromancer:5': { summon: { kind: 'reaper', scale: 1.3 } },
    'berserker:5':   { signature: 'blood_titan_rampage' },
    'priest:5':      { signature: 'celestial_radiance' },
    'ninja:1':       { summon: { kind: 'shadow_clones', scale: 0.8 } },
    'dragoon:5':     { signature: 'dragon_descent', summon: { kind: 'dragon', scale: 0.85 } }
  };

  /**
   * Plays a skill's visuals from its data descriptor.
   *
   * This is the ONLY place skill VFX are produced, and it is called by both the
   * local cast path and the remote replication path - so what the caster sees
   * and what the rest of the party sees are identical by construction. The old
   * code hand-duplicated ~320 lines of per-class effects for remote players,
   * which is why the two screens drifted apart.
   */
  public playSkillVfx(
    skill: SkillDefinition,
    classId: string,
    skillIndex: number,
    originX: number,
    originY: number,
    facing: number,
    damage: number,
    ownerSocketId?: string | null,
    onUltimateImpact?: () => void,
    ultimateCaster: 'local' | 'remote' = 'local',
  ) {
    const vfx = skill.vfx || {};
    const leapDistance = skill.mechanics.movement?.kind === 'leap'
      ? skill.mechanics.movement.distance
      : undefined;
    const projectedTargetX = originX + facing * (leapDistance ?? skill.range * 0.6);
    const targetX = leapDistance === undefined ? projectedTargetX : this.clampArenaX(projectedTargetX);
    const targetY = originY;

    // Palette sheets carry the same animation in nine colours; pick the row that
    // matches the skill's element so one sheet serves every damage type.
    const row = vfx.identity?.paletteRow ?? FX_COLOUR_ROW[skill.damageType] ?? 5;

    // A catalogue sound if the skill names one, otherwise the old generic
    // profile. Sixty skills used to share about ten sounds, which is why combat
    // read as silent.
    if (skill.sound) audio.playId(skill.sound);
    else this.playSkillCastSfx(skill);

    if (vfx.cast) {
      this.particles.playVfx(vfx.cast, originX, originY - 18, { facing, row });
    }
    if (vfx.identity) {
      this.particles.addSkillIdentityAccent(originX, originY, facing, vfx.identity);
    }

    // Gameplay projectiles carry their own sprite/trail and impact metadata.
    // Spawning a second catalogue projectile here made the visible bolt arrive
    // at a different time and position from the collider.
    const hasGameplayProjectile = skill.mechanics.delivery.kind === 'projectile';
    if (vfx.projectile && !hasGameplayProjectile) {
      // Travels toward the aim direction and fades as it goes.
      this.particles.playVfx(vfx.projectile, originX + facing * 24, originY - 14, {
        facing,
        row,
        vx: facing * 420,
        fadeOut: true
      });
    }

    // Impacts are emitted by the delivery executor at the resolved collider,
    // target, zone, or sequence point. Keeping them out of this cast-only path
    // prevents the old projected targetX flash from landing before the hit.

    // Ultimates get the cinematic treatment: the declaration and slow-motion
    // land first, and the payload only fires when the world unfreezes.
    if (skill.isUltimate) {
      audio.playId('ult_charge', 0.9);
      const epoch = this.combatTaskEpoch;
      const impact = () => {
        // The director is real-time rather than timer-driven, so it needs the
        // same scene guard as scheduled tasks.
        if (epoch !== this.combatTaskEpoch) return;
        if (vfx.impact) {
          this.particles.playVfx(vfx.impact, targetX, targetY - 18, { facing, row });
        }
        this.playUltimatePayload(skill, originX, originY, facing, row, ultimateCaster === 'local');
        onUltimateImpact?.();
      };

      if (ultimateCaster === 'local') {
        const cls = CHARACTER_CLASSES.find(c => c.id === classId);
        const line = ULTIMATE_LINES[classId] || skill.name.toUpperCase();
        this.ultimate.start(line, cls?.accentColor || '#ffd77a', impact);
      } else {
        // A teammate's cast has its own cancellable visual beat. It must never
        // replace the local director callback or grant this player cinematic
        // invulnerability/slow-motion.
        this.scheduleCombatTask(impact, SideViewEngine.REMOTE_ULTIMATE_ANTICIPATION_MS);
      }
    }

    if (vfx.screen && !skill.isUltimate) {
      if (vfx.screen.shake) this.particles.triggerScreenShake(vfx.screen.shake, 0.4);
      if (vfx.screen.flash) this.particles.addScreenFlash(vfx.screen.flash, 0.55, 0.05);
    }

    // Stateful summons are created by the mechanics executor (or as explicitly
    // visual-only replicas for remote casts), never by this VFX-only function.
  }

  /** Cinematic ultimates and summons - see SKILL_SET_PIECES. */

  /**
   * The blast half of an ultimate, fired by the director once the freeze ends.
   * Split out so the anticipation beat is not competing with the explosion for
   * the player's attention.
   */
  private playUltimatePayload(
    skill: SkillDefinition,
    x: number,
    y: number,
    facing: number,
    row: number,
    localCinematicFeedback = true,
  ) {
    const big = skill.vfx.ultimate || 'ult_epic_explosion_002';
    const spread = Math.max(110, skill.aoeRadius);

    if (skill.sound) audio.playId(skill.sound, 1.15);
    if (localCinematicFeedback) {
      this.hitStopTimer = 0.06;
      this.particles.triggerScreenShake(skill.vfx.screen?.shake ?? 26, 0.35);
      if (skill.vfx.screen?.flash) {
        this.particles.addScreenFlash(skill.vfx.screen.flash, 0.7, 0.05);
      }
    }

    // A centred hero blast plus a quality-bounded staggered ring. Four large
    // additive sheets per local and remote ultimate churned the sprite cap in
    // party fights before adaptive quality could react.
    this.particles.playVfx(big, x + facing * 40, y - 40, { facing, row, scale: 1.35 });
    const quality = this.particles.getVfxQuality();
    const secondaryCount = quality === 'high' ? 2 : (quality === 'medium' ? 1 : 0);
    for (let i = 0; i < secondaryCount; i++) {
      const ox = x + facing * 40 + (Math.random() * 2 - 1) * spread;
      const oy = y - 20 - Math.random() * 70;
      this.scheduleCombatTask(
        () => {
          const liveQuality = this.particles.getVfxQuality();
          const liveSecondaryCount = liveQuality === 'high' ? 2 : (liveQuality === 'medium' ? 1 : 0);
          if (i >= liveSecondaryCount) return;
          this.particles.playVfx(big, ox, oy, { facing, row, scale: 0.8 + Math.random() * 0.6 });
        },
        120 + i * 90
      );
    }
  }

  private playSkillSetPiece(
    classId: string,
    skillIndex: number,
    x: number,
    y: number,
    facing: number,
    damage: number,
    ownerSocketId: string | null
  ) {
    const entry = SideViewEngine.SKILL_SET_PIECES[`${classId}:${skillIndex}`];
    if (!entry) return;

    // Ultimates are driven by the cinematic payload now. Running the legacy
    // set piece as well meant both fired at once, doubling the load on the
    // heaviest frame in the game. Summons still spawn - they are gameplay.
    const isUlt = skillIndex === 5;

    switch (isUlt ? '' : entry.signature) {
      case 'titan_earth_shatter':
        this.particles.spawnTitanEarthShatter(x, this.groundY, facing); break;
      case 'shadow_tempest':
        this.particles.triggerShadowTempest(
          [{ x: x + facing * 100, y }, { x, y }, { x: x - facing * 100, y }], x, y); break;
      case 'armageddon_meteors':
        this.particles.spawnArmageddonMeteors(x, this.groundY, facing); break;
      case 'holy_hammer':
        this.particles.spawnHolyHammerJudgement(x, this.groundY); break;
      case 'astral_dragon_piercer':
        this.particles.spawnAstralDragonPiercer(x, y, facing); break;
      case 'blood_titan_rampage':
        this.particles.spawnBloodTitanRampage(x, this.groundY, facing); break;
      case 'celestial_radiance':
        this.particles.spawnCelestialDivineRadiance(x, this.groundY); break;
      case 'dragon_descent':
        this.particles.spawnDragonDescent(x, y, facing); break;
    }

    if (entry.summon) {
      const dmg = Math.max(1, Math.round(damage * entry.summon.scale));
      switch (entry.summon.kind) {
        case 'skeleton':
          this.particles.spawnSkeletonMinion(x + facing * 40, this.groundY, dmg, ownerSocketId); break;
        case 'reaper':
          this.particles.spawnReaperMinion(x + facing * 50, this.groundY, facing, dmg, ownerSocketId); break;
        case 'dragon':
          this.particles.spawnDragonMinion(x, this.groundY, facing, dmg, ownerSocketId); break;
        case 'shadow_clones':
          this.particles.spawnShadowClones(x, y, facing, dmg); break;
      }
    }
  }

  /**
   * Replicate a party member's skill locally. Visuals only - the host stays
   * authoritative for damage.
   */
  public castRemoteSkill(classId: string, skillIndex: number, startX: number, startY: number, facing: number, ownerSocketId?: string, skillDamage?: number) {
    const cls = CHARACTER_CLASSES.find((c: any) => c.id === classId);
    if (!cls) return;
    const skill = cls.skills[skillIndex];
    if (!skill) return;

    const remoteDamage = typeof skillDamage === 'number' && skillDamage > 0 ? skillDamage : this.player.totalAtk;

    const replicatedEntities = () => this.spawnRemoteSkillEntities(skill, startX, startY, facing, ownerSocketId);
    this.playSkillVfx(
      skill,
      classId,
      skillIndex,
      startX,
      startY,
      facing,
      remoteDamage,
      ownerSocketId,
      skill.isUltimate ? replicatedEntities : undefined,
      'remote',
    );
    if (!skill.isUltimate) replicatedEntities();
  }

  /** Visual replicas never participate in the authoritative damage simulation. */
  private spawnRemoteSkillEntities(
    skill: SkillDefinition,
    x: number,
    y: number,
    facing: number,
    ownerSocketId?: string,
  ) {
    const { delivery, hits } = skill.mechanics;
    const identity = skill.vfx.identity;
    if (delivery.kind === 'projectile') {
      const count = Math.max(1, hits.count);
      for (let i = 0; i < count; i++) {
        const spawn = () => {
          let px = x + facing * 20;
          let py = y - 14;
          let vx = facing * (delivery.speed ?? 12);
          let vy = 0;
          if (delivery.radial) {
            const angle = i / count * Math.PI * 2;
            vx = Math.cos(angle) * (delivery.speed ?? 12);
            vy = Math.sin(angle) * (delivery.speed ?? 12);
          } else if (hits.targeting === 'rain') {
            px = x + facing * skill.range * 0.6 - skill.aoeRadius + (i + 0.5) * (skill.aoeRadius * 2 / count);
            py = Math.max(30, y - 260);
            vx = 0;
            vy = delivery.speed ?? 15;
          }
          this.particles.addProjectile(
            px,
            py,
            vx,
            vy,
            delivery.projectile || 'energy_ball',
            0,
            false,
            false,
            identity.palette[i % identity.palette.length],
            delivery.projectile === 'dagger' ? 8 : 10,
            Boolean(delivery.piercing),
            {
              visualOnly: true,
              maxDistance: hits.targeting === 'rain' ? 300 : Math.max(80, skill.range),
              impactVfx: skill.vfx.impact,
              impactRow: identity.paletteRow,
              identity,
            },
          );
        };
        if (i === 0 || delivery.radial) spawn();
        else this.scheduleCombatTask(spawn, (hits.intervalMs ?? 45) * i);
      }
    }

    if (delivery.kind === 'zone') {
      this.particles.addGroundZone(
        delivery.origin === 'caster' ? x : x + facing * skill.range * 0.6,
        this.groundY,
        skill.aoeRadius,
        0,
        delivery.duration ?? 5,
        delivery.zoneType || 'blizzard',
        identity.palette[0],
        {
          allyMitigation: skill.mechanics.payload.zoneAllyMitigation,
          allyHealPercentPerTick: skill.mechanics.payload.zoneHealPercentPerTick,
          tickInterval: delivery.tickInterval,
        },
      );
    } else if (delivery.kind === 'trap') {
      this.particles.addGroundTrap(x + facing * 40, this.groundY, 'poison', 0, { visualOnly: true });
    }

    if (delivery.kind === 'distributed' || delivery.kind === 'chain') {
      const targets = this.getClosestEnemies(x, y, delivery.maxTargets ?? hits.count, Math.max(skill.range, 550));
      const resolved = hits.targeting === 'distinct' || delivery.kind === 'chain'
        ? Math.min(hits.count, targets.length)
        : hits.count;
      for (let i = 0; i < resolved; i++) {
        const target = targets.length ? targets[i % targets.length] : null;
        if (!target) continue;
        this.scheduleCombatTask(() => {
          if (skill.vfx.impact) {
            this.particles.playVfx(skill.vfx.impact, target.x, target.y - 18, { facing, row: identity.paletteRow });
          }
          this.particles.addSkillIdentityAccent(target.x, target.y, facing, identity);
        }, (hits.intervalMs ?? 80) * i);
      }
    } else if (hits.count > 1 && delivery.kind !== 'projectile' && delivery.kind !== 'zone') {
      for (let i = 1; i < hits.count; i++) {
        this.scheduleCombatTask(() => {
          const impactX = delivery.origin === 'caster' ? x : x + facing * skill.range * 0.6;
          if (skill.vfx.impact) {
            this.particles.playVfx(skill.vfx.impact, impactX, y - 18, { facing, row: identity.paletteRow });
          }
          this.particles.addSkillIdentityAccent(impactX, y, facing, identity);
        }, (hits.intervalMs ?? 80) * i);
      }
    }

    const summon = skill.mechanics.summon;
    if (summon?.kind === 'skeleton') {
      this.particles.spawnSkeletonMinion(x + facing * 40, this.groundY, 0, ownerSocketId, true);
    } else if (summon?.kind === 'shadow_clones') {
      this.particles.spawnShadowClones(x, y, facing, 0);
    } else if (summon?.kind === 'dragon_avatar') {
      this.particles.spawnDragonDescent(x, y, facing);
    } else if (summon?.kind === 'reaper_waves') {
      this.particles.spawnReaperDeathNova(x, this.groundY, facing);
    }
  }

  /**
   * Apply an ultimate's gameplay at the same instant as its cinematic payload.
   * Previously every ultimate damaged enemies on button-down, roughly half a
   * second before the visible impact. Keeping this small dispatcher separate
   * also makes future ultimates fall back to a safe area hit automatically.
   */
  private executeUltimateGameplay(skill: SkillDefinition, attackX: number, attackY: number) {
    const damage = this.calculateDamage(skill);
    this.executeSkillMechanics(skill, damage, Math.random() < this.player.totalCrit, attackX, attackY);
  }

  public castSkill(skillIndex: number) {
    this.castSkillFromMechanics(skillIndex);
  }
  /** The only local cast path: resource gates followed by descriptor execution. */
  private castSkillFromMechanics(skillIndex: number) {
    const p = this.player;
    if (
      p.downed
      || this.runOver
      || p.hp <= 0
      || this.castLock > 0
      || this.playerStatusMagnitude('stun') > 0
    ) return;

    const skill = p.characterClass.skills[skillIndex];
    if (!skill) return;
    const cost = skill.manaCost || 0;
    if (cost > 0 && p.mp < cost) {
      this.particles.addFloatingText(p.x, p.y - 34, 'NOT ENOUGH MANA', '#60a5fa', true, 15);
      audio.playClick();
      return;
    }
    if ((p.skillCooldowns[skill.id] || 0) > 0) {
      this.particles.addFloatingText(p.x, p.y - 20, 'On Cooldown!', '#ef5350', false, 14);
      return;
    }

    if (cost > 0) p.mp = Math.max(0, p.mp - cost);
    p.skillCooldowns[skill.id] = skill.cooldown;
    const attackSpeed = Math.max(0.5, p.totalAttackSpeed || 1);
    p.attackTimer = (skill.cooldown === 0 ? 0.22 : Math.min(0.7, 0.3 + skill.castTime * 1.2)) / attackSpeed;
    p.animState = 'attack';
    this.lastSkillIndex = skillIndex;
    this.attackHold = p.attackTimer;
    this.castLock = 0.16 / attackSpeed;

    const leapDistance = skill.mechanics.movement?.kind === 'leap'
      ? skill.mechanics.movement.distance
      : undefined;
    const projectedAttackX = p.x + p.facing * (leapDistance ?? skill.range * 0.6);
    const attackX = leapDistance === undefined ? projectedAttackX : this.clampArenaX(projectedAttackX);
    const attackY = p.y;
    const isCrit = Math.random() < p.totalCrit;
    const damage = this.calculateDamage(skill);

    network.sendPlayerSkill(
      skillIndex,
      p.characterClass.id,
      p.x,
      p.y,
      p.facing,
      this.groundY,
      this.isTownMode,
      damage,
    );

    this.playSkillVfx(
      skill,
      p.characterClass.id,
      skillIndex,
      p.x,
      p.y,
      p.facing,
      damage,
      network.socket?.id || null,
      skill.isUltimate
        ? () => this.executeSkillMechanics(skill, damage, isCrit, attackX, attackY)
        : undefined,
    );

    if (!skill.isUltimate) {
      this.executeSkillMechanics(skill, damage, isCrit, attackX, attackY);
    }
  }

  private executeSkillMechanics(
    skill: SkillDefinition,
    totalDamage: number,
    rolledCrit: boolean,
    attackX: number,
    attackY: number,
  ) {
    const mechanics = skill.mechanics;
    const p = this.player;
    const movementOriginX = p.x;
    const castToken = ++this.skillCastToken;
    let resolvedDamage = totalDamage;

    if (mechanics.basic?.aerialPlunge && !p.isGrounded) {
      p.vy = 14;
      p.attackTimer = 0.4;
      p.animState = 'attack';
      return;
    }
    if (mechanics.basic?.comboMultipliers?.length) {
      const combo = mechanics.basic.comboMultipliers;
      const step = p.comboStep % combo.length;
      resolvedDamage *= combo[step];
      p.comboStep = (step + 1) % combo.length;
      p.comboResetTimer = 0.75;
      p.attackTimer = (0.22 + step * 0.04) / Math.max(0.5, p.totalAttackSpeed || 1);
    }

    this.applySupportPayload(skill, mechanics);
    this.applyMovement(mechanics, attackX);
    this.spawnSkillSummon(skill, resolvedDamage);

    const land = () => this.executeDelivery(
      skill,
      resolvedDamage,
      rolledCrit,
      attackX,
      attackY,
      castToken,
      movementOriginX,
    );
    if (mechanics.movement?.kind === 'leap') {
      const landingX = this.clampArenaX(attackX);
      if (skill.isUltimate) {
        // The director already supplied W6's anticipation delay. Commit its
        // declared horizontal leap and damage on that exact impact beat.
        p.x = landingX;
        p.vy = 16;
        p.isGrounded = false;
        land();
        return;
      }
      const delay = mechanics.movement.delayMs ?? 250;
      p.vy = -(mechanics.movement.knockUp ?? 12);
      p.isGrounded = false;
      this.scheduleCombatTask(() => {
        p.x = landingX;
        p.vy = 16;
        land();
      }, delay);
      return;
    }
    land();
  }

  private applySupportPayload(skill: SkillDefinition, mechanics: SkillMechanics) {
    const payload = mechanics.payload;
    const p = this.player;

    for (const buff of payload.buffs || []) this.applyBuffApplication(skill.id, buff);

    if (payload.stealthSeconds) {
      p.stealthTimer = Math.max(p.stealthTimer, payload.stealthSeconds);
      p.iframeTimer = Math.max(p.iframeTimer, 0.5);
    }

    if (payload.heal) {
      const percentHeal = payload.heal.kind === 'max-hp-percent'
        ? Math.max(0, Math.min(1, payload.heal.amount))
        : null;
      const heal = payload.heal.kind === 'flat'
        ? payload.heal.amount
        : payload.heal.kind === 'max-hp-percent'
          ? p.maxHp * payload.heal.amount
          : payload.heal.amount + p.totalAtk * (payload.heal.atkScale || 0);
      const amount = Math.max(1, Math.round(heal));
      const applyLocalHeal = () => percentHeal === null
        ? this.applyPartyHeal(amount)
        : this.applyPartyPercentHeal(percentHeal);

      if (payload.heal.scope === 'self') {
        applyLocalHeal();
      } else if (payload.heal.scope === 'party') {
        applyLocalHeal();
        network.sendPartySupport({
          kind: 'heal',
          ...(percentHeal === null ? { amount } : { percent: percentHeal }),
          casterName: p.characterClass.name,
        });
      } else {
        const localPct = p.hp / Math.max(1, p.maxHp);
        const remoteHealthRatio = (hpPct: number | undefined) => (
          Math.max(0, Math.min(100, hpPct ?? 100)) / 100
        );
        const lowestRemote = Object.entries(network.remotePlayers)
          .filter(([, remote]) => !remote.downed && typeof remote.hpPct === 'number')
          .sort(([, a], [, b]) => remoteHealthRatio(a.hpPct) - remoteHealthRatio(b.hpPct))[0];
        if (lowestRemote && remoteHealthRatio(lowestRemote[1].hpPct) < localPct) {
          network.sendPartySupport({
            kind: 'heal',
            ...(percentHeal === null ? { amount } : { percent: percentHeal }),
            targetSocketId: lowestRemote[0],
            casterName: p.characterClass.name,
          });
        } else {
          applyLocalHeal();
        }
      }
    }

    if (payload.cleanse) {
      this.applyPartyCleanse(payload.cleanse.count);
      if (payload.cleanse.scope === 'party') {
        network.sendPartySupport({
          kind: 'cleanse',
          count: payload.cleanse.count,
          casterName: p.characterClass.name,
        });
      }
    }

    if (payload.resurrection) {
      const downed = Object.entries(network.remotePlayers)
        .filter(([, remote]) => remote.downed)
        .sort(([, a], [, b]) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      if (downed) {
        network.sendPartySupport({
          kind: 'revive',
          percent: payload.resurrection.reviveHpPercent,
          targetSocketId: downed[0],
          casterName: p.characterClass.name,
        });
        this.particles.addFloatingText(downed[1].x, downed[1].y - 45, 'RESURRECTED', '#fef3c7', true, 18);
      } else {
        this.addPlayerBuff({
          stat: 'deathPrevention',
          multiplier: payload.resurrection.reviveHpPercent,
          duration: payload.resurrection.preventionDuration,
          scope: 'self',
          amount: 1,
        }, skill.id);
      }
    }
  }

  private applyBuffApplication(skillId: string, buff: BuffApplication) {
    this.addPlayerBuff(buff, skillId);
    if (buff.scope === 'party') {
      network.sendPartySupport({
        kind: 'buff',
        stat: buff.stat,
        multiplier: buff.multiplier,
        duration: buff.duration,
        casterName: this.player.characterClass.name,
      });
    }
  }

  private addPlayerBuff(buff: BuffApplication, sourceSkillId?: string) {
    const existing = this.player.activeBuffs.find(active => active.stat === buff.stat && active.sourceSkillId === sourceSkillId);
    if (existing) {
      existing.timer = Math.max(existing.timer, buff.duration);
      existing.multiplier = buff.multiplier;
      if (buff.amount !== undefined) existing.amount = Math.max(existing.amount || 0, buff.amount);
    } else {
      this.player.activeBuffs.push({
        stat: buff.stat,
        multiplier: buff.multiplier,
        timer: buff.duration,
        amount: buff.amount,
        sourceSkillId,
      });
    }
    this.recomputeStats();
    const label = buff.stat === 'shield'
      ? `SHIELD ${buff.amount || 0}`
      : buff.stat === 'deathPrevention'
        ? 'RESURRECTION READY'
        : `${String(buff.stat).toUpperCase()} ${buff.multiplier >= 1 ? '+' : ''}${Math.round((buff.multiplier - 1) * 100)}%`;
    this.particles.addFloatingText(this.player.x, this.player.y - 30, label, '#ffee58', true, 15);
  }

  private applyMovement(mechanics: SkillMechanics, attackX: number) {
    const move = mechanics.movement;
    if (!move || move.kind === 'leap') return;
    const p = this.player;
    if (move.iframeSeconds) p.iframeTimer = Math.max(p.iframeTimer, move.iframeSeconds);

    if (move.kind === 'teleport-behind') {
      const target = this.getClosestEnemy(move.distance ?? 300);
      if (target) {
        p.x = this.clampArenaX(target.x - target.facing * 34);
        p.facing = target.facing;
      } else {
        p.x = this.clampArenaX(p.x + p.facing * (move.distance ?? 180));
      }
    } else if (move.kind === 'dash' || move.kind === 'substitution' || move.kind === 'charge') {
      p.x = this.clampArenaX(p.x + p.facing * (move.distance ?? Math.abs(attackX - p.x)));
    } else if (move.kind === 'drift' && move.distance) {
      p.x = this.clampArenaX(p.x + p.facing * move.distance);
    }
  }

  private clampArenaX(x: number) {
    return Math.max(60, Math.min(this.arenaWidth - 60, x));
  }

  private spawnSkillSummon(skill: SkillDefinition, totalDamage: number) {
    const summon = skill.mechanics.summon;
    if (!summon) return;
    const p = this.player;
    const summonDamage = Math.max(1, Math.round(totalDamage * summon.damageScale));
    if (summon.kind === 'skeleton') {
      this.particles.spawnSkeletonMinion(p.x + p.facing * 40, this.groundY, summonDamage, network.socket?.id || null);
    } else if (summon.kind === 'shadow_clones') {
      // damageScale is the repeat strength of each clone. Two 50% repeats pay
      // one complete skill budget together; dividing by count again left the
      // advertised 150% Shadow Clone at only half of that potency.
      this.particles.spawnShadowClones(p.x, p.y, p.facing, summonDamage);
    } else if (summon.kind === 'dragon_avatar') {
      this.particles.spawnDragonDescent(p.x, p.y, p.facing);
    } else if (summon.kind === 'reaper_waves') {
      this.particles.spawnReaperDeathNova(p.x, this.groundY, p.facing);
    }
  }

  private executeDelivery(
    skill: SkillDefinition,
    totalDamage: number,
    rolledCrit: boolean,
    attackX: number,
    attackY: number,
    castToken: number,
    movementOriginX?: number,
  ) {
    const { delivery, hits: sequence, payload } = skill.mechanics;
    if (!payload.damage && !payload.statuses?.length) return;
    const directTotal = payload.damage ? totalDamage * (payload.directDamageShare ?? 1) : 0;

    if (delivery.kind === 'projectile') {
      this.spawnSkillProjectiles(skill, directTotal, rolledCrit, attackX, castToken);
      return;
    }

    if (delivery.kind === 'zone') {
      const zoneX = delivery.origin === 'caster' ? this.player.x : attackX;
      const tickCount = Math.max(1, sequence.count);
      this.particles.addGroundZone(
        zoneX,
        this.groundY,
        skill.aoeRadius,
        Math.max(0, Math.round(directTotal / tickCount)),
        delivery.duration ?? tickCount * (delivery.tickInterval ?? 0.5),
        delivery.zoneType || 'blizzard',
        skill.vfx.identity.palette[0],
        {
          skillId: skill.id,
          statuses: payload.statuses,
          allyMitigation: payload.zoneAllyMitigation,
          allyHealPercentPerTick: payload.zoneHealPercentPerTick,
          tickInterval: delivery.tickInterval,
        },
      );
      if (skill.vfx.impact) {
        this.particles.playVfx(skill.vfx.impact, zoneX, this.groundY - 18, {
          facing: this.player.facing,
          row: skill.vfx.identity.paletteRow,
        });
      }
      return;
    }

    if (delivery.kind === 'trap') {
      this.particles.addGroundTrap(
        this.player.x + this.player.facing * 40,
        this.groundY,
        'poison',
        Math.max(1, Math.round(directTotal)),
        {
          skillId: skill.id,
          statuses: payload.statuses,
          cloudDamageTotal: Math.max(0, totalDamage - directTotal),
        },
      );
      return;
    }

    if (delivery.kind === 'corpses') {
      const corpses = this.recentCorpsePositions.splice(0);
      if (!corpses.length) {
        this.hitArea(skill, attackX, attackY, directTotal * (delivery.fallbackDamageScale ?? 0.5), rolledCrit, castToken);
      } else {
        const share = directTotal / corpses.length;
        corpses.forEach(corpse => this.hitArea(skill, corpse.x, corpse.y, share, rolledCrit, castToken));
      }
      return;
    }

    if (delivery.kind === 'chain' || delivery.kind === 'distributed') {
      this.executeDistributedHits(skill, directTotal, rolledCrit, attackX, attackY, castToken);
      return;
    }

    if (delivery.kind === 'targeted') {
      const target = this.getClosestEnemy(skill.range || 400);
      if (target) {
        this.hitEnemyWithSkill(target, skill, directTotal, rolledCrit, castToken);
        if (skill.vfx.impact) {
          this.particles.playVfx(skill.vfx.impact, target.x, target.y - 18, {
            facing: this.player.facing,
            row: skill.vfx.identity.paletteRow,
          });
        }
      }
      return;
    }

    if (delivery.kind === 'support') {
      if (payload.damage) this.hitArea(skill, attackX, attackY, directTotal, rolledCrit, castToken);
      return;
    }

    if (delivery.kind === 'summon') {
      // Stateful summon entities own their hit timing. Applying the full area
      // hit here made Shadow Clone deal damage on button-down while its two
      // visible attackers were still only decoration.
      return;
    }

    // Melee and area sequences share a total damage budget across all ticks.
    const count = Math.max(1, sequence.count);
    const weights = this.normalizedHitWeights(sequence.falloff, count);
    for (let i = 0; i < count; i++) {
      const fire = () => {
        const centerX = delivery.origin === 'caster' ? this.player.x : attackX;
        const centerY = delivery.origin === 'ground' ? this.groundY : attackY;
        this.hitArea(skill, centerX, centerY, directTotal * weights[i], rolledCrit, castToken, movementOriginX);
        if (skill.vfx.impact) {
          this.particles.playVfx(skill.vfx.impact, centerX, centerY - 18, {
            facing: this.player.facing,
            row: skill.vfx.identity.paletteRow,
          });
        }
      };
      if (i === 0) fire();
      else this.scheduleCombatTask(fire, (sequence.intervalMs ?? 80) * i);
    }
  }

  private normalizedHitWeights(falloff: readonly number[] | undefined, count: number): number[] {
    const raw = Array.from({ length: count }, (_, index) => Math.max(0, falloff?.[index] ?? 1));
    const sum = raw.reduce((total, value) => total + value, 0) || 1;
    return raw.map(value => value / sum);
  }

  private executeDistributedHits(
    skill: SkillDefinition,
    directTotal: number,
    rolledCrit: boolean,
    attackX: number,
    attackY: number,
    castToken: number,
  ) {
    const sequence = skill.mechanics.hits;
    const count = Math.max(1, sequence.count);
    const targets = this.getClosestEnemies(
      this.player.x,
      this.player.y,
      skill.mechanics.delivery.maxTargets ?? count,
      Math.max(skill.range, 550),
    );
    const distinct = skill.mechanics.delivery.kind === 'chain' || sequence.targeting === 'distinct';
    const resolvedCount = distinct ? Math.min(count, targets.length) : count;
    const weights = this.normalizedHitWeights(sequence.falloff, Math.max(1, resolvedCount));
    const points = [{ x: this.player.x, y: this.player.y - 20 }, ...targets.map(target => ({ x: target.x, y: target.y - 18 }))];
    if (skill.mechanics.delivery.kind === 'chain') this.particles.addChainLightning(points);

    for (let i = 0; i < resolvedCount; i++) {
      const target = targets.length ? targets[distinct ? i : i % targets.length] : null;
      const fire = () => {
        if (target && !target.isDead) {
          this.hitEnemyWithSkill(target, skill, directTotal * weights[i], rolledCrit, castToken);
          if (skill.vfx.impact) {
            this.particles.playVfx(skill.vfx.impact, target.x, target.y - 18, {
              facing: this.player.facing,
              row: skill.vfx.identity.paletteRow,
            });
          }
        } else if (i === 0 && targets.length === 0) {
          this.particles.addSkillIdentityAccent(attackX, attackY, this.player.facing, skill.vfx.identity);
        }
      };
      if (i === 0) fire();
      else this.scheduleCombatTask(fire, (sequence.intervalMs ?? 80) * i);
    }
  }

  private spawnSkillProjectiles(
    skill: SkillDefinition,
    directTotal: number,
    rolledCrit: boolean,
    attackX: number,
    castToken: number,
  ) {
    const delivery = skill.mechanics.delivery;
    const sequence = skill.mechanics.hits;
    const count = Math.max(1, sequence.count);
    const weights = this.normalizedHitWeights(sequence.falloff, count);
    const p = this.player;
    const identity = skill.vfx.identity;
    // Dragon Piercer still renders all 30 arrows, but six representative
    // arrows carry the combined damage of five visuals each. The old 30xN
    // piercing hit fan-out produced hundreds of sounds, text nodes, VFX, and
    // socket packets in one second without changing the skill's total damage.
    const damageStride = skill.id === 'ar_6' ? 5 : 1;

    for (let i = 0; i < count; i++) {
      const spawn = () => {
        const groupStart = Math.floor(i / damageStride) * damageStride;
        const groupEnd = Math.min(count, groupStart + damageStride);
        const damageCarrier = damageStride === 1 || i === Math.min(groupEnd - 1, groupStart + Math.floor(damageStride / 2));
        let projectileWeight = 0;
        if (damageCarrier) {
          for (let weightIndex = groupStart; weightIndex < groupEnd; weightIndex += 1) {
            projectileWeight += weights[weightIndex];
          }
        }
        const virtualHitDamages = damageCarrier && damageStride > 1
          ? weights
            .slice(groupStart, groupEnd)
            .map(weight => Math.max(1, Math.round(directTotal * weight)))
          : undefined;
        const projectileDamage = virtualHitDamages
          ? virtualHitDamages.reduce((sum, packet) => sum + packet, 0)
          : (damageCarrier ? Math.max(1, Math.round(directTotal * projectileWeight)) : 0);
        let x = p.x + p.facing * 20;
        let y = p.y - 14;
        let vx = p.facing * (delivery.speed ?? 12);
        let vy = 0;
        if (delivery.radial) {
          const angle = i / count * Math.PI * 2;
          vx = Math.cos(angle) * (delivery.speed ?? 12);
          vy = Math.sin(angle) * (delivery.speed ?? 12);
        } else if (sequence.targeting === 'rain') {
          x = attackX - skill.aoeRadius + (i + 0.5) * (skill.aoeRadius * 2 / count);
          y = Math.max(30, p.y - 260);
          vx = 0;
          vy = delivery.speed ?? 15;
        }

        this.particles.addProjectile(
          x,
          y,
          vx,
          vy,
          delivery.projectile || 'energy_ball',
          projectileDamage,
          skill.mechanics.payload.forceCrit || rolledCrit,
          true,
          identity.palette[i % identity.palette.length],
          delivery.projectile === 'dagger' ? 8 : skill.aoeRadius > 60 ? 15 : 10,
          Boolean(delivery.piercing),
          {
            maxDistance: sequence.targeting === 'rain' ? 300 : Math.max(80, skill.range),
            visualOnly: !damageCarrier,
            skillId: damageCarrier ? skill.id : undefined,
            impactVfx: damageCarrier ? skill.vfx.impact : undefined,
            impactRow: damageCarrier ? identity.paletteRow : undefined,
            aoeRadius: damageCarrier && skill.id === 'ar_4' ? skill.aoeRadius : 0,
            statuses: damageCarrier ? skill.mechanics.payload.statuses : undefined,
            lifesteal: damageCarrier ? skill.mechanics.payload.lifesteal : undefined,
            knockback: damageCarrier ? skill.mechanics.payload.knockback : undefined,
            knockUp: damageCarrier ? skill.mechanics.payload.knockUp : undefined,
            identity: damageCarrier ? identity : undefined,
            castToken: damageCarrier ? castToken : undefined,
            virtualHitDamages,
          },
        );
      };
      if (i === 0 || delivery.radial) spawn();
      else this.scheduleCombatTask(spawn, (sequence.intervalMs ?? 45) * i);
    }

    // Fan of Knives is readable immediately and the real dagger entities own
    // the eight split damage packets. Resolve their spawn-point overlaps now so
    // close targets do not wait a frame while preserving piercing travel.
    if (delivery.radial) this.checkProjectileCollisions();
  }

  private targetsForArea(
    skill: SkillDefinition,
    centerX: number,
    centerY: number,
    movementOriginX?: number,
  ): EnemyInstance[] {
    const shape = skill.mechanics.delivery.shape || 'point';
    const p = this.player;
    return this.enemies.filter(enemy => {
      if (enemy.isDead) return false;
      const dx = enemy.x - p.x;
      const forward = dx * p.facing;
      const vertical = Math.abs((enemy.y - 24) - centerY);
      if (vertical > 120) return false;
      if (shape === 'radial') return Math.abs(enemy.x - centerX) <= skill.aoeRadius + enemy.width / 2;
      if (shape === 'cone') return forward >= -12 && forward <= skill.range + enemy.width / 2;
      if (shape === 'line' || shape === 'lane' || shape === 'wall') {
        const move = skill.mechanics.movement;
        if (movementOriginX !== undefined && move && move.kind !== 'leap') {
          const pathMin = Math.min(movementOriginX, p.x) - enemy.width / 2;
          const pathMax = Math.max(movementOriginX, p.x) + enemy.width / 2;
          return enemy.x >= pathMin && enemy.x <= pathMax;
        }
        return forward >= -12 && forward <= Math.max(skill.range, skill.aoeRadius) + enemy.width / 2;
      }
      return Math.abs(enemy.x - centerX) <= skill.aoeRadius + enemy.width / 2;
    });
  }

  private hitArea(
    skill: SkillDefinition,
    centerX: number,
    centerY: number,
    damage: number,
    rolledCrit: boolean,
    castToken: number,
    movementOriginX?: number,
  ) {
    this.onPlayerWorldHit?.(
      { x: centerX, y: centerY, radius: Math.max(24, skill.aoeRadius || skill.range * 0.45) },
      Math.max(1, Math.round(damage)),
    );
    const targets = this.targetsForArea(skill, centerX, centerY, movementOriginX);
    targets.forEach(target => this.hitEnemyWithSkill(target, skill, damage, rolledCrit, castToken));
    if (targets.length) {
      this.player.comboCount++;
      this.player.comboTimer = 3;
      quests.onComboReached(this.player.comboCount);
    }
  }

  private hitEnemyWithSkill(
    enemy: EnemyInstance,
    skill: SkillDefinition,
    damage: number,
    rolledCrit: boolean,
    castToken: number,
    virtualHitDamages?: readonly number[],
  ) {
    const payload = skill.mechanics.payload;
    // Reactions may only consume a status that existed before this hit. That
    // prevents a single skill from applying and detonating its own setup.
    const statusesBeforeHit: ReactionStatusSnapshot[] = this.statusesForEnemy(enemy).map(status => ({
      kind: status.kind,
      remaining: status.remaining,
      remainingDamage: status.damageRemaining,
      sourceSkillId: status.sourceSkillId,
    }));
    const executeMultiplier = payload.executeBelowHp
      && enemy.hp / Math.max(1, enemy.maxHp) <= payload.executeBelowHp
      ? (payload.executeMultiplier ?? 1)
      : 1;
    const backHit = enemy.facing === this.player.facing;
    const crit = Boolean(payload.forceCrit)
      || rolledCrit
      || (backHit && Math.random() < (payload.backHitCritBonus || 0));
    let dealt = 0;
    if (virtualHitDamages?.length) {
      // One carrier represents several authored hits. Resolve every virtual
      // packet through the same crit/round/defence path the original arrows
      // used, then emit one combined gameplay/feedback/network event.
      const finalDamage = virtualHitDamages.reduce((sum, packet) => {
        let rawPacket = packet * executeMultiplier;
        if (crit) rawPacket *= BALANCE.critMultiplier;
        const roundedPacket = Math.max(1, Math.round(rawPacket));
        return sum + this.resolveEnemyDamage(enemy, roundedPacket, false);
      }, 0);
      if (finalDamage > 0) {
        dealt = this.applyResolvedDamageToEnemy(enemy, finalDamage, crit, this.player.facing, false);
      }
    } else {
      let rawDamage = damage * executeMultiplier;
      if (crit) rawDamage *= BALANCE.critMultiplier;
      dealt = rawDamage > 0
        ? this.applyDamageToEnemy(enemy, Math.max(1, Math.round(rawDamage)), crit, this.player.facing)
        : 0;
    }

    if (payload.knockUp) enemy.vy = -Math.max(Math.abs(enemy.vy), payload.knockUp);
    if (payload.knockback) enemy.vx = this.player.facing * payload.knockback;
    if (payload.lifesteal && dealt > 0) {
      const heal = Math.max(1, Math.round(dealt * payload.lifesteal));
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
      this.particles.addFloatingText(this.player.x, this.player.y - 34, `+${heal} HP`, '#e879f9', true, 15);
    }
    if (dealt > 0 && payload.reactionTags?.length) {
      this.applyElementalReactions(enemy, skill, dealt, castToken, statusesBeforeHit);
    }
    const directShare = payload.directDamageShare ?? 1;
    const preDirectPotency = directShare > 0 ? damage / directShare : damage;
    for (const status of enemy.isDead ? [] : (payload.statuses || [])) {
      this.applyEnemyStatus(enemy, status, skill, preDirectPotency, castToken);
    }
  }

  private applyElementalReactions(
    enemy: EnemyInstance,
    skill: SkillDefinition,
    dealt: number,
    castToken: number,
    statusesBeforeHit: readonly ReactionStatusSnapshot[],
  ) {
    const resolutions = resolveElementalReactions({
      targetId: enemy.id,
      castToken,
      sourceDamage: dealt,
      triggerTags: skill.mechanics.payload.reactionTags || [],
      statusesBeforeHit,
      nearbyTargets: this.enemies
        .filter(candidate => !candidate.isDead && candidate.id !== enemy.id)
        .map(candidate => ({ id: candidate.id, distance: Math.hypot(candidate.x - enemy.x, candidate.y - enemy.y) })),
      alreadyResolvedKeys: this.resolvedReactionKeys,
      sourceKind: 'skill',
    });

    for (const resolution of resolutions) {
      const relicScale = 1 + (this.runRelicReactionPower.get(resolution.reactionId) || 0);
      this.resolvedReactionKeys.add(resolution.dedupeKey);
      const consumed = new Set<EnemyStatusKind>(resolution.consumeStatusKinds);
      const remaining = (this.enemyStatuses.get(enemy.id) || []).filter(status => !consumed.has(status.kind));
      if (remaining.length) this.enemyStatuses.set(enemy.id, remaining);
      else this.enemyStatuses.delete(enemy.id);

      for (const damageEvent of resolution.damageEvents) {
        const target = this.enemies.find(candidate => candidate.id === damageEvent.targetId && !candidate.isDead);
        if (!target || damageEvent.amount <= 0) continue;
        const direction = target.x >= this.player.x ? 1 : -1;
        this.applyDamageToEnemy(
          target,
          Math.min(250_000, Math.max(1, Math.round(damageEvent.amount * relicScale))),
          false,
          direction,
        );
      }

      if (resolution.healing > 0) {
        const before = this.player.hp;
        const healing = Math.min(250_000, Math.max(1, Math.round(resolution.healing * relicScale)));
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + healing);
        const restored = this.player.hp - before;
        if (restored > 0) {
          this.particles.addFloatingText(this.player.x, this.player.y - 38, `+${restored} HP`, '#e879f9', true, 15);
        }
      }

      if (resolution.staggerDamage > 0 && enemy.guardState && !enemy.isDead) {
        const staggerDamage = Math.min(10_000, Math.round(resolution.staggerDamage * relicScale));
        const impact = resolveGuardStaggerImpact(enemy.guardState, {
          incomingDamage: 0,
          guardDamage: staggerDamage,
          staggerDamage,
          sourceDirection: enemy.x >= this.player.x ? -1 : 1,
          defenderFacing: enemy.facing < 0 ? -1 : 1,
          bypassGuard: true,
        });
        enemy.guardState = impact.state;
        if (impact.interrupted) enemy.attackIntent = undefined;
      }

      const spriteId = ELEMENT_REACTION_SPRITES[resolution.reactionId].payoff;
      this.addCombatSpriteEffect(spriteId, enemy.x, enemy.y - 10, 0.7, this.player.facing, 1);
      this.particles.playVfx(resolution.impactSpriteId, enemy.x, enemy.y - 20, { facing: this.player.facing });
      this.particles.addFloatingText(enemy.x, enemy.y - enemy.height - 22, resolution.displayName.toUpperCase(), '#fef3c7', true, 13);
      audio.playId(resolution.soundId, 0.9);
    }

    // Cast ids are monotonic; old dedupe keys no longer serve a purpose once
    // the bounded cache grows past several encounters.
    if (this.resolvedReactionKeys.size > 512) this.resolvedReactionKeys.clear();
  }

  private getClosestEnemy(maxRange: number = 400): EnemyInstance | null {
    let closest: EnemyInstance | null = null;
    let minDist = maxRange;
    this.enemies.forEach(e => {
      if (e.isDead) return;
      const dist = Math.hypot(e.x - this.player.x, e.y - this.player.y);
      if (dist < minDist) {
        minDist = dist;
        closest = e;
      }
    });
    return closest;
  }

  private findSkillById(skillId: string): SkillDefinition | null {
    for (const characterClass of CHARACTER_CLASSES) {
      const skill = characterClass.skills.find(candidate => candidate.id === skillId);
      if (skill) return skill;
    }
    return null;
  }

  private getClosestEnemies(x: number, y: number, count: number = 4, maxRange: number = 400): EnemyInstance[] {
    const alive = this.enemies.filter(e => !e.isDead && Math.hypot(e.x - x, e.y - y) < maxRange);
    alive.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    return alive.slice(0, count);
  }

  private calculateDamage(skill: SkillDefinition): number {
    const p = this.player;
    // +12% per point, so five points is a skill worth building around without
    // being a different skill.
    const invested = 1 + 0.12 * this.skillLevel(skill.id);
    const base = p.totalAtk * skill.damageMultiplier * BALANCE.playerDamage * invested;
    const variation = (Math.random() * 0.2 - 0.1) * base;
    return Math.max(1, Math.round(base + variation));
  }

  private executeAreaDamage(centerX: number, centerY: number, skill: SkillDefinition, multiplier: number = 1.0) {
    const p = this.player;
    const isCrit = Math.random() < p.totalCrit;
    let baseDmg = Math.round(this.calculateDamage(skill) * multiplier);
    if (isCrit) baseDmg = Math.round(baseDmg * BALANCE.critMultiplier);

    if (skill.isUltimate) {
      this.particles.triggerScreenShake(18, 0.65);
    }

    // Legacy per-skill sprite VFX lived here as a switch on skill.id and ran on
    // top of the catalogue effects, which is why the reworked skills still
    // looked like the old ones. Visuals now come solely from playSkillVfx.

    let hitAny = false;
    this.enemies.forEach(enemy => {
      if (enemy.isDead) return;
      // 2D Brawler AABB Area Hit Detection
      const distX = Math.abs(enemy.x - centerX);
      const distY = Math.abs((enemy.y - 24) - centerY);
      
      let effectiveDistX = distX;
      
      // Melee Blind-spot prevention:
      // If an attack reaches far (e.g., a spear thrust), the centerX is placed far ahead.
      // This causes enemies standing right in front of the player to be "behind" the hitbox and missed.
      // Fix: If the enemy is between the player and the centerX, treat their horizontal distance as 0 (guaranteed hit).
      const isBetween = (p.facing === 1 && enemy.x >= p.x && enemy.x <= centerX) || 
                        (p.facing === -1 && enemy.x <= p.x && enemy.x >= centerX);
      if (isBetween) {
        effectiveDistX = 0;
      }

      // If the VFX is spawned high up (e.g. centerY is off the ground), we still want to hit enemies underneath it
      // So we use a generous vertical cylinder (120px height tolerance)
      if (effectiveDistX <= skill.aoeRadius + (enemy.width || 40) / 2 && distY <= 120) {
        this.applyDamageToEnemy(enemy, baseDmg, isCrit, p.facing);
        hitAny = true;
      }
    });

    if (hitAny) {
      p.comboCount++;
      p.comboTimer = 3.0;
      quests.onComboReached(p.comboCount);
    }
  }

  private statusColour(kind: EnemyStatusKind): string {
    return ({
      slow: '#67e8f9',
      poison: '#84cc16',
      burn: '#fb923c',
      stun: '#fde047',
      frailty: '#c084fc',
      taunt: '#facc15',
      wet: '#38bdf8',
      freeze: '#a5f3fc',
      curse: '#d946ef',
    } satisfies Record<EnemyStatusKind, string>)[kind];
  }

  private statusMagnitude(enemy: EnemyInstance, kind: EnemyStatusKind): number {
    const statuses = this.enemyStatuses.get(enemy.id) || [];
    return statuses
      .filter(status => status.kind === kind)
      .reduce((largest, status) => Math.max(largest, status.magnitude), 0);
  }

  public statusesForEnemy(enemy: EnemyInstance): readonly EnemyCombatStatus[] {
    return this.enemyStatuses.get(enemy.id) || [];
  }

  private applyEnemyStatus(
    enemy: EnemyInstance,
    application: StatusApplication,
    skill: SkillDefinition,
    sourceDamage: number,
    castToken: number = 0,
  ) {
    if ((application.chance ?? 1) < Math.random()) return;
    const list = this.enemyStatuses.get(enemy.id) || [];
    const ticks = application.tickInterval
      ? Math.max(1, Math.ceil(application.duration / application.tickInterval))
      : 1;
    const damageTotal = application.damageShare ? Math.max(0, sourceDamage * application.damageShare) : 0;
    const damagePerTick = damageTotal > 0 ? damageTotal / ticks : 0;
    const existing = list.find(status => status.kind === application.kind && status.sourceSkillId === skill.id);
    if (existing) {
      existing.remaining = Math.max(existing.remaining, application.duration);
      existing.duration = application.duration;
      existing.magnitude = Math.max(existing.magnitude, application.magnitude || 0);
      // A repeated hit from the same cast and a later refresh both contribute
      // only their own reserved DoT budget. Keep the unpaid remainder instead
      // of replacing it (lost damage) or restarting a copy of the timer
      // (duplicated damage). The refreshed effect distributes that exact
      // aggregate over the ticks still available in the refreshed duration.
      existing.damageRemaining += damageTotal;
      existing.ticksRemaining = Math.max(existing.ticksRemaining, ticks);
      existing.damagePerTick = existing.ticksRemaining > 0
        ? existing.damageRemaining / existing.ticksRemaining
        : 0;
      existing.lastCastToken = castToken;
    } else {
      list.push({
        kind: application.kind,
        remaining: application.duration,
        duration: application.duration,
        magnitude: application.magnitude || 0,
        tickInterval: application.tickInterval || 0,
        tickTimer: application.tickInterval || 0,
        damagePerTick,
        damageRemaining: damageTotal,
        ticksRemaining: ticks,
        sourceSkillId: skill.id,
        colour: this.statusColour(application.kind),
        lastCastToken: castToken,
      });
      this.enemyStatuses.set(enemy.id, list);
      this.particles.addFloatingText(
        enemy.x,
        enemy.y - enemy.height / 2 - 12,
        application.kind.toUpperCase(),
        this.statusColour(application.kind),
        true,
        12,
      );
    }
    if (application.kind === 'stun') enemy.hitStun = Math.max(enemy.hitStun, application.duration);
  }

  private playerStatusMagnitude(kind: PlayerNegativeStatus['kind']): number {
    return this.playerNegativeStatuses
      .filter(status => status.kind === kind)
      .reduce((largest, status) => Math.max(largest, status.magnitude), 0);
  }

  /**
   * Apply a strictly bounded hostile status. This is public because a verified
   * host hit is resolved by the recipient, while local host hits use the same
   * path. Purge Flame now has real poison/burn/slow/stun entries to remove.
   */
  public applyPlayerNegativeStatus(status: PlayerDamageStatus, sourceId: string = 'enemy'): boolean {
    const kind = status?.kind;
    if (!['slow', 'poison', 'burn', 'stun'].includes(kind)) return false;
    const maxDuration = kind === 'stun' ? 2.5 : 8;
    if (!Number.isFinite(status.duration) || status.duration < 0.1 || status.duration > maxDuration) return false;
    const maxMagnitude = kind === 'slow' ? 0.8 : 1;
    if (!Number.isFinite(status.magnitude) || status.magnitude < 0 || status.magnitude > maxMagnitude) return false;

    const damageOverTime = kind === 'poison' || kind === 'burn';
    const tickInterval = damageOverTime ? Number(status.tickInterval) : 0;
    const rawTickDamage = damageOverTime ? Number(status.rawTickDamage) : 0;
    if (damageOverTime && (
      !Number.isFinite(tickInterval)
      || tickInterval < 0.25
      || tickInterval > 2
      || !Number.isFinite(rawTickDamage)
      || rawTickDamage < 1
      || rawTickDamage > 100_000
    )) return false;
    if (!damageOverTime && (status.tickInterval !== undefined || status.rawTickDamage !== undefined)) return false;

    const safeSourceId = String(sourceId || 'enemy').slice(0, 96);
    const existing = this.playerNegativeStatuses.find(entry => entry.kind === kind && entry.sourceId === safeSourceId);
    if (existing) {
      existing.remaining = Math.max(existing.remaining, status.duration);
      existing.magnitude = Math.max(existing.magnitude, status.magnitude);
      existing.tickInterval = tickInterval;
      existing.tickTimer = damageOverTime ? Math.min(existing.tickTimer, tickInterval) : 0;
      existing.rawTickDamage = Math.max(existing.rawTickDamage, rawTickDamage);
    } else {
      this.playerNegativeStatuses.push({
        kind,
        remaining: status.duration,
        magnitude: status.magnitude,
        tickInterval,
        tickTimer: tickInterval,
        rawTickDamage,
        sourceId: safeSourceId,
      });
    }

    if (kind === 'stun') this.player.vx = 0;
    this.particles.addFloatingText(
      this.player.x,
      this.player.y - this.player.height / 2 - 12,
      kind.toUpperCase(),
      this.statusColour(kind),
      true,
      12,
    );
    return true;
  }

  private applyPlayerStatusTick(status: PlayerNegativeStatus) {
    const p = this.player;
    if (p.downed || this.runOver || p.hp <= 0 || status.rawTickDamage <= 0) return;
    const mitigated = Math.max(
      1,
      Math.round(afterDefence(status.rawTickDamage, p.totalDef) * this.incomingDamageMultiplier()),
    );
    const { hpDamage, absorbed } = this.absorbPlayerDamage(mitigated);
    p.hp = Math.max(0, p.hp - hpDamage);
    this.damageTaken += hpDamage;
    this.lastHurtAt = performance.now();
    if (absorbed > 0) {
      this.particles.addFloatingText(p.x, p.y - p.height / 2 - 14, `SHIELD -${absorbed}`, '#60a5fa', false, 12);
    }
    if (hpDamage > 0) {
      this.particles.addFloatingText(
        p.x,
        p.y - p.height / 2,
        `${status.kind.toUpperCase()} -${hpDamage}`,
        this.statusColour(status.kind),
        false,
        14,
      );
    }
    this.resolvePlayerDefeat();
  }

  private updateCombatStatuses(dt: number) {
    for (const [enemyId, statuses] of this.enemyStatuses) {
      const enemy = this.enemies.find(candidate => candidate.id === enemyId);
      if (!enemy || enemy.isDead) {
        this.enemyStatuses.delete(enemyId);
        continue;
      }
      for (let i = statuses.length - 1; i >= 0; i--) {
        const status = statuses[i];
        status.remaining -= dt;
        if (status.tickInterval > 0 && status.damageRemaining > 0 && status.ticksRemaining > 0) {
          status.tickTimer -= dt;
          // Process the tick that lands exactly on expiry before removing the
          // status. Without this, a five-second poison only paid four of its
          // five reserved ticks when updated in one-second steps.
          while (status.tickTimer <= 0 && status.ticksRemaining > 0 && !enemy.isDead) {
            status.tickTimer += status.tickInterval;
            const tickDamage = Math.max(1, Math.round(status.damageRemaining / status.ticksRemaining));
            this.applyDamageToEnemy(enemy, tickDamage, false, 0);
            status.damageRemaining = Math.max(0, status.damageRemaining - tickDamage);
            status.ticksRemaining--;
            status.damagePerTick = status.ticksRemaining > 0
              ? status.damageRemaining / status.ticksRemaining
              : 0;
          }
        }
        if (status.remaining <= 0) {
          statuses.splice(i, 1);
          this.particles.addFloatingText(enemy.x, enemy.y - enemy.height / 2 - 10, `${status.kind.toUpperCase()} ENDED`, status.colour, false, 10);
        }
      }
      if (!statuses.length) this.enemyStatuses.delete(enemyId);
    }

    for (let i = this.playerNegativeStatuses.length - 1; i >= 0; i--) {
      const status = this.playerNegativeStatuses[i];
      status.remaining -= dt;
      if (status.tickInterval > 0 && status.rawTickDamage > 0) {
        status.tickTimer -= dt;
        while (status.tickTimer <= 0 && !this.player.downed && !this.runOver) {
          status.tickTimer += status.tickInterval;
          this.applyPlayerStatusTick(status);
        }
      }
      if (status.remaining <= 0) this.playerNegativeStatuses.splice(i, 1);
    }
  }

  private resolveEnemyDamage(enemy: EnemyInstance, rawDamage: number, fromRemote: boolean): number {
    const frailty = this.statusMagnitude(enemy, 'frailty');
    const effectiveDef = enemy.def * (1 - frailty);
    return fromRemote
      ? Math.max(1, Math.round(rawDamage))
      : Math.max(1, Math.round(afterDefence(rawDamage, effectiveDef)));
  }

  public applyDamageToEnemy(enemy: EnemyInstance, rawDamage: number, isCrit: boolean, knockbackDir: number, fromRemote: boolean = false): number {
    let finalDamage = this.resolveEnemyDamage(enemy, rawDamage, fromRemote);
    if (enemy.guardState) {
      const directional = knockbackDir !== 0;
      const impact = resolveGuardStaggerImpact(enemy.guardState, {
        incomingDamage: finalDamage,
        guardDamage: Math.max(8, rawDamage * 0.9),
        staggerDamage: Math.max(5, rawDamage * 0.48),
        sourceDirection: knockbackDir > 0 ? -1 : 1,
        defenderFacing: enemy.facing < 0 ? -1 : 1,
        bypassGuard: !directional,
      });
      enemy.guardState = impact.state;
      finalDamage = impact.resolvedDamage;
      if (impact.guarded) {
        this.addCombatSpriteEffect('combat.guard', enemy.x, enemy.y - 8, 0.26, enemy.facing, 0.75);
      }
      if (impact.guardBroken) {
        this.addCombatSpriteEffect(COMBAT_FEEDBACK_SPRITES['guard-break'], enemy.x, enemy.y - 18, 0.7, enemy.facing, 1);
        this.particles.addFloatingText(enemy.x, enemy.y - enemy.height - 10, 'GUARD BREAK', '#fbbf24', true, 13);
        audio.playId('hit_blunt', 1.05);
      } else if (impact.staggered && impact.interrupted) {
        this.addCombatSpriteEffect(COMBAT_FEEDBACK_SPRITES.stagger, enemy.x, enemy.y - 20, 0.62, enemy.facing, 0.9);
        this.particles.addFloatingText(enemy.x, enemy.y - enemy.height - 10, 'STAGGERED', '#fde047', true, 12);
      }
      if (impact.interrupted) enemy.attackIntent = undefined;
    }
    if (finalDamage <= 0) return 0;
    return this.applyResolvedDamageToEnemy(enemy, finalDamage, isCrit, knockbackDir, fromRemote);
  }

  private applyResolvedDamageToEnemy(
    enemy: EnemyInstance,
    finalDamage: number,
    isCrit: boolean,
    knockbackDir: number,
    fromRemote: boolean,
  ): number {
    enemy.hp -= finalDamage;
    // Only count damage we actually dealt. A remote packet is a teammate's
    // blow arriving for replay, and crediting it would hand everyone the same
    // total and make the summary meaningless.
    if (!fromRemote) this.damageDealt += finalDamage;
    enemy.hitStun = enemy.guardState?.staggeredRemaining
      ? Math.max(0.25, enemy.guardState.staggeredRemaining)
      : enemy.guardState?.guarding ? 0.06 : 0.25;
    // Knockback used to be a flat 3.5 on every hit, including the basic attack -
    // and the basic attack is the one you use continuously, so monsters were
    // shoved out of reach faster than they could walk back in. It now follows
    // the weight of the blow: a poke barely moves them, an ultimate still
    // throws them.
    const knockbackScale = enemy.guardState?.guarding ? 0.25 : 1;
    const knockback = Math.min(3.2, 0.7 + finalDamage / 90) * knockbackScale;
    enemy.vx = knockbackDir * knockback;
    enemy.vy = -Math.min(2.2, 0.4 + knockback * 0.45);

    // Report the hit to the party. These used to be dynamic import() calls,
    // which silently dropped the packet whenever the split chunk failed to load
    // on mobile - that is why the guest could never damage anything.
    if (!fromRemote) {
      const enemyIdentifier = enemy.id || this.enemies.indexOf(enemy).toString();
      if (enemyIdentifier !== '-1') {
        if (this.isHost) {
          network.sendEnemyHit(enemyIdentifier, finalDamage, isCrit, knockbackDir, enemy.hp);
        } else {
          // Guest predicts the hit locally (above) for responsiveness; the host
          // remains authoritative and the next enemy_sync reconciles real HP.
          network.sendDamageEnemy(enemyIdentifier, finalDamage, knockbackDir);
        }
      }
    }

    // Hit-stop micro freeze and crunchy screen shake on impact
    this.hitStopTimer = isCrit ? 0.045 : 0.02;
    this.particles.triggerScreenShake(isCrit ? 7 : 2.5, 0.14);

    audio.playHit(isCrit);
    this.particles.addFloatingText(enemy.x, enemy.y - enemy.height / 2, `${finalDamage}`, isCrit ? '#ffd54f' : '#ffffff', isCrit);
    this.particles.playVfx(isCrit ? 'fx_hit_big' : 'fx_spark_a', enemy.x, enemy.y - 12, { scale: isCrit ? 1.4 : 1 });

    // Custom Hit VFX for Warrior

    if (enemy.hp <= 0 && !enemy.isDead) {
      if (!fromRemote) this.killCount++;
      if (this.isHost) {
        this.onEnemyDefeated(enemy);
      }
    }
    return finalDamage;
  }

  public onEnemyDefeated(enemy: EnemyInstance) {
    enemy.isDead = true;
    enemy.hp = 0;
    this.onEnemyDefeatedEvent?.(enemy.id);
    this.miniBossTriggered.delete(enemy.id);

    if (this.isHost && enemy.eliteModifiers?.includes('volatile')) {
      const profile = getEnemyAttackProfile('boss-nova');
      const intentId = `volatile_${enemy.id}_${++this.combatIntentNonce}`;
      this.addCombatSpriteEffect(ELEMENT_REACTION_SPRITES['burn-explosion'].payoff, enemy.x, enemy.y, 0.72, enemy.facing, 1.05);
      this.eligibleCombatPlayerTargets()
        .filter(target => Math.hypot(target.x - enemy.x, (target.y - enemy.y) * 0.5) <= 145)
        .forEach(target => this.enemyAttackCombatTarget(
          enemy,
          target,
          1.1,
          { kind: 'burn', duration: 2.5, magnitude: 0.08, tickInterval: 1, rawTickDamage: Math.max(1, Math.round(enemy.atk * 0.12)) },
          'dodge-only',
          intentId,
          profile.id,
        ));
    }
    
    if (this.isHost) {
      network.sendEnemyDied({
        id: enemy.id,
        name: enemy.name,
        type: enemy.type,
        x: enemy.x,
        y: enemy.y,
        lootDrop: enemy.lootDrop,
        expReward: enemy.expReward,
        goldReward: enemy.goldReward,
        color: enemy.color
      }, this.groundY);
    }

    // Trigger quest kill tracker
    quests.onEnemyKilled(enemy.name, enemy.type === 'boss');
    // Daily/hourly mission counters
    recordEvent('enemies_killed');
    if (enemy.type === 'boss') recordEvent('bosses_killed');
    if (enemy.isElite || enemy.type === 'elite') recordEvent('elites_killed');

    // Track corpse position for Necromancer Corpse Explosion
    this.recentCorpsePositions.push({ x: enemy.x, y: enemy.y });
    if (this.recentCorpsePositions.length > 8) {
      this.recentCorpsePositions.shift();
    }

    // Gain EXP and Gold
    this.addExp(enemy.expReward);
    this.player.gold += enemy.goldReward;
    this.particles.addFloatingText(enemy.x, enemy.y - 30, `+${enemy.goldReward} Gold`, '#ffd700', false, 14);

    // Spawn Loot Drop
    if (enemy.lootDrop) {
      this.spawnDroppedLoot(enemy.lootDrop, enemy.x, enemy.y);
    }

    // Bosses can drop their own monster card - Darkrise's "farm the boss for
    // its card" loop. The card matches the dungeon, so it is always a chase.
    if (enemy.type === 'boss' && Math.random() < BOSS_CARD_DROP_CHANCE) {
      const card = getCardForDungeon(this.currentDungeonId);
      if (card) {
        this.spawnDroppedLoot(makeCardItem(card), enemy.x + 18, enemy.y - 6);
        this.particles.addFloatingText(enemy.x, enemy.y - 70, `${card.name}!`, '#c084fc', true, 20);
      }
    }

    // Death VFX & SFX
    if (enemy.type === 'boss') {
      audio.playBossRoar();
      this.particles.triggerScreenShake(14, 0.6);
      this.particles.addFloatingText(enemy.x, enemy.y - 50, 'BOSS DEFEATED!', '#ffd54f', true, 26);
    } else {
    }
  }

  private spawnDroppedLoot(item: ItemData, x: number, y: number) {
    this.droppedLoots.push({
      id: `loot_${Date.now()}_${Math.random()}`,
      item,
      x,
      y,
      vx: (Math.random() - 0.5) * 4,
      vy: -5,
      isGrounded: false,
      bobTimer: Math.random() * Math.PI * 2,
      despawnTimer: 30,
      maxLifetime: 30
    });
  }

  /**
   * EXP earned per extra party member. Co-op had no mechanical advantage over
   * playing alone - it was purely social - so the sensible way to level was to
   * go by yourself. Bringing people has to pay.
   */
  public static readonly PARTY_EXP_PER_MEMBER = 0.10;

  /** Everyone in the room, us included. */
  public partySize(): number {
    if (!network.room) return 1;
    return 1 + Object.keys(network.remotePlayers).length;
  }

  public addExp(amount: number) {
    const p = this.player;
    const members = this.partySize();
    const bonus = (members - 1) * SideViewEngine.PARTY_EXP_PER_MEMBER;
    const total = Math.max(1, Math.round(amount * (1 + bonus)));
    p.exp += total;
    this.particles.addFloatingText(
      p.x, p.y - 45,
      bonus > 0 ? `+${total} EXP (+${Math.round(bonus * 100)}% party)` : `+${total} EXP`,
      bonus > 0 ? '#7dd3fc' : '#42a5f5', false, 15,
    );

    while (p.exp >= p.maxExp) {
      p.exp -= p.maxExp;
      p.level++;
      // A level was a number going up and nothing to decide. One point per
      // level makes it a choice, and makes two level-20 mages different.
      p.skillPoints = (p.skillPoints || 0) + 1;
      p.maxExp = Math.round(p.maxExp * 1.5);
      this.triggerSave();
      this.recomputeStats();
      p.hp = p.maxHp;
      p.mp = p.maxMp;

      audio.playLevelUp();
      this.particles.addFloatingText(p.x, p.y - 60, 'LEVEL UP!', '#ffd700', true, 24);
    }
  }


  public triggerSave() {
    SaveManager.saveGame(this.player, this.player.inventory, this.player.maxDungeonCleared, this.computePower());
  }

  public loadSaveData(data: any) {
    if (!data || !data.playerState) return;
    
    // Restore player state
    const ps = data.playerState;
    if (ps.level) this.player.level = ps.level;
    if (ps.exp) this.player.exp = ps.exp;
    if (ps.maxExp) this.player.maxExp = ps.maxExp;
    if (ps.gold) this.player.gold = ps.gold;
    // Currencies default to their starting values when a save predates them.
    if (typeof ps.diamonds === 'number') this.player.diamonds = ps.diamonds;
    if (typeof ps.keysOfPower === 'number') this.player.keysOfPower = ps.keysOfPower;
    if (typeof ps.unificationStones === 'number') this.player.unificationStones = ps.unificationStones;
    if (typeof ps.magicSubstance === 'number') this.player.magicSubstance = ps.magicSubstance;
    if (data.maxDungeonCleared) this.player.maxDungeonCleared = data.maxDungeonCleared;
    if (data.inventory) this.player.inventory = data.inventory;

    // Restored slot by slot rather than by replacing the object, so a save
    // written before equipment was persisted still loads and simply leaves the
    // empty slots empty.
    if (ps.skillLevels) this.player.skillLevels = ps.skillLevels;
    if (typeof ps.skillPoints === 'number') this.player.skillPoints = ps.skillPoints;

    if (ps.equipment) {
      // Walk what was saved, not what the fresh player has. A new player starts
      // with `equipment: {}` - an object with no keys at all - so iterating its
      // keys ran the loop zero times and restored nothing. Equipping removed the
      // item from the bag and stored it here, both saved correctly; it was the
      // reload that dropped it, which is why an equipped item vanished from the
      // slot and the bag at once while everything still in the bag survived.
      for (const slot of Object.keys(ps.equipment) as Array<keyof typeof this.player.equipment>) {
        const item = ps.equipment[slot];
        if (item) this.player.equipment[slot] = item;
      }
    }

    this.recomputeStats();
    this.player.hp = this.player.maxHp;
    this.player.mp = this.player.maxMp;
  }

  /** Resolve zero HP before any passive effect can make it positive again. */
  private resolvePlayerDefeat() {
    const p = this.player;
    if (p.hp > 0 || p.downed || this.runOver) return;

    const preventionIndex = p.activeBuffs.findIndex(buff => buff.stat === 'deathPrevention' && (buff.amount || 0) > 0);
    if (preventionIndex >= 0) {
      const prevention = p.activeBuffs[preventionIndex];
      p.activeBuffs.splice(preventionIndex, 1);
      p.hp = Math.max(1, Math.round(p.maxHp * Math.max(0.1, prevention.multiplier)));
      p.mp = Math.max(p.mp, Math.round(p.maxMp * 0.25));
      p.downed = false;
      p.downTimer = 0;
      p.iframeTimer = 2.5;
      p.animState = 'idle';
      this.particles.addFloatingText(p.x, p.y - 46, 'RESURRECTION BLESSING', '#fef3c7', true, 18);
      this.recomputeStats();
      return;
    }

    const reviveIdx = p.inventory.findIndex(
      item => item.id === 'pot_revive_feather' || item.consumableEffect?.type === 'revive',
    );
    if (reviveIdx !== -1) {
      p.inventory.splice(reviveIdx, 1);
      p.hp = Math.round(p.maxHp * 0.6);
      p.mp = Math.round(p.maxMp * 0.6);
      p.iframeTimer = 2.5;
      p.animState = 'idle';
      audio.playLevelUp();
      this.particles.addFloatingText(p.x, p.y - 40, 'PHOENIX FEATHER RESURRECTION!', '#ffd700', true, 20);
      this.triggerSave();
      return;
    }

    p.vx = 0;
    p.attackTimer = 0;
    p.isDashing = false;
    p.animState = 'dead';
    p.hp = 0;

    if (this.canBeRevived()) {
      p.downed = true;
      p.downTimer = SideViewEngine.BLEED_OUT_SECONDS;
      p.revivesUsed = (p.revivesUsed || 0) + 1;
      this.cancelDelayedCombatTasks();
      audio.playHit();
      this.particles.addFloatingText(p.x, p.y - 46, 'DOWNED! HOLD ON!', '#ff6b6b', true, 18);
      network.sendPartySupport({ kind: 'downed', casterName: this.playerName() });
      return;
    }

    this.runOver = true;
    this.cancelDelayedCombatTasks();
    this.onRunLost?.();
  }

  public update(dt: number) {
    this.ensureZoneGeometry();
    // This must precede hit-stop, ultimate freezes, and regeneration. The old
    // order let 1% HP regen turn a lethal 0 into a positive number, skipping
    // downed/death resolution entirely.
    this.resolvePlayerDefeat();

    // The director runs on unscaled time - it must not slow itself down.
    this.ultimate.update(dt);

    // Input gates tick on real time, ABOVE every early return. This lived
    // inside the hit-stop block, so it only counted down during a freeze -
    // meaning after one cast it never reached zero and every skill button went
    // dead for the rest of the run.
    if (this.castLock > 0) this.castLock = Math.max(0, this.castLock - dt);
    this.playerDefense = tickPlayerDefenseState(this.playerDefense, dt);
    this.updateCombatSpriteEffects(dt);

    // 0. Hit-Stop Micro Freeze check (Crunchy combat impact feeling)
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      this.particles.update(dt);
      // Gameplay projectiles keep moving while cosmetic VFX animate through
      // hit-stop, so their swept collision must resolve in the same frame.
      this.checkProjectileCollisions();
      return;
    }

    // Slow the world during an ultimate. Every system downstream just sees a
    // smaller dt, so none of them need to know a cinematic is running.
    //
    // Effects are deliberately NOT slowed to the same degree. At 0.28x they
    // stayed on screen ~3.5x longer while more kept spawning, so the heaviest
    // moment in the game also became the longest - which is what made the
    // ultimate hang. They run at a floor of 0.75x: still visibly slower, but
    // they clear.
    const worldScale = this.ultimate.timeScale;
    const fxDt = dt * Math.max(0.75, worldScale);
    dt *= worldScale;
    if (dt <= 0) {
      this.particles.update(fxDt);
      this.checkProjectileCollisions();
      return;
    }

    const p = this.player;
    const dtFrame = dt * this.physicsFrameScale;
    this.updateZoneHazards(dt);
    this.updateCombatStatuses(dt);

    // Bleeding out. Ticked before anything else so a downed player cannot act,
    // and so the countdown keeps running while the fight carries on around it.
    this.tickDowned(dt);
    this.tickPartyChatter(dt);

    // 1. Cooldowns & Timers
    Object.keys(p.skillCooldowns).forEach(skillId => {
      if (p.skillCooldowns[skillId] > 0) {
        p.skillCooldowns[skillId] = Math.max(0, p.skillCooldowns[skillId] - dt);
      }
    });

    if (p.dashTimer > 0) {
      p.dashTimer -= dt;
      if (p.dashTimer <= 0) p.isDashing = false;
    }

    if (p.dashCooldown > 0) {
      p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    }

    if (p.iframeTimer > 0) {
      p.iframeTimer -= dt;
    }

    if (p.stealthTimer > 0) {
      p.stealthTimer -= dt;
    }

    if (p.comboTimer > 0) {
      p.comboTimer -= dt;
      if (p.comboTimer <= 0) {
        p.comboCount = 0;
      }
    }

    if (p.comboResetTimer > 0) {
      p.comboResetTimer -= dt;
      if (p.comboResetTimer <= 0) {
        p.comboStep = 0;
      }
    }

    // Ghost trails (afterimages) on dashing and high-speed attack animation
    if (p.isDashing || p.animState === 'attack') {
      p.ghostTrailTimer = (p.ghostTrailTimer || 0) + dt;
      if (p.ghostTrailTimer >= 0.05) {
        p.ghostTrailTimer = 0;
        this.particles.addGhostTrail(p.x, p.y, p.facing, p.characterClass.id, p.animState, p.attackTimer, p.characterClass.accentColor);
      }
    }

    // 2. Active Buff Timers
    for (let i = p.activeBuffs.length - 1; i >= 0; i--) {
      p.activeBuffs[i].timer -= dt;
      if (p.activeBuffs[i].timer <= 0) {
        p.activeBuffs.splice(i, 1);
        this.recomputeStats();
      }
    }

    // 3. Passive regeneration. Mana remains available during active combat so
    // rotations recover; HP waits five seconds after a hit. Neither resource
    // can regenerate while downed/dead or after the run has ended.
    if (!p.downed && !this.runOver && p.hp > 0) {
      p.mp = Math.min(p.maxMp, p.mp + (p.maxMp * 0.05) * dt);
      const outOfCombat = this.isTownMode || performance.now() - this.lastHurtAt >= 5000;
      if (outOfCombat) p.hp = Math.min(p.maxHp, p.hp + (p.maxHp * 0.01) * dt);
    }

    // 4. Update Animation State
    if (p.downed || this.runOver || p.hp <= 0) {
      p.animState = 'dead';
    } else if (p.attackTimer > 0) {
      p.attackTimer -= dt;
      // Hold the swing long enough to read, then give the animation back to
      // movement. Without this the hero slid along in an attack pose for the
      // whole timer, which looks exactly like the walk being interrupted.
      const elapsed = this.attackHold - p.attackTimer;
      const moving = p.isGrounded && Math.abs(p.vx) > 0.5;
      p.animState = (moving && elapsed > 0.18) ? 'run' : 'attack';
    } else if (!p.isGrounded) {
      p.animState = 'jump';
    } else if (Math.abs(p.vx) > 0.5) {
      p.animState = 'run';
    } else {
      p.animState = 'idle';
    }

    sprites.update(dt);

    // 6. Player Physics
    p.vy += this.gravity * dtFrame;
    p.x += p.vx * dtFrame;
    p.y += p.vy * dtFrame;
    if (p.isGrounded && Math.abs(p.vx) > 0.5) {
      const bobSpeed = 12 * (Math.max(0.75, Math.min(1.6, Math.abs(p.vx) / Math.max(1, this.player.totalSpeed))));
      this.playerRunBob += bobSpeed * dt;
    } else {
      const settleSpeed = Math.max(0.01, Math.min(0.2, dt * 5));
      this.playerRunBob *= 1 - settleSpeed;
    }

    // Drop-through timer update
    if (p.dropThroughTimer > 0) {
      p.dropThroughTimer -= dt;
    }

    // Platform landing check
    let landedOnPlatform = false;
    if (p.vy >= 0 && (!p.dropThroughTimer || p.dropThroughTimer <= 0)) {
      for (const plat of this.collisionPlatforms()) {
        if (p.x >= plat.x - 12 && p.x <= plat.x + plat.width + 12) {
          const prevY = p.y - p.vy * dtFrame;
          if (prevY <= plat.y + 4 && p.y >= plat.y) {
            const landingVy = p.vy;
            p.y = plat.y;
            p.vy = 0;
            p.isGrounded = true;
            p.hasJumpedOnce = false;
            landedOnPlatform = true;

            // Plunging dive attack landing impact explosion
            if (p.attackTimer > 0 && p.animState === 'attack' && landingVy > 8) {
              this.particles.triggerScreenShake(14, 0.4);
              this.particles.addGroundExplosion(p.x, plat.y - 20, 2.0);
              this.particles.addImpactBurst(p.x, plat.y, 30, '#ffd700', 'spark');
              const diveSkill = p.characterClass.skills[0];
              this.executeAreaDamage(p.x, plat.y, diveSkill, 1.8);
            }
            break;
          }
        }
      }
    }

    // Ground collision: feet land directly on groundY
    if (!landedOnPlatform) {
      if (p.y >= this.groundY) {
        const landingVy = p.vy;
        p.y = this.groundY;
        p.vy = 0;
        p.isGrounded = true;
        p.hasJumpedOnce = false;

        // Plunging dive attack landing impact explosion on floor
        if (p.attackTimer > 0 && p.animState === 'attack' && landingVy > 8) {
          this.particles.triggerScreenShake(14, 0.4);
          this.particles.addGroundExplosion(p.x, this.groundY - 20, 2.0);
          this.particles.addImpactBurst(p.x, this.groundY, 30, '#ffd700', 'spark');
          const diveSkill = p.characterClass.skills[0];
          this.executeAreaDamage(p.x, this.groundY, diveSkill, 1.8);
        }
      } else {
        p.isGrounded = false;
      }
    }

    // Apply horizontal friction when on ground
    if (p.isGrounded && !p.isDashing) {
      p.vx *= Math.exp(-12 * dt);
    }

    // Clamp Player within arena
    p.x = Math.max(40, Math.min(this.arenaWidth - 40, p.x));

    // Smooth dynamic camera tracking
    const runLeadFactor = Math.min(1, Math.abs(p.vx) / Math.max(1, this.player.totalSpeed));
    const targetLead = (Math.abs(p.vx) > 0.5 ? this.cameraLookAheadPx * Math.sign(p.vx) * runLeadFactor : 0);
    this.cameraLeadOffset += (targetLead - this.cameraLeadOffset) * (1 - Math.exp(-this.cameraLeadRecoverySpeed * dt));
    const lookAhead = this.cameraLeadOffset;
    const rawTargetCam = p.x + lookAhead - this.canvasWidth * 0.5;
    const targetCamX = Math.min(
      Math.max(0, this.arenaWidth - this.canvasWidth),
      Math.max(0, rawTargetCam)
    );
    const cameraDelta = targetCamX - this.cameraX;
    const smoothedStep = 1 - Math.exp(-this.cameraFollowSpeed * dt);
    this.cameraX += cameraDelta * smoothedStep;
    this.cameraX = Math.max(0, Math.min(this.arenaWidth - this.canvasWidth, this.cameraX));

    // 7. Update Enemy AI
    this.updateEnemies(dt);

    // 8. Update Dropped Loot Physics & Pickup
    this.updateLoot(dt);

    // 9. Update Particles & Entities
    this.particles.update(fxDt);
    this.checkProjectileCollisions();
    this.checkSpecialSkillEntities(dt);

    // 10. Sync Player Position over Network (20 times a second)
    this.playerSyncTimer -= dt;
    if (this.playerSyncTimer <= 0) {
      this.playerSyncTimer = 0.05;
      network.sendPlayerMove(
        this.player,
        this.groundY,
        this.player.attackTimer > 0,
        this.isTownMode,
        this.networkSceneId,
      );
    }

    // 11. Host Broadcasts Enemy State over Network (10 times a second)
    if (this.isHost && !this.isTownMode) {
      this.syncTimer -= dt;
      if (this.syncTimer <= 0) {
        this.syncTimer = 0.1;
        network.sendEnemySync(this.enemies, this.groundY, this.currentWaveIndex, this.currentDungeonIndex, this.currentDungeonId);
      }
    }
  }

  private updateShadowCloneStrikes() {
    const skill = this.findSkillById('ni_2');
    if (!skill) return;

    for (const clone of this.particles.shadowClones) {
      if (clone.hasStruck || clone.life < 0.11) continue;
      clone.hasStruck = true;

      // Remote replicas carry zero damage. They still complete their visual
      // attack once, but never participate in this client's authoritative
      // enemy simulation.
      if (clone.damage <= 0) continue;
      const reach = Math.max(80, skill.range, skill.aoeRadius);
      const target = this.enemies
        .filter(enemy => (
          !enemy.isDead
          && Math.abs(enemy.x - clone.x) <= reach + enemy.width / 2
          && Math.abs((enemy.y - 24) - clone.y) <= 120
        ))
        .sort((a, b) => Math.hypot(a.x - clone.x, a.y - clone.y) - Math.hypot(b.x - clone.x, b.y - clone.y))[0];
      if (!target) continue;

      this.hitEnemyWithSkill(target, skill, clone.damage, false, ++this.skillCastToken);
      if (skill.vfx.impact) {
        this.particles.playVfx(skill.vfx.impact, target.x, target.y - 18, {
          facing: clone.facing,
          row: skill.vfx.identity.paletteRow,
        });
      }
    }
  }

  private checkSpecialSkillEntities(dt: number) {
    this.updateShadowCloneStrikes();
    const ownerState = (ownerSocketId: string | null | undefined) => {
      if (!ownerSocketId) return null;
      if (network.socket && ownerSocketId === network.socket.id) {
        return this.player;
      }
      const remoteP = network.remotePlayers[ownerSocketId];
      return remoteP ? {
        x: remoteP.x,
        y: remoteP.y,
        facing: remoteP.facing || this.player.facing,
        animState: remoteP.animState || 'idle',
        isTownMode: Boolean(remoteP.isTownMode)
      } : null;
    };

    // A. Update Summoned Minions (Skeletons & Active Elder Dragon Companion)
    this.particles.summonedMinions.forEach(minion => {
      let targetEnemy: EnemyInstance | null = null;
      let minDist = minion.type === 'dragon' ? 950 : 800;

      this.enemies.forEach(e => {
        if (e.isDead) return;
        const d = Math.abs(e.x - minion.x);
        if (d < minDist) {
          minDist = d;
          targetEnemy = e;
        }
      });

      if (minion.type === 'skeleton') {
        const follow = ownerState(minion.ownerSocketId);
        if (targetEnemy) {
          const dx = (targetEnemy as EnemyInstance).x - minion.x;
          minion.facing = dx > 0 ? 1 : -1;
          if (Math.abs(dx) > 45) {
            minion.state = 'walk';
            minion.x += minion.facing * 3.5;
          } else {
            // Attack!
            if (minion.attackCooldown <= 0) {
              minion.state = 'attack';
              minion.attackCooldown = 0.9;
              this.particles.addSpellSlash((targetEnemy as EnemyInstance).x, (targetEnemy as EnemyInstance).y - 15, minion.facing, 1.3, '#a855f7');
              this.applyDamageToEnemy(targetEnemy, minion.damage, false, minion.facing);
            } else {
              minion.state = 'idle';
            }
          }
        } else {
          // Follow master smoothly
          const followState = follow || this.player;
          const followX = followState.x - followState.facing * 45;
          const distToPlayer = followX - minion.x;
          if (Math.abs(distToPlayer) > 30) {
            minion.facing = distToPlayer > 0 ? 1 : -1;
            minion.x += minion.facing * 3.0;
            minion.state = 'walk';
          } else {
            minion.facing = followState.facing;
            minion.state = 'idle';
          }
        }
      } else if (minion.type === 'dragon') {
        const follow = ownerState(minion.ownerSocketId);
        minion.y = this.groundY; // Firmly anchored on ground
        if (minion.skillCooldown === undefined) minion.skillCooldown = 1.0;
        if (minion.skillCooldown > 0) minion.skillCooldown -= dt;

        if (targetEnemy) {
          const dx = (targetEnemy as EnemyInstance).x - minion.x;
          minion.facing = dx > 0 ? 1 : -1;
          const dist = Math.abs(dx);

          // Skill 2 & 3: Magma Meteor Cluster / Dragon Wing Tempest
          if (minion.skillCooldown <= 0 && dist < 450) {
            const skillChoice = Math.random();
            if (skillChoice < 0.55) {
              // ☄️ SKILL 2: Magma Meteor Cluster
              minion.state = 'attack2';
              minion.attackCooldown = 1.4;
              minion.skillCooldown = 4.5;
              this.particles.triggerScreenShake(14, 0.45);
              this.particles.addFloatingText(minion.x, this.groundY - 180, 'MAGMA METEOR BARRAGE!', '#ff5722', true, 16);

              for (let m = 0; m < 3; m++) {
                this.scheduleCombatTask(() => {
                  if (!this.particles.summonedMinions.includes(minion)) return;
                  const targetX = minion.x + minion.facing * (130 + m * 85);
                  this.particles.addGroundExplosion(targetX, this.groundY - 20, 2.2);
                  this.particles.addImpactBurst(targetX, this.groundY - 10, 25, '#ff5722', 'fire');
                  this.enemies.forEach(e => {
                    if (e.isDead) return;
                    if (Math.abs(e.x - targetX) < 95) {
                      this.applyDamageToEnemy(e, Math.round(minion.damage * 1.3), true, minion.facing);
                    }
                  });
                }, m * 160);
              }
            } else {
              // 🌪️ SKILL 3: Dragon Wing Tempest Shockwave
              minion.state = 'attack';
              minion.attackCooldown = 1.2;
              minion.skillCooldown = 5.0;
              this.particles.triggerScreenShake(16, 0.5);
              this.particles.addFloatingText(minion.x, this.groundY - 180, 'DRAGON TEMPEST!', '#f97316', true, 16);
              this.particles.addFireSpin(minion.x + minion.facing * 110, this.groundY - 30, 2.5);

              this.enemies.forEach(e => {
                if (e.isDead) return;
                const dX = (e.x - minion.x) * minion.facing;
                if (dX > 0 && dX < 330) {
                  this.applyDamageToEnemy(e, Math.round(minion.damage * 0.95), false, minion.facing);
                  e.x += minion.facing * 90; // Stun & Knockback
                }
              });
            }
          } else if (dist > 180) {
            // Advance forward along the ground
            minion.state = 'walk';
            minion.x += minion.facing * 3.6;
          } else {
            // 🔥 SKILL 1: Continuous Apocalyptic Flame Breath
            if (minion.attackCooldown <= 0) {
              minion.state = 'attack';
              minion.attackCooldown = 1.1;
              this.particles.triggerScreenShake(9, 0.35);
              this.particles.addFlameLash(minion.x + minion.facing * 90, this.groundY - 25, minion.facing, 2.5);
              this.particles.addFireLine(minion.x + minion.facing * 80, this.groundY - 20, minion.facing, 2.0);
              this.particles.addGroundExplosion(minion.x + minion.facing * 140, this.groundY - 20, 1.8);

              // Multi-target flame scorch
              this.enemies.forEach(e => {
                if (e.isDead) return;
                const dX = (e.x - minion.x) * minion.facing;
                if (dX > 0 && dX < 320) {
                  this.applyDamageToEnemy(e, minion.damage, true, minion.facing);
                }
              });
            } else if (minion.attackCooldown < 0.3) {
              minion.state = 'idle';
            }
          }
        } else {
          // Follow player smoothly on the ground
          const followState = follow || this.player;
          const followX = followState.x - followState.facing * 80;
          const distToPlayer = followX - minion.x;
          if (Math.abs(distToPlayer) > 35) {
            minion.facing = distToPlayer > 0 ? 1 : -1;
            minion.x += minion.facing * 3.2;
            minion.state = 'walk';
          } else {
            minion.facing = followState.facing;
            minion.state = 'idle';
          }
        }
      } else if (minion.type === 'reaper') {
        const follow = ownerState(minion.ownerSocketId);
        minion.y = this.groundY; // Firmly anchored on ground
        if (minion.skillCooldown === undefined) minion.skillCooldown = 1.0;
        if (minion.skillCooldown > 0) minion.skillCooldown -= dt;

        if (targetEnemy) {
          const dx = (targetEnemy as EnemyInstance).x - minion.x;
          minion.facing = dx > 0 ? 1 : -1;
          const dist = Math.abs(dx);

          // Skill 1 & 2: Void Vortex Singularity or Death Nova
          if (minion.skillCooldown <= 0 && dist < 450) {
            const skillChoice = Math.random();
            if (skillChoice < 0.55) {
              // 🔮 SKILL 1: Void Vortex Singularity
              minion.state = 'spell';
              minion.attackCooldown = 1.4;
              minion.skillCooldown = 4.5;
              this.particles.triggerScreenShake(14, 0.45);
              this.particles.addFloatingText(minion.x, this.groundY - 150, 'VOID SINGULARITY!', '#a855f7', true, 16);

              const vortexX = minion.x + minion.facing * 130;
              this.particles.addVoidVortex(vortexX, this.groundY - 25, 2.6);
              this.particles.addDarkPillar(vortexX, this.groundY);

              // Pull enemies toward vortex and deal massive void damage
              this.enemies.forEach(e => {
                if (e.isDead) return;
                const d = Math.abs(e.x - vortexX);
                if (d < 250) {
                  e.x += (vortexX - e.x) * 0.4; // Vacuum pull
                  this.applyDamageToEnemy(e, Math.round(minion.damage * 1.35), true, minion.facing);
                }
              });
            } else {
              // 💀 SKILL 2: Underworld Death Nova Skulls
              minion.state = 'cast';
              minion.attackCooldown = 1.2;
              minion.skillCooldown = 4.5;
              this.particles.triggerScreenShake(16, 0.5);
              this.particles.addFloatingText(minion.x, this.groundY - 150, 'DEATH NOVA!', '#9333ea', true, 16);

              for (let s = 0; s < 3; s++) {
                this.scheduleCombatTask(() => {
                  if (!this.particles.summonedMinions.includes(minion)) return;
                  const skullX = minion.x + minion.facing * (100 + s * 80);
                  this.particles.addDarkPillar(skullX, this.groundY);
                  this.particles.addImpactBurst(skullX, this.groundY - 20, 30, '#a855f7', 'dark');
                  this.enemies.forEach(e => {
                    if (e.isDead) return;
                    if (Math.abs(e.x - skullX) < 80) {
                      this.applyDamageToEnemy(e, Math.round(minion.damage * 1.1), true, minion.facing);
                    }
                  });
                }, s * 140);
              }
            }
          } else if (dist > 90) {
            // Striding towards enemy on ground
            minion.state = 'walk';
            minion.x += minion.facing * 3.4;
          } else {
            // 🗡️ SKILL 3: Grim Scythe Execution Slash
            if (minion.attackCooldown <= 0) {
              minion.state = 'attack';
              minion.attackCooldown = 0.95;
              this.particles.triggerScreenShake(8, 0.3);
              this.particles.addSpellSlash((targetEnemy as EnemyInstance).x, (targetEnemy as EnemyInstance).y - 20, minion.facing, 1.8, '#a855f7');
              this.particles.addImpactBurst((targetEnemy as EnemyInstance).x, (targetEnemy as EnemyInstance).y - 15, 20, '#c084fc', 'dark');

              // Melee sweep damage
              this.enemies.forEach(e => {
                if (e.isDead) return;
                const dX = (e.x - minion.x) * minion.facing;
                if (dX > 0 && dX < 140) {
                  this.applyDamageToEnemy(e, Math.round(minion.damage * 1.25), true, minion.facing);
                }
              });
            } else if (minion.attackCooldown < 0.3) {
              minion.state = 'idle';
            }
          }
        } else {
          // Follow Necromancer smoothly on ground
          const followState = follow || this.player;
          const followX = followState.x - followState.facing * 75;
          const distToPlayer = followX - minion.x;
          if (Math.abs(distToPlayer) > 35) {
            minion.facing = distToPlayer > 0 ? 1 : -1;
            minion.x += minion.facing * 3.0;
            minion.state = 'walk';
          } else {
            minion.facing = followState.facing;
            minion.state = 'idle';
          }
        }
      } else if (minion.type === 'nightborne') {
        const follow = ownerState(minion.ownerSocketId);
        minion.y = this.groundY; // Firmly anchored on ground
        if (minion.skillCooldown === undefined) minion.skillCooldown = 1.0;
        if (minion.skillCooldown > 0) minion.skillCooldown -= dt;

        if (targetEnemy) {
          const dx = (targetEnemy as EnemyInstance).x - minion.x;
          minion.facing = dx > 0 ? 1 : -1;
          const dist = Math.abs(dx);

          if (minion.skillCooldown <= 0 && dist < 360) {
            // 🔮 SKILL: Abyssal Void Tempest & Dark Shockwave
            minion.state = 'attack';
            minion.attackCooldown = 1.1;
            minion.skillCooldown = 3.5;
            this.particles.triggerScreenShake(18, 0.5);
            this.particles.addFloatingText(minion.x, this.groundY - 120, 'VOID TEMPEST!', '#a855f7', true, 16);

            const blastX = minion.x + minion.facing * 100;
            this.particles.addVoidVortex(blastX, this.groundY - 20, 2.4);
            this.particles.addDarkPillar(blastX, this.groundY);

            for (let k = 0; k < 3; k++) {
              this.scheduleCombatTask(() => {
                if (!this.particles.summonedMinions.includes(minion)) return;
                const hitX = minion.x + minion.facing * (70 + k * 60);
                this.particles.addDarkPillar(hitX, this.groundY);
                this.particles.addImpactBurst(hitX, this.groundY - 20, 25, '#9333ea', 'dark');
                this.enemies.forEach(e => {
                  if (e.isDead) return;
                  if (Math.abs(e.x - hitX) < 80) {
                    this.applyDamageToEnemy(e, Math.round(minion.damage * 1.25), true, minion.facing);
                  }
                });
              }, k * 130);
            }
          } else if (dist > 70) {
            // Marching forward
            minion.state = 'walk';
            minion.x += minion.facing * 3.4;
          } else {
            // 🗡️ Triple Void Blade Execution Slash
            if (minion.attackCooldown <= 0) {
              minion.state = 'attack';
              minion.attackCooldown = 0.85;
              this.particles.triggerScreenShake(10, 0.35);
              this.particles.addSpellSlash((targetEnemy as EnemyInstance).x, (targetEnemy as EnemyInstance).y - 20, minion.facing, 2.0, '#a855f7');
              this.particles.addImpactBurst((targetEnemy as EnemyInstance).x, (targetEnemy as EnemyInstance).y - 15, 25, '#c084fc', 'dark');

              this.enemies.forEach(e => {
                if (e.isDead) return;
                const dX = (e.x - minion.x) * minion.facing;
                if (dX > 0 && dX < 160) {
                  this.applyDamageToEnemy(e, Math.round(minion.damage * 1.2), true, minion.facing);
                }
              });
            } else if (minion.attackCooldown < 0.3) {
              minion.state = 'idle';
            }
          }
        } else {
          // Follow player smoothly on ground
          const followState = follow || this.player;
          const followX = followState.x - followState.facing * 60;
          const distToPlayer = followX - minion.x;
          if (Math.abs(distToPlayer) > 30) {
            minion.facing = distToPlayer > 0 ? 1 : -1;
            minion.x += minion.facing * 2.8;
            minion.state = 'walk';
          } else {
            minion.facing = followState.facing;
            minion.state = 'idle';
          }
        }
      }
    });

    // B. Check Ground Traps Collision with Enemies
    this.particles.groundTraps.forEach(trap => {
      if (trap.isTriggered || trap.visualOnly) return;
      for (const enemy of this.enemies) {
        if (enemy.isDead) continue;
        const dist = Math.hypot(enemy.x - trap.x, enemy.y - trap.y);
        if (dist < trap.radius + enemy.width / 2) {
          trap.isTriggered = true;
          this.applyDamageToEnemy(enemy, trap.damage, true, 0);
          const trapSkill = trap.skillId ? this.findSkillById(trap.skillId) : null;
          if (trapSkill) {
            for (const status of trap.statuses || []) {
              this.applyEnemyStatus(enemy, { ...status, damageShare: undefined }, trapSkill, 0);
            }
          }
          if (trap.trapType === 'poison') {
            this.particles.addGroundZone(
              trap.x,
              this.groundY,
              90,
              Math.max(0, Math.round((trap.cloudDamageTotal || 0) / 5)),
              5.0,
              'poison_cloud',
              '#22c55e',
              { skillId: trap.skillId, statuses: trap.statuses, tickInterval: 1 },
            );
            this.particles.addImpactBurst(trap.x, trap.y - 10, 25, '#22c55e', 'poison');
          } else {
            this.particles.addGroundExplosion(trap.x, this.groundY - 20, 1.8);
          }
          break;
        }
      }
    });

    // C. Check Ground Zones periodic tick damage
    this.particles.groundZones.forEach(zone => {
      if (zone.tickTimer >= (zone.tickInterval ?? 0.5)) {
        zone.tickTimer = 0;
        const zoneSkill = zone.skillId ? this.findSkillById(zone.skillId) : null;
        this.enemies.forEach(enemy => {
          if (enemy.isDead) return;
          const dist = Math.hypot(enemy.x - zone.x, enemy.y - zone.y);
          if (dist < zone.radius + enemy.width / 2) {
            if (zone.damagePerTick > 0) {
              this.applyDamageToEnemy(enemy, zone.damagePerTick, false, 0);
            }
            if (zoneSkill) {
              for (const status of zone.statuses || []) {
                this.applyEnemyStatus(enemy, { ...status, damageShare: undefined }, zoneSkill, 0);
              }
            }
          }
        });
        if (zone.allyHealPercentPerTick && Math.abs(this.player.x - zone.x) <= zone.radius && this.player.hp > 0) {
          const heal = Math.max(1, Math.round(this.player.maxHp * zone.allyHealPercentPerTick));
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
          this.particles.addFloatingText(this.player.x, this.player.y - 32, `+${heal} HP`, '#4ade80', false, 12);
        }
      }
    });
  }

  private eligibleCombatPlayerTargets(): CombatPlayerTarget[] {
    if (this.isTownMode) return [];
    const targets: CombatPlayerTarget[] = [];
    const p = this.player;

    if (!p.downed && !this.runOver && p.hp > 0 && p.stealthTimer <= 0) {
      targets.push({ kind: 'local', socketId: null, x: p.x, y: p.y, facing: p.facing < 0 ? -1 : 1 });
    }

    if (!network.room) return targets;
    for (const [socketId, remote] of Object.entries(network.remotePlayers)) {
      if (remote.downed || (typeof remote.hpPct === 'number' && remote.hpPct <= 0)) continue;
      if (Boolean(remote.isTownMode) !== Boolean(this.isTownMode)) continue;
      if (remote.sceneId !== this.networkSceneId) continue;

      const x = typeof remote.targetX === 'number' ? remote.targetX : remote.x;
      const relativeY = typeof remote.targetY === 'number' ? remote.targetY : remote.y;
      if (!Number.isFinite(x) || !Number.isFinite(relativeY)) continue;
      targets.push({
        kind: 'remote',
        socketId,
        x,
        y: relativeY + this.groundY,
        facing: remote.facing < 0 ? -1 : 1,
      });
    }
    return targets;
  }

  /** Nearest eligible party member with a small hysteresis to prevent aggro flicker. */
  private selectEnemyPlayerTarget(enemy: EnemyInstance): CombatPlayerTarget | null {
    const targets = this.eligibleCombatPlayerTargets();
    if (!targets.length) {
      this.enemyPlayerTargets.delete(enemy.id);
      return null;
    }
    const score = (target: CombatPlayerTarget) => Math.hypot(
      target.x - enemy.x,
      (target.y - enemy.y) * 0.35,
    );
    const nearest = targets.reduce((best, target) => score(target) < score(best) ? target : best);
    const lockedKey = this.enemyPlayerTargets.get(enemy.id);
    const locked = targets.find(target => (target.socketId || 'local') === lockedKey);
    const selected = locked && score(locked) <= score(nearest) + 120 ? locked : nearest;
    this.enemyPlayerTargets.set(enemy.id, selected.socketId || 'local');
    return selected;
  }

  private updateEnemies(dt: number) {
    const dtFrame = dt * this.physicsFrameScale;
    const pendingSummons: EnemyInstance[] = [];

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy.isDead) {
        this.enemyPlayerTargets.delete(enemy.id);
        this.enemies.splice(i, 1);
        continue;
      }

      if (enemy.isActive === false) {
        enemy.spawnDelay = Math.max(0, (Number(enemy.spawnDelay) || 0) - dt);
        if (enemy.spawnDelay <= 0) {
          enemy.isActive = true;
          const spawnSprite = enemy.role && enemy.role !== 'boss' && enemy.role !== 'bruiser'
            ? ENEMY_ROLE_SPRITES[enemy.role].signature
            : COMBAT_FEEDBACK_SPRITES['area-telegraph'];
          this.addCombatSpriteEffect(spawnSprite, enemy.x, enemy.y, 0.65, enemy.facing, 0.8);
        } else {
          continue;
        }
      }

      if (enemy.guardState) {
        enemy.guardState = tickGuardStaggerState(enemy.guardState, dt);
      }
      enemy.roleActionCooldown = Math.max(0, (enemy.roleActionCooldown || 0) - dt);

      // Guests advance the last host snapshot for smooth animation, but never
      // resolve its gameplay. The next authoritative packet reconciles time.
      if (!this.isHost && enemy.attackIntent) {
        enemy.attackIntent = advanceEnemyAttackIntent(enemy.attackIntent, dt);
        const phase = enemyAttackIntentPhase(enemy.attackIntent).phase;
        enemy.isAttacking = phase === 'active';
        if (phase === 'complete') enemy.attackIntent = undefined;
      }

      // Hit stun
      if (enemy.hitStun > 0 || (enemy.guardState?.staggeredRemaining || 0) > 0) {
        enemy.hitStun -= dt;
        enemy.vx *= 0.4;
        enemy.isAttacking = false;
      } else if (this.isHost) {
        // The host owns aggro for every same-scene party member. Remote Y is
        // normalized back into this canvas's world coordinates above.
        const target = this.selectEnemyPlayerTarget(enemy);
        let targetX = target?.x;
        let isDecoy = false;
        const taunted = this.statusMagnitude(enemy, 'taunt') > 0
          || this.statusesForEnemy(enemy).some(status => status.kind === 'taunt');
        const objectiveTarget = this.dungeonEncounterRuntime?.getObjectiveTargetForEnemy() || null;
        const attacksObjective = objectiveTarget && !taunted
          && (enemy.role === 'shield-tank' || enemy.role === 'assassin')
          && ((enemy.id.length + (enemy.intentSequence || 0)) % 3 !== 1);
        if (attacksObjective && objectiveTarget) {
          targetX = objectiveTarget.x;
          isDecoy = true;
        }
        if (!target && !taunted && this.particles.summonedMinions.length > 0) {
          targetX = this.particles.summonedMinions[0].x;
          isDecoy = true;
        }
        if (targetX === undefined) {
          targetX = enemy.x;
          isDecoy = true;
        }

        const dx = targetX - enemy.x;
        const dist = Math.abs(dx);
        const verticalDistance = attacksObjective && objectiveTarget
          ? Math.abs(objectiveTarget.y - enemy.y)
          : target ? Math.abs(target.y - enemy.y) : 0;
        enemy.facing = dx > 0 ? 1 : -1;

        const role = enemy.role || (enemy.type === 'boss' ? 'boss' : 'bruiser');
        const tactic = role !== 'boss' && role !== 'bruiser'
          ? ENEMY_ROLE_TACTICS[role as EnemyRoleId]
          : null;
        const slow = Math.min(0.9, this.statusMagnitude(enemy, 'slow'));

        if (enemy.guardState && role === 'shield-tank') {
          enemy.guardState = setGuarding(enemy.guardState, !enemy.attackIntent && dist <= enemy.attackRange * 1.4);
        }

        if (enemy.attackIntent) {
          enemy.attackIntent = advanceEnemyAttackIntent(enemy.attackIntent, dt);
          const phase = enemyAttackIntentPhase(enemy.attackIntent).phase;
          enemy.isAttacking = phase === 'active';
          enemy.vx = 0;
          if (canResolveEnemyAttackIntent(enemy.attackIntent)) {
            this.resolveEnemyIntent(enemy, target, pendingSummons);
            enemy.attackIntent = markEnemyAttackIntentResolved(enemy.attackIntent);
          }
          if (phase === 'complete') {
            enemy.attackIntent = undefined;
            enemy.attackTimer = enemy.attackCooldown;
            enemy.isAttacking = false;
          }
        } else {
          enemy.attackTimer = Math.max(0, enemy.attackTimer - dt);
          const preferredRange = tactic?.preferredRange ?? enemy.attackRange;
          const retreatRange = tactic?.retreatRange ?? 0;
          const withinVerticalRange = verticalDistance <= 110;
          const canBeginIntent = !isDecoy && target && withinVerticalRange
            && dist <= Math.max(enemy.attackRange, preferredRange)
            && enemy.attackTimer <= 0;

          if (canBeginIntent && target) {
            const profileId = enemy.attackProfileId
              || DEFAULT_ATTACK_PROFILE_BY_ROLE[role];
            const profile = getEnemyAttackProfile(profileId);
            enemy.intentSequence = (enemy.intentSequence || 0) + 1;
            enemy.attackIntent = createEnemyAttackIntent({
              intentId: `intent_${enemy.id}_${enemy.intentSequence}_${++this.combatIntentNonce}`,
              profileId,
              sourceEnemyId: enemy.id,
              sourceX: enemy.x,
              sourceY: enemy.y,
              facing: enemy.facing < 0 ? -1 : 1,
              target: {
                actorId: target.socketId || 'local',
                x: profile.targetMode === 'self' ? enemy.x : target.x,
                y: profile.targetMode === 'self' ? enemy.y : target.y,
              },
              sceneEpoch: this.combatTaskEpoch,
            });
            enemy.isAttacking = false;
            enemy.vx = 0;
            audio.playId(profile.chargeSoundId, 0.62);
          } else if (retreatRange > 0 && dist < retreatRange) {
            enemy.vx = -enemy.facing * enemy.speed * (1 - slow);
            enemy.isAttacking = false;
          } else if (dist > Math.max(40, preferredRange * 0.88) || !withinVerticalRange) {
            enemy.vx = enemy.facing * enemy.speed * (1 - slow);
            enemy.isAttacking = false;
          } else {
            enemy.vx = 0;
            enemy.isAttacking = false;
          }
        }

        if (enemy.type === 'boss' && this.isHost) this.updateBossSkills(enemy, dt);
        if (enemy.featureSpriteId === 'run:miniboss') this.updateMiniBossMechanics(enemy);
      }

      // Physics
      enemy.vy += this.gravity * dtFrame;
      enemy.x += enemy.vx * dtFrame;
      enemy.y += enemy.vy * dtFrame;

      if (enemy.y >= this.groundY) {
        enemy.y = this.groundY;
        enemy.vy = 0;
        enemy.isGrounded = true;
      } else {
        enemy.isGrounded = false;
      }

      enemy.vx *= Math.pow(0.85, dtFrame);
      enemy.x = Math.max(40, Math.min(this.arenaWidth - 40, enemy.x));
    }

    if (pendingSummons.length) {
      const capacity = Math.max(0, 24 - this.enemies.filter(enemy => !enemy.isDead).length);
      this.enemies.push(...pendingSummons.slice(0, capacity));
    }
  }

  private updateMiniBossMechanics(enemy: EnemyInstance) {
    if (!this.isHost || enemy.isDead || (enemy.roleActionCooldown || 0) > 0) return;
    const triggered = this.miniBossTriggered.get(enemy.id) || new Set<MiniBossMechanicId>();
    this.miniBossTriggered.set(enemy.id, triggered);
    const hpRatio = enemy.hp / Math.max(1, enemy.maxHp);
    const next = (Object.entries(MINIBOSS_MECHANICS) as Array<[
      MiniBossMechanicId,
      typeof MINIBOSS_MECHANICS[MiniBossMechanicId],
    ]>).find(([id, mechanic]) => !triggered.has(id) && hpRatio <= mechanic.healthGate);
    if (!next) return;
    const [mechanicId, mechanic] = next;
    triggered.add(mechanicId);
    enemy.roleActionCooldown = 1.8;
    this.addCombatSpriteEffect(mechanic.visualSprite, enemy.x, enemy.y, mechanic.telegraphSeconds + 0.45, enemy.facing, 1.1);
    this.particles.addFloatingText(enemy.x, enemy.y - enemy.height - 24, mechanicId.toUpperCase(), '#fef3c7', true, 14);
    audio.playId('ult_charge', 0.72);

    this.scheduleCombatTask(() => {
      if (enemy.isDead || enemy.featureSpriteId !== 'run:miniboss') return;
      if (mechanicId === 'enrage') {
        enemy.atk = Math.round(enemy.atk * 1.22);
        enemy.speed *= 1.18;
        audio.playBossRoar();
      } else if (mechanicId === 'fortify') {
        enemy.guardState = createGuardStaggerState({
          maxGuard: Math.max(140, Math.round(enemy.maxHp * 0.12)),
          staggerThreshold: 170,
          guarding: true,
        });
      } else if (mechanicId === 'reinforcements') {
        const current = this.enemies.filter(candidate => !candidate.isDead && candidate.summonOwnerId === enemy.id).length;
        const capacity = Math.max(0, Math.min(2 - current, 24 - this.enemies.filter(candidate => !candidate.isDead).length));
        for (let index = 0; index < capacity; index += 1) {
          this.enemies.push(this.createEnemySummon(enemy, current + index));
        }
      } else if (mechanicId === 'nova') {
        const profile = getEnemyAttackProfile('boss-nova');
        const intentId = `miniboss_${enemy.id}_${++this.combatIntentNonce}`;
        this.eligibleCombatPlayerTargets()
          .filter(target => Math.hypot(target.x - enemy.x, (target.y - enemy.y) * 0.5) <= profile.radius)
          .forEach(target => this.enemyAttackCombatTarget(
            enemy,
            target,
            profile.damageMultiplier,
            undefined,
            profile.defense,
            intentId,
            profile.id,
          ));
        this.particles.playVfx(profile.impactSpriteId, enemy.x, enemy.y - 24, { scale: 1.35 });
      }
    }, mechanic.telegraphSeconds * 1000);
  }

  private resolveEnemyIntent(
    enemy: EnemyInstance,
    fallbackTarget: CombatPlayerTarget | null,
    pendingSummons: EnemyInstance[],
  ) {
    const intent = enemy.attackIntent;
    if (!intent || intent.sceneEpoch !== this.combatTaskEpoch) return;
    const profile = getEnemyAttackProfile(intent.profileId);
    const role = enemy.role || profile.role;

    if (enemy.eliteModifiers?.includes('summoning')) {
      const current = this.enemies.filter(candidate => !candidate.isDead && candidate.summonOwnerId === enemy.id).length
        + pendingSummons.filter(candidate => candidate.summonOwnerId === enemy.id).length;
      if (current < 1) pendingSummons.push(this.createEnemySummon(enemy, current));
    }

    if (role === 'healer') {
      const ally = this.enemies
        .filter(candidate => !candidate.isDead && candidate.id !== enemy.id && candidate.hp < candidate.maxHp)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (ally && Math.abs(ally.x - enemy.x) <= profile.range) {
        const heal = Math.max(1, Math.round(ally.maxHp * ENEMY_ROLE_TACTICS.healer.action.magnitude));
        ally.hp = Math.min(ally.maxHp, ally.hp + heal);
        this.addCombatSpriteEffect(ENEMY_ROLE_SPRITES.healer.signature, ally.x, ally.y, 0.7, ally.facing, 0.8);
        this.particles.addFloatingText(ally.x, ally.y - ally.height, `+${heal}`, '#86efac', true, 13);
      }
      audio.playId(profile.impactSoundId, 0.75);
      return;
    }

    if (role === 'summoner') {
      const summonLimit = ENEMY_ROLE_TACTICS.summoner.action.maxActiveSummons || 2;
      const current = this.enemies.filter(candidate => !candidate.isDead && candidate.summonOwnerId === enemy.id).length
        + pendingSummons.filter(candidate => candidate.summonOwnerId === enemy.id).length;
      if (current < summonLimit) {
        pendingSummons.push(this.createEnemySummon(enemy, current));
        this.addCombatSpriteEffect(ENEMY_ROLE_SPRITES.summoner.signature, enemy.x, enemy.y, 0.9, enemy.facing, 0.85);
      }
      audio.playId(profile.impactSoundId, 0.8);
      return;
    }

    const target = this.eligibleCombatPlayerTargets().find(candidate => (
      (candidate.socketId || 'local') === intent.target.actorId
    )) || fallbackTarget;
    if (!target) return;

    const hit = profile.targetMode === 'locked-position'
      ? Math.hypot(target.x - intent.target.x, (target.y - intent.target.y) * 0.45) <= Math.max(profile.radius, 32)
      : Math.abs(target.x - enemy.x) <= profile.range + profile.radius
        && Math.abs(target.y - enemy.y) <= 130;
    if (!hit) return;

    if (role === 'assassin') {
      enemy.x = Math.max(40, Math.min(this.arenaWidth - 40, target.x - enemy.facing * 42));
    }
    this.enemyAttackCombatTarget(
      enemy,
      target,
      profile.damageMultiplier,
      enemy.eliteModifiers?.includes('frostbound')
        ? { kind: 'slow', duration: 2.4, magnitude: 0.3 }
        : undefined,
      profile.defense,
      intent.intentId,
      profile.id,
    );
    this.particles.playVfx(profile.impactSpriteId, target.x, target.y - 20, { facing: enemy.facing });
    audio.playId(profile.impactSoundId, 0.82);

    if (enemy.eliteModifiers?.includes('vampiric')) {
      const heal = Math.max(1, Math.round(enemy.maxHp * 0.035));
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + heal);
    }
    if (enemy.eliteModifiers?.includes('stormbound')) {
      this.eligibleCombatPlayerTargets()
        .filter(candidate => (
          (candidate.socketId || 'local') !== (target.socketId || 'local')
          && Math.abs(candidate.x - target.x) <= 190
        ))
        .slice(0, 2)
        .forEach((candidate, index) => this.enemyAttackCombatTarget(
          enemy,
          candidate,
          profile.damageMultiplier * 0.45,
          undefined,
          'parryable',
          `${intent.intentId}:chain:${index}`,
          profile.id,
        ));
    }
  }

  private createEnemySummon(owner: EnemyInstance, index: number): EnemyInstance {
    const maxHp = Math.max(1, Math.round(owner.maxHp * 0.22));
    return {
      id: `${owner.id}:summon:${owner.intentSequence || 0}:${index}`,
      name: `${owner.name} Minion`,
      type: 'mob',
      icon: owner.icon,
      color: owner.color,
      maxHp,
      hp: maxHp,
      atk: Math.max(1, Math.round(owner.atk * 0.48)),
      def: Math.max(0, Math.round(owner.def * 0.4)),
      speed: Math.max(2.8, owner.speed * 1.15),
      expReward: Math.max(1, Math.round(owner.expReward * 0.08)),
      goldReward: 0,
      width: Math.max(28, owner.width * 0.72),
      height: Math.max(32, owner.height * 0.72),
      attackRange: ENEMY_ROLE_TACTICS.assassin.preferredRange,
      attackCooldown: 2.1,
      attackTimer: 0.7,
      role: 'assassin',
      attackProfileId: DEFAULT_ATTACK_PROFILE_BY_ROLE.assassin,
      intentSequence: 0,
      summonOwnerId: owner.id,
      formationId: owner.formationId,
      eliteModifiers: [],
      isActive: true,
      spawnDelay: 0,
      x: Math.max(40, Math.min(this.arenaWidth - 40, owner.x + (index === 0 ? -56 : 56))),
      y: owner.y,
      vx: 0,
      vy: -2,
      isGrounded: false,
      facing: owner.facing,
      isAttacking: false,
      hitStun: 0,
      isDead: false,
    };
  }

  /**
   * Boss abilities.
   *
   * specialAttackTimer and currentPhase were already on the enemy record and
   * nothing read either, so every boss fight was the same walk-up-and-swing as
   * an ordinary monster. Each boss now alternates between its two skills, and
   * each one announces itself before it lands - a boss that hits the instant it
   * decides to is a coin toss, not a fight.
   */
  private updateBossSkills(enemy: EnemyInstance, dt: number) {
    const skills = bossSkillsFor(enemy.name);
    if (!skills.length || enemy.isDead) return;

    if ((enemy.bossCastTimer || 0) > 0) {
      enemy.bossCastTimer = Math.max(0, (enemy.bossCastTimer || 0) - dt);
      if (enemy.bossCastTimer === 0) enemy.bossCastName = undefined;
    }

    // Half health is where the fight changes. `phases: 2` was declared on three
    // bosses and nothing ever read it - the same shape of gap as minLevel and
    // isAttacking. A boss that fights identically from full health to zero has
    // no second act.
    if ((enemy.phases || 1) >= 2 && (enemy.currentPhase || 1) < 2 && enemy.hp <= enemy.maxHp * 0.5) {
      enemy.currentPhase = 2;
      enemy.attackCooldown = Math.max(0.7, enemy.attackCooldown * 0.65);
      enemy.speed = enemy.speed * 1.25;
      enemy.specialAttackTimer = 0.8;
      this.particles.addFloatingText(enemy.x, enemy.y - 100, `${enemy.name.toUpperCase()} IS ENRAGED`, '#ef4444', true, 20);
      this.particles.triggerScreenShake(20, 0.7);
      this.particles.addScreenFlash('#ef4444', 0.45, 0.08);
      audio.playBossRoar();
    }

    enemy.specialAttackTimer = (enemy.specialAttackTimer || 0) - dt;
    if (enemy.specialAttackTimer > 0) return;

    // Alternate, so both are seen rather than one winning every roll. Kept in
    // its own counter: currentPhase means the phase of the fight, and using it
    // for the rotation as well would have made a phase change look like a
    // skill change.
    const turn = (this.bossRotation.get(enemy.id) || 0);
    const skill = skills[turn % skills.length];
    this.bossRotation.set(enemy.id, turn + 1);

    // Phase two presses harder: the same abilities, closer together.
    const enraged = (enemy.currentPhase || 1) >= 2;
    enemy.specialAttackTimer = enraged ? skill.cooldown * 0.6 : skill.cooldown;

    this.castBossSkill(enemy, skill);
  }

  private playerStatusForBossSkill(enemy: EnemyInstance, skill: BossSkill): PlayerDamageStatus | undefined {
    const rawTickDamage = Math.max(1, Math.round(enemy.atk * BALANCE.enemyAtk * 0.2));
    if (skill.name === 'Venom Spray') {
      return { kind: 'poison', duration: 4, magnitude: 0.1, tickInterval: 1, rawTickDamage };
    }
    if (skill.name === 'Web Snare') {
      return { kind: 'slow', duration: 3.5, magnitude: 0.45 };
    }
    if (['Infernal Breath', 'Meteor Fall', 'Molten Hammer'].includes(skill.name)) {
      return { kind: 'burn', duration: 3, magnitude: 0.1, tickInterval: 1, rawTickDamage };
    }
    if (['Abyssal Current', 'Tidal Crush'].includes(skill.name)) {
      return { kind: 'slow', duration: 2.5, magnitude: 0.3 };
    }
    if (skill.name === 'Blacksteel Decree') {
      return { kind: 'stun', duration: 0.6, magnitude: 1 };
    }
    return undefined;
  }

  private castBossSkill(enemy: EnemyInstance, skill: BossSkill) {

    // The wind-up: name it and mark the ground, then land it.
    this.particles.addFloatingText(enemy.x, enemy.y - 90, skill.name.toUpperCase(), skill.colour, true, 18);
    audio.playId('ult_charge', 0.7);

    const primaryTarget = this.selectEnemyPlayerTarget(enemy);
    const targetX = skill.kind === 'slam' ? (primaryTarget?.x ?? enemy.x) : enemy.x;
    const facing = enemy.facing;
    const status = this.playerStatusForBossSkill(enemy, skill);
    const attackProfile = getEnemyAttackProfile(BOSS_ATTACK_PROFILE_BY_KIND[skill.kind]);
    const bossIntentId = `boss_${enemy.id}_${++this.combatIntentNonce}`;
    enemy.bossCastName = skill.name;
    enemy.bossCastTimer = skill.telegraph;
    enemy.bossCastDuration = skill.telegraph;

    this.scheduleCombatTask(() => {
      if (enemy.isDead) return;
      const dmg = skill.damage;

      if (skill.kind === 'volley') {
        // Fanned across the arena, so standing still is the wrong answer.
        for (let i = 0; i < 4; i++) {
          const ox = enemy.x + facing * (70 + i * 90);
          this.scheduleCombatTask(() => {
            if (enemy.isDead) return;
            this.particles.playVfx(skill.vfx, ox, this.groundY - 30, { facing, scale: 0.9 });
            this.eligibleCombatPlayerTargets()
              .filter(target => Math.abs(target.x - ox) < 70 && Math.abs(target.y - this.groundY) < 130)
              .forEach(target => this.enemyAttackCombatTarget(
                enemy, target, dmg, status, attackProfile.defense, bossIntentId, attackProfile.id,
              ));
          }, i * 110);
        }
      } else if (skill.kind === 'beam') {
        for (let i = 0; i < 5; i++) {
          const ox = enemy.x + facing * (60 + i * 80);
          this.particles.playVfx(skill.vfx, ox, this.groundY - 40, { facing, scale: 1.0 });
        }
        this.eligibleCombatPlayerTargets()
          .filter(target => (
            (facing > 0 ? target.x > enemy.x : target.x < enemy.x)
            && Math.abs(target.x - enemy.x) < 460
            && Math.abs(target.y - enemy.y) < 140
          ))
          .forEach(target => this.enemyAttackCombatTarget(
            enemy, target, dmg, status, attackProfile.defense, bossIntentId, attackProfile.id,
          ));
      } else if (skill.kind === 'nova') {
        this.particles.playVfx(skill.vfx, enemy.x, this.groundY - 50, { facing, scale: 1.6 });
        this.eligibleCombatPlayerTargets()
          .filter(target => Math.abs(target.x - enemy.x) < 190 && Math.abs(target.y - enemy.y) < 140)
          .forEach(target => this.enemyAttackCombatTarget(
            enemy, target, dmg, status, attackProfile.defense, bossIntentId, attackProfile.id,
          ));
      } else {
        // slam - lands where the player was standing when it started.
        this.particles.playVfx(skill.vfx, targetX, this.groundY - 40, { facing, scale: 1.5 });
        this.eligibleCombatPlayerTargets()
          .filter(target => Math.abs(target.x - targetX) < 120 && Math.abs(target.y - this.groundY) < 140)
          .forEach(target => this.enemyAttackCombatTarget(
            enemy, target, dmg, status, attackProfile.defense, bossIntentId, attackProfile.id,
          ));
      }

      this.particles.triggerScreenShake(skill.kind === 'volley' ? 6 : 12, 0.3);
    }, skill.telegraph * 1000);
  }

  /** Adds a buff to this player and shows it. Used by the caster and by allies. */
  public applyPartyBuff(
    stat: PlayerBuffStat,
    multiplier: number,
    duration: number,
    fromName?: string,
    sourceActorId?: string,
  ) {
    const p = this.player;
    const sourceSkillId = sourceActorId
      ? `remote:${sourceActorId}`
      : fromName
        ? `remote:${fromName}`
        : 'party';
    const existing = p.activeBuffs.find(buff => buff.stat === stat && buff.sourceSkillId === sourceSkillId);
    if (existing) {
      existing.multiplier = multiplier;
      existing.timer = Math.max(existing.timer, duration);
    } else {
      p.activeBuffs.push({ stat, multiplier, timer: duration, sourceSkillId });
    }
    this.recomputeStats();
    const pct = Math.round((multiplier - 1) * 100);
    const who = fromName ? `${fromName}: ` : '';
    this.particles.addFloatingText(p.x, p.y - 30, `${who}+${pct}% ${String(stat).toUpperCase()}`, '#ffee58', true, 16);
  }

  /** Heal arriving from an ally's support skill. */
  public applyPartyHeal(amount: number, fromName?: string) {
    const p = this.player;
    if (p.hp <= 0) return;
    p.hp = Math.min(p.maxHp, p.hp + amount);
    const who = fromName ? `${fromName}: ` : '';
    this.particles.addFloatingText(p.x, p.y - 30, `${who}+${amount} HP`, '#4ade80', true, 16);
  }

  /** Apply max-HP healing against the recipient's stats, not the caster's. */
  public applyPartyPercentHeal(percent: number, fromName?: string) {
    const boundedPercent = Number.isFinite(percent) ? Math.max(0, Math.min(1, percent)) : 0;
    if (boundedPercent <= 0) return;
    const amount = Math.max(1, Math.round(this.player.maxHp * boundedPercent));
    this.applyPartyHeal(amount, fromName);
  }

  /** Remove a bounded number of local debuffs for both local and relayed party casts. */
  public applyPartyCleanse(count: number, fromName?: string): number {
    if (this.player.downed || this.runOver || this.player.hp <= 0) return 0;
    const requested = Number.isFinite(count) ? Math.max(0, Math.min(5, Math.floor(count))) : 0;
    const removed = Math.min(requested, this.playerNegativeStatuses.length);
    if (removed <= 0) return 0;

    this.playerNegativeStatuses.splice(0, removed);
    const label = fromName ? `${fromName}: CLEANSED` : 'CLEANSED';
    this.particles.addFloatingText(this.player.x, this.player.y - 42, label, '#fef3c7', true, 16);
    return removed;
  }

  /**
   * Drinks the best healing item in the bag.
   *
   * Potions existed but could only be reached through the inventory screen,
   * which you cannot open while a boss is chasing you - so in the fight where
   * a potion would matter, it may as well not have been there. Returns what
   * happened so the HUD can say why nothing did.
   */
  /**
   * Downed teammates, drawn in world space so the marker sits on the body. A
   * downed player is silent otherwise - same sprite as any other corpse pose -
   * and a rescue you cannot see coming is one nobody makes.
   */
  private drawDownedMarkers(ctx: CanvasRenderingContext2D) {
    const pulse = 0.55 + Math.sin(performance.now() / 160) * 0.45;
    for (const socketId in network.remotePlayers) {
      const r = network.remotePlayers[socketId];
      if (!r.downed) continue;
      if (Boolean(r.isTownMode) !== Boolean(this.isTownMode)) continue;

      const bx = r.x;
      const by = r.y + this.groundY - 62;

      ctx.save();
      ctx.textAlign = 'center';

      // A beacon you can find from off-screen.
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(bx, by + 12);
      ctx.lineTo(bx - 9, by - 2);
      ctx.lineTo(bx + 9, by - 2);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.font = 'bold 11px "Outfit", sans-serif';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 3;
      ctx.fillStyle = '#fca5a5';
      const label = `${r.name || 'Teammate'} IS DOWN`;
      ctx.strokeText(label, bx, by - 8);
      ctx.fillText(label, bx, by - 8);

      // The hold prompt and its progress, shown only to whoever is close
      // enough to act on it.
      if (this.reviveTargetId === socketId && this.reviveHold > 0) {
        const pct = Math.min(1, this.reviveHold / SideViewEngine.REVIVE_HOLD_SECONDS);
        const w = 64;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(bx - w / 2, by + 18, w, 7);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(bx - w / 2 + 1, by + 19, (w - 2) * pct, 5);
      } else if (Math.hypot(r.x - this.player.x, r.y + this.groundY - this.player.y) < SideViewEngine.REVIVE_RANGE) {
        ctx.font = 'bold 10px "Outfit", sans-serif';
        ctx.fillStyle = '#4ade80';
        ctx.strokeText('HOLD E TO REVIVE', bx, by + 26);
        ctx.fillText('HOLD E TO REVIVE', bx, by + 26);
      }
      ctx.restore();
    }
  }

  /** Live speech bubbles, keyed by who said it so a spammer overwrites itself. */
  private chatBubbles: Record<string, { lineId: string; timer: number }> = {};
  /** World markers dropped by the party. */
  private pings: { x: number; y: number; timer: number }[] = [];

  /** Show a canned line over a player's head. Our own id is 'me'. */
  public showChatBubble(socketId: string, lineId: string) {
    if (!quickChatById(lineId)) return;
    this.chatBubbles[socketId] = { lineId, timer: 2.6 };
  }

  public addPing(x: number, y: number) {
    // A handful at most: a ping that never expires is a ping nobody looks at.
    if (this.pings.length > 6) this.pings.shift();
    this.pings.push({ x, y, timer: 4 });
  }

  private tickPartyChatter(dt: number) {
    for (const id in this.chatBubbles) {
      this.chatBubbles[id].timer -= dt;
      if (this.chatBubbles[id].timer <= 0) delete this.chatBubbles[id];
    }
    for (let i = this.pings.length - 1; i >= 0; i--) {
      this.pings[i].timer -= dt;
      if (this.pings[i].timer <= 0) this.pings.splice(i, 1);
    }
  }

  /**
   * Bubbles and pings, drawn in world space. Without these a party without
   * microphones has no way to say anything at all - which is most parties on
   * a phone.
   */
  private drawPartyChatter(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.textAlign = 'center';

    for (const ping of this.pings) {
      const life = ping.timer / 4;
      const r = 14 + (1 - life) * 26;
      ctx.globalAlpha = Math.max(0, life);
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ping.x, ping.y + this.groundY, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ping.x, ping.y + this.groundY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#facc15';
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    for (const socketId in this.chatBubbles) {
      const entry = this.chatBubbles[socketId];
      const line = quickChatById(entry.lineId);
      if (!line) continue;

      let bx: number;
      let by: number;
      if (socketId === 'me') {
        bx = this.player.x;
        by = this.player.y + this.groundY - 78;
      } else {
        const r = network.remotePlayers[socketId];
        if (!r) continue;
        bx = r.x;
        by = r.y + this.groundY - 78;
      }

      ctx.font = 'bold 12px "Outfit", sans-serif';
      const w = ctx.measureText(line.bubble).width + 18;
      ctx.globalAlpha = Math.min(1, entry.timer / 0.4);
      ctx.fillStyle = 'rgba(12, 10, 20, 0.88)';
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(bx - w / 2, by - 15, w, 22, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = line.color;
      ctx.fillText(line.bubble, bx, by);
    }
    ctx.restore();
  }

  /** When we were last hit, so the HUD can stay up through a fight's lulls. */
  private lastHurtAt = 0;

  /**
   * How dangerous the moment is: 0 calm, 1 fighting, 2 a boss is present.
   *
   * The HUD reads this and dims when nothing is happening. Chrome that is
   * always at full strength competes with the game for attention in exactly
   * the stretches - walking, exploring, standing in town - where there is
   * nothing to read on it.
   */
  public threatLevel(): 0 | 1 | 2 {
    if (this.isTownMode) return 0;
    const p = this.player;
    if (p.downed) return 2;

    let near = false;
    for (const e of this.enemies) {
      if (e.isDead) continue;
      if (e.type === 'boss' && Math.abs(e.x - p.x) < 900) return 2;
      if (!near && Math.abs(e.x - p.x) < 520) near = true;
    }
    if (near) return 1;
    // A fight has gaps. Dimming the instant the last enemy on screen dies and
    // brightening again a second later is worse than a short hold.
    return (performance.now() - this.lastHurtAt) < 3500 ? 1 : 0;
  }

  /** Seconds you stay down before the run is lost. Long enough to be crossed. */
  public static readonly BLEED_OUT_SECONDS = 18;
  /** Seconds a teammate must stay beside you. Long enough to be a real risk. */
  public static readonly REVIVE_HOLD_SECONDS = 2.5;
  /** How close the rescuer must stand. */
  public static readonly REVIVE_RANGE = 95;

  /** Progress of the revive we are currently performing, in seconds. */
  public reviveHold = 0;
  /** Socket id of the teammate we are reviving, for the on-screen prompt. */
  public reviveTargetId: string | null = null;

  private playerName(): string {
    return localStorage.getItem('playerName') || 'A hero';
  }

  /**
   * Going down only makes sense when somebody can come for you. Alone, or
   * having already been picked up once this run, a killing blow is final.
   */
  private canBeRevived(): boolean {
    return network.isPartied && (this.player.revivesUsed || 0) < 1;
  }

  /** The nearest downed teammate within reach, if any. */
  public nearestDownedAlly(): { socketId: string; x: number; y: number; name: string } | null {
    if (!network.isPartied) return null;
    let best: { socketId: string; x: number; y: number; name: string } | null = null;
    let bestDist = SideViewEngine.REVIVE_RANGE;
    for (const socketId in network.remotePlayers) {
      const r = network.remotePlayers[socketId];
      if (!r.downed) continue;
      if (Boolean(r.isTownMode) !== Boolean(this.isTownMode)) continue;
      const worldY = r.y + this.groundY;
      const d = Math.hypot(r.x - this.player.x, worldY - this.player.y);
      if (d < bestDist) {
        bestDist = d;
        best = { socketId, x: r.x, y: worldY, name: r.name };
      }
    }
    return best;
  }

  /**
   * Called every frame with whether the interact key is held. Standing beside a
   * downed teammate and holding fills the bar; stepping away or letting go
   * loses it, so a rescue costs you position in the middle of a fight.
   */
  public updateRevive(dt: number, holding: boolean) {
    const target = this.nearestDownedAlly();
    if (!target || !holding || this.player.downed) {
      this.reviveHold = 0;
      this.reviveTargetId = null;
      return;
    }
    if (this.reviveTargetId !== target.socketId) {
      this.reviveTargetId = target.socketId;
      this.reviveHold = 0;
    }
    this.reviveHold += dt;
    if (this.reviveHold < SideViewEngine.REVIVE_HOLD_SECONDS) return;

    this.reviveHold = 0;
    this.reviveTargetId = null;
    network.sendPartySupport({ kind: 'revive', targetSocketId: target.socketId, casterName: this.playerName() });
    this.revivesGiven++;
    audio.playLevelUp();
    this.particles.addFloatingText(target.x, target.y - 50, 'REVIVED!', '#4ade80', true, 18);
  }

  /** We were picked up: back on our feet, hurt but standing. */
  public acceptRevive(byName?: string, hpPercent = 0.4) {
    const p = this.player;
    if (!p.downed) return;
    p.downed = false;
    p.downTimer = 0;
    const boundedPercent = Number.isFinite(hpPercent) ? Math.max(0, Math.min(1, hpPercent)) : 0.4;
    p.hp = Math.max(1, Math.round(p.maxHp * boundedPercent));
    p.mp = Math.max(p.mp, Math.round(p.maxMp * 0.25));
    p.iframeTimer = 2.5;
    p.animState = 'idle';
    audio.playLevelUp();
    this.particles.addFloatingText(
      p.x, p.y - 46,
      byName ? `SAVED BY ${byName.toUpperCase()}!` : 'BACK ON YOUR FEET!',
      '#4ade80', true, 19,
    );
  }

  /** Bleed-out. Nobody reached us in time, so the run ends after all. */
  private tickDowned(dt: number) {
    const p = this.player;
    if (!p.downed) return;
    p.vx = 0;
    p.animState = 'dead';
    p.downTimer = Math.max(0, (p.downTimer || 0) - dt);
    if (p.downTimer > 0) return;
    p.downed = false;
    if (this.runOver) return;
    this.runOver = true;
    this.cancelDelayedCombatTasks();
    this.onRunLost?.();
  }

  public quickHeal(): 'healed' | 'full' | 'none' | 'blocked' {
    const p = this.player;
    if (p.downed || this.runOver || p.hp <= 0) return 'blocked';
    if (p.hp >= p.maxHp) return 'full';

    // Weakest sufficient potion first: spending a large one on a scratch is a
    // waste the player would not choose deliberately.
    const missing = p.maxHp - p.hp;
    const candidates = p.inventory
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => item.consumableEffect?.type === 'heal_hp')
      .sort((a, b) => (a.item.consumableEffect!.value) - (b.item.consumableEffect!.value));
    if (!candidates.length) return 'none';

    const pick = candidates.find((c) => c.item.consumableEffect!.value >= missing) || candidates[candidates.length - 1];
    const heal = pick.item.consumableEffect!.value;

    p.inventory.splice(pick.idx, 1);
    p.hp = Math.min(p.maxHp, p.hp + heal);
    this.particles.addFloatingText(p.x, p.y - 26, `+${heal} HP`, '#4ade80', true, 17);
    audio.playClick();
    this.triggerSave();
    return 'healed';
  }

  /** How many healing items are in the bag, for the quick-slot badge. */
  public get potionCount(): number {
    return this.player.inventory.filter((i) => i.consumableEffect?.type === 'heal_hp').length;
  }

  /**
   * One number for everything the player has earned.
   *
   * Built from the totals rather than from the sources, so it counts levels,
   * equipment and forge purchases without having to know which contributed
   * what - and an item that raises attack is worth the same as a level that
   * raises it by as much, which is the honest comparison.
   *
   * The weights are per point of each stat, chosen so no single line dominates:
   * offence and survivability are worth roughly the same at typical values, and
   * the percentage stats are scaled to be comparable to the flat ones.
   */
  /** How many points have been sunk into a skill. */
  public skillLevel(skillId: string): number {
    return this.player.skillLevels?.[skillId] || 0;
  }

  /**
   * Spends a point on a skill.
   *
   * Capped, so one skill cannot become the only one worth pressing - the mana
   * costs exist to make the rotation a decision, and an uncapped skill undoes
   * that.
   */
  public upgradeSkill(skillId: string): boolean {
    const p = this.player;
    if ((p.skillPoints || 0) <= 0) return false;
    if (this.skillLevel(skillId) >= 5) return false;

    p.skillLevels = p.skillLevels || {};
    p.skillLevels[skillId] = this.skillLevel(skillId) + 1;
    p.skillPoints = (p.skillPoints || 0) - 1;
    this.triggerSave();
    audio.playLevelUp();
    return true;
  }

  public computePower(): number {
    const p = this.player;

    // Level, items and upgrades - and nothing else.
    //
    // This used to read totalAtk and the other totals, which include active
    // buffs, so casting a buff skill made your Power jump and drinking a potion
    // moved it again. Power is meant to describe what you have built, not what
    // you are doing this second, so it is rebuilt here from the permanent parts:
    // base stats (which is where forge upgrades live), equipment, and level.
    let gearAtk = 0, gearDef = 0, gearHp = 0, gearMp = 0, gearCrit = 0, gearSpeed = 0;
    // Six-tier ladder now - the two new tiers sit where they belong on it.
    const rarityValue: Record<string, number> = { common: 15, uncommon: 28, rare: 45, epic: 110, legendary: 260, mythical: 600 };
    let rarity = 0;

    for (const slot of Object.values(p.equipment)) {
      if (!slot) continue;
      gearAtk += slot.stats?.atk || 0;
      gearDef += slot.stats?.def || 0;
      gearHp += slot.stats?.hp || 0;
      gearMp += slot.stats?.mp || 0;
      gearCrit += slot.stats?.crit || 0;
      gearSpeed += slot.stats?.speed || 0;
      rarity += rarityValue[slot.rarity] ?? 15;
    }

    const lvlMultiplier = 1 + (p.level - 1) * 0.08;
    const forgedHp = 50 * (Number(localStorage.getItem('forge_hp')) || 0);

    const atk = (p.baseAtk + gearAtk) * lvlMultiplier;
    const def = (p.baseDef + gearDef) * lvlMultiplier;
    const hp = (p.characterClass.stats.maxHp + gearHp) * lvlMultiplier + forgedHp;
    const mp = (p.characterClass.stats.maxMp + gearMp) * lvlMultiplier;
    const crit = p.baseCrit + gearCrit;
    const speed = p.baseSpeed + gearSpeed;

    return Math.round(
      atk * 10 +
      def * 8 +
      hp * 0.6 +
      mp * 0.3 +
      crit * 100 * 6 +
      speed * 12 +
      p.level * 40 +
      rarity
    );
  }

  private incomingDamageMultiplier(): number {
    // Guardian Sigil's authored guard-capacity becomes bounded passive chip
    // mitigation; parry still remains the full skill-based answer.
    let multiplier = 1 - Math.min(0.35, this.runRelicGuardCapacity / 600);
    for (const buff of this.player.activeBuffs) {
      if (buff.stat === 'damageReduction') multiplier *= Math.max(0.05, buff.multiplier);
    }
    for (const zone of this.particles.groundZones) {
      if (!zone.allyMitigation) continue;
      if (Math.abs(this.player.x - zone.x) <= zone.radius) multiplier *= 1 - zone.allyMitigation;
    }
    return Math.max(0.1, multiplier);
  }

  private absorbPlayerDamage(incoming: number): { hpDamage: number; absorbed: number } {
    let remaining = incoming;
    let absorbed = 0;
    for (const buff of this.player.activeBuffs) {
      if (buff.stat !== 'shield' || !buff.amount || remaining <= 0) continue;
      const used = Math.min(buff.amount, remaining);
      buff.amount -= used;
      remaining -= used;
      absorbed += used;
      if (buff.amount <= 0) buff.timer = 0;
    }
    return { hpDamage: remaining, absorbed };
  }

  private rollEnemyRawDamage(enemy: EnemyInstance, multiplier: number): number {
    return enemy.atk * BALANCE.enemyAtk * multiplier * (1 + (Math.random() * 0.2 - 0.1));
  }

  private nextPlayerDamageHitId(): string {
    this.playerDamageSequence = (this.playerDamageSequence + 1) % 0x7fffffff;
    return `pd_${this.playerDamageNonce}_${Date.now().toString(36)}_${this.playerDamageSequence.toString(36)}`;
  }

  private applyIncomingPlayerDamage(
    rawDamage: number,
    sourceX: number,
    status?: PlayerDamageStatus,
    attack?: IncomingAttackContext,
  ): number {
    const p = this.player;
    // Committing to an ultimate should never get you punished for it - the
    // caster is untouchable for the length of the cinematic.
    // Already down: the bleed-out clock is the threat now, not the boss. Being
    // finished off while helpless would just shorten a window meant for rescue.
    if (p.downed || this.runOver || p.hp <= 0) return 0;
    if (p.iframeTimer > 0 && !attack) return 0;
    if (p.stealthTimer > 0 || this.ultimate.invulnerable) return 0;

    if (attack) {
      const defense = resolveIncomingDefense(this.playerDefense, {
        parryability: attack.parryability,
        sourceDirection: sourceX >= p.x ? 1 : -1,
        defenderFacing: p.facing < 0 ? -1 : 1,
      });
      this.playerDefense = defense.state;
      if (defense.negatesDamage && defense.outcome !== 'hit') {
        const perfect = defense.outcome === 'perfect-dodge';
        const parried = defense.outcome === 'parry';
        const feedbackId = parried ? COMBAT_FEEDBACK_SPRITES.parry : COMBAT_FEEDBACK_SPRITES.dodge;
        this.addCombatSpriteEffect(feedbackId, p.x + p.facing * 14, p.y - 8, parried ? 0.4 : 0.34, p.facing, parried ? 1 : 0.82);
        p.iframeTimer = Math.max(p.iframeTimer, parried ? 0.22 : 0.16);
        if (!this.isHost && network.room && attack.intentId && attack.sourceEnemyId) {
          network.sendCombatDefense({
            intentId: attack.intentId,
            sourceEnemyId: attack.sourceEnemyId,
            outcome: defense.outcome,
          });
        }

        if (perfect) {
          const mp = Math.max(1, Math.round(p.maxMp * 0.06));
          p.mp = Math.min(p.maxMp, p.mp + mp);
          Object.keys(p.skillCooldowns).forEach(skillId => {
            p.skillCooldowns[skillId] = Math.max(0, (p.skillCooldowns[skillId] || 0) - 0.45);
          });
          this.particles.addFloatingText(p.x, p.y - 48, `PERFECT DODGE +${mp} MP`, '#67e8f9', true, 14);
          audio.playId('blink', 0.85);
        } else if (parried) {
          this.particles.addFloatingText(p.x, p.y - 48, 'PARRY', '#fde68a', true, 15);
          audio.playId('metal_ring', 1);
          const attacker = attack.sourceEnemyId
            ? this.enemies.find(enemy => enemy.id === attack.sourceEnemyId && !enemy.isDead)
            : undefined;
          if (attacker?.guardState) {
            const impact = resolveGuardStaggerImpact(attacker.guardState, {
              incomingDamage: 0,
              guardDamage: defense.attackerGuardDamage,
              staggerDamage: defense.attackerStaggerDamage,
              sourceDirection: p.x >= attacker.x ? 1 : -1,
              defenderFacing: attacker.facing < 0 ? -1 : 1,
              bypassGuard: true,
            });
            attacker.guardState = impact.state;
            attacker.attackIntent = undefined;
            attacker.hitStun = Math.max(attacker.hitStun, impact.state.staggeredRemaining, 0.35);
            this.addCombatSpriteEffect(COMBAT_FEEDBACK_SPRITES.stagger, attacker.x, attacker.y - 20, 0.65, attacker.facing, 0.9);
          }
        }
        return 0;
      }
    }

    // Legacy skill movement and shields can still grant i-frames outside the
    // explicit dodge state.
    if (p.iframeTimer > 0) return 0;

    const mitigated = Math.max(1, Math.round(afterDefence(rawDamage, p.totalDef) * this.incomingDamageMultiplier()));
    const { hpDamage: finalDamage, absorbed } = this.absorbPlayerDamage(mitigated);

    p.hp = Math.max(0, p.hp - finalDamage);
    this.damageTaken += finalDamage;
    this.lastHurtAt = performance.now();
    p.iframeTimer = 0.4;
    const knockbackDir = p.x === sourceX ? -p.facing : (p.x > sourceX ? 1 : -1);
    p.vx = knockbackDir * 4.0;
    p.vy = -2.0;

    if (status) this.applyPlayerNegativeStatus(status, `hostile:${status.kind}`);

    audio.playHit(false);
    this.particles.triggerScreenShake(finalDamage > 0 ? 6 : 2, 0.2);
    if (absorbed > 0) {
      this.particles.addFloatingText(p.x, p.y - p.height / 2 - 14, `SHIELD -${absorbed}`, '#60a5fa', false, 14);
    }
    if (finalDamage > 0) {
      this.particles.addFloatingText(p.x, p.y - p.height / 2, `-${finalDamage}`, '#ef5350', false, 18);
    }

    // Resolve a lethal hit in the same combat event. Waiting for the next
    // frame used to give passive regeneration a chance to erase the zero-HP
    // state before downed/death logic saw it.
    this.resolvePlayerDefeat();
    return finalDamage;
  }

  /** Host-authored room hazards use this narrow public damage boundary. */
  public applyEncounterPlayerDamage(rawDamage: number, sourceX: number): number {
    if (this.isTownMode || !Number.isFinite(rawDamage) || rawDamage <= 0) return 0;
    return this.applyIncomingPlayerDamage(
      Math.min(9_999, rawDamage),
      Number.isFinite(sourceX) ? sourceX : this.player.x,
      undefined,
      { parryability: 'dodge-only' },
    );
  }

  /** Host-side replay of a guest's server-validated defensive result. */
  public applyRemoteCombatDefense(result: {
    socketId: string;
    intentId: string;
    sourceEnemyId: string;
    outcome: 'dodge' | 'perfect-dodge' | 'parry';
  }): boolean {
    if (!this.isHost || this.isTownMode || !result?.socketId) return false;
    const enemy = this.enemies.find(candidate => candidate.id === result.sourceEnemyId && !candidate.isDead);
    const intent = enemy?.attackIntent;
    if (!enemy || !intent || intent.intentId !== result.intentId) return false;
    if (intent.target.actorId !== result.socketId) return false;
    const phase = enemyAttackIntentPhase(intent).phase;
    if (phase !== 'active' && phase !== 'recovery') return false;
    if (result.outcome !== 'parry') return true;

    if (enemy.guardState) {
      const impact = resolveGuardStaggerImpact(enemy.guardState, {
        incomingDamage: 0,
        guardDamage: 60,
        staggerDamage: 45,
        sourceDirection: enemy.facing < 0 ? -1 : 1,
        defenderFacing: enemy.facing < 0 ? -1 : 1,
        bypassGuard: true,
      });
      enemy.guardState = impact.state;
    }
    enemy.attackIntent = undefined;
    enemy.hitStun = Math.max(enemy.hitStun, enemy.guardState?.staggeredRemaining || 0, 0.35);
    this.addCombatSpriteEffect(COMBAT_FEEDBACK_SPRITES.stagger, enemy.x, enemy.y - 20, 0.65, enemy.facing, 0.9);
    return true;
  }

  /**
   * Guest-side endpoint for one server-verified host hit. It deliberately
   * receives raw attack power: this device owns its defence, shield, i-frames,
   * death-prevention inventory, and downed transition.
   */
  public applyNetworkPlayerDamage(packet: PlayerDamagePacket): number {
    if (this.isHost || !network.room) return 0;
    if (!packet || packet.isTownMode !== this.isTownMode || packet.sceneId !== this.networkSceneId) return 0;
    if (!/^[A-Za-z0-9:_-]{1,96}$/.test(packet.hitId)) return 0;
    if (!Number.isFinite(packet.rawDamage) || packet.rawDamage < 1 || packet.rawDamage > 250_000) return 0;
    if (!Number.isFinite(packet.sourceX) || Math.abs(packet.sourceX) > 10_000_000) return 0;
    if (packet.knockbackDir !== -1 && packet.knockbackDir !== 1) return 0;

    const now = performance.now();
    for (const [hitId, receivedAt] of this.receivedPlayerDamageHits) {
      if (now - receivedAt > 15_000) this.receivedPlayerDamageHits.delete(hitId);
    }
    if (this.receivedPlayerDamageHits.has(packet.hitId)) return 0;
    this.receivedPlayerDamageHits.set(packet.hitId, now);
    while (this.receivedPlayerDamageHits.size > 512) {
      const oldest = this.receivedPlayerDamageHits.keys().next().value;
      if (typeof oldest !== 'string') break;
      this.receivedPlayerDamageHits.delete(oldest);
    }

    const extended = packet as PlayerDamagePacket & Partial<{
      parryability: IncomingAttackDefense;
      intentId: string;
      sourceEnemyId: string;
      profileId: EnemyAttackProfileId;
    }>;
    return this.applyIncomingPlayerDamage(packet.rawDamage, packet.sourceX, packet.status, extended.parryability ? {
      parryability: extended.parryability,
      intentId: extended.intentId,
      sourceEnemyId: extended.sourceEnemyId,
      profileId: extended.profileId,
    } : undefined);
  }

  private enemyAttackCombatTarget(
    enemy: EnemyInstance,
    target: CombatPlayerTarget,
    multiplier: number = 1,
    status?: PlayerDamageStatus,
    parryability: IncomingAttackDefense = 'parryable',
    intentId?: string,
    profileId?: EnemyAttackProfileId,
  ) {
    if (!this.isHost || this.isTownMode) return;
    const rawDamage = this.rollEnemyRawDamage(enemy, multiplier);
    if (target.kind === 'local') {
      this.applyIncomingPlayerDamage(rawDamage, enemy.x, status, {
        parryability,
        intentId,
        sourceEnemyId: enemy.id,
        profileId,
      });
      return;
    }
    if (!target.socketId) return;
    network.sendPlayerDamage(target.socketId, {
      hitId: this.nextPlayerDamageHitId(),
      rawDamage: Math.max(1, Math.min(250_000, Math.round(rawDamage * 100) / 100)),
      sourceX: enemy.x,
      knockbackDir: target.x >= enemy.x ? 1 : -1,
      isTownMode: false,
      sceneId: this.networkSceneId,
      status,
      parryability,
      intentId,
      sourceEnemyId: enemy.id,
      profileId,
    });
  }

  private updateLoot(dt: number) {
    const p = this.player;
    const dtFrame = dt * this.physicsFrameScale;

    for (let i = this.droppedLoots.length - 1; i >= 0; i--) {
      const loot = this.droppedLoots[i];
      loot.bobTimer += dt * 3;
      loot.despawnTimer = (loot.despawnTimer !== undefined ? loot.despawnTimer : 30) - dt;

      // Despawn on 30s timeout with smoke puff
      if (loot.despawnTimer <= 0) {
        this.droppedLoots.splice(i, 1);
        continue;
      }

      if (!loot.isGrounded) {
        loot.vy += this.gravity * 0.8 * dtFrame;
        loot.x += loot.vx * dtFrame;
        loot.y += loot.vy * dtFrame;

        if (loot.y >= this.groundY - 10) {
          loot.y = this.groundY - 10;
          loot.vy = 0;
          loot.vx = 0;
          loot.isGrounded = true;
        }
      }

      // Check player pickup
      const dist = Math.hypot(p.x - loot.x, p.y - loot.y);
      if (dist < 45) {
        // Collect item into inventory
        p.inventory.push(loot.item);
        // Picking something up was not saved at all. An item only reached disk
        // if you happened to equip it or level up afterwards, so anything
        // collected and left in the bag was gone on the next load.
        this.triggerSave();
        audio.playLoot(loot.item.rarity);
        const rConfig = RARITY_CONFIGS[loot.item.rarity] || RARITY_CONFIGS.common;
        this.particles.addFloatingText(p.x, p.y - 25, `+ ${loot.item.name} (${rConfig.name})`, rConfig.color, true, 16);
        // Tell the party about anything worth envying. A drop nobody else sees
        // is the same as no drop at all for the mood of a run.
        if (loot.item.rarity !== 'common' && network.isPartied) {
          network.sendPartySupport({
            kind: 'loot',
            casterName: localStorage.getItem('playerName') || 'A teammate',
            itemName: loot.item.name,
            rarity: loot.item.rarity,
          });
        }
        this.droppedLoots.splice(i, 1);
      }
    }
  }

  private projectileIntersectsEnemy(proj: import('./ParticleSystem').ProjectileVFX, enemy: EnemyInstance): boolean {
    const radiusX = Math.max(1, proj.radius + (enemy.width || 40) / 2);
    const radiusY = Math.max(1, proj.radius + 40);
    const chestY = enemy.y - 24;
    const startX = ((proj.previousX ?? proj.x) - enemy.x) / radiusX;
    const startY = ((proj.previousY ?? proj.y) - chestY) / radiusY;
    const endX = (proj.x - enemy.x) / radiusX;
    const endY = (proj.y - chestY) / radiusY;
    const segmentX = endX - startX;
    const segmentY = endY - startY;
    const lengthSq = segmentX * segmentX + segmentY * segmentY;
    const t = lengthSq > 0
      ? Math.max(0, Math.min(1, -(startX * segmentX + startY * segmentY) / lengthSq))
      : 0;
    const closestX = startX + segmentX * t;
    const closestY = startY + segmentY * t;
    return closestX * closestX + closestY * closestY <= 1;
  }

  private checkProjectileCollisions() {
    for (let i = this.particles.projectiles.length - 1; i >= 0; i--) {
      const proj = this.particles.projectiles[i];

      if (proj.fromPlayer && !proj.visualOnly) {
        for (const enemy of this.enemies) {
          if (enemy.isDead) continue;
          // Sweep the projectile's previous-to-current segment through an
          // enemy-sized ellipse. Endpoint-only checks let fast arrows tunnel
          // through targets on a 30 FPS device or one long browser frame.
          if (this.projectileIntersectsEnemy(proj, enemy)) {
            if (proj.piercing) {
              const hitList = proj.hitEnemyIds || [];
              if (hitList.includes(enemy.id)) {
                continue;
              }
              proj.hitEnemyIds = hitList;
              hitList.push(enemy.id);
            }

            const skill = proj.skillId ? this.findSkillById(proj.skillId) : null;
            if (skill) {
              if (proj.aoeRadius && proj.aoeRadius > 0) {
                this.hitArea(skill, enemy.x, enemy.y - 24, proj.damage, proj.isCrit, proj.castToken ?? 0);
              } else {
                this.hitEnemyWithSkill(
                  enemy,
                  skill,
                  proj.damage,
                  proj.isCrit,
                  proj.castToken ?? 0,
                  proj.virtualHitDamages,
                );
              }
            } else {
              this.applyDamageToEnemy(enemy, proj.damage, proj.isCrit, proj.vx > 0 ? 1 : -1);
            }
            if (!proj.piercing) {
              this.particles.completeProjectile(proj, enemy.x, enemy.y - 18);
              this.particles.removeProjectileAt(i);
              break;
            } else {
              if (proj.impactVfx) {
                this.particles.playVfx(proj.impactVfx, enemy.x, enemy.y - 18, {
                  facing: proj.vx >= 0 ? 1 : -1,
                  row: proj.impactRow,
                  scale: proj.impactScale,
                });
              }
              if (proj.identity) this.particles.addSkillIdentityAccent(enemy.x, enemy.y, proj.vx >= 0 ? 1 : -1, proj.identity);
            }
          }
        }
      }
    }
  }


  public useOrEquipItem(invIdx: number) {
    const p = this.player;
    const item = p.inventory[invIdx];
    if (!item) return;

    // Consumables
    if (item.type === 'consumable') {
      p.inventory.splice(invIdx, 1);
      this.triggerSave();

      if (!item.consumableEffect) {
        audio.playClick();
        return;
      }

      if (item.consumableEffect.type === 'heal_hp') {
        p.hp = Math.min(p.maxHp, p.hp + item.consumableEffect.value);
        this.particles.addFloatingText(p.x, p.y - 20, `+${item.consumableEffect.value} HP`, '#4ade80', true, 16);
      } else if (item.consumableEffect.type === 'heal_mp') {
        p.mp = Math.min(p.maxMp, p.mp + item.consumableEffect.value);
        this.particles.addFloatingText(p.x, p.y - 20, `+${item.consumableEffect.value} MP`, '#38bdf8', true, 16);
      } else if (item.consumableEffect.type === 'buff_atk' || item.consumableEffect.type === 'buff_speed') {
        p.activeBuffs.push({
          stat: item.consumableEffect.type === 'buff_atk' ? 'atk' : 'speed',
          multiplier: item.consumableEffect.value,
          timer: item.consumableEffect.duration || 10
        });
        this.recomputeStats();
        const buffStat = item.consumableEffect.type === 'buff_atk' ? 'ATK' : 'SPEED';
        this.particles.addFloatingText(p.x, p.y - 24, `${buffStat} +${Math.round((item.consumableEffect.value - 1) * 100)}%`, '#fbbf24', true, 14);
      } else if (item.consumableEffect.type === 'revive') {
        p.hp = Math.max(1, item.consumableEffect.value || 1);
        this.particles.addFloatingText(p.x, p.y - 24, 'RESURRECTED', '#ef4444', true, 16);
      }

      audio.playClick();
      return;
    }

    // Gems, cards and crafting materials are not equippable - they are used at
    // town services. Clicking one in the bag just explains that instead of
    // silently writing a gem into a weapon slot.
    if (item.type === 'gem' || item.type === 'card' || item.type === 'material') {
      this.particles.addFloatingText(
        p.x, p.y - 24,
        item.type === 'card' ? 'Slot cards at the Blacksmith' : item.type === 'gem' ? 'Socket gems at the Jeweler' : 'Crafting material',
        '#94a3b8', true, 13,
      );
      audio.playClick();
      return;
    }

    // Equipable items
    p.inventory.splice(invIdx, 1);
    const prevEquipped = p.equipment[item.type as keyof PlayerEquipment];
    if (prevEquipped) {
      p.inventory.push(prevEquipped);
    }
    p.equipment[item.type as keyof PlayerEquipment] = item;
    this.recomputeStats();
    this.triggerSave();
    this.particles.addFloatingText(p.x, p.y - 24, `Equipped ${item.name}`, '#22c55e', true, 14);
    audio.playClick();
  }

  public unequipItem(slotType: keyof PlayerEquipment) {
    const p = this.player;
    const item = p.equipment[slotType];
    if (!item) return;

    p.equipment[slotType] = undefined;
    p.inventory.push(item);
    this.recomputeStats();
    this.triggerSave();
    this.particles.addFloatingText(p.x, p.y - 24, `Unequipped ${item.name}`, '#94a3b8', true, 14);
    audio.playClick();
  }

  private zoneHazardColour(kind: HazardKind): string {
    if (kind === 'poison-pool' || kind === 'root-spikes' || kind === 'ridge-gust') return '#84cc16';
    if (kind === 'cursed-mist' || kind === 'void-pulse' || kind === 'astral-burst') return '#c084fc';
    if (kind === 'abyss-current') return '#22d3ee';
    if (kind === 'rockfall' || kind === 'warband-volley' || kind === 'siege-shot') return '#fbbf24';
    return '#fb542b';
  }

  private drawZoneHazards(
    ctx: CanvasRenderingContext2D,
    cameraX: number,
    viewportWidth: number,
    preferences: ZoneAccessibilityPreferences = this.zoneAccessibilityPreferences(),
  ) {
    if (this.isTownMode) return;

    for (const hazard of this.getZoneHazardSnapshot()) {
      if (hazard.phase === 'idle' || hazard.phase === 'cooldown') continue;
      if (hazard.x + hazard.radius < cameraX - 100 || hazard.x - hazard.radius > cameraX + viewportWidth + 100) continue;

      const colour = this.zoneHazardColour(hazard.kind);
      const animatedPulse = preferences.reducedMotion
        ? 1
        : 0.88 + Math.sin(this.zoneHazardClock * 14) * 0.12;
      ctx.save();
      ctx.translate(hazard.x, hazard.y);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (hazard.phase === 'telegraph') {
        const contraction = preferences.reducedMotion ? 1 : 1.18 - hazard.phaseProgress * 0.18;
        ctx.globalAlpha = 0.18 + hazard.phaseProgress * 0.24;
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.ellipse(0, -2, hazard.radius, Math.max(12, hazard.radius * 0.2), 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.76;
        ctx.strokeStyle = colour;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = preferences.reducedMotion ? 0 : -this.zoneHazardClock * 24;
        ctx.beginPath();
        ctx.ellipse(
          0,
          -2,
          hazard.radius * contraction,
          Math.max(15, hazard.radius * 0.24 * contraction),
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.globalAlpha = 0.9;
        ctx.font = '900 10px "Outfit", sans-serif';
        ctx.fillStyle = '#fff7ed';
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.lineWidth = 3;
        ctx.strokeText('DANGER', 0, -25);
        ctx.fillText('DANGER', 0, -25);
      } else {
        ctx.globalAlpha = 0.48 * animatedPulse;
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.ellipse(0, -3, hazard.radius, Math.max(18, hazard.radius * 0.25), 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#fff7ed';
        ctx.lineWidth = 2;
        for (let offset = -0.65; offset <= 0.65; offset += 0.325) {
          const x = hazard.radius * offset;
          ctx.beginPath();
          ctx.moveTo(x - 7, 0);
          ctx.lineTo(x, -24 - Math.abs(offset) * 10);
          ctx.lineTo(x + 7, 0);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  private drawEnemyIntent(ctx: CanvasRenderingContext2D, enemy: EnemyInstance) {
    const intent = enemy.attackIntent;
    if (!intent) return;
    const phase = enemyAttackIntentPhase(intent);
    if (phase.phase !== 'telegraph' && phase.phase !== 'active') return;
    const profile = getEnemyAttackProfile(intent.profileId);
    const role = enemy.role;
    const roleSprites = role && role !== 'boss' && role !== 'bruiser'
      ? ENEMY_ROLE_SPRITES[role]
      : null;
    const id = roleSprites?.telegraph || (
      profile.hitShape === 'line'
        ? COMBAT_FEEDBACK_SPRITES['ranged-telegraph']
        : profile.hitShape === 'contact' || profile.hitShape === 'cone'
          ? COMBAT_FEEDBACK_SPRITES['melee-telegraph']
          : COMBAT_FEEDBACK_SPRITES['area-telegraph']
    );
    const targetX = profile.targetMode === 'self' ? enemy.x : intent.target.x;
    const targetY = profile.targetMode === 'self' ? enemy.y : intent.target.y;
    const authoredWidth = profile.hitShape === 'line'
      ? Math.max(90, Math.min(profile.range, 360))
      : Math.max(72, profile.radius * 2);
    gameplaySprites.draw(ctx, id, targetX, targetY, {
      time: intent.elapsed,
      normalizedProgress: phase.progress,
      facing: intent.facing,
      width: authoredWidth,
      alpha: phase.phase === 'active' ? 0.95 : 0.55 + phase.progress * 0.4,
    });
  }

  private drawTacticalEnemy(ctx: CanvasRenderingContext2D, enemy: EnemyInstance): boolean {
    const role = enemy.role;
    if (!role || role === 'boss' || role === 'bruiser') return false;
    const set = ENEMY_ROLE_SPRITES[role];
    const spriteId = enemy.hitStun > 0 || (enemy.guardState?.staggeredRemaining || 0) > 0
      ? set.hit
      : enemy.isAttacking
        ? set.attack
        : Math.abs(enemy.vx) > 0.1 ? set.move : set.idle;
    return gameplaySprites.draw(ctx, spriteId, enemy.x, enemy.y, {
      time: this.zoneHazardClock,
      facing: enemy.facing < 0 ? -1 : 1,
      // Role sheets contain generous transparent gutters (the Goblin art is
      // only 36px tall inside a 150px frame).  `enemy.height` is the combat
      // hitbox, not an authored sprite-frame height; forcing that 48px hitbox
      // onto the whole frame reduced the visible actor to roughly 12px.  Let
      // the manifest's measured frame size and per-clip scale own presentation
      // while collision dimensions remain untouched.
      alpha: enemy.hitStun > 0 ? 0.82 : 1,
    });
  }

  private gameplayStatusSprite(kind: EnemyStatusKind): GameplaySpriteId | null {
    if (kind === 'wet') return 'status.wet';
    if (kind === 'burn') return 'status.burn';
    if (kind === 'freeze') return 'status.freeze';
    if (kind === 'curse') return 'status.curse';
    return null;
  }

  /**
   * Render side-view world, player, enemies, loot, and spell animations
   */
  public render(ctx: CanvasRenderingContext2D, width: number, height: number) {
    // Dynamic virtual resolution with intelligent zoom scaling
    // Scales pixel sprites up 2x - 2.5x so they are large, clear, and heroic!
    const zoom = Math.max(1.65, Math.min(2.5, height / 440));
    const virtualWidth = width / zoom;
    const virtualHeight = height / zoom;

    this.canvasWidth = virtualWidth;
    this.canvasHeight = virtualHeight;
    this.groundY = Math.round(virtualHeight - 75);
    const currentTheme = this.activeZoneTheme();
    const visualPreferences = this.zoneAccessibilityPreferences();
    const vfxQuality = this.particles.getVfxQuality();
    const presentationOptions = {
      elapsedSeconds: this.zoneHazardClock,
      reducedMotion: visualPreferences.reducedMotion,
      quality: vfxQuality === 'high' ? 'high' as const : (vfxQuality === 'medium' ? 'balanced' as const : 'low' as const),
    };
    this.ensureZoneGeometry();

    const p = this.player;
    const shake = this.particles.getScreenShakeOffset();
    const camX = this.cameraX + shake.x;
    const camY = shake.y;

    ctx.save();
    ctx.scale(zoom, zoom);

    // 1. Draw Seamless Parallax Background & Deep Ground Tiles
    sprites.drawEnvironment(ctx, camX, virtualWidth, virtualHeight, this.groundY, this.arenaWidth, currentTheme);
    sprites.drawZoneContentPlane(ctx, currentTheme, 'background', camX, virtualWidth, this.groundY);
    sprites.drawZoneContentPlane(ctx, currentTheme, 'gameplay-back', camX, virtualWidth, this.groundY);
    drawZonePresentation(
      ctx,
      currentTheme,
      'behind-entities',
      camX,
      virtualWidth,
      virtualHeight,
      this.groundY,
      presentationOptions,
    );

    ctx.save();
    ctx.translate(-camX, -camY);

    // 1.5 Draw Multi-Level Platforms
    sprites.drawPlatforms(ctx, this.platforms, currentTheme);
    this.dungeonEncounterRuntime?.render(ctx, this.zoneHazardClock);
    this.drawZoneHazards(ctx, camX, virtualWidth, visualPreferences);

    // 2. Render Dropped Loot with Rarity Beacons & Cached Sprites
    for (const loot of this.droppedLoots) {
      const bobY = loot.y + Math.sin(loot.bobTimer) * 4;
      const rConfig = RARITY_CONFIGS[loot.item.rarity] || RARITY_CONFIGS.common;
      const glowColor = rConfig.color;

      ctx.save();

      // Despawn blink when under 5s
      if (loot.despawnTimer !== undefined && loot.despawnTimer < 5.0) {
        if (Math.floor(Date.now() / 120) % 2 === 0) {
          ctx.globalAlpha = 0.35;
        }
      }

      // Vertical beacon of light for Epic and Legendary items.
      //
      // The property is beamColor; this asked for beaconColor, which is always
      // undefined - so the condition was never true and the beacon that marks a
      // legendary drop has never once been drawn. TypeScript reported it the
      // whole time as one of the errors being carried.
      if (rConfig.beamColor) {
        const beaconGrad = ctx.createLinearGradient(loot.x, bobY, loot.x, bobY - 260);
        beaconGrad.addColorStop(0, rConfig.beamColor);
        beaconGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = beaconGrad;
        ctx.fillRect(loot.x - 4, bobY - 260, 8, 260);

        // Core light beam
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillRect(loot.x - 1.5, bobY - 260, 3, 260);
      }

      // Shadow on ground
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(loot.x, loot.y + 10, 12, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Glow halo
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 12;
      // bgColor, not bg: the fallback was doing all the work, so every rarity
      // drew the same white halo.
      ctx.fillStyle = rConfig.bgColor || 'rgba(255, 255, 255, 0.15)';
      ctx.beginPath();
      ctx.arc(loot.x, bobY, 16, 0, Math.PI * 2);
      ctx.fill();

      // Icon image from SpriteManager cache
      if (loot.item.image) {
        const itemImg = sprites.getImage(loot.item.image);
        if (itemImg && itemImg.complete) {
          ctx.drawImage(itemImg, loot.x - 14, bobY - 14, 28, 28);
        }
      }

      // Floating Name Tag Pill with Rarity Style
      const tagY = bobY - 24;
      ctx.font = 'bold 10px "Cinzel", sans-serif';
      const nameText = loot.item.name;
      const textWidth = ctx.measureText(nameText).width;
      const pillW = textWidth + 14;
      const pillH = 16;

      ctx.shadowBlur = 6;
      ctx.shadowColor = glowColor;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 1;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(loot.x - pillW / 2, tagY - pillH / 2, pillW, pillH, 4);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(loot.x - pillW / 2, tagY - pillH / 2, pillW, pillH);
        ctx.strokeRect(loot.x - pillW / 2, tagY - pillH / 2, pillW, pillH);
      }

      ctx.shadowBlur = 0;
      ctx.fillStyle = glowColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(nameText, loot.x, tagY);

      ctx.restore();
    }

    // 3. Render Enemies or Town NPCs
    if (this.isTownMode && this.townHub) {
      this.renderTownEntities(ctx);
    } else {
      for (const enemy of this.enemies) {
        if (enemy.isDead || !enemy.isActive) continue;

        this.drawEnemyIntent(ctx, enemy);
        
        // Elite identity is catalogue-backed, so each modifier is visible and
        // not an anonymous procedural glow.
        for (const modifierId of enemy.eliteModifiers || []) {
          gameplaySprites.draw(ctx, ELITE_MODIFIERS[modifierId].visualSprite, enemy.x, enemy.y, {
            time: this.zoneHazardClock,
            facing: enemy.facing < 0 ? -1 : 1,
            height: Math.max(54, enemy.height * 1.18),
            alpha: 0.72,
          });
        }

        // Draw Animated Mob Sprite
        if (!this.drawTacticalEnemy(ctx, enemy)) {
          sprites.drawMob(
            ctx,
            enemy.x,
            enemy.y,
            enemy.name,
            enemy.hitStun > 0 ? 'hit'
              : enemy.isAttacking ? 'attack'
              : (Math.abs(enemy.vx) > 0.1 ? 'run' : 'idle'),
            enemy.facing,
            enemy.type === 'boss',
            enemy.hitStun,
          );
        }

        if (enemy.guardState?.guarding && enemy.role && enemy.role !== 'boss' && enemy.role !== 'bruiser') {
          gameplaySprites.draw(ctx, ENEMY_ROLE_SPRITES[enemy.role].signature, enemy.x, enemy.y - 4, {
            time: this.zoneHazardClock,
            facing: enemy.facing < 0 ? -1 : 1,
            height: Math.max(44, enemy.height),
            alpha: 0.74,
          });
        }

        // Enemy Health Bar
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        const hpPercent = Math.max(0, enemy.hp / enemy.maxHp);
        const barW = Math.max(48, enemy.width * 1.3);
        const barH = enemy.type === 'boss' ? 7 : 5;
        const barY = -enemy.height / 2 - (enemy.type === 'boss' ? 24 : 14);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(-barW / 2, barY, barW, barH);
        ctx.fillStyle = enemy.type === 'boss' ? '#ef4444' : enemy.type === 'elite' ? '#f59e0b' : '#22c55e';
        ctx.fillRect(-barW / 2, barY, barW * hpPercent, barH);

        // Enemy Name
        ctx.font = `bold ${enemy.type === 'boss' ? '12px' : '10px'} "Outfit", sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(enemy.name, 0, barY - 4);

        const statuses = this.statusesForEnemy(enemy);
        if (statuses.length) {
          const markerY = barY - 18;
          const startX = -((statuses.length - 1) * 13) / 2;
          ctx.font = '900 9px "Outfit", sans-serif';
          statuses.forEach((status, index) => {
            const markerX = startX + index * 13;
            const spriteId = this.gameplayStatusSprite(status.kind);
            if (spriteId) {
              gameplaySprites.draw(ctx, spriteId, markerX, markerY + 6, {
                time: this.zoneHazardClock,
                height: 13,
              });
              return;
            }
            ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
            ctx.beginPath();
            ctx.arc(markerX, markerY, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = status.colour;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = status.colour;
            ctx.fillText(status.kind[0].toUpperCase(), markerX, markerY + 3);
          });
        }
        ctx.restore();
      }
    }

    // 4. Render Player
    ctx.save();
    // Stealth translucency & Invulnerability Blink
    if (p.stealthTimer > 0) {
      ctx.globalAlpha = 0.35;
      ctx.filter = 'drop-shadow(0 0 10px #a855f7)';
    } else if (p.iframeTimer > 0 && Math.floor(Date.now() / 80) % 2 === 0) {
      ctx.globalAlpha = 0.4;
    }
    const isRunState = p.animState === 'run' && p.isGrounded;
    const runBob = isRunState ? -Math.abs(Math.sin(this.playerRunBob) * 1.8) : 0;

    sprites.drawHero(
      ctx,
      p.x,
      p.y + runBob,
      p.characterClass.id,
      p.animState,
      p.facing,
      p.attackTimer,
      p.characterClass.themeColor,
      this.lastSkillIndex
    );

    ctx.restore();
    // Render Remote Multiplayer Players
    if (network.room) {
      for (const socketId in network.remotePlayers) {
        const remoteP = network.remotePlayers[socketId];
        // Only render remote player if they are in the same environment (Town vs Dungeon)
        if (Boolean(remoteP.isTownMode) !== Boolean(this.isTownMode)) continue;

        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.filter = 'drop-shadow(0 0 6px rgba(79, 173, 229, 0.7))'; // subtle blue glow
        
        const rAnimState = (remoteP.animState || 'idle') as 'idle' | 'run' | 'attack' | 'jump' | 'dead';
        const rIsRun = rAnimState === 'run';
        const rRunBob = rIsRun ? -Math.abs(Math.sin(this.playerRunBob) * 1.8) : 0;
        
        sprites.drawHero(
          ctx,
          remoteP.x,
          remoteP.y + this.groundY + rRunBob,
          remoteP.classId || 'knight',
          rAnimState,
          remoteP.facing,
          remoteP.isAttacking ? 0.2 : 0,
          '#4fade5',
          remoteP.lastSkillIndex ?? 0
        );
        
        // Remote Name
        ctx.globalAlpha = 1.0;
        ctx.filter = 'none';
        ctx.font = 'bold 11px "Outfit", sans-serif';
        ctx.fillStyle = '#4fade5';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 3;
        ctx.textAlign = 'center';
        const nameText = remoteP.name || 'Player';
        const nameY = remoteP.y + this.groundY - 45;
        ctx.strokeText(nameText, remoteP.x, nameY);
        ctx.fillText(nameText, remoteP.x, nameY);
        
        ctx.restore();
      }

      this.drawDownedMarkers(ctx);
    }

    this.drawPartyChatter(ctx);

    // 5. Render Particle System (VFX, Projectiles, Minions, Clones, Zones, Floating Text)
    this.particles.draw(ctx);
    this.drawCombatSpriteEffects(ctx);

    // 6. Undergrowth and canopy the pack means to pass in front of everything.
    sprites.drawEnvironmentForeground(
      ctx, camX, virtualWidth, virtualHeight, this.groundY, currentTheme
    );

    ctx.restore();
    sprites.drawZoneContentPlane(ctx, currentTheme, 'foreground', camX, virtualWidth, this.groundY);
    drawZonePresentation(
      ctx,
      currentTheme,
      'above-entities',
      camX,
      virtualWidth,
      virtualHeight,
      this.groundY,
      presentationOptions,
    );
    this.particles.drawScreenOverlays(ctx, virtualWidth, virtualHeight);
    // Cinematic dim/declaration are screen-space, above the scene and below DOM HUD.
    this.ultimate.draw(ctx, virtualWidth, virtualHeight);
    ctx.restore();
  }

  /**
   * Render Town NPCs, Buildings, Dimensional Gateway Arch, and Quest Badges
   */
  private renderTownEntities(ctx: CanvasRenderingContext2D) {
    if (!this.townHub) return;
    const now = Date.now() / 1000;
    const activeNpc = this.townHub.getActiveNpc();

    // 1. The PolyStyle village street.
    //
    // Every piece is a measured region of the pack's sheets rather than a
    // separate file, and only its height is given here - drawSheetPiece derives
    // the width from the box, so nothing can end up stretched. Drawn back to
    // front: greenery, then buildings, then the props that sit against them.
    const props = POLY_SHEETS.props;
    const nature = POLY_SHEETS.nature;
    const houses = POLY_SHEETS.houses;
    const g = this.groundY;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // A. Greenery behind the buildings, so the street has depth without
    // anything standing in front of an NPC.
    const greenery: Array<[typeof POLY_NATURE[keyof typeof POLY_NATURE], number, number, boolean]> = [
      [POLY_NATURE.treeSlimA, 120, 124, false],
      [POLY_NATURE.treeRound, 690, 140, false],
      [POLY_NATURE.bushDark, 800, 32, false],
      [POLY_NATURE.treeBroad, 1130, 136, true],
      [POLY_NATURE.treeSlimB, 1660, 128, false],
      [POLY_NATURE.bushGreen, 1770, 30, true],
      [POLY_NATURE.treeRound, 2180, 132, true],
      [POLY_NATURE.rock, 2300, 36, false],
      [POLY_NATURE.treeBroad, 2680, 138, false],
    ];
    for (const [rect, x, h, flip] of greenery) {
      sprites.drawSheetPiece(ctx, nature, rect, x, g, h, { flip });
    }

    // B. The four homes, one behind each questgiver.
    sprites.drawSheetPiece(ctx, houses, POLY_HOUSES[0], 440, g, 150);
    sprites.drawSheetPiece(ctx, houses, POLY_HOUSES[1], 950, g, 160);
    sprites.drawSheetPiece(ctx, houses, POLY_HOUSES[0], 1450, g, 146, { flip: true });
    sprites.drawSheetPiece(ctx, houses, POLY_HOUSES[1], 1960, g, 153, { flip: true });

    // C. Street props. The forge pieces sit by the blacksmith, the cart and
    // wheel by the merchant stretch, the arch frames the portal approach.
    const street: Array<[typeof POLY_PROPS[keyof typeof POLY_PROPS], number, number, boolean]> = [
      [POLY_PROPS.pillar, 250, 68, false],
      [POLY_PROPS.crate, 330, 32, false],
      [POLY_PROPS.boxOpen, 372, 23, false],
      [POLY_PROPS.clothesline, 640, 52, false],
      [POLY_PROPS.log, 720, 11, false],
      [POLY_PROPS.barrel, 1040, 28, false],
      [POLY_PROPS.barrel, 1068, 25, true],
      [POLY_PROPS.well, 1180, 62, false],
      [POLY_PROPS.oven, 1268, 68, false],
      [POLY_PROPS.anvil, 1330, 27, false],
      [POLY_PROPS.shield, 1560, 31, false],
      [POLY_PROPS.cart, 1730, 45, false],
      [POLY_PROPS.wheel, 1800, 35, false],
      [POLY_PROPS.barrel, 2060, 27, false],
      [POLY_PROPS.crate, 2090, 28, true],
      [POLY_PROPS.log, 2255, 11, false],
      [POLY_PROPS.arch, 2380, 124, false],
    ];
    for (const [rect, x, h, flip] of street) {
      sprites.drawSheetPiece(ctx, props, rect, x, g, h, { flip });
    }

    // D. Grass along the kerb, small and cheap, breaking the hard ground line.
    for (let x = 60; x < 2820; x += 190) {
      const rect = (x / 190) % 2 === 0 ? POLY_NATURE.grassTuft : POLY_NATURE.grassTall;
      const h = rect === POLY_NATURE.grassTuft ? 12 : 19;
      sprites.drawSheetPiece(ctx, nature, rect, x, g + 2, h, { alpha: 0.9 });
    }

    // E. Lamp posts keep their warm halo - that glow is lighting, not art, so
    // it stays hand-drawn.
    const lampPositions = [180, 640, 1120, 1620, 2140, 2720];
    lampPositions.forEach((lx) => {
      sprites.drawSheetPiece(ctx, props, POLY_PROPS.lampPost, lx, g, 90);
      const lampGlow = ctx.createRadialGradient(lx, g - 74, 4, lx, g - 74, 38 + Math.sin(now * 6 + lx) * 3);
      lampGlow.addColorStop(0, 'rgba(254, 240, 138, 0.55)');
      lampGlow.addColorStop(0.4, 'rgba(245, 158, 11, 0.2)');
      lampGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = lampGlow;
      ctx.beginPath();
      ctx.arc(lx, g - 74, 40, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();

    // 2. Draw Epic Animated Dimensional Portal Gateway at x = 2560
    const portalX = 2560;
    (sprites as any).drawDimensionalPortal(ctx, portalX, this.groundY);

    // 3. Draw Each Town NPC with Authentic GothicVania Townspeople Sprites
    const npcSpriteTypeMap: { [id: string]: 'oldman' | 'bearded' | 'hatman' | 'woman' } = {
      elder_justinian: 'oldman',
      captain_valerie: 'bearded',
      blacksmith_keith: 'hatman',
      alchemist_morwenna: 'woman',
      portal_donald: 'hatman'
    };

    this.townHub.npcs.forEach((npc) => {
      const npcY = this.groundY - 5;
      const bob = Math.sin(now * 2.5 + npc.x * 0.01) * 1.5;

      ctx.save();
      // Draw Animated Gothic NPC Sprite
      const npcType = npcSpriteTypeMap[npc.id] || 'oldman';
      (sprites as any).drawGothicTownNPC(ctx, npc.x, npcY + bob, npcType, -1);

      // Scenery Props per NPC
      if (npc.id === 'blacksmith_keith') {
        // Anvil & Molten Hearth
        ctx.fillStyle = '#334155';
        ctx.fillRect(npc.x - 42, this.groundY - 16, 24, 16);
        ctx.fillStyle = '#f97316';
        ctx.fillRect(npc.x - 38, this.groundY - 18, 16, 4); // Glowing hot iron bar
      } else if (npc.id === 'alchemist_morwenna') {
        // Cauldron
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(npc.x + 36, this.groundY - 14, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(npc.x + 36, this.groundY - 20, 9, 0, Math.PI);
        ctx.fill();
      }

      // Name & Title Tag
      ctx.font = 'bold 12px "Outfit", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 5;
      ctx.textAlign = 'center';
      ctx.fillText(npc.name, npc.x, npcY - 95);
      ctx.font = '10px "Outfit", sans-serif';
      ctx.fillStyle = '#fef08a';
      ctx.fillText(npc.title, npc.x, npcY - 82);
      ctx.shadowBlur = 0;

      // Quest Indicator Badge
      const indicator = quests.getNpcIndicator(npc.id);
      if (indicator) {
        const badgeY = npcY - 105 + Math.sin(now * 5) * 3;
        ctx.save();
        if (indicator === 'turn_in') {
          ctx.fillStyle = '#eab308';
          ctx.shadowColor = '#facc15';
          ctx.shadowBlur = 15;
          ctx.beginPath();
          ctx.arc(npc.x, badgeY, 13, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = 'bold 16px "Cinzel", sans-serif';
          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('?', npc.x, badgeY + 1);
        } else if (indicator === 'main_available') {
          ctx.fillStyle = '#f59e0b';
          ctx.shadowColor = '#fbbf24';
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(npc.x, badgeY, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = 'bold 15px "Cinzel", sans-serif';
          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('!', npc.x, badgeY + 1);
        } else if (indicator === 'side_available') {
          ctx.fillStyle = '#94a3b8';
          ctx.shadowColor = '#cbd5e1';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(npc.x, badgeY, 11, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = 'bold 14px "Cinzel", sans-serif';
          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('!', npc.x, badgeY + 1);
        }
        ctx.restore();
      }

      // Proximity Prompt: [E] Talk
      if (activeNpc && activeNpc.id === npc.id) {
        const promptY = npcY - 112 + Math.sin(now * 4) * 2;
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#d97706';
        ctx.shadowBlur = 8;

        const bw = 74;
        const bh = 20;
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(npc.x - bw / 2, promptY - bh / 2, bw, bh, 10);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillRect(npc.x - bw / 2, promptY - bh / 2, bw, bh);
          ctx.strokeRect(npc.x - bw / 2, promptY - bh / 2, bw, bh);
        }

        ctx.font = 'bold 11px "Cinzel", sans-serif';
        ctx.fillStyle = '#fef08a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('[E] TALK', npc.x, promptY);
        ctx.restore();
      }

      ctx.restore();
    });
  }
}
