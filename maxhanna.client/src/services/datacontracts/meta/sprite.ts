import { Vector2 } from "./vector2";

export class Sprite {
  objectId: number;
  resource?: Resource; //Spritesheet
  frameSize: Vector2; //Size of a cropped image on spritesheet
  hFrames: number; //Where it is arranged horizontally on spritesheet
  vFrames: number; //Where it is arranged vertically on spritesheet
  frame: number; //Which frame we want to show
  frameMap: Map<number, Vector2>;
  scale: number;
  position: Vector2;

  constructor(objectId: number, resource: Resource, position?: Vector2, scale?: number, frame?: number, frameSize?: Vector2, hFrames?: number, vFrames?: number) {
    this.objectId = objectId;
    this.position = position ?? new Vector2(0, 0);
    this.frame = frame ?? 1;
    this.resource = resource;
    this.hFrames = hFrames ?? 1;
    this.vFrames = vFrames ?? 1;
    this.scale = scale ?? 1;
    this.frameSize = frameSize ?? new Vector2(16,16);
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

  drawImage(ctx: CanvasRenderingContext2D, x: number, y: number) {
    if (!this.resource?.isLoaded) {
      return;
    }

    let frameCoordX = 0;
    let frameCoordY = 0;
    const frame = this.frameMap.get(this.frame);
    if (frame) {
      frameCoordX = frame.x;
      frameCoordY = frame.y;
    }

    const frameSizeX = this.frameSize.x;
    const frameSizeY = this.frameSize.y;
    ctx.drawImage(
      this.resource.image,
      frameCoordX,
      frameCoordY,
      frameSizeX,
      frameSizeY,
      x,
      y,
      frameSizeX * this.scale,
      frameSizeY * this.scale
    );
  }
}

export interface Resource {
  image: HTMLImageElement;
  isLoaded: boolean;
}