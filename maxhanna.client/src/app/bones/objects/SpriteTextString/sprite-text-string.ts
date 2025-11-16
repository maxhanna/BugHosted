import { calculateWords } from "./sprite-font-map";
import { GameObject, HUD } from "../game-object";
import { Sprite } from "../sprite";
import { Vector2 } from "../../../../services/datacontracts/bones/vector2";
import { Input } from "../../helpers/input";

export class SpriteTextString extends GameObject {   
  words: { wordWidth: number; chars: { width: number, sprite: Sprite }[] }[];
  showingIndex = 0;
  finalIndex = 0;
  textSpeed = 80;
  timeUntilNextShow = this.textSpeed;
  PADDING_LEFT = 27;
  PADDING_TOP = 9;
  LINE_WIDTH_MAX = 240;
  LINE_VERTICAL_WIDTH = 14;
  color: string = "White";
  constructor(wordToWrite: string, position: Vector2, color?: "White" | "Black", secondsToLive?: number, skipAnimation?: boolean) {
    super({ position: position, drawLayer: HUD }); 
    if (color) { 
      this.color = color;
    } 
    const content = wordToWrite ?? "Default text!";
    this.words = calculateWords({ content: content, color: this.color });
    
    this.finalIndex = this.words.reduce((acc, word) => acc + word.chars.length, 0);

    if (skipAnimation) {
      this.showingIndex = this.finalIndex; // render all chars immediately (HUD/static text)
    }

    if (secondsToLive) {
      setTimeout(() => { this.destroy(); }, secondsToLive * 1000);
    }
  }

  override step(delta: number, root: GameObject) { 
    let parent = root?.parent ?? root;
    if (parent) { 
      while (parent.parent) {
        parent = parent.parent;
      }
    }
    if (!(this.showingIndex === this.finalIndex)) {
  const input = parent?.input as Input;
  if (input && typeof (input as any).getActionJustPressed === 'function' && (input as any).getActionJustPressed("Space")) {
        if (this.showingIndex < this.finalIndex) {
          //skip text
          this.showingIndex = this.finalIndex;
          return;
        } 
      }
      this.timeUntilNextShow -= delta;
      if (this.timeUntilNextShow <= 0) {
        this.showingIndex += 3;
        this.timeUntilNextShow = this.textSpeed;
      }
    } 
  }

  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) { 
    //configuration options    
    const initialCursorX = drawPosX + this.PADDING_LEFT;
    const maxCursorX = drawPosX + this.LINE_WIDTH_MAX;

    let cursorX = initialCursorX;
    let cursorY = drawPosY + this.PADDING_TOP;
    let currentShowingIndex = 0;

    this.words.forEach(word => {
      //Decide if we can fit this next word on this line
      // Include per-character spacing (+1) in width estimation for wrap correctness
      const effectiveWordWidth = word.wordWidth + word.chars.length; // account for +1 spacing between characters
      const spaceRemaining = maxCursorX - cursorX;
      if (spaceRemaining < effectiveWordWidth) {
        cursorX = initialCursorX;
        cursorY += this.LINE_VERTICAL_WIDTH;
      }

      word.chars.forEach((char: any) => {
        if (currentShowingIndex > this.showingIndex) {
          return;
        }
        if (char.spriteCanvas) {
          // Draw pre-rendered glyph canvas directly.
          ctx.drawImage(char.spriteCanvas, cursorX, cursorY);
        } else if (char.sprite) {
          char.sprite.drawLayer = "HUD";
          char.sprite.draw(ctx, cursorX, cursorY);
        }
        cursorX += char.width + 1; 
        currentShowingIndex++;
      });
      cursorX += 3;
    }); 
  }
}
