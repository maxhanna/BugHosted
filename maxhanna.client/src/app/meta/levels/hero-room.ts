import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Exit } from "../objects/Exit/exit";
import { Level } from "../objects/Level/level";
import { Watch } from "../objects/Watch/watch";
import { Sprite } from "../objects/sprite";
import { HeroHomeLevel } from "./hero-home";
 

export class HeroRoomLevel extends Level {
  walls: Set<string>;
  override defaultHeroPosition = new Vector2(gridCells(18), gridCells(2));
  constructor(params: { heroPosition?: Vector2 } = {}) {
    super(); 
    this.name = "HeroRoom";
    if (params.heroPosition) { 
      this.defaultHeroPosition = params.heroPosition;
    }
    const room = new Sprite(
      0, resources.images["bedroomFloor"], new Vector2(0, 0), 1, 1, new Vector2(320, 220)
    );
    this.addChild(room);

    const watch = new Watch(gridCells(2), gridCells(6));
    this.addChild(watch);


    const painting = new Sprite(
      0, resources.images["painting"], new Vector2(gridCells(15), 0.01), 0.75, 1, new Vector2(30, 28)
    );
    this.addChild(painting);


    const xbox = new Sprite(
      0, resources.images["xbox"], new Vector2(gridCells(8), gridCells(3)), 0.5, 1, new Vector2(32, 28)
    );
    this.addChild(xbox);

    const exit = new Exit(gridCells(18), gridCells(1), false);
    this.addChild(exit);
     

    this.walls = new Set();
    //walls
    const pixelSize = gridCells(1);
    //table:
    for (let y = 48; y <= 80; y += 16) {
      for (let x = 80; x <= 176; x += 16) {
        this.walls.add(`${x},${y}`);
      }
    }
    //bed:
    this.walls.add(`16,208`);
    this.walls.add(`16,144`); this.walls.add(`32,144`);
    //walls:
    for (let x = 0; x < 21; x++) {
      if (x != 19) { 
        this.walls.add(`${-16 + (x * pixelSize)},32`);
      }
      this.walls.add(`${-16 + (x * pixelSize)},224`);
    }
    for (let y = 0; y < 21; y++) { 
      this.walls.add(`-16,${(y * pixelSize)}`);
      this.walls.add(`320,${(y * pixelSize)}`);
    }  

  }

  override ready() {
    events.on("HERO_EXITS", this, () => { 
      events.emit("CHANGE_LEVEL", new HeroHomeLevel({ 
          heroPosition: new Vector2(gridCells(17), gridCells(2))
        }));
    })
  }
}
