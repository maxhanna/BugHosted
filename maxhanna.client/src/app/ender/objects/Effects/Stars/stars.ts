import { Vector2 } from "../../../../../services/datacontracts/ender/vector2";
import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { Animations } from "../../../helpers/animations";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { STAR_TWINKLE_ANIMATION } from "./star-animations";
 
export class Stars extends GameObject {
  body?: Sprite;

  constructor() {
    super({
      position: new Vector2(0, 0),
      name: "StarsContainer",
    });

    this.body = new Sprite({
      objectId: Math.floor(Math.random() * 9999) * -1,
      resource: resources.images["stars"],
      name: "StarsBG",
      frameSize: new Vector2(320, 220),
      vFrames: 1,
      hFrames: 3,
      isSolid: false,
      animations: new Animations({
        twinkle: new FrameIndexPattern(STAR_TWINKLE_ANIMATION),
      }),
    });

    this.addChild(this.body);
    this.body.animations?.play("twinkle");
  }
}
