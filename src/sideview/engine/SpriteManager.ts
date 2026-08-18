/**
 * Complete Sprite, Character & Animation Asset Manager
 * Integrates 100% Unique Dedicated Sprite Models for All 10 Classes, Monsters & Bosses:
 * 1. Warrior: Hero Knight (180x180 heavy full-plate knight with greatsword)
 * 2. Paladin: Medieval King (155x155 golden royal plate armor & holy greatsword)
 * 3. Berserker: Medieval Warrior 2 (150x150 barbarian juggernaut with war axes)
 * 4. Dragoon: Medieval Warrior 3 (135x135 sky dragoon spearman with halberd & polearm)
 * 5. Mage: Wizard Pack (231x190 blue grand wizard with magic staff)
 * 6. Priest: Elementals Water Priestess (288x128 divine water/holy cleric with prayer heals)
 * 7. Necromancer: Evil Wizard (150x150 dark sorcerer with skull magic)
 * 8. Archer: Huntress (150x150 woodland ranger with bow & arrows)
 * 9. Ninja: Martial Hero (200x200 shinobi master with katana & flying kicks)
 * 10. Assassin: High Forest Rogue (80x80 shadow stalker with poison daggers)
 * 11. Boss: NightBorne (80x100 colossal void overlord boss)
 * 12. Monsters: Skeleton, Goblin, Flying Eye, Mushroom (150x150)
 * 13. High Forest Mobs: Boar, Bee, Snail & Parallax Background
 * 14. Items: Kyrise's 350+ 32x32 RPG Icons
 * 15. UI: Cryo's Mini GUI
 */

import { ITEM_DATABASE } from '../items/ItemDatabase';
import { HERO_SPRITES, HERO_FPS, heroFrame, attackAnimFor } from './HeroSprites';
import { MAPS, MapLayer, MapGround, MapFloor, LEGACY_FLOORS, POLY_SHEETS, POLY_PROPS } from './MapLibrary';

type BattleTheme = 'catacombs' | 'crypt' | 'inferno' | 'void' | 'town' | 'swamp' | 'mountain' | 'underwater' | 'caves';

export class SpriteManager {
  private images: { [key: string]: HTMLImageElement } = {};
  private priestessIdleImgs: HTMLImageElement[] = [];
  private priestessWalkImgs: HTMLImageElement[] = [];
  private priestessAtkImgs: HTMLImageElement[] = [];
  private priestessHealImgs: HTMLImageElement[] = [];
  private priestessDeathImgs: HTMLImageElement[] = [];
  private spriteGroups: { [key: string]: HTMLImageElement[] } = {};
  public chestOpenImgs: HTMLImageElement[] = [];

  public isLoaded: boolean = false;
  private animTimer: number = 0;
  /** Per-class attack playback clock, restarted whenever a new swing begins. */
  private atkClock: Record<string, { start: number; prev: number }> = {};
  private pendingLoads: number = 0;

  constructor() {
    this.preloadAll();
  }

  private startLoadCycle() {
    this.pendingLoads += 1;
  }

  private finishLoadCycle() {
    this.pendingLoads = Math.max(0, this.pendingLoads - 1);
    if (this.pendingLoads <= 0) {
      this.isLoaded = true;
    }
  }

  private createTrackedImage(src: string): HTMLImageElement {
    const img = new Image();
    this.startLoadCycle();
    img.onload = () => this.finishLoadCycle();
    img.onerror = () => this.finishLoadCycle();
    img.src = src;
    return img;
  }

  /**
   * Look up a preloaded key, or an asset path. Passing a path lazily registers
   * and loads it, which is what VfxLibrary relies on - do not "simplify" this
   * to a bare map lookup. A second, shadowing definition of this method used to
   * exist further down the class and silently broke every path-based lookup.
   */
  public getImage(keyOrSrc: string): HTMLImageElement | undefined {
    if (this.images[keyOrSrc]) return this.images[keyOrSrc];
    if (keyOrSrc.startsWith('/') || keyOrSrc.startsWith('http') || keyOrSrc.startsWith('data:')) {
      this.addImage(keyOrSrc, keyOrSrc);
      return this.images[keyOrSrc];
    }
    return undefined;
  }

  /**
   * Warm a set of asset paths in the background. Unlike the boot manifest these
   * do not count towards `isLoaded`, so VFX sheets can stream in without
   * holding up the loading screen - but they are usually resident well before
   * the player reaches a fight.
   */
  public warmPaths(paths: string[]) {
    for (const src of paths) {
      if (this.images[src]) continue;
      const img = new Image();
      img.src = src;
      this.images[src] = img;
    }
  }

  private addImage(key: string, src: string) {
    this.images[key] = this.createTrackedImage(src);
  }

  private addToGroup(
    groupKey: string,
    srcBuilder: (index: number) => string,
    start: number,
    end: number
  ) {
    const list: HTMLImageElement[] = [];
    for (let i = start; i <= end; i++) {
      list.push(this.createTrackedImage(srcBuilder(i)));
    }
    this.spriteGroups[groupKey] = list;
  }

  private addToArray(
    target: HTMLImageElement[],
    srcBuilder: (index: number) => string,
    start: number,
    end: number
  ) {
    for (let i = start; i <= end; i++) {
      target.push(this.createTrackedImage(srcBuilder(i)));
    }
  }

  private preloadAll() {
    const assetsToLoad: { [key: string]: string } = {
      // 1. High Forest Environment & Tiles
      bg_forest: '/assets/high-forest/Background/Background.png',
      bg_trees: '/assets/high-forest/Trees/Background.png',
      tree_golden: '/assets/high-forest/Trees/Golden-Tree.png',
      tree_red: '/assets/high-forest/Trees/Red-Tree.png',
      tree_green: '/assets/high-forest/Trees/Green-Tree.png',
      tiles: '/assets/high-forest/Assets/Tiles.png',
      props_rocks: '/assets/high-forest/Assets/Props-Rocks.png',
      buildings: '/assets/high-forest/Assets/Buildings.png',
      battle_ground: '/assets/battle/ground/tx-tileset-ground.png',
      battle_props: '/assets/battle/props/tx-village-props.png',
      battle_chest: '/assets/battle/props/tx-chest-animation.png',

      // 2. High Forest Hero Animations (Assassin)
      hero_idle: '/assets/high-forest/Character/Idle/Idle-Sheet.png',
      hero_run: '/assets/high-forest/Character/Run/Run-Sheet.png',
      hero_attack: '/assets/high-forest/Character/Attack-01/Attack-01-Sheet.png',
      hero_jump: '/assets/high-forest/Character/Jumlp-All/Jump-All-Sheet.png',
      hero_dead: '/assets/high-forest/Character/Dead/Dead-Sheet.png',

      // 3. Medieval King Animations (Paladin)
      king_idle: '/assets/king/Idle.png',
      king_run: '/assets/king/Run.png',
      king_atk1: '/assets/king/Attack_1.png',
      king_atk2: '/assets/king/Attack_2.png',
      king_jump: '/assets/king/Jump.png',
      king_hit: '/assets/king/Hit.png',
      king_death: '/assets/king/Death.png',

      // 4. Medieval Warrior 2 Animations (Berserker)
      bzerk_idle: '/assets/warrior2/Sprites/Idle.png',
      bzerk_run: '/assets/warrior2/Sprites/Run.png',
      bzerk_atk1: '/assets/warrior2/Sprites/Attack1.png',
      bzerk_atk2: '/assets/warrior2/Sprites/Attack2.png',
      bzerk_jump: '/assets/warrior2/Sprites/Jump.png',
      bzerk_hit: '/assets/warrior2/Sprites/Take Hit.png',
      bzerk_death: '/assets/warrior2/Sprites/Death.png',

      // 5. Medieval Warrior 3 Animations (Dragoon Spearman / Halberdier)
      drag_idle: '/assets/warrior3/Sprites/Idle.png',
      drag_run: '/assets/warrior3/Sprites/Run.png',
      drag_atk1: '/assets/warrior3/Sprites/Attack1.png',
      drag_atk2: '/assets/warrior3/Sprites/Attack2.png',
      drag_atk3: '/assets/warrior3/Sprites/Attack3.png',
      drag_jump: '/assets/warrior3/Sprites/Jump.png',
      drag_hit: '/assets/warrior3/Sprites/Get Hit.png',
      drag_death: '/assets/warrior3/Sprites/Death.png',

      // 6. Hero Knight Animations (Warrior - Heavy Plate Greatsword)
      knight_idle: '/assets/heroknight/Sprites/Idle.png',
      knight_run: '/assets/heroknight/Sprites/Run.png',
      knight_atk1: '/assets/heroknight/Sprites/Attack1.png',
      knight_atk2: '/assets/heroknight/Sprites/Attack2.png',
      knight_jump: '/assets/heroknight/Sprites/Jump.png',
      knight_hit: '/assets/heroknight/Sprites/Take Hit.png',
      knight_death: '/assets/heroknight/Sprites/Death.png',

      // 7. Wizard Pack Animations (Mage)
      wizard_idle: '/assets/wizard-pack/Idle.png',
      wizard_run: '/assets/wizard-pack/Run.png',
      wizard_atk1: '/assets/wizard-pack/Attack1.png',
      wizard_atk2: '/assets/wizard-pack/Attack2.png',
      wizard_jump: '/assets/wizard-pack/Jump.png',
      wizard_hit: '/assets/wizard-pack/Hit.png',
      wizard_death: '/assets/wizard-pack/Death.png',

      // 8. Evil Wizard Animations (Necromancer)
      ewizard_idle: '/assets/evil-wizard/Sprites/Idle.png',
      ewizard_run: '/assets/evil-wizard/Sprites/Move.png',
      ewizard_atk: '/assets/evil-wizard/Sprites/Attack.png',
      ewizard_hit: '/assets/evil-wizard/Sprites/Take Hit.png',
      ewizard_death: '/assets/evil-wizard/Sprites/Death.png',

      // 9. Huntress Animations (Archer)
      huntress_idle: '/assets/huntress/Sprites/Idle.png',
      huntress_run: '/assets/huntress/Sprites/Run.png',
      huntress_atk1: '/assets/huntress/Sprites/Attack1.png',
      huntress_atk2: '/assets/huntress/Sprites/Attack2.png',
      huntress_atk3: '/assets/huntress/Sprites/Attack3.png',
      huntress_jump: '/assets/huntress/Sprites/Jump.png',
      huntress_hit: '/assets/huntress/Sprites/Take hit.png',
      huntress_death: '/assets/huntress/Sprites/Death.png',

      // 10. Martial Hero Animations (Ninja)
      martial_idle: '/assets/martial-hero/Sprites/Idle.png',
      martial_run: '/assets/martial-hero/Sprites/Run.png',
      martial_atk1: '/assets/martial-hero/Sprites/Attack1.png',
      martial_atk2: '/assets/martial-hero/Sprites/Attack2.png',
      martial_jump: '/assets/martial-hero/Sprites/Jump.png',
      martial_hit: '/assets/martial-hero/Sprites/Take Hit.png',
      martial_death: '/assets/martial-hero/Sprites/Death.png',

      // 11. Epic Boss: NightBorne
      nightborne_sheet: '/assets/nightborne/NightBorne.png',


      // 12. Tiny RPG Orc Animations (Orc Berserker, Orc Chief Boss)
      orc_idle: '/assets/tiny-rpg/Characters(100x100 split)/Orc/Orc with shadows/Orc_Idle.png',
      orc_walk: '/assets/tiny-rpg/Characters(100x100 split)/Orc/Orc with shadows/Orc_Walk.png',
      orc_atk1: '/assets/tiny-rpg/Characters(100x100 split)/Orc/Orc with shadows/Orc_Attack01.png',
      orc_atk2: '/assets/tiny-rpg/Characters(100x100 split)/Orc/Orc with shadows/Orc_Attack02.png',
      orc_hurt: '/assets/tiny-rpg/Characters(100x100 split)/Orc/Orc with shadows/Orc_Hurt.png',
      orc_death: '/assets/tiny-rpg/Characters(100x100 split)/Orc/Orc with shadows/Orc_Death.png',

      // 13. Monsters Creatures Fantasy
      skel_idle: '/assets/monsters/Skeleton/Idle.png',
      skel_walk: '/assets/monsters/Skeleton/Walk.png',
      skel_atk: '/assets/monsters/Skeleton/Attack.png',
      skel_hit: '/assets/monsters/Skeleton/Take Hit.png',
      skel_death: '/assets/monsters/Skeleton/Death.png',

      gob_idle: '/assets/monsters/Goblin/Idle.png',
      gob_run: '/assets/monsters/Goblin/Run.png',
      gob_atk: '/assets/monsters/Goblin/Attack.png',
      gob_hit: '/assets/monsters/Goblin/Take Hit.png',
      gob_death: '/assets/monsters/Goblin/Death.png',

      eye_flight: '/assets/monsters/Flying eye/Flight.png',
      eye_atk: '/assets/monsters/Flying eye/Attack.png',
      eye_hit: '/assets/monsters/Flying eye/Take Hit.png',
      eye_death: '/assets/monsters/Flying eye/Death.png',

      mush_idle: '/assets/monsters/Mushroom/Idle.png',
      mush_run: '/assets/monsters/Mushroom/Run.png',
      mush_atk: '/assets/monsters/Mushroom/Attack.png',
      mush_hit: '/assets/monsters/Mushroom/Take Hit.png',
      mush_death: '/assets/monsters/Mushroom/Death.png',

      // 14. Projectiles
      arrow_proj: '/assets/tiny-rpg/Arrow(Projectile)/Arrow01(32x32).png',

      // 15. High Forest Mobs
      boar_idle: '/assets/high-forest/Mob/Boar/Idle/Idle-Sheet.png',
      boar_walk: '/assets/high-forest/Mob/Boar/Walk/Walk-Base-Sheet.png',
      boar_run: '/assets/high-forest/Mob/Boar/Run/Run-Sheet.png',
      boar_hit: '/assets/high-forest/Mob/Boar/Hit-Vanish/Hit-Sheet.png',

      bee_fly: '/assets/high-forest/Mob/Small Bee/Fly/Fly-Sheet.png',
      bee_attack: '/assets/high-forest/Mob/Small Bee/Attack/Attack-Sheet.png',
      bee_hit: '/assets/high-forest/Mob/Small Bee/Hit/Hit-Sheet.png',

      snail_walk: '/assets/high-forest/Mob/Snail/walk-Sheet.png',
      snail_hide: '/assets/high-forest/Mob/Snail/Hide-Sheet.png',
      snail_dead: '/assets/high-forest/Mob/Snail/Dead-Sheet.png',

      // 16. Cryo's Mini GUI Textures
      gui_panel: '/assets/mini-gui/GUI/GUI_2x.png',
      gui_button: '/assets/mini-gui/Buttons/buttons_2x.png',

      // 17. Magical Spell & Combat FX (Animation Pack)
      fx_hit_slash: '/assets/spells/Hit Effect.png',
      fx_fire_burn: '/assets/spells/Fire/Burn.png',
      fx_fire_line: '/assets/spells/Fire/Line of fire.png',
      fx_fire_shine: '/assets/spells/Fire/Shine.png',
      fx_ice_ball: '/assets/spells/Ice/Ball of ice.png',
      fx_ice_burst: '/assets/spells/Ice/Burst of ice.png',
      fx_energy_ball: '/assets/spells/Energy ball/EnergyBall.png',
      fx_energy_impact: '/assets/spells/Energy ball/energyBallImpact.png',
      fx_crystal: '/assets/spells/Crystal.png',
      fx_thunder: '/assets/spells/Thunder.png',
      fx_explosion: '/assets/spells/explosioneffect.png',
      fx_magic_mirror: '/assets/spells/Magic Mirror.png',
      fx_projectile: '/assets/spells/projetilNew.png',

      // 18. Magic Shaders for Ultimates & Boss Attacks (Magic Shader All)

      // 18b. Newly Integrated Pixel Effects, Dark VFX, and Ansimuz Slashes
      vfx_magicspell: '/assets/vfx/pixel_effects/1_magicspell_spritesheet.png',
      vfx_flamelash: '/assets/vfx/pixel_effects/6_flamelash_spritesheet.png',
      vfx_firespin: '/assets/vfx/pixel_effects/7_firespin_spritesheet.png',
      vfx_protection: '/assets/vfx/pixel_effects/8_protectioncircle_spritesheet.png',
      vfx_brightfire: '/assets/vfx/pixel_effects/9_brightfire_spritesheet.png',
      vfx_weaponhit: '/assets/vfx/pixel_effects/10_weaponhit_spritesheet.png',
      vfx_vortex: '/assets/vfx/pixel_effects/13_vortex_spritesheet.png',
      vfx_phantom: '/assets/vfx/pixel_effects/14_phantom_spritesheet.png',
      vfx_freezing: '/assets/vfx/pixel_effects/19_freezing_spritesheet.png',
      vfx_dark1: '/assets/vfx/dark_vfx/Dark VFX 1/Dark VFX 1 (40x32).png',
      vfx_dark2: '/assets/vfx/dark_vfx/Dark VFX 2/Dark VFX 2 (48x64).png',
      vfx_ground_explosion: '/assets/vfx/ansimuz/Ground Explosion/spritesheet/explosion-animation.png',
      vfx_bolt: '/assets/vfx/ansimuz/Warped shooting fx/Bolt/spritesheet.png',
      vfx_charged: '/assets/vfx/ansimuz/Warped shooting fx/charged/spritesheet.png',
      vfx_slash_circle: '/assets/vfx/pixel_effects/10_weaponhit_spritesheet.png',
      vfx_ansimuz_explosion: '/assets/vfx/ansimuz/Explosions pack/explosion-1-g/spritesheet.png',

      // 18c. Real Animated Dragon Boss, Grim Reaper & Holy Spell Packs
      reaper_sheet: '/assets/reaper/SpriteSheet/Bringer-of-Death-SpritSheet.png',
      nightborne: '/assets/nightborne/NightBorne.png',
      holy_spell_00: '/assets/vfx/holy_pack/00.png',
      holy_spell_01: '/assets/vfx/holy_pack/01.png',

      // 18f. Magic Pack 9
      mp9_darkbolt: '/assets/vfx/magic_pack_9/Dark-Bolt.png',
      mp9_firebomb: '/assets/vfx/magic_pack_9/Fire-bomb.png',
      mp9_lightning: '/assets/vfx/magic_pack_9/Lightning.png',
      mp9_spark: '/assets/vfx/magic_pack_9/spark.png',

      // 18e. Warrior VFX
      warrior_vfx1: '/assets/vfx/warrior/vfx1.png',
      warrior_vfx2: '/assets/vfx/warrior/vfx2.png',
      warrior_vfx3: '/assets/vfx/warrior/vfx3.png',
      warrior_vfx4: '/assets/vfx/warrior/vfx4.png',
      warrior_vfx5: '/assets/vfx/warrior/vfx5.png',

      // 18d. Pipoya VFX
      pipo_mapeffect021: '/assets/vfx/pipoya/pipo-mapeffect021_192.png',
      pipo_mapeffect022: '/assets/vfx/pipoya/pipo-mapeffect022_192.png',
      pipo_mapeffect023: '/assets/vfx/pipoya/pipo-mapeffect023_192.png',
      pipo_mapeffect024: '/assets/vfx/pipoya/pipo-mapeffect024_192.png',
      pipo_mapeffect025: '/assets/vfx/pipoya/pipo-mapeffect025_192.png',
      pipo_nazoobj01a: '/assets/vfx/pipoya/pipo-nazoobj01a_192.png',
      pipo_nazoobj01b: '/assets/vfx/pipoya/pipo-nazoobj01b_192.png',
      pipo_nazoobj01c: '/assets/vfx/pipoya/pipo-nazoobj01c_192.png',
      pipo_nazoobj02a: '/assets/vfx/pipoya/pipo-nazoobj02a_192.png',
      pipo_nazoobj02b: '/assets/vfx/pipoya/pipo-nazoobj02b_192.png',
      pipo_nazoobj02c: '/assets/vfx/pipoya/pipo-nazoobj02c_192.png',
      pipo_nazoobj03a: '/assets/vfx/pipoya/pipo-nazoobj03a_192.png',
      pipo_nazoobj03b: '/assets/vfx/pipoya/pipo-nazoobj03b_192.png',
      pipo_nazoobj03c: '/assets/vfx/pipoya/pipo-nazoobj03c_192.png',
      pipo_nazoobj04a: '/assets/vfx/pipoya/pipo-nazoobj04a_192.png',
      pipo_nazoobj04b: '/assets/vfx/pipoya/pipo-nazoobj04b_192.png',
      pipo_nazoobj04c: '/assets/vfx/pipoya/pipo-nazoobj04c_192.png',
      pipo_nazoobj05a: '/assets/vfx/pipoya/pipo-nazoobj05a_192.png',
      pipo_nazoobj05b: '/assets/vfx/pipoya/pipo-nazoobj05b_192.png',
      pipo_nazoobj05c: '/assets/vfx/pipoya/pipo-nazoobj05c_192.png',
      // 19. Treasure Hunters Platform Terrain & Environment
      th_terrain: '/assets/treasure-hunters/Palm Tree Island/Sprites/Terrain/Terrain (32x32).png',
      th_palm_back: '/assets/treasure-hunters/Palm Tree Island/Sprites/Back Palm Trees/Back Palm Tree Left 01.png',
      th_palm_back_right: '/assets/treasure-hunters/Palm Tree Island/Sprites/Back Palm Trees/Back Palm Tree Right 01.png',
      th_palm_front: '/assets/treasure-hunters/Palm Tree Island/Sprites/Front Palm Trees/Front Palm Tree Top 01.png',
      th_palm_front_alt: '/assets/treasure-hunters/Palm Tree Island/Sprites/Front Palm Trees/Front Palm Tree Top 02.png',
      th_pinechest_open: '/assets/treasure-hunters/Palm Tree Island/Sprites/Objects/Chest/Chest Open 01.png',
      th_pinechest_close: '/assets/treasure-hunters/Palm Tree Island/Sprites/Objects/Chest/Chest Close 01.png',
      th_flag: '/assets/treasure-hunters/Palm Tree Island/Sprites/Objects/Flag/Flag 01.png',
      th_spikes: '/assets/treasure-hunters/Palm Tree Island/Sprites/Objects/Spikes/Spikes.png',
      th_ship_helm: '/assets/treasure-hunters/Palm Tree Island/Sprites/Objects/Ship Helm/Ship Helm Turn 01.png',
      th_palm_back_layer: '/assets/treasure-hunters/Palm Tree Island/Sprites/Background/Additional Sky.png',
      th_terrain_detail: '/assets/treasure-hunters/Palm Tree Island/Sprites/Front Palm Trees/Front Palm Bottom and Grass (32x32).png',
      th_palm_platform: '/assets/treasure-hunters/Palm Tree Island/Sprites/Objects/Ship Helm/Ship Helm Idle 01.png',
      th_palm_platform_obj: '/assets/treasure-hunters/Palm Tree Island/Sprites/Objects/Ship Helm/Ship Helm Idle 01.png',

      // 20. Treasure Hunters Animated Chests & Loot Drops
      th_chest_idle: '/assets/treasure-hunters/Merchant Ship/Sprites/Chest/Idle/1.png',
      th_coin_1: '/assets/treasure-hunters/Pirate Treasure/Sprites/Gold Coin/01.png',
      th_coin_2: '/assets/treasure-hunters/Pirate Treasure/Sprites/Gold Coin/02.png',
      th_coin_3: '/assets/treasure-hunters/Pirate Treasure/Sprites/Gold Coin/03.png',
      th_coin_4: '/assets/treasure-hunters/Pirate Treasure/Sprites/Gold Coin/04.png',
      th_gem_blue: '/assets/treasure-hunters/Pirate Treasure/Sprites/Blue Diamond/01.png',
      th_gem_red: '/assets/treasure-hunters/Pirate Treasure/Sprites/Red Diamond/01.png',
      th_gem_green: '/assets/treasure-hunters/Pirate Treasure/Sprites/Green Diamond/01.png',
      th_pot_red: '/assets/treasure-hunters/Pirate Treasure/Sprites/Red Potion/01.png',
      th_pot_blue: '/assets/treasure-hunters/Pirate Treasure/Sprites/Blue Potion/01.png',

      // 21. Battle Arena Assets
      battle_flame_fx: '/assets/battle/fx/tx-fx-flame.png',
      battle_torch_fx: '/assets/battle/fx/tx-fx-torch-flame.png',

      // 22. Pirate Ship Tileset support for richer parallax base layers
      pirate_wall_tiles: '/assets/treasure-hunters/Pirate Ship/Sprites/Tilesets/Terrain and Back Wall (32x32).png',
      pirate_platform_tiles: '/assets/treasure-hunters/Pirate Ship/Sprites/Tilesets/Platforms (32x32).png',

      // 22. Merchant Ship environment & FX (for layered battleground detail)
      th_crate: '/assets/treasure-hunters/Merchant Ship/Sprites/Box/Idle/1.png',
      th_barrel: '/assets/treasure-hunters/Merchant Ship/Sprites/Barrel/Idle/1.png',
      ms_anchor: '/assets/treasure-hunters/Merchant Ship/Sprites/Ship/Anchor/1.png',
      ms_ship_top: '/assets/treasure-hunters/Merchant Ship/Sprites/Water/Water/Top/1.png',
      ms_ship_bottom: '/assets/treasure-hunters/Merchant Ship/Sprites/Water/Water/Bottom/1.png',
      ms_ship_sail_no_wind_1: '/assets/treasure-hunters/Merchant Ship/Sprites/Ship/Sail/No Wind/1.png',
      ms_ship_sail_wind_1: '/assets/treasure-hunters/Merchant Ship/Sprites/Ship/Sail/Wind/1.png',
      ms_ship_splash1_1: '/assets/treasure-hunters/Merchant Ship/Sprites/Water/Water Splash 1/1.png',
      ms_ship_splash2_1: '/assets/treasure-hunters/Merchant Ship/Sprites/Water/Water Splash 2/1.png',
      ms_ship_reflex1_1: '/assets/treasure-hunters/Merchant Ship/Sprites/Water/Reflexes 1/1.png',
      ms_ship_reflex2_1: '/assets/treasure-hunters/Merchant Ship/Sprites/Water/Reflexes 2/1.png',
      ms_ship_idle_1: '/assets/treasure-hunters/Merchant Ship/Sprites/Ship/Ship/Idle/1.png',
      ms_ship_hit_1: '/assets/treasure-hunters/Merchant Ship/Sprites/Ship/Ship/Hit/1.png',
      ms_ship_destroyed_1: '/assets/treasure-hunters/Merchant Ship/Sprites/Ship/Destroyed/1.png',
      ms_anchor_2: '/assets/treasure-hunters/Merchant Ship/Sprites/Ship/Anchor/2.png',

      // 22. Shooter traps for background hazards/details
      st_cannon_idle_1: '/assets/treasure-hunters/Shooter Traps/Sprites/Cannon/Cannon Idle/1.png',
      st_cannon_fire_1: '/assets/treasure-hunters/Shooter Traps/Sprites/Cannon/Cannon Fire/1.png',
      st_cannon_fire_effect_1: '/assets/treasure-hunters/Shooter Traps/Sprites/Cannon/Cannon Fire Effect/1.png',
      st_cannon_destroyed_1: '/assets/treasure-hunters/Shooter Traps/Sprites/Cannon/Cannon Destroyed/1.png',
      st_cannon_ball_destroyed_1: '/assets/treasure-hunters/Shooter Traps/Sprites/Cannon/Cannon Ball Destroyed/1.png',
      st_cannon_ball_idle_1: '/assets/treasure-hunters/Shooter Traps/Sprites/Cannon/Cannon Ball Idle/1.png',
      st_seashell_destroyed_1: '/assets/treasure-hunters/Shooter Traps/Sprites/Seashell/Seashell Destroyed/1.png',
      st_tent_head1_idle: '/assets/treasure-hunters/Shooter Traps/Sprites/Totems/Head 1/Idle 1/1.png',
      st_tent_head1_attack: '/assets/treasure-hunters/Shooter Traps/Sprites/Totems/Head 1/Attack 1/1.png',
      st_tent_head2_idle: '/assets/treasure-hunters/Shooter Traps/Sprites/Totems/Head 2/Idle 1/1.png',
      st_tent_head2_attack: '/assets/treasure-hunters/Shooter Traps/Sprites/Totems/Head 2/Attack 1/1.png',
      st_tent_head3_idle: '/assets/treasure-hunters/Shooter Traps/Sprites/Totems/Head 3/Idle 1/1.png',
      st_tent_head3_attack: '/assets/treasure-hunters/Shooter Traps/Sprites/Totems/Head 3/Attack 1/1.png',
      st_tent_head1_hit: '/assets/treasure-hunters/Shooter Traps/Sprites/Totems/Head 1/Hit 1/1.png',
      st_tent_head2_hit: '/assets/treasure-hunters/Shooter Traps/Sprites/Totems/Head 2/Hit 1/1.png',
      st_tent_head3_hit: '/assets/treasure-hunters/Shooter Traps/Sprites/Totems/Head 3/Hit 1/1.png',
      st_tent_head1_destroyed: '/assets/treasure-hunters/Shooter Traps/Sprites/Totems/Head 1/Destroyed/1.png',
      st_tent_head2_destroyed: '/assets/treasure-hunters/Shooter Traps/Sprites/Totems/Head 2/Destroyed/1.png',
      st_tent_head3_destroyed: '/assets/treasure-hunters/Shooter Traps/Sprites/Totems/Head 3/Destroyed/1.png',
      st_cannon_ball_explosion_1: '/assets/treasure-hunters/Shooter Traps/Sprites/Cannon/Cannon Ball Explosion/1.png',
      st_seashell_bite_1: '/assets/treasure-hunters/Shooter Traps/Sprites/Seashell/Seashell Bite/1.png',
      st_seashell_fire_1: '/assets/treasure-hunters/Shooter Traps/Sprites/Seashell/Seashell Fire/1.png',
      st_seashell_hit_1: '/assets/treasure-hunters/Shooter Traps/Sprites/Seashell/Seashell Hit/1.png',
      st_seashell_opening_1: '/assets/treasure-hunters/Shooter Traps/Sprites/Seashell/Seashell Opening/1.png',
      st_seashell_hit_2: '/assets/treasure-hunters/Shooter Traps/Sprites/Seashell/Seashell Hit/2.png',
      tc_crabby_idle_1: '/assets/treasure-hunters/The Crusty Crew/Sprites/Crabby/01-Idle/Idle 01.png',
      tc_fierce_tooth_idle_1: '/assets/treasure-hunters/The Crusty Crew/Sprites/Fierce Tooth/01-Idle/Idle 01.png',
      tc_pink_star_idle_1: '/assets/treasure-hunters/The Crusty Crew/Sprites/Pink Star/01-Idle/Idle 01.png',
      st_wood_spike: '/assets/treasure-hunters/Shooter Traps/Sprites/Totems/Wood Spike/Idle/1.png',

      // 22. Pirate Ship Decorations for richer battleground composition
      ph_bottles_01: '/assets/treasure-hunters/Pirate Ship/Sprites/Decorations/Barrels and Bottles/01.png',
      ph_bottles_02: '/assets/treasure-hunters/Pirate Ship/Sprites/Decorations/Barrels and Bottles/02.png',
      ph_bottles_03: '/assets/treasure-hunters/Pirate Ship/Sprites/Decorations/Barrels and Bottles/03.png',
      ph_candle: '/assets/treasure-hunters/Pirate Ship/Sprites/Decorations/Candle/Candle/01.png',
      ph_candle_light: '/assets/treasure-hunters/Pirate Ship/Sprites/Decorations/Candle/Candle Light/01.png',
      ph_chain_big: '/assets/treasure-hunters/Pirate Ship/Sprites/Decorations/Chains/Big/01.png',
      ph_chain_small: '/assets/treasure-hunters/Pirate Ship/Sprites/Decorations/Chains/Small/01.png',
      ph_window: '/assets/treasure-hunters/Pirate Ship/Sprites/Decorations/Window/Window/01.png',
      ph_window_light: '/assets/treasure-hunters/Pirate Ship/Sprites/Decorations/Window/Window Light/01.png',
      ph_door_open: '/assets/treasure-hunters/Pirate Ship/Sprites/Decorations/Door/Opening/01.png',
      ph_door_close: '/assets/treasure-hunters/Pirate Ship/Sprites/Decorations/Door/Closing/01.png',

      // 23. GothicVania Town Environment & Parallax Layers
      gv_bg: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/layers/background.png',
      gv_mg: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/layers/middleground.png',
      gv_tileset: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/layers/tileset.png',
      gv_ground: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/layers/sliced-tileset/ground.png',
      gv_ground_wall: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/layers/sliced-tileset/ground-wall.png',
      gv_ground_b: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/layers/sliced-tileset/ground-b.png',
      gv_top_wood: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/layers/sliced-tileset/top-wood.png',
      gv_wood_legs: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/layers/sliced-tileset/wood-legs.png',
      gv_stairs: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/layers/sliced-tileset/stairs.png',

      // 24. GothicVania Buildings & Sliced Props
      gv_church: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/props-sliced/chuch.png',
      gv_house_a: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/props-sliced/house-a.png',
      gv_house_b: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/props-sliced/house-b.png',
      gv_house_c: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/props-sliced/house-c.png',
      gv_street_lamp: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/props-sliced/street-lamp.png',
      gv_well: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/props-sliced/well.png',
      gv_wagon: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/props-sliced/wagon.png',
      gv_barrel: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/props-sliced/barrel.png',
      gv_crate_stack: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/props-sliced/crate-stack.png',
      gv_crate: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/props-sliced/crate.png',
      gv_sign: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/props-sliced/sign.png',

      // 25. GothicVania Town NPCs Spritesheets
      gv_bearded_idle: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/spritesheets/bearded-idle.png',
      gv_bearded_walk: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/spritesheets/bearded-walk.png',
      gv_hatman_idle: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/spritesheets/hat-man-idle.png',
      gv_hatman_walk: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/spritesheets/hat-man-walk.png',
      gv_oldman_idle: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/spritesheets/oldman-idle.png',
      gv_oldman_walk: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/spritesheets/oldman-walk.png',
      gv_woman_idle: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/spritesheets/woman-idle.png',
      gv_woman_walk: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/spritesheets/woman-walk.png',

      // 26. Warped Caves Environment & Dungeon Layers
      wc_bg: '/assets/warped-files/warped-files/Assets/PNG/environment/layers/background.png',
      wc_mg: '/assets/warped-files/warped-files/Assets/PNG/environment/layers/middleground.png',
      wc_mg_nofungus: '/assets/warped-files/warped-files/Assets/PNG/environment/layers/middleground-no-fungus.png',
      wc_tileset: '/assets/warped-files/warped-files/Assets/PNG/environment/layers/tilesets.png',
      wc_walls: '/assets/warped-files/warped-files/Assets/PNG/environment/layers/walls.png',
      wc_props: '/assets/warped-files/warped-files/Assets/PNG/environment/layers/props.png',
      wc_gate1: '/assets/warped-files/warped-files/Assets/PNG/environment/props/gate-01.png',
      wc_gate2: '/assets/warped-files/warped-files/Assets/PNG/environment/props/gate-02.png',
      wc_gate3: '/assets/warped-files/warped-files/Assets/PNG/environment/props/gate-03.png',
      wc_stalactite: '/assets/warped-files/warped-files/Assets/PNG/environment/props/stalactite.png',
      wc_stone_head: '/assets/warped-files/warped-files/Assets/PNG/environment/props/stone-head.png',
      wc_stone: '/assets/warped-files/warped-files/Assets/PNG/environment/props/stone.png',
      wc_plant_big: '/assets/warped-files/warped-files/Assets/PNG/environment/props/plant-big.png',
      wc_plant_small: '/assets/warped-files/warped-files/Assets/PNG/environment/props/plant-small.png',

      // 27. Green Portal Animated Sprite Sheet (256x128, 4 frames x 2 rows, 64x64 per frame)
      green_portal: '/assets/portal/new_portal.png',

      // 28. Gothicvania Swamp (Poison Marsh Biome)
      swamp_bg: '/assets/swamp/background.png',
      swamp_mid1: '/assets/swamp/mid-layer-01.png',
      swamp_mid2: '/assets/swamp/mid-layer-02.png',
      swamp_trees: '/assets/swamp/trees.png',
      swamp_tileset: '/assets/swamp/tileset.png',
      swamp_props: '/assets/swamp/props.png',

      // 29. Mountain Dusk (Blood Moon & Twilight Peaks Biome)
      mountain_sky: '/assets/mountain-dusk/MountainsLayers/sky.png',
      mountain_far_mountains: '/assets/mountain-dusk/MountainsLayers/far-mountains.png',
      mountain_mountains: '/assets/mountain-dusk/MountainsLayers/mountains.png',
      mountain_far_clouds: '/assets/mountain-dusk/MountainsLayers/far-clouds.png',
      mountain_near_clouds: '/assets/mountain-dusk/MountainsLayers/near-clouds.png',
      mountain_trees: '/assets/mountain-dusk/MountainsLayers/trees.png',

      // 30. Underwater Fantasy (Sunken Abyss & Ocean Ruins Biome)
      underwater_far: '/assets/underwater/Assets/PNG/layers/far.png',
      underwater_fg1: '/assets/underwater/Assets/PNG/layers/foreground-1.png',
      underwater_fg2: '/assets/underwater/Assets/PNG/layers/foreground-2.png',
      underwater_sand: '/assets/underwater/Assets/PNG/layers/sand.png',
      underwater_merged: '/assets/underwater/Assets/PNG/layers/foregound-merged.png',

      // 31. Caves of Gallet (Subterranean Forge & Lava Falls Biome)
      caves_gallet: '/assets/caves-gallet/cavesofgallet.png',
      caves_gallet_tiles: '/assets/caves-gallet/cavesofgallet_tiles.png'
    };

    Object.entries(assetsToLoad).forEach(([key, src]) => {
      this.addImage(key, src);
    });

    // Preload item icons from ITEM_DATABASE for zero-lag rendering
    ITEM_DATABASE.forEach(item => {
      if (item.image) {
        this.addImage(item.image, item.image);
      }
    });

    // Preload Water Priestess frames (288x128)
    this.addToArray(this.priestessIdleImgs, (i) => `/assets/priestess/png/01_idle/idle_${i}.png`, 1, 8);
    this.addToArray(this.priestessWalkImgs, (i) => `/assets/priestess/png/02_walk/walk_${i}.png`, 1, 10);
    this.addToArray(this.priestessAtkImgs, (i) => `/assets/priestess/png/07_1_atk/1_atk_${i}.png`, 1, 7);
    this.addToArray(this.priestessHealImgs, (i) => `/assets/priestess/png/11_heal/heal_${i}.png`, 1, 12);
    this.addToArray(this.priestessDeathImgs, (i) => `/assets/priestess/png/14_death/death_${i}.png`, 1, 16);

    // Preload Elder Dragon Companion (Fully Animated from OpenGameArt)
    for (let i = 1; i <= 40; i++) {
      this.addImage(`dragon_atk_${i}`, `/assets/elder_dragon/atk/${i}.png`);
      this.addImage(`dragon_atk2_${i}`, `/assets/elder_dragon/atk/${i}.png`);
      this.addImage(`dragon_walk_${i}`, `/assets/elder_dragon/walk/${i}.png`);
      this.addImage(`dragon_idle_${i}`, `/assets/elder_dragon/idle/${i}.png`);
    }

    // Preload Sanju's Ultimate VFX Packs
    // Cosmic Time (25 frames)
    for (let i = 1; i <= 25; i++) {
      const folder = Math.ceil(i / 5);
      const numStr = i < 10 ? `0${i}` : `${i}`;
      this.addImage(`sanju_cosmic_${i}`, `/assets/sanju_vfx/cosmic/${folder}/Cosmic_${numStr}.png`);
    }

    // Fire Wrath (25 frames)
    for (let i = 1; i <= 25; i++) {
      const folder = Math.ceil(i / 5);
      const numStr = i < 10 ? `0${i}` : `${i}`;
      this.addImage(`sanju_fire_${i}`, `/assets/sanju_vfx/fire/SD/${folder}/Fire-Wrath__${numStr}.png`);
    }

    // Earth Impact (25 frames)
    for (let i = 1; i <= 25; i++) {
      const folder = Math.ceil(i / 5);
      const numStr = i < 10 ? `0${i}` : `${i}`;
      this.addImage(`sanju_earth_${i}`, `/assets/sanju_vfx/earth/${folder}/Earth-Impact_${numStr}.png`);
    }

    // Light Effect (25 frames, no folders)
    for (let i = 1; i <= 25; i++) {
      const numStr = i < 10 ? `0${i}` : `${i}`;
      this.addImage(`sanju_light_${i}`, `/assets/sanju_vfx/light/LightEffect_${numStr}.png`);
    }

    // Special 2D Effects
    for (let i = 1; i <= 10; i++) {
      const numStr = i < 10 ? `0${i}` : `${i}`;
      this.addImage(`sanju_2d_green_${i}`, `/assets/sanju_vfx/special2d/green_effect/green_effect_${numStr}.png`);
      this.addImage(`sanju_2d_glow_${i}`, `/assets/sanju_vfx/special2d/light_glow_effect/light_glow_${numStr}.png`);
      this.addImage(`sanju_2d_magic_${i}`, `/assets/sanju_vfx/special2d/magic_effect/magic_effect_${numStr}.png`);
      this.addImage(`sanju_2d_magic2_${i}`, `/assets/sanju_vfx/special2d/magic_effect_2/magic_effect_2_${numStr}.png`);
    }
    for (let i = 1; i <= 12; i++) {
      const numStr = i < 10 ? `0${i}` : `${i}`;
      this.addImage(`sanju_2d_sparks_${i}`, `/assets/sanju_vfx/special2d/sparks_effect/sparks_effect_${numStr}.png`);
    }

    // Preload Sanju's Normal VFX Packs
    // Blood Magic (25 frames)
    for (let i = 1; i <= 25; i++) {
      const numStr = i < 10 ? `0${i}` : `${i}`;
      this.addImage(`sanju_blood_${i}`, `/assets/sanju_normals/blood/Blood-Magic-Effect_${numStr}.png`);
    }

    // Pure Projectile (25 frames)
    for (let i = 1; i <= 25; i++) {
      const numStr = i < 10 ? `0${i}` : `${i}`;
      this.addImage(`sanju_pure_${i}`, `/assets/sanju_normals/projectile/Files/Pure_${numStr}.png`);
    }

    // Water Effect (25 frames)
    for (let i = 1; i <= 25; i++) {
      const folder = Math.ceil(i / 5);
      const folderStr = folder < 10 ? `0${folder}` : `${folder}`;
      const frameInFolder = ((i - 1) % 5) + 1;
      const frameStr = frameInFolder < 10 ? `0${frameInFolder}` : `${frameInFolder}`;
      this.addImage(`sanju_water_${i}`, `/assets/sanju_normals/water/${folderStr}/Water__${frameStr}.png`);
    }

    // Nature Magic (4 effects)
    for (let i = 1; i <= 5; i++) this.addImage(`sanju_nature_0_${i}`, `/assets/sanju_normals/nature/0-${i}.png`);
    for (let i = 1; i <= 7; i++) this.addImage(`sanju_nature_1_${i}`, `/assets/sanju_normals/nature/1-${i}.png`);
    for (let i = 1; i <= 7; i++) this.addImage(`sanju_nature_2_${i}`, `/assets/sanju_normals/nature/2-${i}.png`);
    for (let i = 1; i <= 5; i++) this.addImage(`sanju_nature_3_${i}`, `/assets/sanju_normals/nature/3-${i}.png`);

    // AAA Magic Spells
    this.addImage('aaa_wind_bolt', '/assets/aaa_spells/pixel/Pixelart Spells/PNG Files/Wind Bolt.png');
    this.addImage('aaa_magic_sparks', '/assets/aaa_spells/pixel/Pixelart Spells/PNG Files/Magic Sparks.png');
    this.addImage('aaa_holy_shield', '/assets/aaa_spells/pixel/Pixelart Spells/PNG Files/Pixelart Shield.png');

    // AAA Light Effects (25 frames)
    for (let i = 1; i <= 25; i++) {
      const numStr = i < 10 ? `0${i}` : `${i}`;
      this.addImage(`aaa_light_${i}`, `/assets/aaa_spells/light/LightEffect_${numStr}.png`);
    }

    // Preload Reaper Attack, Spell, Cast, Idle, and Walk frames (Clean paths)
    for (let i = 1; i <= 10; i++) {
      this.addImage(`reaper_atk_${i}`, `/assets/reaper/sprites/Attack/Bringer-of-Death_Attack_${i}.png`);
    }
    for (let i = 1; i <= 16; i++) {
      this.addImage(`reaper_spell_${i}`, `/assets/reaper/sprites/Spell/Bringer-of-Death_Spell_${i}.png`);
    }
    for (let i = 1; i <= 9; i++) {
      this.addImage(`reaper_cast_${i}`, `/assets/reaper/sprites/Cast/Bringer-of-Death_Cast_${i}.png`);
    }
    for (let i = 1; i <= 8; i++) {
      this.addImage(`reaper_idle_${i}`, `/assets/reaper/sprites/Idle/Bringer-of-Death_Idle_${i}.png`);
      this.addImage(`reaper_walk_${i}`, `/assets/reaper/sprites/Walk/Bringer-of-Death_Walk_${i}.png`);
    }

    // Preload Chest Opening Frames (8 frames)
    this.addToArray(this.chestOpenImgs, (i) => `/assets/treasure-hunters/Merchant Ship/Sprites/Chest/Unlocked/${i}.png`, 1, 8);

    // Preload richer Treasure Hunter environmental groups for battleground variety
    this.addToGroup(
      'th_palm_back_left',
      (i) => `/assets/treasure-hunters/Palm Tree Island/Sprites/Back Palm Trees/Back Palm Tree Left ${String(i).padStart(2, '0')}.png`,
      1,
      4
    );
    this.addToGroup(
      'th_palm_back_regular',
      (i) => `/assets/treasure-hunters/Palm Tree Island/Sprites/Back Palm Trees/Back Palm Tree Regular ${String(i).padStart(2, '0')}.png`,
      1,
      4
    );
    this.addToGroup(
      'th_palm_back_right',
      (i) => `/assets/treasure-hunters/Palm Tree Island/Sprites/Back Palm Trees/Back Palm Tree Right ${String(i).padStart(2, '0')}.png`,
      1,
      4
    );
    this.addToGroup(
      'th_palm_front_top',
      (i) => `/assets/treasure-hunters/Palm Tree Island/Sprites/Front Palm Trees/Front Palm Tree Top ${String(i).padStart(2, '0')}.png`,
      1,
      4
    );
    this.addToGroup(
      'th_chest_open_set',
      (i) => `/assets/treasure-hunters/Palm Tree Island/Sprites/Objects/Chest/Chest Open ${String(i).padStart(2, '0')}.png`,
      1,
      10
    );
    this.addToGroup(
      'th_chest_close_set',
      (i) => `/assets/treasure-hunters/Palm Tree Island/Sprites/Objects/Chest/Chest Close ${String(i).padStart(2, '0')}.png`,
      1,
      10
    );
    this.addToGroup(
      'th_flag_set',
      (i) => `/assets/treasure-hunters/Palm Tree Island/Sprites/Objects/Flag/Flag ${String(i).padStart(2, '0')}.png`,
      1,
      9
    );
    this.addToGroup(
      'th_helm_idle_set',
      (i) => `/assets/treasure-hunters/Palm Tree Island/Sprites/Objects/Ship Helm/Ship Helm Idle ${String(i).padStart(2, '0')}.png`,
      1,
      6
    );
    this.addToGroup(
      'th_helm_turn_set',
      (i) => `/assets/treasure-hunters/Palm Tree Island/Sprites/Objects/Ship Helm/Ship Helm Turn ${String(i).padStart(2, '0')}.png`,
      1,
      4
    );
    this.addToGroup(
      'th_barrel_set_idle',
      (i) => `/assets/treasure-hunters/Merchant Ship/Sprites/Barrel/Idle/${i}.png`,
      1,
      // The pack ships a single idle frame for this prop; asking for five
      // fetched four 404s every load.
      1
    );
    this.addToGroup(
      'th_barrel_set_hit',
      (i) => `/assets/treasure-hunters/Merchant Ship/Sprites/Barrel/Hit/${i}.png`,
      1,
      4
    );
    this.addToGroup(
      'th_barrel_set_destroy',
      (i) => `/assets/treasure-hunters/Merchant Ship/Sprites/Barrel/Destroyed/${i}.png`,
      1,
      5
    );
    this.addToGroup(
      'th_box_set_idle',
      (i) => `/assets/treasure-hunters/Merchant Ship/Sprites/Box/Idle/${i}.png`,
      1,
      // The pack ships a single idle frame for this prop; asking for five
      // fetched four 404s every load.
      1
    );
    this.addToGroup(
      'th_box_set_hit',
      (i) => `/assets/treasure-hunters/Merchant Ship/Sprites/Box/Hit/${i}.png`,
      1,
      4
    );
    this.addToGroup(
      'th_box_set_destroy',
      (i) => `/assets/treasure-hunters/Merchant Ship/Sprites/Box/Destroyed/${i}.png`,
      1,
      5
    );
    this.addToGroup(
      'th_chest_idle_set',
      (i) => `/assets/treasure-hunters/Merchant Ship/Sprites/Chest/Idle/${i}.png`,
      1,
      // The pack ships a single idle frame for this prop; asking for five
      // fetched four 404s every load.
      1
    );
    this.addToGroup(
      'th_chest_unlocked_set',
      (i) => `/assets/treasure-hunters/Merchant Ship/Sprites/Chest/Unlocked/${i}.png`,
      1,
      8
    );
    this.addToGroup(
      'ms_anchor_set',
      (i) => `/assets/treasure-hunters/Merchant Ship/Sprites/Ship/Anchor/${i}.png`,
      1,
      2
    );
    this.addToGroup(
      'ms_sail_no_wind_set',
      (i) => `/assets/treasure-hunters/Merchant Ship/Sprites/Ship/Sail/No Wind/${i}.png`,
      1,
      8
    );
    this.addToGroup(
      'ms_sail_wind_set',
      (i) => `/assets/treasure-hunters/Merchant Ship/Sprites/Ship/Sail/Wind/${i}.png`,
      1,
      4
    );
    this.addToGroup(
      'ms_water_top_set',
      (i) => `/assets/treasure-hunters/Merchant Ship/Sprites/Water/Water/Top/${i}.png`,
      1,
      4
    );
    this.addToGroup(
      'ms_water_splash_set',
      (i) => `/assets/treasure-hunters/Merchant Ship/Sprites/Water/Water Splash 1/${i}.png`,
      1,
      5
    );
    this.addToGroup(
      'ms_water_splash2_set',
      (i) => `/assets/treasure-hunters/Merchant Ship/Sprites/Water/Water Splash 2/${i}.png`,
      1,
      4
    );
    this.addToGroup(
      'ms_reflex1_set',
      (i) => `/assets/treasure-hunters/Merchant Ship/Sprites/Water/Reflexes 1/${i}.png`,
      1,
      6
    );
    this.addToGroup(
      'ms_reflex2_set',
      (i) => `/assets/treasure-hunters/Merchant Ship/Sprites/Water/Reflexes 2/${i}.png`,
      1,
      6
    );
    this.addToGroup(
      'ms_ship_idle_set',
      (i) => `/assets/treasure-hunters/Merchant Ship/Sprites/Ship/Ship/Idle/${i}.png`,
      1,
      6
    );
    this.addToGroup(
      'ms_ship_hit_set',
      (i) => `/assets/treasure-hunters/Merchant Ship/Sprites/Ship/Ship/Hit/${i}.png`,
      1,
      4
    );
    this.addToGroup(
      'ms_ship_destroyed_set',
      (i) => `/assets/treasure-hunters/Merchant Ship/Sprites/Ship/Destroyed/${i}.png`,
      1,
      3
    );
    this.addToGroup(
      'ph_bottles_set',
      (i) => `/assets/treasure-hunters/Pirate Ship/Sprites/Decorations/Barrels and Bottles/${String(i).padStart(2, '0')}.png`,
      1,
      6
    );
    this.addToGroup(
      'ph_candle_set',
      (i) => `/assets/treasure-hunters/Pirate Ship/Sprites/Decorations/Candle/Candle/${String(i).padStart(2, '0')}.png`,
      1,
      6
    );
    this.addToGroup(
      'ph_candle_light_set',
      (i) => `/assets/treasure-hunters/Pirate Ship/Sprites/Decorations/Candle/Candle Light/${String(i).padStart(2, '0')}.png`,
      1,
      4
    );
    this.addToGroup(
      'ph_chain_big_set',
      (i) => `/assets/treasure-hunters/Pirate Ship/Sprites/Decorations/Chains/Big/${String(i).padStart(2, '0')}.png`,
      1,
      8
    );
    this.addToGroup(
      'ph_chain_small_set',
      (i) => `/assets/treasure-hunters/Pirate Ship/Sprites/Decorations/Chains/Small/${String(i).padStart(2, '0')}.png`,
      1,
      8
    );
    this.addToGroup(
      'ph_window_set',
      (i) => `/assets/treasure-hunters/Pirate Ship/Sprites/Decorations/Window/Window/${String(i).padStart(2, '0')}.png`,
      1,
      74
    );
    this.addToGroup(
      'ph_window_light_set',
      (i) => `/assets/treasure-hunters/Pirate Ship/Sprites/Decorations/Window/Window Light/${String(i).padStart(2, '0')}.png`,
      1,
      1
    );
    this.addToGroup(
      'ph_door_open_set',
      (i) => `/assets/treasure-hunters/Pirate Ship/Sprites/Decorations/Door/Opening/${String(i).padStart(2, '0')}.png`,
      1,
      5
    );
    this.addToGroup(
      'ph_door_close_set',
      (i) => `/assets/treasure-hunters/Pirate Ship/Sprites/Decorations/Door/Closing/${String(i).padStart(2, '0')}.png`,
      1,
      5
    );
    this.addToGroup(
      'st_cannon_fire_set',
      (i) => `/assets/treasure-hunters/Shooter Traps/Sprites/Cannon/Cannon Fire/${i}.png`,
      1,
      6
    );
    this.addToGroup(
      'st_cannon_fire_effect_set',
      (i) => `/assets/treasure-hunters/Shooter Traps/Sprites/Cannon/Cannon Fire Effect/${i}.png`,
      1,
      6
    );
    this.addToGroup(
      'st_cannon_destroyed_set',
      (i) => `/assets/treasure-hunters/Shooter Traps/Sprites/Cannon/Cannon Destroyed/${i}.png`,
      1,
      4
    );
    this.addToGroup(
      'th_gold_coin_set',
      (i) => `/assets/treasure-hunters/Pirate Treasure/Sprites/Gold Coin/${String(i).padStart(2, '0')}.png`,
      1,
      4
    );
    this.addToGroup(
      'th_red_diamond_set',
      (i) => `/assets/treasure-hunters/Pirate Treasure/Sprites/Red Diamond/${String(i).padStart(2, '0')}.png`,
      1,
      4
    );
    this.addToGroup(
      'th_green_diamond_set',
      (i) => `/assets/treasure-hunters/Pirate Treasure/Sprites/Green Diamond/${String(i).padStart(2, '0')}.png`,
      1,
      4
    );
    this.addToGroup(
      'th_blue_diamond_set',
      (i) => `/assets/treasure-hunters/Pirate Treasure/Sprites/Blue Diamond/${String(i).padStart(2, '0')}.png`,
      1,
      4
    );
    this.addToGroup(
      'th_red_potion_set',
      (i) => `/assets/treasure-hunters/Pirate Treasure/Sprites/Red Potion/${String(i).padStart(2, '0')}.png`,
      1,
      7
    );
    this.addToGroup(
      'th_blue_potion_set',
      (i) => `/assets/treasure-hunters/Pirate Treasure/Sprites/Blue Potion/${String(i).padStart(2, '0')}.png`,
      1,
      7
    );
    this.addToGroup(
      'th_green_potion_set',
      (i) => `/assets/treasure-hunters/Pirate Treasure/Sprites/Green Bottle/${String(i).padStart(2, '0')}.png`,
      1,
      7
    );
    this.addToGroup(
      'th_effect_coin_set',
      (i) => `/assets/treasure-hunters/Pirate Treasure/Sprites/Coin Effect/${String(i).padStart(2, '0')}.png`,
      1,
      3
    );
  }

  public update(dt: number) {
    this.animTimer += dt;
  }

  /**
   * Draw animated hero character with 100% UNIQUE DEDICATED SPRITE MODELS
   */

  /**
   * Draws a Chierit Elementals hero. Attack playback is driven by its own clock
   * rather than by attackTimer directly: attackTimer counts down from a
   * duration this method never sees, so anchoring on the moment the swing
   * started is the only way to land on the right frame.
   */
  private drawElementalsHero(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    cid: string,
    state: 'idle' | 'run' | 'attack' | 'jump' | 'dead',
    facing: number,
    attackTimer: number,
    skillIndex: number
  ) {
    const set = HERO_SPRITES[cid];

    let anim: string;
    if (state === 'dead') anim = set.anims.death ? 'death' : 'idle';
    else if (state === 'attack') anim = attackAnimFor(set, skillIndex);
    else if (state === 'jump') anim = 'jump_up';
    else if (state === 'run') anim = 'run';
    else anim = 'idle';

    const count = set.anims[anim] || set.anims.idle;
    const fps = HERO_FPS[anim] || 12;

    let frame: number;
    if (state === 'attack') {
      const clock = this.atkClock[cid] || (this.atkClock[cid] = { start: this.animTimer, prev: 0 });
      // attackTimer rising means a fresh swing began this frame.
      if (attackTimer > clock.prev) clock.start = this.animTimer;
      clock.prev = attackTimer;
      frame = Math.min(count - 1, Math.floor((this.animTimer - clock.start) * fps));
    } else {
      if (this.atkClock[cid]) this.atkClock[cid].prev = 0;
      frame = Math.floor(this.animTimer * fps) % count;
    }

    // Two pack shapes: a folder of frames, or one horizontal strip per
    // animation that has to be sliced at draw time.
    const stripSrc = set.strips?.[anim];
    const img = this.getImage(stripSrc || heroFrame(cid, anim, frame));
    if (!img || !img.complete || !img.naturalWidth) return;

    const sx = stripSrc ? frame * set.frameW : 0;
    const w = set.frameW * set.scale;
    const h = set.frameH * set.scale;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(x), Math.round(y));
    if (facing < 0) ctx.scale(-1, 1);
    // Source frames are bottom-anchored on the character's feet.
    ctx.drawImage(
      img, sx, 0, set.frameW, set.frameH,
      Math.round(-w / 2), Math.round(-h), Math.round(w), Math.round(h)
    );
    ctx.restore();
  }

  public drawHero(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    classId: string,
    state: 'idle' | 'run' | 'attack' | 'jump' | 'dead',
    facing: number,
    attackTimer: number = 0,
    colorTint?: string,
    skillIndex: number = 0
  ) {
    const cid = classId.toLowerCase();

    // Classes with an imported Elementals animation set draw from it; everything
    // else falls through to its original hand-wired sprite model.
    if (HERO_SPRITES[cid]) {
      this.drawElementalsHero(ctx, x, y, cid, state, facing, attackTimer, skillIndex);
      return;
    }

    ctx.save();

    // 1. Priest (Water Priestess 288x128 - Divine Holy Cleric)
    if (cid === 'priest') {
      ctx.filter = 'drop-shadow(0 0 10px rgba(254, 240, 138, 0.9))';
      this.drawPriestessHero(ctx, x, y, state, facing, attackTimer);
    }
    // 2. Paladin (Medieval King 155x155)
    else if (cid === 'paladin') {
      ctx.filter = 'drop-shadow(0 0 10px rgba(251, 191, 36, 0.9))';
      this.drawKingHero(ctx, x, y, state, facing, attackTimer);
    }
    // 3. Berserker (Medieval Warrior 2 150x150 - War Axes)
    else if (cid === 'berserker') {
      ctx.filter = 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.85))';
      this.drawBerserkerHero(ctx, x, y, state, facing, attackTimer);
    }
    // 4. Dragoon (Medieval Warrior 3 135x135 - Halberd & Polearm Spearman)
    else if (cid === 'dragoon') {
      ctx.filter = 'drop-shadow(0 0 8px rgba(56, 189, 248, 0.85))';
      this.drawDragoonHero(ctx, x, y, state, facing, attackTimer);
    }
    // 5. Warrior (Hero Knight 180x180 - Full Plate Greatsword)
    else if (cid === 'warrior') {
      ctx.filter = 'drop-shadow(0 0 6px rgba(244, 180, 27, 0.5)) contrast(1.2)';
      this.drawKnightHero(ctx, x, y, state, facing, attackTimer);
    }
    // 6. Archer (Huntress 150x150)
    else if (cid === 'archer') {
      this.drawHuntressHero(ctx, x, y, state, facing, attackTimer);
    }
    // 7. Ninja (Martial Hero 200x200)
    else if (cid === 'ninja') {
      this.drawMartialHero(ctx, x, y, state, facing, attackTimer);
    }
    // 8. Necromancer (Evil Wizard 150x150)
    else if (cid === 'necromancer') {
      ctx.filter = 'drop-shadow(0 0 10px rgba(168, 85, 247, 0.8))';
      this.drawEvilWizardHero(ctx, x, y, state, facing, attackTimer);
    }
    // 9. Mage (Wizard Pack 231x190)
    else if (cid === 'mage') {
      ctx.filter = 'drop-shadow(0 0 10px rgba(59, 130, 246, 0.8))';
      this.drawWizardHero(ctx, x, y, state, facing, attackTimer);
    }
    // 10. Assassin (High Forest Rogue 80x80)
    else {
      ctx.filter = 'drop-shadow(0 0 8px rgba(192, 132, 252, 0.8)) hue-rotate(275deg) saturate(1.8)';
      this.drawForestHero(ctx, x, y, state, facing, attackTimer);
    }

    ctx.restore();
  }

  /**
   * Draw Elementals Water Priestess (Priest) 288x128 Sprite
   */
  private drawPriestessHero(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    state: 'idle' | 'run' | 'attack' | 'jump' | 'dead',
    facing: number,
    attackTimer: number
  ) {
    let list = this.priestessIdleImgs;
    let fps = 8;
    let currentFrame = 0;

    if (state === 'attack') {
      list = this.priestessHealImgs.length > 0 ? this.priestessHealImgs : this.priestessAtkImgs;
      fps = 14;
      currentFrame = Math.min(list.length - 1, Math.floor(attackTimer * fps));
    } else if (state === 'run' || state === 'jump') {
      list = this.priestessWalkImgs;
      fps = 10;
      currentFrame = Math.floor(this.animTimer * fps) % (list.length || 1);
    } else if (state === 'dead') {
      list = this.priestessDeathImgs;
      fps = 6;
      currentFrame = Math.min(list.length - 1, Math.floor(this.animTimer * fps));
    } else {
      currentFrame = Math.floor(this.animTimer * fps) % (list.length || 1);
    }

    const img = list[currentFrame];
    if (!img || !img.complete) return;

    const frameW = 288;
    const frameH = 128;
    const scale = 1.50;
    const destW = frameW * scale;
    const destH = frameH * scale;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);

    if (facing < 0) {
      ctx.scale(-1, 1);
    }

    // Shadow on ground
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(
      img,
      0,
      0,
      frameW,
      frameH,
      -218,
      -(destH - 5),
      destW,
      destH
    );

    ctx.restore();
  }

  /**
   * Draw Medieval Warrior 3 (Dragoon - Halberd & Polearm Spearman) 135x135 Sprite
   */
  private drawDragoonHero(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    state: 'idle' | 'run' | 'attack' | 'jump' | 'dead',
    facing: number,
    attackTimer: number
  ) {
    let imgKey = 'drag_idle';
    let frameCount = 10;
    let fps = 8;
    let currentFrame = 0;

    if (state === 'attack') {
      imgKey = 'drag_atk3';
      frameCount = 5;
      fps = 14;
      currentFrame = Math.min(frameCount - 1, Math.floor(attackTimer * fps));
    } else if (state === 'run') {
      imgKey = 'drag_run';
      frameCount = 6;
      fps = 10;
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    } else if (state === 'jump') {
      imgKey = 'drag_jump';
      frameCount = 2;
      fps = 6;
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    } else if (state === 'dead') {
      imgKey = 'drag_death';
      frameCount = 9;
      fps = 6;
      currentFrame = Math.min(frameCount - 1, Math.floor(this.animTimer * fps));
    } else {
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    }

    const img = this.images[imgKey];
    if (!img) return;

    const frameW = 135;
    const frameH = 135;
    const scale = 1.45;
    const destW = frameW * scale;
    const destH = frameH * scale;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);

    if (facing < 0) {
      ctx.scale(-1, 1);
    }

    // Shadow on ground
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(
      img,
      currentFrame * frameW,
      0,
      frameW,
      frameH,
      -96,
      -(destH - 72),
      destW,
      destH
    );

    ctx.restore();
  }

  /**
   * Draw Hero Knight (Warrior - Full Plate Greatsword Knight) 180x180 Sprite
   */
  private drawKnightHero(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    state: 'idle' | 'run' | 'attack' | 'jump' | 'dead',
    facing: number,
    attackTimer: number
  ) {
    let imgKey = 'knight_idle';
    let frameCount = 11;
    let fps = 8;
    let currentFrame = 0;

    if (state === 'attack') {
      imgKey = 'knight_atk1';
      frameCount = 7;
      fps = 16;
      currentFrame = Math.min(frameCount - 1, Math.floor(attackTimer * fps));
    } else if (state === 'run') {
      imgKey = 'knight_run';
      frameCount = 8;
      fps = 10;
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    } else if (state === 'jump') {
      imgKey = 'knight_jump';
      frameCount = 3;
      fps = 6;
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    } else if (state === 'dead') {
      imgKey = 'knight_death';
      frameCount = 11;
      fps = 6;
      currentFrame = Math.min(frameCount - 1, Math.floor(this.animTimer * fps));
    } else {
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    }

    const img = this.images[imgKey];
    if (!img) return;

    const frameW = 180;
    const frameH = 180;
    const scale = 1.15;
    const destW = frameW * scale;
    const destH = frameH * scale;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);

    if (facing < 0) {
      ctx.scale(-1, 1);
    }

    // Shadow on ground
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(
      img,
      currentFrame * frameW,
      0,
      frameW,
      frameH,
      -110,
      -(destH - 77),
      destW,
      destH
    );

    ctx.restore();
  }

  /**
   * Draw Medieval Warrior 2 (Berserker) 150x150 Sprite
   */
  private drawBerserkerHero(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    state: 'idle' | 'run' | 'attack' | 'jump' | 'dead',
    facing: number,
    attackTimer: number
  ) {
    let imgKey = 'bzerk_idle';
    let frameCount = 8;
    let fps = 8;
    let currentFrame = 0;

    if (state === 'attack') {
      imgKey = 'bzerk_atk1';
      frameCount = 4;
      fps = 14;
      currentFrame = Math.min(frameCount - 1, Math.floor(attackTimer * fps));
    } else if (state === 'run') {
      imgKey = 'bzerk_run';
      frameCount = 8;
      fps = 10;
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    } else if (state === 'jump') {
      imgKey = 'bzerk_jump';
      frameCount = 2;
      fps = 6;
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    } else if (state === 'dead') {
      imgKey = 'bzerk_death';
      frameCount = 6;
      fps = 6;
      currentFrame = Math.min(frameCount - 1, Math.floor(this.animTimer * fps));
    } else {
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    }

    const img = this.images[imgKey];
    if (!img) return;

    const frameW = 150;
    const frameH = 150;
    const scale = 1.35;
    const destW = frameW * scale;
    const destH = frameH * scale;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);

    if (facing < 0) {
      ctx.scale(-1, 1);
    }

    // Shadow on ground
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(
      img,
      currentFrame * frameW,
      0,
      frameW,
      frameH,
      -101,
      -(destH - 75),
      destW,
      destH
    );

    ctx.restore();
  }

  /**
   * Draw Medieval King (Paladin) 155x155 Sprite
   */
  private drawKingHero(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    state: 'idle' | 'run' | 'attack' | 'jump' | 'dead',
    facing: number,
    attackTimer: number
  ) {
    let imgKey = 'king_idle';
    let frameCount = 6;
    let fps = 8;
    let currentFrame = 0;

    if (state === 'attack') {
      imgKey = 'king_atk1';
      frameCount = 6;
      fps = 16;
      currentFrame = Math.min(frameCount - 1, Math.floor(attackTimer * fps));
    } else if (state === 'run') {
      imgKey = 'king_run';
      frameCount = 8;
      fps = 10;
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    } else if (state === 'jump') {
      imgKey = 'king_jump';
      frameCount = 2;
      fps = 6;
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    } else if (state === 'dead') {
      imgKey = 'king_death';
      frameCount = 11;
      fps = 6;
      currentFrame = Math.min(frameCount - 1, Math.floor(this.animTimer * fps));
    } else {
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    }

    const img = this.images[imgKey];
    if (!img) return;

    const frameW = 155;
    const frameH = 155;
    const scale = 0.70;
    const destW = frameW * scale;
    const destH = frameH * scale;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);

    if (facing < 0) {
      ctx.scale(-1, 1);
    }

    // Shadow on ground
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(
      img,
      currentFrame * frameW,
      0,
      frameW,
      frameH,
      -46,
      -(destH - 28),
      destW,
      destH
    );

    ctx.restore();
  }

  /**
   * Draw Huntress (Archer) 150x150 Sprite
   */
  private drawHuntressHero(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    state: 'idle' | 'run' | 'attack' | 'jump' | 'dead',
    facing: number,
    attackTimer: number
  ) {
    let imgKey = 'huntress_idle';
    let frameCount = 8;
    let fps = 8;
    let currentFrame = 0;

    if (state === 'attack') {
      imgKey = 'huntress_atk2';
      frameCount = 5;
      fps = 14;
      currentFrame = Math.min(frameCount - 1, Math.floor(attackTimer * fps));
    } else if (state === 'run') {
      imgKey = 'huntress_run';
      frameCount = 8;
      fps = 10;
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    } else if (state === 'jump') {
      imgKey = 'huntress_jump';
      frameCount = 2;
      fps = 6;
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    } else if (state === 'dead') {
      imgKey = 'huntress_death';
      frameCount = 8;
      fps = 6;
      currentFrame = Math.min(frameCount - 1, Math.floor(this.animTimer * fps));
    } else {
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    }

    const img = this.images[imgKey];
    if (!img) return;

    const frameW = 150;
    const frameH = 150;
    const scale = 1.35;
    const destW = frameW * scale;
    const destH = frameH * scale;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);

    if (facing < 0) {
      ctx.scale(-1, 1);
    }

    // Shadow on ground
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(
      img,
      currentFrame * frameW,
      0,
      frameW,
      frameH,
      -103,
      -(destH - 72),
      destW,
      destH
    );

    ctx.restore();
  }

  /**
   * Draw Martial Hero (Ninja) 200x200 Sprite
   */
  private drawMartialHero(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    state: 'idle' | 'run' | 'attack' | 'jump' | 'dead',
    facing: number,
    attackTimer: number
  ) {
    let imgKey = 'martial_idle';
    let frameCount = 8;
    let fps = 8;
    let currentFrame = 0;

    if (state === 'attack') {
      imgKey = 'martial_atk1';
      frameCount = 6;
      fps = 16;
      currentFrame = Math.min(frameCount - 1, Math.floor(attackTimer * fps));
    } else if (state === 'run') {
      imgKey = 'martial_run';
      frameCount = 8;
      fps = 10;
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    } else if (state === 'jump') {
      imgKey = 'martial_jump';
      frameCount = 2;
      fps = 6;
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    } else if (state === 'dead') {
      imgKey = 'martial_death';
      frameCount = 6;
      fps = 6;
      currentFrame = Math.min(frameCount - 1, Math.floor(this.animTimer * fps));
    } else {
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    }

    const img = this.images[imgKey];
    if (!img) return;

    const frameW = 200;
    const frameH = 200;
    const scale = 1.10;
    const destW = frameW * scale;
    const destH = frameH * scale;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);

    if (facing < 0) {
      ctx.scale(-1, 1);
    }

    // Shadow on ground
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(
      img,
      currentFrame * frameW,
      0,
      frameW,
      frameH,
      -103,
      -(destH - 86),
      destW,
      destH
    );

    ctx.restore();
  }

  /**
   * Draw Evil Wizard (Necromancer) 150x150 Sprite
   */
  private drawEvilWizardHero(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    state: 'idle' | 'run' | 'attack' | 'jump' | 'dead',
    facing: number,
    attackTimer: number
  ) {
    let imgKey = 'ewizard_idle';
    let frameCount = 8;
    let fps = 8;
    let currentFrame = 0;

    if (state === 'attack') {
      imgKey = 'ewizard_atk';
      frameCount = 8;
      fps = 16;
      currentFrame = Math.min(frameCount - 1, Math.floor(attackTimer * fps));
    } else if (state === 'run' || state === 'jump') {
      imgKey = 'ewizard_run';
      frameCount = 8;
      fps = 10;
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    } else if (state === 'dead') {
      imgKey = 'ewizard_death';
      frameCount = 5;
      fps = 5;
      currentFrame = Math.min(frameCount - 1, Math.floor(this.animTimer * fps));
    } else {
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    }

    const img = this.images[imgKey];
    if (!img) return;

    const frameW = 150;
    const frameH = 150;
    const scale = 1.15;
    const destW = frameW * scale;
    const destH = frameH * scale;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);

    if (facing < 0) {
      ctx.scale(-1, 1);
    }

    // Shadow on ground
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(
      img,
      currentFrame * frameW,
      0,
      frameW,
      frameH,
      -83,
      -(destH - 58),
      destW,
      destH
    );

    ctx.restore();
  }

  /**
   * Draw Wizard Pack Character Sprite (Mage)
   */
  private drawWizardHero(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    state: 'idle' | 'run' | 'attack' | 'jump' | 'dead',
    facing: number,
    attackTimer: number
  ) {
    let imgKey = 'wizard_idle';
    let frameCount = 6;
    let fps = 8;
    let currentFrame = 0;

    if (state === 'attack') {
      imgKey = 'wizard_atk1';
      frameCount = 8;
      fps = 16;
      currentFrame = Math.min(frameCount - 1, Math.floor(attackTimer * fps));
    } else if (state === 'run') {
      imgKey = 'wizard_run';
      frameCount = 8;
      fps = 10;
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    } else if (state === 'jump') {
      imgKey = 'wizard_jump';
      frameCount = 2;
      fps = 6;
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    } else if (state === 'dead') {
      imgKey = 'wizard_death';
      frameCount = 7;
      fps = 6;
      currentFrame = Math.min(frameCount - 1, Math.floor(this.animTimer * fps));
    } else {
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    }

    const img = this.images[imgKey];
    if (!img) return;

    const frameW = 231;
    const frameH = 190;
    const scale = 0.70;
    const destW = frameW * scale;
    const destH = frameH * scale;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);

    if (facing < 0) {
      ctx.scale(-1, 1);
    }

    // Shadow on ground
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(
      img,
      currentFrame * frameW,
      0,
      frameW,
      frameH,
      -77,
      -(destH - 35),
      destW,
      destH
    );

    ctx.restore();
  }

  /**
   * Draw High Forest Character Sprite (Assassin)
   */
  private drawForestHero(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    state: 'idle' | 'run' | 'attack' | 'jump' | 'dead',
    facing: number,
    attackTimer: number
  ) {
    let imgKey = 'hero_idle';
    let frameCount = 4;
    let frameW = 64;
    let frameH = 80;
    let fps = 6;
    let currentFrame = 0;

    if (state === 'attack') {
      imgKey = 'hero_attack';
      frameCount = 8;
      frameW = 96;
      frameH = 80;
      fps = 16;
      currentFrame = Math.min(frameCount - 1, Math.floor(attackTimer * fps));
    } else if (state === 'run') {
      imgKey = 'hero_run';
      frameCount = 8;
      frameW = 80;
      frameH = 80;
      fps = 10;
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    } else if (state === 'jump') {
      imgKey = 'hero_jump';
      frameCount = 15;
      frameW = 64;
      frameH = 64;
      fps = 12;
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    } else if (state === 'dead') {
      imgKey = 'hero_dead';
      frameCount = 8;
      frameW = 80;
      frameH = 64;
      fps = 6;
      currentFrame = Math.min(frameCount - 1, Math.floor(this.animTimer * fps));
    } else {
      currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    }

    const img = this.images[imgKey];
    if (!img) return;

    const scale = 1.20;
    const destW = frameW * scale;
    const destH = frameH * scale;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);

    if (facing < 0) {
      ctx.scale(-1, 1);
    }

    // Shadow on ground
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(
      img,
      currentFrame * frameW,
      0,
      frameW,
      frameH,
      -42,
      -(destH - 30),
      destW,
      destH
    );

    ctx.restore();
  }

  /**
   * Draw animated mob / monster / boss sprite
   */
  public drawMob(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    mobType: string,
    state: 'idle' | 'walk' | 'run' | 'hit' | 'dead',
    facing: number,
    isBoss: boolean = false,
    hitStun: number = 0
  ) {
    const lower = mobType.toLowerCase();

    // 0. Epic Boss: NightBorne Lord of Darkness
    if (lower.includes('nightborne') || lower.includes('lich') || lower.includes('dragon') || (isBoss && lower.includes('malakar'))) {
      this.drawNightBorneBoss(ctx, x, y, state, facing, hitStun);
      return;
    }

    // 0b. Reaper / Bringer of Death Boss
    if (lower.includes('reaper') || lower.includes('bringer') || lower.includes('leviathan') || lower.includes('behemoth') || lower.includes('overlord')) {
      this.drawReaperBoss(ctx, x, y, state, facing, hitStun);
      return;
    }

    // 1. Skeleton Warrior
    if (lower.includes('skeleton')) {
      this.drawFantasyMob(ctx, x, y, 'skel', state, facing, isBoss, hitStun);
      return;
    }

    // 2. Goblin Cutthroat / Rogue / Shaman
    if (lower.includes('goblin')) {
      this.drawFantasyMob(ctx, x, y, 'gob', state, facing, isBoss, hitStun);
      return;
    }

    // 3. Flying Eye / Bat / Imp
    if (lower.includes('flying') || lower.includes('eye') || lower.includes('bat') || lower.includes('imp')) {
      this.drawFantasyMob(ctx, x, y, 'eye', state, facing, isBoss, hitStun);
      return;
    }

    // 4. Mushroom / Slime
    if (lower.includes('mushroom') || lower.includes('slime')) {
      this.drawFantasyMob(ctx, x, y, 'mush', state, facing, isBoss, hitStun);
      return;
    }

    // 5. Tiny RPG Orc / Warlord Grimjaw / Death Knight / Bosses
    if (lower.includes('orc') || lower.includes('warlord') || lower.includes('grimjaw') || lower.includes('titan') || lower.includes('golem') || lower.includes('knight') || lower.includes('sentry') || lower.includes('forge')) {
      this.drawOrcMob(ctx, x, y, state, facing, isBoss, hitStun);
      return;
    }

    // 5b. Wraith / Ghost / Phantom / Sorcerer / Siren -> Skeleton with purple tint
    if (lower.includes('wraith') || lower.includes('phantom') || lower.includes('ghost') || lower.includes('sorcerer') || lower.includes('siren') || lower.includes('stalker') || lower.includes('slayer')) {
      this.drawFantasyMob(ctx, x, y, 'skel', state, facing, isBoss, hitStun);
      return;
    }

    // 5c. Spider / Crab / Hound / Wolf -> Mushroom style (low to ground)
    if (lower.includes('spider') || lower.includes('crab') || lower.includes('hound') || lower.includes('wolf')) {
      this.drawFantasyMob(ctx, x, y, 'mush', state, facing, isBoss, hitStun);
      return;
    }

    // 5d. Harpy / Drake -> Flying Eye
    if (lower.includes('harpy') || lower.includes('drake')) {
      this.drawFantasyMob(ctx, x, y, 'eye', state, facing, isBoss, hitStun);
      return;
    }

    // 6. High Forest Mobs (Boar, Snail, Bee)
    let imgKey = 'boar_run';
    let frameCount = 6;
    let frameW = 48;
    let frameH = 32;
    let fps = 8;

    if (lower.includes('bee')) {
      imgKey = state === 'hit' ? 'bee_hit' : (state === 'walk' ? 'bee_fly' : 'bee_attack');
      frameCount = 4;
      frameW = 64;
      frameH = 64;
      fps = 10;
    } else if (lower.includes('snail')) {
      imgKey = state === 'hit' ? 'snail_hide' : (state === 'dead' ? 'snail_dead' : 'snail_walk');
      frameCount = 8;
      frameW = 48;
      frameH = 32;
      fps = 6;
    } else {
      // Boar
      imgKey = state === 'hit' ? 'boar_hit' : (state === 'walk' ? 'boar_walk' : 'boar_run');
      frameCount = imgKey === 'boar_hit' ? 4 : (imgKey === 'boar_idle' ? 4 : 6);
      frameW = 48;
      frameH = 32;
      fps = 8;
    }

    const img = this.images[imgKey];
    if (!img) return;

    const currentFrame = Math.floor(this.animTimer * fps) % frameCount;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);

    if (facing < 0) {
      ctx.scale(-1, 1);
    }

    const scale = isBoss ? 2.8 : 1.5;
    const destW = frameW * scale;
    const destH = frameH * scale;
    if (hitStun > 0) {
      ctx.filter = 'brightness(2.2) contrast(1.5)';
    }

    ctx.drawImage(
      img,
      currentFrame * frameW,
      0,
      frameW,
      frameH,
      -destW / 2,
      -(destH - 24),
      destW,
      destH
    );

    ctx.restore();
  }



  /**
   * Draw NightBorne Boss from Sheet (1840x400)
   */
  private drawNightBorneBoss(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    state: 'idle' | 'walk' | 'run' | 'hit' | 'dead',
    facing: number,
    hitStun: number
  ) {
    const img = this.images['nightborne_sheet'];
    if (!img) return;

    const frameW = 80;
    const frameH = 100;
    let row = 0; // row 0: idle, 1: run, 2: attack, 3: hurt/death
    let frameCount = 9;
    let fps = 8;

    if (state === 'dead') {
      row = 3;
      frameCount = 15;
      fps = 6;
    } else if (state === 'hit' || hitStun > 0) {
      row = 3;
      frameCount = 5;
      fps = 8;
    } else if (state === 'run' || state === 'walk') {
      row = 2; // combat slash charge
      frameCount = 12;
      fps = 10;
    }

    const currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    const scale = 2.4;
    const destW = frameW * scale;
    const destH = frameH * scale;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);

    if (facing > 0) {
      ctx.scale(-1, 1);
    }

    if (hitStun > 0) {
      ctx.filter = 'brightness(2.2) contrast(1.5)';
    }

    ctx.drawImage(
      img,
      currentFrame * frameW,
      row * frameH,
      frameW,
      frameH,
      -destW / 2,
      -(destH - 120),
      destW,
      destH
    );

    ctx.restore();
  }

  /**
   * Draw Monsters_Creatures_Fantasy 150x150 Sprites (Skeleton, Goblin, Flying Eye, Mushroom)
   */

  private drawReaperBoss(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    state: 'idle' | 'walk' | 'run' | 'hit' | 'dead',
    facing: number,
    hitStun: number
  ) {
    const img = this.images['reaper_sheet'];
    if (!img) return;

    // Bringer of Death spritesheet: 1120x744, 8 cols
    // Row 0: Idle (8 frames), Row 1: Walk (8), Row 2: Attack (8), Row 3: Cast (8)
    // Row 4: Spell (8), Row 5: Hurt (3), Row 6: Death (10), Row 7: Walk2 (8)
    const frameW = 140;
    const frameH = 93;
    let row = 0;
    let frameCount = 8;
    let fps = 8;

    if (state === 'dead') {
      row = 6;
      frameCount = 8;
      fps = 6;
    } else if (state === 'hit' || hitStun > 0) {
      row = 5;
      frameCount = 3;
      fps = 8;
    } else if (state === 'run' || state === 'walk') {
      row = 1;
      frameCount = 8;
      fps = 10;
    } else {
      row = 0;
      frameCount = 8;
      fps = 6;
    }

    const currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    const scale = 2.8;
    const destW = frameW * scale;
    const destH = frameH * scale;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);

    if (facing > 0) {
      ctx.scale(-1, 1);
    }

    if (hitStun > 0) {
      ctx.filter = 'brightness(2.2) contrast(1.5)';
    }

    ctx.drawImage(
      img,
      currentFrame * frameW,
      row * frameH,
      frameW,
      frameH,
      -destW / 2,
      -(destH - 40),
      destW,
      destH
    );

    ctx.restore();
  }

  private drawFantasyMob(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    prefix: 'skel' | 'gob' | 'eye' | 'mush',
    state: 'idle' | 'walk' | 'run' | 'hit' | 'dead',
    facing: number,
    isBoss: boolean,
    hitStun: number
  ) {
    let imgKey = `${prefix}_idle`;
    let frameCount = 4;
    let fps = 8;

    if (state === 'hit' || hitStun > 0) {
      imgKey = `${prefix}_hit`;
      frameCount = 4;
      fps = 8;
    } else if (state === 'dead') {
      imgKey = `${prefix}_death`;
      frameCount = 4;
      fps = 5;
    } else if (state === 'run' || state === 'walk') {
      imgKey = prefix === 'skel' ? 'skel_walk' : (prefix === 'eye' ? 'eye_flight' : `${prefix}_run`);
      frameCount = prefix === 'skel' ? 4 : 8;
      fps = 9;
    }

    const img = this.images[imgKey] || this.images[`${prefix}_idle`];
    if (!img) return;

    const frameW = 150;
    const frameH = 150;
    const currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    const scale = isBoss ? 2.0 : 1.15;
    const destW = frameW * scale;
    const destH = frameH * scale;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);

    if (facing > 0) {
      ctx.scale(-1, 1);
    }

    if (hitStun > 0) {
      ctx.filter = 'brightness(2.2) contrast(1.5)';
    }

    ctx.drawImage(
      img,
      currentFrame * frameW,
      0,
      frameW,
      frameH,
      -destW / 2,
      -(destH - 85),
      destW,
      destH
    );

    ctx.restore();
  }

  /**
   * Draw Tiny RPG Orc 100x100 Sprite
   */
  private drawOrcMob(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    state: 'idle' | 'walk' | 'run' | 'hit' | 'dead',
    facing: number,
    isBoss: boolean,
    hitStun: number
  ) {
    let imgKey = 'orc_walk';
    let frameCount = 8;
    let fps = 8;

    if (state === 'hit' || hitStun > 0) {
      imgKey = 'orc_hurt';
      frameCount = 4;
      fps = 6;
    } else if (state === 'dead') {
      imgKey = 'orc_death';
      frameCount = 4;
      fps = 4;
    } else if (state === 'run') {
      imgKey = 'orc_atk1';
      frameCount = 6;
      fps = 10;
    }

    const img = this.images[imgKey];
    if (!img) return;

    const frameW = 100;
    const frameH = 100;
    const currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    const scale = isBoss ? 2.2 : 1.35;
    const destW = frameW * scale;
    const destH = frameH * scale;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);

    if (facing > 0) {
      ctx.scale(-1, 1);
    }

    if (hitStun > 0) {
      ctx.filter = 'brightness(2.2) contrast(1.5)';
    }

    ctx.drawImage(
      img,
      currentFrame * frameW,
      0,
      frameW,
      frameH,
      -destW / 2,
      -(destH - 55),
      destW,
      destH
    );

    ctx.restore();
  }

  /**
   * Draw Authentic GothicVania Town NPC with animated idle breathing
   */
  public drawGothicTownNPC(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    npcType: 'oldman' | 'bearded' | 'hatman' | 'woman',
    facing: number = 1
  ) {
    let imgKey = 'gv_oldman_idle';
    let frameCount = 6;
    let frameW = 36;
    let frameH = 44;

    if (npcType === 'bearded') {
      imgKey = 'gv_bearded_idle';
      frameCount = 5;
      frameW = 40;
      frameH = 47;
    } else if (npcType === 'hatman') {
      imgKey = 'gv_hatman_idle';
      frameCount = 4;
      frameW = 38;
      frameH = 45;
    } else if (npcType === 'woman') {
      imgKey = 'gv_woman_idle';
      frameCount = 4;
      frameW = 36;
      frameH = 44;
    }

    const img = this.images[imgKey];
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const fps = 6;
    const currentFrame = Math.floor(this.animTimer * fps) % frameCount;
    const scale = 2.0;
    const destW = frameW * scale;
    const destH = frameH * scale;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);

    if (facing > 0) {
      ctx.scale(-1, 1);
    }

    ctx.drawImage(
      img,
      currentFrame * frameW,
      0,
      frameW,
      frameH,
      -destW / 2,
      -destH,
      destW,
      destH
    );

    ctx.restore();
  }

  /**
   * Draw Animated Green Portal Sprite Sheet (512x192, 8 cols x 3 rows, 64x64 per frame)
   * Row 0 = Idle loop, Row 1 = Opening, Row 2 = Closing
   */
  public drawDimensionalPortal(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const time = Date.now() / 1000;
    const portalImg = this.images['green_portal'];

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // --- 1. Ambient Green Glow Aura on the Ground ---
    const glowRadius = 75 + Math.sin(time * 3) * 8;
    const groundGlow = ctx.createRadialGradient(x, y - 60, 10, x, y - 60, glowRadius);
    groundGlow.addColorStop(0, 'rgba(74, 222, 128, 0.35)');
    groundGlow.addColorStop(0.5, 'rgba(34, 197, 94, 0.12)');
    groundGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = groundGlow;
    ctx.beginPath();
    ctx.arc(x, y - 60, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // --- 2. Animated Green Portal Sprite ---
    if (portalImg && portalImg.complete && portalImg.naturalWidth > 0) {
      const cols = 4;
      const rows = 2;
      const totalFrames = 7;
      const frameW = portalImg.naturalWidth / cols;   // 64
      const frameH = portalImg.naturalHeight / rows;  // 64
      
      const frameIndex = Math.floor(this.animTimer * 10) % totalFrames;
      const col = frameIndex % cols;
      const row = Math.floor(frameIndex / cols);

      const scale = 3.0; // Scale up from 64px to ~192px
      const destW = frameW * scale;
      const destH = frameH * scale;

      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 20;
      ctx.drawImage(
        portalImg,
        col * frameW,
        row * frameH,
        frameW,
        frameH,
        x - destW / 2,
        y - destH + 10, // anchor to ground
        destW,
        destH
      );
    } else {
      // Fallback: Draw a nice radial gradient portal if sprite not loaded
      const fallbackGrad = ctx.createRadialGradient(x, y - 70, 8, x, y - 70, 50);
      fallbackGrad.addColorStop(0, '#ffffff');
      fallbackGrad.addColorStop(0.3, '#4ade80');
      fallbackGrad.addColorStop(0.7, '#15803d');
      fallbackGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = fallbackGrad;
      ctx.beginPath();
      ctx.ellipse(x, y - 70, 45 + Math.sin(time * 4) * 4, 65 + Math.cos(time * 3) * 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- 3. Floating Emerald Sparkle Particles ---
    for (let s = 0; s < 8; s++) {
      const angle = time * 2.2 + (s * Math.PI * 2 / 8);
      const radiusX = 35 + Math.sin(time * 2.5 + s) * 12;
      const radiusY = 50 + Math.cos(time * 2 + s) * 15;
      const px = x + Math.cos(angle) * radiusX;
      const py = (y - 80) + Math.sin(angle) * radiusY;

      ctx.fillStyle = s % 3 === 0 ? '#ffd700' : s % 3 === 1 ? '#4ade80' : '#86efac';
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(px, py, 2 + Math.sin(time * 5 + s) * 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- 4. Glowing Title Above Portal ---
    ctx.font = 'bold 13px "Cinzel", serif';
    ctx.fillStyle = '#4ade80';
    ctx.shadowColor = '#22c55e';
    ctx.shadowBlur = 14;
    ctx.textAlign = 'center';
    ctx.fillText('❖ DIMENSIONAL GATEWAY ❖', x, y - 185);

    ctx.restore();
  }

  /**
   * Draw Clean, High-Contrast Parallax Backgrounds, Themed Grounds, and Atmosphere
   * Uses 100% Authentic GothicVania Environment Layers & Tilesets
   */

  /**
   * Generic parallax renderer. A layer is tiled horizontally so it never runs
   * out, offset by the camera times its scroll factor.
   *
   * Returns false when the theme has no data-driven map, so drawEnvironment can
   * fall through to its original hand-written branch for themes whose art has
   * not been replaced yet.
   */
  private drawParallaxTheme(
    ctx: CanvasRenderingContext2D,
    theme: string,
    camX: number,
    width: number,
    height: number,
    horizonY: number
  ): boolean {
    const map = MAPS[theme];
    if (!map) return false;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = map.sky;
    ctx.fillRect(0, 0, width, height);

    const now = Date.now() / 1000;
    for (const layer of map.layers) {
      const img = this.getImage(layer.src);
      if (!img || !img.complete || !img.naturalWidth) continue;
      if (layer.scatter && layer.scatter.length) {
        this.drawScatterLayer(ctx, layer, img, camX, width, height, horizonY, now);
      } else {
        this.drawParallaxLayer(ctx, layer, img, camX, width, height, horizonY, now);
      }
    }

    // The earth goes on last, in front of the scenery. It is the surface the
    // player stands on, not part of the backdrop - painted behind the layers it
    // disappeared under any art that reached the bottom of the view, and the
    // characters read as floating again with no ground line anywhere.
    if (map.ground) this.drawGroundBand(ctx, map.ground, camX, width, height, horizonY);
    else if (map.floor) this.drawFloorBand(ctx, map.floor, width, height, horizonY);

    ctx.restore();
    return true;
  }

  private drawParallaxLayer(
    ctx: CanvasRenderingContext2D,
    layer: MapLayer,
    img: HTMLImageElement,
    camX: number,
    width: number,
    height: number,
    horizonY: number,
    now: number
  ) {
    const sx = layer.rect?.sx ?? 0;
    const sy = layer.rect?.sy ?? 0;
    const sw = layer.rect?.sw ?? img.naturalWidth;
    const sh = layer.rect?.sh ?? img.naturalHeight;
    if (sw <= 0 || sh <= 0) return;

    const destH = layer.heightFrac ? height * layer.heightFrac
                : layer.anchor === 'fill' ? height
                : height;
    const destW = Math.max(1, Math.round(sw * (destH / sh)));

    // Anchor to the horizon, not the canvas floor. The ground platform sits at
    // groundY with the HUD area below it, so bottom-anchored art aligned to the
    // canvas ran off the bottom of the screen - which is why the village strip
    // rendered half cut off.
    let destY = 0;
    if (layer.anchor === 'bottom') destY = height - destH;
    else if (layer.anchor === 'horizon') destY = horizonY - destH;
    destY += layer.offsetY ?? 0;

    // Camera scroll plus any independent drift, wrapped into one tile width.
    const shift = camX * layer.scroll + (layer.drift ? now * layer.drift : 0);
    let startX = -(((shift % destW) + destW) % destW) - destW;

    ctx.save();
    if (layer.alpha !== undefined) ctx.globalAlpha = layer.alpha;
    if (layer.blend) ctx.globalCompositeOperation = layer.blend;

    // Same hairline-gap reason as the ground band: overlap each tile by a pixel.
    for (let x = startX; x < width + destW; x += destW) {
      ctx.drawImage(img, sx, sy, sw, sh, Math.round(x), Math.round(destY), destW + 1, Math.ceil(destH));
    }
    ctx.restore();
  }

  /**
   * Plain earth from the horizon down, for themes with no ground tiles.
   *
   * Nothing in this renderer ever filled below groundY - every branch painted
   * (0, 0, width, groundY) and stopped - so the band under the play line was
   * whatever the sky colour happened to be. The platform support legs used to
   * run down through it and disguised the gap; with those gone every dungeon
   * showed the character standing over a void.
   */
  private drawFloorBand(
    ctx: CanvasRenderingContext2D,
    floor: MapFloor,
    width: number,
    height: number,
    horizonY: number
  ) {
    if (horizonY >= height) return;
    const y = Math.round(horizonY);
    const h = Math.ceil(height - y);

    ctx.save();
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, floor.top);
    grad.addColorStop(0.14, floor.body);
    grad.addColorStop(1, floor.body);
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, width, h);

    // A brighter lip catches the light and gives the play line a clear edge.
    ctx.fillStyle = floor.top;
    ctx.fillRect(0, y, width, 2);
    ctx.restore();
  }

  /**
   * Lays the earth from the horizon to the bottom of the view.
   *
   * One grass-topped row on the horizon line, plain fill repeated below, both
   * moving with the world at full camera speed so the ground does not slide
   * under the characters standing on it.
   */
  private drawGroundBand(
    ctx: CanvasRenderingContext2D,
    ground: MapGround,
    camX: number,
    width: number,
    height: number,
    horizonY: number
  ) {
    const img = this.getImage(ground.src);
    if (!img || !img.complete || !img.naturalWidth) return;

    const tile = Math.max(8, ground.tile);
    // Start a tile early so the left edge is never a partial column.
    const startX = -(((camX % tile) + tile) % tile) - tile;
    const s = ground.surface;
    const f = ground.fill;

    // Overlap by a pixel. The world is drawn through a camera scale, so tile
    // edges that are whole numbers here land on fractions on the device and
    // leave hairline gaps - which showed as vertical stripes of sky through
    // the ground every tile.
    const bleed = 1;
    for (let x = startX; x < width + tile; x += tile) {
      const dx = Math.round(x);
      ctx.drawImage(img, s.sx, s.sy, s.sw, s.sh, dx, Math.round(horizonY), tile + bleed, tile + bleed);
      for (let y = horizonY + tile; y < height; y += tile) {
        ctx.drawImage(img, f.sx, f.sy, f.sw, f.sh, dx, Math.round(y), tile + bleed, tile + bleed);
      }
    }
  }

  /**
   * Draws one measured region of a sheet at world scale, standing on baseY.
   *
   * Town props were previously drawn with a literal drawImage per object and a
   * hand-typed width and height each time, so every piece carried its own
   * chance of a wrong aspect ratio. Here only the height is chosen and the
   * width follows from the measured box.
   */
  public drawSheetPiece(
    ctx: CanvasRenderingContext2D,
    src: string,
    rect: { sx: number; sy: number; sw: number; sh: number },
    centerX: number,
    baseY: number,
    targetH: number,
    opts: { flip?: boolean; alpha?: number } = {}
  ) {
    const img = this.getImage(src);
    if (!img || !img.complete || !img.naturalWidth) return;
    if (rect.sw <= 0 || rect.sh <= 0 || targetH <= 0) return;

    const destH = Math.round(targetH);
    const destW = Math.max(1, Math.round(rect.sw * (destH / rect.sh)));
    const x = Math.round(centerX - destW / 2);
    const y = Math.round(baseY - destH);

    ctx.save();
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    if (opts.flip) {
      ctx.translate(x + destW, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, destW, destH);
    } else {
      ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, x, y, destW, destH);
    }
    ctx.restore();
  }

  /**
   * Places measured pieces along a repeating cycle instead of tiling one image.
   *
   * The cycle still repeats, but with several different pieces at different
   * sizes and offsets - and some mirrored - the horizon reads as varied rather
   * than as one silhouette stamped end to end.
   */
  private drawScatterLayer(
    ctx: CanvasRenderingContext2D,
    layer: MapLayer,
    img: HTMLImageElement,
    camX: number,
    width: number,
    height: number,
    horizonY: number,
    now: number
  ) {
    const items = layer.scatter;
    if (!items || !items.length) return;
    const spread = Math.max(1, layer.spread ?? 1600);
    const shift = camX * layer.scroll + (layer.drift ? now * layer.drift : 0);

    ctx.save();
    if (layer.alpha !== undefined) ctx.globalAlpha = layer.alpha;
    if (layer.blend) ctx.globalCompositeOperation = layer.blend;

    const firstCycle = Math.floor((shift - width) / spread);
    const lastCycle = Math.ceil((shift + width) / spread);

    for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
      for (const item of items) {
        const { sx, sy, sw, sh } = item.rect;
        if (sw <= 0 || sh <= 0) continue;

        const destH = Math.max(1, Math.round(height * item.heightFrac));
        const destW = Math.max(1, Math.round(sw * (destH / sh)));
        const x = Math.round((cycle + item.at) * spread - shift);
        if (x + destW < 0 || x > width) continue;

        // lift raises the piece off its baseline; negative lowers it, which is
        // how the cloud layer spreads its pieces down from the top edge.
        const base = layer.anchor === 'top' ? 0
                   : layer.anchor === 'bottom' ? height - destH
                   : horizonY - destH;
        const y = Math.round(base + (layer.offsetY ?? 0) - (item.lift ?? 0));

        const priorAlpha = ctx.globalAlpha;
        if (item.alpha !== undefined) ctx.globalAlpha = priorAlpha * item.alpha;

        if (item.flip) {
          ctx.save();
          ctx.translate(x + destW, y);
          ctx.scale(-1, 1);
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, destW, destH);
          ctx.restore();
        } else {
          ctx.drawImage(img, sx, sy, sw, sh, x, y, destW, destH);
        }

        ctx.globalAlpha = priorAlpha;
      }
    }

    ctx.restore();
  }

  public drawEnvironment(
    ctx: CanvasRenderingContext2D,
    camX: number,
    canvasWidth: number,
    canvasHeight: number,
    groundY: number,
    arenaWidth: number,
    theme: BattleTheme = 'catacombs'
  ) {
    const time = Date.now() / 1000;
    const safeCamX = Math.max(0, camX);
    const safeTheme = theme || 'catacombs';

    // Data-driven maps take priority; themes without one fall through to the
    // original hand-written branches below.
    if (this.drawParallaxTheme(ctx, safeTheme, safeCamX, canvasWidth, canvasHeight, groundY)) {
      return;
    }

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // ----------------------------------------------------
    // 1. BIOME-SPECIFIC PARALLAX LAYERS
    // ----------------------------------------------------
    if (safeTheme === 'swamp') {
      // ===== GOTHICVANIA SWAMP BIOME =====
      const swampBg = this.images['swamp_bg'];
      const swampMid1 = this.images['swamp_mid1'];
      const swampMid2 = this.images['swamp_mid2'];
      const swampTrees = this.images['swamp_trees'];

      // Background emerald dark green sky
      if (swampBg && swampBg.complete && swampBg.naturalWidth > 0) {
        const bgW = 256;
        const bgH = groundY;
        const bgCount = Math.ceil(canvasWidth / bgW) + 2;
        const startBgX = -((safeCamX * 0.1) % bgW);
        for (let i = 0; i < bgCount; i++) {
          ctx.drawImage(swampBg, startBgX + i * bgW, 0, bgW, bgH);
        }
      } else {
        ctx.fillStyle = '#0f291e';
        ctx.fillRect(0, 0, canvasWidth, groundY);
      }

      // Mid-layer 2: Deep swamp silhouettes (0.2x speed)
      if (swampMid2 && swampMid2.complete && swampMid2.naturalWidth > 0) {
        const m2W = 320;
        const m2H = 260;
        const m2Count = Math.ceil(canvasWidth / m2W) + 2;
        const startM2X = -((safeCamX * 0.2) % m2W);
        for (let i = 0; i < m2Count; i++) {
          ctx.drawImage(swampMid2, startM2X + i * m2W, groundY - m2H, m2W, m2H);
        }
      }

      // Mid-layer 1: Murky trees with torches & hanging moss (0.35x speed)
      if (swampMid1 && swampMid1.complete && swampMid1.naturalWidth > 0) {
        const m1W = 320;
        const m1H = 280;
        const m1Count = Math.ceil(canvasWidth / m1W) + 2;
        const startM1X = -((safeCamX * 0.35) % m1W);
        for (let i = 0; i < m1Count; i++) {
          ctx.drawImage(swampMid1, startM1X + i * m1W, groundY - m1H, m1W, m1H);
        }
      }

      // Foreground twisted swamp deadwood (0.6x speed)
      if (swampTrees && swampTrees.complete && swampTrees.naturalWidth > 0) {
        const trW = 400;
        const trH = 300;
        const trCount = Math.ceil(canvasWidth / trW) + 2;
        const startTrX = -((safeCamX * 0.6) % trW);
        for (let i = 0; i < trCount; i++) {
          ctx.drawImage(swampTrees, startTrX + i * trW, groundY - trH, trW, trH);
        }
      }

      // Glowing Will-o'-the-Wisp Fireflies
      for (let w = 0; w < 20; w++) {
        const wx = (Math.sin(w * 88 + time * 0.6) * 0.5 + 0.5) * canvasWidth;
        const wy = groundY - 50 - ((time * 30 + w * 25) % (groundY - 100));
        ctx.fillStyle = w % 2 === 0 ? '#4ade80' : '#86efac';
        ctx.shadowColor = '#22c55e';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(wx, wy, 2 + Math.sin(time * 4 + w) * 1, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (safeTheme === 'mountain') {
      // ===== MOUNTAIN DUSK BIOME =====
      const mSky = this.images['mountain_sky'];
      const mFarM = this.images['mountain_far_mountains'];
      const mFarC = this.images['mountain_far_clouds'];
      const mNearC = this.images['mountain_near_clouds'];
      const mMnt = this.images['mountain_mountains'];
      const mTrees = this.images['mountain_trees'];

      // Sky with Blood Moon
      if (mSky && mSky.complete && mSky.naturalWidth > 0) {
        const sW = 320;
        const sH = groundY;
        const sCount = Math.ceil(canvasWidth / sW) + 2;
        const startSX = -((safeCamX * 0.05) % sW);
        for (let i = 0; i < sCount; i++) {
          ctx.drawImage(mSky, startSX + i * sW, 0, sW, sH);
        }
      }

      // Far Mountains & Far Clouds (0.15x)
      if (mFarM && mFarM.complete && mFarM.naturalWidth > 0) {
        const fW = 380;
        const fH = 220;
        const fCount = Math.ceil(canvasWidth / fW) + 2;
        const startFX = -((safeCamX * 0.15) % fW);
        for (let i = 0; i < fCount; i++) {
          ctx.drawImage(mFarM, startFX + i * fW, groundY - fH - 50, fW, fH);
        }
      }

      if (mFarC && mFarC.complete && mFarC.naturalWidth > 0) {
        const fcW = 380;
        const fcH = 140;
        const fcCount = Math.ceil(canvasWidth / fcW) + 2;
        const startFCX = -(((safeCamX * 0.12) + time * 10) % fcW);
        for (let i = 0; i < fcCount; i++) {
          ctx.drawImage(mFarC, startFCX + i * fcW, groundY - fcH - 120, fcW, fcH);
        }
      }

      // Dramatic Crimson Rock Crags (0.35x)
      if (mMnt && mMnt.complete && mMnt.naturalWidth > 0) {
        const mW = 380;
        const mH = 240;
        const mCount = Math.ceil(canvasWidth / mW) + 2;
        const startMX = -((safeCamX * 0.35) % mW);
        for (let i = 0; i < mCount; i++) {
          ctx.drawImage(mMnt, startMX + i * mW, groundY - mH, mW, mH);
        }
      }

      // Near Clouds drifting (0.45x)
      if (mNearC && mNearC.complete && mNearC.naturalWidth > 0) {
        const ncW = 380;
        const ncH = 160;
        const ncCount = Math.ceil(canvasWidth / ncW) + 2;
        const startNCX = -(((safeCamX * 0.45) + time * 18) % ncW);
        for (let i = 0; i < ncCount; i++) {
          ctx.drawImage(mNearC, startNCX + i * ncW, groundY - ncH - 20, ncW, ncH);
        }
      }

      // Pine Ridge Silhouettes (0.6x)
      if (mTrees && mTrees.complete && mTrees.naturalWidth > 0) {
        const tW = 340;
        const tH = 200;
        const tCount = Math.ceil(canvasWidth / tW) + 2;
        const startTX = -((safeCamX * 0.6) % tW);
        for (let i = 0; i < tCount; i++) {
          ctx.drawImage(mTrees, startTX + i * tW, groundY - tH, tW, tH);
        }
      }
    } else if (safeTheme === 'underwater') {
      // ===== UNDERWATER FANTASY BIOME =====
      const uFar = this.images['underwater_far'];
      const uFg1 = this.images['underwater_fg1'];
      const uFg2 = this.images['underwater_fg2'];

      // Oceanic deep blue gradient & far abyss
      if (uFar && uFar.complete && uFar.naturalWidth > 0) {
        const uW = 384;
        const uH = groundY + 50;
        const uCount = Math.ceil(canvasWidth / uW) + 2;
        const startUX = -((safeCamX * 0.15) % uW);
        for (let i = 0; i < uCount; i++) {
          ctx.drawImage(uFar, startUX + i * uW, 0, uW, uH);
        }
      } else {
        ctx.fillStyle = '#042f2e';
        ctx.fillRect(0, 0, canvasWidth, groundY);
      }

      // Sunken Temple Statues & Ancient Pillars (0.35x)
      if (uFg2 && uFg2.complete && uFg2.naturalWidth > 0) {
        const fg2W = 420;
        const fg2H = 260;
        const fg2Count = Math.ceil(canvasWidth / fg2W) + 2;
        const startFG2X = -((safeCamX * 0.35) % fg2W);
        for (let i = 0; i < fg2Count; i++) {
          ctx.drawImage(uFg2, startFG2X + i * fg2W, groundY - fg2H + 20, fg2W, fg2H);
        }
      }

      // Coral Reefs & Seaweed Formations (0.6x)
      if (uFg1 && uFg1.complete && uFg1.naturalWidth > 0) {
        const fg1W = 420;
        const fg1H = 280;
        const fg1Count = Math.ceil(canvasWidth / fg1W) + 2;
        const startFG1X = -((safeCamX * 0.6) % fg1W);
        for (let i = 0; i < fg1Count; i++) {
          ctx.drawImage(uFg1, startFG1X + i * fg1W, groundY - fg1H + 10, fg1W, fg1H);
        }
      }

      // Rising Oceanic Bubbles & Light Rays
      for (let b = 0; b < 25; b++) {
        const bx = (Math.sin(b * 55 + time * 0.8) * 0.5 + 0.5) * canvasWidth;
        const by = groundY - ((time * 45 + b * 30) % groundY);
        ctx.fillStyle = 'rgba(147, 246, 237, 0.6)';
        ctx.shadowColor = '#2dd4bf';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(bx, by, 1.5 + (b % 3), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (safeTheme === 'caves') {
      // ===== CAVES OF GALLET BIOME =====
      const cGallet = this.images['caves_gallet'];
      if (cGallet && cGallet.complete && cGallet.naturalWidth > 0) {
        const cgW = 480;
        const cgH = groundY + 40;
        const cgCount = Math.ceil(canvasWidth / cgW) + 2;
        const startCGX = -((safeCamX * 0.25) % cgW);
        for (let i = 0; i < cgCount; i++) {
          ctx.drawImage(cGallet, startCGX + i * cgW, 0, cgW, cgH);
        }
      } else {
        ctx.fillStyle = '#1c1917';
        ctx.fillRect(0, 0, canvasWidth, groundY);
      }

      // Molten Lava Glow & Heat Distortion
      const lavaGlow = ctx.createLinearGradient(0, groundY - 120, 0, groundY);
      lavaGlow.addColorStop(0, 'transparent');
      lavaGlow.addColorStop(1, 'rgba(234, 88, 12, 0.35)');
      ctx.fillStyle = lavaGlow;
      ctx.fillRect(0, groundY - 120, canvasWidth, 120);
    } else {
      // ===== GOTHICVANIA TOWN & WARPED CAVES (Default / Catacombs / Crypt / Inferno / Void) =====
      const isDungeon = safeTheme !== 'town';
      const gvBg = (isDungeon && this.images['wc_bg']) ? this.images['wc_bg'] : (this.images['gv_bg'] || this.images['bg_forest']);
      const gvMg = (isDungeon && this.images['wc_mg']) ? this.images['wc_mg'] : (this.images['gv_mg'] || this.images['bg_trees']);

      const bgScale = Math.max(1.8, (groundY + 40) / 224);
      const bgW = 384 * bgScale;
      const bgH = 224 * bgScale;

      // Layer 1: Distant Sky & Cavern/Mountains (Parallax Speed 0.15)
      if (gvBg && gvBg.complete && gvBg.naturalWidth > 0) {
        const bgCount = Math.ceil(canvasWidth / bgW) + 2;
        const startBgX = -((safeCamX * 0.15) % bgW);
        for (let i = 0; i < bgCount; i++) {
          ctx.drawImage(gvBg, startBgX + i * bgW, groundY - bgH, bgW, bgH);
        }
      } else {
        const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
        skyGrad.addColorStop(0, '#0f172a');
        skyGrad.addColorStop(1, '#1e1b4b');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, canvasWidth, groundY);
      }

      // Layer 2: Gothic Skyline / Cavern Arches (Parallax Speed 0.35)
      if (gvMg && gvMg.complete && gvMg.naturalWidth > 0) {
        const mgW = 384 * bgScale;
        const mgH = 224 * bgScale;
        const mgCount = Math.ceil(canvasWidth / mgW) + 2;
        const startMgX = -((safeCamX * 0.35) % mgW);
        for (let i = 0; i < mgCount; i++) {
          ctx.drawImage(gvMg, startMgX + i * mgW, groundY - mgH + 25, mgW, mgH);
        }
      }

      // Atmosphere overlays for Inferno, Crypt, Void, and Catacombs
      if (safeTheme === 'inferno') {
        const magmaGrad = ctx.createLinearGradient(0, 0, 0, groundY);
        magmaGrad.addColorStop(0, 'rgba(127, 29, 29, 0.45)');
        magmaGrad.addColorStop(0.7, 'rgba(239, 68, 68, 0.25)');
        magmaGrad.addColorStop(1, 'rgba(249, 115, 22, 0.4)');
        ctx.fillStyle = magmaGrad;
        ctx.fillRect(0, 0, canvasWidth, groundY);

        for (let e = 0; e < 25; e++) {
          const emberX = (Math.sin(e * 77 + time * 0.5) * 0.5 + 0.5) * canvasWidth;
          const emberY = (groundY - ((time * 70 + e * 40) % groundY));
          ctx.fillStyle = e % 2 === 0 ? '#f97316' : '#fde047';
          ctx.beginPath();
          ctx.arc(emberX, emberY, 2 + (e % 3), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (safeTheme === 'crypt') {
        const cryptGrad = ctx.createLinearGradient(0, 0, 0, groundY);
        cryptGrad.addColorStop(0, 'rgba(30, 27, 75, 0.5)');
        cryptGrad.addColorStop(1, 'rgba(147, 51, 234, 0.25)');
        ctx.fillStyle = cryptGrad;
        ctx.fillRect(0, 0, canvasWidth, groundY);
      } else if (safeTheme === 'void') {
        const voidGrad = ctx.createLinearGradient(0, 0, 0, groundY);
        voidGrad.addColorStop(0, 'rgba(15, 23, 42, 0.55)');
        voidGrad.addColorStop(1, 'rgba(99, 102, 241, 0.25)');
        ctx.fillStyle = voidGrad;
        ctx.fillRect(0, 0, canvasWidth, groundY);

        for (let s = 0; s < 40; s++) {
          const starX = ((s * 97) - safeCamX * (0.05 + (s % 3) * 0.03)) % (canvasWidth + 100);
          const actualStarX = starX < 0 ? starX + canvasWidth + 100 : starX;
          const starY = (s * 33) % (groundY - 40);
          const alpha = 0.4 + Math.sin(time * 4 + s) * 0.4;
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.beginPath();
          ctx.arc(actualStarX, starY, (s % 3 === 0 ? 2.5 : 1.5), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Stalactites & Gates for Warped Caves Dungeons
      if (isDungeon) {
        const stalactiteImg = this.images['wc_stalactite'];
        const gateImg = this.images['wc_gate1'] || this.images['wc_gate2'];
        const stoneHeadImg = this.images['wc_stone_head'];
        const stoneImg = this.images['wc_stone'];
        const plantBigImg = this.images['wc_plant_big'];
        const plantSmallImg = this.images['wc_plant_small'];

        if (stalactiteImg && stalactiteImg.complete && stalactiteImg.naturalWidth > 0) {
          const stalSpacing = 180;
          const startStal = Math.floor((safeCamX - 100) / stalSpacing) - 1;
          const endStal = Math.floor((safeCamX + canvasWidth + 100) / stalSpacing) + 1;
          for (let s = startStal; s <= endStal; s++) {
            const sx = s * stalSpacing + ((s * 47) % 60) - safeCamX;
            const sH = 45 + ((s * 23) % 25);
            ctx.drawImage(stalactiteImg, sx, 0, 32, sH);
          }
        }

        if (gateImg && gateImg.complete && gateImg.naturalWidth > 0) {
          ctx.drawImage(gateImg, 80 - safeCamX, groundY - 110, 64, 110);
          ctx.drawImage(gateImg, arenaWidth - 140 - safeCamX, groundY - 110, 64, 110);
        }

        if (stoneHeadImg && stoneHeadImg.complete && stoneHeadImg.naturalWidth > 0) {
          const headSpacing = 680;
          const startH = Math.floor((safeCamX - 100) / headSpacing) - 1;
          const endH = Math.floor((safeCamX + canvasWidth + 100) / headSpacing) + 1;
          for (let h = startH; h <= endH; h++) {
            ctx.drawImage(stoneHeadImg, h * headSpacing + 260 - safeCamX, groundY - 48, 48, 48);
          }
        }

        if (stoneImg && stoneImg.complete && stoneImg.naturalWidth > 0) {
          const stoneSpacing = 420;
          const startSt = Math.floor((safeCamX - 100) / stoneSpacing) - 1;
          const endSt = Math.floor((safeCamX + canvasWidth + 100) / stoneSpacing) + 1;
          for (let st = startSt; st <= endSt; st++) {
            ctx.drawImage(stoneImg, st * stoneSpacing + 160 - safeCamX, groundY - 28, 42, 28);
          }
        }

        if (plantBigImg && plantBigImg.complete && plantBigImg.naturalWidth > 0) {
          const plantSpacing = 380;
          const startP = Math.floor((safeCamX - 100) / plantSpacing) - 1;
          const endP = Math.floor((safeCamX + canvasWidth + 100) / plantSpacing) + 1;
          for (let p = startP; p <= endP; p++) {
            const px = p * plantSpacing + 310 - safeCamX;
            ctx.drawImage(plantBigImg, px, groundY - 40, 32, 40);
          }
        }

        if (plantSmallImg && plantSmallImg.complete && plantSmallImg.naturalWidth > 0) {
          const smSpacing = 290;
          const startSm = Math.floor((safeCamX - 100) / smSpacing) - 1;
          const endSm = Math.floor((safeCamX + canvasWidth + 100) / smSpacing) + 1;
          for (let sm = startSm; sm <= endSm; sm++) {
            ctx.drawImage(plantSmallImg, sm * smSpacing + 120 - safeCamX, groundY - 26, 24, 26);
          }
        }
      }
    }

    // ----------------------------------------------------
    // 2. BIOME-SPECIFIC GROUND TILES
    // ----------------------------------------------------
    const tileSize = 32;
    const startTile = Math.floor((safeCamX - 60) / tileSize);
    const endTile = Math.floor((safeCamX + canvasWidth + 60) / tileSize);

    let groundTile = this.images['gv_ground'];
    let groundWall = this.images['gv_ground_wall'];

    if (safeTheme === 'swamp') {
      groundTile = this.images['swamp_tileset'] || this.images['gv_ground'];
      groundWall = this.images['swamp_tileset'] || this.images['gv_ground_wall'];
    } else if (safeTheme === 'underwater') {
      groundTile = this.images['underwater_sand'] || this.images['wc_tileset'];
      groundWall = this.images['underwater_sand'] || this.images['wc_walls'];
    } else if (safeTheme === 'caves') {
      groundTile = this.images['caves_gallet_tiles'] || this.images['wc_tileset'];
      groundWall = this.images['caves_gallet_tiles'] || this.images['wc_walls'];
    } else if (safeTheme !== 'town') {
      groundTile = this.images['wc_tileset'] || this.images['gv_ground'];
      groundWall = this.images['wc_walls'] || this.images['gv_ground_wall'];
    }

    for (let t = startTile; t <= endTile; t++) {
      const tileX = t * tileSize - safeCamX;

      if (groundTile && groundTile.complete && groundTile.naturalWidth > 0) {
        ctx.drawImage(groundTile, tileX, groundY, tileSize, tileSize);
        if (groundWall && groundWall.complete && groundWall.naturalWidth > 0) {
          for (let dy = groundY + tileSize; dy < canvasHeight + 100; dy += tileSize) {
            ctx.drawImage(groundWall, tileX, dy, tileSize, tileSize);
          }
        } else {
          ctx.fillStyle = '#18181b';
          ctx.fillRect(tileX, groundY + tileSize, tileSize + 1, canvasHeight - groundY);
        }
      } else {
        const groundGrad = ctx.createLinearGradient(tileX, groundY, tileX, canvasHeight);
        groundGrad.addColorStop(0, '#27272a');
        groundGrad.addColorStop(0.2, '#18181b');
        groundGrad.addColorStop(1, '#09090b');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(tileX, groundY, tileSize + 1, canvasHeight - groundY + 100);
      }
    }

    // Biome Accent Line along ground surface
    ctx.lineWidth = 2;
    ctx.strokeStyle = safeTheme === 'swamp' ? '#10b981' : safeTheme === 'mountain' ? '#f43f5e' : safeTheme === 'underwater' ? '#06b6d4' : safeTheme === 'caves' ? '#f97316' : safeTheme === 'inferno' ? '#ef4444' : safeTheme === 'crypt' ? '#a855f7' : safeTheme === 'void' ? '#818cf8' : '#71717a';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(canvasWidth, groundY);
    ctx.stroke();

    this.drawLegacyFloor(ctx, safeTheme, canvasWidth, canvasHeight, groundY);
    ctx.restore();
  }

  /**
   * Jump-through ledges.
   *
   * These used to be planks carried on wooden legs that ran from the ledge all
   * the way down to a hardcoded y of 600 - so in every map a pair of dark posts
   * rose out of the floor, and once the ground band existed they punched
   * straight through it. The ledge is what the player stands on; the legs were
   * only decoration, so they are gone and the surface is a stone slab that
   * suits a catacomb or a crypt rather than a scaffold.
   */
  /** Floor for a theme still on the legacy branch. */
  public drawLegacyFloor(
    ctx: CanvasRenderingContext2D,
    theme: string,
    width: number,
    height: number,
    horizonY: number
  ) {
    const floor = LEGACY_FLOORS[theme];
    if (floor) this.drawFloorBand(ctx, floor, width, height, horizonY);
  }

  public drawPlatforms(
    ctx: CanvasRenderingContext2D,
    platforms: { x: number; y: number; width: number; height: number; type: string }[],
    theme: BattleTheme
  ) {
    if (!platforms || platforms.length === 0) return;

    // Cut from the same earth as the floor, so a ledge looks like part of the
    // map. A stretched rock sprite read as a pale lens hanging in mid-air, and
    // one sprite could never suit a swamp, a crypt and a neon skyline at once.
    const floor = MAPS[theme]?.floor ?? LEGACY_FLOORS[theme]
      ?? { top: '#6b7280', body: '#1f2937' };

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    for (const plat of platforms) {
      const grad = ctx.createLinearGradient(0, plat.y, 0, plat.y + plat.height);
      grad.addColorStop(0, floor.top);
      grad.addColorStop(0.35, floor.body);
      grad.addColorStop(1, floor.body);
      ctx.fillStyle = grad;
      ctx.fillRect(plat.x, plat.y, plat.width, plat.height);

      // Lit lip on top, matching the floor's, so it reads as standable.
      ctx.fillStyle = floor.top;
      ctx.fillRect(plat.x, plat.y, plat.width, 2);

      // A short shadow under the lip is what sells it now that there are no
      // legs holding it up.
      const shadow = ctx.createLinearGradient(0, plat.y + plat.height, 0, plat.y + plat.height + 9);
      shadow.addColorStop(0, 'rgba(0,0,0,0.4)');
      shadow.addColorStop(1, 'transparent');
      ctx.fillStyle = shadow;
      ctx.fillRect(plat.x, plat.y + plat.height, plat.width, 9);
    }

    ctx.restore();
  }
}

export const sprites = new SpriteManager();


