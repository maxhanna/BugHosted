import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { START_FIGHT, Scenario } from "../../../helpers/story-flags";
import { MetaBot } from "../../../../../services/datacontracts/meta/meta-bot";
import { events } from "../../../helpers/events";
import { Hero } from "../../Hero/hero";
import { Bot } from "../../Bot/bot";
import { Npc } from "../../Npc/npc";

export class RandomEncounter extends Npc {

  constructor(params: { position: Vector2, possibleEnemies: Bot[] }) {
    const enemy = params.possibleEnemies[Math.floor(Math.random() * params.possibleEnemies.length)]; 
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
    const enemyMetabot = new MetaBot(
      {
        id: Math.floor(Math.random() * (-9999 + 1000)) - 1000,
        heroId: this.id,
        type: enemy.botType,
        name: "botFrame",
        position: new Vector2(0, 0),
        spriteName: "botFrame",
        leftArm: enemy.leftArm,
        rightArm: enemy.rightArm,
        legs: enemy.legs,
        head: enemy.head
      }
    );
    enemyMetabot.hp = enemy.hp;
    enemyMetabot.level = enemy.botLevel;

    this.metabots.push(enemyMetabot);
    this.isSolid = false;
    this.textContent = [
      {
        string: ["A random encounter!"],
        addsFlag: START_FIGHT,
      } as Scenario
    ];

  }

  override ready() {
    events.on("CHARACTER_POSITION", this, (hero: Hero) => {
      if (hero.position.matches(this.position)) {
        events.emit("HERO_REQUESTS_ACTION", this);
      }
    });
  }
}
