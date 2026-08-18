/**
 * Parallax map definitions. DATA ONLY.
 *
 * drawEnvironment grew into 435 lines of hand-written branches, one per theme,
 * which is why adding or changing a map meant editing rendering code. A theme
 * here is just an ordered list of layers and how fast each one scrolls.
 *
 * scroll: 0 pins a layer to the camera (sky), 1 moves it with the world
 * (ground). Everything between gives depth - distant mountains near 0.1,
 * foreground trees near 0.7.
 */

export interface MapLayer {
  src: string;
  /** 0 = fixed to camera, 1 = moves with the world. */
  scroll: number;
  /**
   * Where the layer sits vertically.
   *
   * 'bottom' pins the layer to the bottom of the view, which is what a
   * full-height painted backdrop wants. 'horizon' stands it on the play line,
   * which is what discrete objects - mountains, houses, trees - want. Using
   * 'bottom' for those left them running off the bottom of the screen; using
   * 'horizon' for a backdrop leaves a flat band under it.
   */
  anchor?: 'top' | 'bottom' | 'horizon' | 'fill';
  /** Pixels down from the anchor, in destination space. */
  offsetY?: number;
  /** Height as a fraction of the viewport. Defaults to filling it. */
  heightFrac?: number;
  alpha?: number;
  blend?: GlobalCompositeOperation;
  /** Use one region of a sheet instead of the whole image. */
  rect?: { sx: number; sy: number; sw: number; sh: number };
  /** Drift independent of the camera, px/sec - clouds, fog. */
  drift?: number;
  /**
   * Discrete objects spread along the layer instead of one tiled image.
   *
   * Tiling suits a painted strip, but a sheet of separate clouds, mountains or
   * trees tiled as one rectangle reads as wallpaper: the same silhouette every
   * few hundred pixels. Scattering places measured pieces at chosen points of a
   * long cycle, so the skyline varies as the camera moves.
   */
  scatter?: ScatterItem[];
  /** World pixels per full scatter cycle. */
  spread?: number;
  /**
   * Drawn after the characters instead of behind them.
   *
   * Packs ship undergrowth and canopy meant to pass in FRONT of the player.
   * Drawn in the background pass they land on top of the ground itself, hiding
   * the very surface being stood on - which is why the forest looked like it
   * had nothing to walk on.
   */
  front?: boolean;
}

export interface ScatterItem {
  rect: { sx: number; sy: number; sw: number; sh: number };
  /** Height as a fraction of the viewport. */
  heightFrac: number;
  /** Position within the cycle, 0..1. */
  at: number;
  /** Pixels raised above the layer baseline. */
  lift?: number;
  alpha?: number;
  /** Mirror horizontally, so one piece reads as two. */
  flip?: boolean;
}

export interface MapTheme {
  /** Painted under everything, so a gap never shows the page through. */
  sky: string;
  layers: MapLayer[];
  /**
   * Tiled earth below the horizon.
   *
   * The town never had any: the old hand-written branches only painted down to
   * groundY and stopped, so characters stood on the sky. The pack ships a
   * ground tileset for exactly this.
   */
  ground?: MapGround;
  /**
   * Colour band under the horizon, for themes with no ground tiles.
   *
   * Every dungeon needed one and none had it. Backdrop art is transparent below
   * its silhouette - under a treeline, under a skyline - so with nothing behind
   * it the sky colour showed through and the character appeared to stand in a
   * void. The band is drawn after the layers, so it reads as ground in front of
   * the scenery rather than a hole behind it.
   */
  floor?: MapFloor;
  /**
   * Where the walkable surface sits inside this theme's layer art, as a
   * fraction of image height, measured by tools/measure-ground-line.mjs.
   *
   * Packs that bake the ground into a full-scene layer put the surface at a
   * fraction only the artist knows. Given it, the renderer scales and offsets
   * the whole scene so that line falls exactly on the play line - which is what
   * makes a character stand on the grass rather than in the dirt or above it.
   * All layers of such a pack share one registration, so this belongs to the
   * theme rather than to any single layer.
   */
  groundLine?: number;
}

export interface MapFloor {
  /** Lit edge along the horizon line. */
  top: string;
  /** Body of the earth below it. */
  body: string;
}

export interface MapGround {
  src: string;
  /** Grass-topped tile laid along the horizon. */
  surface: { sx: number; sy: number; sw: number; sh: number };
  /** Plain tile repeated beneath the surface row. */
  fill: { sx: number; sy: number; sw: number; sh: number };
  /** Destination tile size in world pixels. */
  tile: number;
}

const POLY = '/assets/maps/PolyStyle';
const FOREST = '/assets/maps/forest-blue';
const ANCIENT = '/assets/maps/ancient-forest';
const EDER = '/assets/maps/eder-forest';

// Five more layered sets were already sitting unused in public/assets - the
// same story as the character packs. No download needed for these.
const DUSK = '/assets/mountain-dusk/MountainsLayers';
const SEA = '/assets/underwater/PNG/layers';
const BOG = '/assets/swamp/Evironment';
const GROTTO = '/assets/warped-files/warped-files/Assets/PNG/environment/layers';
const GOTHIC = '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/layers';

/**
 * Measured regions of the PolyStyle sheets.
 *
 * These sheets are not grids - objects sit at irregular offsets inside mostly
 * empty cells, so slicing them by dividing the image gives boxes that are
 * largely transparent, which is why the mountains first rendered as small
 * shapes hugging the floor. Every box below is the tight alpha bounding box
 * reported by tools/measure-blobs.mjs.
 */
const R = (sx: number, sy: number, sw: number, sh: number) => ({ sx, sy, sw, sh });

const MOUNTAIN = [R(5, 410, 1011, 607), R(1032, 258, 1005, 765), R(2057, 245, 1013, 778)];
const CLOUD = [
  R(7, 233, 499, 275), R(25, 857, 477, 156), R(516, 262, 500, 243),
  R(519, 775, 504, 242), R(1033, 156, 495, 353), R(1036, 703, 497, 297),
];
const HILL_TOP = R(7, 235, 500, 277);
const HOUSE = [R(36, 353, 985, 668), R(1041, 373, 1007, 650)];
const TREE = {
  round: R(1633, 1040, 379, 495),
  broad: R(2163, 1024, 351, 505),
  slimA: R(202, 1543, 210, 504),
  slimB: R(682, 1544, 230, 503),
};

/** Foreground village pieces, drawn at world scale by the town renderer. */
export const POLY_SHEETS = {
  props: `${POLY}/Props and Houses/Props Tileset.png`,
  houses: `${POLY}/Props and Houses/Houses.png`,
  nature: `${POLY}/Nature/Nature Tileset.png`,
};

export const POLY_PROPS = {
  anvil: R(24, 195, 419, 316),
  well: R(87, 1545, 382, 485),
  lampPost: R(137, 1027, 180, 506),
  pillar: R(193, 532, 126, 491),
  boxOpen: R(521, 1216, 499, 310),
  clothesline: R(522, 627, 491, 393),
  log: R(527, 1979, 480, 68),
  barrel: R(598, 25, 340, 486),
  crate: R(1057, 654, 426, 368),
  slab: R(1546, 286, 495, 218),
  shield: R(1553, 1048, 472, 487),
  plank: R(1607, 1618, 369, 372),
  oven: R(1686, 529, 212, 494),
  bridge: R(2049, 1900, 511, 147),
  arch: R(2081, 541, 464, 469),
  hangingLantern: R(2241, 3, 123, 508),
  cart: R(2568, 248, 495, 263),
  wheel: R(2572, 1033, 475, 475),
  wallLamp: R(2771, 515, 246, 506),
};

export const POLY_HOUSES = HOUSE;

export const POLY_NATURE = {
  treeRound: TREE.round,
  treeBroad: TREE.broad,
  treeSlimA: TREE.slimA,
  treeSlimB: TREE.slimB,
  bushDark: R(136, 763, 267, 259),
  bushGreen: R(642, 796, 264, 227),
  rock: R(1092, 724, 351, 297),
  grassTuft: R(3, 317, 503, 192),
  grassTall: R(148, 1028, 215, 507),
  reeds: R(643, 1069, 265, 466),
};

export const MAPS: Record<string, MapTheme> = {
  // ---- Town: the PolyStyle village package ----
  town: {
    // Matches the top of PolyStyle's own BackGround gradient, so no seam shows
    // if the viewport is taller than the art.
    sky: '#5fd8ea',
    layers: [
      { src: `${POLY}/BackGround.png`, scroll: 0.02, anchor: 'fill' },

      // Six distinct clouds, high and slow, drifting against the camera.
      { src: `${POLY}/Nature/Clouds.png`, scroll: 0.10, anchor: 'top', drift: -5,
        alpha: 0.9, spread: 2600, scatter: [
          { rect: CLOUD[0], heightFrac: 0.13, at: 0.03, lift: -40 },
          { rect: CLOUD[4], heightFrac: 0.16, at: 0.22, lift: -18 },
          { rect: CLOUD[2], heightFrac: 0.11, at: 0.41, lift: -66 },
          { rect: CLOUD[5], heightFrac: 0.14, at: 0.58, lift: -30 },
          { rect: CLOUD[1], heightFrac: 0.08, at: 0.74, lift: -76 },
          { rect: CLOUD[3], heightFrac: 0.12, at: 0.89, lift: -50 },
        ] },

      // The three peaks alternate, two mirrored, so the ridge never repeats
      // within a screen width.
      { src: `${POLY}/Nature/Mountains.png`, scroll: 0.20, anchor: 'horizon',
        spread: 2100, scatter: [
          { rect: MOUNTAIN[1], heightFrac: 0.52, at: 0.02 },
          { rect: MOUNTAIN[0], heightFrac: 0.40, at: 0.26 },
          { rect: MOUNTAIN[2], heightFrac: 0.56, at: 0.48, flip: true },
          { rect: MOUNTAIN[0], heightFrac: 0.44, at: 0.72, flip: true },
          { rect: MOUNTAIN[1], heightFrac: 0.36, at: 0.88 },
        ] },

      // A village in the valley: the same two houses the street uses, small and
      // hazy enough to read as distance rather than as duplicates.
      { src: `${POLY}/Props and Houses/Houses.png`, scroll: 0.34, anchor: 'horizon',
        alpha: 0.55, spread: 1700, scatter: [
          { rect: HOUSE[1], heightFrac: 0.13, at: 0.08 },
          { rect: HOUSE[0], heightFrac: 0.11, at: 0.30, flip: true },
          { rect: HOUSE[0], heightFrac: 0.14, at: 0.57 },
          { rect: HOUSE[1], heightFrac: 0.10, at: 0.80, flip: true },
        ] },

      { src: `${POLY}/Nature/Hill.png`, scroll: 0.48, anchor: 'horizon',
        heightFrac: 0.22, offsetY: 10, rect: HILL_TOP },

      // Tree line just behind the street.
      { src: `${POLY}/Nature/Nature Tileset.png`, scroll: 0.68, anchor: 'horizon',
        spread: 1250, scatter: [
          { rect: TREE.round, heightFrac: 0.30, at: 0.05 },
          { rect: TREE.slimA, heightFrac: 0.24, at: 0.28, flip: true },
          { rect: TREE.broad, heightFrac: 0.33, at: 0.52 },
          { rect: TREE.slimB, heightFrac: 0.26, at: 0.79 },
        ] },
    ],
    ground: {
      src: `${POLY}/Village Tileset/Platformer-Ground Tileset.png`,
      surface: R(128, 256, 128, 128),
      fill: R(128, 128, 128, 128),
      tile: 64,
    }
  },

  // ---- Goblin Catacombs: the Ancient Forest pack ----
  //
  // The first pack here that brings its own ground rather than a backdrop alone,
  // which is why the theme needs groundLine: every layer is one 16:9 scene with
  // the walkable surface baked in at 0.8444 of the image height, measured with
  // tools/measure-ground-line.mjs. The renderer scales the scene so that line
  // falls on the play line, so the characters stand on the grass instead of a
  // flat colour band standing in for earth.
  //
  // ForeGround and FrontBushes are drawn behind the characters despite their
  // names - the environment is one pass, before any entity - so they read as
  // undergrowth rather than as an overlay.
  catacombs: {
    sky: '#121c14',
    groundLine: 0.8444,
    layers: [
      { src: `${ANCIENT}/BackGround.png`, scroll: 0.04 },
      { src: `${ANCIENT}/Background Forest.png`, scroll: 0.12 },
      { src: `${ANCIENT}/FarTrees.png`, scroll: 0.24 },
      { src: `${ANCIENT}/MiddleTrees.png`, scroll: 0.42 },
      { src: `${ANCIENT}/NearTrees.png`, scroll: 0.62 },
      { src: `${ANCIENT}/FrontBushes.png`, scroll: 0.85 },
      { src: `${ANCIENT}/ForeGround.png`, scroll: 0.92 },
      // The ground goes last so the undergrowth sits behind the surface rather
      // than on top of it. Put in front of the characters instead, these two
      // layers buried the player and the boss completely.
      { src: `${ANCIENT}/Ground.png`, scroll: 1.0 },
    ],
    floor: { top: '#3d5a2e', body: '#1a1410' }
  },




  // ---- Void Nexus: the futuristic city reads as an astral rift ----
  // ---- Void Nexus: the seamless blue forest ----
  // Also not what the name suggests, for the same reason. Seamless and 16:9, so
  // one tile is one screen.
  void: {
    sky: '#0a1420',
    groundLine: 0.8898,
    layers: [
      { src: `${FOREST}/10_Sky.png`, scroll: 0.02 },
      { src: `${FOREST}/09_Forest.png`, scroll: 0.10 },
      { src: `${FOREST}/08_Forest.png`, scroll: 0.18 },
      { src: `${FOREST}/07_Forest.png`, scroll: 0.27 },
      { src: `${FOREST}/06_Forest.png`, scroll: 0.37 },
      { src: `${FOREST}/05_Particles.png`, scroll: 0.44, alpha: 0.8, drift: -5 },
      { src: `${FOREST}/04_Forest.png`, scroll: 0.52 },
      { src: `${FOREST}/03_Particles.png`, scroll: 0.63, alpha: 0.9, drift: -9 },
      { src: `${FOREST}/02_Bushes.png`, scroll: 1.0 },
      { src: `${FOREST}/01_Mist.png`, scroll: 0.58, alpha: 0.3, drift: -3 },
    ],
    floor: { top: '#26403a', body: '#0a1412' }
  },



  // ---- Twilight Peaks: the mountain-dusk layer set ----
  mountain: {
    sky: '#2b1d38',
    layers: [
      { src: `${DUSK}/sky.png`, scroll: 0.02, anchor: 'fill' },
      { src: `${DUSK}/far-clouds.png`, scroll: 0.08, anchor: 'bottom', drift: 3 },
      { src: `${DUSK}/far-mountains.png`, scroll: 0.16, anchor: 'bottom' },
      { src: `${DUSK}/mountains.png`, scroll: 0.30, anchor: 'bottom' },
      { src: `${DUSK}/near-clouds.png`, scroll: 0.22, anchor: 'bottom', alpha: 0.75, drift: 7 },
      { src: `${DUSK}/trees.png`, scroll: 0.58, anchor: 'bottom' },
    ],
    floor: { top: '#40334f', body: '#150f1e' }
  },

  // ---- Sunken Abyss ----
  underwater: {
    sky: '#06283d',
    layers: [
      { src: `${SEA}/far.png`, scroll: 0.05, anchor: 'fill' },
      { src: `${SEA}/foreground-2.png`, scroll: 0.24, anchor: 'bottom' },
      { src: `${SEA}/foreground-1.png`, scroll: 0.48, anchor: 'bottom' },
      { src: `${SEA}/sand.png`, scroll: 0.75, anchor: 'bottom', heightFrac: 0.45 },
    ],
    floor: { top: '#c4aa7a', body: '#7d6640' }
  },

  // ---- Venomous Swamp ----
  swamp: {
    sky: '#0f1a14',
    layers: [
      { src: `${BOG}/background.png`, scroll: 0.04, anchor: 'fill' },
      { src: `${BOG}/mid-layer-01.png`, scroll: 0.20, anchor: 'bottom' },
      { src: `${BOG}/mid-layer-02.png`, scroll: 0.38, anchor: 'bottom' },
      { src: `${BOG}/trees.png`, scroll: 0.62, anchor: 'bottom', heightFrac: 0.78 },
    ],
    floor: { top: '#2d3d26', body: '#09110b' }
  },

  // ---- Gallet Depths: the Warped grotto set ----
  caves: {
    sky: '#120d16',
    layers: [
      { src: `${GROTTO}/background.png`, scroll: 0.06, anchor: 'fill' },
      { src: `${GROTTO}/middleground.png`, scroll: 0.26, anchor: 'bottom' },
      { src: `${GROTTO}/walls.png`, scroll: 0.45, anchor: 'bottom', heightFrac: 0.70 },
      { src: `${GROTTO}/props.png`, scroll: 0.66, anchor: 'bottom', heightFrac: 0.60 },
    ],
    floor: { top: '#332839', body: '#0a0710' }
  },

  // ---- Crypt of the Damned: GothicVania ----
  // ---- Crypt: Eder Muniz's forest ----
  // Named for a crypt, dressed as a deep wood - the priority was that every
  // dungeon have real ground, decoration and depth rather than a matching name.
  // Twelve layers, two of them light shafts, ground line measured at 0.9319.
  crypt: {
    sky: '#0c140d',
    groundLine: 0.9319,
    layers: [
      { src: `${EDER}/Layer_0011_0.png`, scroll: 0.03 },
      { src: `${EDER}/Layer_0010_1.png`, scroll: 0.08 },
      { src: `${EDER}/Layer_0009_2.png`, scroll: 0.14 },
      { src: `${EDER}/Layer_0008_3.png`, scroll: 0.21 },
      { src: `${EDER}/Layer_0007_Lights.png`, scroll: 0.26, alpha: 0.55 },
      { src: `${EDER}/Layer_0006_4.png`, scroll: 0.32 },
      { src: `${EDER}/Layer_0005_5.png`, scroll: 0.42 },
      { src: `${EDER}/Layer_0004_Lights.png`, scroll: 0.5, alpha: 0.45 },
      { src: `${EDER}/Layer_0003_6.png`, scroll: 0.58 },
      { src: `${EDER}/Layer_0002_7.png`, scroll: 0.7 },
      { src: `${EDER}/Layer_0001_8.png`, scroll: 0.85 },
      { src: `${EDER}/Layer_0000_9.png`, scroll: 1.0 },
    ],
    floor: { top: '#2f4a2a', body: '#10180f' }
  },

};

/** Themes still on the old hand-written renderer. */
export const THEMES_WITHOUT_ART = ['inferno'];

/**
 * Floors for themes still drawn by the legacy hand-written branch.
 *
 * inferno keeps its bespoke magma sky and embers until lava parallax art
 * exists, but it needs ground under the player just as much as the rest.
 */
export const LEGACY_FLOORS: Record<string, MapFloor> = {
  inferno: { top: '#7a2a14', body: '#180705' },
};

export function allMapImagePaths(): string[] {
  const out = new Set<string>();
  for (const t of Object.values(MAPS)) for (const l of t.layers) out.add(l.src);
  // The props sheet is never a parallax layer - the town street draws from it
  // directly - so it has to be listed or it would load only on first sight.
  for (const src of Object.values(POLY_SHEETS)) out.add(src);
  for (const t of Object.values(MAPS)) if (t.ground) out.add(t.ground.src);
  return [...out];
}
