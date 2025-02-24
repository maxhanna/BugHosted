import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite"; 
import { DOWN } from "../../../helpers/grid-cells";
import { Animations } from "../../../helpers/animations";
import { resources } from "../../../helpers/resources";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { events } from "../../../helpers/events";
import { WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT } from "./salesman-animations";
import { Npc } from "../npc";
import { ShopMenu } from "../../Menu/shop-menu";
import { Level } from "../../Level/level";
import { GOT_FIRST_METABOT, GOT_WATCH, Scenario, TALKED_TO_BRUSH_SHOP_OWNER1, storyFlags } from "../../../helpers/story-flags";
import { InventoryItem } from "../../InventoryItem/inventory-item";

export class Salesman extends Npc {
  directionIndex = 0;
  heroPosition: Vector2;
  entranceLevel: Level;
  items?: InventoryItem[];
  constructor(params: { position: Vector2, heroPosition: Vector2, entranceLevel: Level, items?: InventoryItem[], skin?: string, preventDraw?: boolean }) {
    super({
      id: Math.floor(Math.random() * (-9999 + 1000)) - 1000,
      position: params.position,
      type: params.skin ?? "salesPerson",
      preventDraw: params.preventDraw,
      body: new Sprite({
        objectId: Math.floor(Math.random() * (-9999 + 1000)) - 1000,
        resource: resources.images[params.skin ?? "salesPerson"],
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
    this.name = "Sales Person";  
    this.textPortraitFrame = 3;
    this.entranceLevel = params.entranceLevel;
    this.heroPosition = params.heroPosition; 
    this.items = params.items;
    this.isSolid = true;

    if (!this.preventDraw) { 
      const shadow = new Sprite({
        resource: resources.images["shadow"],
        position: new Vector2((this.body?.position.x ?? 0) + 5, -16),
        scale: new Vector2(1.25, 1),
        frameSize: new Vector2(32, 32),
      });
      this.addChild(shadow); 
    }
  }

  override ready() {
    //fix the content to allow for shop
    if (this.textContent) {
      this.textContent = this.textContent.concat({
        string: storyFlags.contains(GOT_WATCH) ? ["Shop", "Repair", "Sell", "Cancel"] : ["Cancel"],
        canSelectItems: true,
        addsFlag: undefined, 
      } as Scenario);
    } else {
      this.textContent = [{ 
        string: ["Shop", "Repair", "Sell", "Cancel"],
        canSelectItems: true,
        addsFlag: undefined
      } as Scenario]
    }
    //add animation/functionality for hero talking to salesman
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
        events.emit("SHOP_OPENED", { heroPosition: this.heroPosition, entranceLevel: this.entranceLevel, items: this.items });
      }
      if (selectedItem === "Sell") {
        events.emit("SHOP_OPENED_TO_SELL", { heroPosition: this.heroPosition, entranceLevel: this.entranceLevel, items: this.items });
      }
      if (selectedItem === "Repair") {
        events.emit("REPAIR_ALL_METABOTS");
      }
    }); 
  } 
}
