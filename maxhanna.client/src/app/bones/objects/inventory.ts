import { GameObject, HUD } from "./game-object";
import { Sprite } from "./sprite";
import { defaultRGB, hexToRgb, resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Vector2 } from "../../../services/datacontracts/bones/vector2";
import { MetaHero } from "../../../services/datacontracts/bones/meta-hero";
import { InventoryItem } from "./InventoryItem/inventory-item";
import { storyFlags, GOT_WATCH, GOT_FIRST_METABOT } from "../helpers/story-flags";
import { StartMenu } from "./Menu/start-menu";
import { HeroInventoryItem } from "../../../services/datacontracts/bones/hero-inventory-item";
import { Exit } from "./Environment/Exit/exit";
import { SpriteTextString } from "./SpriteTextString/sprite-text-string";
import { ColorSwap } from "../../../services/datacontracts/bones/color-swap"; 
import { PartyMember } from "../../../services/datacontracts/bones/party-member";
export class Inventory extends GameObject {
  nextId: number = parseInt((Math.random() * 19999).toFixed(0));
  items: InventoryItem[] = [];
  parts: HeroInventoryItem[] = [];
  currentlySelectedId?: number = undefined;
  startMenu?: StartMenu;
  parentCharacter: MetaHero;
  partyMembers?: PartyMember[] = [];
  inventoryRendered = false;
  constructor(config: { character: MetaHero, partyMembers?: PartyMember[] }) {
    super({ position: new Vector2(0, 0), drawLayer: HUD });
    this.items = [];
    this.parentCharacter = config.character;
    this.partyMembers = config.partyMembers;

    this.renderParty();
  }

  renderParty() {
    // First remove any existing party member items
    this.items = this.items.filter(item => item.category !== "partyMember");

    // Defensive: ensure partyMembers is an array and only contains valid entries
    if (!Array.isArray(this.partyMembers)) {
      this.partyMembers = [];
    }
    // Filter out any malformed entries that don't have a heroId
    this.partyMembers = this.partyMembers.filter((pm: any) => pm && (typeof pm.heroId !== 'undefined'));

    if (this.partyMembers.length === 0) {
      if (this.parent?.hero?.id) {
        this.partyMembers.push({
          heroId: this.parent.hero.id,
          name: this.parent.hero.name,
          color: this.parent.hero.color,
          type: (this.parent.hero.type ?? 'knight'),
          level: this.parent.hero.level ?? 1,
          hp: this.parent.hero.hp ?? 100,
          map: this.parent.hero.map,
          exp: this.parent.hero.exp ?? 0
        } as PartyMember);
      }
    }
    
    for (let member of this.partyMembers) {
      const itemData = {
        id: member.heroId,
        image: "portraits",
        name: member.name,
        colorSwap: (member.color ? hexToRgb(member.color) : new ColorSwap(defaultRGB, defaultRGB)),
        category: "partyMember"
      } as InventoryItem;
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

    events.on("PARTY_INVITE_ACCEPTED", this, (data: { playerId: number, party: PartyMember[] }) => {
      if (data.party) {
        for (let member of data.party) {
          const existing = this.partyMembers?.find(x => x.heroId === member.heroId);
          if (!existing) {
            (this.partyMembers as any).push(member);
          } else {
            // Update existing member with latest data from party
            Object.assign(existing, member);
          }
          const itemData = {
            id: member.heroId,
            image: "portraits",
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

    events.on("OPEN_START_MENU", this, (data: { exits: Exit[], location: Vector2 }) => {
      if (this.closeStartMenu()) return;
      this.children.forEach((child: any) => {
        child.destroy();
      });
      this.startMenu = new StartMenu({ inventoryItems: this.items, heroInventoryItems: this.parts, exits: data.exits, location: data.location });
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
      const pm = this.partyMembers?.find(x => x.heroId == item.id);
      const color = pm?.color as any;
      let tmpColor = color == undefined ? undefined
        : color instanceof ColorSwap ? color
          : new ColorSwap(defaultRGB, hexToRgb(color));
      
      // Determine portrait frame by hero type: rogue=0, knight=1, magi=2
      let frameIndex = 1; // default to knight
      const heroType = (pm?.type ?? 'knight').toLowerCase();
      if (heroType === 'rogue') frameIndex = 0;
      else if (heroType === 'knight') frameIndex = 1;
      else if (heroType === 'magi') frameIndex = 2;

      const sprite = new Sprite({
        objectId: item.id,
        resource: resources.images["portraits"],
        vFrames: 1,
        hFrames: 3,
        frame: frameIndex,
        drawLayer: HUD,
        colorSwap: tmpColor,
        position: new Vector2(PORTRAIT_X, START_Y + (count * ROW_HEIGHT)),
        frameSize: new Vector2(PORTRAIT_SIZE, PORTRAIT_SIZE)
      });
      this.addChild(sprite);

      // Create text using SpriteTextString
      const levelSuffix = (pm && typeof pm.level === 'number' && pm.level > 0) ? ` (Lv ${pm.level})` : '';
      const displayName = (item.name ?? "Player") + levelSuffix;
      const txtsprite = new SpriteTextString(
        displayName,
        new Vector2(TEXT_X, START_Y + (count * ROW_HEIGHT) - 6),
        "White"
      );
      const txtsprite2 = new SpriteTextString(
        displayName,
        new Vector2(TEXT_X + 1, START_Y + 1 + (count * ROW_HEIGHT) - 6),
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
