
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
