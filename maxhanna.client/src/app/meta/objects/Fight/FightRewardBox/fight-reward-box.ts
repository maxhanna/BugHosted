import { GameObject } from "../../game-object";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { getTypeLabel } from "../../../helpers/skill-types";
import { gridCells } from "../../../helpers/grid-cells";
import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { MetaBot } from "../../../../../services/datacontracts/meta/meta-bot";
import { SpriteTextString } from "../../SpriteTextString/sprite-text-string";
import { MetaBotPart } from "../../../../../services/datacontracts/meta/meta-bot-part";

export class FightRewardBox extends GameObject {
  backdrop = new Sprite({
    resource: resources.images["textBox"],
    scale: new Vector2(0.85, 0.7),
    frameSize: new Vector2(256, 64)
  });
  metabotParts: MetaBotPart[] = [];

  constructor(config: { position: Vector2, metabotParts: MetaBotPart[] }) {
    super({ position: config.position });
    this.drawLayer = "HUD";
    this.metabotParts = config.metabotParts; 
    this.backdrop.scale = new Vector2(this.backdrop.scale.x, this.backdrop.scale.y + (0.1 * this.metabotParts.length));
     
    const txtSprite = new SpriteTextString(`Rewards`, new Vector2(-15, -5));
    txtSprite.drawLayer = "HUD";
    this.addChild(txtSprite);

    for (let x = 0; x < this.metabotParts.length; x++) {
      const txtSprite = new SpriteTextString(`${this.metabotParts[x].partName} ${this.metabotParts[x].skill.name} ${this.metabotParts[x].damageMod} ${getTypeLabel(this.metabotParts[x].type)}`, new Vector2(-15, 10 + (x * 10)));
      txtSprite.drawLayer = "HUD";
      this.addChild(txtSprite);
    } 
  }

  override step(delta: number, root: GameObject) {
  }
  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    this.backdrop.drawImage(ctx, drawPosX, drawPosY);
  }
}
