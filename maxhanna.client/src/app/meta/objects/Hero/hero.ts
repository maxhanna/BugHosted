import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { MetaBot } from "../../../../services/datacontracts/meta/meta-bot";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { Mask } from "../Wardrobe/mask";
import { Input } from "../../helpers/input";
import { DOWN, LEFT, RIGHT, UP, gridCells, isSpaceFree, snapToGrid } from "../../helpers/grid-cells";
import { Animations } from "../../helpers/animations";
import { moveTowards } from "../../helpers/move-towards";
import { resources } from "../../helpers/resources";
import { FrameIndexPattern } from "../../helpers/frame-index-pattern";
import { events } from "../../helpers/events";
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP, PICK_UP_DOWN } from "./hero-animations";
import { ColorSwap } from "../../../../services/datacontracts/meta/color-swap";
import { SpriteTextString } from "../SpriteTextString/sprite-text-string";

export class Hero extends GameObject {
  facingDirection: string;
  destinationPosition: Vector2;
  body: Sprite;
  isUserControlled = false;
  id: number;
  name: string;
  metabots?: MetaBot[];
  lastPosition: Vector2;
  itemPickupTime: number;
  lastStandAnimationTime = 0;
  itemPickupShell: any;
  isLocked = false;
  latestMessage = "";
  speed: number;
  scale: Vector2;
  private messageCache: HTMLCanvasElement | null = null;
  private cachedMessage: string = "";

  mask?: Mask = undefined
  slopeType: undefined | typeof UP | typeof DOWN;
  slopeDirection: undefined | typeof UP | typeof DOWN | typeof LEFT | typeof RIGHT;
  ogScale = new Vector2(1, 1);
  endScale = new Vector2(1, 1);
  steppedUpOrDown = false;
  slopeIncrements = 0.05;
  slopeStepHeight?: Vector2;

  constructor(params: { position: Vector2, id?: number, name?: string, metabots?: MetaBot[], colorSwap?: ColorSwap, isUserControlled?: boolean, speed?: number, mask?: Mask, scale?: Vector2 }) {
    super({
      position: params.position,
      colorSwap: params.colorSwap,
    })
    if (params.isUserControlled) {
      this.isUserControlled = params.isUserControlled;
    }
    //console.log("New Hero at position : ", this.position);
    this.facingDirection = DOWN;
    this.destinationPosition = this.position.duplicate();
    this.lastPosition = this.position.duplicate();
    this.name = params.name ?? "Anon";
    this.speed = params.speed ?? 1;
    this.mask = params.mask;
    this.id = params.id ?? 0;
    this.itemPickupTime = 0;
    this.scale = params.scale ?? new Vector2(1, 1);
    this.metabots = params.metabots ?? [];
    const shadow = new Sprite({
      resource: resources.images["shadow"],
      position: new Vector2(-18, -18),
      scale: new Vector2(1.25, 1),
      frameSize: new Vector2(32, 32),
    });
    shadow.drawLayer = "FLOOR";
    this.addChild(shadow);

    this.body = this.initializeBody();
  }

  private destroyBody() {
    console.log("destroying body");
    if (this.body) {
      this.body.destroy();
    }
    if (this.mask) {
      this.mask.destroy();
    }
  }

  private initializeBody(redraw?: boolean) {
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

    let tmpBody = new Sprite({
      objectId: this.id,
      resource: resources.images["hero"],
      position: new Vector2(-8, -20),
      frameSize: new Vector2(32, 32),
      hFrames: 4,
      vFrames: 5,
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
        }),
      colorSwap: this.colorSwap,
      scale: this.scale,
      offsetY: offsetY

    });
    this.addChild(tmpBody);
    let animation = this.body?.animations?.activeKey;
    tmpBody.animations?.play(animation ?? "standDown");

    if (this.mask) {
      if (redraw) {
        if (this.facingDirection == UP) {
          return tmpBody;
        } else if (this.facingDirection == DOWN) {
          this.mask.frame = 0;
        } else if (this.facingDirection == LEFT) {
          this.mask.frame = 1;
        } else if (this.facingDirection == RIGHT) {
          this.mask.frame = 2;
        }
      }
      console.log("offset", offsetY);
      this.mask.scale = this.scale;
      this.mask.position = tmpBody.position.duplicate();
      this.mask.position.y += offsetY;
      this.mask.offsetX = offsetY / 2;
      this.addChild(this.mask);
    }
    return tmpBody;
  }

  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    // Draw the player's name
    this.drawName(ctx, drawPosX, drawPosY);

    // Draw the latest message as a chat bubble above the player
    this.drawLatestMessage(ctx, drawPosX, drawPosY);
  }

  private drawLatestMessage(ctx: CanvasRenderingContext2D, characterCenterX: number, characterTopY: number) {
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

  private drawName(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    if (this.name) {
      // Set the font style and size for the name
      ctx.font = "7px fontRetroGaming"; // Font and size
      ctx.fillStyle = "chartreuse"; // Text color
      ctx.textAlign = "center"; // Center the text


      // Measure the width of the text
      const textWidth = ctx.measureText(this.name).width;

      // Set box properties for name
      const boxPadding = 2; // Padding around the text
      const boxWidth = textWidth + boxPadding * 2; // Box width
      const boxHeight = 8; // Box height (fixed height)
      const boxX = drawPosX - (boxWidth / 2) + 6; // Center the box horizontally
      const boxY = drawPosY + 10; // Position the box below the player


      // Draw the dark background box for the name
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)"; // Semi-transparent black for the box
      ctx.fillRect(boxX, boxY, boxWidth, boxHeight); // Draw the box

      // Draw the name text on top of the box
      ctx.fillStyle = "chartreuse";
      ctx.fillText(this.name, drawPosX + 6, boxY + boxHeight - 1);
    }
  }

  override ready() {
    events.emit("HERO_CREATED", this);
    events.on("HERO_PICKS_UP_ITEM", this, (data:
      {
        position: Vector2,
        hero: Hero,
        name: string,
        imageName: string,
        category: string,
        stats: any,
      }) => {
      this.onPickupItem(data);
    });
    events.on("HERO_SLOPE", this, (params: {
      heroId: number,
      slopeType: typeof UP | typeof DOWN,
      slopeDirection: typeof UP | typeof DOWN | typeof LEFT | typeof RIGHT,
      startScale: Vector2,
      endScale: Vector2,
      slopeStepHeight: Vector2
    }) => {
      if (params.heroId === this.id) {
        this.ogScale = this.scale;
        this.endScale = params.endScale;
        this.slopeType = params.slopeType;
        this.slopeDirection = params.slopeDirection;
        this.slopeStepHeight = params.slopeStepHeight;

        let blockUpdate = false;
        if (this.scale.matches(params.startScale)) {
          blockUpdate = true;
        } else if (this.slopeDirection === DOWN && (this.facingDirection === LEFT || this.facingDirection === RIGHT)) {
          blockUpdate = true;
        }

        if (!blockUpdate) {
          this.scale = params.startScale;
          this.ogScale = params.startScale;
          this.destroyBody();
          this.body = this.initializeBody(true);
        }

      }
    });

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
      events.on("SELECTED_ITEM", this, (selectedItem: string) => {
        if (selectedItem === "Party Up") {
          events.emit("PARTY_UP", this.isObjectNeerby());
        }
        else if (selectedItem === "Wave") {
          events.emit("WAVE_AT", this.isObjectNeerby());
        } 
      });
      events.on("CLOSE_HERO_DIALOGUE", this, () => { 
        this.isLocked = false;
        events.emit("END_TEXT_BOX");
      });
      events.on("WARP", this, (params: { x: string, y: string }) => {

        const warpPosition = new Vector2(gridCells(parseInt(params.x)), gridCells(parseInt(params.y)));
        const bodyAtSpace = this.bodyAtSpace(warpPosition);
        if (bodyAtSpace) {
          this.destinationPosition = warpPosition.duplicate();
          this.position = this.destinationPosition.duplicate();
        } else {
          events.emit("INVALID_WARP", this);
        }
      });
    }
  }

  override step(delta: number, root: any) {
    if (this.isLocked) return;

    if (this.itemPickupTime > 0) {
      this.workOnItemPickup(delta);
      return;
    }
    const input = root.input as Input;
    if (input?.getActionJustPressed("Space") && this.isUserControlled) {
      //look for an object at the next space (according to where the hero is facing)
      const objectAtPosition = this.isObjectNeerby();

      if (objectAtPosition) {
        console.log(objectAtPosition);
        events.emit("HERO_REQUESTS_ACTION", objectAtPosition);
      }
    }
    const distance = moveTowards(this, this.destinationPosition, this.speed);
    const hasArrived = (distance ?? 0) <= 1;
    if (hasArrived && this.isUserControlled) {
      this.tryMove(root);
    }


    this.otherPlayerMove(root);
    this.tryEmitPosition();
    this.recalculateMaskPositioning();
  }

  private recalculateMaskPositioning() {
    if (!this.mask) return;
    this.mask.offsetY = 0;
    if (this.body.frame >= 12 && this.body.frame < 16) {
      this.mask.preventDraw = true;
    } else {
      this.mask.preventDraw = false;

      switch (this.body.frame) {
        case 5:
        case 7:
          this.mask.offsetY = 2;
          break;

        case 8:
          // Set frame 1 and keep offsetY at 0 for frame 8
          this.mask.frame = 1;
          break;

        case 9:
          // Set frame 1 with an adjusted offsetY for frame 9
          this.mask.frame = 1;
          this.mask.offsetY = -2;
          break;

        case 10:
          this.mask.frame = 2;
          break;

        case 11:
          // Set frame 2 for frames 10 and 11
          this.mask.frame = 2;
          this.mask.offsetY = -2;
          break;

        default:
          // Default to frame 0 for any other cases
          this.mask.frame = 0;
          break;
      }
    }

  }

  private isObjectNeerby() {
    const posibilities = this.parent.children.filter((child: GameObject) => {
      // Calculate the neighboring position with the facing direction
      const neighborPosition = this.position.toNeighbour(this.facingDirection);
      // Define the discrepancy value
      const discrepancy = 1;
      // Check if the child's position is within the discrepancy range of the neighbor position
      return (
        (!(child instanceof Sprite) || child.textContent) &&
        child.position.x >= neighborPosition.x - discrepancy &&
        child.position.x <= neighborPosition.x + discrepancy &&
        child.position.y >= neighborPosition.y - discrepancy &&
        child.position.y <= neighborPosition.y + discrepancy
      );
    });
    console.log(posibilities);
    const bestChoice = posibilities.find((x: any) => x.textContent?.string);
    if (bestChoice) {
      return bestChoice;
    }
    const bestChoiceContent = posibilities.find((x: any) => typeof x.getContent === 'function' && x.getContent());
    if (bestChoiceContent) {
      return bestChoiceContent;
    }
    const secondBestChoice = posibilities.find((x: any) => x.drawLayer != "FLOOR");
    if (secondBestChoice) {
      return secondBestChoice;
    }
    return posibilities[0];
  }

  updateAnimation() {
    setTimeout(() => {
      const currentTime = new Date().getTime();
      if (currentTime - this.lastStandAnimationTime >= 300) {
        if (this.destinationPosition.matches(this.position)) {
          this.body.animations?.play(
            "stand" + this.facingDirection.charAt(0) +
            this.facingDirection.substring(1, this.facingDirection.length).toLowerCase()
          );
        }
        this.lastStandAnimationTime = currentTime; // Update the last time it was run
      }
    }, (this.isUserControlled ? 1000 : 2000));
  }
  tryEmitPosition() {
    if (this.lastPosition.x === this.position.x && this.lastPosition.y === this.position.y) {
      return;
    }
    events.emit("HERO_POSITION", this);
    this.lastPosition = this.position.duplicate();
  }

  tryMove(root: any) {
    const { input } = root;
    if (!input.direction) {
      //console.log("stand" + this.facingDirection.charAt(0) + this.facingDirection.substring(1, this.facingDirection.length).toLowerCase()); 
      this.body.animations?.play("stand" + this.facingDirection.charAt(0) + this.facingDirection.substring(1, this.facingDirection.length).toLowerCase());
      return;
    }

    const gridSize = gridCells(1);
    if (this.destinationPosition) {
      let position = this.destinationPosition.duplicate();

      if (input.direction === DOWN) {
        position.x = snapToGrid(position.x, gridSize);
        position.y = snapToGrid(position.y + gridSize, gridSize);
        this.body.animations?.play("walkDown");
      }
      else if (input.direction === UP) {
        position.x = snapToGrid(position.x, gridSize);
        position.y = snapToGrid(position.y - gridSize, gridSize);
        this.body.animations?.play("walkUp");
      }
      else if (input.direction === LEFT) {
        position.x = snapToGrid(position.x - gridSize, gridSize);
        position.y = snapToGrid(position.y, gridSize);
        this.body.animations?.play("walkLeft");
      }
      else if (input.direction === RIGHT) {
        position.x = snapToGrid(position.x + gridSize, gridSize);
        position.y = snapToGrid(position.y, gridSize);
        this.body.animations?.play("walkRight");
      }

      this.facingDirection = input.direction ?? this.facingDirection;   

      if (!this.bodyAtSpace(position)) {
        this.destinationPosition = this.lastPosition.duplicate();
        console.log("No body at space, setting to previous position ", this.lastPosition);
        return;
      }
      console.log(position);
      if (isSpaceFree(root.level?.walls, position.x, position.y) && !this.bodyAtSpace(position, true)) {
        this.destinationPosition = position;
        if (this.slopeType) {
          this.recalculateScaleBasedOnSlope();
          console.log(`slopeType: ${this.slopeType}, slopeDirection: ${this.slopeDirection}, slopeStepHeight: ${this.slopeStepHeight}, facingDirection: ${this.facingDirection}, scale: ${this.scale}`);
        }
      } else {
        this.destinationPosition = this.position.duplicate();
      }
    }
  }


  private bodyAtSpace(position: Vector2, solid?: boolean) {
    return this.parent.children.find((c: any) => {
      return (solid ? c.isSolid : true) && c.position.x == position.x
        && c.position.y == position.y;
    });
  } 

  otherPlayerMove(root: any) {
    if (!this.isUserControlled) {
      let moved = false;
      this.position = this.position.duplicate();
      this.destinationPosition = this.destinationPosition.duplicate();
      const destPos = this.destinationPosition;
      let tmpPosition = this.position;
      if (destPos) {
        // Calculate the difference between destination and current position
        const deltaX = destPos.x - tmpPosition.x;
        const deltaY = destPos.y - tmpPosition.y;
        const gridSize = gridCells(1);
        if (deltaX != 0 || deltaY != 0) {
          if (deltaX > 0) {
            tmpPosition.x = (tmpPosition.x);
            this.facingDirection = RIGHT;
            this.body.animations?.play("walkRight");
            console.log("walk right");
            moved = true;
          } else if (deltaX < 0) {
            tmpPosition.x = (tmpPosition.x);
            this.facingDirection = LEFT;
            this.body.animations?.play("walkLeft");
            console.log("walk left");
            moved = true;
          }
        }
        if (deltaY != 0) {
          if (deltaY > 0) {
            tmpPosition.y = tmpPosition.y;
            this.facingDirection = DOWN;
            this.body.animations?.play("walkDown");
            moved = true;
          } else if (deltaY < 0) {
            tmpPosition.y = tmpPosition.y;
            this.facingDirection = UP;
            this.body.animations?.play("walkUp");
            moved = true;
          }
        }
        this.updateAnimation();
        const spaceIsFree = isSpaceFree(root.level?.walls, tmpPosition.x, tmpPosition.y);
        const solidBodyAtSpace = this.bodyAtSpace(tmpPosition, true);

        if (spaceIsFree && !solidBodyAtSpace) {
          this.position = tmpPosition;
          if (this.slopeType && moved && this.lastPosition.x % 16 == 0 && this.lastPosition.y % 16 == 0) {
            this.recalculateScaleBasedOnSlope();
          }
        }
      }
    }

  }

  onPickupItem(data: { position: Vector2, hero: any, name: string, imageName: string, category: string, stats?: any }) {
    console.log(data);
    if (data.hero?.id == this.id) {
      this.destinationPosition = data.position.duplicate();
      this.itemPickupTime = 2500;
      this.itemPickupShell = new GameObject({ position: new Vector2(0, 0) });
      this.itemPickupShell.addChild(new Sprite({
        resource: resources.images[data.imageName],
        position: new Vector2(0, -30),
        scale: new Vector2(0.85, 0.85),
        frameSize: new Vector2(22, 24),
      }));
      this.addChild(this.itemPickupShell);
    }
  }
  workOnItemPickup(delta: number) {
    console.log("workOnItemPickup activated", delta);
    this.itemPickupTime -= delta;
    if (this.body.animations?.activeKey != "pickupDown") {
      this.body.animations?.play("pickupDown");
      console.log("set pickup down animation");
    }
    if (this.itemPickupTime <= 0) {
      console.log("destroyed itemShell");
      this.itemPickupShell.destroy();
    }
  }
  override getContent() {
    return {
      portraitFrame: 0,
      string: ["Party Up", "Whisper", "Wave", "Cancel"],
      canSelectItems: true,
      addsFlag: null
    }
  }

  private shouldResetSlope() {
    // Check DOWN slope conditions
    if (this.slopeDirection === DOWN && this.facingDirection === UP) {
      if (this.ogScale.x >= this.scale.x || this.ogScale.y >= this.scale.y) {
        return true;
      }
    }
    // Check RIGHT slope conditions
    if (this.slopeDirection === UP && this.facingDirection === DOWN) {
      if (this.ogScale.x <= this.scale.x || this.ogScale.y <= this.scale.y) {
        return true;
      }
    }

    // Check LEFT slope conditions
    if (this.slopeDirection === LEFT && this.facingDirection === RIGHT) {
      if (this.slopeType === UP && (this.ogScale.x >= this.scale.x || this.ogScale.y >= this.scale.y)) {
        return true;
      }
      if (this.slopeType === DOWN && (this.scale.x >= this.ogScale.x || this.scale.y >= this.ogScale.y)) {
        return true;
      }
    }

    // Check RIGHT slope conditions
    if (this.slopeDirection === RIGHT && this.facingDirection === LEFT) {
      if (this.slopeType === DOWN && (this.ogScale.x <= this.scale.x || this.ogScale.y <= this.scale.y)) {
        return true;
      }
      if (this.slopeType === UP && (this.ogScale.x >= this.scale.x || this.ogScale.y >= this.scale.y)) {
        return true;
      }
    }

    // If none of the conditions matched, return false
    return false;
  }

  private recalculateScaleBasedOnSlope() {
    if (!this.slopeDirection || !this.slopeType) return;
    console.log(`before: scale:${this.scale.x}${this.scale.y}, endScale:${this.endScale.x}${this.endScale.y}, ogScale:${this.ogScale.x}${this.ogScale.y}, slopeDir:${this.slopeDirection}, slopeType:${this.slopeType}`);

    if (this.shouldResetSlope()) {
      console.log("autoreset");
      return this.resetSlope(true);
    }

    const preScale = new Vector2(this.scale.x, this.scale.y);
    this.scaleWithStep(preScale);
    console.log(`after : scale:${this.scale.x}${this.scale.y}, endScale:${this.endScale.x}${this.endScale.y}, ogScale:${this.ogScale.x}${this.ogScale.y}, slopeDir:${this.slopeDirection}, slopeType:${this.slopeType}`);
    let forceResetSlope = this.isSlopeResetFromEndScale();

    if (forceResetSlope) {
      console.log("force reset");
      return this.resetSlope(true);
    }
    else {
      if (this.scale.x > 0 && this.scale.y > 0 && !preScale.matches(this.scale)) {
        this.destroyBody();
        this.body = this.initializeBody(true);
        return true;
      }
      else
        return false;
    }
  }

  private isSlopeResetFromEndScale(): boolean {
    let resetSlope = false;
    if (this.slopeType == UP && this.endScale.x <= this.scale.x && this.endScale.y <= this.scale.y) {
      resetSlope = true;
    } else if (this.slopeType == DOWN && this.endScale.x >= this.scale.x && this.endScale.y >= this.scale.y) {
      resetSlope = true;
    }
    return resetSlope;
  }

  private scaleWithStep(preScale: Vector2) {
    if (!this.slopeStepHeight) return;
    const se = this.slopeStepHeight.x;
    if (this.facingDirection === LEFT) {
      if (this.slopeDirection === LEFT && this.slopeType === UP) {
        this.scale = new Vector2(this.scale.x + se, this.scale.y + se);
      } else if (this.slopeDirection === LEFT && this.slopeType === DOWN) {
        this.scale = new Vector2(this.scale.x - se, this.scale.y - se);
      } else if (this.slopeDirection === RIGHT && this.slopeType === DOWN) {
        this.scale = new Vector2(this.scale.x + se, this.scale.y + se);
      } else if (this.slopeDirection === RIGHT && this.slopeType === UP) {
        this.scale = new Vector2(this.scale.x - se, this.scale.y - se);
      }
    } else if (this.facingDirection === RIGHT) {
      if (this.slopeDirection === RIGHT && this.slopeType === UP) {
        this.scale = new Vector2(this.scale.x + se, this.scale.y + se);
      } else if (this.slopeDirection === LEFT && this.slopeType === DOWN) {
        this.scale = new Vector2(this.scale.x + se, this.scale.y + se);
      } else if (this.slopeDirection === LEFT && this.slopeType === UP) {
        this.scale = new Vector2(this.scale.x - se, this.scale.y - se);
      } else if (this.slopeDirection === RIGHT && this.slopeType === DOWN) {
        this.scale = new Vector2(this.scale.x - se, this.scale.y - se);
      }
    } else if (this.facingDirection === UP) {
      if (this.slopeDirection === UP && this.slopeType === UP) {
        this.scale = new Vector2(this.scale.x + se, this.scale.y + se);
      } else if (this.slopeDirection === UP && this.slopeType === DOWN) {
        this.scale = new Vector2(this.scale.x - se, this.scale.y - se);
      } else if (this.slopeDirection === DOWN && this.slopeType === DOWN) {
        this.scale = new Vector2(this.scale.x + se, this.scale.y + se);
      } else if (this.slopeDirection === DOWN && this.slopeType === UP) {
        this.scale = new Vector2(this.scale.x - se, this.scale.y - se);
      }
    } else if (this.facingDirection === DOWN) {
      if (this.slopeDirection === DOWN && this.slopeType === UP) {
        this.scale = new Vector2(this.scale.x + se, this.scale.y + se);
      } else if (this.slopeDirection === DOWN && this.slopeType === DOWN) {
        this.scale = new Vector2(this.scale.x - se, this.scale.y - se);
      } else if (this.slopeDirection === UP && this.slopeType === DOWN) {
        this.scale = new Vector2(this.scale.x + se, this.scale.y + se);
      } else if (this.slopeDirection === UP && this.slopeType === UP) {
        this.scale = new Vector2(this.scale.x - se, this.scale.y - se);
      }
    }
    if (Math.abs(this.ogScale.y - this.scale.y) > 0.1) {
      this.steppedUpOrDown = !this.steppedUpOrDown;
      if (this.ogScale.y < this.scale.y && this.steppedUpOrDown || (this.facingDirection != this.slopeDirection && !this.steppedUpOrDown)) {
        this.destinationPosition.y -= gridCells(1);
        console.log("adjusting down");
      } else if ((this.ogScale.y > this.scale.y && this.steppedUpOrDown) || (this.facingDirection != this.slopeDirection && !this.steppedUpOrDown)) {
        this.destinationPosition.y += gridCells(1);
        //console.log("adjusting down");
      }
    }
  }

  private resetSlope(skipDestroy?: boolean) {
    this.slopeDirection = undefined;
    this.slopeType = undefined;
    this.slopeStepHeight = undefined; 
    this.steppedUpOrDown = false;
    if (!skipDestroy) {
      this.destroyBody();
      this.body = this.initializeBody(true);
    }
    console.log("slope reset", this.endScale);
  }
}
