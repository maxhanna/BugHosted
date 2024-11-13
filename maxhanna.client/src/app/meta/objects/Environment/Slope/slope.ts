import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { events } from "../../../helpers/events";
import { ColorSwap } from "../../../../../services/datacontracts/meta/color-swap";
import { UP, DOWN, LEFT, RIGHT } from "../../../helpers/grid-cells";
import { Level } from "../../Level/level";
import { Hero } from "../../Hero/hero";

export class Slope extends GameObject {
  slopeType: typeof UP | typeof DOWN | undefined; // Will increase/decrease scale depending on Slope Direction 
  slopeDirection: undefined | typeof UP | typeof DOWN | typeof LEFT | typeof RIGHT; // Direction the slope is going in
  startScale: Vector2;
  endScale: Vector2;
  slopeStepHeight: Vector2;

  constructor(params: {
    position: Vector2,
    showSprite?: boolean,
    slopeType?: typeof UP | typeof DOWN,
    slopeDirection?: typeof UP | typeof DOWN | typeof LEFT | typeof RIGHT,
    startScale?: Vector2,
    endScale?: Vector2,
    slopeStepHeight?: Vector2,
  }) {
    super({
      position: params.position, 
    });
    this.slopeType = params.slopeType ?? DOWN;
    this.slopeDirection = params.slopeDirection ?? UP;
    this.startScale = params.startScale ?? new Vector2(1, 1);
    this.endScale = params.endScale ?? new Vector2(1, 1);
    this.slopeStepHeight = params.slopeStepHeight ?? new Vector2(0.05, 0.05);

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
    events.on("HERO_POSITION", this, (hero: Hero) => {
      const roundedHeroX = Math.round(hero.destinationPosition.x);
      const roundedHeroY = Math.round(hero.destinationPosition.y);
      if (this.position.x === roundedHeroX && this.position.y === roundedHeroY) {
        //console.log("HERO_SLOPE", roundedHeroX, roundedHeroY, this.startScale);
        events.emit("HERO_SLOPE", { heroId: hero.id, slopeType: this.slopeType, slopeDirection: this.slopeDirection, startScale: this.startScale, endScale: this.endScale, slopeStepHeight: this.slopeStepHeight });
      }  
    });

    events.on("HERO_CREATED", this, (hero: Hero) => { 
      if (hero.position.x === this.position.x && hero.position.y === this.position.y) {
        console.log(`HERO_SLOPE FROM HERO_CREATED, hero.position ${hero.position}, this.startScale ${this.startScale}, this.endScale ${this.endScale}`);
        setTimeout(() => {
          events.emit("HERO_SLOPE", { heroId: hero.id, slopeType: this.slopeType, slopeDirection: this.slopeDirection, startScale: this.startScale, endScale: this.endScale, slopeStepHeight: this.slopeStepHeight });
        }, 1); //idk why but mandatory timeout here
      }
    })
  }
}
