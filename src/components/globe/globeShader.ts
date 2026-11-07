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
 * - `palette`: 256 × 2; pixel (id, 0) holds that country's visited colour, alpha 1 if
 *   visited and 0 if not; row 1 holds every country's colour, opaque.
 * Both textures are drawn into the same earthSize space whatever their resolution.
 *
 * Close up, land is drawn as sharp vector shapes filled with this same shader in a
 * `landMode` (1 = grey land, 2 = visited land): the shape decides where land is and
 * whether it's visited, so only the smooth relief (and the visited colour) come from
 * the textures, and nothing turns blocky however far you zoom.
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
uniform float landMode;
// Earth texture pixels per earth-space unit (1 for the 2048 texture, 2 for the 4096).
uniform float earthTexels;
// Visited colour for a vector-shape pixel whose country can't be found in the ids.
uniform float4 visitedFallback;

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

// Shaded relief with smooth (cubic B-spline) filtering, from four smoothed samples:
// close up, plain smoothing shows the texture's pixel grid as creases.
float smoothRelief(float2 uv) {
  float2 tc = uv * earthTexels - 0.5;
  float2 i = floor(tc);
  float2 f = tc - i;
  float2 f2 = f * f;
  float2 f3 = f2 * f;
  float2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  float2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  float2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  float2 w3 = f3 / 6.0;
  float2 g0 = w0 + w1;
  float2 g1 = w2 + w3;
  float2 h0 = (i - 0.5 + w1 / g0) / earthTexels;
  float2 h1 = (i + 1.5 + w3 / g1) / earthTexels;
  return g0.y * (g0.x * float(earth.eval(h0).r) + g1.x * float(earth.eval(float2(h1.x, h0.y)).r))
    + g1.y * (g0.x * float(earth.eval(float2(h0.x, h1.y)).r) + g1.x * float(earth.eval(h1).r));
}

// Is this country drawn in its visited colour in a visited vector shape?
bool showsVisited(float id) {
  if (id < 0.5 || id > 254.5) return false;
  return abs(id - fadeId) < 0.5 || palette.eval(float2(id + 0.5, 0.5)).a > 0.0;
}

// The visited colour inside a visited vector shape. The shape is exact but the ids
// are pixels, so next to a coast or an unvisited neighbour the pixel's id may be wrong:
// then look a little further round for the visited country.
float3 visitedTintNear(float2 uv) {
  float id = countryAt(uv);
  if (!showsVisited(id)) {
    float found = 0.0;
    for (int ring = 1; ring <= 3; ring++) {
      for (int k = 0; k < 8; k++) {
        if (found < 0.5) {
          float a = float(k) * (PI_L / 4.0) + float(ring) * 0.4;
          float c = countryAt(uv + float2(cos(a), sin(a)) * (0.45 * float(ring)));
          if (showsVisited(c)) found = c;
        }
      }
    }
    if (found < 0.5) return visitedFallback.rgb;
    id = found;
  }
  return float3(palette.eval(float2(id + 0.5, 1.5)).rgb);
}

// Land colour inside a close-up vector shape (see landMode).
float3 vectorLand(float2 uv, float relief) {
  float3 grey = landColor.rgb * (reliefMin + reliefRange * relief);
  if (landMode < 1.5) return grey;
  return visitedTintNear(uv) * (tintBase + tintRelief * relief);
}

// landAt's work, sampling the country ids s away. Returns a = -1 if no sample hit land.
float4 landSamples(float2 uv, float relief, float2 perPx, float2 s) {
  // Four country samples about a pixel apart: their colours are averaged so colour
  // boundaries look soft, and where they disagree there's a border. Spacing them in
  // screen pixels keeps borders the same thin width at any zoom.
  float id0 = countryAt(uv + float2(-s.x, -s.y));
  float id1 = countryAt(uv + float2(s.x, -s.y));
  float id2 = countryAt(uv + float2(-s.x, s.y));
  float id3 = countryAt(uv + float2(s.x, s.y));
  float4 t0 = tintOf(id0);
  float4 t1 = tintOf(id1);
  float4 t2 = tintOf(id2);
  float4 t3 = tintOf(id3);
  // Share visited, of the samples that hit land (so coastal pixels aren't half grey).
  float onLand = float(id0 > 0.5) + float(id1 > 0.5) + float(id2 > 0.5) + float(id3 > 0.5);
  if (onLand < 0.5) return float4(0.0, 0.0, 0.0, -1.0);
  float visited = (t0.a + t1.a + t2.a + t3.a) / onLand;
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

// Land colour at earth-space uv (rgb) and the selection glow there (a).
// perPx is the size of one screen pixel in earth-space units (x and y).
float4 landAt(float2 uv, float relief, float2 perPx) {
  float4 near = landSamples(uv, relief, perPx, perPx * edgeSoftness);
  // Along coasts the land mask can reach a pixel past the country ids; take those
  // pixels' country from a little further out, so they aren't left grey.
  if (near.a < 0.0) near = landSamples(uv, relief, perPx, float2(0.9));
  return float4(near.rgb, max(near.a, 0.0));
}
`;

/**
 * The planet: land (see LAND) and sea on a lit sphere, with clouds. Lighting
 * is in screen space: light from the top-left, a lifted shadow side, a broad sun
 * highlight on the sea, and a blue rim glow.
 */
const EARTH = `${SPHERE}${LAND}
uniform shader clouds;
uniform float cloudOpacity;
uniform float4 cloudColor;
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
// 1 = sea only (close up: the land is drawn by vector shapes on top).
uniform float oceanOnly;

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
  // Tighten the mask a little so JPEG softening doesn't blur the coast.
  float land = 0.0;
  float4 ground = float4(0.0);
  if (landMode > 0.5) {
    land = 1.0;
    ground = float4(vectorLand(uv, smoothRelief(uv)), 0.0);
  } else if (oceanOnly < 0.5) {
    land = smoothstep(0.3, 0.7, t.g);
    ground = landAt(uv, t.r, perPx);
  }
  float3 color = mix(ocean, ground.rgb, land);

  // Clouds (faded out when zoomed in, and then not sampled at all).
  float cloud = cloudOpacity > 0.001 ? clouds.eval(uv).r * cloudOpacity : 0.0;
  color = mix(color, cloudColor.rgb, cloud);
  color = mix(color, glowColor.rgb, ground.a);

  // Light from the top-left of the screen; the shadow side stays readable.
  float diffuse = max(dot(v, light), 0.0);
  color *= ambient + (1.0 - ambient) * diffuse;
  // Broad sun highlight on the water (dimmed under cloud).
  float3 halfway = normalize(light + float3(0.0, 0.0, 1.0));
  float sun = pow(max(dot(v, halfway), 0.0), sunSharpness) * sunStrength
    * (1.0 - land) * (1.0 - cloud);
  color += sunColor.rgb * sun;
  // Blue glow towards the edge (fresnel).
  float rim = pow(1.0 - v.z, rimPower) * rimStrength;
  color = mix(color, rimColor.rgb, rim);

  return half4(half3(color * alpha), half(alpha));
}
`;

/**
 * The flat map: land only (see LAND), no sea, on a cropped Mercator map. Map units:
 * x = 0…mapWidth across 360° from longitude mapLonOrigin (radians), y = 0 at the top
 * edge's latitude down to mapHeight.
 */
const MAP = `${LAND}
uniform float viewScale;
uniform float2 viewOffset;
uniform float mapWidth;
uniform float mapHeight;
uniform float mercatorScale;
uniform float mercatorTop;
uniform float brightness;
uniform float mapLonOrigin;
// 1 = draw nothing (close up, the land is drawn by vector shapes instead).
uniform float landHidden;

half4 main(float2 p) {
  if (landHidden > 0.5 && landMode < 0.5) return half4(0.0);
  // Screen px → map units (viewScale px per unit, map unit (0, 0) at viewOffset).
  float2 m = (p - viewOffset) / viewScale;
  if (m.x < 0.0 || m.x > mapWidth || m.y < 0.0 || m.y > mapHeight) return half4(0.0);
  float lon = mapLonOrigin + m.x / mapWidth * 2.0 * PI_L;
  // Inverse Mercator (mercatorScale map units per radian; mercatorTop = y of the top edge).
  float lat = 2.0 * atan(exp((mercatorTop - m.y) / mercatorScale)) - PI_L / 2.0;
  float2 uv = float2((lon / (2.0 * PI_L) + 0.5) * earthSize.x, (0.5 - lat / PI_L) * earthSize.y);
  if (landMode > 0.5) return half4(half3(vectorLand(uv, smoothRelief(uv)) * brightness), 1.0);
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
