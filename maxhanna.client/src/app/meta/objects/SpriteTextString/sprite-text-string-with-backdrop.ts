import { calculateWords } from "./sprite-font-map";
import { GameObject, HUD } from "../game-object";
import { Sprite } from "../sprite";
import { resources } from "../../helpers/resources";
import { events } from "../../helpers/events";
import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { Input } from "../../helpers/input";
import { Hero } from "../Hero/hero";

export class SpriteTextStringWithBackdrop extends GameObject {
  backdrop = new Sprite({
    resource: resources.images["textBox"],
    frameSize: new Vector2(256, 64)
  }); 
  portrait?: Sprite;
  objectSubject: any;
  content: string[] = [];
  showingIndex = 0;
  finalIndex = 0;
  textSpeed = 80;
  timeUntilNextShow = this.textSpeed;
  canSelectItems = false;
  selectionIndex = 0;
  constructor(config: {
    string?: string[],
    portraitFrame?: number,
    canSelectItems?: boolean,
    objectSubject?: any
  }) {
    super({ position: new Vector2(32, 118), drawLayer: HUD });
    if (config.canSelectItems) {
      this.canSelectItems = config.canSelectItems;
    }
    if (config.string) {
      this.content = config.string;
    }
    if (config.objectSubject) {
      this.objectSubject = config.objectSubject;
    } 
    const isHero = config.objectSubject instanceof Hero; 

    if (isHero || config.portraitFrame) {
      this.portrait = new Sprite({
        name: this.objectSubject?.name,
        resource: (isHero || resources.images["portraits"]) ? resources.images["portraits"] : this.objectSubject?.body?.resource,
        frame: (config.portraitFrame ?? 0),
        vFrames: 1,
        hFrames: 4,
        colorSwap: this.objectSubject?.colorSwap,
      });
    } else {
      this.getPortraitOfNonPortraitObject(config);
    }
    events.emit("BLOCK_START_MENU"); 
  } 

  override destroy() {
    super.destroy();
    events.emit("UNBLOCK_START_MENU");  
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
    const input = parent?.input as Input;  

    if (input.heldDirections.length > 0 || Object.values(input.keys).some(value => value === true)) {
      this.handleKeyboardInput(input);
    }
   
    this.timeUntilNextShow -= delta;
    if (this.timeUntilNextShow <= 0) {
      this.showingIndex += 3;
      //reset time counter for next char
      this.timeUntilNextShow = this.textSpeed;
    }
  }

  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    //Draw the backdrop
    this.backdrop.drawImage(ctx, drawPosX, drawPosY);
    this.portrait?.drawImage(ctx, drawPosX + 6, drawPosY + 6);
     
    const subjectName = this.objectSubject?.name + ":"; 
    //configuration options
    const PADDING_LEFT = 27;
    const PADDING_TOP = 12;
    const LINE_WIDTH_MAX = 240;
    const LINE_VERTICAL_WIDTH = 14;

    let cursorX = drawPosX + PADDING_LEFT;
    let cursorY = drawPosY - 10 + PADDING_TOP;
    let currentShowingIndex = 0;

    const textContent = [subjectName, ... this.content];
    if (subjectName && this.selectionIndex == 0) {
      this.selectionIndex++;
    }

    for (let x = 0; x < textContent.length; x++) {
      let words = calculateWords({ content: textContent[x], color: "White" });
      const totalWordWidth = words.reduce((sum, word) => sum + word.wordWidth, 0);
      if ((subjectName ? x > 0 : true) && x === this.selectionIndex && this.canSelectItems) {
        // Draw a red square beside the selected word
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.strokeRect(cursorX, cursorY, totalWordWidth + 10, LINE_VERTICAL_WIDTH);
      }

      words.forEach(word => {
        //Decide if we can fit this next word on this line
        const spaceRemaining = drawPosX + LINE_WIDTH_MAX - cursorX;
        if (spaceRemaining < word.wordWidth) {
          cursorX = drawPosX + PADDING_LEFT;
          cursorY += LINE_VERTICAL_WIDTH;
        }

        word.chars.forEach((char: { width: number, sprite: Sprite }) => {
          if (currentShowingIndex > this.showingIndex) {
            return;
          }
          const withCharOffset = cursorX - 5;
          char.sprite.draw(ctx, withCharOffset, cursorY);
          // add width of the character we just printed to cursor pos
          cursorX += char.width;
          //add a little space after each char
          cursorX++;
          currentShowingIndex++;
        });
        cursorX += 3;
      });
      cursorX = drawPosX + PADDING_LEFT;
      cursorY += PADDING_TOP;
    }
  }

  private getPortraitOfNonPortraitObject(config: {
      string?: string[] | undefined;
      portraitFrame?: number | undefined;
      canSelectItems?: boolean | undefined;
      objectSubject?: any; }) {
    let frame = 0;
    let vFrames = 0;
    let hFrames = 0;
    const objType = config.objectSubject?.constructor?.name;
    if (objType) {
      if (objType == "Deer") {
        frame = 11;
        vFrames = 5;
        hFrames = 5;
      } else if (objType == "Gangster") {
        frame = 0;
      } else if (objType == "Chicken") {
        frame = 0;
      } else if (objType == "Sign") {
        frame = 0; 
      }
    }
    
    this.portrait = new Sprite({
      resource: this.objectSubject?.body?.resource,
      colorSwap: this.objectSubject?.colorSwap,
      frame: frame,
      vFrames: vFrames,
      hFrames: hFrames,
    });
  }

  private handleKeyboardInput(input: Input) { 
    if (input?.getActionJustPressed("Space")) {
      if (this.showingIndex < this.finalIndex) {
        //skip text
        this.showingIndex = this.finalIndex;
        return;
      }
      if (this.canSelectItems) {
        //console.log(this.content[this.selectionIndex - (subjectName ? 1 : 0)]);
        events.emit("SELECTED_ITEM", this.content[this.selectionIndex - (this.objectSubject?.name ? 1 : 0)]);
        this.canSelectItems = false;
      }
      events.emit("END_TEXT_BOX");
    }
    if (input?.verifyCanPressKey()) {
      if (input?.getActionJustPressed("ArrowUp")
        || input?.heldDirections.includes("UP")
        || input?.getActionJustPressed("KeyW")) {
        this.selectionIndex--;
        if (this.selectionIndex <= 0) {
          this.selectionIndex = this.content.length;
        }
      }
      else if (input?.getActionJustPressed("ArrowDown")
        || input?.heldDirections.includes("DOWN")
        || input?.getActionJustPressed("KeyS")) {
        this.selectionIndex++;
        if (this.selectionIndex == this.content.length + (this.objectSubject?.name ? 1 : 0)) {
          this.selectionIndex = 0;
        }
      }
      else if (input?.getActionJustPressed("ArrowLeft")
        || input?.heldDirections.includes("LEFT")
        || input?.getActionJustPressed("KeyA")) {
        this.selectionIndex--;
        if (this.selectionIndex < 0) {
          this.selectionIndex = this.content.length - (this.objectSubject?.name ? 0 : 1);
        }
      }
      else if (input?.getActionJustPressed("ArrowRight")
        || input?.heldDirections.includes("RIGHT")
        || input?.getActionJustPressed("KeyD")) {
        this.selectionIndex++;
        if (this.selectionIndex == this.content.length + (this.objectSubject?.name ? 1 : 0)) {
          this.selectionIndex = 0;
        }
      }

    }
  }
}
