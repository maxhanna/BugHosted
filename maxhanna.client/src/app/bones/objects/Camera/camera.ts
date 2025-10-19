 import { GameObject } from "../game-object";
import { events } from "../../helpers/events";
import { Level } from "../Level/level";
import { Vector2 } from "../../../../services/datacontracts/bones/vector2";

export class Camera extends GameObject {
  heroId?: number;
  constructor(config: { position: Vector2; heroId?: number }) {
    super({ position: config.position });
    this.heroId = config.heroId;

    events.on("CHARACTER_POSITION", this, (hero: any) => {
      if (hero.id === this.heroId) {
        this.centerPositionOnTarget(hero.position);
      }
    });
    events.on("WARDROBE_OPENED", this, () => {
      this.centerPositionOnTarget(new Vector2(128, 177));
    });
    events.on("SHOP_OPENED", this, (newLevelInstance: Level) => {
      if (newLevelInstance) {
        this.centerPositionOnTarget(new Vector2(128, 177));
      }
    });
    events.on("SHOP_OPENED_TO_SELL", this, (newLevelInstance: Level) => {
      if (newLevelInstance) {
        this.centerPositionOnTarget(new Vector2(128, 177));
      }
    });

    events.on("CHANGE_LEVEL", this, (newLevelInstance: Level) => {
      if (newLevelInstance) {
        this.centerPositionOnTarget(newLevelInstance.getDefaultHeroPosition());
      } else {
        this.centerPositionOnTarget(new Vector2(0, 0));
      }
    });
  }
  override destroy() {
    events.unsubscribe(this);
    super.destroy();
  }
  centerPositionOnTarget(pos: Vector2) {
    const personHalf = 8;
    const canvasWidth = 320;
    const canvasHeight = 220;
    const halfWidth = -personHalf + canvasWidth / 2;
    const halfHeight = -personHalf + canvasHeight / 2;
    this.position = new Vector2(-pos.x + halfWidth, -pos.y + halfHeight);
  }
}
