import { Vector2 } from "../../../services/datacontracts/meta/vector2"; 
import { GameObject } from "./game-object";
import { DOWN, LEFT, RIGHT, UP } from "../helpers/grid-cells";
import { ColorSwap } from "../../../services/datacontracts/meta/color-swap";
import { Sprite } from "./sprite";
import { Mask } from "./Wardrobe/mask";

export class Character extends GameObject {
  id: number;
  name: string;
  facingDirection: string = DOWN;
  destinationPosition: Vector2 = new Vector2(1, 1);
  lastPosition: Vector2 = new Vector2(1, 1);
  body?: Sprite;
  isUserControlled = false;
  slopeType: undefined | typeof UP | typeof DOWN;
  slopeDirection: undefined | typeof UP | typeof DOWN | typeof LEFT | typeof RIGHT;
  ogScale = new Vector2(1, 1);
  endScale = new Vector2(1, 1);
  steppedUpOrDown = false;
  slopeIncrements = 0.05;
  lastStandAnimationTime = 0;
  slopeStepHeight?: Vector2;
  speed: number = 1;
  scale: Vector2 = new Vector2(1, 1);
  latestMessage = "";
  mask?: Mask = undefined 

  constructor(params: {
    id: number,
    name: string,
    body?: Sprite,
    position?: Vector2,
    colorSwap?: ColorSwap,

  }) {
    super({ position: params.position ?? new Vector2(0, 0), colorSwap: params.colorSwap });
    this.id = params.id;
    this.name = params.name;
    this.body = params.body;
    if (this.body) {
      this.initializeBody();
    }
  }

  initializeBody(redraw?: boolean) {
    let offsetY;
    if (this.scale.y < 0.75) {
      offsetY = 7;
    } else if (this.scale.y < 0.8) {
      offsetY = 5;
    } else if (this.scale.y < 0.9) {
      offsetY = 5;
    } else if (this.scale.y < 0.95) {
      offsetY = 3;
    } else {
      offsetY = 0;
    } 
    if (this.body) {
      this.body.scale = this.scale; 
      this.body.position.y = offsetY;
      this.body.offsetX = offsetY / 2;
    
      console.log("adding child body", this.scale);
      this.body.destroy();
      this.addChild(this.body);
      
      //let animation = this.body?.animations?.activeKey;
      //tmpBody.animations?.play(animation ?? "standDown");

      if (this.mask) {
        if (redraw) {
          if (this.facingDirection == UP) { 
          } else if (this.facingDirection == DOWN) {
            this.mask.frame = 0;
          } else if (this.facingDirection == LEFT) {
            this.mask.frame = 1;
          } else if (this.facingDirection == RIGHT) {
            this.mask.frame = 2;
          }
        }
        this.mask.scale = this.scale;
        this.mask.position = this.body.position.duplicate();
        this.mask.position.y += offsetY;
        this.mask.offsetX = offsetY / 2;
        this.addChild(this.mask);
      }
    }
     
  }
}

export interface Resource {
  image: HTMLImageElement;
  isLoaded: boolean;
}
