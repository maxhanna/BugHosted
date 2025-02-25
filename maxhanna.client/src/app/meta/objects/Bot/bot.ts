import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { MetaHero } from "../../../../services/datacontracts/meta/meta-hero";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { Input } from "../../helpers/input";
import { SkillType } from "../../helpers/skill-types";
import { DOWN, LEFT, RIGHT, UP, gridCells, isSpaceFree } from "../../helpers/grid-cells";
import { Animations } from "../../helpers/animations";
import { isObjectInRange, isObjectNearby, moveTowards } from "../../helpers/move-towards";
import { resources } from "../../helpers/resources";
import { FrameIndexPattern } from "../../helpers/frame-index-pattern";
import { events } from "../../helpers/events";
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP, PICK_UP_DOWN } from "./bot-animations";
import { Npc } from "../Npc/npc";
import { MetaBotPart } from "../../../../services/datacontracts/meta/meta-bot-part";
import { ColorSwap } from "../../../../services/datacontracts/meta/color-swap";
import { Hero } from "../Hero/hero";
import { Character } from "../character";
export class Bot extends Npc {
  heroId?: number;
  botType: number;
  botLevel: number;

  previousHeroPosition?: Vector2;
  leftArm?: MetaBotPart;
  rightArm?: MetaBotPart;
  legs?: MetaBotPart;
  head?: MetaBotPart;
  isDeployed? = false;
  isEnemy = false;
  targetedBy: Set<Bot> = new Set();
  targeting: Set<Bot> = new Set();
  lastAttack = new Date();


  constructor(params: {
    position: Vector2, id?: number, heroId?: number,
    botType?: number, name?: string, spriteName?: string,
    scale?: Vector2, level?: number, hp?: number,
    leftArm?: MetaBotPart, rightArm?: MetaBotPart,
    legs?: MetaBotPart, head?: MetaBotPart,
    offsetX?: number, offsetY?: number, colorSwap?: ColorSwap,
    isDeployed?: boolean,
  }) {
    super({
      id: params.id ?? Math.floor(Math.random() * (-9999 + 1000)) - 1000,
      position: params.position,
      type: params.spriteName ?? "botFrame",
      colorSwap: params.colorSwap,
      speed: 1,
      name: "Bot",
      body: new Sprite({
        resource: resources.images[params.spriteName ?? "botFrame"],
        frameSize: params.spriteName == "white" ? new Vector2(0, 0) : new Vector2(32, 32),
        scale: params.scale,
        position: new Vector2(-7, -20),
        offsetX: (params.offsetX ?? 0),
        offsetY: (params.offsetY ?? 0),
        colorSwap: params.colorSwap,
        hFrames: params.spriteName == "botFrame" ? 4 : 1,
        vFrames: params.spriteName == "botFrame" ? 4 : 1,
        animations: new Animations(
          {
            walkDown: new FrameIndexPattern(WALK_DOWN),
            walkUp: new FrameIndexPattern(WALK_UP),
            walkLeft: new FrameIndexPattern(WALK_LEFT),
            walkRight: new FrameIndexPattern(WALK_RIGHT),
            standDown: new FrameIndexPattern(STAND_DOWN),
            standRight: new FrameIndexPattern(STAND_RIGHT),
            standLeft: new FrameIndexPattern(STAND_LEFT),
            standUp: new FrameIndexPattern(STAND_UP),
            pickupDown: new FrameIndexPattern(PICK_UP_DOWN),
          })
      })
    });
    this.heroId = params.heroId;
    this.facingDirection = DOWN;
    this.botType = params.botType ?? this.getBotType();
    this.botLevel = params.level ?? 1;
    this.hp = params.hp ?? 1;
    this.leftArm = params.leftArm;
    this.rightArm = params.rightArm;
    this.head = params.head;
    this.legs = params.legs;
    this.name = params.name ?? "Anon";
    this.isDeployed = params.isDeployed;
 

    if (this.type != "white") {
      const bodyScale = params.scale ?? new Vector2(1, 1);
      const shadowScale = new Vector2(bodyScale.x, bodyScale.y);

      const shadow = new Sprite({
        resource: resources.images["shadow"],
        position: new Vector2(-7 + (params.offsetX ?? 0), -20 + (params.offsetY ?? 0)),
        scale: shadowScale,
        frameSize: new Vector2(32, 32),
      });
      this.addChild(shadow);
    }

    this.setupEvents();
  } 


  override ready() { 
    events.on("CHARACTER_POSITION", this, (hero: Character) => {
      if (hero.id === this.heroId) {
        this.followHero(hero);
      }
      if (hero.id == this.id) {
        const nearby = isObjectInRange(this);
        let nearest = null;
        if (nearby && nearby.length > 0) {
          nearest = nearby.some((obj: any) => obj.isEnemy == true); 
        } else if (nearby) {
          nearest = nearby;
        }
        if (nearest) {
          this.targeting.add(nearest);
					nearest.targetedBy.add(this);
        } 
      }
    });
  }

  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {  
    this.drawHP(ctx, drawPosX, drawPosY); 
  }

  override step(delta: number, root: any) {
    super.step(delta, root);
    if (this.targeting) {
      this.targeting.forEach((target: Bot) => {
        if (target.hp <= 0) {
          this.targeting.delete(target);
          target.targetedBy.delete(this);
          target.destroy();
          console.log(target.name + " has been destroyed!");
        } else {
          if (this.lastAttack.getTime() + 1000 < new Date().getTime()) {
            console.log("attacking!");
            this.attack(target);
          }
        }
			}); 
    }
  }

  attack(target: Bot) {
    console.log(this, target);
		if (this.leftArm) { 
			const damage = this.botLevel; 
      target.hp -= this.leftArm.damageMod * damage; 
		}
  };


  private followHero(hero: Character) { 
    if ((hero.distanceLeftToTravel ?? 0) < 15 && this.heroId === hero.id && this.isDeployed) {
      const directionX = hero.position.x - (this.previousHeroPosition?.x ?? this.position.x);
      const directionY = hero.position.y - (this.previousHeroPosition?.y ?? this.position.y);
      const distanceFromHero = gridCells(2);
      let newX = hero.position.x;
      let newY = hero.position.y; 

      //console.log(this.body?.animations?.activeKey);
      // Move bot to always be behind the hero based on their movement direction
      if (Math.abs(directionX) > Math.abs(directionY)) {
        // Hero is primarily moving horizontally
        if (directionX > 0) {
          // Hero moved RIGHT → Bot should be to the LEFT
          newX = hero.position.x - distanceFromHero;
          newY = hero.position.y; // Stay aligned vertically
        } else if (directionX < 0) {
          // Hero moved LEFT → Bot should be to the RIGHT
          newX = hero.position.x + distanceFromHero;
          newY = hero.position.y;
        }
      } else {
        // Hero is primarily moving vertically
        if (directionY > 0) {
          // Hero moved DOWN → Bot should be ABOVE
          newX = hero.position.x; // Stay aligned horizontally
          newY = hero.position.y - distanceFromHero;
        } else if (directionY < 0) {
          // Hero moved UP → Bot should be BELOW
          newX = hero.position.x;
          newY = hero.position.y + distanceFromHero;
        }
      }

      // Update the bot's destination position
      this.destinationPosition = new Vector2(newX, newY);

      // Store hero's last position to track movement direction
      this.previousHeroPosition = new Vector2(hero.position.x, hero.position.y);
     // console.log(this.destinationPosition);
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

