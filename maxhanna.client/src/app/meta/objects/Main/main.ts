import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { GameObject, HUD } from "../game-object";
import { Camera } from "../camera";
import { Inventory } from "../inventory";
import { events } from "../../helpers/events";
import { Input } from "../../helpers/input";
import { storyFlags } from "../../helpers/story-flags";
import { Level } from "../Level/level";
import { SpriteTextStringWithBackdrop } from "../SpriteTextString/sprite-text-string-with-backdrop";
import { MetaHero } from "../../../../services/datacontracts/meta/meta-hero";
import { Character } from "../character";

export class Main extends GameObject {
  level?: Level = undefined;
  camera: Camera;
  input: Input = new Input();
  inventory: Inventory;
  heroId?: number;
  metaHero?: MetaHero;
  hero: Character;

  constructor(config: { position: Vector2, heroId: number, metaHero: MetaHero, hero: Character }) {
    super({ position: config.position });
    this.heroId = config.heroId;
    this.metaHero = config.metaHero;
    this.hero = config.hero;
    this.inventory = new Inventory({ character: this.hero })
    this.camera = new Camera({ position: new Vector2(0, 0), heroId: this.heroId });
    this.isOmittable = false;
  }

  override ready() { 
    this.addChild(this.inventory); 
    //CHANGE LEVEL HANDLER
    events.on("CHANGE_LEVEL", this, (level: Level) => {
      this.setLevel(level); 
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
          storyFlags.add(content.addsFlag);
        }

        const textBox = new SpriteTextStringWithBackdrop({
          portraitFrame: content.portraitFrame,
          string: content.string,
          canSelectItems: content.canSelectItems,
          objectSubject: withObject
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
 
  setHeroId(metaHeroId: number) {
    this.heroId = metaHeroId;
    this.camera.heroId = metaHeroId;
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
      if (child.drawLayer !== HUD) { 
        child.draw(ctx, 0, 0, true);
      } 
    });
  }

  drawForeground(ctx: CanvasRenderingContext2D) { 
    this.children.forEach((child: GameObject) => {
      if (child.drawLayer === HUD) { 
        child.draw(ctx, 0, 0, true, true);
      } 
    }) 
  }
}
