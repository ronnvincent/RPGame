export type EnemyMobState = 'idle' | 'walk' | 'run' | 'attack' | 'hit' | 'dead';
export type EnemyRendererKind = 'runtime-strip' | 'fantasy-one' | 'frame-sequence' | 'hero';

export interface EnemyAnimationStrip {
  src: string;
  frames: number;
  fps: number;
}

export interface EnemyVisualSource {
  id: string;
  title: string;
  sourceUrl: string;
  license: 'CC0-1.0';
  licenseEvidence: string;
}

export interface EnemyVisualProfile {
  id: string;
  species: string;
  silhouetteId: string;
  renderer: EnemyRendererKind;
  variant: string;
  sourceId: keyof typeof ENEMY_VISUAL_SOURCES;
  requiredAssets: readonly string[];
  scale: number;
  bossScale?: number;
  frame?: { width: number; height: number; feetGap: number; centreOffset: number };
  animations?: Partial<Record<EnemyMobState | 'move', EnemyAnimationStrip>>;
  /** Documents a deliberate temporary species mismatch instead of hiding it. */
  intentionalFallback?: string;
}

export const ENEMY_VISUAL_SOURCES = {
  'luizmelo-fantasy-2': {
    id: 'luizmelo-fantasy-2',
    title: 'Monsters Creatures Fantasy 2',
    sourceUrl: 'https://luizmelo.itch.io/monsters-creatures-fantasy-2',
    license: 'CC0-1.0',
    licenseEvidence: '/assets/runtime/licenses/luizmelo-monsters-creatures-fantasy-2-CC0-1.0.txt',
  },
  'luizmelo-fantasy-1': {
    id: 'luizmelo-fantasy-1',
    title: 'Monsters Creatures Fantasy',
    sourceUrl: 'https://luizmelo.itch.io/monsters-creatures-fantasy',
    license: 'CC0-1.0',
    licenseEvidence: '/assets/monsters/LICENSE-CC0.txt',
  },
  'ansimuz-swamp': {
    id: 'ansimuz-swamp',
    title: 'Gothicvania Swamp',
    sourceUrl: 'https://ansimuz.itch.io/gothicvania-swamp',
    license: 'CC0-1.0',
    licenseEvidence: '/assets/swamp/public-license.pdf',
  },
  'ansimuz-warped': {
    id: 'ansimuz-warped',
    title: 'Warped Caves',
    sourceUrl: 'https://ansimuz.itch.io/warped-caves',
    license: 'CC0-1.0',
    licenseEvidence: '/assets/warped-files/warped-files/public-license.pdf',
  },
  'hero-knight': {
    id: 'hero-knight', title: 'Hero Knight', sourceUrl: 'https://luizmelo.itch.io/hero-knight',
    license: 'CC0-1.0', licenseEvidence: '/assets/heroknight/License.txt',
  },
  huntress: {
    id: 'huntress', title: 'Huntress', sourceUrl: 'https://luizmelo.itch.io/huntress',
    license: 'CC0-1.0', licenseEvidence: '/assets/huntress/License.txt',
  },
  'evil-wizard': {
    id: 'evil-wizard', title: 'Evil Wizard', sourceUrl: 'https://luizmelo.itch.io/evil-wizard',
    license: 'CC0-1.0', licenseEvidence: '/assets/evil-wizard/License.txt',
  },
  berserker: {
    id: 'berserker', title: 'Medieval Warrior 2', sourceUrl: 'https://luizmelo.itch.io/medieval-warrior-pack-2',
    license: 'CC0-1.0', licenseEvidence: '/assets/warrior2/License.txt',
  },
  dragoon: {
    id: 'dragoon', title: 'Medieval Warrior 3', sourceUrl: 'https://luizmelo.itch.io/medieval-warrior-pack-3',
    license: 'CC0-1.0', licenseEvidence: '/assets/warrior3/License.txt',
  },
  'elder-dragon': {
    id: 'elder-dragon', title: 'Dragon (fully animated)', sourceUrl: 'https://opengameart.org/content/dragon-fully-animated',
    license: 'CC0-1.0', licenseEvidence: '/assets/elder_dragon/LICENSE-CC0.txt',
  },
  'opengameart-pixel-wolf': {
    id: 'opengameart-pixel-wolf', title: 'Pixel Wolf', sourceUrl: 'https://opengameart.org/content/pixel-wolf',
    license: 'CC0-1.0', licenseEvidence: '/assets/runtime/licenses/opengameart-pixel-wolf-CC0-1.0.txt',
  },
} as const satisfies Record<string, EnemyVisualSource>;

const F2 = '/assets/runtime/monsters/luizmelo-fantasy-2';
const PIXEL_WOLF_ROOT = '/assets/runtime/monsters/opengameart-pixel-wolf';
const SWAMP = '/assets/swamp/Sprites';
const WARPED = '/assets/warped-files/warped-files/Assets/PNG/sprites/enemies';

function stripProfile(
  id: string,
  species: string,
  silhouetteId: string,
  folder: string,
  frame: EnemyVisualProfile['frame'],
  scale: number,
  animations: NonNullable<EnemyVisualProfile['animations']>,
  sourceId: keyof typeof ENEMY_VISUAL_SOURCES = 'luizmelo-fantasy-2',
): EnemyVisualProfile {
  return {
    id, species, silhouetteId, renderer: 'runtime-strip', variant: folder,
    sourceId, frame, scale, bossScale: scale * 1.75,
    animations,
    requiredAssets: [...new Set(Object.values(animations).map((animation) => animation.src))],
  };
}

const SLIME = stripProfile('luiz-slime', 'slime', 'slime', 'slime',
  { width: 156, height: 156, feetGap: 69, centreOffset: 0 }, 1.05, {
    idle: { src: `${F2}/slime/idle.png`, frames: 14, fps: 9 },
    move: { src: `${F2}/slime/walk.png`, frames: 6, fps: 9 },
    attack: { src: `${F2}/slime/attack.png`, frames: 19, fps: 15 },
    hit: { src: `${F2}/slime/hurt.png`, frames: 3, fps: 11 },
    dead: { src: `${F2}/slime/death.png`, frames: 11, fps: 9 },
  });

const RAT = stripProfile('luiz-rat', 'rat', 'rat', 'rat',
  { width: 70, height: 70, feetGap: 25, centreOffset: 0 }, 1.55, {
    idle: { src: `${F2}/rat/idle.png`, frames: 10, fps: 9 },
    move: { src: `${F2}/rat/run.png`, frames: 8, fps: 12 },
    attack: { src: `${F2}/rat/attack-bite.png`, frames: 12, fps: 14 },
    hit: { src: `${F2}/rat/hurt.png`, frames: 3, fps: 11 },
    dead: { src: `${F2}/rat/rat-death.png`, frames: 6, fps: 8 },
  });

const PIXEL_WOLF = stripProfile('opengameart-pixel-wolf', 'wolf', 'wolf', 'pixel-wolf',
  { width: 66, height: 66, feetGap: 16, centreOffset: 0 }, 1.6, {
    idle: { src: `${PIXEL_WOLF_ROOT}/wolf-tail.png`, frames: 2, fps: 4 },
    move: { src: `${PIXEL_WOLF_ROOT}/wolf-run.png`, frames: 5, fps: 12 },
    attack: { src: `${PIXEL_WOLF_ROOT}/wolf-run.png`, frames: 5, fps: 15 },
    hit: { src: `${PIXEL_WOLF_ROOT}/wolf-tail.png`, frames: 2, fps: 8 },
    dead: { src: `${PIXEL_WOLF_ROOT}/wolf-tail.png`, frames: 2, fps: 1 },
  }, 'opengameart-pixel-wolf');

const RIDGE_PROWLER = {
  ...PIXEL_WOLF,
  id: 'opengameart-ridge-prowler',
  species: 'wolf',
  silhouetteId: 'ridge-wolf',
  scale: 1.65,
};
const MAGMA_HOUND = {
  ...PIXEL_WOLF,
  id: 'opengameart-magma-hound',
  species: 'hound',
  silhouetteId: 'magma-hound',
  scale: 1.7,
};
const ALPHA_GREYMANE = {
  ...PIXEL_WOLF,
  id: 'opengameart-alpha-greymane',
  species: 'wolf',
  silhouetteId: 'alpha-wolf',
  scale: 2.25,
  bossScale: 2.55,
};

const BAT = stripProfile('luiz-bat', 'bat', 'bat', 'bat',
  { width: 87, height: 87, feetGap: 25, centreOffset: 3.5 }, 1.35, {
    idle: { src: `${F2}/bat/fly.png`, frames: 11, fps: 11 },
    move: { src: `${F2}/bat/fly.png`, frames: 11, fps: 13 },
    attack: { src: `${F2}/bat/attack.png`, frames: 11, fps: 14 },
    hit: { src: `${F2}/bat/hurt.png`, frames: 3, fps: 11 },
    dead: { src: `${F2}/bat/death.png`, frames: 4, fps: 8 },
  });

const MIMIC = stripProfile('luiz-mimic', 'mimic', 'mimic', 'mimic',
  { width: 146, height: 146, feetGap: 63, centreOffset: 4 }, 1.08, {
    idle: { src: `${F2}/mimic/idle-transformed.png`, frames: 9, fps: 8 },
    move: { src: `${F2}/mimic/walk.png`, frames: 6, fps: 9 },
    attack: { src: `${F2}/mimic/attack-1.png`, frames: 14, fps: 14 },
    hit: { src: `${F2}/mimic/hurt.png`, frames: 3, fps: 11 },
    dead: { src: `${F2}/mimic/death.png`, frames: 6, fps: 8 },
  });

function fantasyOne(id: string, species: string, prefix: string): EnemyVisualProfile {
  const root = species === 'skeleton' ? 'Skeleton' : species === 'goblin' ? 'Goblin' : 'Flying eye';
  const idleFile = species === 'flying eye' ? 'Flight.png' : 'Idle.png';
  return {
    id, species, silhouetteId: species, renderer: 'fantasy-one', variant: prefix,
    sourceId: 'luizmelo-fantasy-1', scale: 1.15, bossScale: 2,
    requiredAssets: [`/assets/monsters/${root}/${idleFile}`],
  };
}

function hero(id: string, variant: 'knight' | 'huntress' | 'evil-wizard' | 'berserker' | 'dragoon', silhouetteId = variant): EnemyVisualProfile {
  const definitions = {
    knight: { sourceId: 'hero-knight' as const, path: '/assets/heroknight/Sprites/Idle.png' },
    huntress: { sourceId: 'huntress' as const, path: '/assets/huntress/Sprites/Idle.png' },
    'evil-wizard': { sourceId: 'evil-wizard' as const, path: '/assets/evil-wizard/Sprites/Idle.png' },
    berserker: { sourceId: 'berserker' as const, path: '/assets/warrior2/Sprites/Idle.png' },
    dragoon: { sourceId: 'dragoon' as const, path: '/assets/warrior3/Sprites/Idle.png' },
  };
  const definition = definitions[variant];
  return {
    id, species: variant, silhouetteId, renderer: 'hero', variant,
    sourceId: definition.sourceId, requiredAssets: [definition.path], scale: 0.92, bossScale: 1.25,
  };
}

function sequence(
  id: string,
  species: string,
  silhouetteId: string,
  sourceId: 'ansimuz-swamp' | 'ansimuz-warped',
  files: string[],
  scale: number,
): EnemyVisualProfile {
  return { id, species, silhouetteId, renderer: 'frame-sequence', variant: id, sourceId, requiredAssets: files, scale, bossScale: scale * 1.8 };
}

const SPIDER = sequence('swamp-spider', 'spider', 'spider', 'ansimuz-swamp',
  [1, 2, 3, 4].map((n) => `${SWAMP}/Spider/walk/spider${n}.png`), 2.4);
const GHOST = sequence('swamp-ghost', 'ghost', 'ghost', 'ansimuz-swamp',
  [1, 2, 3, 4].map((n) => `${SWAMP}/Ghost/Flying/Ghost${n}.png`), 2.05);
const SWAMP_THING = sequence('swamp-thing', 'swamp thing', 'hulking-thing', 'ansimuz-swamp',
  [1, 2, 3, 4].map((n) => `${SWAMP}/Thing/walk thing/thing${n}.png`), 2.0);
const CRAB = sequence('warped-crab', 'crab', 'crab', 'ansimuz-warped',
  [1, 2, 3, 4].map((n) => `${WARPED}/crab-walk/crab-walk-${n}.png`), 2.2);
const JUMPER = sequence('warped-jumper', 'jumper', 'stone-jumper', 'ansimuz-warped',
  [1, 2, 3, 4].map((n) => `${WARPED}/jumper-idle/jumper-idle-${n}.png`), 2.0);
const OCTOPUS = sequence('warped-octopus', 'octopus', 'octopus', 'ansimuz-warped',
  [1, 2, 3, 4].map((n) => `${WARPED}/octopus/octopus-${n}.png`), 2.45);

const SKELETON = fantasyOne('fantasy-skeleton', 'skeleton', 'skel');
const GOBLIN = fantasyOne('fantasy-goblin', 'goblin', 'gob');
const EYE = fantasyOne('fantasy-eye', 'flying eye', 'eye');
const KNIGHT = hero('hero-knight', 'knight');
const HUNTRESS = hero('hero-huntress', 'huntress');
const WIZARD = hero('hero-evil-wizard', 'evil-wizard');
const BERSERKER = hero('hero-berserker', 'berserker');
const DRAGOON = hero('hero-dragoon', 'dragoon');

const BOSS_KNIGHT = { ...KNIGHT, id: 'boss-knight', silhouetteId: 'colossal-knight', scale: 1.3, bossScale: 1.45 };
const BOSS_WIZARD = { ...WIZARD, id: 'boss-wizard', silhouetteId: 'arch-lich', scale: 1.3, bossScale: 1.5 };
const BOSS_BERSERKER = { ...BERSERKER, id: 'boss-berserker', silhouetteId: 'warlord', scale: 1.25, bossScale: 1.5 };
const BOSS_SPIDER = { ...SPIDER, id: 'boss-spider', silhouetteId: 'giant-spider', scale: 4.2, bossScale: 4.2 };
const BOSS_THING = { ...SWAMP_THING, id: 'boss-behemoth', silhouetteId: 'moon-behemoth', scale: 3.5, bossScale: 3.5 };
const DRAGON: EnemyVisualProfile = {
  id: 'elder-dragon', species: 'dragon', silhouetteId: 'elder-dragon', renderer: 'frame-sequence',
  variant: 'elder-dragon', sourceId: 'elder-dragon', scale: 0.55, bossScale: 0.55,
  requiredAssets: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `/assets/elder_dragon/idle/${n}.png`),
};

function fallback(base: EnemyVisualProfile, note: string): EnemyVisualProfile {
  return { ...base, intentionalFallback: note };
}

export const ENEMY_VISUAL_BY_NAME: Readonly<Record<string, EnemyVisualProfile>> = Object.freeze({
  'green slime': SLIME,
  'tunnel rat': RAT,
  'goblin rogue': GOBLIN,
  'goblin shaman': WIZARD,
  'orc berserker': BERSERKER,
  'chief warlord grimjaw': BOSS_BERSERKER,
  'skeleton warrior': SKELETON,
  'skeleton archer': SKELETON,
  'cursed wraith': GHOST,
  'death knight': KNIGHT,
  'arch-lich malakar': BOSS_WIZARD,
  'magma hound': MAGMA_HOUND,
  'fire imp': BAT,
  'lava golem': SWAMP_THING,
  'magma drake': BAT,
  'ancient red dragon ignis': DRAGON,
  'void phantom': GHOST,
  'astral slayer': DRAGOON,
  'eclipse sorcerer': WIZARD,
  'nightborne void overlord': fallback(BOSS_BERSERKER, 'CC0 armored void-lord stand-in; the unlicensed NightBorne sheet is intentionally not selected.'),
  'swamp spider': SPIDER,
  'bog ghost': GHOST,
  'swamp thing': SWAMP_THING,
  'broodmother queen': BOSS_SPIDER,
  'dusk wolf': PIXEL_WOLF,
  'mountain harpy': BAT,
  'bloodstone golem': SWAMP_THING,
  'blood moon behemoth': BOSS_THING,
  'deep coral crab': CRAB,
  'abyssal siren': WIZARD,
  'sunken titan': JUMPER,
  'leviathan of the deep': OCTOPUS,
  'cave bat swarm': BAT,
  'molten sentry': KNIGHT,
  'forge mimic': MIMIC,
  'gallet forge overlord': BOSS_BERSERKER,
  'vale raider': BERSERKER,
  'vale rat': RAT,
  'warband archer': HUNTRESS,
  'warband chief hadrik': BOSS_KNIGHT,
  'ridge prowler': RIDGE_PROWLER,
  'emerald wisp': EYE,
  'crag shaman': WIZARD,
  'alpha greymane': ALPHA_GREYMANE,
  'gate sentinel': KNIGHT,
  'siege rat': RAT,
  'siege adept': WIZARD,
  'castellan mordred': BOSS_BERSERKER,
  'nether stalker': GHOST,
  'celestial mimic': MIMIC,
  'rift bat': BAT,
  'starforged sentinel': KNIGHT,
  'celestial arbiter': BOSS_WIZARD,
});

export function normalizeEnemyVisualName(name: string): string {
  return name
    .replace(/^Elite\s+/i, '')
    .replace(/\s*\(Wave\s+\d+\)\s*$/i, '')
    .trim()
    .toLowerCase();
}

export function resolveEnemyVisual(name: string): EnemyVisualProfile | undefined {
  return ENEMY_VISUAL_BY_NAME[normalizeEnemyVisualName(name)];
}

export function getEnemyVisualAssetPaths(name: string): string[] {
  const visual = resolveEnemyVisual(name);
  return visual ? [...visual.requiredAssets] : [];
}
