import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { Camera } from "../camera";
import { Inventory } from "../inventory";
import { resources } from "../../helpers/resources";
import { events } from "../../helpers/events";
import { Input } from "../../helpers/input";
import { storyFlags } from "../../helpers/story-flags";
import { Level } from "../Level/level";
import { SpriteTextString } from "../SpriteTextString/sprite-text-string";

export class Main extends GameObject {
  level?: Level = undefined;
  camera: Camera = new Camera(0,0); 
  constructor(x: number, y: number) {
    super({ position: new Vector2(x, y) }); 
    this.input = new Input();
  }

  override ready() {
    const inventory = new Inventory();
    this.addChild(inventory);

    //CHANGE LEVEL HANDLER
    events.on("CHANGE_LEVEL", this, (newLevelInstance: Level) => {
      this.setLevel(newLevelInstance);
    });

    //LAUNCH TEXT BOX HANDLER
    events.on("HERO_REQUESTS_ACTION", this, (withObject: any) => {

      if (typeof withObject.getContent === "function") {
        const content = withObject.getContent();
        if (!content) {
          return;
        }
        //potentially add a story flag
        if (content.addsFlag) {
          console.log("add flag", content.addsFlag);
          storyFlags.add(content.addsFlag);
        }

        const textBox = new SpriteTextString({
          portraitFrame: content.portraitFrame,
          string: content.string
        });
        this.addChild(textBox);
        events.emit("START_TEXT_BOX");

        const endingSub = events.on("END_TEXT_BOX", this, () => {
          textBox.destroy();
          events.off(endingSub);
        });
      }

     
    }); 
  }

  setLevel(newLevelInstance: Level) {
    if (this.level) {
      this.level.destroy();
    }

    this.level = newLevelInstance;
    this.addChild(this.level);
  }

  drawBackground(ctx: CanvasRenderingContext2D) {
    this.level?.background?.drawImage(ctx, 0, 0);
  }

  drawObjects(ctx: CanvasRenderingContext2D) {
    this.children.forEach((child: GameObject) => {
      if (child.drawLayer !== "HUD") {
        child.draw(ctx, 0, 0);
      }
    })
  }

  drawForeground(ctx: CanvasRenderingContext2D) { 
    this.children.forEach((child: GameObject) => {
      if (child.drawLayer === "HUD") {
        child.draw(ctx, 0, 0);
      } 
    }) 
  }
}
