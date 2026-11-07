// Flat (2D) world map data: the same countries as the globe, on a Mercator map (the
// familiar web-map layout) cropped to MAP_NORTH…MAP_SOUTH: nearer square than a
// whole-world map. Its left edge is MAP_WEST, just east of Russia's far tip, so
// Russia sits whole on the right. The map's bottom edge is an oval curve, so
// Antarctica's stretched Mercator strip is rounded off rather than cut straight
// (see mapClipPath).
//
// The textured map is drawn by a shader (globeShader.ts) using mercatorScale,
// mercatorTop and MAP_WEST; close up, land is drawn from the pre-cut pieces
// (getFlatMapCells). The projection is used for tapping and the name bubble.
//
// Kept free of React/Expo imports so it can be tested in plain Node.

import { geoGraticule10, geoMercator, geoPath } from 'd3-geo';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

import type { CountryShape } from './geometry';
import { getLandPieces, LAND_CELL_ORIGIN } from './landCells';
import type { FlatGeometry } from './projection';

/** Width of the map in map units; screen size is applied by the map view. */
export const FLAT_MAP_WIDTH = 1000;
/** Latitudes of the map's top and bottom edges (northern Greenland to inland Antarctica). */
export const MAP_NORTH = 84;
export const MAP_SOUTH = -78;
/** The map's left edge (longitude): just east of Russia's far tip, at the land grid's origin. */
export const MAP_WEST = LAND_CELL_ORIGIN;
/** Antarctica is rounded off: the map's bottom edge curves up to this latitude at the sides. */
const ROUNDED_EDGE_LAT = -66;
/** Control point distance for a quarter ellipse drawn as a cubic curve. */
const ELLIPSE_K = 0.5523;

export type FlatMapData = {
  width: number;
  height: number;
  /** Map units per radian (along the equator), for sizing tap targets. */
  unitsPerRadian: number;
  /** Mercator y of the map's top edge, in map units (the shader needs it). */
  mercatorTop: number;
  /** The map's outline (its edges). */
  outlinePath: string;
  /** Map y where the bottom edge's oval curve meets the map's sides (see mapClipPath). */
  clipSideY: number;
  /** Lines of latitude and longitude every 10°. */
  graticulePath: string;
  /** Each country's anchor in map units (x,y flattened, by country index). */
  anchors: number[];
  /** Map units → [longitude, latitude], or null off the map. */
  invert: (x: number, y: number) => [number, number] | null;
};

const DEG = Math.PI / 180;
const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2));

let cached: FlatMapData | null = null;

/** The map's projection, and its size in map units. */
function mapProjection() {
  const scale = FLAT_MAP_WIDTH / (2 * Math.PI);
  const top = scale * mercatorY(MAP_NORTH);
  const height = top - scale * mercatorY(MAP_SOUTH);
  const projection = geoMercator()
    .rotate([-(MAP_WEST + 180), 0])
    .scale(scale)
    .translate([FLAT_MAP_WIDTH / 2, top])
    .clipExtent([
      [0, 0],
      [FLAT_MAP_WIDTH, height],
    ]);
  return { projection, scale, top, height };
}

export function getFlatMapData(countries: CountryShape[]): FlatMapData {
  if (cached) return cached;

  const { projection, scale, top, height } = mapProjection();
  const path = geoPath(projection).digits(1);

  const anchors: number[] = [];
  for (const c of countries) {
    const [x, y] = projection(c.anchor) ?? [0, 0];
    anchors.push(x, y);
  }

  const W = FLAT_MAP_WIDTH;
  const sideY = top - scale * mercatorY(ROUNDED_EDGE_LAT);

  cached = {
    width: W,
    height,
    unitsPerRadian: scale,
    mercatorTop: top,
    outlinePath: `M0 0H${W}V${height}H0Z`,
    clipSideY: sideY,
    graticulePath: path(geoGraticule10()) ?? '',
    anchors,
    invert: (x, y) => {
      if (x < 0 || x > W || y < 0 || y > height) return null;
      // Below the rounded bottom edge (roughly half an ellipse, see mapClipPath).
      const u = (2 * x) / W - 1;
      if (y > sideY + (height - sideY) * Math.sqrt(Math.max(0, 1 - u * u))) return null;
      const lonLat = projection.invert?.([x, y]);
      if (!lonLat || !Number.isFinite(lonLat[0]) || !Number.isFinite(lonLat[1])) return null;
      return [lonLat[0], lonLat[1]];
    },
  };
  return cached;
}

/**
 * The map's shape on screen as an SVG path, at screen = map × scale + (tx, ty): a
 * rectangle whose bottom edge is half an ellipse, from `sideY` at the sides down to
 * `height` in the middle (map units).
 */
export function mapClipPath(
  width: number,
  height: number,
  sideY: number,
  scale: number,
  tx: number,
  ty: number,
): string {
  'worklet';
  const right = tx + width * scale;
  const middle = tx + (width / 2) * scale;
  const halfWidth = (width / 2) * scale;
  const side = ty + sideY * scale;
  const bottom = ty + height * scale;
  const k = ELLIPSE_K;
  return (
    `M${tx} ${ty}H${right}V${side}` +
    `C${right} ${side + k * (bottom - side)} ${middle + k * halfWidth} ${bottom} ${middle} ${bottom}` +
    `C${middle - k * halfWidth} ${bottom} ${tx} ${side + k * (bottom - side)} ${tx} ${side}Z`
  );
}

let borderPath: string | null = null;

/**
 * The map's country borders (each shared border once, no coastlines) from the
 * detailed Natural Earth 1:50m outlines, as an SVG path in map units. Built on first
 * use; the 50m data is only loaded then too.
 */
export function getFlatMapBorderPath(): string {
  if (borderPath === null) {
    const topology = require('world-atlas/countries-50m.json') as Topology;
    const borders = mesh(
      topology,
      topology.objects.countries as GeometryCollection,
      (a, b) => a !== b,
    );
    borderPath = geoPath(mapProjection().projection).digits(1)(borders) ?? '';
  }
  return borderPath;
}

/**
 * One country's outline as open lines (an SVG path in map units), for the selection
 * glow: only its real edges, not cuts in the data along the antimeridian or the map's
 * left/right edge.
 */
export function getFlatMapCountryLines(outline: Feature<Polygon | MultiPolygon>): string {
  const { scale, top } = mapProjection();
  const out: string[] = [];
  const g = outline.geometry;
  const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      let last: number[] | null = null;
      let lastX = 0;
      for (const point of ring) {
        const [lon, lat] = point;
        const x = ((lon + (lon < MAP_WEST ? 360 : 0) - MAP_WEST) / 360) * FLAT_MAP_WIDTH;
        const y = top - scale * mercatorY(Math.max(-89.5, Math.min(89.5, lat)));
        const cut =
          last === null ||
          Math.abs(x - lastX) > FLAT_MAP_WIDTH / 2 ||
          (Math.abs(lon) > 179.999 && Math.abs(last[0]) > 179.999) ||
          (lat < -89.999 && last[1] < -89.999);
        out.push((cut ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2));
        last = point;
        lastX = x;
      }
    }
  }
  return out.join('');
}

let vectorPaths: { countryPaths: string[]; landPath: string } | null = null;

/**
 * Each country's outline as an SVG path in map units, and all of them in one path:
 * only for the vector fallback map, so only built if that's ever drawn.
 */
export function getFlatMapVectorPaths(countries: CountryShape[]) {
  if (!vectorPaths) {
    const path = geoPath(mapProjection().projection).digits(1);
    const countryPaths = countries.map((c) => path(c.feature) ?? '');
    vectorPaths = { countryPaths, landPath: countryPaths.join('') };
  }
  return vectorPaths;
}

let cells: FlatGeometry | null = null;

/**
 * The pre-cut land pieces (landCells.ts) in map units, for drawing land as sharp vector
 * shapes when zoomed in. Pieces west of MAP_WEST are moved to the map's right side.
 */
export function getFlatMapCells(): FlatGeometry {
  if (!cells) {
    const { scale, top } = mapProjection();
    const geometry: FlatGeometry = {
      points: [],
      ringStarts: [],
      ringEnds: [],
      ringBox: [],
      ringCountry: [],
    };
    for (const { country, cellX, ring } of getLandPieces()) {
      const shift = cellX < 0 ? 360 : 0;
      const start = geometry.points.length / 2;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const [lon, lat] of ring) {
        const x = ((lon + shift - MAP_WEST) / 360) * FLAT_MAP_WIDTH;
        const y = top - scale * mercatorY(Math.max(-89.5, Math.min(89.5, lat)));
        geometry.points.push(x, y);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      geometry.ringStarts.push(start);
      geometry.ringEnds.push(geometry.points.length / 2);
      geometry.ringBox.push(minX, maxX, minY, maxY);
      geometry.ringCountry.push(country);
    }
    cells = geometry;
  }
  return cells;
}
