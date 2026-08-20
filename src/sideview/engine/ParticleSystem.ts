/**
 * Advanced Particle, VFX, Summoning & Cinematic Ultimate Combat System
 * Renders authentic animated spell sprite sheets, slashes, magic spells, impacts,
 * shadow clones, summoned skeletons, ground traps, persistent elemental zones,
 * and 10 Dramatic & Screen-Shaking Ultimate Avatars (Elder Dragon, Grim Reaper, Holy Hammer, etc.)
 */

import { sprites } from './SpriteManager';
import { SpriteSheet, AnimatedSprite, drawFrame } from './SpriteSheet';
import {
  VFX,
  VfxDef,
  COMMON_BOOT_VFX_IDS,
  imagePathsForVfxIds,
  vfxIdsForSkills,
  vfxImagePaths,
  type WarmableSkillVisual,
} from './VfxLibrary';
import type { SkillVisualIdentity, StatusApplication } from '../combat/SkillMechanics';

/** Hard ceilings keep one noisy fight from creating a self-amplifying slow frame. */
export const PARTICLE_BUDGETS = Object.freeze({
  particles: 360,
  floatingTexts: 48,
  projectiles: 96,
  spriteVfx: 14,
  spellAnimations: 32,
  shadowClones: 8,
  summonedMinions: 16,
  groundTraps: 24,
  groundZones: 16,
  omnislashLines: 24,
  chainLightningArcs: 16,
  screenFlashes: 4,
  dragonAvatars: 2,
  volcanicFissures: 16,
  reaperAvatars: 2,
  holyHammers: 12,
  ghostTrails: 40,
  particlePool: 360,
  floatingTextPool: 48,
  projectilePool: 96,
});

export type VfxQuality = 'high' | 'medium' | 'low';

const VFX_QUALITY_PROFILES = Object.freeze({
  high: { particleScale: 1, particles: 360, spriteVfx: 14, spellAnimations: 32, ghostTrails: 40, screenFlashes: 4, projectileTrailChance: 0.6 },
  medium: { particleScale: 0.7, particles: 250, spriteVfx: 10, spellAnimations: 24, ghostTrails: 24, screenFlashes: 2, projectileTrailChance: 0.35 },
  low: { particleScale: 0.45, particles: 160, spriteVfx: 7, spellAnimations: 16, ghostTrails: 10, screenFlashes: 1, projectileTrailChance: 0.16 },
} as const);

/** A catalogue effect currently playing at a world position. */
interface SpriteVfxInstance {
  anim: AnimatedSprite;
  def: VfxDef;
  x: number;
  y: number;
  facing: number;
  scale: number;
  /** Optional drift so effects are not perfectly static. */
  vx: number;
  vy: number;
  fadeOut: boolean;
  paths: string[];
  ready: boolean;
  waitTime: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
  type?: 'circle' | 'spark' | 'smoke' | 'slash' | 'trail' | 'holy' | 'fire' | 'dark' | 'electric' | 'poison' | 'ice';
  rotation?: number;
  vRot?: number;
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  fontSize: number;
  alpha: number;
  life: number;
  maxLife: number;
  isCrit?: boolean;
}

export interface ProjectileVFX {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  previousX?: number;
  previousY?: number;
  type: 'arrow' | 'fireball' | 'ice_shard' | 'lightning_orb' | 'dark_skull' | 'kunai' | 'dagger' | 'shuriken' | 'spear' | 'meteor' | 'energy_ball';
  targetX?: number;
  targetY?: number;
  radius: number;
  color: string;
  damage: number;
  isCrit: boolean;
  fromPlayer: boolean;
  piercing?: boolean;
  hitEnemyIds?: string[];
  life: number;
  maxLife: number;
  rotation?: number;
  originX?: number;
  originY?: number;
  maxDistance?: number;
  completed?: boolean;
  visualOnly?: boolean;
  skillId?: string;
  impactVfx?: string;
  impactRow?: number;
  impactScale?: number;
  aoeRadius?: number;
  statuses?: readonly StatusApplication[];
  lifesteal?: number;
  knockback?: number;
  knockUp?: number;
  identity?: SkillVisualIdentity;
  castToken?: number;
  /**
   * Raw damage packets represented by one performance carrier. Keeping the
   * packet boundaries lets combat preserve the authored multi-hit rounding
   * and defence semantics without spawning feedback/network work per visual.
   */
  virtualHitDamages?: readonly number[];
}

export interface ProjectileCombatOptions {
  maxDistance?: number;
  visualOnly?: boolean;
  skillId?: string;
  impactVfx?: string;
  impactRow?: number;
  impactScale?: number;
  aoeRadius?: number;
  statuses?: readonly StatusApplication[];
  lifesteal?: number;
  knockback?: number;
  knockUp?: number;
  identity?: SkillVisualIdentity;
  castToken?: number;
  virtualHitDamages?: readonly number[];
}

export interface SpellAnimationFX {
  id: string;
  x: number;
  y: number;
  spriteKey: string;
  frameW: number;
  frameH: number;
  totalFrames: number;
  isVertical: boolean;
  cols?: number;
  scale: number;
  currentFrame: number;
  fps: number;
  timer: number;
  facing?: number;
  tint?: string;
  isDone: boolean;
  isFrameByFrame?: boolean;
}

export interface ShadowCloneEntity {
  id: string;
  x: number;
  y: number;
  facing: number;
  classId: string;
  animTimer: number;
  life: number;
  maxLife: number;
  damage: number;
  hasStruck: boolean;
  colorTint: string;
}

export interface SummonedMinionEntity {
  ownerSocketId?: string | null;
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  state: 'idle' | 'walk' | 'run' | 'attack' | 'attack2' | 'spell' | 'cast' | 'hurt' | 'hit' | 'death';
  animTimer: number;
  attackCooldown: number;
  skillCooldown?: number;
  life: number;
  maxLife: number;
  damage: number;
  hp: number;
  maxHp: number;
  type: 'skeleton' | 'dragon' | 'reaper' | 'nightborne';
  visualOnly?: boolean;
}

export interface GroundTrapEntity {
  id: string;
  x: number;
  y: number;
  radius: number;
  damage: number;
  life: number;
  maxLife: number;
  trapType: 'poison' | 'explosive';
  isTriggered: boolean;
  skillId?: string;
  statuses?: readonly StatusApplication[];
  cloudDamageTotal?: number;
  visualOnly?: boolean;
}

export interface GroundTrapCombatOptions {
  skillId?: string;
  statuses?: readonly StatusApplication[];
  cloudDamageTotal?: number;
  visualOnly?: boolean;
}

export interface GroundZoneEntity {
  id: string;
  x: number;
  y: number;
  radius: number;
  damagePerTick: number;
  tickTimer: number;
  life: number;
  maxLife: number;
  zoneType: 'holy_consecration' | 'poison_cloud' | 'blizzard' | 'void_vortex' | 'sanctuary_ward';
  color: string;
  skillId?: string;
  statuses?: readonly StatusApplication[];
  allyMitigation?: number;
  allyHealPercentPerTick?: number;
  tickInterval?: number;
}

export interface GroundZoneCombatOptions {
  skillId?: string;
  statuses?: readonly StatusApplication[];
  allyMitigation?: number;
  allyHealPercentPerTick?: number;
  tickInterval?: number;
}

export interface OmnislashSlashLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface ChainLightningArc {
  id: string;
  points: { x: number; y: number }[];
  life: number;
  maxLife: number;
  color: string;
}

// ----------------------------------------------------
// DRAMATIC ULTIMATE AVATARS & CINEMATIC ENTITIES
// ----------------------------------------------------

export interface DragonAvatarEntity {
  id: string;
  x: number;
  y: number;
  facing: number;
  life: number;
  maxLife: number;
}

export interface GrimReaperAvatarEntity {
  id: string;
  x: number;
  y: number;
  facing: number;
  life: number;
  maxLife: number;
}

export interface HolyHammerAvatarEntity {
  id: string;
  x: number;
  currentY: number;
  targetY: number;
  life: number;
  maxLife: number;
  hasImpacted: boolean;
}

export interface VolcanicFissureEntity {
  id: string;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  scale: number;
}

export interface CinematicScreenFlash {
  color: string;
  alpha: number;
  decay: number;
  invertColors?: boolean;
}

export class ParticleSystem {
  public particles: Particle[] = [];
  public floatingTexts: FloatingText[] = [];
  public projectiles: ProjectileVFX[] = [];
  public spellAnimations: SpellAnimationFX[] = [];
  public shadowClones: ShadowCloneEntity[] = [];
  public summonedMinions: SummonedMinionEntity[] = [];
  public groundTraps: GroundTrapEntity[] = [];
  public groundZones: GroundZoneEntity[] = [];
  public omnislashLines: OmnislashSlashLine[] = [];
  public chainLightningArcs: ChainLightningArc[] = [];

  // Dramatic Ultimate Avatars & Cinematic Entities
  public screenFlashes: CinematicScreenFlash[] = [];
  public dragonAvatars: DragonAvatarEntity[] = [];
  public volcanicFissures: VolcanicFissureEntity[] = [];
  public reaperAvatars: GrimReaperAvatarEntity[] = [];
  public holyHammers: HolyHammerAvatarEntity[] = [];

  public ghostTrails: {
    id: string;
    x: number;
    y: number;
    facing: number;
    classId: string;
    state: 'idle' | 'run' | 'attack' | 'jump' | 'dead';
    animTimer: number;
    color: string;
    alpha: number;
    life: number;
    maxLife: number;
  }[] = [];

  public screenShakeTime: number = 0;
  public screenShakeMagnitude: number = 0;
  private delayedTasks = new Set<number>();
  private readonly particlePool: Particle[] = [];
  private readonly floatingTextPool: FloatingText[] = [];
  private readonly projectilePool: ProjectileVFX[] = [];
  private reusedParticles = 0;
  private particleOverwriteCursor = 0;
  private reusedFloatingTexts = 0;
  private reusedProjectiles = 0;
  private hiddenUpdates = 0;
  private vfxQuality: VfxQuality = 'high';
  private reducedMotionOverride: boolean | null = null;
  private frameTimeEmaMs = 1000 / 60;
  private slowFrameStreak = 0;
  private stableFrameStreak = 0;
  private qualityTransitions = 0;

  constructor() {
    sprites.setEffectsQuality(this.effectiveVfxQuality());
  }

  private prefersReducedMotion(): boolean {
    if (this.reducedMotionOverride !== null) return this.reducedMotionOverride;
    if (typeof document !== 'undefined' && document.documentElement?.classList?.contains('input-reduced-motion')) {
      return true;
    }
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private effectiveVfxQuality(): VfxQuality {
    return this.prefersReducedMotion() ? 'low' : this.vfxQuality;
  }

  private qualityProfile() {
    return VFX_QUALITY_PROFILES[this.effectiveVfxQuality()];
  }

  /** Cheap read for render-loop DPR policy without allocating the full metrics object. */
  public getVfxQuality(): VfxQuality {
    return this.effectiveVfxQuality();
  }

  /** Keep Canvas VFX aligned with the persisted input/accessibility settings. */
  public setReducedMotion(enabled: boolean) {
    const next = Boolean(enabled);
    if (this.reducedMotionOverride === next) return;
    this.reducedMotionOverride = next;
    sprites.setEffectsQuality(this.effectiveVfxQuality());
    if (next) {
      this.screenShakeTime = 0;
      this.screenShakeMagnitude = 0;
      this.screenFlashes.length = 0;
      this.ghostTrails.length = 0;
      this.enforceBudgets();
    }
  }

  private changeVfxQuality(next: VfxQuality) {
    if (next === this.vfxQuality) return;
    this.vfxQuality = next;
    this.qualityTransitions += 1;
    this.slowFrameStreak = 0;
    this.stableFrameStreak = 0;
    sprites.setEffectsQuality(this.effectiveVfxQuality());
    this.enforceBudgets();
  }

  /** Feed wall-clock frame cost once per rendered frame from the game loop. */
  public recordFrameTime(frameMs: number) {
    if (!Number.isFinite(frameMs) || frameMs <= 0 || this.isDocumentHidden()) return;
    sprites.setEffectsQuality(this.effectiveVfxQuality());
    const bounded = Math.max(8, Math.min(80, frameMs));
    this.frameTimeEmaMs += (bounded - this.frameTimeEmaMs) * 0.12;

    const slow = bounded >= 27 || this.frameTimeEmaMs >= 22;
    const stable = bounded <= 18.5 && this.frameTimeEmaMs <= 19;
    this.slowFrameStreak = slow ? this.slowFrameStreak + 1 : Math.max(0, this.slowFrameStreak - 1);
    this.stableFrameStreak = stable ? this.stableFrameStreak + 1 : 0;

    if (this.slowFrameStreak >= 8) {
      this.changeVfxQuality(this.vfxQuality === 'high' ? 'medium' : 'low');
    } else if (this.stableFrameStreak >= 180) {
      this.changeVfxQuality(this.vfxQuality === 'low' ? 'medium' : 'high');
    }
  }

  private recycleParticle(particle: Particle) {
    if (this.particlePool.length < PARTICLE_BUDGETS.particlePool) this.particlePool.push(particle);
  }

  private spawnParticle(properties: Particle) {
    const particle = this.particlePool.pop();
    if (particle) {
      this.reusedParticles += 1;
      // Optional rotation fields must not leak from the object's previous use.
      delete particle.rotation;
      delete particle.vRot;
      Object.assign(particle, properties);
    }
    const next = particle || properties;
    const budget = this.qualityProfile().particles;
    if (this.particles.length < budget) {
      this.particles.push(next);
      return;
    }

    // O(1) overwrite at the disposable-particle ceiling. Array.shift moved up
    // to 359 objects for every spark spawned during a crowded ultimate.
    const index = this.particleOverwriteCursor % Math.max(1, this.particles.length);
    const removed = this.particles[index];
    this.particles[index] = next;
    this.particleOverwriteCursor = (index + 1) % Math.max(1, budget);
    if (removed !== next) this.recycleParticle(removed);
  }

  private recycleFloatingText(text: FloatingText) {
    if (this.floatingTextPool.length < PARTICLE_BUDGETS.floatingTextPool) this.floatingTextPool.push(text);
  }

  private recycleProjectile(projectile: ProjectileVFX) {
    if (this.projectilePool.length < PARTICLE_BUDGETS.projectilePool) this.projectilePool.push(projectile);
  }

  /**
   * Enforce the shared render ceiling without allowing decoration to displace
   * a damage carrier. When the list is crowded, the oldest visual-only entry
   * is always the first sacrifice; gameplay only competes with gameplay.
   */
  private enforceProjectileBudget() {
    while (this.projectiles.length > PARTICLE_BUDGETS.projectiles) {
      const visualOnlyIndex = this.projectiles.findIndex(projectile => projectile.visualOnly);
      const removeIndex = visualOnlyIndex >= 0 ? visualOnlyIndex : 0;
      const [removed] = this.projectiles.splice(removeIndex, 1);
      if (removed) this.recycleProjectile(removed);
    }
  }

  /** Remove an active projectile through the same pool used by expiry/caps. */
  public removeProjectileAt(index: number): ProjectileVFX | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.projectiles.length) return null;
    const [removed] = this.projectiles.splice(index, 1);
    if (!removed) return null;
    this.recycleProjectile(removed);
    return removed;
  }

  /**
   * Remove gameplay-bearing entities when changing scenes.
   *
   * This is intentionally separate from cancelDelayedTasks(): that lighter
   * cancellation also runs when a player is downed, where existing summons and
   * zones must keep participating in the fight. Projectiles are returned to the
   * pool instead of discarded so town practice cannot create allocation spikes
   * in the first dungeon room.
   */
  public clearGameplayEntities() {
    while (this.projectiles.length > 0) {
      this.removeProjectileAt(this.projectiles.length - 1);
    }
    this.shadowClones.length = 0;
    this.summonedMinions.length = 0;
    this.groundTraps.length = 0;
    this.groundZones.length = 0;
  }

  private trimOldest<T>(items: T[], budget: number, recycle?: (item: T) => void) {
    while (items.length > budget) {
      const removed = items.shift();
      if (removed && recycle) recycle(removed);
    }
  }

  private releaseSpriteVfx(vfx: SpriteVfxInstance) {
    sprites.releasePaths(vfx.paths);
  }

  private enforceBudgets() {
    const quality = this.qualityProfile();
    this.trimOldest(this.particles, quality.particles, (item) => this.recycleParticle(item));
    this.trimOldest(this.floatingTexts, PARTICLE_BUDGETS.floatingTexts, (item) => this.recycleFloatingText(item));
    this.enforceProjectileBudget();
    while (this.spriteVfx.length > quality.spriteVfx) {
      const removed = this.spriteVfx.shift();
      if (removed) this.releaseSpriteVfx(removed);
    }
    this.trimOldest(this.spellAnimations, quality.spellAnimations);
    this.trimOldest(this.shadowClones, PARTICLE_BUDGETS.shadowClones);
    this.trimOldest(this.summonedMinions, PARTICLE_BUDGETS.summonedMinions);
    this.trimOldest(this.groundTraps, PARTICLE_BUDGETS.groundTraps);
    this.trimOldest(this.groundZones, PARTICLE_BUDGETS.groundZones);
    this.trimOldest(this.omnislashLines, PARTICLE_BUDGETS.omnislashLines);
    this.trimOldest(this.chainLightningArcs, PARTICLE_BUDGETS.chainLightningArcs);
    this.trimOldest(this.screenFlashes, quality.screenFlashes);
    this.trimOldest(this.dragonAvatars, PARTICLE_BUDGETS.dragonAvatars);
    this.trimOldest(this.volcanicFissures, PARTICLE_BUDGETS.volcanicFissures);
    this.trimOldest(this.reaperAvatars, PARTICLE_BUDGETS.reaperAvatars);
    this.trimOldest(this.holyHammers, PARTICLE_BUDGETS.holyHammers);
    this.trimOldest(this.ghostTrails, quality.ghostTrails);
  }

  private isDocumentHidden(): boolean {
    return typeof document !== 'undefined'
      && (document.hidden === true || document.visibilityState === 'hidden');
  }

  /** Drop only disposable visuals; gameplay projectiles/zones/minions keep ticking. */
  private reduceHiddenWork() {
    this.hiddenUpdates += 1;
    for (const particle of this.particles) this.recycleParticle(particle);
    this.particles = [];
    for (const text of this.floatingTexts) this.recycleFloatingText(text);
    this.floatingTexts = [];
    for (const vfx of this.spriteVfx) this.releaseSpriteVfx(vfx);
    this.spriteVfx = [];
    this.spellAnimations = [];
    this.ghostTrails = [];
    this.screenFlashes = [];
  }

  public getPerformanceMetrics() {
    return {
      active: {
        particles: this.particles.length,
        floatingTexts: this.floatingTexts.length,
        projectiles: this.projectiles.length,
        spriteVfx: this.spriteVfx.length,
        sheetCache: this.sheetCache.size,
        spellAnimations: this.spellAnimations.length,
        shadowClones: this.shadowClones.length,
        summonedMinions: this.summonedMinions.length,
        groundTraps: this.groundTraps.length,
        groundZones: this.groundZones.length,
        ghostTrails: this.ghostTrails.length,
      },
      pools: {
        particles: this.particlePool.length,
        floatingTexts: this.floatingTextPool.length,
        projectiles: this.projectilePool.length,
      },
      reused: {
        particles: this.reusedParticles,
        floatingTexts: this.reusedFloatingTexts,
        projectiles: this.reusedProjectiles,
      },
      hiddenUpdates: this.hiddenUpdates,
      quality: {
        adaptive: this.vfxQuality,
        effective: this.effectiveVfxQuality(),
        frameTimeEmaMs: Number(this.frameTimeEmaMs.toFixed(2)),
        transitions: this.qualityTransitions,
      },
      budgets: PARTICLE_BUDGETS,
      effectiveBudgets: this.qualityProfile(),
      images: sprites.getPerformanceMetrics(),
    } as const;
  }

  /** Particle-owned sequences are cancelled alongside their combat scene. */
  public cancelDelayedTasks() {
    this.delayedTasks.forEach(handle => window.clearTimeout(handle));
    this.delayedTasks.clear();
    for (const vfx of this.spriteVfx) this.releaseSpriteVfx(vfx);
    this.spriteVfx = [];
  }

  private scheduleTask(task: () => void, delayMs: number) {
    const handle = window.setTimeout(() => {
      this.delayedTasks.delete(handle);
      task();
    }, delayMs);
    this.delayedTasks.add(handle);
  }

  /**
   * Adds a lightweight palette/silhouette cue that remains readable when a
   * sprite sheet is shared by several classes or screen flash is disabled.
   */
  public addSkillIdentityAccent(x: number, y: number, facing: number, identity: SkillVisualIdentity) {
    const [primary, secondary, accent] = identity.palette;
    const radial = /ring|radial|nova|aura|dome|ward|burst|crater|circle/.test(identity.silhouette);
    const vertical = /pillar|column|meteor|hammer|rain|descending/.test(identity.silhouette);
    const baseCount = radial ? 18 : 12;
    const count = Math.max(5, Math.round(baseCount * this.qualityProfile().particleScale));
    for (let i = 0; i < count; i++) {
      const angle = radial ? (i / count) * Math.PI * 2 : (Math.random() - 0.5) * 0.9;
      const speed = 1.3 + Math.random() * 2.3;
      this.spawnParticle({
        x: x + (vertical ? (Math.random() - 0.5) * 26 : 0),
        y: y - 16 + (vertical ? Math.random() * 34 - 34 : 0),
        vx: vertical ? (Math.random() - 0.5) * 0.5 : Math.cos(angle) * speed * (radial ? 1 : facing),
        vy: vertical ? 2 + Math.random() * 2 : Math.sin(angle) * speed - 0.5,
        size: 1.5 + Math.random() * 2.5,
        color: i % 3 === 0 ? accent : i % 2 === 0 ? secondary : primary,
        alpha: 0.9,
        decay: 0.04 + Math.random() * 0.025,
        type: identity.statusMarker === 'poison' ? 'poison' : identity.statusMarker === 'burn' ? 'fire' : 'spark',
      });
    }
  }

  private isDrawableImage(img: HTMLImageElement | null | undefined): img is HTMLImageElement {
    return !!img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
  }

  private resolveDragonFallback(): HTMLImageElement | null {
    const fallbackKeys = ['drag_atk1', 'drag_atk2', 'drag_atk3', 'drag_idle', 'drag_run'];
    for (const key of fallbackKeys) {
      const img = sprites.getImage(key);
      if (this.isDrawableImage(img)) {
        return img;
      }
    }
    return null;
  }

  private resolveReaperFallback(): HTMLImageElement | null {
    const fallbackKeys = ['reaper_idle_1', 'reaper_atk_1', 'reaper_walk_1'];
    for (const key of fallbackKeys) {
      const img = sprites.getImage(key);
      if (this.isDrawableImage(img)) {
        return img;
      }
    }
    return null;
  }

  /**
   * Add Fading Ghost Trail (Afterimage)
   */
  public addGhostTrail(
    x: number,
    y: number,
    facing: number,
    classId: string,
    state: 'idle' | 'run' | 'attack' | 'jump' | 'dead' = 'attack',
    animTimer: number = 0,
    color: string = '#60a5fa'
  ) {
    if (this.effectiveVfxQuality() === 'low') return;
    this.ghostTrails.push({
      id: 'ghost_' + Math.random(),
      x,
      y,
      facing,
      classId,
      state,
      animTimer,
      color,
      alpha: 0.65,
      life: 0.28,
      maxLife: 0.28
    });
  }

  /**
   * Screen Shake Effect
   */
  public triggerScreenShake(magnitude: number = 6, duration: number = 0.25) {
    if (this.prefersReducedMotion()) return;
    // Shake is punctuation, not a state. Both values are damped AND capped:
    // callers ask for up to 26 magnitude over 1.4s, and because both fields
    // take the max of the incoming and current value, overlapping requests
    // during a fight used to keep re-arming a long, large shake - so the screen
    // never settled. Capping the duration is what actually stops the wobble.
    const mag = Math.min(magnitude * 0.15, 3.5);
    const dur = Math.min(duration, 0.35);
    this.screenShakeMagnitude = Math.max(this.screenShakeMagnitude, mag);
    this.screenShakeTime = Math.max(this.screenShakeTime, dur);
  }

  public getScreenShakeOffset(): { x: number; y: number } {
    if (this.screenShakeTime <= 0) return { x: 0, y: 0 };
    return {
      x: (Math.random() * 2 - 1) * this.screenShakeMagnitude,
      y: (Math.random() * 2 - 1) * this.screenShakeMagnitude
    };
  }

  public addScreenFlash(color: string, initialAlpha: number = 0.8, decay: number = 0.05, invertColors: boolean = false) {
    if (this.prefersReducedMotion()) return;
    if (this.effectiveVfxQuality() === 'low' && this.screenFlashes.length > 0) return;
    this.screenFlashes.push({
      color,
      alpha: initialAlpha,
      decay,
      invertColors
    });
  }

  public addVoidVortex(x: number, y: number, scale: number = 2.0) {
    this.addVortexEffect(x, y, scale);
    this.addImpactBurst(x, y, 20, '#a855f7', 'dark');
  }

  /**
   * Spawn Floating Damage / Heal Text
   */
  public addFloatingText(
    x: number,
    y: number,
    text: string,
    color: string = '#ffffff',
    isCrit: boolean = false,
    fontSize: number = 18
  ) {
    const properties: FloatingText = {
      id: `text_${Date.now()}_${Math.random()}`,
      x: x + (Math.random() * 20 - 10),
      y: y - 10,
      vy: isCrit ? -2.8 : -1.8,
      text,
      color,
      fontSize: isCrit ? fontSize * 1.35 : fontSize,
      alpha: 1.0,
      life: 0,
      maxLife: isCrit ? 1.2 : 0.85,
      isCrit
    };
    const pooled = this.floatingTextPool.pop();
    if (pooled) {
      this.reusedFloatingTexts += 1;
      Object.assign(pooled, properties);
      this.floatingTexts.push(pooled);
    } else {
      this.floatingTexts.push(properties);
    }
    this.trimOldest(
      this.floatingTexts,
      PARTICLE_BUDGETS.floatingTexts,
      (item) => this.recycleFloatingText(item),
    );
  }

  // ----------------------------------------------------
  // 10 DRAMATIC ULTIMATE EFFECT SPAWNERS
  // ----------------------------------------------------

  /**
   * 1. DRAGOON: Colossal Spectral Elder Dragon Descent
   */
  public spawnDragonDescent(x: number, y: number, facing: number) {
    this.triggerScreenShake(24, 1.2);
    this.addScreenFlash('#ff7849', 0.85, 0.04);
    this.dragonAvatars.push({
      id: `dragon_${Date.now()}`,
      x: x - facing * 40,
      y: y - 140,
      facing,
      life: 0,
      maxLife: 2.2
    });

    // The avatar and six gameplay beam ticks carry the move. Secondary fire
    // waves are quality-bounded so they do not add fifteen spell animations
    // and 150 particles on top of the cinematic payload.
    const initialQuality = this.effectiveVfxQuality();
    const scheduledWaveCount = initialQuality === 'high' ? 3 : (initialQuality === 'medium' ? 2 : 1);
    let lastExecutedWave = -1;
    let groundExplosionSpawned = false;
    const spawnGroundExplosion = (waveIndex: number) => {
      if (groundExplosionSpawned || waveIndex < 0) return;
      groundExplosionSpawned = true;
      this.addGroundExplosion(x + facing * (120 + waveIndex * 80), y - 20, 2.2);
    };
    for (let i = 0; i < scheduledWaveCount; i++) {
      this.scheduleTask(() => {
        const quality = this.effectiveVfxQuality();
        const allowedWaveCount = quality === 'high' ? 3 : (quality === 'medium' ? 2 : 1);
        if (i >= allowedWaveCount) {
          // A downgrade between callbacks must cancel the expensive wave while
          // still preserving the move's single grounding impact.
          spawnGroundExplosion(lastExecutedWave);
          return;
        }
        this.addFlameLash(x + facing * (100 + i * 80), y - 25, facing, 2.5 + i * 0.3);
        if (quality === 'high') this.addFireLine(x + facing * (80 + i * 70), y - 20, facing, 2.0);
        lastExecutedWave = i;
        if (i === allowedWaveCount - 1 || i === scheduledWaveCount - 1) spawnGroundExplosion(i);
        this.addImpactBurst(
          x + facing * (100 + i * 80),
          y - 20,
          quality === 'high' ? 18 : (quality === 'medium' ? 10 : 6),
          '#ff3d00',
          'fire',
        );
      }, i * 120);
    }
  }

  /**
   * 2. WARRIOR: Titan Cataclysm Earth Shatter
   */
  public spawnTitanEarthShatter(x: number, y: number, facing: number) {
    this.triggerScreenShake(26, 1.0);
    this.addScreenFlash('#fbbf24', 0.8, 0.05);

    // Chain of 5 volcanic ground fissures spreading forward
    for (let i = 0; i < 5; i++) {
      this.scheduleTask(() => {
        const fissureX = x + facing * (60 + i * 75);
        this.volcanicFissures.push({
          id: `fissure_${Date.now()}_${i}`,
          x: fissureX,
          y,
          life: 0,
          maxLife: 1.5,
          scale: 1.4 + i * 0.2
        });
        this.addGroundExplosion(fissureX, y - 30, 2.0 + i * 0.2);
        this.addFireLine(fissureX, y - 30, facing, 1.8);
        this.addImpactBurst(fissureX, y, 35, '#ff5722', 'fire');
        // Badass Sanju Earth Effect!
        this.playSanjuVfx(fissureX, y - 80, 'sanju_earth', 25, 24, 1.8);
      }, i * 90);
    }
  }

  /**
   * 3. NINJA: Time-Freeze Dimension Cleave Omnislash
   */
  public triggerCinematicOmnislash(targets: { x: number; y: number }[]) {
    this.triggerScreenShake(20, 0.9);
    // Inverted color time-freeze screen flash
    this.addScreenFlash('#1e1b4b', 0.95, 0.03, true);

    const safeTargets = targets.length > 0 ? targets : [{ x: 400, y: 300 }];
    const cuts = 16;

    for (let i = 0; i < cuts; i++) {
      this.scheduleTask(() => {
        const t = safeTargets[i % safeTargets.length];
        
        // Replace hardcoded lines with slash sprites
        this.playVfxSprite(t.x, t.y - 15, 'vfx_slash_circle', i % 2 === 0 ? 1 : -1, 2.0);
        this.addSpellSlash(t.x, t.y - 15, i % 2 === 0 ? 1 : -1, 2.2, '#ef4444');
        this.addImpactBurst(t.x, t.y - 15, 12, '#ef4444', 'spark');
        // Sanju 2D Lightning/Sparks
        this.playSanjuVfx(t.x, t.y - 40, i % 3 === 0 ? 'sanju_2d_green' : (i % 2 === 0 ? 'sanju_2d_sparks' : 'sanju_2d_magic2'), 10, 24, 2.0);
      }, i * 35);
    }
  }

  /**
   * 4. NECROMANCER: Looming Grim Reaper Death Nova
   */
  public spawnReaperDeathNova(x: number, y: number, facing: number) {
    this.triggerScreenShake(22, 1.1);
    this.addScreenFlash('#7e22ce', 0.85, 0.04);
    this.reaperAvatars.push({
      id: `reaper_${Date.now()}`,
      x,
      y: y - 160,
      facing,
      life: 0,
      maxLife: 2.5
    });

    // Massive black-hole void vortex at the center
    // Presentation-only vortex. Skill potency is resolved by the engine's
    // split hit budget, so the avatar must not inject a hidden 100-damage tick.
    this.addGroundZone(x + facing * 80, y, 220, 0, 2.5, 'void_vortex', '#a855f7');
    this.addVortexEffect(x + facing * 80, y - 40, 2.4);
    this.addDarkPillar(x + facing * 80, y);
    this.addImpactBurst(x + facing * 80, y - 40, 40, '#a855f7', 'dark');
    // Cosmic Time Sanju Effect!
    this.playSanjuVfx(x + facing * 100, y - 100, 'sanju_cosmic', 25, 18, 3.0, '#7e22ce');
  }

  /**
   * 5. PALADIN: Hammer of the Gods Judgement
   */
  public spawnHolyHammerJudgement(x: number, groundY: number) {
    this.triggerScreenShake(25, 1.0);
    this.addScreenFlash('#fef08a', 0.9, 0.04);
    this.holyHammers.push({
      id: `hammer_${Date.now()}`,
      x,
      currentY: 40,
      targetY: groundY - 50,
      life: 0,
      maxLife: 2.0,
      hasImpacted: false
    });

    // Descending holy pillars across the area
    for (let i = -2; i <= 2; i++) {
      this.scheduleTask(() => {
        this.addHolyPillar(x + i * 80, groundY);
        this.addImpactBurst(x + i * 80, groundY - 20, 25, '#fde047', 'holy');
        // Divine Light Effect
        this.playSanjuVfx(x + i * 80, groundY - 80, 'sanju_light', 25, 24, 2.0);
      }, Math.abs(i) * 100);
    }
  }

  /**
   * 6. ASSASSIN: Phantom Shadow Execution Tempest
   */
  public triggerShadowTempest(targets: { x: number; y: number }[], playerX: number, playerY: number) {
    this.triggerScreenShake(20, 0.8);
    this.addScreenFlash('#581c87', 0.85, 0.05);

    const safeTargets = targets.length > 0 ? targets : [{ x: playerX + 100, y: playerY }];
    for (let i = 0; i < 10; i++) {
      this.scheduleTask(() => {
        const t = safeTargets[i % safeTargets.length];
        this.addSpellSlash(t.x, t.y - 15, i % 2 === 0 ? 1 : -1, 2.0, '#c084fc');
        this.addImpactBurst(t.x, t.y - 15, 20, '#c084fc', 'smoke');
        this.addImpactBurst(t.x, t.y - 15, 15, '#ef4444', 'spark');
        this.playSanjuVfx(t.x, t.y - 50, 'sanju_cosmic', 25, 30, 1.8, '#581c87');
      }, i * 60);
    }
  }

  /**
   * 7. MAGE: Armageddon Meteor Storm
   */
  public spawnArmageddonMeteors(targetX: number, targetY: number, facing: number) {
    this.triggerScreenShake(26, 1.4);
    this.addScreenFlash('#ef4444', 0.85, 0.035);

    for (let i = 0; i < 4; i++) {
      this.scheduleTask(() => {
        const mx = targetX + (i - 1.5) * 110 + (facing * -70);
        this.addProjectile(
          mx,
          20,
          facing * 8,
          16,
          'meteor',
          350,
          true,
          true,
          '#ff3d00',
          34,
        );
        this.addGroundExplosion(mx + 60, targetY - 20, 2.4);
        // Add Huge Cosmic Magic Frame By Frame!
        this.playSanjuVfx(mx + 60, targetY - 60, 'sanju_cosmic', 25, 20, 2.5, '#ef4444');
      }, i * 160);
    }
  }

  /**
   * 8. ARCHER: Astral Dragon Piercer Hurricane
   */
  public spawnAstralDragonPiercer(x: number, y: number, facing: number) {
    this.triggerScreenShake(18, 0.9);
    this.addScreenFlash('#4ade80', 0.75, 0.04);
    this.addVortexEffect(x + facing * 80, y - 20, 2.0);

    for (let i = 0; i < 35; i++) {
      this.scheduleTask(() => {
        this.addProjectile(
          x + (facing * 20),
          y - 12 + (Math.random() * 20 - 10),
          facing * (18 + Math.random() * 5),
          (Math.random() - 0.5) * 1.5,
          'arrow',
          80,
          true,
          true,
          i % 2 === 0 ? '#4ade80' : '#facc15',
          14,
          true
        );
      }, i * 30);
    }
  }

  /**
   * 9. BERSERKER: Blood Titan Rampage
   */
  public spawnBloodTitanRampage(x: number, y: number, facing: number) {
    this.triggerScreenShake(26, 1.2);
    this.addScreenFlash('#b91c1c', 0.9, 0.04);
    this.addFireSpin(x, y - 30, 2.6);

    for (let i = 0; i < 5; i++) {
      this.scheduleTask(() => {
        const hitX = x + facing * (50 + i * 80);
        this.addGroundExplosion(hitX, y - 20, 2.2);
        this.addFlameLash(hitX, y - 20, facing, 2.2);
        this.addImpactBurst(hitX, y - 20, 30, '#ef4444', 'fire');
        // HUGE Sanju Fire Wrath Effect!
        this.playSanjuVfx(hitX, y - 100, 'sanju_fire', 25, 22, 2.5);
      }, i * 110);
    }
  }

  /**
   * 10. PRIEST: Celestial Divine Radiance Starlight
   */
  public spawnCelestialDivineRadiance(x: number, groundY: number) {
    this.triggerScreenShake(20, 1.0);
    this.addScreenFlash('#fef9c3', 0.95, 0.035);

    for (let i = -3; i <= 3; i++) {
      this.scheduleTask(() => {
        const beamX = x + i * 90;
        this.addHolyCrystal(beamX, groundY - 40, 2.0);
        this.addHolyPillar(beamX, groundY);
        this.addImpactBurst(beamX, groundY - 30, 30, '#fde047', 'holy');
        // Divine Light Sanju Effect
        this.playSanjuVfx(beamX, groundY - 100, 'sanju_light', 25, 20, 2.5);
      }, Math.abs(i) * 80);
    }
  }

  // --- STANDARD SKILL ENTITIES ---

  public spawnShadowClones(x: number, y: number, facing: number, damage: number) {
    this.shadowClones.push({
      id: `clone_${Date.now()}_1`,
      x: x + facing * 60,
      y,
      facing,
      classId: 'ninja',
      animTimer: 0,
      life: 0,
      maxLife: 0.75,
      damage,
      hasStruck: false,
      colorTint: '#4ade80'
    });

    this.shadowClones.push({
      id: `clone_${Date.now()}_2`,
      x: x - facing * 50,
      y,
      facing: facing * -1,
      classId: 'ninja',
      animTimer: 0,
      life: 0,
      maxLife: 0.75,
      damage,
      hasStruck: false,
      colorTint: '#a855f7'
    });

    this.addImpactBurst(x, y - 20, 20, '#a855f7', 'smoke');
    this.addSpellSlash(x, y - 20, facing, 1.5, '#4ade80');
  }

  public spawnSkeletonMinion(
    x: number,
    y: number,
    damage: number,
    ownerSocketId?: string | null,
    visualOnly: boolean = false,
  ): SummonedMinionEntity {
    this.addImpactBurst(x, y - 10, 25, '#c084fc', 'dark');
    this.addDarkPillar(x, y);

    const minion: SummonedMinionEntity = {
      ownerSocketId: ownerSocketId || null,
      id: `minion_${Date.now()}_${Math.random()}`,
      x,
      y,
      vx: 0,
      vy: 0,
      facing: 1,
      state: 'idle',
      animTimer: 0,
      attackCooldown: visualOnly ? 999999 : 0.5,
      life: 0,
      maxLife: 15.0,
      damage,
      hp: 350,
      maxHp: 350,
      type: 'skeleton',
      visualOnly,
    };
    this.summonedMinions.push(minion);
    return minion;
  }

  public spawnDragonMinion(x: number, groundY: number, facing: number, damage: number, ownerSocketId?: string | null): SummonedMinionEntity {
    // Keep only one Elder Dragon companion active
    this.summonedMinions = this.summonedMinions.filter(m => m.type !== 'dragon');

    this.triggerScreenShake(24, 1.2);
    // Removed blinding #ff7849 screen flash to fix the "pink screen" issue where the player cannot see the game
    this.addFlameLash(x + facing * 80, groundY - 20, facing, 2.4);

    const minion: SummonedMinionEntity = {
      ownerSocketId: ownerSocketId || null,
      id: `dragon_minion_${Date.now()}`,
      x: x - facing * 60,
      y: groundY,
      vx: 0,
      vy: 0,
      facing,
      state: 'attack',
      animTimer: 0,
      attackCooldown: 0.4,
      life: 0,
      maxLife: 14.0,
      damage,
      hp: 3000,
      maxHp: 3000,
      type: 'dragon'
    };
    this.summonedMinions.push(minion);
    return minion;
  }

  public spawnReaperMinion(x: number, groundY: number, facing: number, damage: number, ownerSocketId?: string | null): SummonedMinionEntity {
    // Clear any previous ultimate companion so only 1 exists
    this.summonedMinions = this.summonedMinions.filter(m => m.type !== 'reaper' && m.type !== 'nightborne');

    this.triggerScreenShake(10, 0.35);
    this.addDarkPillar(x + facing * 60, groundY);

    const minion: SummonedMinionEntity = {
      ownerSocketId: ownerSocketId || null,
      id: `reaper_minion_${Date.now()}`,
      x: x + facing * 40,
      y: groundY,
      vx: 0,
      vy: 0,
      facing,
      state: 'spell',
      animTimer: 0,
      attackCooldown: 0.3,
      skillCooldown: 2.0,
      life: 0,
      maxLife: 18.0,
      damage: Math.round(damage * 1.3),
      hp: 4500,
      maxHp: 4500,
      type: 'reaper'
    };
    this.summonedMinions.push(minion);
    return minion;
  }

  public spawnNightBorneMinion(x: number, groundY: number, facing: number, damage: number): SummonedMinionEntity {
    // Clear any previous ultimate companions so only 1 active companion exists
    this.summonedMinions = this.summonedMinions.filter(m => m.type !== 'nightborne' && m.type !== 'reaper');

    this.triggerScreenShake(10, 0.35);
    this.addDarkPillar(x + facing * 50, groundY);
    this.addVoidVortex(x + facing * 80, groundY - 25, 2.0);

    const minion: SummonedMinionEntity = {
      id: `nightborne_minion_${Date.now()}`,
      x: x + facing * 50,
      y: groundY,
      vx: 0,
      vy: 0,
      facing,
      state: 'attack',
      animTimer: 0,
      attackCooldown: 0.2,
      skillCooldown: 1.5,
      life: 0,
      maxLife: 18.0,
      damage: Math.round(damage * 1.3),
      hp: 5000,
      maxHp: 5000,
      type: 'nightborne'
    };
    this.summonedMinions.push(minion);
    return minion;
  }

  public addGroundTrap(
    x: number,
    y: number,
    trapType: 'poison' | 'explosive',
    damage: number,
    options: GroundTrapCombatOptions = {},
  ) {
    this.groundTraps.push({
      id: `trap_${Date.now()}_${Math.random()}`,
      x,
      y,
      radius: 45,
      damage,
      life: 0,
      maxLife: 18.0,
      trapType,
      isTriggered: false,
      ...options,
    });
    this.addImpactBurst(x, y, 8, trapType === 'poison' ? '#4ade80' : '#f97316', 'spark');
  }

  public addGroundZone(
    x: number,
    y: number,
    radius: number,
    damagePerTick: number,
    duration: number,
    zoneType: GroundZoneEntity['zoneType'],
    color: string,
    options: GroundZoneCombatOptions = {},
  ) {
    this.groundZones.push({
      id: `zone_${Date.now()}_${Math.random()}`,
      x,
      y,
      radius,
      damagePerTick,
      tickTimer: 0,
      life: 0,
      // Small grace keeps the final advertised tick alive through the engine's
      // update-then-collision order (e.g. 10 x 0.5s ticks in a 5s blizzard).
      maxLife: duration + 0.05,
      zoneType,
      color,
      tickInterval: options.tickInterval ?? 0.5,
      ...options,
    });

    if (zoneType === 'holy_consecration') {
      this.addHolyPillar(x, y);
    } else if (zoneType === 'void_vortex') {
      this.addVortexEffect(x, y - 20, 1.8);
    } else if (zoneType === 'blizzard') {
      this.addFreezingEffect(x, y - 20, 1.6);
    }
  }

  public addFanOfKnives(x: number, y: number, damage: number, critChance: number) {
    const daggerCount = 8;
    const speed = 12;
    for (let i = 0; i < daggerCount; i++) {
      const angle = (i / daggerCount) * Math.PI * 2;
      this.addProjectile(
        x,
        y - 15,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        'dagger',
        damage,
        Math.random() < critChance,
        true,
        '#e1bee7',
        8,
        true
      );
    }
    this.addImpactBurst(x, y - 15, 16, '#9333ea', 'spark');
  }

  public triggerOmnislash(targets: { x: number; y: number }[], damage: number) {
    this.triggerCinematicOmnislash(targets);
  }

  public addChainLightning(chainPoints: { x: number; y: number }[]) {
    if (chainPoints.length < 2) return;
    
    // Replace hardcoded canvas arcs with lightning sprites!
    chainPoints.forEach(p => {
      this.playVfxSprite(p.x, p.y - 15, 'fx_thunder', 1, 1.6);
      this.addImpactBurst(p.x, p.y - 15, 10, '#93c5fd', 'electric');
    });
  }

  // --- ANIMATION SHEET HELPERS ---

  // ================= CATALOGUE SPRITE VFX =================
  // Effects declared in VfxLibrary. Unlike playVfxSprite below, frame layout is
  // read from verified data instead of guessed from the sprite key.

  /**
   * Global multiplier on every catalogue effect.
   *
   * The preview page (public/vfx-preview.html) renders at def.scale x 2, and
   * that is the size that was signed off. In-game was drawing at def.scale
   * alone, i.e. exactly half - which is why the reworked skills still read as
   * the old ones. Tune here rather than editing 140 catalogue entries.
   */
  private static readonly VFX_SCALE = 2.0;

  private spriteVfx: SpriteVfxInstance[] = [];
  private sheetCache: Map<string, SpriteSheet> = new Map();
  private vfxWarmed = false;
  private static readonly MAX_SHEET_CACHE = 96;

  /**
   * @param row Colour row for palette sheets (one animation per row, nine
   *            colours). Cached per row so each variant is built once.
   */
  private sheetFor(id: string, def: VfxDef, row?: number): SpriteSheet {
    const key = row === undefined ? id : `${id}:${row}`;
    let sheet = this.sheetCache.get(key);
    if (!sheet) {
      let layout = def.layout;
      if (row !== undefined && layout.kind === 'grid' && layout.rows > 1) {
        layout = { ...layout, row: Math.min(row, layout.rows - 1), count: layout.cols };
      }
      sheet = new SpriteSheet(def.src, layout, (src) => sprites.getImage(src));
      this.sheetCache.set(key, sheet);
      if (this.sheetCache.size > ParticleSystem.MAX_SHEET_CACHE) {
        const oldest = this.sheetCache.keys().next().value as string | undefined;
        if (oldest !== undefined) this.sheetCache.delete(oldest);
      }
    }
    return sheet;
  }

  /**
   * Warm only the tiny, shared combat vocabulary. The old implementation
   * fetched the complete VFX and map catalogues here (1,400+ PNGs).
   */
  public warmVfx(ids: readonly string[] = COMMON_BOOT_VFX_IDS) {
    const isDefaultWarm = ids === COMMON_BOOT_VFX_IDS;
    if (isDefaultWarm && this.vfxWarmed) return;
    if (isDefaultWarm) this.vfxWarmed = true;
    sprites.warmPaths(imagePathsForVfxIds(ids));
  }

  /** Warm only one selected class, spread across idle frames before first cast. */
  public warmSkillVfx(skills: readonly WarmableSkillVisual[]) {
    const ids = vfxIdsForSkills(skills);
    sprites.warmPathsIncrementally(imagePathsForVfxIds(ids));
  }

  /**
   * Play a catalogue effect at a world position.
   * Unknown ids are ignored rather than throwing, so a typo degrades to "no
   * effect" instead of breaking the frame.
   */
  public playVfx(
    id: string,
    x: number,
    y: number,
    opts: { facing?: number; scale?: number; vx?: number; vy?: number; fadeOut?: boolean; row?: number } = {}
  ) {
    const def = VFX[id];
    if (!def) {
      console.warn(`[VFX] unknown effect id "${id}"`);
      return;
    }

    // Hard ceiling on concurrent effects. Each one is a large additive blit,
    // and an ultimate can queue several at once - without a cap a slow frame
    // lets them pile up and the next frame is slower still.
    if (this.spriteVfx.length >= this.qualityProfile().spriteVfx) {
      const removed = this.spriteVfx.shift();
      if (removed) this.releaseSpriteVfx(removed);
    }

    const paths = vfxImagePaths(def);
    sprites.retainPaths(paths);
    const ready = sprites.arePathsReady(paths);
    if (!ready) {
      // The first cast remains readable while its sprite sheet streams in.
      this.addImpactBurst(x, y, 6, '#f8fafc', 'spark');
    }
    const sheet = this.sheetFor(id, def, opts.row);
    this.spriteVfx.push({
      anim: new AnimatedSprite(sheet, { fps: def.fps, loop: false }),
      def,
      x,
      y,
      facing: def.directional ? (opts.facing ?? 1) : 1,
      scale: def.scale * (opts.scale ?? 1) * ParticleSystem.VFX_SCALE,
      vx: opts.vx ?? 0,
      vy: opts.vy ?? 0,
      fadeOut: opts.fadeOut ?? false,
      paths,
      ready,
      waitTime: 0,
    });
  }

  private updateSpriteVfx(dt: number) {
    let activeCount = 0;
    for (const v of this.spriteVfx) {
      if (!v.ready) {
        v.waitTime += dt;
        v.ready = sprites.arePathsReady(v.paths);
        if (!v.ready) {
          // A missing file cannot retain the whole animation forever.
          if (v.waitTime < 2) this.spriteVfx[activeCount++] = v;
          else this.releaseSpriteVfx(v);
          continue;
        }
      }
      v.anim.update(dt);
      v.x += v.vx * dt;
      v.y += v.vy * dt;
      if (v.anim.finished) this.releaseSpriteVfx(v);
      else this.spriteVfx[activeCount++] = v;
    }
    this.spriteVfx.length = activeCount;
  }

  private drawSpriteVfx(ctx: CanvasRenderingContext2D) {
    for (const v of this.spriteVfx) {
      if (!v.ready) continue;
      v.anim.draw(ctx, v.x, v.y, {
        scale: v.scale,
        facing: v.facing,
        anchor: v.def.anchor ?? 'center',
        blend: v.def.blend,
        alpha: v.fadeOut ? Math.max(0, 1 - v.anim.progress) : 1
      });
    }
  }

  public playVfxSprite(x: number, y: number, spriteKey: string, facing: number = 1, scale: number = 1.5, tint?: string) {
    let frameW = 100;
    let frameH = 100;
    let totalFrames = 8;
    let cols = 8;
    let fps = 18;
    let isVertical = false;

    if (spriteKey.includes('vfx_magicspell') || spriteKey.includes('vfx_ansimuz_explosion') || spriteKey.includes('vfx_phantom')) {
      frameW = 100; frameH = 100; totalFrames = 8; cols = 8;
    } else if (spriteKey.includes('vfx_dark')) {
      frameW = 48; frameH = 64; totalFrames = 16; cols = 16;
    } else if (spriteKey.includes('vfx_freezing')) {
      frameW = 100; frameH = 100; totalFrames = 10; cols = 10;
    } else if (spriteKey.includes('vfx_slash_circle') || spriteKey.includes('vfx_weaponhit')) {
      frameW = 100; frameH = 100; totalFrames = 5; cols = 5; fps = 24;
    } else if (spriteKey.includes('vfx_flamelash')) {
      frameW = 100; frameH = 100; totalFrames = 7; cols = 7;
    } else if (spriteKey.includes('holy_spell')) {
      frameW = 32; frameH = 32; totalFrames = 38; cols = 38; scale *= 2;
    } else if (spriteKey.includes('aaa_wind_bolt') || spriteKey.includes('aaa_magic_sparks')) {
      frameW = 16; frameH = 16; totalFrames = 6; cols = 6; fps = 20; scale *= 3.5;
    } else if (spriteKey.includes('aaa_holy_shield')) {
      frameW = 48; frameH = 48; totalFrames = 6; cols = 6; fps = 18; scale *= 2.5;
    } else if (spriteKey.includes('pipo_mapeffect')) {
      frameW = 192; frameH = 192; totalFrames = 20; cols = 5; scale *= 1.2;
    } else if (spriteKey.includes('pipo_nazoobj')) {
      frameW = 192; frameH = 192; totalFrames = 30; cols = 5; scale *= 1.2;
    } else if (spriteKey.includes('warrior_vfx')) {
      frameW = 128; frameH = 128; cols = 2; scale *= 1.5;
      totalFrames = (spriteKey === 'warrior_vfx4' || spriteKey === 'warrior_vfx5') ? 8 : 10;
    } else if (spriteKey.includes('mp9_')) {
      isVertical = false; cols = 0; // Strip
      if (spriteKey === 'mp9_darkbolt') { frameW = 88; frameH = 88; totalFrames = 8; }
      else if (spriteKey === 'mp9_firebomb') { frameW = 64; frameH = 64; totalFrames = 14; scale *= 2; }
      else if (spriteKey === 'mp9_lightning') { frameW = 128; frameH = 128; totalFrames = 5; }
      else if (spriteKey === 'mp9_spark') { frameW = 32; frameH = 32; totalFrames = 7; scale *= 2; }
    } else if (spriteKey.includes('fx_')) {
      frameW = 128; frameH = 128; totalFrames = 7; isVertical = true; cols = 0;
    }

    this.spellAnimations.push({
      id: `vfx_${spriteKey}_${Date.now()}_${Math.random()}`,
      x,
      y,
      spriteKey,
      frameW,
      frameH,
      totalFrames,
      isVertical,
      cols,
      scale,
      currentFrame: 0,
      fps,
      timer: 0,
      facing,
      isDone: false
    });
  }

  public playSanjuVfx(x: number, y: number, prefix: string, totalFrames: number, fps: number = 24, scale: number = 2.0, tint?: string) {
    this.spellAnimations.push({
      id: `sanju_${prefix}_${Date.now()}_${Math.random()}`,
      x,
      y,
      spriteKey: prefix, // Used as prefix now
      frameW: 0, // Determined at runtime
      frameH: 0,
      totalFrames,
      isVertical: false,
      scale,
      currentFrame: 0,
      fps,
      timer: 0,
      tint,
      isFrameByFrame: true,
      isDone: false
    });
  }

  public addSpellSlash(x: number, y: number, facing: number = 1, scale: number = 1.3, tint?: string) {
    this.spellAnimations.push({
      id: `slash_${Date.now()}_${Math.random()}`,
      x,
      y,
      spriteKey: 'fx_hit_slash',
      frameW: 128,
      frameH: 128,
      totalFrames: 7,
      isVertical: true,
      scale,
      currentFrame: 0,
      fps: 22,
      timer: 0,
      facing,
      tint,
      isDone: false
    });
  }

  public addFireSpin(x: number, y: number, scale: number = 1.6) {
    this.spellAnimations.push({
      id: `firespin_${Date.now()}_${Math.random()}`,
      x,
      y,
      spriteKey: 'vfx_firespin',
      frameW: 100,
      frameH: 100,
      totalFrames: 8,
      isVertical: false,
      cols: 8,
      scale,
      currentFrame: 0,
      fps: 20,
      timer: 0,
      isDone: false
    });
  }

  public addFlameLash(x: number, y: number, facing: number = 1, scale: number = 1.5) {
    this.spellAnimations.push({
      id: `flamelash_${Date.now()}_${Math.random()}`,
      x,
      y,
      spriteKey: 'vfx_flamelash',
      frameW: 100,
      frameH: 100,
      totalFrames: 7,
      isVertical: false,
      cols: 7,
      scale,
      currentFrame: 0,
      fps: 20,
      timer: 0,
      facing,
      isDone: false
    });
  }

  public addVortexEffect(x: number, y: number, scale: number = 1.8) {
    this.spellAnimations.push({
      id: `vortex_${Date.now()}_${Math.random()}`,
      x,
      y,
      spriteKey: 'vfx_vortex',
      frameW: 100,
      frameH: 100,
      totalFrames: 8,
      isVertical: false,
      cols: 8,
      scale,
      currentFrame: 0,
      fps: 16,
      timer: 0,
      isDone: false
    });
  }

  public addFreezingEffect(x: number, y: number, scale: number = 1.6) {
    this.spellAnimations.push({
      id: `freeze_${Date.now()}_${Math.random()}`,
      x,
      y,
      spriteKey: 'vfx_freezing',
      frameW: 100,
      frameH: 100,
      totalFrames: 10,
      isVertical: false,
      cols: 10,
      scale,
      currentFrame: 0,
      fps: 18,
      timer: 0,
      isDone: false
    });
  }

  public addDarkPillar(x: number, y: number, scale: number = 1.5) {
    this.spellAnimations.push({
      id: `dark2_${Date.now()}_${Math.random()}`,
      x,
      y: y - 25,
      spriteKey: 'vfx_dark2',
      frameW: 48,
      frameH: 64,
      totalFrames: 16,
      isVertical: false,
      cols: 16,
      scale,
      currentFrame: 0,
      fps: 22,
      timer: 0,
      isDone: false
    });
  }

  public addFireBurn(x: number, y: number, scale: number = 1.4) {
    this.spellAnimations.push({
      id: `fire_${Date.now()}_${Math.random()}`,
      x,
      y,
      spriteKey: 'fx_fire_burn',
      frameW: 128,
      frameH: 128,
      totalFrames: 10,
      isVertical: true,
      scale,
      currentFrame: 0,
      fps: 18,
      timer: 0,
      isDone: false
    });
  }

  public addFireLine(x: number, y: number, facing: number = 1, scale: number = 1.5) {
    this.spellAnimations.push({
      id: `fireline_${Date.now()}_${Math.random()}`,
      x,
      y,
      spriteKey: 'fx_fire_line',
      frameW: 128,
      frameH: 64,
      totalFrames: 7,
      isVertical: true,
      scale,
      currentFrame: 0,
      fps: 16,
      timer: 0,
      facing,
      isDone: false
    });
  }

  public addIceBurst(x: number, y: number, scale: number = 1.4) {
    this.spellAnimations.push({
      id: `ice_${Date.now()}_${Math.random()}`,
      x,
      y,
      spriteKey: 'fx_ice_burst',
      frameW: 128,
      frameH: 128,
      totalFrames: 7,
      isVertical: true,
      scale,
      currentFrame: 0,
      fps: 18,
      timer: 0,
      isDone: false
    });
  }

  public addThunderBolt(x: number, y: number, scale: number = 1.5) {
    this.spellAnimations.push({
      id: `thunder_${Date.now()}_${Math.random()}`,
      x,
      y,
      spriteKey: 'fx_thunder',
      frameW: 128,
      frameH: 128,
      totalFrames: 8,
      isVertical: false,
      cols: 4,
      scale,
      currentFrame: 0,
      fps: 22,
      timer: 0,
      isDone: false
    });
  }

  public addHolyCrystal(x: number, y: number, scale: number = 1.3) {
    this.spellAnimations.push({
      id: `crystal_${Date.now()}_${Math.random()}`,
      x,
      y,
      spriteKey: 'fx_crystal',
      frameW: 128,
      frameH: 128,
      totalFrames: 6,
      isVertical: false,
      cols: 6,
      scale,
      currentFrame: 0,
      fps: 14,
      timer: 0,
      isDone: false
    });
  }

  public addEnergyImpact(x: number, y: number, scale: number = 1.4, tint?: string) {
    this.spellAnimations.push({
      id: `eimpact_${Date.now()}_${Math.random()}`,
      x,
      y,
      spriteKey: 'fx_energy_impact',
      frameW: 128,
      frameH: 128,
      totalFrames: 8,
      isVertical: true,
      scale,
      currentFrame: 0,
      fps: 20,
      timer: 0,
      tint,
      isDone: false
    });
  }

  public addGroundExplosion(x: number, y: number, scale: number = 1.6) {
    this.spellAnimations.push({
      id: `exp_${Date.now()}_${Math.random()}`,
      x,
      y,
      spriteKey: 'fx_explosion',
      frameW: 128,
      frameH: 128,
      totalFrames: 8,
      isVertical: true,
      scale,
      currentFrame: 0,
      fps: 18,
      timer: 0,
      isDone: false
    });
  }

  public addMagicBarrier(x: number, y: number, scale: number = 1.2) {
    this.spellAnimations.push({
      id: `mirror_${Date.now()}_${Math.random()}`,
      x,
      y,
      spriteKey: 'fx_magic_mirror',
      frameW: 128,
      frameH: 128,
      totalFrames: 5,
      isVertical: true,
      scale,
      currentFrame: 0,
      fps: 12,
      timer: 0,
      isDone: false
    });
  }

  public addSlashVFX(x: number, y: number, direction: number, color: string = '#ffd700', size: number = 60) {
    this.addSpellSlash(x, y, direction, size / 50, color);
    const particleCount = Math.max(5, Math.round(12 * this.qualityProfile().particleScale));
    for (let i = 0; i < particleCount; i++) {
      const angle = (direction > 0 ? -0.8 : 2.3) + (i / particleCount) * (direction > 0 ? 1.6 : -1.6);
      const speed = Math.random() * 3 + 2;
      this.spawnParticle({
        x: x + Math.cos(angle) * (size * 0.7),
        y: y + Math.sin(angle) * (size * 0.7),
        vx: Math.cos(angle) * speed * direction,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 4 + 2,
        color,
        alpha: 1,
        decay: Math.random() * 0.04 + 0.04,
        type: 'spark'
      });
    }
  }

  public addImpactBurst(
    x: number,
    y: number,
    count: number = 15,
    color: string = '#ff4400',
    type: Particle['type'] = 'spark'
  ) {
    const scaledCount = Math.max(1, Math.round(count * this.qualityProfile().particleScale));
    for (let i = 0; i < scaledCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 1.5;
      this.spawnParticle({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        size: Math.random() * 5 + 2,
        color,
        alpha: 1,
        decay: Math.random() * 0.03 + 0.02,
        type
      });
    }
  }

  public addHolyPillar(x: number, y: number) {
    this.addHolyCrystal(x, y - 20, 1.4);
    const particleCount = Math.max(8, Math.round(30 * this.qualityProfile().particleScale));
    for (let i = 0; i < particleCount; i++) {
      this.spawnParticle({
        x: x + (Math.random() * 50 - 25),
        y: y + (Math.random() * 20 - 10),
        vx: (Math.random() - 0.5) * 0.8,
        vy: -(Math.random() * 5 + 3),
        size: Math.random() * 5 + 2,
        color: '#fff59d',
        alpha: 1,
        decay: Math.random() * 0.02 + 0.015,
        type: 'holy'
      });
    }
  }

  public addProjectile(
    x: number,
    y: number,
    vx: number,
    vy: number,
    type: ProjectileVFX['type'],
    damage: number,
    isCrit: boolean = false,
    fromPlayer: boolean = true,
    color: string = '#ff5722',
    radius: number = 12,
    piercing: boolean = false,
    options: ProjectileCombatOptions = {},
  ): ProjectileVFX {
    const properties: ProjectileVFX = {
      id: `proj_${Date.now()}_${Math.random()}`,
      x,
      y,
      vx,
      vy,
      previousX: x,
      previousY: y,
      type,
      radius,
      color,
      damage,
      isCrit,
      fromPlayer,
      piercing,
      life: 0,
      maxLife: 2.5,
      rotation: Math.atan2(vy, vx),
      originX: x,
      originY: y,
      ...options,
    };
    const proj = this.projectilePool.pop() || properties;
    if (proj !== properties) {
      this.reusedProjectiles += 1;
      // A projectile carries many optional combat fields. Clear the recycled
      // object first so an old pierce/status/impact cannot leak into a new shot.
      for (const key of Object.keys(proj)) Reflect.deleteProperty(proj, key);
      Object.assign(proj, properties);
    }
    this.projectiles.push(proj);
    this.enforceProjectileBudget();
    return proj;
  }

  /** Play the impact carried by the same projectile that performed the hit. */
  public completeProjectile(proj: ProjectileVFX, x: number = proj.x, y: number = proj.y) {
    if (proj.completed) return;
    proj.completed = true;
    if (proj.impactVfx) {
      this.playVfx(proj.impactVfx, x, y, {
        facing: proj.vx >= 0 ? 1 : -1,
        row: proj.impactRow,
        scale: proj.impactScale ?? 1,
      });
    }
    if (proj.identity) this.addSkillIdentityAccent(x, y, proj.vx >= 0 ? 1 : -1, proj.identity);
  }

  /**
   * Update all active particles and effects
   */
  public update(dt: number) {
    this.enforceBudgets();
    const hidden = this.isDocumentHidden();
    if (hidden) this.reduceHiddenWork();
    const dtFrame = dt * 60;
    if (this.screenShakeTime > 0) {
      this.screenShakeTime -= dt;
    }

    // 0. Update catalogue sprite VFX
    if (!hidden) this.updateSpriteVfx(dt);

    // 1. Update Spell Animations
    for (const spell of this.spellAnimations) {
      spell.timer += dt;
      spell.currentFrame = Math.floor(spell.timer * spell.fps);
      if (spell.currentFrame >= spell.totalFrames) {
        spell.isDone = true;
      }
    }
    for (let index = this.spellAnimations.length - 1; index >= 0; index -= 1) {
      if (this.spellAnimations[index].isDone) this.spellAnimations.splice(index, 1);
    }

    // 2. Update Dragon Avatars
    for (const d of this.dragonAvatars) {
      d.life += dt;
    }
    for (let index = this.dragonAvatars.length - 1; index >= 0; index -= 1) {
      if (this.dragonAvatars[index].life >= this.dragonAvatars[index].maxLife) this.dragonAvatars.splice(index, 1);
    }

    // 3. Update Reaper Avatars
    for (const r of this.reaperAvatars) {
      r.life += dt;
    }
    for (let index = this.reaperAvatars.length - 1; index >= 0; index -= 1) {
      if (this.reaperAvatars[index].life >= this.reaperAvatars[index].maxLife) this.reaperAvatars.splice(index, 1);
    }

    // 4. Update Holy Hammers
    for (const h of this.holyHammers) {
      h.life += dt;
      if (h.currentY < h.targetY) {
        h.currentY += 28 * dtFrame;
        if (h.currentY >= h.targetY && !h.hasImpacted) {
          h.hasImpacted = true;
          this.triggerScreenShake(20, 0.6);
          this.addGroundExplosion(h.x, h.targetY, 2.2);
        }
      }
    }
    for (let index = this.holyHammers.length - 1; index >= 0; index -= 1) {
      if (this.holyHammers[index].life >= this.holyHammers[index].maxLife) this.holyHammers.splice(index, 1);
    }

    // 5. Update Volcanic Fissures
    for (const f of this.volcanicFissures) {
      f.life += dt;
    }
    for (let index = this.volcanicFissures.length - 1; index >= 0; index -= 1) {
      if (this.volcanicFissures[index].life >= this.volcanicFissures[index].maxLife) this.volcanicFissures.splice(index, 1);
    }

    // 6. Update Screen Flashes
    for (const sf of this.screenFlashes) {
      sf.alpha -= sf.decay * dtFrame;
    }
    for (let index = this.screenFlashes.length - 1; index >= 0; index -= 1) {
      if (this.screenFlashes[index].alpha <= 0) this.screenFlashes.splice(index, 1);
    }

    // 7. Update Ghost Trails
    for (const g of this.ghostTrails) {
      g.life -= dt;
      g.alpha = Math.max(0, (g.life / g.maxLife) * 0.65);
    }
    for (let index = this.ghostTrails.length - 1; index >= 0; index -= 1) {
      if (this.ghostTrails[index].life <= 0) this.ghostTrails.splice(index, 1);
    }

    // 8. Update Shadow Clones
    for (const clone of this.shadowClones) {
      clone.life += dt;
      clone.animTimer += dt;
      if (clone.life >= clone.maxLife) {
        this.addImpactBurst(clone.x, clone.y - 20, 10, clone.colorTint, 'smoke');
      }
    }
    for (let index = this.shadowClones.length - 1; index >= 0; index -= 1) {
      if (this.shadowClones[index].life >= this.shadowClones[index].maxLife) this.shadowClones.splice(index, 1);
    }

    // 8. Update Summoned Minions
    for (const minion of this.summonedMinions) {
      minion.life += dt;
      minion.animTimer += dt;
      if (minion.attackCooldown > 0) {
        minion.attackCooldown -= dt;
      }
    }
    for (let index = this.summonedMinions.length - 1; index >= 0; index -= 1) {
      const minion = this.summonedMinions[index];
      if (minion.life >= minion.maxLife || minion.hp <= 0) this.summonedMinions.splice(index, 1);
    }

    // 9. Update Ground Traps
    for (const trap of this.groundTraps) {
      trap.life += dt;
    }
    for (let index = this.groundTraps.length - 1; index >= 0; index -= 1) {
      const trap = this.groundTraps[index];
      if (trap.life >= trap.maxLife || trap.isTriggered) this.groundTraps.splice(index, 1);
    }

    // 10. Update Ground Zones
    for (const zone of this.groundZones) {
      zone.life += dt;
      zone.tickTimer += dt;
    }
    for (let index = this.groundZones.length - 1; index >= 0; index -= 1) {
      if (this.groundZones[index].life >= this.groundZones[index].maxLife) this.groundZones.splice(index, 1);
    }

    // 11. Update Omnislash Lines
    for (const line of this.omnislashLines) {
      line.life += dt;
    }
    for (let index = this.omnislashLines.length - 1; index >= 0; index -= 1) {
      if (this.omnislashLines[index].life >= this.omnislashLines[index].maxLife) this.omnislashLines.splice(index, 1);
    }

    // 12. Update Chain Lightning Arcs
    for (const arc of this.chainLightningArcs) {
      arc.life += dt;
    }
    for (let index = this.chainLightningArcs.length - 1; index >= 0; index -= 1) {
      if (this.chainLightningArcs[index].life >= this.chainLightningArcs[index].maxLife) this.chainLightningArcs.splice(index, 1);
    }

    // 13. Update Particles
    this.particles.forEach(p => {
      p.x += p.vx * dtFrame;
      p.y += p.vy * dtFrame;
      p.alpha -= p.decay;

      if (p.type === 'spark' || p.type === 'smoke') {
        p.vy += 0.15 * dtFrame;
      } else if (p.type === 'holy') {
        p.vy -= 0.05 * dtFrame;
      } else if (p.type === 'poison') {
        p.vy -= 0.02 * dtFrame;
      }
    });
    let activeParticleCount = 0;
    for (const particle of this.particles) {
      if (particle.alpha > 0) this.particles[activeParticleCount++] = particle;
      else this.recycleParticle(particle);
    }
    this.particles.length = activeParticleCount;

    // 14. Update Floating Combat Texts
    this.floatingTexts.forEach(ft => {
      ft.life += dt;
      ft.y += ft.vy * dtFrame;
      ft.vy *= Math.pow(0.94, dtFrame);
      ft.alpha = 1 - Math.pow(ft.life / ft.maxLife, 2);
    });
    let activeTextCount = 0;
    for (const text of this.floatingTexts) {
      if (text.life < text.maxLife) this.floatingTexts[activeTextCount++] = text;
      else this.recycleFloatingText(text);
    }
    this.floatingTexts.length = activeTextCount;

    // 15. Update Projectiles
    this.projectiles.forEach(proj => {
      proj.life += dt;
      proj.previousX = proj.x;
      proj.previousY = proj.y;
      proj.x += proj.vx * dtFrame;
      proj.y += proj.vy * dtFrame;

      if (proj.type === 'shuriken' || proj.type === 'dagger') {
        proj.rotation = (proj.rotation || 0) + 0.35 * dtFrame;
      }

      if (!hidden && !proj.visualOnly && Math.random() < this.qualityProfile().projectileTrailChance) {
        this.spawnParticle({
          x: proj.x + (Math.random() * 6 - 3),
          y: proj.y + (Math.random() * 6 - 3),
          vx: -proj.vx * 0.12,
          vy: -proj.vy * 0.12 + (Math.random() - 0.5),
          size: proj.radius * 0.5,
          color: proj.color,
          alpha: 0.8,
          decay: 0.08,
          type: proj.type === 'fireball' ? 'fire' : (proj.type === 'dark_skull' ? 'dark' : 'spark')
        });
      }

      const travelled = Math.hypot(proj.x - (proj.originX ?? proj.x), proj.y - (proj.originY ?? proj.y));
      if (proj.maxDistance !== undefined && travelled >= proj.maxDistance) {
        this.completeProjectile(proj);
      }
    });
    let activeProjectileCount = 0;
    for (const projectile of this.projectiles) {
      if (projectile.life < projectile.maxLife && !projectile.completed) {
        this.projectiles[activeProjectileCount++] = projectile;
      }
      else this.recycleProjectile(projectile);
    }
    this.projectiles.length = activeProjectileCount;
    this.enforceBudgets();
  }

  /**
   * Draw all particles, animated spell effects, clones, summons, zones, avatars, and screen flashes
   */
  public draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const expensiveEffects = this.effectiveVfxQuality() === 'high';

    // 0. Catalogue sprite VFX sit behind the bespoke ultimate set pieces.
    this.drawSpriteVfx(ctx);

    // 1. Draw Volcanic Fissures (Warrior Ultimate)
    this.volcanicFissures.forEach(f => {
      ctx.save();
      const progress = f.life / f.maxLife;
      const alpha = Math.max(0, 1 - progress);
      ctx.globalAlpha = alpha;
      ctx.translate(f.x, f.y - 15);

      const smackImg = sprites.getImage('vfx_energy_smack');
      if (smackImg && smackImg.complete) {
        const frame = Math.min(5, Math.floor(progress * 6));
        const frameW = 64;
        const frameH = 64;
        const destW = frameW * f.scale * 1.5;
        const destH = frameH * f.scale * 1.5;
        ctx.drawImage(smackImg, frame * frameW, 0, frameW, frameH, -destW / 2, -destH + 20, destW, destH);
      }
      ctx.restore();
    });

    // 2. Draw Ground Zones (Consecration, Sanctuary, Blizzard, Void Vortex)
    this.groundZones.forEach(zone => {
      ctx.save();
      const pulse = 0.85 + Math.sin(zone.life * 4) * 0.15;
      const rad = zone.radius * pulse;

      if (zone.zoneType === 'holy_consecration') {
        const protImg = sprites.getImage('vfx_protection');
        if (protImg && protImg.complete) {
          const frame = Math.floor(zone.life * 10) % 8;
          const destSize = rad * 2.2;
          ctx.drawImage(protImg, frame * 100, 0, 100, 100, zone.x - destSize / 2, zone.y - destSize * 0.35, destSize, destSize * 0.7);
        }
      } else if (zone.zoneType === 'sanctuary_ward') {
        const protImg = sprites.getImage('vfx_protection');
        if (protImg && protImg.complete) {
          const frame = Math.floor(zone.life * 8) % 8;
          const destSize = rad * 2.2;
          ctx.drawImage(protImg, frame * 100, 0, 100, 100, zone.x - destSize / 2, zone.y - destSize / 2, destSize, destSize);
        }
      } else if (zone.zoneType === 'poison_cloud') {
        const vortexImg = sprites.getImage('vfx_vortex');
        if (vortexImg && vortexImg.complete) {
          const frame = Math.floor(zone.life * 8) % 8;
          const destSize = rad * 2.0;
          ctx.drawImage(vortexImg, frame * 100, 0, 100, 100, zone.x - destSize / 2, zone.y - destSize * 0.4, destSize, destSize * 0.8);
        }
      }
      ctx.restore();
    });

    // 3. Draw Ground Traps
    this.groundTraps.forEach(trap => {
      ctx.save();
      ctx.translate(trap.x, trap.y - 12);
      const spikeImg = sprites.getImage('st_wood_spike');
      if (spikeImg && spikeImg.complete) {
        ctx.drawImage(spikeImg, -16, -16, 32, 32);
      }
      ctx.restore();
    });

    // 3.5 Draw Ghost Trails (Afterimages)
    this.ghostTrails.forEach(g => {
      ctx.save();
      ctx.globalAlpha = g.alpha;
      sprites.drawHero(ctx, g.x, g.y, g.classId, g.state, g.facing, g.animTimer, g.color);
      ctx.restore();
    });

    // 4. Draw Shadow Clones
    this.shadowClones.forEach(clone => {
      ctx.save();
      ctx.globalAlpha = 0.65;
      sprites.drawHero(ctx, clone.x, clone.y, clone.classId, 'attack', clone.facing, 0.4, clone.colorTint);
      ctx.restore();
    });

    // 5. Draw Summoned Minions (Skeletons & Elder Dragon Companion)
    this.summonedMinions.forEach(minion => {
      ctx.save();
      if (minion.type === 'skeleton') {
        if (expensiveEffects) ctx.filter = 'drop-shadow(0 0 8px #a855f7)';
        sprites.drawMob(ctx, minion.x, minion.y, 'skeleton', minion.state === 'attack' ? 'run' : (minion.state === 'walk' ? 'walk' : 'idle'), minion.facing, false, 0);

        const barW = 32;
        const hpPct = Math.max(0, minion.hp / minion.maxHp);
        ctx.fillStyle = '#1e1b4b';
        ctx.fillRect(minion.x - barW / 2, minion.y - 65, barW, 4);
        ctx.fillStyle = '#a855f7';
        ctx.fillRect(minion.x - barW / 2, minion.y - 65, barW * hpPct, 4);
      } else if (minion.type === 'dragon') {
        ctx.translate(minion.x, minion.y);
        
        // Shadow directly on the ground under dragon feet
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 140, 14, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        // Raw dragon sprite faces LEFT by default!
        // When minion.facing > 0 (facing right towards enemies), flip horizontally!
        if (minion.facing > 0) {
          ctx.scale(-1, 1);
        }

        const frameNum = Math.min(40, Math.max(1, Math.floor((minion.animTimer * 16) % 40) + 1));
        let dragonImg: HTMLImageElement | null | undefined = null;

        // Use correct animation state
        if (minion.state === 'attack2' || minion.state === 'attack') {
           dragonImg = sprites.getImage(`dragon_atk_${frameNum}`);
        } else if (minion.state === 'walk' || minion.state === 'run') {
           dragonImg = sprites.getImage(`dragon_walk_${frameNum}`);
        } else {
          dragonImg = sprites.getImage(`dragon_idle_${frameNum}`);
        }

        if (!this.isDrawableImage(dragonImg)) {
          dragonImg = sprites.getImage(`dragon_idle_1`);
        }
        if (!this.isDrawableImage(dragonImg)) {
          dragonImg = this.resolveDragonFallback();
        }

        const destW = 480;
        const destH = 295;
        const feetYOffset = Math.round(destH * 0.78); // Exactly 230px from top of image

        if (this.isDrawableImage(dragonImg)) {
          ctx.shadowColor = '#ff5722';
          ctx.shadowBlur = expensiveEffects ? 24 : 0;
          // Mathematical precision: feet land perfectly on y = 0
          ctx.drawImage(dragonImg, -destW * 0.55, -feetYOffset, destW, destH);
        }
        ctx.restore();

        // Dragon Companion Boss Bar (Positioned nicely above the dragon's back)
        // Drawn AFTER ctx.restore() so text and bar are not flipped backwards
        const barW = 140;
        const hpPct = Math.max(0, minion.hp / minion.maxHp);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(-barW / 2, -feetYOffset - 18, barW, 6);
        ctx.fillStyle = '#f97316';
        ctx.fillRect(-barW / 2, -feetYOffset - 18, barW * hpPct, 6);
        ctx.font = 'bold 11px "Outfit", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText('Elder Dragon Companion', 0, -feetYOffset - 24);
      } else if (minion.type === 'reaper') {
        ctx.translate(minion.x, minion.y);

        // Bringer of Death sprite faces LEFT by default!
        // When facing right towards enemies, flip horizontally!
        if (minion.facing > 0) {
          ctx.scale(-1, 1);
        }

        // Ground shadow under reaper robe
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 45, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        let reaperImg: HTMLImageElement | null | undefined = null;
        if (minion.state === 'spell') {
          const frame = Math.min(16, Math.max(1, Math.floor((minion.animTimer * 14) % 16) + 1));
          reaperImg = sprites.getImage(`reaper_spell_${frame}`);
        } else if (minion.state === 'cast') {
          const frame = Math.min(9, Math.max(1, Math.floor((minion.animTimer * 12) % 9) + 1));
          reaperImg = sprites.getImage(`reaper_cast_${frame}`);
        } else if (minion.state === 'attack' || minion.state === 'attack2') {
          const frame = Math.min(10, Math.max(1, Math.floor((minion.animTimer * 14) % 10) + 1));
          reaperImg = sprites.getImage(`reaper_atk_${frame}`);
        } else if (minion.state === 'walk') {
          const frame = Math.min(8, Math.max(1, Math.floor((minion.animTimer * 10) % 8) + 1));
          reaperImg = sprites.getImage(`reaper_walk_${frame}`);
        } else {
          const frame = Math.min(8, Math.max(1, Math.floor((minion.animTimer * 8) % 8) + 1));
          reaperImg = sprites.getImage(`reaper_idle_${frame}`);
        }

        if (!this.isDrawableImage(reaperImg)) {
          reaperImg = sprites.getImage(`reaper_idle_1`) || sprites.getImage(`reaper_atk_1`);
        }
        if (!this.isDrawableImage(reaperImg)) {
          reaperImg = this.resolveReaperFallback();
        }

        const destW = 300;
        const destH = 200;
        const feetYOffset = Math.round(destH * 0.98); // 196px from top of image

        if (this.isDrawableImage(reaperImg)) {
          ctx.drawImage(reaperImg, -destW * 0.75, -feetYOffset, destW, destH);
        } else {
          // Robust sheet fallback
          const sheetImg = sprites.getImage('reaper_sheet');
          if (this.isDrawableImage(sheetImg)) {
            ctx.drawImage(sheetImg, 0, 0, 140, 93, -destW * 0.75, -feetYOffset, destW, destH);
          }
        }

        // Reaper Boss Bar (Positioned nicely above the hood)
        const barW = 140;
        const hpPct = Math.max(0, minion.hp / minion.maxHp);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(-barW / 2, -feetYOffset - 16, barW, 6);
        ctx.fillStyle = '#a855f7';
        ctx.fillRect(-barW / 2, -feetYOffset - 16, barW * hpPct, 6);
        ctx.font = 'bold 11px "Outfit", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText('Bringer of Death', 0, -feetYOffset - 22);
      } else if (minion.type === 'nightborne') {
        ctx.translate(minion.x, minion.y);
        if (minion.facing < 0) ctx.scale(-1, 1);

        // Dark ground shadow ellipse
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 56, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // 5 Rows in nightborne.png:
        // Row 0: Idle (9 frames)
        // Row 1: Run (6 frames)
        // Row 2: Attack (12 frames)
        // Row 3: Hurt (5 frames)
        // Row 4: Death (23 frames)
        let row = 0;
        let totalFrames = 9;
        let animSpeed = 8;

        if (minion.state === 'attack' || minion.state === 'attack2') {
          row = 2;
          totalFrames = 12;
          animSpeed = 12;
        } else if (minion.state === 'walk' || minion.state === 'run') {
          row = 1;
          totalFrames = 6;
          animSpeed = 10;
        } else if (minion.state === 'hurt' || minion.state === 'hit') {
          row = 3;
          totalFrames = 5;
          animSpeed = 10;
        } else if (minion.state === 'death') {
          row = 4;
          totalFrames = 23;
          animSpeed = 12;
        }

        const sheetImg = sprites.getImage('nightborne');
        const frame = Math.min(totalFrames - 1, Math.max(0, Math.floor((minion.animTimer * animSpeed) % totalFrames)));
        const sx = frame * 80;
        const sy = row * 80;

        // Big, intimidating hero size: 240x240 (character is 84px tall, 3x hero scale)
        const destW = 240;
        const destH = 240;
        const feetYOffset = Math.round(destH * 0.7875); // 189px from top of dest rect
        const centerXOffset = Math.round(destW * 0.45); // 108px

        if (this.isDrawableImage(sheetImg)) {
          ctx.shadowBlur = 0;
          ctx.drawImage(sheetImg, sx, sy, 80, 80, -centerXOffset, -feetYOffset, destW, destH);
        }

        // NightBorne Boss Bar (Anchored right above character's head at -84px)
        const headTopY = -feetYOffset + Math.round((35 / 80) * destH); // -189 + 105 = -84px
        const barW = 140;
        const hpPct = Math.max(0, minion.hp / minion.maxHp);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(-barW / 2, headTopY - 14, barW, 6);
        ctx.fillStyle = '#a855f7';
        ctx.fillRect(-barW / 2, headTopY - 14, barW * hpPct, 6);
        ctx.font = 'bold 11px "Outfit", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText('NightBorne Void Lord', 0, headTopY - 20);
      }
      ctx.restore();
    });

    // 6. Draw REAL ANIMATED DRAGON AVATAR (Dragoon Ultimate)
    this.dragonAvatars.forEach(d => {
      ctx.save();
      const progress = d.life / d.maxLife;
      const alpha = Math.min(1, Math.sin(progress * Math.PI) * 1.5);
      ctx.globalAlpha = alpha;
      ctx.translate(d.x, d.y);
      if (d.facing < 0) ctx.scale(-1, 1);

      const frameNum = Math.min(40, Math.max(1, Math.floor(progress * 40) + 1));
      let dragonImg = sprites.getImage(`dragon_atk_${frameNum}`);
      if (!this.isDrawableImage(dragonImg)) {
        dragonImg = sprites.getImage('dragon_atk_1') || this.resolveDragonFallback() || undefined;
      }
      if (this.isDrawableImage(dragonImg)) {
        const destW = 540;
        const destH = 330;
        ctx.drawImage(dragonImg, -destW * 0.35, -destH * 0.55, destW, destH);
      }
      ctx.restore();
    });

    // 7. Draw REAL ANIMATED GRIM REAPER AVATAR (Necromancer Ultimate)
    this.reaperAvatars.forEach(r => {
      ctx.save();
      const progress = r.life / r.maxLife;
      const alpha = Math.min(1, Math.sin(progress * Math.PI) * 1.5);
      ctx.globalAlpha = alpha;
      ctx.translate(r.x, r.y);
      if (r.facing < 0) ctx.scale(-1, 1);

      const isSpell = progress < 0.45;
      const frameNum = isSpell
        ? Math.min(16, Math.max(1, Math.floor((progress / 0.45) * 16) + 1))
        : Math.min(10, Math.max(1, Math.floor(((progress - 0.45) / 0.55) * 10) + 1));

      let reaperImg = sprites.getImage(isSpell ? `reaper_spell_${frameNum}` : `reaper_atk_${frameNum}`);
      if (!this.isDrawableImage(reaperImg)) {
        reaperImg = this.resolveReaperFallback() || undefined;
      }
      if (this.isDrawableImage(reaperImg)) {
        const destW = 280;
        const destH = 186;
        ctx.drawImage(reaperImg, -destW / 2, -destH + 50, destW, destH);
      }
      ctx.restore();
    });

    // 8. Draw REAL HOLY SPELL & CELESTIAL IMPACT (Paladin Ultimate)
    this.holyHammers.forEach(h => {
      ctx.save();
      const progress = h.life / h.maxLife;
      ctx.translate(h.x, h.currentY);

      const holyImg = sprites.getImage('holy_spell_00');
      if (holyImg && holyImg.complete) {
        const frame = Math.floor(progress * 24) % 38;
        const srcX = frame * 32;
        const srcY = 0;
        const destSize = 140;
        ctx.drawImage(holyImg, srcX, srcY, 32, 32, -destSize / 2, -destSize / 2, destSize, destSize);
      } else {
        ctx.fillStyle = '#facc15';
        ctx.fillRect(-30, -25, 60, 50);
      }

      ctx.restore();
    });

    // 9. Draw Animated Spell Sprites
    this.spellAnimations.forEach(spell => {
      let img: HTMLImageElement | null | undefined;
      if (spell.isFrameByFrame) {
        img = sprites.getImage(`${spell.spriteKey}_${spell.currentFrame + 1}`);
      } else {
        img = sprites.getImage(spell.spriteKey);
      }

      if (!this.isDrawableImage(img)) return;

      const frameW = spell.isFrameByFrame ? img.width : spell.frameW;
      const frameH = spell.isFrameByFrame ? img.height : spell.frameH;
      const destW = frameW * spell.scale;
      const destH = frameH * spell.scale;

      ctx.save();
      ctx.translate(spell.x, spell.y);

      if (spell.facing && spell.facing < 0) {
        ctx.scale(-1, 1);
      }

      if (spell.tint && expensiveEffects) {
        ctx.filter = `drop-shadow(0 0 10px ${spell.tint})`;
      }

      let srcX = 0;
      let srcY = 0;

      if (!spell.isFrameByFrame) {
        if (spell.isVertical) {
          srcY = spell.currentFrame * frameH;
        } else if (spell.cols) {
          const col = spell.currentFrame % spell.cols;
          const row = Math.floor(spell.currentFrame / spell.cols);
          srcX = col * frameW;
          srcY = row * frameH;
        } else {
          srcX = spell.currentFrame * frameW;
        }
      }

      ctx.drawImage(
        img,
        srcX,
        srcY,
        frameW,
        frameH,
        -destW / 2,
        -destH / 2,
        destW,
        destH
      );

      ctx.restore();
    });

    // 10. Draw Omnislash Screen Cleave Lines
    this.omnislashLines.forEach(line => {
      ctx.save();
      const alpha = Math.max(0, 1 - line.life / line.maxLife);
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 4.0;
      ctx.globalAlpha = alpha;
      ctx.shadowColor = line.color;
      ctx.shadowBlur = expensiveEffects ? 14 : 0;
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
      ctx.stroke();
      ctx.restore();
    });

    // 11. Draw Chain Lightning Arcs
    this.chainLightningArcs.forEach(arc => {
      if (arc.points.length < 2) return;
      ctx.save();
      const alpha = Math.max(0, 1 - arc.life / arc.maxLife);
      ctx.strokeStyle = arc.color;
      ctx.lineWidth = 3.5;
      ctx.globalAlpha = alpha;
      ctx.shadowColor = arc.color;
      ctx.shadowBlur = expensiveEffects ? 14 : 0;
      ctx.beginPath();
      ctx.moveTo(arc.points[0].x, arc.points[0].y);
      for (let i = 1; i < arc.points.length; i++) {
        ctx.lineTo(arc.points[i].x, arc.points[i].y);
      }
      ctx.stroke();
      ctx.restore();
    });

    // 12. Draw Particles. Canvas shadow blur is one of the most expensive
    // raster operations at high DPR. Keep a small high-quality glow budget and
    // explicitly clear it for ordinary particles; previously one glowing
    // particle leaked blur into every particle drawn after it.
    let glowingParticles = 0;
    const particleGlowBudget = expensiveEffects ? 48 : 0;
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;

      const canGlow = glowingParticles < particleGlowBudget
        && (p.type === 'holy' || p.type === 'electric' || p.type === 'dark' || p.type === 'fire');
      if (canGlow) {
        glowingParticles += 1;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // 13. Draw Projectiles. A small glow subset carries the magical read;
    // filter-blitting every arrow in a 30-shot channel was a dominant GPU cost.
    let glowingProjectiles = 0;
    const projectileGlowBudget = expensiveEffects ? 16 : 0;
    for (const proj of this.projectiles) {
      const useProjectileGlow = !proj.visualOnly && glowingProjectiles < projectileGlowBudget;
      if (useProjectileGlow) glowingProjectiles += 1;
      ctx.save();
      ctx.translate(proj.x, proj.y);

      if (proj.rotation !== undefined) {
        ctx.rotate(proj.rotation);
      }

      const frame = Math.floor(proj.life * 24) % 25 + 1; // 24 FPS, 25 frames

      if (proj.type === 'arrow' || proj.type === 'dagger' || proj.type === 'kunai' || proj.type === 'shuriken' || proj.type === 'spear') {
        const img = sprites.getImage(`sanju_pure_${frame}`);
        if (this.isDrawableImage(img)) {
          if (proj.vx < 0 && proj.rotation === undefined) ctx.scale(-1, 1);
          ctx.globalAlpha = 0.35;
          if (useProjectileGlow) ctx.filter = `drop-shadow(0 0 8px ${proj.color})`;
          ctx.drawImage(img, -18, -18, 36, 36);
          ctx.filter = 'none';
          ctx.globalAlpha = 1;
        }

        // The sprite pack's generic glow is only the trail. These silhouettes
        // make an arrow read as an arrow and, critically, Fan of Knives read as
        // eight individual daggers instead of eight identical energy balls.
        ctx.strokeStyle = proj.color;
        ctx.fillStyle = '#f8fafc';
        ctx.lineWidth = 2;
        ctx.shadowColor = proj.color;
        ctx.shadowBlur = useProjectileGlow ? 7 : 0;
        if (proj.type === 'arrow') {
          ctx.beginPath(); ctx.moveTo(-17, 0); ctx.lineTo(13, 0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(9, -5); ctx.lineTo(11, 0); ctx.lineTo(9, 5); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-19, -5); ctx.moveTo(-14, 0); ctx.lineTo(-19, 5); ctx.stroke();
        } else if (proj.type === 'dagger' || proj.type === 'kunai') {
          ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-3, -4); ctx.lineTo(-8, 0); ctx.lineTo(-3, 4); ctx.closePath(); ctx.fill();
          ctx.fillStyle = proj.color;
          ctx.fillRect(-10, -6, 3, 12);
          ctx.fillRect(-17, -2, 8, 4);
        } else if (proj.type === 'spear') {
          ctx.beginPath(); ctx.moveTo(-25, 0); ctx.lineTo(16, 0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(13, -6); ctx.lineTo(16, 0); ctx.lineTo(13, 6); ctx.closePath(); ctx.fill();
        } else {
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4;
            const r = i % 2 === 0 ? 13 : 4;
            const px = Math.cos(a) * r, py = Math.sin(a) * r;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath(); ctx.fill();
        }
      } else if (proj.type === 'fireball' || proj.type === 'meteor') {
        const img = sprites.getImage(`sanju_pure_${frame}`);
        if (this.isDrawableImage(img)) {
          if (useProjectileGlow) ctx.filter = `drop-shadow(0 0 12px #ef4444) hue-rotate(320deg)`; // Red/Orange tint for fire
          const size = proj.type === 'meteor' ? proj.radius * 2 : 56;
          ctx.drawImage(img, -size/2, -size/2, size, size);
          ctx.filter = 'none';
        }
      } else if (proj.type === 'dark_skull') {
        const img = sprites.getImage(`sanju_blood_${frame}`);
        if (this.isDrawableImage(img)) {
          if (useProjectileGlow) ctx.filter = `drop-shadow(0 0 12px #7e22ce) hue-rotate(260deg)`; // Dark purple/blood tint
          ctx.drawImage(img, -32, -32, 64, 64);
          ctx.filter = 'none';
        }
      } else if (proj.type === 'ice_shard') {
        const img = sprites.getImage(`sanju_water_${frame}`);
        if (this.isDrawableImage(img)) {
          if (useProjectileGlow) ctx.filter = `drop-shadow(0 0 10px #38bdf8)`; // Cyan glow for ice
          ctx.drawImage(img, -28, -28, 56, 56);
          ctx.filter = 'none';
        }
      } else if (proj.type === 'lightning_orb' || proj.type === 'energy_ball') {
        const img = sprites.getImage(`sanju_pure_${frame}`);
        if (this.isDrawableImage(img)) {
          if (useProjectileGlow) ctx.filter = `drop-shadow(0 0 12px #3b82f6) hue-rotate(200deg)`; // Blue tint for lightning/energy
          ctx.drawImage(img, -32, -32, 64, 64);
          ctx.filter = 'none';
        }
      } else {
        // Fallback for anything else
        const img = sprites.getImage(`sanju_pure_${frame}`);
        if (this.isDrawableImage(img)) {
          ctx.drawImage(img, -24, -24, 48, 48);
        }
      }

      ctx.restore();
    }

    // 14. Draw Floating Combat Text
    this.floatingTexts.forEach(ft => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.font = `${ft.isCrit ? '900' : '700'} ${ft.fontSize}px 'Outfit', 'Cinzel', sans-serif`;
      ctx.textAlign = 'center';

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = ft.isCrit ? 4 : 3;
      ctx.strokeText(ft.text, ft.x, ft.y);

      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });

    ctx.restore();
  }

  /**
   * Full-screen flashes live outside the camera/world transform. The old
   * 2000x1200 world-space rectangle was both camera-dependent and needlessly
   * expensive after zoom and DPR scaling during an ultimate.
   */
  public drawScreenOverlays(ctx: CanvasRenderingContext2D, width: number, height: number) {
    if (this.screenFlashes.length === 0 || width <= 0 || height <= 0) return;
    ctx.save();
    for (const flash of this.screenFlashes) {
      ctx.globalAlpha = Math.min(0.4, Math.max(0, flash.alpha));
      ctx.fillStyle = flash.color;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }
}
