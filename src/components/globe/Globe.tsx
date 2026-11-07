import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Skia,
  type SkPath,
} from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  GestureDetector,
  usePanGesture,
  usePinchGesture,
  useRotationGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import {
  cancelAnimation,
  Easing,
  interpolateColor,
  useAnimatedReaction,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withDecay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { scheduleOnRN } from 'react-native-worklets';

import { getGlobeData } from '@/globe/globeData';
import { countryAt } from '@/globe/hitTest';
import { buildGlobePath, PATH_SCALE } from '@/globe/projection';
import {
  quatApplyDrag,
  quatApplyTwist,
  quatFaceFront,
  quatFromView,
  quatSlerp,
  quatToMatrix,
  type Quat,
} from '@/globe/rotation';
import {
  clampZoom,
  DETAIL_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  rubberBandZoom,
  zoomLimitHaptic,
} from '@/globe/zoom';
import {
  GLOBE_MAPPING_TEST,
  GLOBE_RENDERER,
  globeColors,
  globeStyle,
  textureGlobeStyle,
} from '@/theme';

import { CountryBubble, type BubbleAnchor } from './CountryBubble';
import { getEarthEffect, getMappingTestEffect } from './globeShader';
import { makeLandLayerPaint } from './landLayer';
import { useTextureSet, type GlobeTextures } from './globeTextures';
import { Starfield } from './Starfield';
import { TextureGlobeLayers } from './TextureGlobeLayers';

type Props = {
  /** Size of the canvas, in px. The globe is centred in it. */
  width: number;
  height: number;
  /** Shared with the zoom buttons. 1 = whole globe fits (see src/globe/zoom.ts). */
  zoom: SharedValue<number>;
  /** ISO numeric ids of visited countries, drawn green. */
  visitedIds: ReadonlySet<string>;
  onToggleVisited: (countryId: string) => void;
  /** Textures for the textured renderer (loaded once by the screen, shared with the map). */
  textures: GlobeTextures;
};

/** Starting view: centred over Europe/Africa, like the reference image. */
const INITIAL_VIEW = { lon: 15, lat: 25 };
/** Globe radius at zoom 1, as a share of the canvas's shorter side. Leaves room for the glow. */
const BASE_RADIUS_FRACTION = 0.423;
/** Momentum friction for withDecay (closer to 1 = longer spin). */
const DECELERATION = 0.997;
/** A touch on a globe spinning faster than this (px/frame) only stops it; it doesn't select. */
const CATCH_SPEED = 1;
/** Spring used when a pinch is released past a zoom limit: one small overshoot, then settles. */
const ZOOM_SPRING = { duration: 450, dampingRatio: 0.75 };
/** Turning a selected country to face the user. */
const CENTRE_TIMING = { duration: 700, easing: Easing.inOut(Easing.cubic) };
/** Grey ↔ green fade when a country is marked visited or unvisited. */
const VISITED_FADE_MS = 500;
/** The outer glow fades out by this zoom (it's off-screen anyway, and blur is costly when large). */
const GLOW_FADE_ZOOM = 1.6;
/** Overlay with UI-thread fps and per-frame path build time. Set to false before demos. */
const SHOW_PERF = true;
/** Shown in the perf overlay, to confirm the phone is running the latest code. */
const BUILD_LABEL = 'soft borders v1';

const TRANSPARENT = 'rgba(0,0,0,0)';
/** Halo gradient stops: solid at the sphere's edge, fading out over the halo's width. */
const HALO_EDGE = 1 / (1 + globeStyle.halo.width);
const HALO_STOPS = [0, HALO_EDGE, (HALO_EDGE + 1) / 2, 1];

/** Rim gradients are centred this far (× radius) off-centre, along the light direction. */
const RIM_CENTRE_SHIFT = 0.12;
/** …so they reach the far edge at this many radii. */
const RIM_REACH = 1 + RIM_CENTRE_SHIFT * Math.SQRT2;

const LAND_PATH_TRANSFORM = [{ scale: 1 / PATH_SCALE }];

/** Turns a globe SVG path string into a Skia path (each Path sets its own fill type). */
function toSkPath(svg: string): SkPath {
  'worklet';
  // On the phone Skia throws on path text it can't read; draw nothing rather than crash.
  try {
    return Skia.Path.MakeFromSVGString(svg) ?? Skia.Path.Make();
  } catch {
    return Skia.Path.Make();
  }
}
const HIGHLIGHT_TRANSFORM = [
  { translateX: -globeStyle.outlineHighlight.offset },
  { translateY: -globeStyle.outlineHighlight.offset },
  { scale: 1 / PATH_SCALE },
];
const NO_COUNTRY = -1;

/**
 * Interactive orthographic globe drawn with Skia.
 *
 * All per-frame work (gestures, momentum, zoom, projecting the border points
 * and building the paths) runs on the UI thread, so the JS thread being busy
 * can't make rotation stutter. Working out which country was tapped runs on
 * the JS thread, once per tap.
 */
export function Globe({ width, height, zoom, visitedIds, onToggleVisited, textures }: Props) {
  // Worklets may use the geometries and anchorPoints, but never `countries`:
  // it holds the full GeoJSON, which is too big to copy to the UI thread.
  const { simplified, detailed, countries, anchorPoints } = getGlobeData();
  // The textured renderer's shader, or null to draw the vector globe: when the
  // renderer is 'vector', if the shader fails to compile or a texture fails to load,
  // and while the first texture is loading.
  const wantTexture = GLOBE_RENDERER === 'texture';
  const textureSet = useTextureSet(textures, zoom, textureGlobeStyle.hiResZoom);
  const textureMode = GLOBE_MAPPING_TEST ? 'test' : 'earth';
  const textureEffect =
    !wantTexture || textures.failed
      ? null
      : GLOBE_MAPPING_TEST
        ? getMappingTestEffect()
        : textureSet
          ? getEarthEffect()
          : null;
  // The vector outlines are only built while something draws them (the vector globe,
  // or the mapping test's outlines), saving a few ms per frame on the textured globe.
  const drawsVector = textureEffect === null || GLOBE_MAPPING_TEST;

  const cx = width / 2;
  const cy = height / 2;
  const baseRadius = Math.min(width, height) * BASE_RADIUS_FRACTION;

  // Computed once on mount (not at module load) so importing this file has no side effects.
  const [initialOrientation] = useState(() => quatFromView(INITIAL_VIEW.lon, INITIAL_VIEW.lat));
  const orientation = useSharedValue<Quat>(initialOrientation);
  const buildMs = useSharedValue(0);

  // On-screen radius. Everything that drags the surface uses it, so the
  // surface keeps up with the finger at any zoom.
  const radius = useDerivedValue(() => baseRadius * zoom.get());
  const matrix = useDerivedValue(() => quatToMatrix(orientation.get()));
  const vectorShown = useSharedValue(drawsVector);
  useEffect(() => {
    vectorShown.set(drawsVector);
  }, [drawsVector, vectorShown]);

  // --- Selection (transient UI state) ---
  const [selected, setSelected] = useState<number | null>(null);
  const selectedIndex = useSharedValue(NO_COUNTRY);

  // Turning the selected country to the front: orientation = slerp(from, to, progress).
  const centreFrom = useSharedValue<Quat>(initialOrientation);
  const centreTo = useSharedValue<Quat>(initialOrientation);
  const centreProgress = useSharedValue(0);

  useAnimatedReaction(
    () => centreProgress.get(),
    (t, previous) => {
      if (previous === null || t === previous) return;
      orientation.set(quatSlerp(centreFrom.get(), centreTo.get(), t));
    },
  );

  const selectCountry = (index: number | null) => {
    setSelected(index);
    selectedIndex.set(index ?? NO_COUNTRY);
    if (index === null) return;
    const from = orientation.get();
    centreFrom.set(from);
    centreTo.set(
      quatFaceFront(
        from,
        anchorPoints[index * 3],
        anchorPoints[index * 3 + 1],
        anchorPoints[index * 3 + 2],
      ),
    );
    centreProgress.set(0);
    centreProgress.set(withTiming(1, CENTRE_TIMING));
  };

  const handleTap = (lon: number, lat: number, radiusPx: number) => {
    selectCountry(countryAt(countries, lon, lat, radiusPx, textures.countryLookup));
  };

  // --- Visited colouring ---
  // visitedMask[i] is true when country i is visited. `fadeIndex` is the one
  // country currently fading between grey (0) and green (1); it's drawn on its own.
  const visitedMask = useSharedValue<boolean[]>([]);
  const fadeIndex = useSharedValue(NO_COUNTRY);
  const fadeProgress = useSharedValue(0);

  useEffect(() => {
    visitedMask.set(countries.map((c) => visitedIds.has(c.id)));
  }, [countries, visitedIds, visitedMask]);

  const toggleSelectedVisited = () => {
    if (selected === null) return;
    const id = countries[selected].id;
    const nowVisited = !visitedIds.has(id);
    fadeIndex.set(selected);
    fadeProgress.set(nowVisited ? 0 : 1);
    fadeProgress.set(withTiming(nowVisited ? 1 : 0, { duration: VISITED_FADE_MS }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleVisited(id);
  };

  // --- Momentum ---
  // After release the globe keeps "dragging" along the release direction.
  // `spinDistance` (px) decays smoothly and each change is applied as an
  // incremental trackball rotation, so momentum also passes over poles.
  const spinDistance = useSharedValue(0);
  const spinDirection = useSharedValue({ x: 0, y: 0 });
  const spinStep = useSharedValue(0);
  const caughtSpin = useSharedValue(false);

  useAnimatedReaction(
    () => spinDistance.get(),
    (current, previous) => {
      if (previous === null || current === previous) return;
      const step = current - previous;
      spinStep.set(Math.abs(step));
      const dir = spinDirection.get();
      orientation.set(quatApplyDrag(orientation.get(), dir.x * step, dir.y * step, radius.get()));
    },
  );

  // --- Paths, rebuilt every frame the view changes ---
  // Each is built as an SVG string and turned into a Skia path once, then shared by
  // every layer that draws it (a string would be re-parsed by each layer).
  const landPath = useDerivedValue(() => {
    if (!vectorShown.get()) return toSkPath('M0 0');
    const t0 = performance.now();
    // Simplified outlines are plenty at full-globe size; switch to full detail when zoomed in.
    const geo = zoom.get() >= DETAIL_ZOOM ? detailed : simplified;
    const path = toSkPath(
      buildGlobePath(geo, matrix.get(), cx, cy, radius.get(), width, height, null),
    );
    if (SHOW_PERF) {
      buildMs.set(buildMs.get() * 0.9 + (performance.now() - t0) * 0.1);
    }
    return path;
  });

  const visitedPath = useDerivedValue(() => {
    if (!vectorShown.get()) return toSkPath('M0 0');
    const geo = zoom.get() >= DETAIL_ZOOM ? detailed : simplified;
    const mask = visitedMask.get();
    const fading = fadeIndex.get();
    return toSkPath(
      buildGlobePath(
        geo,
        matrix.get(),
        cx,
        cy,
        radius.get(),
        width,
        height,
        (i) => mask[i] === true && i !== fading,
      ),
    );
  });

  const fadePath = useDerivedValue(() => {
    const fading = fadeIndex.get();
    if (fading === NO_COUNTRY || !vectorShown.get()) return toSkPath('M0 0');
    const geo = zoom.get() >= DETAIL_ZOOM ? detailed : simplified;
    return toSkPath(
      buildGlobePath(geo, matrix.get(), cx, cy, radius.get(), width, height, (i) => i === fading),
    );
  });

  const fadeColor = useDerivedValue(() =>
    interpolateColor(fadeProgress.get(), [0, 1], [globeColors.land, globeColors.visited]),
  );

  // --- Raised countries ---
  // Side depth in screen px; it grows a little as you zoom in.
  const slabOffset = useDerivedValue(
    () => globeStyle.slab.offset * Math.pow(zoom.get(), globeStyle.slab.zoomGrowth),
  );
  // The land tops' layer adds the sides and shallow-water glow (see landLayer.ts).
  const landLayer = useDerivedValue(() =>
    makeLandLayerPaint(slabOffset.get(), Math.sqrt(zoom.get())),
  );
  // Sides are clipped to the sphere so they don't poke out past its edge.
  const sphereClip = useDerivedValue(() => {
    const r = radius.get();
    return {
      rect: { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r },
      rx: r,
      ry: r,
    };
  });

  const selectedPath = useDerivedValue(() => {
    const sel = selectedIndex.get();
    if (sel === NO_COUNTRY || !vectorShown.get()) return toSkPath('M0 0');
    const geo = zoom.get() >= DETAIL_ZOOM ? detailed : simplified;
    return toSkPath(
      buildGlobePath(geo, matrix.get(), cx, cy, radius.get(), width, height, (i) => i === sel),
    );
  });

  // Screen position of the selected country's anchor, for the name bubble.
  const bubbleAnchor = useDerivedValue<BubbleAnchor>(() => {
    const sel = selectedIndex.get();
    if (sel === NO_COUNTRY) return { x: 0, y: 0, visible: false };
    const m = matrix.get();
    const r = radius.get();
    const X = anchorPoints[sel * 3];
    const Y = anchorPoints[sel * 3 + 1];
    const Z = anchorPoints[sel * 3 + 2];
    const x = cx + r * (m[0] * X + m[1] * Y + m[2] * Z);
    const y = cy - r * (m[3] * X + m[4] * Y + m[5] * Z);
    const depth = m[6] * X + m[7] * Y + m[8] * Z;
    return {
      x,
      y,
      visible: depth > 0.2 && x >= 0 && x <= width && y >= 0 && y <= height,
    };
  });

  // --- Gestures ---
  const pan = usePanGesture({
    onBegin: () => {
      'worklet';
      // Touching a fast-spinning globe catches it (and that touch won't select).
      caughtSpin.set(spinStep.get() > CATCH_SPEED);
      spinStep.set(0);
      cancelAnimation(spinDistance);
      cancelAnimation(centreProgress);
    },
    onUpdate: (e) => {
      'worklet';
      // Angle = distance / radius, so the surface keeps up with the finger.
      orientation.set(quatApplyDrag(orientation.get(), e.changeX, e.changeY, radius.get()));
    },
    onDeactivate: (e) => {
      'worklet';
      const speed = Math.hypot(e.velocityX, e.velocityY);
      if (speed < 1) return;
      spinDirection.set({ x: e.velocityX / speed, y: e.velocityY / speed });
      // Continues from the current value, so no jump when a new spin starts.
      spinDistance.set(
        withDecay({ velocity: speed, deceleration: DECELERATION }, () => spinStep.set(0)),
      );
    },
  });

  // Zoom the fingers asked for, before rubber-banding.
  const pinchStartZoom = useSharedValue(MIN_ZOOM);
  const pastZoomLimit = useSharedValue(false);

  const pinch = usePinchGesture({
    onActivate: () => {
      'worklet';
      cancelAnimation(zoom);
      cancelAnimation(centreProgress);
      pinchStartZoom.set(zoom.get());
    },
    onUpdate: (e) => {
      'worklet';
      const rawZoom = pinchStartZoom.get() * e.scale;
      const past = rawZoom < MIN_ZOOM || rawZoom > MAX_ZOOM;
      if (past && !pastZoomLimit.get()) scheduleOnRN(zoomLimitHaptic);
      pastZoomLimit.set(past);

      const prevRadius = radius.get();
      const nextZoom = rubberBandZoom(rawZoom);
      const nextRadius = baseRadius * nextZoom;
      zoom.set(nextZoom);

      // Keep the spot between the fingers in place, so the zoom heads where the
      // user is pinching: rotate it back to where it was on screen.
      const fx = e.focalX - cx;
      const fy = e.focalY - cy;
      const dist = Math.hypot(fx, fy);
      if (dist > 0 && dist < prevRadius && dist < nextRadius) {
        const angle = Math.asin(dist / prevRadius) - Math.asin(dist / nextRadius);
        const move = angle * nextRadius;
        orientation.set(
          quatApplyDrag(orientation.get(), (-fx / dist) * move, (-fy / dist) * move, nextRadius),
        );
      }
    },
    onDeactivate: () => {
      'worklet';
      pastZoomLimit.set(false);
      const current = zoom.get();
      const limited = clampZoom(current);
      if (limited !== current) zoom.set(withSpring(limited, ZOOM_SPRING));
    },
  });

  // Two-finger twist rolls the globe about its centre (e.g. to put north back up).
  const twist = useRotationGesture({
    onActivate: () => {
      'worklet';
      cancelAnimation(centreProgress);
    },
    onUpdate: (e) => {
      'worklet';
      orientation.set(quatApplyTwist(orientation.get(), e.rotationChange));
    },
  });

  // Tap: work out the tapped point on the sphere here (it needs the current
  // orientation), then find the country on the JS thread.
  const tap = useTapGesture({
    maxDistance: 10,
    onActivate: (e) => {
      'worklet';
      if (caughtSpin.get()) return;
      const r = radius.get();
      const vx = (e.x - cx) / r;
      const vy = (cy - e.y) / r;
      const d2 = vx * vx + vy * vy;
      if (d2 > 1) {
        // Off the globe: deselect.
        scheduleOnRN(selectCountry, null);
        return;
      }
      // Undo the projection (view → world uses the transposed rotation matrix).
      const vz = Math.sqrt(1 - d2);
      const m = matrix.get();
      const wx = m[0] * vx + m[3] * vy + m[6] * vz;
      const wy = m[1] * vx + m[4] * vy + m[7] * vz;
      const wz = m[2] * vx + m[5] * vy + m[8] * vz;
      const lon = (Math.atan2(wy, wx) * 180) / Math.PI;
      const lat = (Math.asin(Math.max(-1, Math.min(1, wz))) * 180) / Math.PI;
      scheduleOnRN(handleTap, lon, lat, r);
    },
  });

  const gesture = useSimultaneousGestures(pan, pinch, twist, tap);

  // --- Lighting ---
  // Light source and shading follow the globe as it grows.
  const highlight = useDerivedValue(() => ({
    x: cx - radius.get() * 0.35,
    y: cy - radius.get() * 0.4,
  }));
  const oceanGradientRadius = useDerivedValue(() => radius.get() * 1.6);
  const centre = { x: cx, y: cy };
  const backdropRadius = Math.max(width, height) * globeStyle.backdrop.radius;
  const haloRadius = useDerivedValue(() => radius.get() * (1 + globeStyle.halo.width));
  // The halo is off-screen once zoomed in; fade it out by GLOW_FADE_ZOOM.
  const glowOpacity = useDerivedValue(() =>
    Math.min(1, Math.max(0, (GLOW_FADE_ZOOM - zoom.get()) / (GLOW_FADE_ZOOM - MIN_ZOOM))),
  );
  // Light comes from the top-left of the screen. Shading runs across the sphere
  // from the lit corner to the shadowed one.
  const shadeStart = useDerivedValue(() => ({
    x: cx - radius.get() * 0.7,
    y: cy - radius.get() * 0.7,
  }));
  const shadeEnd = useDerivedValue(() => ({
    x: cx + radius.get() * 0.7,
    y: cy + radius.get() * 0.7,
  }));
  // Rim light / rim shadow: radial gradients centred off to one side, so they only
  // reach the far edge and form a crescent there.
  const rimLightCentre = useDerivedValue(() => ({
    x: cx + radius.get() * RIM_CENTRE_SHIFT,
    y: cy + radius.get() * RIM_CENTRE_SHIFT,
  }));
  const rimShadowCentre = useDerivedValue(() => ({
    x: cx - radius.get() * RIM_CENTRE_SHIFT,
    y: cy - radius.get() * RIM_CENTRE_SHIFT,
  }));
  const rimGradientRadius = useDerivedValue(() => radius.get() * RIM_REACH);
  // Land tint runs top to bottom of the sphere (in path units, as the land is drawn scaled).
  const landGradientStart = useDerivedValue(() => ({
    x: cx * PATH_SCALE,
    y: (cy - radius.get()) * PATH_SCALE,
  }));
  const landGradientEnd = useDerivedValue(() => ({
    x: cx * PATH_SCALE,
    y: (cy + radius.get()) * PATH_SCALE,
  }));

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
            {textureEffect && <Starfield width={width} height={height} />}

            {/* Soft spotlight behind the globe */}
            <Rect x={0} y={0} width={width} height={height}>
              <RadialGradient
                c={centre}
                r={backdropRadius}
                colors={[globeStyle.backdrop.inner, globeStyle.backdrop.mid, TRANSPARENT]}
                positions={[0, 0.5, 1]}
              />
            </Rect>

            {/* Atmosphere ring just outside the sphere (a gradient: no blur, so it's cheap) */}
            <Circle cx={cx} cy={cy} r={haloRadius} opacity={glowOpacity}>
              <RadialGradient
                c={centre}
                r={haloRadius}
                colors={[
                  globeStyle.halo.color,
                  globeStyle.halo.color,
                  globeStyle.halo.faint,
                  TRANSPARENT,
                ]}
                positions={HALO_STOPS}
              />
            </Circle>

            {textureEffect ? (
              <>
                {/* Textured globe: the sphere is drawn per pixel by a shader */}
                <TextureGlobeLayers
                  effect={textureEffect}
                  mode={textureMode}
                  textures={textureSet}
                  warmUp={textures.high}
                  clouds={textures.clouds}
                  zoom={zoom}
                  width={width}
                  height={height}
                  countries={countries}
                  visitedIds={visitedIds}
                  selectedIndex={selectedIndex}
                  fadeIndex={fadeIndex}
                  fadeProgress={fadeProgress}
                  matrix={matrix}
                  radius={radius}
                  cx={cx}
                  cy={cy}
                />
                {/* Mapping test: the app's country outlines, to check they line up */}
                {GLOBE_MAPPING_TEST && (
                  <Path
                    path={landPath}
                    color={textureGlobeStyle.test.outline}
                    style="stroke"
                    strokeWidth={1 * PATH_SCALE}
                    strokeJoin="round"
                    transform={LAND_PATH_TRANSFORM}
                  />
                )}
              </>
            ) : (
              <>
                {/* Ocean, lit from the top-left */}
                <Circle cx={cx} cy={cy} r={radius}>
                  <RadialGradient
                    c={highlight}
                    r={oceanGradientRadius}
                    colors={[globeStyle.ocean.light, globeStyle.ocean.mid, globeStyle.ocean.deep]}
                    positions={[0, 0.45, 1]}
                  />
                </Circle>

                {/* Land tops (grey, green, and the country being toggled) drawn into one layer.
                  The layer's filter adds, beneath them, the darker sides (shifted copies)
                  and the shallow-water glow, so the land is only drawn once. */}
                <Group clip={sphereClip}>
                  <Group layer={landLayer}>
                    <Path path={landPath} fillType="evenOdd" transform={LAND_PATH_TRANSFORM}>
                      <LinearGradient
                        start={landGradientStart}
                        end={landGradientEnd}
                        colors={[globeStyle.land.top, globeStyle.land.bottom]}
                      />
                    </Path>
                    <Path
                      path={visitedPath}
                      color={globeColors.visited}
                      fillType="evenOdd"
                      transform={LAND_PATH_TRANSFORM}
                    />
                    <Path
                      path={fadePath}
                      color={fadeColor}
                      fillType="evenOdd"
                      transform={LAND_PATH_TRANSFORM}
                    />
                  </Group>
                </Group>

                {/* Borders and lit edges: grey everywhere, then green over visited countries */}
                <Path
                  path={landPath}
                  color={globeColors.landBorder}
                  style="stroke"
                  strokeWidth={0.6 * PATH_SCALE}
                  strokeJoin="round"
                  transform={LAND_PATH_TRANSFORM}
                />
                <Path
                  path={landPath}
                  color={globeStyle.outlineHighlight.color}
                  style="stroke"
                  strokeWidth={globeStyle.outlineHighlight.width * PATH_SCALE}
                  strokeJoin="round"
                  transform={HIGHLIGHT_TRANSFORM}
                />
                <Path
                  path={visitedPath}
                  color={globeColors.visitedBorder}
                  style="stroke"
                  strokeWidth={0.6 * PATH_SCALE}
                  strokeJoin="round"
                  transform={LAND_PATH_TRANSFORM}
                />
              </>
            )}

            {/* Selected country (vector globe): lightened, with a glowing outline. The
                textured globe draws its own selection glow. */}
            {drawsVector && (
              <>
                <Path
                  path={selectedPath}
                  color={globeColors.selectedTint}
                  fillType="evenOdd"
                  transform={LAND_PATH_TRANSFORM}
                />
                <Path
                  path={selectedPath}
                  color={globeColors.selectedGlow}
                  style="stroke"
                  strokeWidth={3 * PATH_SCALE}
                  strokeJoin="round"
                  transform={LAND_PATH_TRANSFORM}>
                  <BlurMask blur={4 * PATH_SCALE} style="normal" />
                </Path>
                <Path
                  path={selectedPath}
                  color={globeColors.selectedOutline}
                  style="stroke"
                  strokeWidth={1.5 * PATH_SCALE}
                  strokeJoin="round"
                  transform={LAND_PATH_TRANSFORM}
                />
              </>
            )}

            {!textureEffect && (
              <>
                {/* Lighting over everything: light top-left to shade bottom-right */}
                <Circle cx={cx} cy={cy} r={radius}>
                  <LinearGradient
                    start={shadeStart}
                    end={shadeEnd}
                    colors={[globeStyle.lighting.lit, TRANSPARENT, globeStyle.lighting.shade]}
                  />
                </Circle>

                {/* Rim shadow: a soft dark crescent along the bottom-right edge */}
                <Circle cx={cx} cy={cy} r={radius}>
                  <RadialGradient
                    c={rimShadowCentre}
                    r={rimGradientRadius}
                    colors={[TRANSPARENT, TRANSPARENT, globeStyle.lighting.rimShadow]}
                    positions={[0, 1 - globeStyle.lighting.rimShadowWidth / RIM_REACH, 1]}
                  />
                </Circle>

                {/* Rim light: a bright crescent along the top-left edge */}
                <Circle cx={cx} cy={cy} r={radius}>
                  <RadialGradient
                    c={rimLightCentre}
                    r={rimGradientRadius}
                    colors={[TRANSPARENT, TRANSPARENT, globeStyle.lighting.rimLight]}
                    positions={[0, 1 - globeStyle.lighting.rimLightWidth / RIM_REACH, 1]}
                  />
                </Circle>

                {/* Thin soft rim */}
                <Circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  color={globeStyle.rim}
                  style="stroke"
                  strokeWidth={1}
                />
              </>
            )}
          </Canvas>
        </View>
      </GestureDetector>
      {SHOW_PERF && <PerfReadout buildMs={buildMs} zoom={zoom} />}
      <CountryBubble
        anchor={bubbleAnchor}
        containerWidth={width}
        country={selectedCountry}
        onToggleVisited={toggleSelectedVisited}
      />
    </View>
  );
}

type PerfReadoutProps = {
  buildMs: { get: () => number };
  zoom: { get: () => number };
};

/** Shows UI-thread fps, globe path build time and zoom. Measured on the UI thread. */
function PerfReadout({ buildMs, zoom }: PerfReadoutProps) {
  const fps = useSharedValue(60);
  const [text, setText] = useState('');

  useFrameCallback((frame) => {
    const dt = frame.timeSincePreviousFrame;
    if (dt) fps.set(fps.get() * 0.95 + (1000 / dt) * 0.05);
  });

  useEffect(() => {
    const id = setInterval(() => {
      setText(
        `${BUILD_LABEL} · ${Math.round(fps.get())} fps · path ${buildMs.get().toFixed(1)} ms · ${zoom.get().toFixed(1)}×`,
      );
    }, 500);
    return () => clearInterval(id);
  }, [fps, buildMs, zoom]);

  return (
    <Text style={styles.perf} pointerEvents="none">
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  perf: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    fontSize: 10,
    color: '#7CFFB2',
    fontVariant: ['tabular-nums'],
  },
});
