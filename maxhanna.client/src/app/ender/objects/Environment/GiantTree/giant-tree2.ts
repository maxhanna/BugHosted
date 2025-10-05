import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";  
import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite"; 
import { resources } from "../../../helpers/resources";  

export class GiantTree2 extends GameObject { 
  body: Sprite;  

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y), isSolid: true
    })
      
    const shadow = new Sprite({
      resource: resources.images["shadow"],
      position: new Vector2(-85,-120),
      scale: new Vector2(2.5,2.2),
      frameSize: new Vector2(32,32)});
    this.addChild(shadow);


    // giantTree asset removed; use shadow as a neutral placeholder
    this.body = new Sprite({
      resource: resources.images["shadow"],
      position: new Vector2(-16, -16),
      frameSize: new Vector2(32, 32),
      isSolid: false 
    });
    this.addChild(this.body);  
  } 
 }
