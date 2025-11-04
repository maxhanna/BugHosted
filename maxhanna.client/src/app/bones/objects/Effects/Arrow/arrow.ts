import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { GameObject, HUD } from "../../game-object";
import { Animations } from "../../../helpers/animations";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { ARROW_LEFT_ANIMATION, ARROW_RIGHT_ANIMATION, HIT_LEFT_ANIMATION, HIT_RIGHT_ANIMATION } from "./arrow-animations";
import { RIGHT } from "../../../helpers/grid-cells";

export class Arrow extends GameObject {
  body?: Sprite;
  facingDirection: string = RIGHT;
  constructor(x: number, y: number, facingDirection: string) {
    super({
      position: new Vector2(x, y),
      name: "Arrow",
      isSolid: false,
      drawLayer: HUD,
      forceDrawName: false,
      preventDrawName: true,
    })

    this.body = new Sprite({
      objectId: Math.floor(Math.random() * (9999)) * -1,
      resource: resources.images["heroesFX"],
      name: "ArrowB",
      frameSize: new Vector2(40, 40),
      vFrames: 3,
      hFrames: 4, 
      animations: new Animations({
        arrowLeftAnimation: new FrameIndexPattern(ARROW_LEFT_ANIMATION),
        hitLeftAnimation: new FrameIndexPattern(HIT_LEFT_ANIMATION),
      }),
    });
    this.addChild(this.body);
    this.facingDirection = facingDirection;

    this.body.animations?.play("arrowLeftAnimation");

  }

  override destroy(): void {
    this.body?.animations?.play("hitLeftAnimation");
    setTimeout(() => {
      super.destroy();
    }, 1000);
  }

  moveTo(targetX: number, targetY: number, speed: number) {
    const startX = this.position.x;
    const startY = this.position.y;
    const deltaX = targetX - startX;
    const deltaY = targetY - startY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const duration = Math.min(distance / (speed / 6), 1000);
    const startTime = performance.now();

    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1000; // Convert to seconds
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
