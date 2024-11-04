import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";  
import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite"; 
import { resources } from "../../../helpers/resources";  

export class StoneCircle extends GameObject { 
  body: Sprite;  

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y)
    })
    
    this.position = new Vector2(x, y); 
    this.isSolid = true 

    this.body = new Sprite({
      resource: resources.images["stoneCircle"],
      position: new Vector2(-120, -110),
      frameSize: new Vector2(250, 250),
      isSolid: true 
    });
    this.addChild(this.body);
    this.drawLayer = "FLOOR";
  } 
 }
