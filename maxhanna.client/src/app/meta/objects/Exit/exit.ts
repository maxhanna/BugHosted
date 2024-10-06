import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { resources } from "../../helpers/resources";
import { events } from "../../helpers/events";

export class Exit extends GameObject {
  targetMap = "HeroRoom";
  constructor(x: number, y: number, showSprite = true, rotation = 0, sprite = "exit2", targetMap = "HeroRoom") {
    super({
      position: new Vector2(x, y)
    });
    if (showSprite) {
      const exitSprite = new Sprite(
        0,
        resources.images[sprite],
        sprite == "exit2" ? new Vector2(0, -10) : new Vector2(0, 0),
        new Vector2(0.85, 0.85),
        undefined,
        new Vector2(42, 45),
      );
      exitSprite.rotation = rotation;

      this.addChild(exitSprite);
    }
    this.drawLayer = "FLOOR";
  }

  override ready() {
    events.on("HERO_POSITION", this, (hero: any) => {
      const roundedHeroX = Math.round(hero.position.x);
      const roundedHeroY = Math.round(hero.position.y);
      if (this.position.x === roundedHeroX && this.position.y === roundedHeroY) {
        console.log("HERO ENTERS EXIT SPACE");
        events.emit("HERO_EXITS", this.targetMap);
      }
    });
  }
}
