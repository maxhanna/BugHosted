import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { Scenario } from "../../../helpers/story-flags";
import { FLOOR, GameObject } from "../../game-object";
import { snapToGrid } from "../../../helpers/grid-cells";
import { MetaBotPart } from "../../../../../services/datacontracts/meta/meta-bot-part";
import { events } from "../../../helpers/events";

export class DroppedItem extends GameObject {  
  item?: any;
  itemLabel = `${this.item?.damageMod} ${this.item?.skill?.name}`;
  id = Math.floor(Math.random() * 55000) + 10000;
  objectId = Math.floor(Math.random() * 55000) + 10000;
  constructor(params: { position: Vector2, item?: any }) {
    super({ 
      position: new Vector2(snapToGrid(params.position.x), snapToGrid(params.position.y)),
      name: `${params.item?.damageMod} ${params.item?.skill?.name}`,
      forceDrawName: true,
      preventDrawName: false,
      drawLayer: FLOOR,
    })
    this.item = params.item;
    this.itemLabel = `${this.item?.damageMod} ${this.item?.skill?.name}`;

    const body = new Sprite({
      objectId: Math.floor(Math.random() * (9999)) * -1,
      resource: resources.images["leftArm"],
      name: this.itemLabel ?? "Item", 
      frameSize: new Vector2(6, 17), 
      drawLayer: FLOOR,
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
    setTimeout(() => {
      this.destroy();
    }, 60000);
    events.on("HERO_REQUESTS_ACTION", this, (params: { hero: any, objectAtPosition: any }) => {
      if (params.objectAtPosition.id === this.id && params.objectAtPosition.item) { 
        events.emit("CHARACTER_PICKS_UP_ITEM", {
          position: new Vector2(0, 0),
          id: this.id, 
          imageName: "leftArm",
          hero: params.hero,
          item: params.objectAtPosition.item,
        }); 
        this.destroy();
      }
    }); 
  } 
 }
