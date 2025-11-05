import { Vector2 } from "../../../services/datacontracts/bones/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Level } from "../objects/Level/level"; 
import { BASE } from "../objects/game-object";
import { Encounter } from "../objects/Environment/Encounter/encounter"; 
import { Exit } from "../objects/Environment/Exit/exit";
import { CitadelOfVesper } from "./citadel-of-vesper";
import { HeroRoomLevel } from "./hero-room";


export class RoadToCitadelOfVesper extends Level {
  override defaultHeroPosition = new Vector2(gridCells(2), gridCells(2));
  showDebugSprites = false;  
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined } = {}) {
    super();
    this.name = "RoadToCitadelOfVesper";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    }
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }

    this.addBackgroundLayer(resources.images["ruinsBgFar"], /*parallax=*/0.5, new Vector2(0, gridCells(2)), /*repeat=*/false, /*scale=*/1, /*direction=*/'LEFT');
    this.addBackgroundLayer(resources.images["ruinsBgMedium"], /*parallax=*/0.4, new Vector2(-400, gridCells(2)), /*repeat=*/true, /*scale=*/1, /*direction=*/'RIGHT');
    this.addBackgroundLayer(resources.images["ruinsBgClose"], /*parallax=*/0.4, new Vector2(-400, gridCells(2)), /*repeat=*/true, /*scale=*/1, /*direction=*/'RIGHT');
 
    const roomWidth = 50; // tiles horizontally
    const roomHeight = 11; // tiles vertically 
    this.tileFloor(new Vector2(gridCells(0), gridCells(-1)), roomWidth, roomHeight, 80, 80, resources.images["ruinsFloorTile"], { drawLayer: BASE, startObjectId: -1000 });
    this.tileFloorTopBorder(new Vector2(gridCells(0), gridCells(-4)), roomWidth, 80, 20, resources.images["ruinsFloorBorder"], { drawLayer: BASE, startObjectId: -1000 });
    for (let x = 0; x < roomWidth; x++) {
      this.walls.add(`${x},-4`);
    }
    // Explicitly declare each encounter so they always appear (no loop)
    const encA = new Encounter({ id: -999997, position: new Vector2(gridCells(3), gridCells(4)), possibleEnemies: ["skeleton"], moveLeftRight: 0, moveUpDown: 0 });
    this.addChild(encA);
    const encB = new Encounter({ id: -999996, position: new Vector2(gridCells(6), gridCells(8)), possibleEnemies: ["skeleton"], moveLeftRight: 0, moveUpDown: 0 });
    this.addChild(encB);
    const encC = new Encounter({ id: -999995, position: new Vector2(gridCells(5), gridCells(3)), possibleEnemies: ["skeleton"], moveLeftRight: 0, moveUpDown: 0 });
    this.addChild(encC);
    const encD = new Encounter({ id: -999994, position: new Vector2(gridCells(8), gridCells(5)), possibleEnemies: ["skeleton"], moveLeftRight: 0, moveUpDown: 0 });
    this.addChild(encD);
    const encE = new Encounter({ id: -999993, position: new Vector2(gridCells(10), gridCells(4)), possibleEnemies: ["skeleton"], moveLeftRight: 0, moveUpDown: 0 });
    this.addChild(encE);
    const encF = new Encounter({ id: -999992, position: new Vector2(gridCells(12), gridCells(7)), possibleEnemies: ["skeleton"], moveLeftRight: 0, moveUpDown: 0 });
    this.addChild(encF);
    const encG = new Encounter({ id: -999991, position: new Vector2(gridCells(14), gridCells(3)), possibleEnemies: ["skeleton"], moveLeftRight: 0, moveUpDown: 0 });
    this.addChild(encG);
    const encH = new Encounter({ id: -999990, position: new Vector2(gridCells(16), gridCells(6)), possibleEnemies: ["skeleton"], moveLeftRight: 0, moveUpDown: 0 });
    this.addChild(encH); 
  
    const exit = new Exit({
      position: new Vector2(gridCells(18), gridCells(1)), showSprite: true, targetMap: 'CitadelOfVesper'
    });
    this.addChild(exit);

    // Backward exit to the previous level (HeroRoom)
    const backExit = new Exit({ position: new Vector2(gridCells(1), gridCells(1)), showSprite: true, targetMap: 'HeroRoom' });
    this.addChild(backExit);
  }

  override ready() {
    events.on("CHARACTER_EXITS", this, (payload?: any) => { 
      const targetMap = payload?.targetMap ?? undefined;
      if (!targetMap || targetMap === 'CitadelOfVesper') {
        // Entering CitadelOfVesper from the road should place hero at the citadel's forward exit (18,1)
        events.emit("CHANGE_LEVEL", new CitadelOfVesper({ heroPosition: new Vector2(gridCells(2), gridCells(1)), itemsFound: this.itemsFound }));
      } else if (targetMap === 'HeroRoom') {
        // Entering HeroRoom from this road should land at (2,2)
        events.emit("CHANGE_LEVEL", new HeroRoomLevel({ heroPosition: new Vector2(gridCells(2), gridCells(2)), itemsFound: this.itemsFound }));
      }
    });
  }
}
