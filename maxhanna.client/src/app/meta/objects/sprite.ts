import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { ColorSwap } from "../../../services/datacontracts/meta/color-swap";
import { Animations } from "../helpers/animations"; 
import { GameObject } from "./game-object";

export class Sprite extends GameObject {
  objectId: number;
  resource?: Resource; //Spritesheet
  frameSize: Vector2; //Size of a cropped image on spritesheet
  hFrames: number; //Where it is arranged horizontally on spritesheet
  vFrames: number; //Where it is arranged vertically on spritesheet
  frame: number; //Which frame we want to show
  frameMap: Map<number, Vector2>;
  scale: Vector2;
  animations?: Animations;
  name?: string;
  rotation = 0;
  flipX = false;
  flipY = false;
  recolorCache: Map<string, HTMLCanvasElement> = new Map();

  constructor(params: {
    objectId?: number, resource: Resource, position?: Vector2, scale?: Vector2, frame?: number, frameSize?: Vector2, hFrames?: number, vFrames?:
    number, animations?: Animations, name?: string, colorSwap?: ColorSwap
  }) {
    super({ position: params.position ?? new Vector2(0, 0)});
    this.objectId = params.objectId ?? 0;
    this.position = params.position ?? new Vector2(0, 0);
    this.frame = params.frame ?? 1;
    this.resource = params.resource;
    this.hFrames = params.hFrames ?? (this.frame > 1 ? this.frame + 1 : this.frame);
    this.vFrames = params.vFrames ?? 1;
    this.scale = params.scale ?? new Vector2(1,1); 
    this.frameSize = params.frameSize ?? new Vector2(16, 16);
    this.name = params.name;
    this.animations = params.animations;
    this.colorSwap = params.colorSwap;
    this.frameMap = new Map();
    this.buildFrameMap();
  }
   
  buildFrameMap() { 
    let frameCount = 0;
    for (let v = 0; v < this.vFrames; v++) {
      for (let h = 0; h < this.hFrames; h++) {
        this.frameMap.set(
          frameCount,
          new Vector2(this.frameSize.x * h, this.frameSize.y * v)
        )
        frameCount++; 
      }
    }
  }

  getRecolorCacheKey(originalColor: [number, number, number], replacementColor: [number, number, number], frame: number): string {
    // Create a unique cache key based on the original color, replacement color, and the frame number
    return `${originalColor.join(',')}-${replacementColor.join(',')}-frame-${frame}`;
  }


  override step(delta: number) {
    if (!this.animations) {
      return;
    } 
    this.animations.step(delta); 
    this.frame = this.animations.frame; 
  }


  override drawImage(ctx: CanvasRenderingContext2D, x: number, y: number) {
    if (!ctx || !this.resource?.isLoaded) {
      return;
    }

    // Retrieve the current frame from the frame map
    const frame = this.frameMap.get(this.frame); 

    const frameCoordX = frame?.x ?? 0;
    const frameCoordY = frame?.y ?? 0;
    const frameSizeX = this.frameSize.x;
    const frameSizeY = this.frameSize.y;
     
    if (this.colorSwap) {
      const cacheKey = this.getRecolorCacheKey([0, 160, 200], [0, 255, 0], this.frame);

      let cachedCanvas = this.recolorCache.get(cacheKey);

      if (!cachedCanvas) {
        // Create a new offscreen canvas for this frame
        cachedCanvas = document.createElement('canvas');
        cachedCanvas.width = frameSizeX;
        cachedCanvas.height = frameSizeY;
        const offscreenCtx = cachedCanvas.getContext('2d');

        // Draw the original sprite frame onto the offscreen canvas
        if (offscreenCtx) {
          offscreenCtx.drawImage(
            this.resource.image,
            frameCoordX, // Use the correct frame coordinates
            frameCoordY,
            frameSizeX,
            frameSizeY,
            0,
            0,
            frameSizeX,
            frameSizeY
          );

          // Get image data for recoloring
          const imageData = offscreenCtx.getImageData(0, 0, frameSizeX, frameSizeY);
          const data = imageData.data;

          // Replace the colors in the image data
          this.replaceColorWith(data, [0, 160, 200], [255, 0, 0]);

          // Put the modified image data back onto the offscreen canvas
          offscreenCtx.putImageData(imageData, 0, 0);

          // Cache the recolored version of the current frame
          this.recolorCache.set(cacheKey, cachedCanvas);
        }
      }

      // Save the canvas state before transformations
      ctx.save();

      // Translate to the desired rotation point (center of the image)
      const centerX = x + (frameSizeX * this.scale.x) / 2;
      const centerY = y + (frameSizeY * this.scale.y) / 2;
      ctx.translate(centerX, centerY);

      // Apply rotation and scale transformations
      ctx.rotate(this.rotation);
      const scaleX = this.flipX ? -this.scale.x : this.scale.x;
      const scaleY = this.flipY ? -this.scale.y : this.scale.y;
      ctx.scale(scaleX, scaleY);

      // Draw the cached recolored sprite for the current frame
      ctx.drawImage(cachedCanvas, -frameSizeX / 2, -frameSizeY / 2);

      // Restore the canvas state
      ctx.restore();
    }
    else {
      ctx.save();

      // Translate to the desired rotation point (center of the image)
      const centerX = x + (frameSizeX * this.scale.x) / 2;
      const centerY = y + (frameSizeY * this.scale.y) / 2;
      ctx.translate(centerX, centerY);

      // Rotate the canvas by the given rotation angle (in radians)
      ctx.rotate(this.rotation);
      const scaleX = this.flipX ? -this.scale.x : this.scale.x;
      const scaleY = this.flipY ? -this.scale.y : this.scale.y;

      ctx.scale(scaleX, scaleY);
      // Draw the image, adjusting for the translation and rotation
      ctx.drawImage(
        this.resource.image,
        frameCoordX,
        frameCoordY,
        frameSizeX,
        frameSizeY,
        -frameSizeX / 2, // Draw image relative to the new origin
        -frameSizeY / 2,
        frameSizeX * this.scale.x,
        frameSizeY * this.scale.y
      );

      // Restore the canvas to its previous state
      ctx.restore(); 
    } 
  }


  replaceColorWith(data: Uint8ClampedArray, original: [number, number, number], replacement: [number, number, number]) {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // If the pixel color matches the original color
      if (r === original[0] && g === original[1] && b === original[2]) {
        // Replace it with the new color
        data[i] = replacement[0];
        data[i + 1] = replacement[1];
        data[i + 2] = replacement[2];
      }
    }
  }
}

export interface Resource {
  image: HTMLImageElement;
  isLoaded: boolean;
}
