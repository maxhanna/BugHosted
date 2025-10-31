import { Vector2 } from "../../../services/datacontracts/bones/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Level } from "../objects/Level/level";
import { Sprite } from "../objects/sprite";
import { BASE } from "../objects/game-object";
import { Encounter } from "../objects/Environment/Encounter/encounter";
import { Scenario } from "../helpers/story-flags";
import { Referee } from "../objects/Npc/Referee/referee";
import { Bones } from "../objects/Npc/Bones/bones";
import { Exit } from "../objects/Environment/Exit/exit";
import { RoadToFortPenumbra } from "./road-to-fort-penumbra";
import { RoadToRiftedBastion } from "./road-to-rifted-bastion";


export class RiftedBastion extends Level {
  override defaultHeroPosition = new Vector2(gridCells(2), gridCells(2));
  showDebugSprites = false;  
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined } = {}) {
    super();
    this.name = "RiftedBastion";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    }
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }

    this.addBackgroundLayer(resources.images["townbg"], /*parallax=*/0, new Vector2(0, 0), /*repeat=*/false, /*scale=*/1, /*direction=*/'LEFT');
    this.addBackgroundLayer(resources.images["townbg2"], /*parallax=*/0.4, new Vector2(-400, 16), /*repeat=*/false, /*scale=*/1, /*direction=*/'RIGHT');

    const bones = new Bones({
      position: new Vector2(gridCells(5), gridCells(8)),
      moveUpDown: 5,
      moveLeftRight: 1
    });
    bones.textContent = [
      {
        string: ["Two sides of the same ruin - one frozen, one burning."],
      } as Scenario
    ];
    this.addChild(bones);

    // Create a tiled floor and perimeter walls using Level helper
    const roomWidth = 20; // tiles horizontally
    const roomHeight = 3; // tiles vertically
    // tileWidth=64, tileHeight=96 match original layout
    this.tileFloor(new Vector2(gridCells(0), gridCells(-1)), roomWidth, roomHeight, 64, 96, resources.images["floortileiso"], { drawLayer: BASE, startObjectId: -1000 });
   
    const exit = new Exit({
      position: new Vector2(gridCells(18), gridCells(1)), showSprite: true
    });
    this.addChild(exit);

    // Backward exit to the preceding road level
    const backExit = new Exit({ position: new Vector2(gridCells(1), gridCells(1)), showSprite: true, targetMap: 'RoadToRiftedBastion' });
    this.addChild(backExit);
  }

  override ready() {
    events.on("CHARACTER_EXITS", this, (targetMap?: string) => {
      if (!targetMap || targetMap === 'RoadToFortPenumbra') {
        events.emit("CHANGE_LEVEL", new RoadToFortPenumbra({ heroPosition: new Vector2(gridCells(2), gridCells(2)), itemsFound: this.itemsFound }));
      } else if (targetMap === 'RoadToRiftedBastion') {
        events.emit("CHANGE_LEVEL", new RoadToRiftedBastion({ heroPosition: new Vector2(gridCells(2), gridCells(2)), itemsFound: this.itemsFound }));
      }
    });
  }
}
