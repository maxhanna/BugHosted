import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Exit } from "../objects/Environment/Exit/exit";
import { Level } from "../objects/Level/level";
import { Sprite } from "../objects/sprite"; 
import { BASE } from "../objects/game-object";
import { Encounter } from "../objects/Environment/Encounter/encounter"; 
import { UndergroundLevel2 } from "./underground-level2";
import { FireExtinguisher } from "../objects/Environment/FireExtinguisher/fire-extinguisher";
import { Barrels } from "../objects/Environment/Barrels/barrels";
import { Boards } from "../objects/Environment/Boards/boards";
import { Boxes } from "../objects/Environment/Boxes/boxes";
import { Bucket } from "../objects/Environment/Bucket/bucket";
import { Lockers } from "../objects/Environment/Lockers/lockers";
import { Mop } from "../objects/Environment/Mop/mop";
import { MetalFence } from "../objects/Environment/MetalFence/metal-fence";


export class UndergroundLevel3 extends Level {
  override defaultHeroPosition = new Vector2(gridCells(3), gridCells(1));
  showDebugSprites = false;
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined }) {
    super();
    this.name = "UndergroundLevel3";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    }
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }

    for (let x = -4; x < 38; x++) {
      for (let y = -10; y < 55; y++) {
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
    for (let x = 0; x < 6; x++) {
      for (let y = 0; y < 4; y++) {
        const metroFloor = new Sprite({
          objectId: 0, resource: resources.images["metrotile"], position: new Vector2(gridCells(50) + gridCells(x), gridCells(41) + gridCells(y)), frameSize: new Vector2(16, 16),
          drawLayer: BASE
        });
        this.addChild(metroFloor);
      }
    }
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        const metroFloor = new Sprite({
          objectId: 0, resource: resources.images["metrotile"], position: new Vector2(gridCells(56) + gridCells(x), gridCells(37) + gridCells(y)), frameSize: new Vector2(16, 16),
          drawLayer: BASE
        });
        this.addChild(metroFloor);
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
      for (let y = 5; y < 15; y++) {
        if (x < 3 || (x > 25 && x < 30) || x > 45) {
          const metroFloor = new Sprite({
            objectId: 0, resource: resources.images["metrotile"], position: new Vector2(gridCells(x), gridCells(4) + gridCells(y)), frameSize: new Vector2(16, 16),
            drawLayer: BASE
          });
          this.addChild(metroFloor);
        }
      }
      for (let y = 16; y < 20; y++) {
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
      for (let y = 20; y < 40; y++) {
        if (x < 3 || (x > 25 && x < 30) || x > 45) {
          const metroFloor = new Sprite({
            objectId: 0, resource: resources.images["metrotile"], position: new Vector2(gridCells(x), gridCells(4) + gridCells(y)), frameSize: new Vector2(16, 16),
            drawLayer: BASE
          });
          this.addChild(metroFloor);
        }
      }
      for (let y = 40; y < 45; y++) {
        const metroFloor = new Sprite({
          objectId: 0, resource: resources.images["metrotile"], position: new Vector2(gridCells(x), gridCells(0) + gridCells(y)), frameSize: new Vector2(16, 16),
          drawLayer: BASE
        });
        this.addChild(metroFloor);
      } 
    }
    //entrace doors
    for (let x = 0; x < 4; x++) {
      const metroDoor = new Sprite({
        position: new Vector2(gridCells(0 + (2 * x)), gridCells(-1)),
        resource: resources.images["metrodoor"],
        isSolid: false,
        frameSize: new Vector2(26, 40),
        flipX: x > 1,
        offsetY: -18,
        offsetX: 3,
      });
      this.addChild(metroDoor);
    }
    //exit doors
    for (let x = 0; x < 4; x++) {
      const metroDoor = new Sprite({
        position: new Vector2(gridCells(56 + (2 * x)), gridCells(35)),
        resource: resources.images["metrodoor"],
        isSolid: false,
        frameSize: new Vector2(26, 40),
        flipX: x > 1,
        offsetY: -5,
        offsetX: 3,
      });
      this.addChild(metroDoor);
    } 
    const extinguisher = new FireExtinguisher(gridCells(12), gridCells(-2));
    this.addChild(extinguisher);
    for (let x = 0; x < 4; x++) { 
      const barrel1 = new Barrels({ position: new Vector2(gridCells(13 + x), gridCells(0)), type: x, offsetY: -17 });
      this.addChild(barrel1);
    }
    const board = new Boards({ position: new Vector2(gridCells(17), gridCells(-3)), type: 2 });
    this.addChild(board);
 
    for (let x = 0; x < 4; x++) { 
      const box = new Boxes({ position: new Vector2(gridCells(18 + (2 * x)), gridCells(0)), type: x, offsetY: -10 });
      this.addChild(box);
    }
    const bucket = new Bucket({ position: new Vector2(gridCells(19), gridCells(-1)), offsetY: -3 });
    this.addChild(bucket);
    
    for (let x = 0; x < 4; x++) {
      const locker = new Lockers({ position: new Vector2(gridCells(28 + (2 * x)), gridCells(0)), type: x, offsetY: -16 });
      this.addChild(locker);
    }
    for (let y = 0; y < 5; y++) {
      const fenceLength = 12;
      for (let x = 0; x < fenceLength; x++) {
        const metalfence = new MetalFence(
          { 
            position: new Vector2(gridCells(3 + (2 * x)), gridCells(4 * (y == 0 ? 1 : y == 1 ? 3.5 : y == 2 ? 5 : y == 3 ? 9.75 : 11))),
            offsetY: y == 1 ? 16 : y == 2 ? -16 : 0,
            type: x == 0 ? 0 : x == (fenceLength - 1) ? 1 : 2 
          }
        );
        this.addChild(metalfence);
      }
      const fenceLength2 = 8;
      for (let x = 0; x < (y < 5 ? (fenceLength2 * 2) : fenceLength2); x++) {
        const metalfence = new MetalFence(
          { 
            position: new Vector2(gridCells((y < 4 ? 30 : -4) + (2 * x)), gridCells(4 * (y == 0 ? 1 : y == 1 ? 3.75 : y == 2 ? 4.75 : y == 3 ? 9.75 : 11))),
            type: x == 0 ? 0 : x == (y != 4 ? (fenceLength2 - 1) : (fenceLength2 * 2)) ? 1 : 2
          }
        );
        this.addChild(metalfence);
      }
    }
   

    const mop = new Mop({ position: new Vector2(gridCells(26), gridCells(0)), offsetY: -16, offsetX: 10 });
    this.addChild(mop);

    //EXITS
    for (let x = 0; x < 8; x++) {
      const undergroundLevel2Exit = new Exit(
        { position: new Vector2(gridCells(0) + gridCells(x), gridCells(0)), 
          showSprite: this.showDebugSprites, 
          targetMap: "UndergroundLevel2", 
          sprite: "white" 
        }
      );
      this.addChild(undergroundLevel2Exit);
    } 

    //Walls

    //NPC 

    const tmpEncounterPositions = [
      new Vector2(gridCells(1), gridCells(16)),
      new Vector2(gridCells(-3), gridCells(17)),
      new Vector2(gridCells(-2), gridCells(14)),
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
