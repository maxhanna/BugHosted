import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { events } from "../../../helpers/events";
import { ColorSwap } from "../../../../../services/datacontracts/meta/color-swap";

export class Exit extends GameObject {
  targetMap: string;
  constructor(params: { position: Vector2, showSprite?: boolean, rotation?: number, sprite?: string, targetMap?: string, colorSwap?: ColorSwap }) {
    super({
      position: params.position
    });
    const sprite = params.sprite ?? "exit2";
    this.targetMap = params.targetMap ?? "HeroRoom";

    if (params.showSprite) {
      const exitSprite = new Sprite({
        resource: resources.images[sprite],
        position: sprite === "exit2" ? new Vector2(0, -10) : new Vector2(0, 0),
        scale: sprite === "exit2" ? new Vector2(0.85, 0.85) : sprite === "white" ? new Vector2(8, 8) : undefined,
        frameSize: sprite === "exit2" ? new Vector2(42, 45) : sprite === "white" ? new Vector2(2, 2) : new Vector2(32, 32),
        colorSwap: params.colorSwap,
        name: "exit"
      });
      this.addChild(exitSprite);
    } 
  }

  override ready() {
    events.on("HERO_POSITION", this, (hero: any) => {
      const roundedHeroX = Math.round(hero.position.x);
      const roundedHeroY = Math.round(hero.position.y);
      if (this.position.x === roundedHeroX && this.position.y === roundedHeroY) {
        console.log("HERO ENTERS EXIT SPACE", this.targetMap);
        events.emit("HERO_EXITS", this.targetMap);
      }
    });
  }
}
