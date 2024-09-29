import { getCharacterWidth, getCharacterFrame } from "./sprite-font-map";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { resources } from "../../helpers/resources";
import { events } from "../../helpers/events";
import { gridCells } from "../../helpers/grid-cells";
import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { Input } from "../../helpers/input";

export class SpriteTextString extends GameObject {
  backdrop = new Sprite(
    0, resources.images["textBox"], new Vector2(0, 0), 1, 1, new Vector2(256, 64)
  );

  portrait: Sprite;
  words: { wordWidth: number; chars: { width: number, sprite: Sprite }[] }[];
  showingIndex = 0;
  finalIndex = 0;
  textSpeed = 80;
  timeUntilNextShow = this.textSpeed;

  constructor(config: {string?: string, portraitFrame?: number } = { }) {
    super({ position: new Vector2(32, 118) });
    this.drawLayer = "HUD";

    const content = config.string ?? "Default text!";
    this.words = content.split(" ").map((word: string) => {
      let wordWidth = 0;
      const chars = word.split("").map((char: string) => {
        const charWidth = getCharacterWidth(char);
        wordWidth += charWidth; 

        const objectId = 0;
        const position = undefined;
        const frame = getCharacterFrame(char);
        const resource = resources.images["fontWhite"];
        const hFrames = 13;
        const vFrames = 6;
        const scale = undefined;
        const frameSize = undefined;
        const name = undefined;
        const animations = undefined;

        return {
          width: charWidth,
          sprite: new Sprite(
            objectId, resource, position, scale, frame, frameSize, hFrames, vFrames, animations, name
          )
        }
      });

      return {
        wordWidth,
        chars
      }
    })

    this.portrait = new Sprite(
      0, resources.images["portraits"], new Vector2(0, 0), 1, (config.portraitFrame ?? 0), undefined, 4, 1
    );

    this.finalIndex = this.words.reduce((acc, word) => acc + word.chars.length, 0);
  }

  override step(delta: number, root: GameObject) {
    //listen for user input
    const input = root.input as Input;
    if (input?.getActionJustPressed("Space")) {
      if (this.showingIndex < this.finalIndex) {
        //skip text
        this.showingIndex = this.finalIndex;
        return;
      }

      events.emit("END_TEXT_BOX");
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
    this.portrait.drawImage(ctx, drawPosX + 6, drawPosY + 6);
    //configuration options
    const PADDING_LEFT = 27;
    const PADDING_TOP = 9;
    const LINE_WIDTH_MAX = 240;
    const LINE_VERTICAL_WIDTH = 14;

    let cursorX = drawPosX + PADDING_LEFT;
    let cursorY = drawPosY + PADDING_TOP;
    let currentShowingIndex = 0;

    this.words.forEach(word => {
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
  }
}
