import { GameObject } from "./game-object";
import { Sprite } from "./sprite";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { MetaHero } from "../../../services/datacontracts/meta/meta-hero";
import { InventoryItem } from "./InventoryItem/inventory-item";
import { storyFlags, GOT_WATCH, GOT_FIRST_METABOT } from "../helpers/story-flags";
export class Inventory extends GameObject {
  nextId: number = parseInt((Math.random() * 19999).toFixed(0));
  items: InventoryItem[] = [];
  currentlySelectedId?: number = undefined;
  constructor() {
    super({ position: new Vector2(0, 0) });
    this.drawLayer = "HUD";
    this.items = [
      //{
      //  id: -1,
      //  image: resources.images["watch"],
      //  name: "Watch"
      //},
    ]

    //React to picking up an item
    events.on("HERO_PICKS_UP_ITEM", this, (data: { imageName: string, position: Vector2, name: string, hero: any, category: string, stats?: any }) => { 
      if (data.hero?.isUserControlled) {
        const itemData = { id: this.nextId++, image: data.imageName, name: data.name, category: data.category, stats: data.stats } as InventoryItem;
        this.updateStoryFlags(itemData);
        this.items.push(itemData);

        //Show on the screen.
        this.renderInventory();
      }
    });

    events.on("INVENTORY_UPDATED", this, (data: InventoryItem) => {
      const itemData = {
        id: data.id, image: data.category, name: data.name, category: data.category, stats: data.stats
      } as InventoryItem;

      this.updateStoryFlags(itemData);
      this.items.push(itemData);

      this.renderInventory();
    });

    events.on("PARTY_INVITE_ACCEPTED", this, (data: { playerId: number, party: MetaHero[] }) => {
      if (data.party) {
        for (let member of data.party) {
          const itemData = { id: member.id, image: resources.images["hero"], name: member.name, category: "partyMember" } as InventoryItem;
          if (itemData.id != data.playerId) {
            this.items.push(itemData);
          }
        }
        this.renderInventory();
      }
    });

    events.on("START_PRESSED", this, (data: any) => {
      if (!this.items || this.items.length === 0) return;
      let currentId = undefined;
      let itemIndex = this.children.findIndex((x: any) => x.isItemSelected);
      if (itemIndex > -1) {
        this.children[itemIndex].isItemSelected = false;
        itemIndex++;
        const nextItem = this.children[itemIndex];
        if (nextItem) {
          nextItem.isItemSelected = true;
          currentId = nextItem.objectId;
        } else {
          itemIndex = 0;
        }
      } else if (this.children && this.children.length > 0) {
        this.children[0].isItemSelected = true;
        currentId = this.children[0].objectId;
        itemIndex = 0;
      }
      this.currentlySelectedId = currentId;
    });


    events.on("SPACEBAR_PRESSED", this, (data: any) => {
      if (this.getCurrentlySelectedItem().toLowerCase() == "watch") {
        events.emit("REPOSITION_SAFELY");
        this.deselectSelectedItem();
      }
    });
    //DEMO of removing an item from inventory
    //setTimeout(() => {
    //  this.removeFromInventory(-2);
    //}, 1000);
    this.renderInventory();
  }


  getCurrentlySelectedItem() {
    return this.items.find(x => x.id == this.currentlySelectedId)?.name ?? "";
  }

  renderInventory() {
    //remove stale drawings
    this.children.forEach((child: any) => child.destroy());

    this.items.forEach((item, index) => {
      const sprite = new Sprite(
        { objectId: item.id, resource: resources.images[item.image], position: new Vector2(index * 24, 2), frameSize: new Vector2(24, 22) }
      );
      this.addChild(sprite);
    })
  }

  removeFromInventory(id: number) {
    this.items = this.items.filter(x => x.id !== id);
    this.renderInventory();
  }

  getItemsFound() {
    const itemsFound = this.items;
    const itemsFoundNames = [];
    for (let item of itemsFound) {
      if (item.name) {
        itemsFoundNames.push(item.name);
      }
    }
    return itemsFoundNames;
  }
  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    this.drawItemSelectionBox(ctx);  //Draws a red box around the currently selected inventory item;
  }

  private drawItemSelectionBox(ctx: CanvasRenderingContext2D) {
    const selectedChild = this.children.find((x: any) => x.isItemSelected);
    if (selectedChild) {
      const drawPos = selectedChild.position.duplicate();

      // Set the style for the corner markers
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;

      const width = 22;
      const height = 24;
      const cornerSize = 5;

      // Top-left corner
      ctx.beginPath();
      ctx.moveTo(drawPos.x, drawPos.y);
      ctx.lineTo(drawPos.x + cornerSize, drawPos.y);
      ctx.moveTo(drawPos.x, drawPos.y);
      ctx.lineTo(drawPos.x, drawPos.y + cornerSize);
      ctx.stroke();

      // Top-right corner
      ctx.beginPath();
      ctx.moveTo(drawPos.x + width, drawPos.y);
      ctx.lineTo(drawPos.x + width - cornerSize, drawPos.y);
      ctx.moveTo(drawPos.x + width, drawPos.y);
      ctx.lineTo(drawPos.x + width, drawPos.y + cornerSize);
      ctx.stroke();

      // Bottom-left corner
      ctx.beginPath();
      ctx.moveTo(drawPos.x, drawPos.y + height);
      ctx.lineTo(drawPos.x + cornerSize, drawPos.y + height);
      ctx.moveTo(drawPos.x, drawPos.y + height);
      ctx.lineTo(drawPos.x, drawPos.y + height - cornerSize);
      ctx.stroke();

      // Bottom-right corner
      ctx.beginPath();
      ctx.moveTo(drawPos.x + width, drawPos.y + height);
      ctx.lineTo(drawPos.x + width - cornerSize, drawPos.y + height);
      ctx.moveTo(drawPos.x + width, drawPos.y + height);
      ctx.lineTo(drawPos.x + width, drawPos.y + height - cornerSize);
      ctx.stroke();
    }
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
