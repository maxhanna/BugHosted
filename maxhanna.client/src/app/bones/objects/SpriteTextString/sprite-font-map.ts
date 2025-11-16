import { resources } from "../../helpers/resources";  
import { Sprite } from "../sprite";
/*export class SpriteFontMap extends*/
//WIDTHS
const DEFAULT_WIDTH = 5;
const width = new Map();
// Sprite-based cache (legacy) and new lightweight glyph canvas cache.
// We observed intermittent missing characters when sharing Sprite instances across multiple
// SpriteTextString objects. To retain memory benefits safely, we now cache a pre-rendered
// canvas for each (char+color) instead of sharing Sprite state. This avoids any mutable
// properties on Sprite influencing other draw calls while keeping allocation count low.
const spriteCache: Record<string, Sprite> = {}; // still available (fallback) but not primary
const glyphCanvasCache: Record<string, HTMLCanvasElement> = {};
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

      // Preferred: use cached glyph canvas
      const canvas = getGlyphCanvas(char, params.color, frame, hFrames, vFrames, resource);
      if (canvas) {
        return { width: charWidth, spriteCanvas: canvas } as any;
      }
      // Fallback if canvas not yet buildable (image not loaded): temporary sprite instance
      let sprite = getCachedSprite(char, params.color);
      if (!sprite) {
        sprite = new Sprite({ objectId, resource, position, scale, frame, frameSize, hFrames, vFrames, animations, name });
        spriteCache[`${char}_${params.color}`] = sprite;
      }
      return { width: charWidth, sprite } as any;
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
  ".!-,?':\""
].join("").split("").forEach((char, index) => {
  frameMap.set(char, index);
});

export const getCharacterFrame = (char: string): number => { 
  return frameMap.get(char) ?? 0;
}
function getCachedSprite(char: string, color: string): Sprite {
  const key = `${char}_${color}`;
  return spriteCache[key];
}

function getGlyphCanvas(char: string, color: string, frame: number, hFrames: number, vFrames: number, resource: { image: HTMLImageElement; isLoaded: boolean }) {
  if (!resource?.isLoaded) return undefined;
  const key = `${char}_${color}_glyph`;
  let canvas = glyphCanvasCache[key];
  if (canvas) return canvas;
  // Derive frame coordinates directly
  const frameX = (frame % hFrames) * 16; // assuming 16x16 font cells
  const frameY = Math.floor(frame / hFrames) * 16;
  canvas = document.createElement('canvas');
  canvas.width = 16; // could refine with actual width for tighter blits
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.drawImage(resource.image, frameX, frameY, 16, 16, 0, 0, 16, 16);
  glyphCanvasCache[key] = canvas;
  return canvas;
}