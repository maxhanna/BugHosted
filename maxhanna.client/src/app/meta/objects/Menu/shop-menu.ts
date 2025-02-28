import { GameObject } from "./../game-object";
import { Sprite } from "./../sprite";
import { resources } from "../../helpers/resources";
import { events } from "../../helpers/events";
import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { MetaHero } from "../../../../services/datacontracts/meta/meta-hero";
import { Level } from "./../Level/level";
import { SpriteTextString } from "./../SpriteTextString/sprite-text-string";
import { Input } from "../../helpers/input";
import { Main } from "./../Main/main";
import { InventoryItem } from "./../InventoryItem/inventory-item";
import { GOT_FIRST_METABOT, storyFlags } from "../../helpers/story-flags";


export class ShopMenu extends Level {
  nextId: number = parseInt((Math.random() * 19999).toFixed(0));
  items: InventoryItem[] = [];
  visibleItems: InventoryItem[] = [];
  itemsSold: InventoryItem[] = [];
  currentlySelectedId: number = 0;
  selectorSprite = new Sprite({ resource: resources.images["pointer"], frameSize: new Vector2(12, 10), position: new Vector2(10, 10) });
  entranceLevel: Level;
  blockSelection = true;
  sellingMode = false;
  scrollPage = 0;
  MAX_VISIBLE_ITEMS = 5;
  totalPages = 1;

  constructor(params: { heroPosition: Vector2, entranceLevel: Level, items?: InventoryItem[], sellingMode?: boolean }) {
    super();
    this.defaultHeroPosition = params.heroPosition;
    this.entranceLevel = params.entranceLevel;
    this.sellingMode = !!params.sellingMode;
    this.items = params.items ?? [];

    const shopFrame = new Sprite({ resource: resources.images["white"], position: new Vector2(-20, 78), scale: new Vector2(12.5, 10.3) });
    shopFrame.drawLayer = "HUD";
    this.addChild(shopFrame);
    this.addChild(this.selectorSprite);

    this.updateSelectorPosition();
    this.displayShopItems(this.items);
    this.incrementCurrentlySelectedId();
    this.decrementCurrentlySelectedId();

    setTimeout(() => {
      this.blockSelection = false;
      events.emit("BLOCK_START_MENU"); 
    }, 700);
  }

  private displayShopItems(shopItemsToDisplay?: InventoryItem[]) {
    if (!shopItemsToDisplay) return;
    this.children.forEach((child: any) => {
      if (child instanceof SpriteTextString) {
        child.destroy();
      }
    });
    this.totalPages = Math.ceil((this.items.length - 1) / this.MAX_VISIBLE_ITEMS);

    if (!shopItemsToDisplay.find(x => x.category === "Exit")) {
      shopItemsToDisplay.push(new InventoryItem({ id: shopItemsToDisplay.length + 1, name: "Exit", category: "Exit" }));
    }
    let offsetPictures = false;

    for (let x = 0; x < Math.min(shopItemsToDisplay.length, this.MAX_VISIBLE_ITEMS); x++) {
      if (shopItemsToDisplay[x].image) {
        const sprite = new Sprite({
          position: new Vector2(20, 95 + (32 * x)),
          resource: resources.images[shopItemsToDisplay[x].image],
          frameSize: new Vector2(32, 32),
        });
        this.addChild(sprite);
        offsetPictures = true;
      }
    }
    for (let x = 0; x < Math.min(shopItemsToDisplay.length, this.MAX_VISIBLE_ITEMS); x++) {
      const sts = new SpriteTextString(shopItemsToDisplay[x].name ?? "", new Vector2(10 + (offsetPictures ? 20 : 0), 90 + (32 * x)), "Black");
      this.addChild(sts);
    }
    for (let x = 0; x < Math.min(shopItemsToDisplay.length, this.MAX_VISIBLE_ITEMS); x++) {
      if (shopItemsToDisplay[x].stats) {
        const keys = Object.keys(shopItemsToDisplay[x].stats);
        let statTmp = "";
        for (let key of keys) {
          statTmp += `${key} ${shopItemsToDisplay[x].stats[key]}`
        }
        const sts = new SpriteTextString(statTmp, new Vector2(60 + (offsetPictures ? 20 : 0), 90 + (32 * x)), "Black");
        this.addChild(sts);
      }
    }

    this.printTotalPages();

    console.log(shopItemsToDisplay);
  }

  private printTotalPages() {
    const sts = new SpriteTextString(`${this.scrollPage} ${this.totalPages}`, new Vector2(200, 250), "Black");
    this.addChild(sts);
  }

  incrementCurrentlySelectedId() {
    const visibleItemCount = this.MAX_VISIBLE_ITEMS;
    let pageChanged = false;
    if (this.items.length < 5 && (this.items.length - 1) === this.currentlySelectedId) {
      return;
    }
    //console.log(this.items, this.visibleItems, this.currentlySelectedId);
    if (this.currentlySelectedId >= visibleItemCount - 1) {
      this.currentlySelectedId = 0;
      this.scrollPage++;
      pageChanged = true;
    } else {
      this.currentlySelectedId++;
    }

    if (this.scrollPage >= this.totalPages) {
      this.scrollPage = 0;
      pageChanged = true;
    }

    if (this.items.length > visibleItemCount) {
      this.visibleItems = this.items.slice(
        this.scrollPage * visibleItemCount,
        (this.scrollPage + 1) * visibleItemCount
      );
    } else {
      this.visibleItems = this.items;
      pageChanged = false;
    }
    if (pageChanged) {
      this.displayShopItems(this.visibleItems);
    }

    this.updateSelectorPosition();  // Keep the selector position updated
  }

  decrementCurrentlySelectedId() {
    const visibleItemCount = this.MAX_VISIBLE_ITEMS;
    let pageChanged = false;
    if (this.currentlySelectedId == 0 && this.items.length < 5) {
      return;
    }

    if (this.currentlySelectedId <= 0) {
      this.scrollPage--;

      if (this.scrollPage < 0) {
        this.scrollPage = this.totalPages - 1;
      }

      this.currentlySelectedId = Math.min(visibleItemCount - 1, this.items.length - this.scrollPage * visibleItemCount - 1);

      this.visibleItems = this.items.slice(
        this.scrollPage * visibleItemCount,
        (this.scrollPage + 1) * visibleItemCount
      );
      this.displayShopItems(this.visibleItems);
    } else {
      this.currentlySelectedId--;
    }

    this.updateSelectorPosition();
  }

  private updateSelectorPosition() {
    this.selectorSprite.position.y = 100 + (this.currentlySelectedId * 32);
  }
  override step(delta: number, root: GameObject) {
    const input = (root as Main).input as Input;
    if (Object.values(input.keys).some(value => value === true)) {
      this.handleKeyboardInput(input);
    }
  }
  override ready() {
    events.emit("HERO_MOVEMENT_LOCK");
  }
  private leaveShop() {
    this.entranceLevel.defaultHeroPosition = this.defaultHeroPosition;
    if (this.itemsSold.length > 0) {
      events.emit("ITEM_SOLD", this.itemsSold);
    }
    events.emit("SHOP_CLOSED", { entranceLevel: this.entranceLevel, heroPosition: this.defaultHeroPosition });
    events.emit("HERO_MOVEMENT_UNLOCK");
  }
  private purchaseItem(item: InventoryItem) {
    console.log(item);
    if (!item) return;
    if (item.category == "botFrame") {
      this.leaveShop();
    }
    this.blockSelection = true;
    setTimeout(() => {
      events.emit("ITEM_PURCHASED", item);
      this.blockSelection = false;
    }, 700);
  }
  private sellItem(item: InventoryItem) {
    // Add to sold items list
    if (!item) return;
    this.itemsSold.push(item);

    // Remove item from main items list
    this.items = this.items.filter(x => x.id !== item.id);

    // Recalculate total pages after removing the item
    this.totalPages = Math.ceil((this.items.length - 1) / this.MAX_VISIBLE_ITEMS);

    // Adjust visibleItems based on the current scroll page
    this.visibleItems = this.items.slice(
      this.scrollPage * this.MAX_VISIBLE_ITEMS,
      (this.scrollPage + 1) * this.MAX_VISIBLE_ITEMS
    );

    // Redraw shop items with the updated list
    this.displayShopItems(this.visibleItems);

    // Adjust selected item and selector position to stay within bounds
    this.currentlySelectedId = Math.min(this.currentlySelectedId, this.visibleItems.length - 1);
    this.updateSelectorPosition();

    // Block selection temporarily to avoid rapid inputs
    this.blockSelection = true;
    setTimeout(() => {
      this.blockSelection = false;
    }, 100);
    console.log(this.itemsSold);
  }
  handleKeyboardInput(input: Input) { 
    if (input?.keys["Space"] && !this.blockSelection) {
      if (input?.verifyCanPressKey()) {
        if (this.visibleItems && this.visibleItems[this.currentlySelectedId]?.name ? this.visibleItems[this.currentlySelectedId].name === "Exit" : this.items[this.currentlySelectedId]?.name === "Exit") {
          this.leaveShop();
        } else {
          if (this.sellingMode) {
            this.sellItem(this.visibleItems[this.currentlySelectedId]);
          } else {
            this.purchaseItem(this.visibleItems[this.currentlySelectedId]);
          }
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
} 
