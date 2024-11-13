import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";  
import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";  
export class Museum extends GameObject { 
  body: Sprite;   

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y), isSolid: true
    })
     
    this.body = new Sprite({
      resource: resources.images["museum"],
      position: new Vector2(2, -190),
      frameSize: new Vector2(267, 202),
    });
    this.addChild(this.body);   
  } 
 }
