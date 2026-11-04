// SkSL shaders for the textured globe (see TextureGlobeLayers.tsx).
//
// For each pixel inside the sphere the shader works out the 3D point on the
// globe facing the viewer, turns it back into world coordinates with the globe's
// current rotation, converts that to longitude/latitude, and colours the pixel
// from it. World coordinates match src/globe/geometry.ts: x = cos(lat)·cos(lon),
// y = cos(lat)·sin(lon), z = sin(lat).

import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

/** Shared start of every globe shader: sphere maths and rotation uniforms. */
const SPHERE = `
uniform float2 center;
uniform float radius;
// Rows of the world → view rotation matrix (src/globe/rotation.ts).
uniform float3 row0;
uniform float3 row1;
uniform float3 row2;

const float PI = 3.14159265;

// Screen point → point on the unit sphere in view space (x right, y up, z towards
// the viewer). Returns z < 0 outside the sphere.
float3 viewPoint(float2 p) {
  float2 v = (p - center) / radius;
  v.y = -v.y;
  float r2 = dot(v, v);
  if (r2 > 1.0) return float3(0.0, 0.0, -1.0);
  return float3(v, sqrt(1.0 - r2));
}

// View space → world space (the transpose of the world → view rotation).
float3 toWorld(float3 v) {
  return v.x * row0 + v.y * row1 + v.z * row2;
}

// 1 inside the sphere, 0 outside, with a one-pixel soft edge.
float edgeAlpha(float2 p) {
  return clamp(radius - length(p - center), 0.0, 1.0);
}
`;

/**
 * Stage 2 mapping test: a 15° checkerboard with the equator and prime meridian
 * drawn as lines, and markers at two known places.
 */
const MAPPING_TEST = `${SPHERE}
uniform float3 markerA;
uniform float3 markerB;
uniform float4 lightColor;
uniform float4 darkColor;
uniform float4 lineColor;
uniform float4 markerAColor;
uniform float4 markerBColor;

half4 main(float2 p) {
  float alpha = edgeAlpha(p);
  if (alpha <= 0.0) return half4(0.0);
  float3 v = viewPoint(p);
  if (v.z < 0.0) v = float3(normalize(v.xy), 0.0);
  float3 w = toWorld(v);
  float lon = atan(w.y, w.x);
  float lat = asin(clamp(w.z, -1.0, 1.0));

  float cell = PI / 12.0;
  float checker = mod(floor(lon / cell) + floor(lat / cell), 2.0);
  float3 color = mix(lightColor.rgb, darkColor.rgb, checker);

  // About 1.5 px wide at the centre of the globe.
  float line = 1.5 / radius;
  if (abs(lat) < line || abs(lon) < line) color = lineColor.rgb;
  if (dot(w, markerA) > cos(0.035)) color = markerAColor.rgb;
  if (dot(w, markerB) > cos(0.035)) color = markerBColor.rgb;

  // Simple shading so the sphere reads as round.
  color *= 0.55 + 0.45 * v.z;
  return half4(half3(color * alpha), half(alpha));
}
`;

/**
 * Land, shared by the globe and the flat map.
 * - `earth`: red = shaded relief (0.5 = flat), green = land mask, blue = ocean depth
 *   (0 = shore, 1 = 7 km). From scripts/build-globe-textures.mjs.
 * - `ids`: country id per pixel (red × 255; 0 = sea, app country index + 1, 255 = land
 *   not in the app's list). Sampled without smoothing so ids never blend.
 * - `palette`: 256 × 1; pixel `id` holds that country's visited colour, alpha 1 if
 *   visited and 0 if not.
 * Both textures are drawn into the same earthSize space whatever their resolution.
 */
const LAND = `
uniform shader earth;
uniform shader ids;
uniform shader palette;
uniform float2 earthSize;

uniform float4 landColor;
uniform float reliefMin;
uniform float reliefRange;
uniform float tintBase;
uniform float tintRelief;
uniform float4 borderColor;
uniform float borderStrength;
uniform float fadeId;
uniform float fadeAmount;
uniform float4 fadeColor;
uniform float selectedId;
uniform float selectedBrighten;
uniform float4 glowColor;
uniform float glowWidth;
uniform float glowStrength;
uniform float edgeSoftness;

const float PI_L = 3.14159265;

float countryAt(float2 uv) {
  return floor(ids.eval(uv).r * 255.0 + 0.5);
}

// A country's visited colour (rgb) and how visited it is (a, 0–1).
float4 tintOf(float id) {
  if (id < 0.5 || id > 254.5) return float4(0.0);
  if (abs(id - fadeId) < 0.5) return float4(fadeColor.rgb, fadeAmount);
  half4 c = palette.eval(float2(id + 0.5, 0.5));
  return c.a > 0.0 ? float4(float3(c.rgb) / float(c.a), float(c.a)) : float4(0.0);
}

// Land colour at earth-space uv (rgb) and the selection glow there (a).
// perPx is the size of one screen pixel in earth-space units (x and y).
float4 landAt(float2 uv, float relief, float2 perPx) {
  // Four country samples about a pixel apart: their colours are averaged so colour
  // boundaries look soft, and where they disagree there's a border. Spacing them in
  // screen pixels keeps borders the same thin width at any zoom.
  float2 s = perPx * edgeSoftness;
  float id0 = countryAt(uv + float2(-s.x, -s.y));
  float id1 = countryAt(uv + float2(s.x, -s.y));
  float id2 = countryAt(uv + float2(-s.x, s.y));
  float id3 = countryAt(uv + float2(s.x, s.y));
  float4 t0 = tintOf(id0);
  float4 t1 = tintOf(id1);
  float4 t2 = tintOf(id2);
  float4 t3 = tintOf(id3);
  float visited = (t0.a + t1.a + t2.a + t3.a) * 0.25;
  float3 tint = (t0.rgb * t0.a + t1.rgb * t1.a + t2.rgb * t2.a + t3.rgb * t3.a)
    / max(t0.a + t1.a + t2.a + t3.a, 0.0001);

  // Grey relief, or the visited colour with the relief showing through.
  float3 grey = landColor.rgb * (reliefMin + reliefRange * relief);
  float3 coloured = tint * (tintBase + tintRelief * relief);
  float3 ground = mix(grey, coloured, visited);

  float lowest = min(min(id0, id1), min(id2, id3));
  float highest = max(max(id0, id1), max(id2, id3));
  if (lowest > 0.5 && highest > lowest) {
    ground = mix(ground, borderColor.rgb, borderColor.a * borderStrength);
  }

  // Selected country: brighter inside, with a glow along its outline.
  float glow = 0.0;
  if (selectedId > 0.5) {
    float inside = (float(id0 == selectedId) + float(id1 == selectedId)
      + float(id2 == selectedId) + float(id3 == selectedId)) * 0.25;
    ground += selectedBrighten * inside;
    // Share of a ring of samples that are the selected country: near its outline
    // that's between 0 and 1, so the glow hugs the border.
    float ring = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * (PI_L / 4.0);
      ring += float(countryAt(uv + float2(cos(a), sin(a)) * perPx * glowWidth) == selectedId);
    }
    ring *= 0.125;
    glow = inside > 0.5 ? 1.0 - ring : ring;
    glow = clamp(glow * 2.0, 0.0, 1.0) * glowStrength;
  }
  return float4(ground, glow);
}
`;

/**
 * The planet: land (see LAND) and sea on a lit sphere, with clouds. Lighting
 * is in screen space: light from the top-left, a lifted shadow side, a broad sun
 * highlight on the sea with fine ripples in it, and a blue rim glow.
 */
const EARTH = `${SPHERE}${LAND}
uniform shader clouds;
uniform float cloudOpacity;
uniform float4 cloudColor;
uniform float rippleStrength;
uniform float rippleSize;
uniform float oceanGrain;
uniform float4 oceanShallow;
uniform float4 oceanMid;
uniform float4 oceanDeep;
uniform float oceanMidDepth;
uniform float3 light;
uniform float ambient;
uniform float4 sunColor;
uniform float sunStrength;
uniform float sunSharpness;
uniform float4 rimColor;
uniform float rimStrength;
uniform float rimPower;

// Repeatable random number in [0, 1) for a point (no sine, so it stays precise).
float hash(float2 q) {
  float3 q3 = fract(float3(q.xyx) * 0.1031);
  q3 += dot(q3, q3.yzx + 33.33);
  return fract((q3.x + q3.y) * q3.z);
}

// Smooth value noise.
float noise(float2 q) {
  float2 i = floor(q);
  float2 f = fract(q);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1.0, 0.0)), f.x),
    mix(hash(i + float2(0.0, 1.0)), hash(i + float2(1.0, 1.0)), f.x), f.y);
}

half4 main(float2 p) {
  float alpha = edgeAlpha(p);
  if (alpha <= 0.0) return half4(0.0);
  float3 v = viewPoint(p);
  if (v.z < 0.0) v = float3(normalize(v.xy), 0.0);
  float3 w = toWorld(v);
  float lon = atan(w.y, w.x);
  float lat = asin(clamp(w.z, -1.0, 1.0));
  float2 uv = float2((lon / (2.0 * PI) + 0.5) * earthSize.x, (0.5 - lat / PI) * earthSize.y);
  half4 t = earth.eval(uv);

  // Sea: shallow over the shelves, deep navy in the open ocean.
  float depth = t.b;
  float3 ocean = depth < oceanMidDepth
    ? mix(oceanShallow.rgb, oceanMid.rgb, depth / oceanMidDepth)
    : mix(oceanMid.rgb, oceanDeep.rgb, (depth - oceanMidDepth) / (1.0 - oceanMidDepth));

  float2 perPx = float2(earthSize.x / (2.0 * PI * radius * max(cos(lat), 0.15)),
    earthSize.y / (PI * radius));
  float4 ground = landAt(uv, t.r, perPx);

  // Fine ripples on the sea (stuck to the globe). Never finer than about two screen
  // pixels, so they don't shimmer when the globe is small.
  float cell = max(rippleSize, perPx.y * 1.8);
  // Stretched east-west, so they read as glints on waves rather than grain.
  float2 waves = uv / cell * float2(0.3, 1.0);
  float ripple = noise(waves) * 0.65 + noise(waves * 2.3 + 17.0) * 0.35;
  ocean *= 1.0 + (ripple - 0.5) * oceanGrain;

  // Tighten the mask a little so JPEG softening doesn't blur the coast.
  float land = smoothstep(0.3, 0.7, t.g);
  float3 color = mix(ocean, ground.rgb, land);

  // Clouds (faded out when zoomed in, and then not sampled at all).
  float cloud = cloudOpacity > 0.001 ? clouds.eval(uv).r * cloudOpacity : 0.0;
  color = mix(color, cloudColor.rgb, cloud);
  color = mix(color, glowColor.rgb, ground.a);

  // Light from the top-left of the screen; the shadow side stays readable.
  float diffuse = max(dot(v, light), 0.0);
  color *= ambient + (1.0 - ambient) * diffuse;
  // Broad sun highlight on the water (dimmed under cloud), broken up by the ripples.
  float3 halfway = normalize(light + float3(0.0, 0.0, 1.0));
  float sun = pow(max(dot(v, halfway), 0.0), sunSharpness) * sunStrength
    * (1.0 - land) * (1.0 - cloud);
  color += sunColor.rgb * sun * (1.0 + (ripple - 0.5) * 2.0 * rippleStrength);
  // Blue glow towards the edge (fresnel).
  float rim = pow(1.0 - v.z, rimPower) * rimStrength;
  color = mix(color, rimColor.rgb, rim);

  return half4(half3(color * alpha), half(alpha));
}
`;

/**
 * The flat map: land only (see LAND), no sea, on a cropped Mercator map. Map units:
 * x = 0…mapWidth across ±180°, y = 0 at the top edge's latitude down to mapHeight.
 */
const MAP = `${LAND}
uniform float viewScale;
uniform float2 viewOffset;
uniform float mapWidth;
uniform float mapHeight;
uniform float mercatorScale;
uniform float mercatorTop;
uniform float brightness;

half4 main(float2 p) {
  // Screen px → map units (viewScale px per unit, map unit (0, 0) at viewOffset).
  float2 m = (p - viewOffset) / viewScale;
  if (m.y < 0.0 || m.y > mapHeight) return half4(0.0);
  float lon = m.x / mapWidth * 2.0 * PI_L - PI_L;
  // Inverse Mercator (mercatorScale map units per radian; mercatorTop = y of the top edge).
  float lat = 2.0 * atan(exp((mercatorTop - m.y) / mercatorScale)) - PI_L / 2.0;
  float2 uv = float2((lon / (2.0 * PI_L) + 0.5) * earthSize.x, (0.5 - lat / PI_L) * earthSize.y);
  half4 t = earth.eval(uv);
  // A slightly higher threshold than the globe's: with no sea behind it, faint JPEG
  // ripples around tiny islands would show against the background.
  float land = smoothstep(0.38, 0.72, t.g);

  float2 perPx = float2(earthSize.x / mapWidth,
    earthSize.y / PI_L * cos(lat) / mercatorScale) / viewScale;
  float4 ground = landAt(uv, t.r, perPx);
  // The glow may spill just past the coast; elsewhere off land is see-through.
  float alpha = max(land, ground.a);
  float3 color = land > 0.01 ? mix(ground.rgb, glowColor.rgb, ground.a) : glowColor.rgb;
  return half4(half3(color * brightness * alpha), half(alpha));
}
`;

const cache = new Map<string, SkRuntimeEffect | null>();

function compile(name: string, source: string): SkRuntimeEffect | null {
  if (!cache.has(name)) {
    const effect = Skia.RuntimeEffect.Make(source);
    if (!effect) console.warn(`Globe: ${name} shader failed to compile; using vector drawing.`);
    cache.set(name, effect);
  }
  return cache.get(name) ?? null;
}

/** The mapping test shader, or null if it fails to compile. Compiled once. */
export function getMappingTestEffect(): SkRuntimeEffect | null {
  return compile('mapping test', MAPPING_TEST);
}

/** The planet shader, or null if it fails to compile. Compiled once. */
export function getEarthEffect(): SkRuntimeEffect | null {
  return compile('earth', EARTH);
}

/** The flat map shader, or null if it fails to compile. Compiled once. */
export function getMapEffect(): SkRuntimeEffect | null {
  return compile('map', MAP);
}
