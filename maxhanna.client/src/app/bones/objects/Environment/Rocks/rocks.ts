import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { BASE, FLOOR, GameObject, GROUND, HUD } from "../../game-object";

export class Rocks extends GameObject {
  numberOfFrames = 14;
  randomFrame = Math.floor(Math.random() * (this.numberOfFrames - 1)) + 1;
  body: Sprite;
  constructor(params: { position: Vector2, frame?: number, offsetX?: number, offsetY?: number, drawLayer?: typeof BASE | typeof GROUND | typeof FLOOR | typeof HUD }) {
    super({
      position: params.position,
      name: "Rocks",
      drawLayer: params.drawLayer ?? FLOOR,
      isSolid: true, 
    })

    this.body = new Sprite({
      objectId: Math.floor(Math.random() * (9999)) * -1,
      resource: resources.images["rocks"],
      name: "Rocks", 
      frameSize: new Vector2(32, 32),
      vFrames: 1,
      hFrames: this.numberOfFrames,
      frame: params.frame ?? this.randomFrame,
      drawLayer: this.drawLayer,
      offsetX: params.offsetX ?? 0,
      offsetY: params.offsetY ?? 0,
    });
    this.addChild(this.body);  
  }  
}
