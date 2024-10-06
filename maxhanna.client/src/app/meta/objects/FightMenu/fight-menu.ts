import { getCharacterWidth, getCharacterFrame, calculateWords } from "../SpriteTextString/sprite-font-map";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { resources } from "../../helpers/resources";
import { events } from "../../helpers/events";
import { gridCells } from "../../helpers/grid-cells";
import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { Input } from "../../helpers/input";
import { storyFlags } from "../../helpers/story-flags";
import { BoltonLevel1 } from "../../levels/bolton-level1";
import { Level } from "../Level/level";
import { MetaBot } from "../../../../services/datacontracts/meta/meta-bot";

export class FightMenu extends GameObject {
  backdrop = new Sprite(
    0, resources.images["textBox"],
    new Vector2(0, 0),
    undefined,
    undefined,
    new Vector2(256, 64),
    undefined,
    undefined,
    undefined
  );
  showFightMenu: boolean = true;
  portrait: Sprite;
  metabotChoices: MetaBot[] = [];

  startLevel: Level = new BoltonLevel1({ heroPosition: new Vector2(gridCells(1), gridCells(1)) });
  entrancePosition: Vector2 = new Vector2(gridCells(1), gridCells(1));


  fightMenuOptions = ["Attack", "Item", "Run"];
  showFightMenuOptions = false;
  selectedFightMenuIndex = 0;

  showFighterSelectionMenu = false;
  selectedFighterIndex = 0;

  botDeployed = false;

  constructor(config: { entranceLevel: Level, entrancePosition: Vector2 }) {
    super({ position: new Vector2(0, 75) });
    this.backdrop.scale = new Vector2(0.75, 0.75);
    this.drawLayer = "HUD";
    this.startLevel = config.entranceLevel;
    this.startLevel.defaultHeroPosition = config.entrancePosition;
    this.portrait = new Sprite(
      0,
      resources.images["portraits"],
      new Vector2(0, 0),
      undefined,
      undefined,
      undefined,
      4,
      undefined
    );

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
    if (input?.getActionJustPressed("Space")) {
      if (input?.verifyCanPressKey()) {
        console.log(this.selectedFightMenuIndex)
        if (this.showFightMenu && this.selectedFightMenuIndex == (this.fightMenuOptions.length - 1)) {
          console.log("Running from fight");
          this.leaveFight();
        } else if (this.showFighterSelectionMenu && this.selectedFighterIndex == this.metabotChoices.length) {
          console.log("Running from fight");
          this.leaveFight();
        }
        if (this.showFighterSelectionMenu) {
          this.selectFighter();
        } 
      } 
    }


    if (input?.getActionJustPressed("ArrowUp")
      || input?.heldDirections.includes("UP")
      || input?.getActionJustPressed("KeyW")) {
      if (input?.verifyCanPressKey()) {
        if (this.showFighterSelectionMenu) {
          this.cycleDownSelectedFighter();
        }
        if (this.showFightMenuOptions) {
          this.selectedFightMenuIndex = (this.selectedFightMenuIndex - 1 + this.fightMenuOptions.length) % this.fightMenuOptions.length;
        }
      }
    }
    else if (input?.getActionJustPressed("ArrowDown")
      || input?.heldDirections.includes("DOWN")
      || input?.getActionJustPressed("KeyS")) {
      if (input?.verifyCanPressKey()) {
        console.log(this.showFighterSelectionMenu)
        if (this.showFighterSelectionMenu) {
          this.cycleUpSelectedFighter();
        }
        if (this.showFightMenuOptions) {
          this.selectedFightMenuIndex = (this.selectedFightMenuIndex + 1) % this.fightMenuOptions.length;
        }
      }
    }
    else if (input?.getActionJustPressed("ArrowLeft")
      || input?.heldDirections.includes("LEFT")
      || input?.getActionJustPressed("KeyA")) {
      if (input?.verifyCanPressKey()) {
        if (this.showFighterSelectionMenu) {
          this.cycleDownSelectedFighter();
        }
        if (this.showFightMenuOptions) {
          this.selectedFightMenuIndex = (this.selectedFightMenuIndex - 1 + this.fightMenuOptions.length) % this.fightMenuOptions.length;
        }
      }
    }
    else if (input?.getActionJustPressed("ArrowRight")
      || input?.heldDirections.includes("RIGHT")
      || input?.getActionJustPressed("KeyD")) {
      if (input?.verifyCanPressKey()) {
        if (this.showFighterSelectionMenu) {
          this.cycleUpSelectedFighter();
        }
        else if (this.showFightMenuOptions) {
          this.selectedFightMenuIndex = (this.selectedFightMenuIndex + 1) % this.fightMenuOptions.length;
        }
      }
      console.log("pressed right!", this.selectedFighterIndex);
    }
  }

  leaveFight() {
    storyFlags.flags.delete("START_FIGHT");
    events.emit("CHANGE_LEVEL", this.startLevel);
  }

  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    if (this.showFightMenu) {
      this.backdrop.drawImage(ctx, drawPosX, drawPosY);
      //this.portrait.drawImage(ctx, drawPosX + 6, drawPosY + 6);
      let column = 0; // Track current column (0 or 1)
      let row = 0; // Track current row 

      //configuration options
      const PADDING_LEFT = 15;
      const PADDING_TOP = 9;
      const LINE_WIDTH_MAX = 240;
      const LINE_VERTICAL_WIDTH = 14;
      const BOT_SPRITE_WIDTH = 32;

      let cursorX = 0 + PADDING_LEFT;
      let cursorY = 0 + PADDING_TOP;
      let currentShowingIndex = 0;

      if (this.showFighterSelectionMenu) { 
        this.paintFighterSelectionMenu(cursorX, BOT_SPRITE_WIDTH, ctx, PADDING_LEFT, cursorY);
        return;
      }
      if (this.showFightMenuOptions) {
        this.paintFightMenuOptions(drawPosX, LINE_WIDTH_MAX, cursorX, column, PADDING_LEFT, row, cursorY, drawPosY, PADDING_TOP, LINE_VERTICAL_WIDTH, ctx);
        return;
      }
    }
  }


  private paintFightMenuOptions(drawPosX: number, LINE_WIDTH_MAX: number, cursorX: number, column: number, PADDING_LEFT: number, row: number, cursorY: number, drawPosY: number, PADDING_TOP: number, LINE_VERTICAL_WIDTH: number, ctx: CanvasRenderingContext2D) {
    for (let x = 0; x < this.fightMenuOptions.length; x++) {
      const word = this.fightMenuOptions[x];
      const words = calculateWords(word);

      words.forEach((word: any) => {
        // Decide if we can fit this next word on this line
        const spaceRemaining = drawPosX + LINE_WIDTH_MAX - cursorX;
        if (spaceRemaining < word.wordWidth && column < 1) {
          // Move to the next column
          column++;
          cursorX = drawPosX + PADDING_LEFT + LINE_WIDTH_MAX / 2 + 10; // Adjust x to the next column
        } else if (spaceRemaining < word.wordWidth && column >= 1) {
          // Move to the next row
          column = 0;
          row++;
          cursorX = drawPosX + PADDING_LEFT; // Reset x to start of line
          cursorY = 0 + PADDING_TOP + row * (LINE_VERTICAL_WIDTH + 10); // Move to next row
        }

        if (x === this.selectedFightMenuIndex) {
          // Draw a red square beside the selected word
          ctx.strokeStyle = 'red';
          ctx.lineWidth = 2;
          ctx.strokeRect(cursorX, 80, word.wordWidth + 20, LINE_VERTICAL_WIDTH + 10);
        }

        word.chars.forEach((char: { width: number; sprite: Sprite; }) => {
          const withCharOffset = cursorX - 5;
          char.sprite.draw(ctx, withCharOffset, 80);
          cursorX += char.width + 1; // Add width of the character and some space
        });

        cursorX += 3 + PADDING_LEFT;
      });

      if (column === 1) {
        // Move to next column if we're done with the first column in this row
        column = 0;
        row++;
        cursorX = drawPosX + PADDING_LEFT;
        cursorY = drawPosY + PADDING_TOP + row * (LINE_VERTICAL_WIDTH + 10);
      }
    }
    return { cursorX, column, row, cursorY };
  }

  private paintFighterSelectionMenu(cursorX: number, BOT_SPRITE_WIDTH: number, ctx: CanvasRenderingContext2D, PADDING_LEFT: number, cursorY: number) {
    for (let x = 0; x < this.metabotChoices.length; x++) {
      const metabotSprite = new Sprite(
        x+1,
        resources.images["botFrame"],
        new Vector2((cursorX), 5),
        undefined,
        undefined,
        new Vector2(BOT_SPRITE_WIDTH, 32),
        undefined,
        undefined,
        undefined,
        this.metabotChoices[x].name
      );
      const existingBot = this.children.some((z: any) => z.objectId === (x+1));
      if (!existingBot) {
        this.addChild(metabotSprite);
        console.log(`added : ${x} @ ${cursorX}`);
      }

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
        const boxX = cursorX; // Center the box horizontally
        const boxY = 115; // Position the box below the player


        // Draw the dark background box for the name
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)"; // Semi-transparent black for the box
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight); // Draw the box


        // Draw the name text on top of the box
        ctx.fillStyle = "chartreuse"; // Set text color again
        ctx.fillText(this.metabotChoices[x].name ?? "Anon", boxX + boxPadding + textWidth / 2, boxY + boxHeight - 3); // Position the text slightly above the bottom of the box
      }

      if (x === this.selectedFighterIndex) {
        // Draw a red square beside the selected bot
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.strokeRect(cursorX, 80, 32, 32);
      }
      cursorX += BOT_SPRITE_WIDTH + PADDING_LEFT;
    }

    //draw the run option
    if (this.metabotChoices.length === this.selectedFighterIndex) {
      // Draw a red square beside the selected word
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.strokeRect(cursorX, 80, 32, 32);
    }
    const run = calculateWords("Run");
    run.forEach((word: any) => {
      word.chars.forEach((char: { width: number; sprite: Sprite; }) => {
        char.sprite.draw(ctx, cursorX, 80);
        cursorX += char.width + 1; // Add width of the character and some space
      });
    });
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
    events.emit("FIGHTER_SELECTED", metabots[0]); 
    this.showFightMenuOptions = true;
    this.showFighterSelectionMenu = false;
    this.removeFighterSelectionSprites();
  } 
}
