import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { events } from "../../../helpers/events";
import { ColorSwap } from "../../../../../services/datacontracts/meta/color-swap";
import { Hero } from "../../Hero/hero";
import { Character } from "../../character";

export class Exit extends GameObject {
  targetMap: string;
  constructor(params: { position: Vector2, showSprite?: boolean, rotation?: number, sprite?: string, targetMap?: string, colorSwap?: ColorSwap }) {
    super({
      position: params.position
    });
    const sprite = params.sprite ?? "exit2";
    this.targetMap = params.targetMap ?? "HeroRoom";
    this.name = "exitObject";
    if (params.showSprite) {
      const exitSprite = new Sprite({
        resource: resources.images[sprite],
        position: sprite === "exit2" ? new Vector2(0, -10) : new Vector2(0, 0),
        scale: sprite === "exit2" ? new Vector2(0.95, 0.95) : sprite === "white" ? new Vector2(8, 8) : undefined,
        frameSize: sprite === "exit2" ? new Vector2(42, 45) : sprite === "white" ? new Vector2(2, 2) : new Vector2(32, 32),
        colorSwap: params.colorSwap,
        name: "exit",
        rotation: params.rotation
      });
      this.addChild(exitSprite);
    } 
  }

  override ready() {
    events.on("CHARACTER_POSITION", this, (character: Character) => {
      if (character.id < 0) return;
      const roundedHeroX = Math.round(character.position.x);
      const roundedHeroY = Math.round(character.position.y);
      if (this.position.x === roundedHeroX && this.position.y === roundedHeroY) { 
        if (character.isUserControlled) { 
          events.emit("CHARACTER_EXITS", this.targetMap);
        }
      }
    });
  }
}
