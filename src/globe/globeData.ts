import type { Topology } from 'topojson-specification';
import countries110m from 'world-atlas/countries-110m.json';

import { buildBorderLines, buildGlobeData, type GlobeData } from './geometry';
import type { GlobeGeometry } from './projection';

let cached: GlobeData | null = null;

/** Natural Earth 1:110m countries, preprocessed once (~35 ms) on first use. */
export function getGlobeData(): GlobeData {
  if (!cached) {
    cached = buildGlobeData(countries110m as unknown as Topology);
  }
  return cached;
}

let borderLines: GlobeGeometry | null = null;

/**
 * Country borders from the detailed Natural Earth 1:50m outlines, as lines for the
 * zoomed-in globe (see buildBorderLines). Built on first use (~40 ms); the 50m data
 * is only loaded then too.
 */
export function getBorderLines(): GlobeGeometry {
  if (!borderLines) {
    const countries50m = require('world-atlas/countries-50m.json') as Topology;
    borderLines = buildBorderLines(countries50m);
  }
  return borderLines;
}
