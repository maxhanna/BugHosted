import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Exit } from "../objects/Environment/Exit/exit";
import { Level } from "../objects/Level/level";
import { Sprite } from "../objects/sprite"; 
import { Animations } from "../helpers/animations";
import { STAND_DOWN } from "../objects/Hero/hero-animations";
import { Spiderbot } from "../objects/Npc/Spiderbot/spiderbot";
import { Armobot } from "../objects/Npc/Armobot/armobot";
import { FrameIndexPattern } from "../helpers/frame-index-pattern";
import { Deer } from "../objects/Environment/Deer/deer";
import { GiantTree2 } from "../objects/Environment/GiantTree/giant-tree2";
import { ColorSwap } from "../../../services/datacontracts/meta/color-swap";
import { BrushLevel1 } from "./brush-level1";
import { BrushRoad2 } from "./brush-road2";
import { GROUND, FLOOR, HUD } from "../objects/game-object";
 

export class BrushRoad1 extends Level { 
  override defaultHeroPosition = new Vector2(gridCells(36), gridCells(32));
  showDebugSprites = false;
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined }) {
    super();
    this.name = "BrushRoad1";
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
        scale: new Vector2(450, 400),
        frame: 1,
        frameSize: new Vector2(2, 2),
      }
    );
    whiteBg.drawLayer = GROUND;
    this.addChild(whiteBg);

    for (let x = 1; x < 39; x++) {
      for (let y = 0; y < 38; y++) {
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

    for (let x = -4; x < 24; x++) {
      for (let y = -4; y < 22; y++) {
        const grass = new Sprite({ objectId: 0, resource: resources.images["shortgrass"], position: new Vector2(gridCells(2 * x), gridCells(2 * y)), frameSize: new Vector2(32, 32) });
        grass.drawLayer = GROUND;
        this.addChild(grass);
      }
    }

    //road

    for (let x = 0; x < 18; x++) {
      const brickRoad = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(0) + gridCells(2 * x), gridCells(3)), frame: 1, frameSize: new Vector2(32, 32) }
      );
      brickRoad.drawLayer = FLOOR;
      this.addChild(brickRoad);
      const brickRoad2 = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(0) + gridCells(2 * x), gridCells(5)), frameSize: new Vector2(32, 32) }
      );
      brickRoad2.drawLayer = FLOOR;
      this.addChild(brickRoad2);

      const shrub = new Sprite(
        { resource: resources.images["shrub"], position: new Vector2(gridCells(3) + (x * 1.5) * gridCells(1), gridCells(6)), scale: new Vector2(0.55, 0.55), frameSize: new Vector2(56, 56) }
      );
      this.addChild(shrub);
    }


    for (let x = 0; x < 24; x++) {
      const brickRoad = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(0) + gridCells(2 * x), gridCells(30)), frame: 1, frameSize: new Vector2(32, 32) }
      );
      brickRoad.drawLayer = FLOOR;
      this.addChild(brickRoad);
      const brickRoad2 = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(0) + gridCells(2 * x), gridCells(32)), frameSize: new Vector2(32, 32) }
      );
      brickRoad2.drawLayer = FLOOR;
      this.addChild(brickRoad2);

      const shrub = new Sprite(
        { resource: resources.images["shrub"], position: new Vector2(gridCells(0) + (x * 1.5) * gridCells(1), gridCells(34)), scale: new Vector2(0.55, 0.55), frameSize: new Vector2(56, 56) }
      );
      this.addChild(shrub);
    }


    //vertical road
    for (let y = 0; y < 7; y++) {
      const brickRoad = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(16), gridCells(15) + gridCells(2 * y)), frameSize: new Vector2(32, 32) }
      );
      brickRoad.drawLayer = FLOOR;
      this.addChild(brickRoad);
      const brickRoad2 = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(18), gridCells(15) + gridCells(2 * y)), frameSize: new Vector2(32, 32) }
      );
      brickRoad2.drawLayer = FLOOR;
      this.addChild(brickRoad2);
    }
    const brickRoad = new Sprite(
      { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(16), gridCells(29)), frameSize: new Vector2(32, 16) }
    );
    brickRoad.drawLayer = FLOOR;
    this.addChild(brickRoad);
    const brickRoad2 = new Sprite(
      { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(18), gridCells(29)), frameSize: new Vector2(32, 16) }
    );
    brickRoad2.drawLayer = FLOOR;
    this.addChild(brickRoad2);
    //last vertical road on right side
    for (let y = 0; y < 13; y++) {
      const brickRoad3 = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(34), gridCells(3) + gridCells(2*y)), frameSize: new Vector2(32, 32) }
      );
      brickRoad3.drawLayer = FLOOR;
      this.addChild(brickRoad3);

      const halfBrickRoad = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(36), gridCells(3) + gridCells(2 * y)), frameSize: new Vector2(16, 32) }
      );
      halfBrickRoad.drawLayer = FLOOR;
      this.addChild(halfBrickRoad);

    } 
    //end of vertical road

    //START tallGrass for encounters 
    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 25; y++) {
        const grassBlade = new Sprite(
          {
            objectId: 0,
            resource: resources.images["grassBlade"],
            position: new Vector2(gridCells(6) + (gridCells(x) / 2), gridCells(15) + (gridCells(y) / 2)),
            frameSize: new Vector2(7, 9), offsetX: -8,
            drawLayer: GROUND
          }
        );
        this.addChild(grassBlade);
      }
    } 

    for (let x = 0; x < 27; x++) {
      for (let y = 0; y < 25; y++) {
        const grassBlade = new Sprite(
          {
            objectId: 0,
            resource: resources.images["grassBlade"],
            position: new Vector2(gridCells(21) + (gridCells(x) / 2), gridCells(15) + (gridCells(y) / 2)),
            frameSize: new Vector2(7, 9),
            offsetX: -10,
            drawLayer: GROUND
          }
        );
        this.addChild(grassBlade);
      }
    }

    for (let x = 0; x < 67; x++) {
      for (let y = 0; y < 8; y++) {
        const grassBlade = new Sprite(
          {
            objectId: 0,
            resource: resources.images["grassBlade"],
            position: new Vector2(gridCells(1) + (gridCells(x) / 2), gridCells(9) + (gridCells(y) / 2)),
            frameSize: new Vector2(7, 9),
            offsetX: -10,
            drawLayer: GROUND
          }
        );
        this.addChild(grassBlade);
      }
    } 
    //END of tallGrass

    for (let x = 0; x < 43; x++) {
      const goldPath = new Sprite(
        { resource: resources.images["goldenPath"], position: new Vector2(x * 14, 0), frameSize: new Vector2(14, 16) }
      );
      goldPath.drawLayer = FLOOR;
      this.addChild(goldPath);
    } 
     
    const flowerBush = new Sprite(
      {
        resource: resources.images["flowerbush"], position: new Vector2(gridCells(7), gridCells(11)), frameSize: new Vector2(18, 16), hFrames: 4, vFrames: 1,
        animations: new Animations({ standDown: new FrameIndexPattern(STAND_DOWN) })
      }
    );
    this.addChild(flowerBush);
      
    //exits  
 
    for (let x = 0; x < 4; x++) {
      const brushRoad2Exit = new Exit(
        { position: new Vector2(gridCells(-1), gridCells(x) + gridCells(3)), showSprite: true, targetMap: "BrushRoad2", sprite: "white", colorSwap: new ColorSwap([255, 255, 255], [0, 0, 0]) }
      );
      this.addChild(brushRoad2Exit); 
    }
    for (let x = 0; x < 4; x++) { 
      const brushLevel1Exit = new Exit(
        { position: new Vector2(gridCells(37), gridCells(30) + gridCells(x)), showSprite: true, targetMap: "BrushLevel1", sprite: "white", colorSwap: new ColorSwap([255, 255, 255], [0, 0, 0]) }
      );
      this.addChild(brushLevel1Exit); 
    }
     

    //Walls:  
    //map perimeter fences/bushes
    for (let x = 0; x < 38; x++) {
      const bb = new Sprite(
        { resource: resources.images["biggerBush"], position: new Vector2(x * gridCells(1), gridCells(0)), frameSize: new Vector2(15, 17), isSolid: true }
      ); 
      this.addChild(bb);

      const bb2 = new Sprite(
        { resource: resources.images["biggerBush"], position: new Vector2(x * gridCells(1), gridCells(36)), frameSize: new Vector2(15, 17), isSolid: true }
      ); 
      this.addChild(bb2);

      const fence = new Sprite(
        { resource: resources.images["fenceHorizontal"], position: new Vector2(x * gridCells(1), gridCells(1)), frameSize: new Vector2(16, 16), isSolid: true }
      ); 
      this.addChild(fence);

      const fence2 = new Sprite(
        { resource: resources.images["fenceHorizontal"], position: new Vector2(x * gridCells(1), gridCells(35)), frameSize: new Vector2(16, 16), isSolid: true }
      ); 
      this.addChild(fence2);
    }

    for (let y = 0; y < 70; y++) {
      if (y >= 6 && y <= 12) {

      } else { 
        const bb = new Sprite(
          { resource: resources.images["biggerBush"], position: new Vector2(gridCells(-1), gridCells(y) / 2), frameSize: new Vector2(15, 17), isSolid: true }
        );
        this.addChild(bb);

        const fence = new Sprite(
          { resource: resources.images["fenceVertical"], position: new Vector2(gridCells(0), y * gridCells(1) / 2), frameSize: new Vector2(16, 16), isSolid: true }
        );
        this.addChild(fence);
      }
      

      if (y >= 60 && y <= 66) {

      } else {
        const bb2 = new Sprite(
          { resource: resources.images["biggerBush"], position: new Vector2(gridCells(38), gridCells(y) / 2), frameSize: new Vector2(15, 17), isSolid: true }
        );
        this.addChild(bb2);

        const fence2 = new Sprite(
          { resource: resources.images["fenceVertical"], position: new Vector2(gridCells(37), y * gridCells(1) / 2), frameSize: new Vector2(16, 16), isSolid: true }
        );
        this.addChild(fence2);
      }
    }
    //top one neer exit
    for (let x = 0; x < 35; x++) {
      const fence = new Sprite(
        { resource: resources.images["fenceHorizontal"], position: new Vector2(gridCells(x), gridCells(14)), frameSize: new Vector2(16, 16), isSolid: true }
      );
      this.addChild(fence);
    }
    //bottom one neer entrance
    for (let x = 0; x < 38; x++) {
      if (x <= 15 || x >= 20) {
        const fence = new Sprite(
          { resource: resources.images["fenceHorizontal"], position: new Vector2(gridCells(x), gridCells(29)), frameSize: new Vector2(16, 16), isSolid: true }
        );
        this.addChild(fence);
      }
    }
    //vertical dividers
    for (let y = 0; y < 25; y++) {
      const fence0 = new Sprite(
        { resource: resources.images["fenceVertical"], position: new Vector2(gridCells(5), gridCells(14) + (y * gridCells(1) / 2)), frameSize: new Vector2(32, 32), isSolid: true }
      );
      this.addChild(fence0);

      if (y < 23) { 
        const fence1 = new Sprite(
          { resource: resources.images["fenceVertical"], position: new Vector2(gridCells(10), gridCells(18) + (y * gridCells(1) / 2)), frameSize: new Vector2(32, 32), isSolid: true }
        );
        this.addChild(fence1);
      }

      const fence2 = new Sprite(
        { resource: resources.images["fenceVertical"], position: new Vector2(gridCells(15), gridCells(14) + (y * gridCells(1) / 2)), frameSize: new Vector2(32, 32), isSolid: true, offsetX: 10 }
      );
      this.addChild(fence2);

      const fence3 = new Sprite(
        { resource: resources.images["fenceVertical"], position: new Vector2(gridCells(20), gridCells(14) + (y * gridCells(1) / 2)), frameSize: new Vector2(16, 16), isSolid: true }
      );
      this.addChild(fence3); 


      const fence4 = new Sprite(
        { resource: resources.images["fenceVertical"], position: new Vector2(gridCells(29), gridCells(17) + (y * gridCells(1) / 2)), frameSize: new Vector2(16, 16), isSolid: true }
      );
      this.addChild(fence4); 

      const fence5 = new Sprite(
        { resource: resources.images["fenceVertical"], position: new Vector2(gridCells(34), gridCells(14) + (y * gridCells(1) / 2)), frameSize: new Vector2(16, 16), isSolid: true }
      );
      this.addChild(fence5); 
    }

    const giantTree = new GiantTree2(gridCells(4), gridCells(32));
    this.addChild(giantTree);


    //NPCs

    const deer = new Deer(gridCells(7), gridCells(33));
    this.addChild(deer);

    const spiderBot = new Spiderbot({ position: new Vector2(gridCells(24), gridCells(20)), hp: 5, level: 5 });
    //this.addChild(spiderBot);


    const armobot = new Armobot({ position: new Vector2(gridCells(28), gridCells(20)), hp: 5, level: 5 });
    this.addChild(armobot);

    //const encounter = new RandomEncounter({ position: new Vector2(gridCells(26), gridCells(22)), possibleEnemies: [spiderBot, armobot] });
    //this.addChild(encounter);

    //const encounter2 = new RandomEncounter({ position: new Vector2(gridCells(8), gridCells(10)), possibleEnemies: [spiderBot, armobot] });
    //this.addChild(encounter2);
  }

  override ready() {
    events.on("CHARACTER_EXITS", this, (targetMap: string) => {  
      if (targetMap === "BrushRoad2") {
        events.emit("CHANGE_LEVEL", new BrushRoad2({
          heroPosition: new Vector2(gridCells(50), gridCells(30)), itemsFound: this.itemsFound
        }));
      }
      if (targetMap === "BrushLevel1") {
        events.emit("CHANGE_LEVEL", new BrushLevel1({
          heroPosition: new Vector2(gridCells(1), gridCells(13)), itemsFound: this.itemsFound
        }));
      } 
    }); 
  } 
}
