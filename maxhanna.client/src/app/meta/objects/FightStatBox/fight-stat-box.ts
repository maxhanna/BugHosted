import { getCharacterWidth, getCharacterFrame } from "../SpriteTextString/sprite-font-map";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { resources } from "../../helpers/resources";
import { events } from "../../helpers/events";
import { gridCells } from "../../helpers/grid-cells";
import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { Input } from "../../helpers/input";
import { storyFlags } from "../../helpers/story-flags";
import { BoltonLevel1 } from "../../levels/bolton-level1";
import { Level } from "../Level/level";
import { MetaBot } from "../../../../services/datacontracts/meta/meta-bot";

export class FightStatBox extends GameObject {
  backdrop = new Sprite(
    0, resources.images["textBox"],
    new Vector2(0, 0),
    new Vector2(0.4, 0.8),
    undefined,
    new Vector2(256, 64),
    undefined,
    undefined,
    undefined
  );
   

  constructor(config: { bot: MetaBot, position: Vector2 }) { 
    super({ position: config.position }); 
    this.drawLayer = "HUD";
    console.log("new fight stat box made at location ", config.position);
  }

  override step(delta: number, root: GameObject) {
  }
  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    this.backdrop.drawImage(ctx, drawPosX, drawPosY);

  }
  
}
