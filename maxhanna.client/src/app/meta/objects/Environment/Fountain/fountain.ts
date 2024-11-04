import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite";
import { gridCells } from "../../../helpers/grid-cells";
import { Animations } from "../../../helpers/animations";
import { resources } from "../../../helpers/resources";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { FOUNTAIN_ANIMATION } from "./fountain-animations";
import { Npc } from "../../Npc/npc";
import { GameObject } from "../../game-object";

export class Fountain extends GameObject {  

  constructor(x: number, y: number) {
    super({ 
      position: new Vector2(x, y)
    })
   
    this.position = new Vector2(x, y);   
    this.isSolid = true;
    const body = new Sprite({
      objectId: 0,
      resource: resources.images["fountain"],
      position: new Vector2(-25, -25),
      frameSize: new Vector2(64, 55),
      hFrames: 6,
      vFrames: 1,
      animations: new Animations(
        {
          fountainAnimation: new FrameIndexPattern(FOUNTAIN_ANIMATION), 
        }), 
    });
    this.addChild(body); 
    body.animations?.play("fountainAnimation"); 
  }
   
  override getContent() {  
    return {
      portraitFrame: 0,
      string: ["What a splendid fountain!"],
      canSelectItems: false,
      addsFlag: null
    }
  }
 }
