import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { MetaHero } from "../../../../services/datacontracts/meta/meta-hero";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { Input } from "../../helpers/input";
import { SkillType } from "../../helpers/skill-types";
import { DOWN, LEFT, RIGHT, UP, gridCells, isSpaceFree } from "../../helpers/grid-cells";
import { Animations } from "../../helpers/animations";
import { moveTowards } from "../../helpers/move-towards";
import { resources } from "../../helpers/resources";
import { FrameIndexPattern } from "../../helpers/frame-index-pattern";
import { events } from "../../helpers/events";
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP, PICK_UP_DOWN } from "./bot-animations";
import { Npc } from "../Npc/npc"; 
import { MetaBotPart } from "../../../../services/datacontracts/meta/meta-bot-part";
export class Bot extends Npc {
  botType: number;
  botLevel: number;
  botHp: number;
  leftArm?: MetaBotPart;
  rightArm?: MetaBotPart;
  legs?: MetaBotPart;
  head?: MetaBotPart;

  constructor(params: { position: Vector2, spriteName?: string, scale?: Vector2, level?: number, hp?: number, leftArm?: MetaBotPart, rightArm?: MetaBotPart, legs?: MetaBotPart, head?: MetaBotPart, offsetX?: number, offsetY?: number }) {
    super({
      id: Math.floor(Math.random() * (-9999 + 1000)) - 1000,
      position: params.position,
      type: params.spriteName ?? "botFrame",
      body: new Sprite({
        resource: resources.images[params.spriteName ?? "botFrame"],
        frameSize: params.spriteName == "white" ? new Vector2(0, 0) : new Vector2(32, 32),
        scale: params.scale,
        position: new Vector2(-7, -20),
        offsetX: (params.offsetX ?? 0),
        offsetY: (params.offsetY ?? 0),
      })
    })
    this.facingDirection = DOWN;
    this.botType = this.getBotType();
    this.botLevel = params.level ?? 1;
    this.botHp = params.hp ?? 1;
    this.leftArm = params.leftArm;
    this.rightArm = params.rightArm;
    this.head = params.head;
    this.legs = params.legs;

    if (this.type != "white") {
      const shadow = new Sprite({
        resource: resources.images["shadow"],
        position: new Vector2(-10.5 - (params.offsetX ?? 0), -38 + (params.offsetY ?? 0) * 3),
        scale: new Vector2(1.5, 1.5),
        frameSize: new Vector2(32, 32),
      });
      this.addChild(shadow);
    }
   
  }


  private getBotType() {
    let bType = SkillType.SPEED;
    if (this.type == "armobot") {
      bType = SkillType.STRENGTH;
    } else if (this.type == "spiderBot") {
      bType == SkillType.SPEED;
    }
    return bType;
  }
}

