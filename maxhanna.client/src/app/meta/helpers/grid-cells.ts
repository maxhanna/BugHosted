export const gridCells = (n: number) => {
  return n * 16;
}
export const UP = "UP";
export const DOWN = "DOWN";
export const LEFT = "LEFT";
export const RIGHT = "RIGHT";

export const isSpaceFree = (walls: any, x: number, y: number) => {
  return !walls.has(`${x},${y}`);
}
export const snapToGrid = (value: number, gridSize: number): number => {
  console.log(value);
  if (gridSize <= 0) { 
    return 0;
  }
  if (value === 0) { 
    return 0;
  }
  return Math.round(value / gridSize) * gridSize;
}
