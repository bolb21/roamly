// Flat (2D) world map data: the same countries as the globe, on a Mercator map (the
// familiar web-map layout) cropped to MAP_NORTH…MAP_SOUTH, so it's nearer square than
// a whole-world map and Antarctica's huge Mercator strip is left out.
//
// The textured map is drawn by a shader (globeShader.ts) using mercatorScale and
// mercatorTop; the vector outlines here are its fallback, and the projection is used
// for tapping and the name bubble.
//
// Kept free of React/Expo imports so it can be tested in plain Node.

import { geoGraticule10, geoMercator, geoPath } from 'd3-geo';
import { mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

import type { CountryShape } from './geometry';

/** Width of the map in map units; screen size is applied by the map view. */
export const FLAT_MAP_WIDTH = 1000;
/** Latitudes of the map's top and bottom edges (northern Greenland to Cape Horn). */
export const MAP_NORTH = 84;
export const MAP_SOUTH = -57;

export type FlatMapData = {
  width: number;
  height: number;
  /** Map units per radian (along the equator), for sizing tap targets. */
  unitsPerRadian: number;
  /** Mercator y of the map's top edge, in map units (the shader needs it). */
  mercatorTop: number;
  /** SVG path per country, in the same order as `countries`. */
  countryPaths: string[];
  /** All countries in one SVG path. */
  landPath: string;
  /** The map's outline (its edges). */
  outlinePath: string;
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

  const countryPaths = countries.map((c) => path(c.feature) ?? '');
  const anchors: number[] = [];
  for (const c of countries) {
    const [x, y] = projection(c.anchor) ?? [0, 0];
    anchors.push(x, y);
  }

  cached = {
    width: FLAT_MAP_WIDTH,
    height,
    unitsPerRadian: scale,
    mercatorTop: top,
    countryPaths,
    landPath: countryPaths.join(''),
    outlinePath: `M0 0H${FLAT_MAP_WIDTH}V${height}H0Z`,
    graticulePath: path(geoGraticule10()) ?? '',
    anchors,
    invert: (x, y) => {
      if (x < 0 || x > FLAT_MAP_WIDTH || y < 0 || y > height) return null;
      const lonLat = projection.invert?.([x, y]);
      if (!lonLat || !Number.isFinite(lonLat[0]) || !Number.isFinite(lonLat[1])) return null;
      return [lonLat[0], lonLat[1]];
    },
  };
  return cached;
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
