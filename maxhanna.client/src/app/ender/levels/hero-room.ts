import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { Level } from "../objects/Level/level";
import { Sprite } from "../objects/sprite";
import { Animations } from "../helpers/animations";
import { FrameIndexPattern } from "../helpers/frame-index-pattern";


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
    
    // Stars background has 3 frames; create a simple twinkle animation (0->1->2->1 loop)
    // Build keyframed pattern: 0 at 0ms, 1 at 150ms, 2 at 300ms, 1 at 450ms (loop 600ms)
    const STAR_TWINKLE = { duration: 600, frames: [
      { time: 0, frame: 0 },
      { time: 150, frame: 1 },
      { time: 300, frame: 2 },
      { time: 450, frame: 1 }
    ]};
    this.background = new Sprite({
      resource: resources.images["stars"],
      frameSize: new Vector2(320, 220),
      hFrames: 3,
      vFrames: 1,
      animations: new Animations({
        twinkle: new FrameIndexPattern(STAR_TWINKLE)
      })
    });
    this.background.animations?.play("twinkle");

    this.walls = new Set();
  }

  override ready() {
    // events.on("CHARACTER_EXITS", this, () => {
    //   events.emit("CHANGE_LEVEL", new HeroHome({ heroPosition: new Vector2(gridCells(17), gridCells(2)), itemsFound: this.itemsFound }));
    // });
  }
}
