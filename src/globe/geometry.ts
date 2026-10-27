// Turns Natural Earth country outlines (TopoJSON from `world-atlas`) into flat
// arrays of 3D unit vectors that the globe worklet can project every frame.
//
// Runs once on the JS thread at startup. Kept free of React/Expo imports so it
// can be tested in plain Node.

import { geoArea, geoCentroid, geoDistance } from 'd3-geo';
import type { Feature, Geometry, MultiPolygon, Polygon, Position } from 'geojson';
import { feature } from 'topojson-client';
import { presimplify, quantile, simplify } from 'topojson-simplify';
import type { GeometryCollection, Topology } from 'topojson-specification';

import type { GlobeGeometry } from './projection';

export type CountryShape = {
  /** ISO 3166-1 numeric code from Natural Earth (falls back to the name if missing). */
  id: string;
  name: string;
  /**
   * [longitude, latitude] in degrees: centroid of the country's largest polygon, so
   * e.g. France centres on France, not between it and French Guiana. The globe turns
   * this point to face the user on selection, and the name bubble points at it.
   */
  anchor: [number, number];
  /** Angular distance (radians) from the anchor to the country's furthest point. */
  radius: number;
  /** Full-detail GeoJSON, kept for d3-geo hit-testing. */
  feature: Feature<Polygon | MultiPolygon>;
};

export type GlobeData = {
  /** Full 1:110m detail, used when zoomed in. */
  detailed: GlobeGeometry;
  /** Simplified copy (shared borders simplified once, so neighbours stay seamless). */
  simplified: GlobeGeometry;
  countries: CountryShape[];
  /**
   * Each country's anchor as a 3D unit vector (x,y,z flattened, by country index).
   * Worklets use this instead of `countries`, which is too big to copy to the UI thread.
   */
  anchorPoints: number[];
};

/** Share of the least significant border points dropped in the simplified copy. */
const SIMPLIFY_QUANTILE = 0.5;
/** Longest allowed edge in degrees. Longer edges (e.g. the US–Canada border) are
 * subdivided so they curve correctly on the sphere instead of cutting a straight chord. */
const MAX_EDGE_DEG = 5;
const DEG = Math.PI / 180;

type CountryFeature = Feature<Geometry, { name: string }>;

function countryFeatures(topology: Topology): CountryFeature[] {
  const object = topology.objects.countries as GeometryCollection<{ name: string }>;
  return feature(topology, object).features as CountryFeature[];
}

export function buildGlobeData(topology: Topology): GlobeData {
  const presimplified = presimplify(topology as Parameters<typeof presimplify>[0]);
  const simplifiedTopology = simplify(presimplified, quantile(presimplified, SIMPLIFY_QUANTILE));

  const fullFeatures = countryFeatures(topology);
  const simpleFeatures = countryFeatures(simplifiedTopology);

  // Feature order is identical in both, so feature index i maps to the same country.
  const countries: CountryShape[] = [];
  const countryIndexByFeature: number[] = [];
  fullFeatures.forEach((f) => {
    const g = f.geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) {
      countryIndexByFeature.push(-1);
      return;
    }
    const name = f.properties?.name ?? 'Unknown';
    const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const anchor = largestPolygonCentroid(polygons);
    countryIndexByFeature.push(countries.length);
    countries.push({
      id: f.id != null ? String(f.id) : name,
      name,
      anchor,
      radius: furthestPoint(anchor, polygons),
      feature: f as Feature<Polygon | MultiPolygon>,
    });
  });

  const anchorPoints: number[] = [];
  for (const { anchor } of countries) {
    const [lon, lat] = anchor;
    anchorPoints.push(
      Math.cos(lat * DEG) * Math.cos(lon * DEG),
      Math.cos(lat * DEG) * Math.sin(lon * DEG),
      Math.sin(lat * DEG),
    );
  }

  return {
    detailed: toGeometry(fullFeatures, countryIndexByFeature),
    simplified: toGeometry(simpleFeatures, countryIndexByFeature),
    countries,
    anchorPoints,
  };
}

function largestPolygonCentroid(polygons: Position[][][]): [number, number] {
  let best = polygons[0];
  let bestArea = -1;
  for (const coordinates of polygons) {
    const area = geoArea({ type: 'Polygon', coordinates });
    if (area > bestArea) {
      best = coordinates;
      bestArea = area;
    }
  }
  return geoCentroid({ type: 'Polygon', coordinates: best }) as [number, number];
}

function furthestPoint(anchor: [number, number], polygons: Position[][][]): number {
  let max = 0;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        max = Math.max(max, geoDistance(anchor, [lon, lat]));
      }
    }
  }
  return max;
}

function toGeometry(features: CountryFeature[], countryIndexByFeature: number[]): GlobeGeometry {
  const geometry: GlobeGeometry = {
    points: [],
    ringStarts: [],
    ringEnds: [],
    ringCentres: [],
    ringSinRadius: [],
    ringCountry: [],
  };

  features.forEach((f, featureIndex) => {
    const countryIndex = countryIndexByFeature[featureIndex];
    const g = f.geometry;
    if (countryIndex < 0 || !g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return;

    const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const polygon of polygons) {
      for (const ring of polygon) {
        addRing(geometry, densify(ring), countryIndex);
      }
    }
  });

  return geometry;
}

function densify(ring: number[][]): number[][] {
  const out: number[][] = [];
  // GeoJSON rings repeat the first point at the end; drop it (the path closes itself).
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    out.push([x0, y0]);
    // Polygons cut at the antimeridian jump from +180 to -180 (or along the
    // pole line); those points coincide on the sphere, so don't fill the gap.
    if (Math.abs(x1 - x0) > 180) continue;
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / MAX_EDGE_DEG);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    }
  }
  return out;
}

function addRing(geo: GlobeGeometry, ring: number[][], countryIndex: number) {
  if (ring.length < 3) return;

  const start = geo.points.length / 3;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const [lon, lat] of ring) {
    const x = Math.cos(lat * DEG) * Math.cos(lon * DEG);
    const y = Math.cos(lat * DEG) * Math.sin(lon * DEG);
    const z = Math.sin(lat * DEG);
    geo.points.push(x, y, z);
    cx += x;
    cy += y;
    cz += z;
  }

  // Bounding cap (centre + angular radius) so whole rings on the far side
  // of the globe can be skipped with one dot product per frame.
  const len = Math.hypot(cx, cy, cz);
  let sinRadius = 2; // "never cull" for rings too large to bound
  if (len > 1e-6) {
    cx /= len;
    cy /= len;
    cz /= len;
    let minDot = 1;
    for (let i = start * 3; i < geo.points.length; i += 3) {
      minDot = Math.min(minDot, cx * geo.points[i] + cy * geo.points[i + 1] + cz * geo.points[i + 2]);
    }
    const radius = Math.acos(Math.max(-1, minDot)) + 0.01;
    if (radius < Math.PI / 2) sinRadius = Math.sin(radius);
  }

  geo.ringStarts.push(start);
  geo.ringEnds.push(geo.points.length / 3);
  geo.ringCentres.push(cx, cy, cz);
  geo.ringSinRadius.push(sinRadius);
  geo.ringCountry.push(countryIndex);
}
