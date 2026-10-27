// Globe orientation as a unit quaternion [w, x, y, z].
//
// The quaternion rotates world vectors (x towards lon 0/lat 0, y towards
// lon 90°E, z towards the North Pole) into view space (x right, y up, z towards
// the viewer). There's no "up" lock: any orientation, including upside down, is
// valid. All functions are worklets so gestures can call them on the UI thread.
//
// ORDER MATTERS: the worklet Babel plugin turns each function into a variable
// that captures the helpers it calls at the moment it is defined (no hoisting).
// Always define a helper above the functions that use it.

export type Quat = readonly [number, number, number, number];

export function quatMultiply(a: Quat, b: Quat): Quat {
  'worklet';
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

export function quatNormalize(q: Quat): Quat {
  'worklet';
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

/** Rotation of `angle` radians about the unit axis (ax, ay, az). */
export function quatFromAxisAngle(ax: number, ay: number, az: number, angle: number): Quat {
  'worklet';
  const s = Math.sin(angle / 2);
  return [Math.cos(angle / 2), ax * s, ay * s, az * s];
}

/**
 * Rotates the globe as if the finger dragged its surface by (dx, dy) screen px,
 * trackball style: the axis lies in the screen plane, perpendicular to the drag,
 * and the angle is distance / radius so the surface keeps up with the finger.
 */
export function quatApplyDrag(q: Quat, dx: number, dy: number, radius: number): Quat {
  'worklet';
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return q;
  // Screen y points down, view y points up; the axis (dy, dx, 0) works out to
  // moving the front of the globe in the drag direction.
  const delta = quatFromAxisAngle(dy / dist, dx / dist, 0, dist / radius);
  return quatNormalize(quatMultiply(delta, q));
}

/**
 * Twists the globe about the line of sight by `angle` radians, clockwise on
 * screen (the convention of gesture-handler's rotation gesture).
 */
export function quatApplyTwist(q: Quat, angle: number): Quat {
  'worklet';
  // View z points at the viewer, so a positive angle about it is anticlockwise.
  const delta = quatFromAxisAngle(0, 0, 1, -angle);
  return quatNormalize(quatMultiply(delta, q));
}

/** Row-major 3x3 rotation matrix (world → view). */
export function quatToMatrix(q: Quat): number[] {
  'worklet';
  const [w, x, y, z] = q;
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - w * z),
    2 * (x * z + w * y),
    2 * (x * y + w * z),
    1 - 2 * (x * x + z * z),
    2 * (y * z - w * x),
    2 * (x * z - w * y),
    2 * (y * z + w * x),
    1 - 2 * (x * x + y * y),
  ];
}

function quatFromMatrix(m: number[]): Quat {
  'worklet';
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return quatNormalize([0.25 * s, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s]);
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return quatNormalize([(m21 - m12) / s, 0.25 * s, (m01 + m10) / s, (m02 + m20) / s]);
  }
  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return quatNormalize([(m02 - m20) / s, (m01 + m10) / s, 0.25 * s, (m12 + m21) / s]);
  }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return quatNormalize([(m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, 0.25 * s]);
}

/** Orientation with (lonDeg, latDeg) facing the viewer and north up. */
export function quatFromView(lonDeg: number, latDeg: number): Quat {
  'worklet';
  const a = (lonDeg * Math.PI) / 180;
  const p = (latDeg * Math.PI) / 180;
  // Rows are the local east, north and outward vectors at (lon, lat).
  const m = [
    -Math.sin(a), Math.cos(a), 0,
    -Math.sin(p) * Math.cos(a), -Math.sin(p) * Math.sin(a), Math.cos(p),
    Math.cos(p) * Math.cos(a), Math.cos(p) * Math.sin(a), Math.sin(p),
  ];
  return quatFromMatrix(m);
}

/**
 * Smallest rotation (applied on top of `q`) that brings the world point
 * (wx, wy, wz) to the centre of the view. Keeps the current roll, so the
 * globe doesn't spin north back up on its own.
 */
export function quatFaceFront(q: Quat, wx: number, wy: number, wz: number): Quat {
  'worklet';
  const m = quatToMatrix(q);
  const vx = m[0] * wx + m[1] * wy + m[2] * wz;
  const vy = m[3] * wx + m[4] * wy + m[5] * wz;
  const vz = m[6] * wx + m[7] * wy + m[8] * wz;
  // Axis = v × viewer direction (0, 0, 1); rotating v about it by the angle between them.
  const sin = Math.hypot(vx, vy);
  if (sin < 1e-9) {
    return vz > 0 ? q : quatNormalize(quatMultiply(quatFromAxisAngle(1, 0, 0, Math.PI), q));
  }
  const delta = quatFromAxisAngle(vy / sin, -vx / sin, 0, Math.atan2(sin, vz));
  return quatNormalize(quatMultiply(delta, q));
}

/** Spherical interpolation from `a` (t = 0) to `b` (t = 1) along the shorter path. */
export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  'worklet';
  let [bw, bx, by, bz] = b;
  let dot = a[0] * bw + a[1] * bx + a[2] * by + a[3] * bz;
  if (dot < 0) {
    // q and -q are the same orientation; flip to take the short way round.
    bw = -bw;
    bx = -bx;
    by = -by;
    bz = -bz;
    dot = -dot;
  }
  if (dot > 0.9995) {
    return quatNormalize([
      a[0] + (bw - a[0]) * t,
      a[1] + (bx - a[1]) * t,
      a[2] + (by - a[2]) * t,
      a[3] + (bz - a[3]) * t,
    ]);
  }
  const theta = Math.acos(dot);
  const sa = Math.sin((1 - t) * theta) / Math.sin(theta);
  const sb = Math.sin(t * theta) / Math.sin(theta);
  return [
    sa * a[0] + sb * bw,
    sa * a[1] + sb * bx,
    sa * a[2] + sb * by,
    sa * a[3] + sb * bz,
  ];
}
