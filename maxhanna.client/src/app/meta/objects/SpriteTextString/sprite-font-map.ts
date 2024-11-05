import { resources } from "../../helpers/resources";  
import { Sprite } from "../sprite";
/*export class SpriteFontMap extends*/
//WIDTHS
const DEFAULT_WIDTH = 5;
const width = new Map();

//Add overrides
width.set("c", 4);
width.set("e", 5);
width.set("f", 4);
width.set("i", 2);
width.set("j", 4);
width.set("l", 3);
width.set("n", 4);
width.set("r", 4);
width.set("t", 3);
width.set("u", 4);
width.set("v", 4);
width.set("x", 4);
width.set("y", 4);
width.set("z", 4);

width.set("E", 4);
width.set("F", 4); 
width.set("M", 7);
width.set("W", 7);

width.set(" ", 3);
width.set("'", 1);
width.set("!", 1);

export const getCharacterWidth = (char: string): number => {
  return width.get(char) ?? DEFAULT_WIDTH;
}

export const calculateWords = ( params: {content: string, color: string}) => {
  return params.content.split(" ").map((word: string) => {
    let wordWidth = 0;
    const chars = word.split("").map((char: string) => {
      const charWidth = getCharacterWidth(char);
      wordWidth += charWidth;

      const objectId = 0;
      const position = undefined;
      const frame = getCharacterFrame(char);
      const resource = resources.images["font"+params.color];
      const hFrames = 13;
      const vFrames = 6;
      const scale = undefined;
      const frameSize = undefined;
      const name = undefined;
      const animations = undefined;

      return {
        width: charWidth,
        sprite: new Sprite(
          { objectId, resource, position, scale, frame, frameSize, hFrames, vFrames, animations, name }
        )
      }
    });

    return {
      wordWidth,
      chars
    }
  })
}
 
const frameMap = new Map();
[
  "abcdefghijklmnopqrstuvwxyz",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "0123456789 __",
  ".!-,?'"
].join("").split("").forEach((char, index) => {
  frameMap.set(char, index);
});

export const getCharacterFrame = (char: string): number => { 
  return frameMap.get(char) ?? 0;
}
