import { calculateWords } from "./sprite-font-map";
import { GameObject, HUD } from "../game-object";
import { Sprite } from "../sprite";
import { resources } from "../../helpers/resources";
import { Vector2 } from "../../../../services/datacontracts/bones/vector2";

export class Toast extends GameObject {
  backdrop = new Sprite({
    resource: resources.images["toast"],
    frameSize: new Vector2(258, 60)
  });

  portrait?: Sprite;  
  content: string[] = [];
  cachedWords: { wordWidth: number; chars: { width: number; sprite: Sprite }[] }[][] = [];
  showingIndex = 0;
  finalIndex = 0;
  textSpeed = 80;
  timeUntilNextShow = this.textSpeed; 

  constructor(config: {
    string?: string[];
  }) {
    super({ position: new Vector2(2, 2), drawLayer: HUD });
 
    if (config.string) {
      this.content = config.string;
      this.cacheWords();
    } 
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

    const PADDING_LEFT = 27;
  const PADDING_TOP = 12;
  const LINE_WIDTH_MAX = 240;
  const LINE_VERTICAL_WIDTH = 14;
 
  let cursorX = drawPosX + PADDING_LEFT;
  let cursorY = drawPosY - 10 + PADDING_TOP;
    let currentShowingIndex = 0;
 

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
          const yOff =  cursorY;
          char.sprite.draw(ctx, cursorX - 5, yOff);
          cursorX += char.width + 1;
          currentShowingIndex++;
        });
        cursorX += 3;
      });
      cursorX = drawPosX + PADDING_LEFT;
      cursorY += LINE_VERTICAL_WIDTH;
    }
  }
}
