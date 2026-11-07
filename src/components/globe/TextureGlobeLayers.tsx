import {
  Circle,
  Image,
  ImageShader,
  Path,
  Shader,
  Skia,
  type SkImage,
  type SkRuntimeEffect,
} from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import type { CountryShape } from '@/globe/geometry';
import { getBorderLines } from '@/globe/globeData';
import { buildGlobeLines, PATH_SCALE, type GlobeGeometry } from '@/globe/projection';
import { DEBUG_ALL_VISITED, textureGlobeStyle } from '@/theme';

import { CloseUpLand, useCloseUp, useLandCells } from './CloseUpLand';
import {
  EXACT,
  LAND_UNIFORMS,
  LINEAR,
  SMOOTH,
  TEXTURE_SPACE,
  texelsOf,
  useVisitedPalette,
  type TextureSet,
} from './globeTextures';

type Props = {
  /** Compiled globe shader (see globeShader.ts). */
  effect: SkRuntimeEffect;
  /** 'test' = the lat/lon checkerboard (stage 2); 'earth' = the planet. */
  mode: 'test' | 'earth';
  /** Textures to draw with (needed in 'earth' mode). */
  textures: TextureSet | null;
  /** Sharper textures to upload to the graphics card before they're needed. */
  warmUp: TextureSet | null;
  /** Cloud cover texture (needed in 'earth' mode). */
  clouds: SkImage | null;
  /** The globe's zoom (the clouds fade out as it zooms in). */
  zoom: SharedValue<number>;
  countries: CountryShape[];
  visitedIds: ReadonlySet<string>;
  /** Selected country index, or -1. */
  selectedIndex: SharedValue<number>;
  /** The country fading between unvisited (0) and visited (1), or -1, and its progress. */
  fadeIndex: SharedValue<number>;
  fadeProgress: SharedValue<number>;
  /** World → view rotation matrix, row-major (src/globe/rotation.ts). */
  matrix: SharedValue<number[]>;
  /** Globe radius on screen, in px. */
  radius: SharedValue<number>;
  cx: number;
  cy: number;
  /** Canvas size, in px (for culling the border lines). */
  width: number;
  height: number;
};

const DEG = Math.PI / 180;
/** Unit vector for a longitude/latitude, as in src/globe/geometry.ts. */
const toVector = (lon: number, lat: number) => [
  Math.cos(lat * DEG) * Math.cos(lon * DEG),
  Math.cos(lat * DEG) * Math.sin(lon * DEG),
  Math.sin(lat * DEG),
];
const rgba = (color: string) => Array.from(Skia.Color(color));
const normalized = (v: readonly number[]) => {
  const length = Math.hypot(v[0], v[1], v[2]);
  return v.map((c) => c / length);
};

const { test, ocean, light, sun, rim, clouds: cloudStyle } = textureGlobeStyle;
const TEST_UNIFORMS = {
  markerA: toVector(-0.13, 51.51), // London
  markerB: toVector(151.21, -33.87), // Sydney
  lightColor: rgba(test.light),
  darkColor: rgba(test.dark),
  lineColor: rgba(test.lines),
  markerAColor: rgba(test.london),
  markerBColor: rgba(test.sydney),
};
const EARTH_UNIFORMS = {
  ...LAND_UNIFORMS,
  oceanShallow: rgba(ocean.shallow),
  oceanMid: rgba(ocean.mid),
  oceanDeep: rgba(ocean.deep),
  oceanMidDepth: ocean.midDepth,
  light: normalized(light.direction),
  ambient: light.ambient,
  sunColor: rgba(sun.color),
  sunStrength: sun.strength,
  sunSharpness: sun.sharpness,
  rimColor: rgba(rim.color),
  rimStrength: rim.strength,
  rimPower: rim.power,
  cloudColor: rgba(cloudStyle.color),
};

/**
 * The land shaders' three textures, in the order globeShader.ts declares them. The
 * globe samples without mipmaps (see LINEAR); the flat map with.
 */
export function LandTextures({
  textures,
  palette,
  mipmaps,
}: {
  textures: TextureSet;
  palette: SkImage;
  mipmaps: boolean;
}) {
  return (
    <>
      {/* Repeats across ±180° so the seam blends; clamped at the poles. */}
      <ImageShader
        image={textures.earth}
        rect={TEXTURE_SPACE}
        fit="fill"
        tx="repeat"
        ty="clamp"
        sampling={mipmaps ? SMOOTH : LINEAR}
      />
      <ImageShader
        image={textures.ids}
        rect={TEXTURE_SPACE}
        fit="fill"
        tx="repeat"
        ty="clamp"
        sampling={EXACT}
      />
      <ImageShader image={palette} tx="clamp" ty="clamp" sampling={EXACT} />
    </>
  );
}

/**
 * Draws textures once, tiny and almost invisible, so they (and their mipmaps) are
 * uploaded to the graphics card now rather than mid-zoom, which would stall a frame.
 */
export function TextureWarmUp({ textures }: { textures: TextureSet }) {
  return (
    <>
      <Image
        image={textures.earth}
        x={0}
        y={0}
        width={2}
        height={2}
        opacity={0.01}
        sampling={SMOOTH}
      />
      <Image
        image={textures.ids}
        x={0}
        y={0}
        width={2}
        height={2}
        opacity={0.01}
        sampling={EXACT}
      />
    </>
  );
}

/**
 * The textured globe's sphere, drawn per pixel by a Skia shader: the planet with
 * country borders, visited colours and the selection glow, or the stage 2 lat/lon
 * checkerboard with markers at London (yellow) and Sydney (green).
 */
export function TextureGlobeLayers({
  effect,
  mode,
  textures,
  warmUp,
  clouds,
  zoom,
  countries,
  visitedIds,
  selectedIndex,
  fadeIndex,
  fadeProgress,
  matrix,
  radius,
  cx,
  cy,
  width,
  height,
}: Props) {
  const { colorValues, palette, isVisited } = useVisitedPalette(countries, visitedIds);
  // Zoomed in, smooth vector border lines take over from the texture's borders.
  const linesOpacity = useDerivedValue(() => linesOpacityAt(zoom.get()));
  // Closer still, the land is drawn as sharp vector shapes (see CloseUpLand.tsx).
  const cells = useLandCells(mode === 'earth');
  const closeUp = useCloseUp(zoom, textureGlobeStyle.closeUp.globeZoom, cells !== null);
  const earthTexels = textures ? texelsOf(textures) : 1;

  const uniforms = useDerivedValue(() => {
    const m = matrix.get();
    const view = {
      center: [cx, cy],
      radius: radius.get(),
      row0: [m[0], m[1], m[2]],
      row1: [m[3], m[4], m[5]],
      row2: [m[6], m[7], m[8]],
    };
    if (mode === 'test') return { ...view, ...TEST_UNIFORMS };
    const fading = fadeIndex.get();
    const vectorLand = closeUp.get();
    return {
      ...view,
      ...EARTH_UNIFORMS,
      earthTexels,
      // Close up the sphere draws only the sea; the land and selection are vector shapes.
      oceanOnly: vectorLand ? 1 : 0,
      fadeId: fading + 1,
      fadeAmount: DEBUG_ALL_VISITED ? 1 : fadeProgress.get(),
      fadeColor: fading >= 0 ? colorValues[fading] : [0, 0, 0, 0],
      selectedId: vectorLand ? 0 : selectedIndex.get() + 1,
      borderStrength: 1 - linesOpacity.get(),
      // Clouds are still, and fade out between fadeFrom and fadeTo (blurry close up).
      cloudOpacity:
        cloudStyle.opacity *
        Math.min(
          1,
          Math.max(0, (cloudStyle.fadeTo - zoom.get()) / (cloudStyle.fadeTo - cloudStyle.fadeFrom)),
        ),
    };
  });
  // A pixel bigger than the sphere, so the shader's soft edge isn't cut off.
  const drawRadius = useDerivedValue(() => radius.get() + 1);

  const ready = mode === 'test' || (textures !== null && palette !== null && clouds !== null);
  const earthChildren =
    mode === 'earth' && textures && palette && clouds ? (
      <>
        <LandTextures textures={textures} palette={palette} mipmaps={false} />
        <ImageShader
          image={clouds}
          rect={TEXTURE_SPACE}
          fit="fill"
          tx="repeat"
          ty="clamp"
          sampling={LINEAR}
        />
      </>
    ) : null;

  return (
    <>
      {warmUp && warmUp !== textures && <TextureWarmUp textures={warmUp} />}
      {ready && (
        <Circle cx={cx} cy={cy} r={drawRadius}>
          <Shader source={effect} uniforms={uniforms}>
            {earthChildren}
          </Shader>
        </Circle>
      )}
      {ready && earthChildren && cells && (
        <CloseUpLand
          effect={effect}
          shaderChildren={earthChildren}
          uniforms={uniforms}
          cells={cells}
          shown={closeUp}
          countries={countries}
          isVisited={isVisited}
          selectedIndex={selectedIndex}
          fadeIndex={fadeIndex}
          fadeProgress={fadeProgress}
          matrix={matrix}
          radius={radius}
          cx={cx}
          cy={cy}
          width={width}
          height={height}
        />
      )}
      {mode === 'earth' && (
        <BorderLines
          matrix={matrix}
          radius={radius}
          cx={cx}
          cy={cy}
          width={width}
          height={height}
          opacity={linesOpacity}
        />
      )}
    </>
  );
}

const { borders } = textureGlobeStyle;
/** The border lines' share (0–1) at a zoom: none below linesFrom, all from linesFull. */
function linesOpacityAt(zoom: number) {
  'worklet';
  return Math.min(
    1,
    Math.max(0, (zoom - borders.linesFrom) / (borders.linesFull - borders.linesFrom)),
  );
}
const EMPTY_LINES = 'M0 0';
/** The border lines' data is built this long after the globe appears (it takes ~40 ms). */
const BORDER_LINES_DELAY_MS = 1500;

type BorderLinesProps = {
  matrix: SharedValue<number[]>;
  radius: SharedValue<number>;
  cx: number;
  cy: number;
  width: number;
  height: number;
  opacity: SharedValue<number>;
};

/**
 * Thin white country borders drawn as vector lines from the detailed 1:50m outlines,
 * for when the globe is zoomed in too far for the texture's borders to stay smooth.
 * Only built while they show, and only the line pieces near the screen are projected.
 */
function BorderLines({ matrix, radius, cx, cy, width, height, opacity }: BorderLinesProps) {
  const [lines, setLines] = useState<GlobeGeometry | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setLines(getBorderLines()), BORDER_LINES_DELAY_MS);
    return () => clearTimeout(id);
  }, []);
  const path = useDerivedValue(() => {
    const svg =
      lines && opacity.get() > 0
        ? buildGlobeLines(lines, matrix.get(), cx, cy, radius.get(), width, height)
        : EMPTY_LINES;
    // On the phone Skia throws on path text it can't read; draw nothing rather than crash.
    try {
      return Skia.Path.MakeFromSVGString(svg) ?? Skia.Path.Make();
    } catch {
      return Skia.Path.Make();
    }
  });
  return (
    <Path
      path={path}
      color={borders.lines.color}
      opacity={opacity}
      style="stroke"
      strokeWidth={borders.lines.width * PATH_SCALE}
      strokeJoin="round"
      strokeCap="round"
      transform={LINES_TRANSFORM}
    />
  );
}
const LINES_TRANSFORM = [{ scale: 1 / PATH_SCALE }];
