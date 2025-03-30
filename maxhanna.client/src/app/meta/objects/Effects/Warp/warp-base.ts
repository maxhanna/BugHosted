import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { BASE, FLOOR, GameObject, GROUND, HUD } from "../../game-object";
import { Animations } from "../../../helpers/animations";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern"; 
import { events } from "../../../helpers/events";
import { WARP_BASE_ANIMATION, WARP_SPIRAL_ANIMATION } from "./warp-base-animations";
import { gridCells } from "../../../helpers/grid-cells";

export class WarpBase extends GameObject {
  body?: Sprite;
  spiral?: Sprite;
  parentId?: number; 

  constructor(params: { position: Vector2, parentId?: number, offsetX?: number, offsetY?: number}) {
    super({
      position: params.position,
      name: "WarpBase",
      isSolid: false,
    });

    this.parentId = params.parentId; 

    this.body = new Sprite({
      position: new Vector2(0, 0),
      objectId: Math.floor(Math.random() * (9999)) * -1,
      resource: resources.images["warpbase"],
      name: "WarpBase",
      frameSize: new Vector2(32, 32),
      vFrames: 1,
      hFrames: 8,
      offsetX: params.offsetX ?? 0,
      offsetY: params.offsetY ?? 0,
      animations: new Animations({
        warpBaseAnimation: new FrameIndexPattern(WARP_BASE_ANIMATION),
      }),
      drawLayer: BASE, 
    });
    this.addChild(this.body);
    this.body.animations?.play("warpBaseAnimation");

    this.spiral = new Sprite({
      position: new Vector2(0, gridCells(1)),
      objectId: Math.floor(Math.random() * (9999)) * -1,
      resource: resources.images["warpspiral"],
      name: "WarpSpiral",
      frameSize: new Vector2(32, 32),
      vFrames: 1,
      hFrames: 8,
      offsetX: params.offsetX ?? 0,
      offsetY: (params.offsetY ?? 0) - gridCells(2),
      animations: new Animations({
        warpSpiralAnimation: new FrameIndexPattern(WARP_SPIRAL_ANIMATION),
      }),
      drawLayer: HUD,
    }); 
    this.addChild(this.spiral);
    this.spiral.animations?.play("warpSpiralAnimation");

  }
  override destroy() {
    console.log("Warp Base destroyed");
    this.body?.destroy();
    this.spiral?.destroy();
    super.destroy();
  }
  override ready() {
    events.on("CHARACTER_POSITION", this, (hero: any) => {
      if (this.parentId && hero.id == this.parentId) {
        this.position = hero.position;
      }
    });
  }
}
