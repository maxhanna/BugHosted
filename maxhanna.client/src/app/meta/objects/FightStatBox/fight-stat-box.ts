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
import { SpriteTextString } from "../SpriteTextString/sprite-text-string";

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
  metabot: MetaBot;
  showExp: boolean = false;

  constructor(config: { bot: MetaBot, position: Vector2, showExp?: boolean}) { 
    super({ position: config.position }); 
    this.drawLayer = "HUD"; 
    this.metabot = config.bot;
    if (config.showExp) {
      this.showExp = config.showExp;
    }

    const botNameSprite = new SpriteTextString(this.metabot.name ?? "Bot", new Vector2(-15, -5));
    botNameSprite.drawLayer = "HUD";
    this.addChild(botNameSprite);

    const healthNameSprite = new SpriteTextString("HP", new Vector2(-15, 10));
    healthNameSprite.drawLayer = "HUD";
    this.addChild(healthNameSprite);

    if (this.showExp) {
      const expNameSprite = new SpriteTextString("EXP", new Vector2(-15, 20));
      expNameSprite.drawLayer = "HUD";
      this.addChild(expNameSprite);
    }
  }

  override step(delta: number, root: GameObject) {
  }
  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) { 
    this.backdrop.drawImage(ctx, drawPosX, drawPosY); 
    const PADDING = 10;
    // Draw Health Bar
    const healthBarWidth = 80;
    const healthPercentage = Math.max(0, Math.min(this.metabot.hp / 100, 1));
    ctx.fillStyle = 'red';
    ctx.fillRect(drawPosX + PADDING, drawPosY + PADDING + 10, healthBarWidth * healthPercentage, 10);

    // Draw Health Bar Outline
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;
    ctx.strokeRect(drawPosX + PADDING, drawPosY + PADDING + 10, healthBarWidth, 10);

    if (this.showExp) {
      // Draw Experience Bar
      const expBarWidth = 80;
      const expPercentage = Math.max(0, Math.min(this.metabot.exp / this.metabot.expForNextLevel, 1));
      ctx.fillStyle = 'gold';
      ctx.fillRect(drawPosX + PADDING, drawPosY + PADDING + 20, expBarWidth * expPercentage, 10);

      // Draw Experience Bar Outline
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 1;
      ctx.strokeRect(drawPosX + PADDING, drawPosY + PADDING + 20, expBarWidth, 10); 
    } 
  }

  
}
