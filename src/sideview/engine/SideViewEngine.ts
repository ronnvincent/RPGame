/**
 * Core 2D Side-View Action Physics & Combat Engine
 * Implements dedicated mechanics, real Shadow Clones, Summoned Skeletons, Traps,
 * Persistent Elemental Zones, Omnislash, Chain Lightning, and 60 Unique Skills.
 */

import { CharacterClass, SkillDefinition } from '../classes/ClassDefinitions';
import { BattleTheme, EnemyInstance } from '../dungeons/DungeonManager';
import { ItemData } from '../items/ItemDatabase';
import { ParticleSystem } from './ParticleSystem';
import { audio } from './AudioManager';
import { sprites } from './SpriteManager';
import { quests } from '../quests/QuestManager';
import { TownHub } from '../town/TownHub';

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
  // Active Buffs
  activeBuffs: {
    stat: string;
    multiplier: number;
    timer: number;
  }[];
  // Skill Cooldowns
  skillCooldowns: { [skillId: string]: number };
  equipment: PlayerEquipment;
  inventory: ItemData[];
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

export class SideViewEngine {
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
  public townHub: TownHub | null = null;
  public readonly portalX: number = 2560;
  public isPlayerNearPortal: boolean = false;
  public hitStopTimer: number = 0;
  public battleTheme: BattleTheme = 'catacombs';
  private readonly cameraFollowSpeed = 10;
  private readonly cameraLookAheadPx = 140;
  private readonly cameraLeadRecoverySpeed = 12;
  private cameraLeadOffset = 0;
  private readonly physicsFrameScale = 60;
  private playerRunBob = 0;
  public recentCorpsePositions: { x: number; y: number }[] = [];

  constructor(characterClass: CharacterClass) {
    this.particles = new ParticleSystem();
    this.player = this.createInitialPlayer(characterClass);
    this.recomputeStats();
    this.buildMapPlatforms(this.battleTheme);
  }

  public recalculateStats() {
    this.recomputeStats();
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
      gold: 50,
      x: 240,
      y: this.groundY,
      vx: 0,
      vy: 0,
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

    // Equipment bonuses
    Object.values(p.equipment).forEach((item?: ItemData) => {
      if (item && item.stats) {
        if (item.stats.hp) bonusHp += item.stats.hp;
        if (item.stats.mp) bonusMp += item.stats.mp;
        if (item.stats.atk) bonusAtk += item.stats.atk;
        if (item.stats.def) bonusDef += item.stats.def;
        if (item.stats.crit) bonusCrit += item.stats.crit;
        if (item.stats.speed) bonusSpeed += item.stats.speed;
      }
    });

    // Level scaling (+8% per level)
    const lvlMultiplier = 1 + (p.level - 1) * 0.08;
    p.maxHp = Math.round((p.characterClass.stats.maxHp + bonusHp) * lvlMultiplier);
    p.maxMp = Math.round((p.characterClass.stats.maxMp + bonusMp) * lvlMultiplier);
    
    let atk = (p.baseAtk + bonusAtk) * lvlMultiplier;
    let def = (p.baseDef + bonusDef) * lvlMultiplier;
    let spd = p.baseSpeed + bonusSpeed;
    let crit = p.baseCrit + bonusCrit;

    // Active Buffs
    p.activeBuffs.forEach(buff => {
      if (buff.stat === 'atk') atk *= buff.multiplier;
      if (buff.stat === 'def') def *= buff.multiplier;
      if (buff.stat === 'speed') spd *= buff.multiplier;
      if (buff.stat === 'crit') crit *= buff.multiplier;
    });

    p.totalAtk = Math.round(atk);
    p.totalDef = Math.round(def);
    p.totalSpeed = Number(spd.toFixed(1));
    p.totalCrit = Number(crit.toFixed(2));
  }

  public setBattleTheme(theme: BattleTheme) {
    this.battleTheme = theme;
    this.buildMapPlatforms(theme);
  }

  public buildMapPlatforms(theme: BattleTheme) {
    this.platforms = [];
    const gy = this.groundY;

    if (this.isTownMode) {
      // Haven of Eldermoor Platforms (village lookout terraces, bridges)
      this.platforms.push(
        { x: 300, y: gy - 110, width: 260, height: 16, type: 'one-way' },
        { x: 750, y: gy - 130, width: 320, height: 16, type: 'one-way' },
        { x: 1250, y: gy - 110, width: 280, height: 16, type: 'one-way' },
        { x: 1750, y: gy - 140, width: 340, height: 16, type: 'one-way' },
        { x: 2300, y: gy - 120, width: 300, height: 16, type: 'one-way' }
      );
    } else if (theme === 'catacombs') {
      // Goblin Catacombs Platforms (multi-tier stone ledges)
      this.platforms.push(
        { x: 240, y: gy - 115, width: 280, height: 16, type: 'one-way' },
        { x: 600, y: gy - 205, width: 240, height: 16, type: 'one-way' },
        { x: 920, y: gy - 115, width: 320, height: 16, type: 'one-way' },
        { x: 1380, y: gy - 195, width: 260, height: 16, type: 'one-way' },
        { x: 1750, y: gy - 120, width: 340, height: 16, type: 'one-way' },
        { x: 2200, y: gy - 210, width: 280, height: 16, type: 'one-way' },
        { x: 2600, y: gy - 125, width: 350, height: 16, type: 'one-way' },
        { x: 3050, y: gy - 200, width: 300, height: 16, type: 'one-way' }
      );
    } else if (theme === 'crypt') {
      // Crypt Mausoleum Platforms
      this.platforms.push(
        { x: 280, y: gy - 130, width: 300, height: 16, type: 'one-way' },
        { x: 700, y: gy - 220, width: 260, height: 16, type: 'one-way' },
        { x: 1100, y: gy - 135, width: 320, height: 16, type: 'one-way' },
        { x: 1550, y: gy - 230, width: 300, height: 16, type: 'one-way' },
        { x: 2000, y: gy - 130, width: 340, height: 16, type: 'one-way' },
        { x: 2450, y: gy - 225, width: 280, height: 16, type: 'one-way' },
        { x: 2850, y: gy - 135, width: 350, height: 16, type: 'one-way' }
      );
    } else if (theme === 'inferno') {
      // Inferno Dragon's Lair (Molten Crags & Floating Basalt Pillars)
      this.platforms.push(
        { x: 260, y: gy - 120, width: 280, height: 16, type: 'one-way' },
        { x: 620, y: gy - 215, width: 260, height: 16, type: 'one-way' },
        { x: 1000, y: gy - 130, width: 350, height: 16, type: 'one-way' },
        { x: 1450, y: gy - 225, width: 300, height: 16, type: 'one-way' },
        { x: 1900, y: gy - 125, width: 320, height: 16, type: 'one-way' },
        { x: 2350, y: gy - 220, width: 290, height: 16, type: 'one-way' },
        { x: 2750, y: gy - 135, width: 360, height: 16, type: 'one-way' }
      );
    } else {
      // Void Nexus (Void Monoliths)
      this.platforms.push(
        { x: 300, y: gy - 135, width: 300, height: 16, type: 'one-way' },
        { x: 720, y: gy - 235, width: 280, height: 16, type: 'one-way' },
        { x: 1150, y: gy - 140, width: 340, height: 16, type: 'one-way' },
        { x: 1600, y: gy - 240, width: 300, height: 16, type: 'one-way' },
        { x: 2050, y: gy - 135, width: 350, height: 16, type: 'one-way' },
        { x: 2500, y: gy - 235, width: 280, height: 16, type: 'one-way' },
        { x: 2900, y: gy - 140, width: 360, height: 16, type: 'one-way' }
      );
    }
  }

  // --- PLAYER ACTIONS ---

  public movePlayer(direction: number) {
    if (this.player.isDashing) return;
    this.player.vx = direction * this.player.totalSpeed;
    if (direction !== 0) {
      this.player.facing = direction > 0 ? 1 : -1;
    }
  }

  public jumpPlayer(holdingDown: boolean = false) {
    const p = this.player;

    // Drop through one-way platforms when holding Down + Jump
    if (holdingDown && p.y < this.groundY - 10) {
      p.dropThroughTimer = 0.35;
      p.vy = 3.5;
      p.isGrounded = false;
      audio.playJump();
      this.particles.addImpactBurst(p.x, p.y, 8, '#94a3b8', 'smoke');
      return;
    }

    if (p.isGrounded) {
      p.vy = -p.characterClass.stats.jumpPower;
      p.isGrounded = false;
      p.hasJumpedOnce = true;
      audio.playJump();
      this.particles.addImpactBurst(p.x, p.y + p.height / 2, 8, '#cfd8dc', 'smoke');
    } else if (p.hasJumpedOnce && (p.equipment.wings || p.characterClass.id === 'ninja' || p.characterClass.id === 'dragoon')) {
      // Double jump
      p.vy = -p.characterClass.stats.jumpPower * 0.9;
      p.hasJumpedOnce = false;
      audio.playJump();
      this.particles.addImpactBurst(p.x, p.y, 12, '#90caf9', 'spark');
    }
  }

  public dashPlayer() {
    const p = this.player;
    if (p.dashTimer > 0 || p.isDashing || (p.dashCooldown || 0) > 0) return;
    p.isDashing = true;
    p.dashTimer = 0.25;
    p.dashCooldown = 2.5;
    p.iframeTimer = 0.35;
    p.vx = p.facing * (p.totalSpeed * 2.6);
    audio.playDash();
    this.particles.addImpactBurst(p.x, p.y, 10, p.characterClass.themeColor, 'trail');
    this.particles.addGhostTrail(p.x, p.y, p.facing, p.characterClass.id, 'run', 0, p.characterClass.accentColor);
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
      archer: ['lightning_shot', 'lightning_shot', 'poison_shot', 'fire_shot', 'buff', 'dark_wave'],
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
   * Cast one of the 6 specialized skills
   */
  public castSkill(skillIndex: number) {
    const p = this.player;
    const skill: SkillDefinition = p.characterClass.skills[skillIndex];
    if (!skill) return;

    // Prevent attack spam (Anti-Spam / GCD)
    if (p.attackTimer > 0) {
      return;
    }

    // Check cooldown
    if ((p.skillCooldowns[skill.id] || 0) > 0) {
      this.particles.addFloatingText(p.x, p.y - 20, 'On Cooldown!', '#ef5350', false, 14);
      return;
    }

    // Set cooldown
    p.skillCooldowns[skill.id] = skill.cooldown;
    p.attackTimer = skill.cooldown === 0 ? 0.22 : 0.45;
    p.animState = 'attack';

    // Play SFX
    this.playSkillCastSfx(skill);

    // Apply Self Buff if skill provides one
    if (skill.buff) {
      p.activeBuffs.push({
        stat: skill.buff.stat,
        multiplier: skill.buff.multiplier,
        timer: skill.buff.duration
      });
      this.recomputeStats();
      this.particles.addHolyPillar(p.x, p.y);
      this.particles.addFloatingText(p.x, p.y - 30, `BUFF +${Math.round((skill.buff.multiplier - 1) * 100)}% ${skill.buff.stat.toUpperCase()}`, '#ffee58', true, 16);
    }

    const attackX = p.x + (p.facing * (skill.range * 0.6));
    const attackY = p.y;
    const isCrit = Math.random() < p.totalCrit;
    const damage = this.calculateDamage(skill);

    // Mid-air Plunging Dive Attack for Basic Attack (Skill 0)
    if (skillIndex === 0 && !p.isGrounded) {
      p.vy = 14;
      p.attackTimer = 0.4;
      p.animState = 'attack';
      this.particles.addSpellSlash(p.x, p.y + 10, p.facing, 1.8, '#ffd700');
      this.particles.addImpactBurst(p.x, p.y, 14, '#ff9800', 'spark');
      return;
    }

    // 3-Hit Ground Attack Combo String for Basic Attack (Skill 0)
    if (skillIndex === 0) {
      const step = p.comboStep || 0;
      p.comboResetTimer = 0.75;

      if (step === 0) {
        // Step 1: Swift horizontal slash
        p.comboStep = 1;
        p.attackTimer = 0.22;
        this.executeAreaDamage(attackX, attackY, skill, 1.0);
      } else if (step === 1) {
        // Step 2: Uppercut spin slash (lifts targets slightly)
        p.comboStep = 2;
        p.attackTimer = 0.25;
        this.particles.addSpellSlash(attackX, attackY - 20, p.facing, 1.6, p.characterClass.accentColor);
        this.executeAreaDamage(attackX, attackY, skill, 1.35);
      } else {
        // Step 3: Heavy ground smash finisher with screen shake
        p.comboStep = 0;
        p.attackTimer = 0.35;
        this.particles.triggerScreenShake(10, 0.3);
        this.particles.addGroundExplosion(attackX, this.groundY - 30, 1.7);
        this.particles.addImpactBurst(attackX, attackY, 20, '#ff9800', 'spark');
        this.executeAreaDamage(attackX, attackY, skill, 1.9);
      }
      return;
    }

    // ----------------------------------------------------
    // DEDICATED CLASS-SPECIFIC SKILL LOGIC
    // ----------------------------------------------------

    // 1. NINJA: REAL SHADOW CLONES, SUBSTITUTION, DRAGON BLADE & CINEMATIC OMNISLASH
    if (skill.id === 'ni_2') {
      this.particles.spawnShadowClones(p.x, p.y, p.facing, Math.round(damage * 0.8));
      this.executeAreaDamage(attackX, attackY, skill);
      return;
    }
    if (skill.id === 'ni_3') {
      this.particles.addImpactBurst(p.x, p.y - 15, 20, '#94a3b8', 'smoke');
      p.x = Math.max(60, Math.min(this.arenaWidth - 60, p.x + p.facing * 200));
      p.iframeTimer = 0.4;
      this.particles.addSpellSlash(p.x, p.y - 15, p.facing, 1.4, '#4ade80');
      this.executeAreaDamage(p.x, p.y, skill);
      return;
    }
    if (skill.id === 'ni_4') {
      this.particles.addFlameLash(p.x + p.facing * 50, p.y - 20, p.facing, 1.8);
      this.executeAreaDamage(p.x + p.facing * 70, p.y, skill);
      return;
    }
    if (skill.id === 'ni_6') {
      // 1. NINJA ULTIMATE: Cinematic Time-Freeze Omnislash
      const onScreenEnemies = this.enemies.filter(e => !e.isDead && Math.abs(e.x - p.x) < 550);
      const targets = onScreenEnemies.length > 0 ? onScreenEnemies.map(e => ({ x: e.x, y: e.y })) : [{ x: attackX, y: attackY }];
      this.particles.triggerCinematicOmnislash(targets);
      targets.forEach(t => {
        this.executeAreaDamage(t.x, t.y, skill);
      });
      return;
    }

    // 2. NECROMANCER: REAL SKELETON MINIONS, CORPSE EXPLOSION, GRIM REAPER DEATH NOVA
    if (skill.id === 'n_3') {
      this.particles.spawnSkeletonMinion(p.x + p.facing * 40, this.groundY, Math.round(damage * 0.9));
      this.particles.addFloatingText(p.x, p.y - 40, 'SUMMONED SKELETON!', '#c084fc', true, 16);
      return;
    }
    if (skill.id === 'n_5') {
      if (this.recentCorpsePositions.length > 0) {
        this.recentCorpsePositions.forEach(pos => {
          this.particles.addDarkPillar(pos.x, pos.y);
          this.particles.addGroundExplosion(pos.x, pos.y - 20, 1.6);
          this.executeAreaDamage(pos.x, pos.y, skill);
        });
        this.recentCorpsePositions = [];
      } else {
        this.particles.addDarkPillar(attackX, this.groundY);
        this.executeAreaDamage(attackX, attackY, skill);
      }
      return;
    }
    if (skill.id === 'n_6') {
      // 2. NECROMANCER ULTIMATE: Bringer of Death Companion
      this.particles.spawnReaperMinion(p.x + p.facing * 50, this.groundY, p.facing, Math.round(damage * 1.3));
      this.executeAreaDamage(attackX, attackY, skill);
      return;
    }

    // 3. ASSASSIN: FAN OF KNIVES, SMOKE BOMB, BACKSTAB RUSH, PHANTOM SHADOW TEMPEST
    if (skill.id === 'as_3') {
      p.stealthTimer = 4.0;
      p.iframeTimer = 0.5;
      this.particles.addDarkPillar(p.x, p.y);
      this.particles.addImpactBurst(p.x, p.y - 20, 25, '#7e22ce', 'smoke');
      return;
    }
    if (skill.id === 'as_4') {
      this.particles.addFanOfKnives(p.x, p.y, damage, p.totalCrit);
      return;
    }
    if (skill.id === 'as_5') {
      const closest = this.getClosestEnemy(350);
      if (closest) {
        this.particles.addImpactBurst(p.x, p.y - 15, 12, '#9333ea', 'smoke');
        p.x = closest.x + (closest.facing * -40);
        p.facing = closest.facing;
        this.particles.addSpellSlash(closest.x, closest.y - 15, p.facing, 1.8, '#ef4444');
        this.particles.addImpactBurst(closest.x, closest.y - 15, 20, '#ef4444', 'spark');
        this.applyDamageToEnemy(closest, Math.round(damage * 1.5), true, p.facing);
      } else {
        p.x += p.facing * 180;
        this.executeAreaDamage(p.x, p.y, skill);
      }
      return;
    }
    if (skill.id === 'as_6') {
      // 3. ASSASSIN ULTIMATE: Phantom Shadow Execution Tempest
      const onScreenEnemies = this.enemies.filter(e => !e.isDead && Math.abs(e.x - p.x) < 550);
      const targets = onScreenEnemies.length > 0 ? onScreenEnemies.map(e => ({ x: e.x, y: e.y })) : [{ x: attackX, y: attackY }];
      this.particles.triggerShadowTempest(targets, p.x, p.y);
      targets.forEach(t => {
        this.executeAreaDamage(t.x, t.y, skill);
      });
      return;
    }

    // 4. ARCHER: RAIN OF ARROWS, POISON TRAP, ASTRAL DRAGON PIERCER
    if (skill.id === 'ar_2') {
      this.particles.addImpactBurst(attackX, this.groundY - 10, 15, '#22c55e', 'spark');
      for (let i = 0; i < 12; i++) {
        setTimeout(() => {
          this.particles.addProjectile(
            attackX + (Math.random() * 160 - 80),
            60 + Math.random() * 40,
            (Math.random() - 0.5) * 2,
            15 + Math.random() * 5,
            'arrow',
            Math.round(damage * 0.35),
            isCrit,
            true,
            '#a3e635',
            10,
            false
          );
        }, i * 45);
      }
      return;
    }
    if (skill.id === 'ar_3') {
      this.particles.addGroundTrap(p.x + p.facing * 40, this.groundY, 'poison', damage);
      return;
    }
    if (skill.id === 'ar_6') {
      // 4. ARCHER ULTIMATE: Astral Dragon Piercer Hurricane
      this.particles.spawnAstralDragonPiercer(p.x, p.y, p.facing);
      this.executeAreaDamage(attackX, attackY, skill);
      return;
    }

    // 5. MAGE: CHAIN LIGHTNING, BLIZZARD, ARMAGEDDON METEOR STORM
    if (skill.id === 'm_3') {
      const nearby = this.getClosestEnemies(p.x, p.y, 4, 380);
      const points = [{ x: p.x, y: p.y - 20 }, ...nearby.map(e => ({ x: e.x, y: e.y - 15 }))];
      this.particles.addChainLightning(points);
      nearby.forEach(e => {
        this.applyDamageToEnemy(e, damage, isCrit, p.facing);
      });
      return;
    }
    if (skill.id === 'm_5') {
      this.particles.addGroundZone(attackX, this.groundY, 160, Math.round(damage * 0.2), 5.0, 'blizzard', '#60a5fa');
      return;
    }
    if (skill.id === 'm_6') {
      // 5. MAGE ULTIMATE: Armageddon Meteor Storm
      this.particles.spawnArmageddonMeteors(attackX, this.groundY, p.facing);
      this.executeAreaDamage(attackX, attackY, skill);
      return;
    }

    // 6. PALADIN: CONSECRATION, HAMMER OF THE GODS
    if (skill.id === 'p_4') {
      this.particles.addGroundZone(p.x, this.groundY, 140, Math.round(damage * 0.25), 6.0, 'holy_consecration', '#facc15');
      return;
    }
    if (skill.id === 'p_6') {
      // 6. PALADIN ULTIMATE: Hammer of the Gods Judgement
      this.particles.spawnHolyHammerJudgement(attackX, this.groundY);
      this.executeAreaDamage(attackX, attackY, skill);
      return;
    }

    // 7. DRAGOON: DRAGON DIVE, FLAME BREATH, ELDER DRAGON DESCENT
    if (skill.id === 'd_2') {
      p.vy = -13;
      setTimeout(() => {
        p.x = attackX;
        p.vy = 18;
        this.particles.triggerScreenShake(14, 0.5);
        this.particles.addGroundExplosion(attackX, this.groundY - 20, 1.8);
        this.executeAreaDamage(attackX, attackY, skill);
      }, 250);
      return;
    }
    if (skill.id === 'd_3') {
      this.particles.addFlameLash(p.x + p.facing * 50, p.y - 15, p.facing, 1.8);
      this.executeAreaDamage(p.x + p.facing * 60, p.y, skill);
      return;
    }
    if (skill.id === 'd_6') {
      // 7. DRAGOON ULTIMATE: Active Elder Dragon Companion & Flame Descent
      this.particles.spawnDragonDescent(p.x, p.y, p.facing);
      this.particles.spawnDragonMinion(p.x, this.groundY, p.facing, Math.round(damage * 0.85));
      this.executeAreaDamage(p.x + p.facing * 120, this.groundY, skill);
      return;
    }

    // 8. WARRIOR: WHIRLWIND, BLADE DASH, TITAN CATACLYSM EARTH SHATTER
    if (skill.id === 'w_2') {
      this.particles.addFireSpin(p.x, p.y - 20, 1.8);
      this.executeAreaDamage(p.x, p.y, skill);
      setTimeout(() => this.executeAreaDamage(p.x, p.y, skill), 150);
      setTimeout(() => this.executeAreaDamage(p.x, p.y, skill), 300);
      return;
    }
    if (skill.id === 'w_5') {
      p.x = Math.max(60, Math.min(this.arenaWidth - 60, p.x + p.facing * 220));
      this.particles.addSpellSlash(p.x, p.y - 15, p.facing, 1.8, '#ffffff');
      this.particles.addImpactBurst(p.x, p.y - 15, 15, '#e53935', 'trail');
      this.executeAreaDamage(p.x, p.y, skill);
      return;
    }
    if (skill.id === 'w_6') {
      // 8. WARRIOR ULTIMATE: Titan Cataclysm Earth Shatter
      p.vy = -9;
      this.particles.spawnTitanEarthShatter(p.x, this.groundY, p.facing);
      this.executeAreaDamage(attackX, attackY, skill);
      return;
    }

    // 9. BERSERKER: BLOOD TITAN RAMPAGE
    if (skill.id === 'b_6') {
      // 9. BERSERKER ULTIMATE: Blood Titan Rampage
      this.particles.spawnBloodTitanRampage(p.x, this.groundY, p.facing);
      this.executeAreaDamage(attackX, attackY, skill);
      return;
    }

    // 10. PRIEST: SANCTUARY WARD, CELESTIAL DIVINE RADIANCE
    if (skill.id === 'pr_4') {
      this.particles.addGroundZone(p.x, this.groundY, 150, 0, 7.0, 'sanctuary_ward', '#38bdf8');
      p.activeBuffs.push({ stat: 'def', multiplier: 2.0, timer: 7.0 });
      this.recomputeStats();
      return;
    }
    if (skill.id === 'pr_6') {
      // 10. PRIEST ULTIMATE: Celestial Divine Radiance Starlight
      this.particles.spawnCelestialDivineRadiance(p.x, this.groundY);
      this.executeAreaDamage(attackX, attackY, skill);
      return;
    }

    // Apply Direct Heal skills
    if (skill.vfx === 'heal') {
      const healAmount = Math.round(p.maxHp * 0.35 + p.totalAtk * 1.5);
      p.hp = Math.min(p.maxHp, p.hp + healAmount);
      this.particles.addFloatingText(p.x, p.y - 30, `+${healAmount} HP`, '#66bb6a', true, 20);
      this.particles.addHolyPillar(p.x, p.y);
      return;
    }

    // Fallback Projectile or Direct Area Hitbox
    if (skill.vfx === 'fireball' || skill.vfx === 'arrow_rain') {
      const isPiercing = skill.id === 'd_4';
      const projType = skill.vfx === 'fireball' ? 'fireball' : 'arrow';
      this.particles.addProjectile(
        p.x + (p.facing * 20),
        p.y - 10,
        p.facing * 12,
        0,
        projType,
        damage,
        isCrit,
        true,
        skill.damageType === 'fire' ? '#ff5722' : '#d7ccc8',
        skill.aoeRadius > 50 ? 18 : 12,
        isPiercing
      );
    } else {
      this.executeAreaDamage(attackX, attackY, skill);
    }
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

  private getClosestEnemies(x: number, y: number, count: number = 4, maxRange: number = 400): EnemyInstance[] {
    const alive = this.enemies.filter(e => !e.isDead && Math.hypot(e.x - x, e.y - y) < maxRange);
    alive.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    return alive.slice(0, count);
  }

  private calculateDamage(skill: SkillDefinition): number {
    const p = this.player;
    const base = p.totalAtk * skill.damageMultiplier;
    const variation = (Math.random() * 0.2 - 0.1) * base;
    return Math.max(1, Math.round(base + variation));
  }

  private executeAreaDamage(centerX: number, centerY: number, skill: SkillDefinition, multiplier: number = 1.0) {
    const p = this.player;
    const isCrit = Math.random() < p.totalCrit;
    let baseDmg = Math.round(this.calculateDamage(skill) * multiplier);
    if (isCrit) baseDmg = Math.round(baseDmg * 1.8);

    if (skill.isUltimate) {
      this.particles.triggerScreenShake(18, 0.65);
    }

    // Trigger unique sprite-based visual effects for each skill
    switch (skill.id) {
      // Warrior
      case 'w_1': this.particles.playVfxSprite(centerX, centerY - 15, 'warrior_vfx1', p.facing, 1.8); break;
      case 'w_2': this.particles.playVfxSprite(centerX, centerY - 20, 'warrior_vfx2', p.facing, 1.6); break;
      case 'w_3': this.particles.playVfxSprite(centerX, this.groundY - 40, 'warrior_vfx3', p.facing, 2.0); break;
      case 'w_4': this.particles.playVfxSprite(centerX, centerY - 20, 'warrior_vfx4', p.facing, 1.8); break;
      case 'w_5': this.particles.playVfxSprite(centerX, centerY - 15, 'warrior_vfx5', p.facing, 2.0); break;
      // Assassin
      case 'as_1': this.particles.playVfxSprite(centerX, centerY - 15, 'pipo_nazoobj01b', p.facing, 1.6); break;
      case 'as_2': this.particles.playVfxSprite(centerX, centerY - 15, 'vfx_phantom', p.facing, 1.5); break;
      case 'as_3': this.particles.playVfxSprite(centerX, centerY - 20, 'pipo_nazoobj03b', p.facing, 2.2); break;
      case 'as_4': this.particles.playVfxSprite(centerX, centerY - 15, 'pipo_mapeffect021', p.facing, 1.8); break;
      case 'as_5': this.particles.playVfxSprite(centerX, centerY - 15, 'pipo_nazoobj03c', p.facing, 1.8); break;
      // Mage
      case 'm_1': this.particles.playVfxSprite(centerX, centerY - 15, 'pipo_mapeffect024', p.facing, 1.6); break;
      case 'm_2': this.particles.playVfxSprite(centerX, centerY - 10, 'vfx_freezing', p.facing, 2.2); break;
      case 'm_3': this.particles.playVfxSprite(centerX, centerY - 45, 'mp9_lightning', p.facing, 2.0); break;
      case 'm_4': this.particles.playVfxSprite(centerX, centerY - 30, 'pipo_nazoobj01a', p.facing, 2.0); break;
      case 'm_5': this.particles.playVfxSprite(centerX, centerY - 40, 'fx_ice_burst', p.facing, 2.4); break;
      // Archer
      case 'ar_1': this.particles.playVfxSprite(centerX, centerY - 15, 'pipo_nazoobj01c', p.facing, 1.5); break;
      case 'ar_2': this.particles.playVfxSprite(centerX, centerY - 15, 'pipo_nazoobj02b', p.facing, 1.8); break;
      case 'ar_3': this.particles.playVfxSprite(centerX, centerY - 20, 'pipo_nazoobj02c', p.facing, 1.6); break;
      case 'ar_4': this.particles.playVfxSprite(centerX, centerY - 15, 'vfx_bolt', p.facing, 1.5); break;
      case 'ar_5': this.particles.playVfxSprite(centerX, centerY - 20, 'pipo_mapeffect022', p.facing, 2.0); break;
      // Paladin
      case 'p_1': this.particles.playVfxSprite(centerX, centerY - 15, 'pipo_nazoobj04a', p.facing, 1.7); break;
      case 'p_2': this.particles.playVfxSprite(centerX, centerY - 20, 'pipo_nazoobj04c', p.facing, 2.0); break;
      case 'p_3': this.particles.playVfxSprite(centerX, centerY - 30, 'pipo_nazoobj03a', p.facing, 2.0); break;
      case 'p_4': this.particles.playVfxSprite(centerX, centerY - 20, 'mp9_spark', p.facing, 1.8); break;
      case 'p_5': this.particles.playVfxSprite(centerX, centerY - 25, 'holy_spell_01', p.facing, 2.2); break;
      // Necromancer
      case 'n_1': this.particles.playVfxSprite(centerX, centerY - 15, 'mp9_darkbolt', p.facing, 1.8); break;
      case 'n_2': this.particles.playVfxSprite(centerX, centerY - 20, 'pipo_nazoobj02c', p.facing, 1.8); break;
      case 'n_4': this.particles.playVfxSprite(centerX, centerY - 25, 'pipo_nazoobj04b', p.facing, 2.0); break;
      case 'n_5': this.particles.playVfxSprite(centerX, centerY - 15, 'pipo_nazoobj03c', p.facing, 2.2); break;
      // Berserker
      case 'b_1': this.particles.playVfxSprite(centerX, centerY - 15, 'fx_hit_slash', p.facing, 2.0); break;
      case 'b_2': this.particles.playVfxSprite(centerX, centerY - 20, 'pipo_mapeffect025', p.facing, 2.2); break;
      case 'b_3': this.particles.playVfxSprite(centerX, centerY - 15, 'pipo_nazoobj01a', p.facing, 2.2); break;
      case 'b_4': this.particles.playVfxSprite(centerX, centerY - 20, 'pipo_nazoobj01b', p.facing, 2.0); break;
      case 'b_5': this.particles.playVfxSprite(centerX, this.groundY - 30, 'mp9_firebomb', p.facing, 2.4); break;
      // Dragoon
      case 'd_1': this.particles.playVfxSprite(centerX, centerY - 15, 'pipo_nazoobj03b', p.facing, 1.8); break;
      case 'd_2': this.particles.playVfxSprite(centerX, centerY - 15, 'fx_energy_impact', p.facing, 2.0); break;
      case 'd_4': this.particles.playVfxSprite(centerX, centerY - 20, 'vfx_flamelash', p.facing, 1.8); break;
      case 'd_5': this.particles.playVfxSprite(centerX, centerY - 20, 'pipo_mapeffect023', p.facing, 2.0); break;
      // Priest
      case 'pr_1': this.particles.playVfxSprite(centerX, centerY - 15, 'holy_spell_00', p.facing, 1.5); break;
      case 'pr_2': this.particles.playVfxSprite(centerX, centerY - 20, 'pipo_nazoobj02a', p.facing, 2.0); break;
      case 'pr_3': this.particles.playVfxSprite(centerX, centerY - 20, 'pipo_nazoobj05c', p.facing, 2.2); break;
      case 'pr_4': this.particles.playVfxSprite(centerX, centerY - 20, 'vfx_magicspell', p.facing, 1.8); break;
      case 'pr_5': this.particles.playVfxSprite(centerX, centerY - 30, 'holy_spell_01', p.facing, 2.5); break;
      // Nightborne
      case 'ni_1': this.particles.playVfxSprite(centerX, centerY - 15, 'pipo_nazoobj04a', p.facing, 1.8); break;
      case 'ni_3': this.particles.playVfxSprite(centerX, centerY - 20, 'pipo_nazoobj04c', p.facing, 2.0); break;
      case 'ni_4': this.particles.playVfxSprite(centerX, centerY - 15, 'pipo_nazoobj05a', p.facing, 2.2); break;
      case 'ni_5': this.particles.playVfxSprite(centerX, centerY - 20, 'pipo_nazoobj05b', p.facing, 2.5); break;
      // Fallback
      default:
        this.particles.playVfxSprite(centerX, centerY - 15, 'vfx_magicspell', p.facing, 1.5);
        break;
    }

    let hitAny = false;
    this.enemies.forEach(enemy => {
      if (enemy.isDead) return;
      const dist = Math.hypot(enemy.x - centerX, enemy.y - centerY);
      if (dist <= skill.aoeRadius + enemy.width / 2) {
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

  public applyDamageToEnemy(enemy: EnemyInstance, rawDamage: number, isCrit: boolean, knockbackDir: number) {
    const defenseReduction = enemy.def * 0.6;
    const finalDamage = Math.max(1, Math.round(rawDamage - defenseReduction));

    enemy.hp -= finalDamage;
    enemy.hitStun = 0.25;
    enemy.vx = knockbackDir * 3.5;
    enemy.vy = -2.5;

    // Hit-stop micro freeze and crunchy screen shake on impact
    this.hitStopTimer = isCrit ? 0.07 : 0.04;
    this.particles.triggerScreenShake(isCrit ? 10 : 4, 0.2);

    audio.playHit(isCrit);
    this.particles.addFloatingText(enemy.x, enemy.y - enemy.height / 2, `${finalDamage}`, isCrit ? '#ffd54f' : '#ffffff', isCrit);
    this.particles.addImpactBurst(enemy.x, enemy.y, isCrit ? 18 : 8, '#e53935', 'spark');

    // Custom Hit VFX for Warrior
    if (this.player && this.player.characterClass.id === 'warrior') {
      this.particles.playVfxSprite(enemy.x, enemy.y, 'warrior_vfx1', 1, 1.2);
    }

    if (enemy.hp <= 0 && !enemy.isDead) {
      this.onEnemyDefeated(enemy);
    }
  }

  private onEnemyDefeated(enemy: EnemyInstance) {
    enemy.isDead = true;
    enemy.hp = 0;

    // Trigger quest kill tracker
    quests.onEnemyKilled(enemy.name, enemy.type === 'boss');

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

    // Death VFX & SFX
    if (enemy.type === 'boss') {
      audio.playBossRoar();
      this.particles.triggerScreenShake(14, 0.6);
      this.particles.addHolyPillar(enemy.x, enemy.y);
      this.particles.addFloatingText(enemy.x, enemy.y - 50, 'BOSS DEFEATED!', '#ffd54f', true, 26);
    } else {
      this.particles.addImpactBurst(enemy.x, enemy.y, 20, enemy.color, 'smoke');
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
      bobTimer: Math.random() * Math.PI * 2
    });
  }

  public addExp(amount: number) {
    const p = this.player;
    p.exp += amount;
    this.particles.addFloatingText(p.x, p.y - 45, `+${amount} EXP`, '#42a5f5', false, 15);

    while (p.exp >= p.maxExp) {
      p.exp -= p.maxExp;
      p.level++;
      p.maxExp = Math.round(p.maxExp * 1.5);
      this.recomputeStats();
      p.hp = p.maxHp;
      p.mp = p.maxMp;

      audio.playLevelUp();
      this.particles.addHolyPillar(p.x, this.groundY);
      this.particles.addFloatingText(p.x, p.y - 60, '★ LEVEL UP! ★', '#ffd700', true, 24);
      this.particles.addImpactBurst(p.x, p.y, 40, '#ffd700', 'spark');
    }
  }

  public update(dt: number) {
    // 0. Hit-Stop Micro Freeze check (Crunchy combat impact feeling)
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      this.particles.update(dt);
      return;
    }

    const p = this.player;
    const dtFrame = dt * this.physicsFrameScale;

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

    // 3. Passive Natural Mana & HP Regeneration
    p.mp = Math.min(p.maxMp, p.mp + (p.maxMp * 0.05) * dt);
    p.hp = Math.min(p.maxHp, p.hp + (p.maxHp * 0.01) * dt);

    // 4. Update Animation State
    if (p.hp <= 0) {
      p.animState = 'dead';
    } else if (p.attackTimer > 0) {
      p.attackTimer -= dt;
      p.animState = 'attack';
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
      for (const plat of this.platforms) {
        if (p.x >= plat.x - 12 && p.x <= plat.x + plat.width + 12) {
          const prevY = p.y - p.vy * dtFrame;
          if (prevY <= plat.y + 4 && p.y >= plat.y) {
            p.y = plat.y;
            p.vy = 0;
            p.isGrounded = true;
            p.hasJumpedOnce = false;
            landedOnPlatform = true;

            // Plunging dive attack landing impact explosion
            if (p.attackTimer > 0 && p.animState === 'attack') {
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
        p.y = this.groundY;
        p.vy = 0;
        p.isGrounded = true;
        p.hasJumpedOnce = false;

        // Plunging dive attack landing impact explosion on floor
        if (p.attackTimer > 0 && p.animState === 'attack' && p.vy > 8) {
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
    this.particles.update(dt);
    this.checkProjectileCollisions();
    this.checkSpecialSkillEntities(dt);
  }

  private checkSpecialSkillEntities(dt: number) {
    // A. Update Summoned Minions (Skeletons & Active Elder Dragon Companion)
    this.particles.summonedMinions.forEach(minion => {
      let targetEnemy: EnemyInstance | null = null;
      let minDist = minion.type === 'dragon' ? 600 : 400;

      this.enemies.forEach(e => {
        if (e.isDead) return;
        const d = Math.abs(e.x - minion.x);
        if (d < minDist) {
          minDist = d;
          targetEnemy = e;
        }
      });

      if (minion.type === 'skeleton') {
        if (targetEnemy) {
          const dx = (targetEnemy as EnemyInstance).x - minion.x;
          minion.facing = dx > 0 ? 1 : -1;
          if (Math.abs(dx) > 40) {
            minion.state = 'walk';
            minion.x += minion.facing * 2.2;
          } else {
            // Attack!
            if (minion.attackCooldown <= 0) {
              minion.state = 'attack';
              minion.attackCooldown = 1.0;
              this.particles.addSpellSlash((targetEnemy as EnemyInstance).x, (targetEnemy as EnemyInstance).y - 15, minion.facing, 1.2, '#a855f7');
              this.applyDamageToEnemy(targetEnemy, minion.damage, false, minion.facing);
            } else {
              minion.state = 'idle';
            }
          }
        } else {
          minion.state = 'idle';
        }
      } else if (minion.type === 'dragon') {
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
              this.particles.addFloatingText(minion.x, this.groundY - 180, '☄ MAGMA METEOR BARRAGE!', '#ff5722', true, 16);

              for (let m = 0; m < 3; m++) {
                setTimeout(() => {
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
              this.particles.addFloatingText(minion.x, this.groundY - 180, '🌪 DRAGON TEMPEST!', '#f97316', true, 16);
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
            minion.x += minion.facing * 3.3;
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
          const followX = this.player.x - this.player.facing * 80;
          const distToPlayer = followX - minion.x;
          if (Math.abs(distToPlayer) > 35) {
            minion.facing = distToPlayer > 0 ? 1 : -1;
            minion.x += minion.facing * 2.8;
            minion.state = 'walk';
          } else {
            minion.facing = this.player.facing;
            minion.state = 'idle';
          }
        }
      } else if (minion.type === 'reaper') {
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
              this.particles.addFloatingText(minion.x, this.groundY - 150, '🔮 VOID SINGULARITY!', '#a855f7', true, 16);

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
              this.particles.addFloatingText(minion.x, this.groundY - 150, '💀 DEATH NOVA!', '#9333ea', true, 16);

              for (let s = 0; s < 3; s++) {
                setTimeout(() => {
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
            minion.x += minion.facing * 2.9;
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
          const followX = this.player.x - this.player.facing * 60;
          const distToPlayer = followX - minion.x;
          if (Math.abs(distToPlayer) > 30) {
            minion.facing = distToPlayer > 0 ? 1 : -1;
            minion.x += minion.facing * 2.5;
            minion.state = 'walk';
          } else {
            minion.facing = this.player.facing;
            minion.state = 'idle';
          }
        }
      } else if (minion.type === 'nightborne') {
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
            this.particles.addFloatingText(minion.x, this.groundY - 120, '🔮 VOID TEMPEST!', '#a855f7', true, 16);

            const blastX = minion.x + minion.facing * 100;
            this.particles.addVoidVortex(blastX, this.groundY - 20, 2.4);
            this.particles.addDarkPillar(blastX, this.groundY);

            for (let k = 0; k < 3; k++) {
              setTimeout(() => {
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
          const followX = this.player.x - this.player.facing * 60;
          const distToPlayer = followX - minion.x;
          if (Math.abs(distToPlayer) > 30) {
            minion.facing = distToPlayer > 0 ? 1 : -1;
            minion.x += minion.facing * 2.8;
            minion.state = 'walk';
          } else {
            minion.facing = this.player.facing;
            minion.state = 'idle';
          }
        }
      }
    });

    // B. Check Ground Traps Collision with Enemies
    this.particles.groundTraps.forEach(trap => {
      if (trap.isTriggered) return;
      for (const enemy of this.enemies) {
        if (enemy.isDead) continue;
        const dist = Math.hypot(enemy.x - trap.x, enemy.y - trap.y);
        if (dist < trap.radius + enemy.width / 2) {
          trap.isTriggered = true;
          this.applyDamageToEnemy(enemy, trap.damage, true, 0);
          if (trap.trapType === 'poison') {
            this.particles.addGroundZone(trap.x, this.groundY, 90, Math.round(trap.damage * 0.3), 5.0, 'poison_cloud', '#22c55e');
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
      if (zone.tickTimer >= 0.5) {
        zone.tickTimer = 0;
        this.enemies.forEach(enemy => {
          if (enemy.isDead) return;
          const dist = Math.hypot(enemy.x - zone.x, enemy.y - zone.y);
          if (dist < zone.radius + enemy.width / 2) {
            if (zone.damagePerTick > 0) {
              this.applyDamageToEnemy(enemy, zone.damagePerTick, false, 0);
            }
          }
        });
      }
    });
  }

  private updateEnemies(dt: number) {
    const p = this.player;
    const dtFrame = dt * this.physicsFrameScale;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy.isDead) {
        this.enemies.splice(i, 1);
        continue;
      }

      // Hit stun
      if (enemy.hitStun > 0) {
        enemy.hitStun -= dt;
      } else {
        // AI Tracking towards player (or minion)
        let targetX = p.x;
        if (p.stealthTimer > 0 && this.particles.summonedMinions.length > 0) {
          targetX = this.particles.summonedMinions[0].x;
        }

        const dx = targetX - enemy.x;
        const dist = Math.abs(dx);
        enemy.facing = dx > 0 ? 1 : -1;

        if (dist > enemy.attackRange) {
          enemy.vx = enemy.facing * enemy.speed;
        } else {
          enemy.vx = 0;
          // Attack player
          enemy.attackTimer -= dt;
          if (enemy.attackTimer <= 0) {
            enemy.attackTimer = enemy.attackCooldown;
            this.enemyAttackPlayer(enemy);
          }
        }
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
  }

  private enemyAttackPlayer(enemy: EnemyInstance) {
    const p = this.player;
    if (p.iframeTimer > 0 || p.stealthTimer > 0) return;

    const rawDamage = enemy.atk * (1 + (Math.random() * 0.2 - 0.1));
    const defReduction = p.totalDef * 0.5;
    const finalDamage = Math.max(1, Math.round(rawDamage - defReduction));

    p.hp = Math.max(0, p.hp - finalDamage);
    p.iframeTimer = 0.4;
    p.vx = enemy.facing * 4.0;
    p.vy = -2.0;

    audio.playHit(false);
    this.particles.triggerScreenShake(6, 0.2);
    this.particles.addFloatingText(p.x, p.y - p.height / 2, `-${finalDamage}`, '#ef5350', false, 18);
    this.particles.addImpactBurst(p.x, p.y, 8, '#d32f2f', 'spark');
  }

  private updateLoot(dt: number) {
    const p = this.player;
    const dtFrame = dt * this.physicsFrameScale;

    for (let i = this.droppedLoots.length - 1; i >= 0; i--) {
      const loot = this.droppedLoots[i];
      loot.bobTimer += dt * 3;

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
        audio.playLoot(loot.item.rarity);
        this.particles.addFloatingText(p.x, p.y - 25, `+ ${loot.item.name}`, loot.item.rarity === 'legendary' ? '#ff9800' : '#4fc3f7', true, 16);
        this.droppedLoots.splice(i, 1);
      }
    }
  }

  private checkProjectileCollisions() {
    for (let i = this.particles.projectiles.length - 1; i >= 0; i--) {
      const proj = this.particles.projectiles[i];

      if (proj.fromPlayer) {
        for (const enemy of this.enemies) {
          if (enemy.isDead) continue;
          const dist = Math.hypot(proj.x - enemy.x, proj.y - enemy.y);
          if (dist < proj.radius + enemy.width / 2) {
            if (proj.piercing) {
              const hitList = proj.hitEnemyIds || [];
              if (hitList.includes(enemy.id)) {
                continue;
              }
              proj.hitEnemyIds = hitList;
              hitList.push(enemy.id);
            }

            this.applyDamageToEnemy(enemy, proj.damage, proj.isCrit, proj.vx > 0 ? 1 : -1);
            if (!proj.piercing) {
              this.particles.projectiles.splice(i, 1);
              break;
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

    // Equipable items
    const slot = p.equipment[item.type];
    if (slot) {
      p.inventory.push(slot);
    }
    p.equipment[item.type] = item;
    this.recomputeStats();
    this.particles.addFloatingText(p.x, p.y - 24, `Equipped ${item.name}`, '#22c55e', true, 14);
    audio.playClick();
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

    const p = this.player;
    const shake = this.particles.getScreenShakeOffset();
    const camX = this.cameraX + shake.x;
    const camY = shake.y;

    ctx.save();
    ctx.scale(zoom, zoom);

    // 1. Draw Seamless Parallax Background & Deep Ground Tiles
    const currentTheme = this.isTownMode ? ('town' as BattleTheme) : this.battleTheme;
    sprites.drawEnvironment(ctx, camX, virtualWidth, virtualHeight, this.groundY, this.arenaWidth, currentTheme);

    ctx.save();
    ctx.translate(-camX, -camY);

    // 1.5 Draw Multi-Level Platforms
    sprites.drawPlatforms(ctx, this.platforms, currentTheme);

    // 2. Render Dropped Loot
    for (const loot of this.droppedLoots) {
      const bobY = loot.y + Math.sin(loot.bobTimer) * 4;
      const glowColor = loot.item.rarity === 'legendary' ? '#ff9800' : loot.item.rarity === 'epic' ? '#ab47bc' : '#29b6f6';

      // Shadow on ground
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(loot.x, loot.y + 10, 12, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Glow halo
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 12;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.beginPath();
      ctx.arc(loot.x, bobY, 16, 0, Math.PI * 2);
      ctx.fill();

      // Icon image
      if (loot.item.image) {
        const itemImg = new Image();
        itemImg.src = loot.item.image;
        if (itemImg.complete) {
          ctx.drawImage(itemImg, loot.x - 14, bobY - 14, 28, 28);
        }
      }
      ctx.restore();
    }

    // 3. Render Enemies or Town NPCs
    if (this.isTownMode && this.townHub) {
      this.renderTownEntities(ctx);
    } else {
      for (const enemy of this.enemies) {
        if (enemy.isDead) continue;
        
        // Draw Animated Mob Sprite
        sprites.drawMob(
          ctx,
          enemy.x,
          enemy.y,
          enemy.name,
          enemy.hitStun > 0 ? 'hit' : (Math.abs(enemy.vx) > 0.1 ? 'run' : 'idle'),
          enemy.facing,
          enemy.type === 'boss',
          enemy.hitStun
        );

        // Telegraphed Attack Warning Glint above charging enemies
        if (enemy.attackTimer <= 0.4 && enemy.attackTimer > 0) {
          ctx.save();
          ctx.font = 'bold 16px "Cinzel", sans-serif';
          ctx.fillStyle = '#ef4444';
          ctx.shadowColor = '#dc2626';
          ctx.shadowBlur = 10;
          ctx.textAlign = 'center';
          ctx.fillText('⚠ !', enemy.x, enemy.y - enemy.height - 12);
          ctx.restore();
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
      p.characterClass.themeColor
    );

    ctx.restore();

    // 5. Render Particle System (VFX, Projectiles, Minions, Clones, Zones, Floating Text)
    this.particles.draw(ctx);

    ctx.restore();
    ctx.restore();
  }

  /**
   * Render Town NPCs, Buildings, Dimensional Gateway Arch, and Quest Badges
   */
  private renderTownEntities(ctx: CanvasRenderingContext2D) {
    if (!this.townHub) return;
    const now = Date.now() / 1000;
    const activeNpc = this.townHub.getActiveNpc();

    // 1. Draw Authentic GothicVania Town Buildings, Cathedral & Street Props
    const gvChurch = (sprites as any).getImage('gv_church');
    const gvHouseA = (sprites as any).getImage('gv_house_a');
    const gvHouseB = (sprites as any).getImage('gv_house_b');
    const gvHouseC = (sprites as any).getImage('gv_house_c');
    const gvWell = (sprites as any).getImage('gv_well');
    const gvWagon = (sprites as any).getImage('gv_wagon');
    const gvLamp = (sprites as any).getImage('gv_street_lamp');
    const gvCrateStack = (sprites as any).getImage('gv_crate_stack');
    const gvCrate = (sprites as any).getImage('gv_crate');
    const gvBarrel = (sprites as any).getImage('gv_barrel');
    const gvSign = (sprites as any).getImage('gv_sign');

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // A. Town Notice Sign at Entrance
    if (gvSign && gvSign.complete) {
      ctx.drawImage(gvSign, 280, this.groundY - 45, 37, 45);
    }

    // B. House A near Elder Justinian (x = 380)
    if (gvHouseA && gvHouseA.complete) {
      ctx.drawImage(gvHouseA, 360, this.groundY - 183, 168, 183);
    }
    if (gvCrateStack && gvCrateStack.complete) {
      ctx.drawImage(gvCrateStack, 330, this.groundY - 68, 73, 68);
    }

    // C. House B near Captain Valerie (x = 880)
    if (gvHouseB && gvHouseB.complete) {
      ctx.drawImage(gvHouseB, 840, this.groundY - 244, 210, 244);
    }
    if (gvBarrel && gvBarrel.complete) {
      ctx.drawImage(gvBarrel, 1050, this.groundY - 30, 24, 30);
      ctx.drawImage(gvBarrel, 1070, this.groundY - 30, 24, 30);
    }

    // D. Village Well between Valerie and Keith (x = 1200)
    if (gvWell && gvWell.complete) {
      ctx.drawImage(gvWell, 1180, this.groundY - 65, 65, 65);
    }

    // E. House C near Blacksmith Keith (x = 1380)
    if (gvHouseC && gvHouseC.complete) {
      ctx.drawImage(gvHouseC, 1340, this.groundY - 183, 221, 183);
    }
    if (gvCrate && gvCrate.complete) {
      ctx.drawImage(gvCrate, 1570, this.groundY - 35, 39, 35);
    }

    // F. Merchant Horse Wagon between Keith and Morwenna (x = 1720)
    if (gvWagon && gvWagon.complete) {
      ctx.drawImage(gvWagon, 1680, this.groundY - 75, 93, 75);
    }

    // G. House A near Alchemist Morwenna (x = 1880)
    if (gvHouseA && gvHouseA.complete) {
      ctx.drawImage(gvHouseA, 1860, this.groundY - 183, 168, 183);
    }
    if (gvBarrel && gvBarrel.complete) {
      ctx.drawImage(gvBarrel, 2040, this.groundY - 30, 24, 30);
    }

    // H. Grand Gothic Cathedral / Church behind the Dimensional Gateway (x = 2360)
    if (gvChurch && gvChurch.complete) {
      const churchW = gvChurch.naturalWidth || 320;
      const churchH = gvChurch.naturalHeight || 240;
      ctx.drawImage(gvChurch, 2320, this.groundY - churchH, churchW, churchH);
    }

    // I. Victorian Street Lamps with Warm Amber Illumination
    const lampPositions = [180, 640, 1120, 1620, 2140, 2720];
    lampPositions.forEach((lx) => {
      if (gvLamp && gvLamp.complete) {
        ctx.drawImage(gvLamp, lx - 17, this.groundY - 108, 35, 108);
      }
      // Glowing Lantern Light Halo
      const lampGlow = ctx.createRadialGradient(lx, this.groundY - 88, 5, lx, this.groundY - 88, 55 + Math.sin(now * 6 + lx) * 4);
      lampGlow.addColorStop(0, 'rgba(254, 240, 138, 0.7)');
      lampGlow.addColorStop(0.4, 'rgba(245, 158, 11, 0.25)');
      lampGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = lampGlow;
      ctx.beginPath();
      ctx.arc(lx, this.groundY - 88, 60, 0, Math.PI * 2);
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
