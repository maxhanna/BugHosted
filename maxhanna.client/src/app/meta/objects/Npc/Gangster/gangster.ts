import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { Sprite } from "../../sprite";
import { DOWN } from "../../../helpers/grid-cells";
import { Animations } from "../../../helpers/animations";
import { resources } from "../../../helpers/resources";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { events } from "../../../helpers/events";
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP } from "./gangster-animations";
import { GOT_WATCH, Scenario, TALKED_TO_MOM, TALKED_TO_MOM_ABOUT_DAD, TALKED_TO_MOM_ABOUT_WATCH } from "../../../helpers/story-flags";
import { Npc } from "../../Npc/npc";

export class Gangster extends Npc {
  directionIndex = 0;

  constructor(x: number, y: number) {
    super({
      id: Math.floor(Math.random() * (-9999 + 1000)) - 1000,
      type: "gangster", 
      partners: [],
      position: new Vector2(x, y),
      body: new Sprite({
        objectId: Math.floor(Math.random() * (-9999 + 1000)) - 1000,
        resource: resources.images["gangster"],
        position: new Vector2(-7, -20),
        frameSize: new Vector2(32, 31),
        hFrames: 4,
        vFrames: 2,
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
          })
      })
    });
    this.isSolid = true;

    const shadow = new Sprite({
      resource: resources.images["shadow"],
      position: new Vector2(this.body.position.x - 9, -30),
      scale: new Vector2(1.2, 1.2),
      frameSize: new Vector2(32, 32),
    });
    shadow.drawLayer = "FLOOR";
    this.addChild(shadow);   

    setInterval(() => {
      this.latestMessage = "*Glare*";
      setTimeout(() => {
        this.latestMessage = "";
      }, 2000);
    }, 15000); 
    this.textContent = [
      {
        string: [`Are you here alone?`],
      
      } as Scenario, 
    ]; 
  }

  override ready() {
    events.on("HERO_REQUESTS_ACTION", this, (objectAtPosition: any) => {
      if (objectAtPosition.id === this.id) {
        const oldKey = this.body?.animations?.activeKey;
        const oldFacingDirection = this.facingDirection;
        this.body?.animations?.play("standDown");
        this.facingDirection = DOWN;
        setTimeout(() => {
          if (oldKey) {
            this.body?.animations?.play(oldKey);
          }
          this.facingDirection = oldFacingDirection;
        }, 20000);
      }
    });
  }

}