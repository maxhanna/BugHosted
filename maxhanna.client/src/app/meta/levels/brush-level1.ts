import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { SkillType } from "../helpers/skill-types";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events"; 
import { Exit } from "../objects/Environment/Exit/exit";
import { Level } from "../objects/Level/level";
import { BrushShop1 } from "./brush-shop1";
import { RivalHomeLevel1 } from "./rival-home-level1";
import { Sprite } from "../objects/sprite"; 
import { HeroHome } from "./hero-home";
import { GOT_FIRST_METABOT, START_FIGHT, Scenario, storyFlags } from "../helpers/story-flags";
import { Referee } from "../objects/Npc/Referee/referee";
import { Gangster } from "../objects/Npc/Gangster/gangster";
import { Animations } from "../helpers/animations";
import { STAND_DOWN } from "../objects/Hero/hero-animations";
import { FrameIndexPattern } from "../helpers/frame-index-pattern";
import { MetaBot } from "../../../services/datacontracts/meta/meta-bot";
import { Chicken } from "../objects/Environment/Chicken/chicken";
import { House } from "../objects/Environment/House/house";
import { Shop } from "../objects/Environment/Shop/shop";
import { Deer } from "../objects/Environment/Deer/deer";
import { Water } from "../objects/Environment/Water/water";
import { GiantTree } from "../objects/Environment/GiantTree/giant-tree";
import { Sign } from "../objects/Environment/Sign/sign";
import { BrushRoad1 } from "./brush-road1";
import { GROUND, FLOOR, HUD } from "../objects/game-object";
import { RandomEncounter } from "../objects/Environment/Encounter/encounter";
import { Spiderbot } from "../objects/Npc/Spiderbot/spiderbot";
import { Armobot } from "../objects/Npc/Armobot/armobot";
 

export class BrushLevel1 extends Level { 
  override defaultHeroPosition = new Vector2(gridCells(13), gridCells(29));
  showDebugSprites = false;
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
      {
        objectId: 0,
        resource: resources.images["white"],
        position: new Vector2(-150, -100),
        scale: new Vector2(450, 400),
        frame: 1,
        frameSize: new Vector2(2, 2)
      }
    );
    whiteBg.drawLayer = GROUND;
    this.addChild(whiteBg);

    for (let x = -2; x < 39; x++) {
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

    for (let x = -5; x < 24; x++) {
      for (let y = -5; y < 22; y++) {
        const grass = new Sprite({ objectId: 0, resource: resources.images["shortgrass"], position: new Vector2(gridCells(2 * x), gridCells(2 * y)), frameSize: new Vector2(32, 32) });
        grass.drawLayer = GROUND;
        this.addChild(grass);
      }
    }


    for (let x = 0; x < 3; x++) {
      const water = new Water(gridCells(2 * x) + gridCells(31), gridCells(2));
      water.drawLayer = FLOOR;
      this.addChild(water);
      const water2 = new Water(gridCells(2 * x) + gridCells(31), gridCells(4));
      water2.drawLayer = FLOOR;
      this.addChild(water2);
      const water3 = new Water(gridCells(2 * x) + gridCells(31), gridCells(6));
      water3.drawLayer = FLOOR;
      this.addChild(water3);
    }


    for (let x = 0; x < 10; x++) {
      const brickRoad = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(0) + gridCells(2 * x), gridCells(12)), frame: 1, frameSize: new Vector2(32, 32) }
      );
      brickRoad.drawLayer = FLOOR;
      this.addChild(brickRoad);
      const brickRoad2 = new Sprite(
        { objectId: 0, resource: resources.images["brickRoad"], position: new Vector2(gridCells(0) + gridCells(2 * x), gridCells(14)), frameSize: new Vector2(32, 32) }
      );
      brickRoad2.drawLayer = FLOOR;
      this.addChild(brickRoad2);
    }


    const house = new House(gridCells(8), gridCells(28));
    this.addChild(house);

    const sign = new Sign(
      { position: new Vector2(gridCells(17), gridCells(29)), text: "Home." }
    );  
    this.addChild(sign); 


    const shop = new Shop(gridCells(25), gridCells(17));
    this.addChild(shop); 
  
    const shopsign = new Sign(
      { position: new Vector2(gridCells(32), gridCells(18)), text: "Local Meta-Shop." }
    );
    this.addChild(shopsign); 

    const rivalHouse = new House(gridCells(8), gridCells(10));
    this.addChild(rivalHouse);
    const rivalSign = new Sprite(
      { resource: resources.images["sign"], position: new Vector2(gridCells(17), gridCells(11)), frameSize: new Vector2(16, 18), isSolid: true }
    ); 
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

    //road

    for (let x = 0; x < 43; x++) {
      const goldPath = new Sprite(
        { resource: resources.images["goldenPath"], position: new Vector2(x * 14, 0), frameSize: new Vector2(14, 16) }
      );
      goldPath.drawLayer = FLOOR;
      this.addChild(goldPath);
    } 

    //plants alongside road
    for (let x = 0; x < 10; x++) {
      const shrub = new Sprite(
        { resource: resources.images["shrub"], position: new Vector2(gridCells(3) + (x * 1.5) * gridCells(1), gridCells(15)), scale: new Vector2(0.55, 0.55), frameSize: new Vector2(56, 56) }
      );
      this.addChild(shrub);
    }

    const flowerBush = new Sprite(
      {
        resource: resources.images["flowerbush"], position: new Vector2(gridCells(7), gridCells(11)), frameSize: new Vector2(18, 16), hFrames: 4, vFrames: 1,
        animations: new Animations({ standDown: new FrameIndexPattern(STAND_DOWN) })
      }
    );
    this.addChild(flowerBush);

    //hero's home fence
    for (let x = 0; x < 12; x++) {
      const fence = new Sprite(
        { resource: resources.images["fenceHorizontal"], position: new Vector2(x * gridCells(1) + gridCells(8), gridCells(20)), frameSize: new Vector2(16, 16) }
      );
      fence.isSolid = true;
      this.addChild(fence);

      const fence2 = new Sprite(
        { resource: resources.images["fenceHorizontal"], position: new Vector2(x * gridCells(1) + gridCells(8), gridCells(25)), frameSize: new Vector2(16, 16) }
      );
      fence2.isSolid = true;
      this.addChild(fence2);
    }
    for (let y = 0; y < 6; y++) {
      const fence = new Sprite(
        { resource: resources.images["fenceHorizontal"], position: new Vector2(gridCells(8), y * gridCells(1) + gridCells(20)), frameSize: new Vector2(16, 16) }
      );
      fence.isSolid = true;
      this.addChild(fence);

      const fence2 = new Sprite(
        { resource: resources.images["fenceHorizontal"], position: new Vector2(gridCells(19), y * gridCells(1) + gridCells(20)), frameSize: new Vector2(16, 16) }
      );
      fence2.isSolid = true;
      this.addChild(fence2);
    }
    //hero's home chickens
    const chicken3 = new Chicken(gridCells(13), gridCells(21));
    this.addChild(chicken3);
    const chicken4 = new Chicken(gridCells(15), gridCells(22));
    this.addChild(chicken4);
    const chicken5 = new Chicken(gridCells(12), gridCells(22));
    this.addChild(chicken5);


    //exits 
    const rivalHomeExit = new Exit({ position: new Vector2(gridCells(13), gridCells(10)), showSprite: false, targetMap: "RivalHomeLevel1" }); 
    this.addChild(rivalHomeExit);

    const shopExit = new Exit({ position: new Vector2(gridCells(30), gridCells(17)), showSprite: false, targetMap: "BrushShop1" }); 
    this.addChild(shopExit);

    const heroHomeExit = new Exit({ position: new Vector2(gridCells(13), gridCells(28)), showSprite: false, targetMap: "HeroHome" }); 
    this.addChild(heroHomeExit);

    if (storyFlags.contains("GOT_FIRST_METABOT")) {
      for (let x = 0; x < 5; x++) {
        const brushRoad1Exit = new Exit(
          { position: new Vector2(gridCells(- 1), gridCells(x) + gridCells(12)), showSprite: false, targetMap: "BrushRoad1" }
        );
        this.addChild(brushRoad1Exit); 
      }
    }
    const brsign = new Sign(
      { position: new Vector2(gridCells(1), gridCells(11)), text: "Brush Road." }
    );
    this.addChild(brsign); 
     

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
      if (storyFlags.contains(GOT_FIRST_METABOT) && y >= 24 && y <= 30) {

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

      const bb2 = new Sprite(
        { resource: resources.images["biggerBush"], position: new Vector2(gridCells(38), gridCells(y) / 2), frameSize: new Vector2(15, 17), isSolid: true }
      ); 
      this.addChild(bb2);

      const fence2 = new Sprite(
        { resource: resources.images["fenceVertical"], position: new Vector2(gridCells(37), y * gridCells(1) / 2), frameSize: new Vector2(16, 16), isSolid: true }
      ); 
      this.addChild(fence2);
    }

    //Npcs <<-- PLACED AT THE END BECAUSE FOR SOME REASON, IT DOESNT RENDER MY ACCOUNT (MAX) ON BOTTOM UNLESS ITS POSITIONED HERE LMAO
    if (storyFlags.contains(GOT_FIRST_METABOT)) {
 
      const encounter = new RandomEncounter({ position: new Vector2(gridCells(17), gridCells(2)), possibleEnemies: ["spiderBot", "armobot"] });
      this.addChild(encounter);



      const gangster1 = new Gangster({ position: new Vector2(gridCells(15), gridCells(15)) });
      gangster1.textContent = [
        {
          string: ["Our orders are to get your parents and bring them back to headquarters. You can't stop us."],
        } as Scenario
      ];
      const gangster1Metabot = new MetaBot({ id: -146, heroId: gangster1.id, type: SkillType.SPEED, name: "GG", position: new Vector2(0, 0) });
      gangster1Metabot.hp = 80;
      gangster1Metabot.level = 2;
      gangster1.metabots.push(gangster1Metabot);
      this.addChild(gangster1);

      const gangster2 = new Gangster({ position: new Vector2(gridCells(26), gridCells(18)) });
      gangster2.textContent = [
        {
          string: ["We're not here to chat, buzz off."],
        } as Scenario
      ];
      const gangster2Metabot = new MetaBot({ id: -146, heroId: gangster2.id, type: SkillType.SPEED, name: "GG2", position: new Vector2(0, 0) });
      gangster2Metabot.hp = 80;
      gangster2Metabot.level = 2;
      gangster2.metabots.push(gangster2Metabot);
      this.addChild(gangster2); 

      const gangster3 = new Gangster({ position: new Vector2(gridCells(12), gridCells(29)), moveLeftRight: 2 }); 
      gangster3.textContent = [
        {
          string: ["We're under strict orders not to let anyone in!!"], 
        } as Scenario
      ];
      for (let x = 0; x < 3; x++) {
        const gangster3Metabot = new MetaBot({ id: (-146 - x), heroId: gangster3.id, type: SkillType.SPEED, name: "Jaguar", position: new Vector2(gridCells(14), gridCells(30)) });
        gangster3Metabot.hp = 80;
        gangster3Metabot.level = 2;
        gangster3Metabot.isDeployed = (x == 0);
        gangster3Metabot.spriteName = "Jaguar";
        gangster3Metabot.name = "Jaguar";
        gangster3.metabots.push(gangster3Metabot); 
      }
    
      gangster3.partnerNpcs.push(gangster1);
      gangster3.partnerNpcs.push(gangster2);
      this.addChild(gangster3);
    }
    const referee = new Referee(gridCells(5), gridCells(5));
    referee.textContent = [
      {
        string: ["You want a fight?!"],
        addsFlag: START_FIGHT,
      } as Scenario
    ];
    const refereeMetabot = new MetaBot({ id: -146, heroId: referee.id, type: SkillType.SPEED, name: "Wasp", position: new Vector2(0, 0) });
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

    const refereeMetabot2 = new MetaBot({ id: -145, heroId: referee2.id, type: SkillType.SPEED, name: "Zippy", position: new Vector2(0, 0) });
    refereeMetabot2.level = 5;
    referee2.metabots.push(refereeMetabot2);
    referee2.partnerNpcs.push(referee);
    this.addChild(referee2);


  }

  override ready() {
    events.on("CHARACTER_EXITS", this, (targetMap: string) => {
      if (targetMap === "HeroHome") {
        events.emit("CHANGE_LEVEL", new HeroHome({
          heroPosition: new Vector2(gridCells(10), gridCells(11)), itemsFound: this.itemsFound
        }));
      }
      if (targetMap === "BrushShop1") {
        events.emit("CHANGE_LEVEL", new BrushShop1({
          itemsFound: this.itemsFound
        }));
      }
      if (targetMap === "RivalHomeLevel1") {
        events.emit("CHANGE_LEVEL", new RivalHomeLevel1({
          heroPosition: new Vector2(gridCells(10), gridCells(11)), itemsFound: this.itemsFound
        }));
      }
      if (targetMap === "BrushRoad1") {
        events.emit("CHANGE_LEVEL", new BrushRoad1({
           itemsFound: this.itemsFound
        }));
      }
    }); 
  }
  override getDefaultHeroPosition() {
    return this.defaultHeroPosition;
  }
}
