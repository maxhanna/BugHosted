import { GameObject } from "./game-object";
import { Sprite } from "./sprite";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { MetaHero } from "../../../services/datacontracts/meta/meta-hero";
import { Level } from "./Level/level";
import { SpriteTextString } from "./SpriteTextString/sprite-text-string";
import { Input } from "../helpers/input";
 

export class ShopMenu extends Level {
  nextId: number = parseInt((Math.random() * 19999).toFixed(0));
  items: ShopItem[] = [];
  currentlySelectedId: number = 0;
  selectedCategory: string = "all"; // Track the selected item category
  selectorSprite = new Sprite({ resource: resources.images["pointer"], frameSize: new Vector2(12, 10), position: new Vector2(22, 10) });
  override defaultHeroPosition = new Vector2(0, 0);
  entranceLevel: Level;
  constructor(params: { heroPosition: Vector2, entranceLevel: Level }) {
    super();
    this.defaultHeroPosition = params.heroPosition;
    this.entranceLevel = params.entranceLevel;
    // Sample inventory with different categories
    this.items.push(
      new ShopItem(1, "Frame2 Canister", resources.images["metabotFrame"], "metabot frames2"),
      new ShopItem(2, "Robot Frame", resources.images["metabotFrame"], "metabot frames"),
      new ShopItem(3, "Frame3 Parts", resources.images["metabotFrame"], "metabot frames3"),
      new ShopItem(4, "Exit", undefined, "Exit"),
    ); 

    const shopFrame = new Sprite({ resource: resources.images["white"], position: new Vector2(-100,  -60), scale: new Vector2(100, 170) });
   // shopFrame.drawLayer = "FLOOR";
    this.addChild(shopFrame);
    this.addChild(this.selectorSprite);
    for (let x = 0; x < this.items.length; x++) {
      const sts = new SpriteTextString(this.items[x].name, new Vector2(10, 15 * x), "Black");
     // sts.drawLayer = "HUD";
      this.addChild(sts);
    } 
  }


  // Handles item selection logic
  selectNextItem() {  
    this.currentlySelectedId = (this.currentlySelectedId > (this.items.length - 2) ? 0 : ++this.currentlySelectedId);
    this.selectorSprite.position.y = 10 + (this.currentlySelectedId * 15);
    console.log(this.currentlySelectedId);
  }
  selectPreviousItem() { 
    this.currentlySelectedId = (this.currentlySelectedId == 0 ? this.items.length - 1 : --this.currentlySelectedId);
    this.selectorSprite.position.y = 10 + (this.currentlySelectedId * 15);
    console.log(this.currentlySelectedId);
  }
  override step(delta: number, root: GameObject) {
    //listen for user input
    //get parentmost object
    let parent = root?.parent ?? root;
    if (parent) {
      while (parent.parent) {
        parent = parent.parent;
      }
    }

    const input = parent.input as Input;

    if (input?.keys["Space"]) {
      if (input?.verifyCanPressKey()) {
        if (this.currentlySelectedId == this.items.length - 1) {
          this.leaveShop();
        }
      }
    }

    if (input?.verifyCanPressKey()) {
      if (input?.getActionJustPressed("ArrowUp")
        || input?.heldDirections.includes("UP")
        || input?.getActionJustPressed("KeyW")) {
        this.selectPreviousItem();
      }
      else if (input?.getActionJustPressed("ArrowDown")
        || input?.heldDirections.includes("DOWN")
        || input?.getActionJustPressed("KeyS")) { 
        this.selectNextItem();
      }
      else if (input?.getActionJustPressed("ArrowLeft")
        || input?.heldDirections.includes("LEFT")
        || input?.getActionJustPressed("KeyA")) { 
        this.selectPreviousItem();
      }
      else if (input?.getActionJustPressed("ArrowRight")
        || input?.heldDirections.includes("RIGHT")
        || input?.getActionJustPressed("KeyD")) {
        this.selectNextItem(); 
      } 
    }
  }

  private leaveShop() {
    console.log("leave shop");
    this.entranceLevel.defaultHeroPosition = this.defaultHeroPosition;
    events.emit("SHOP_CLOSED", { entranceLevel: this.entranceLevel, heroPosition: this.defaultHeroPosition }); 
  }
} 

class ShopItem {
  id: number;
  name: string;
  image: any; // Image resource
  category: string; // e.g., "oil", "parts", "metabot frames"

  constructor(id: number, name: string, image: any, category: string) {
    this.id = id;
    this.name = name;
    this.image = image;
    this.category = category;
  }
}
