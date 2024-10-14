import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { MetaHero } from "../../../../services/datacontracts/meta/meta-hero";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { Input } from "../../helpers/input";
import { DOWN, LEFT, RIGHT, UP, gridCells, isSpaceFree } from "../../helpers/grid-cells";
import { Animations } from "../../helpers/animations";
import { moveTowards } from "../../helpers/move-towards";
import { resources } from "../../helpers/resources";
import { FrameIndexPattern } from "../../helpers/frame-index-pattern";
import { events } from "../../helpers/events"; 
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP, PICK_UP_DOWN } from "./bot-animations";
export class Bot extends GameObject {
  facingDirection: string;
  destinationPosition: Vector2;
  body: Sprite;
  id: number;
  name: string;
  isDead: boolean;
  lastPosition: Vector2;
  itemPickupTime: number;
  lastStandAnimationTime = 0;
  itemPickupShell: any;
  isLocked = false;
  latestMessage = "";
  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y)
    })
    console.log("New Bot at position : " + x + '; ' + y);
    this.facingDirection = DOWN;
    this.position = new Vector2(x, y);
    this.destinationPosition = this.position.duplicate();
    this.lastPosition = this.position.duplicate();
    this.name = "Anon";
    this.id = 0;
    this.itemPickupTime = 0;
    this.isDead = false;
    const shadow = new Sprite({
      resource: resources.images["shadow"],
      position: new Vector2(-16.5, -33),
      scale: new Vector2(1.5, 1.5),
      frameSize: new Vector2(32, 32),
    });
    this.addChild(shadow);

    this.body = new Sprite({
      objectId: this.id,
      resource: resources.images["botFrame"],
      position: new Vector2(-8, -20),
      frameSize: new Vector2(32, 32)
    });
    this.addChild(this.body);  
  }

  override step(delta: number, root: any) {
    if (this.isLocked) return;
     
    if (!this.destinationPosition.matches(this.position)) { 
      const distance = moveTowards(this, this.destinationPosition, 1);
      const hasArrived = (distance ?? 0) <= 1; 
      if (hasArrived) {
        this.moveBot();
      }
      this.tryEmitPosition();
    } 
  }

  updateAnimation() {
    setTimeout(() => {
      const currentTime = new Date().getTime();
      if (currentTime - this.lastStandAnimationTime >= 1000) { // Throttle by 1 second
        if (this.destinationPosition.matches(this.position)) {
          this.body.animations?.play(
            "stand" + this.facingDirection.charAt(0) +
            this.facingDirection.substring(1, this.facingDirection.length).toLowerCase()
          );
        }
        this.lastStandAnimationTime = currentTime; // Update the last time it was run
      }
    }, 1000);
  }

  tryEmitPosition() {
    if (this.lastPosition.x === this.position.x && this.lastPosition.y === this.position.y) {
      return;
    } 
    this.lastPosition = this.position.duplicate();
  }
   
  moveBot() {
    console.log("moveBot");
    this.position = this.position.duplicate();
    this.destinationPosition = this.destinationPosition.duplicate();

    if (this.destinationPosition.matches(this.position)) {
      this.body.animations?.play("stand" + this.facingDirection.charAt(0) + this.facingDirection.substring(1, this.facingDirection.length).toLowerCase());
      return;
    } 
    const gridSize = gridCells(1);
    const destPos = this.destinationPosition;

    if (destPos) {
      // Calculate the difference between destination and current position
      const deltaX = destPos.x - this.position.x;
      const deltaY = destPos.y - this.position.y; 
      if (Math.abs(deltaX) > Math.abs(deltaY)) { 
        if (deltaX > 0) { 
          this.facingDirection = RIGHT;
          this.body.animations?.play("walkRight"); 
        } else if (deltaX < 0) { 
          this.facingDirection = LEFT;
          this.body.animations?.play("walkLeft"); 
        }
      } else { 
        if (deltaY > 0) { 
          this.facingDirection = DOWN;
          this.body.animations?.play("walkDown"); 
        } else if (deltaY < 0) { 
          this.facingDirection = UP;
          this.body.animations?.play("walkUp"); 
        }
      }
      this.updateAnimation();

      this.position = destPos.duplicate(); 
    }
  }   
 }
