import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";  
import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";  
export class Shop extends GameObject { 
  body: Sprite;   

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y), isSolid: true
    })
     
    this.body = new Sprite({
      resource: resources.images["shop"],
      position: new Vector2(2, -100),
      frameSize: new Vector2(134, 118),
    });
    this.addChild(this.body);   
  } 
 }
