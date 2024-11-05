import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";  
import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite"; 
import { resources } from "../../../helpers/resources";  

export class GiantTree2 extends GameObject { 
  body: Sprite;  

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y)
    })
    
    this.position = new Vector2(x, y); 
    this.isSolid = true;
    const shadow = new Sprite({
      resource: resources.images["shadow"],
      position: new Vector2(-85,-120),
      scale: new Vector2(2.5,2.2),
      frameSize: new Vector2(32,32)});
    this.addChild(shadow);


    this.body = new Sprite({
      resource: resources.images["giantTree"],
      position: new Vector2(-70, -120),
      frameSize: new Vector2(158, 135),
      isSolid: true 
    });
    this.addChild(this.body);  
  } 
 }
