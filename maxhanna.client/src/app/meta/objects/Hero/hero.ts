import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { MetaBot } from "../../../../services/datacontracts/meta/meta-bot";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
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
  private messageCache: HTMLCanvasElement | null = null;
  private cachedMessage: string = "";

  constructor(params: { position: Vector2, colorSwap?: ColorSwap, isUserControlled?: boolean, speed?: number }) {
    super({
      position: params.position,
      colorSwap: params.colorSwap
    })
    if (params.isUserControlled) {
      this.isUserControlled = params.isUserControlled;
    }
    //console.log("New Hero at position : ", this.position);
    this.facingDirection = DOWN;
    this.destinationPosition = this.position.duplicate();
    this.lastPosition = this.position.duplicate();
    this.name = "Anon";
    this.speed = params.speed ?? 1;
    this.id = 0;
    this.itemPickupTime = 0;
    this.metabots = [];
    const shadow = new Sprite({
      resource: resources.images["shadow"],
      position: new Vector2(-18, -18),
      scale: new Vector2(1.25, 1),
      frameSize: new Vector2(32, 32),
    });
    shadow.drawLayer = "FLOOR";
    this.addChild(shadow);

    this.body = new Sprite({
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
      colorSwap: this.colorSwap
    }); 
    this.addChild(this.body);
    this.body.animations?.play("standDown"); 
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
    events.on("HERO_PICKS_UP_ITEM", this, (data:
      {
        image: any,
        position: Vector2,
        hero: Hero,
        name: string,
        imageName: string,
        category: string
      }) => {
      this.onPickupItem(data);
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
  }

  private isObjectNeerby() {
    const posibilities = this.parent.children.filter((child: GameObject) => {
      // Calculate the neighboring position with the facing direction
      const neighborPosition = this.position.toNeighbour(this.facingDirection);

      // Define the discrepancy value
      const discrepancy = 0.05;
      // Check if the child's position is within the discrepancy range of the neighbor position
      return (
        !(child instanceof Sprite) &&
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
    if (this.isUserControlled) {
      events.emit("HERO_POSITION", this);
    }
    this.lastPosition = this.position.duplicate();
  }

  tryMove(root: any) {
    const { input } = root;
    if (!input.direction || !this.isUserControlled) {
      //console.log("stand" + this.facingDirection.charAt(0) + this.facingDirection.substring(1, this.facingDirection.length).toLowerCase());
      if (this.destinationPosition.x == 0 && this.destinationPosition.y == 0) {
        this.destinationPosition = this.position.duplicate();
      }
      this.body.animations?.play("stand" + this.facingDirection.charAt(0) + this.facingDirection.substring(1, this.facingDirection.length).toLowerCase());
      return;
    }

    const gridSize = gridCells(1);
    if (this.destinationPosition) {
      let position = this.destinationPosition.duplicate();

      if (input.direction === DOWN) {
        position.y = snapToGrid(position.y + gridSize, gridSize);
        this.body.animations?.play("walkDown");
      }
      else if (input.direction === UP) {
        position.y = snapToGrid(position.y - gridSize, gridSize);
        this.body.animations?.play("walkUp");
      }
      else if (input.direction === LEFT) {
        position.x = snapToGrid(position.x - gridSize, gridSize);
        this.body.animations?.play("walkLeft");
      }
      else if (input.direction === RIGHT) {
        position.x = snapToGrid(position.x + gridSize, gridSize);
        this.body.animations?.play("walkRight");
      }

      this.facingDirection = input.direction ?? this.facingDirection;
      const spaceIsFree = isSpaceFree(root.level?.walls, position.x, position.y);
      const solidBodyAtSpace = this.parent.children.find((c: any) => {
        return c.isSolid
          && c.position.x == position.x
          && c.position.y == position.y
      });
      if (spaceIsFree && !solidBodyAtSpace) {
        this.destinationPosition = position;
      }
    }
  }

  otherPlayerMove(root: any) {
    if (!this.isUserControlled) {
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
          } else if (deltaX < 0) {
            tmpPosition.x = (tmpPosition.x);
            this.facingDirection = LEFT;
            this.body.animations?.play("walkLeft");
            console.log("walk left");
          }
        }
        if (deltaY != 0) {
          if (deltaY > 0) {
            tmpPosition.y = tmpPosition.y;
            this.facingDirection = DOWN;
            this.body.animations?.play("walkDown");
          } else if (deltaY < 0) {
            tmpPosition.y = tmpPosition.y;
            this.facingDirection = UP;
            this.body.animations?.play("walkUp");
          }
        }
        this.updateAnimation();
        const spaceIsFree = isSpaceFree(root.level?.walls, tmpPosition.x, tmpPosition.y);
        const solidBodyAtSpace = this.parent.children.find((c: any) => {
          return c.isSolid
            && c.position.x == tmpPosition.x
            && c.position.y == tmpPosition.y
        })
        if (spaceIsFree && !solidBodyAtSpace) {
          this.position = tmpPosition;
        }
      }
    }

  }

  onPickupItem(data: { image: any, position: Vector2, hero: any }) {
    if (data.hero?.id == this.id) {
      this.destinationPosition = data.position.duplicate();
      this.itemPickupTime = 2500;
      this.itemPickupShell = new GameObject({ position: new Vector2(0, 0) });
      this.itemPickupShell.addChild(new Sprite({
        resource: data.image,
        position: new Vector2(0, -30),
        scale: new Vector2(0.85, 0.85),
        frameSize: new Vector2(22, 24),
      }));
      this.addChild(this.itemPickupShell);
    }
  }
  workOnItemPickup(delta: number) {
    this.itemPickupTime -= delta;
    this.body.animations?.play("pickupDown");
    if (this.itemPickupTime <= 0) {
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
}
