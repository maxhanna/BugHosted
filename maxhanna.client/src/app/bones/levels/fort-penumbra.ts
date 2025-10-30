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
import { RoadToGatesOfHell } from "./road-to-gates-of-hell";


export class FortPenumbra extends Level {
  override defaultHeroPosition = new Vector2(gridCells(2), gridCells(2));
  showDebugSprites = false;  
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined } = {}) {
    super();
    this.name = "FortPenumbra";
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
        string: ["Stay a while and listen!"],
      } as Scenario
    ];
    this.addChild(bones);

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
      events.emit("CHANGE_LEVEL", new RoadToGatesOfHell({ heroPosition: new Vector2(gridCells(2), gridCells(2)), itemsFound: this.itemsFound }));
    });
  }
}
