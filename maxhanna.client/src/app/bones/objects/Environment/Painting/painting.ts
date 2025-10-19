import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { GameObject } from "../../game-object";
import { Scenario } from "../../../helpers/story-flags";

export class Painting extends GameObject {
  constructor(params: { position: Vector2, preventDraw?: boolean, textContent?: string[], scale?: Vector2, offsetX?: number, offsetY?: number, }) {
    super({
      position: params.position,
      isSolid: false,
      name: "Painting",
      preventDraw: params.preventDraw, 
    })
    const body = new Sprite({
      objectId: 0,
      resource: resources.images["painting"],
      name: "Painting",
      scale: params.scale ?? new Vector2(1, 1),
      frameSize: new Vector2(30, 28),
      offsetX: params.offsetX,
      offsetY: params.offsetY,
    });
    this.addChild(body);

    if (params.textContent) {
      this.textContent = [
        {
          string: params.textContent,
        } as Scenario,
      ]
    } 
  }  
 }
