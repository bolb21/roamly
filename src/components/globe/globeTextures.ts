// Textures shared by the textured globe and the flat map (see globeShader.ts).
// Loaded once by the Visited screen and handed to both views, so memory isn't doubled.

import {
  AlphaType,
  ColorType,
  FilterMode,
  MipmapMode,
  Skia,
  useImage,
  type SkImage,
} from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { useAnimatedReaction, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { CountryShape } from '@/globe/geometry';
import { DEBUG_ALL_VISITED, textureGlobeStyle, visitedColorFor } from '@/theme';

const EARTH_2048 = require('../../../assets/globe/earth-2048.jpg');
const EARTH_4096 = require('../../../assets/globe/earth-4096.jpg');
const IDS_2048 = require('../../../assets/globe/countries-2048.png');
const IDS_4096 = require('../../../assets/globe/countries-4096.png');
const CLOUDS_2048 = require('../../../assets/globe/clouds-2048.jpg');

/** Linear filtering with mipmaps, so the textures stay smooth when small. */
export const SMOOTH = { filter: FilterMode.Linear, mipmap: MipmapMode.Linear };
/** Country ids must never blend, so they're sampled without smoothing. */
export const EXACT = { filter: FilterMode.Nearest, mipmap: MipmapMode.None };
/**
 * Every texture size is drawn into the same coordinate space, so swapping one for
 * another can never leave a shader using the wrong size for a frame.
 */
export const TEXTURE_SPACE = { x: 0, y: 0, width: 2048, height: 1024 };
/** Sharper textures are swapped back out this far below their zoom (so it doesn't flicker). */
const SWAP_HYSTERESIS = 0.2;
/** The 4096 textures start loading this long after the screen appears. */
const HI_RES_DELAY_MS = 1000;
/** One pixel per country id (ids go up to 255). */
const PALETTE_SIZE = 256;

export type TextureSet = { earth: SkImage; ids: SkImage };

/** Country texture id (0 = sea, app country index + 1, 255 = not in the list) at a place. */
export type CountryLookup = (lon: number, lat: number) => number;

export type GlobeTextures = {
  /** The 2048 textures, or null while loading. */
  low: TextureSet | null;
  /** The sharper 4096 textures, or null until loaded. */
  high: TextureSet | null;
  /** Cloud cover (globe only), or null while loading. */
  clouds: SkImage | null;
  /** Reads the detailed country texture for taps, or null while loading. */
  countryLookup: CountryLookup | null;
  /** True if a texture failed to load (the views then draw with vectors). */
  failed: boolean;
};

const pair = (earth: SkImage | null, ids: SkImage | null) => (earth && ids ? { earth, ids } : null);

/** Reads a country id texture's pixels once, for looking up taps on the JS thread. */
function makeCountryLookup(ids: SkImage): CountryLookup | null {
  const width = ids.width();
  const height = ids.height();
  const info = (colorType: ColorType) => ({
    width,
    height,
    colorType,
    alphaType: colorType === ColorType.Gray_8 ? AlphaType.Opaque : AlphaType.Unpremul,
  });
  // One byte per pixel if the platform can; otherwise read colour and keep red.
  let pixels = ids.readPixels(0, 0, info(ColorType.Gray_8));
  if (!pixels) {
    const rgba = ids.readPixels(0, 0, info(ColorType.RGBA_8888));
    if (!rgba) return null;
    const red = new Uint8Array(width * height);
    for (let i = 0; i < red.length; i++) red[i] = rgba[i * 4];
    pixels = red;
  }
  const data = pixels;
  return (lon, lat) => {
    const x = Math.min(width - 1, Math.max(0, Math.floor(((lon + 180) / 360) * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor(((90 - lat) / 180) * height)));
    return data[y * width + x];
  };
}

/**
 * Loads the textures: the 2048 versions and clouds straight away, the 4096 ones a
 * second later in the background.
 */
export function useGlobeTextures(enabled: boolean): GlobeTextures {
  const [failed, setFailed] = useState(false);
  const [hiResWanted, setHiResWanted] = useState(false);
  const onError = (error: Error) => {
    console.warn('Globe: texture failed to load; using vector drawing.', error);
    setFailed(true);
  };

  useEffect(() => {
    if (!enabled) return;
    const id = setTimeout(() => setHiResWanted(true), HI_RES_DELAY_MS);
    return () => clearTimeout(id);
  }, [enabled]);

  const earthLow = useImage(enabled ? EARTH_2048 : null, onError);
  const idsLow = useImage(enabled ? IDS_2048 : null, onError);
  const clouds = useImage(enabled ? CLOUDS_2048 : null, onError);
  const earthHigh = useImage(enabled && hiResWanted ? EARTH_4096 : null, onError);
  const idsHigh = useImage(enabled && hiResWanted ? IDS_4096 : null, onError);
  const low = useMemo(() => pair(earthLow, idsLow), [earthLow, idsLow]);
  const high = useMemo(() => pair(earthHigh, idsHigh), [earthHigh, idsHigh]);
  // Taps use the 4096 ids once loaded (the 2048 ones until then).
  const countryLookup = useMemo(() => {
    const ids = idsHigh ?? idsLow;
    return ids ? makeCountryLookup(ids) : null;
  }, [idsHigh, idsLow]);
  return { low, high, clouds, countryLookup, failed };
}

/**
 * The textures a view should draw with: the 4096 ones once `zoom` passes `hiResZoom`
 * (if loaded), the 2048 ones below it.
 */
export function useTextureSet(
  textures: GlobeTextures,
  zoom: SharedValue<number>,
  hiResZoom: number,
): TextureSet | null {
  const [hiResShown, setHiResShown] = useState(false);
  useAnimatedReaction(
    () => {
      const z = zoom.get();
      if (z >= hiResZoom) return true;
      if (z < hiResZoom - SWAP_HYSTERESIS) return false;
      return null; // in the gap: keep whichever is showing
    },
    (hiRes, previous) => {
      if (hiRes === null || hiRes === previous) return;
      scheduleOnRN(setHiResShown, hiRes);
    },
  );
  return hiResShown && textures.high ? textures.high : textures.low;
}

/**
 * Each country's visited colour, and the 256 × 1 colour table the shaders read: pixel
 * `id` = that country's colour, opaque if visited and transparent if not. The table is
 * only rebuilt when the visited countries change.
 */
export function useVisitedPalette(countries: CountryShape[], visitedIds: ReadonlySet<string>) {
  const colors = useMemo(() => countries.map((c) => visitedColorFor(c.name)), [countries]);
  const colorValues = useMemo(() => colors.map((c) => Array.from(Skia.Color(c))), [colors]);
  const visitedKey = countries
    .map((c) => (DEBUG_ALL_VISITED || visitedIds.has(c.id) ? '1' : '0'))
    .join('');
  const palette = useMemo(() => {
    const bytes = new Uint8Array(PALETTE_SIZE * 4);
    colorValues.forEach(([r, g, b], i) => {
      const o = (i + 1) * 4;
      bytes[o] = Math.round(r * 255);
      bytes[o + 1] = Math.round(g * 255);
      bytes[o + 2] = Math.round(b * 255);
      bytes[o + 3] = visitedKey[i] === '1' ? 255 : 0;
    });
    return Skia.Image.MakeImage(
      {
        width: PALETTE_SIZE,
        height: 1,
        colorType: ColorType.RGBA_8888,
        alphaType: AlphaType.Unpremul,
      },
      Skia.Data.fromBytes(bytes),
      PALETTE_SIZE * 4,
    );
  }, [colorValues, visitedKey]);
  const isVisited = useMemo(() => [...visitedKey].map((v) => v === '1'), [visitedKey]);
  return { colors, colorValues, palette, isVisited };
}

const rgba = (color: string) => Array.from(Skia.Color(color));
const { land, visited, borders, selection } = textureGlobeStyle;

/** Land uniforms shared by the globe and map shaders (see LAND in globeShader.ts). */
export const LAND_UNIFORMS = {
  earthSize: [TEXTURE_SPACE.width, TEXTURE_SPACE.height],
  landColor: rgba(land.color),
  reliefMin: land.reliefMin,
  reliefRange: land.reliefRange,
  tintBase: visited.tintBase,
  tintRelief: visited.tintRelief,
  borderColor: rgba(borders.color),
  borderStrength: 1,
  selectedBrighten: selection.brighten,
  glowColor: rgba(selection.glowColor),
  glowWidth: selection.glowWidth,
  glowStrength: selection.glowStrength,
  edgeSoftness: borders.softness,
};
