import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Exit } from "../objects/Environment/Exit/exit";
import { Level } from "../objects/Level/level";
import { Sprite } from "../objects/sprite";
import { ColorSwap } from "../../../services/datacontracts/meta/color-swap";
import { UndergroundLevel1 } from "./underground-level1";
import { BASE } from "../objects/game-object";
import { Encounter } from "../objects/Environment/Encounter/encounter";
import { Referee } from "../objects/Npc/Referee/referee";
import { Scenario } from "../helpers/story-flags";
import { Stand } from "../objects/Environment/Stand/stand";
import { Salesman } from "../objects/Npc/Salesman/salesman";


export class UndergroundLevel2 extends Level {
  override defaultHeroPosition = new Vector2(gridCells(3), gridCells(1));
  showDebugSprites = true;
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined }) {
    super();
    this.name = "UndergroundLevel2";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    }
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }

    for (let x = -4; x < 90; x++) {
      for (let y = -10; y < 50; y++) {
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
      const undergroundLevel1Exit = new Exit(
        { position: new Vector2(gridCells(0) + gridCells(x), gridCells(0)), showSprite: this.showDebugSprites, targetMap: "UndergroundLevel1", sprite: "white", colorSwap: new ColorSwap([255, 255, 255], [0, 0, 0]) }
      );
      this.addChild(undergroundLevel1Exit);
    }

    //Walls

    //NPC
    const referee = new Referee({ position: new Vector2(gridCells(28), gridCells(17)) });
    referee.textContent = [
      {
        string: ["Welcome to the Meta-grinder event!", "How many waves can you survive?!", "Prepare for Ro-Battle!!!"],
      } as Scenario
    ];
    this.addChild(referee);

    const salesman = new Salesman({
      position: new Vector2(gridCells(34), gridCells(11)),
      heroPosition: new Vector2(gridCells(32), gridCells(16)),
      entranceLevel: this,
      offsetY: 42,
    });
    this.addChild(salesman);
    for (let x = 0 ; x < 3; x++) {
      const invisSalesman = new Salesman({
        position: new Vector2(gridCells(33 + x), gridCells(14)),
        heroPosition: new Vector2(gridCells(32), gridCells(16)),
        entranceLevel: this,
        preventDraw: true
      });
      this.addChild(invisSalesman);
    } 

    const tmpEncounterPositions = [
      new Vector2(gridCells(7), gridCells(18)),
      new Vector2(gridCells(8), gridCells(17)),
      new Vector2(gridCells(7), gridCells(16)),

      new Vector2(gridCells(27), gridCells(42)),
      new Vector2(gridCells(25), gridCells(41)),
      new Vector2(gridCells(28), gridCells(40)),

      new Vector2(gridCells(47), gridCells(18)),
      new Vector2(gridCells(49), gridCells(17)),
      new Vector2(gridCells(46), gridCells(15))
    ];
    let ecId = -997753;
    for (let x = 0; x < tmpEncounterPositions.length; x++) {
      const currentId = ecId - x;
      const encounter = new Encounter({
        id: currentId,
        position: tmpEncounterPositions[x],
        possibleEnemies: ["spiderBot", "armobot"],
        hp: 55,
        level: 6
      });
      this.addChild(encounter);
    }

  }

  override ready() {
    events.on("CHARACTER_EXITS", this, (targetMap: string) => {
      if (targetMap === "UndergroundLevel1") {
        events.emit("CHANGE_LEVEL", new UndergroundLevel1({
          heroPosition: new Vector2(gridCells(175), gridCells(6)), itemsFound: this.itemsFound
        }));
      }
    });
  }
}
