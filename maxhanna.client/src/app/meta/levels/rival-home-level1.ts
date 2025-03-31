import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Exit } from "../objects/Environment/Exit/exit";
import { Level } from "../objects/Level/level";
import { Watch } from "../objects/InventoryItem/Watch/watch";
import { Sprite } from "../objects/sprite";
import { BrushLevel1 } from "./brush-level1";
import { Scenario } from "../helpers/story-flags";
import { BASE, FLOOR } from "../objects/game-object";
import { DroppedItem } from "../objects/Environment/DroppedItem/dropped-item";
import { InventoryItem } from "../objects/InventoryItem/inventory-item";
import { AI_MASK } from "../objects/Wardrobe/mask";


export class RivalHomeLevel1 extends Level { 
  override defaultHeroPosition = new Vector2(gridCells(18), gridCells(2));
  showDebugSprites = false;
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined } = {}) {
    super();
    this.name = "RivalHomeLevel1";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    }
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }

    const room = new Sprite(
      { resource: resources.images["heroHome"], frameSize: new Vector2(320, 220), drawLayer: BASE }
    );
    this.addChild(room);

    const cornercounter = new Sprite(
      { resource: resources.images["cornercounter"], position: new Vector2(gridCells(0), gridCells(1)), frameSize: new Vector2(33, 49) }
    );
    cornercounter.isSolid = true;
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

    const blinds = new Sprite({
      resource: resources.images["blinds"],
      position: new Vector2(gridCells(5), 0.01),
      scale: new Vector2(0.75, 0.75),
      frameSize: new Vector2(30, 26)
    });
    this.addChild(blinds);

    const painting = new Sprite({
      resource: resources.images["painting"],
      position: new Vector2(gridCells(9), 0.01),
      scale: new Vector2(0.75, 0.75),
      frameSize: new Vector2(30, 28)
    }); 
    painting.textContent = [
      {
        string: ["A picture of a beautiful hiking trail."],
      } as Scenario,
    ];
    this.addChild(painting);


    const blinds2 = new Sprite({
      resource: resources.images["blinds"],
      position: new Vector2(gridCells(13), 0.01),
      scale: new Vector2(0.75, 0.75),
      frameSize: new Vector2(30, 26)
    }); 
    blinds2.textContent = [
      {
        string: ["Ahh, what a beautiful morning!"],
      } as Scenario,
    ];
    this.addChild(blinds2);

    const chair = new Sprite({
      resource: resources.images["chair"],
      position: new Vector2(gridCells(5), gridCells(5)),
      frameSize: new Vector2(32, 32),
      drawLayer: FLOOR
    }); 
    this.addChild(chair);

    const chair2 = new Sprite({
      resource: resources.images["chair"],
      position: new Vector2(gridCells(5), gridCells(8)),
      frameSize: new Vector2(32, 32),
      drawLayer: FLOOR
    }); 
    this.addChild(chair2); 


    const carpet1 = new Sprite({
      resource: resources.images["carpet"],
      position: new Vector2(gridCells(10), gridCells(12)),
      frameSize: new Vector2(32, 32),
      drawLayer: FLOOR
    }); 
    this.addChild(carpet1);
    const carpet2 = new Sprite({
      resource: resources.images["carpet"],
      position: new Vector2(gridCells(9), gridCells(12)),
      frameSize: new Vector2(32, 32),
      drawLayer: FLOOR
    }); 
    this.addChild(carpet2);

    if (!this.itemsFound.includes("AiMask")) { 
      const aiMask = new DroppedItem({
        position: new Vector2(gridCells(9), gridCells(7)),
        item: new InventoryItem({ id: 0, name: "AiMask", image: AI_MASK.name, category: "mask" }),
        itemLabel: "AiMask",
        itemSkin: "aimask",
        preventDestroyTimeout: true,
      });
      this.addChild(aiMask);
    }

    const exitOutside = new Exit({
      position: new Vector2(gridCells(10), gridCells(13)), showSprite: false, targetMap: "BrushLevel1"
    }); 
    this.addChild(exitOutside);

    this.walls = new Set();
    //walls:
    for (let y = -16; y <= 224; y += 16) {
      for (let x = -16; x <= 320; x += 16) {
        // Add walls only for the perimeter: top row, bottom row, left column, and right column
        if (y === -16 || y === 224 || x === -16 || x === 320) {
          this.walls.add(`${x},${y}`);
        }
      }
    }
  }

  override ready() {
    events.on("CHARACTER_EXITS", this, (targetMap: string) => { 
      if (targetMap === "BrushLevel1") {
        events.emit("CHANGE_LEVEL", new BrushLevel1({ heroPosition: new Vector2(gridCells(13), gridCells(10)), itemsFound: this.itemsFound }));
      }
    })
  }
}
