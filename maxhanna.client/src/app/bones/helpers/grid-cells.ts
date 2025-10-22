import { Vector2 } from "../../../services/datacontracts/bones/vector2";

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
export const snapToGrid = (value: number, gridSize: number = gridCells(1)): number => { 
  if (gridSize <= 0) { 
    return 0;
  }
  if (value === 0) { 
    return 0;
  }
  return Math.round(value / gridSize) * gridSize;
}
export const isOnGrid = (position: Vector2) => {
  return (position.x % 16 == 0) && (position.y % 16 == 0);
}
