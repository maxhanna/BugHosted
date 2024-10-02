import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { storyFlags, Scenario, CHARACTER_CREATE_STORY_TEXT_1, CHARACTER_CREATE_STORY_TEXT_2, CHARACTER_CREATE_STORY_TEXT_3, CHARACTER_CREATE_STORY_TEXT_4, CHARACTER_CREATE_STORY_TEXT_5, CHARACTER_CREATE_STORY_TEXT_6 } from "../helpers/story-flags";
import { Exit } from "../objects/Exit/exit";
import { Level } from "../objects/Level/level";
import { Watch } from "../objects/Watch/watch";
import { Sprite } from "../objects/sprite";
import { Npc } from "../objects/Npc/npc";
import { HeroRoomLevel } from "./hero-room";
import { SpriteTextString } from "../objects/SpriteTextString/sprite-text-string"; 
import { GameObject } from "../objects/game-object";

export class Fight extends Level {
  walls: Set<string>;
  textBox = new SpriteTextString({}); 
  characterName = "";
  npc?: GameObject = undefined; 

  override defaultHeroPosition = new Vector2(gridCells(1), gridCells(1));

  constructor(params: { heroPosition?: Vector2, source?: any } = {}) {
    super();
    this.name = "Fight";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    }
    this.walls = new Set<string>();
    if (params.source) {
      this.npc = params.source as GameObject;
      this.addChild(this.npc); 
    }
    this.runFightAnimation();
  }

  runFightAnimation() {
    setTimeout(() => {
      console.log(this.children);
      const heroes = this.children.filter((x: any) => x.id > 0);
      if (heroes) {
        heroes.forEach((hero: any, index: number) => {
          console.log("moving hero " + hero.objectId);
          hero.position.x = gridCells(1) + gridCells(index);
          hero.position.y = gridCells(4) + gridCells(0);
        });
      }
    }, 10); 

  }

  override ready() {
    events.on("SPACEBAR_PRESSED", this, () => {
      console.log("spacebar pressed in a fight"); 
      events.emit("HERO_MOVEMENT_LOCK");
    });
  } 
}
