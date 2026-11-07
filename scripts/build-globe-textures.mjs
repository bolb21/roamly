// Builds the textured globe's images from open data. Run with:
//
//   npm run build:globe-textures
//
// Downloads (once) into data-raw/ (not committed), writes the app's textures to
// assets/globe/ and preview images to docs/preview/. Sources and licences are in
// docs/ASSETS.md.
//
// Outputs, all equirectangular (x = longitude -180→180, y = latitude 90→-90):
// - earth-4096.jpg / earth-2048.jpg: three greyscale layers in one image, to save
//   graphics memory. Red = shaded relief of the land (0.5 = flat, lit from several
//   directions, with exaggerated height). Green = land mask (anti-aliased coastlines).
//   Blue = ocean depth (0 = shore, 1 = 7 km or deeper, square-root scaled so the
//   continental shelves stand out). Colours are applied in the app's shader.
// - countries-4096.png / countries-2048.png: greyscale, each pixel holds a country
//   id with no anti-aliasing (0 = sea, n = the app's country index + 1, 255 = land
//   that isn't in the app's country list yet, e.g. Andorra).
// - clouds-2048.jpg: greyscale cloud cover (0 = clear), wraps round with no seam.
// - country-ids.json: id → the app's country id and name, and its size in pixels.

import { createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import { geoEquirectangular, geoPath } from 'd3-geo';
import { fromFile } from 'geotiff';
import sharp from 'sharp';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const ROOT = new URL('../', import.meta.url);
// The app's own country list and tap test, so ids and checks match the app exactly.
const { buildCountryList } = await import(new URL('src/globe/geometry.ts', ROOT));
const { countryAt } = await import(new URL('src/globe/hitTest.ts', ROOT));

// --- Settings ---

/** NOAA ETOPO 2022, 60 arc-second surface elevation (includes ice sheets). CC0. */
const ETOPO_URL =
  'https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/60s/60s_surface_elev_gtif/ETOPO_2022_v1_60s_N90W180_surface.tif';
const ETOPO_FILE = new URL('data-raw/ETOPO_2022_v1_60s_N90W180_surface.tif', ROOT);
/** Elevation is processed at half the source resolution (exactly 2:1), then scaled down. */
const WORK_W = 10800;
const WORK_H = 5400;
/** Vertical exaggeration for the relief shading. Higher = mountains stand out more. */
const EXAGGERATION = 24;
/** Light directions for the relief (azimuth in degrees clockwise from north) and their weights. */
const LIGHTS = [
  { azimuth: 315, weight: 0.45 },
  { azimuth: 270, weight: 0.2 },
  { azimuth: 0, weight: 0.2 },
  { azimuth: 225, weight: 0.15 },
];
const LIGHT_ALTITUDE = 40;
/** Ocean depth at which the depth layer reaches 1. */
const MAX_DEPTH_M = 7000;
/** Output sizes (width; height is half). */
const SIZES = [4096, 2048];

const CLOUD_SIZE = 2048;
/** Land mask is drawn this many times larger, then averaged down, for smooth coastlines. */
const MASK_SUPERSAMPLE = 4;
const UNASSIGNED = 255;
const JPEG = { quality: 88, chromaSubsampling: '4:4:4', mozjpeg: true };

const OUT = new URL('assets/globe/', ROOT);
const PREVIEW = new URL('docs/preview/', ROOT);
mkdirSync(OUT, { recursive: true });
mkdirSync(PREVIEW, { recursive: true });
mkdirSync(new URL('data-raw/', ROOT), { recursive: true });

const DEG = Math.PI / 180;
const log = (...args) => console.log(`[${(performance.now() / 1000).toFixed(1)}s]`, ...args);

// --- 1. Elevation ---

async function download(url, file) {
  if (existsSync(file)) return;
  log('Downloading', url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
}

/** Elevation in metres at WORK_W × WORK_H, read in strips to keep memory low. */
async function readElevation() {
  await download(ETOPO_URL, ETOPO_FILE);
  const image = await (await fromFile(fileURLToPath(ETOPO_FILE))).getImage();
  const srcW = image.getWidth();
  const srcH = image.getHeight();
  if (srcW !== WORK_W * 2 || srcH !== WORK_H * 2)
    throw new Error(`Unexpected ETOPO size ${srcW}×${srcH}`);
  const elevation = new Float32Array(WORK_W * WORK_H);
  const STRIP = 270; // output rows per read
  for (let y = 0; y < WORK_H; y += STRIP) {
    // Read full resolution, then average each 2×2 block (geotiff's own resizing skips pixels).
    const [band] = await image.readRasters({ window: [0, y * 2, srcW, (y + STRIP) * 2] });
    for (let row = 0; row < STRIP; row++) {
      const top = row * 2 * srcW;
      const bottom = top + srcW;
      const out = (y + row) * WORK_W;
      for (let x = 0; x < WORK_W; x++) {
        const c = x * 2;
        elevation[out + x] = (band[top + c] + band[top + c + 1] + band[bottom + c] + band[bottom + c + 1]) / 4;
      }
    }
  }
  log('Read elevation', `${WORK_W}×${WORK_H}`);
  return elevation;
}

/** Multi-directional shaded relief of the land (sea counts as flat), 0.5 = flat. */
function shadeRelief(elevation) {
  const relief = new Uint8Array(WORK_W * WORK_H);
  const metresPerRow = (Math.PI * 6371000) / WORK_H;
  const altitude = LIGHT_ALTITUDE * DEG;
  const lights = LIGHTS.map(({ azimuth, weight }) => ({
    x: Math.sin(azimuth * DEG) * Math.cos(altitude),
    y: Math.cos(azimuth * DEG) * Math.cos(altitude),
    z: Math.sin(altitude),
    weight,
  }));
  const flat = lights.reduce((sum, l) => sum + l.weight * l.z, 0);
  const land = (i) => Math.max(0, elevation[i]);

  for (let y = 0; y < WORK_H; y++) {
    const lat = 90 - ((y + 0.5) * 180) / WORK_H;
    const metresPerColumn = metresPerRow * Math.max(Math.cos(lat * DEG), 0.05);
    const up = Math.max(0, y - 1) * WORK_W;
    const down = Math.min(WORK_H - 1, y + 1) * WORK_W;
    const row = y * WORK_W;
    for (let x = 0; x < WORK_W; x++) {
      const left = x === 0 ? WORK_W - 1 : x - 1; // wraps at ±180°
      const right = x === WORK_W - 1 ? 0 : x + 1;
      const east = ((land(row + right) - land(row + left)) / (2 * metresPerColumn)) * EXAGGERATION;
      const north = ((land(up + x) - land(down + x)) / (2 * metresPerRow)) * EXAGGERATION;
      // Surface normal (east, north, up), normalised.
      const length = Math.hypot(east, north, 1);
      const nx = -east / length;
      const ny = -north / length;
      const nz = 1 / length;
      let shade = 0;
      for (const l of lights) shade += l.weight * Math.max(0, nx * l.x + ny * l.y + nz * l.z);
      relief[row + x] = Math.round(Math.min(1, (0.5 * shade) / flat) * 255);
    }
  }
  log('Shaded relief');
  return relief;
}

/** Ocean depth, 0 at the shore to 1 at MAX_DEPTH_M, square-root scaled. Land = 0. */
function oceanDepth(elevation) {
  const depth = new Uint8Array(WORK_W * WORK_H);
  for (let i = 0; i < depth.length; i++) {
    const d = Math.max(0, -elevation[i]) / MAX_DEPTH_M;
    depth[i] = Math.round(Math.min(1, Math.sqrt(d)) * 255);
  }
  return depth;
}

// --- 2. Countries ---

/**
 * Country outlines as screen-space rings for a width × (width/2) equirectangular
 * image. d3-geo cuts them at ±180° and around the poles.
 */
function ringsFor(geoFeature, width) {
  const projection = geoEquirectangular()
    .scale(width / (2 * Math.PI))
    .translate([width / 2, width / 4])
    .precision(0.1);
  const rings = [];
  let ring = null;
  geoPath(projection, {
    moveTo(x, y) {
      ring = [x, y];
      rings.push(ring);
    },
    lineTo(x, y) {
      ring.push(x, y);
    },
    closePath() {},
    arc() {},
  })(geoFeature);
  return rings;
}

/** Fills rings (even-odd) into `target` with `value`, no anti-aliasing. */
function fillRings(target, width, height, rings, value) {
  const edges = [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (const r of rings) {
    const n = r.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const y1 = r[i * 2 + 1];
      const y2 = r[j * 2 + 1];
      if (y1 === y2) continue;
      edges.push(r[i * 2], y1, r[j * 2], y2);
      minY = Math.min(minY, y1, y2);
      maxY = Math.max(maxY, y1, y2);
    }
  }
  const crossings = [];
  const rowStart = Math.max(0, Math.floor(minY));
  const rowEnd = Math.min(height - 1, Math.ceil(maxY));
  for (let y = rowStart; y <= rowEnd; y++) {
    const yc = y + 0.5;
    crossings.length = 0;
    for (let e = 0; e < edges.length; e += 4) {
      const x1 = edges[e];
      const y1 = edges[e + 1];
      const x2 = edges[e + 2];
      const y2 = edges[e + 3];
      if ((y1 <= yc && yc < y2) || (y2 <= yc && yc < y1)) {
        crossings.push(x1 + ((yc - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const from = Math.max(0, Math.ceil(crossings[k] - 0.5));
      const to = Math.min(width, Math.ceil(crossings[k + 1] - 0.5));
      target.fill(value, y * width + from, y * width + to);
    }
  }
}

/**
 * The app's country list: every polygonal 1:50m country, in feature order (texture id
 * = list index + 1). Also written to src/globe/countryList.json with precomputed
 * anchors, which the app loads instead of computing them at startup.
 */
function countryList() {
  const topology = require('world-atlas/countries-50m.json');
  const features = feature(topology, topology.objects.countries).features.filter(
    (f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
  );
  const list = buildCountryList(topology);
  if (list.length !== features.length) throw new Error('Country list and outlines differ');
  if (list.length >= UNASSIGNED) throw new Error('Too many countries for an 8-bit id');
  const round = (x, digits) => Math.round(x * 10 ** digits) / 10 ** digits;
  writeFileSync(
    new URL('src/globe/countryList.json', ROOT),
    JSON.stringify(
      list.map((c) => ({
        id: c.id,
        name: c.name,
        anchor: [round(c.anchor[0], 4), round(c.anchor[1], 4)],
        radius: round(c.radius, 5),
      })),
    ) + '\n',
  );
  log(`Countries: ${list.length} (written to src/globe/countryList.json)`);
  const countries = list.map((c, i) => ({ ...c, feature: features[i] }));
  const items = features.map((f, i) => ({ feature: f, value: i + 1 }));
  return { countries, items };
}

function rasteriseCountries(items, width) {
  const height = width / 2;
  const ids = new Uint8Array(width * height);
  for (const { feature: f, value } of items)
    fillRings(ids, width, height, ringsFor(f, width), value);
  return ids;
}

/** Anti-aliased land mask: land drawn MASK_SUPERSAMPLE× larger, then averaged down. */
function landMask(items, width) {
  const big = width * MASK_SUPERSAMPLE;
  const bigH = big / 2;
  const land = new Uint8Array(big * bigH);
  for (const { feature: f } of items) fillRings(land, big, bigH, ringsFor(f, big), 1);
  const height = width / 2;
  const mask = new Uint8Array(width * height);
  const s = MASK_SUPERSAMPLE;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let dy = 0; dy < s; dy++) {
        const row = (y * s + dy) * big + x * s;
        for (let dx = 0; dx < s; dx++) sum += land[row + dx];
      }
      mask[y * width + x] = Math.round((sum / (s * s)) * 255);
    }
  }
  log('Land mask', `${width}×${height}`);
  return mask;
}

// --- 3. Clouds ---

/** Repeatable hash of three integers → [0, 1). */
function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 3D value noise. */
function noise3(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fade = (t) => t * t * (3 - 2 * t);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const w = fade(z - zi);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

function fbm(x, y, z, octaves) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amplitude * noise3(x * frequency, y * frequency, z * frequency);
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return sum;
}

/**
 * Wispy cloud cover, sampled on the sphere itself so it wraps at ±180° with no
 * seam and doesn't pinch at the poles. Cloudier near the equator and at ±55°.
 */
function clouds(width) {
  const height = width / 2;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const lat = 90 - ((y + 0.5) * 180) / height;
    const band =
      0.62 +
      0.18 * Math.exp(-((lat / 12) ** 2)) +
      0.22 * Math.exp(-(((Math.abs(lat) - 55) / 15) ** 2)) -
      0.12 * Math.exp(-(((Math.abs(lat) - 25) / 10) ** 2));
    for (let x = 0; x < width; x++) {
      const lon = ((x + 0.5) * 360) / width - 180;
      const px = Math.cos(lat * DEG) * Math.cos(lon * DEG);
      const py = Math.cos(lat * DEG) * Math.sin(lon * DEG);
      const pz = Math.sin(lat * DEG);
      // Warp the coordinates by coarser noise for swirls.
      const warp = fbm(px * 2 + 11, py * 2, pz * 2, 3);
      const swirl = fbm(px * 6 - 5, py * 6, pz * 9, 3);
      const value = fbm(
        px * 5 + warp * 2.4 + swirl * 0.6,
        py * 5 + warp * 2.4,
        pz * 5 + warp * 2 + swirl * 0.6,
        7,
      );
      const cover = Math.min(1, Math.max(0, (value * band - 0.34) / 0.2));
      out[y * width + x] = Math.round(cover ** 1.7 * 255);
    }
  }
  log('Clouds', `${width}×${height}`);
  return out;
}

// --- 4. Write files ---

const grey = (data, width, height) => sharp(data, { raw: { width, height, channels: 1 } });

async function scaled(data, width, height, toWidth) {
  return grey(data, width, height)
    .resize(toWidth, toWidth / 2, { kernel: 'lanczos3' })
    .extractChannel(0) // sharp turns one channel into three when resizing; keep one
    .raw()
    .toBuffer();
}

function interleave(r, g, b) {
  const out = Buffer.alloc(r.length * 3);
  for (let i = 0; i < r.length; i++) {
    out[i * 3] = r[i];
    out[i * 3 + 1] = g[i];
    out[i * 3 + 2] = b[i];
  }
  return out;
}

/** Fixed bright colour per country id, for the preview (sea black, unassigned white). */
function idColour(id) {
  if (id === 0) return [8, 12, 30];
  if (id === UNASSIGNED) return [255, 255, 255];
  return [60 + hash3(id, 1, 0) * 195, 60 + hash3(id, 2, 0) * 195, 60 + hash3(id, 3, 0) * 195].map(
    Math.round,
  );
}

/** A flat preview of roughly how the globe will look: tinted ocean, grey relief, borders, clouds. */
function composite(width, relief, mask, depth, ids, cloud) {
  const height = width / 2;
  const out = Buffer.alloc(width * height * 3);
  const shallow = [64, 150, 220];
  const deep = [8, 30, 92];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const d = depth[i] / 255;
      const sea = shallow.map((c, k) => c + (deep[k] - c) * Math.min(1, d * 1.3));
      const grey = 150 * (0.55 + 0.9 * (relief[i] / 255));
      const m = mask[i] / 255;
      let rgb = sea.map((c) => c + (grey - c) * m);
      const right = ids[y * width + ((x + 1) % width)];
      const below = ids[Math.min(height - 1, y + 1) * width + x];
      if (
        ids[i] !== 0 &&
        ((right !== ids[i] && right !== 0) || (below !== ids[i] && below !== 0))
      ) {
        rgb = rgb.map((c) => c * 0.75 + 255 * 0.25);
      }
      const cl = (cloud[Math.floor(y / 2) * (width / 2) + Math.floor(x / 2)] / 255) * 0.35;
      for (let k = 0; k < 3; k++) out[i * 3 + k] = Math.round(rgb[k] + (255 - rgb[k]) * cl);
    }
  }
  return out;
}

// --- 5. Check the country ids against the app's own tap test ---

const CHECKS = [
  { place: 'London', lon: -0.13, lat: 51.51 },
  { place: 'Paris', lon: 2.35, lat: 48.86 },
  { place: 'Sydney', lon: 151.21, lat: -33.87 },
  { place: 'Rio de Janeiro (city centre, on the bay shore)', lon: -43.2, lat: -22.91 },
  { place: 'Rio de Janeiro (Tijuca, 6 km inland)', lon: -43.28, lat: -22.95 },
  { place: 'Tokyo', lon: 139.69, lat: 35.69 },
  { place: 'Nairobi', lon: 36.82, lat: -1.29 },
  { place: 'Reykjavik', lon: -21.94, lat: 64.15 },
  { place: 'Suva, Fiji (on the shore)', lon: 178.44, lat: -18.14 },
  { place: 'Viti Levu, Fiji (inland)', lon: 178.0, lat: -17.8 },
  { place: 'Taveuni, Fiji (east of 180°)', lon: -179.9, lat: -16.8 },
  { place: 'Moscow', lon: 37.62, lat: 55.76 },
  { place: 'Chukotka, Russia (west of 180°)', lon: -175, lat: 66 },
  { place: 'Antarctic interior', lon: 40, lat: -80 },
  { place: 'Andorra la Vella', lon: 1.52, lat: 42.51 },
  { place: 'Monaco', lon: 7.42, lat: 43.74 },
  { place: 'Valletta, Malta', lon: 14.45, lat: 35.9 },
  { place: 'Singapore', lon: 103.82, lat: 1.35 },
  { place: 'Vatican', lon: 12.453, lat: 41.904 },
];

function checkIds(appCountries, ids, width) {
  const height = width / 2;
  const name = (i) => (i === null ? 'sea' : appCountries[i].name);
  const rows = CHECKS.map(({ place, lon, lat }) => {
    const x = Math.min(width - 1, Math.floor(((lon + 180) / 360) * width));
    const y = Math.min(height - 1, Math.floor(((90 - lat) / 180) * height));
    const id = ids[y * width + x];
    const fromTexture = id === 0 ? 'sea' : id === UNASSIGNED ? 'unassigned land' : name(id - 1);
    // A large radius keeps the tap test's generous small-country targets out of it.
    const fromTap = name(countryAt(appCountries, lon, lat, 20000));
    return { place, fromTap, fromTexture, ok: fromTap === fromTexture };
  });
  const lines = [
    `Country id check (${width}×${height} texture vs the app's tap test)`,
    '',
    '| Place | Tap test | Texture | Match |',
    '| --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.place} | ${r.fromTap} | ${r.fromTexture} | ${r.ok ? 'yes' : 'NO'} |`),
  ];
  console.log(lines.join('\n'));
  return lines.join('\n');
}

// --- Run ---

const { countries: appCountries, items } = countryList();

const elevation = await readElevation();
const relief = shadeRelief(elevation);
const depth = oceanDepth(elevation);
const cloud = clouds(CLOUD_SIZE);

const pixelCounts = {};
let verifyText = '';
for (const width of SIZES) {
  const height = width / 2;
  const ids = rasteriseCountries(items, width);
  const mask = landMask(items, width);
  const r = await scaled(relief, WORK_W, WORK_H, width);
  const b = await scaled(depth, WORK_W, WORK_H, width);
  await sharp(interleave(r, mask, b), { raw: { width, height, channels: 3 } })
    .jpeg(JPEG)
    .toFile(fileURLToPath(new URL(`earth-${width}.jpg`, OUT)));
  await grey(ids, width, height)
    .png({ compressionLevel: 9 })
    .toFile(fileURLToPath(new URL(`countries-${width}.png`, OUT)));
  const counts = new Array(appCountries.length).fill(0);
  for (const id of ids) if (id !== 0 && id !== UNASSIGNED) counts[id - 1]++;
  pixelCounts[width] = counts;
  log('Wrote', `earth-${width}.jpg`, `countries-${width}.png`);

  if (width === 4096) {
    verifyText = checkIds(appCountries, ids, width);
    // Previews: whole-world (2048 wide) and full-resolution crops.
    const comp = composite(width, r, mask, b, ids, cloud);
    const image = () => sharp(comp, { raw: { width, height, channels: 3 } });
    const file = (name) => fileURLToPath(new URL(name, PREVIEW));
    await image().resize(2048, 1024).jpeg({ quality: 85 }).toFile(file('composite.jpg'));
    await image()
      .extract({ left: 2750, top: 500, width: 900, height: 450 })
      .jpeg({ quality: 90 })
      .toFile(file('crop-himalaya.jpg'));
    await image()
      .extract({ left: 1950, top: 350, width: 600, height: 300 })
      .jpeg({ quality: 90 })
      .toFile(file('crop-europe.jpg'));
    await image()
      .extract({ left: 800, top: 1050, width: 600, height: 600 })
      .jpeg({ quality: 90 })
      .toFile(file('crop-andes.jpg'));
    // The seam: the right edge and the left edge side by side.
    const seam = Buffer.alloc(400 * 300 * 3);
    for (let y = 0; y < 300; y++) {
      for (let x = 0; x < 400; x++) {
        const sx = (width - 200 + x) % width;
        const src = ((800 + y) * width + sx) * 3;
        comp.copy(seam, (y * 400 + x) * 3, src, src + 3);
      }
    }
    await sharp(seam, { raw: { width: 400, height: 300, channels: 3 } })
      .jpeg({ quality: 90 })
      .toFile(file('seam-180.jpg'));
    const idPreview = Buffer.alloc(width * height * 3);
    for (let i = 0; i < ids.length; i++)
      idColour(ids[i]).forEach((c, k) => (idPreview[i * 3 + k] = c));
    await sharp(idPreview, { raw: { width, height, channels: 3 } })
      .resize(2048, 1024, { kernel: 'nearest' })
      .png()
      .toFile(file('countries.png'));
    await grey(r, width, height)
      .resize(2048, 1024)
      .jpeg({ quality: 85 })
      .toFile(file('relief.jpg'));
    await grey(mask, width, height).resize(2048, 1024).png().toFile(file('landmask.png'));
    await grey(b, width, height)
      .resize(2048, 1024)
      .jpeg({ quality: 85 })
      .toFile(file('ocean-depth.jpg'));
  }
}

await grey(cloud, CLOUD_SIZE, CLOUD_SIZE / 2)
  .jpeg({ quality: 85 })
  .toFile(fileURLToPath(new URL('clouds-2048.jpg', OUT)));
await grey(cloud, CLOUD_SIZE, CLOUD_SIZE / 2)
  .jpeg({ quality: 85 })
  .toFile(fileURLToPath(new URL('clouds.jpg', PREVIEW)));

writeFileSync(
  new URL('country-ids.json', OUT),
  JSON.stringify({
    note: 'Texture id = app country index + 1 (src/globe/countryList.json order); 0 = sea.',
    countries: appCountries.map((c, i) => ({
      textureId: i + 1,
      id: c.id,
      name: c.name,
      pixels2048: pixelCounts[2048][i],
      pixels4096: pixelCounts[4096][i],
    })),
  }) + '\n',
);
writeFileSync(new URL('id-check.md', PREVIEW), verifyText + '\n');
log('Done');
