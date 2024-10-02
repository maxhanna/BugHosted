import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Exit } from "../objects/Exit/exit";
import { Level } from "../objects/Level/level";
import { Watch } from "../objects/Watch/watch";
import { Sprite } from "../objects/sprite"; 
import { CaveLevel1 } from "./cave-level1";
import { HeroHomeLevel } from "./hero-home";
import { GOT_WATCH, START_REFEREE_FIGHT, Scenario, TALKED_TO_MOM, TALKED_TO_MOM_ABOUT_DAD, TALKED_TO_MOM_ABOUT_WATCH } from "../helpers/story-flags";
import { Npc } from "../objects/Npc/npc";
 

export class BoltonLevel1 extends Level {
  walls: Set<string>;
  override defaultHeroPosition = new Vector2(gridCells(18), gridCells(2));
  constructor(params: { heroPosition?: Vector2 } = {}) {
    super(); 
    this.name = "BoltonLevel1";
    if (params.heroPosition) { 
      this.defaultHeroPosition = params.heroPosition;
    }

    for (let x = 0; x < 5; x++) {
      const whiteBg = new Sprite(
        0, resources.images["white"], new Vector2(100 * x, 0), 100, 1, new Vector2(100, 100)
      );
      whiteBg.drawLayer = "FLOOR";
      this.addChild(whiteBg);


      const whiteBg2 = new Sprite(
        0, resources.images["white"], new Vector2(100 * x, 100), 100, 1, new Vector2(100, 100)
      );
      whiteBg2.drawLayer = "FLOOR";
      this.addChild(whiteBg2);
    }
    

    for (let x = 0; x < 43; x++) {
      const goldPath = new Sprite(
        0, resources.images["goldenPath"], new Vector2(x * 14, 0), 1, 1, new Vector2(14, 16)
      );
      goldPath.drawLayer = "FLOOR";
      this.addChild(goldPath); 
    }
    

    for (let x = 0; x < 38; x++) {
      const fence = new Sprite(
        0, resources.images["fenceHorizontal"], new Vector2(x * gridCells(1), gridCells(1)), 1, 1, new Vector2(16, 16)
      );
      fence.isSolid = true;
      this.addChild(fence);

      const fence2 = new Sprite(
        0, resources.images["fenceHorizontal"], new Vector2(x * gridCells(1), gridCells(18)), 1, 1, new Vector2(16, 16)
      );
      fence2.isSolid = true;
      this.addChild(fence2);
    }

    for (let y = 0; y < 37; y++) {
      const fence = new Sprite(
        0, resources.images["fenceVertical"], new Vector2(gridCells(2), y * gridCells(1) / 2), 1, 1, new Vector2(16, 16)
      );
      fence.isSolid = true;
      this.addChild(fence);

      const fence2 = new Sprite(
        0, resources.images["fenceVertical"], new Vector2(gridCells(36), y * gridCells(1) / 2), 1, 1, new Vector2(16, 16)
      );
      fence2.isSolid = true;
      this.addChild(fence2);
    }

    for (let x = 0; x < 10; x++) {
      const shrub = new Sprite(
        0, resources.images["shrub"], new Vector2(gridCells(3) + (x*1.5) * gridCells(1), gridCells(5)), 0.45, 1, new Vector2(56, 56)
      );
      this.addChild(shrub);
    }
    
    const referee = new Npc(gridCells(5), gridCells(5), {
      content: [ 
        {
          string: "You want a fight?!",
          addsFlag: START_REFEREE_FIGHT,
        } as Scenario
      ],
      portraitFrame: 2
    });
    this.addChild(referee);


    const heroHomeExit = new Exit(gridCells(18), gridCells(2), true, (Math.PI * 3) / 2);
    heroHomeExit.targetMap = "HeroHome";
    this.addChild(heroHomeExit);

    this.walls = new Set();
    //walls:
    
  }

  override ready() {
    events.on("HERO_EXITS", this, (targetMap: string) => {
      if (targetMap === "HeroHome") {
        events.emit("CHANGE_LEVEL", new HeroHomeLevel({
          heroPosition: new Vector2(gridCells(10), gridCells(11))
        })); 
      } 
    })
  }
}
