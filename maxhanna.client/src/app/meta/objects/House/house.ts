import { Vector2 } from "../../../../services/datacontracts/meta/vector2";  
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { Input } from "../../helpers/input";
import { gridCells  } from "../../helpers/grid-cells";  
import { resources } from "../../helpers/resources";  
export class House extends GameObject { 
  body: Sprite;   

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y)
    })
    
    this.isSolid = true; 
    this.body = new Sprite(
      0,
      resources.images["house"],
      new Vector2(0, -80),
      new Vector2(1, 1),
      undefined,
      new Vector2(169, 102), 
    );
    this.addChild(this.body);   
  } 
 }
