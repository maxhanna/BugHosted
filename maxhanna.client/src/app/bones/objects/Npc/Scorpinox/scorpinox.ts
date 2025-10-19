import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { FLARE } from "../../../helpers/skill-types";
import {  } from "./scorpinox-animations"; 
import { Bot } from "../../Bot/bot";
import { HEAD, LEFT_ARM, LEGS, MetaBotPart, RIGHT_ARM } from "../../../../../services/datacontracts/meta/meta-bot-part";

export class Scorpinox extends Bot {
  directionIndex = 0;

  constructor(params: { position: Vector2, hp?: number, level?: number  }) {
    super({
      spriteName: "scorpinox",
      name: "scorpinox",
      hp: params.hp ?? 1,
      level: params.level ?? 1,
      position: params.position, 
    }); 
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
      string: ["Waaaasszzzzzzzz!"],
      addsFlag: undefined,
      canSelectItems: false
    }
  }
}
