import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { MetaHero } from "../../../../services/datacontracts/meta/meta-hero";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { Input } from "../../helpers/input";
import { DOWN, LEFT, RIGHT, UP, gridCells, isSpaceFree } from "../../helpers/grid-cells";
import { Animations } from "../../helpers/animations";
import { moveTowards } from "../../helpers/move-towards";
import { resources } from "../../helpers/resources";
import { FrameIndexPattern } from "../../helpers/frame-index-pattern";
import { events } from "../../helpers/events"; 
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP, PICK_UP_DOWN } from "./hero-animations";
export class Hero extends GameObject {
  facingDirection: string;
  destinationPosition: Vector2;
  body: Sprite;
  isUserControlled = false;
  id: number;
  name: string;
  lastPosition: Vector2;
  itemPickupTime: number;
  lastStandAnimationTime = 0;
  itemPickupShell: any;
  isLocked = false;
  latestMessage = "";
  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y)
    })
    console.log("New Hero at position : " + x + '; ' + y);
    this.facingDirection = DOWN;
    this.position = new Vector2(x, y);
    this.destinationPosition = this.position.duplicate();
    this.lastPosition = this.position.duplicate();
    this.name = "Anon";
    this.id = 0;
    this.itemPickupTime = 0;

    const shadow = new Sprite(
      0, resources.images["shadow"], new Vector2(-16.5,-33), 1.5, 0, new Vector2(32,32), 0,0,undefined 
    );
    this.addChild(shadow);

    this.body = new Sprite(
      this.id,
      resources.images["hero"],
      new Vector2(-8, -20),
      1,
      1,
      new Vector2(32, 32),
      4,
      5,
      new Animations(
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
        })
    );
    this.addChild(this.body); 
    this.body.animations?.play("standDown");

    events.on("HERO_PICKS_UP_ITEM", this, (data: any) => {
      this.onPickupItem(data);
    })

  }
  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    // Draw the player's name
    if (this.name) {
      // Set the font style and size for the name
      ctx.font = "8px fontRetroGaming"; // Font and size
      ctx.fillStyle = "chartreuse";  // Text color
      ctx.textAlign = "center"; // Center the text

      // Measure the width of the text
      const textWidth = ctx.measureText(this.name).width;

      // Set box properties for name
      const boxPadding = 4; // Padding around the text
      const boxWidth = textWidth + boxPadding * 2; // Box width
      const boxHeight = 12; // Box height (fixed height)
      const boxX = drawPosX - (boxWidth / 2) + 6; // Center the box horizontally
      const boxY = drawPosY + 10; // Position the box below the player

      // Draw the dark background box for the name
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)"; // Semi-transparent black for the box
      ctx.fillRect(boxX, boxY, boxWidth, boxHeight); // Draw the box

      // Draw the name text on top of the box
      ctx.fillStyle = "chartreuse"; // Set text color again
      ctx.fillText(this.name, drawPosX + 6, boxY + boxHeight - 3); // Position the text slightly above the bottom of the box
    }

    // Draw the latest message as a chat bubble above the player
    if (this.latestMessage) {
      // Set the font style and size for the message
      ctx.font = "8px fontRetroGaming"; // Font and size
      ctx.fillStyle = "black";  // Text color
      ctx.textAlign = "center"; // Center the text

      // Split the message into words
      const words = this.latestMessage.split(" ");
      const maxLineWidth = 120; // Maximum width for the bubble
      let lines = [];
      let currentLine = "";

      // Loop through each word to build lines
      for (let word of words) {
        const testLine = currentLine + word + " ";
        const testLineWidth = ctx.measureText(testLine).width;

        // If the test line exceeds the max line width, push the current line to lines and reset
        if (testLineWidth > maxLineWidth && currentLine.length > 0) {
          lines.push(currentLine.trim());
          currentLine = word + " "; // Start a new line
        } else {
          currentLine = testLine; // Continue building the line
        }
      }
      // Push any remaining text as the last line
      if (currentLine.length > 0) {
        lines.push(currentLine.trim());
      }

      // Calculate bubble dimensions based on the number of lines
      const bubblePadding = 6; // Padding around the message
      const bubbleWidth = Math.max(...lines.map(line => ctx.measureText(line).width)) + bubblePadding * 2; // Bubble width based on longest line
      const bubbleHeight = (lines.length * 12) + bubblePadding * 2; // Height based on number of lines (assuming 12px line height)
      const bubbleX = drawPosX - (bubbleWidth / 2) + 8; // Center the bubble horizontally
      const bubbleY = drawPosY - bubbleHeight - 25; // Position the bubble above the player

      // Draw the chat bubble background
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)"; // Semi-transparent white for the bubble
      ctx.beginPath();
      ctx.moveTo(bubbleX + 10, bubbleY); // Rounded corners
      ctx.lineTo(bubbleX + bubbleWidth - 10, bubbleY);
      ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY, bubbleX + bubbleWidth, bubbleY + 10);
      ctx.lineTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight - 10);
      ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight, bubbleX + bubbleWidth - 10, bubbleY + bubbleHeight);
      ctx.lineTo(bubbleX + 10, bubbleY + bubbleHeight);
      ctx.quadraticCurveTo(bubbleX, bubbleY + bubbleHeight, bubbleX, bubbleY + bubbleHeight - 10);
      ctx.lineTo(bubbleX, bubbleY + 10);
      ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + 10, bubbleY);
      ctx.closePath();
      ctx.fill(); // Fill the bubble

      // Draw the message text on top of the bubble
      ctx.fillStyle = "black"; // Set text color for the message
      // Draw each line of the message
      lines.forEach((line, index) => {
        ctx.fillText(line, drawPosX + 6, bubbleY + bubblePadding + (index * 12) + 10); // Position each line inside the bubble
      });
    }
  } 

  override ready() {
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
  }

  override step(delta: number, root: any) {
    if (this.isLocked) return;

    if (this.itemPickupTime > 0) {
      this.workOnItemPickup(delta);
      return;
    }
    const input = root.input as Input;
    if (input?.getActionJustPressed("Space")) {
      //look for an object at the next space (according to where the hero is facing)
      const objectAtPosition = this.parent.children.find((child: GameObject) => {
        return child.position.matches(this.position.toNeighbour(this.facingDirection))
      });

      if (objectAtPosition) { 
        events.emit("HERO_REQUESTS_ACTION", objectAtPosition);
      } 
    }
    if (this.isUserControlled || !this.destinationPosition.matches(this.position)) {
      const distance = moveTowards(this, this.destinationPosition, 1);
      const hasArrived = (distance ?? 0) <= 1;
      if (hasArrived && this.isUserControlled) {
        this.tryMove(root);
      }
      if (hasArrived && !this.isUserControlled) {
        this.otherPlayerMove();
      }
      this.tryEmitPosition();
    }
    
  }
  updateAnimation() {
    setTimeout(() => {
      const currentTime = new Date().getTime();
      if (currentTime - this.lastStandAnimationTime >= 1000) { // Throttle by 1 second
        if (this.destinationPosition.matches(this.position)) {
          this.body.animations?.play(
            "stand" + this.facingDirection.charAt(0) +
            this.facingDirection.substring(1, this.facingDirection.length).toLowerCase()
          );
        }
        this.lastStandAnimationTime = currentTime; // Update the last time it was run
      }
    }, 1000);
  } 
  tryEmitPosition() {
    if (this.lastPosition.x === this.position.x && this.lastPosition.y === this.position.y) {
      return;
    }
    if (this.isUserControlled) { 
      events.emit("HERO_POSITION", this.position);
    }
    this.lastPosition = this.position.duplicate();
  }

  tryMove(root: any) {
    const { input } = root;
    if (!input.direction || !this.isUserControlled) {
      //console.log("stand" + this.facingDirection.charAt(0) + this.facingDirection.substring(1, this.facingDirection.length).toLowerCase());
      this.body.animations?.play("stand" + this.facingDirection.charAt(0) + this.facingDirection.substring(1, this.facingDirection.length).toLowerCase());
      return;
    }

    const gridSize = gridCells(1);
    const destPos = this.destinationPosition;
    if (destPos) {
      let position = destPos.duplicate();

      if (input.direction === DOWN) {
        position.y = this.snapToGrid(position.y + gridSize, gridSize);
        this.body.animations?.play("walkDown");
      }
      else if (input.direction === UP) {
        position.y = this.snapToGrid(position.y - gridSize, gridSize);
        this.body.animations?.play("walkUp");
      }
      else if (input.direction === LEFT) {
        position.x = this.snapToGrid(position.x - gridSize, gridSize);
        this.body.animations?.play("walkLeft");
      }
      else if (input.direction === RIGHT) {
        position.x = this.snapToGrid(position.x + gridSize, gridSize);
        this.body.animations?.play("walkRight");
      }

      this.facingDirection = input.direction ?? this.facingDirection;
      const spaceIsFree = isSpaceFree(root.level?.walls, position.x, position.y);
      const solidBodyAtSpace = this.parent.children.find((c: any) => {
        return c.isSolid
          && c.position.x == position.x
          && c.position.y == position.y
      })
      if (spaceIsFree && !solidBodyAtSpace) {
        this.destinationPosition = position;
      }
    }
  }
  otherPlayerMove() {
    console.log("otherplayermove");
    this.position = this.position.duplicate();
    this.destinationPosition = this.destinationPosition.duplicate();

    if (this.isUserControlled || this.destinationPosition.matches(this.position)) {
      this.body.animations?.play("stand" + this.facingDirection.charAt(0) + this.facingDirection.substring(1, this.facingDirection.length).toLowerCase());
      return;
    } 
    const gridSize = gridCells(1);
    const destPos = this.destinationPosition;

    if (destPos) {
      // Calculate the difference between destination and current position
      const deltaX = destPos.x - this.position.x;
      const deltaY = destPos.y - this.position.y; 
      if (Math.abs(deltaX) > Math.abs(deltaY)) { 
        if (deltaX > 0) { 
          this.facingDirection = RIGHT;
          this.body.animations?.play("walkRight"); 
        } else if (deltaX < 0) { 
          this.facingDirection = LEFT;
          this.body.animations?.play("walkLeft"); 
        }
      } else { 
        if (deltaY > 0) { 
          this.facingDirection = DOWN;
          this.body.animations?.play("walkDown"); 
        } else if (deltaY < 0) { 
          this.facingDirection = UP;
          this.body.animations?.play("walkUp"); 
        }
      }
      this.updateAnimation();

      this.position = destPos.duplicate(); 
    }
  }



  onPickupItem(data: { image: any, position: Vector2 }) {
    this.destinationPosition = data.position.duplicate();
    this.itemPickupTime = 2500;
    this.itemPickupShell = new GameObject({ position: new Vector2(0, 0) });
    this.itemPickupShell.addChild(new Sprite(
      0, data.image, new Vector2(0,-30), 0.85, 1, new Vector2(22,24), 0,0, undefined 
    ));
    this.addChild(this.itemPickupShell);
  }
  workOnItemPickup(delta: number) {
    this.itemPickupTime -= delta;
    this.body.animations?.play("pickupDown");
    if (this.itemPickupTime <= 0) {
      this.itemPickupShell.destroy();
    }
  }
  private snapToGrid(value: number, gridSize: number): number {
    return Math.round(value / gridSize) * gridSize;
  }
 }
