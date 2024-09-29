import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Exit } from "../objects/Exit/exit";
import { Level } from "../objects/Level/level";
import { Watch } from "../objects/Watch/watch";
import { Sprite } from "../objects/sprite";
import { CaveLevel1 } from "./cave-level1";
 

export class HeroRoomLevel extends Level {
  walls: Set<string>;
  override defaultHeroPosition = new Vector2(gridCells(1), gridCells(1));
  constructor(params: { heroPosition?: Vector2 } = {}) {
    super(); 
    this.name = "HeroRoom";
    if (params.heroPosition) { 
      this.defaultHeroPosition = params.heroPosition;
    }
    const room = new Sprite(
      0, resources.images["heroRoom"], new Vector2(0, 0), 1, 1, new Vector2(320, 420)
    );
    this.addChild(room);

    const watch = new Watch(gridCells(2), gridCells(6));
    this.addChild(watch);

    const exit = new Exit(gridCells(7), gridCells(7));
    this.addChild(exit);
     

    this.walls = new Set();
    //walls
    this.walls.add(`297,188`);
    this.walls.add(`297,172`);

    for (let x = 0; x < 31; x++) {
      const pixelSize = gridCells(1);
      this.walls.add(`${-11 + (x * pixelSize)},-5`);
      this.walls.add(`${-11 + (x * pixelSize)},219`);
    }
    for (let y = 0; y < 21; y++) {
      const pixelSize = gridCells(1);
      this.walls.add(`-11,${-5 + (y * pixelSize)}`);
      this.walls.add(`309,${-5 + (y * pixelSize)}`);
    }

    /*staircase*/
    for (let x = 0; x < 4; x++) {
      //left guardrail
      const pixelSize = gridCells(1);
      this.walls.add(`200,${45 + (x * pixelSize)}`);
      this.walls.add(`205,${45 + (x * pixelSize)}`);
      //right guardrail
      this.walls.add(`225,${45 + (x * pixelSize)}`);
    }

  }

  override ready() {
    events.on("HERO_EXITS", this, () => { 
      events.emit("CHANGE_LEVEL", new CaveLevel1({ 
          heroPosition: new Vector2(gridCells(4), gridCells(4))
        }));
    })
  }
}
