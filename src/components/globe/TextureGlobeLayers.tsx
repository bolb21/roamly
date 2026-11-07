import {
  BlurMask,
  Circle,
  Group,
  Image,
  ImageShader,
  LinearGradient,
  Path,
  Points,
  Rect,
  Shader,
  Skia,
  type SkImage,
  type SkRuntimeEffect,
} from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import countryIds from '../../../assets/globe/country-ids.json';
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
  /** Each country's anchor as a unit vector (x,y,z flattened, by country index). */
  anchorPoints: number[];
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

const smallCountries = countryIds.countries.filter(
  (c) => c.pixels2048 < textureGlobeStyle.smallCountryDots.maxPixels,
);
/** App country indexes too small to see in the country texture (they get a dot when visited). */
export const SMALL_COUNTRIES = smallCountries.map((c) => c.textureId - 1);
/** Each small country's rough width in 2048-texture pixels, by country index. */
export const SMALL_COUNTRY_TEXELS: Record<number, number> = Object.fromEntries(
  smallCountries.map((c) => [c.textureId - 1, Math.sqrt(c.pixels2048)]),
);

const { fadeFrom: DOT_FADE_FROM, fadeTo: DOT_FADE_TO } = textureGlobeStyle.smallCountryDots;
/**
 * A small country's dot opacity when the country is `sizePx` across on screen: it
 * fades out once the country itself is big enough to see and tap.
 */
export function dotOpacityForSize(sizePx: number) {
  'worklet';
  return Math.min(1, Math.max(0, (DOT_FADE_TO - sizePx) / (DOT_FADE_TO - DOT_FADE_FROM)));
}

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
  anchorPoints,
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
  const { colors, colorValues, palette, isVisited } = useVisitedPalette(countries, visitedIds);
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
  const smallVisited = SMALL_COUNTRIES.filter((i) => isVisited[i]);
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
      {mode === 'earth' &&
        smallVisited.map((i) => (
          <SmallCountryDot
            key={i}
            texels={SMALL_COUNTRY_TEXELS[i] ?? 0}
            anchor={[anchorPoints[i * 3], anchorPoints[i * 3 + 1], anchorPoints[i * 3 + 2]]}
            color={colors[i]}
            matrix={matrix}
            radius={radius}
            cx={cx}
            cy={cy}
          />
        ))}
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

type DotProps = {
  /** The country's rough width in 2048-texture pixels. */
  texels: number;
  anchor: number[];
  color: string;
  matrix: SharedValue<number[]>;
  radius: SharedValue<number>;
  cx: number;
  cy: number;
};

/** A soft glowing dot on a visited country too small to see in the texture. */
function SmallCountryDot({ texels, anchor, color, matrix, radius, cx, cy }: DotProps) {
  const [X, Y, Z] = anchor;
  const centre = useDerivedValue(() => {
    const m = matrix.get();
    const r = radius.get();
    return {
      x: cx + r * (m[0] * X + m[1] * Y + m[2] * Z),
      y: cy - r * (m[3] * X + m[4] * Y + m[5] * Z),
    };
  });
  // Fades out as it turns towards the globe's edge, and is hidden round the back; and
  // once zoomed in far enough to see the country itself.
  const opacity = useDerivedValue(() => {
    const m = matrix.get();
    const facing = Math.min(1, Math.max(0, (m[6] * X + m[7] * Y + m[8] * Z) / 0.15));
    const sizePx = (texels * 2 * Math.PI * radius.get()) / 2048;
    return facing * dotOpacityForSize(sizePx);
  });
  return <GlowDot centre={centre} color={color} opacity={opacity} />;
}

/** The small-country dot itself: a soft glow, a solid centre and a light edge. */
export function GlowDot({
  centre,
  color,
  opacity,
}: {
  centre: SharedValue<{ x: number; y: number }>;
  color: string;
  opacity?: SharedValue<number>;
}) {
  const { radius: dotRadius, glowRadius } = textureGlobeStyle.smallCountryDots;
  return (
    <Group opacity={opacity}>
      <Circle c={centre} r={glowRadius} color={color} opacity={0.7}>
        <BlurMask blur={glowRadius * 0.6} style="normal" />
      </Circle>
      <Circle c={centre} r={dotRadius} color={color} />
      <Circle
        c={centre}
        r={dotRadius}
        color="rgba(255,255,255,0.6)"
        style="stroke"
        strokeWidth={0.8}
      />
    </Group>
  );
}

/** Repeatable pseudo-random number in [0, 1) for a given index. */
function random(i: number) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** A still starfield across the canvas (drawn behind the globe), fading out at the top and bottom edges. */
export function Starfield({ width, height }: { width: number; height: number }) {
  const fade = Math.min(0.45, textureGlobeStyle.starEdgeFade / height);
  const [layers] = useState(() =>
    textureGlobeStyle.stars.map((layer, l) => ({
      ...layer,
      points: Array.from({ length: layer.count }, (_, i) => ({
        x: random(l * 1000 + i * 2) * width,
        y: random(l * 1000 + i * 2 + 1) * height,
      })),
    })),
  );
  return (
    <Group layer>
      {layers.map((layer) => (
        <Points
          key={layer.size}
          points={layer.points}
          mode="points"
          color="white"
          opacity={layer.opacity}
          strokeWidth={layer.size}
          strokeCap="round"
        />
      ))}
      {/* Fades the stars out towards the edges, so UI over the canvas edge shows no line. */}
      <Rect x={0} y={0} width={width} height={height} blendMode="dstIn">
        <LinearGradient
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: height }}
          colors={['transparent', 'white', 'white', 'transparent']}
          positions={[0, fade, 1 - fade, 1]}
        />
      </Rect>
    </Group>
  );
}
