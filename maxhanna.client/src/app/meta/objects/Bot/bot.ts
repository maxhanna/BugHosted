import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { Sprite } from "../sprite";
import { Fire } from "../Effects/Fire/fire";
import { SkillType } from "../../helpers/skill-types";
import { DOWN, gridCells } from "../../helpers/grid-cells";
import { Animations } from "../../helpers/animations";
import { getBotsInRange } from "../../helpers/move-towards";
import { resources } from "../../helpers/resources";
import { FrameIndexPattern } from "../../helpers/frame-index-pattern";
import { events } from "../../helpers/events";
import { attack, findTargets, untarget } from "../../helpers/fight";
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP, PICK_UP_DOWN, ATTACK_LEFT, ATTACK_UP, ATTACK_DOWN, ATTACK_RIGHT } from "./bot-animations";
import { MetaBotPart } from "../../../../services/datacontracts/meta/meta-bot-part";
import { ColorSwap } from "../../../../services/datacontracts/meta/color-swap";
import { Character } from "../character";
import { Hero } from "../Hero/hero";
import { Scenario } from "../../helpers/story-flags";

export class Bot extends Character {
  heroId?: number;
  botType: SkillType.NORMAL | SkillType.SPEED | SkillType.STRENGTH | SkillType.ARMOR | SkillType.RANGED | SkillType.STEALTH | SkillType.INTELLIGENCE;

  previousHeroPosition?: Vector2;
  leftArm?: MetaBotPart;
  rightArm?: MetaBotPart;
  legs?: MetaBotPart;
  head?: MetaBotPart;
  isDeployed? = false;
  isEnemy = true;
  targeting?: Bot = undefined;
  chasing?: Character = undefined;
  lastAttack = new Date();
  lastAttackPart?: MetaBotPart;
  lastTargetDate = new Date(); 
  isInvulnerable = false;
  preventDestroyAnimation = false;
  canAttack = true; 
  partyMembers?: { heroId: number, name: string }[];
  frameMap = {
    "Jaguar": "botFrame1",
    "Ram": "botFrame5",
    "Bee": "botFrame7",
  }
  private chaseDebounceTimer: any;
  chaseCancelBlock = new Date();

  private targetingInterval?: any;

  constructor(params: {
    position: Vector2,
    partyMembers?: { heroId: number, name: string }[],
    id?: number,
    heroId?: number,
    botType?: number,
    name?: string,
    spriteName?: string,
    scale?: Vector2,
    level?: number,
    exp?: number,
    expForNextLevel?: number,
    hp?: number,
    leftArm?: MetaBotPart,
    rightArm?: MetaBotPart,
    legs?: MetaBotPart,
    head?: MetaBotPart,
    offsetX?: number,
    offsetY?: number,
    colorSwap?: ColorSwap,
    isDeployed?: boolean,
    isEnemy?: boolean,
    preventDraw?: boolean,
    forceDrawName?: boolean,
    preventDrawName?: boolean,
    isSolid?: boolean,
    isInvulnerable?: boolean,
    canAttack?: boolean,
    facingDirection?: "UP" | "DOWN" | "LEFT" | "RIGHT" | undefined,
  }) {
    super({
      id: params.id ?? Math.floor(Math.random() * (-9999 + 1000)) - 1000,
      position: params.position,
      colorSwap: params.colorSwap,
      preventDraw: params.preventDraw,
      forceDrawName: params.forceDrawName,
      preventDrawName: params.preventDrawName, 
      facingDirection: params.facingDirection,
      speed: (params.heroId ?? 0) < 0 ? 0.5 : 1,
      name: "Bot",
      exp: params.exp ?? 0,
      expForNextLevel: params.expForNextLevel ?? 0,
      isSolid: params.isSolid ?? false,
      level: params.level ?? 1,
      body: params.preventDraw ? undefined : 
        new Sprite({
          objectId: params.id ?? Math.floor(Math.random() * (-9999 + 1000)) - 1000,
          resource: resources.images[
            params.name == "Jaguar" ? "botFrame"
            : params.name == "Ram" ? "botFrame5"
            : params.name == "Bee" ? "botFrame7"
            : (params.spriteName ?? "botFrame")],
          frameSize: params.spriteName == "white" ? new Vector2(0, 0) : new Vector2(32, 32),
          scale: params.scale,
          name: "Bot",
          isSolid:params.isSolid ?? false,
          position: new Vector2(-7, 0),
          offsetX: (params.offsetX ?? 0), 
          offsetY: (params.offsetY ?? 0), 
          colorSwap: params.colorSwap,
          hFrames: params.spriteName?.includes("botFrame") ? 4 : 1,
          vFrames: params.spriteName?.includes("botFrame") ? 5 : 1,
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
              attackDown: new FrameIndexPattern(ATTACK_DOWN),
              attackUp: new FrameIndexPattern(ATTACK_UP),
              attackLeft: new FrameIndexPattern(ATTACK_LEFT),
              attackRight: new FrameIndexPattern(ATTACK_RIGHT),
            })
          }
        ),
      shadow: params.preventDraw ? undefined : new Sprite({
        objectId: params.id ?? Math.floor(Math.random() * (-9999 + 1000)) - 1000,
        resource: resources.images["shadow"],
        scale: params.scale,
        offsetX: -7 + (params.offsetX ?? 0),
        offsetY: 2 + (params.offsetY ?? 0),
        frameSize: new Vector2(32, 32),
      }),
    });
    this.heroId = params.heroId;
    this.facingDirection = DOWN;
    this.botType = params.botType ?? SkillType.NORMAL;
    this.level = params.level ?? 1;
    this.hp = params.hp ?? 1;
    this.leftArm = params.leftArm;
    this.rightArm = params.rightArm;
    this.head = params.head;
    this.legs = params.legs;
    this.name = params.name ?? "Anon";
    this.isDeployed = params.isDeployed;
    this.isEnemy = params.isEnemy ?? false; 
    this.isInvulnerable = params.isInvulnerable ?? false;   
    this.canAttack = params.canAttack ?? true; 
    this.partyMembers = params.partyMembers;
    this.setupEvents(); 
  }

  override destroy() {
    if (this.targetingInterval) {
      clearInterval(this.targetingInterval); // Stop the interval
      this.targetingInterval = undefined;
    }

    if (!this.preventDestroyAnimation) {
      this.isLocked = true;
      this.destroyBody();
      const fire = new Fire(this.position.x, this.position.y);
      this.parent?.children?.push(fire);
      setTimeout(() => {
        fire.destroy();
        super.destroy();
      }, 1100);
    } else {
      super.destroy();
    } 
  }

  override ready() {
    this.targetingInterval = setInterval(() => {
      findTargets(this); 
      this.chaseAfter();
    }, 1000);
    events.on("CHARACTER_POSITION", this, (hero: any) => {
      if (hero.id === this.heroId) {
        this.followHero(hero); 
      } 
    });
    events.emit("BOT_CREATED");  
  }
 

  private chaseAfter() {
    if (this.chasing && this.chasing.id &&
      (this.destinationPosition.x != this.chasing.destinationPosition.x || this.destinationPosition.y != this.chasing.destinationPosition.y)) {
      const dx = this.chasing.destinationPosition.x - this.destinationPosition.x;
      const dy = this.chasing.destinationPosition.y - this.destinationPosition.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 500 || !(this.chasing as Hero).metabots?.find(x => x.isDeployed)) {
        console.log(`${this.name} stopped following ${this.chasing.name}`);
        this.chasing = undefined;
        this.latestMessage = "😡";
        this.chaseCancelBlock = new Date();
      } else {
        this.destinationPosition = this.chasing.destinationPosition.duplicate();
        clearTimeout(this.chaseDebounceTimer);
        this.chaseDebounceTimer = setTimeout(() => {
          events.emit("UPDATE_ENCOUNTER_POSITION", this);
        }, 100);
      }
      setTimeout(()=> {
        if (this.chasing) { 
          const now = new Date();
          if (now.getTime() - this.chaseCancelBlock.getTime() > 50) {
            this.chasing = undefined;
            this.destinationPosition = this.position.duplicate();
            this.latestMessage = "😡";
            this.chaseCancelBlock = new Date();
          } 
        }
      }, 12 * 1000);
    }
  }

  override getContent() { 
    if (this.textContent) {
      return this.textContent[0];
    } else { 
      const owner = this.parent.children.find((child: any) => child.id == this.heroId);
      const isHero = (owner instanceof Hero);
      let scenario = {
        portraitFrame: 0,
        string: [isHero ? "Monitoring... No threat detected." : "Threat detected. Step away!", `HP: ${this.hp}`, `Owner: ${owner.name}`],
        addsFlag: undefined,
        canSelectItems: false
      } as Scenario
      return  scenario;
    } 
  }
   
  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    if (this.isDeployed && this.isEnemy) {
      this.drawHP(ctx, drawPosX, drawPosY);
      this.drawExp(ctx, drawPosX, drawPosY);
      this.drawLevel(ctx, drawPosX, drawPosY);
    }
    if (this.latestMessage) {
      this.drawLatestMessage(ctx, drawPosX, drawPosY);
      setTimeout(() => { this.latestMessage = ""; }, 5000);
    }
  }

  override step(delta: number, root: any) {
    super.step(delta, root);

    if (this.targeting && this.lastAttack.getTime() + 1000 < new Date().getTime()) {  
       
      this.lastAttack = new Date();

      const botsInRange = getBotsInRange(this, this.partyMembers);
      if (botsInRange.some((x: Bot) => x.id == this.targeting?.id)) {  
        attack(this, this.targeting);
      } else {
        untarget(this, this.targeting); 
      } 
    } 
  } 

  private followHero(hero: Character) {
    if ((hero.distanceLeftToTravel ?? 0) < 15 && this.isDeployed) {
      const directionX = hero.position.x - (this.previousHeroPosition?.x ?? this.position.x);
      const directionY = hero.position.y - (this.previousHeroPosition?.y ?? this.position.y);
      const distanceFromHero = gridCells(2);
      let newX = hero.position.x;
      let newY = hero.position.y; 
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
      this.facingDirection = hero.facingDirection; 
      this.destinationPosition = new Vector2(newX, newY).duplicate();  
      this.previousHeroPosition = new Vector2(hero.position.x, hero.position.y); 
    }
    // if ((hero.distanceLeftToTravel ?? 0) > 35 && this.isDeployed) {
    //   console.log("bot should warp to hero");
    // }
  } 
}  
