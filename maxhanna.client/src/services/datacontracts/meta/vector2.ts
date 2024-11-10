import { gridCells, UP, DOWN, LEFT, RIGHT } from "../../../app/meta/helpers/grid-cells";

 
export class Vector2 {
  x:number;
  y: number;
  constructor(x:number, y:number) {
  this.x = x;
  this.y = y;
  }

  duplicate() {
    return new Vector2(parseInt(this.x.toFixed(0)), parseInt(this.y.toFixed(0)));
  }

  matches(otherVector2: Vector2) {
    return this.x === otherVector2.x && this.y === otherVector2.y;
  }

  toNeighbour(dir: string) {
    let x = this.x;
    let y = this.y;
    const gridCell = gridCells(1);
    if (dir === LEFT) {
      x -= gridCell;
    }
    if (dir === RIGHT) {
      x += gridCell;
    }
    if (dir === UP) {
      y -= gridCell;
    }
    if (dir === DOWN) {
      y += gridCell;
    }
    return new Vector2(x, y);
  }

  toString() {
    return `{${this.x},${this.y}}`;
  }
}
