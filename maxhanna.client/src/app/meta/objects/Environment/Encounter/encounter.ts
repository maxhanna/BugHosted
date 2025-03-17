import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { events } from "../../../helpers/events";
import { Bot } from "../../Bot/bot";
import { Npc } from "../../Npc/npc";

export class RandomEncounter extends Npc {
  enemy: Bot;
  lastSpawned: Date = new Date();
  possibleEnemies: string[] = [];
  directionIndex = 1; 
  constructor(params: {
    id: number,
    position: Vector2,
    possibleEnemies: string[],
    moveLeftRight?: number,
    moveUpDown?: number,
    level?: number,
    hp?: number,
  }) {
    super({
      id: params.id,
      position: params.position,
      moveLeftRight: params.moveLeftRight,
      moveUpDown: params.moveUpDown,  
    });
    this.hp = params.hp ?? 100;
    this.level = params.level ?? 1;
    this.possibleEnemies = params.possibleEnemies;
    this.enemy = this.spawnEnemy();  
    this.isSolid = false; 
  }

  private spawnEnemy() {
    const randomSprite = this.possibleEnemies[Math.floor(Math.random() * this.possibleEnemies.length)];
    this.enemy = new Bot({
      position: this.position,
      heroId: this.id,
      name: randomSprite,
      hp: this.hp,
      level: this.level,
      id: Math.floor(Math.random() * (9999 + 1000)),
      isDeployed: true,
      isSolid: true,
      isEnemy: true,
      spriteName: randomSprite,
    }); 
    this.enemy.destinationPosition = this.enemy.position;
    events.emit("CREATE_ENEMY", { bot: this.enemy });
    return this.enemy;
  }

  override ready() {
    events.on("BOT_DESTROYED", this, (params: Bot ) => {
      if (params?.heroId === this.id) {
        console.log("bot was destroyed, ", params);
        setTimeout(() => {
          this.spawnEnemy()
        }, 15000);
      }
    });
  }
}
