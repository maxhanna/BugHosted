import { calculateWords } from "./sprite-font-map";
import { GameObject, HUD } from "../game-object";
import { Sprite } from "../sprite"; 
import { Vector2 } from "../../../../services/datacontracts/bones/vector2";
import { events } from "../../helpers/events";

export class ChatSpriteTextString extends GameObject {
  backgroundAlpha = 0.75;
  PADDING_LEFT = 10;
  PADDING_TOP = 9;
  LINE_WIDTH_MAX = 180;
  // Minimum and safe margins to avoid overlapping HUD elements (health/mana orbs on the right)
  LINE_WIDTH_MIN = 160;
  SAFE_RIGHT_MARGIN = 150;
  // Increased from 14 to 16 for more readable chat line spacing
  LINE_VERTICAL_WIDTH = 16;
  TIME_UNTIL_DESTROY = 8000;
  objectSubject: any;
  content: string[] = [];
  // Cache for words
  cachedWords: { wordWidth: number; chars: { width: number; sprite: Sprite }[] }[][] = [];
  showingIndex = 0;
  finalIndex = 0;
  textSpeed = 80;
  timeUntilNextShow = this.textSpeed;
  canSelectItems = false;
  selectionIndex = 0;
  private cachedLineCount: number = 0;
  private cachedTotalHeight: number = 0;
  private needsRecalculation: boolean = true;
  private lastComputedLineWidth: number = 0;
  private readonly chatWindowOffset = new Vector2(-60, 40);
  constructor(config: {
    string?: string[];
    portraitFrame?: number;
    objectSubject?: any;
  }) {
    super({
      position: new Vector2(config.objectSubject.position.x - 60, config.objectSubject.position.y + 40),
      drawLayer: HUD, // Ensured high-priority layer
      name: "CHATSPRITETEXTSTRING"
    });
    if (config.string) {
      this.content = config.string;
      this.cacheWords();
      this.calculateDimensions();  
    }
    if (config.objectSubject) {
      this.objectSubject = config.objectSubject;
    } 
    events.on("HERO_MOVED", this, (data: any) => {
      if (!data) return;
      if (this.objectSubject && data.id === this.objectSubject.id) {
        this.objectSubject.position.x = data.x;
        this.objectSubject.position.y = data.y;
        this.position.x = data.x + this.chatWindowOffset.x;
        this.position.y = data.y + this.chatWindowOffset.y;
      }
    });
  }

  private calculateDimensions() {
    // Backwards-compatible convenience: calculate using the static max
    this.calculateDimensionsForWidth(this.LINE_WIDTH_MAX);
  }

  // Calculate dimensions for a given available line width (excludes padding)
  private calculateDimensionsForWidth(lineWidthMax: number) {
    // Avoid recalculation when possible
    if (!this.needsRecalculation && this.lastComputedLineWidth === lineWidthMax) return;

    let lineCount = 0;
    let cursorX = this.PADDING_LEFT;

    for (const words of this.cachedWords) {
      for (const word of words) {
        const spaceRemaining = lineWidthMax - cursorX;
        if (spaceRemaining < word.wordWidth) {
          cursorX = this.PADDING_LEFT;
          lineCount++;
        }
        cursorX += word.wordWidth + 3;
      }
      cursorX = this.PADDING_LEFT;
      lineCount++;
    }

    this.cachedLineCount = lineCount;
    this.cachedTotalHeight = (lineCount * this.LINE_VERTICAL_WIDTH) + (this.PADDING_TOP * 2);
    this.needsRecalculation = false;
    this.lastComputedLineWidth = lineWidthMax;
  }
  private cacheWords() {
    const textContent = this.content;
    this.cachedWords = textContent.map((text) =>
      calculateWords({ content: text, color: "White" })
    );
    this.finalIndex = this.cachedWords.reduce(
      (acc, words) => acc + words.reduce((sum, word) => sum + word.chars.length, 0),
      0
    );
    this.needsRecalculation = true;
  }

  override step(delta: number) {
    if (this.objectSubject && this.objectSubject.position) {
      this.position.x = this.objectSubject.position.x + this.chatWindowOffset.x;
      this.position.y = this.objectSubject.position.y + this.chatWindowOffset.y;
    }
    if (this.showingIndex >= this.finalIndex) {
      setTimeout(() => { this.destroy(); }, this.TIME_UNTIL_DESTROY);
      return;
    }

    this.timeUntilNextShow -= delta;
    if (this.timeUntilNextShow <= 0) {
      this.showingIndex += 3;
      this.timeUntilNextShow = this.textSpeed;
    }
  }

  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    // Draw text box background
    // Determine effective max line width based on canvas size.
    // Compute both right-side and left-side available widths and pick the placement that yields the larger effective width.
    const canvasWidth = ctx.canvas ? ctx.canvas.width : (this.LINE_WIDTH_MAX + this.SAFE_RIGHT_MARGIN + this.PADDING_LEFT * 2);

    // Available width if we place the box to the right of drawPosX
    const availableRight = canvasWidth - drawPosX - this.SAFE_RIGHT_MARGIN - this.PADDING_LEFT * 2;
    const effectiveRight = Math.min(this.LINE_WIDTH_MAX, Math.max(this.LINE_WIDTH_MIN, availableRight));

    // Available width if we place the box to the left of drawPosX (use drawPosX as available space)
    const availableLeft = drawPosX - this.SAFE_RIGHT_MARGIN - this.PADDING_LEFT * 2;
    const effectiveLeft = Math.min(this.LINE_WIDTH_MAX, Math.max(this.LINE_WIDTH_MIN, availableLeft));

    // Choose the side that yields the larger effective width. Default to right if equal.
    const placeLeft = effectiveLeft > effectiveRight;
    const effectiveLineWidth = placeLeft ? effectiveLeft : effectiveRight;

    if (this.needsRecalculation || this.lastComputedLineWidth !== effectiveLineWidth) {
      this.calculateDimensionsForWidth(effectiveLineWidth);
    }

    // Determine actual drawing X coordinate for the background box
    const drawBoxX = placeLeft
      ? Math.max(0, drawPosX - (effectiveLineWidth + this.PADDING_LEFT * 2))
      : drawPosX;

    ctx.fillStyle = `rgba(0, 0, 0, ${this.backgroundAlpha})`;
    ctx.fillRect(
      drawBoxX,
      drawPosY,
      effectiveLineWidth + this.PADDING_LEFT * 2,
      this.cachedTotalHeight
    );

    // Draw text
  let cursorX = drawBoxX + this.PADDING_LEFT;
    let cursorY = drawPosY - 10 + this.PADDING_TOP;
    let currentShowingIndex = 0;

    if (this.objectSubject?.name && this.selectionIndex == 0) {
      this.selectionIndex++;
    }

    for (let x = 0; x < this.cachedWords.length; x++) {
      const words = this.cachedWords[x];
      for (const word of words) {
        const spaceRemaining = drawPosX + effectiveLineWidth - cursorX;
        if (spaceRemaining < word.wordWidth) {
          cursorX = drawPosX + this.PADDING_LEFT;
          cursorY += this.LINE_VERTICAL_WIDTH;
        }

        for (const char of word.chars) {
          if (currentShowingIndex > this.showingIndex) {
            continue;
          }
          const withCharOffset = cursorX - 5;
          char.sprite.draw(ctx, withCharOffset, cursorY);
          cursorX += char.width + 1;
          currentShowingIndex++;
        }
        cursorX += 3;
      }
      cursorX = drawPosX + this.PADDING_LEFT;
      // Add extra spacing between paragraphs/lines for readability
      cursorY += this.LINE_VERTICAL_WIDTH + 2;
    }
  }
  updateContent(newContent: string[]) {
    this.content = newContent;
    this.cacheWords(); // This will set needsRecalculation to true
    this.showingIndex = 0; // Reset animation if needed
  }

  override destroy() { 
    this.cachedWords.forEach((words) =>
      words.forEach((word) => word.chars.forEach((char) => char.sprite.destroy()))
    );
    this.cachedWords = [];
    super.destroy();
  } 
}