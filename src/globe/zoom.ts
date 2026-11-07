// Globe zoom limits and rubber-band maths. Zoom multiplies the globe's base
// radius: 1 = whole globe fits the screen.
//
// Functions are worklets so the pinch gesture can call them on the UI thread.
// Define helpers above the functions that use them (see rotation.ts).

import * as Haptics from 'expo-haptics';
import { withTiming, type SharedValue } from 'react-native-reanimated';

export const MIN_ZOOM = 1;
/** Far enough in to tap the smallest island countries (Andorra, Aruba, Grenada). */
export const MAX_ZOOM = 30;
/** From this zoom up, the globe draws the full-detail country outlines. */
export const DETAIL_ZOOM = 2;
/** How far past a limit the rubber band can stretch, in log-zoom (0.25 ≈ 22% smaller). */
const RUBBER_BAND = 0.25;
/** Each zoom button press multiplies (or divides) the zoom by this. */
const BUTTON_STEP = 2;

export function clampZoom(zoom: number): number {
  'worklet';
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Within the limits, returns `rawZoom` unchanged. Past a limit, the result moves
 * less and less the further the fingers go, and never passes RUBBER_BAND.
 */
export function rubberBandZoom(rawZoom: number): number {
  'worklet';
  if (rawZoom < MIN_ZOOM) {
    const over = Math.log(MIN_ZOOM / rawZoom);
    return MIN_ZOOM * Math.exp((-RUBBER_BAND * over) / (over + RUBBER_BAND));
  }
  if (rawZoom > MAX_ZOOM) {
    const over = Math.log(rawZoom / MAX_ZOOM);
    return MAX_ZOOM * Math.exp((RUBBER_BAND * over) / (over + RUBBER_BAND));
  }
  return rawZoom;
}

/** Light tap felt when a zoom limit is hit. Runs on the JS thread. */
export function zoomLimitHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export type ZoomLimits = { min: number; max: number };

/**
 * Flat map zoom: 1 = the whole map fits on screen (it opens like this); 80 reaches the
 * smallest island countries.
 */
export const MAP_ZOOM: ZoomLimits = { min: 1, max: 80 };

/**
 * Zoom buttons: animate one step in (`direction` 1) or out (-1). Uses the globe's
 * limits unless others are given.
 */
export function stepZoom(
  zoom: SharedValue<number>,
  direction: 1 | -1,
  limits: ZoomLimits = { min: MIN_ZOOM, max: MAX_ZOOM },
) {
  const target = Math.min(limits.max, Math.max(limits.min, zoom.get() * BUTTON_STEP ** direction));
  if (Math.abs(target - zoom.get()) < 0.01) {
    zoomLimitHaptic();
    return;
  }
  zoom.set(withTiming(target, { duration: 300 }));
}
