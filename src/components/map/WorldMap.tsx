import {
  BlurMask,
  Canvas,
  Group,
  LinearGradient,
  Path,
  Rect,
  Shader,
  Skia,
  type SkPath,
  type Transforms3d,
} from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  GestureDetector,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import {
  cancelAnimation,
  Easing,
  interpolateColor,
  useDerivedValue,
  useSharedValue,
  withDecay,
  withTiming,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useCloseUp } from '@/components/globe/CloseUpLand';
import { CountryBubble, type BubbleAnchor } from '@/components/globe/CountryBubble';
import { getMapEffect } from '@/components/globe/globeShader';
import {
  LAND_UNIFORMS,
  texelsOf,
  useTextureSet,
  useVisitedPalette,
  type GlobeTextures,
} from '@/components/globe/globeTextures';
import { makeLandLayerPaint } from '@/components/globe/landLayer';
import {
  dotOpacityForSize,
  GlowDot,
  LandTextures,
  SMALL_COUNTRIES,
  SMALL_COUNTRY_TEXELS,
} from '@/components/globe/TextureGlobeLayers';
import {
  getFlatMapBorderPath,
  getFlatMapData,
  getFlatMapVectorPaths,
  MAP_WEST,
  mapClipPath,
} from '@/globe/flatMap';
import { getGlobeData } from '@/globe/globeData';
import { countryAt } from '@/globe/hitTest';
import { MAP_ZOOM, zoomLimitHaptic } from '@/globe/zoom';

import { MapCloseUpLand, useMapCells, type MapView } from './MapCloseUpLand';
import {
  DEBUG_ALL_VISITED,
  GLOBE_RENDERER,
  globeColors,
  globeStyle,
  textureGlobeStyle,
} from '@/theme';

type Props = {
  /** Size of the canvas, in px. */
  width: number;
  height: number;
  /** Shared with the zoom buttons. 1 = the whole map fits the width (see MAP_ZOOM). */
  zoom: SharedValue<number>;
  /** ISO numeric ids of visited countries, drawn in their visited colour. */
  visitedIds: ReadonlySet<string>;
  onToggleVisited: (countryId: string) => void;
  /** Textures for the textured map (loaded once by the screen, shared with the globe). */
  textures: GlobeTextures;
};

/** Momentum friction for withDecay (closer to 1 = longer glide). */
const DECELERATION = 0.997;
/** Sliding a selected country to the middle. */
const CENTRE_TIMING = { duration: 600, easing: Easing.inOut(Easing.cubic) };
/** Grey ↔ green fade when a country is marked visited or unvisited. */
const VISITED_FADE_MS = 500;
/**
 * Screen px per radian at which land sides are `slab.offset` deep: about the
 * globe's scale at zoom 1, so the map and globe look alike at similar sizes.
 */
const REFERENCE_PX_PER_RADIAN = 150;
const NO_COUNTRY = -1;
/** Map border lines are this share of their full width when the whole map shows… */
const MAP_LINES_MIN = 0.35;
/** …growing to full width by this zoom. */
const MAP_LINES_FULL_ZOOM = 5;
/** The detailed border lines are built this long after the map first appears. */
const BORDER_LINES_DELAY_MS = 1800;

const EMPTY_PATH = Skia.Path.Make();
/** A Skia path from SVG path text; empty (rather than a crash) if Skia can't read it. */
const pathFrom = (svg: string) => {
  if (!svg) return EMPTY_PATH;
  try {
    return Skia.Path.MakeFromSVGString(svg) ?? EMPTY_PATH;
  } catch {
    return EMPTY_PATH;
  }
};

/**
 * Flat world map with the same land as the textured globe (relief, borders, visited
 * colours, selection glow) and no sea. Tap to select and mark visited; drag to move,
 * pinch to zoom.
 *
 * The textured map is one shader over the canvas (see MAP in globeShader.ts); the
 * vector outlines (src/globe/flatMap.ts) are its fallback. Moving and zooming only
 * change the view, so it stays smooth at any zoom.
 */
export function WorldMap({ width, height, zoom, visitedIds, onToggleVisited, textures }: Props) {
  const { countries } = getGlobeData();
  const map = getFlatMapData(countries);
  // Screen px per map unit at zoom 1: the whole map fits, clear of the screen's edges.
  const margin = textureGlobeStyle.mapMargin;
  const fit = Math.min((width - 2 * margin) / map.width, (height - 2 * margin) / map.height);

  const textureSet = useTextureSet(textures, zoom, textureGlobeStyle.mapHiResZoom);
  const mapEffect =
    GLOBE_RENDERER === 'texture' && !textures.failed && textureSet ? getMapEffect() : null;
  const { colors, colorValues, palette, isVisited } = useVisitedPalette(countries, visitedIds);
  // Close up, the land is drawn as sharp vector shapes (see MapCloseUpLand.tsx).
  const cells = useMapCells(mapEffect !== null);
  const closeUp = useCloseUp(zoom, textureGlobeStyle.closeUp.mapZoom, cells !== null);
  const earthTexels = textureSet ? texelsOf(textureSet) : 1;

  // The vector fallback's outlines, only built if the textured map can't be drawn.
  const vector = mapEffect ? null : getFlatMapVectorPaths(countries);
  const staticPaths = {
    land: pathFrom(vector?.landPath ?? ''),
    outline: pathFrom(map.outlinePath),
    graticule: pathFrom(vector ? map.graticulePath : ''),
  };

  // --- View: the map point at the middle of the screen, and the zoom ---
  const centreX = useSharedValue(map.width / 2);
  const centreY = useSharedValue(map.height / 2);

  /** Keeps the map covering the screen (or centred, when it's smaller than the screen). */
  const clampCentre = (value: number, scale: number, viewSize: number, mapSize: number) => {
    'worklet';
    const half = viewSize / (2 * scale);
    if (half * 2 >= mapSize) return mapSize / 2;
    return Math.min(mapSize - half, Math.max(half, value));
  };

  // Screen = (map point - centre) × scale + middle of the screen.
  const view = useDerivedValue<MapView>(() => {
    const scale = fit * zoom.get();
    const x = clampCentre(centreX.get(), scale, width, map.width);
    const y = clampCentre(centreY.get(), scale, height, map.height);
    return {
      scale,
      x,
      y,
      tx: width / 2 - x * scale,
      ty: height / 2 - y * scale,
    };
  });
  const mapTransform = useDerivedValue<Transforms3d>(() => {
    const v = view.get();
    return [{ translateX: v.tx }, { translateY: v.ty }, { scale: v.scale }];
  });
  // Undoes mapTransform, so the land layer's filter works in screen px.
  const screenTransform = useDerivedValue(() => {
    const v = view.get();
    return [{ scale: 1 / v.scale }, { translateX: -v.tx }, { translateY: -v.ty }];
  });
  // The map's shape on screen: its bottom edge curves round Antarctica (see flatMap.ts).
  const mapWidth = map.width;
  const mapHeight = map.height;
  const clipSideY = map.clipSideY;
  const clipPath = useDerivedValue(() => {
    const { scale, tx, ty } = view.get();
    return pathFrom(mapClipPath(mapWidth, mapHeight, clipSideY, scale, tx, ty));
  });
  const highlightTransform = useDerivedValue(() => {
    const v = view.get();
    const shift = globeStyle.outlineHighlight.offset;
    return [{ translateX: v.tx - shift }, { translateY: v.ty - shift }, { scale: v.scale }];
  });

  // Line widths are set in screen px, so they stay thin when zoomed in.
  const borderWidth = useDerivedValue(() => 0.6 / view.get().scale);
  const highlightWidth = useDerivedValue(
    () => globeStyle.outlineHighlight.width / view.get().scale,
  );
  const hairline = useDerivedValue(() => 1 / view.get().scale);
  const selectedGlowWidth = useDerivedValue(() => 3 / view.get().scale);
  const selectedGlowBlur = useDerivedValue(() => 4 / view.get().scale);
  const selectedOutlineWidth = useDerivedValue(() => 1.5 / view.get().scale);

  // Sides and shallow-water glow, scaled like the globe's at the same size.
  const landLayer = useDerivedValue(() => {
    const relative = (view.get().scale * map.unitsPerRadian) / REFERENCE_PX_PER_RADIAN;
    return makeLandLayerPaint(
      globeStyle.slab.offset * Math.pow(relative, globeStyle.slab.zoomGrowth),
      Math.sqrt(relative),
    );
  });

  // --- Selection and visited state ---
  const [selected, setSelected] = useState<number | null>(null);
  const selectedIndex = useSharedValue(NO_COUNTRY);
  // The country fading between grey and green is drawn on its own.
  const [fadeIndex, setFadeIndex] = useState<number | null>(null);
  const fadeIndexShared = useSharedValue(NO_COUNTRY);
  const fadeProgress = useSharedValue(0);
  const fadeColor = useDerivedValue(() =>
    interpolateColor(fadeProgress.get(), [0, 1], [globeColors.land, globeColors.visited]),
  );

  const visitedPath = pathFrom(
    countries
      .map((c, i) =>
        vector && visitedIds.has(c.id) && i !== fadeIndex ? vector.countryPaths[i] : '',
      )
      .join(''),
  );
  const fadePath = pathFrom(vector && fadeIndex !== null ? vector.countryPaths[fadeIndex] : '');
  const selectedPath = pathFrom(vector && selected !== null ? vector.countryPaths[selected] : '');

  const selectCountry = (index: number | null) => {
    setSelected(index);
    selectedIndex.set(index ?? NO_COUNTRY);
    if (index === null) return;
    // Slide the country to the middle (the nearest copy of it, as the map wraps round;
    // the view keeps the map covering the screen top to bottom).
    const fromX = view.get().x;
    centreX.set(fromX);
    centreX.set(withTiming(map.anchors[index * 2], CENTRE_TIMING));
    centreY.set(withTiming(map.anchors[index * 2 + 1], CENTRE_TIMING));
  };

  const handleTap = (x: number, y: number, scale: number) => {
    const lonLat = map.invert(((x % map.width) + map.width) % map.width, y);
    if (!lonLat) {
      selectCountry(null);
      return;
    }
    selectCountry(
      countryAt(
        countries,
        lonLat[0],
        lonLat[1],
        map.unitsPerRadian * scale,
        textures.countryLookup,
      ),
    );
  };

  const toggleSelectedVisited = () => {
    if (selected === null) return;
    const id = countries[selected].id;
    const nowVisited = !visitedIds.has(id);
    setFadeIndex(selected);
    fadeIndexShared.set(selected);
    fadeProgress.set(nowVisited ? 0 : 1);
    fadeProgress.set(withTiming(nowVisited ? 1 : 0, { duration: VISITED_FADE_MS }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleVisited(id);
  };

  // The textured map's shader inputs: the view, the map's shape, and the land look.
  const mapUniforms = useDerivedValue(() => {
    const v = view.get();
    const fading = fadeIndexShared.get();
    const vectorLand = closeUp.get();
    return {
      ...LAND_UNIFORMS,
      earthTexels,
      mapLonOrigin: (MAP_WEST * Math.PI) / 180,
      // Close up the land is drawn as vector shapes instead.
      landHidden: vectorLand ? 1 : 0,
      viewScale: v.scale,
      viewOffset: [v.tx, v.ty],
      mapWidth: map.width,
      mapHeight: map.height,
      mercatorScale: map.unitsPerRadian,
      mercatorTop: map.mercatorTop,
      brightness: textureGlobeStyle.mapBrightness,
      borderStrength: 0, // drawn as vector lines instead (below)
      fadeId: fading + 1,
      fadeAmount: DEBUG_ALL_VISITED ? 1 : fadeProgress.get(),
      fadeColor: fading >= 0 ? colorValues[fading] : [0, 0, 0, 0],
      selectedId: vectorLand ? 0 : selectedIndex.get() + 1,
    };
  });
  const smallVisited = SMALL_COUNTRIES.filter((i) => isVisited[i]);

  // The detailed border lines, built (once) shortly after the map first appears.
  const [borderPath, setBorderPath] = useState<SkPath | null>(null);
  useEffect(() => {
    const id = setTimeout(
      () => setBorderPath(pathFrom(getFlatMapBorderPath())),
      BORDER_LINES_DELAY_MS,
    );
    return () => clearTimeout(id);
  }, []);
  // Thinner when zoomed out (the whole map is small), full width from mapLinesFull up.
  const borderLineWidth = useDerivedValue(() => {
    const grow = Math.min(1, Math.max(0, (zoom.get() - 1) / (MAP_LINES_FULL_ZOOM - 1)));
    const px = textureGlobeStyle.borders.lines.width * (MAP_LINES_MIN + (1 - MAP_LINES_MIN) * grow);
    return px / view.get().scale;
  });

  // Screen position of the selected country's anchor, for the name bubble.
  const bubbleAnchor = useDerivedValue<BubbleAnchor>(() => {
    const sel = selectedIndex.get();
    if (sel === NO_COUNTRY) return { x: 0, y: 0, visible: false };
    const v = view.get();
    const x = v.tx + map.anchors[sel * 2] * v.scale;
    const y = v.ty + map.anchors[sel * 2 + 1] * v.scale;
    return { x, y, visible: x >= 0 && x <= width && y >= 0 && y <= height };
  });

  // --- Gestures ---
  const stopMotion = () => {
    'worklet';
    cancelAnimation(centreX);
    cancelAnimation(centreY);
    // Start from where the map is shown, not from a point past the edge.
    const v = view.get();
    centreX.set(v.x);
    centreY.set(v.y);
  };

  const pan = usePanGesture({
    onBegin: () => {
      'worklet';
      stopMotion();
    },
    onUpdate: (e) => {
      'worklet';
      const scale = fit * zoom.get();
      centreX.set(clampCentre(centreX.get() - e.changeX / scale, scale, width, map.width));
      centreY.set(clampCentre(centreY.get() - e.changeY / scale, scale, height, map.height));
    },
    onDeactivate: (e) => {
      'worklet';
      const scale = fit * zoom.get();
      const halfH = height / (2 * scale);
      // No east–west limit: the map wraps round (the view wraps the value).
      const halfW = width / (2 * scale);
      if (halfW * 2 < map.width) {
        centreX.set(
          withDecay({
            velocity: -e.velocityX / scale,
            deceleration: DECELERATION,
            clamp: [halfW, map.width - halfW],
          }),
        );
      }
      if (halfH * 2 < map.height) {
        centreY.set(
          withDecay({
            velocity: -e.velocityY / scale,
            deceleration: DECELERATION,
            clamp: [halfH, map.height - halfH],
          }),
        );
      }
    },
  });

  const pinchStartZoom = useSharedValue(MAP_ZOOM.min);
  const atZoomLimit = useSharedValue(false);

  const pinch = usePinchGesture({
    onActivate: () => {
      'worklet';
      cancelAnimation(zoom);
      stopMotion();
      pinchStartZoom.set(zoom.get());
    },
    onUpdate: (e) => {
      'worklet';
      const raw = pinchStartZoom.get() * e.scale;
      const nextZoom = Math.min(MAP_ZOOM.max, Math.max(MAP_ZOOM.min, raw));
      const atLimit = nextZoom !== raw;
      if (atLimit && !atZoomLimit.get()) scheduleOnRN(zoomLimitHaptic);
      atZoomLimit.set(atLimit);

      // Keep the map point between the fingers in place. Read the live values (not
      // `view`, which may not include a pan applied earlier this frame).
      const before = fit * zoom.get();
      const focusX =
        clampCentre(centreX.get(), before, width, map.width) + (e.focalX - width / 2) / before;
      const focusY =
        clampCentre(centreY.get(), before, height, map.height) + (e.focalY - height / 2) / before;
      const scale = fit * nextZoom;
      zoom.set(nextZoom);
      centreX.set(clampCentre(focusX - (e.focalX - width / 2) / scale, scale, width, map.width));
      centreY.set(clampCentre(focusY - (e.focalY - height / 2) / scale, scale, height, map.height));
    },
    onDeactivate: () => {
      'worklet';
      atZoomLimit.set(false);
    },
  });

  const tap = useTapGesture({
    maxDistance: 10,
    onActivate: (e) => {
      'worklet';
      const v = view.get();
      scheduleOnRN(
        handleTap,
        v.x + (e.x - width / 2) / v.scale,
        v.y + (e.y - height / 2) / v.scale,
        v.scale,
      );
    },
  });

  const gesture = useSimultaneousGestures(pan, pinch, tap);

  const selectedCountry =
    selected === null
      ? null
      : {
          id: countries[selected].id,
          name: countries[selected].name,
          visited: visitedIds.has(countries[selected].id),
        };

  return (
    <View>
      <GestureDetector gesture={gesture}>
        <View>
          <Canvas style={{ width, height }}>
            {mapEffect && palette && textureSet ? (
              <Group clip={clipPath}>
                {/* Textured land, drawn per pixel over the whole canvas (no sea) */}
                <Rect x={0} y={0} width={width} height={height}>
                  <Shader source={mapEffect} uniforms={mapUniforms}>
                    <LandTextures textures={textureSet} palette={palette} mipmaps />
                  </Shader>
                </Rect>
                {/* Close up: sharp vector land, visited colours and selection */}
                {cells && (
                  <MapCloseUpLand
                    effect={mapEffect}
                    shaderChildren={
                      <LandTextures textures={textureSet} palette={palette} mipmaps />
                    }
                    uniforms={mapUniforms}
                    cells={cells}
                    shown={closeUp}
                    countries={countries}
                    isVisited={isVisited}
                    selectedIndex={selectedIndex}
                    fadeIndex={fadeIndexShared}
                    fadeProgress={fadeProgress}
                    view={view}
                    mapTransform={mapTransform}
                    width={width}
                    height={height}
                  />
                )}
                {/* Thin white borders from the detailed outlines */}
                {borderPath && (
                  <Group transform={mapTransform}>
                    <Path
                      path={borderPath}
                      color={textureGlobeStyle.borders.lines.color}
                      style="stroke"
                      strokeWidth={borderLineWidth}
                      strokeJoin="round"
                      strokeCap="round"
                    />
                  </Group>
                )}
                {smallVisited.map((i) => (
                  <MapDot
                    key={i}
                    x={map.anchors[i * 2]}
                    y={map.anchors[i * 2 + 1]}
                    size={((SMALL_COUNTRY_TEXELS[i] ?? 0) * map.width) / 2048}
                    color={colors[i]}
                    view={view}
                  />
                ))}
              </Group>
            ) : (
              <>
                <Group transform={mapTransform}>
                  {/* Ocean: the map's rounded outline, lighter at the top */}
                  <Path path={staticPaths.outline}>
                    <LinearGradient
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: map.height }}
                      colors={[globeStyle.map.ocean.top, globeStyle.map.ocean.bottom]}
                    />
                  </Path>
                  <Path
                    path={staticPaths.graticule}
                    color={globeStyle.map.graticule}
                    style="stroke"
                    strokeWidth={hairline}
                  />

                  {/* Land tops in one layer; its filter adds the sides and shallow-water
                      glow in screen px (see landLayer.ts). Clipped to the map's edge. */}
                  <Group clip={staticPaths.outline}>
                    <Group transform={screenTransform} layer={landLayer}>
                      <Group transform={mapTransform}>
                        <Path path={staticPaths.land} fillType="evenOdd">
                          <LinearGradient
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: map.height }}
                            colors={[globeStyle.land.top, globeStyle.land.bottom]}
                          />
                        </Path>
                        <Path path={visitedPath} color={globeColors.visited} fillType="evenOdd" />
                        <Path path={fadePath} color={fadeColor} fillType="evenOdd" />
                      </Group>
                    </Group>
                  </Group>

                  {/* Borders: grey everywhere, then green over visited countries */}
                  <Path
                    path={staticPaths.land}
                    color={globeColors.landBorder}
                    style="stroke"
                    strokeWidth={borderWidth}
                    strokeJoin="round"
                  />
                  <Path
                    path={visitedPath}
                    color={globeColors.visitedBorder}
                    style="stroke"
                    strokeWidth={borderWidth}
                    strokeJoin="round"
                  />
                </Group>

                {/* Lit edge along every outline, 1 screen px up-left */}
                <Group transform={highlightTransform}>
                  <Path
                    path={staticPaths.land}
                    color={globeStyle.outlineHighlight.color}
                    style="stroke"
                    strokeWidth={highlightWidth}
                    strokeJoin="round"
                  />
                </Group>

                <Group transform={mapTransform}>
                  {/* Selected country: lightened, with a glowing outline */}
                  <Path path={selectedPath} color={globeColors.selectedTint} fillType="evenOdd" />
                  <Path
                    path={selectedPath}
                    color={globeColors.selectedGlow}
                    style="stroke"
                    strokeWidth={selectedGlowWidth}
                    strokeJoin="round">
                    <BlurMask blur={selectedGlowBlur} style="normal" />
                  </Path>
                  <Path
                    path={selectedPath}
                    color={globeColors.selectedOutline}
                    style="stroke"
                    strokeWidth={selectedOutlineWidth}
                    strokeJoin="round"
                  />

                  {/* The edge of the world */}
                  <Path
                    path={staticPaths.outline}
                    color={globeStyle.map.edge}
                    style="stroke"
                    strokeWidth={hairline}
                  />
                </Group>
              </>
            )}
          </Canvas>
        </View>
      </GestureDetector>
      <CountryBubble
        anchor={bubbleAnchor}
        containerWidth={width}
        country={selectedCountry}
        onToggleVisited={toggleSelectedVisited}
      />
    </View>
  );
}

type MapDotProps = {
  /** Position in map units. */
  x: number;
  y: number;
  /** The country's rough width, in map units. */
  size: number;
  color: string;
  view: DerivedValue<MapView>;
};

/**
 * Glowing dot on a visited country too small to see in the texture; it fades out once
 * zoomed in far enough to see the country itself.
 */
function MapDot({ x, y, size, color, view }: MapDotProps) {
  const centre = useDerivedValue(() => {
    const v = view.get();
    return { x: v.tx + x * v.scale, y: v.ty + y * v.scale };
  });
  const opacity = useDerivedValue(() => dotOpacityForSize(size * view.get().scale));
  return <GlowDot centre={centre} color={color} opacity={opacity} />;
}
