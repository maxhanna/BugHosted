import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { START_FIGHT, Scenario } from "../../../helpers/story-flags";
import { MetaBot } from "../../../../../services/datacontracts/meta/meta-bot";
import { events } from "../../../helpers/events";
import { Hero } from "../../Hero/hero";
import { Bot } from "../../Bot/bot";
import { Npc } from "../../Npc/npc";
import { Character } from "../../character";

export class RandomEncounter extends Npc {
  enemy?: Bot;
  constructor(params: { position: Vector2, possibleEnemies: string[] }) {
    super({
      id: 12313213,
      position: params.position, 
    }); 
    this.body = new Sprite({
      objectId: Math.floor(Math.random() * (-9999 + 1000)) - 1000,
      resource: resources.images["white"],
      position: new Vector2(-7, -10),
      frameSize: new Vector2(0, 0),
      hFrames: 1,
      vFrames: 1,
    }); 
    this.addChild(this.body);
    const randomSprite = params.possibleEnemies[Math.floor(Math.random() * params.possibleEnemies.length)];
    const tmpEnemy = new Bot({
      position: this.position,
      name: randomSprite,
      hp: 100,
      level: 1,
      exp: 5,
      id: 10000000,
      isDeployed: true,
      isEnemy: true,
      spriteName: randomSprite,
    });
    this.addChild(tmpEnemy); 

    this.isSolid = false; 

  }

  override ready() { 
    events.emit("CREATE_ENEMY", this.enemy)
  }
}
