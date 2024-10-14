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
      position: new Vector2(x, y),
      body: new Sprite(
        -1973,
        resources.images["mom"],
        new Vector2(-7, -20),
        new Vector2(1, 1),
        undefined,
        new Vector2(32, 32),
        4,
        4,
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
          })
      )
    })
      
    this.name = "Mom";  
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
        string: [`Another beautiful day!... Oh, good morning sweet pee, your dads bot short circuited while trying to water the plants this morning.`],
        addsFlag: TALKED_TO_MOM,
      } as Scenario
    ]
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
