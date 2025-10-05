import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { Sprite } from "../sprite";
import { resources } from "../../helpers/resources";
import { FLOOR, GameObject } from "../game-object";
import { snapToGrid } from "../../helpers/grid-cells";

export class BikeWall extends GameObject {
  constructor(params: { position: Vector2 }) {
    super({
      position: new Vector2(snapToGrid(params.position.x), snapToGrid(params.position.y)),
      drawLayer: FLOOR,
      isSolid: false,
      preventDrawName: true,
      name: "bike-wall",
      
    });

    const body = new Sprite({
      resource: resources.images["bikewall"],
      frameSize: new Vector2(32, 32),
      drawLayer: FLOOR,
      name: "bike-wall",
      offsetY: -8
    });
    this.addChild(body);
  }
}
