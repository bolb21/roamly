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
 * Appends ring `ri`'s path commands (path units) to `out`: nothing if it's wholly
 * behind the globe or off the canvas. Shared by buildGlobePath and buildGlobeLand.
 */
function emitGlobeRing(
  geo: GlobeGeometry,
  ri: number,
  rotation: number[],
  ox: number,
  oy: number,
  rr: number,
  maxX: number,
  maxY: number,
  out: string[],
): void {
  'worklet';
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = rotation;
  const pts = geo.points;
  // Back-face cull: the whole cap is behind the horizon.
  const c = ri * 3;
  const ccx = geo.ringCentres[c];
  const ccy = geo.ringCentres[c + 1];
  const ccz = geo.ringCentres[c + 2];
  const sinRadius = geo.ringSinRadius[ri];
  const centreDepth = m20 * ccx + m21 * ccy + m22 * ccz;
  if (centreDepth < -sinRadius) return;

  // Off-screen cull (matters when zoomed in): the whole cap is outside the canvas.
  if (sinRadius <= 1) {
    const reach = CAP_SCREEN_FACTOR * rr * sinRadius;
    const px = ox + rr * (m00 * ccx + m01 * ccy + m02 * ccz);
    const py = oy - rr * (m10 * ccx + m11 * ccy + m12 * ccz);
    if (px + reach < 0 || px - reach > maxX || py + reach < 0 || py - reach > maxY) return;
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
  if (first < 0) return;

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
  const out: string[] = [];
  // Work in path units from here on.
  const ox = cx * PATH_SCALE;
  const oy = cy * PATH_SCALE;
  const rr = r * PATH_SCALE;
  const maxX = width * PATH_SCALE;
  const maxY = height * PATH_SCALE;
  for (let ri = 0; ri < geo.ringStarts.length; ri++) {
    if (include !== null && !include(geo.ringCountry[ri])) continue;
    emitGlobeRing(geo, ri, rotation, ox, oy, rr, maxX, maxY, out);
  }
  // Nothing visible (e.g. zoomed in over open ocean): a valid path that draws nothing.
  return out.length > 0 ? out.join('') : 'M0 0';
}

/**
 * Close-up land, in one pass over the pre-cut pieces (each projected once):
 * [all land, visited countries (not the fading one), the fading country, the selected
 * country] as SVG paths in path units. `visited[i]` is true if country i is visited;
 * `fade` and `selected` are country indexes or -1.
 */
export function buildGlobeLand(
  geo: GlobeGeometry,
  rotation: number[],
  cx: number,
  cy: number,
  r: number,
  width: number,
  height: number,
  visited: boolean[],
  fade: number,
  selected: number,
): string[] {
  'worklet';
  const land: string[] = [];
  const visitedOut: string[] = [];
  const fadeOut: string[] = [];
  const selectedOut: string[] = [];
  const ox = cx * PATH_SCALE;
  const oy = cy * PATH_SCALE;
  const rr = r * PATH_SCALE;
  const maxX = width * PATH_SCALE;
  const maxY = height * PATH_SCALE;
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = rotation;
  const centres = geo.ringCentres;
  const sinRadii = geo.ringSinRadius;
  const ring: string[] = [];
  for (let ri = 0; ri < geo.ringStarts.length; ri++) {
    // Quick culls first (most pieces are off-screen when zoomed in); emitGlobeRing
    // repeats them, which is cheap for the few that pass.
    const c = ri * 3;
    const x = centres[c];
    const y = centres[c + 1];
    const z = centres[c + 2];
    const sinRadius = sinRadii[ri];
    if (m20 * x + m21 * y + m22 * z < -sinRadius) continue;
    if (sinRadius <= 1) {
      const reach = CAP_SCREEN_FACTOR * rr * sinRadius;
      const px = ox + rr * (m00 * x + m01 * y + m02 * z);
      if (px + reach < 0 || px - reach > maxX) continue;
      const py = oy - rr * (m10 * x + m11 * y + m12 * z);
      if (py + reach < 0 || py - reach > maxY) continue;
    }
    ring.length = 0;
    emitGlobeRing(geo, ri, rotation, ox, oy, rr, maxX, maxY, ring);
    if (ring.length === 0) continue;
    const text = ring.join('');
    const country = geo.ringCountry[ri];
    land.push(text);
    if (country === fade) fadeOut.push(text);
    else if (visited[country] === true) visitedOut.push(text);
    if (country === selected) selectedOut.push(text);
  }
  return [land, visitedOut, fadeOut, selectedOut].map((parts) =>
    parts.length > 0 ? parts.join('') : 'M0 0',
  );
}

/**
 * Builds the SVG path for line pieces (from buildBorderLines): like buildGlobePath,
 * but for open lines, which simply stop where they turn behind the globe.
 */
export function buildGlobeLines(
  geo: GlobeGeometry,
  rotation: number[],
  cx: number,
  cy: number,
  r: number,
  width: number,
  height: number,
): string {
  'worklet';
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = rotation;
  const pts = geo.points;
  const out: string[] = [];
  const ox = cx * PATH_SCALE;
  const oy = cy * PATH_SCALE;
  const rr = r * PATH_SCALE;
  const maxX = width * PATH_SCALE;
  const maxY = height * PATH_SCALE;

  for (let ri = 0; ri < geo.ringStarts.length; ri++) {
    // Skip pieces wholly behind the globe or off the canvas.
    const c = ri * 3;
    const ccx = geo.ringCentres[c];
    const ccy = geo.ringCentres[c + 1];
    const ccz = geo.ringCentres[c + 2];
    const sinRadius = geo.ringSinRadius[ri];
    if (m20 * ccx + m21 * ccy + m22 * ccz < -sinRadius) continue;
    if (sinRadius <= 1) {
      const reach = CAP_SCREEN_FACTOR * rr * sinRadius;
      const px = ox + rr * (m00 * ccx + m01 * ccy + m02 * ccz);
      const py = oy - rr * (m10 * ccx + m11 * ccy + m12 * ccz);
      if (px + reach < 0 || px - reach > maxX || py + reach < 0 || py - reach > maxY) continue;
    }

    let penDown = false;
    // Whether the current line has its 'l' yet: it's only written with the line's
    // second point, so a lone visible point never leaves an 'l' with nothing after it
    // (invalid path text, which makes Skia throw on the phone).
    let hasLine = false;
    let lastX = 0;
    let lastY = 0;
    const end = geo.ringEnds[ri];
    for (let k = geo.ringStarts[ri]; k < end; k++) {
      const i = k * 3;
      const X = pts[i];
      const Y = pts[i + 1];
      const Z = pts[i + 2];
      if (m20 * X + m21 * Y + m22 * Z <= 0) {
        penDown = false; // behind the globe
        continue;
      }
      const px = Math.round(ox + rr * (m00 * X + m01 * Y + m02 * Z));
      const py = Math.round(oy - rr * (m10 * X + m11 * Y + m12 * Z));
      if (!penDown) {
        out.push('M' + px + ' ' + py + ' ');
        penDown = true;
        hasLine = false;
      } else if (Math.abs(px - lastX) + Math.abs(py - lastY) >= MIN_STEP || k === end - 1) {
        out.push((hasLine ? '' : 'l') + (px - lastX) + ' ' + (py - lastY) + ' ');
        hasLine = true;
      } else {
        continue;
      }
      lastX = px;
      lastY = py;
    }
  }
  return out.length > 0 ? out.join('') : 'M0 0';
}

/** Land pieces in flat-map units (see getFlatMapCells in flatMap.ts). */
export type FlatGeometry = {
  /** x,y map units, flattened. */
  points: number[];
  ringStarts: number[];
  ringEnds: number[];
  /** Each ring's bounds in map units: minX, maxX, minY, maxY (flattened). */
  ringBox: number[];
  ringCountry: number[];
};

/**
 * Appends flat-map piece `ri`'s path commands (path units, screen = map × s + (ox, oy)
 * in path units) to `out`: nothing if it's wholly off the canvas.
 */
function emitFlatRing(
  geo: FlatGeometry,
  ri: number,
  s: number,
  ox: number,
  oy: number,
  maxX: number,
  maxY: number,
  out: string[],
): void {
  'worklet';
  const b = ri * 4;
  if (
    ox + geo.ringBox[b + 1] * s < 0 ||
    ox + geo.ringBox[b] * s > maxX ||
    oy + geo.ringBox[b + 3] * s < 0 ||
    oy + geo.ringBox[b + 2] * s > maxY
  ) {
    return;
  }
  const pts = geo.points;
  const start = geo.ringStarts[ri];
  const end = geo.ringEnds[ri];
  let lastX = Math.round(ox + pts[start * 2] * s);
  let lastY = Math.round(oy + pts[start * 2 + 1] * s);
  out.push('M' + lastX + ' ' + lastY + 'l');
  for (let k = start + 1; k < end; k++) {
    const px = Math.round(ox + pts[k * 2] * s);
    const py = Math.round(oy + pts[k * 2 + 1] * s);
    // The last point is always written, so there's never an 'l' with nothing after it.
    if (Math.abs(px - lastX) + Math.abs(py - lastY) >= MIN_STEP || k === end - 1) {
      out.push(px - lastX + ' ' + (py - lastY) + ' ');
      lastX = px;
      lastY = py;
    }
  }
  out.push('z');
}

/**
 * Close-up flat-map land (see buildGlobeLand), at screen = map × scale + (tx, ty):
 * [all land, visited, fading, selected] as SVG paths in path units.
 */
export function buildFlatLand(
  geo: FlatGeometry,
  scale: number,
  tx: number,
  ty: number,
  width: number,
  height: number,
  visited: boolean[],
  fade: number,
  selected: number,
): string[] {
  'worklet';
  const land: string[] = [];
  const visitedOut: string[] = [];
  const fadeOut: string[] = [];
  const selectedOut: string[] = [];
  const s = scale * PATH_SCALE;
  const ox = tx * PATH_SCALE;
  const oy = ty * PATH_SCALE;
  const maxX = width * PATH_SCALE;
  const maxY = height * PATH_SCALE;
  // The visible part of the map, in map units, for a quick cull.
  const left = -ox / s;
  const right = (maxX - ox) / s;
  const top = -oy / s;
  const bottom = (maxY - oy) / s;
  const box = geo.ringBox;
  const ring: string[] = [];
  for (let ri = 0; ri < geo.ringStarts.length; ri++) {
    const b = ri * 4;
    if (box[b + 1] < left || box[b] > right || box[b + 3] < top || box[b + 2] > bottom) continue;
    ring.length = 0;
    emitFlatRing(geo, ri, s, ox, oy, maxX, maxY, ring);
    if (ring.length === 0) continue;
    const text = ring.join('');
    const country = geo.ringCountry[ri];
    land.push(text);
    if (country === fade) fadeOut.push(text);
    else if (visited[country] === true) visitedOut.push(text);
    if (country === selected) selectedOut.push(text);
  }
  return [land, visitedOut, fadeOut, selectedOut].map((parts) =>
    parts.length > 0 ? parts.join('') : 'M0 0',
  );
}
