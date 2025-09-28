import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { GameObject } from "../../game-object";
import { events } from "../../../helpers/events";

export class Sign extends GameObject {  
  text: string[] = [];
  body?: Sprite;
  heroName?: string;
  constructor(params: { position: Vector2, text?: string[], flipX?: boolean, flipY?: boolean }) {
    super({ 
      position: params.position,
      isSolid: true,
      name: "Sign",
    })
    this.text = params.text ?? ["You are here."];
    
    this.body = new Sprite({
      objectId: -1231,
      resource: resources.images["sign"], 
      frameSize: new Vector2(16, 18),
      isSolid: true,
      flipX: params.flipX, 
    });
    this.addChild(this.body); 

    events.on("HERO_REQUESTS_ACTION", this, (params: { hero: any, objectAtPosition: any }) => {
      if (params.objectAtPosition.body?.objectId === this.body?.objectId) {
        if (this.text[0] == "Home" && params.hero.name) {
          this.text = [`${params.hero.name}'s Home`];
        } 
      }
    });
  }
   
  override getContent() { 
    return {
      portraitFrame: 0,
      string: this.text,
      canSelectItems: false,
      addsFlag: undefined
    }
  }
 }
