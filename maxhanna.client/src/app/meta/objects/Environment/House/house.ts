import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";  
import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";  
export class House extends GameObject { 
  body: Sprite;   

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y), isSolid: true
    })
     
    this.body = new Sprite({
      resource: resources.images["house"],
      position: new Vector2(2, -80),
      frameSize: new Vector2(169, 102),
    });
    this.addChild(this.body);   
  } 
 }
