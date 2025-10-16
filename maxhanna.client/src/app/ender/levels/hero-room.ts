import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { Level } from "../objects/Level/level";
import { Sprite } from "../objects/sprite";
import { Stars } from "../objects/Effects/Stars/stars";


export class HeroRoomLevel extends Level {
  override defaultHeroPosition = new Vector2(gridCells(18), gridCells(2));
  showDebugSprites = false;
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined, heroLevel?: number } = {}) {
    super();
    this.name = "HeroRoom";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    }
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }
    
  // Use Stars effect object for animated starfield background
    const stars = new Stars();
    this.background = stars.body!; // Level expects a Sprite

    this.walls = new Set();
  }

  override ready() {
    // events.on("CHARACTER_EXITS", this, () => {
    //   events.emit("CHANGE_LEVEL", new HeroHome({ heroPosition: new Vector2(gridCells(17), gridCells(2)), itemsFound: this.itemsFound }));
    // });
  }
}
