import { GameObject } from "./game-object";
import { Sprite } from "./sprite";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { getAbbrTypeLabel } from "../helpers/skill-types";
import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { MetaHero } from "../../../services/datacontracts/meta/meta-hero";
import { Level } from "./Level/level";
import { SpriteTextString } from "./SpriteTextString/sprite-text-string";
import { Input } from "../helpers/input";
import { Main } from "./Main/main";
import { InventoryItem } from "./InventoryItem/inventory-item";
import { MetaBot } from "../../../services/datacontracts/meta/meta-bot";
import { HEAD, LEFT_ARM, LEGS, MetaBotPart, RIGHT_ARM } from "../../../services/datacontracts/meta/meta-bot-part";

export class StartMenu extends GameObject {
  menuLocationX = 190;
  menuLocationY = 10;
  selectorSprite = new Sprite({ resource: resources.images["pointer"], frameSize: new Vector2(12, 10), position: new Vector2(this.menuLocationX + 10, this.menuLocationY + 20) });
  blockSelection = false;
  items: string[] = [];
  currentlySelectedId: number = 0;
  inventoryItems: InventoryItem[] = [];
  metabotParts: MetaBotPart[] = [];
  selectedMetabot?: MetaBot;
  selectedMetabotForParts?: MetaBot;
  selectedMetabotId?: number;
  selectedPart?: string;
  isDisplayingMetabots = false;
  metabotPartItems = [HEAD, LEGS, LEFT_ARM, RIGHT_ARM];

  constructor(params: { inventoryItems?: InventoryItem[], metabotParts?: MetaBotPart[] }) {
    super({ position: new Vector2(0, 0) });
    this.drawLayer = "HUD";
    this.inventoryItems = params.inventoryItems ?? [];
    this.metabotParts = params.metabotParts ?? [];

    const background = new Sprite({ objectId: 0, resource: resources.images["white"], frameSize: new Vector2(2, 2), scale: new Vector2(8, 10), position: new Vector2(this.menuLocationX, this.menuLocationY) });
    this.addChild(background);
    this.addChild(this.selectorSprite);

    // Create horizontal borders
    for (let x = 0; x < 125; x += 5) {
      this.createMenuBorder(this.menuLocationX + x, 10);
      this.createMenuBorder(this.menuLocationX + x, 205);
    }

    // Create vertical borders
    for (let y = 0; y < 200; y += 5) {
      this.createMenuBorder(this.menuLocationX, 10 + y);
      this.createMenuBorder(this.menuLocationX + 125, 10 + y);
    }
    this.displayStartMenu();

    events.on("PRESSED_ESCAPE", this, () => {
      console.log("escape presed");
      events.emit("START_PRESSED");
    });
  }
  override step(delta: number, root: GameObject) {  
    const input = (root as Main).input as Input;
    if (input?.keys["Space"] && !this.blockSelection) {
      if (input?.verifyCanPressKey()) { 
        if (this.items[this.currentlySelectedId] === "Exit") {
          events.emit("START_PRESSED");
        } else if (this.items[this.currentlySelectedId] === "Back" || (this.selectedMetabot && this.currentlySelectedId == this.metabotPartItems.length)) {
          if (this.selectedMetabot && !this.selectedMetabotId) {
            this.displayMetabots();
          } else if (this.selectedMetabotId && this.selectedPart && this.selectedMetabotForParts) {
            this.displayMetabot(this.selectedMetabotForParts);
          }
          else { 
            this.displayStartMenu();
          }
        } else if (this.items[this.currentlySelectedId] === "Meta-Bots") {
          this.displayMetabots();
        }
        else if (this.selectedMetabot && (this.metabotPartItems[this.currentlySelectedId] === LEGS
          || this.metabotPartItems[this.currentlySelectedId] === LEFT_ARM
          || this.metabotPartItems[this.currentlySelectedId] === RIGHT_ARM
          || this.metabotPartItems[this.currentlySelectedId] === HEAD)) { 
          this.displayPartSelection(this.metabotPartItems[this.currentlySelectedId], this.selectedMetabot);
        }
        else if (this.isDisplayingMetabots) {
          const selection = this.items[this.currentlySelectedId];
          const bot = this.inventoryItems.find(ii => ii.name === selection);
          if (bot) {
            this.selectedMetabot = JSON.parse(bot.stats) as MetaBot;
            if (this.selectedMetabot) {
              this.displayMetabot(this.selectedMetabot);
            }
          }
        }
        else if (this.selectedPart) {
          const selection = this.items[this.currentlySelectedId]; 
          events.emit("SELECTED_PART", { selectedPart: this.selectedPart, selection: selection, selectedMetabotId: this.selectedMetabotId });
          if (this.selectedMetabotForParts) { 
            this.displayMetabot(this.selectedMetabotForParts);
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
  override drawImage(ctx: CanvasRenderingContext2D) {

  }

  private clearMenu() {
    this.children.forEach((child: GameObject) => {
      if (child instanceof SpriteTextString) {
        child.destroy();
      }
    });
    this.items = [];
    this.isDisplayingMetabots = false;
    this.selectedMetabot = undefined;
    this.selectedPart = undefined;
    this.selectedMetabotId = undefined;
    this.selectedMetabotForParts = undefined;

    this.currentlySelectedId = 0;
    this.selectorSprite.position.y = 30 + (this.currentlySelectedId * 10);
  }

  private displayStartMenu() {
    this.clearMenu();
    this.items = ["Meta-Bots", "Inventory", "Map", "Exit"];

    for (let x = 0; x < this.items.length; x++) {
      const sts = new SpriteTextString(this.items[x], new Vector2(this.menuLocationX + 10, this.menuLocationY + 10 + (10 * x)), "Black");
      this.addChild(sts);
    }
  }

  private displayMetabots() {
    this.clearMenu();
    this.isDisplayingMetabots = true;
    for (let x = 0; x < this.inventoryItems.length; x++) {
      if (this.inventoryItems[x].category == "botFrame") {
        this.items.push(this.inventoryItems[x].name); 
        const stsName = new SpriteTextString(this.inventoryItems[x].name, new Vector2(this.menuLocationX + 5, this.menuLocationY + (10 * x)), "Black");
        this.addChild(stsName);
        if (this.inventoryItems[x].stats) {
          const stats = JSON.parse(this.inventoryItems[x].stats) as MetaBot;
          const stsStats = new SpriteTextString(`HP${stats.hp} L${stats.level}`, new Vector2(this.menuLocationX + 45, this.menuLocationY + (10 * x)), "Black");
          this.addChild(stsStats);
        }
      }
    }

    this.items = this.items.concat("Back");
    const stsName = new SpriteTextString("Back", new Vector2(this.menuLocationX + 5, this.menuLocationY + (10 * this.items.length)), "Black");
    this.addChild(stsName);
  }

  private displayMetabot(selectedBot: MetaBot) {
    this.clearMenu();
    this.selectedMetabot = selectedBot;
    // Initial menu items with parts
    const itemsWithStats: string[] = [];
    const items: string[] = this.metabotPartItems.concat("Back");

    for (let x = 0; x < items.length; x++) {
      const partName = items[x];
      const partLabel = new SpriteTextString(partName, new Vector2(this.menuLocationX + 5, this.menuLocationY + 10 + (20 * x)), "Black");
      this.addChild(partLabel);

      // Add part stats if it's not "Back" and part exists on selected Metabot
      if (partName !== "Back" && selectedBot) { 
        let parts = this.metabotParts.filter(x => x.metabotId === selectedBot.id);
        let part = parts.find(x => x.partName === partName); 

        itemsWithStats.push(partName);
        if (part) {
          // Stats to insert directly after part name
          const partStats = `${part.skill.name} ${part.damageMod} ${getAbbrTypeLabel(part.skill.type)}`;
          itemsWithStats.push(partStats);

          const statsLabel = new SpriteTextString(partStats, new Vector2(this.menuLocationX + 20, this.menuLocationY + 20 + (20 * x)), "Black");
          this.addChild(statsLabel);
        }
      }
      else if (partName === "Back") {
        itemsWithStats.push(partName);
      }
    }

    // Update items with the modified list containing stats and set selector position
    this.items = itemsWithStats; 
  }


  private displayPartSelection(selectedPart: string, selectedMetabotForParts: MetaBot) {
    this.clearMenu();
    this.selectedPart = selectedPart;
    this.selectedMetabotId = selectedMetabotForParts.id;
    this.selectedMetabotForParts = selectedMetabotForParts;

    const filteredParts = this.metabotParts.filter(part => part.partName === this.selectedPart);
    let x = 0; 
    for (let part of filteredParts) {
      const partStats = `${part.skill.name} ${part.damageMod} ${getAbbrTypeLabel(part.skill.type) }`;
      this.items.push(partStats)
      const partLabel = new SpriteTextString(partStats, new Vector2(this.menuLocationX + 5, this.menuLocationY + (10 * ++x)), "Black");
      this.addChild(partLabel);
    }

    const item = "Back";
    this.items.push(item)
    const backLabel = new SpriteTextString(item, new Vector2(this.menuLocationX + 5, this.menuLocationY + (10 * ++x)), "Black");
    this.addChild(backLabel);

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
    this.currentlySelectedId = (this.currentlySelectedId > (this.selectedMetabot ? this.metabotPartItems.length - 1 : this.items.length - 2) ? 0 : ++this.currentlySelectedId);
    if (this.selectedMetabot && !this.selectedPart) {
      this.selectorSprite.position.y = 30 + (this.currentlySelectedId * 20);
    } else {
      this.selectorSprite.position.y = 30 + (this.currentlySelectedId * 10);
    }
  }
  decrementCurrentlySelectedId() {
    this.currentlySelectedId = (this.currentlySelectedId == 0 ? this.selectedMetabot ? this.metabotPartItems.length : this.items.length - 1 : --this.currentlySelectedId);
    if (this.selectedMetabot && !this.selectedPart) {
      this.selectorSprite.position.y = 30 + (this.currentlySelectedId * 20);
    } else {
      this.selectorSprite.position.y = 30 + (this.currentlySelectedId * 10);
    }
  }
}
