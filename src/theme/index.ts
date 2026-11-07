// Design tokens derived from docs/design/Roamly-dashboard-1.png.
// Change values here rather than hardcoding them in components.

export const colors = {
  // Backgrounds (top-to-bottom navy gradient)
  backgroundTop: '#04193A',
  background: '#021230',
  backgroundBottom: '#010A1E',

  // Panels and controls
  surface: 'rgba(8, 30, 70, 0.72)',
  surfaceStrong: '#0A2350',
  border: 'rgba(64, 140, 255, 0.45)',
  borderSubtle: 'rgba(64, 140, 255, 0.22)',

  // Accents
  primary: '#2F8CFF', // electric blue
  primaryDeep: '#0B4FC4',
  primaryGlow: 'rgba(47, 140, 255, 0.55)',
  teal: '#4FF2F5',

  // Text
  text: '#FFFFFF',
  textMuted: '#A9BEDD',
  textFaint: '#6F89B3',

  // Overlays
  scrim: 'rgba(1, 6, 18, 0.7)',
} as const;

/**
 * Which globe to draw. 'texture' = the textured planet (a Skia shader); 'vector' =
 * the raised-country vector globe. 'texture' falls back to 'vector' automatically if
 * its shader won't compile.
 */
export const GLOBE_RENDERER: 'texture' | 'vector' = 'texture';

/**
 * Stage 2 test for the textured globe: draws a latitude/longitude checkerboard with
 * markers at London and Sydney instead of the real textures.
 */
export const GLOBE_MAPPING_TEST = false;

/**
 * Preview: draws every country as visited (without touching the saved visited list),
 * to judge the whole visited palette at a glance.
 */
export const DEBUG_ALL_VISITED = false;

/** Textured globe look. Strengths are 0–1 unless noted. */
export const textureGlobeStyle = {
  /** Sea colour by depth: shallow over the shelves → mid at `midDepth` → deep (0 = shore, 1 = 7 km). */
  ocean: { shallow: '#2E86C8', mid: '#15519E', deep: '#0A2560', midDepth: 0.35 },
  /**
   * Land: `color` × (reliefMin + reliefRange × relief), where relief is 0–1 and 0.5 is
   * flat ground. A bigger range makes mountains stand out more.
   */
  land: { color: '#9EA6B4', reliefMin: 0.32, reliefRange: 1.42 },
  /**
   * Light from the top-left of the screen: `direction` is (right, up, towards you).
   * `ambient` keeps the shadow side readable (0 = black, 1 = no shading).
   */
  light: { direction: [-0.5, 0.55, 0.67], ambient: 0.42 },
  /** Broad sun highlight on the sea. Higher `sharpness` = smaller spot. */
  sun: { color: '#CFE8FF', strength: 0.28, sharpness: 14 },
  /** Blue glow towards the globe's edge. Higher `power` = thinner glow. */
  rim: { color: '#5FB8FF', strength: 0.55, power: 3 },
  /** Starfield behind the globe: count, dot size (px) and opacity per layer. */
  stars: [
    { count: 140, size: 1, opacity: 0.45 },
    { count: 45, size: 1.6, opacity: 0.7 },
    { count: 12, size: 2.4, opacity: 0.9 },
  ],
  /** Stars fade out over this many px at the top and bottom of the globe area. */
  starEdgeFade: 60,
  /**
   * Zooms at which the sharper 4096 textures are used (the 2048 ones below). The map's
   * zoom 1 shows the whole map, so its threshold is higher.
   */
  hiResZoom: 1.9,
  mapHiResZoom: 3.2,
  /**
   * Close up, land is drawn as sharp vector shapes instead of from the textures (which
   * would turn blocky): from `globeZoom` on the globe and `mapZoom` on the map,
   * switching back `hysteresis` below (so it doesn't flicker at the threshold).
   */
  closeUp: { globeZoom: 5.5, mapZoom: 6, hysteresis: 0.4 },
  /**
   * Clouds on the globe (still): opacity and colour. They fade out between zoom
   * `fadeFrom` and `fadeTo`, as they'd look blurry close up.
   */
  clouds: { opacity: 0.38, color: '#F4F8FF', fadeFrom: 1.6, fadeTo: 3 },
  /** Flat map land brightness (it has no sphere lighting; 1 = as the texture). */
  mapBrightness: 0.86,
  /** Space (px) between the zoomed-out flat map and the screen's edges. */
  mapMargin: 14,
  /**
   * Visited countries: their colour × (tintBase + tintRelief × relief), so mountains
   * still show through the colour. Colours come from visitedColorFor() below.
   */
  visited: { tintBase: 0.42, tintRelief: 1.16 },
  /**
   * Country borders. Zoomed out they come from the edges in the country texture
   * (`color`, whose alpha sets the strength; `softness` ≈ width in px). Zoomed in they
   * are drawn as smooth vector lines (`lines`, width in px) instead: the globe fades
   * from one to the other between `linesFrom` and `linesFull`; the map always uses lines.
   */
  borders: {
    color: 'rgba(255, 255, 255, 0.45)',
    softness: 0.5,
    lines: { color: 'rgba(255, 255, 255, 0.85)', width: 1.4 },
    linesFrom: 1.6,
    linesFull: 2.3,
  },
  /**
   * Selected country: brightened, with a soft glowing outline `glowWidth` px wide.
   * `glowStrength` 0–1.
   */
  selection: { brighten: 0.2, glowColor: '#62F2F4', glowWidth: 3.5, glowStrength: 0.9 },
  /**
   * Close up (see closeUp) the selection is drawn as vector lines: a soft glow
   * `glowWidth` px wide on each side of the outline, with a crisp `lineWidth` px line.
   */
  selectionLines: { lineWidth: 1.3, lineOpacity: 0.8, glowBlur: 2.5, glowOpacity: 0.6 },
  /**
   * Countries smaller than `maxPixels` in the 2048 country texture get a glowing dot at
   * their centre when visited, so they're never invisible. Sizes in px. Zoomed in far
   * enough to see the country itself (about `fadeFrom`–`fadeTo` px across), the dot fades out.
   */
  smallCountryDots: { maxPixels: 30, radius: 2.2, glowRadius: 5, fadeFrom: 14, fadeTo: 24 },
  /** Mapping test colours: 15° squares, equator/prime meridian, and the two markers. */
  test: {
    light: '#DCE6F2',
    dark: '#3A5F96',
    lines: '#FF4D4D',
    london: '#FFD400',
    sydney: '#00E5A0',
    outline: 'rgba(10, 20, 40, 0.85)',
  },
} as const;

/**
 * Visited colours: a narrow family of forest greens (each country gets one, so
 * neighbours differ a little), plus ice for the polar ice sheets. Tune freely.
 */
export const visitedPalette = {
  forest: ['#2F7448', '#357C4C', '#2C6C4C', '#3A8150', '#317046'],
  ice: '#F4F8FB',
  paleIce: '#DCEAF2',
} as const;

/** Countries drawn as ice rather than forest when visited. */
const ICE_COUNTRIES: Record<string, 'ice' | 'paleIce'> = {
  Antarctica: 'ice',
  Greenland: 'paleIce',
  'Fr. S. Antarctic Lands': 'paleIce',
};

/** Repeatable number in [0, 1) from a string. */
function hashUnit(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** Lightens (amount > 0) or darkens (amount < 0) a #RRGGBB colour. */
function shade(hex: string, amount: number) {
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  const channel = (i: number) =>
    Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - t) + target * t)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/** How much each country's colour may be lightened or darkened, so neighbours differ. */
const LIGHTNESS_VARIATION = 0.04;

/** A visited country's colour: one of the forest greens (or ice), picked from its name. */
export function visitedColorFor(name: string): string {
  const variation = (hashUnit(name) * 2 - 1) * LIGHTNESS_VARIATION;
  const ice = ICE_COUNTRIES[name];
  if (ice) return shade(visitedPalette[ice], variation * 0.3);
  const forest = visitedPalette.forest;
  return shade(forest[Math.floor(hashUnit(name + 'g') * forest.length)], variation);
}

/**
 * Test switch: draws the countries' raised "slab" sides in bright magenta with a
 * big offset, to prove the layer is visible on the phone. Set to false for the real look.
 */
export const DEBUG_EXAGGERATE = false;

/**
 * Globe and map look: colours, sizes and effect strengths, in one place so the
 * style can be tweaked without touching drawing code. Sizes are fractions of the
 * globe's radius unless noted. Strengths are 0–1.
 */
export const globeStyle = {
  /** Soft blue spotlight behind the globe. `radius` is a share of the canvas's longer side. */
  backdrop: { inner: 'rgba(48, 120, 235, 0.30)', mid: 'rgba(24, 70, 170, 0.12)', radius: 0.62 },
  /** Atmosphere ring just outside the sphere. */
  halo: { color: 'rgba(120, 195, 255, 0.55)', faint: 'rgba(120, 195, 255, 0.16)', width: 0.12 },
  /** Ocean gradient: light near the top-left, deep at the edge. */
  ocean: { light: '#55B4FF', mid: '#1E6FE0', deep: '#0A2A74' },
  /**
   * Soft glow of shallow water around every coast: a wide faint one and a tight
   * brighter one. `blur` is the glow's softness in screen px at zoom 1.
   */
  shallows: {
    wide: { color: 'rgba(120, 230, 255, 0.45)', blur: 7 },
    narrow: { color: 'rgba(150, 240, 255, 0.5)', blur: 2.2 },
  },
  /** Land tops: slightly lighter towards the top of the globe. */
  land: { top: '#A2ABBC', bottom: '#7D879B' },
  /**
   * Lighting from the top-left of the screen, drawn over land and sea:
   * `lit` → `shade` across the sphere, a dark crescent along the bottom-right edge
   * and a bright one along the top-left edge. Widths are shares of the radius.
   */
  lighting: {
    lit: 'rgba(255, 255, 255, 0.08)',
    shade: 'rgba(2, 10, 40, 0.38)',
    rimShadow: 'rgba(2, 8, 34, 0.6)',
    rimShadowWidth: 0.45,
    rimLight: 'rgba(170, 228, 255, 0.6)',
    rimLightWidth: 0.2,
  },
  /** Thin line around the sphere. */
  rim: 'rgba(175, 222, 255, 0.45)',
  /**
   * Raised countries: darkened copies of the land, shifted down-right (light comes
   * from the top-left of the screen), form each country's side, so grey land gets a
   * dark grey side and green land a dark green one. `shade` is the side's brightness
   * compared with the top (0 = black, 1 = same). `offset` is screen px at zoom 1 and
   * grows with zoom^zoomGrowth (0 = never grow, 1 = grow as fast as the globe).
   * At least `steps` copies make the side solid (more when it's deep).
   */
  slab: {
    shade: 0.5,
    offset: DEBUG_EXAGGERATE ? 14 : 4,
    steps: 4,
    zoomGrowth: 0.5,
  },

  /** Flat map only: ocean (top → bottom), latitude/longitude lines, and the world's edge. */
  map: {
    ocean: { top: '#3A8CF0', bottom: '#0E3A92' },
    graticule: 'rgba(180, 225, 255, 0.14)',
    edge: 'rgba(175, 222, 255, 0.5)',
  },
  /** Thin light line along each country's outline, shifted up-left (px), like a lit top edge. */
  outlineHighlight: { color: 'rgba(255, 255, 255, 0.35)', width: 0.8, offset: 1 },
} as const;

/** Globe palette: grey land, green visited (matches the reference image). */
export const globeColors = {
  land: '#8C96A8',
  landBorder: '#4B5671',
  visited: '#58CC02',
  visitedBorder: '#3F8F06',
  // Selected country: lightened fill with a glowing teal outline.
  selectedTint: 'rgba(255, 255, 255, 0.25)',
  selectedOutline: '#4FF2F5',
  selectedGlow: 'rgba(79, 242, 245, 0.85)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const typography = {
  wordmark: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  tagline: { fontSize: 9, fontWeight: '600', letterSpacing: 2.4 },
  title: { fontSize: 22, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 21 },
  label: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 12, fontWeight: '400', lineHeight: 16 },
  caption: { fontSize: 11, fontWeight: '500', letterSpacing: 0.4 },
} as const;

export const sizes = {
  mapControl: 48,
  tabHeight: 48,
} as const;
