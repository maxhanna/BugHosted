import { gridCells } from './grid-cells';

// Spatial index for bike walls using exact grid-aligned coordinate keys "x|y".
// Walls are static after placement; index cleared on level change.
const bikeWallCells = new Set<string>();

export function addBikeWallCell(x: number, y: number) {
  bikeWallCells.add(`${x}|${y}`);
}

export function hasBikeWallAt(x: number, y: number): boolean {
  return bikeWallCells.has(`${x}|${y}`);
}

export function clearBikeWallCells() { bikeWallCells.clear(); }

export function isNearBikeWallIndexed(position: { x: number, y: number }, radius: number = gridCells(1)): boolean {
  if (!position) return false;
  const step = gridCells(1);
  const { x, y } = position;
  for (let dx = -radius; dx <= radius; dx += step) {
    for (let dy = -radius; dy <= radius; dy += step) {
      if (hasBikeWallAt(x + dx, y + dy)) return true;
    }
  }
  return false;
}

// Backwards-compatible signature used by existing callers (ignored level arg)
export function isNearBikeWall(level: any, position: { x: number, y: number }, radius: number = gridCells(2)): boolean {
  return isNearBikeWallIndexed(position, radius);
}
