/**
 * Licensed sprite catalogue for the encounter systems introduced after the
 * original kill-all dungeon loop.
 *
 * This module is intentionally data-only. Renderers consume sprite ids and
 * layout metadata; feature code never invents an emoji, canvas shape, or asset
 * path. Every selected file belongs to a bundled source with local free-license
 * evidence.
 */

export type FreeSpriteLicense = 'CC0-1.0' | 'Public-Domain';
export type SpritePreloadTier = 'encounter' | 'on-demand';
export type SpriteAnchor = 'center' | 'feet' | 'bottom';

export interface FreeSpriteSource {
  title: string;
  creator: string;
  license: FreeSpriteLicense;
  evidencePath: string;
  assetRoots: readonly string[];
}

export const FREE_SPRITE_SOURCES = Object.freeze({
  'luizmelo-fantasy-1': {
    title: 'Monsters Creatures Fantasy', creator: 'Luiz Melo', license: 'CC0-1.0',
    evidencePath: '/assets/monsters/LICENSE-CC0.txt', assetRoots: ['/assets/monsters/'],
  },
  'luizmelo-huntress': {
    title: 'Huntress', creator: 'Luiz Melo', license: 'CC0-1.0',
    evidencePath: '/assets/huntress/License.txt', assetRoots: ['/assets/huntress/'],
  },
  'luizmelo-evil-wizard': {
    title: 'Evil Wizard', creator: 'Luiz Melo', license: 'CC0-1.0',
    evidencePath: '/assets/evil-wizard/License.txt', assetRoots: ['/assets/evil-wizard/'],
  },
  'luizmelo-martial-hero': {
    title: 'Martial Hero', creator: 'Luiz Melo', license: 'CC0-1.0',
    evidencePath: '/assets/martial-hero/License.txt', assetRoots: ['/assets/martial-hero/'],
  },
  'luizmelo-fantasy-2': {
    title: 'Monsters Creatures Fantasy 2', creator: 'Luiz Melo', license: 'CC0-1.0',
    evidencePath: '/assets/runtime/licenses/luizmelo-monsters-creatures-fantasy-2-CC0-1.0.txt',
    assetRoots: ['/assets/runtime/monsters/luizmelo-fantasy-2/'],
  },
  'codemanu-public-domain': {
    title: 'Free Pixel Art Effect Sprites', creator: 'CodeManu', license: 'Public-Domain',
    evidencePath: '/assets/codemanu_vfx/README.txt', assetRoots: ['/assets/codemanu_vfx/'],
  },
  'kenney-particle-pack': {
    title: 'Particle Pack', creator: 'Kenney', license: 'CC0-1.0',
    evidencePath: '/assets/runtime/licenses/kenney-particle-pack-CC0-1.0.txt',
    assetRoots: ['/assets/runtime/vfx/particles/'],
  },
  'ansimuz-gothicvania-town': {
    title: 'GothicVania Town', creator: 'Ansimuz', license: 'CC0-1.0',
    evidencePath: '/assets/GothicVania-town-files/GothicVania-town-files/public-license.pdf',
    assetRoots: ['/assets/GothicVania-town-files/GothicVania-town-files/PNG/'],
  },
  'ansimuz-warped-caves': {
    title: 'Warped Caves', creator: 'Ansimuz', license: 'CC0-1.0',
    evidencePath: '/assets/warped-files/warped-files/public-license.pdf',
    assetRoots: ['/assets/warped-files/warped-files/Assets/PNG/'],
  },
  'ansimuz-gothicvania-swamp': {
    title: 'GothicVania Swamp', creator: 'Ansimuz', license: 'CC0-1.0',
    evidencePath: '/assets/swamp/public-license.pdf', assetRoots: ['/assets/swamp/'],
  },
} as const satisfies Record<string, FreeSpriteSource>);

export type FreeSpriteSourceId = keyof typeof FREE_SPRITE_SOURCES;

export type SpriteLayout =
  | { kind: 'image' }
  | { kind: 'atlas'; x: number; y: number; width: number; height: number }
  | { kind: 'strip'; frameWidth: number; frameHeight: number; frameCount: number; direction: 'horizontal' | 'vertical' }
  | { kind: 'grid'; frameWidth: number; frameHeight: number; columns: number; rows: number; frameCount: number }
  | { kind: 'frames'; paths: readonly string[] };

export interface GameplaySpriteClip {
  label: string;
  sourceId: FreeSpriteSourceId;
  preload: SpritePreloadTier;
  anchor: SpriteAnchor;
  fps: number;
  loop: boolean;
  scale: number;
  /** Transparent source pixels below an actor's measured feet. */
  feetGap?: number;
  src?: string;
  layout: SpriteLayout;
}

function image(
  label: string,
  sourceId: FreeSpriteSourceId,
  src: string,
  options: Partial<Pick<GameplaySpriteClip, 'preload' | 'anchor' | 'fps' | 'loop' | 'scale'>> = {},
): GameplaySpriteClip {
  return {
    label, sourceId, src, layout: { kind: 'image' }, preload: options.preload ?? 'on-demand',
    anchor: options.anchor ?? 'center', fps: options.fps ?? 1, loop: options.loop ?? true,
    scale: options.scale ?? 1,
  };
}

function strip(
  label: string,
  sourceId: FreeSpriteSourceId,
  src: string,
  frameWidth: number,
  frameHeight: number,
  frameCount: number,
  options: Partial<Pick<GameplaySpriteClip, 'preload' | 'anchor' | 'fps' | 'loop' | 'scale' | 'feetGap'>> = {},
): GameplaySpriteClip {
  return {
    label, sourceId, src,
    layout: { kind: 'strip', frameWidth, frameHeight, frameCount, direction: 'horizontal' },
    preload: options.preload ?? 'on-demand', anchor: options.anchor ?? 'feet',
    fps: options.fps ?? 10, loop: options.loop ?? true, scale: options.scale ?? 1,
    ...(options.feetGap !== undefined ? { feetGap: options.feetGap } : {}),
  };
}

function atlas(
  label: string,
  sourceId: FreeSpriteSourceId,
  src: string,
  rect: { x: number; y: number; width: number; height: number },
  options: Partial<Pick<GameplaySpriteClip, 'preload' | 'anchor' | 'fps' | 'loop' | 'scale'>> = {},
): GameplaySpriteClip {
  return {
    label, sourceId, src, layout: { kind: 'atlas', ...rect },
    preload: options.preload ?? 'on-demand', anchor: options.anchor ?? 'bottom',
    fps: options.fps ?? 1, loop: options.loop ?? true, scale: options.scale ?? 1,
  };
}

function grid(
  label: string,
  sourceId: FreeSpriteSourceId,
  src: string,
  columns: number,
  rows: number,
  options: Partial<Pick<GameplaySpriteClip, 'preload' | 'anchor' | 'fps' | 'loop' | 'scale'>> = {},
): GameplaySpriteClip {
  return {
    label, sourceId, src,
    layout: { kind: 'grid', frameWidth: 100, frameHeight: 100, columns, rows, frameCount: columns * rows },
    preload: options.preload ?? 'on-demand', anchor: options.anchor ?? 'center',
    fps: options.fps ?? 18, loop: options.loop ?? false, scale: options.scale ?? 1,
  };
}

function frames(
  label: string,
  sourceId: FreeSpriteSourceId,
  paths: readonly string[],
  options: Partial<Pick<GameplaySpriteClip, 'preload' | 'anchor' | 'fps' | 'loop' | 'scale'>> = {},
): GameplaySpriteClip {
  return {
    label, sourceId, layout: { kind: 'frames', paths }, preload: options.preload ?? 'on-demand',
    anchor: options.anchor ?? 'feet', fps: options.fps ?? 8, loop: options.loop ?? true,
    scale: options.scale ?? 1,
  };
}

const gothicNpcFrames = (animation: 'idle' | 'walk', count: number) => Array.from(
  { length: count },
  (_, index) => `/assets/GothicVania-town-files/GothicVania-town-files/PNG/sprites/oldman-${animation}/oldman-${animation}-${index + 1}.png`,
);

export const GAMEPLAY_SPRITES = Object.freeze({
  // Enemy role actors. Every role has a complete readable combat set.
  'enemy.shield-tank.idle': strip('Shield tank idle', 'luizmelo-fantasy-1', '/assets/monsters/Skeleton/Idle.png', 150, 150, 4, { feetGap: 49 }),
  'enemy.shield-tank.move': strip('Shield tank walk', 'luizmelo-fantasy-1', '/assets/monsters/Skeleton/Walk.png', 150, 150, 4, { fps: 9, feetGap: 49 }),
  'enemy.shield-tank.attack': strip('Shield tank attack', 'luizmelo-fantasy-1', '/assets/monsters/Skeleton/Attack.png', 150, 150, 8, { fps: 12, loop: false, feetGap: 49 }),
  'enemy.shield-tank.guard': strip('Shield tank guard', 'luizmelo-fantasy-1', '/assets/monsters/Skeleton/Shield.png', 150, 150, 4, { fps: 8, feetGap: 49 }),
  'enemy.shield-tank.hit': strip('Shield tank hit', 'luizmelo-fantasy-1', '/assets/monsters/Skeleton/Take Hit.png', 150, 150, 4, { fps: 11, loop: false, feetGap: 49 }),
  'enemy.shield-tank.death': strip('Shield tank death', 'luizmelo-fantasy-1', '/assets/monsters/Skeleton/Death.png', 150, 150, 4, { fps: 7, loop: false, feetGap: 49 }),

  'enemy.healer.idle': strip('Healer idle', 'luizmelo-fantasy-1', '/assets/monsters/Goblin/Idle.png', 150, 150, 4, { feetGap: 49 }),
  'enemy.healer.move': strip('Healer run', 'luizmelo-fantasy-1', '/assets/monsters/Goblin/Run.png', 150, 150, 8, { fps: 11, feetGap: 49 }),
  'enemy.healer.attack': strip('Healer cast', 'luizmelo-fantasy-1', '/assets/monsters/Goblin/Attack.png', 150, 150, 8, { fps: 12, loop: false, feetGap: 49 }),
  'enemy.healer.hit': strip('Healer hit', 'luizmelo-fantasy-1', '/assets/monsters/Goblin/Take Hit.png', 150, 150, 4, { fps: 11, loop: false, feetGap: 49 }),
  'enemy.healer.death': strip('Healer death', 'luizmelo-fantasy-1', '/assets/monsters/Goblin/Death.png', 150, 150, 4, { fps: 7, loop: false, feetGap: 49 }),

  'enemy.ranged-sniper.idle': strip('Ranged sniper idle', 'luizmelo-huntress', '/assets/huntress/Sprites/Idle.png', 150, 150, 8, { scale: 0.92, feetGap: 53 }),
  'enemy.ranged-sniper.move': strip('Ranged sniper run', 'luizmelo-huntress', '/assets/huntress/Sprites/Run.png', 150, 150, 8, { fps: 12, scale: 0.92, feetGap: 53 }),
  'enemy.ranged-sniper.attack': strip('Ranged sniper attack', 'luizmelo-huntress', '/assets/huntress/Sprites/Attack2.png', 150, 150, 5, { fps: 11, loop: false, scale: 0.92, feetGap: 53 }),
  'enemy.ranged-sniper.hit': strip('Ranged sniper hit', 'luizmelo-huntress', '/assets/huntress/Sprites/Take hit.png', 150, 150, 3, { fps: 11, loop: false, scale: 0.92, feetGap: 53 }),
  'enemy.ranged-sniper.death': strip('Ranged sniper death', 'luizmelo-huntress', '/assets/huntress/Sprites/Death.png', 150, 150, 8, { fps: 8, loop: false, scale: 0.92, feetGap: 53 }),

  'enemy.summoner.idle': strip('Summoner idle', 'luizmelo-evil-wizard', '/assets/evil-wizard/Sprites/Idle.png', 150, 150, 8, { scale: 0.9, feetGap: 49 }),
  'enemy.summoner.move': strip('Summoner move', 'luizmelo-evil-wizard', '/assets/evil-wizard/Sprites/Move.png', 150, 150, 8, { fps: 10, scale: 0.9, feetGap: 49 }),
  'enemy.summoner.attack': strip('Summoner cast', 'luizmelo-evil-wizard', '/assets/evil-wizard/Sprites/Attack.png', 150, 150, 8, { fps: 12, loop: false, scale: 0.9, feetGap: 49 }),
  'enemy.summoner.hit': strip('Summoner hit', 'luizmelo-evil-wizard', '/assets/evil-wizard/Sprites/Take Hit.png', 150, 150, 4, { fps: 11, loop: false, scale: 0.9, feetGap: 49 }),
  'enemy.summoner.death': strip('Summoner death', 'luizmelo-evil-wizard', '/assets/evil-wizard/Sprites/Death.png', 150, 150, 5, { fps: 8, loop: false, scale: 0.9, feetGap: 49 }),

  'enemy.assassin.idle': strip('Assassin idle', 'luizmelo-martial-hero', '/assets/martial-hero/Sprites/Idle.png', 200, 200, 8, { scale: 0.82, feetGap: 78 }),
  'enemy.assassin.move': strip('Assassin run', 'luizmelo-martial-hero', '/assets/martial-hero/Sprites/Run.png', 200, 200, 8, { fps: 14, scale: 0.82, feetGap: 78 }),
  'enemy.assassin.attack': strip('Assassin attack', 'luizmelo-martial-hero', '/assets/martial-hero/Sprites/Attack1.png', 200, 200, 6, { fps: 14, loop: false, scale: 0.82, feetGap: 78 }),
  'enemy.assassin.hit': strip('Assassin hit', 'luizmelo-martial-hero', '/assets/martial-hero/Sprites/Take Hit.png', 200, 200, 4, { fps: 12, loop: false, scale: 0.82, feetGap: 78 }),
  'enemy.assassin.death': strip('Assassin death', 'luizmelo-martial-hero', '/assets/martial-hero/Sprites/Death.png', 200, 200, 6, { fps: 8, loop: false, scale: 0.82, feetGap: 78 }),

  // Combat tells and reactions are sprites, never generated warning geometry.
  'combat.telegraph.area': image('Area telegraph', 'kenney-particle-pack', '/assets/runtime/vfx/particles/circle.png', { preload: 'encounter', scale: 0.34 }),
  'combat.telegraph.melee': image('Melee telegraph', 'kenney-particle-pack', '/assets/runtime/vfx/particles/slash.png', { preload: 'encounter', scale: 0.25 }),
  'combat.telegraph.ranged': image('Ranged telegraph', 'kenney-particle-pack', '/assets/runtime/vfx/particles/spark.png', { preload: 'encounter', scale: 0.22 }),
  'combat.dodge': grid('Dodge afterimage', 'codemanu-public-domain', '/assets/codemanu_vfx/14_phantom_spritesheet.png', 8, 8, { fps: 22, scale: 1.1 }),
  'combat.parry': grid('Parry impact', 'codemanu-public-domain', '/assets/codemanu_vfx/10_weaponhit_spritesheet.png', 6, 6, { fps: 24, scale: 0.9 }),
  'combat.guard': grid('Guard ward', 'codemanu-public-domain', '/assets/codemanu_vfx/8_protectioncircle_spritesheet.png', 8, 8, { fps: 16, loop: true, scale: 1.15 }),
  'combat.stagger': image('Stagger smoke', 'kenney-particle-pack', '/assets/runtime/vfx/particles/smoke.png', { scale: 0.22 }),
  'combat.guard-break': grid('Guard break impact', 'codemanu-public-domain', '/assets/codemanu_vfx/10_weaponhit_spritesheet.png', 6, 6, { fps: 26, scale: 1.2 }),

  // Element setup and payoff sprites.
  'status.wet': grid('Wet status', 'codemanu-public-domain', '/assets/codemanu_vfx/20_magicbubbles_spritesheet.png', 8, 8, { fps: 14, loop: true, scale: 0.7 }),
  'status.burn': image('Burn status', 'kenney-particle-pack', '/assets/runtime/vfx/particles/fire.png', { scale: 0.2 }),
  'status.freeze': grid('Freeze status', 'codemanu-public-domain', '/assets/codemanu_vfx/19_freezing_spritesheet.png', 10, 10, { fps: 16, loop: true, scale: 0.8 }),
  'status.curse': grid('Curse status', 'codemanu-public-domain', '/assets/codemanu_vfx/17_felspell_spritesheet.png', 10, 10, { fps: 16, loop: true, scale: 0.75 }),
  'reaction.lightning-chain': image('Lightning chain payoff', 'kenney-particle-pack', '/assets/runtime/vfx/particles/spark.png', { scale: 0.38 }),
  'reaction.explosion': grid('Burn explosion payoff', 'codemanu-public-domain', '/assets/codemanu_vfx/9_brightfire_spritesheet.png', 8, 8, { fps: 22, scale: 1.35 }),
  'reaction.shatter': grid('Freeze shatter payoff', 'codemanu-public-domain', '/assets/codemanu_vfx/10_weaponhit_spritesheet.png', 6, 6, { fps: 26, scale: 1.25 }),
  'reaction.lifesteal': grid('Curse lifesteal payoff', 'codemanu-public-domain', '/assets/codemanu_vfx/13_vortex_spritesheet.png', 8, 8, { fps: 18, scale: 1.05 }),

  // Objective and route props.
  'objective.relic': image('Defendable stone relic', 'ansimuz-warped-caves', '/assets/warped-files/warped-files/Assets/PNG/environment/props/stone-head.png', { anchor: 'bottom', scale: 1.65 }),
  'objective.escort.idle': frames('Escort NPC idle', 'ansimuz-gothicvania-town', gothicNpcFrames('idle', 8), { preload: 'encounter', fps: 6, scale: 1.9 }),
  'objective.escort.walk': frames('Escort NPC walk', 'ansimuz-gothicvania-town', gothicNpcFrames('walk', 12), { preload: 'encounter', fps: 9, scale: 1.9 }),
  'objective.wave-anchor': grid('Survival ward', 'codemanu-public-domain', '/assets/codemanu_vfx/8_protectioncircle_spritesheet.png', 8, 8, { fps: 16, loop: true, scale: 1.5 }),
  // The swamp source is a three-prop atlas. This rect selects only the fallen
  // root cluster; a renderer must never draw the entire 176x43 strip.
  'objective.root-nest': atlas(
    'Destroyable root nest', 'ansimuz-gothicvania-swamp', '/assets/swamp/props.png',
    { x: 56, y: 4, width: 64, height: 32 }, { anchor: 'bottom', scale: 1.35 },
  ),
  'objective.escape-gate': image('Timed escape gate', 'ansimuz-warped-caves', '/assets/warped-files/warped-files/Assets/PNG/environment/props/gate-03.png', { anchor: 'bottom', scale: 2.2 }),

  'hazard.falling-rock': image('Falling rock', 'ansimuz-warped-caves', '/assets/warped-files/warped-files/Assets/PNG/environment/props/stone.png', { anchor: 'bottom', scale: 1.25 }),
  'hazard.bridge-top': image('Breakable bridge top', 'ansimuz-gothicvania-town', '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/layers/sliced-tileset/top-wood.png', { anchor: 'bottom', scale: 2 }),
  'hazard.bridge-support': image('Breakable bridge support', 'ansimuz-gothicvania-town', '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/layers/sliced-tileset/wood-legs.png', { anchor: 'bottom', scale: 2 }),
  'hazard.explosive-barrel': image('Explosive barrel', 'ansimuz-gothicvania-town', '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/props-sliced/barrel.png', { anchor: 'bottom', scale: 2 }),
  'hazard.spike-trap': image('Spike trap', 'ansimuz-warped-caves', '/assets/warped-files/warped-files/Assets/PNG/environment/props/stalactite.png', { anchor: 'bottom', scale: 1.35 }),
  'hazard.moving-platform': image('Moving platform', 'ansimuz-gothicvania-town', '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/layers/sliced-tileset/top-wood.png', { anchor: 'bottom', scale: 2 }),

  'route.secret-door': image('Secret room gate', 'ansimuz-warped-caves', '/assets/warped-files/warped-files/Assets/PNG/environment/props/gate-01.png', { anchor: 'bottom', scale: 2.2 }),
  'route.branch-gate': image('Branch route gate', 'ansimuz-warped-caves', '/assets/warped-files/warped-files/Assets/PNG/environment/props/gate-02.png', { anchor: 'bottom', scale: 2.2 }),
  'route.event-well': image('Dungeon event well', 'ansimuz-gothicvania-town', '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/props-sliced/well.png', { anchor: 'bottom', scale: 1.8 }),
  'route.treasure.closed': image('Treasure closed', 'luizmelo-fantasy-2', '/assets/runtime/monsters/luizmelo-fantasy-2/mimic/idle-closed.png', { anchor: 'bottom', scale: 0.8 }),
  'route.treasure.open': strip('Treasure opening', 'luizmelo-fantasy-2', '/assets/runtime/monsters/luizmelo-fantasy-2/mimic/opening.png', 146, 146, 6, { anchor: 'bottom', fps: 10, loop: false, scale: 0.8 }),
  'route.risk-shrine': image('Risk reward shrine', 'ansimuz-warped-caves', '/assets/warped-files/warped-files/Assets/PNG/environment/props/stone-head.png', { anchor: 'bottom', scale: 1.8 }),
  'route.relic-choice': grid('Relic choice aura', 'codemanu-public-domain', '/assets/codemanu_vfx/8_protectioncircle_spritesheet.png', 8, 8, { fps: 14, loop: true, scale: 1.25 }),

  // Elite and mini-boss affixes use visible sprite signatures.
  'elite.bulwark': grid('Bulwark elite ward', 'codemanu-public-domain', '/assets/codemanu_vfx/8_protectioncircle_spritesheet.png', 8, 8, { fps: 14, loop: true, scale: 1.1 }),
  'elite.vampiric': grid('Vampiric elite vortex', 'codemanu-public-domain', '/assets/codemanu_vfx/13_vortex_spritesheet.png', 8, 8, { fps: 16, loop: true, scale: 0.95 }),
  'elite.volatile': image('Volatile elite flame', 'kenney-particle-pack', '/assets/runtime/vfx/particles/fire.png', { scale: 0.24 }),
  'elite.frostbound': grid('Frostbound elite aura', 'codemanu-public-domain', '/assets/codemanu_vfx/19_freezing_spritesheet.png', 10, 10, { fps: 14, loop: true, scale: 0.72 }),
  'elite.stormbound': image('Stormbound elite spark', 'kenney-particle-pack', '/assets/runtime/vfx/particles/spark.png', { scale: 0.25 }),
  'elite.summoning': grid('Summoning elite phantom', 'codemanu-public-domain', '/assets/codemanu_vfx/14_phantom_spritesheet.png', 8, 8, { fps: 16, loop: true, scale: 0.8 }),
  'miniboss.enrage': grid('Mini-boss enrage', 'codemanu-public-domain', '/assets/codemanu_vfx/9_brightfire_spritesheet.png', 8, 8, { fps: 18, loop: true, scale: 1.1 }),
  'miniboss.guard': grid('Mini-boss guard', 'codemanu-public-domain', '/assets/codemanu_vfx/8_protectioncircle_spritesheet.png', 8, 8, { fps: 14, loop: true, scale: 1.35 }),
  'miniboss.summon': grid('Mini-boss summon', 'codemanu-public-domain', '/assets/codemanu_vfx/14_phantom_spritesheet.png', 8, 8, { fps: 17, scale: 1.2 }),
  'miniboss.nova': grid('Mini-boss nova', 'codemanu-public-domain', '/assets/codemanu_vfx/1_magicspell_spritesheet.png', 8, 8, { fps: 20, scale: 1.4 }),
} as const satisfies Record<string, GameplaySpriteClip>);

export type GameplaySpriteId = keyof typeof GAMEPLAY_SPRITES;
export type EnemyRoleId = 'shield-tank' | 'healer' | 'ranged-sniper' | 'summoner' | 'assassin';
export type RoomObjectiveId = 'defend-relic' | 'escort-npc' | 'survive-waves' | 'destroy-nests' | 'timed-escape';
export type InteractiveHazardId = 'falling-rocks' | 'breakable-bridge' | 'explosive-barrel' | 'traps' | 'moving-platform';
export type ElementReactionId = 'wet-lightning-chain' | 'burn-explosion' | 'freeze-shatter' | 'curse-lifesteal';

export interface EnemyRoleSpriteSet {
  idle: GameplaySpriteId;
  move: GameplaySpriteId;
  attack: GameplaySpriteId;
  hit: GameplaySpriteId;
  death: GameplaySpriteId;
  signature: GameplaySpriteId;
  telegraph: GameplaySpriteId;
}

export const ENEMY_ROLE_SPRITES = Object.freeze({
  'shield-tank': {
    idle: 'enemy.shield-tank.idle', move: 'enemy.shield-tank.move', attack: 'enemy.shield-tank.attack',
    hit: 'enemy.shield-tank.hit', death: 'enemy.shield-tank.death', signature: 'enemy.shield-tank.guard',
    telegraph: 'combat.telegraph.melee',
  },
  healer: {
    idle: 'enemy.healer.idle', move: 'enemy.healer.move', attack: 'enemy.healer.attack',
    hit: 'enemy.healer.hit', death: 'enemy.healer.death', signature: 'combat.guard',
    telegraph: 'combat.telegraph.area',
  },
  'ranged-sniper': {
    idle: 'enemy.ranged-sniper.idle', move: 'enemy.ranged-sniper.move', attack: 'enemy.ranged-sniper.attack',
    hit: 'enemy.ranged-sniper.hit', death: 'enemy.ranged-sniper.death', signature: 'combat.telegraph.ranged',
    telegraph: 'combat.telegraph.ranged',
  },
  summoner: {
    idle: 'enemy.summoner.idle', move: 'enemy.summoner.move', attack: 'enemy.summoner.attack',
    hit: 'enemy.summoner.hit', death: 'enemy.summoner.death', signature: 'elite.summoning',
    telegraph: 'combat.telegraph.area',
  },
  assassin: {
    idle: 'enemy.assassin.idle', move: 'enemy.assassin.move', attack: 'enemy.assassin.attack',
    hit: 'enemy.assassin.hit', death: 'enemy.assassin.death', signature: 'combat.dodge',
    telegraph: 'combat.telegraph.melee',
  },
} as const satisfies Record<EnemyRoleId, EnemyRoleSpriteSet>);

export const OBJECTIVE_SPRITES = Object.freeze({
  'defend-relic': { primary: 'objective.relic', active: 'combat.guard', complete: 'route.relic-choice' },
  'escort-npc': { primary: 'objective.escort.idle', active: 'objective.escort.walk', complete: 'route.relic-choice' },
  'survive-waves': { primary: 'objective.wave-anchor', active: 'combat.telegraph.area', complete: 'route.relic-choice' },
  'destroy-nests': { primary: 'objective.root-nest', active: 'status.curse', complete: 'reaction.explosion' },
  'timed-escape': { primary: 'objective.escape-gate', active: 'combat.telegraph.area', complete: 'route.relic-choice' },
} as const satisfies Record<RoomObjectiveId, Record<'primary' | 'active' | 'complete', GameplaySpriteId>>);

export const HAZARD_SPRITES = Object.freeze({
  'falling-rocks': { body: 'hazard.falling-rock', telegraph: 'combat.telegraph.area', impact: 'combat.stagger' },
  'breakable-bridge': { body: 'hazard.bridge-top', telegraph: 'combat.telegraph.melee', impact: 'combat.stagger' },
  'explosive-barrel': { body: 'hazard.explosive-barrel', telegraph: 'status.burn', impact: 'reaction.explosion' },
  traps: { body: 'hazard.spike-trap', telegraph: 'combat.telegraph.area', impact: 'combat.guard-break' },
  'moving-platform': { body: 'hazard.moving-platform', telegraph: 'combat.telegraph.area', impact: 'combat.stagger' },
} as const satisfies Record<InteractiveHazardId, Record<'body' | 'telegraph' | 'impact', GameplaySpriteId>>);

export const ELEMENT_REACTION_SPRITES = Object.freeze({
  'wet-lightning-chain': { setup: 'status.wet', payoff: 'reaction.lightning-chain' },
  'burn-explosion': { setup: 'status.burn', payoff: 'reaction.explosion' },
  'freeze-shatter': { setup: 'status.freeze', payoff: 'reaction.shatter' },
  'curse-lifesteal': { setup: 'status.curse', payoff: 'reaction.lifesteal' },
} as const satisfies Record<ElementReactionId, Record<'setup' | 'payoff', GameplaySpriteId>>);

export const EXPLORATION_SPRITES = Object.freeze({
  'secret-room': 'route.secret-door',
  'branching-route': 'route.branch-gate',
  event: 'route.event-well',
  treasure: 'route.treasure.closed',
  'risk-reward-shrine': 'route.risk-shrine',
  'relic-choice': 'route.relic-choice',
} as const satisfies Record<string, GameplaySpriteId>);

export const COMBAT_FEEDBACK_SPRITES = Object.freeze({
  dodge: 'combat.dodge', parry: 'combat.parry', stagger: 'combat.stagger',
  'guard-break': 'combat.guard-break', 'area-telegraph': 'combat.telegraph.area',
  'melee-telegraph': 'combat.telegraph.melee', 'ranged-telegraph': 'combat.telegraph.ranged',
} as const satisfies Record<string, GameplaySpriteId>);

/** Deliberately unavailable to this feature manifest. */
export const EXCLUDED_GAMEPLAY_ASSETS = Object.freeze({
  '/assets/runtime/maps/pixel-platformer/terrain.png': 'The shared terrain atlas is not used for encounter props.',
  '/assets/high-forest/Assets/Hive.png': 'No local license evidence is bundled for the High Forest pack.',
});

export function getGameplaySpriteFiles(id: GameplaySpriteId): string[] {
  const clip = GAMEPLAY_SPRITES[id];
  return clip.layout.kind === 'frames' ? [...clip.layout.paths] : clip.src ? [clip.src] : [];
}

export function isGameplaySpriteId(value: string): value is GameplaySpriteId {
  return Object.prototype.hasOwnProperty.call(GAMEPLAY_SPRITES, value);
}

function featureSpriteReferences(): string[] {
  const roleRefs = Object.values(ENEMY_ROLE_SPRITES).flatMap((set) => Object.values(set));
  const objectiveRefs = Object.values(OBJECTIVE_SPRITES).flatMap((set) => Object.values(set));
  const hazardRefs = Object.values(HAZARD_SPRITES).flatMap((set) => Object.values(set));
  const reactionRefs = Object.values(ELEMENT_REACTION_SPRITES).flatMap((set) => Object.values(set));
  return [
    ...roleRefs, ...objectiveRefs, ...hazardRefs, ...reactionRefs,
    ...Object.values(EXPLORATION_SPRITES), ...Object.values(COMBAT_FEEDBACK_SPRITES),
  ];
}

/** Structural validation that is safe to run in both browser code and tests. */
export function validateGameplaySpriteManifest(): string[] {
  const errors: string[] = [];
  const forbiddenAssetPaths = new Set(Object.keys(EXCLUDED_GAMEPLAY_ASSETS));

  for (const [id, clip] of Object.entries(GAMEPLAY_SPRITES)) {
    if (/emoji|procedural|canvas|shape/i.test(id)) errors.push(`${id}: visual id describes a generated placeholder`);
    const source = FREE_SPRITE_SOURCES[clip.sourceId];
    if (!source) {
      errors.push(`${id}: unknown free sprite source ${clip.sourceId}`);
      continue;
    }
    const paths = clip.layout.kind === 'frames' ? clip.layout.paths : clip.src ? [clip.src] : [];
    if (!paths.length) errors.push(`${id}: no sprite file`);
    for (const path of paths) {
      if (!path.startsWith('/assets/') || !path.toLowerCase().endsWith('.png')) errors.push(`${id}: invalid PNG path ${path}`);
      if (!source.assetRoots.some((root) => path.startsWith(root))) errors.push(`${id}: ${path} is outside ${clip.sourceId}`);
      if (forbiddenAssetPaths.has(path)) errors.push(`${id}: excluded asset ${path}`);
    }
    if (!Number.isFinite(clip.fps) || clip.fps <= 0 || !Number.isFinite(clip.scale) || clip.scale <= 0) {
      errors.push(`${id}: invalid playback metadata`);
    }
    if (clip.feetGap !== undefined && (
      !Number.isFinite(clip.feetGap) || clip.feetGap < 0
      || (clip.layout.kind === 'strip' && clip.feetGap >= clip.layout.frameHeight)
    )) errors.push(`${id}: invalid feet gap`);
    if (clip.layout.kind === 'strip' && (
      clip.layout.frameWidth <= 0 || clip.layout.frameHeight <= 0 || clip.layout.frameCount <= 0
    )) errors.push(`${id}: invalid strip layout`);
    if (clip.layout.kind === 'grid' && (
      clip.layout.frameWidth <= 0 || clip.layout.frameHeight <= 0 || clip.layout.columns <= 0
      || clip.layout.rows <= 0 || clip.layout.frameCount <= 0
    )) errors.push(`${id}: invalid grid layout`);
    if (clip.layout.kind === 'atlas' && (
      clip.layout.x < 0 || clip.layout.y < 0 || clip.layout.width <= 0 || clip.layout.height <= 0
    )) errors.push(`${id}: invalid atlas rect`);
  }

  for (const reference of featureSpriteReferences()) {
    if (!isGameplaySpriteId(reference)) errors.push(`unknown feature sprite id ${reference}`);
  }
  return errors;
}
