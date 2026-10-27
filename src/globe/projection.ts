// Orthographic globe projection that runs as a Reanimated worklet on the UI
// thread, so dragging never waits on the JS thread.
//
// Rotation is a row-major 3x3 world → view matrix (see rotation.ts), so any
// orientation works, including over the poles. Each frame we rotate every point,
// skip rings that are entirely on the far side, clip rings at the horizon
// (filling the gap with an arc along the globe's edge), and emit one SVG path
// string that Skia draws in a single native call.
//
// Performance notes (measured, see docs/globe.md):
// - Coordinates are emitted as integers in units of 1/PATH_SCALE px; integer to
//   string conversion is much cheaper than decimals. Draw the path with
//   `transform={[{ scale: 1 / PATH_SCALE }]}`.
// - Points use relative `l` commands with implicit repeats to keep strings short.
// - Points closer than MIN_STEP to the previous one are dropped.

export type GlobeGeometry = {
  /** x,y,z unit vectors, flattened. */
  points: number[];
  /** Ring i uses points [ringStarts[i], ringEnds[i]) (indices are per point, not per float). */
  ringStarts: number[];
  ringEnds: number[];
  /** Bounding-cap centre per ring (x,y,z flattened). */
  ringCentres: number[];
  /** sin(angular radius) of each ring's bounding cap; >1 means never cull. */
  ringSinRadius: number[];
  ringCountry: number[];
};

/** Path units per screen pixel. */
export const PATH_SCALE = 4;
/** Spacing (radians) of points added along the horizon when a ring is clipped. */
const LIMB_STEP = 0.12;
/** Points closer than this (path units, Manhattan) to the previous one are dropped. */
const MIN_STEP = 1.2 * PATH_SCALE;
/**
 * A cap with sin(angular radius) = s projects to within 1.42 · r · s of its
 * projected centre (the chord 2·sin(ρ/2) is at most √2·sin(ρ) for ρ ≤ 90°).
 */
const CAP_SCREEN_FACTOR = 1.42;

/**
 * Builds the SVG path for every ring whose country passes `include`.
 * `cx`, `cy`, `r` are in screen pixels; `width` × `height` is the visible canvas,
 * and rings wholly outside it are skipped. Pass `include = null` to draw all countries.
 */
export function buildGlobePath(
  geo: GlobeGeometry,
  rotation: number[],
  cx: number,
  cy: number,
  r: number,
  width: number,
  height: number,
  include: ((countryIndex: number) => boolean) | null,
): string {
  'worklet';
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = rotation;
  const pts = geo.points;
  const out: string[] = [];

  // Work in path units from here on.
  const ox = cx * PATH_SCALE;
  const oy = cy * PATH_SCALE;
  const rr = r * PATH_SCALE;
  const maxX = width * PATH_SCALE;
  const maxY = height * PATH_SCALE;

  for (let ri = 0; ri < geo.ringStarts.length; ri++) {
    if (include !== null && !include(geo.ringCountry[ri])) continue;

    // Back-face cull: the whole cap is behind the horizon.
    const c = ri * 3;
    const ccx = geo.ringCentres[c];
    const ccy = geo.ringCentres[c + 1];
    const ccz = geo.ringCentres[c + 2];
    const sinRadius = geo.ringSinRadius[ri];
    const centreDepth = m20 * ccx + m21 * ccy + m22 * ccz;
    if (centreDepth < -sinRadius) continue;

    // Off-screen cull (matters when zoomed in): the whole cap is outside the canvas.
    if (sinRadius <= 1) {
      const reach = CAP_SCREEN_FACTOR * rr * sinRadius;
      const px = ox + rr * (m00 * ccx + m01 * ccy + m02 * ccz);
      const py = oy - rr * (m10 * ccx + m11 * ccy + m12 * ccz);
      if (px + reach < 0 || px - reach > maxX || py + reach < 0 || py - reach > maxY) continue;
    }

    const start = geo.ringStarts[ri];
    const n = geo.ringEnds[ri] - start;

    // Start from a point facing the viewer so every hidden stretch has a
    // matching exit and entry.
    let first = -1;
    for (let k = 0; k < n; k++) {
      const i = (start + k) * 3;
      const d = m20 * pts[i] + m21 * pts[i + 1] + m22 * pts[i + 2];
      if (d > 0) {
        first = k;
        break;
      }
    }
    if (first < 0) continue;

    let prevX = 0;
    let prevY = 0;
    let prevD = 0;
    // Last emitted point, as rounded integers (relative moves are exact, no drift).
    let lastX = 0;
    let lastY = 0;
    let exitAngle = 0;

    for (let k = 0; k <= n; k++) {
      const i = (start + ((first + k) % n)) * 3;
      const X = pts[i];
      const Y = pts[i + 1];
      const Z = pts[i + 2];
      const sx = m00 * X + m01 * Y + m02 * Z;
      const sy = m10 * X + m11 * Y + m12 * Z;
      const d = m20 * X + m21 * Y + m22 * Z;

      if (k === 0) {
        lastX = Math.round(ox + rr * sx);
        lastY = Math.round(oy - rr * sy);
        out.push('M' + lastX + ' ' + lastY + 'l');
      } else if (d > 0 && prevD > 0) {
        const px = Math.round(ox + rr * sx);
        const py = Math.round(oy - rr * sy);
        if (Math.abs(px - lastX) + Math.abs(py - lastY) >= MIN_STEP || k === n) {
          out.push(px - lastX + ' ' + (py - lastY) + ' ');
          lastX = px;
          lastY = py;
        }
      } else if (d <= 0 && prevD > 0) {
        // Leaving the visible side: stop at the horizon.
        const t = prevD / (prevD - d);
        exitAngle = Math.atan2(prevY + (sy - prevY) * t, prevX + (sx - prevX) * t);
        const px = Math.round(ox + rr * Math.cos(exitAngle));
        const py = Math.round(oy - rr * Math.sin(exitAngle));
        out.push(px - lastX + ' ' + (py - lastY) + ' ');
        lastX = px;
        lastY = py;
      } else if (d > 0 && prevD <= 0) {
        // Coming back: follow the horizon (shorter way) to the entry point.
        const t = prevD / (prevD - d);
        const entryAngle = Math.atan2(prevY + (sy - prevY) * t, prevX + (sx - prevX) * t);
        let delta = entryAngle - exitAngle;
        if (delta > Math.PI) delta -= 2 * Math.PI;
        if (delta < -Math.PI) delta += 2 * Math.PI;
        const steps = Math.ceil(Math.abs(delta) / LIMB_STEP);
        for (let s = 1; s <= steps; s++) {
          const a = exitAngle + (delta * s) / steps;
          const px = Math.round(ox + rr * Math.cos(a));
          const py = Math.round(oy - rr * Math.sin(a));
          out.push(px - lastX + ' ' + (py - lastY) + ' ');
          lastX = px;
          lastY = py;
        }
        const px = Math.round(ox + rr * sx);
        const py = Math.round(oy - rr * sy);
        out.push(px - lastX + ' ' + (py - lastY) + ' ');
        lastX = px;
        lastY = py;
      }
      // Both hidden: draw nothing.

      prevX = sx;
      prevY = sy;
      prevD = d;
    }
    out.push('z');
  }

  // Nothing visible (e.g. zoomed in over open ocean): a valid path that draws nothing.
  return out.length > 0 ? out.join('') : 'M0 0';
}
