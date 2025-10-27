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


export class HeroRoomLevel extends Level {
  override defaultHeroPosition = new Vector2(gridCells(0), gridCells(0));
  showDebugSprites = false;
  // Background sprite references (optional)
  background?: Sprite;
  background2?: Sprite;
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined } = {}) {
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
        resource: resources.images["townbg"], 
        frameSize: new Vector2(1011, 124),
      }
    );

    this.background2 = new Sprite(
      {
        resource: resources.images["townbg2"], 
        frameSize: new Vector2(1011, 124),
      }
    );
    // Register background2 as a parallax background layer instead of a scene child
    // keep the Sprite instance in case other code references it, but don't add it to children
   
    // resources.images[...] is expected to be a drawable (HTMLImageElement or canvas)
    this.addBackgroundLayer(resources.images["townbg"], /*parallax=*/0, new Vector2(0, 0), /*repeat=*/false, /*scale=*/1);
  
    // Fallback: if resource isn't directly drawable, try passing the sprite itself
    this.addBackgroundLayer(resources.images["townbg2"], /*parallax=*/0.4, new Vector2(-400, 16), /*repeat=*/false, /*scale=*/1);


    // Create a tiled floor and perimeter walls using Level helper
    const roomWidth = 20; // tiles horizontally
    const roomHeight = 3; // tiles vertically
    // tileWidth=64, tileHeight=96 match original layout
    this.tileFloor(new Vector2(gridCells(-50), gridCells(0)), roomWidth, roomHeight, 64, 96, resources.images["floorbigtile"], { drawLayer: BASE, startObjectId: -1000 });



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

    
    const bones = new Bones({ 
      position: new Vector2(gridCells(5), gridCells(8)), 
      moveUpDown: 5, 
      moveLeftRight: 1 });
    bones.textContent = [
      {
        string: ["Stay a while and listen!"],
      } as Scenario
    ];
    this.addChild(bones);

    }

  override ready() {
    events.on("CHARACTER_EXITS", this, () => {
      //events.emit("CHANGE_LEVEL", new HeroHome({ heroPosition: new Vector2(gridCells(17), gridCells(2)), itemsFound: this.itemsFound }));
    });
  }
}
