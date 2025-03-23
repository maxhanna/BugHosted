import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { Scenario } from "../../../helpers/story-flags";
import { FLOOR, GameObject } from "../../game-object";
import { snapToGrid } from "../../../helpers/grid-cells";

export class DroppedItem extends GameObject {  
  item?: any;
  constructor(params: { position: Vector2, item?: any }) {
    super({
      position: new Vector2(snapToGrid(params.position.x), snapToGrid(params.position.y)),
      name: "Apple",
      forceDrawName: true,
      preventDrawName: false,
      drawLayer: FLOOR,
    })

    const body = new Sprite({
      objectId: Math.floor(Math.random() * (9999)) * -1,
      resource: resources.images["apple"],
      name: this.item?.partName ?? "Apple", 
      frameSize: new Vector2(5, 7),
      offsetX: 6,
      offsetY: 8,
      drawLayer: FLOOR,
    });
    this.addChild(body); 
    const shadow = new Sprite({ 
      resource: resources.images["shadow"], 
      frameSize: new Vector2(5, 7),
      offsetX: 6,
      offsetY: 8,
      drawLayer: FLOOR
    });
    this.addChild(shadow);
     
  } 
   
  override getContent() {  
    return {
      portraitFrame: 0,
      string: ["You found an item!"],
      canSelectItems: false,
      addsFlag: undefined,
    } as Scenario;
  }
 }
