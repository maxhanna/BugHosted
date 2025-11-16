import { calculateWords } from "./sprite-font-map";
import { GameObject, HUD } from "../game-object";
import { Sprite } from "../sprite"; 
import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { events } from "../../helpers/events";

export class ChatSpriteTextString extends GameObject {
  backgroundAlpha = 0.75;
  PADDING_LEFT = 27;
  PADDING_TOP = 9;
  LINE_WIDTH_MAX = 200;
  LINE_VERTICAL_WIDTH = 14;
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
  constructor(config: {
    string?: string[];
    portraitFrame?: number;
    objectSubject?: any;
  }) {
    super({
      position: new Vector2(config.objectSubject.position.x - 120, config.objectSubject.position.y + 20),
      drawLayer: HUD, // Ensured high-priority layer
      name: "CHATSPRITETEXTSTRING",
      isOmittable: false
    });
    if (config.string) {
      this.content = config.string;
      this.cacheWords();
      this.calculateDimensions();  
    }
    if (config.objectSubject) {
      this.objectSubject = config.objectSubject;
    } 

    // Subscribe to movement events so bubble follows even if subject reposition logic changes externally
    events.on("HERO_MOVED", this, (data: any) => {
      try {
        if (!data) return;
        if (this.objectSubject && (data.id === this.objectSubject.id)) {
          // Update internal anchor and bubble position offsets
          this.objectSubject.position.x = data.x;
          this.objectSubject.position.y = data.y;
          this.position.x = data.x - 120;
          this.position.y = data.y + 20;
        }
      } catch { }
    });
  }

  private calculateDimensions() {
    let lineCount = 0;
    let cursorX = this.PADDING_LEFT;

    // Calculate line count
    for (const words of this.cachedWords) {
      for (const word of words) {
        const spaceRemaining = this.LINE_WIDTH_MAX - cursorX;
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
  }
  private cacheWords() {
    const textContent = this.content;
    this.cachedWords = textContent.map((text) =>
      calculateWords({ content: text, color: "White" })
    );
    // Force HUD layer + non-omittable for each glyph
    this.cachedWords.forEach(words => words.forEach(word => word.chars.forEach(char => {
      char.sprite.drawLayer = HUD;
      char.sprite.isOmittable = false;
    })));
    this.finalIndex = this.cachedWords.reduce(
      (acc, words) => acc + words.reduce((sum, word) => sum + word.chars.length, 0),
      0
    );
    this.needsRecalculation = true;
  }

  override step(delta: number) {
    // Track the subject's position so the chat bubble follows the hero
    // Ensure chat never gets distance-culled
    this.preventDraw = false;
    if (this.objectSubject && this.objectSubject.position) {
      let top: any = this as any;
      while (top?.parent) top = top.parent;
      const cam = top?.camera;
      const worldX = this.objectSubject.position.x - 120;
      const worldY = this.objectSubject.position.y + 20;
      if (cam && cam.position) {
        this.position.x = worldX + cam.position.x;
        this.position.y = worldY + cam.position.y;
      } else {
        this.position.x = worldX;
        this.position.y = worldY;
      }
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
    if (this.needsRecalculation) {
      this.calculateDimensions();
    }
    ctx.fillStyle = `rgba(0, 0, 0, ${this.backgroundAlpha})`;
    ctx.fillRect(
      drawPosX,
      drawPosY,
      this.LINE_WIDTH_MAX + this.PADDING_LEFT * 2,
      this.cachedTotalHeight
    );

    // Draw text
    let cursorX = drawPosX + this.PADDING_LEFT;
    let cursorY = drawPosY - 10 + this.PADDING_TOP;
    let currentShowingIndex = 0;

    if (this.objectSubject?.name && this.selectionIndex == 0) {
      this.selectionIndex++;
    }

    for (let x = 0; x < this.cachedWords.length; x++) {
      const words = this.cachedWords[x];
      for (const word of words) {
        const spaceRemaining = drawPosX + this.LINE_WIDTH_MAX - cursorX;
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
      cursorY += this.PADDING_TOP;
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