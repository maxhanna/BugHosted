import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite"; 
import { DOWN, LEFT, RIGHT, UP } from "../../../helpers/grid-cells";
import { Animations } from "../../../helpers/animations";
import { resources } from "../../../helpers/resources";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { events } from "../../../helpers/events";
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP } from "./referee-animations";
import { Npc } from "../../Npc/npc";
import { l } from "@angular/core/weak_ref.d-Bp6cSy-X";

export class Referee extends Npc {
  directionIndex = 0;

  constructor(params: { position: Vector2, partners?: Npc[], moveUpDown?:number, moveLeftRight?: number, }) {
    super({
      id: Math.floor(Math.random() * (-9999 + 1000)) - 1000,
      position: params.position,
      type: "referee",
      name: "Mr. Referee",
      partners: params.partners ? params.partners : [],
      moveUpDown: params.moveUpDown,
      moveLeftRight: params.moveLeftRight,
      body: new Sprite({
        objectId: Math.floor(Math.random() * (-9999 + 1000)) - 1000,
        resource: resources.images["referee"],
        position: new Vector2(0, 0),
        frameSize: new Vector2(32, 32),
        hFrames: 4,
        vFrames: 4,
        offsetY: -10,
        offsetX: -8,
        name: "Mr. Referee",
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
    }) 
    this.type = "referee"; 
    this.textPortraitFrame = 1;
    const shadow = new Sprite({
      resource: resources.images["shadow"],
      position: new Vector2(0, 0),
      offsetY: -6,
      offsetX: -18,
      scale: new Vector2(1.25, 1),
      frameSize: new Vector2(32, 32),
    });
    this.addChild(shadow);
    this.body?.animations?.play("standDown"); 
  }

  override ready() {
    events.on("HERO_REQUESTS_ACTION", this, (params: { hero: any, objectAtPosition: any }) => {
      if (params.objectAtPosition.id === this.id) {
        this.facePlayer(params);
        if (params.hero.parent.name.toLowerCase().trim() == "undergroundlevel2") {
          const encounterBots = params.hero.parent.children.filter((x:any) => x.heroId < 0);
          if (encounterBots) {
            for (let x = 0; x < encounterBots.length; x++) {
              encounterBots[x].chasing = params.hero;
            }
          }
        } 
      }
    });
  }


  private facePlayer(params: { hero: any; objectAtPosition: any; }) {
    const oldKey = this.body?.animations?.activeKey;
    const oldFacingDirection = this.facingDirection;
    this.facingDirection = params.hero.facingDirection == DOWN ? UP : params.hero.facingDirection == LEFT ? RIGHT : params.hero.facingDirection == UP ? DOWN : LEFT;
    this.body?.animations?.play("stand" + this.facingDirection.charAt(0) + this.facingDirection.substring(1, this.facingDirection.length).toLowerCase());
    console.log("animation : " + this.body?.animations?.activeKey);
    setTimeout(() => {
      if (oldKey) {
        this.body?.animations?.play(oldKey);
      }
      this.facingDirection = oldFacingDirection;
    }, 20000);
  }
}
