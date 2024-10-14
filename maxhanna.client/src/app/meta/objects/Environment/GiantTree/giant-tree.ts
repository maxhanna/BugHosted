import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";  
import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite"; 
import { resources } from "../../../helpers/resources";  

export class GiantTree extends GameObject { 
  body: Sprite;  

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y)
    })
    
    this.position = new Vector2(x, y); 
    this.isSolid = true;
    this.body = new Sprite({
      resource: resources.images["tree"],
      position: new Vector2(-50, -100),
      frameSize: new Vector2(128, 128)
    });
    this.addChild(this.body);  
  } 
 }
