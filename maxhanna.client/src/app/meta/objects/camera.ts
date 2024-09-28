import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { GameObject } from "./game-object";
import { events } from "../helpers/events";
export class Camera extends GameObject {
  constructor(x: number, y: number) {
    super({ position: new Vector2(x, y) }); 


    events.on("HERO_POSITION", this, (heroPosition: any) => {
      const personHalf = 8;
      const canvasWidth = 320;
      const canvasHeight = 220;
      const halfWidth = -personHalf + (canvasWidth / 2);
      const halfHeight = -personHalf + (canvasHeight / 2);

      this.position = new Vector2(-heroPosition.x + halfWidth, -heroPosition.y + halfHeight); 
    })
  }
}
