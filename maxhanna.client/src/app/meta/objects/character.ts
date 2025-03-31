import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { GameObject } from "./game-object";
import { DOWN, LEFT, RIGHT, UP } from "../helpers/grid-cells";
import { ColorSwap } from "../../../services/datacontracts/meta/color-swap";
import { Sprite } from "./sprite";
import { Mask } from "./Wardrobe/mask";
import { isObjectNearby, moveTowards, tryMove } from "../helpers/move-towards";
import { Input } from "../helpers/input";
import { events } from "../helpers/events";
import { resources } from "../helpers/resources";
import { WarpBase } from "./Effects/Warp/warp-base";
import { findTargets } from "../helpers/fight";

export class Character extends GameObject {
  id: number;
  facingDirection: typeof UP | typeof DOWN | typeof LEFT | typeof RIGHT = DOWN;
  destinationPosition: Vector2 = new Vector2(1, 1);
  lastPosition: Vector2 = new Vector2(1, 1);
  body?: Sprite;
  shadow?: Sprite;
  isUserControlled? = false;
  slopeType: undefined | typeof UP | typeof DOWN;
  slopeDirection: undefined | typeof UP | typeof DOWN | typeof LEFT | typeof RIGHT;
  ogScale = new Vector2(1, 1);
  endScale = new Vector2(1, 1);
  steppedUpOrDown = false;
  slopeIncrements = 0.05;
  lastStandAnimationTime = 0;
  lastMaskCalculationTime = 1110;
  slopeStepHeight?: Vector2;
  speed: number = 1;
  scale: Vector2 = new Vector2(1, 1);
  latestMessage = "";
  mask?: Mask = undefined
  distanceLeftToTravel? = 0;
  itemPickupTime: number = 0;
  itemPickupShell: any;
  isLocked = false;
  hp = 0;
  level = 1;
  exp = 0;
  expForNextLevel = 0;
  isWarping = false;

  private messageCache: HTMLCanvasElement | null = null;
  private cachedMessage: string = "";

  constructor(params: {
    id: number,
    name: string,
    body?: Sprite,
    shadow?: Sprite,
    position?: Vector2,
    colorSwap?: ColorSwap,
    isUserControlled?: boolean,
    speed?: number,
    hp?: number,
    exp?: number,
    expForNextLevel?: number,
    level?: number,
    mask?: Mask,
    preventDraw?: boolean,
    forceDrawName?: boolean,
    preventDrawName?: boolean,
    facingDirection?: "UP" | "DOWN" | "LEFT" | "RIGHT" | undefined,
  }) {
    super({
      position: params.position ?? new Vector2(0, 0),
      colorSwap: params.colorSwap,
      preventDraw: params.preventDraw,
      forceDrawName: params.forceDrawName ?? true,
      preventDrawName: params.preventDrawName ?? true,
    });
    this.id = params.id;
    this.name = params.name;
    this.body = this.preventDraw ? undefined : params.body;
    this.shadow = this.preventDraw ? undefined : params.shadow;
    this.destinationPosition = this.position.duplicate();
    this.speed = params.speed ?? 1;
    this.level = params.level ?? 1;
    this.exp = params.exp ?? 0;
    this.expForNextLevel = params.expForNextLevel ?? 0;
    this.hp = params.hp ?? 0;
    this.facingDirection = params.facingDirection ?? DOWN;
    this.isUserControlled = params.isUserControlled ?? false;
    this.mask = params.mask;
    if (this.body) {
      this.initializeBody();
    }  
    setTimeout(() => {
      this.body?.animations?.play("stand" +
        this.facingDirection.charAt(0) +
        this.facingDirection.substring(1).toLowerCase());
    }, 100);

    this.setupEvents();
  }

  override destroy() {
    if (this.isWarping) {
      const warpBase = new WarpBase({ position: this.position, parentId: this.id, offsetX: -8, offsetY: 12 });
      this.parent?.addChild(warpBase);
      this.isWarping = false;
      setTimeout(() => {
        warpBase.destroy();
        this.destroy();
      }, 1300);
    } else { 
      this.destroyBody();
      super.destroy();
    }
  }

  destroyBody() {
    this.children?.forEach((x: any) => x.destroy());
    this.body?.destroy(); 
    this.mask?.destroy();
  }

  initializeBody() {
    let offsetY;
    if (this.scale.y < 0.75) {
      offsetY = 7;
    } else if (this.scale.y < 0.8) {
      offsetY = 5;
    } else if (this.scale.y < 0.9) {
      offsetY = 5;
    } else if (this.scale.y < 0.95) {
      offsetY = 3;
    } else {
      offsetY = 0;
    }
    if (this.body) {
      this.destroyBody();
      this.body.scale = this.scale;
      this.body.position.y = offsetY;
      if (this.shadow) { 
        this.shadow.scale = this.scale;
        this.shadow.position.y = offsetY;
      }
      if (!this.children.includes(this.body)) {
        this.addChild(this.body);
      }
      if (this.shadow && !this.children.includes(this.shadow)) {
        this.addChild(this.shadow);
      }

      let animation = this.body?.animations?.activeKey;
      if (!animation) {
        this.body?.animations?.play(animation ?? "standDown");
      }

      this.reinitializeMask();
    }
  }

  private reinitializeMask() {
    if (this.mask && this.body) {
      this.mask.colorSwap = this.colorSwap;
      let offsetY;
      if (this.scale.y < 0.75) {
        offsetY = 7;
      } else if (this.scale.y < 0.8) {
        offsetY = 5;
      } else if (this.scale.y < 0.9) {
        offsetY = 5;
      } else if (this.scale.y < 0.95) {
        offsetY = 3;
      } else {
        offsetY = 0;
      }
      if (this.facingDirection == UP) {
      } else if (this.facingDirection == DOWN) {
        this.mask.frame = 0;
      } else if (this.facingDirection == LEFT) {
        this.mask.frame = 1;
      } else if (this.facingDirection == RIGHT) {
        this.mask.frame = 2;
      }

      this.mask.scale = this.scale;
      this.mask.position = this.body.position.duplicate();
      this.mask.position.y += offsetY / 2;
      this.mask.offsetX = offsetY / 2;

      if (!this.children.includes(this.mask)) {
        this.addChild(this.mask);
      }
    }
  }

  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    this.drawLatestMessage(ctx, drawPosX, drawPosY);
    if (!this.preventDrawName) {
      this.drawName(ctx, drawPosX, drawPosY);
    }
    if ((this as any).isEnemy) {
      this.drawHP(ctx, drawPosX, drawPosY);
      this.drawExp(ctx, drawPosX, drawPosY);
    }
  }

  override step(delta: number, root: any) {
    const input = root.input as Input;
    if (this.isLocked) return;

    if (this.itemPickupTime > 0) {
      this.workOnItemPickup(delta);
      return;
    }
    if (input?.getActionJustPressed("Space") && this.isUserControlled) {
      const objectAtPosition = isObjectNearby(this);
      if (objectAtPosition) {
        events.emit("HERO_REQUESTS_ACTION", { hero: this, objectAtPosition: objectAtPosition });
      }
    }

    this.distanceLeftToTravel = moveTowards(this, this.destinationPosition, this.speed);
    const hasArrived = (this.distanceLeftToTravel ?? 0) <= 1;
    if (hasArrived || !this.isUserControlled) {
      tryMove(this, root, (this.isUserControlled ?? false), this.distanceLeftToTravel ?? 0);
    }

    this.tryEmitPosition();
    this.recalculateMaskPositioning();
  }

  tryEmitPosition() {
    if (this.lastPosition.x === this.position.x && this.lastPosition.y === this.position.y) {
      return;
    }
    this.lastPosition.x = this.position.x;
    this.lastPosition.y = this.position.y;
    events.emit("CHARACTER_POSITION", this);
    //if (this.name == "Max") console.log("emitting position", this.lastPosition);
  }

  onPickupItem(data: { position: Vector2, hero: any, name: string, imageName: string, category: string, stats?: any }) {
    //console.log(data);
    if (data.hero?.id == this.id) {
/*      this.mask?.destroy();*/ 
      this.itemPickupTime = 2500;
      this.itemPickupShell = new GameObject({ position: new Vector2(0, 0) });
      this.itemPickupShell.addChild(new Sprite({
        resource: resources.images[data.imageName],
        position: new Vector2(0, -30),
        scale: new Vector2(0.85, 0.85),
        frameSize: new Vector2(22, 24),
      }));
      this.addChild(this.itemPickupShell);
      this.recalculateMaskPositioning();
    }
  }
  private recalculateMaskPositioning() {
    if (!this.mask || !this.body) return;
    const currentTime = Date.now();
    if (currentTime - this.lastMaskCalculationTime < 10) return;
    this.lastMaskCalculationTime = currentTime;


    this.mask.offsetY = this.body.offsetY;
    if (this.body.frame >= 12 && this.body.frame < 16) {
      this.mask.preventDraw = true;
    } else {
      this.mask.preventDraw = false;

      switch (this.body.frame) {
        case 5:
        case 7:
          this.mask.offsetY += 2;
          break;

        case 8:
          // Set frame 1 and keep offsetY at 0 for frame 8
          this.mask.frame = 1;
          break;

        case 9:
          // Set frame 1 with an adjusted offsetY for frame 9
          this.mask.frame = 1;
          this.mask.offsetY += -2;
          break;

        case 10:
          this.mask.frame = 2;
          break;

        case 11:
          // Set frame 2 for frames 10 and 11
          this.mask.frame = 2;
          this.mask.offsetY += -2;
          break;

        default:
          // Default to frame 0 for any other cases
          this.mask.frame = 0;
          break;
      }
    }
  }
  workOnItemPickup(delta: number) {
    this.itemPickupTime -= delta;
    if (this.body?.animations?.activeKey != "pickupDown") {
      this.body?.animations?.play("pickupDown");
    }
    this.recalculateMaskPositioning();
    if (this.itemPickupTime <= 0) {
      this.itemPickupShell.destroy();
    }
  }

  setupEvents() {
    events.emit("CHARACTER_CREATED", this);
    events.on("CHARACTER_SLOPE", this, (params: {
      character: Character;
      slopeType: typeof UP | typeof DOWN;
      slopeDirection: typeof UP | typeof DOWN | typeof LEFT | typeof RIGHT;
      startScale: Vector2;
      endScale: Vector2;
      slopeStepHeight: Vector2;
    }) => {
      if (params.character.id === this.id) {
        this.ogScale = this.scale;
        this.endScale = params.endScale;
        this.slopeType = params.slopeType;
        this.slopeDirection = params.slopeDirection;
        this.slopeStepHeight = params.slopeStepHeight;

        if (!this.scale.matches(params.startScale)) {
          this.scale = params.startScale;
          this.ogScale = params.startScale;
          this.endScale = params.endScale;
          this.initializeBody();
        }
      }
    });
    events.on("CHARACTER_PICKS_UP_ITEM", this, (data: {
      position: Vector2;
      hero: Character;
      name: string;
      imageName: string;
      category: string;
      stats: any;
    }) => {
      this.onPickupItem(data);
    });
  }
  drawHP(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    // Define HP bar dimensions
    const barWidth = 40;  // Total width of HP bar
    const barHeight = 6;  // Height of HP bar
    const barX = drawPosX - barWidth / 2 + 10;  // Center the bar
    const barY = drawPosY - 12;  // Position above character

    // Calculate HP percentage
    const hpPercentage = Math.max(0, this.hp / 100); // Ensure non-negative

    // Colors
    const backgroundColor = "rgba(0, 0, 0, 0.7)"; // Dark background
    const hpColor = "red"; // HP bar fill

    // Draw background box
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Draw red HP bar (filled portion)
    ctx.fillStyle = hpColor;
    ctx.fillRect(barX, barY, barWidth * hpPercentage, barHeight);

    // HP text
    const hpText = `${this.hp}`;
    ctx.font = "6px fontRetroGaming";
    ctx.textAlign = "center";

    // Measure text width 
    const textX = barX + (barWidth / 2);
    const textY = barY + barHeight - 1;

    // Determine text color for contrast (White if dark, Black if bright)
    const textColor = "white";

    // Draw HP text
    ctx.fillStyle = textColor;
    ctx.fillText(hpText, textX, textY);
  }

  drawExp(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    if (this.expForNextLevel === 0) {
      this.calculateExpForNextLevel(this);
    }

    // Define EXP bar dimensions
    const barWidth = 40;
    const barHeight = 4;
    const barX = drawPosX - barWidth / 2 + 10;
    const barY = drawPosY - 7; // Positioned below HP bar

    // Calculate EXP percentage
    const expPercentage = Math.max(0, this.exp / this.expForNextLevel);

    // Colors
    const backgroundColor = "rgba(0, 0, 0, 0.7)"; // Semi-transparent black
    const expColor = "yellow"; // EXP bar fill

    // Draw background box
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Draw yellow EXP bar (filled portion)
    ctx.fillStyle = expColor;
    ctx.fillRect(barX, barY, barWidth * expPercentage, barHeight);
  }


  drawLatestMessage(ctx: CanvasRenderingContext2D, characterCenterX: number, characterTopY: number) {
    if (!this.latestMessage.trim()) return;

    if (this.latestMessage !== this.cachedMessage) {
      this.cachedMessage = this.latestMessage;

      this.messageCache = document.createElement("canvas");
      const offCtx = this.messageCache.getContext("2d");
      if (!offCtx) return;

      const lines = this.splitMessageIntoLines(this.latestMessage, offCtx);
      const padding = 10; // Padding around the text inside the bubble
      const textHeight = 8; // Approximate height per line
      const tailHeight = 5; // Height of the bubble's tail

      const bubbleWidth = Math.max(...lines.map(line => offCtx.measureText(line).width)) + padding * 2 + 5;
      const bubbleHeight = lines.length * textHeight + padding;

      // Set canvas dimensions based on bubble size
      this.messageCache.width = bubbleWidth;
      this.messageCache.height = bubbleHeight + tailHeight; // Extra space for the bubble's tail

      // Bubble styling
      offCtx.font = "8px fontRetroGaming";
      offCtx.fillStyle = "rgba(255, 255, 255, 0.8)";
      offCtx.strokeStyle = "black";
      offCtx.lineWidth = 1;

      // Draw the bubble with rounded corners and a tail
      offCtx.beginPath();
      offCtx.moveTo(3, 0);
      offCtx.lineTo(bubbleWidth - 10, 0);
      offCtx.quadraticCurveTo(bubbleWidth, 0, bubbleWidth, 10);
      offCtx.lineTo(bubbleWidth, bubbleHeight - 10);
      offCtx.quadraticCurveTo(bubbleWidth, bubbleHeight, bubbleWidth - 10, bubbleHeight);

      // Draw the tail at the bottom center
      const tailX = bubbleWidth / 2;
      offCtx.lineTo(tailX + 5, bubbleHeight); // Right side of the tail
      offCtx.lineTo(tailX, bubbleHeight + tailHeight); // Point of the tail
      offCtx.lineTo(tailX - 5, bubbleHeight); // Left side of the tail

      // Complete the bubble
      offCtx.lineTo(10, bubbleHeight);
      offCtx.quadraticCurveTo(0, bubbleHeight, 0, bubbleHeight - 10);
      offCtx.lineTo(0, 10);
      offCtx.quadraticCurveTo(0, 0, 10, 0);
      offCtx.closePath();

      // Fill and stroke the bubble
      offCtx.fill();
      offCtx.stroke();

      // Draw the text inside the bubble
      offCtx.fillStyle = "black";
      lines.forEach((line, index) => {
        offCtx.fillText(line, padding, padding + index * textHeight + 2.5);
      });
    }

    const verticalOffset = 20; // Increase this value to move the bubble higher
    const horizontalOffset = -5; // Increase this value to move the bubble higher
    const bubbleTopY = characterTopY - (this.messageCache?.height ?? 0) - verticalOffset;

    if (this.messageCache) {
      const bubbleTopX = characterCenterX - this.messageCache.width / 2 - horizontalOffset;
      ctx.drawImage(this.messageCache, bubbleTopX, bubbleTopY);
    }
  }

  private calculateExpForNextLevel(player: Character) {
    player.expForNextLevel = (player.level + 1) * 15;
  }

  private splitMessageIntoLines(message: string, ctx: CanvasRenderingContext2D): string[] {
    const words = message.split(" ");
    const maxLineWidth = 120;
    let lines = [];
    let currentLine = "";

    for (let word of words) {
      const testLine = currentLine + word + " ";
      if (ctx.measureText(testLine).width > maxLineWidth && currentLine.length > 0) {
        lines.push(currentLine.trim());
        currentLine = word + " ";
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine.length > 0) {
      lines.push(currentLine.trim());
    }
    return lines;
  } 
}
