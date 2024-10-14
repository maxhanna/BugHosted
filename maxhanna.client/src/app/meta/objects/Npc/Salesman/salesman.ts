import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite"; 
import { DOWN } from "../../../helpers/grid-cells";
import { Animations } from "../../../helpers/animations";
import { resources } from "../../../helpers/resources";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { events } from "../../../helpers/events";
import { WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT } from "./salesman-animations";
import { Npc } from "../npc";
import { ShopMenu } from "../../shop-menu";
import { Level } from "../../Level/level";

export class Salesman extends Npc {
  directionIndex = 0;
  heroPosition: Vector2;
  entranceLevel: Level;

  constructor(params: { position: Vector2, heroPosition: Vector2, entranceLevel: Level }) {
    super({
      id: 0,
      position: params.position,
      type: "salesPerson", 
      body: new Sprite({
        resource:  resources.images["salesPerson"],
        position: new Vector2(-7, -20),
        frameSize: new Vector2(32, 32),
        hFrames: 4,
        vFrames: 4,
        animations: new Animations(
          { 
            walkLeft: new FrameIndexPattern(WALK_LEFT),
            walkRight: new FrameIndexPattern(WALK_RIGHT),
            standDown: new FrameIndexPattern(STAND_DOWN),
            standRight: new FrameIndexPattern(STAND_RIGHT),
            standLeft: new FrameIndexPattern(STAND_LEFT), 
          })
      })
    }) 
    this.name = "salesPerson";
    this.type = "salesPerson";
    this.id = -22274; 
    this.textPortraitFrame = 1;
    this.entranceLevel = params.entranceLevel;
    this.heroPosition = params.heroPosition;
    const shadow = new Sprite({
      resource: resources.images["shadow"],
      position: new Vector2(params.position.x - 16, params.position.y-16),
      scale: new Vector2(1.25, 1),
      frameSize: new Vector2(32, 32),
    });
    this.addChild(shadow); 
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
    events.on("SELECTED_ITEM", this, (selectedItem: string) => {
      console.log(selectedItem);
      if (selectedItem === "Shop") {
        events.emit("SHOP_OPENED", { heroPosition: this.heroPosition, entranceLevel: this.entranceLevel });
      }
    }); 
  }
  override getContent() { 
    return {
      portraitFrame: 0,
      string: ["Shop", "Repair", "Cancel"],
      canSelectItems: true,
      addsFlag: null
    }
  }
}
