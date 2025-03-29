import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite";
import { gridCells } from "../../../helpers/grid-cells";
import { Animations } from "../../../helpers/animations";
import { resources } from "../../../helpers/resources";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { FOUNTAIN_ANIMATION } from "./fountain-animations";
import { GameObject } from "../../game-object";

export class Fountain extends GameObject {   
  walls: Set<string> = new Set<string>();
  constructor(params: { position: Vector2, preventDraw?: boolean  }) {
    super({
      position: params.position, 
      isSolid: true,
      name: "Fountain",
      preventDraw: params.preventDraw, 
    })
    
    const body = new Sprite({
      objectId: Math.floor(Math.random() * (9999)) * -1, 
      resource: resources.images["fountain"],
      name: "Fountain",
      position: new Vector2(0, -28),
      frameSize: new Vector2(64, 55),
      hFrames: 6,
      vFrames: 1,
      animations: new Animations({
          fountainAnimation: new FrameIndexPattern(FOUNTAIN_ANIMATION), 
        }), 
    });
    this.addChild(body); 
    body.animations?.play("fountainAnimation");

    if (!this.preventDraw) {
      const height = gridCells(1);
      const width = gridCells(3);
      for (let y = this.position.y - height; y <= this.position.y; y += gridCells(1)) {
        this.walls.add(`${this.position.x},${y}`);
        this.walls.add(`${this.position.x + width},${y}`);
      }
      for (let x = this.position.x; x <= this.position.x + width; x++) {
        this.walls.add(`${x},${this.position.y - height}`);
        this.walls.add(`${x},${this.position.y}`);
      }
    } 
  }

  override ready() {
    this.walls.forEach(x => {
      this.parent.walls.add(x);
    });
  }
   
  override getContent() {  
    return {
      portraitFrame: 0,
      string: ["What a splendid fountain!"],
      canSelectItems: false,
      addsFlag: undefined,
    }
  }
 }
