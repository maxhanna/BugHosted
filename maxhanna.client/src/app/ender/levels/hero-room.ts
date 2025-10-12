import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { Level } from "../objects/Level/level";
import { Sprite } from "../objects/sprite";


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
    
    this.background = new Sprite(
      {
        resource: resources.images["stars"], 
        frameSize: new Vector2(320, 220)
      }
    );

    const ground = new Sprite({
      resource: resources.images["stars"],  
      frameSize: new Vector2(320, 220)
    }
    ); 
    this.addChild(ground);

    this.walls = new Set();
  }

  override ready() {
    // events.on("CHARACTER_EXITS", this, () => {
    //   events.emit("CHANGE_LEVEL", new HeroHome({ heroPosition: new Vector2(gridCells(17), gridCells(2)), itemsFound: this.itemsFound }));
    // });
  }
}
