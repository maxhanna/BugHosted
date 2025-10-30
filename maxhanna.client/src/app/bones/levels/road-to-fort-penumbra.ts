import { Vector2 } from "../../../services/datacontracts/bones/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Level } from "../objects/Level/level"; 
import { BASE } from "../objects/game-object";
import { Encounter } from "../objects/Environment/Encounter/encounter"; 
import { Exit } from "../objects/Environment/Exit/exit";
import { CitadelOfVesper } from "./citadel-of-vesper";
import { FortPenumbra } from "./fort-penumbra";


export class RoadToFortPenumbra extends Level {
  override defaultHeroPosition = new Vector2(gridCells(2), gridCells(2));
  showDebugSprites = false;  
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined } = {}) {
    super();
    this.name = "RoadToFortPenumbra";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    }
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }

    this.addBackgroundLayer(resources.images["townbg"], /*parallax=*/0, new Vector2(0, 0), /*repeat=*/false, /*scale=*/1, /*direction=*/'LEFT');
    this.addBackgroundLayer(resources.images["townbg2"], /*parallax=*/0.4, new Vector2(-400, 16), /*repeat=*/false, /*scale=*/1, /*direction=*/'RIGHT');

    // Create a tiled floor and perimeter walls using Level helper
    const roomWidth = 20; // tiles horizontally
    const roomHeight = 3; // tiles vertically
    // tileWidth=64, tileHeight=96 match original layout
    this.tileFloor(new Vector2(gridCells(0), gridCells(-1)), roomWidth, roomHeight, 64, 96, resources.images["floorbigtile"], { drawLayer: BASE, startObjectId: -1000 });

    const encounter = new Encounter({
      id: -999999,
      position: new Vector2(gridCells(3), gridCells(4)),
      possibleEnemies: ["skeleton"],
      moveLeftRight: 0,
      moveUpDown: 0
    });
    this.addChild(encounter);


    const encounter2 = new Encounter({
      id: -999998,
      position: new Vector2(gridCells(6), gridCells(8)),
      possibleEnemies: ["skeleton"],
      moveLeftRight: 0,
      moveUpDown: 0
    });
    this.addChild(encounter2);

  
    const exit = new Exit({
      position: new Vector2(gridCells(18), gridCells(1)), showSprite: true
    });
    this.addChild(exit);
  }

  override ready() {
    events.on("CHARACTER_EXITS", this, () => {
      events.emit("CHANGE_LEVEL", new FortPenumbra({ heroPosition: new Vector2(gridCells(2), gridCells(2)), itemsFound: this.itemsFound }));
    });
  }
}
