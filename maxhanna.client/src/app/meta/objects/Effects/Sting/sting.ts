import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { GameObject, HUD } from "../../game-object";
import { Animations } from "../../../helpers/animations";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { STING_ANIMATION } from "./sting-animations"; 

export class Sting extends GameObject {
  body?: Sprite;

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y),
      name: "Sting",
      isSolid: false,
      drawLayer: HUD,
      forceDrawName: true,
      preventDrawName: false,
    })

    this.body = new Sprite({
      objectId: Math.floor(Math.random() * (9999)) * -1,
      resource: resources.images["skill_sting"],
      name: "StingB",
      frameSize: new Vector2(32, 32),
      vFrames: 1,
      hFrames: 4,
      animations: new Animations({
        stingAnimation: new FrameIndexPattern(STING_ANIMATION),
      }),
      scale: new Vector2(0.6, 0.6),
    });
    this.addChild(this.body);
    this.body.animations?.play("stingAnimation"); 
  }

  moveTo(targetX: number, targetY: number, duration: number) {
    const startX = this.position.x;
    const startY = this.position.y;
    const deltaX = targetX - startX;
    const deltaY = targetY - startY;
    const startTime = performance.now();

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      if (this.body) {
        this.body.flipX = true;  
        this.body.rotation = Math.atan2(deltaY, deltaX);
      }

      this.position.x = startX + deltaX * progress;
      this.position.y = startY + deltaY * progress;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.destroy();
      }
    };

    animate();
  }
}
