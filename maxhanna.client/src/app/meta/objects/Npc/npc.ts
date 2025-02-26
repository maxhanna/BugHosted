import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { Character } from "../character";
import { Sprite } from "../sprite";
import { Scenario } from "../../helpers/story-flags";
import { DOWN, gridCells, snapToGrid } from "../../helpers/grid-cells";
import { MetaBot } from "../../../../services/datacontracts/meta/meta-bot";
import { hexToRgb, resources } from "../../helpers/resources";
import { ColorSwap } from "../../../../services/datacontracts/meta/color-swap"; 
import { Bot } from "../Bot/bot";

export class Npc extends Character {
  metabots: MetaBot[]; 
  type?: string;
  partnerNpcs: Npc[] = []; 
  finishedMoving = false; 

  moveUpDown?: number;
  moveLeftRight?: number;
  moveCounter = 0;

  constructor(config: {
    id: number,
    position: Vector2,
    textConfig?: { content?: Scenario[], portraitFrame?: number },
    type?: string,
    name?: string,
    body?: Sprite,
    partners?: Npc[],
    moveUpDown?: number
    moveLeftRight?: number,
    preventDraw?: boolean,
    colorSwap?: ColorSwap,
    speed?: number,
  }) {
    super({
      id: config.id,
      name: config.type ?? "",
      position: config.position,
      body: config.body,
      isUserControlled: false,
    });
    this.type = config.type;
    this.id = config.id;
    this.isSolid = true;
    this.facingDirection = DOWN;
    this.position = config.position;
    this.destinationPosition = this.position.duplicate();
    this.lastPosition = this.position.duplicate();
    this.name = config.name ?? "Anon";
    this.textContent = config.textConfig?.content;
    this.textPortraitFrame = config.textConfig?.portraitFrame;
    this.metabots = [];
    this.partnerNpcs = config.partners ? config.partners : [];
    this.moveUpDown = config.moveUpDown;
    this.moveLeftRight = config.moveLeftRight;
    this.preventDraw = !!config.preventDraw;
    this.colorSwap = config.colorSwap;
    this.speed = config.speed ?? 1;

    if (!config.body) { 
      this.body = new Sprite({ resource: resources.images["white"] });
    }

    if (this.moveUpDown || this.moveLeftRight) {
      this.randomMove();
    }
    if (this.name === "Gangster") { 
      console.log(this.name);
      console.log(this.metabots);
    }
    console.log(this.metabots.length);
    setTimeout(() => {
      for (let i = 0; i < this.metabots.length; i++) {
        if (this.metabots[i].isDeployed == true) {
          const bot = this.metabots[i];
          const tmpBot = new Bot({
            id: bot.id,
            heroId: this.id,
            botType: bot.type,
            name: bot.name ?? "Bot", 
            position: new Vector2(snapToGrid(this.position.x + gridCells(1), gridCells(1)), snapToGrid(this.position.y + gridCells(1), gridCells(1))), 
            colorSwap: this.colorSwap,
            isDeployed: true,
            isEnemy: true,
            hp: bot.hp,
            leftArm: bot.leftArm,
            rightArm: bot.rightArm,
            head: bot.head,
            legs: bot.legs,
          });
          console.log("adding child: ", tmpBot);  
          this.parent.addChild(tmpBot);
        }
      }
    }, 5); 
  }
  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    this.drawLatestChatMessage(ctx, drawPosX, drawPosY);    // Draw the latest message as a chat bubble above the player 
  }
   

  private randomMove() { 
    if (this.moveCounter > 40) { this.moveCounter = 0; }
    // Determine movement based on the moveCounter's current value
    switch (this.moveCounter % 4) {
      case 0:
        // Move up
        if (this.moveUpDown) { 
          this.destinationPosition.y = this.position.y - gridCells(this.moveUpDown);
        }
        break;
      case 1:
        // Move right
        if (this.moveLeftRight) { 
          this.destinationPosition.x = this.position.x + gridCells(this.moveLeftRight);
        }
        break;
      case 2:
        // Move down
        if (this.moveUpDown) { 
          this.destinationPosition.y = this.position.y + gridCells(this.moveUpDown);
        }
        break;
      case 3:
        // Move left
        if (this.moveLeftRight) { 
          this.destinationPosition.x = this.position.x - gridCells(this.moveLeftRight);
        }
        break;
    }

    // Increment moveCounter to change direction on the next iteration
    this.moveCounter++;

    // Set a new random interval between 10 seconds and 25 seconds
    const newInterval = Math.max(10000, Math.floor(Math.random() * 25000));

    // Call randomMove again after `newInterval` milliseconds
    setTimeout(this.randomMove.bind(this), newInterval);
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
}
