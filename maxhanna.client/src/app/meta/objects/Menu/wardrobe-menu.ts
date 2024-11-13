import { GameObject, HUD } from "./../game-object";
import { Sprite } from "./../sprite";
import { hexToRgb, resources } from "../../helpers/resources";
import { events } from "../../helpers/events";
import { getAbbrTypeLabel } from "../../helpers/skill-types";
import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { MetaHero } from "../../../../services/datacontracts/meta/meta-hero";
import { Level } from "./../Level/level";
import { SpriteTextString } from "./../SpriteTextString/sprite-text-string";
import { Input } from "../../helpers/input";
import { Main } from "./../Main/main";
import { InventoryItem } from "./../InventoryItem/inventory-item";
import { MetaBot } from "../../../../services/datacontracts/meta/meta-bot";
import { HEAD, LEFT_ARM, LEGS, MetaBotPart, RIGHT_ARM } from "../../../../services/datacontracts/meta/meta-bot-part";
import { Watch } from "./../InventoryItem/Watch/watch";
import { storyFlags, GOT_WATCH } from "../../helpers/story-flags";
import { Hero } from "../Hero/hero";
import { ColorSwap } from "../../../../services/datacontracts/meta/color-swap";
import { ANBU_MASK, BOT_MASK, BUNNYEARS_MASK, BUNNY_MASK, Mask, NO_MASK, getMaskNameById } from "../Wardrobe/mask";

export class WardrobeMenu extends Level {
  menuLocationX = 190;
  menuLocationY = 10;
  selectorSprite = new Sprite({ resource: resources.images["pointer"], frameSize: new Vector2(12, 10), position: new Vector2(this.menuLocationX + 10, this.menuLocationY + 20) });
  heroSprite = new Hero({ position: new Vector2(70, 80) });
  blockSelection = false;
  items: string[] = [];
  currentlySelectedId: number = 0;
  inventoryItems: InventoryItem[] = [];
  regularMenuChoices = ["Exit"];

  entranceLevel?: Level;
  heroPosition = new Vector2(0, 0);
  hero?: MetaHero;
  blockClearMenu = false;


  menuWidth = 125;
  menuHeight = 200;
  isDisplayingMasks = false;

  maskEquipped?: number;

  constructor(params: { entranceLevel: Level, heroPosition?: Vector2, inventoryItems?: InventoryItem[], hero: MetaHero }) {
    super();
    this.drawLayer = HUD;
    this.inventoryItems = params.inventoryItems ?? [];
    this.entranceLevel = params.entranceLevel;
    this.hero = params.hero;
    this.heroPosition = params.heroPosition ?? this.heroPosition;
    const background = new Sprite({ objectId: 0, resource: resources.images["white"], frameSize: new Vector2(2, 2), scale: new Vector2(8, 10), position: new Vector2(this.menuLocationX, this.menuLocationY) });
    this.addChild(background);
    this.addChild(this.selectorSprite);
     
    this.heroSprite = new Hero({
      name: this.hero.name, position: new Vector2(70, 80),
      colorSwap: this.hero.color ? new ColorSwap([0, 160, 200], hexToRgb(this.hero.color)) : undefined,
      mask: this.hero.mask ? new Mask(getMaskNameById(this.hero.mask)) : undefined
    });
   
    this.addChild(this.heroSprite);

    if (this.inventoryItems.some(x => x.category.toLowerCase() === "mask")) {
      this.regularMenuChoices.unshift("Masks");
    }
    
    // Create horizontal borders
    this.createMenuBorders();
    this.displayStartMenu();
    this.blockSelectionTimeout(500);
    console.log(this.inventoryItems);
  }


  override step(delta: number, root: GameObject) {
    const input = (root as Main).input as Input;

    if (input?.keys["Escape"]) {
      this.closeWardrobe();
      setTimeout(() => { 
        events.emit("PRESSED_ESCAPE");
      }, 100);
    }
    else if (input?.keys["Space"] && !this.blockSelection) {
      if (input?.verifyCanPressKey()) {
        console.log(this.items[this.currentlySelectedId]);
        if (this.items[this.currentlySelectedId] === "Exit") {
          this.closeWardrobe();
        } else if (this.items[this.currentlySelectedId] === "Back") {
          this.displayStartMenu();
        } else if (this.items[this.currentlySelectedId] === "Masks") {
          this.displayMaskMenu();
        } else if (this.isDisplayingMasks) {
          const maskMap = {
            [BUNNYEARS_MASK.name.toLowerCase()]: BUNNYEARS_MASK,
            [BOT_MASK.name.toLowerCase()]: BOT_MASK,
            [BUNNY_MASK.name.toLowerCase()]: BUNNY_MASK,
            [ANBU_MASK.name.toLowerCase()]: ANBU_MASK,
            [NO_MASK.name.toLowerCase()]: NO_MASK,
          };
          let maskStats = maskMap[this.items[this.currentlySelectedId].toLowerCase()] || NO_MASK;

          if (this.hero) { 
            this.hero.mask = maskStats.id === 0 ? undefined : maskStats.id;
            this.removeChild(this.heroSprite);
            this.heroSprite = new Hero({ name: this.hero.name, position: new Vector2(70, 80), colorSwap: this.heroSprite.colorSwap, mask: new Mask(maskStats.name) });
            this.addChild(this.heroSprite);
            console.log("replaced hero sprite");
          }
          this.maskEquipped = maskStats.id;
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
   
  override drawImage(ctx: CanvasRenderingContext2D) {

  }
  private createMenuBorders() {
    for (let x = 0; x < this.menuWidth; x += 5) {
      this.createMenuBorder(this.menuLocationX + x, 10);
      this.createMenuBorder(this.menuLocationX + x, 205);
    }

    // Create vertical borders
    for (let y = 0; y < this.menuHeight; y += 5) {
      this.createMenuBorder(this.menuLocationX, 10 + y);
      this.createMenuBorder(this.menuLocationX + 125, 10 + y);
    }
  }

  private clearMenu() {
    this.children.forEach((child: GameObject) => {
      if (child instanceof SpriteTextString || child instanceof Watch) {
        child.destroy();
      }
    });
    this.currentlySelectedId = 0;
    this.isDisplayingMasks = false;

    this.selectorSprite.position.y = 30 + (this.currentlySelectedId * 10);
    this.blockSelectionTimeout(500);
  }

  private displayStartMenu() {
    this.clearMenu();
    this.items = this.regularMenuChoices;

    for (let x = 0; x < this.items.length; x++) {
      const sts = new SpriteTextString(this.items[x], new Vector2(this.menuLocationX + 10, this.menuLocationY + 10 + (10 * x)), "Black");
      this.addChild(sts);
    }
  }

  private displayMaskMenu() {
    this.clearMenu();
    this.isDisplayingMasks = true;
    const ownedMasks = this.inventoryItems.filter(x => x.category.toLowerCase() === "mask").map(x => x.name);
    this.items = ownedMasks.concat(["Unequip", "Back"]);

    for (let x = 0; x < this.items.length; x++) {
      const sts = new SpriteTextString(this.items[x], new Vector2(this.menuLocationX + 10, this.menuLocationY + 10 + (10 * x)), "Black");
      this.addChild(sts);
    }
  }

  closeWardrobe() {
    events.emit("WARDROBE_CLOSED", { entranceLevel: this.entranceLevel, heroPosition: this.heroPosition });
    if (this.maskEquipped) {
      events.emit("MASK_EQUIPPED", { maskId: this.maskEquipped });
    }
  }

  createMenuBorder = (x: number, y: number) => {
    const menuBorder = new Sprite({
      objectId: 0,
      resource: resources.images["menuBorder"],
      frameSize: new Vector2(5, 5),
      position: new Vector2(x, y),
    });
    this.addChild(menuBorder);
  };
  incrementCurrentlySelectedId() {
    if (this.items.length > 0) {
      this.currentlySelectedId = (this.currentlySelectedId > this.items.length - 2 ? 0 : ++this.currentlySelectedId);
      this.selectorSprite.position.y = 30 + (this.currentlySelectedId * 10);
    }
  }

  decrementCurrentlySelectedId() {
    if (this.items.length > 1) {
      // Original decrement logic
      this.blockClearMenu = false;
      this.currentlySelectedId = (this.currentlySelectedId == 0 ? this.items.length - 1 : --this.currentlySelectedId);
      this.selectorSprite.position.y = 30 + (this.currentlySelectedId * 10);
    }
  }

  private blockSelectionTimeout(duration: number) {
    this.blockSelection = true;
    setTimeout(() => {
      this.blockSelection = false;
    }, duration);
  }
} 
