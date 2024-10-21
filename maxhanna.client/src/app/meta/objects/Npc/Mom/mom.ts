import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { Sprite } from "../../sprite";
import { DOWN } from "../../../helpers/grid-cells";
import { Animations } from "../../../helpers/animations";
import { resources } from "../../../helpers/resources";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { events } from "../../../helpers/events";
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP } from "./mom-animations";
import { GOT_WATCH, Scenario, TALKED_TO_MOM, TALKED_TO_MOM_ABOUT_DAD, TALKED_TO_MOM_ABOUT_WATCH } from "../../../helpers/story-flags";
import { Npc } from "../../Npc/npc";

export class Mom extends Npc {
  directionIndex = 0;

  constructor(x: number, y: number) {
    super({
      id: -1972,
      type: "mom",
      partners: [],
      position: new Vector2(x, y),
      body: new Sprite({
        objectId: -19173,
        resource: resources.images["mom"],
        position: new Vector2(-7, -20),
        frameSize: new Vector2(32, 32),
        hFrames: 4,
        vFrames: 4,
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
      
    this.name = "mom";  
    this.type = "mom";  
    const shadow = new Sprite({
      resource: resources.images["shadow"],
      position: new Vector2(-10, -30),
      scale: new Vector2(1.2, 1.2),
      frameSize: new Vector2(32, 32),
    });
    shadow.drawLayer = "FLOOR";
    this.addChild(shadow);  
    this.body?.animations?.play("standLeft");

    setInterval(() => {
      this.latestMessage = "*Quietly humming a tune*";
      setTimeout(() => {
        this.latestMessage = "";
      }, 2000);
    }, 15000);
    this.textPortraitFrame = 2;
    this.textContent = [
      {
        string: [`You finally saved enough for it with your allowance. Go and pick one out from the store next door.`],
        requires: [TALKED_TO_MOM_ABOUT_DAD],
      } as Scenario,
      {
        string: ["Your father still uses that old watch. But he decided to pass it down to you today! Thats right! Your very first meta-bot!"],
        requires: [GOT_WATCH],
        addsFlag: TALKED_TO_MOM_ABOUT_DAD,
      } as Scenario,
      {
        string: ["Go grab your fathers watch."],
        requires: [TALKED_TO_MOM_ABOUT_WATCH],
      } as Scenario,
      {
        string: ["We need you to run some errands... Can you grab your fathers watch thats on the counter my sweet little angel cakes?"],
        requires: [TALKED_TO_MOM],
        addsFlag: TALKED_TO_MOM_ABOUT_WATCH,
      } as Scenario,
      {
        string: [`Another beautiful day! Good morning sweetpea, your dads out repairing a bot that short circuited.`],
        addsFlag: TALKED_TO_MOM,
      } as Scenario
    ];
    console.log("mom created");
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
