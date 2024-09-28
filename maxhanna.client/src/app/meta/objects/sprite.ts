import { Vector2 } from "../../../services/datacontracts/meta/vector2";
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
  scale: number;
  animations?: Animations;
  name?: string;

  constructor( objectId: number, resource: Resource, position?: Vector2, scale?: number, frame?: number, frameSize?: Vector2, hFrames?: number, vFrames?: number, animations?: Animations, name?: string ) {
    super({ position: position ?? new Vector2(0, 0)});
    this.objectId = objectId;
    this.position = position ?? new Vector2(0, 0);
    this.frame = frame ?? 1;
    this.resource = resource;
    this.hFrames = hFrames ?? 1;
    this.vFrames = vFrames ?? 1;
    this.scale = scale ?? 1;
    this.frameSize = frameSize ?? new Vector2(16, 16);
    this.name = name;
    this.animations = animations;
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
