import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { GameObject, GROUND } from "../../game-object";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";

export class StoneRoad extends GameObject {
  body: Sprite;

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y),
      drawLayer: GROUND,
      isSolid: false
    })

    this.body = new Sprite({
      objectId: 0,
      // stoneroad asset removed; use a neutral tile (shadow) as fallback to avoid missing resource
      resource: resources.images["shadow"],
      position: new Vector2(0, 0),
      frameSize: new Vector2(32, 32)
    });
    this.addChild(this.body);
  }
}
