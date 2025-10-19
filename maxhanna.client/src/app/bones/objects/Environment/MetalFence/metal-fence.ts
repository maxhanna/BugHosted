import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { BASE, FLOOR, GameObject, HUD } from "../../game-object";

export class MetalFence extends GameObject {  
 
  constructor(params: {position: Vector2, type?: number, offsetX?: number, offsetY?: number}) {
    super({
      position: params.position,
      name: "MetalFence",
      forceDrawName: false,
      preventDrawName: true,
      drawLayer: HUD,
      isSolid: true
    })

    const body = new Sprite({
      objectId: Math.floor(Math.random() * (9999)) * -1,
      resource: resources.images["metalfence"],
      name: "MetalFence", 
      hFrames: 3,
      vFrames: 1,
      frame: params.type ?? 0,
      frameSize: new Vector2(32, 16), 
      drawLayer: FLOOR,
      offsetX: params.offsetX,
      offsetY: params.offsetY,
    });
    this.addChild(body);  

    const shadow = new Sprite({
      resource: resources.images["shadow"],
      frameSize: new Vector2(32, 32),
      drawLayer: BASE, 
      scale: new Vector2(2, 1),
      offsetX: (params.offsetX ?? 0) - 32,
      offsetY: (params.offsetY ?? 0) - 10,
    });
    this.addChild(shadow); 
  }  
 }
