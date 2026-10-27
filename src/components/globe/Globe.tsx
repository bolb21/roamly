import { BlurMask, Canvas, Circle, Path, RadialGradient } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  GestureDetector,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
} from 'react-native-gesture-handler';
import {
  cancelAnimation,
  useAnimatedReaction,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withDecay,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { getGlobeData } from '@/globe/globeData';
import { buildGlobePath, PATH_SCALE } from '@/globe/projection';
import { quatApplyDrag, quatFromView, quatToMatrix, type Quat } from '@/globe/rotation';
import {
  clampZoom,
  DETAIL_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  rubberBandZoom,
  zoomLimitHaptic,
} from '@/globe/zoom';
import { globeColors } from '@/theme';

type Props = {
  /** Size of the canvas, in px. The globe is centred in it. */
  width: number;
  height: number;
  /** Shared with the zoom buttons. 1 = whole globe fits (see src/globe/zoom.ts). */
  zoom: SharedValue<number>;
};

/** Starting view: centred over Europe/Africa, like the reference image. */
const INITIAL_VIEW = { lon: 15, lat: 25 };
/** Globe radius at zoom 1, as a share of the canvas's shorter side. Leaves room for the glow. */
const BASE_RADIUS_FRACTION = 0.423;
/** Momentum friction for withDecay (closer to 1 = longer spin). */
const DECELERATION = 0.997;
/** Spring used when a pinch is released past a zoom limit. */
const ZOOM_SPRING = { damping: 18, stiffness: 180 };
/** The outer glow fades out by this zoom (it's off-screen anyway, and blur is costly when large). */
const GLOW_FADE_ZOOM = 1.6;
/** Overlay with UI-thread fps and per-frame path build time. Set to false before demos. */
const SHOW_PERF = true;

const LAND_PATH_TRANSFORM = [{ scale: 1 / PATH_SCALE }];

/**
 * Interactive orthographic globe drawn with Skia.
 *
 * All per-frame work (gestures, momentum, zoom, projecting the border points
 * and building the path) runs on the UI thread, so the JS thread being busy
 * can't make rotation stutter.
 */
export function Globe({ width, height, zoom }: Props) {
  const { simplified, detailed } = getGlobeData();

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

  // Momentum: after release the globe keeps "dragging" along the release
  // direction. `spinDistance` (px) decays smoothly and each change is applied
  // as an incremental trackball rotation, so momentum also passes over poles.
  const spinDistance = useSharedValue(0);
  const spinDirection = useSharedValue({ x: 0, y: 0 });

  useAnimatedReaction(
    () => spinDistance.get(),
    (current, previous) => {
      if (previous === null || current === previous) return;
      const step = current - previous;
      const dir = spinDirection.get();
      orientation.set(quatApplyDrag(orientation.get(), dir.x * step, dir.y * step, radius.get()));
    },
  );

  const landPath = useDerivedValue(() => {
    const t0 = performance.now();
    // Simplified outlines are plenty at full-globe size; switch to full detail when zoomed in.
    const geo = zoom.get() >= DETAIL_ZOOM ? detailed : simplified;
    const path = buildGlobePath(
      geo,
      quatToMatrix(orientation.get()),
      cx,
      cy,
      radius.get(),
      width,
      height,
      null,
    );
    if (SHOW_PERF) {
      buildMs.set(buildMs.get() * 0.9 + (performance.now() - t0) * 0.1);
    }
    return path;
  });

  const pan = usePanGesture({
    onBegin: () => {
      'worklet';
      // Touching a spinning globe catches it.
      cancelAnimation(spinDistance);
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
      spinDistance.set(withDecay({ velocity: speed, deceleration: DECELERATION }));
    },
  });

  // Zoom the fingers asked for, before rubber-banding.
  const pinchStartZoom = useSharedValue(MIN_ZOOM);
  const pastZoomLimit = useSharedValue(false);

  const pinch = usePinchGesture({
    onActivate: () => {
      'worklet';
      cancelAnimation(zoom);
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

  const gesture = useSimultaneousGestures(pan, pinch);

  // Light source and shading follow the globe as it grows.
  const highlight = useDerivedValue(() => ({
    x: cx - radius.get() * 0.35,
    y: cy - radius.get() * 0.4,
  }));
  const oceanGradientRadius = useDerivedValue(() => radius.get() * 1.6);
  const shadingGradientRadius = useDerivedValue(() => radius.get() * 1.5);
  const glowRadius = useDerivedValue(() => baseRadius * Math.min(zoom.get(), GLOW_FADE_ZOOM));
  const glowOpacity = useDerivedValue(() =>
    Math.min(1, Math.max(0, (GLOW_FADE_ZOOM - zoom.get()) / (GLOW_FADE_ZOOM - MIN_ZOOM))),
  );

  return (
    <View>
      <GestureDetector gesture={gesture}>
        <View>
          <Canvas style={{ width, height }}>
            {/* Outer glow */}
            <Circle cx={cx} cy={cy} r={glowRadius} color={globeColors.glow} opacity={glowOpacity}>
              <BlurMask blur={baseRadius * 0.12} style="outer" />
            </Circle>

            {/* Ocean, lit from the top-left */}
            <Circle cx={cx} cy={cy} r={radius}>
              <RadialGradient
                c={highlight}
                r={oceanGradientRadius}
                colors={[globeColors.oceanLight, globeColors.ocean, globeColors.oceanDeep]}
              />
            </Circle>

            {/* Countries and borders share one path */}
            <Path
              path={landPath}
              color={globeColors.land}
              fillType="evenOdd"
              transform={LAND_PATH_TRANSFORM}
            />
            <Path
              path={landPath}
              color={globeColors.landBorder}
              style="stroke"
              strokeWidth={0.6 * PATH_SCALE}
              strokeJoin="round"
              transform={LAND_PATH_TRANSFORM}
            />

            {/* Sphere shading: soft highlight, darker limb */}
            <Circle cx={cx} cy={cy} r={radius}>
              <RadialGradient
                c={highlight}
                r={shadingGradientRadius}
                colors={['rgba(255,255,255,0.12)', 'rgba(0,0,0,0)', 'rgba(0,8,40,0.5)']}
                positions={[0, 0.45, 1]}
              />
            </Circle>

            {/* Electric-blue rim */}
            <Circle
              cx={cx}
              cy={cy}
              r={radius}
              color={globeColors.rim}
              style="stroke"
              strokeWidth={1.5}
            />
          </Canvas>
        </View>
      </GestureDetector>
      {SHOW_PERF && <PerfReadout buildMs={buildMs} zoom={zoom} />}
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
        `${Math.round(fps.get())} fps · path ${buildMs.get().toFixed(1)} ms · ${zoom.get().toFixed(1)}×`,
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
