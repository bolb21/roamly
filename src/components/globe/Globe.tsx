import { BlurMask, Canvas, Circle, Path, RadialGradient, vec } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  useAnimatedReaction,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withDecay,
} from 'react-native-reanimated';

import { getGlobeData } from '@/globe/globeData';
import { buildGlobePath, PATH_SCALE } from '@/globe/projection';
import { quatApplyDrag, quatFromView, quatToMatrix, type Quat } from '@/globe/rotation';
import { globeColors } from '@/theme';

type Props = {
  /** Width and height of the square canvas, in px. */
  size: number;
};

/** Starting view: centred over Europe/Africa, like the reference image. */
const INITIAL_VIEW = { lon: 15, lat: 25 };
/** Momentum friction for withDecay (closer to 1 = longer spin). */
const DECELERATION = 0.997;
/** Overlay with UI-thread fps and per-frame path build time. Set to false before demos. */
const SHOW_PERF = true;

const LAND_PATH_TRANSFORM = [{ scale: 1 / PATH_SCALE }];

/**
 * Interactive orthographic globe drawn with Skia.
 *
 * All per-frame work (gesture handling, momentum, projecting ~5k border points
 * and building the path) runs on the UI thread, so the JS thread being busy
 * can't make rotation stutter.
 */
export function Globe({ size }: Props) {
  const { simplified } = getGlobeData();

  const cx = size / 2;
  const cy = size / 2;
  // Leave a margin so the glow isn't clipped by the canvas.
  const radius = (size / 2) * 0.9;

  // Computed once on mount (not at module load) so importing this file has no side effects.
  const [initialOrientation] = useState(() => quatFromView(INITIAL_VIEW.lon, INITIAL_VIEW.lat));
  const orientation = useSharedValue<Quat>(initialOrientation);
  const buildMs = useSharedValue(0);

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
      orientation.set(quatApplyDrag(orientation.get(), dir.x * step, dir.y * step, radius));
    },
  );

  const landPath = useDerivedValue(() => {
    const t0 = performance.now();
    const path = buildGlobePath(
      simplified,
      quatToMatrix(orientation.get()),
      cx,
      cy,
      radius,
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
      orientation.set(quatApplyDrag(orientation.get(), e.changeX, e.changeY, radius));
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

  const highlight = vec(cx - radius * 0.35, cy - radius * 0.4);

  return (
    <View>
      <GestureDetector gesture={pan}>
        <View>
          <Canvas style={{ width: size, height: size }}>
            {/* Outer glow */}
            <Circle cx={cx} cy={cy} r={radius} color={globeColors.glow}>
              <BlurMask blur={radius * 0.12} style="outer" />
            </Circle>

            {/* Ocean, lit from the top-left */}
            <Circle cx={cx} cy={cy} r={radius}>
              <RadialGradient
                c={highlight}
                r={radius * 1.6}
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
                r={radius * 1.5}
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
      {SHOW_PERF && <PerfReadout buildMs={buildMs} />}
    </View>
  );
}

type PerfReadoutProps = {
  buildMs: { get: () => number };
};

/** Shows UI-thread fps and globe path build time. Measured on the UI thread. */
function PerfReadout({ buildMs }: PerfReadoutProps) {
  const fps = useSharedValue(60);
  const [text, setText] = useState('');

  useFrameCallback((frame) => {
    const dt = frame.timeSincePreviousFrame;
    if (dt) fps.set(fps.get() * 0.95 + (1000 / dt) * 0.05);
  });

  useEffect(() => {
    const id = setInterval(() => {
      setText(`${Math.round(fps.get())} fps · path ${buildMs.get().toFixed(1)} ms`);
    }, 500);
    return () => clearInterval(id);
  }, [fps, buildMs]);

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
    top: 0,
    fontSize: 10,
    color: '#7CFFB2',
    fontVariant: ['tabular-nums'],
  },
});
