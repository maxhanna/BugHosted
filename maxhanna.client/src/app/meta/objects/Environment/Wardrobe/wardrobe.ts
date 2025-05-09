import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";  
import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";  
import { events } from "../../../helpers/events"; 
import { gridCells } from "../../../helpers/grid-cells";
export class Wardrobe extends GameObject { 
  body?: Sprite;
  blockSelection = false;
  walls: Set<string> = new Set<string>();
  constructor(config: { position: Vector2, isVisible?: boolean, isSolid?: boolean }) {
    super({ 
      position: config.position,
      name: "Wardrobe",
      isSolid: config.isSolid ?? true,
    }) 
    if (config.isVisible !== false) {
      this.body = new Sprite({
        objectId: -123123,
        isSolid: this.isSolid,
        resource: resources.images["wardrobe"],
        position: new Vector2(0, -50),
        frameSize: new Vector2(64, 70),
      });
      this.addChild(this.body);   
 
      const height = gridCells(3);
      const width = gridCells(3);
      for (let y = Math.round(this.position.y) - height; y <= Math.round(this.position.y); y += gridCells(1)) {
        this.walls.add(`${this.position.x},${y}`);
        this.walls.add(`${this.position.x + width},${y}`);
      }
      for (let x = this.position.x; x <= this.position.x + width; x++) {
        this.walls.add(`${x},${Math.round(this.position.y) - height}`);
        this.walls.add(`${x},${Math.round(this.position.y)}`);
      }
         
    } 
  }
 
  override ready() {
    this.walls.forEach(x => {
      this.parent.walls.add(x); 
    });

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
