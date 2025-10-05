import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { FLOOR, GameObject } from "../../game-object";

export class Mop extends GameObject {  
 
  constructor(params: {position: Vector2, offsetX?: number, offsetY?: number}) {
    super({
      position: params.position,
      name: "Mop",
      forceDrawName: false,
      preventDrawName: true,
      drawLayer: FLOOR,
    })

    const body = new Sprite({
      objectId: Math.floor(Math.random() * (9999)) * -1,
      // mop image removed; use a shadow tile so object still renders
      resource: resources.images["shadow"],
      name: "Mop",  
      frameSize: new Vector2(32, 32), 
      drawLayer: FLOOR,
      offsetX: params.offsetX,
      offsetY: params.offsetY,
    });
    this.addChild(body); 
    const shadow = new Sprite({ 
      resource: resources.images["shadow"], 
      frameSize: new Vector2(32, 32), 
      drawLayer: FLOOR,
      offsetX: params.offsetX,
      offsetY: (params.offsetY ?? 0) + 8,
    });
    this.addChild(shadow);  
  }  
 }
