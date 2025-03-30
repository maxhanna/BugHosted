import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { FLOOR, GameObject, GROUND } from "../../game-object";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { gridCells } from "../../../helpers/grid-cells";

export class StoneRoad extends GameObject {
  body: Sprite;

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y),
      drawLayer: GROUND,
      isSolid: true
    })

    this.body = new Sprite({
      objectId: 0,
      resource: resources.images["stoneroad"],
      position: new Vector2(0, 0),
      frameSize: new Vector2(64, 64)
    });
    this.addChild(this.body);
  }
}
