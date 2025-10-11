import { gridCells } from './grid-cells';

// Spatial index for bike walls using exact grid-aligned coordinate keys "x|y".
// We track a mapping from cell key -> ownerHeroId, and ownerHeroId -> set of cell keys
// so we can efficiently remove all walls for a hero when they die.
const bikeWallCellToOwner = new Map<string, number>();
const ownerToBikeWallCells = new Map<number, Set<string>>();

export function addBikeWallCell(x: number, y: number, ownerId?: number) {
  const key = `${x}|${y}`;
  bikeWallCellToOwner.set(key, ownerId ?? 0);
  if (ownerId && ownerId > 0) {
    if (!ownerToBikeWallCells.has(ownerId)) ownerToBikeWallCells.set(ownerId, new Set<string>());
    ownerToBikeWallCells.get(ownerId)!.add(key);
  }
}

export function hasBikeWallAt(x: number, y: number): boolean {
  return bikeWallCellToOwner.has(`${x}|${y}`);
}

export function clearBikeWallCells() {
  bikeWallCellToOwner.clear();
  ownerToBikeWallCells.clear();
}

export function removeBikeWallCell(x: number, y: number) {
  const key = `${x}|${y}`;
  const owner = bikeWallCellToOwner.get(key);
  bikeWallCellToOwner.delete(key);
  if (owner && ownerToBikeWallCells.has(owner)) {
    ownerToBikeWallCells.get(owner)!.delete(key);
    if (ownerToBikeWallCells.get(owner)!.size === 0) ownerToBikeWallCells.delete(owner);
  }
}

// Remove all bike wall cells associated with a given hero id. Returns array of removed keys.
export function removeBikeWallsForHero(ownerId: number): string[] {
  const removed: string[] = [];
  if (!ownerId) return removed;
  const set = ownerToBikeWallCells.get(ownerId);
  if (!set) return removed;
  for (const key of Array.from(set)) {
    bikeWallCellToOwner.delete(key);
    removed.push(key);
  }
  ownerToBikeWallCells.delete(ownerId);
  return removed;
}
