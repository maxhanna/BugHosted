import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { GameObject, HUD } from "../../game-object";
import { Animations } from "../../../helpers/animations";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { RIGHT } from "../../../helpers/grid-cells"; 
import { FIREBALL_EXPLODE_ANIMATION } from "./fireball-animations";

export class FireballDestroyed extends GameObject {
  body?: Sprite;
  facingDirection: string = RIGHT;
  constructor(x: number, y: number, facingDirection: string) {
    super({
      position: new Vector2(x, y),
      name: "Fireball_Destroyed",
      isSolid: false,
      drawLayer: HUD,
      forceDrawName: false,
      preventDrawName: true,
    })

    this.body = new Sprite({
      objectId: Math.floor(Math.random() * (9999)) * -1,
      resource: resources.images["skill_fireball_explode"],
      name: "FireballExplodeB",
      frameSize: new Vector2(32, 32),
      vFrames: 1,
      hFrames: 8, 
      animations: new Animations({
        fireballExplodeAnimation: new FrameIndexPattern(FIREBALL_EXPLODE_ANIMATION), 
      }),
    });
    this.addChild(this.body);
    this.facingDirection = facingDirection;

    this.body.animations?.play("fireballExplodeAnimation");
    resources.playSound('magicBurst', { allowOverlap: true, loop: false }); 
  }
}
