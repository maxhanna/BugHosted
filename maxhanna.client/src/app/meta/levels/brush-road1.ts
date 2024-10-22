import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Exit } from "../objects/Environment/Exit/exit";
import { Level } from "../objects/Level/level";
import { BrushShop1 } from "./brush-shop1";
import { RivalHomeLevel1 } from "./rival-home-level1";
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
import { FrameIndexPattern } from "../helpers/frame-index-pattern";
import { MetaBot, SPEED_TYPE } from "../../../services/datacontracts/meta/meta-bot";
import { Chicken } from "../objects/Environment/Chicken/chicken";
import { House } from "../objects/Environment/House/house";
import { Shop } from "../objects/Environment/Shop/shop";
import { Deer } from "../objects/Environment/Deer/deer";
import { Water } from "../objects/Environment/Water/water";
import { GiantTree } from "../objects/Environment/GiantTree/giant-tree";
import { ColorSwap } from "../../../services/datacontracts/meta/color-swap";
import { BrushLevel1 } from "./brush-level1";
 

export class BrushRoad1 extends Level { 
  override defaultHeroPosition = new Vector2(gridCells(36), gridCells(32));
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
    whiteBg.drawLayer = "FLOOR";
    this.addChild(whiteBg);

    for (let x = -4; x < 24; x++) {
      for (let y = -4; y < 22; y++) {
        const grass = new Sprite({ objectId: 0, resource: resources.images["shortgrass"], position: new Vector2(gridCells(2 * x), gridCells(2 * y)), frameSize: new Vector2(32, 32) });
        grass.drawLayer = "FLOOR";
        this.addChild(grass);
      }
    }

    //road

    for (let x = 0; x < 18; x++) {
      const brickRoad = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(0) + gridCells(2 * x), gridCells(3)), frame: 1, frameSize: new Vector2(32, 32) }
      );
      brickRoad.drawLayer = "FLOOR";
      this.addChild(brickRoad);
      const brickRoad2 = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(0) + gridCells(2 * x), gridCells(5)), frameSize: new Vector2(32, 32) }
      );
      brickRoad2.drawLayer = "FLOOR";
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
      brickRoad.drawLayer = "FLOOR";
      this.addChild(brickRoad);
      const brickRoad2 = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(0) + gridCells(2 * x), gridCells(32)), frameSize: new Vector2(32, 32) }
      );
      brickRoad2.drawLayer = "FLOOR";
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
      brickRoad.drawLayer = "FLOOR";
      this.addChild(brickRoad);
      const brickRoad2 = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(18), gridCells(15) + gridCells(2 * y)), frameSize: new Vector2(32, 32) }
      );
      brickRoad2.drawLayer = "FLOOR";
      this.addChild(brickRoad2);
    }
    const brickRoad = new Sprite(
      { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(16), gridCells(29)), frameSize: new Vector2(32, 16) }
    );
    brickRoad.drawLayer = "FLOOR";
    this.addChild(brickRoad);
    const brickRoad2 = new Sprite(
      { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(18), gridCells(29)), frameSize: new Vector2(32, 16) }
    );
    brickRoad2.drawLayer = "FLOOR";
    this.addChild(brickRoad2);
    //last vertical road on right side
    for (let y = 0; y < 13; y++) {
      const brickRoad3 = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(34), gridCells(3) + gridCells(2*y)), frameSize: new Vector2(32, 32) }
      );
      brickRoad3.drawLayer = "FLOOR";
      this.addChild(brickRoad3);

      const halfBrickRoad = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(36), gridCells(3) + gridCells(2 * y)), frameSize: new Vector2(16, 32) }
      );
      halfBrickRoad.drawLayer = "FLOOR";
      this.addChild(halfBrickRoad);

    }
    

    //end of vertical road

    for (let x = 0; x < 43; x++) {
      const goldPath = new Sprite(
        { resource: resources.images["goldenPath"], position: new Vector2(x * 14, 0), frameSize: new Vector2(14, 16) }
      );
      goldPath.drawLayer = "FLOOR";
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
      const brushRoad1Exit = new Exit(
        { position: new Vector2(gridCells(-1), gridCells(x) + gridCells(3)), showSprite: true, targetMap: "BrushShop1", sprite: "white", colorSwap: new ColorSwap([255, 255, 255], [0, 0, 0]) }
      );
      this.addChild(brushRoad1Exit); 
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

    //Npcs <<-- PLACED AT THE END BECAUSE FOR SOME REASON, IT DOESNT RENDER MY ACCOUNT (MAX) ON BOTTOM UNLESS ITS POSITIONED HERE LMAO
        

  }

  override ready() {
    events.on("HERO_EXITS", this, (targetMap: string) => { 
      if (targetMap === "BrushShop1") {
        events.emit("CHANGE_LEVEL", new BrushShop1({
          heroPosition: new Vector2(gridCells(3), gridCells(8)), itemsFound: this.itemsFound
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
