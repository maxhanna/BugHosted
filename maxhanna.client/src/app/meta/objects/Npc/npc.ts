import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { Character } from "../character";
import { Sprite } from "../sprite";
import { Scenario } from "../../helpers/story-flags";
import { DOWN, LEFT, RIGHT, UP, gridCells, snapToGrid } from "../../helpers/grid-cells";
import { MetaBot } from "../../../../services/datacontracts/meta/meta-bot";
import { hexToRgb, resources } from "../../helpers/resources";
import { ColorSwap } from "../../../../services/datacontracts/meta/color-swap";
import { Bot } from "../Bot/bot";

export class Npc extends Character {
  metabots: MetaBot[];
  type?: string;
  partnerNpcs: Npc[] = [];
  finishedMoving = false;

  moveUpDown?: number;
  moveLeftRight?: number;
  moveCounter = 0;

  constructor(config: {
    id: number,
    position: Vector2,
    textConfig?: { content?: Scenario[], portraitFrame?: number },
    type?: string,
    name?: string,
    body?: Sprite,
    partners?: Npc[],
    moveUpDown?: number
    moveLeftRight?: number,
    preventDraw?: boolean,
    preventDrawName?: boolean,
    colorSwap?: ColorSwap,
    speed?: number,
    level?: number,
    hp?: number,
  }) {
    super({
      id: config.id,
      name: config.type ?? "",
      position: config.position,
      body: config.body,
      isUserControlled: false,
      preventDraw: config.preventDraw,
    });
    this.type = config.type;
    this.id = config.id;
    this.isSolid = true;
    this.facingDirection = DOWN;
    this.position = config.position;
    this.destinationPosition = this.position.duplicate();
    this.lastPosition = this.position.duplicate();
    this.name = config.name ?? "Anon";
    this.textContent = config.textConfig?.content;
    this.textPortraitFrame = config.textConfig?.portraitFrame;
    this.metabots = [];
    this.partnerNpcs = config.partners ? config.partners : [];
    this.moveUpDown = config.moveUpDown;
    this.moveLeftRight = config.moveLeftRight;
    this.preventDraw = !!config.preventDraw;
    this.preventDrawName = config.preventDraw ?? config.preventDrawName ?? true;
    this.colorSwap = config.colorSwap;
    this.speed = config.speed ?? 1;
    this.hp = config.hp ?? 100;
    this.level = config.level ?? 1;

    if (!config.body) {
      this.body = new Sprite({ resource: resources.images["white"] });
    }

    if (this.moveUpDown || this.moveLeftRight) { 
      this.randomMove();
    }

    setTimeout(() => {
      for (let i = 0; i < this.metabots.length; i++) {
        if (this.metabots[i].isDeployed == true) {
          const bot = this.metabots[i];
          const tmpBot = new Bot({
            id: bot.id,
            heroId: this.id,
            botType: bot.type,
            name: bot.name ?? "Bot",
            position: new Vector2(snapToGrid(this.position.x + gridCells(1), gridCells(1)), snapToGrid(this.position.y + gridCells(1), gridCells(1))),
            colorSwap: this.colorSwap,
            isDeployed: true,
            isEnemy: true,
            hp: bot.hp,
            exp: bot.exp,
            expForNextLevel: bot.expForNextLevel,
            level: bot.level,
            leftArm: bot.leftArm,
            rightArm: bot.rightArm,
            head: bot.head,
            legs: bot.legs,
          });
          this.parent.addChild(tmpBot);
        }
      }
    }, 5);
  }

  private randomMove() {
    if (this.moveCounter > 40) { this.moveCounter = 0; }
    // Determine movement based on the moveCounter's current value
    switch (this.moveCounter % 4) {
      case 0:
        // Move up
        if (this.moveUpDown) {
          this.facingDirection = UP;
          this.destinationPosition.y = this.position.y - gridCells(this.moveUpDown);
        }
        break;
      case 1:
        // Move right
        if (this.moveLeftRight) {
          this.facingDirection = RIGHT;
          this.destinationPosition.x = this.position.x + gridCells(this.moveLeftRight);
        }
        break;
      case 2:
        // Move down
        if (this.moveUpDown) {
          this.facingDirection = DOWN;
          this.destinationPosition.y = this.position.y + gridCells(this.moveUpDown);
        }
        break;
      case 3:
        // Move left
        if (this.moveLeftRight) {
          this.facingDirection = LEFT;
          this.destinationPosition.x = this.position.x - gridCells(this.moveLeftRight);
        }
        break;
    }

    // Increment moveCounter to change direction on the next iteration
    this.moveCounter++;

    // Set a new random interval between 10 seconds and 25 seconds
    const newInterval = Math.max(1000, Math.floor(Math.random() * 2500));

    // Call randomMove again after `newInterval` milliseconds
    setTimeout(this.randomMove.bind(this), newInterval);
  }
}
