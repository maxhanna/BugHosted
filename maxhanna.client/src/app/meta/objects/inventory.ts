import { GameObject } from "./game-object";
import { Sprite } from "./sprite";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Vector2 } from "../../../services/datacontracts/meta/vector2";
export class Inventory extends GameObject {
  nextId: number = Math.random() * 19999;
  items: { id: number; image: any }[] = [];
  currentlySelectedId?: number = undefined;
  constructor() {
    super({ position: new Vector2(0, 0) });
    this.drawLayer = "HUD";
    this.items = [
      {
        id: -1,
        image: resources.images["watch"]
      },
      {
        id: -2,
        image: resources.images["watch"]
      }
    ]

    //React to picking up an item
    events.on("HERO_PICKS_UP_ITEM", this, (data: any) => {
      //Show something on the screen.
      this.items.push(data);
      this.renderInventory();
    });

    events.on("START_PRESSED", this, (data: any) => {
      if (!this.items || this.items.length === 0) return; 
      let itemIndex = this.children.findIndex((x: any) => x.isItemSelected); 
      if (itemIndex > -1) {
        this.children[itemIndex].isItemSelected = false;
        itemIndex++;
        const nextItem = this.children[itemIndex];
        if (nextItem) {
          nextItem.isItemSelected = true;
        } else { 
          itemIndex = 0;
        }
      } else if (this.children && this.children.length > 0) {
        this.children[0].isItemSelected = true;
        itemIndex = 0;
      }
      //console.log("current item selected: " + itemIndex); 
    });


    events.on("SPACEBAR_PRESSED", this, (data: any) => {
      console.log("space pressed");
    });
    //DEMO of removing an item from inventory
    //setTimeout(() => {
    //  this.removeFromInventory(-2);
    //}, 1000);
    this.renderInventory();
  }

  renderInventory() {
    //remove stale drawings
    this.children.forEach((child: any) => child.destroy());

    this.items.forEach((item, index) => {
      const sprite = new Sprite(
        item.id, item.image, new Vector2(index * 24, 2), 1, 1, new Vector2(24, 22)
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
