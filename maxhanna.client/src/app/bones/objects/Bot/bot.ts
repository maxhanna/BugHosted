import { Vector2 } from "../../../../services/datacontracts/bones/vector2";
import { Sprite } from "../sprite";
// Fire removed: play die animation instead of spawning fire on death
import { SkillType } from "../../helpers/skill-types";
import { DOWN, UP, LEFT, RIGHT, gridCells } from "../../helpers/grid-cells";
import { Animations } from "../../helpers/animations";
import { getBotsInRange } from "../../helpers/move-towards";
import { resources } from "../../helpers/resources";
import { FrameIndexPattern } from "../../helpers/frame-index-pattern";
import { events } from "../../helpers/events";
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP, DIE, ATTACK_DOWN, ATTACK_LEFT, ATTACK_RIGHT, ATTACK_UP } from "../Npc/Skeleton/skeleton-animations";
import { HeroInventoryItem } from "../../../../services/datacontracts/bones/hero-inventory-item";
import { ColorSwap } from "../../../../services/datacontracts/bones/color-swap";
import { Character } from "../character";
import { Hero } from "../Hero/hero";
import { Scenario } from "../../helpers/story-flags";

export class Bot extends Character {
  heroId?: number;
  // The hero id this bot is currently targeting/chasing (optional)
  targetHeroId?: number | null = null;
  isAttacking = false;
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
          resource: resources.images[(params.spriteName ?? "skeleton")],
          frameSize: params.spriteName == "white" ? new Vector2(0, 0) 
            : params.spriteName?.includes("skeleton") ? new Vector2(40, 40) 
            : new Vector2(32, 32),
          scale: params.scale,
          name: "Bot",
          isSolid:params.isSolid ?? false,
          position: new Vector2(-7, 0),
          offsetX: (params.offsetX ?? 0), 
          offsetY: params.spriteName?.includes("skeleton") ? -6 : (params.offsetY ?? 0), 
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
              attackDown: new FrameIndexPattern(ATTACK_DOWN),
              attackLeft: new FrameIndexPattern(ATTACK_LEFT),
              attackRight: new FrameIndexPattern(ATTACK_RIGHT),
              attackUp: new FrameIndexPattern(ATTACK_UP),
              die: new FrameIndexPattern(DIE), 
            })
          }
        ),
      shadow: params.preventDraw ? undefined : new Sprite({
        objectId: params.id ?? Math.floor(Math.random() * (-9999 + 1000)) - 1000,
        resource: resources.images["shadow"],
        scale: params.scale,
        offsetX: (params.offsetX ?? 0),
        offsetY: params.spriteName?.includes("skeleton") ? 0 : 2 + (params.offsetY ?? 0),
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
      if (this.body?.resource == resources.images["skeleton"]) {
        resources.playSound('bonescracking', {  loop: false, allowOverlap: true });
      } else {
        resources.playSound('maleDeathScream', {  loop: false, allowOverlap: true });
      }
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
    events.on("OTHER_HERO_ATTACK", this, (payload: any) => {
      try {
        const sourceHeroId = payload?.sourceHeroId;
        if (!sourceHeroId) return;
        if (this.id === sourceHeroId || this.heroId === sourceHeroId) {
          this.isAttacking = true;
          // Prefer numeric facing provided by server (0=down,1=left,2=right,3=up) but accept string fallbacks
          const facingRaw = payload?.facing ?? payload?.facingDirection ?? this.facingDirection;
          let facingNum: number | null = null;
          if (typeof facingRaw === 'number') facingNum = facingRaw;
          else if (typeof facingRaw === 'string') {
            const fr = facingRaw.toLowerCase();
            if (fr === 'down') facingNum = 0;
            else if (fr === 'left') facingNum = 1;
            else if (fr === 'right') facingNum = 2;
            else if (fr === 'up') facingNum = 3;
            else facingNum = null;
          }

          // map numeric facing to animation
          if (facingNum === 0) {
            this.body?.animations?.play("attackDown");
            this.facingDirection = DOWN;
          }
          else if (facingNum === 3) {
            this.body?.animations?.play("attackUp");
            this.facingDirection = UP;
          }
          else if (facingNum === 1) {
            this.body?.animations?.play("attackLeft");
            this.facingDirection = LEFT;
          }
          else if (facingNum === 2) {
            this.body?.animations?.play("attackRight");
            this.facingDirection = RIGHT;
          }
          else {
            // fallback to existing facingDirection string if numeric facing unavailable
            if (this.facingDirection == "DOWN") this.body?.animations?.play("attackDown");
            else if (this.facingDirection == "UP") this.body?.animations?.play("attackUp");
            else if (this.facingDirection == "LEFT") this.body?.animations?.play("attackLeft");
            else if (this.facingDirection == "RIGHT") this.body?.animations?.play("attackRight");
          }

          // Determine attack animation duration from payload.attack_speed (server) or payload.attackSpeed or default
          const attackSpeed = (typeof payload?.attack_speed === 'number') ? payload.attack_speed : (typeof payload?.attackSpeed === 'number' ? payload.attackSpeed : (typeof payload?.attack_speed === 'string' && !isNaN(Number(payload.attack_speed)) ? Number(payload.attack_speed) : 400));
          setTimeout(() => {
            try {
              this.isAttacking = false;
              if (this.facingDirection == DOWN) this.body?.animations?.play("standDown");
              else if (this.facingDirection == UP) this.body?.animations?.play("standUp");
              else if (this.facingDirection == LEFT) this.body?.animations?.play("standLeft");
              else if (this.facingDirection == RIGHT) this.body?.animations?.play("standRight");
            } catch (ex) { }
          }, Math.max(100, attackSpeed));
        }
      } catch (ex) { console.error('BOT OTHER_HERO_ATTACK handler error', ex); }
    });
  }
  

  override getContent() { 
    return undefined; 
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
}  
