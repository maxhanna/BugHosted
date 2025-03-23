import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Exit } from "../objects/Environment/Exit/exit";
import { Level } from "../objects/Level/level";
import { Watch } from "../objects/InventoryItem/Watch/watch";
import { Painting } from "../objects/Environment/Painting/painting";
import { Blinds } from "../objects/Environment/Blinds/blinds";
import { Sprite } from "../objects/sprite";
import { BrushLevel1 } from "./brush-level1";
import { HeroRoomLevel } from "./hero-room";
import { Scenario } from "../helpers/story-flags";
import { Mom } from "../objects/Npc/Mom/mom";
import { BASE, FLOOR } from "../objects/game-object";


export class HeroHome extends Level { 
  override defaultHeroPosition = new Vector2(gridCells(19), gridCells(2));
  showDebugSprites = false; 

  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined } = {}) {
    super();
    this.name = "HeroHome";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    }
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }
 

    const room = new Sprite(
      { resource: resources.images["heroHome"], frameSize: new Vector2(320, 220) }
    );
    room.drawLayer = BASE;
    this.addChild(room);

    const cornercounter = new Sprite(
      { resource: resources.images["cornercounter"], position: new Vector2(gridCells(0), gridCells(1)), frameSize: new Vector2(33, 49), isSolid: true }
    ); 
    this.addChild(cornercounter);

    const stove = new Sprite(
      { resource: resources.images["stove"], position: new Vector2(gridCells(2), gridCells(1)), frameSize: new Vector2(32, 34), isSolid: true }
    ); 
    this.addChild(stove);

    const sink = new Sprite({
      resource: resources.images["sink"],
      position: new Vector2(gridCells(4), gridCells(1)),
      frameSize: new Vector2(65, 34),
      isSolid: true 
    }); 
    this.addChild(sink);

    const fridge = new Sprite({
      resource: resources.images["fridge"],
      position: new Vector2(gridCells(0), gridCells(3)),
      scale: new Vector2(1.25, 1.25),
      frameSize: new Vector2(22, 41),
      isSolid: true 
    });
    this.addChild(fridge);

    if (!this.itemsFound.includes("Watch")) {
      const watch = new Watch({ id: 0, position: new Vector2(gridCells(5), gridCells(2)) });
      this.addChild(watch);
    }

    const blinds = new Blinds({ 
      position: new Vector2(gridCells(5), 0.01),
      scale: new Vector2(0.75, 0.75),
      textContent: ["Ahh, what a beautiful morning!"],
    });
    this.addChild(blinds); 
    const blinds2 = new Blinds({
      position: new Vector2(gridCells(13), 0.01),
      scale: new Vector2(0.75, 0.75),
      textContent: ["Ahh, what a beautiful morning!"]
    });
    this.addChild(blinds2);

    const painting = new Painting({
      position: new Vector2(gridCells(9), 0.01),
      scale: new Vector2(0.75, 0.75),
      textContent: ["A picture of a beautiful hiking trail."]
    });
    this.addChild(painting);

    const chair = new Sprite({
      resource: resources.images["chair"],
      position: new Vector2(gridCells(5), gridCells(5)),
      frameSize: new Vector2(32, 32)
    });
    chair.drawLayer = FLOOR;
    this.addChild(chair);

    const chair2 = new Sprite({
      resource:  resources.images["chair"],
      position: new Vector2(gridCells(5), gridCells(8)),
      frameSize: new Vector2(32, 32)
    });
    chair2.drawLayer = FLOOR;
    this.addChild(chair2);
    const chair3 = new Sprite({
      resource: resources.images["chair"],
      position: new Vector2(gridCells(13), gridCells(5)),
      frameSize: new Vector2(32, 32)
    });
    chair3.drawLayer = FLOOR;
    this.addChild(chair3);

    const chair4 = new Sprite({
      resource: resources.images["chair"],
      position: new Vector2(gridCells(13), gridCells(8)),
      frameSize: new Vector2(32, 32)
    });
    chair4.drawLayer = FLOOR;
    this.addChild(chair4);


    const carpet1 = new Sprite({
      resource: resources.images["carpet"],
      position: new Vector2(gridCells(10), gridCells(12)),
      frameSize: new Vector2(32, 32)
    });
    carpet1.drawLayer = FLOOR;
    this.addChild(carpet1);
    const carpet2 = new Sprite({
      resource: resources.images["carpet"],
      position: new Vector2(gridCells(9), gridCells(12)),
      frameSize: new Vector2(32, 32)
    });
    carpet2.drawLayer = FLOOR;
    this.addChild(carpet2);


    const mom = new Mom(gridCells(13), gridCells(6)); 
    this.addChild(mom);

    for (let y = 0; y < 2; y++) {
      const exitBackToRoom = new Exit({
        position: new Vector2(gridCells(18), gridCells(2 + y)),
        showSprite: (y==0 ? true : false),
        rotation: (Math.PI * 3) / 2,
        targetMap: "HeroRoom",
      });
      this.addChild(exitBackToRoom);
    }

    for (let x = 0; x < 3; x++) { 
      const exitOutside = new Exit({
        position: new Vector2(gridCells(9 + x), gridCells(13)), showSprite: this.showDebugSprites, targetMap: "BrushLevel1"
      });
      this.addChild(exitOutside);
    }

    for (let y = 0; y < gridCells(6); y += gridCells(1)) {
      this.walls.add(`${gridCells(0)},${y}`);
    }
    for (let y = 0; y < gridCells(3); y += gridCells(1)) {
      this.walls.add(`${gridCells(1)},${gridCells(3) + y}`); // fridge
    }

    //walls:
    for (let y = 0; y <= gridCells(14); y += gridCells(1)) {
      for (let x = -gridCells(1); x <= gridCells(20); x += gridCells(1)) {
        // Add walls only for the perimeter: top row, bottom row, left column, and right column
        if (y === 0 || y === gridCells(14) || x === -gridCells(1) || x === gridCells(20)) {
          this.walls.add(`${x},${y}`);
        }
      }
    }
    //counter walls
    for (let x = 0; x < gridCells(8); x += gridCells(1)) {
      if (x == gridCells(5)) continue;
      this.walls.add(`${x},${gridCells(1)}`);
    } 

  }

  override ready() {
    events.on("CHARACTER_EXITS", this, (targetMap: string) => {
      if (targetMap === "HeroRoom") {
        events.emit("CHANGE_LEVEL", new HeroRoomLevel({ heroPosition: new Vector2(gridCells(18), gridCells(2)), itemsFound: this.itemsFound }));
      }
      else if (targetMap === "BrushLevel1") {
        events.emit("CHANGE_LEVEL", new BrushLevel1({ itemsFound: this.itemsFound }));
      }
    })
  }
}
