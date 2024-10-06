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
  scale: Vector2; 
  animations?: Animations;
  name?: string;
  rotation = 0;

  constructor(objectId: number, resource: Resource, position?: Vector2, scale?: Vector2, frame?: number, frameSize?: Vector2, hFrames?: number, vFrames?: number, animations?: Animations, name?: string ) {
    super({ position: position ?? new Vector2(0, 0)});
    this.objectId = objectId;
    this.position = position ?? new Vector2(0, 0);
    this.frame = frame ?? 1;
    this.resource = resource;
    this.hFrames = hFrames ?? 1;
    this.vFrames = vFrames ?? 1;
    this.scale = scale ?? new Vector2(1,1); 
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

    // Save the current state of the canvas
    ctx.save();

    // Translate to the desired rotation point (center of the image)
    const centerX = x + (frameSizeX * this.scale.x) / 2;
    const centerY = y + (frameSizeY * this.scale.y) / 2;
    ctx.translate(centerX, centerY);

    // Rotate the canvas by the given rotation angle (in radians)
    ctx.rotate(this.rotation);

    // Draw the image, adjusting for the translation and rotation
    ctx.drawImage(
      this.resource.image,
      frameCoordX,
      frameCoordY,
      frameSizeX,
      frameSizeY,
      -frameSizeX * this.scale.x / 2, // Draw image relative to the new origin
      -frameSizeY * this.scale.y / 2,
      frameSizeX * this.scale.x,
      frameSizeY * this.scale.y
    );

    // Restore the canvas to its previous state
    ctx.restore(); 
  }
}

export interface Resource {
  image: HTMLImageElement;
  isLoaded: boolean;
}
