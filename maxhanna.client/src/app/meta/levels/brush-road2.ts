import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Exit } from "../objects/Environment/Exit/exit";
import { Level } from "../objects/Level/level";  
import { Watch } from "../objects/InventoryItem/Watch/watch";
import { Sprite } from "../objects/sprite";
import { CaveLevel1 } from "./cave-level1";
import { HeroHome } from "./hero-home";
import { GOT_FIRST_METABOT, GOT_WATCH, START_FIGHT, Scenario, TALKED_TO_MOM, TALKED_TO_MOM_ABOUT_DAD, TALKED_TO_MOM_ABOUT_WATCH, storyFlags } from "../helpers/story-flags";
import { Npc } from "../objects/Npc/npc";
import { Referee } from "../objects/Npc/Referee/referee";
import { Gangster } from "../objects/Npc/Gangster/gangster";
import { Animations } from "../helpers/animations";
import { STAND_DOWN } from "../objects/Hero/hero-animations";
import { Spiderbot } from "../objects/Npc/Spiderbot/spiderbot";
import { Armobot } from "../objects/Npc/Armobot/armobot";
import { Bugcatcher } from "../objects/Npc/Bugcatcher/bugcatcher";
import { RandomEncounter } from "../objects/Environment/Encounter/encounter";
import { FrameIndexPattern } from "../helpers/frame-index-pattern";
import { MetaBot } from "../../../services/datacontracts/meta/meta-bot";
import { Chicken } from "../objects/Environment/Chicken/chicken";
import { House } from "../objects/Environment/House/house";
import { HouseSide } from "../objects/Environment/House/house-side";
import { Shop } from "../objects/Environment/Shop/shop";
import { Deer } from "../objects/Environment/Deer/deer";
import { Water } from "../objects/Environment/Water/water";
import { GiantTree } from "../objects/Environment/GiantTree/giant-tree";
import { ColorSwap } from "../../../services/datacontracts/meta/color-swap";
import { BrushLevel1 } from "./brush-level1";
import { BrushRoad1 } from "./brush-road1";
import { RainbowAlleys1 } from "./rainbow-alleys1";
import { Bot } from "../objects/Bot/bot";


export class BrushRoad2 extends Level {
  override defaultHeroPosition = new Vector2(gridCells(50), gridCells(30));
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined }) {
    super();
    this.name = "BrushRoad2";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    }
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }

    const whiteBg = new Sprite(
      {
        objectId: 0,
        resource: resources.images["white"],
        position: new Vector2(-150, -100),
        scale: new Vector2(27, 100),
        frame: 1,
        frameSize: new Vector2(2, 2),
      }
    );
    whiteBg.drawLayer = "BASE";
    this.addChild(whiteBg);

    for (let x = -4; x < 41; x++) {
      for (let y = -4; y < 25; y++) {
        const grass = new Sprite({ objectId: 0, resource: resources.images["shortgrass"], position: new Vector2(gridCells(2 * x), gridCells(2 * y)), frameSize: new Vector2(32, 32) });
        grass.drawLayer = "BASE";
        this.addChild(grass);
      }
    }
    for (let y = 0; y < 38; y++) {
      const goldPath = new Sprite(
        { resource: resources.images["goldenPath"], position: new Vector2(gridCells(7), y * 14), frameSize: new Vector2(14, 16), rotation: Math.PI * 3 / 2, offsetX: -8 }
      );
      goldPath.drawLayer = "GROUND";
      this.addChild(goldPath);

      if ((y > 1 && y < 3) || (y > 17 && y < 32)) {
        const goldPath2 = new Sprite(
          { resource: resources.images["goldenPath"], position: new Vector2(gridCells(11), y * 14), frameSize: new Vector2(14, 16), rotation: Math.PI / 2, offsetX: -7, offsetY: -5 }
        );
        goldPath2.drawLayer = "GROUND";
        this.addChild(goldPath2);
      }
      if (y > 17 && y < 32) {
        const goldPath3 = new Sprite(
          { resource: resources.images["goldenPath"], position: new Vector2(gridCells(26), y * 14), frameSize: new Vector2(14, 16), rotation: Math.PI * 3 / 2, offsetX: -8, offsetY: -10 }
        );
        goldPath3.drawLayer = "GROUND";
        this.addChild(goldPath3);

        const goldPath4 = new Sprite(
          { resource: resources.images["goldenPath"], position: new Vector2(gridCells(28), y * 14), frameSize: new Vector2(14, 16), rotation: Math.PI / 2, offsetY: -10 }
        );
        goldPath4.drawLayer = "GROUND";
        this.addChild(goldPath4);

        const goldPath5 = new Sprite(
          { resource: resources.images["goldenPath"], position: new Vector2(gridCells(39), y * 14), frameSize: new Vector2(14, 16), rotation: Math.PI * 3 / 2, offsetX: -8, offsetY: -10 }
        );
        goldPath5.drawLayer = "GROUND";
        this.addChild(goldPath5);

        const goldPath6 = new Sprite(
          { resource: resources.images["goldenPath"], position: new Vector2(gridCells(41), y * 14), frameSize: new Vector2(14, 16), rotation: Math.PI / 2, offsetY: -10 }
        );
        goldPath6.drawLayer = "GROUND";
        this.addChild(goldPath6);
      }

      if (y > 8 && y < 13) {
        const goldPath65 = new Sprite(
          { resource: resources.images["goldenPath"], position: new Vector2(gridCells(49), y * 14), frameSize: new Vector2(14, 16), rotation: Math.PI * 3 / 2, offsetX: -10, offsetY: -12 }
        );
        goldPath65.drawLayer = "GROUND";
        this.addChild(goldPath65);
      }

      if (y > 3) {
        const goldPath7 = new Sprite(
          { resource: resources.images["goldenPath"], position: new Vector2(gridCells(52), y * 14), frameSize: new Vector2(14, 16), rotation: Math.PI / 2, offsetX: -10, offsetY: -10 }
        );
        goldPath7.drawLayer = "GROUND";
        this.addChild(goldPath7);
      }
    }  
    for (let x = 1; x < 22; x++) {
      const goldPath = new Sprite(
        { resource: resources.images["goldenPath"], position: new Vector2(gridCells(8) + gridCells(2 * x), gridCells(2)), frameSize: new Vector2(14, 16), scale: new Vector2(1.51, 1), offsetY: 6 }
      );
      goldPath.drawLayer = "GROUND";
      this.addChild(goldPath);
    }
    for (let x = -1; x < 22; x++) {
      if (x < 21) { 
        const goldPath = new Sprite(
          { resource: resources.images["goldenPath"], position: new Vector2(gridCells(8) + gridCells(2 * x), gridCells(7)), frameSize: new Vector2(14, 16), scale: new Vector2(1.51, 1), flipY: true, offsetY: -6 }
        );
        goldPath.drawLayer = "GROUND";
        this.addChild(goldPath);
        const goldPath2 = new Sprite(
          { resource: resources.images["goldenPath"], position: new Vector2(gridCells(8) + gridCells(2 * x), gridCells(10)), frameSize: new Vector2(14, 16), scale: new Vector2(1.51, 1),  }
        );
        goldPath2.drawLayer = "GROUND";
        this.addChild(goldPath2);

      }
      const goldPath3 = new Sprite(
        { resource: resources.images["goldenPath"], position: new Vector2(gridCells(8) + gridCells(2 * x), gridCells(15)), frameSize: new Vector2(14, 16), scale: new Vector2(1.51, 1), flipY: true,  offsetY: -6 }
      );
      goldPath3.drawLayer = "GROUND";
      this.addChild(goldPath3);

      const goldPath4 = new Sprite(
        { resource: resources.images["goldenPath"], position: new Vector2(gridCells(8) + gridCells(2 * x), gridCells(28)), frameSize: new Vector2(14, 16), scale: new Vector2(1.51, 1),  offsetY: -12 }
      );
      goldPath4.drawLayer = "GROUND";
      this.addChild(goldPath4);

      const goldPath5 = new Sprite(
        { resource: resources.images["goldenPath"], position: new Vector2(gridCells(8) + gridCells(2 * x), gridCells(32)), frameSize: new Vector2(14, 16), scale: new Vector2(1.51, 1),  flipY: true  }
      );
      goldPath5.drawLayer = "GROUND";
      this.addChild(goldPath5);
    } 

    for (let x = 12; x < 60; x++) {
      const goldPath = new Sprite(
        { resource: resources.images["goldenPath"], position: new Vector2(x * 14, 0), frameSize: new Vector2(14, 16) }
      );
      goldPath.drawLayer = "GROUND";
      this.addChild(goldPath);
    }
  

    //GRASS
    for (let x = 21; x < 103; x++) {
      for (let y = 0; y < 3; y++) {
        const grassBlade = new Sprite(
          { objectId: 0, resource: resources.images["grassBlade"], position: new Vector2(gridCells(1) + (gridCells(x) / 2), gridCells(1) + (gridCells(y) / 2)), frameSize: new Vector2(7, 9), offsetX: -8 }
        );
        grassBlade.drawLayer = "FLOOR";
        this.addChild(grassBlade);
      }
    }
    for (let x = 13; x < 96; x++) {
      for (let y = 1; y < 6; y++) {
        const grassBlade = new Sprite(
          { objectId: 0, resource: resources.images["grassBlade"], position: new Vector2(gridCells(1) + (gridCells(x) / 2), gridCells(7) + (gridCells(y) / 2)), frameSize: new Vector2(7, 9), offsetX: -8 }
        );
        grassBlade.drawLayer = "FLOOR";
        this.addChild(grassBlade);
      }
    } 

    for (let x = 0; x < 90; x++) {
      for (let y = 0; y < 20; y++) {
        const grassBlade = new Sprite(
          { objectId: 0, resource: resources.images["grassBlade"], position: new Vector2(gridCells(7) + (gridCells(x) / 2), gridCells(33) + (gridCells(y) / 2)), frameSize: new Vector2(7, 9) }
        );
        grassBlade.drawLayer = "FLOOR";
        this.addChild(grassBlade);
      }
    } 


    const housesStartX = 15;
    const housesStartY = 25;

    const horizontalOffset = 13; // X offset for horizontal fences
    for (let x = 0; x < 12; x++) {
      this.createFences(housesStartX, housesStartY - 10, 2, x, 0, "fenceHorizontal");
      this.createFences(housesStartX + horizontalOffset, housesStartY - 10, 2, x, 0, "fenceHorizontal");
      this.createFences(housesStartX + horizontalOffset * 2, housesStartY - 10, 2, x, 0, "fenceHorizontal");

      this.createFences(housesStartX, housesStartY + 2, 2, x, 0, "fenceHorizontal");
      this.createFences(housesStartX + horizontalOffset, housesStartY + 2, 2, x, 0, "fenceHorizontal");
      this.createFences(housesStartX + horizontalOffset * 2, housesStartY + 2, 2, x, 0, "fenceHorizontal");
    }

    // Create vertical fences
    for (let y = 0; y < 23; y++) {
      this.createFences(housesStartX, housesStartY - 9.5, 6, 0, y / 2, "fenceVertical");
      this.createFences(housesStartX + 11, housesStartY - 9.5, 2, 0, y / 2, "fenceVertical");
      this.createFences(housesStartX + 13, housesStartY - 9.5, 2, 0, y / 2, "fenceVertical");
      this.createFences(housesStartX + 11 + horizontalOffset, housesStartY - 9.5, 2, 0, y / 2, "fenceVertical");
      this.createFences(housesStartX + 13 + horizontalOffset, housesStartY - 9.5, 2, 0, y / 2, "fenceVertical");
      this.createFences(housesStartX + 24 + horizontalOffset, housesStartY - 9.5, 2, 0, y / 2, "fenceVertical");
    }

    //vertical fences ontop of houses
    for (let x = 7; x < 53; x++) {
      if (x < 49) {
        this.createFences(x, 10, 1, 0, 0, "fenceHorizontal");
      }
      if (x > 10) { 
        this.createFences(x, 0, 1, 0, 0, "fenceHorizontal");
      }
    }
    for (let y = 0; y < 15; y++) {
      this.createFences(housesStartX + 37, y, 1, 0, 0, "fenceHorizontal");
    }

    //road

    //top roads entrance
    for (let y = 0; y < 3; y++) {
      const brickTopRoadExit = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(7), gridCells(0) + gridCells(2 * y)), frame: 1, frameSize: new Vector2(32, 32) }
      );
      brickTopRoadExit.drawLayer = "FLOOR";
      this.addChild(brickTopRoadExit);
      const brickTopRoadExit2 = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(9), gridCells(0) + gridCells(2 * y)), frame: 1, frameSize: new Vector2(32, 32) }
      );
      brickTopRoadExit2.drawLayer = "FLOOR";
      this.addChild(brickTopRoadExit2);
    }

    //top roads

    for (let x = -1; x < 21; x++) {
      if (x == - 1) {
        const brickTopRoadHalfCorner = new Sprite(
          { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(9) + gridCells(2 * x), gridCells(5) + 16), frame: 1, frameSize: new Vector2(16, 16) }
        );
        brickTopRoadHalfCorner.drawLayer = "FLOOR";
        this.addChild(brickTopRoadHalfCorner);

      } else if (x < 20) { 

        const brickTopRoad2 = new Sprite(
          { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(8) + gridCells(2 * x), gridCells(5)), frame: 1, frameSize: new Vector2(32, 32) }
        );
        brickTopRoad2.drawLayer = "FLOOR";
        this.addChild(brickTopRoad2);
        const brickTopRoad3 = new Sprite(
          { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(8) + gridCells(2 * x), gridCells(3)), frame: 1, frameSize: new Vector2(32, 32) }
        );
        brickTopRoad3.drawLayer = "FLOOR";
        this.addChild(brickTopRoad3);
      } else {
        const brickTopRoad2 = new Sprite(
          { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(8) + gridCells(2 * x), gridCells(5)), frame: 1, frameSize: new Vector2(16, 32) }
        );
        brickTopRoad2.drawLayer = "FLOOR";
        this.addChild(brickTopRoad2);
        const brickTopRoad3 = new Sprite(
          { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(8) + gridCells(2 * x), gridCells(3)), frame: 1, frameSize: new Vector2(16, 32) }
        );
        brickTopRoad3.drawLayer = "FLOOR";
        this.addChild(brickTopRoad3);
      }
    }

    for (let x = -4; x < 18; x++) {
      const brickRoad = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(housesStartX) + gridCells(2 * x), gridCells(housesStartY) + gridCells(3)), frame: 1, frameSize: new Vector2(32, 32) }
      );
      brickRoad.drawLayer = "FLOOR";
      this.addChild(brickRoad);
      const brickRoad2 = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(housesStartX) + gridCells(2 * x), gridCells(housesStartY) + gridCells(5)), frame: 1, frameSize: new Vector2(32, 32) }
      );
      brickRoad2.drawLayer = "FLOOR";
      this.addChild(brickRoad2);


      if (x < 17) {
        const brickRoadTop = new Sprite(
          { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(housesStartX) + gridCells(2 * x), gridCells(housesStartY) - gridCells(14)), frame: 1, frameSize: new Vector2(32, 32) }
        );
        brickRoadTop.drawLayer = "FLOOR";
        this.addChild(brickRoadTop);
        const brickRoadTop2 = new Sprite(
          { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(housesStartX) + gridCells(2 * x), gridCells(housesStartY) - gridCells(12)), frame: 1, frameSize: new Vector2(32, 32) }
        );
        brickRoadTop2.drawLayer = "FLOOR";
        this.addChild(brickRoadTop2);
      }

      const shrub = new Sprite(
        { resource: resources.images["shrub"], position: new Vector2(gridCells(housesStartX) + gridCells(2 * x), gridCells(housesStartY) + gridCells(7)), scale: new Vector2(0.55, 0.55), frameSize: new Vector2(56, 56) }
      );
      this.addChild(shrub);
      const flowerBush = new Sprite(
        {
          resource: resources.images["flowerbush"], position: new Vector2(gridCells(housesStartX) + gridCells(2 * x) + gridCells(1), gridCells(housesStartY) + gridCells(7)), frameSize: new Vector2(18, 16), hFrames: 4, vFrames: 1,
          animations: new Animations({ standDown: new FrameIndexPattern(STAND_DOWN) })
        }
      );
      this.addChild(flowerBush);
    }
    for (let y = -7; y < 1; y++) {
      const brickRoad = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(housesStartX) - gridCells(6), gridCells(housesStartY) + gridCells(2 * y)), frame: 1, frameSize: new Vector2(32, 32) }
      );
      brickRoad.drawLayer = "FLOOR";
      this.addChild(brickRoad);
      const brickRoad2 = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(housesStartX) - gridCells(8), gridCells(housesStartY) + gridCells(2 * y)), frame: 1, frameSize: new Vector2(32, 32) }
      );
      brickRoad2.drawLayer = "FLOOR";
      this.addChild(brickRoad2);

      const brickRoadBetweenHouse1 = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(housesStartX) + gridCells(11), gridCells(housesStartY) - gridCells(10) - gridCells(2 * y)), frame: 1, frameSize: new Vector2(32, 32) }
      );
      brickRoadBetweenHouse1.drawLayer = "FLOOR";
      this.addChild(brickRoadBetweenHouse1);

      if (y > -7) {
        if (y == -6) {
          const brickRoadBetweenHouse2 = new Sprite(
            { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(housesStartX) + gridCells(24), gridCells(housesStartY) - gridCells(10) - gridCells(2 * y)), frame: 1, frameSize: new Vector2(32, 16) }
          );
          brickRoadBetweenHouse2.drawLayer = "FLOOR";
          this.addChild(brickRoadBetweenHouse2);
        } else {
          const brickRoadBetweenHouse2 = new Sprite(
            { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(housesStartX) + gridCells(24), gridCells(housesStartY) - gridCells(10) - gridCells(2 * y)), frame: 1, frameSize: new Vector2(32, 32) }
          );
          brickRoadBetweenHouse2.drawLayer = "FLOOR";
          this.addChild(brickRoadBetweenHouse2);
        }
      }



      if (y > -6) {
        const brickRoadTop1 = new Sprite(
          { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(housesStartX) + gridCells(34), gridCells(13) + gridCells(2 * y)), frame: 1, frameSize: new Vector2(32, 32) }
        );
        brickRoadTop1.drawLayer = "FLOOR";
        this.addChild(brickRoadTop1);
        const brickRoadTop2 = new Sprite(
          { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(housesStartX) + gridCells(36), gridCells(13) + gridCells(2 * y)), frame: 1, frameSize: new Vector2(12, 32) }
        );
        brickRoadTop2.drawLayer = "FLOOR";
        this.addChild(brickRoadTop2);
      }
      if (y === 0) {
        y++;
        const brickRoad = new Sprite(
          { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(housesStartX) - gridCells(6), gridCells(housesStartY) + gridCells(2 * y)), frame: 1, frameSize: new Vector2(32, 16) }
        );
        brickRoad.drawLayer = "FLOOR";
        this.addChild(brickRoad);
        const brickRoad2 = new Sprite(
          { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(housesStartX) - gridCells(8), gridCells(housesStartY) + gridCells(2 * y)), frame: 1, frameSize: new Vector2(32, 16) }
        );
        brickRoad2.drawLayer = "FLOOR";
        this.addChild(brickRoad2);
      }
    }

    const houseSide = new HouseSide({ position: new Vector2(gridCells(housesStartX), gridCells(housesStartY)) });
    this.addChild(houseSide);
    const graphitifrog = new Sprite({ objectId: 0, resource: resources.images["graphitifrog"], position: new Vector2(gridCells(housesStartX + 2), gridCells(housesStartY)), frameSize: new Vector2(22, 32), offsetY: -13 });
    this.addChild(graphitifrog);
    const graphiti1 = new Sprite({ objectId: 0, resource: resources.images["graphiti1"], position: new Vector2(gridCells(housesStartX + 6), gridCells(housesStartY)), frameSize: new Vector2(48, 32), offsetY: -13, offsetX: -5 });
    this.addChild(graphiti1);
    const graphiti2 = new Sprite({ objectId: 0, resource: resources.images["graphiti2"], position: new Vector2(gridCells(housesStartX + 3), gridCells(housesStartY)), frameSize: new Vector2(48, 32), offsetY: -13 });
    this.addChild(graphiti2);

    

    const houseSide2 = new HouseSide({ position: new Vector2(gridCells(housesStartX + 13), gridCells(housesStartY)) });
    this.addChild(houseSide2);
    const graphitisun = new Sprite({ objectId: 0, resource: resources.images["graphitisun"], position: new Vector2(gridCells(housesStartX + 19), gridCells(housesStartY)), frameSize: new Vector2(60, 32), offsetX: -8, offsetY: -15 });
    this.addChild(graphitisun);  
    const graphitiyack = new Sprite({ objectId: 0, resource: resources.images["graphitiyack"], position: new Vector2(gridCells(housesStartX + 15), gridCells(housesStartY)), frameSize: new Vector2(75, 40), scale: new Vector2(0.98, 0.8), offsetY: -10 });
    this.addChild(graphitiyack);

    graphitiyack


    const houseSide3 = new HouseSide({ position: new Vector2(gridCells(housesStartX + 26), gridCells(housesStartY)) });
    this.addChild(houseSide3);

    const graphitiskull = new Sprite({ objectId: 0, resource: resources.images["graphitiskull"], position: new Vector2(gridCells(housesStartX + 32), gridCells(housesStartY)), frameSize: new Vector2(32, 32), offsetY: -15 });
    this.addChild(graphitiskull);

    const graphitibunny = new Sprite({ objectId: 0, resource: resources.images["graphitibunny"], position: new Vector2(gridCells(housesStartX + 28), gridCells(housesStartY)), frameSize: new Vector2(18, 29), offsetY: -12 });
    this.addChild(graphitibunny);

    const graphiticornermonster2 = new Sprite({ objectId: 0, resource: resources.images["graphiticornermonster"], position: new Vector2(gridCells(housesStartX + 35), gridCells(housesStartY)), frameSize: new Vector2(18, 32), offsetX: -8, offsetY: -15 });
    this.addChild(graphiticornermonster2);


    //WALLS
    for (let y = 0; y < 43; y++) {
      const bb = new Sprite(
        { resource: resources.images["biggerBush"], position: new Vector2(gridCells(6), gridCells(y)), frameSize: new Vector2(15, 17), isSolid: true }
      );
      this.addChild(bb);
      if (y > 31) {
        const bbRight = new Sprite(
          { resource: resources.images["biggerBush"], position: new Vector2(gridCells(52), gridCells(y)), frameSize: new Vector2(15, 17), isSolid: true }
        );
        this.addChild(bbRight);
      }
    }
    for (let x = 7; x < 52; x++) {
      const bb = new Sprite(
        { resource: resources.images["biggerBush"], position: new Vector2(gridCells(x), gridCells(43)), frameSize: new Vector2(15, 17), isSolid: true }
      );
      this.addChild(bb);
    }
    //exits  

    for (let x = 0; x < 4; x++) {
      const brushRoad1Exit = new Exit(
        { position: new Vector2(gridCells(housesStartX + 36), gridCells(x) + gridCells(housesStartY) + gridCells(3)), showSprite: true, targetMap: "BrushRoad1", sprite: "white", colorSwap: new ColorSwap([255, 255, 255], [0, 0, 0]) }
      );
      this.addChild(brushRoad1Exit);
    }
    for (let x = 0; x < 4; x++) {
      const rainbowAlleys1Exit = new Exit(
        { position: new Vector2(gridCells(7) + gridCells(x), gridCells(0)), showSprite: false, targetMap: "RainbowAlleys1", sprite: "white", colorSwap: new ColorSwap([255, 255, 255], [0, 0, 0]) }
      );
      this.addChild(rainbowAlleys1Exit);
    }

    //NPCs<<-- PLACED AT THE END BECAUSE FOR SOME REASON, IT DOESNT RENDER MY ACCOUNT (MAX) ON BOTTOM UNLESS ITS POSITIONED HERE LMAO

    const yardGiantTree = new GiantTree(gridCells(housesStartX) + gridCells(30), gridCells(housesStartY) - gridCells(8));
    this.addChild(yardGiantTree);

    const apple = new Sprite(
      { resource: resources.images["apple"], position: new Vector2(gridCells(housesStartX) + gridCells(35), gridCells(housesStartY) - gridCells(6)), frameSize: new Vector2(5, 7), isSolid: false }
    );
    this.addChild(apple);
    const apple2 = new Sprite(
      { resource: resources.images["apple"], position: new Vector2(gridCells(housesStartX) + gridCells(36), gridCells(housesStartY) - gridCells(9)), frameSize: new Vector2(5, 7), isSolid: false }
    );
    this.addChild(apple2);
    const apple3 = new Sprite(
      { resource: resources.images["apple"], position: new Vector2(gridCells(housesStartX) + gridCells(27), gridCells(housesStartY) - gridCells(8)), frameSize: new Vector2(5, 7), isSolid: false }
    );
    this.addChild(apple3);

    const deer = new Deer(gridCells(housesStartX) + gridCells(34), gridCells(housesStartY) - gridCells(8));
    this.addChild(deer);
    const chicken = new Chicken(gridCells(housesStartX) + gridCells(28), gridCells(housesStartY) - gridCells(9));
    this.addChild(chicken);

    for (let x = 0; x < 4; x++) {
      const chicken = new Chicken(gridCells(housesStartX) + gridCells(16) + gridCells(x * 2), gridCells(housesStartY) - gridCells(x % 2 > 0 ? 7 : 8));
      this.addChild(chicken);
    }

    for (let x = 0; x < 4; x++) {
      const chicken = new Chicken(gridCells(housesStartX) + gridCells(2) + gridCells(x * 2), gridCells(housesStartY) - gridCells(x % 2 > 0 ? 7 : 8));
      this.addChild(chicken);
    } 

    const bugCatcher = new Bugcatcher({ position: new Vector2(gridCells(13), gridCells(3)) });
    this.addChild(bugCatcher);

    const warden = new Bugcatcher({ position: new Vector2(gridCells(50), gridCells(1)) });
    this.addChild(warden);

    const armobot = new Bot({ position: new Vector2(gridCells(24), gridCells(20)), spriteName: "armobot" });
    this.addChild(armobot);

    const encounter = new RandomEncounter({ position: new Vector2(gridCells(26), gridCells(22)), possibleEnemies: [armobot] });
    this.addChild(encounter);
  }
  createFences = (startX: number, startY: number, count: number, offsetX: number, offsetY: number, resource: string) => {
    for (let i = 0; i < count; i++) {
      const fence = new Sprite({
        resource: resources.images[resource],
        position: new Vector2(
          gridCells(startX + offsetX * i),
          gridCells(startY + offsetY)
        ),
        frameSize: new Vector2(16, 16),
        isSolid: true
      });
      this.addChild(fence);
    }
  };

  override ready() {
    events.on("HERO_EXITS", this, (targetMap: string) => {

      if (targetMap === "BrushRoad1") {
        events.emit("CHANGE_LEVEL", new BrushRoad1({
          heroPosition: new Vector2(gridCells(1), gridCells(5)), itemsFound: this.itemsFound
        }));
      }
      if (targetMap === "RainbowAlleys1") {
        events.emit("CHANGE_LEVEL", new RainbowAlleys1({
          heroPosition: new Vector2(gridCells(25), gridCells(42)), itemsFound: this.itemsFound
        }));
      }
    });
  }
}
