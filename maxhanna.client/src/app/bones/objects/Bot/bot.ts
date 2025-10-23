import { Vector2 } from "../../../../services/datacontracts/bones/vector2";
import { Sprite } from "../sprite";
// Fire removed: play die animation instead of spawning fire on death
import { SkillType } from "../../helpers/skill-types";
import { DOWN, gridCells } from "../../helpers/grid-cells";
import { Animations } from "../../helpers/animations";
import { getBotsInRange } from "../../helpers/move-towards";
import { resources } from "../../helpers/resources";
import { FrameIndexPattern } from "../../helpers/frame-index-pattern";
import { events } from "../../helpers/events";
import { attack, findTargets, untarget } from "../../helpers/fight";
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP, DIE } from "../Npc/Skeleton/skeleton-animations";
import { HeroInventoryItem } from "../../../../services/datacontracts/bones/hero-inventory-item";
import { ColorSwap } from "../../../../services/datacontracts/bones/color-swap";
import { Character } from "../character";
import { Hero } from "../Hero/hero";
import { Scenario } from "../../helpers/story-flags";

export class Bot extends Character {
  heroId?: number;
  // The hero id this bot is currently targeting/chasing (optional)
  targetHeroId?: number | null = null;
  botType: SkillType.NORMAL | SkillType.SPEED | SkillType.STRENGTH | SkillType.ARMOR | SkillType.RANGED | SkillType.STEALTH | SkillType.INTELLIGENCE;

  previousHeroPosition?: Vector2;
  isDeployed? = false;
  isEnemy = true;
  targeting?: Bot = undefined;
  chasing?: Character = undefined;
  lastAttack = new Date();
  lastTargetDate = new Date(); 
  isInvulnerable = false;
  preventDestroyAnimation = false;
  canAttack = true; 
  partyMembers?: { heroId: number, name: string }[]; 
  private chaseDebounceTimer: any;
  chaseCancelBlock = new Date();

  private targetingInterval?: any;
  // Track the last observed gap (in pixels) to ensure following gap doesn't increase
  private lastFollowGap: number = Number.POSITIVE_INFINITY;

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
          frameSize: params.spriteName == "white" ? new Vector2(0, 0) 
            : params.spriteName?.includes("skeleton") ? new Vector2(40, 40) 
            : new Vector2(32, 32),
          scale: params.scale,
          name: "Bot",
          isSolid:params.isSolid ?? false,
          position: new Vector2(-7, 0),
          offsetX: (params.offsetX ?? 0), 
          offsetY: params.spriteName?.includes("skeleton") ? -12 : (params.offsetY ?? 0), 
          colorSwap: params.colorSwap,
          hFrames: params.spriteName?.includes("skeleton") ? 4 : 1,
          vFrames: params.spriteName?.includes("skeleton") ? 5 : 1,
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
              die: new FrameIndexPattern(DIE), 
            })
          }
        ),
      shadow: params.preventDraw ? undefined : new Sprite({
        objectId: params.id ?? Math.floor(Math.random() * (-9999 + 1000)) - 1000,
        resource: resources.images["shadow"],
        scale: params.scale,
        offsetX: (params.offsetX ?? 0),
        offsetY: params.spriteName?.includes("skeleton") ? -12 : 2 + (params.offsetY ?? 0),
        frameSize: new Vector2(32, 32),
      }),
    });
    this.heroId = params.heroId;
    this.facingDirection = DOWN;
    this.botType = params.botType ?? SkillType.NORMAL;
    this.level = params.level ?? 1;
    this.hp = params.hp ?? 1; 
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
      resources.playSound('maleDeathScream', { volume: 0.9, loop: false, allowOverlap: true });
      this.body?.animations?.play("die");

      setTimeout(() => {
        this.destroyBody();
        super.destroy();
      }, 400);
    } else {
      super.destroy();
    } 
  }

  override ready() {
    this.targetingInterval = setInterval(() => {
      findTargets(this); 
      this.chaseAfter();
    }, 1000);
    // Follow either the owner hero (heroId) or a specified targetHeroId
    events.on("CHARACTER_POSITION", this, (hero: any) => {
      if (!hero || hero.id === undefined) return;
      if (hero.id === this.heroId) {
        this.followHero(hero);
        return;
      }
      if (this.targetHeroId != null && hero.id === this.targetHeroId) {
        this.followHero(hero);
        return;
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
    return undefined;
    // if (this.textContent) {
    //   return this.textContent[0];
    // } else { 
    //   const owner = this.parent.children.find((child: any) => child.id == this.heroId);
    //   const isHero = (owner instanceof Hero);
    //   let scenario = {
    //     portraitFrame: 0,
    //     string: [isHero ? "Monitoring... No threat detected." : "Threat detected. Step away!", `HP: ${this.hp}`, `Owner: ${owner.name}`],
    //     addsFlag: undefined,
    //     canSelectItems: false
    //   } as Scenario
    //   return  scenario;
    // } 
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
    // if (this.hp <= 0) return;
    // const distanceFromHero = gridCells(2);
    // // Desired target position next to hero (to the right)
    // const desiredPos = hero.position.duplicate();
    // desiredPos.x += distanceFromHero;

    // // Current gap between bot and hero (euclidean)
    // const dxNow = (this.position.x ?? 0) - hero.position.x;
    // const dyNow = (this.position.y ?? 0) - hero.position.y;
    // const currentGap = Math.sqrt(dxNow * dxNow + dyNow * dyNow);

    // // Desired gap if we teleport to desiredPos
    // const dxDesired = desiredPos.x - hero.position.x;
    // const dyDesired = desiredPos.y - hero.position.y;
    // const desiredGap = Math.sqrt(dxDesired * dxDesired + dyDesired * dyDesired);

    // // If following would increase the gap beyond the last observed gap, clamp movement to close the gap
    // let finalTarget = desiredPos.duplicate();
    // if (this.lastFollowGap !== Number.POSITIVE_INFINITY && desiredGap > this.lastFollowGap) {
    //   // Move the destination toward the hero so gap doesn't increase: interpolate between desiredPos and hero.position
    //   const excess = desiredGap - this.lastFollowGap;
    //   const dirX = desiredPos.x - hero.position.x;
    //   const dirY = desiredPos.y - hero.position.y;
    //   const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    //   // Reduce the separation by 'excess' but don't move past hero
    //   const reduce = Math.min(excess, len - 1);
    //   finalTarget.x = desiredPos.x - (dirX / len) * reduce;
    //   finalTarget.y = desiredPos.y - (dirY / len) * reduce;
    // }

    // // Only update destination if it changed meaningfully
    // if (!this.destinationPosition?.duplicate().matches(finalTarget)) {
    //   this.facingDirection = hero.facingDirection;
    //   this.destinationPosition = finalTarget.duplicate();
    //   this.previousHeroPosition = hero.position.duplicate();
    // }

    // // Update lastFollowGap to the smaller of current observed or desired gap so it will never grow
    // this.lastFollowGap = Math.min(this.lastFollowGap, desiredGap, currentGap);
    // if ((hero.distanceLeftToTravel ?? 0) > 35 && this.isDeployed) {
    //   console.log("bot should warp to hero");
    // }
  } 
}  
