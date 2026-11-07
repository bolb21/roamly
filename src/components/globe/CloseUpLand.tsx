// Close-up land on the textured globe: past textureGlobeStyle.closeUp.globeZoom the
// land, visited colours and selection are drawn as sharp vector shapes (from the
// pre-cut pieces in src/globe/landCells.ts) filled with the globe's own shader, so the
// relief and colours match the textured globe, but coasts, colours and the selection
// never turn blocky. The textured globe then draws only the sea underneath.

import {
  BlurMask,
  Group,
  Path,
  Shader,
  Skia,
  type SkPath,
  type SkRuntimeEffect,
} from '@shopify/react-native-skia';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { countryOutlineLines, type CountryShape } from '@/globe/geometry';
import { getLandCellGeometry } from '@/globe/globeData';
import {
  buildGlobeLand,
  buildGlobeLines,
  PATH_SCALE,
  type GlobeGeometry,
} from '@/globe/projection';
import { textureGlobeStyle } from '@/theme';

/** The land pieces are built this long after the globe appears (~0.1 s of work). */
const CELLS_DELAY_MS = 2000;
const EMPTY = 'M0 0';
/** Paths are built in path units (see PATH_SCALE); this draws them at screen size. */
const PATH_TRANSFORM = [{ scale: 1 / PATH_SCALE }];
/** …and this keeps the shaders filling them working in screen px. */
const SHADER_TRANSFORM = [{ scale: PATH_SCALE }];

/** A Skia path from SVG path text; empty (rather than a crash) if Skia can't read it. */
function toPath(svg: string): SkPath {
  'worklet';
  try {
    return Skia.Path.MakeFromSVGString(svg) ?? Skia.Path.Make();
  } catch {
    return Skia.Path.Make();
  }
}

/**
 * Whether the close-up vector land is showing: from `on` zoom up, until `on - hysteresis`
 * on the way back out. Only once the pieces are ready (`ready`).
 */
export function useCloseUp(zoom: SharedValue<number>, on: number, ready: boolean) {
  const shown = useSharedValue(false);
  const off = on - textureGlobeStyle.closeUp.hysteresis;
  useAnimatedReaction(
    () => {
      const z = zoom.get();
      if (!ready) return false;
      if (z >= on) return true;
      if (z < off) return false;
      return shown.get(); // in the gap: keep whichever is showing
    },
    (value) => shown.set(value),
  );
  return shown;
}

/** The pre-cut land pieces as globe geometry, built shortly after first use (or null). */
export function useLandCells(enabled: boolean) {
  const [cells, setCells] = useState<GlobeGeometry | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const id = setTimeout(() => setCells(getLandCellGeometry()), CELLS_DELAY_MS);
    return () => clearTimeout(id);
  }, [enabled]);
  return cells;
}

/** The selected country index as React state (it's a shared value elsewhere). */
export function useSelectedState(selectedIndex: SharedValue<number>) {
  const [selected, setSelected] = useState(-1);
  useAnimatedReaction(
    () => selectedIndex.get(),
    (value, previous) => {
      if (value !== previous) scheduleOnRN(setSelected, value);
    },
  );
  return selected;
}

type Props = {
  effect: SkRuntimeEffect;
  /** The shader's textures (as the sphere uses them). */
  shaderChildren: ReactNode;
  /** The globe shader's uniforms (as the sphere uses them). */
  uniforms: { get: () => object };
  cells: GlobeGeometry;
  /** Whether the close-up land is showing (see useCloseUp). */
  shown: SharedValue<boolean>;
  countries: CountryShape[];
  isVisited: boolean[];
  selectedIndex: SharedValue<number>;
  fadeIndex: SharedValue<number>;
  fadeProgress: SharedValue<number>;
  matrix: SharedValue<number[]>;
  radius: SharedValue<number>;
  cx: number;
  cy: number;
  width: number;
  height: number;
};

export function CloseUpLand({
  effect,
  shaderChildren: children,
  uniforms,
  cells,
  shown,
  countries,
  isVisited,
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
  const visited = useSharedValue<boolean[]>(isVisited);
  useEffect(() => {
    visited.set(isVisited);
  }, [isVisited, visited]);

  // All four paths from one pass over the pieces near the screen.
  const paths = useDerivedValue(() => {
    if (!shown.get()) return [EMPTY, EMPTY, EMPTY, EMPTY].map(toPath);
    return buildGlobeLand(
      cells,
      matrix.get(),
      cx,
      cy,
      radius.get(),
      width,
      height,
      visited.get(),
      fadeIndex.get(),
      selectedIndex.get(),
    ).map(toPath);
  });
  const landPath = useDerivedValue(() => paths.get()[0]);
  const visitedPath = useDerivedValue(() => paths.get()[1]);
  const fadePath = useDerivedValue(() => paths.get()[2]);
  const selectedFill = useDerivedValue(() => paths.get()[3]);

  const greyUniforms = useDerivedValue(() => ({
    ...uniforms.get(),
    landMode: 1,
  }));
  const visitedUniforms = useDerivedValue(() => ({
    ...uniforms.get(),
    landMode: 2,
  }));

  // The selected country's outline, for its glow.
  const selected = useSelectedState(selectedIndex);
  const outline = useMemo(
    () => (selected >= 0 ? countryOutlineLines(countries[selected].feature) : null),
    [countries, selected],
  );
  const outlinePath = useDerivedValue(() =>
    toPath(
      outline && shown.get()
        ? buildGlobeLines(outline, matrix.get(), cx, cy, radius.get(), width, height)
        : EMPTY,
    ),
  );

  return (
    <Group transform={PATH_TRANSFORM}>
      <Path path={landPath}>
        <Shader source={effect} uniforms={greyUniforms} transform={SHADER_TRANSFORM}>
          {children}
        </Shader>
      </Path>
      <Path path={visitedPath}>
        <Shader source={effect} uniforms={visitedUniforms} transform={SHADER_TRANSFORM}>
          {children}
        </Shader>
      </Path>
      <Path path={fadePath} opacity={fadeProgress}>
        <Shader source={effect} uniforms={visitedUniforms} transform={SHADER_TRANSFORM}>
          {children}
        </Shader>
      </Path>
      <Path path={selectedFill} color={SELECTED_BRIGHTEN} blendMode="plus" />
      <SelectionLines outline={outlinePath} scale={PATH_SCALE} />
    </Group>
  );
}

const { selection, selectionLines } = textureGlobeStyle;
/** Added to the selected country's colour (fill it with blendMode="plus"). */
export const SELECTED_BRIGHTEN = `rgba(255, 255, 255, ${selection.brighten})`;

/**
 * The selected country's outline drawn as vector lines: a soft glow with a crisp line
 * along it. `scale` = path units per screen px.
 */
export function SelectionLines({
  outline,
  scale,
}: {
  outline: SharedValue<SkPath> | SkPath;
  scale: number | SharedValue<number>;
}) {
  const glowWidth = useDerivedValue(() => 2 * selection.glowWidth * read(scale));
  const glowBlur = useDerivedValue(() => selectionLines.glowBlur * read(scale));
  const lineWidth = useDerivedValue(() => selectionLines.lineWidth * read(scale));
  return (
    <>
      <Path
        path={outline}
        color={selection.glowColor}
        opacity={selection.glowStrength * selectionLines.glowOpacity}
        style="stroke"
        strokeWidth={glowWidth}
        strokeJoin="round"
        strokeCap="round">
        <BlurMask blur={glowBlur} style="normal" />
      </Path>
      <Path
        path={outline}
        color={selection.glowColor}
        opacity={selectionLines.lineOpacity}
        style="stroke"
        strokeWidth={lineWidth}
        strokeJoin="round"
        strokeCap="round"
      />
    </>
  );
}

function read(value: number | SharedValue<number>) {
  'worklet';
  return typeof value === 'number' ? value : value.get();
}
