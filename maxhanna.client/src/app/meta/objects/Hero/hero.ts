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
  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y)
    })
   // console.log("New Hero at position : " + x + '; ' + y);
    this.facingDirection = DOWN;
    this.position = new Vector2(x, y);
    this.destinationPosition = this.position.duplicate();
    this.lastPosition = this.position.duplicate();
    this.name = "Anon";
    this.id = 0;
    this.itemPickupTime = 0;
    this.metabots = [];
    const shadow = new Sprite(
      0,
      resources.images["shadow"],
      new Vector2(-27, -58),
      new Vector2(1.5, 1.5),
      undefined,
      new Vector2(32, 32),
      undefined,
      undefined,
      undefined 
    );
    shadow.drawLayer = "FLOOR";
    this.addChild(shadow);

    this.body = new Sprite(
      this.id,
      resources.images["hero"],
      new Vector2(-8, -20),
      undefined,
      undefined,
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
    });

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
        console.log(selectedItem);
        if (selectedItem === "Party Up") {
          const objectAtPosition = this.parent.children.find((child: GameObject) => {
            return child.position.matches(this.position.toNeighbour(this.facingDirection))
          });
          events.emit("PARTY_UP", objectAtPosition);
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

    const distance = moveTowards(this, this.destinationPosition, 1);
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
              child.position.x >= neighborPosition.x - discrepancy &&
              child.position.x <= neighborPosition.x + discrepancy &&
              child.position.y >= neighborPosition.y - discrepancy &&
              child.position.y <= neighborPosition.y + discrepancy
          );
      });
    const bestChoice = posibilities.find((x: any) => x.textContent);
    if (bestChoice) {
      return bestChoice;
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
      this.body.animations?.play("stand" + this.facingDirection.charAt(0) + this.facingDirection.substring(1, this.facingDirection.length).toLowerCase());
      return;
    }

    const gridSize = gridCells(1);
    const destPos = this.destinationPosition;
    if (destPos) {
      let position = destPos.duplicate();

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
      })
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
      this.itemPickupShell.addChild(new Sprite(
        0,
        data.image,
        new Vector2(0, -30),
        new Vector2(0.85, 0.85),
        undefined,
        new Vector2(22, 24),
        undefined,
        undefined,
        undefined
      ));
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
      
    console.log("Getting content " );
    return {
      portraitFrame: 0,
      string: ["Party Up", "Whisper", "Wave", "Cancel"],
      canSelectItems: true,
      addsFlag: null
    }
  }
 }
