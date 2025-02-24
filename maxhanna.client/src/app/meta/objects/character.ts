import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { GameObject } from "./game-object";
import { DOWN, LEFT, RIGHT, UP } from "../helpers/grid-cells";
import { ColorSwap } from "../../../services/datacontracts/meta/color-swap";
import { Sprite } from "./sprite";
import { Mask } from "./Wardrobe/mask";
import { isObjectNeerby, moveTowards, tryMove } from "../helpers/move-towards";
import { Input } from "../helpers/input";
import { events } from "../helpers/events";

export class Character extends GameObject {
  id: number;
  facingDirection: string = DOWN;
  destinationPosition: Vector2 = new Vector2(1, 1);
  lastPosition: Vector2 = new Vector2(1, 1);
  body?: Sprite;
  isUserControlled? = false;
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
  distanceLeftToTravel? = 0; 
  itemPickupTime: number = 0;
  itemPickupShell: any;
  isLocked = false;
  constructor(params: {
    id: number,
    name: string,
    body?: Sprite,
    position?: Vector2,
    colorSwap?: ColorSwap,
    isUserControlled?: boolean,
    mask?: Mask,
  }) {
    super({ position: params.position ?? new Vector2(0, 0), colorSwap: params.colorSwap });
    this.id = params.id;
    this.name = params.name;
    this.body = params.body;
    this.isUserControlled = params.isUserControlled ?? false;
    this.mask = params.mask;
    if (this.body) {
      this.initializeBody();
    }
    this.body?.animations?.play("standDown");
  }
  override destroy() {
    this.destroyBody();
    super.destroy();
  }

  destroyBody() {
    this.body?.destroy();
    this.mask?.destroy();
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
      this.destroyBody();
      this.body.scale = this.scale;
      this.body.position.y = offsetY;
      this.body.offsetX = offsetY / 2;
      if (this.name == "Bot") {
        console.log("adding child body", this.scale, this.body.animations?.activeKey);
      }
      this.addChild(this.body);

      let animation = this.body?.animations?.activeKey;
      this.body?.animations?.play(animation ?? "standDown");

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
  override step(delta: number, root: any) {
    const input = root.input as Input;
    if (this.isLocked) return;

    if (this.itemPickupTime > 0) {
      this.workOnItemPickup(delta);
      return;
    } 
    if (input?.getActionJustPressed("Space") && this.isUserControlled) {
      //look for an object at the next space (according to where the hero is facing)
      const objectAtPosition = isObjectNeerby(this);

      if (objectAtPosition) {
        // console.log(objectAtPosition);
        events.emit("HERO_REQUESTS_ACTION", objectAtPosition);
      }
    }  
    this.distanceLeftToTravel = moveTowards(this, this.destinationPosition, this.speed);
    const hasArrived = (this.distanceLeftToTravel ?? 0) <= 1;
    if (hasArrived) {
      tryMove(this, root);
    }
    this.tryEmitPosition();
    this.recalculateMaskPositioning();
  }

  tryEmitPosition() {
    if (this.lastPosition.x === this.position.x && this.lastPosition.y === this.position.y) {
      return;
    }
    events.emit("HERO_POSITION", this);
    this.lastPosition = this.position.duplicate();
  }

  private recalculateMaskPositioning() {
    if (!this.mask || !this.body) return;
    this.mask.offsetY = 0;
    if (this.body.frame >= 12 && this.body.frame < 16) {
      this.mask.preventDraw = true;
    } else {
      this.mask.preventDraw = false;

      switch (this.body.frame) {
        case 5:
        case 7:
          this.mask.offsetY = 2;
          break;

        case 8:
          // Set frame 1 and keep offsetY at 0 for frame 8
          this.mask.frame = 1;
          break;

        case 9:
          // Set frame 1 with an adjusted offsetY for frame 9
          this.mask.frame = 1;
          this.mask.offsetY = -2;
          break;

        case 10:
          this.mask.frame = 2;
          break;

        case 11:
          // Set frame 2 for frames 10 and 11
          this.mask.frame = 2;
          this.mask.offsetY = -2;
          break;

        default:
          // Default to frame 0 for any other cases
          this.mask.frame = 0;
          break;
      }
    } 
  }
  workOnItemPickup(delta: number) {
    console.log("workOnItemPickup activated", delta);
    this.itemPickupTime -= delta;
    if (this.body?.animations?.activeKey != "pickupDown") {
      this.body?.animations?.play("pickupDown");
      console.log("set pickup down animation");
    }
    if (this.itemPickupTime <= 0) {
      console.log("destroyed itemShell");
      this.itemPickupShell.destroy();
    }
  }
}

export interface Resource {
  image: HTMLImageElement;
  isLoaded: boolean;
}
