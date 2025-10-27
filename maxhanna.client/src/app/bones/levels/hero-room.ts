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


    // Create a room made of repeated "floorbigtile" sprites, centered on the default hero position.
    const roomWidth = 12; // tiles horizontally
    const roomHeight = 5; // tiles vertically
    const centerTileX = Math.round(this.defaultHeroPosition.x / gridCells(1));
    const centerTileY = Math.round(this.defaultHeroPosition.y / gridCells(1));
    const startTileX = centerTileX - Math.floor(roomWidth / 2);
    const startTileY = centerTileY - Math.floor(roomHeight / 2);
    // Starting point in pixel coordinates for the tiled room
    const tileStart = new Vector2(gridCells(startTileX), gridCells(startTileY));
    let tileId = 0;
    for (let rx = 0; rx < roomWidth; rx++) {
      for (let ry = 0; ry < roomHeight; ry++) {
        const tile = new Sprite({
          objectId: -1000 + tileId++,
          resource: resources.images["floorbigtile"],
          position: new Vector2(tileStart.x + 64 * rx, tileStart.y + 96 * ry),
          frameSize: new Vector2(64, 96),
        });
        tile.drawLayer = BASE;
        this.addChild(tile);
      }
    }



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

    this.walls = new Set();

    // Compute the pixel bounding box of the tiled floor area and convert to hero-grid indices
    // so walls align with `gridCells(1)` (20px) regardless of floor tile size (64x96).
    const tilePixelWidth = 64;
    const tilePixelHeight = 96;
    const cellPixel = gridCells(1);
    const leftPixel = tileStart.x;
    const topPixel = tileStart.y;
    const rightPixel = tileStart.x + roomWidth * tilePixelWidth - 1;
    const bottomPixel = tileStart.y + roomHeight * tilePixelHeight - 1;

    const leftIndex = Math.floor(leftPixel / cellPixel);
    const rightIndex = Math.floor(rightPixel / cellPixel);
    const topIndex = Math.floor(topPixel / cellPixel);
    const bottomIndex = Math.floor(bottomPixel / cellPixel);

    // horizontal edges (top and bottom rows of hero-grid cells covered by the floor area)
    for (let gx = leftIndex; gx <= rightIndex; gx++) {
      this.walls.add(`${gridCells(gx)},${gridCells(topIndex)}`);
      this.walls.add(`${gridCells(gx)},${gridCells(bottomIndex)}`);
    }
    // vertical edges (left and right columns)
    for (let gy = topIndex; gy <= bottomIndex; gy++) {
      this.walls.add(`${gridCells(leftIndex)},${gridCells(gy)}`);
      this.walls.add(`${gridCells(rightIndex)},${gridCells(gy)}`);
    }
  }

  override ready() {
    events.on("CHARACTER_EXITS", this, () => {
      //events.emit("CHANGE_LEVEL", new HeroHome({ heroPosition: new Vector2(gridCells(17), gridCells(2)), itemsFound: this.itemsFound }));
    });
  }
}
