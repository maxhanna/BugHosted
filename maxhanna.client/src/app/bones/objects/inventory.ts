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
import { LevelBadge } from "./InventoryItem/level-badge";
import { calculateWords } from "./SpriteTextString/sprite-font-map";

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
    super({ position: new Vector2(0, 0), drawLayer: HUD, isOmittable: false });
    this.items = [];
    this.parentCharacter = config.character;
    this.partyMembers = config.partyMembers;

    this.renderParty();
  }

  renderParty() {
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

    this.renderAll();
  }
  override ready() {
    // Re-render party list whenever the player changes maps so name styling (same vs different map)
    // and any updated level/hp/map data stays fresh.
    events.on("CHANGE_LEVEL", this, () => {
      try {
        this.renderParty();
      } catch (ex) { console.warn('Inventory CHANGE_LEVEL re-render failed', ex); }
    });

    // New: explicit party re-render trigger when backend detects a party member left the current map fetch set.
    events.on("RENDER_PARTY", this, () => {
      try {
        this.renderParty();
      } catch (ex) { console.warn('Inventory RENDER_PARTY re-render failed', ex); }
    });

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
        }
        this.renderAll();
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

  renderAll() {
    // Clear existing children
    this.children.forEach((child: any) => child.destroy());

    this.renderPartyMembers();
    this.renderMapName();
    this.inventoryRendered = true;
  }

  private renderPartyMembers() {
    // Constants for layout
    const PORTRAIT_X = 4;
    const PORTRAIT_SIZE = 16;
  const TEXT_X = PORTRAIT_X;
    const ROW_HEIGHT = 20;
    const START_Y = 8;
    let count = 0;
    
    if (!this.partyMembers || this.partyMembers.length === 0) return;

    this.partyMembers.forEach((pm, index) => {
      const color = pm.color as any;
      let tmpColor = color == undefined ? undefined
        : color instanceof ColorSwap ? color
          : new ColorSwap(defaultRGB, hexToRgb(color));
      
      // Determine portrait frame by hero type: rogue=0, knight=1, magi=2
      let frameIndex = 1; // default to knight
      const heroType = (pm.type ?? 'knight').toLowerCase();
      switch (heroType) {
        case 'rogue':
          frameIndex = 0;
          break;
        case 'knight':
          frameIndex = 1;
          break;
        case 'magi':
          frameIndex = 2;
          break;
        default:
          frameIndex = 1;
          break;
      }

      const sprite = new Sprite({
        objectId: pm.heroId,
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

      // Draw level badge overlapping bottom-right corner of portrait
      if (typeof pm.level === 'number' && pm.level > 0) {
        // Position badge at bottom-right of portrait (16x16), with slight overlap
        // Badge radius is 5px, so position center at portrait_right - 3px, portrait_bottom - 3px
        const badgeX = PORTRAIT_X + PORTRAIT_SIZE - 8; // 16 - 8 = 8px from left (slight overlap)
        const badgeY = START_Y + (count * ROW_HEIGHT) + PORTRAIT_SIZE - 8; // bottom - 8px (slight overlap)
        const levelBadge = new LevelBadge(pm.level, new Vector2(badgeX, badgeY));
        this.addChild(levelBadge);
      }

      // Create name text
      const displayName = pm.name ?? "Player";
      const yPos = START_Y + (count * ROW_HEIGHT) - 6;
      const xOffset = TEXT_X;
       
      const mainParent = this.parent as any;
      const localHeroId = mainParent?.metaHero?.id ?? mainParent?.hero?.id ?? undefined;
      const isCurrentHero = pm.heroId === localHeroId;
      const localMap = mainParent?.metaHero?.map ?? mainParent?.hero?.map ?? undefined;
      const memberMap = pm.map ?? undefined; 
      
      // Treat undefined memberMap (or localMap) as remote; only same if both defined and equal (case-insensitive)
      const isSameMap = (typeof localMap === 'string' && typeof memberMap === 'string')
        ? (localMap.toUpperCase() === memberMap.toUpperCase())
        : false;

      if (isCurrentHero || isSameMap) {
        const txtsprite = this.createStaticText(displayName, new Vector2(xOffset, yPos), "Black");
        const txtsprite2 = this.createStaticText(displayName, new Vector2(xOffset + 1, yPos + 1), "White");
        this.addChild(txtsprite);
        this.addChild(txtsprite2);
      } else {  // Different map: show only the black variant (use primary position to keep alignment consistent)
        const txtspriteBlackOnly = this.createStaticText(displayName, new Vector2(xOffset, yPos), "Black");
        this.addChild(txtspriteBlackOnly);
      }
      count++;
    });
  }

  private renderMapName() {
    const mainParent = this.parent as any;
    const mapName = mainParent?.metaHero?.map ?? mainParent?.hero?.map ?? "Unknown";
    
    // Compute actual pixel width using same logic as SpriteTextString rendering
    const SPRITE_TEXT_PADDING_LEFT = 27; // internal left padding added by SpriteTextString
    const INTER_WORD_SPACING = 3;        // added after each word (including last) in drawImage
    const CHAR_EXTRA_SPACING = 1;        // added after each character

    const wordsData = calculateWords({ content: mapName, color: "White" });
    let textPixelWidth = 0;
    wordsData.forEach((w, idx) => {
      // word.chars: each has width; draw adds char.width + 1
      w.chars.forEach(ch => {
        textPixelWidth += ch.width + CHAR_EXTRA_SPACING;
      });
      // After each word drawImage adds +3; we'll mimic and later remove trailing
      textPixelWidth += INTER_WORD_SPACING;
    });
    if (textPixelWidth > 0) {
      textPixelWidth -= INTER_WORD_SPACING; // remove trailing spacing after last word
    }

    // Final x position from right edge (canvas width 320)
    const CANVAS_WIDTH = 320;
    const RIGHT_MARGIN = 4;
    const xPos = CANVAS_WIDTH - SPRITE_TEXT_PADDING_LEFT - RIGHT_MARGIN - textPixelWidth;
    const yPos = 4; // keep top margin; SpriteTextString will add its own top padding internally
    
    const mapNameText = this.createStaticText(mapName, new Vector2(xPos, yPos), "Black");
    const mapNameShadow = this.createStaticText(mapName, new Vector2(xPos + 1, yPos + 1), "White");
    
    this.addChild(mapNameShadow);
    this.addChild(mapNameText);
  }

  private createStaticText(content: string, position: Vector2, color: "White" | "Black") {
    // Pass skipAnimation=true to render all characters immediately.
    return new SpriteTextString(content, position, color, undefined, true);
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
