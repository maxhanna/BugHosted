import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { BASE, FLOOR, GameObject } from "../../game-object";

export class Lockers extends GameObject {  
 
  constructor(params: {position: Vector2, type?: number, offsetX?: number, offsetY?: number}) {
    super({
      position: params.position,
      name: "Lockers",
      forceDrawName: false,
      preventDrawName: true,
      drawLayer: FLOOR,
    })

    const body = new Sprite({
      objectId: Math.floor(Math.random() * (9999)) * -1,
      resource: resources.images["lockers"],
      name: "Lockers", 
      hFrames: 4,
      vFrames: 1,
      frame: params.type ?? 0,
      frameSize: new Vector2(32, 36), 
      drawLayer: FLOOR,
      offsetX: params.offsetX,
      offsetY: params.offsetY,
    });
    this.addChild(body);  

    const shadow = new Sprite({
      resource: resources.images["shadow"],
      frameSize: new Vector2(32, 32),
      drawLayer: BASE,
      scale: new Vector2(2, 2),
      offsetX: (params.offsetX ?? 0) - 32,
      offsetY: (params.offsetY ?? 0) - 76,
    });
    this.addChild(shadow); 
  }  
 }
