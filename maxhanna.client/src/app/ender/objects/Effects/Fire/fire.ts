import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { GameObject, HUD } from "../../game-object";
import { Animations } from "../../../helpers/animations";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { BURN_ANIMATION } from "./fire-animations"; 

export class Fire extends GameObject {  
  body?: Sprite;

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y),
      name: "Fire",
    })

    this.body = new Sprite({
      objectId: Math.floor(Math.random() * (9999)) * -1,
      resource: resources.images["groundFire"],
      name: "FireB", 
      frameSize: new Vector2(32, 32), 
      vFrames: 1,
      hFrames: 4,
      offsetY: -10,
      isSolid: true,
      animations: new Animations({
        burnAnimation: new FrameIndexPattern(BURN_ANIMATION),
      }),  
    });
    this.addChild(this.body);  
    this.body.animations?.play("burnAnimation");
  } 
 }
