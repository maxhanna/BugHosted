 
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
}
