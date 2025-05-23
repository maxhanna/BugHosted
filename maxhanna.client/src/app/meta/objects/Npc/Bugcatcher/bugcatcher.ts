import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { Sprite } from "../../sprite";
import { DOWN } from "../../../helpers/grid-cells";
import { Animations } from "../../../helpers/animations";
import { resources } from "../../../helpers/resources";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { events } from "../../../helpers/events";
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP } from "./bugcatcher-animations";
import { GOT_WATCH, Scenario, TALKED_TO_MOM, TALKED_TO_MOM_ABOUT_DAD, TALKED_TO_MOM_ABOUT_WATCH } from "../../../helpers/story-flags";
import { Npc } from "../../Npc/npc";

export class Bugcatcher extends Npc {
  directionIndex = 0;

  constructor(params: {
    position: Vector2,
    moveUpDown?: number,
    moveLeftRight?: number,
    textConfig?: { content?: Scenario[], portraitFrame?: number },
  }) {
    super({
      id: Math.floor(Math.random() * (-9999 + 1000)) - 1000,
      type: "bugcatcher",
      name: "Bug Catcher",
      partners: [],
      position: params.position,
      moveUpDown: params.moveUpDown,
      moveLeftRight: params.moveLeftRight,
      textConfig: params.textConfig,
      body: new Sprite({
        objectId: Math.floor(Math.random() * (-9999 + 1000)) - 1000,
        resource: resources.images["bugcatcher"],
        position: new Vector2(0, 0),
        frameSize: new Vector2(32, 32),
        hFrames: 4,
        vFrames: 4,
        offsetY: -10,
        offsetX: -8,
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
      }), 
    });
        
    const shadow = new Sprite({
      resource: resources.images["shadow"],
      position: new Vector2((this.body?.position.x ?? 0) - 16, -20),
      scale: new Vector2(1.2, 1.2),
      frameSize: new Vector2(32, 32),
    });
    shadow.drawLayer = "FLOOR";
    this.addChild(shadow);   

    setInterval(() => {
      this.latestMessage = "*Creeping*";
      setTimeout(() => {
        this.latestMessage = "";
      }, 2000);
    }, Math.max(20000, Math.floor(Math.random() * 25000)));  
  }

  override ready() {
    events.on("HERO_REQUESTS_ACTION", this, (params: { hero: any, objectAtPosition: any }) => {
      if (params.objectAtPosition.id === this.id) {
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
