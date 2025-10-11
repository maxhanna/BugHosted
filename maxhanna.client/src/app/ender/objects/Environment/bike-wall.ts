import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { Sprite } from "../sprite";
import { resources } from "../../helpers/resources";
import { FLOOR, GameObject } from "../game-object";
import { snapToGrid } from "../../helpers/grid-cells";
import { ColorSwap } from "../../../../services/datacontracts/meta/color-swap";
import { Fire } from "../Effects/Fire/fire";

export class BikeWall extends GameObject {
  heroId: number;
  constructor(params: { position: Vector2, colorSwap?: ColorSwap, heroId: number }) {
    const pos = new Vector2(snapToGrid(params.position.x), snapToGrid(params.position.y),);
    super({
      position: pos,
      drawLayer: FLOOR,
      isSolid: false,
      preventDrawName: true,
      name: "bike-wall",
      colorSwap: params.colorSwap
    });
    this.heroId = params.heroId;
    // keep a reference to colorSwap on the GameObject for any child elements
    if (params.colorSwap) this.colorSwap = params.colorSwap;

    const body = new Sprite({
      resource: resources.images["bikewall"],
      frameSize: new Vector2(32, 32),
      drawLayer: FLOOR,
      name: "bike-wall",
      offsetY: -16,
      colorSwap: params.colorSwap
    });
    this.addChild(body);
  }

  override destroy() {
    const fire = new Fire(this.position.x, this.position.y);
    this.parent?.children.push(fire);
    setTimeout(() => {
      fire.destroy();
      super.destroy();
    }, 1200);
  }
}
