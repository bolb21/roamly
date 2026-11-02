// Flat (2D) world map data: the same countries as the globe, projected once with
// d3-geo's Natural Earth projection (the rounded world map used in atlases).
//
// Unlike the globe, a flat map never changes shape, so every outline is built
// once here on the JS thread. Panning and zooming only move the finished paths.
//
// Kept free of React/Expo imports so it can be tested in plain Node.

import { geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';

import type { CountryShape } from './geometry';

/** Width of the map in map units; screen size is applied by the map view. */
export const FLAT_MAP_WIDTH = 1000;

export type FlatMapData = {
  width: number;
  height: number;
  /** Map units per radian near the equator, for sizing tap targets. */
  unitsPerRadian: number;
  /** SVG path per country, in the same order as `countries`. */
  countryPaths: string[];
  /** All countries in one SVG path. */
  landPath: string;
  /** The map's rounded outline (the edge of the world). */
  outlinePath: string;
  /** Lines of latitude and longitude every 10°. */
  graticulePath: string;
  /** Each country's anchor in map units (x,y flattened, by country index). */
  anchors: number[];
  /** Map units → [longitude, latitude], or null off the map. */
  invert: (x: number, y: number) => [number, number] | null;
};

let cached: FlatMapData | null = null;

export function getFlatMapData(countries: CountryShape[]): FlatMapData {
  if (cached) return cached;

  const sphere = { type: 'Sphere' } as const;
  const projection = geoNaturalEarth1().fitWidth(FLAT_MAP_WIDTH, sphere);
  const path = geoPath(projection).digits(1);
  const [[, top], [, bottom]] = path.bounds(sphere);

  const countryPaths = countries.map((c) => path(c.feature) ?? '');
  const anchors: number[] = [];
  for (const c of countries) {
    const [x, y] = projection(c.anchor) ?? [0, 0];
    anchors.push(x, y);
  }

  cached = {
    width: FLAT_MAP_WIDTH,
    height: bottom - top,
    unitsPerRadian: projection.scale(),
    countryPaths,
    landPath: countryPaths.join(''),
    outlinePath: path(sphere) ?? '',
    graticulePath: path(geoGraticule10()) ?? '',
    anchors,
    invert: (x, y) => {
      const lonLat = projection.invert?.([x, y]);
      if (!lonLat || !Number.isFinite(lonLat[0]) || !Number.isFinite(lonLat[1])) return null;
      // Points outside the map's rounded edge come back with longitudes past ±180.
      if (Math.abs(lonLat[0]) > 180 || Math.abs(lonLat[1]) > 90) return null;
      return [lonLat[0], lonLat[1]];
    },
  };
  return cached;
}
