import { Vector2 } from "../../../services/datacontracts/bones/vector2";
import { ColorSwap } from "../../../services/datacontracts/bones/color-swap";
import { Animations } from "../helpers/animations";
import { BASE, FLOOR, GROUND, GameObject, HUD } from "./game-object";
import { Resource } from "../helpers/resources";

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
  rotation: number;
  flipX?: boolean;
  flipY?: boolean;
  offsetX: number;
  offsetY: number; 
  precomputedCanvases: Map<string, HTMLCanvasElement> = new Map(); // Cache for precomputed frames
  recalculatePrecomputedCanvases = true;

  constructor(params: {
    objectId?: number,
    resource: Resource,
    position?: Vector2,
    scale?: Vector2,
    frame?: number,
    frameSize?: Vector2,
    hFrames?: number,
    vFrames?: number,
    animations?: Animations,
    name?: string,
    colorSwap?: ColorSwap,
    flipX?: boolean,
    flipY?: boolean,
    rotation?: number,
    isSolid?: boolean,
    offsetX?: number,
    offsetY?: number,
    drawLayer?: typeof BASE | typeof GROUND | typeof FLOOR | typeof HUD,
    preventDraw?: boolean,
    preventDrawName?: boolean,
    forceDrawName?: boolean,
  }) {
    super({
      position: params.position ?? new Vector2(0, 0),
      forceDrawName: params.forceDrawName ?? false,
      preventDraw: params.preventDraw ?? false,
      preventDrawName: params.preventDrawName ?? true,
      isSolid: !!params.isSolid,
      name: params.name,
      colorSwap: params.colorSwap, 
    });
    this.objectId = params.objectId ?? Math.floor(Math.random() * (9999)) * -1;
    this.position = params.position ?? new Vector2(0, 0);
    this.drawLayer = params.drawLayer;
    this.frame = params.frame ?? 1;
    this.resource = params.resource;
    this.hFrames = params.hFrames ?? this.frame;
    this.vFrames = params.vFrames ?? 1;
    this.scale = params.scale ?? new Vector2(1, 1);
    this.frameSize = params.frameSize ?? new Vector2(16, 16); 
    this.animations = params.animations; 
    this.frameMap = new Map(); 
    this.flipX = params.flipX;
    this.flipY = params.flipY; 
    this.rotation = params.rotation ?? 0;
    this.offsetX = params.offsetX ?? 0;
    this.offsetY = params.offsetY ?? 0;
    this.buildFrameMap(); 
     

    if (this.colorSwap) {
      new Promise(resolve => {
        const checkLoaded = () => {
          if (this.resource && this.resource.isLoaded) {
            resolve(null);  // Resolves the Promise without an argument.
          } else {
            setTimeout(checkLoaded, 1);
          }
        };
        checkLoaded();
      }).then(() => {
        if (this.colorSwap)
        this.precomputeRecoloredFrames(this.colorSwap.originalRGB, this.colorSwap.replacementRGB);
      });
    } 
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
    x = x + this.offsetX;
    y = y + this.offsetY;
    // Retrieve the current frame from the frame map
    const frame = this.frameMap.get(this.frame);
    const frameCoordX = frame?.x ?? 0;
    const frameCoordY = frame?.y ?? 0; 
    if (!this.drawCachedColorSwappedCanvas(ctx, x , y)) {
      ctx.save();

      // Translate to the desired rotation point (center of the image)
      const centerX = x + (this.frameSize.x * this.scale.x) / 2;
      const centerY = y + (this.frameSize.y * this.scale.y) / 2;
      ctx.translate(centerX, centerY);

      // Rotate the canvas by the given rotation angle
      ctx.rotate(this.rotation);

      // Apply scaling
      const scaleX = this.flipX ? -this.scale.x : this.scale.x;
      const scaleY = this.flipY ? -this.scale.y : this.scale.y;
      ctx.scale(scaleX, scaleY);

      // Draw the image, adjusting for the translation and rotation
      ctx.drawImage(
        this.resource.image,
        frameCoordX,
        frameCoordY,
        this.frameSize.x,
        this.frameSize.y,
        -this.frameSize.x / 2, // Draw image relative to the new origin
        -this.frameSize.y / 2,
        this.frameSize.x * this.scale.x,
        this.frameSize.y * this.scale.y
      );

      ctx.restore();
    }
  }


  private precomputeRecoloredFrames(originalColor: number[], replacementColor: number[]) {
    if (this.recalculatePrecomputedCanvases) {
      this.precomputedCanvases.clear();
      this.recalculatePrecomputedCanvases = false;
    } else return;

    for (let frame = 0; frame < this.hFrames * this.vFrames; frame++) { // Adjusted loop condition
      const frameCoord = this.frameMap.get(frame); 
      if (frameCoord) {
        const canvasKey = `${originalColor.join(',')}-${replacementColor.join(',')}-frame-${frame}`;
        let cachedCanvas = this.precomputedCanvases.get(canvasKey);
        if (!cachedCanvas) { 
          cachedCanvas = document.createElement('canvas');
          cachedCanvas.width = this.frameSize.x * this.scale.x; // Use scaled width
          cachedCanvas.height = this.frameSize.y * this.scale.y; // Use scaled height
          const offscreenCtx = cachedCanvas.getContext('2d');

          if (offscreenCtx && this.resource) {
            // Save the context
            offscreenCtx.save();

            // Apply scale and flip
            const scaleX = this.flipX ? -1 : 1;
            const scaleY = this.flipY ? -1 : 1;

            offscreenCtx.scale(scaleX, scaleY);
            // Adjust the position to account for scaling and flipping
            const drawX = this.flipX ? -this.frameSize.x : 0;
            const drawY = this.flipY ? -this.frameSize.y : 0;

            // Draw the original sprite frame onto the offscreen canvas
            offscreenCtx.drawImage(
              this.resource.image,
              frameCoord.x,
              frameCoord.y,
              this.frameSize.x,
              this.frameSize.y,
              drawX,
              drawY,
              this.frameSize.x * this.scale.x,
              this.frameSize.y * this.scale.y
            );

            // Restore the context
            offscreenCtx.restore();

            // Get image data for recoloring
            const imageData = offscreenCtx.getImageData(0, 0, cachedCanvas.width, cachedCanvas.height);
            const data = imageData.data;

            // Replace the colors in the image data
            this.replaceColorWith(data, originalColor, replacementColor);

            // Put the modified image data back onto the offscreen canvas
            offscreenCtx.putImageData(imageData, 0, 0);

            // Cache the recolored version of the current frame
            this.precomputedCanvases.set(canvasKey, cachedCanvas);
          }
        }
      }
    }
  }


  private drawCachedColorSwappedCanvas(ctx: CanvasRenderingContext2D, x: number, y: number) {
    if (!this.colorSwap) {
      return false;
    }
    if (this.scale.x != 1 || this.recalculatePrecomputedCanvases) {
      this.precomputeRecoloredFrames(this.colorSwap.originalRGB, this.colorSwap.replacementRGB);
    }

    const { originalRGB, replacementRGB } = this.colorSwap;
    const key = `${originalRGB.join(',')}-${replacementRGB.join(',')}-frame-`;
    const primaryKey = `${key}${this.frame}`;
    const fallbackKey = `${key}0`;

    // Attempt to get the primary cached canvas\

    let cachedCanvas = this.precomputedCanvases.get(primaryKey) || this.precomputedCanvases.get(fallbackKey);

    if (cachedCanvas) { 
      ctx.drawImage(cachedCanvas, x, y);
      return true;
    }

    return false;
  }

  private replaceColorWith(data: Uint8ClampedArray, original: number[], replacement: number[]) {
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
