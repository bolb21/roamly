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

/** Globe palette: blue ocean, grey land, green visited (matches the reference image). */
export const globeColors = {
  oceanLight: '#3A86F0',
  ocean: '#1B57C6',
  oceanDeep: '#0A2A74',
  land: '#8C96A8',
  landBorder: '#4B5671',
  visited: '#5CC46A',
  // Selected country: lightened fill with a glowing teal outline.
  selectedTint: 'rgba(255, 255, 255, 0.25)',
  selectedOutline: '#4FF2F5',
  selectedGlow: 'rgba(79, 242, 245, 0.85)',
  rim: 'rgba(130, 195, 255, 0.9)',
  glow: 'rgba(47, 140, 255, 0.85)',
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
