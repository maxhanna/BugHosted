import { Vector2 } from "../../../services/datacontracts/bones/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Level } from "../objects/Level/level"; 
import { BASE } from "../objects/game-object";
import { Encounter } from "../objects/Environment/Encounter/encounter"; 
import { Exit } from "../objects/Environment/Exit/exit";
import { CitadelOfVesper } from "./citadel-of-vesper";
import { RiftedBastion } from "./rifted-bastion";


export class RoadToRiftedBastion extends Level {
  override defaultHeroPosition = new Vector2(gridCells(2), gridCells(2));
  showDebugSprites = false;  
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined } = {}) {
    super();
    this.name = "RoadToRiftedBastion";
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

    // Explicitly declare each encounter so they always appear (no loop)
    const encA = new Encounter({ id: -999989, position: new Vector2(gridCells(3), gridCells(4)), possibleEnemies: ["skeleton"], moveLeftRight: 0, moveUpDown: 0 });
    this.addChild(encA);
    const encB = new Encounter({ id: -999988, position: new Vector2(gridCells(6), gridCells(8)), possibleEnemies: ["skeleton"], moveLeftRight: 0, moveUpDown: 0 });
    this.addChild(encB);
    const encC = new Encounter({ id: -999987, position: new Vector2(gridCells(5), gridCells(3)), possibleEnemies: ["skeleton"], moveLeftRight: 0, moveUpDown: 0 });
    this.addChild(encC);
    const encD = new Encounter({ id: -999986, position: new Vector2(gridCells(8), gridCells(5)), possibleEnemies: ["skeleton"], moveLeftRight: 0, moveUpDown: 0 });
    this.addChild(encD);
    const encE = new Encounter({ id: -999985, position: new Vector2(gridCells(10), gridCells(4)), possibleEnemies: ["skeleton"], moveLeftRight: 0, moveUpDown: 0 });
    this.addChild(encE);
    const encF = new Encounter({ id: -999984, position: new Vector2(gridCells(12), gridCells(7)), possibleEnemies: ["skeleton"], moveLeftRight: 0, moveUpDown: 0 });
    this.addChild(encF);
    const encG = new Encounter({ id: -999983, position: new Vector2(gridCells(14), gridCells(3)), possibleEnemies: ["skeleton"], moveLeftRight: 0, moveUpDown: 0 });
    this.addChild(encG);
    const encH = new Encounter({ id: -999982, position: new Vector2(gridCells(16), gridCells(6)), possibleEnemies: ["skeleton"], moveLeftRight: 0, moveUpDown: 0 });
    this.addChild(encH); 
    const encI = new Encounter({ id: -999981, position: new Vector2(gridCells(18), gridCells(3)), possibleEnemies: ["skeleton"], moveLeftRight: 0, moveUpDown: 0 });
    this.addChild(encI);
    const encJ = new Encounter({ id: -999980, position: new Vector2(gridCells(20), gridCells(8)), possibleEnemies: ["skeleton"], moveLeftRight: 0, moveUpDown: 0 });
    this.addChild(encJ); 
  
    const exit = new Exit({
      position: new Vector2(gridCells(18), gridCells(1)), showSprite: true, targetMap: 'RiftedBastion'
    });
    this.addChild(exit);

    // Backward exit to the previous level (CitadelOfVesper)
    const backExit = new Exit({ position: new Vector2(gridCells(1), gridCells(1)), showSprite: true, targetMap: 'CitadelOfVesper' });
    this.addChild(backExit);
  }

  override ready() {
    events.on("CHARACTER_EXITS", this, (payload?: any) => {
      const targetMap = payload?.targetMap ?? undefined;
      if (!targetMap || targetMap === 'RiftedBastion') {
        // Hardcoded entrance: RiftedBastion's back-exit to RoadToRiftedBastion is at (1,1)
        events.emit("CHANGE_LEVEL", new RiftedBastion({ heroPosition: new Vector2(gridCells(1), gridCells(1)), itemsFound: this.itemsFound }));
      } else if (targetMap === 'CitadelOfVesper') {
        // Hardcoded entrance: CitadelOfVesper's forward exit that connects to the road is at (18,1)
        events.emit("CHANGE_LEVEL", new CitadelOfVesper({ heroPosition: new Vector2(gridCells(18), gridCells(1)), itemsFound: this.itemsFound }));
      }
    });
  }
}
