import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";  
import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";  
export class Stand extends GameObject { 
  body: Sprite;   

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y)
    })
    
    this.isSolid = true; 
    this.body = new Sprite({
      resource: resources.images["stand"],
      position: new Vector2(2, -60),
      frameSize: new Vector2(169, 88),
    });
    this.addChild(this.body);   
  } 
 }
