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
  // Auto-cleared chat bubble message (see getter/setter below)
  private _latestMessage: string = "";
  private latestMessageClearTimer: any; // timeout id for clearing latest message
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
  isBackgroundSelectionLocked = false;

  private messageCache: HTMLCanvasElement | null = null;
  private cachedMessage: string = "";
  // Track cleared message to suppress resurrection from polling while server still sends it
  private lastClearedMessageSig: string | undefined;
  private lastClearedAt: number = 0;
  private currentMessageTimestamp: string | number | undefined;

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
    isSolid?: boolean,
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
      isSolid: params.isSolid ?? true,
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
    // Ensure any pending message clear timer is canceled to avoid leaks
    if (this.latestMessageClearTimer) {
      clearTimeout(this.latestMessageClearTimer); 
      this.latestMessageClearTimer = undefined;
    }
    this.destroyBody();
    events.unsubscribe(this);
    super.destroy();  
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
    if (input?.getActionJustPressed("Space") && this.isUserControlled && !this.isBackgroundSelectionLocked) {
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
  }

  onPickupItem(data: { position: Vector2, hero: any, name: string, imageName: string, category: string, stats?: any }) {
     if (data.hero?.id == this.id && this.itemPickupTime == 0) {
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
    if (!this.mask || !this.body || this.body.frame === undefined) return;
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
    events.on("BLOCK_BACKGROUND_SELECTION", this, () => {
      this.isBackgroundSelectionLocked = true;
    });
    events.on("UNBLOCK_BACKGROUND_SELECTION", this, () => {
      setTimeout(() => { 
        this.isBackgroundSelectionLocked = false;
      }, 10);
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

  drawLevel(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    // Diamond (rhombus) dimensions
    const diamondSize = 12;
    const diamondX = drawPosX + 35; // Position to the left of HP bar
    const diamondY = drawPosY - 8; // Align with HP bar

    // Draw diamond outline
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)"; // Semi-transparent black background
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1;

    // Create diamond path
    ctx.beginPath();
    ctx.moveTo(diamondX, diamondY - diamondSize / 2); // Top point
    ctx.lineTo(diamondX + diamondSize / 2, diamondY); // Right point
    ctx.lineTo(diamondX, diamondY + diamondSize / 2); // Bottom point
    ctx.lineTo(diamondX - diamondSize / 2, diamondY); // Left point
    ctx.closePath();

    // Fill and stroke diamond
    ctx.fill();
    ctx.stroke();

    // Draw level text
    ctx.fillStyle = "white";
    ctx.font = "bold 8px fontRetroGaming";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.level.toString(), diamondX, diamondY);
  }


  drawLatestMessage(ctx: CanvasRenderingContext2D, characterCenterX: number, characterTopY: number) {
    // If message was cleared, ensure cache removed and skip drawing so bubble disappears
    if (!this.latestMessage || !this.latestMessage.trim()) {
      if (this.messageCache) {
        this.messageCache = null;
      }
      this.cachedMessage = "";
      return;
    }

    // Only recreate cache if message changes
    if (this.latestMessage !== this.cachedMessage) {
  this.cachedMessage = this.latestMessage; // track current message so we only regenerate on change

      // Create temp canvas for measurement
      const tempCanvas = document.createElement("canvas");
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return;

      // Set the same font we'll use for rendering
      tempCtx.font = "8px fontRetroGaming";

      // Split message into lines with proper measurement
      const maxWidth = 120; // Maximum bubble width before wrapping
      const lineHeight = 10; // Height of each text line
      const padding = 6; // Reduced padding for tighter fit
      const tailHeight = 6; // Height of the speech bubble tail

      // Split text into lines
      const lines: string[] = [];
      const words = this.latestMessage.split(' ');
      let currentLine = words[0];

      for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const testLine = currentLine + ' ' + word;
        const metrics = tempCtx.measureText(testLine);

        if (metrics.width <= maxWidth) {
          currentLine = testLine;
        } else {
          lines.push(currentLine);
          currentLine = word;
        }
      }
      lines.push(currentLine);

      // Calculate bubble dimensions
      let bubbleWidth = 0;
      for (const line of lines) {
        const width = tempCtx.measureText(line).width;
        if (width > bubbleWidth) bubbleWidth = width;
      }

      // Add padding and ensure minimum width
      bubbleWidth = Math.max(bubbleWidth + padding * 2, 30);
      const bubbleHeight = lines.length * lineHeight + padding * 1.5;

      // Create the message cache canvas
      this.messageCache = document.createElement("canvas");
      this.messageCache.width = bubbleWidth;
      this.messageCache.height = bubbleHeight + tailHeight;
      const bubbleCtx = this.messageCache.getContext("2d");
      if (!bubbleCtx) return;

      // Set the font for rendering
      bubbleCtx.font = "8px fontRetroGaming";

      // Draw speech bubble with tail
      bubbleCtx.fillStyle = "rgba(255, 255, 255, 0.9)";
      bubbleCtx.strokeStyle = "rgba(0, 0, 0, 0.8)";
      bubbleCtx.lineWidth = 1;

      // Bubble body with rounded corners
      const radius = 5;
      bubbleCtx.beginPath();
      bubbleCtx.moveTo(radius, 0);
      bubbleCtx.lineTo(bubbleWidth - radius, 0);
      bubbleCtx.quadraticCurveTo(bubbleWidth, 0, bubbleWidth, radius);
      bubbleCtx.lineTo(bubbleWidth, bubbleHeight - radius);
      bubbleCtx.quadraticCurveTo(bubbleWidth, bubbleHeight, bubbleWidth - radius, bubbleHeight);

      // Speech bubble tail (centered)
      const tailWidth = 10;
      const tailCenter = bubbleWidth / 2;
      bubbleCtx.lineTo(tailCenter + tailWidth / 2, bubbleHeight);
      bubbleCtx.lineTo(tailCenter, bubbleHeight + tailHeight);
      bubbleCtx.lineTo(tailCenter - tailWidth / 2, bubbleHeight);

      // Complete the bubble
      bubbleCtx.lineTo(radius, bubbleHeight);
      bubbleCtx.quadraticCurveTo(0, bubbleHeight, 0, bubbleHeight - radius);
      bubbleCtx.lineTo(0, radius);
      bubbleCtx.quadraticCurveTo(0, 0, radius, 0);
      bubbleCtx.closePath();

      bubbleCtx.fill();
      bubbleCtx.stroke();

      // Draw text lines
      bubbleCtx.fillStyle = "#000";
      bubbleCtx.textAlign = "left";
      bubbleCtx.textBaseline = "top";

      for (let i = 0; i < lines.length; i++) {
        bubbleCtx.fillText(
          lines[i],
          padding,
          padding + (i * lineHeight)
        );
      }
    }

    // Draw the cached bubble
    if (this.messageCache) {
      const verticalOffset = 16; // Distance above character
      const bubbleX = (characterCenterX + 8) - this.messageCache.width / 2;
      const bubbleY = (characterTopY + (this.body?.offsetY ?? 0)) - this.messageCache.height - verticalOffset;

      ctx.drawImage(this.messageCache, bubbleX, bubbleY);
    }
  }

  private calculateExpForNextLevel(player: Character) {
    player.expForNextLevel = (player.level + 1) * 15;
  } 

  // Expose latestMessage with side-effects so external assignments still work
  get latestMessage(): string {
    return this._latestMessage;
  }
  set latestMessage(val: string) {
    if (this._latestMessage === val) return;
    this._latestMessage = val || "";
    // Reset cache so bubble redraws (or disappears) next frame
    if (!this._latestMessage) {
      this.messageCache = null;
      this.cachedMessage = "";
    }
    // Schedule auto-clear if non-empty
    this.scheduleLatestMessageAutoClear();
  }

  private scheduleLatestMessageAutoClear() {
    if (this.latestMessageClearTimer) {
      clearTimeout(this.latestMessageClearTimer); 
      this.latestMessageClearTimer = undefined;
    }
    if (!this._latestMessage) return;  
    this.latestMessageClearTimer = setTimeout(() => { 
      try {
        if (this._latestMessage) {
          // Remember signature so we can suppress immediate reappearance of identical message
          this.lastClearedMessageSig = this.computeMessageSignature(this._latestMessage, this.currentMessageTimestamp);
          this.lastClearedAt = Date.now();
          this._latestMessage = "";
          this.messageCache = null;
          this.cachedMessage = "";
        }
      } catch { }
      finally {
        this.latestMessageClearTimer = undefined;
      }
  }, 10000); // 10 seconds TTL (chat bubble lifespan)
  }

  // Safer external API to apply a chat message with optional timestamp
  public applyChatMessage(content: string, timestamp?: string | number) {
    if (!content) { this.clearChatMessage(); return; }
    const sig = this.computeMessageSignature(content, timestamp);
    // If this exact message was previously cleared, never resurrect it
    if (sig && this.lastClearedMessageSig === sig) return;
    this.currentMessageTimestamp = timestamp;
    this.latestMessage = content;
  }

  public clearChatMessage() {
    if (this._latestMessage) {
      this.lastClearedMessageSig = this.computeMessageSignature(this._latestMessage, this.currentMessageTimestamp);
      this.lastClearedAt = Date.now();
    }
    this.latestMessage = "";
  }

  private computeMessageSignature(content: string, timestamp?: string | number) {
    return `${content}::${timestamp ?? ''}`;
  }
}
