import { FLOOR, GameObject, HUD } from "./../game-object";
import { Sprite } from "./../sprite";
import { resources } from "../../helpers/resources";
import { events } from "../../helpers/events";
import { getAbbrTypeLabel } from "../../helpers/skill-types";
import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { SpriteTextString } from "./../SpriteTextString/sprite-text-string";
import { Input } from "../../helpers/input";
import { Main } from "./../Main/main";
import { InventoryItem } from "./../InventoryItem/inventory-item";
import { MetaBot } from "../../../../services/datacontracts/meta/meta-bot";
import { HEAD, LEFT_ARM, LEGS, MetaBotPart, RIGHT_ARM } from "../../../../services/datacontracts/meta/meta-bot-part";
import { Watch } from "./../InventoryItem/Watch/watch";
import { storyFlags, GOT_WATCH, GOT_FIRST_METABOT } from "../../helpers/story-flags";
import { Exit } from "../Environment/Exit/exit";

export class StartMenu extends GameObject {
  menuLocationX = 190;
  menuLocationY = 10;
  selectorSprite = new Sprite({ resource: resources.images["pointer"], frameSize: new Vector2(12, 10), position: new Vector2(this.menuLocationX + 10, this.menuLocationY + 20) });
  background = new Sprite({
    objectId: -12312312,
    name: "StartMenuBG",
    resource: resources.images["white"],
    frameSize: new Vector2(2, 2),
    scale: new Vector2(8, 10),
    position: new Vector2(this.menuLocationX, this.menuLocationY),
    drawLayer: FLOOR
  });
  blockSelection = false;
  items: string[] = [];
  currentlySelectedId: number = 0;
  inventoryItems: InventoryItem[] = [];
  metabotParts: MetaBotPart[] = [];
  exits: Exit[] = [];
  selectedMetabot?: MetaBot;
  selectedMetabotForParts?: MetaBot;
  selectedMetabotId?: number;
  selectedPart?: string;
  isDisplayingMetabots = false;
  metabotPartItems = [HEAD, LEGS, LEFT_ARM, RIGHT_ARM];
  regularMenuChoices = ["Meta-Bots", "Journal", "Warping", "Exit"];

  blockClearWarpInput = false;
  coordXSelected = false;
  coordYSelected = false;
  currentWarpX = "00";
  currentWarpY = "00";


  menuWidth = 125;
  menuHeight = 200;

  constructor(params: { inventoryItems?: InventoryItem[], metabotParts?: MetaBotPart[], exits?: Exit[] }) {
    super({ 
      position: new Vector2(0, 0),
      isOmittable: false,
      preventDraw: false,
    }); 
    this.drawLayer = HUD;
    this.name = "StartMenu";
    this.inventoryItems = params.inventoryItems ?? [];
    this.metabotParts = params.metabotParts ?? [];
    this.exits = params.exits ?? []; 
    this.addChild(this.background);
    this.addChild(this.selectorSprite); 

    if (!storyFlags.contains(GOT_WATCH)) {
      this.regularMenuChoices = this.regularMenuChoices.filter(x => x != "Warping");
    }

    // Create horizontal borders
    for (let x = 0; x < this.menuWidth; x += 5) {
      this.createMenuBorder(this.menuLocationX + x, 10);
      this.createMenuBorder(this.menuLocationX + x, 205);
    }

    // Create vertical borders
    for (let y = 0; y < this.menuHeight; y += 5) {
      this.createMenuBorder(this.menuLocationX, 10 + y);
      this.createMenuBorder(this.menuLocationX + 125, 10 + y);
    }

    const watchSprite = new Sprite({
      objectId: 0,
      resource: resources.images["watch"],
      frameSize: new Vector2(32, 32),
      scale: new Vector2(1, 1),
      position: new Vector2(this.menuLocationX + (this.menuWidth / 2), this.menuLocationY - 5),
      drawLayer: HUD
    });
    this.addChild(watchSprite);

    this.displayStartMenu();

    events.on("PRESSED_ESCAPE", this, () => { 
      events.emit("START_PRESSED");
    });
  }
  override step(delta: number, root: GameObject) {
    const input = (root as Main).input as Input;
    if (input.heldDirections.length > 0 || Object.values(input.keys).some(value => value === true)) {
      this.handleKeyboardInput(root, input);
    } 
  }


  private clearMenu() {
    this.children.forEach((child: GameObject) => {
      if (child instanceof SpriteTextString || child instanceof Watch) {
        child.destroy();
      }
    });
    this.items = [];
    this.isDisplayingMetabots = false;
    this.selectedMetabot = undefined;
    this.selectedPart = undefined;
    this.selectedMetabotId = undefined;
    this.selectedMetabotForParts = undefined;

    if (!this.blockClearWarpInput) { 
      this.currentWarpX = "00";
      this.currentWarpY = "00";
    }
    this.currentlySelectedId = 0;
    this.selectorSprite.position.y = 30 + (this.currentlySelectedId * 10);

  }

  private displayStartMenu() {  
    this.clearMenu();
    this.items = this.regularMenuChoices;

    for (let x = 0; x < this.items.length; x++) {
      const sts = new SpriteTextString(this.items[x], new Vector2(this.menuLocationX + 10, this.menuLocationY + 10 + (10 * x)), "Black"); 
      this.addChild(sts);
    }
  }

  private displayWarpCoordsInput(x: string, y: string) {
    this.clearMenu();
    this.blockClearWarpInput = true;

    this.items.push(`X ${x}, Y ${y}`);
    const coordsLabel = new SpriteTextString(`X ${x}, Y ${y}`, new Vector2(this.menuLocationX + 5, this.menuLocationY + 10), "Black");
    this.addChild(coordsLabel);


    this.items.push("Warp");
    const warpLabel = new SpriteTextString("Warp", new Vector2(this.menuLocationX + 5, this.menuLocationY + (10 * 2)), "Black");
    this.addChild(warpLabel);

    this.items.push("Back");
    const backLabel = new SpriteTextString("Back", new Vector2(this.menuLocationX + 5, this.menuLocationY + (10 * 3)), "Black");
    this.addChild(backLabel);
  }
  private displayWatchMenu() {
    this.clearMenu();
    let xOffset = this.menuLocationX;
    let yOffset = 0;

    yOffset = yOffset + 10;
    this.items.push("Warp Coords Input");
    const coordLabel = new SpriteTextString("Warp Coords Input", new Vector2(xOffset, this.menuLocationY + yOffset), "Black");
    this.addChild(coordLabel);

    // Track the last displayed exit to compare with the next one
    let lastExit: { x: number, y: number } | null = null;

    for (let exit of this.exits) {
      // If there's a previous exit, check if this one is too close
      if (lastExit) {
        const distanceX = Math.abs(exit.position.x - lastExit.x);
        const distanceY = Math.abs(exit.position.y - lastExit.y);

        // Skip this exit if it's within 16 units of the previous one
        if (distanceX <= 16 || distanceY <= 16) {
          continue; // Skip to the next exit
        }
      }

      // Display this exit if it's not too close to the last one
      yOffset = yOffset + 10;
      this.items.push(`Warp to exit: ${exit.position.x}, ${exit.position.y}`);
      const warpLabel = new SpriteTextString(`Warp to exit: ${exit.position.x}, ${exit.position.y}`, new Vector2(xOffset, this.menuLocationY + yOffset), "Black");
      this.addChild(warpLabel); 

      // Update the last exit to the current one
      lastExit = { x: exit.position.x, y: exit.position.y };
    }

    yOffset = yOffset + 10;
    this.items.push("Back");
    const backLabel = new SpriteTextString("Back", new Vector2(xOffset, this.menuLocationY + yOffset), "Black");
    this.addChild(backLabel);

    this.blockSelectionTimeout();
  }



  private displayJournalMenu() {
    this.clearMenu();

    this.items.push("Back");
    const journalLabel = new SpriteTextString("Back", new Vector2(this.menuLocationX + 5, this.menuLocationY + 10), "Black");
    this.addChild(journalLabel);

    let messages: string[] = [];
    if (!storyFlags.contains(GOT_WATCH)) {
      messages = ["Talk to mom."];
    } else if (!storyFlags.contains(GOT_FIRST_METABOT)) {
      messages = ["Visit the store."];
    } else {
      messages = ["Explore."];
    }

    const backLabel = new SpriteTextString(`Journal:`, new Vector2(this.menuLocationX + 5, this.menuLocationY + 20 + (10 * messages.length)), "Black");
    this.addChild(backLabel);


    for (let x = 0; x < messages.length; x++) {
      const coordLabel = new SpriteTextString(messages[x], new Vector2(this.menuLocationX + 5, this.menuLocationY + 40 + (10 * x)), "Black");
      this.addChild(coordLabel);
    }

    this.blockSelectionTimeout();
  }


  private displayMetabots() {
    this.clearMenu();
    this.isDisplayingMetabots = true;
    const botFrames = this.inventoryItems.filter(x => x.category === "botFrame");
    for (let x = 0; x < botFrames.length; x++) {
      this.items.push((botFrames[x].name ?? ""));
      let botStartY = 10 + (x * 10);
      const stsName = new SpriteTextString((botFrames[x].name ?? ""), new Vector2(this.menuLocationX + 5, this.menuLocationY + botStartY), "Black");
      this.addChild(stsName);
      if (botFrames[x].stats) {
        const stats = typeof botFrames[x].stats === "string"
          ? JSON.parse(botFrames[x].stats) as MetaBot
          : botFrames[x].stats as MetaBot;
        const stsStats = new SpriteTextString(`HP${stats.hp} L${stats.level ?? 1}`, new Vector2(this.menuLocationX + 45, this.menuLocationY + botStartY), "Black");
        this.addChild(stsStats);
      }
    }

    this.items = this.items.concat("Back");
    const backLabel = new SpriteTextString("Back", new Vector2(this.menuLocationX + 5, this.menuLocationY + (10 * this.items.length)), "Black");
    this.addChild(backLabel);
    this.blockSelectionTimeout();
  }

  private displayMetabot(selectedBot: MetaBot) {
    this.clearMenu();
    this.selectedMetabot = selectedBot;
    // Initial menu items with parts
    const itemsWithStats: string[] = [];
    const items: string[] = [selectedBot.hp == 0 ? "Dead" : (selectedBot.isDeployed ? "Call Back" : "Deploy"), ... this.metabotPartItems, "Back"];

    for (let x = 0; x < items.length; x++) {
      const item = items[x];
      const partLabel = new SpriteTextString(item, new Vector2(this.menuLocationX + 5, this.menuLocationY + 10 + (20 * x)), "Black");
      this.addChild(partLabel); 
      itemsWithStats.push(item);
      // Add part stats if it's not "Back" and part exists on selected Metabot
      if (selectedBot) {
        let parts = this.metabotParts.filter(x => x.metabotId === selectedBot.id);
        let part = parts.find(x => x.partName === item);

        if (part) {
          // Stats to insert directly after part name
          const partStats = `${part.skill.name} ${part.damageMod} ${getAbbrTypeLabel(part.skill.type)}`;
          itemsWithStats.push(partStats);

          const statsLabel = new SpriteTextString(partStats, new Vector2(this.menuLocationX + 20, this.menuLocationY + 20 + (20 * x)), "Black");
          this.addChild(statsLabel);
        }
      } 
    }

    // Update items with the modified list containing stats and set selector position
    this.items = itemsWithStats;
    this.blockSelectionTimeout();
  }


  private displayPartSelection(selectedPart: string, selectedMetabotForParts: MetaBot) {
    this.clearMenu();
    this.selectedPart = selectedPart;
    this.selectedMetabotId = selectedMetabotForParts.id;
    this.selectedMetabotForParts = selectedMetabotForParts;

    const filteredParts = this.metabotParts.filter(part => part.partName === this.selectedPart && !part.metabotId);
    let x = 0;
    for (let part of filteredParts) {
      const partStats = `${part.skill.name} ${part.damageMod} ${getAbbrTypeLabel(part.skill.type)}`;
      this.items.push(partStats)
      const partLabel = new SpriteTextString(partStats, new Vector2(this.menuLocationX + 5, this.menuLocationY + (10 * ++x)), "Black");
      this.addChild(partLabel);
    }

    const item = "Back";
    this.items.push(item)
    const backLabel = new SpriteTextString(item, new Vector2(this.menuLocationX + 5, this.menuLocationY + (10 * ++x)), "Black");
    this.addChild(backLabel);

    this.blockSelectionTimeout();
  }


  createMenuBorder = (x: number, y: number) => {
    const menuBorder = new Sprite({
      objectId: 0,
      resource: resources.images["menuBorder"],
      frameSize: new Vector2(5, 5),
      position: new Vector2(x, y),
      drawLayer: FLOOR
    });
    this.addChild(menuBorder);
  };

  incrementCurrentlySelectedId() {
    if (this.coordXSelected) {
      // Increment currentWarpX and ensure it stays within "00" to "99"
      let currentWarpX = (parseInt(this.currentWarpX, 10) + 1) % 100;
      this.currentWarpX = String(currentWarpX).padStart(2, '0');
      this.displayWarpCoordsInput(this.currentWarpX, this.currentWarpY); 
    } else if (this.coordYSelected) {
      // Increment currentWarpY and ensure it stays within "00" to "99"
      let currentWarpY = (parseInt(this.currentWarpY, 10) + 1) % 100;
      this.currentWarpY = String(currentWarpY).padStart(2, '0');
      this.displayWarpCoordsInput(this.currentWarpX, this.currentWarpY);
    } else if (this.items.length > 0) {
      // Original increment logic
      this.currentlySelectedId = (this.currentlySelectedId > this.items.length - 2 ? 0 : ++this.currentlySelectedId);
      this.selectorSprite.position.y = 30 + (this.currentlySelectedId * (this.selectedMetabot && !this.selectedPart ? 20 : 10));
    }
  }

  decrementCurrentlySelectedId() {
    if (this.coordXSelected) {
      this.blockClearWarpInput = true;
      // Decrement currentWarpX and ensure it stays within "00" to "99"
      let currentWarpX = (parseInt(this.currentWarpX, 10) - 1 + 100) % 100;
      this.currentWarpX = String(currentWarpX).padStart(2, '0');
      this.displayWarpCoordsInput(this.currentWarpX, this.currentWarpY);
    } else if (this.coordYSelected) {
      this.blockClearWarpInput = true;
      // Decrement currentWarpY and ensure it stays within "00" to "99"
      let currentWarpY = (parseInt(this.currentWarpY, 10) - 1 + 100) % 100;
      this.currentWarpY = String(currentWarpY).padStart(2, '0');
      this.displayWarpCoordsInput(this.currentWarpX, this.currentWarpY);
    } else if (this.items.length > 1) {
      // Original decrement logic
      this.blockClearWarpInput = false;
      this.currentlySelectedId = (this.currentlySelectedId == 0 ? this.items.length - 1 : --this.currentlySelectedId);
      this.selectorSprite.position.y = 30 + (this.currentlySelectedId * (this.selectedMetabot && !this.selectedPart ? 20 : 10));
    }
  }

  private handleKeyboardInput(root: GameObject, input: Input) {  
    if (input?.verifyCanPressKey()) {
      if (input?.keys["Space"] && !this.blockSelection) { 
        if (this.items[this.currentlySelectedId] === "Exit") {
          events.emit("START_PRESSED");
        }
        else if (this.items[this.currentlySelectedId] === "Warping") {
          this.displayWatchMenu();
        }
        else if (this.items[this.currentlySelectedId] === "Journal") {
          this.displayJournalMenu();
        }
        else if (this.items[this.currentlySelectedId] === "Warp") {
          events.emit("START_PRESSED");
          events.emit("WARP", { x: this.currentWarpX, y: this.currentWarpY });
        }
        else if (this.items[this.currentlySelectedId] === "Warp Coords Input") {
          this.displayWarpCoordsInput("00", "00");
        }
        else if (this.items[this.currentlySelectedId].includes("Warp to exit:")) {
          const coords = this.items[this.currentlySelectedId].replace("Warp to exit:", "").trim();
          const x = parseInt(coords.split(',')[0].trim()) / 16;
          const y = parseInt(coords.split(',')[1].trim()) / 16; 
          events.emit("START_PRESSED");
          events.emit("WARP", { x: x, y: y });
        } 
        else if (this.items[this.currentlySelectedId] === "Dead") {
          events.emit("ALERT", "Repair the bot to deploy it first.");
          this.blockSelectionTimeout();
        }
        else if (this.items[this.currentlySelectedId] === "Call Back" && this.selectedMetabot) {
          if (this.selectedMetabot != undefined) {
            events.emit("CALL_BOT_BACK", { bot: this.selectedMetabot });
            this.selectedMetabot.isDeployed = false;
            events.emit("START_PRESSED");
          }
        }
        else if (this.items[this.currentlySelectedId] === "Deploy" && this.selectedMetabot) {
          if (this.selectedMetabot != undefined) {
            if (this.selectedMetabot.hp <= 0) {
              events.emit("ALERT", "Deploy failed. Repair the bot to deploy it first.");
            } else {
              events.emit("DEPLOY", { metaHero: (root as Main).metaHero, bot: this.selectedMetabot });
              this.selectedMetabot.isDeployed = true;
            }
            events.emit("START_PRESSED");
          }
        }
        else if (this.items[this.currentlySelectedId] === `X ${this.currentWarpX}, Y ${this.currentWarpY}`) {
          let set = false;
          if (this.coordXSelected) {
            this.coordYSelected = true;
            this.coordXSelected = false;
            this.selectorSprite.position.x = 30 + (this.selectorSprite.position.x);
            set = true;
          } else if (this.coordYSelected) {
            this.coordYSelected = false;
            this.coordXSelected = false;
            this.selectorSprite.position.x = this.selectorSprite.position.x - 50;
            set = true;
          }
          if (!this.coordXSelected && !this.coordYSelected && !set) {
            this.coordXSelected = true;
            this.selectorSprite.position.x = 20 + (this.selectorSprite.position.x);
          }
        }
        else if (this.items[this.currentlySelectedId] === "Back" || (this.selectedMetabot && this.currentlySelectedId == this.metabotPartItems.length)) {
          if (this.selectedMetabot && !this.selectedMetabotId && this.selectedMetabot.hp > 0) {
            this.displayMetabots();
          } else if (this.selectedMetabotId && this.selectedPart && this.selectedMetabotForParts) {
            this.displayMetabot(this.selectedMetabotForParts);
          }
          else {
            this.displayStartMenu();
          } 
          this.blockSelectionTimeout();
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
            const stats = typeof bot.stats === "string"
              ? JSON.parse(bot.stats) as MetaBot
              : bot.stats as MetaBot;

            this.selectedMetabot = stats;
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
      else { 
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

  private blockSelectionTimeout() {
    this.blockSelection = true;
    setTimeout(() => {
      this.blockSelection = false;
    }, 500);
  }
}
