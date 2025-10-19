import { GameObject, HUD } from "./game-object";
import { Sprite } from "./sprite";
import { hexToRgb, resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Vector2 } from "../../../services/datacontracts/bones/vector2";
import { MetaHero } from "../../../services/datacontracts/bones/meta-hero";
import { InventoryItem } from "./InventoryItem/inventory-item";
import { storyFlags, GOT_WATCH, GOT_FIRST_METABOT } from "../helpers/story-flags";
import { StartMenu } from "./Menu/start-menu";
import { MetaBotPart } from "../../../services/datacontracts/bones/meta-bot-part";
import { Character } from "./character";
import { Exit } from "./Environment/Exit/exit";
import { SpriteTextString } from "./SpriteTextString/sprite-text-string";
import { ColorSwap } from "../../../services/datacontracts/bones/color-swap";
export class Inventory extends GameObject {
  nextId: number = parseInt((Math.random() * 19999).toFixed(0));
  items: InventoryItem[] = []; 
  parts: MetaBotPart[] = [];
  currentlySelectedId?: number = undefined;
  startMenu?: StartMenu;
  parentCharacter: MetaHero;
  partyMembers?: { heroId: number, name: string, color?: string }[] = [];
  inventoryRendered = false;
  constructor(config: { character: MetaHero, partyMembers?: { heroId: number, name: string, color?: string }[] }) {
    super({ position: new Vector2(0, 0) });
    this.drawLayer = HUD;
    this.items = [];
    this.parentCharacter = config.character;
    this.partyMembers = config.partyMembers;
     
    this.renderParty();  
  }

  renderParty() {
    // First remove any existing party member items
    this.items = this.items.filter(item => item.category !== "partyMember");
    if (!this.partyMembers || this.partyMembers.length === 0) {
      this.partyMembers = [];
      if (this.parent?.hero?.id) {
        this.partyMembers.push({ heroId: this.parent.hero.id, name: this.parent.hero.name, color: this.parent.hero.color });
      }
      console.log(this.parent?.hero?.id, this.parentCharacter, this.root.level);
    }
   
    console.log("rendering party", this.items, this.partyMembers);
    for (let member of this.partyMembers) {
      let tmpName = member.name;
      let tmpId = member.heroId;
      let tmpColor = member.color;
      
 
      const itemData = {
        id: tmpId,
        image: resources.images["portraits"],
        name: tmpName ?? member.name ?? member.heroId + '',
        colorSwap: tmpColor,
        category: "partyMember"
      } as InventoryItem;
      console.log("pushing item data: ", itemData);
      this.items.push(itemData);
    }

    this.renderInventory();
  }
  override ready() {
    events.on("CHARACTER_PICKS_UP_ITEM", this, (data: { imageName: string, position: Vector2, name: string, hero: any, category: string, stats?: any }) => {
      if (data.hero?.isUserControlled && data.category) {
        const itemData = { id: this.nextId++, image: data.imageName, name: data.name, category: data.category, stats: data.stats } as InventoryItem;
        this.updateStoryFlags(itemData);
        this.items.push(itemData);
      }
    });

    events.on("INVENTORY_UPDATED", this, (data: InventoryItem) => {
      const itemData = {
        id: data.id,
        image: data.category,
        name: data.name,
        category: data.category,
        stats: data.stats
      } as InventoryItem;

      this.updateStoryFlags(itemData);
      this.items.push(itemData);
    });

    events.on("PARTY_INVITE_ACCEPTED", this, (data: { playerId: number, party: { heroId: number, name: string, color?: string }[] }) => {
      if (data.party) {
        for (let member of data.party) {
          const itemData = { 
            id: member.heroId, 
            image: resources.images["portraits"], 
            name: member.name, 
            colorSwap: (member.color ? hexToRgb(member.color) : undefined),
            category: "partyMember"
          } as InventoryItem;
          if (itemData.id != data.playerId && !this.items.find(x => x.id === itemData.id)) {
            this.items.push(itemData);
          }
        }
        this.renderInventory();
      }
    });

    events.on("CLOSE_INVENTORY_MENU", this, (data: any) => {
      this.closeStartMenu()
    });

    events.on("OPEN_START_MENU", this, (data: {exits : Exit[], location: Vector2}) => {
      if (this.closeStartMenu()) return; 
      this.children.forEach((child:any) => {
        child.destroy();
      });
      this.startMenu = new StartMenu({ inventoryItems: this.items, metabotParts: this.parts, exits: data.exits, location: data.location });
      this.addChild(this.startMenu);  
      events.emit("HERO_MOVEMENT_LOCK"); 
    });


    events.on("SPACEBAR_PRESSED", this, (data: any) => {
      if (this.getCurrentlySelectedItem().toLowerCase() == "watch") {
        events.emit("REPOSITION_SAFELY");
        this.deselectSelectedItem();
      }
    });
 
    events.on("END_FIGHT", this, () => {
      this.preventDraw = false;
    });
  }

  closeStartMenu() {
    if (this.startMenu) {
      this.removeChild(this.startMenu);
      this.startMenu.destroy(); 
      this.startMenu = undefined;
      events.emit("HERO_MOVEMENT_UNLOCK");
      this.renderParty();
      return true;
    } return false;
  }

  getCurrentlySelectedItem() {
    return this.items.find(x => x.id == this.currentlySelectedId)?.name ?? "";
  }

  renderInventory() {
    // Clear existing children
    this.children.forEach((child: any) => child.destroy());

    // Constants for layout
    const PORTRAIT_X = 4;
    const PORTRAIT_SIZE = 16;
    const TEXT_X = PORTRAIT_X;  
    const ROW_HEIGHT = 20;
    const START_Y = 8;
    let count = 0;
    this.items.forEach((item, index) => {
      if (item.category !== "partyMember") return;
      const color = this.partyMembers?.find(x => x.heroId == item.id)?.color as any;
      let tmpColor = color == undefined ? undefined 
        : color instanceof ColorSwap ? color 
        : new ColorSwap([0, 160, 200], hexToRgb(color));
      console.log("creating portrait with color: ", color, item, this.parentCharacter);
      // Create portrait sprite
      const sprite = new Sprite({
        objectId: item.id,
        resource: resources.images["portraits"],
        vFrames: 1,
        hFrames: 1,
        frame: 0, // You might want to set this based on hero ID
        drawLayer: HUD,
        colorSwap: tmpColor,
        position: new Vector2(PORTRAIT_X, START_Y + (count * ROW_HEIGHT)),
        frameSize: new Vector2(PORTRAIT_SIZE, PORTRAIT_SIZE)
      });
      this.addChild(sprite);

      // Create text using SpriteTextString
      const displayName = item.name ?? "Player";
      const txtsprite = new SpriteTextString(
        displayName,
        new Vector2(TEXT_X, START_Y + (count * ROW_HEIGHT) - 6),
        "White"
      );
      const txtsprite2 = new SpriteTextString(
        displayName,
        new Vector2(TEXT_X+1, START_Y + 1 + (count * ROW_HEIGHT) - 6),
        "Black"
      );
      count++;
      this.addChild(txtsprite);
      this.addChild(txtsprite2);
    });

    this.inventoryRendered = true;
  }

  removeFromInventory(id: number) {
    console.log("remove from inv"); 
    this.items = this.items.filter(x => x.id !== id);
   // this.renderInventory(blockPartyRender:);
  }

  getItemsFound() {
    const itemsFound = this.items;
    const itemsFoundNames = [];
    for (let item of itemsFound) {
      if (item.name && item.name != undefined) {
        itemsFoundNames.push(item.name);
      }
    }
    return itemsFoundNames;
  } 
  override destroy() {
    console.log("destroy  inv");
    events.unsubscribe(this); 
    this.startMenu?.destroy();
    super.destroy();
  }
   

  private updateStoryFlags(itemData: InventoryItem) {
    if (itemData.category === "watch" && !storyFlags.contains(GOT_WATCH)) { storyFlags.add(GOT_WATCH); }
    else if (itemData.category === "botFrame" && !storyFlags.contains(GOT_FIRST_METABOT)) { storyFlags.add(GOT_FIRST_METABOT); } 
  }

  private deselectSelectedItem() {
    this.children.forEach((x: any) => x.isItemSelected = false);
    this.currentlySelectedId = undefined;
  }
}
