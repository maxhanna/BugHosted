import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { POUND,KICK,HEADBUTT } from "../../../helpers/skill-types";
import {  } from "./armobot-animations"; 
import { Bot } from "../../Bot/bot";
import { HEAD, LEFT_ARM, LEGS, MetaBotPart, RIGHT_ARM } from "../../../../../services/datacontracts/meta/meta-bot-part";

export class Armobot extends Bot {
  directionIndex = 0;

  constructor(params: { position: Vector2, hp?: number, level?: number  }) {
    super({
      spriteName: "armobot",
      name: "armobot",
      hp: params.hp ?? 1,
      level: params.level ?? 1,
      position: params.position, 
    });
    this.rightArm = new MetaBotPart({ id: 0, metabotId: this.id, damageMod: 5, skill: POUND, partName: RIGHT_ARM })
    this.leftArm = new MetaBotPart({ id: 0, metabotId: this.id, damageMod: 5, skill: POUND, partName: LEFT_ARM })
    this.legs = new MetaBotPart({ id: 0, metabotId: this.id, damageMod: 1, skill: KICK, partName: LEGS })
    this.head = new MetaBotPart({ id: 0, metabotId: this.id, damageMod: 1, skill: HEADBUTT, partName: HEAD }) 
    this.isSolid = true;
    this.isEnemy = true;
    this.isDeployed = true;
    this.level = 1;

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
