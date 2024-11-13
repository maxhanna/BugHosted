import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";  
import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";  
export class HouseSide extends GameObject { 
  body: Sprite;   

  constructor(params:{ position: Vector2 }) {
    super({
      position: params.position, isSolid: true
    })
     
    this.body = new Sprite({
      resource: resources.images["houseSide"],
      position: new Vector2(2, -80),
      frameSize: new Vector2(169, 102),
    });
    this.addChild(this.body);   
  } 
 }
