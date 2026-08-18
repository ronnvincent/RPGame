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
  /** Where the layer sits vertically. */
  anchor?: 'top' | 'bottom' | 'fill';
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
}

export interface MapTheme {
  /** Painted under everything, so a gap never shows the page through. */
  sky: string;
  layers: MapLayer[];
}

const POLY = '/assets/maps/PolyStyle';
const FOREST = '/assets/maps/parallax_forest/parallax_forest';
const CITY = '/assets/maps/Futuristic City Parallax';

// Five more layered sets were already sitting unused in public/assets - the
// same story as the character packs. No download needed for these.
const DUSK = '/assets/mountain-dusk/MountainsLayers';
const SEA = '/assets/underwater/PNG/layers';
const BOG = '/assets/swamp/Evironment';
const GROTTO = '/assets/warped-files/warped-files/Assets/PNG/environment/layers';
const GOTHIC = '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/layers';

export const MAPS: Record<string, MapTheme> = {
  // ---- Town: the PolyStyle village package ----
  town: {
    sky: '#7ec0e8',
    layers: [
      { src: `${POLY}/BackGround.png`, scroll: 0.05, anchor: 'fill' },
      // Clouds.png is a 3x2 sheet of 512px tiles; take one and drift it.
      { src: `${POLY}/Nature/Clouds.png`, scroll: 0.12, anchor: 'top', offsetY: 20,
        heightFrac: 0.34, alpha: 0.85, drift: 6,
        rect: { sx: 0, sy: 0, sw: 512, sh: 512 } },
      // Mountains.png is three 1024px panels side by side.
      { src: `${POLY}/Nature/Mountains.png`, scroll: 0.22, anchor: 'bottom',
        heightFrac: 0.55, rect: { sx: 0, sy: 0, sw: 1024, sh: 1024 } },
      { src: `${POLY}/Nature/Hill.png`, scroll: 0.42, anchor: 'bottom', heightFrac: 0.40 },
      { src: `${POLY}/Props and Houses/Houses.png`, scroll: 0.72, anchor: 'bottom',
        heightFrac: 0.42, rect: { sx: 0, sy: 0, sw: 1024, sh: 1024 } },
    ]
  },

  // ---- Goblin Catacombs: the forest approach ----
  catacombs: {
    sky: '#1b2733',
    layers: [
      { src: `${FOREST}/Background.png`, scroll: 0.04, anchor: 'fill' },
      { src: `${FOREST}/Clouds_Plan_1.png`, scroll: 0.10, anchor: 'top', alpha: 0.8, drift: 4 },
      { src: `${FOREST}/Mountains_Plan_1.png`, scroll: 0.18, anchor: 'bottom' },
      { src: `${FOREST}/Mountains_Plan_2.png`, scroll: 0.30, anchor: 'bottom' },
      { src: `${FOREST}/Trees_Plan_3.png`, scroll: 0.46, anchor: 'bottom' },
      { src: `${FOREST}/Trees_Plan_2.png`, scroll: 0.62, anchor: 'bottom',
        rect: { sx: 0, sy: 0, sw: 1800, sh: 240 } },
      { src: `${FOREST}/Fog.png`, scroll: 0.55, anchor: 'bottom', alpha: 0.45, drift: -8 },
    ]
  },

  // ---- Void Nexus: the futuristic city reads as an astral rift ----
  void: {
    sky: '#120a1e',
    layers: [
      { src: `${CITY}/background.png`, scroll: 0.03, anchor: 'fill' },
      { src: `${CITY}/city4plan.png`, scroll: 0.14, anchor: 'bottom' },
      { src: `${CITY}/city3plan.png`, scroll: 0.28, anchor: 'bottom' },
      { src: `${CITY}/city2plan.png`, scroll: 0.46, anchor: 'bottom' },
      { src: `${CITY}/city1plan.png`, scroll: 0.68, anchor: 'bottom' },
      { src: `${CITY}/smog2.png`, scroll: 0.36, anchor: 'bottom', alpha: 0.5, drift: -10 },
      { src: `${CITY}/light.png`, scroll: 0.20, anchor: 'top', alpha: 0.35,
        blend: 'lighter', rect: { sx: 0, sy: 0, sw: 630, sh: 60 } },
    ]
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
    ]
  },

  // ---- Sunken Abyss ----
  underwater: {
    sky: '#06283d',
    layers: [
      { src: `${SEA}/far.png`, scroll: 0.05, anchor: 'fill' },
      { src: `${SEA}/foreground-2.png`, scroll: 0.24, anchor: 'bottom' },
      { src: `${SEA}/foreground-1.png`, scroll: 0.48, anchor: 'bottom' },
      { src: `${SEA}/sand.png`, scroll: 0.75, anchor: 'bottom', heightFrac: 0.45 },
    ]
  },

  // ---- Venomous Swamp ----
  swamp: {
    sky: '#0f1a14',
    layers: [
      { src: `${BOG}/background.png`, scroll: 0.04, anchor: 'fill' },
      { src: `${BOG}/mid-layer-01.png`, scroll: 0.20, anchor: 'bottom' },
      { src: `${BOG}/mid-layer-02.png`, scroll: 0.38, anchor: 'bottom' },
      { src: `${BOG}/trees.png`, scroll: 0.62, anchor: 'bottom', heightFrac: 0.78 },
    ]
  },

  // ---- Gallet Depths: the Warped grotto set ----
  caves: {
    sky: '#120d16',
    layers: [
      { src: `${GROTTO}/background.png`, scroll: 0.06, anchor: 'fill' },
      { src: `${GROTTO}/middleground.png`, scroll: 0.26, anchor: 'bottom' },
      { src: `${GROTTO}/walls.png`, scroll: 0.45, anchor: 'bottom', heightFrac: 0.70 },
      { src: `${GROTTO}/props.png`, scroll: 0.66, anchor: 'bottom', heightFrac: 0.60 },
    ]
  },

  // ---- Crypt of the Damned: GothicVania ----
  crypt: {
    sky: '#0d0b14',
    layers: [
      { src: `${GOTHIC}/background.png`, scroll: 0.05, anchor: 'fill' },
      { src: `${GOTHIC}/middleground.png`, scroll: 0.30, anchor: 'bottom' },
    ]
  },
};

/** Themes still on the old hand-written renderer. */
export const THEMES_WITHOUT_ART = ['inferno'];

export function allMapImagePaths(): string[] {
  const out = new Set<string>();
  for (const t of Object.values(MAPS)) for (const l of t.layers) out.add(l.src);
  return [...out];
}
