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

export class Salesman extends Npc {
  directionIndex = 0;

  constructor(x: number, y: number) {
    super({
      id: 0,
      position: new Vector2(x, y),
      type: "salesPerson", 
      body: new Sprite(
        0,
        resources.images["salesPerson"],
        new Vector2(-7, -20),
        new Vector2(1, 1),
        undefined,
        new Vector2(32, 32),
        4,
        4,
        new Animations(
          { 
            walkLeft: new FrameIndexPattern(WALK_LEFT),
            walkRight: new FrameIndexPattern(WALK_RIGHT),
            standDown: new FrameIndexPattern(STAND_DOWN),
            standRight: new FrameIndexPattern(STAND_RIGHT),
            standLeft: new FrameIndexPattern(STAND_LEFT), 
          })
      )
    }) 
    this.name = "salesPerson";
    this.type = "salesPerson";
    this.id = -22274; 
    this.textPortraitFrame = 1;
    const shadow = new Sprite(
      0,
      resources.images["shadow"],
      new Vector2(-16, -16),
      new Vector2(1.25, 1),
      undefined,
      new Vector2(32, 32),
      undefined,
      undefined,
      undefined
    );
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
        events.emit("SHOP_OPENED");
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
