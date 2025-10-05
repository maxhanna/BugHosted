import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { GameObject, HUD } from "../../game-object";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { gridCells } from "../../../helpers/grid-cells";
export class Stand extends GameObject {
  body: Sprite;
  walls: Set<string> = new Set<string>();

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y), isSolid: true, drawLayer: HUD
    })

    // original stand graphic removed; render a small neutral text-box like sprite as placeholder
    this.body = new Sprite({
      objectId: -100234,
      resource: resources.images["textBox"],
      position: new Vector2(2, 0),
      frameSize: new Vector2(64, 24),
      offsetY: 5,
      drawLayer: HUD
    });
    this.addChild(this.body);

    const height = this.roundToNearest(this.body.frameSize.y, 16) - gridCells(1);
    const width = this.roundToNearest(this.body.frameSize.x, 16) - gridCells(1);
    const startY = this.position.y;
    for (let y = startY; y < this.position.y + height; y += gridCells(1)) {
      this.walls.add(`${this.position.x},${y}`);
      this.walls.add(`${this.position.x + width},${y}`);
    }
    for (let x = this.position.x; x <= this.position.x + width; x++) { 
      this.walls.add(`${x},${this.position.y + height}`);
      this.walls.add(`${x},${this.position.y}`); 
    }
  }
  roundToNearest = (value: number, multiple: number) => {
    return Math.floor(value / multiple) * multiple;
  };
  override ready() {
    this.walls.forEach(x => {
      this.parent.walls.add(x);
    });
  }
}
