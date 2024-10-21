import { calculateWords } from "../SpriteTextString/sprite-font-map";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { resources } from "../../helpers/resources";
import { events } from "../../helpers/events";
import { gridCells } from "../../helpers/grid-cells";
import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { Input } from "../../helpers/input";
import { storyFlags } from "../../helpers/story-flags";
import { BrushLevel1 } from "../../levels/brush-level1";
import { Level } from "../Level/level";
import { MetaBot } from "../../../../services/datacontracts/meta/meta-bot";

export class FightMenu extends GameObject {
  backdrop = new Sprite({
    resource: resources.images["textBox"],
    frameSize: new Vector2(256, 64),
  });
  showFightMenu: boolean = true;
  portrait: Sprite;
  metabotChoices: MetaBot[] = [];

  startLevel: Level = new BrushLevel1({ heroPosition: new Vector2(gridCells(1), gridCells(1)) });
  entrancePosition: Vector2 = new Vector2(gridCells(1), gridCells(1)); 
  itemsFound?: string[];

  fightMenuOptions = ["Attack", "Item", "Meta-Bots", "Run"];
  showFightMenuOptions = false;
  selectedFightMenuIndex = 0;

  showFighterSelectionMenu = false;
  selectedFighterIndex = 0;

  showAttackMenuOptions = false;
  selectedAttackIndex = 0;

  showWaitingForOthers = false; 

  botDeployed = false;

  leftArmSkill = "Left Punch";
  rightArmSkill = "Right Punch";
  legsSkill = "Kick";
  headSkill = "Headbutt";
  skillOptions = [this.leftArmSkill, this.rightArmSkill, this.legsSkill, this.headSkill, "Cancel"];

  constructor(config: { entranceLevel: Level, entrancePosition: Vector2, itemsFound?: string[] }) {
    super({ position: new Vector2(-95, 120) });
    this.itemsFound = config.itemsFound;
    this.backdrop.scale = new Vector2(1, 0.5);
    this.drawLayer = "HUD";
    this.startLevel = config.entranceLevel;
    this.startLevel.defaultHeroPosition = config.entrancePosition;
    this.portrait = new Sprite({
      resource: resources.images["portraits"],
      hFrames: 4
    });

  }

  override step(delta: number, root: GameObject) {
    //listen for user input
    //get parentmost object
    let parent = root?.parent ?? root;
    if (parent) {
      while (parent.parent) {
        parent = parent.parent;
      }
    }

    const input = parent.input as Input;

    if (input?.keys["Space"]) { 
      if (input?.verifyCanPressKey()) {
        if (this.showFightMenuOptions) {
          if (this.selectedFightMenuIndex == (this.fightMenuOptions.length - 1)) {
            this.leaveFight();
          }
          else if (this.selectedFightMenuIndex == 0) {
            this.showFightMenuOptions = false;
            this.showAttackMenuOptions = true;
          }
          else if (this.selectedFightMenuIndex == 2) {
            this.showFightMenuOptions = false;
            this.showFighterSelectionMenu = true;
          }
        }
        else if (this.showFighterSelectionMenu) {
          if (this.selectedFighterIndex == this.metabotChoices.length) {
            this.leaveFight();
          } else {
            this.selectFighter();
          }
        }
        else if (this.showAttackMenuOptions) {
          if (this.selectedAttackIndex == 4) {
            this.showAttackMenuOptions = false;
            this.showFightMenuOptions = true;
          }
          else { // USER HAS SELECTED AN ATTACK
            this.showAttackMenuOptions = false;
            this.showWaitingForOthers = true;
            const skill = this.selectedAttackIndex == 0 ? this.leftArmSkill
              : this.selectedAttackIndex == 1 ? this.rightArmSkill
                : this.selectedAttackIndex == 2 ? this.legsSkill
                  : this.headSkill;
            events.emit("USER_ATTACK_SELECTED", skill);
          }
        }
      }
    }

    if (input?.verifyCanPressKey()) {
      if (input?.getActionJustPressed("ArrowUp")
        || input?.heldDirections.includes("UP")
        || input?.getActionJustPressed("KeyW")) {
        if (this.showFighterSelectionMenu) {
          this.cycleDownSelectedFighter();
        }
        else if (this.showFightMenuOptions) {
          this.selectedFightMenuIndex = (this.selectedFightMenuIndex - 1 + this.fightMenuOptions.length) % this.fightMenuOptions.length;
        }
        else if (this.showAttackMenuOptions) {
          this.selectedAttackIndex = (this.selectedAttackIndex - 1 + 5) % 5;
        }
      }
      else if (input?.getActionJustPressed("ArrowDown")
        || input?.heldDirections.includes("DOWN")
        || input?.getActionJustPressed("KeyS")) {
        if (this.showFighterSelectionMenu) {
          this.cycleUpSelectedFighter();
        }
        else if (this.showFightMenuOptions) {
          this.selectedFightMenuIndex = (this.selectedFightMenuIndex + 1) % this.fightMenuOptions.length;
        }
        else if (this.showAttackMenuOptions) {
          this.selectedAttackIndex = (this.selectedAttackIndex + 1) % 5;
          console.log(this.selectedAttackIndex)
        }
      }
      else if (input?.getActionJustPressed("ArrowLeft")
        || input?.heldDirections.includes("LEFT")
        || input?.getActionJustPressed("KeyA")) {
        if (this.showFighterSelectionMenu) {
          this.cycleDownSelectedFighter();
        }
        else if (this.showFightMenuOptions) {
          this.selectedFightMenuIndex = (this.selectedFightMenuIndex - 1 + this.fightMenuOptions.length) % this.fightMenuOptions.length;
        }
        else if (this.showAttackMenuOptions) {
          this.selectedAttackIndex = (this.selectedAttackIndex - 1 + 5) % 5;
        }
      }
      else if (input?.getActionJustPressed("ArrowRight")
        || input?.heldDirections.includes("RIGHT")
        || input?.getActionJustPressed("KeyD")) {
        if (this.showFighterSelectionMenu) {
          this.cycleUpSelectedFighter();
        }
        else if (this.showFightMenuOptions) {
          this.selectedFightMenuIndex = (this.selectedFightMenuIndex + 1) % this.fightMenuOptions.length;
        }
        else if (this.showAttackMenuOptions) {
          this.selectedAttackIndex = (this.selectedAttackIndex + 1) % 5;
        }
      }

    }
  }

  leaveFight() {
    storyFlags.flags.delete("START_FIGHT");
    events.emit("CHANGE_LEVEL", this.startLevel);
  }

  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    if (this.showFightMenu) {
      this.backdrop.drawImage(ctx, drawPosX, drawPosY); 
       
      if (this.showFighterSelectionMenu) {
        this.paintFighterSelectionMenu(ctx);
        return;
      }
      else if (this.showFightMenuOptions) {
        this.paintFightMenuOptions(ctx);
        return;
      }
      else if (this.showAttackMenuOptions) {
        this.paintAttackMenuOptions(ctx);
        return;
      }
      else if (this.showWaitingForOthers) {
        this.paintWaitingForOthers(ctx);
      }
    }
  }

  private paintWaitingForOthers(ctx: CanvasRenderingContext2D) {
    const run = calculateWords({ content: "Waiting for others to finish selecting moves.", color: "White"});
    const PADDING_LEFT = 5;
    let runWidth = 0;
    let cursorX = -90;
    let boxY = 120;
    run.forEach((word: any) => {
      word.chars.forEach((char: { width: number; sprite: Sprite; }) => {
        char.sprite.draw(ctx, cursorX, boxY);
        cursorX += char.width + 1; // Add width of the character and some space
        runWidth += char.width + 1;
      }); 
      cursorX += PADDING_LEFT; 
    });

  }

  private paintAttackMenuOptions(ctx: CanvasRenderingContext2D) { 
    const PADDING_LEFT = 15;
    const PADDING_TOP = 9;
    const LINE_WIDTH_MAX = 240;
    const LINE_VERTICAL_WIDTH = 14;
    const BOT_SPRITE_WIDTH = 32;

    let drawPosX = -90;
    let drawPosY = 120;
    let cursorX = -90;
    let cursorY = 120;
    let column = 0;
    let row = 0;


    for (let x = 0; x < this.skillOptions.length; x++) {
      const word = this.skillOptions[x];
      const words = calculateWords({content: word, color: "White"}); 
      let wordWidth = 0;
      words.forEach((word: any) => {
        word.chars.forEach((char: { width: number; sprite: Sprite; }) => {
          wordWidth += char.width;
          char.sprite.draw(ctx, cursorX - 5, cursorY);
          cursorX += char.width + 1; // Add width of the character and some space
        }); 
      });
      if (x === this.selectedAttackIndex) {
        // Draw a red square beside the selected word
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.strokeRect(cursorX - wordWidth - PADDING_LEFT, cursorY, wordWidth + 20, LINE_VERTICAL_WIDTH);
      }
      cursorX += PADDING_LEFT; 
    }
  }

  private paintFightMenuOptions(ctx: CanvasRenderingContext2D) {
    const PADDING_LEFT = 15;
    const PADDING_TOP = 9;
    const LINE_WIDTH_MAX = 240;
    const LINE_VERTICAL_WIDTH = 14;
    const BOT_SPRITE_WIDTH = 32;
    let drawPosX = -100;
    let drawPosY = 120; 
    let row = 0;
    let cursorX = drawPosX + PADDING_LEFT;
    let cursorY = drawPosY + PADDING_TOP;

    for (let x = 0; x < this.fightMenuOptions.length; x++) {
      const word = this.fightMenuOptions[x];
      const words = calculateWords({ content: word, color: "White" });

      words.forEach((word: any) => {
        // Decide if we can fit this next word on this line
        const spaceRemaining = drawPosX + LINE_WIDTH_MAX - cursorX;
        if (spaceRemaining < word.wordWidth) { 
          cursorX = drawPosX + PADDING_LEFT + LINE_WIDTH_MAX / 2 + 10; // Adjust x to the next column
        } else if (spaceRemaining < word.wordWidth) { 
          row++;
          cursorX = drawPosX + PADDING_LEFT; // Reset x to start of line
          cursorY = 0 + PADDING_TOP + row * (LINE_VERTICAL_WIDTH + 10); // Move to next row
        }
        if (x === this.selectedFightMenuIndex) {
          // Draw a red square beside the selected word
          ctx.strokeStyle = 'red';
          ctx.lineWidth = 2;
          ctx.strokeRect(cursorX, drawPosY, word.wordWidth + 20, LINE_VERTICAL_WIDTH);
        }

        word.chars.forEach((char: { width: number; sprite: Sprite; }) => {
          const withCharOffset = cursorX - 5;
          char.sprite.draw(ctx, withCharOffset, drawPosY);
          cursorX += char.width + 1; // Add width of the character and some space
        });

        cursorX += 3 + PADDING_LEFT;
      });

     
    } 
  }

  private paintFighterSelectionMenu(ctx: CanvasRenderingContext2D) {
    const PADDING_LEFT = 15;
    const PADDING_TOP = 9;
    const LINE_WIDTH_MAX = 240;
    const LINE_VERTICAL_WIDTH = 14;
    const BOT_SPRITE_WIDTH = 32;

    let cursorX = 0 + PADDING_LEFT;
    let cursorY = 0 + PADDING_TOP;
    const boxY = 90 + BOT_SPRITE_WIDTH;

    for (let x = 0; x < this.metabotChoices.length; x++) {
      const existingBot = this.children.some((z: any) => z.objectId === (x + 1));
      if (!existingBot) {
        const metabotSprite = new Sprite({
          objectId: x + 1,
          resource: resources.images["botFrame"],
          position: new Vector2((cursorX), -33),
          frameSize: new Vector2(BOT_SPRITE_WIDTH, BOT_SPRITE_WIDTH),
          name: this.metabotChoices[x].name
        });
        this.addChild(metabotSprite);
      }

      const boxX = -100 + cursorX; // Center the box horizontally

      if (this.metabotChoices[x].name) {
        // Set the font style and size for the name
        ctx.font = "8px fontRetroGaming"; // Font and size
        ctx.fillStyle = "chartreuse"; // Text color
        ctx.textAlign = "center"; // Center the text 

        // Measure the width of the text
        const textWidth = ctx.measureText(this.metabotChoices[x].name ?? "Anon").width;

        // Set box properties for name
        const boxPadding = 4; // Padding around the text
        const boxWidth = textWidth + boxPadding * 2; // Box width
        const boxHeight = 12; // Box height (fixed height)

        // Draw the dark background box for the name
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)"; // Semi-transparent black for the box
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight); // Draw the box

        // Draw the name text on top of the box
        ctx.fillStyle = "chartreuse"; // Set text color again
        ctx.fillText(this.metabotChoices[x].name ?? "Anon", boxX + boxPadding + textWidth / 2, boxY + boxHeight - 3); // Position the text slightly above the bottom of the box

        if (x === this.selectedFighterIndex) {
          // Draw a red square beside the selected bot
          ctx.strokeStyle = 'red';
          ctx.lineWidth = 2;
          ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
          if (this.metabotChoices[x].hp <= 0) {
            ctx.beginPath();
            ctx.moveTo(boxX, boxY); // Top-left corner
            ctx.lineTo(boxX + boxWidth, boxY + boxHeight); // Bottom-right corner
            ctx.moveTo(boxX + boxWidth, boxY); // Top-right corner
            ctx.lineTo(boxX, boxY + boxHeight); // Bottom-left corner
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.closePath();
          } 
        }
      }

      cursorX += BOT_SPRITE_WIDTH + PADDING_LEFT;
    }

    //draw the run option
    const run = calculateWords({ content: "Run", color: "White" });
    let runWidth = 0;
    run.forEach((word: any) => {
      word.chars.forEach((char: { width: number; sprite: Sprite; }) => {
        char.sprite.draw(ctx, cursorX, boxY);
        cursorX += char.width + 1; // Add width of the character and some space
        runWidth += char.width + 1;
      });
    });
    if (this.metabotChoices.length === this.selectedFighterIndex) {
      // Draw a red square beside the selected word
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.strokeRect(cursorX - (runWidth / 2) - 8, boxY - 2, runWidth + 8, 16);
    }
    return cursorX;
  }

  private cycleUpSelectedFighter() {
    console.log("cycle up fighter");
    if (this.selectedFighterIndex == this.metabotChoices?.length) {
      this.selectedFighterIndex = 0;
    }
    else {
      this.selectedFighterIndex++;
    }
  }

  private removeFighterSelectionSprites() {
    this.children.forEach((child: any) => {
      if (child.objectId > 0) child.destroy();
    });
  }

  private cycleDownSelectedFighter() {
    if (this.selectedFighterIndex == 0) {
      this.selectedFighterIndex = this.metabotChoices.length ?? 0;
    } else {
      this.selectedFighterIndex--;
    }
  }

  private selectFighter() {
    const metabots = this.metabotChoices ?? []; 
    if (this.selectedFighterIndex !== undefined && metabots.length > this.selectedFighterIndex) {
      const selectedMetabot = metabots.splice(this.selectedFighterIndex, 1)[0]; // Remove the selected Metabot
      metabots.unshift(selectedMetabot); // Add the selected Metabot to the beginning of the array
    }
    if (metabots[0].hp <= 0) {
      return; //should play a sound or display, to update.
    }

    this.leftArmSkill = metabots[0].leftArm?.skill ?? "Left Punch";
    this.rightArmSkill = metabots[0].rightArm?.skill ?? "Right Punch";
    this.legsSkill = metabots[0].legs?.skill ?? "Kick";
    this.headSkill = metabots[0].head?.skill ?? "Headbutt";
    this.skillOptions = [this.leftArmSkill, this.rightArmSkill, this.legsSkill, this.headSkill, "Cancel"];

    //console.log("fighter selected", metabots[0]);
    //console.log("leftArmSkill", this.leftArmSkill);
    events.emit("FIGHTER_SELECTED", metabots[0]);
    this.showFightMenuOptions = true;
    this.showFighterSelectionMenu = false;
    this.removeFighterSelectionSprites();
  }
}
