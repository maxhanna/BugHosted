import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { GameObject } from "./game-object";
import { events } from "../helpers/events";
import { Level } from "./Level/level";
export class Camera extends GameObject {
  constructor(x: number, y: number) {
    super({ position: new Vector2(x, y) }); 


    events.on("HERO_POSITION", this, (hero: any) => {
      this.centerPositionOnTarget(hero.position);
    })

    events.on("CHANGE_LEVEL", this, (newLevelInstance: Level) => { 
      this.centerPositionOnTarget(newLevelInstance.getDefaultHeroPosition()); 
    })
  }
  centerPositionOnTarget(pos: Vector2) {
    const personHalf = 8;
    const canvasWidth = 320;
    const canvasHeight = 220;
    const halfWidth = -personHalf + (canvasWidth / 2);
    const halfHeight = -personHalf + (canvasHeight / 2);
    this.position = new Vector2(
      -pos.x + halfWidth,
      -pos.y + halfHeight
    );
  }
}
