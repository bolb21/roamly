// The raised-land look shared by the globe and the flat map.
//
// Land tops are drawn into one Skia layer, and this layer's image filter adds,
// beneath them: a shallow-water glow (blurred, tinted copies of the land), then
// the sides (darkened copies, each shifted a little further down-right). The land
// itself is only drawn once, which keeps it fast.

import { Skia, type SkImageFilter } from '@shopify/react-native-skia';

import { DEBUG_EXAGGERATE, globeStyle } from '@/theme';

/** Darkens land colours for the sides (or turns them magenta for the layering test). */
const SIDE_COLOR_MATRIX = DEBUG_EXAGGERATE
  ? [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0]
  : [
      globeStyle.slab.shade, 0, 0, 0, 0,
      0, globeStyle.slab.shade, 0, 0, 0,
      0, 0, globeStyle.slab.shade, 0, 0,
      0, 0, 0, 1, 0,
    ];

/** Largest gap (screen px) between side copies before the side looks stepped. */
const MAX_STEP_PX = 1.25;

/**
 * Layer paint for the land tops. `depth` is the side depth in screen px; `grow`
 * scales the shallow-water glow's softness (1 = as set in the theme).
 */
export function makeLandLayerPaint(depth: number, grow: number) {
  'worklet';
  const filters = Skia.ImageFilter;
  const { wide, narrow } = globeStyle.shallows;
  const darkened = filters.MakeColorFilter(Skia.ColorFilter.MakeMatrix(SIDE_COLOR_MATRIX), null);
  const layers: (SkImageFilter | null)[] = [
    filters.MakeDropShadowOnly(
      0,
      0,
      wide.blur * grow,
      wide.blur * grow,
      Skia.Color(wide.color),
      null,
    ),
    filters.MakeDropShadowOnly(
      0,
      0,
      narrow.blur * grow,
      narrow.blur * grow,
      Skia.Color(narrow.color),
      null,
    ),
  ];
  // Enough copies that neighbouring ones are at most MAX_STEP_PX apart (no visible steps).
  const steps = Math.max(globeStyle.slab.steps, Math.ceil(depth / MAX_STEP_PX));
  for (let k = steps; k >= 1; k--) {
    const d = (depth * k) / steps;
    layers.push(filters.MakeOffset(d, d, darkened));
  }
  layers.push(null); // the tops themselves
  const paint = Skia.Paint();
  paint.setImageFilter(filters.MakeMerge(layers, null));
  return paint;
}
