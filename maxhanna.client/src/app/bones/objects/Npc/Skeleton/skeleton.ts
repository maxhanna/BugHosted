import { Vector2 } from "../../../../../services/datacontracts/bones/vector2";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources"; 
import { STAND_DOWN, STAND_LEFT, STAND_RIGHT, STAND_UP, WALK_DOWN, WALK_LEFT, WALK_RIGHT, WALK_UP } from "./skeleton-animations"; 
import { Bot } from "../../Bot/bot";
import { Animations } from "../../../helpers/animations";
import { FrameIndexPattern } from "../../../../ender/helpers/frame-index-pattern";

export class Skeleton extends Bot {
  directionIndex = 0;

  constructor(params: { position: Vector2, hp?: number, level?: number  }) {
    super({
      spriteName: "skeleton",
      name: "skeleton",
      hp: params.hp ?? 1,
      level: params.level ?? 1,
      position: params.position, 
      
    });     
    this.isSolid = true;
    this.isEnemy = true;
    this.isDeployed = true;
    this.level = 1; 
    if (this.body)
      this.body.animations = new Animations({
      walkDown: new FrameIndexPattern(WALK_DOWN),
      walkUp: new FrameIndexPattern(WALK_UP),
      walkLeft: new FrameIndexPattern(WALK_LEFT),
      walkRight: new FrameIndexPattern(WALK_RIGHT),
      standDown: new FrameIndexPattern(STAND_DOWN),
      standRight: new FrameIndexPattern(STAND_RIGHT),
      standLeft: new FrameIndexPattern(STAND_LEFT),
      standUp: new FrameIndexPattern(STAND_UP),
    })

    const shadow = new Sprite({
      resource: resources.images["shadow"],
      position: new Vector2((this.body?.position?.x ?? 0) - 9, -30),
      scale: new Vector2(1.2, 1.2),
      frameSize: new Vector2(32, 32),
    });
    shadow.drawLayer = "FLOOR";
    this.addChild(shadow);    
  } 

  override getContent() {
    return {
      portraitFrame: 0,
      string: ["ZZZzzzt!"],
      addsFlag: undefined,
      canSelectItems: false
    }
  }
}
