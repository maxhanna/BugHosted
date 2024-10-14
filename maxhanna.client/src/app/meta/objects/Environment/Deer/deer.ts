import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite";
import { gridCells } from "../../../helpers/grid-cells";
import { Animations } from "../../../helpers/animations";
import { resources } from "../../../helpers/resources";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP, PICK_UP_DOWN } from "./deer-animations";
import { Npc } from "../../Npc/npc";

export class Deer extends Npc { 
  directionIndex = 0;
  soundIndex = 0;
  deerSounds = ["..."];

  constructor(x: number, y: number) {
    super({
      id: 0,
      position: new Vector2(x, y)
    })
   
    this.position = new Vector2(x, y);
    this.destinationPosition = this.position.duplicate();
    this.lastPosition = this.position.duplicate();
    this.name = "Deer"; 
    const shadow = new Sprite(
      0,
      resources.images["shadow"],
      new Vector2(-25, -16),
      new Vector2(2, 1),
      undefined,
      new Vector2(32, 32),
      undefined,
      undefined,
      undefined 
    );
    this.addChild(shadow);

    this.body = new Sprite(
      this.id,
      resources.images["deer"],
      new Vector2(-7, -20),
      new Vector2(1, 1),
      undefined,
      new Vector2(32, 32),
      5,
      5,
      new Animations(
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
    );
    this.addChild(this.body); 
    this.body.animations?.play("standDown");

    setInterval(() => {
      this.latestMessage = this.deerSounds[this.soundIndex];
      this.soundIndex = (this.soundIndex + 1) % this.deerSounds.length; // Cycle through the array

      setTimeout(() => {
        this.latestMessage = ""; // Clear message after 20 seconds
      }, 5000); // Wait for 5 seconds to clear the message
    }, 60000); // Repeat every 10 seconds
    setInterval(() => {
      // Current position (assuming this.position is a Vector2)
      const currentPosition = this.position;
      this.directionIndex++;
      if (this.directionIndex == 4) {
        this.directionIndex = 0;
      }
      if (this.directionIndex == 0) {
        this.destinationPosition = new Vector2(currentPosition.x + gridCells(5), currentPosition.y);
      }
      if (this.directionIndex == 1) {
        this.destinationPosition = new Vector2(currentPosition.x, currentPosition.y + gridCells(1));
      }
      if (this.directionIndex == 2) {
        this.destinationPosition = new Vector2(currentPosition.x - gridCells(5), currentPosition.y);
      }
      if (this.directionIndex == 3) {
        this.destinationPosition = new Vector2(currentPosition.x, currentPosition.y - gridCells(1));
      }

      // Update the destination position, assuming gridCells takes an x,y coordinate and returns a new position
    }, 65000); // Repeat every 5 seconds
  }
   
  override getContent() { 
       
    return {
      portraitFrame: 0,
      string: ["... a look of surprise dawns over the creature ..."],
      canSelectItems: false,
      addsFlag: null
    }
  }
 }
