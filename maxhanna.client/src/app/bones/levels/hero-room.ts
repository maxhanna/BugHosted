import { Vector2 } from "../../../services/datacontracts/bones/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Exit } from "../objects/Environment/Exit/exit";
import { Wardrobe } from "../objects/Environment/Wardrobe/wardrobe";
import { Level } from "../objects/Level/level";
import { Sprite } from "../objects/sprite"; 
import { Tv } from "../objects/Environment/Tv/tv";
import { Scenario } from "../helpers/story-flags";
import { BASE } from "../objects/game-object";
import { Painting } from "../objects/Environment/Painting/painting"; 
import { Encounter } from "../objects/Environment/Encounter/encounter";
 

export class HeroRoomLevel extends Level {
  override defaultHeroPosition = new Vector2(gridCells(18), gridCells(2));
  showDebugSprites = false;
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined } = {}) {
    super(); 
    console.log("hero room created");
    this.name = "HeroRoom";
    if (params.heroPosition) { 
      this.defaultHeroPosition = params.heroPosition;
    }
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }
   


      const encounter = new Encounter({
        id: -999999,
        position: new Vector2(gridCells(3), gridCells(4)),
        possibleEnemies: ["skeleton"],
        moveLeftRight: 0,
        moveUpDown: 0
      });
      this.addChild(encounter);


    this.walls = new Set();
    //walls 
    //table:
    for (let y = 48; y <= 80; y += 16) {
      for (let x = 80; x <= 176; x += 16) {
        this.walls.add(`${x},${y}`);
      }
    }
    //bed:
    this.walls.add(`16,208`);
    this.walls.add(`16,144`); this.walls.add(`32,144`);
    //walls:
    for (let x = 0; x < 21; x++) {
      if (x != 18) { 
        this.walls.add(`${gridCells(x)},32`);
      }
      this.walls.add(`${gridCells(x)},224`);
    }
    for (let y = 0; y < 21; y++) { 
      this.walls.add(`${gridCells(-1)},${gridCells(y)}`);
      this.walls.add(`320,${(gridCells(y))}`);
    }  

  }

  override ready() {
    events.on("CHARACTER_EXITS", this, () => {
      //events.emit("CHANGE_LEVEL", new HeroHome({ heroPosition: new Vector2(gridCells(17), gridCells(2)), itemsFound: this.itemsFound }));
    });
  }
}
