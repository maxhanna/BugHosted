import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { GameObject } from "../../game-object";
import { Animations } from "../../../helpers/animations";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { CRITICAL_ANIMATION } from "./critical-animations";
import { events } from "../../../helpers/events";

export class Critical extends GameObject {
  body?: Sprite;
  parentId: number;
  targetId: number;

  constructor(params: { position: Vector2, parentId: number, targetId: number }) {
    super({
      position: params.position,
      name: "Critical",
      isSolid: false, 
    });

    this.parentId = params.parentId;
    this.targetId = params.targetId; 

    this.body = new Sprite({
      objectId: Math.floor(Math.random() * (9999)) * -1,
      resource: resources.images["criticalhit"],
      name: "CriticalB",
      frameSize: new Vector2(32, 32),
      vFrames: 1,
      hFrames: 4,
      offsetX: -7,
      scale: new Vector2(0.7, 0.7),
      animations: new Animations({
        criticalAnimation: new FrameIndexPattern(CRITICAL_ANIMATION),
      }),
    });
    this.addChild(this.body);
    this.body.animations?.play("criticalAnimation");
    setTimeout(() => { this.destroy(); }, 500);
  }
  override destroy() { 
    this.body?.destroy();
    super.destroy();
  }
  override ready() {
    events.on("CHARACTER_POSITION", this, (hero: any) => {
      if (hero.id == this.targetId) {
        this.position = hero.position;
      }
    });
  }
}
