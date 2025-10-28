import { Vector2 } from "../../../../../services/datacontracts/bones/vector2"; 
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { FLOOR, GameObject } from "../../game-object";
import { snapToGrid } from "../../../helpers/grid-cells";
import { events } from "../../../helpers/events";

export class DroppedItem extends GameObject {  
  item?: any;
  itemLabel = `${this.item?.damageMod} ${this.item?.skill?.name}`;
  itemSkin = "lootbag";
  id = Math.floor(Math.random() * 55000) + 10000;
  objectId = Math.floor(Math.random() * 55000) + 10000;
  preventDestroyTimeout = false;
  constructor(params: { position: Vector2, item?: any, itemLabel?: string, itemSkin?: string, preventDestroyTimeout?: boolean }) {
    super({ 
      position: new Vector2(snapToGrid(params.position.x), snapToGrid(params.position.y)),
      name: params.itemLabel ?? `${params.item?.damageMod} ${params.item?.skill?.name}`,
      forceDrawName: true,
      preventDrawName: false,
      drawLayer: FLOOR,
    })
    this.item = params.item;
    this.itemLabel = params.itemLabel ?? `${this.item?.damageMod} ${this.item?.skill?.name}`;
    this.itemSkin = params.itemSkin ?? "lootbag";
    this.preventDestroyTimeout = params.preventDestroyTimeout ?? false;
    const body = new Sprite({
      objectId: Math.floor(Math.random() * (9999)) * -1,
      resource: resources.images[this.itemSkin],
      name: this.itemLabel ?? "Item",
      frameSize: this.itemSkin.includes("mask") ? new Vector2(32, 32) : new Vector2(15, 15),  
      drawLayer: FLOOR,
      scale: this.itemSkin.includes("lootbag") ? new Vector2(0.5, 0.5) : undefined,
      rotation: Math.floor(Math.random() * 360) + 1,
    });
    this.addChild(body); 
    const shadow = new Sprite({ 
      resource: resources.images["shadow"],  
      drawLayer: FLOOR
    });
    this.addChild(shadow); 
  }
  override ready() {
    if (!this.preventDestroyTimeout) { 
      setTimeout(() => {
        this.destroy();
      }, 60000);
    }
    events.on("HERO_REQUESTS_ACTION", this, (params: { hero: any, objectAtPosition: any }) => {
      if (params.objectAtPosition.id === this.id && params.objectAtPosition.item) {   
        if (this.item && this.item.category) {
          console.log(this.item);
          events.emit("ITEM_PURCHASED", this.item);
        } else {
          events.emit("CHARACTER_PICKS_UP_ITEM", {
            position: params.objectAtPosition.position,
            id: this.id,
            imageName: this.itemSkin,
            hero: params.hero,
            item: params.objectAtPosition.item,
          });
        }
        this.destroy();
      }
    }); 
  } 
 }
