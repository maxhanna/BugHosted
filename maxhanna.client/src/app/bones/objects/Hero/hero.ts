import { Vector2 } from "../../../../services/datacontracts/bones/vector2";
import { MetaBot } from "../../../../services/datacontracts/bones/meta-bot";
import { Character } from "../character";
import { Sprite } from "../sprite";
import { Mask } from "../Wardrobe/mask";
import { DOWN, gridCells, isSpaceFree, LEFT, RIGHT, UP } from "../../helpers/grid-cells";
import { Animations } from "../../helpers/animations";
import { bodyAtSpace, isObjectNearby } from "../../helpers/move-towards";
import { resources } from "../../helpers/resources";
import { FrameIndexPattern } from "../../helpers/frame-index-pattern";
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP, PICK_UP_DOWN, ATTACK_DOWN, ATTACK_LEFT, ATTACK_RIGHT, ATTACK_UP } from "./hero-animations";
import { ColorSwap } from "../../../../services/datacontracts/bones/color-swap";
import { events } from "../../helpers/events";
import { WarpBase } from "../Effects/Warp/warp-base";

export class Hero extends Character {
  isAttacking = false;
  // lastAttack timestamp to enforce attackSpeed cooldown (ms since epoch)
  private lastAttackAt: number = 0;
  // attack cooldown in milliseconds (populated from metaHero via parent code)
  public attackSpeed: number = 400;
  constructor(params: {
    position: Vector2, id?: number, name?: string, metabots?: MetaBot[], colorSwap?: ColorSwap,
    isUserControlled?: boolean, speed?: number, mask?: Mask, scale?: Vector2,
    forceDrawName?: boolean, preventDrawName?: boolean,
  }) {
    super({
      id: params.id ?? 0,
      position: params.position,
      colorSwap: params.colorSwap,
      name: params.name ?? "Anon",
      mask: params.mask,
      isUserControlled: params.isUserControlled,
      forceDrawName: params.forceDrawName ?? true,
      preventDrawName: params.preventDrawName ?? false,
      isSolid: false,
      body: new Sprite({
        objectId: params.id ?? 0,
        resource: resources.images["hero"], 
        name: "hero",
        position: new Vector2(-8, 0),
        frameSize: new Vector2(32, 32),
        offsetY: -10,
        hFrames: 4,
        vFrames: 6,
        isSolid: false,
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
            attackLeft: new FrameIndexPattern(ATTACK_LEFT),
            attackRight: new FrameIndexPattern(ATTACK_RIGHT),
            attackDown: new FrameIndexPattern(ATTACK_DOWN),
            attackUp: new FrameIndexPattern(ATTACK_UP),
          }),
        colorSwap: params.colorSwap,
        scale: params.scale,
      })
    }); 
    this.facingDirection = DOWN;
    this.destinationPosition = this.position.duplicate();
    this.lastPosition = this.position.duplicate();
    this.speed = params.speed ?? 1;
    this.mask = params.mask;
    this.itemPickupTime = 0;
    this.isOmittable = false;
    this.scale = params.scale ?? new Vector2(1, 1);
    const shadow = new Sprite({
      resource: resources.images["shadow"],
      offsetY: 10,
      name: "shadow",
      position: new Vector2(-18, -18),
      scale: new Vector2(1.25, 1),
      frameSize: new Vector2(32, 32),
    });
    shadow.drawLayer = "FLOOR";
    this.addChild(shadow);
  }


  override ready() { 
    if (this.isUserControlled) {
      events.on("START_TEXT_BOX", this, () => {
        this.isLocked = true; 
      }); 
      events.on("END_TEXT_BOX", this, () => {
        this.isLocked = false;
      });
      events.on("HERO_MOVEMENT_LOCK", this, () => {
        this.isLocked = true;
      });
      events.on("HERO_MOVEMENT_UNLOCK", this, () => {
        this.isLocked = false;
      }); 
      events.on("SPACEBAR_PRESSED", this, () => {
        const attackSpeed = this.attackSpeed ?? 400;
        const now = Date.now();
        if (now - this.lastAttackAt < attackSpeed) return; // still cooling down
        this.lastAttackAt = now;
        this.isAttacking = true;
       // this.isLocked = true;
        if (this.facingDirection == "DOWN") {
          this.body?.animations?.play("attackDown");
        } else if (this.facingDirection == "UP") {
          this.body?.animations?.play("attackUp");
        } else if (this.facingDirection == "LEFT") {
          this.body?.animations?.play("attackLeft");
        } else if (this.facingDirection == "RIGHT") {
          this.body?.animations?.play("attackRight");
        }
        if (isObjectNearby(this)) {
          resources.playSound('punchOrImpact', { volume: 1.0, allowOverlap: true });  
        }
        // After the attack animation finishes, allow another attack to be queued if the user is still holding
        // the attack input (space / controller A). We'll wait for the visual animation to finish (400ms)
        // then, if the input is held, trigger another SPACEBAR_PRESSED respecting the attackSpeed cooldown.
        setTimeout(() => {
          this.isAttacking = false;
          // try to locate the input instance by walking parents
          const inputInstance = this.findInputInstance();
          try {
            const holding = !!(inputInstance && (inputInstance.keys?.['Space'] || inputInstance.keys?.['KeyA']));
            if (holding) {
              // don't queue follow-up if the hero started moving
              const isMovingNow = (this.position.x !== this.destinationPosition.x) || (this.position.y !== this.destinationPosition.y);
              if (isMovingNow) {
                return;
              }
              const elapsed = Date.now() - this.lastAttackAt;
              // wait until both cooldown and animation complete to trigger next attack
              const cooldownRemaining = Math.max(0, (this.attackSpeed ?? 400) - elapsed);
              const requiredWait = Math.max(cooldownRemaining, (this.attackSpeed ?? 400) + 50);
              setTimeout(() => {
                try {
                  const inputNow = this.findInputInstance();
                  const stillHolding = !!(inputNow && (inputNow.keys?.['Space'] || inputNow.keys?.['KeyA']));
                  const stillMoving = (this.position.x !== this.destinationPosition.x) || (this.position.y !== this.destinationPosition.y);
                  if (stillHolding && !stillMoving) {
                    events.emit('SPACEBAR_PRESSED');
                  }
                } catch (e) { }
              }, requiredWait);
            }
          } catch (ex) {
            // swallow any input inspection errors
          }
        //  this.isLocked = false;
        }, 400);
      });
      events.on("SELECTED_ITEM", this, (selectedItem: string) => { 
        if (selectedItem === "Party Up") {
          events.emit("PARTY_UP", isObjectNearby(this));
        }
        else if (selectedItem === "Unparty") { 
          events.emit("UNPARTY", isObjectNearby(this));
        }
        else if (selectedItem === "Wave") {
          events.emit("WAVE_AT", isObjectNearby(this));
        }
        else if (selectedItem === "Whisper") {
          events.emit("WHISPER_AT", isObjectNearby(this));  
        }
      });
      events.on("CLOSE_HERO_DIALOGUE", this, () => {
        this.isLocked = false;
        events.emit("END_TEXT_BOX");
      });
      events.on("WARP", this, (params: { x: string, y: string }) => {
        console.log("warping ", params);
        const warpPosition = new Vector2(gridCells(parseInt(params.x)), gridCells(parseInt(params.y)));
        const spaceIsFreeForWarp = isSpaceFree(this.parent.walls, warpPosition.x, warpPosition.y);
        if (spaceIsFreeForWarp) {
          events.emit("HERO_MOVEMENT_LOCK");
          const warpBase = new WarpBase({ position: this.position, parentId: this.id, offsetX: -8, offsetY: 12 });
          this.parent.addChild(warpBase);
          setTimeout(() => {
            events.emit("HERO_MOVEMENT_UNLOCK");
            this.destinationPosition = warpPosition.duplicate();
            this.position = this.destinationPosition.duplicate();
            warpBase.destroy();
            setTimeout(() => {
              events.emit("HERO_MOVEMENT_LOCK");
              const warpBase2 = new WarpBase({ position: this.position, parentId: this.id, offsetX: -8, offsetY: 12 });
              this.parent.addChild(warpBase2);
              setTimeout(() => {
                warpBase2.destroy();
                events.emit("HERO_MOVEMENT_UNLOCK"); 
              }, 1300);
            }, 15); 
          }, 1300);
        } else {
          events.emit("INVALID_WARP", this);
        }
      });
    }
    // All heroes (user-controlled and others) should respond to OTHER_HERO_ATTACK events so
    // server-driven attacks animate correctly on every client instance.
    events.on("OTHER_HERO_ATTACK", this, (payload: any) => {
      try {
        const sourceHeroId = payload?.sourceHeroId;
        if (!sourceHeroId) return;
        if (this.id === sourceHeroId) {
          if (this.facingDirection == "DOWN") this.body?.animations?.play("attackDown");
          else if (this.facingDirection == "UP") this.body?.animations?.play("attackUp");
          else if (this.facingDirection == "LEFT") this.body?.animations?.play("attackLeft");
          else if (this.facingDirection == "RIGHT") this.body?.animations?.play("attackRight");
          // Determine animation timeout: prefer payload.attack_speed (ms) then default 400
          const attackSpeed = (typeof payload?.attack_speed === 'number') ? payload.attack_speed : (typeof payload?.attackSpeed === 'number' ? payload.attackSpeed : 400);
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
      } catch (ex) { console.error('OTHER_HERO_ATTACK handler error', ex); }
    });
  }

  // Walk up the parent chain to find an object exposing an `input` instance (Main / level hierarchy is variable)
  private findInputInstance(): any | null {
    let p: any = (this as any).parent;
    let depth = 0;
    while (p && depth < 8) {
      if (p.input) return p.input;
      p = p.parent;
      depth++;
    }
    return null;
  }

  override step(delta: number, root: any) {
    const prev = this.position.duplicate();
    super.step(delta, root);
    if (this.isUserControlled) {
      if (this.position.x !== prev.x || this.position.y !== prev.y) {
        events.emit("HERO_MOVED", { id: this.id, x: this.position.x, y: this.position.y });
      }
    }
  }



  override getContent() {
    return {
      portraitFrame: 0,
      string: ["Party Up", "Whisper", "Wave", "Cancel"],
      canSelectItems: true,
      addsFlag: undefined
    }
  }

  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    // call base sprite draw
    super.drawImage(ctx, drawPosX, drawPosY);
    // Draw HP & EXP bars and level above hero (similar style to Bot)
    const barWidth = 34;
    const barHeight = 4;
    const x = drawPosX - 16;
    const topY = drawPosY - 26; // above head

    // HP bar background
    ctx.fillStyle = "#2b2b2b";
    ctx.fillRect(x, topY, barWidth, barHeight);
    // HP value (hero.hp may not exist; default 1/1 for now)
    const hp = (this as any).hp ?? 1;
    const maxHp = (this as any).maxHp ?? 1;
    const hpRatio = Math.max(0, Math.min(1, hp / (maxHp || 1)));
    ctx.fillStyle = "#d22";
    ctx.fillRect(x + 1, topY + 1, (barWidth - 2) * hpRatio, barHeight - 2);

    // EXP bar just below HP
    const expBarY = topY + barHeight + 2;
    ctx.fillStyle = "#2b2b2b";
    ctx.fillRect(x, expBarY, barWidth, barHeight);
    const level = (this as any).level ?? 1;
    const exp = (this as any).exp ?? 0;
    const needed = level * 10; // mirror server leveling heuristic
    const expRatio = Math.max(0, Math.min(1, exp / needed));
    ctx.fillStyle = "#2ad";
    ctx.fillRect(x + 1, expBarY + 1, (barWidth - 2) * expRatio, barHeight - 2);

    // Level text centered
    ctx.fillStyle = "#fff";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`Lv${level}`, x + barWidth / 2, topY - 2);
  }
}
