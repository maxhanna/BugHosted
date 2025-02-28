import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { GameObject } from "../../game-object";

export class Sign extends GameObject {  
  text: string = "";
  body?: Sprite;
  constructor(params: {position: Vector2, text: string }) {
    super({ 
      position: params.position,
      isSolid: true,
      name: "Sign",
    })
    this.text = params.text;
    
    this.body = new Sprite({
      objectId: 0,
      resource: resources.images["sign"], 
      frameSize: new Vector2(16, 18),
      isSolid: true
    });
    this.addChild(this.body); 
  }
   
  override getContent() {  
    return {
      portraitFrame: 0,
      string: [this.text],
      canSelectItems: false,
      addsFlag: undefined
    }
  }
 }
