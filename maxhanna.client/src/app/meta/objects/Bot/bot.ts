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
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP, PICK_UP_DOWN } from "./bot-animations";
export class Bot extends GameObject {
  facingDirection: string;
  destinationPosition: Vector2;
  body: Sprite;
  id: number;
  name: string;
  isDead: boolean;
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
    console.log("New Bot at position : " + x + '; ' + y);
    this.facingDirection = DOWN;
    this.position = new Vector2(x, y);
    this.destinationPosition = this.position.duplicate();
    this.lastPosition = this.position.duplicate();
    this.name = "Anon";
    this.id = 0;
    this.itemPickupTime = 0;
    this.isDead = false;
    const shadow = new Sprite(
      0,
      resources.images["shadow"],
      new Vector2(-16.5, -33),
      new Vector2(1.5, 1.5),
      undefined,
      new Vector2(32, 32),
      undefined,
      undefined,
      undefined 
    );
    this.addChild(shadow);

    this.body = new Sprite(
      this.id,
      resources.images["botFrame"],
      new Vector2(-8, -20),
      undefined,
      undefined,
      new Vector2(32, 32),
      undefined,
      undefined, 
    );
    this.addChild(this.body);  
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
  }

  override step(delta: number, root: any) {
    if (this.isLocked) return;
     
    if (!this.destinationPosition.matches(this.position)) {
      const distance = moveTowards(this, this.destinationPosition, 1);
      const hasArrived = (distance ?? 0) <= 1; 
      if (hasArrived) {
        this.moveBot();
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
    this.lastPosition = this.position.duplicate();
  }
   
  moveBot() {
    console.log("moveBot");
    this.position = this.position.duplicate();
    this.destinationPosition = this.destinationPosition.duplicate();

    if (this.destinationPosition.matches(this.position)) {
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
  private snapToGrid(value: number, gridSize: number): number {
    return Math.round(value / gridSize) * gridSize;
  }
 }
