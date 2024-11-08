import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { events } from "../../../helpers/events";
import { ColorSwap } from "../../../../../services/datacontracts/meta/color-swap";
import { UP, DOWN, LEFT, RIGHT } from "../../../helpers/grid-cells";

export class Slope extends GameObject {
  slopeType: typeof UP | typeof DOWN | undefined;
  slopeDirection: undefined | typeof UP | typeof DOWN | typeof LEFT | typeof RIGHT;
  constructor(params: { position: Vector2, showSprite?: boolean, slopeType?: typeof UP | typeof DOWN, slopeDirection?: typeof UP | typeof DOWN | typeof LEFT | typeof RIGHT }) {
    super({
      position: params.position, 
    });
    this.slopeType = params.slopeType ?? DOWN;
    this.slopeDirection = params.slopeDirection ?? UP;

    if (params.showSprite) {
      const slopeSprite = new Sprite({
        resource: resources.images["white"],
        position: new Vector2(0, 0),
        scale: new Vector2(8, 8),
        frameSize: new Vector2(2, 2),
        colorSwap: new ColorSwap([255, 255, 255], [0, 0, 0]),
        name: "slope"
      });
      this.addChild(slopeSprite);
    } 
  }

  override ready() {
    events.on("HERO_POSITION", this, (hero: any) => {
      const roundedHeroX = Math.round(hero.position.x);
      const roundedHeroY = Math.round(hero.position.y);
      if (this.position.x === roundedHeroX && this.position.y === roundedHeroY) {
        console.log("HERO_SLOPE", roundedHeroX, roundedHeroY);
        events.emit("HERO_SLOPE", { heroId: hero.id, slopeType: this.slopeType, slopeDirection: this.slopeDirection });
      }  
    });
  }
}
