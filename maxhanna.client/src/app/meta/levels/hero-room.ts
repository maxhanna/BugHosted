import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Exit } from "../objects/Environment/Exit/exit";
import { Wardrobe } from "../objects/Environment/Wardrobe/wardrobe";
import { Level } from "../objects/Level/level";
import { Watch } from "../objects/InventoryItem/Watch/watch";
import { Sprite } from "../objects/sprite";
import { HeroHome } from "./hero-home";
import { Inventory } from "../objects/inventory";
import { Tv } from "../objects/Environment/Tv/tv";
import { Scenario } from "../helpers/story-flags";
import { BASE, HUD } from "../objects/game-object";
 

export class HeroRoomLevel extends Level {
  override defaultHeroPosition = new Vector2(gridCells(18), gridCells(2));
  showDebugSprites = false;
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined } = {}) {
    super(); 
    this.name = "HeroRoom";
    if (params.heroPosition) { 
      this.defaultHeroPosition = params.heroPosition;
    }
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }

    for (let x = 1; x < 20; x++) {
      for (let y = 0; y < 15; y++) {
        const whiteBg = new Sprite(
          {
            objectId: 0,
            resource: resources.images["white"], //Using whiteBg as possible stepping locations for our heroes. Thats why we preventDraw. This will stop our heroes from stepping out of bounds.
            position: new Vector2(gridCells(x), gridCells(y)),
            frame: 1,
            frameSize: new Vector2(2, 2),
            preventDraw: !this.showDebugSprites,
            drawLayer: !this.showDebugSprites ? undefined : HUD
          }
        );
        this.addChild(whiteBg);
      }
    }
    const floor = new Sprite(
      { resource: resources.images["bedroomFloor"], frameSize: new Vector2(320, 220) }
    );
    floor.drawLayer = BASE;
    this.addChild(floor);
    
    const painting = new Sprite(
      { resource: resources.images["painting"], position: new Vector2(gridCells(15), 0.01), scale: new Vector2(0.75, 0.75), frameSize: new Vector2(30, 28) }
    );
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
    events.on("HERO_EXITS", this, () => {
      events.emit("CHANGE_LEVEL", new HeroHome({ heroPosition: new Vector2(gridCells(17), gridCells(2)), itemsFound: this.itemsFound }));
    });
  }
}
