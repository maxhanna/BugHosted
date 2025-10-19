import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { GameObject, HUD } from "../../game-object";
import { Animations } from "../../../helpers/animations";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { RAIL_ANIMATION } from "./rail-animations"; 

export class Rail extends GameObject {
  body?: Sprite;

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y),
      name: "Rail",
      isSolid: false,
      drawLayer: HUD,
      forceDrawName: true,
      preventDrawName: false,
    })

    this.body = new Sprite({
      objectId: Math.floor(Math.random() * (9999)) * -1,
      resource: resources.images["skill_rail"],
      name: "RailB",
      frameSize: new Vector2(32, 32),
      vFrames: 1,
      hFrames: 4,
      scale: new Vector2(2,1),
      animations: new Animations({
        railAnimation: new FrameIndexPattern(RAIL_ANIMATION),
      }), 
      offsetY: 10,
    });
    this.addChild(this.body);
    this.body.animations?.play("railAnimation");
  }
  moveTo(targetX: number, targetY: number, speed: number) {
    const startX = this.position.x;
    const startY = this.position.y;
    const deltaX = targetX - startX;
    const deltaY = targetY - startY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const duration = Math.min(distance / (speed / 6), 500);
    const startTime = performance.now();

    let midX = (startX + targetX) / 2;
    let midY = (startY + targetY) / 2;
    if (distance < 40) { 
      if (deltaX > 0) { 
        midX += 20;
      }
      if (deltaY > 0) { 
        midY += 10;
      }
    }
    else if (distance < 70) {
      midX += 10;
    }

    this.position.x = midX;
    this.position.y = midY;

    if (this.body) {
      const baseWidth = this.body.frameSize.x;
      const scaleX = Math.max(distance / baseWidth / 3, 0.75); // your existing scale logic
      this.body.scale = new Vector2(scaleX, 1);
      
      //console.log(deltaX, deltaY, distance);
     
      const baseSpriteAngle = (Math.PI * 2) / 3; // sprite is drawn at 45 degrees
      this.body.rotation = Math.atan2(deltaY, deltaX) - baseSpriteAngle;

      this.body.position.x = -baseWidth / 2;
      this.body.position.y = -this.body.frameSize.y / 2;
    }
    

    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.destroy();
      }
    };

    animate();
  }
  
}
