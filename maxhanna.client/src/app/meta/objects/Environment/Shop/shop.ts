import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";  
import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";  
export class Shop extends GameObject { 
  body: Sprite;   

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y)
    })
    
    this.isSolid = true; 
    this.body = new Sprite(
      0,
      resources.images["shop"],
      new Vector2(2, -100),
      new Vector2(1, 1),
      undefined,
      new Vector2(134, 118), 
    );
    this.addChild(this.body);   
  } 
 }
