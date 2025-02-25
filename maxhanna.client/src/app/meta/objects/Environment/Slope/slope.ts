import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { events } from "../../../helpers/events";
import { ColorSwap } from "../../../../../services/datacontracts/meta/color-swap";
import { UP, DOWN, LEFT, RIGHT } from "../../../helpers/grid-cells";
import { Level } from "../../Level/level";
import { Hero } from "../../Hero/hero";
import { Character } from "../../character";
import { isObjectNearby } from "../../../helpers/move-towards";

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
    events.on("CHARACTER_POSITION", this, (character: Character) => {
      const roundedHeroX = Math.round(character.destinationPosition.x);
      const roundedHeroY = Math.round(character.destinationPosition.y);
      if (this.position.x === roundedHeroX && this.position.y === roundedHeroY) {
        console.log("CHARACTER_SLOPE", character);

        events.emit("CHARACTER_SLOPE",
          {
            character: character,
            slopeType: this.slopeType,
            slopeDirection: this.slopeDirection,
            startScale: this.startScale,
            endScale: this.endScale,
            slopeStepHeight: this.slopeStepHeight
          });
      }  
    });

    events.on("CHARACTER_CREATED", this, (character: Character) => { 
      console.log("chracter created detected from slope");
      if (character.position.x === this.position.x && character.position.y === this.position.y) {
        console.log(`CHARACTER_SLOPE FROM CHARACTER_CREATED, hero.position ${character.position}, this.startScale ${this.startScale}, this.endScale ${this.endScale}`);
        setTimeout(() => {
          events.emit("CHARACTER_SLOPE", { character: character, slopeType: this.slopeType, slopeDirection: this.slopeDirection, startScale: this.startScale, endScale: this.endScale, slopeStepHeight: this.slopeStepHeight });
        }, 1); //idk why but mandatory timeout here
      }
    })
  }
}
