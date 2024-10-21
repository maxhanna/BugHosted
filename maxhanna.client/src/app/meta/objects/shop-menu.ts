import { GameObject } from "./game-object";
import { Sprite } from "./sprite";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { MetaHero } from "../../../services/datacontracts/meta/meta-hero";
import { Level } from "./Level/level";
import { SpriteTextString } from "./SpriteTextString/sprite-text-string";
import { Input } from "../helpers/input";
import { Main } from "./Main/main";
import { InventoryItem } from "./InventoryItem/inventory-item";
import { GOT_FIRST_METABOT, storyFlags } from "../helpers/story-flags";


export class ShopMenu extends Level {
  nextId: number = parseInt((Math.random() * 19999).toFixed(0));
  items: InventoryItem[] = [];
  currentlySelectedId: number = 0;
  selectedCategory: string = "all"; // Track the selected item category
  selectorSprite = new Sprite({ resource: resources.images["pointer"], frameSize: new Vector2(12, 10), position: new Vector2(-10, 10) }); 
  entranceLevel: Level;
  blockSelection = true;

  constructor(params: { heroPosition: Vector2, entranceLevel: Level, items?: InventoryItem[] }) {
    super();
    this.defaultHeroPosition = params.heroPosition;
    this.entranceLevel = params.entranceLevel;
    if (params.items) {
      const hasFirstMetabot = storyFlags.contains(GOT_FIRST_METABOT); 
      if (hasFirstMetabot) {
        for (let x = 0; x < params.items.length; x++) {
          if (params.items[x].category != "botFrame") {
            this.items.push(params.items[x]);
          }
        }
      } else { 
        this.items = params.items;
      }

      if (!this.items.find(x => x.category === "Exit")) {
        this.items.push(new InventoryItem({ id: this.items.length + 1, name: "Exit", category: "Exit" }));
      }
    } else {
      this.items.push( 
        new InventoryItem({ id: 4, name: "Exit", category: "Exit" }),
      );
    }
    const shopFrame = new Sprite({ resource: resources.images["white"], position: new Vector2(-100, -60), scale: new Vector2(100, 170) }); 
    this.addChild(shopFrame);
    this.addChild(this.selectorSprite);

    for (let x = 0; x < this.items.length; x++) {
      if (this.items[x].image) {
        const sprite = new Sprite({
          position: new Vector2(-70, 32 * x),
          resource: resources.images[this.items[x].image],
          frameSize: new Vector2(32, 32)
        });
        this.addChild(sprite);
      }
    }
    for (let x = 0; x < this.items.length; x++) {
      const sts = new SpriteTextString(this.items[x].name, new Vector2(-20, 32 * x), "Black"); 
      this.addChild(sts);
    }
    for (let x = 0; x < this.items.length; x++) { 
      if (this.items[x].stats) {
        console.log(this.items[x].stats);
        const keys = Object.keys(this.items[x].stats);
        let statTmp = "";
        for (let key of keys) {
          statTmp += `${key} ${this.items[x].stats[key]}`
        }
        const sts = new SpriteTextString(statTmp, new Vector2(80, 32 * x), "Black");
        this.addChild(sts);
      }
    }
    setTimeout(() => {
      this.blockSelection = false; 
    }, 700);
  }
   
  incrementCurrentlySelectedId() {
    this.currentlySelectedId = (this.currentlySelectedId > (this.items.length - 2) ? 0 : ++this.currentlySelectedId);
    this.selectorSprite.position.y = 10 + (this.currentlySelectedId * 32); 
  }
  decrementCurrentlySelectedId() {
    this.currentlySelectedId = (this.currentlySelectedId == 0 ? this.items.length - 1 : --this.currentlySelectedId);
    this.selectorSprite.position.y = 10 + (this.currentlySelectedId * 32); 
  }
  override step(delta: number, root: GameObject) { 
    const input = (root as Main).input as Input; 
    if (input?.keys["Space"] && !this.blockSelection) {
      if (input?.verifyCanPressKey()) {
        if (this.items[this.currentlySelectedId].name === "Exit") {
          this.leaveShop();
        } else {
          this.purchaseItem(this.items[this.currentlySelectedId]);
        }
      }
    }

    if (input?.verifyCanPressKey()) {
      if (input?.getActionJustPressed("ArrowUp")
        || input?.heldDirections.includes("UP")
        || input?.getActionJustPressed("KeyW")) {
        this.decrementCurrentlySelectedId();
      }
      else if (input?.getActionJustPressed("ArrowDown")
        || input?.heldDirections.includes("DOWN")
        || input?.getActionJustPressed("KeyS")) {
        this.incrementCurrentlySelectedId();
      }
      else if (input?.getActionJustPressed("ArrowLeft")
        || input?.heldDirections.includes("LEFT")
        || input?.getActionJustPressed("KeyA")) {
        this.decrementCurrentlySelectedId();
      }
      else if (input?.getActionJustPressed("ArrowRight")
        || input?.heldDirections.includes("RIGHT")
        || input?.getActionJustPressed("KeyD")) {
        this.incrementCurrentlySelectedId();
      }
    }
  }
  override ready() { 
    events.emit("HERO_MOVEMENT_LOCK");
  }
  private leaveShop() {
    this.entranceLevel.defaultHeroPosition = this.defaultHeroPosition;
    console.log("leave shop", this.entranceLevel, this.defaultHeroPosition); 
    events.emit("SHOP_CLOSED", { entranceLevel: this.entranceLevel, heroPosition: this.defaultHeroPosition });
    events.emit("HERO_MOVEMENT_UNLOCK");
  }
  private purchaseItem(item: InventoryItem) {
    console.log("purchaseItem ", item);
    events.emit("ITEM_PURCHASED", item);
    if (item.category == "botFrame") {
      this.leaveShop();
    }
    this.blockSelection = true; 
    setTimeout(() => {
      this.blockSelection = false;
    }, 700);
  }
} 
