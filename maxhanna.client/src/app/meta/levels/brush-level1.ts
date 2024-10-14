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
import { HeroHomeLevel } from "./hero-home";
import { GOT_WATCH, START_FIGHT, Scenario, TALKED_TO_MOM, TALKED_TO_MOM_ABOUT_DAD, TALKED_TO_MOM_ABOUT_WATCH } from "../helpers/story-flags";
import { Npc } from "../objects/Npc/npc";
import { Referee } from "../objects/Npc/Referee/referee";
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
 

export class BrushLevel1 extends Level { 
  override defaultHeroPosition = new Vector2(gridCells(13), gridCells(29));
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined }) {
    super();
    this.name = "BrushLevel1";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    } 
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }
     
    const whiteBg = new Sprite(
      { objectId: 0, resource: resources.images["white"], position: new Vector2(-150, -100), scale: new Vector2(450, 400), frame: 1, frameSize: new Vector2(2, 2) }
    );
    whiteBg.drawLayer = "FLOOR";
    this.addChild(whiteBg);

    for (let x = 0; x < 24; x++) {
      for (let y = 0; y < 22; y++) {
        const grass = new Sprite({ objectId: 0, resource: resources.images["shortgrass"], position: new Vector2(gridCells(2 * x), gridCells(2 * y)), frameSize: new Vector2(32, 32) });
        grass.drawLayer = "FLOOR";
        this.addChild(grass);
      }
    }

    for (let x = 0; x < 3; x++) {
      const water = new Water(gridCells(2 * x) + gridCells(31), gridCells(2));
      water.drawLayer = "FLOOR";
      this.addChild(water);
      const water2 = new Water(gridCells(2 * x) + gridCells(31), gridCells(4));
      water2.drawLayer = "FLOOR";
      this.addChild(water2);
      const water3 = new Water(gridCells(2 * x) + gridCells(31), gridCells(6));
      water3.drawLayer = "FLOOR";
      this.addChild(water3);
    }


    for (let x = 0; x < 10; x++) {
      const brickRoad = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(0) + gridCells(2 * x), gridCells(12)), frame: 1, frameSize: new Vector2(32, 32) }
      );
      brickRoad.drawLayer = "FLOOR";
      this.addChild(brickRoad);
      const brickRoad2 = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(0) + gridCells(2 * x), gridCells(14)), frameSize: new Vector2(32, 32) }
      );
      brickRoad2.drawLayer = "FLOOR";
      this.addChild(brickRoad2);
    }


    const house = new House(gridCells(8), gridCells(28));
    this.addChild(house); 
    const sign = new Sprite(
      { objectId: 0, resource: resources.images["sign"], position: new Vector2(gridCells(17), gridCells(29)), frameSize: new Vector2(16, 18) }
    );
    sign.isSolid = true; 
    sign.textContent = [
      {
        string: [`Home.`],
      } as Scenario,
    ];
    this.addChild(sign); 


    const shop = new Shop(gridCells(25), gridCells(17));
    this.addChild(shop); 
    const shopSign = new Sprite(
      { resource: resources.images["sign2"], position: new Vector2(gridCells(32), gridCells(18)), frameSize: new Vector2(16, 18) }
    );
    shopSign.isSolid = true;
    shopSign.textContent = [
      {
        string: [`Local Meta-Shop.`],
      } as Scenario,
    ];
    this.addChild(shopSign);

    const rivalHouse = new House(gridCells(8), gridCells(10));
    this.addChild(rivalHouse);
    const rivalSign = new Sprite(
      { resource: resources.images["sign"], position: new Vector2(gridCells(17), gridCells(11)), frameSize: new Vector2(16, 18) }
    );
    rivalSign.isSolid = true;
    rivalSign.textContent = [
      {
        string: [`Rivals' House.`],
      } as Scenario,
    ];
    this.addChild(rivalSign);

    const tree = new GiantTree(gridCells(32), gridCells(32)); 
    this.addChild(tree);

    const chicken = new Chicken(gridCells(20), gridCells(25));
    this.addChild(chicken);
    const chicken2 = new Chicken(gridCells(25), gridCells(20));
    this.addChild(chicken2);

    const deer = new Deer(gridCells(28), gridCells(32));
    this.addChild(deer);

    const referee = new Referee(gridCells(5), gridCells(5));
    referee.textContent = [
      {
        string: ["You want a fight?!"],
        addsFlag: START_FIGHT,
      } as Scenario
    ]; 

    const refereeMetabot = new MetaBot(-146, referee.id, SPEED_TYPE, "Wasp", false, new Vector2(0, 0));
    refereeMetabot.hp = 10;
    refereeMetabot.level = 5;
    referee.metabots.push(refereeMetabot);
    this.addChild(referee);

    const referee2 = new Referee(gridCells(5), gridCells(25));
    referee2.textContent = [
      {
        string: ["You want to fight both of us huh?!"],
        addsFlag: START_FIGHT,
      } as Scenario
    ];
    
    const refereeMetabot2 = new MetaBot(-145, referee2.id, SPEED_TYPE, "Zippy", false, new Vector2(0, 0));
    refereeMetabot2.level = 5;
    referee2.metabots.push(refereeMetabot2);
    referee2.partnerNpcs.push(referee);
    this.addChild(referee2);


    for (let x = 0; x < 43; x++) {
      const goldPath = new Sprite(
        { resource: resources.images["goldenPath"], position: new Vector2(x * 14, 0), frameSize: new Vector2(14, 16) }
      );
      goldPath.drawLayer = "FLOOR";
      this.addChild(goldPath);
    }


    for (let x = 0; x < 38; x++) {
      const fence = new Sprite(
        { resource: resources.images["fenceHorizontal"], position: new Vector2(x * gridCells(1), gridCells(1)), frameSize: new Vector2(16, 16) }
      );
      fence.isSolid = true;
      this.addChild(fence);

      const fence2 = new Sprite(
        { resource: resources.images["fenceHorizontal"], position: new Vector2(x * gridCells(1), gridCells(35)), frameSize: new Vector2(16, 16) }
      );
      fence2.isSolid = true;
      this.addChild(fence2);
    }

    for (let y = 0; y < 70; y++) {
      const fence = new Sprite(
        { resource: resources.images["fenceVertical"], position: new Vector2(gridCells(0), y * gridCells(1) / 2), frameSize: new Vector2(16, 16) }
      );
      fence.isSolid = true;
      this.addChild(fence);

      const fence2 = new Sprite(
        { resource: resources.images["fenceVertical"], position: new Vector2(gridCells(37), y * gridCells(1) / 2), frameSize: new Vector2(16, 16) }
      );
      fence2.isSolid = true;
      this.addChild(fence2);
    }

    for (let x = 0; x < 38; x++) {
      const bb = new Sprite(
        { resource: resources.images["biggerBush"], position: new Vector2(x * gridCells(1), gridCells(0)), frameSize: new Vector2(15, 17) }
      );
      bb.isSolid = true;
      this.addChild(bb);

      const bb2 = new Sprite(
        { resource: resources.images["biggerBush"], position: new Vector2(x * gridCells(1), gridCells(36)), frameSize: new Vector2(15, 17) }
      );
      bb2.isSolid = true;
      this.addChild(bb2);
    }
    for (let y = 0; y < 72; y++) {
      const bb = new Sprite(
        { resource: resources.images["biggerBush"], position: new Vector2(gridCells(-1), gridCells(y) / 2), frameSize: new Vector2(15, 17) }
      );
      bb.isSolid = true;
      this.addChild(bb);

      const bb2 = new Sprite(
        { resource: resources.images["biggerBush"], position: new Vector2(gridCells(38), gridCells(y) / 2), frameSize: new Vector2(15, 17) }
      );
      bb2.isSolid = true;
      this.addChild(bb2);
    }

    for (let x = 0; x < 10; x++) {
      const shrub = new Sprite(
        { resource: resources.images["shrub"], position: new Vector2(gridCells(3) + (x * 1.5) * gridCells(1), gridCells(15)), scale: new Vector2(0.55, 0.55), frameSize: new Vector2(56, 56) }
      );
      this.addChild(shrub);
    }

    const flowerBush = new Sprite(
      {
        resource: resources.images["flowerbush"], position: new Vector2(gridCells(2), gridCells(2)), frameSize: new Vector2(18, 64), hFrames: 4, vFrames: 1,
        animations: new Animations({ standDown: new FrameIndexPattern(STAND_DOWN) })
      }
    );
    this.addChild(flowerBush);


    const heroHomeExit = new Exit(gridCells(13), gridCells(28), false, (Math.PI * 3) / 2);
    heroHomeExit.targetMap = "HeroHome";
    this.addChild(heroHomeExit); 

    const rivalHomeExit = new Exit(gridCells(13), gridCells(10), true, (Math.PI * 3) / 2);
    rivalHomeExit.targetMap = "RivalHomeLevel1";
    this.addChild(rivalHomeExit);

    const shopExit = new Exit(gridCells(30), gridCells(17), false, (Math.PI * 3) / 2);
    shopExit.targetMap = "BrushShop1";
    this.addChild(shopExit);
    //Walls: 
  }

  override ready() {
    events.on("HERO_EXITS", this, (targetMap: string) => {
      if (targetMap === "HeroHome") {
        events.emit("CHANGE_LEVEL", new HeroHomeLevel({
          heroPosition: new Vector2(gridCells(10), gridCells(11)), itemsFound: this.itemsFound
        }));
      }
      if (targetMap === "BrushShop1") {
        events.emit("CHANGE_LEVEL", new BrushShop1({
          heroPosition: new Vector2(gridCells(3), gridCells(8)), itemsFound: this.itemsFound
        }));
      }
      if (targetMap === "RivalHomeLevel1") {
        events.emit("CHANGE_LEVEL", new RivalHomeLevel1({
          heroPosition: new Vector2(gridCells(10), gridCells(11)), itemsFound: this.itemsFound
        }));
      }
    }); 
  }
  override getDefaultHeroPosition() {
    return this.defaultHeroPosition;
  }
}
