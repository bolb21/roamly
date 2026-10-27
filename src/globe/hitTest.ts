// Which country is at a tapped point? Runs on the JS thread, once per tap, with
// d3-geo's spherical point-in-polygon test, so countries cut by the ±180°
// antimeridian (Russia, Fiji) work like any other.
//
// Kept free of React/Expo imports so it can be tested in plain Node.

import { geoContains, geoDistance } from 'd3-geo';

import type { CountryShape } from './geometry';

/**
 * Every country can be hit anywhere within this distance (px) of its anchor, even
 * if it's smaller than that on screen. So tiny countries get a fingertip-sized
 * target, while bigger ones are left to the normal inside-the-border test.
 */
const MIN_TARGET_PX = 10;
/** How far (px) off a coastline a tap can land and still pick that country. */
const COAST_SLOP_PX = 8;

/**
 * Returns the index of the country at [lon, lat] (degrees), or null for open ocean.
 * `radiusPx` is the globe's current on-screen radius, so the generous tap areas
 * stay the same size in pixels at any zoom.
 */
export function countryAt(
  countries: CountryShape[],
  lon: number,
  lat: number,
  radiusPx: number,
): number | null {
  const point: [number, number] = [lon, lat];
  const minTarget = MIN_TARGET_PX / radiusPx;
  const slop = COAST_SLOP_PX / radiusPx;
  // Distance from the tap to each anchor, used to skip far-away countries cheaply.
  const distances = countries.map((c) => geoDistance(point, c.anchor));
  const mightReach = (i: number, extra: number) =>
    countries[i].radius >= Math.PI / 2 || distances[i] <= countries[i].radius + extra;

  // 1. Tiny countries' minimum targets win (nearest anchor first), or they'd be
  //    impossible to hit: Luxembourg would always lose to France or Germany.
  let best: number | null = null;
  let bestDistance = Infinity;
  for (let i = 0; i < countries.length; i++) {
    if (countries[i].radius >= minTarget) continue;
    if (distances[i] <= minTarget && distances[i] < bestDistance) {
      best = i;
      bestDistance = distances[i];
    }
  }
  if (best !== null) return best;

  // 2. The country the tap is inside.
  for (let i = 0; i < countries.length; i++) {
    if (mightReach(i, 0) && geoContains(countries[i].feature, point)) return i;
  }

  // 3. Just off a coast (small islands, thin peninsulas): nearest border point within reach.
  bestDistance = slop;
  for (let i = 0; i < countries.length; i++) {
    if (!mightReach(i, slop)) continue;
    const g = countries[i].feature.geometry;
    const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (const [pLon, pLat] of ring) {
          const d = geoDistance(point, [pLon, pLat]);
          if (d < bestDistance) {
            best = i;
            bestDistance = d;
          }
        }
      }
    }
  }
  return best;
}
