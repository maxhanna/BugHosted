import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { Scenario } from "../../helpers/story-flags";
import { DOWN, LEFT, RIGHT, UP, gridCells, isSpaceFree } from "../../helpers/grid-cells";
import { MetaBot } from "../../../../services/datacontracts/meta/meta-bot";
import { moveTowards } from "../../helpers/move-towards";
import { resources } from "../../helpers/resources";

export class Npc extends GameObject {
  metabots: MetaBot[];
  body: Sprite;
  type?: string;
  partnerNpcs: Npc[] = [];
  id: number;
  finishedMoving = false;
  lastStandAnimationTime = 0;
  facingDirection: string;
  destinationPosition: Vector2;
  lastPosition: Vector2;
  name?: string;
  latestMessage = "";

  constructor(config: { id: number, position: Vector2, textConfig?: { content?: Scenario[], portraitFrame?: number }, type?: string, body?: Sprite, partners?: Npc[] }) {
    super({ position: config.position });
    this.type = config.type;
    this.id = config.id;
    this.isSolid = true;
    this.facingDirection = DOWN;
    this.position = config.position;
    this.destinationPosition = this.position.duplicate();
    this.lastPosition = this.position.duplicate();
    this.name = config.type;
    this.textContent = config.textConfig?.content;
    this.textPortraitFrame = config.textConfig?.portraitFrame;
    this.metabots = [];
    this.partnerNpcs = config.partners ? config.partners : []; 

    if (config.body) {
      this.body = config.body; 
      this.addChild(this.body);
      this.body.animations?.play("standDown"); 
    } else {
      this.body = new Sprite({ resource: resources.images["white"] });
    }
  }
  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) { 
    this.drawLatestChatMessage(ctx, drawPosX, drawPosY);    // Draw the latest message as a chat bubble above the player 
  }

  override step(delta: number, root: any) {
    const distance = moveTowards(this, this.destinationPosition, 1);

    const hasArrived = (distance ?? 0) <= 1;
    if (hasArrived) {
      this.finishedMoving = true;
    } else this.finishedMoving = false; 
    this.moveNpc(root); 
  }

  private drawLatestChatMessage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    if (this.latestMessage) {
      // Set the font style and size for the message
      const fontSize = 6;
      ctx.font = `${fontSize}px fontRetroGaming`; // Font and size
      ctx.fillStyle = "black"; // Text color
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
      const bubbleY = drawPosY - bubbleHeight - ((this.body?.frameSize?.y ?? 0) / 1.5);

      // Calculate vertical starting position for the text to center it
      const textStartY = bubbleY + ((bubbleHeight - (lines.length * lineHeight)) / 2) + fontSize;

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
        ctx.fillText(line, drawPosX + 6, textStartY + (index * lineHeight));
      });
    }
  } 

  updateAnimation() {
    setTimeout(() => {
      const currentTime = new Date().getTime();
      if (currentTime - this.lastStandAnimationTime >= 300) {
        if (this.destinationPosition.matches(this.position) && this.finishedMoving) {
          this.body?.animations?.play(
            "stand" + this.facingDirection.charAt(0) +
            this.facingDirection.substring(1, this.facingDirection.length).toLowerCase()
          );
        }
        this.lastStandAnimationTime = currentTime; // Update the last time it was run
      }
    }, 2000);
  }

  moveNpc(root: any) {
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
          this.body?.animations?.play("walkRight");
        } else if (deltaX < 0) {
          tmpPosition.x = (tmpPosition.x);
          this.facingDirection = LEFT;
          this.body?.animations?.play("walkLeft");
        }
      }
      if (deltaY != 0) {
        if (deltaY > 0) {
          tmpPosition.y = tmpPosition.y;
          this.facingDirection = DOWN;
          this.body?.animations?.play("walkDown");
        } else if (deltaY < 0) {
          tmpPosition.y = tmpPosition.y;
          this.facingDirection = UP;
          this.body?.animations?.play("walkUp");
        }
        this.updateAnimation();
      }
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
