import { Vector2 } from "../../../../services/datacontracts/meta/vector2"; 
import { MetaBot } from "../../../../services/datacontracts/meta/meta-bot";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { Input } from "../../helpers/input";
import { DOWN, LEFT, RIGHT, UP, gridCells, isSpaceFree, snapToGrid } from "../../helpers/grid-cells";
import { Animations } from "../../helpers/animations";
import { moveTowards } from "../../helpers/move-towards";
import { resources } from "../../helpers/resources";
import { FrameIndexPattern } from "../../helpers/frame-index-pattern";
import { events } from "../../helpers/events"; 
import { WATER_STILL } from "./water-animations";

export class Water extends GameObject { 
  body: Sprite;  

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y)
    })
    
    this.position = new Vector2(x, y); 

    this.body = new Sprite(
      0,
      resources.images["water"],
      new Vector2(0, 0),
      new Vector2(1, 1),
      undefined,
      new Vector2(32, 32),
      16,
      1,
      new Animations(
        {
          waterStill: new FrameIndexPattern(WATER_STILL)
        })
    );
    this.addChild(this.body); 
    this.body.animations?.play("waterStill"); 
  } 
 }
