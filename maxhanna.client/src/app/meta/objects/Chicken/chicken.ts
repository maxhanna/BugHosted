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
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP, PICK_UP_DOWN } from "./chicken-animations";

export class Chicken extends GameObject {
  facingDirection: string;
  destinationPosition: Vector2;
  body: Sprite; 
  id: number;
  name: string; 
  lastPosition: Vector2; 
  lastStandAnimationTime = 0; 
  latestMessage = "";
  directionIndex = 0;
  soundIndex = 0;
  chickenSounds = ["Cluck cluck...", "Bawk bawk...", "Buk buk buk...", "Squawk..."];


  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y)
    })
   
    this.facingDirection = DOWN;
    this.position = new Vector2(x, y);
    this.destinationPosition = this.position.duplicate();
    this.lastPosition = this.position.duplicate();
    this.name = "Anon";
    this.id = 0; 
    const shadow = new Sprite(
      0,
      resources.images["shadow"],
      new Vector2(-3.5, -6),
      new Vector2(0.7, 0.7),
      undefined,
      new Vector2(32, 32),
      undefined,
      undefined,
      undefined 
    );
    this.addChild(shadow);

    this.body = new Sprite(
      this.id,
      resources.images["chicken"],
      new Vector2(0, 0),
      new Vector2(1, 1),
      undefined,
      new Vector2(15, 15),
      4,
      8,
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

    setInterval(() => {
      this.latestMessage = this.chickenSounds[this.soundIndex];
      this.soundIndex = (this.soundIndex + 1) % this.chickenSounds.length; // Cycle through the array

      setTimeout(() => {
        this.latestMessage = ""; // Clear message after 20 seconds
      }, 5000); // Wait for 5 seconds to clear the message
    }, 10000); // Repeat every 10 seconds
    setInterval(() => {
      // Current position (assuming this.position is a Vector2)
      const currentPosition = this.position;
      this.directionIndex++;
      if (this.directionIndex == 4) {
        this.directionIndex = 0;
      }
      if (this.directionIndex == 0) {
        this.destinationPosition = new Vector2(currentPosition.x + gridCells(2), currentPosition.y);
      }
      if (this.directionIndex == 1) {
        this.destinationPosition = new Vector2(currentPosition.x, currentPosition.y + gridCells(1));
      }
      if (this.directionIndex == 2) {
        this.destinationPosition = new Vector2(currentPosition.x - gridCells(2), currentPosition.y);
      }
      if (this.directionIndex == 3) {
        this.destinationPosition = new Vector2(currentPosition.x, currentPosition.y - gridCells(1));
      }

      // Update the destination position, assuming gridCells takes an x,y coordinate and returns a new position
    }, 5000); // Repeat every 5 seconds
  }

  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    
    // Draw the latest message as a chat bubble above the player
    if (this.latestMessage) {
      // Set the font style and size for the message
      const fontSize = 6;
      ctx.font = `${fontSize}px fontRetroGaming`; // Font and size
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
      const bubblePadding = 4;
      const lineHeight = fontSize + 2; // Adjust line height to be consistent with font size
      const bubbleWidth = Math.max(...lines.map(line => ctx.measureText(line).width)) + bubblePadding * 2;
      const bubbleHeight = (lines.length * lineHeight) + bubblePadding * 2; // Use consistent line height
      const bubbleX = drawPosX - (bubbleWidth / 2) + 8;
      const bubbleY = drawPosY - bubbleHeight - 10;

      // Calculate vertical starting position for the text to center it
      const textStartY = bubbleY + bubblePadding + ((bubbleHeight - (lines.length * lineHeight)) / 2) + fontSize;

      // Draw the chat bubble background (same as before) 
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)"; // Semi-transparent white for the bubble
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
      // Draw the message text on top of the bubble, centered vertically
      ctx.fillStyle = "black"; // Set text color for the message
      lines.forEach((line, index) => {
        ctx.fillText(line, drawPosX + 6, textStartY + (index * lineHeight)); // Use consistent line height and centered start position
      }); 
    }
  } 
   
  override step(delta: number, root: any) { 
    const distance = moveTowards(this, this.destinationPosition, 1);
    const hasArrived = (distance ?? 0) <= 1;
    if (hasArrived) { 
      this.otherPlayerMove(); 
    } 
    this.tryEmitPosition(); 
  }
   
  updateAnimation() { 
    setTimeout(() => {
      const currentTime = new Date().getTime();
      if (currentTime - this.lastStandAnimationTime >= 2000) {  
        if (this.destinationPosition.matches(this.position)) {
          this.body.animations?.play(
            "stand" + this.facingDirection.charAt(0) +
            this.facingDirection.substring(1, this.facingDirection.length).toLowerCase()
          );
        }
        this.lastStandAnimationTime = currentTime; // Update the last time it was run
      }
    },2000);
  } 
  tryEmitPosition() {
    if (this.lastPosition.x === this.position.x && this.lastPosition.y === this.position.y) {
      return;
    } 
    this.lastPosition = this.position.duplicate();
  } 

  otherPlayerMove() { 
    this.position = this.position.duplicate();
    this.destinationPosition = this.destinationPosition.duplicate();
      
    const destPos = this.destinationPosition;

    if (destPos) {
      // Calculate the difference between destination and current position
      const deltaX = destPos.x - this.position.x;
      const deltaY = destPos.y - this.position.y;
      const gridSize = gridCells(1);
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

      this.position.x = snapToGrid(destPos.duplicate().x, gridSize);
      this.position.y = snapToGrid(destPos.duplicate().y, gridSize);
    }
  }   
   
  override getContent() { 
      
    console.log("Getting content " );
    return {
      portraitFrame: 0,
      string: ["Bkaaaaaw"],
      canSelectItems: false,
      addsFlag: null
    }
  }
 }
