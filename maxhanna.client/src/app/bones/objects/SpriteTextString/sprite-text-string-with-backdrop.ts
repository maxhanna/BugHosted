import { calculateWords } from "./sprite-font-map";
import { GameObject, HUD } from "../game-object";
import { Sprite } from "../sprite";
import { resources } from "../../helpers/resources";
import { events } from "../../helpers/events";
import { Vector2 } from "../../../../services/datacontracts/bones/vector2";
import { Input } from "../../helpers/input";
import { Hero } from "../Hero/hero";

export class SpriteTextStringWithBackdrop extends GameObject {
  backdrop = new Sprite({
    resource: resources.images["textBox"],
    frameSize: new Vector2(256, 64)
  });
  menuLocationX = 10;
  menuLocationY = 12;
  selectorSprite = new Sprite({
    resource: resources.images["pointer"],
    frameSize: new Vector2(12, 10),
    position: new Vector2(this.menuLocationX, this.menuLocationY)
  });

  portrait?: Sprite;
  objectSubject: any;
  content: string[] = [];
  cachedWords: { wordWidth: number; chars: { width: number; sprite: Sprite }[] }[][] = [];
  showingIndex = 0;
  finalIndex = 0;
  textSpeed = 80;
  timeUntilNextShow = this.textSpeed;
  canSelectItems = false;
  selectionIndex = 0;

  constructor(config: {
    string?: string[];
    portraitFrame?: number;
    canSelectItems?: boolean;
    objectSubject?: { name?: string };
  }) {
    super({ position: new Vector2(32, 118), drawLayer: HUD });

    this.canSelectItems = config.canSelectItems ?? false;
    this.objectSubject = config.objectSubject ?? {};
    if (config.string) {
      this.content = config.string;
      this.cacheWords();
    }
    if (config.objectSubject) {
      this.objectSubject = config.objectSubject;
    }
    const isHero = config.objectSubject instanceof Hero;

    if (isHero || config.portraitFrame) {
      this.portrait = new Sprite({
        name: this.objectSubject?.name,
        resource: isHero || resources.images["portraits"] ? resources.images["portraits"] : this.objectSubject?.body?.resource,
        frame: config.portraitFrame ?? 0,
        vFrames: 1,
        hFrames: 4,
        colorSwap: this.objectSubject?.colorSwap,
      });
    } else {
      this.getPortraitOfNonPortraitObject(config);
    }

    events.emit("BLOCK_START_MENU");
    events.emit("BLOCK_BACKGROUND_SELECTION");
    events.on("CLOSE_MENUS", this, () => {
      events.emit("HERO_MOVEMENT_LOCK");
    });
    if (this.canSelectItems) {
      this.addChild(this.selectorSprite);
    } 
  }

  // Method to calculate and cache words for all text content
  private cacheWords() {  
    const subjectName = this.objectSubject?.name ? `${this.objectSubject.name}:` : "";
    const textContent = subjectName ? [subjectName, ...this.content] : this.content;

    this.cachedWords = textContent.map((text) =>
      calculateWords({ content: text, color: "White" })
    );

    this.finalIndex = this.cachedWords.reduce(
      (total, words) => total + words.reduce((sum, word) => sum + word.chars.length, 0),
      0
    );
  }

  override destroy() {
    events.emit("UNBLOCK_START_MENU");
    events.emit("UNBLOCK_BACKGROUND_SELECTION");
    events.emit("HERO_MOVEMENT_UNLOCK");
    if (this.portrait) {
      this.portrait.destroy();
    }
    if (this.selectorSprite) {
      this.selectorSprite.destroy();
    }
    if (this.backdrop) {
      this.backdrop.destroy();
    }
    // Clean up cached sprites
    this.cachedWords.forEach((words) =>
      words.forEach((word) => word.chars.forEach((char) => char.sprite.destroy()))
    );
    this.cachedWords = [];
    super.destroy();
  }

  override step(delta: number, root: GameObject) {
    let parent = root?.parent ?? root;
    if (parent) {
      while (parent.parent) {
        parent = parent.parent;
      }
    }
    const input = parent?.input as Input;

    if (input && (typeof (input as any).getActionJustPressed === 'function' || (input.heldDirections && input.heldDirections.length > 0) || Object.values(input.keys || {}).some((value) => value === true))) {
      this.handleKeyboardInput(input);
    }

    this.timeUntilNextShow -= delta;
    if (this.timeUntilNextShow <= 0) {
      this.showingIndex += 3;
      this.timeUntilNextShow = this.textSpeed;
    }
  }

  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    this.backdrop.drawImage(ctx, drawPosX, drawPosY);
    this.portrait?.drawImage(ctx, drawPosX + 6, drawPosY + 6);

    const PADDING_LEFT = 27;
    const PADDING_TOP = 12;
    const LINE_WIDTH_MAX = 240;
    const LINE_VERTICAL_WIDTH = 14;

    let cursorX = drawPosX + PADDING_LEFT;
    let cursorY = drawPosY - 10 + PADDING_TOP;
    let currentShowingIndex = 0;

    // Handle name more safely
    const hasName = this.objectSubject?.name;
    if (hasName && this.selectionIndex === 0) {
      this.selectionIndex = 1; // Skip name line for selection
    }

    for (let x = 0; x < this.cachedWords.length; x++) {
      const words = this.cachedWords[x];
      words.forEach((word) => {
        const spaceRemaining = drawPosX + LINE_WIDTH_MAX - cursorX;
        if (spaceRemaining < word.wordWidth) {
          cursorX = drawPosX + PADDING_LEFT;
          cursorY += LINE_VERTICAL_WIDTH;
        }

        word.chars.forEach((char) => {
          if (currentShowingIndex > this.showingIndex) return;
          char.sprite.draw(ctx, cursorX - 5, cursorY);
          cursorX += char.width + 1;
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
    objectSubject?: any;
  }) {
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
    if (document.activeElement?.id == input?.chatInput.id) { return; }

    if (input?.getActionJustPressed("Space") && !input?.chatSelected) {
      if (this.showingIndex < this.finalIndex) {
        this.showingIndex = this.finalIndex;
        return;
      }
      if (this.canSelectItems) {
        const contentIndex = this.selectionIndex - (this.objectSubject?.name ? 1 : 0);
        if (contentIndex >= 0 && contentIndex < this.content.length) {
          events.emit("SELECTED_ITEM", this.content[contentIndex]);
        }
        this.canSelectItems = false;
      }
      events.emit("END_TEXT_BOX");
      this.destroy();
    }
    else if (input?.verifyCanPressKey() && !input.chatSelected) {
      const selectionSpacer = 12;

      if (input?.getActionJustPressed("ArrowUp")
        || input?.heldDirections.includes("UP")
        || input?.getActionJustPressed("KeyW")) {
        this.selectionIndex--;
        if (this.selectionIndex <= 0) {
          this.selectionIndex = this.content.length;
        }
        this.selectorSprite.position.y = this.selectionIndex == 0 ? this.menuLocationY : (this.selectionIndex * selectionSpacer);
      }
      else if (input?.getActionJustPressed("ArrowDown")
        || input?.heldDirections.includes("DOWN")
        || input?.getActionJustPressed("KeyS")) {
        this.selectionIndex++;
        if (this.selectionIndex == this.content.length + (this.objectSubject?.name ? 1 : 0)) {
          this.selectionIndex = 0;
        }
        this.selectorSprite.position.y = this.selectionIndex == 0 ? this.menuLocationY : this.selectionIndex * selectionSpacer;
      }
      else if (input?.getActionJustPressed("ArrowLeft")
        || input?.heldDirections.includes("LEFT")
        || input?.getActionJustPressed("KeyA")) {
        this.selectionIndex--;
        if (this.selectionIndex < 0) {
          this.selectionIndex = this.content.length - (this.objectSubject?.name ? 0 : 1);
        }
        this.selectorSprite.position.y = this.selectionIndex == 0 ? this.menuLocationY : (this.selectionIndex * selectionSpacer);
      }
      else if (input?.getActionJustPressed("ArrowRight")
        || input?.heldDirections.includes("RIGHT")
        || input?.getActionJustPressed("KeyD")) {
        this.selectionIndex++;
        if (this.selectionIndex == this.content.length + (this.objectSubject?.name ? 1 : 0)) {
          this.selectionIndex = 0;
        }
        this.selectorSprite.position.y = this.selectionIndex == 0 ? this.menuLocationY : (this.selectionIndex * selectionSpacer);
      }

    }
  }
}
