import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { Sprite } from "../../sprite";
import { DOWN } from "../../../helpers/grid-cells";
import { Animations } from "../../../helpers/animations";
import { resources } from "../../../helpers/resources";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { events } from "../../../helpers/events";
import { STING, KICK, HEADBUTT } from "../../../helpers/skill-types";
import {  } from "./spiderbot-animations"; 
import { Npc } from "../../Npc/npc";
import { Bot } from "../../Bot/bot";
import { HEAD, LEFT_ARM, LEGS, MetaBotPart, RIGHT_ARM } from "../../../../../services/datacontracts/meta/meta-bot-part";

export class Spiderbot extends Bot {
  directionIndex = 0;

  constructor(params: { position: Vector2, hp?: number, level?: number }) {
    super({
      spriteName: "spiderBot",
      hp: params.hp ?? 1,
      level: params.level ?? 1,
      position: params.position,
    }); 
    this.isSolid = true;
    this.isEnemy = true;
    const shadow = new Sprite({
      resource: resources.images["shadow"],
      position: new Vector2((this.body?.position.x ?? 0) - 9, -30), 
      frameSize: new Vector2(32, 32),
    });
    shadow.drawLayer = "FLOOR";
    this.addChild(shadow); 

    this.rightArm = new MetaBotPart({ id: 0, metabotId: this.id, damageMod: 5, skill: STING, partName: RIGHT_ARM })
    this.leftArm = new MetaBotPart({ id: 0, metabotId: this.id, damageMod: 5, skill: STING, partName: LEFT_ARM })
    this.legs = new MetaBotPart({ id: 0, metabotId: this.id, damageMod: 1, skill: KICK, partName: LEGS })
    this.head = new MetaBotPart({ id: 0, metabotId: this.id, damageMod: 1, skill: HEADBUTT, partName: HEAD })
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
