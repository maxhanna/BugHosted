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
  override defaultHeroPosition = new Vector2(gridCells(0), gridCells(0));
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

    // Create a room made of repeated "floorbigtile" sprites, centered on the default hero position.
    const roomWidth = 5; // tiles horizontally
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
          position: new Vector2(tileStart.x + gridCells(rx), tileStart.y + gridCells(ry)),
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


    this.walls = new Set();
    // Create a large square boundary around the default hero position.
    // Size = number of tiles along each axis (odd so hero can be centered).  
    const SIZE = 80; // tiles
    const half = Math.floor(SIZE / 2);
    const centerX = Math.round(this.defaultHeroPosition.x / gridCells(1));
    const centerY = Math.round(this.defaultHeroPosition.y / gridCells(1));

    const leftTile = centerX - half;
    const rightTile = centerX + half;
    const topTile = centerY - half;
    const bottomTile = centerY + half;

    for (let tx = leftTile; tx <= rightTile; tx++) {
      // top edge
      this.walls.add(`${gridCells(tx)},${gridCells(topTile)}`);
      // bottom edge
      this.walls.add(`${gridCells(tx)},${gridCells(bottomTile)}`);
    }
    for (let ty = topTile; ty <= bottomTile; ty++) {
      // left edge
      this.walls.add(`${gridCells(leftTile)},${gridCells(ty)}`);
      // right edge
      this.walls.add(`${gridCells(rightTile)},${gridCells(ty)}`);
    }

  }

  override ready() {
    events.on("CHARACTER_EXITS", this, () => {
      //events.emit("CHANGE_LEVEL", new HeroHome({ heroPosition: new Vector2(gridCells(17), gridCells(2)), itemsFound: this.itemsFound }));
    });
  }
}
