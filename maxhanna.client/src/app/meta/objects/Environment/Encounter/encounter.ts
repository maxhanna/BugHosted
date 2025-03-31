import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { events } from "../../../helpers/events";
import { Bot } from "../../Bot/bot";
import { Npc } from "../../Npc/npc";

export class Encounter extends Npc {
  enemy: Bot;
  lastSpawned: Date = new Date();
  possibleEnemies: string[] = [];
  directionIndex = 1;
  lastCreated = new Date();
  spawnTimeout: any;
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
  override destroy() {
    if (this.spawnTimeout) {
      clearTimeout(this.spawnTimeout);
      this.spawnTimeout = null;
    }
    super.destroy();
  }
  private spawnEnemy() {
    if (this.enemy && this.enemy.hp > 0) {
      return this.enemy;
    }

    const now = new Date();
    const elapsedTime = (now.getTime() - this.lastCreated.getTime()) / 1000; // Convert to seconds
    if (elapsedTime < 35) { 
      this.spawnTimeout = setTimeout(() => {
        this.spawnEnemy();
        this.spawnTimeout = null; // Reset after execution
      }, Math.random() * (70000 - 35000) + 35000); 
      return this.enemy;
    }

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
      preventDrawName: true,
    }); 
    this.enemy.destinationPosition = this.enemy.position;
    events.emit("CREATE_ENEMY", { bot: this.enemy, owner: this });
    this.lastCreated = new Date();
    return this.enemy;
  }

  override ready() {
    events.on("BOT_DESTROYED", this, (params: Bot) => {
      if (params?.heroId === this.id) { 
        this.spawnTimeout = setTimeout(() => {
          this.spawnEnemy();
          this.spawnTimeout = null; 
        }, Math.random() * (70000 - 35000) + 35000); 
      }
    });
  }
}
