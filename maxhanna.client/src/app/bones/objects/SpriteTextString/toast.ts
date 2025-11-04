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
  showingIndex = 0;
  finalIndex = 0;
  textSpeed = 80;
  timeUntilNextShow = this.textSpeed; 
  private _createdTs: number = Date.now();
  private _destroyTimer: any | null = null;

  constructor(config: {
    string?: string[];
  }) {
    super({ position: new Vector2(80, 2), drawLayer: HUD });
 
    if (config.string) {
      this.content = config.string;
      this.cacheWords();
    } 
    // schedule automatic destruction after 8 seconds
    try {
      this._destroyTimer = setTimeout(() => { try { this.destroy(); } catch { } }, 8000);
    } catch { }
  }

  // Method to calculate and cache words for all text content
  private cacheWords() {
    const textContent = this.content;

    this.cachedWords = textContent.map((text) =>
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
    try { if (this._destroyTimer) { clearTimeout(this._destroyTimer); this._destroyTimer = null; } } catch { }
    // Clean up cached sprites
    this.cachedWords.forEach((words) =>
      words.forEach((word) => word.chars.forEach((char) => char.sprite.destroy()))
    );
    this.cachedWords = [];
    super.destroy();
  }


  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    const BOX_W = this.backdrop.frameSize.x;
    const BOX_H = this.backdrop.frameSize.y;

    // Opening animation: scale from 0 -> 1 over first 3000ms using ease-out
    const elapsed = Date.now() - (this._createdTs || Date.now());
    const openDuration = 3000;
    let scale = 1;
    if (elapsed < openDuration) {
      const t = Math.max(0, Math.min(1, elapsed / openDuration));
      scale = Math.sin((t * Math.PI) / 2); // ease-out
    }

    // Apply scale transform centered on the toast box
    const cx = drawPosX + BOX_W / 2;
    const cy = drawPosY + BOX_H / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);

    this.backdrop.drawImage(ctx, drawPosX, drawPosY);
    this.portrait?.drawImage(ctx, drawPosX + 6, drawPosY + 6);

  const LINE_VERTICAL_WIDTH = 14;

    // Determine total height and starting Y to vertically center the text block
    const lineCount = Math.max(0, this.cachedWords.length);
    const totalTextHeight = lineCount * LINE_VERTICAL_WIDTH;
    let cursorY = drawPosY + Math.floor((BOX_H - totalTextHeight) / 2) + Math.floor(LINE_VERTICAL_WIDTH / 2) - 2;

    let currentShowingIndex = 0;

    // Draw each cached line centered horizontally inside the 164px backdrop
    for (let lineIndex = 0; lineIndex < this.cachedWords.length; lineIndex++) {
      const words = this.cachedWords[lineIndex];

      // compute line width by summing character widths + spacing
      let lineWidth = 0;
      for (let wi = 0; wi < words.length; wi++) {
        const w = words[wi];
        let charsWidth = 0;
        for (const ch of w.chars) {
          charsWidth += ch.width + 1; // char width + 1px spacing
        }
        lineWidth += charsWidth;
        if (wi < words.length - 1) lineWidth += 3; // gap between words
      }

      // center horizontally inside the box
      let cursorX = drawPosX + Math.floor((BOX_W - lineWidth) / 2);

      for (const word of words) {
        for (const char of word.chars) {
          if (currentShowingIndex > this.showingIndex) break;
          char.sprite.draw(ctx, cursorX - 5, cursorY);
          cursorX += char.width + 1;
          currentShowingIndex++;
        }
        cursorX += 3;
      }

      cursorY += LINE_VERTICAL_WIDTH;
    }
    ctx.restore();
  }
}
