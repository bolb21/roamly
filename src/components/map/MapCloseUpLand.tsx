// Close-up land on the flat map: past textureGlobeStyle.closeUp.mapZoom the land,
// visited colours and selection are drawn as sharp vector shapes (from the pre-cut
// pieces, see getFlatMapCells) filled with the map's own shader, so they match the
// textured map but never turn blocky. See CloseUpLand.tsx for the globe's version.

import {
  Group,
  Path,
  Shader,
  Skia,
  type SkPath,
  type SkRuntimeEffect,
  type Transforms3d,
} from '@shopify/react-native-skia';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  useDerivedValue,
  useSharedValue,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import {
  SELECTED_BRIGHTEN,
  SelectionLines,
  useSelectedState,
} from '@/components/globe/CloseUpLand';
import { getFlatMapCells, getFlatMapCountryLines } from '@/globe/flatMap';
import type { CountryShape } from '@/globe/geometry';
import { buildFlatLand, PATH_SCALE, type FlatGeometry } from '@/globe/projection';

/** The land pieces are built this long after the map first appears. */
const CELLS_DELAY_MS = 2200;
const EMPTY = 'M0 0';
const PATH_TRANSFORM = [{ scale: 1 / PATH_SCALE }];
const SHADER_TRANSFORM = [{ scale: PATH_SCALE }];
const EMPTY_PATH = Skia.Path.Make();

function toPath(svg: string): SkPath {
  'worklet';
  try {
    return Skia.Path.MakeFromSVGString(svg) ?? Skia.Path.Make();
  } catch {
    return Skia.Path.Make();
  }
}

/** The pre-cut land pieces in map units, built shortly after first use (or null). */
export function useMapCells(enabled: boolean) {
  const [cells, setCells] = useState<FlatGeometry | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const id = setTimeout(() => setCells(getFlatMapCells()), CELLS_DELAY_MS);
    return () => clearTimeout(id);
  }, [enabled]);
  return cells;
}

export type MapView = {
  scale: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
};

type Props = {
  effect: SkRuntimeEffect;
  /** The map shader's textures. */
  shaderChildren: ReactNode;
  /** The map shader's uniforms (as the textured map uses them). */
  uniforms: { get: () => object };
  cells: FlatGeometry;
  shown: SharedValue<boolean>;
  countries: CountryShape[];
  isVisited: boolean[];
  selectedIndex: SharedValue<number>;
  fadeIndex: SharedValue<number>;
  fadeProgress: SharedValue<number>;
  view: DerivedValue<MapView>;
  /** Map units → screen (translate, then scale). */
  mapTransform: DerivedValue<Transforms3d>;
  width: number;
  height: number;
};

export function MapCloseUpLand({
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
  view,
  mapTransform,
  width,
  height,
}: Props) {
  const visited = useSharedValue<boolean[]>(isVisited);
  useEffect(() => {
    visited.set(isVisited);
  }, [isVisited, visited]);

  const paths = useDerivedValue(() => {
    if (!shown.get()) return [EMPTY, EMPTY, EMPTY, EMPTY].map(toPath);
    const v = view.get();
    return buildFlatLand(
      cells,
      v.scale,
      v.tx,
      v.ty,
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

  // The selected country's outline (map units, drawn with the map's transform).
  const selected = useSelectedState(selectedIndex);
  const outline = useMemo(
    () =>
      toPath(selected >= 0 ? getFlatMapCountryLines(countries[selected].feature) || EMPTY : EMPTY),
    [countries, selected],
  );
  const shownOutline = useDerivedValue(() => (shown.get() ? outline : EMPTY_PATH));
  // Map units per screen px, so the lines keep their screen width.
  const unitsPerPx = useDerivedValue(() => 1 / view.get().scale);

  return (
    <>
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
      </Group>
      <Group transform={mapTransform}>
        <SelectionLines outline={shownOutline} scale={unitsPerPx} />
      </Group>
    </>
  );
}
