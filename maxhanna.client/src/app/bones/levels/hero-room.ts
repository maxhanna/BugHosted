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

 
    const floor = new Sprite(
      { resource: resources.images["bedroomFloor"], frameSize: new Vector2(320, 220) }
    );
    floor.drawLayer = BASE;
    this.addChild(floor);
    
   
    const painting = new Painting({
      position: new Vector2(gridCells(15), gridCells(2)),
      scale: new Vector2(0.75, 0.75),
      offsetY: -20,
      textContent: ["A picture of a beautiful hiking trail."]
    });
    this.addChild(painting);

    const xbox = new Sprite(
      { resource: resources.images["xbox"], position: new Vector2(gridCells(8), gridCells(3)), scale: new Vector2(0.8, 0.8), frameSize: new Vector2(32, 28) }
    );
    this.addChild(xbox);

    for (let x = 0; x < 4; x++) {
      const wardrobe = new Wardrobe({ position: new Vector2(gridCells(x+1), gridCells(3)), isVisible: x === 0 });
      this.addChild(wardrobe);
    } 

    const tv = new Tv({ position: new Vector2(gridCells(6), gridCells(5)), spritePosition: new Vector2(gridCells(-0.25), gridCells(-2)) });
    tv.textContent = [
      {
        string: ["A movie is playing showing four young boys on a train track."],
      } as Scenario,
    ]; 
    this.addChild(tv);


    const exit = new Exit({
      position: new Vector2(gridCells(18), gridCells(1)), showSprite: false
    });
    this.addChild(exit);
     

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
