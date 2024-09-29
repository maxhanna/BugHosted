import { GameObject } from "./game-object";
import { Sprite } from "./sprite";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Vector2 } from "../../../services/datacontracts/meta/vector2";
export class Inventory extends GameObject {
  nextId: number = Math.random() * 19999;
  items: { id: number; image: any }[] = [];

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
      this.items.push({
        id: this.nextId++,
        image: resources.images["watch"]
      })
      this.renderInventory();
    })

    //DEMO of removing an item from inventory
    //setTimeout(() => {
    //  this.removeFromInventory(-2);
    //}, 1000);
    this.renderInventory();
  }

  renderInventory() {
    //remove stale drawings
    this.children.forEach((child : any) => child.destroy());

    this.items.forEach((item, index) => {
      const sprite = new Sprite(
        item.id, item.image, new Vector2(index*24, 2), 1, 1, new Vector2(24, 22) 
      );
      this.addChild(sprite); 
    })
  }

  removeFromInventory(id: number) {
    this.items = this.items.filter(x => x.id !== id);
    this.renderInventory();
  }
}
