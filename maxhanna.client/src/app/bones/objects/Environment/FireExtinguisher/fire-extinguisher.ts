import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { FLOOR, GameObject } from "../../game-object";

export class FireExtinguisher extends GameObject {  
 
  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y),
      name: "FireExtinguisher",
      forceDrawName: false,
      preventDrawName: true,
      drawLayer: FLOOR,
    })

    const body = new Sprite({
      objectId: Math.floor(Math.random() * (9999)) * -1,
      resource: resources.images["fireextinguisher"],
      name: "FireExtinguisher", 
      frameSize: new Vector2(13, 21), 
      drawLayer: FLOOR,
    });
    this.addChild(body); 
    const shadow = new Sprite({ 
      resource: resources.images["shadow"], 
      frameSize: new Vector2(32, 32), 
      drawLayer: FLOOR,
      offsetX: -8,
      offsetY: -7,
    });
    this.addChild(shadow); 
  }  
 }
