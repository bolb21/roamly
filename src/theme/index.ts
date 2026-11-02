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
