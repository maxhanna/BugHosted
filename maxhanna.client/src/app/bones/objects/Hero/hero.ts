import { Vector2 } from "../../../../services/datacontracts/bones/vector2";
import { MetaBot } from "../../../../services/datacontracts/bones/meta-bot";
import { Character } from "../character";
import { Sprite } from "../sprite";
import { Mask } from "../Wardrobe/mask";
import { DOWN, gridCells, isSpaceFree, LEFT, RIGHT, UP } from "../../helpers/grid-cells";
import { Animations } from "../../helpers/animations";
import { isObjectNearby, objectAtLocation } from "../../helpers/move-towards";
import { resources } from "../../helpers/resources";
import { Npc } from "../Npc/npc";
import { FrameIndexPattern } from "../../helpers/frame-index-pattern";
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP, PICK_UP_DOWN, ATTACK_DOWN, ATTACK_LEFT, ATTACK_RIGHT, ATTACK_UP } from "./hero-animations";
import { ColorSwap } from "../../../../services/datacontracts/bones/color-swap";
import { events } from "../../helpers/events";
import { WarpBase } from "../Effects/Warp/warp-base";
import { Sting } from "../Effects/Sting/sting";
import { Arrow } from "../Effects/Arrow/arrow";

export class Hero extends Character {
  isAttacking = false;
  type: string = "knight";
  // Mana for spellcasting/abilities (0..100)
  public mana: number = 100;
  public maxMana?: number = 100;
  currentSkill?: string = undefined;
  private lastAttackAt: number = 0;
  public attackSpeed: number = 400;
  constructor(params: {
    position: Vector2, id?: number, name?: string, type?: string, metabots?: MetaBot[], colorSwap?: ColorSwap,
    isUserControlled?: boolean, speed?: number, attackSpeed?: number, mask?: Mask, scale?: Vector2,
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
        resource: resources.images[params.type ?? "knight"],
        name: "hero",
        position: new Vector2(-10, 0),
        frameSize: new Vector2(40, 40),
        offsetY: -10,
        hFrames: 4,
        vFrames: 7,
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
    this.type = params.type ?? "knight";
    this.itemPickupTime = 0;
    this.isOmittable = false;
    this.attackSpeed = params.attackSpeed ?? 400;
    this.scale = params.scale ?? new Vector2(1, 1);
    if (this.type === "magi") {
      this.currentSkill = "sting"; 
    } else if (this.type === "rogue") {
      this.currentSkill = "arrow";
    }
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
      
        const neighbour = this.position.toNeighbour ? this.position.toNeighbour(this.facingDirection) : null;
        const objInFront = neighbour ? objectAtLocation(this.parent, neighbour, true) : null;
        const isNpcInFront = objInFront && (objInFront instanceof Npc || objInFront.constructor?.name?.toLowerCase().endsWith('npc'));
        if (!isNpcInFront) {  
          if (this.facingDirection == "DOWN") {
            this.body?.animations?.play("attackDown");
            if (this.currentSkill) {
                this.spawnSkillTo(this.position.x, this.position.y + 200, this.currentSkill);
            }
          } else if (this.facingDirection == "UP") {
            this.body?.animations?.play("attackUp");
            if (this.currentSkill) {
              this.spawnSkillTo(this.position.x, this.position.y - 200, this.currentSkill);
            } 
          } else if (this.facingDirection == "LEFT") {
            this.body?.animations?.play("attackLeft");
            if (this.currentSkill) {
              this.spawnSkillTo(this.position.x - 200, this.position.y, this.currentSkill);
            }
          } else if (this.facingDirection == "RIGHT") {
            this.body?.animations?.play("attackRight");
            if (this.currentSkill) {
              this.spawnSkillTo(this.position.x + 200, this.position.y, this.currentSkill);
            } 
          }
          this.playAttackSound(); 
        }
        
        setTimeout(() => {
          this.isAttacking = false; 
          const inputInstance = this.findInputInstance();
          
          const holding = !!(inputInstance && (inputInstance.keys?.['Space'] || inputInstance.keys?.['KeyA']));
          if (holding) { 
            const isMovingNow = (this.position.x !== this.destinationPosition.x) || (this.position.y !== this.destinationPosition.y);
            if (isMovingNow) {
              return;
            }
            const elapsed = Date.now() - this.lastAttackAt; 
            const cooldownRemaining = Math.max(0, (this.attackSpeed ?? 400) - elapsed);
            const requiredWait = Math.max(cooldownRemaining, (this.attackSpeed ?? 400) + 50);
            setTimeout(() => { 
              const inputNow = this.findInputInstance();
              const stillHolding = !!(inputNow && (inputNow.keys?.['Space'] || inputNow.keys?.['KeyA']));
              const stillMoving = (this.position.x !== this.destinationPosition.x) || (this.position.y !== this.destinationPosition.y);
              if (stillHolding && !stillMoving) {
                events.emit('SPACEBAR_PRESSED');
                console.log("reemitting spacebar pressed");
              } 
            }, requiredWait);
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
        if (this.id === sourceHeroId && !this.isUserControlled) {
          // Determine facing from payload if provided (server may send numeric 0=down,1=left,2=right,3=up or string)
          try {
            const fRaw = payload?.facing ?? payload?.facingDirection ?? undefined;
            let fNum: number | null = null;
            if (typeof fRaw === 'number') fNum = fRaw;
            else if (typeof fRaw === 'string') {
              const s = fRaw.toLowerCase();
              if (s === 'down') fNum = 0;
              else if (s === 'left') fNum = 1;
              else if (s === 'right') fNum = 2;
              else if (s === 'up') fNum = 3;
            }
            if (fNum === 0) this.facingDirection = DOWN;
            else if (fNum === 1) this.facingDirection = LEFT;
            else if (fNum === 2) this.facingDirection = RIGHT;
            else if (fNum === 3) this.facingDirection = UP;
          } catch { }
          if (this.facingDirection == "DOWN") this.body?.animations?.play("attackDown");
          else if (this.facingDirection == "UP") this.body?.animations?.play("attackUp");
          else if (this.facingDirection == "LEFT") this.body?.animations?.play("attackLeft");
          else if (this.facingDirection == "RIGHT") this.body?.animations?.play("attackRight");

          // Spawn remote visual effects for other heroes' attacks.
          try {
            // Prefer explicit target coordinates sent with the payload
            let tx = typeof payload?.targetX === 'number' ? payload.targetX : undefined;
            let ty = typeof payload?.targetY === 'number' ? payload.targetY : undefined;
            // If no explicit target coordinates, compute a short-range target based on facing
            if (tx === undefined || ty === undefined) {
              const step = 200;
              if (this.facingDirection == DOWN) { tx = this.position.x; ty = this.position.y + step; }
              else if (this.facingDirection == UP) { tx = this.position.x; ty = this.position.y - step; }
              else if (this.facingDirection == LEFT) { tx = this.position.x - step; ty = this.position.y; }
              else if (this.facingDirection == RIGHT) { tx = this.position.x + step; ty = this.position.y; }
            }

            const skillType = (payload?.currentSkill as string) ?? this.currentSkill ?? (this.type === 'rogue' ? 'arrow' : (this.type === 'magi' ? 'sting' : undefined));
            if (skillType === 'arrow' || this.type === 'rogue') {
              // spawn arrow effect towards tx,ty
              if (tx !== undefined && ty !== undefined) this.spawnSkillTo(tx, ty, 'arrow');
            } else if (skillType === 'sting' || this.type === 'magi') {
              // spawn sting effect towards tx,ty
              if (tx !== undefined && ty !== undefined) this.spawnSkillTo(tx, ty, 'sting');
            }
          } catch (ex) { console.warn('Failed to spawn remote attack visual', ex); }
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
  
  private spawnSkillTo(targetX: number, targetY: number, type: string) {
    try {
      // Compute rendered anchor point for this hero's sprite so the effect appears at the same place
      const bodyPosX = (this.body?.position?.x ?? 0);
      const bodyPosY = (this.body?.position?.y ?? 0);
      const bodyOffsetX = (this.body?.offsetX ?? 0);
      const bodyOffsetY = (this.body?.offsetY ?? 0);
      const frameW = (this.body?.frameSize?.x ?? gridCells(2));
      const frameH = (this.body?.frameSize?.y ?? gridCells(2));
      const scaleX = (this.body?.scale?.x ?? 1);
      const scaleY = (this.body?.scale?.y ?? 1);

      const startX = this.position.x + bodyPosX + bodyOffsetX + (frameW * scaleX) / 2;
      const startY = this.position.y + bodyPosY + bodyOffsetY + (frameH * scaleY) / 2;

      // Convert target world position to rendered anchor using the same offsets so the sting moves to the visual target
      const targetAnchorX = targetX + bodyPosX + bodyOffsetX + (frameW * scaleX) / 2;
      const targetAnchorY = targetY + bodyPosY + bodyOffsetY + (frameH * scaleY) / 2;
      let skillType = undefined;
      if (type === "sting") {
        skillType = new Sting(startX, startY);
      } else if (type === "arrow") {
        skillType = new Arrow(startX, startY, this.facingDirection);
      } else {
        skillType = new Arrow(startX, startY, this.facingDirection);
      }
      // Place the sting on the same parent that renders the hero (usually the level)
      // so the world coordinates used above align with the sting's local coordinates.
      const host = (this.parent as any) ?? this;
      host.addChild(skillType);
      skillType.moveTo(targetAnchorX, targetAnchorY, 1000);
      setTimeout(() => {
        try { skillType.destroy(); } catch { }
      }, 2000);
    } catch (ex) {
      console.warn('spawnStingTo failed', ex);
    }
  }

  private playAttackSound() {
    const nearby = isObjectNearby(this);
    let shouldPlaySound = false;
    if (Array.isArray(nearby)) {
      for (const obj of nearby) {
        if (obj && typeof (obj as any).hp === 'number' && (obj as any).hp > 0) {
          shouldPlaySound = true;
          break;
        }
      }
    }

    else {
      if (nearby && typeof (nearby as any).hp === 'number' && (nearby as any).hp > 0) {
        shouldPlaySound = true;
      }
    }

    if (shouldPlaySound) {
      resources.playSound('punchOrImpact', { volume: 1.0, allowOverlap: true });
    }
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



  // override getContent() {
  // return {
  //   portraitFrame: 0,
  //   string: ["Party Up", "Whisper", "Wave", "Cancel"],
  //   canSelectItems: true,
  //   addsFlag: undefined
  // }
  // }

  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    // call base sprite draw
    super.drawImage(ctx, drawPosX, drawPosY);
    if (this.isUserControlled) {
      return;
    }
    // Draw HP & EXP bars and level above hero (similar style to Bot)
    const barWidth = 34;
    const barHeight = 4;
    // Compute horizontal center using sprite frame width when available so overlays sit above the
    // visual sprite regardless of frameSize or scale. Fallback to previous offset when not present.
    // Use rendered sprite width (frameSize * scale) and include the sprite offsetX so the
    // overlay aligns with the visual sprite. Sprite.drawImage applies offsetX before centering.
    const spriteFrameWidth = (this.body?.frameSize?.x ?? gridCells(2));
    const spriteScaleX = (this.body?.scale?.x ?? 1);
    const spriteWidth = spriteFrameWidth * spriteScaleX;
    // Sprite.drawImage applies this.body.position.x and this.body.offsetX when drawing the frame
    // and then centers the frame around that resulting x. To compute the visual center we need
    // to include the body.position.x and any offsetX so the overlay aligns with the actual image.
    const bodyPosX = (this.body?.position?.x ?? 0);
    const bodyOffsetX = (this.body?.offsetX ?? 0);
    const anchorX = drawPosX + bodyPosX + bodyOffsetX + (spriteWidth / 2);
    const x = Math.round(anchorX - (barWidth / 2));
    const topY = drawPosY - 26; // above head (vertical offset unchanged)

    // HP bar background
    ctx.fillStyle = "#2b2b2b";
    ctx.fillRect(x, topY, barWidth, barHeight);
    // HP value (hero.hp may not exist; default 1/1 for now)
    const hp = (this as any).hp ?? 1;
    const maxHp = (this as any).maxHp ?? 1;
    const hpRatio = Math.max(0, Math.min(1, hp / (maxHp || 1)));
    ctx.fillStyle = "#d22";
    ctx.fillRect(x + 1, topY + 1, (barWidth - 2) * hpRatio, barHeight - 2);

  // EXP bar intentionally hidden for heroes (rendered elsewhere for local player)

    // Level text centered
    ctx.fillStyle = "#fff";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`Lv${this.level ?? 1}`, x + barWidth / 2, topY - 2);
  }
}
