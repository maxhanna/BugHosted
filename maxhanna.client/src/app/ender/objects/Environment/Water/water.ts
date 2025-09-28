import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";  
import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite"; 
import { Animations } from "../../../helpers/animations"; 
import { resources } from "../../../helpers/resources";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";  
import { WATER_STILL } from "./water-animations";

export class Water extends GameObject { 
  body: Sprite;  

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y)
    })
    
    this.position = new Vector2(x, y); 

    this.body = new Sprite({
      resource: resources.images["water"],
      frameSize: new Vector2(32, 32),
      hFrames: 16,
      vFrames: 1,
      animations: new Animations(
        {
          waterStill: new FrameIndexPattern(WATER_STILL)
        })
    });
    this.addChild(this.body); 
    this.body.animations?.play("waterStill"); 
  } 
 }
