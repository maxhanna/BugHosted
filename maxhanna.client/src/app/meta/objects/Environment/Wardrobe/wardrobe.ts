import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";  
import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";  
import { events } from "../../../helpers/events";
import { Scenario } from "../../../helpers/story-flags";
export class Wardrobe extends GameObject { 
  body?: Sprite;
  blockSelection = false; 
  constructor(config: { position: Vector2, isVisible?: boolean }) {
    super({ 
      position: config.position,
      name: "Wardrobe",
    }) 
    this.isSolid = true;
    if (config.isVisible !== false) {
      this.body = new Sprite({
        objectId: -123123,
        resource: resources.images["wardrobe"],
        position: new Vector2(0, -50),
        frameSize: new Vector2(64, 70),
      });
      this.addChild(this.body);   
    } 
  }
  override ready() {
    events.on("SELECTED_ITEM", this, (selectedItem: string) => { 
      if (selectedItem === "Change Color") {
        events.emit("CHANGE_COLOR");
      }
      else if (selectedItem === "Open Wardrobe") {
        if (!this.blockSelection) {
          events.emit("WARDROBE_OPENED");
          this.blockSelection = true;
          setTimeout(() => { this.blockSelection = false }, 500);
        }
      } 
    }); 
  }
  override getContent() {
    return {
      portraitFrame: 0,
      string: ["Change Color", "Open Wardrobe", "Cancel"],
      canSelectItems: true,
      addsFlag: undefined,
    } 
  }
 }
