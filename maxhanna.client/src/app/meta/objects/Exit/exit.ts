import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { resources } from "../../helpers/resources";
import { events } from "../../helpers/events";

export class Exit extends GameObject {
  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y)
    });
    this.addChild(new Sprite(
      0,
      resources.images["exit"]
    ));
  }

  override ready() {
    events.on("HERO_POSITION", this, (pos: any) => {
      const roundedHeroX = Math.round(pos.x);
      const roundedHeroY = Math.round(pos.y);
      if (this.position.x === roundedHeroX && this.position.y === roundedHeroY) {
        console.log("HERO ENTERS EXIT SPACE");
        events.emit("HERO_EXITS");
      }
    });
  }
}
