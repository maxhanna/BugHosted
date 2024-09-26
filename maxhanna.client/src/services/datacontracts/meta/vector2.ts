 
export class Vector2 {
  x:number;
  y: number;
  constructor(x:number, y:number) {
  this.x = x;
  this.y = y;
  }

  duplicate() {
    return new Vector2(this.x, this.y);
  }
}
