import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources"; 
import { Level } from "../objects/Level/level";
import { Sprite } from "../objects/sprite";  
import { BASE } from "../objects/game-object"; 
 

export class HeroRoomLevel extends Level {
  override defaultHeroPosition = new Vector2(gridCells(18), gridCells(2));
  showDebugSprites = false;
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined, heroLevel?: number } = {}) {
    super(); 
    this.name = "HeroRoom";
    const heroLevel = params.heroLevel && params.heroLevel > 0 ? params.heroLevel : 1;
    if (params.heroPosition) { 
      this.defaultHeroPosition = params.heroPosition;
    }
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }

    // Base tile count (21x21) increases by 4 tiles per level as a simple growth factor
    const baseSize = 21;
    const size = baseSize + (heroLevel - 1) * 4;
    // create floor tiles doubled grid step to match existing visuals (each cell is 2*gridCells(1) offset in original)
    // for (let y = 0; y < size; y++) {
    //   for (let x = 0; x < size; x++) { 
    //     const floor = new Sprite(
    //       { 
    //         resource: resources.images["enderFloor"], 
    //         position: new Vector2(gridCells(x * 2), gridCells(y * 2)),
    //         frameSize: new Vector2(32, 32) 
    //       }
    //     );
    //     floor.drawLayer = BASE;
    //     this.addChild(floor);
    //   }
    // }

    this.walls = new Set(); 
    // perimeter walls
    // for (let x = 0; x < size; x++) {
    //   // top row (skip entrance area if needed)
    //   if (x != Math.floor(size * 0.9)) { 
    //     this.walls.add(`${gridCells(x)},${gridCells(1)}`);
    //   }
    //   this.walls.add(`${gridCells(x)},${gridCells(size)}`);
    // }
    // for (let y = 0; y < size; y++) { 
    //   this.walls.add(`${gridCells(-1)},${gridCells(y)}`);
    //   this.walls.add(`${gridCells(size)},${gridCells(y)}`);
    // }
  }

  override ready() {
    // events.on("CHARACTER_EXITS", this, () => {
    //   events.emit("CHANGE_LEVEL", new HeroHome({ heroPosition: new Vector2(gridCells(17), gridCells(2)), itemsFound: this.itemsFound }));
    // });
  }
}
