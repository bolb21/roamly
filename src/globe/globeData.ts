import type { Topology } from 'topojson-specification';
import countries110m from 'world-atlas/countries-110m.json';

import { buildGlobeData, type GlobeData } from './geometry';

let cached: GlobeData | null = null;

/** Natural Earth 1:110m countries, preprocessed once (~35 ms) on first use. */
export function getGlobeData(): GlobeData {
  if (!cached) {
    cached = buildGlobeData(countries110m as unknown as Topology);
  }
  return cached;
}
