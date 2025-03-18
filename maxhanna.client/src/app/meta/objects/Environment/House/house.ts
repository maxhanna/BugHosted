import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { gridCells } from "../../../helpers/grid-cells";
export class House extends GameObject {
  body: Sprite;
  walls: Set<string> = new Set<string>();
  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y),
      isSolid: true,
      name: "house"
    })

    this.body = new Sprite({
      resource: resources.images["house"],
      position: new Vector2(2, -80),
      frameSize: new Vector2(169, 102),
    });
    this.addChild(this.body);

    const height = gridCells(4);
    const width = gridCells(10);
    for (let y = this.position.y - height; y <= this.position.y; y += gridCells(1)) {
      this.walls.add(`${this.position.x},${y}`);
      this.walls.add(`${this.position.x + width},${y}`);
    }
    for (let x = this.position.x; x <= this.position.x + width; x++) {
      if (x == this.position.x + gridCells(5)) {
        this.walls.add(`${x},${this.position.y - height}`);
      } else {
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
}
