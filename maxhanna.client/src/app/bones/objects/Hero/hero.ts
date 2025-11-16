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
  // maxMana: number of mana stat points allocated (e.g., 0,1,2...)
  public maxMana?: number = 100;
  public currentManaUnits: number = 0; // initialize later to maxMana * 100 if available
  currentSkill?: string = undefined;
  // Track active skill effects spawned by this hero (not yet destroyed)
  public activeSkills: any[] = [];
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
      forceDrawName: false,
      preventDrawName: true,
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
    // Initialize currentManaUnits to full if maxMana provided via params
    try {
      const mm = (params as any).maxMana ?? (params as any).mana ?? undefined;
      if (typeof mm === 'number') {
        this.maxMana = mm;
        this.currentManaUnits = Math.max(0, (this.maxMana ?? 0) * 100);
        // Maintain legacy percent field for compatibility
        this.mana = Math.max(0, Math.min(100, Math.round(((this.currentManaUnits || 0) / Math.max(1, (this.maxMana ?? 1) * 100)) * 100)));
      } else {
        // default to 1 point (100 units) to avoid divide-by-zero visuals
        this.maxMana = this.maxMana ?? 1;
        this.currentManaUnits = this.currentManaUnits || (this.maxMana * 100);
      }
    } catch { }
    const shadow = new Sprite({
      resource: resources.images["shadow"],
      offsetY: 10,
      name: "shadow",
      position: new Vector2(-15, -10),
      scale: new Vector2(1.25, 1),
      frameSize: new Vector2(32, 32),
    });
    shadow.drawLayer = "FLOOR";
    this.addChild(shadow);
  }

  // Return the mana cost (in stat points) for a given skill name. Defaults to 1.
  getSkillManaCost(skill?: string): number {
    try {
      if (!skill) return 1;
      const s = skill.toLowerCase();
      if (s === 'sting') return 0;
      if (s === 'arrow') return 0;
      return 1;
    } catch { return 1; }
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

  // spawnSkillTo: spawn a visual skill effect from this hero to target coordinates.
  // The function computes the mana cost internally (via getSkillManaCost).
  // If the computed cost > 0 the function will attempt to consume mana; if consumption fails it will play the default 'arcadeUi' sound and not spawn.
  private spawnSkillTo(targetX: number, targetY: number, type: string) {
    try {
      const cost = this.getSkillManaCost(type);
      if ((cost || 0) > 0) {
        if (!this.tryConsumeMana(cost)) {
          //resources.playSound('arcadeUi', { volume: 0.7, allowOverlap: false });
          return;
        }
      }
      // Compute rendered anchor point for this hero's sprite so the effect appears at the same place
      const bodyPosX = (this.body?.position?.x ?? 0);
      const bodyPosY = (this.body?.position?.y ?? 0);
      const bodyOffsetX = (this.body?.offsetX ?? 0);
      const bodyOffsetY = (this.body?.offsetY ?? 0);
      const frameW = (this.body?.frameSize?.x ?? gridCells(2));
      const frameH = (this.body?.frameSize?.y ?? gridCells(2));
      const scaleX = (this.body?.scale?.x ?? 1);
      const scaleY = (this.body?.scale?.y ?? 1);

      // Compute a facing-based offset so projectiles spawn from the visually-correct side
      const baseCenterX = this.position.x + bodyPosX + bodyOffsetX + (frameW * scaleX) / 2;
      const baseCenterY = this.position.y + bodyPosY + bodyOffsetY + (frameH * scaleY) / 2;
      // lateralOffset moves the spawn point left/right relative to facing to avoid spawning on the wrong side
      let lateralOffset = Math.round((frameW * scaleX) / 3); 
      let verticalOffset = 0;
      if (this.facingDirection === LEFT) {
        lateralOffset = -40;
        verticalOffset = -20; // slightly up for left-facing
      } else if (this.facingDirection === RIGHT) {
        lateralOffset = Math.abs(lateralOffset / 3);
        verticalOffset = -20; // slightly up for left-facing
      } else if (this.facingDirection === UP) {
        verticalOffset = -Math.round(frameH * scaleY * 0.15);
        lateralOffset = -Math.abs(lateralOffset);
      } else if (this.facingDirection === DOWN) {
        verticalOffset = Math.round(frameH * scaleY * 0.05);
        lateralOffset = -Math.abs(lateralOffset);
      }

      const startX = baseCenterX + lateralOffset;
      const startY = baseCenterY + verticalOffset;

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
      const host = (this.parent as any) ?? this;
      host.addChild(skillType);
      this.activeSkills.push(skillType);
      skillType.moveTo(targetAnchorX, targetAnchorY, 1000);
      setTimeout(() => {
        try { skillType.destroy(); } catch { }
      }, 2000);
    } catch (ex) {
      console.warn('spawnSkillTo failed', ex);
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
      console.log("playing attack sound, nearby:", nearby);
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

  // Returns the visual capacity in units (1 stat point == 100 units)
  getManaCapacity(): number {
    return Math.max(0, (this.maxMana ?? 0) * 100);
  }

  // Attempt to consume 'points' mana (integer stat points). Returns true if enough resource and consumed.
  tryConsumeMana(points: number): boolean {
    try {
      const requiredUnits = Math.max(0, Math.round(points * 100));
      if ((this.currentManaUnits ?? 0) >= requiredUnits) {
        this.currentManaUnits = Math.max(0, (this.currentManaUnits ?? 0) - requiredUnits);
        // update legacy percent for compatibility
        const cap = this.getManaCapacity() || 1;
        this.mana = Math.round((this.currentManaUnits / cap) * 100);
        return true;
      }
      return false;
    } catch { return false; }
  } 

  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    // call base sprite draw
    super.drawImage(ctx, drawPosX, drawPosY);
    if (this.isUserControlled) {
      return;
    }
    // Draw HP & EXP bars and level above hero
    const barWidth = 34;
    const barHeight = 4;
    const spriteFrameWidth = (this.body?.frameSize?.x ?? gridCells(2));
    const spriteScaleX = (this.body?.scale?.x ?? 1);
    const spriteWidth = spriteFrameWidth * spriteScaleX; 
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

    // Draw the hero's name centered under the health bar
    const displayName = this.name ?? "Anon";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    // Position the name just below the HP bar so it appears on top of the player
    const nameX = x + barWidth / 2;
    const nameY = topY + barHeight + 10; // 10px below top of bar
    // subtle shadow for readability
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText(displayName, Math.round(nameX) + 1, Math.round(nameY) + 1);
    ctx.fillStyle = "#fff";
    ctx.fillText(displayName, Math.round(nameX), Math.round(nameY));
  
    ctx.fillStyle = "#fff";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`Lv${this.level ?? 1}`, x + barWidth / 2, topY - 2);
  }
}
