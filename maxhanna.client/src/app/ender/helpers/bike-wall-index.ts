const bikeWallCells = new Set<string>();

export function addBikeWallCell(x: number, y: number, ownerId?: number) {
  const key = `${x}|${y}|${ownerId}`;
  bikeWallCells.add(key); 
} 
export function clearBikeWallCells() {
  bikeWallCells.clear(); 
} 

// Remove all bike wall cells associated with a given hero id. Returns array of removed keys.
export function removeBikeWallsForHero(ownerId: number): string[] {
  const removed: string[] = [];
  if (!ownerId) return removed;
  const set = Array.from(bikeWallCells).filter(key => key.endsWith(`|${ownerId}`));
  if (!set) return removed;
  for (const key of Array.from(set)) {
    bikeWallCells.delete(key);
    removed.push(key);
  } 
  return removed;
}
