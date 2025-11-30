import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { GameObject, HUD } from "../../game-object";
import { Animations } from "../../../helpers/animations";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { RIGHT } from "../../../helpers/grid-cells";
import { FIREBALL_RIGHT_ANIMATION } from "./fireball-animations";
import { FireballDestroyed } from "./fireball_destroyed";

export class Fireball extends GameObject {
  body?: Sprite;
  facingDirection: string = RIGHT;
  constructor(x: number, y: number, facingDirection: string) {
    super({
      position: new Vector2(x, y),
      name: "Fireball",
      isSolid: false,
      drawLayer: HUD,
      forceDrawName: false,
      preventDrawName: true,
    })

    this.body = new Sprite({
      objectId: Math.floor(Math.random() * (9999)) * -1,
      resource: resources.images["skill_fireball"],
      name: "FireballB",
      frameSize: new Vector2(32, 32),
      vFrames: 1,
      hFrames: 4, 
      animations: new Animations({
        fireballRightAnimation: new FrameIndexPattern(FIREBALL_RIGHT_ANIMATION), 
      }),
    });
    this.addChild(this.body);
    this.facingDirection = facingDirection;

    this.body.animations?.play("fireballRightAnimation");
    resources.playSound('magicBurst', { allowOverlap: true, loop: false }); 
  }

  override destroy(): void {
    const fbDestroyed = new FireballDestroyed(0, 0, this.facingDirection);
    this.addChild(fbDestroyed);
    setTimeout(() => {
      fbDestroyed.destroy();
      super.destroy();
    }, 1350);
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
