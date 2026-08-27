import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { GameObject, HUD } from "../../game-object";
import { Animations } from "../../../helpers/animations";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { SUBSONIC_ANIMATION } from "./subsonic-animations"; 

export class Subsonic extends GameObject {
  body?: Sprite;

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y),
      name: "Subsonic",
      isSolid: false,
      drawLayer: HUD,
      forceDrawName: false,
      preventDrawName: true,
    })

    this.body = new Sprite({
      objectId: Math.floor(Math.random() * (9999)) * -1,
      resource: resources.images["skill_subsonic"],
      name: "SubsonicB",
      frameSize: new Vector2(32, 32),
      scale: new Vector2(1.25, 1.25),
      vFrames: 1,
      hFrames: 4,
      animations: new Animations({
        subsonicAnimation: new FrameIndexPattern(SUBSONIC_ANIMATION),
      }), 
    });
    this.addChild(this.body);
    // `Animations.play` intentionally does nothing when the requested pattern
    // is already active; advance from an explicit zero so the projectile is
    // visible immediately after it is added to the scene.
    this.body.animations?.play("subsonicAnimation", 0);
    this.body.frame = 0;
  }

  moveTo(targetX: number, targetY: number, speed: number) {
    const startX = this.position.x;
    const startY = this.position.y;
    const deltaX = targetX - startX;
    const deltaY = targetY - startY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const duration = Math.max(120, Math.min(distance / Math.max(speed * 6, 0.01), 1000));
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
