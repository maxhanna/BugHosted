import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { Sprite } from "../../sprite";
import { gridCells } from "../../../helpers/grid-cells";
import { Animations } from "../../../helpers/animations";
import { resources } from "../../../helpers/resources";
import { START_FIGHT, Scenario } from "../../../helpers/story-flags";
import { Npc } from "../../Npc/npc";
import { Spiderbot } from "../../Npc/Spiderbot/spiderbot";
import { MetaBot } from "../../../../../services/datacontracts/meta/meta-bot";
import { events } from "../../../helpers/events";
import { Hero } from "../../Hero/hero";
import { Bot } from "../../Bot/bot";

export class RandomEncounter extends Bot {

  constructor(params: { position: Vector2, possibleEnemies: Bot[] }) {
    const enemy = params.possibleEnemies[Math.floor(Math.random() * params.possibleEnemies.length)]; 
    super({
      position: params.position, spriteName: "white", 
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
        name: enemy.type ?? "botFrame",
        position: new Vector2(0, 0),
        spriteName: enemy.type,
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
