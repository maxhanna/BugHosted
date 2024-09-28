import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { resources } from "../../helpers/resources";
import { events } from "../../helpers/events";

export class Watch extends GameObject {
  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y)
    });

    const sprite = new Sprite(
      0,
      resources.images["watch"],
      new Vector2(0, -10),
      0.85,
      0,
      new Vector2(22, 24),
      0,
      0,
      undefined
    );
    this.addChild(sprite);
      
  }

  override ready() {
    console.log("Watch is ready!");
    events.on("HERO_POSITION", this, (pos: any) => {
      const roundedHeroX = Math.round(pos.x);
      const roundedHeroY = Math.round(pos.y);
      if (this.position.x === roundedHeroX && this.position.y === roundedHeroY) {
        this.onCollideWithHero();
      }
    });
  }

  onCollideWithHero() {
    //remove this instance from scene
    this.destroy();
    events.emit("HERO_PICKS_UP_ITEM", {
      image: resources.images["watch"],
      position: this.position,
    });
    //alert other things we picked up a rod

  }
}
