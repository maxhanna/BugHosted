import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { MetaHero } from "../../../../services/datacontracts/meta/meta-hero";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { Input } from "../../helpers/input";
import { DOWN, LEFT, RIGHT, UP, gridCells, isSpaceFree } from "../../helpers/grid-cells";
import { Animations } from "../../helpers/animations";
import { moveTowards } from "../../helpers/move-towards";
import { resources } from "../../helpers/resources";
import { FrameIndexPattern } from "../../helpers/frame-index-pattern";
import { events } from "../../helpers/events"; 
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP, PICK_UP_DOWN } from "./bot-animations";
import { Npc } from "../Npc/npc";
export class Bot extends Npc { 
  itemPickupShell: any;
  isLocked = false;
  constructor(params: { position: Vector2, frameNumber?: number, scale?: Vector2 }) {
    super({
      id: 0,
      position: params.position,
      type: "botFrame",
      body: new Sprite({
        resource: resources.images["botFrame" + params.frameNumber], 
        frameSize: new Vector2(32, 32),
        scale: params.scale
      })
    })  
    this.facingDirection = DOWN;    
    const shadow = new Sprite({
      resource: resources.images["shadow"],
      position: new Vector2(-16.5, -33),
      scale: new Vector2(1.5, 1.5),
      frameSize: new Vector2(32, 32),
    });
    this.addChild(shadow); 
  }  
 }
