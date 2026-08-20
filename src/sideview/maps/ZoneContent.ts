import type { BattleTheme } from '../dungeons/DungeonManager';

export type ZonePlane = 'background' | 'gameplay-back' | 'foreground';
export type LandmarkKind =
  | 'guild-keep'
  | 'root-tunnel'
  | 'crypt-gate'
  | 'volcano'
  | 'void-rift'
  | 'bog-shrine'
  | 'moon-watchtower'
  | 'coral-gate'
  | 'forge-furnace'
  | 'vale-windmill'
  | 'druid-stones'
  | 'castle-gate'
  | 'celestial-ring';

export type HazardKind =
  | 'root-spikes'
  | 'cursed-mist'
  | 'lava-vent'
  | 'void-pulse'
  | 'poison-pool'
  | 'rockfall'
  | 'abyss-current'
  | 'forge-geyser'
  | 'warband-volley'
  | 'ridge-gust'
  | 'siege-shot'
  | 'astral-burst';

export interface AtlasRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface ZonePlaneDefinition {
  id: string;
  plane: ZonePlane;
  parallax: number;
  role: string;
}

export interface ZoneDecoration {
  id: string;
  plane: ZonePlane;
  x: number;
  yOffsetFromGround: number;
  width: number;
  height: number;
  parallax: number;
  alpha: number;
  flipX?: boolean;
  asset?: string;
  rect?: AtlasRect;
  landmark?: LandmarkKind;
}

export interface VisibleZoneDecoration extends ZoneDecoration {
  screenX: number;
}

export interface ZonePlatformPlan {
  id: string;
  x: number;
  width: number;
  height: number;
  yOffsetFromGround: number;
  collision: 'one-way' | 'solid';
  supportToGround: boolean;
  material: 'stone' | 'wood' | 'earth' | 'coral' | 'metal' | 'astral';
}

/** Shape-compatible with SideViewEngine.Platform without importing the engine. */
export interface BuiltZonePlatform {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ZoneHazardPlan {
  id: string;
  kind: HazardKind;
  telegraph: string;
  damageCooldownMs: number;
  anchors: readonly number[];
  radius: number;
  safeMargin: number;
}

export interface BuiltZoneHazard extends ZoneHazardPlan {
  y: number;
}

export interface ZoneSpawnPlan {
  party: readonly number[];
  enemies: readonly number[];
  boss: number;
  minimumSeparation: number;
}

export interface ZoneGroundRegistration {
  mode: 'theme-ground' | 'baked-layer' | 'floor-band';
  note: string;
}

/**
 * Small, procedural accents used to give each zone its own atmosphere without
 * adding another texture family to the browser's decoded-image budget.
 */
export type ZoneAtmosphereMotif =
  | 'lantern-dust'
  | 'root-spore'
  | 'soul-wisp'
  | 'ember'
  | 'void-star'
  | 'firefly'
  | 'wind-snow'
  | 'bubble'
  | 'forge-spark'
  | 'pollen'
  | 'leaf'
  | 'siege-ash'
  | 'constellation';

export type ZoneFrameStyle = 'canopy' | 'arch' | 'crag' | 'current' | 'rift';

export interface ZoneAtmosphereProfile {
  /** Stable seed: atmosphere placement must not flicker between frames. */
  seed: number;
  haze: {
    upper: string;
    lower: string;
    alpha: number;
    horizon: string;
    horizonAlpha: number;
  };
  shafts: {
    color: string;
    alpha: number;
    count: number;
    slant: number;
  };
  motes: {
    motif: ZoneAtmosphereMotif;
    color: string;
    alpha: number;
    count: number;
    size: number;
    velocityX: number;
    velocityY: number;
    parallax: number;
  };
  frame: {
    style: ZoneFrameStyle;
    color: string;
    alpha: number;
  };
  readability: {
    /** Empty space above the play line reserved for feet and hazard tells. */
    clearBand: number;
    /** Fraction of the viewport that foreground framing may never occlude. */
    centerClearRatio: number;
    maxForegroundAlpha: number;
  };
}

export interface ZoneContentDefinition {
  theme: BattleTheme;
  title: string;
  battle: boolean;
  planes: readonly ZonePlaneDefinition[];
  landmark: LandmarkKind;
  decorations: readonly ZoneDecoration[];
  platforms: readonly ZonePlatformPlan[];
  flatArenaRationale?: string;
  hazard?: ZoneHazardPlan;
  spawn: ZoneSpawnPlan;
  ground: ZoneGroundRegistration;
  grade: { overlay: string; alpha: number; ambient: string };
  atmosphere: ZoneAtmosphereProfile;
  preload: { tier: 'zone'; maxBytes: number; assets: readonly string[] };
}

interface ZoneSpec {
  title: string;
  landmark: LandmarkKind;
  hazard?: HazardKind;
  telegraph?: string;
  material: ZonePlatformPlan['material'];
  grade: string;
  ambient: string;
  seed: number;
  ground: ZoneGroundRegistration['mode'];
  flatArenaRationale?: string;
}

type AuthoredAtmosphere = Omit<ZoneAtmosphereProfile, 'seed' | 'readability'>;

/**
 * The identity palette is intentionally authored data rather than inferred
 * from the map name. That keeps a new zone from silently inheriting another
 * biome's motes or framing when it is added to BattleTheme.
 */
const ATMOSPHERES: Record<BattleTheme, AuthoredAtmosphere> = {
  town: {
    haze: { upper: '#33405a', lower: '#d69a56', alpha: 0.12, horizon: '#ffd796', horizonAlpha: 0.13 },
    shafts: { color: '#ffe8b8', alpha: 0.075, count: 3, slant: 0.12 },
    motes: { motif: 'lantern-dust', color: '#ffd58a', alpha: 0.5, count: 11, size: 1.5, velocityX: 2, velocityY: -2, parallax: 0.1 },
    frame: { style: 'canopy', color: '#241b23', alpha: 0.1 },
  },
  catacombs: {
    haze: { upper: '#17271c', lower: '#44613b', alpha: 0.18, horizon: '#8bcf78', horizonAlpha: 0.1 },
    shafts: { color: '#98c78e', alpha: 0.045, count: 2, slant: -0.08 },
    motes: { motif: 'root-spore', color: '#b6dd86', alpha: 0.48, count: 14, size: 1.8, velocityX: 1, velocityY: -5, parallax: 0.18 },
    frame: { style: 'arch', color: '#102018', alpha: 0.15 },
  },
  crypt: {
    haze: { upper: '#171522', lower: '#504060', alpha: 0.19, horizon: '#c59ce1', horizonAlpha: 0.11 },
    shafts: { color: '#d8c2ed', alpha: 0.055, count: 2, slant: 0.04 },
    motes: { motif: 'soul-wisp', color: '#dcb8ff', alpha: 0.47, count: 9, size: 2.3, velocityX: -2, velocityY: -7, parallax: 0.14 },
    frame: { style: 'arch', color: '#17131f', alpha: 0.16 },
  },
  inferno: {
    haze: { upper: '#2c1114', lower: '#8a2d1b', alpha: 0.2, horizon: '#ff7a32', horizonAlpha: 0.16 },
    shafts: { color: '#ffb15c', alpha: 0.04, count: 1, slant: -0.15 },
    motes: { motif: 'ember', color: '#ffb347', alpha: 0.66, count: 17, size: 1.7, velocityX: 6, velocityY: -18, parallax: 0.2 },
    frame: { style: 'crag', color: '#210d0c', alpha: 0.17 },
  },
  void: {
    haze: { upper: '#100c25', lower: '#39235d', alpha: 0.2, horizon: '#b37cff', horizonAlpha: 0.17 },
    shafts: { color: '#a978ff', alpha: 0.065, count: 3, slant: 0.2 },
    motes: { motif: 'void-star', color: '#d7c2ff', alpha: 0.68, count: 13, size: 1.6, velocityX: -3, velocityY: 1, parallax: 0.08 },
    frame: { style: 'rift', color: '#160d30', alpha: 0.17 },
  },
  swamp: {
    haze: { upper: '#11241b', lower: '#315f3e', alpha: 0.21, horizon: '#86d26f', horizonAlpha: 0.12 },
    shafts: { color: '#a4d6a2', alpha: 0.035, count: 2, slant: 0.08 },
    motes: { motif: 'firefly', color: '#c9ff63', alpha: 0.7, count: 10, size: 2, velocityX: 3, velocityY: -2, parallax: 0.16 },
    frame: { style: 'canopy', color: '#0d2417', alpha: 0.17 },
  },
  mountain: {
    haze: { upper: '#302139', lower: '#765064', alpha: 0.14, horizon: '#f1a1ab', horizonAlpha: 0.12 },
    shafts: { color: '#ffe3df', alpha: 0.05, count: 3, slant: -0.22 },
    motes: { motif: 'wind-snow', color: '#f9e9ed', alpha: 0.52, count: 16, size: 1.25, velocityX: 24, velocityY: 5, parallax: 0.24 },
    frame: { style: 'crag', color: '#241b2d', alpha: 0.14 },
  },
  underwater: {
    haze: { upper: '#062f48', lower: '#087879', alpha: 0.2, horizon: '#78f2dc', horizonAlpha: 0.12 },
    shafts: { color: '#b0fff1', alpha: 0.08, count: 4, slant: -0.1 },
    motes: { motif: 'bubble', color: '#c9fff7', alpha: 0.5, count: 15, size: 2.2, velocityX: 2, velocityY: -10, parallax: 0.12 },
    frame: { style: 'current', color: '#052f3b', alpha: 0.14 },
  },
  caves: {
    haze: { upper: '#1d1918', lower: '#60402b', alpha: 0.19, horizon: '#ff9b55', horizonAlpha: 0.14 },
    shafts: { color: '#f8c27c', alpha: 0.035, count: 1, slant: 0.02 },
    motes: { motif: 'forge-spark', color: '#ffc06a', alpha: 0.68, count: 12, size: 1.45, velocityX: 11, velocityY: -15, parallax: 0.2 },
    frame: { style: 'crag', color: '#171312', alpha: 0.18 },
  },
  sunlit_vale: {
    haze: { upper: '#6ea1be', lower: '#d6c87a', alpha: 0.1, horizon: '#fff1ad', horizonAlpha: 0.17 },
    shafts: { color: '#fff4c2', alpha: 0.095, count: 4, slant: 0.14 },
    motes: { motif: 'pollen', color: '#fff2a0', alpha: 0.58, count: 18, size: 1.35, velocityX: 6, velocityY: -1, parallax: 0.11 },
    frame: { style: 'canopy', color: '#23422d', alpha: 0.09 },
  },
  emerald_ridge: {
    haze: { upper: '#294f51', lower: '#4f936a', alpha: 0.13, horizon: '#a4e39d', horizonAlpha: 0.12 },
    shafts: { color: '#c8efc0', alpha: 0.055, count: 3, slant: -0.16 },
    motes: { motif: 'leaf', color: '#9fe274', alpha: 0.56, count: 13, size: 2, velocityX: 18, velocityY: 4, parallax: 0.22 },
    frame: { style: 'canopy', color: '#173b28', alpha: 0.14 },
  },
  castle_approach: {
    haze: { upper: '#35404e', lower: '#7a7f83', alpha: 0.16, horizon: '#cdd3d7', horizonAlpha: 0.1 },
    shafts: { color: '#e5e7eb', alpha: 0.04, count: 2, slant: -0.05 },
    motes: { motif: 'siege-ash', color: '#d0cbc3', alpha: 0.48, count: 15, size: 1.4, velocityX: 10, velocityY: 6, parallax: 0.18 },
    frame: { style: 'arch', color: '#222934', alpha: 0.16 },
  },
  endless: {
    haze: { upper: '#17143b', lower: '#593d83', alpha: 0.18, horizon: '#f6cf64', horizonAlpha: 0.15 },
    shafts: { color: '#dccbff', alpha: 0.07, count: 4, slant: 0 },
    motes: { motif: 'constellation', color: '#ffe895', alpha: 0.7, count: 12, size: 1.8, velocityX: 1, velocityY: -1, parallax: 0.06 },
    frame: { style: 'rift', color: '#171237', alpha: 0.16 },
  },
};

const SPECS: Record<BattleTheme, ZoneSpec> = {
  town: {
    title: 'Guild Town', landmark: 'guild-keep', material: 'wood', grade: '#f6c56d',
    ambient: '#ffe0a3', seed: 2, ground: 'theme-ground',
    flatArenaRationale: 'The social hub keeps one uninterrupted accessible route between every service.',
  },
  catacombs: {
    title: 'Goblin Catacombs', landmark: 'root-tunnel', hazard: 'root-spikes',
    telegraph: 'Roots flex and shed dust before the spikes rise.', material: 'earth',
    grade: '#486b3b', ambient: '#81c784', seed: 5, ground: 'baked-layer',
  },
  crypt: {
    title: 'Crypt of the Damned', landmark: 'crypt-gate', hazard: 'cursed-mist',
    telegraph: 'Runes glow violet before the mist becomes harmful.', material: 'stone',
    grade: '#65457d', ambient: '#ba68c8', seed: 9, ground: 'baked-layer',
  },
  inferno: {
    title: "Inferno Dragon's Lair", landmark: 'volcano', hazard: 'lava-vent',
    telegraph: 'The vent flashes orange and cracks before erupting.', material: 'stone',
    grade: '#9f2d18', ambient: '#ff7043', seed: 13, ground: 'floor-band',
  },
  void: {
    title: 'The Void Nexus', landmark: 'void-rift', hazard: 'void-pulse',
    telegraph: 'A contracting astral ring marks the pulse radius.', material: 'astral',
    grade: '#513084', ambient: '#c084fc', seed: 17, ground: 'floor-band',
  },
  swamp: {
    title: 'Venomous Swamp', landmark: 'bog-shrine', hazard: 'poison-pool',
    telegraph: 'Bubbles and lime spores surface before poison damage begins.', material: 'wood',
    grade: '#315d3a', ambient: '#4ade80', seed: 21, ground: 'floor-band',
  },
  mountain: {
    title: 'Twilight Peaks', landmark: 'moon-watchtower', hazard: 'rockfall',
    telegraph: 'Pebbles and a narrow shadow announce each falling rock.', material: 'stone',
    grade: '#6b355f', ambient: '#f43f5e', seed: 25, ground: 'floor-band',
  },
  underwater: {
    title: 'Sunken Abyss', landmark: 'coral-gate', hazard: 'abyss-current',
    telegraph: 'Bubbles stream sideways before the current surges.', material: 'coral',
    grade: '#0f6d75', ambient: '#2dd4bf', seed: 29, ground: 'floor-band',
  },
  caves: {
    title: 'Gallet Depths', landmark: 'forge-furnace', hazard: 'forge-geyser',
    telegraph: 'The grate glows and rattles before steam erupts.', material: 'metal',
    grade: '#7a4027', ambient: '#fb923c', seed: 33, ground: 'floor-band',
  },
  sunlit_vale: {
    title: 'Sunlit Vale', landmark: 'vale-windmill', hazard: 'warband-volley',
    telegraph: 'Arrow shadows sweep across the marked lane before impact.', material: 'wood',
    grade: '#e0bd61', ambient: '#bef264', seed: 37, ground: 'baked-layer',
  },
  emerald_ridge: {
    title: 'Emerald Ridge', landmark: 'druid-stones', hazard: 'ridge-gust',
    telegraph: 'Leaves stream toward the danger lane before the gust.', material: 'earth',
    grade: '#4b9b70', ambient: '#4ade80', seed: 41, ground: 'baked-layer',
  },
  castle_approach: {
    title: 'Castle Approach', landmark: 'castle-gate', hazard: 'siege-shot',
    telegraph: 'A red impact circle and fuse trail precede the cannonball.', material: 'stone',
    grade: '#7f8999', ambient: '#e2e8f0', seed: 45, ground: 'baked-layer',
  },
  endless: {
    title: 'Endless Celestial Arena', landmark: 'celestial-ring', hazard: 'astral-burst',
    telegraph: 'Constellations connect into a bright ring before detonation.', material: 'astral',
    grade: '#7053b6', ambient: '#facc15', seed: 49, ground: 'floor-band',
    flatArenaRationale: 'The endless score trial uses a stable tournament floor; height comes from optional one-way astral ledges.',
  },
};

function decorationsFor(theme: BattleTheme, spec: ZoneSpec): ZoneDecoration[] {
  // Keep each zone's named RPG landmark, but do not synthesize generic atlas
  // rocks, trees, arches, or foreground chunks. Those terrain.png crops were
  // repeated across every biome and could scale into giant scattered props.
  return [
    {
      id: `${theme}-landmark`, plane: 'background', x: 520, yOffsetFromGround: 0,
      width: 260, height: 230, parallax: 0.34, alpha: 0.94, landmark: spec.landmark,
    },
  ];
}

function platformsFor(theme: BattleTheme, material: ZonePlatformPlan['material']): ZonePlatformPlan[] {
  const lift = theme === 'underwater' ? 82 : theme === 'mountain' ? 112 : 92;
  return [
    { id: `${theme}-ledge-west`, x: 1030, width: 220, height: 22, yOffsetFromGround: lift, collision: 'one-way', supportToGround: true, material },
    { id: `${theme}-ledge-mid`, x: 1770, width: 260, height: 22, yOffsetFromGround: lift + 34, collision: 'one-way', supportToGround: true, material },
    { id: `${theme}-ledge-east`, x: 2550, width: 210, height: 22, yOffsetFromGround: lift - 10, collision: 'one-way', supportToGround: true, material },
  ];
}

function hazardFor(theme: BattleTheme, spec: ZoneSpec): ZoneHazardPlan | undefined {
  if (!spec.hazard || !spec.telegraph) return undefined;
  return {
    id: `${theme}-hazard`, kind: spec.hazard, telegraph: spec.telegraph,
    damageCooldownMs: 900, anchors: [1280, 2090, 2920], radius: 86, safeMargin: 280,
  };
}

function makeZone(theme: BattleTheme, spec: ZoneSpec): ZoneContentDefinition {
  const atmosphere = ATMOSPHERES[theme];
  return {
    theme,
    title: spec.title,
    battle: theme !== 'town',
    planes: [
      { id: `${theme}-distant`, plane: 'background', parallax: 0.18, role: 'distant silhouette and landmark plane' },
      { id: `${theme}-props`, plane: 'gameplay-back', parallax: 0.82, role: 'grounded authored prop plane' },
      { id: `${theme}-occlusion`, plane: 'foreground', parallax: 1.08, role: 'camera-culled foreground occlusion plane' },
    ],
    landmark: spec.landmark,
    decorations: decorationsFor(theme, spec),
    platforms: theme === 'town' ? [] : platformsFor(theme, spec.material),
    flatArenaRationale: spec.flatArenaRationale,
    hazard: hazardFor(theme, spec),
    spawn: {
      party: [260, 340, 420, 500],
      enemies: [920, 1210, 1510, 1840, 2200, 2570, 2960, 3260],
      boss: 2860,
      minimumSeparation: 280,
    },
    ground: { mode: spec.ground, note: `Registered to the ${spec.ground.replace('-', ' ')} play line.` },
    grade: { overlay: spec.grade, alpha: theme === 'town' ? 0.035 : 0.075, ambient: spec.ambient },
    atmosphere: {
      ...atmosphere,
      seed: spec.seed * 2_654_435_761 >>> 0,
      readability: {
        clearBand: theme === 'underwater' ? 58 : 52,
        centerClearRatio: 0.72,
        maxForegroundAlpha: Math.min(0.18, atmosphere.frame.alpha),
      },
    },
    preload: { tier: 'zone', maxBytes: 25_000, assets: [] },
  };
}

export const ZONE_CONTENT = Object.freeze(
  Object.fromEntries(
    (Object.keys(SPECS) as BattleTheme[]).map((theme) => [theme, makeZone(theme, SPECS[theme])]),
  ) as Record<BattleTheme, ZoneContentDefinition>,
);

export function getZoneContent(theme: BattleTheme): ZoneContentDefinition {
  return ZONE_CONTENT[theme];
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getZoneSpawnLayout(
  theme: BattleTheme,
  waveIndex: number,
  arenaWidth: number = 3600,
): ZoneSpawnPlan {
  const source = ZONE_CONTENT[theme].spawn;
  const candidates = source.enemies.filter((x) => x < arenaWidth - 120);
  const seed = stableHash(`${theme}:${Math.max(0, Math.floor(waveIndex))}:${Math.floor(arenaWidth)}`);
  const rotation = candidates.length > 0 ? seed % candidates.length : 0;
  const enemies = candidates.map((_, index) => {
    const base = candidates[(index + rotation) % candidates.length];
    const jitter = ((seed >>> (index % 16)) % 49) - 24;
    return Math.max(780, Math.min(arenaWidth - 120, base + jitter));
  });

  return {
    party: source.party.filter((x) => x < arenaWidth - source.minimumSeparation),
    enemies,
    boss: Math.max(900, Math.min(arenaWidth - 160, source.boss + ((seed % 61) - 30))),
    minimumSeparation: source.minimumSeparation,
  };
}

export function buildZonePlatforms(
  theme: BattleTheme,
  groundY: number,
  arenaWidth: number = 3600,
): BuiltZonePlatform[] {
  return ZONE_CONTENT[theme].platforms
    .filter((platform) => platform.x + platform.width <= arenaWidth - 80)
    .map((platform) => ({
      x: platform.x,
      y: groundY - platform.yOffsetFromGround,
      width: platform.width,
      height: platform.height,
    }));
}

export function buildZoneHazards(
  theme: BattleTheme,
  groundY: number,
  arenaWidth: number = 3600,
): BuiltZoneHazard[] {
  const hazard = ZONE_CONTENT[theme].hazard;
  if (!hazard) return [];
  return hazard.anchors
    .filter((x) => x + hazard.radius < arenaWidth - 80)
    .map((x, index) => ({ ...hazard, id: `${hazard.id}-${index + 1}`, anchors: [x], y: groundY }));
}

export function getVisibleZoneDecorations(
  theme: BattleTheme,
  plane: ZonePlane,
  cameraX: number,
  viewportWidth: number,
  margin: number = 160,
): VisibleZoneDecoration[] {
  return ZONE_CONTENT[theme].decorations
    .filter((decoration) => decoration.plane === plane)
    .map((decoration) => ({ ...decoration, screenX: decoration.x - cameraX * decoration.parallax }))
    .filter((decoration) => decoration.screenX + decoration.width >= -margin && decoration.screenX <= viewportWidth + margin);
}

export function getZonePreloadPaths(theme: BattleTheme): string[] {
  return [...new Set(ZONE_CONTENT[theme].preload.assets)];
}
