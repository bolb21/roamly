// Every country cut into small grid squares (scripts/build-globe-textures.mjs writes
// landCells.json), so close-up views can draw land as sharp vector shapes while only
// projecting the pieces near the screen.
//
// Kept free of React/Expo imports so it can be tested in plain Node.

import data from './landCells.json';

/** Longitude where the grid starts (also the flat map's left edge), and its square size. */
export const LAND_CELL_ORIGIN: number = data.origin;
export const LAND_CELL_DEG: number = data.cell;

export type LandPiece = {
  /** Index in the app's country list. */
  country: number;
  /** Grid square: x counts LAND_CELL_DEG steps east of LAND_CELL_ORIGIN (negative = west of it). */
  cellX: number;
  cellY: number;
  /** [lon, lat] points (not closed). */
  ring: number[][];
};

let pieces: LandPiece[] | null = null;

/** The decoded pieces (decoded once, on first use). */
export function getLandPieces(): LandPiece[] {
  if (!pieces) {
    pieces = (data.pieces as number[][]).map((encoded) => {
      const ring: number[][] = [];
      let x = 0;
      let y = 0;
      for (let i = 3; i < encoded.length; i += 2) {
        x += encoded[i];
        y += encoded[i + 1];
        ring.push([x / 100, y / 100]);
      }
      return {
        country: encoded[0],
        cellX: encoded[1],
        cellY: encoded[2],
        ring,
      };
    });
  }
  return pieces;
}
