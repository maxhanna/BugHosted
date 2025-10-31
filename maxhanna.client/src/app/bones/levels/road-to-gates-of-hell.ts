import { Vector2 } from "../../../services/datacontracts/bones/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Level } from "../objects/Level/level"; 
import { BASE } from "../objects/game-object";
import { Encounter } from "../objects/Environment/Encounter/encounter"; 
import { Exit } from "../objects/Environment/Exit/exit";
import { CitadelOfVesper } from "./citadel-of-vesper";
import { GatesOfHell } from "./gates-of-hell";


export class RoadToGatesOfHell extends Level {
  override defaultHeroPosition = new Vector2(gridCells(2), gridCells(2));
  showDebugSprites = false;  
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined } = {}) {
    super();
    this.name = "RoadToGatesOfHell";
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
    this.tileFloor(new Vector2(gridCells(0), gridCells(-1)), roomWidth, roomHeight, 64, 96, resources.images["floortileiso"], { drawLayer: BASE, startObjectId: -1000 });

const encounterPositions: { x: number; y: number }[] = [
      { x: 3, y: 4 },
      { x: 6, y: 8 },
      { x: 5, y: 3 },
      { x: 8, y: 5 },
      { x: 10, y: 4 },
      { x: 12, y: 7 },
      { x: 14, y: 3 },
      { x: 16, y: 6 },
      { x: 18, y: 4 },
      { x: 20, y: 8 }
    ];

    let curId = -999969;
    for (const pos of encounterPositions) {
      const enc = new Encounter({
        id: curId,
        position: new Vector2(gridCells(pos.x), gridCells(pos.y)),
        possibleEnemies: ["skeleton"],
        moveLeftRight: 0,
        moveUpDown: 0
      });
      this.addChild(enc);
      curId--;
    }
  
    const exit = new Exit({
      position: new Vector2(gridCells(18), gridCells(1)), showSprite: true, targetMap: 'GatesOfHell'
    });
    this.addChild(exit);

    // Backward exit to the previous level (CitadelOfVesper)
    const backExit = new Exit({ position: new Vector2(gridCells(1), gridCells(1)), showSprite: true, targetMap: 'CitadelOfVesper' });
    this.addChild(backExit);
  }

  override ready() {
    events.on("CHARACTER_EXITS", this, (targetMap?: string) => {
      if (!targetMap || targetMap === 'GatesOfHell') {
        events.emit("CHANGE_LEVEL", new GatesOfHell({ heroPosition: new Vector2(gridCells(2), gridCells(2)), itemsFound: this.itemsFound }));
      } else if (targetMap === 'CitadelOfVesper') {
        events.emit("CHANGE_LEVEL", new CitadelOfVesper({ heroPosition: new Vector2(gridCells(2), gridCells(2)), itemsFound: this.itemsFound }));
      }
    });
  }
}
