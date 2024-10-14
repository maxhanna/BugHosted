import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { resources } from "../../helpers/resources";
import { Vector2 } from "../../../../services/datacontracts/meta/vector2";

export class TextBox extends GameObject {
  content = "";
  backdrop: Sprite;
  constructor() {
    super({
      position: new Vector2(32,112)
    });
    this.content = "Hi. How are you? THIS IS THE WORLD OF META BOTS! ";

    this.backdrop = new Sprite(
      0,
      resources.images["textBox"],
      undefined,
      undefined,
      undefined,
      new Vector2(256, 64)
    ); 
  }

  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    //Draw backdrop first
    this.backdrop.drawImage(ctx, drawPosX, drawPosY);

    //Draw text
    let words = this.content.split(" ");
    ctx.font = `${words.length > 10 ? '12' : '16'}px fontRetroGaming`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#fff";

    const MAX_WIDTH = 250
    const LINE_HEIGHT = 20;
    const PADDING_LEFT = 10;
    const PADDING_TOP = 12;

    let line = "";
    for (let n = 0; n < words.length; n++) {
      let testLine = line + words[n] + " ";
      let metrics = ctx.measureText(testLine);
      let testWidth = metrics.width;

      if (testWidth > MAX_WIDTH && n > 0) {
        ctx.fillText(line, drawPosX + PADDING_LEFT, drawPosY + PADDING_TOP);
        line = words[n] + " ";
        drawPosY += LINE_HEIGHT;
      } else {
        line = testLine;
      }
    } 

    ctx.fillText(line, drawPosX + PADDING_LEFT, drawPosY + PADDING_TOP);
  }
}
