import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";  
import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";  
import { events } from "../../../helpers/events";
export class Wardrobe extends GameObject { 
  body?: Sprite;   

  constructor(config: { position: Vector2, isVisible?: boolean }) {
    super({
      position: config.position
    }) 
    this.isSolid = true;
    if (config.isVisible !== false) {
      this.body = new Sprite({
        resource: resources.images["wardrobe"],
        position: new Vector2(0, -50),
        frameSize: new Vector2(64, 70),
      });
      this.addChild(this.body);   
    } 
  }
  override ready() {
    events.on("SELECTED_ITEM", this, (selectedItem: string) => {
      console.log(selectedItem);
      if (selectedItem === "Change Color") {
        events.emit("CHANGE_COLOR");
      } 
    }); 
  }
  override getContent() {
    return {
      portraitFrame: 0,
      string: ["Change Color", "Cancel"],
      canSelectItems: true,
      addsFlag: null
    }
  }
 }
