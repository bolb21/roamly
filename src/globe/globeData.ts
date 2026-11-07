import type { Topology } from 'topojson-specification';
import countries110m from 'world-atlas/countries-110m.json';
import countries50m from 'world-atlas/countries-50m.json';

import countryList from './countryList.json';
import {
  buildBorderLines,
  buildGlobeDataFromList,
  type CountryInfo,
  type GlobeData,
} from './geometry';
import type { GlobeGeometry } from './projection';

let cached: GlobeData | null = null;

/**
 * Every Natural Earth 1:50m country and territory (241, including microstates like
 * Andorra), with anchors precomputed in countryList.json. The vector globe draws the
 * lighter 1:110m outlines. Built once on first use.
 */
export function getGlobeData(): GlobeData {
  if (!cached) {
    cached = buildGlobeDataFromList(
      countryList as CountryInfo[],
      countries50m as unknown as Topology,
      countries110m as unknown as Topology,
    );
  }
  return cached;
}

let borderLines: GlobeGeometry | null = null;

/**
 * Country borders from the detailed Natural Earth 1:50m outlines, as lines for the
 * zoomed-in globe (see buildBorderLines). Built on first use (~40 ms).
 */
export function getBorderLines(): GlobeGeometry {
  if (!borderLines) {
    borderLines = buildBorderLines(countries50m as unknown as Topology);
  }
  return borderLines;
}
