import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Exit } from "../objects/Environment/Exit/exit";
import { Level } from "../objects/Level/level";
import { Sprite } from "../objects/sprite";
import { ColorSwap } from "../../../services/datacontracts/meta/color-swap";
import { BASE } from "../objects/game-object";
import { Stand } from "../objects/Environment/Stand/stand";
import { Encounter } from "../objects/Environment/Encounter/encounter";
import { UndergroundLevel2 } from "./underground-level2";


export class UndergroundLevel3 extends Level {
  override defaultHeroPosition = new Vector2(gridCells(3), gridCells(1));
  showDebugSprites = true;
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined }) {
    super();
    this.name = "UndergroundLevel3";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    }
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }

    for (let x = -4; x < 90; x++) {
      for (let y = -10; y < 10; y++) {
        const metroWall = new Sprite({
          objectId: 0, resource: resources.images["metrowall"],
          position: new Vector2(gridCells(2 * x), gridCells(y)),
          frameSize: new Vector2(32, 16),
          drawLayer: BASE,
          flipX: Math.random() > 0.5,
          flipY: Math.random() > 0.5
        });
        this.addChild(metroWall);
      }
    }
    for (let x = -4; x < 50; x++) {
      if (x % 10 == 0) {
        const metalsewergrillside = new Sprite({ objectId: 0, resource: resources.images["metalsewergrillside"], position: new Vector2(gridCells(x), gridCells(0)), frameSize: new Vector2(16, 8), drawLayer: "FLOOR" });
        this.addChild(metalsewergrillside);


        if ((x > 5) && (x < 25 || x > 29)) {
          const metalsewergrillside2 = new Sprite({ objectId: 0, resource: resources.images["metalsewergrillside"], position: new Vector2(gridCells(x), gridCells(6)), frameSize: new Vector2(16, 8), drawLayer: "FLOOR", offsetX: -2, offsetY: 10, scale: new Vector2(0.9, 0.9) });
          this.addChild(metalsewergrillside2);
        }
      } else {
        const metalsewergrill = new Sprite({ objectId: 0, resource: resources.images["metalsewergrill"], position: new Vector2(gridCells(x), gridCells(0)), drawLayer: "FLOOR", frameSize: new Vector2(16, 8) });
        this.addChild(metalsewergrill);
        if ((x > 5) && (x < 25 || x > 29)) {
          const metalsewergrill2 = new Sprite({ objectId: 0, resource: resources.images["metalsewergrill"], position: new Vector2(gridCells(x), gridCells(6)), drawLayer: "FLOOR", frameSize: new Vector2(16, 8), offsetY: 10, scale: new Vector2(0.9, 0.9) });
          this.addChild(metalsewergrill2);
          const metalsewergrill3 = new Sprite({ objectId: 0, resource: resources.images["metalsewergrill"], position: new Vector2(gridCells(x) - 5, gridCells(6)), drawLayer: "FLOOR", frameSize: new Vector2(16, 8), offsetY: 10, scale: new Vector2(0.9, 0.9) });
          this.addChild(metalsewergrill3);
        }
      }

      for (let y = 0; y < 5; y++) {
        const metroFloor = new Sprite({
          objectId: 0, resource: resources.images["metrotile"], position: new Vector2(gridCells(x), gridCells(0) + gridCells(y)), frameSize: new Vector2(16, 16),
          drawLayer: BASE
        });
        this.addChild(metroFloor);

        if (x < 3 || (x > 25 && x < 30) || x > 45) {
          const metroFloor = new Sprite({
            objectId: 0, resource: resources.images["metrotile"], position: new Vector2(gridCells(x), gridCells(4) + gridCells(y)), frameSize: new Vector2(16, 16),
            drawLayer: BASE
          });
          this.addChild(metroFloor);
        }
      }
    } 
    for (let x = 0; x < 4; x++) {
      const metroDoor = new Sprite({
        position: new Vector2(gridCells(0 + (2 * x)), gridCells(-2)),
        resource: resources.images["metrodoor"],
        isSolid: false,
        frameSize: new Vector2(26, 40),
        flipX: x > 1,
        offsetY: -5,
        offsetX: 3,
      });
      this.addChild(metroDoor);
    }


    const stand = new Stand( gridCells(31), gridCells(12) );
    this.addChild(stand);
    const shopSign = new Sprite({
      objectId: 0, resource: resources.images["metagrindershopsign"], 
      position: new Vector2(gridCells(32), gridCells(11)),
      frameSize: new Vector2(240, 32), 
      scale: new Vector2(0.75, 0.8),
      offsetX: 5,
      offsetY: 5,
    });
    this.addChild(shopSign);

    //EXITS
    for (let x = 0; x < 8; x++) {
      const undergroundLevel2Exit = new Exit(
        { position: new Vector2(gridCells(0) + gridCells(x), gridCells(0)), showSprite: this.showDebugSprites, targetMap: "UndergroundLevel2", sprite: "white", colorSwap: new ColorSwap([255, 255, 255], [0, 0, 0]) }
      );
      this.addChild(undergroundLevel2Exit);
    } 

     
    const tmpEncounterPositions = [
      new Vector2(gridCells(7), gridCells(2)),
      new Vector2(gridCells(8), gridCells(3)),
      new Vector2(gridCells(7), gridCells(1)), 
      new Vector2(gridCells(27), gridCells(2)),
      new Vector2(gridCells(25), gridCells(3)),
      new Vector2(gridCells(28), gridCells(1)), 
      new Vector2(gridCells(47), gridCells(1)),
      new Vector2(gridCells(49), gridCells(3)), 
    ];
    let ecId = -997762;
    for (let x = 0; x < tmpEncounterPositions.length; x++) {
      const currentId = ecId - x;
      const encounter = new Encounter({
        id: currentId,
        position: tmpEncounterPositions[x],
        possibleEnemies: ["spiderBot", "armobot"],
        hp: 1,
        level: 1,
        moveLeftRight: 10
      });
      this.addChild(encounter);
    }

  }

  override ready() {
    events.on("CHARACTER_EXITS", this, (targetMap: string) => {
      if (targetMap === "UndergroundLevel2") {
        events.emit("CHANGE_LEVEL", new UndergroundLevel2({
          heroPosition: new Vector2(gridCells(57), gridCells(38)), itemsFound: this.itemsFound
        }));
      }
    });
  }
}
