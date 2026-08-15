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

type BattleTheme = 'catacombs' | 'crypt' | 'inferno';

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
      shader_01: '/assets/shaders/01.png',
      shader_02: '/assets/shaders/02.png',
      shader_04: '/assets/shaders/04.png',
      shader_06: '/assets/shaders/06.png',
      shader_07: '/assets/shaders/07.png',
      shader_08: '/assets/shaders/08.png',
      shader_09: '/assets/shaders/09.png',
      shader_11: '/assets/shaders/11.png',
      shader_14: '/assets/shaders/14.png',
      shader_20: '/assets/shaders/20.png',

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
      reaper_sheet: '/assets/reaper/spritesheet/Bringer-of-Death-SpritSheet.png',
      nightborne: '/assets/nightborne/nightborne.png',
      holy_spell_00: '/assets/vfx/holy_pack/00.png',
      holy_spell_01: '/assets/vfx/holy_pack/01.png',

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
      battle_ground: '/assets/battle/ground/tx-tileset-ground.png',
      battle_props: '/assets/battle/props/tx-village-props.png',
      battle_chest: '/assets/battle/props/tx-chest-animation.png',
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
      st_cannon_ball_idle_2: '/assets/treasure-hunters/Shooter Traps/Sprites/Cannon/Cannon Ball Idle/2.png',
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
      ph_door_close: '/assets/treasure-hunters/Pirate Ship/Sprites/Decorations/Door/Closing/01.png'
    };

    Object.entries(assetsToLoad).forEach(([key, src]) => {
      this.addImage(key, src);
    });

    // Preload Water Priestess frames (288x128)
    this.addToArray(this.priestessIdleImgs, (i) => `/assets/priestess/png/01_idle/idle_${i}.png`, 1, 8);
    this.addToArray(this.priestessWalkImgs, (i) => `/assets/priestess/png/02_walk/walk_${i}.png`, 1, 10);
    this.addToArray(this.priestessAtkImgs, (i) => `/assets/priestess/png/07_1_atk/1_atk_${i}.png`, 1, 7);
    this.addToArray(this.priestessHealImgs, (i) => `/assets/priestess/png/11_heal/heal_${i}.png`, 1, 12);
    this.addToArray(this.priestessDeathImgs, (i) => `/assets/priestess/png/14_death/death_${i}.png`, 1, 16);

    // Preload Dragon Attack frames (40 frames from attack)
    for (let i = 1; i <= 40; i++) {
      const idx = String(Math.min(160, i * 4)).padStart(3, '0');
      this.addImage(`dragon_atk_${i}`, `/assets/dragon/attack/${idx}.png`);
    }

    // Preload Dragon Attack 2 frames (40 frames from attack2)
    for (let i = 1; i <= 40; i++) {
      const idx = String(Math.min(200, i * 5)).padStart(3, '0');
      this.addImage(`dragon_atk2_${i}`, `/assets/dragon/attack2/${idx}.png`);
    }

    // Preload Dragon Walk frames (40 frames from walk)
    for (let i = 1; i <= 40; i++) {
      const idx = String(Math.min(160, i * 4)).padStart(3, '0');
      this.addImage(`dragon_walk_${i}`, `/assets/dragon/walk/${idx}.png`);
    }

    // Preload Dragon Idle frames (40 frames from idle_battle)
    for (let i = 1; i <= 40; i++) {
      const idx = String(Math.min(140, i * 3)).padStart(3, '0');
      this.addImage(`dragon_idle_${i}`, `/assets/dragon/idle_battle/${idx}.png`);
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
      5
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
      5
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
      5
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
      (i) => `/assets/treasure-hunters/Merchant Ship/Sprites/Ship/Ship/Destroyed/${i}.png`,
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
      4
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

  public getImage(key: string): HTMLImageElement | undefined {
    return this.images[key];
  }

  public update(dt: number) {
    this.animTimer += dt;
  }

  /**
   * Draw animated hero character with 100% UNIQUE DEDICATED SPRITE MODELS
   */
  public drawHero(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    classId: string,
    state: 'idle' | 'run' | 'attack' | 'jump' | 'dead',
    facing: number,
    attackTimer: number = 0,
    colorTint?: string
  ) {
    const cid = classId.toLowerCase();

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
      -(destH - 80),
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
      -(destH - 105),
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
      -(destH - 85),
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
      -(destH - 30),
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
      -(destH - 85),
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
      -(destH - 110),
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
      -(destH - 85),
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
      -(destH - 30),
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
    if (lower.includes('orc') || lower.includes('warlord') || lower.includes('grimjaw') || lower.includes('titan') || lower.includes('golem') || lower.includes('knight')) {
      this.drawOrcMob(ctx, x, y, state, facing, isBoss, hitStun);
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

    if (facing < 0) {
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

    if (facing < 0) {
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

    if (facing < 0) {
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

    if (facing < 0) {
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
   * Draw Parallax Environment & High Forest Tiles
   */
  public drawEnvironment(
    ctx: CanvasRenderingContext2D,
    camX: number,
    canvasWidth: number,
    canvasHeight: number,
    groundY: number,
    arenaWidth: number,
    battleTheme: BattleTheme = 'catacombs'
  ) {
    ctx.imageSmoothingEnabled = false;
    const theme = battleTheme || 'catacombs';
    const safeCamX = Math.max(0, camX);
    const screenFromWorldX = (worldX: number) => worldX - camX;

    const isOnScreen = (worldX: number, worldW: number) => {
      const screenX = screenFromWorldX(worldX);
      return screenX < canvasWidth + 120 && screenX + worldW > -120;
    };

    const pickFromGroup = (groupKey: string, seed: number): HTMLImageElement | undefined => {
      const group = this.spriteGroups[groupKey];
      if (!group || group.length === 0) return undefined;
      const index = ((seed % group.length) + group.length) % group.length;
      return group[index];
    };

    const drawWorldImage = (
      img: HTMLImageElement | undefined,
      worldX: number,
      worldY: number,
      w: number,
      h: number,
      sx = 0,
      sy = 0,
      sw?: number,
      sh?: number
    ) => {
      if (!img || !img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
      if (!isOnScreen(worldX, w)) return;

      const sourceW = sw ?? img.naturalWidth;
      const sourceH = sh ?? img.naturalHeight;
      const screenX = screenFromWorldX(worldX);
      ctx.drawImage(img, sx, sy, sourceW, sourceH, screenX, worldY, w, h);
    };

    const themePalettes = {
      catacombs: {
        top: '#22130f',
        bottom: '#0d0808',
        shadow: 'rgba(60, 40, 36, 0.4)',
        propTint: 'rgba(230, 206, 190, 0.22)',
        overlay: 'rgba(58, 35, 26, 0.25)',
        ambient: 'rgba(173, 128, 95, 0.09)',
        groundTint: 'rgba(255, 87, 34, 0.17)'
      },
      crypt: {
        top: '#120f1f',
        bottom: '#07050a',
        shadow: 'rgba(42, 26, 56, 0.45)',
        propTint: 'rgba(173, 132, 255, 0.18)',
        overlay: 'rgba(36, 24, 58, 0.32)',
        ambient: 'rgba(128, 77, 255, 0.07)',
        groundTint: 'rgba(80, 60, 122, 0.14)'
      },
      inferno: {
        top: '#340c06',
        bottom: '#150501',
        shadow: 'rgba(117, 41, 8, 0.42)',
        propTint: 'rgba(255, 140, 61, 0.22)',
        overlay: 'rgba(157, 39, 8, 0.32)',
        ambient: 'rgba(255, 110, 24, 0.10)',
        groundTint: 'rgba(255, 87, 34, 0.17)'
      }
    };

    const palette = themePalettes[theme];

    const skyGradient = ctx.createLinearGradient(0, 0, 0, groundY);
    skyGradient.addColorStop(0, palette.top);
    skyGradient.addColorStop(1, palette.bottom);
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, canvasWidth, groundY);

    ctx.fillStyle = palette.ambient;
    ctx.fillRect(0, 0, canvasWidth, groundY - 40);
    for (let i = 0; i < 2; i++) {
      const layerY = 40 + i * 90;
      const layerHeight = groundY * 0.35;
      const alpha = theme === 'inferno' ? (0.12 + i * 0.05) : (0.06 + i * 0.02);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fillRect(0, layerY, canvasWidth, layerHeight);
    }

    const bgImg = this.images['bg_forest'];
    if (bgImg && bgImg.complete && bgImg.naturalWidth > 0 && bgImg.naturalHeight > 0 && theme === 'catacombs') {
      const bgScale = Math.max(groundY / bgImg.height, canvasWidth / bgImg.width);
      const bgW = bgImg.width * bgScale;
      const numTiles = Math.ceil(canvasWidth / bgW) + 2;
      const startX = -((camX * 0.12) % bgW);

      for (let i = 0; i < numTiles; i++) {
        ctx.drawImage(bgImg, startX + i * bgW, 0, bgW, groundY + 20);
      }
    }

    const thTerrain = this.images['th_terrain'];
    const battleGround = this.images['battle_ground'];
    const battleProps = this.images['battle_props'];
    const battleTorch = this.images['battle_torch_fx'];
    const battleFlame = this.images['battle_flame_fx'];
    const battleChest = this.images['battle_chest'];
    const tilesImg = this.images['tiles'];
    const tileSize = 48;
    const maxTileIndex = Math.max(0, Math.ceil(arenaWidth / tileSize));
    const startTileIndex = Math.max(0, Math.floor(safeCamX / tileSize) - 3);
    const endTileIndex = Math.min(maxTileIndex + 2, Math.floor((camX + canvasWidth) / tileSize) + 3);
    const depthCount = Math.ceil((canvasHeight - groundY + 300) / tileSize) + 3;

    if (battleGround && battleGround.complete && battleGround.naturalWidth > 0 && battleGround.naturalHeight > 0) {
      for (let i = startTileIndex; i <= endTileIndex; i++) {
        const tileX = i * tileSize;

        drawWorldImage(battleGround, tileX, groundY - 16, tileSize, tileSize, 0, 0, battleGround.width, battleGround.height);

        if (theme === 'inferno' || theme === 'crypt') {
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = palette.groundTint;
          ctx.fillRect(screenFromWorldX(tileX), groundY - 16, tileSize, tileSize);
          ctx.globalAlpha = 1;
        }

        drawWorldImage(battleGround, tileX, (groundY - 16) + tileSize, tileSize, tileSize, 0, 0, battleGround.width, battleGround.height);
        for (let d = 2; d < depthCount; d++) {
          drawWorldImage(
            battleGround,
            tileX,
            (groundY - 16) + d * tileSize,
            tileSize,
            tileSize,
            0,
            0,
            battleGround.width,
            battleGround.height
          );
        }
      }
    } else if (thTerrain && thTerrain.complete && thTerrain.naturalWidth > 0 && thTerrain.naturalHeight > 0) {
      for (let i = startTileIndex; i <= endTileIndex; i++) {
        const tileX = i * tileSize;
        drawWorldImage(thTerrain, tileX, groundY - 16, tileSize, tileSize, 32, 0, 32, 32);
        drawWorldImage(thTerrain, tileX, (groundY - 16) + tileSize, tileSize, tileSize, 32, 32, 32, 32);
        for (let d = 2; d < depthCount; d++) {
          drawWorldImage(thTerrain, tileX, (groundY - 16) + d * tileSize, tileSize, tileSize, 32, 64, 32, 32);
        }
      }
    } else if (tilesImg && tilesImg.complete && tilesImg.naturalWidth > 0 && tilesImg.naturalHeight > 0) {
      for (let i = startTileIndex; i <= endTileIndex; i++) {
        const tileX = i * tileSize;
        drawWorldImage(tilesImg, tileX, groundY - 16, tileSize, tileSize, 16, 16, 16, 16);
        drawWorldImage(tilesImg, tileX, (groundY - 16) + tileSize, tileSize, tileSize, 16, 32, 16, 16);
        for (let d = 2; d < depthCount; d++) {
          drawWorldImage(tilesImg, tileX, (groundY - 16) + d * tileSize, tileSize, tileSize, 16, 48, 16, 16);
        }
      }
    }

    const crateImg = this.images['th_crate'];
    const barrelImg = this.images['th_barrel'];
    const propsImg = this.images['props_rocks'];
    const terrainDetail = this.images['th_terrain_detail'];
    const propStep = 340;
    const startPropIndex = Math.floor((safeCamX - canvasWidth * 0.4) / propStep) - 2;
    const endPropIndex = Math.floor((camX + canvasWidth * 1.4) / propStep) + 2;

    for (let i = startPropIndex; i <= endPropIndex; i++) {
      const px = i * propStep + 120;
      if (px < -200 || px > arenaWidth + 260) continue;

      const jitter = ((i * 13) % 26) - 13;
      const groundY1 = groundY - 34;
      const themeGate = theme === 'inferno' ? 1 : 0;
      const waterDrift = ((i * 7) % 17) - 8;
      const shipSway = ((i * 5) % 18) - 9;

      if (battleProps && battleProps.complete && battleProps.naturalWidth > 0 && battleGround && isOnScreen(px, 54)) {
        const frameW = Math.min(96, battleProps.naturalWidth);
        const frameH = Math.min(96, battleProps.naturalHeight);
        const propScale = 42 / Math.max(28, frameW / 2);
        ctx.globalAlpha = theme === 'inferno' ? 0.95 : theme === 'crypt' ? 0.8 : 0.85;
        drawWorldImage(
          battleProps,
          px + jitter,
          groundY1,
          Math.max(28, Math.round(frameW * propScale)),
          Math.max(28, Math.round(frameH * propScale)),
          0,
          0,
          frameW,
          frameH
        );
        ctx.globalAlpha = 1;
      } else if (propsImg && propsImg.complete && propsImg.naturalWidth > 0 && i % 4 === 0 && isOnScreen(px + 80, 40)) {
        drawWorldImage(propsImg, px + 80 + jitter, groundY - 32, 40, 40, 0, 0, 48, 48);
      }

      const palmBack = pickFromGroup('th_palm_back_left', i) || pickFromGroup('th_palm_back_regular', i) || pickFromGroup('th_palm_back_right', i) || this.images['th_palm_back'];
      const palmFront = pickFromGroup('th_palm_front_top', i) || this.images['th_palm_front'];
      const chestSet = pickFromGroup('th_chest_open_set', i) || this.images['th_chest_open'];
      const chestCloseSet = pickFromGroup('th_chest_close_set', i) || this.images['th_pinechest_close'];
      const crateSet = pickFromGroup('th_box_set_idle', i) || this.images['th_chest_idle'];
      const barrelSet = pickFromGroup('th_barrel_set_idle', i) || barrelImg;
      const flagSet = pickFromGroup('th_flag_set', i);
      const chestImg = pickFromGroup('th_chest_unlocked_set', i) || this.images['th_chest_idle'];
      const chestIdleSet = pickFromGroup('th_chest_idle_set', i) || pickFromGroup('th_chest_open_set', i) || this.images['th_chest_open'];
      const boxDestroySet = pickFromGroup('th_box_set_destroy', i);
      const boxHitSet = pickFromGroup('th_box_set_hit', i);
      const barrelDestroySet = pickFromGroup('th_barrel_set_destroy', i);
      const barrelHitSet = pickFromGroup('th_barrel_set_hit', i);
      const coinSet = pickFromGroup('th_gold_coin_set', i);
      const redDiamondSet = pickFromGroup('th_red_diamond_set', i);
      const blueDiamondSet = pickFromGroup('th_blue_diamond_set', i);
      const greenDiamondSet = pickFromGroup('th_green_diamond_set', i);
      const redPotionSet = pickFromGroup('th_red_potion_set', i);
      const bluePotionSet = pickFromGroup('th_blue_potion_set', i);
      const greenPotionSet = pickFromGroup('th_green_potion_set', i);
      const effectCoinSet = pickFromGroup('th_effect_coin_set', i);
      const msAnchor = pickFromGroup('ms_anchor_set', i);
      const msSail = (theme === 'inferno' ? pickFromGroup('ms_sail_wind_set', i) : pickFromGroup('ms_sail_no_wind_set', i));
      const msHull = pickFromGroup('ms_ship_idle_set', i);
      const msHullHit = pickFromGroup('ms_ship_hit_set', i);
      const msHullDestroy = pickFromGroup('ms_ship_destroyed_set', i);
      const msTopWater = pickFromGroup('ms_water_top_set', i);
      const msSplash = ((i + Math.floor(camX / 300)) % 2 === 0 ? pickFromGroup('ms_water_splash_set', i) : pickFromGroup('ms_water_splash2_set', i));
      const msReflex = ((i + Math.floor(camX / 300)) % 2 === 0 ? pickFromGroup('ms_reflex1_set', i) : pickFromGroup('ms_reflex2_set', i));
      const cannonFire = pickFromGroup('st_cannon_fire_set', i);
      const cannonFx = pickFromGroup('st_cannon_fire_effect_set', i);
      const cannonDestroy = pickFromGroup('st_cannon_destroyed_set', i);
      const tent1 =
        pickFromGroup('st_tent_head1_idle', i) ||
        pickFromGroup('st_tent_head2_idle', i) ||
        pickFromGroup('st_tent_head3_idle', i) ||
        this.images['st_tent_head1_attack'] ||
        this.images['st_tent_head2_attack'] ||
        this.images['st_tent_head3_attack'];
      const seashell =
        pickFromGroup('st_seashell_idle_1', i) ||
        pickFromGroup('st_seashell_opening_1', i) ||
        this.images['st_seashell_idle_1'] ||
        this.images['st_seashell_opening_1'] ||
        this.images['st_seashell_hit_1'];
      const ccIdle = pickFromGroup('tc_crabby_idle_1', i) || this.images['tc_crabby_idle_1'];
      const ftIdle = pickFromGroup('tc_fierce_tooth_idle_1', i) || this.images['tc_fierce_tooth_idle_1'];
      const psIdle = pickFromGroup('tc_pink_star_idle_1', i) || this.images['tc_pink_star_idle_1'];
      const cannonBallIdle = pickFromGroup('st_cannon_ball_idle_1', i) || this.images['st_cannon_ball_idle_1'];
      const cannonBallIdle2 = pickFromGroup('st_cannon_ball_idle_2', i) || this.images['st_cannon_ball_idle_2'];
      const cannonBallFire = pickFromGroup('st_cannon_ball_explosion_1', i) || this.images['st_cannon_ball_explosion_1'];

      if (palmBack && isOnScreen(px - 60, 110)) {
        drawWorldImage(palmBack, px - 60, groundY - 140, 110, 140, 0, 0, palmBack.naturalWidth, palmBack.naturalHeight);
      }
      if (palmBack && isOnScreen(px + 10, 80)) {
        drawWorldImage(
          palmBack,
          px + 10,
          groundY - 230 + (theme === 'inferno' ? 14 : 10),
          90,
          90,
          0,
          0,
          palmBack.naturalWidth,
          palmBack.naturalHeight
        );
      }
      if (palmFront && i % 4 === 2 && isOnScreen(px + 30, 80)) {
        drawWorldImage(palmFront, px + 30, groundY - 110, 80, 95, 0, 0, palmFront.naturalWidth, palmFront.naturalHeight);
      }
      if (terrainDetail && isOnScreen(px + 40, 48)) {
        drawWorldImage(terrainDetail, px + 40, groundY - 14, 48, 16, 0, 0, Math.min(48, terrainDetail.naturalWidth), Math.min(16, terrainDetail.naturalHeight));
      }

      if (i % 3 === 1 && (crateSet || chestImg) && isOnScreen(px + jitter, 36)) {
        const img = crateSet || crateImg;
        if (img) {
          const w = theme === 'catacombs' ? 30 : 36;
          const h = theme === 'catacombs' ? 32 : 38;
          drawWorldImage(img, px + jitter, groundY - 30 + themeGate, w, h, 0, 0, img.naturalWidth, img.naturalHeight);
        }
      }
      if (i % 3 === 2 && barrelSet && isOnScreen(px, 26)) {
        drawWorldImage(barrelSet, px, groundY - 26 + themeGate, 24, 26, 0, 0, barrelSet.naturalWidth, barrelSet.naturalHeight);
      }
      if (i % 9 === 1 && barrelDestroySet && isOnScreen(px + 12, 24)) {
        drawWorldImage(barrelDestroySet, px + 12, groundY - 22 + themeGate, 24, 24, 0, 0, barrelDestroySet.naturalWidth, barrelDestroySet.naturalHeight);
      }
      if (i % 11 === 5 && barrelHitSet && isOnScreen(px + 6, 24)) {
        drawWorldImage(barrelHitSet, px + 6, groundY - 22 + themeGate, 24, 24, 0, 0, barrelHitSet.naturalWidth, barrelHitSet.naturalHeight);
      }
      if (barrelImg && isOnScreen(px + 20, 26) && i % 5 === 0) {
        drawWorldImage(barrelImg, px + 20, groundY - 26 + themeGate, 24, 26, 0, 0, barrelImg.naturalWidth, barrelImg.naturalHeight);
      }
      if (boxDestroySet && i % 6 === 2 && isOnScreen(px + 25, 32)) {
        drawWorldImage(boxDestroySet, px + 25, groundY - 35 + themeGate, 28, 28, 0, 0, boxDestroySet.naturalWidth, boxDestroySet.naturalHeight);
      }
      if (boxHitSet && i % 6 === 4 && isOnScreen(px + 22, 30)) {
        drawWorldImage(boxHitSet, px + 22, groundY - 30 + themeGate, 28, 30, 0, 0, boxHitSet.naturalWidth, boxHitSet.naturalHeight);
      }

      if (flagSet && i % 5 === 0 && isOnScreen(px + 10, 44)) {
        drawWorldImage(flagSet, px + 10, groundY - 95, 34, 46, 0, 0, flagSet.naturalWidth, flagSet.naturalHeight);
      }
      if (chestSet && i % 8 === 0 && isOnScreen(px + 35, 36)) {
        drawWorldImage(chestSet, px + 35, groundY - 31, 34, 34, 0, 0, chestSet.naturalWidth, chestSet.naturalHeight);
      }
      if (battleChest && battleChest.complete && battleChest.naturalWidth > 0 && i % 4 === 0 && theme === 'inferno') {
        const frameW = Math.min(64, battleChest.naturalWidth);
        const frameH = Math.min(64, battleChest.naturalHeight);
        drawWorldImage(battleChest, px + 50, groundY - 36, 38, 38, 0, 0, frameW, frameH);
      }
      if (battleTorch && battleTorch.complete && battleTorch.naturalWidth > 0 && i % 7 === 0 && theme === 'inferno') {
        drawWorldImage(battleTorch, px + 10 + jitter, groundY - 46, 18, 24, 0, 0, battleTorch.naturalWidth, battleTorch.naturalHeight);
      }
      if (battleFlame && battleFlame.naturalWidth > 0 && i % 9 === 0 && theme === 'inferno') {
        ctx.globalAlpha = 0.75;
        drawWorldImage(battleFlame, px + 60 + jitter, groundY - 58, 20, 40, 0, 0, battleFlame.naturalWidth, battleFlame.naturalHeight);
        ctx.globalAlpha = 1;
      }
      if (chestCloseSet && i % 12 === 2 && isOnScreen(px + 90, 36)) {
        drawWorldImage(chestCloseSet, px + 90, groundY - 31, 34, 34, 0, 0, chestCloseSet.naturalWidth, chestCloseSet.naturalHeight);
      }
      if (chestIdleSet && i % 12 === 7 && isOnScreen(px + 60, 36)) {
        drawWorldImage(chestIdleSet, px + 60, groundY - 31, 34, 34, 0, 0, chestIdleSet.naturalWidth, chestIdleSet.naturalHeight);
      }

      if (coinSet && i % 18 === 1 && isOnScreen(px + 68, 18)) {
        drawWorldImage(coinSet, px + 68, groundY - 13, 18, 18, 0, 0, coinSet.naturalWidth, coinSet.naturalHeight);
      }
      if (redPotionSet && i % 18 === 3 && isOnScreen(px + 72, 16)) {
        drawWorldImage(redPotionSet, px + 72, groundY - 16, 16, 16, 0, 0, redPotionSet.naturalWidth, redPotionSet.naturalHeight);
      }
      if (bluePotionSet && i % 18 === 9 && isOnScreen(px + 74, 16)) {
        drawWorldImage(bluePotionSet, px + 74, groundY - 16, 16, 16, 0, 0, bluePotionSet.naturalWidth, bluePotionSet.naturalHeight);
      }
      if (greenPotionSet && i % 18 === 11 && isOnScreen(px + 76, 16)) {
        drawWorldImage(greenPotionSet, px + 76, groundY - 16, 16, 16, 0, 0, greenPotionSet.naturalWidth, greenPotionSet.naturalHeight);
      }
      if (redDiamondSet && i % 18 === 5 && isOnScreen(px + 64, 16)) {
        drawWorldImage(redDiamondSet, px + 64, groundY - 17, 16, 16, 0, 0, redDiamondSet.naturalWidth, redDiamondSet.naturalHeight);
      }
      if (blueDiamondSet && i % 18 === 12 && isOnScreen(px + 64, 16)) {
        drawWorldImage(blueDiamondSet, px + 64, groundY - 17, 16, 16, 0, 0, blueDiamondSet.naturalWidth, blueDiamondSet.naturalHeight);
      }
      if (greenDiamondSet && i % 18 === 14 && isOnScreen(px + 64, 16)) {
        drawWorldImage(greenDiamondSet, px + 64, groundY - 17, 16, 16, 0, 0, greenDiamondSet.naturalWidth, greenDiamondSet.naturalHeight);
      }
      if (effectCoinSet && i % 18 === 10 && isOnScreen(px + 66, 12)) {
        drawWorldImage(effectCoinSet, px + 66, groundY - 14, 14, 14, 0, 0, effectCoinSet.naturalWidth, effectCoinSet.naturalHeight);
      }

      if (msTopWater && i % 2 === 0 && isOnScreen(px - 40, 40)) {
        drawWorldImage(msTopWater, px - 40 + waterDrift, groundY - 26 + shipSway * 0.2, 40, 26, 0, 0, msTopWater.naturalWidth, msTopWater.naturalHeight);
      }
      if (msAnchor && i % 16 === 4 && isOnScreen(px + 30, 24)) {
        drawWorldImage(msAnchor, px + 30, groundY - 20, 28, 24, 0, 0, msAnchor.naturalWidth, msAnchor.naturalHeight);
      }
      if (msSail && i % 16 === 8 && isOnScreen(px - 20, 46)) {
        drawWorldImage(msSail, px - 20 + waterDrift, groundY - 72, 32, 46, 0, 0, msSail.naturalWidth, msSail.naturalHeight);
      }
      if (msHull && i % 17 === 1 && isOnScreen(px + 12, 52)) {
        drawWorldImage(msHull, px + 12, groundY - 78, 32, 52, 0, 0, msHull.naturalWidth, msHull.naturalHeight);
      }
      if (msHullHit && i % 17 === 7 && isOnScreen(px - 4, 52)) {
        drawWorldImage(msHullHit, px - 4, groundY - 78, 34, 52, 0, 0, msHullHit.naturalWidth, msHullHit.naturalHeight);
      }
      if (msHullDestroy && i % 17 === 9 && isOnScreen(px + 20, 50)) {
        drawWorldImage(msHullDestroy, px + 20, groundY - 76, 36, 52, 0, 0, msHullDestroy.naturalWidth, msHullDestroy.naturalHeight);
      }
      if (msSplash && i % 7 === 1 && isOnScreen(px - 16, 18)) {
        drawWorldImage(msSplash, px - 16, groundY - 9, 18, 18, 0, 0, msSplash.naturalWidth, msSplash.naturalHeight);
      }
      if (msReflex && i % 7 === 3 && isOnScreen(px - 8, 20)) {
        drawWorldImage(msReflex, px - 8, groundY - 14, 18, 20, 0, 0, msReflex.naturalWidth, msReflex.naturalHeight);
      }

      if (cannonFire && i % 10 === 3 && isOnScreen(px + 100, 30)) {
        drawWorldImage(cannonFire, px + 100 + waterDrift, groundY - 30, 30, 30, 0, 0, cannonFire.naturalWidth, cannonFire.naturalHeight);
      }
      if (cannonFx && i % 10 === 3 && isOnScreen(px + 108, 40)) {
        drawWorldImage(cannonFx, px + 108 + waterDrift, groundY - 34, 24, 24, 0, 0, cannonFx.naturalWidth, cannonFx.naturalHeight);
      }
      if (cannonDestroy && i % 10 === 7 && isOnScreen(px + 102, 30)) {
        drawWorldImage(cannonDestroy, px + 102 + waterDrift, groundY - 28, 30, 24, 0, 0, cannonDestroy.naturalWidth, cannonDestroy.naturalHeight);
      }
      if (cannonBallIdle && i % 10 === 5 && isOnScreen(px + 110, 18)) {
        drawWorldImage(cannonBallIdle, px + 110, groundY - 11, 12, 16, 0, 0, cannonBallIdle.naturalWidth, cannonBallIdle.naturalHeight);
      }
      if (cannonBallIdle2 && i % 10 === 5 && isOnScreen(px + 116, 18)) {
        drawWorldImage(cannonBallIdle2, px + 116, groundY - 10, 12, 16, 0, 0, cannonBallIdle2.naturalWidth, cannonBallIdle2.naturalHeight);
      }
      if (cannonBallFire && i % 10 === 5 && isOnScreen(px + 120, 18)) {
        drawWorldImage(cannonBallFire, px + 120, groundY - 18, 16, 16, 0, 0, cannonBallFire.naturalWidth, cannonBallFire.naturalHeight);
      }
      if (seashell && i % 13 === 6 && isOnScreen(px + 126, 20)) {
        drawWorldImage(seashell, px + 126, groundY - 16, 14, 16, 0, 0, seashell.naturalWidth, seashell.naturalHeight);
      }
      if (tent1 && i % 14 === 4 && isOnScreen(px + 96, 28)) {
        drawWorldImage(tent1, px + 96, groundY - 24, 20, 24, 0, 0, tent1.naturalWidth, tent1.naturalHeight);
      }
      if (ccIdle && i % 15 === 8 && isOnScreen(px + 108, 28)) {
        drawWorldImage(ccIdle, px + 108, groundY - 42, 42, 26, 0, 0, ccIdle.naturalWidth, ccIdle.naturalHeight);
      }
      if (ftIdle && i % 15 === 11 && isOnScreen(px + 114, 28)) {
        drawWorldImage(ftIdle, px + 114, groundY - 42, 42, 26, 0, 0, ftIdle.naturalWidth, ftIdle.naturalHeight);
      }
      if (psIdle && i % 15 === 13 && isOnScreen(px + 120, 28)) {
        drawWorldImage(psIdle, px + 120, groundY - 42, 42, 26, 0, 0, psIdle.naturalWidth, psIdle.naturalHeight);
      }

      const bottle = pickFromGroup('ph_bottles_set', i);
      if (bottle && i % 4 === 0 && isOnScreen(px + 70, 28)) {
        drawWorldImage(bottle, px + 70, groundY - 28, 28, 28, 0, 0, bottle.naturalWidth, bottle.naturalHeight);
      }
      const candle = pickFromGroup('ph_candle_set', i);
      const candleLight = pickFromGroup('ph_candle_light_set', i);
      if (candle && i % 5 === 0 && isOnScreen(px + 100, 20)) {
        drawWorldImage(candle, px + 100, groundY - 40, 20, 28, 0, 0, candle.naturalWidth, candle.naturalHeight);
      }
      if (candleLight && i % 5 === 0 && isOnScreen(px + 100, 20)) {
        const lightAnim = this.animTimer % 0.4;
        const candleAlpha = 0.7 + (lightAnim % 0.3);
        ctx.globalAlpha = candleAlpha;
        drawWorldImage(candleLight, px + 100, groundY - 40, 18, 24, 0, 0, candleLight.naturalWidth, candleLight.naturalHeight);
        ctx.globalAlpha = 1;
      }
      const chain = pickFromGroup(i % 2 === 0 ? 'ph_chain_small_set' : 'ph_chain_big_set', i);
      if (chain && i % 8 === 0 && isOnScreen(px + 140, 18)) {
        drawWorldImage(chain, px + 140, groundY - 64, 20, 48, 0, 0, chain.naturalWidth, chain.naturalHeight);
      }
      const window = pickFromGroup('ph_window_set', i);
      if (window && i % 10 === 0 && isOnScreen(px - 20, 34)) {
        drawWorldImage(window, px - 20, groundY - 122, 34, 54, 0, 0, window.naturalWidth, window.naturalHeight);
      }
      const windowLight = pickFromGroup('ph_window_light_set', i);
      if (windowLight && i % 12 === 0 && isOnScreen(px - 10, 24)) {
        drawWorldImage(windowLight, px - 10, groundY - 110, 24, 28, 0, 0, windowLight.naturalWidth, windowLight.naturalHeight);
      }
      const doorOpen = pickFromGroup('ph_door_open_set', i);
      const doorClose = pickFromGroup('ph_door_close_set', i);
      if ((doorOpen || doorClose) && i % 6 === 3 && isOnScreen(px + 6, 28)) {
        const door = i % 6 < 3 ? doorOpen : doorClose;
        if (door) drawWorldImage(door, px + 6, groundY - 88, 28, 52, 0, 0, door.naturalWidth, door.naturalHeight);
      }

      const helmSet = pickFromGroup('th_helm_turn_set', i) || pickFromGroup('th_helm_idle_set', i) || this.images['th_ship_helm'];
      if (helmSet && i % 6 === 1 && isOnScreen(px - 12, 52)) {
        drawWorldImage(helmSet, px - 12, groundY - 80, 40, 45, 0, 0, helmSet.naturalWidth, helmSet.naturalHeight);
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.overlay;
    ctx.fillRect(0, groundY - 2, canvasWidth, canvasHeight - groundY + 2);

    if (theme === 'inferno' || theme === 'catacombs' || theme === 'crypt') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(0, 0, canvasWidth, groundY - 20);
      ctx.fillStyle =
        theme === 'inferno'
          ? 'rgba(255, 94, 26, 0.08)'
          : theme === 'crypt'
            ? 'rgba(180, 130, 255, 0.04)'
            : 'rgba(173, 146, 117, 0.04)';
      ctx.fillRect(0, 0, canvasWidth, groundY);
    }
  }

  /**
   * Draw Multi-Level Platforms with authentic pixel-art tiles and support pillars
   */
  public drawPlatforms(
    ctx: CanvasRenderingContext2D,
    platforms: { x: number; y: number; width: number; height: number; type: 'one-way' | 'solid' }[],
    theme: BattleTheme = 'catacombs'
  ) {
    const tilesImg = this.images['tiles'];
    const battleGround = this.images['battle_ground'];
    const thTerrain = this.images['th_terrain'];

    platforms.forEach(plat => {
      ctx.save();
      const tileSize = 32;
      const numTiles = Math.ceil(plat.width / tileSize);

      // Support Pillars descending from platform
      ctx.fillStyle = theme === 'inferno' ? '#291103' : '#0f172a';
      ctx.fillRect(plat.x + 14, plat.y, 6, 250);
      ctx.fillRect(plat.x + plat.width - 20, plat.y, 6, 250);

      // Draw Top Platform Surface
      for (let t = 0; t < numTiles; t++) {
        const tx = plat.x + t * tileSize;
        const tw = Math.min(tileSize, plat.x + plat.width - tx);

        if (battleGround && battleGround.complete) {
          ctx.drawImage(battleGround, 0, 0, 32, 32, tx, plat.y - 12, tw, 24);
        } else if (thTerrain && thTerrain.complete) {
          ctx.drawImage(thTerrain, 32, 0, 32, 32, tx, plat.y - 12, tw, 24);
        } else if (tilesImg && tilesImg.complete) {
          ctx.drawImage(tilesImg, 16, 16, 16, 16, tx, plat.y - 12, tw, 24);
        } else {
          ctx.fillStyle = '#334155';
          ctx.fillRect(tx, plat.y - 8, tw, 16);
          ctx.fillStyle = '#22c55e';
          ctx.fillRect(tx, plat.y - 8, tw, 4);
        }
      }

      // Platform Glow / Rune Accent Line
      if (theme === 'void') {
        ctx.fillStyle = 'rgba(168, 85, 247, 0.5)';
        ctx.fillRect(plat.x, plat.y - 14, plat.width, 2);
      } else if (theme === 'inferno') {
        ctx.fillStyle = 'rgba(249, 115, 22, 0.5)';
        ctx.fillRect(plat.x, plat.y - 14, plat.width, 2);
      } else {
        ctx.fillStyle = 'rgba(74, 222, 128, 0.4)';
        ctx.fillRect(plat.x, plat.y - 14, plat.width, 2);
      }

      ctx.restore();
    });
  }
}

export const sprites = new SpriteManager();


