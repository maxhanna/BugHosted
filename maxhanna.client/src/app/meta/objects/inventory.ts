import { GameObject } from "./game-object";
import { Sprite } from "./sprite";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { MetaHero } from "../../../services/datacontracts/meta/meta-hero";
export class Inventory extends GameObject {
  nextId: number = parseInt((Math.random() * 19999).toFixed(0));
  items: { id: number; image: any, name?: string }[] = [];
  currentlySelectedId?: number = undefined;
  constructor() {
    super({ position: new Vector2(0, 0) });
    this.drawLayer = "HUD";
    this.items = [
      {
        id: -1,
        image: resources.images["watch"],
        name: "Watch"
      },
    ]

    //React to picking up an item
    events.on("HERO_PICKS_UP_ITEM", this, (data: { image: any, position: Vector2, name: string, hero: any }) => {
      //Show something on the screen.
      if (data.hero?.isUserControlled) {
        const itemData = { id: this.nextId++, image: data.image, name: data.name };
        this.items.push(itemData);
        this.renderInventory();
      }
    });

    events.on("PARTY_INVITE_ACCEPTED", this, (data: { playerId: number, party: MetaHero[] }) => {
      if (data.party) {
        for (let member of data.party) {
          const itemData = { id: member.id, image: resources.images["hero"], name: member.name };
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
      console.log("current item selected: " + this.currentlySelectedId);
      console.log("current items: ", this.items); 
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

  private deselectSelectedItem() {
      this.children.forEach((x: any) => x.isItemSelected = false);
      this.currentlySelectedId = undefined;
  }

  getCurrentlySelectedItem() {
    return this.items.find(x => x.id == this.currentlySelectedId)?.name ?? "";
  }

  renderInventory() {
    //remove stale drawings
    this.children.forEach((child: any) => child.destroy());

    this.items.forEach((item, index) => {
      const sprite = new Sprite(
        item.id, item.image, new Vector2(index * 24, 2), undefined, undefined, new Vector2(24, 22)
      );
      this.addChild(sprite);
    })
  }

  removeFromInventory(id: number) {
    this.items = this.items.filter(x => x.id !== id);
    this.renderInventory();
  }

  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
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
}
