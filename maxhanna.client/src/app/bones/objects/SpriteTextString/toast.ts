import { calculateWords } from "./sprite-font-map";
import { GameObject, HUD } from "../game-object";
import { Sprite } from "../sprite";
import { resources } from "../../helpers/resources";
import { Vector2 } from "../../../../services/datacontracts/bones/vector2";

export class Toast extends GameObject {
  backdrop = new Sprite({
    resource: resources.images["toast"],
    frameSize: new Vector2(164, 60)
  });

  portrait?: Sprite;  
  content: string[] = [];
  cachedWords: { wordWidth: number; chars: { width: number; sprite: Sprite }[] }[][] = [];
  // Per-line scale multipliers (1 = normal, <1 = smaller)
  lineScales: number[] = [];
  showingIndex = 0;
  finalIndex = 0;
  textSpeed = 80;
  timeUntilNextShow = this.textSpeed; 

  constructor(config: {
    string?: string[];
  }) {
    super({ position: new Vector2(80, 2), drawLayer: HUD });
 
    if (config.string) {
      this.content = config.string;
      this.cacheWords();
    } 

    setTimeout(() => { this.destroy(); }, 3000);
  }

  // Method to calculate and cache words for all text content
  private cacheWords() {
    // If any incoming string contains 'RoadTo' split it into two lines:
    // first line = 'RoadTo' (rendered slightly smaller), second line = rest of the text
    const processedLines: string[] = [];
    this.lineScales = [];

    for (const text of this.content) {
      if (text.includes("RoadTo")) {
        const rest = text.replace("RoadTo", "").trim();
        processedLines.push("RoadTo");
        this.lineScales.push(0.9); // slightly smaller font for the 'RoadTo' line
        if (rest.length) {
          processedLines.push(rest);
          this.lineScales.push(1);
        }
      } else {
        processedLines.push(text);
        this.lineScales.push(1);
      }
    }

    this.cachedWords = processedLines.map((text) =>
      calculateWords({ content: text, color: "White" })
    );

    this.finalIndex = this.cachedWords.reduce(
      (total, words) => total + words.reduce((sum, word) => sum + word.chars.length, 0),
      0
    );
  }

  override step(delta: number, root: GameObject) { 
    this.timeUntilNextShow -= delta;
    if (this.timeUntilNextShow <= 0) {
      this.showingIndex += 3;
      this.timeUntilNextShow = this.textSpeed;
    }
  }

  override destroy() { 
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


  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    this.backdrop.drawImage(ctx, drawPosX, drawPosY);
    this.portrait?.drawImage(ctx, drawPosX + 6, drawPosY + 6);

    const LINE_VERTICAL_WIDTH = 14;
    const BOX_W = this.backdrop.frameSize.x;
    const BOX_H = this.backdrop.frameSize.y;

    // Determine total height and starting Y to vertically center the text block
    const lineCount = Math.max(0, this.cachedWords.length);
    const totalTextHeight = lineCount * LINE_VERTICAL_WIDTH;
    let cursorY = drawPosY + Math.floor((BOX_H - totalTextHeight) / 2) + Math.floor(LINE_VERTICAL_WIDTH / 2) - 2;

    let currentShowingIndex = 0;

    // Draw each cached line centered horizontally inside the 164px backdrop
    for (let lineIndex = 0; lineIndex < this.cachedWords.length; lineIndex++) {
      const words = this.cachedWords[lineIndex];

      // compute line width by summing character widths + spacing, taking per-line scale into account
      const lineScale = this.lineScales[lineIndex] ?? 1;
      let lineWidth = 0;
      for (let wi = 0; wi < words.length; wi++) {
        const w = words[wi];
        let charsWidth = 0;
        for (const ch of w.chars) {
          // account for scale when measuring
          charsWidth += Math.floor((ch.width * lineScale)) + 1; // char width + 1px spacing
        }
        lineWidth += charsWidth;
        if (wi < words.length - 1) lineWidth += 3; // gap between words
      }

      // center horizontally inside the box
      let cursorX = drawPosX + Math.floor((BOX_W - lineWidth) / 2);

      for (const word of words) {
        for (const char of word.chars) {
          if (currentShowingIndex > this.showingIndex) break;
          // temporarily adjust sprite scale for this line, then draw and restore
          const prevScale = { x: char.sprite.scale.x, y: char.sprite.scale.y };
          char.sprite.scale = { x: prevScale.x * (this.lineScales[lineIndex] ?? 1), y: prevScale.y * (this.lineScales[lineIndex] ?? 1) } as any;
          char.sprite.draw(ctx, cursorX - 5, cursorY);
          // increment by scaled width
          cursorX += Math.floor((char.width * (this.lineScales[lineIndex] ?? 1))) + 1;
          // restore
          char.sprite.scale = prevScale as any;
          currentShowingIndex++;
        }
        cursorX += 3;
      }

      cursorY += LINE_VERTICAL_WIDTH;
    }
  }
}
