import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources"; 
import { Level } from "../objects/Level/level";
import { Sprite } from "../objects/sprite";  
import { BASE } from "../objects/game-object"; 
 

export class HeroRoomLevel extends Level {
  override defaultHeroPosition = new Vector2(gridCells(18), gridCells(2));
  showDebugSprites = false;
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined } = {}) {
    super(); 
    this.name = "HeroRoom";
    if (params.heroPosition) { 
      this.defaultHeroPosition = params.heroPosition;
    }
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }

    for (let y = 0; y < 21; y++) {
      for (let x = 0; x < 21; x++) { 
        const floor = new Sprite(
          { 
            resource: resources.images["enderFloor"], 
            position: new Vector2(gridCells(x * 2), gridCells(y * 2)),
            frameSize: new Vector2(32, 32) 
          }
        );
        floor.drawLayer = BASE;
        this.addChild(floor);
      }
    }

    this.walls = new Set();
    //walls 
    
    //bed:
    this.walls.add(`16,208`);
    this.walls.add(`16,144`); this.walls.add(`32,144`);
    //walls:
    for (let x = 0; x < 21; x++) {
      if (x != 18) { 
        this.walls.add(`${gridCells(x)},32`);
      }
      this.walls.add(`${gridCells(x)},224`);
    }
    for (let y = 0; y < 21; y++) { 
      this.walls.add(`${gridCells(-1)},${gridCells(y)}`);
      this.walls.add(`320,${(gridCells(y))}`);
    }    
  }

  override ready() {
    // events.on("CHARACTER_EXITS", this, () => {
    //   events.emit("CHANGE_LEVEL", new HeroHome({ heroPosition: new Vector2(gridCells(17), gridCells(2)), itemsFound: this.itemsFound }));
    // });
  }
}
