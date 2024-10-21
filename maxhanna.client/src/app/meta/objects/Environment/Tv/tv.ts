import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite";
import { DOWN, gridCells } from "../../../helpers/grid-cells";
import { Animations } from "../../../helpers/animations";
import { resources } from "../../../helpers/resources";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { TV_ANIMATION } from "./tv-animations";
import { Npc } from "../../Npc/npc";
import { GameObject } from "../../game-object";

export class Tv extends GameObject {  
 
  constructor(params: { position: Vector2, spritePosition?: Vector2 }) {
    super({
      position: params.position
    }) 
    const tvBody = new Sprite({
      objectId: 0,
      resource: resources.images["tv"],
      position: params.spritePosition ? params.spritePosition : new Vector2(0, 0),
      frameSize: new Vector2(29, 28),
      hFrames: 4,
      vFrames: 1,
      animations: new Animations(
        {
          tvAnimate: new FrameIndexPattern(TV_ANIMATION), 
        })
    });
    this.addChild(tvBody); 
    tvBody.animations?.play("tvAnimate"); 
  } 
 }
