import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite";
import { DOWN, gridCells } from "../../../helpers/grid-cells";
import { Animations } from "../../../helpers/animations";
import { resources } from "../../../helpers/resources";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP, PICK_UP_DOWN } from "./chicken-animations";
import { Npc } from "../../Npc/npc";
import { Scenario } from "../../../helpers/story-flags";

export class Chicken extends Npc {  
  directionIndex = Math.floor(Math.random() * 4);
  chickenSounds = ["Cluck cluck...", "Bawk bawk...", "Buk buk buk...", "Squawk..."];
  soundIndex = Math.max(0, Math.floor(Math.random() * this.chickenSounds.length));
  randomMovementInterval = Math.max(2000, Math.floor(Math.random() * 15000));
  constructor(x: number, y: number) {
    super({
      id: 0,
      position: new Vector2(x, y)
    })
   
    this.facingDirection = DOWN;
    this.position = new Vector2(x, y);
    this.destinationPosition = this.position.duplicate();
    this.lastPosition = this.position.duplicate();
    this.name = "Chicken";
    this.id = 0; 
    const shadow = new Sprite({
      resource: resources.images["shadow"],
      position: new Vector2(-9, -14), 
      frameSize: new Vector2(32, 32),
    });
    this.addChild(shadow);

    this.body = new Sprite({
      objectId: this.id,
      resource: resources.images["chicken"],
      position: new Vector2(0, 0),
      frameSize: new Vector2(15, 15),
      hFrames: 4,
      vFrames: 8,
      animations: new Animations(
        {
          walkDown: new FrameIndexPattern(WALK_DOWN),
          walkUp: new FrameIndexPattern(WALK_UP),
          walkLeft: new FrameIndexPattern(WALK_LEFT),
          walkRight: new FrameIndexPattern(WALK_RIGHT),
          standDown: new FrameIndexPattern(STAND_DOWN),
          standRight: new FrameIndexPattern(STAND_RIGHT),
          standLeft: new FrameIndexPattern(STAND_LEFT),
          standUp: new FrameIndexPattern(STAND_UP),
          pickupDown: new FrameIndexPattern(PICK_UP_DOWN),
        })
    });
    this.addChild(this.body); 
    this.body.animations?.play("standDown");

    setInterval(() => {
      this.latestMessage = this.chickenSounds[this.soundIndex];
      this.soundIndex = (this.soundIndex + 1) % this.chickenSounds.length; // Cycle through the array

      setTimeout(() => {
        this.latestMessage = ""; // Clear message after 20 seconds
      }, 5000); // Wait for 5 seconds to clear the message
    }, Math.max(10000, Math.floor(Math.random() * 25000))); // Repeat every 10 seconds
    setInterval(() => {
      this.randomMovementInterval = Math.max(2000, Math.floor(Math.random() * 25000));
      const currentPosition = this.position;
      this.directionIndex++;
      if (this.directionIndex == 4) {
        this.directionIndex = 0;
      }
      if (this.directionIndex == 0) {
        this.destinationPosition = new Vector2(currentPosition.x + gridCells(2), currentPosition.y);
      }
      if (this.directionIndex == 1) {
        this.destinationPosition = new Vector2(currentPosition.x, currentPosition.y + gridCells(1));
      }
      if (this.directionIndex == 2) {
        this.destinationPosition = new Vector2(currentPosition.x - gridCells(2), currentPosition.y);
      }
      if (this.directionIndex == 3) {
        this.destinationPosition = new Vector2(currentPosition.x, currentPosition.y - gridCells(1));
      }

      // Update the destination position, assuming gridCells takes an x,y coordinate and returns a new position
    }, this.randomMovementInterval);
  }
   
  override getContent() {  
    return {
      portraitFrame: 0,
      string: ["Bkaaaaaw"],
      canSelectItems: false,
      addsFlag: undefined,
    } as Scenario;
  }
 }
