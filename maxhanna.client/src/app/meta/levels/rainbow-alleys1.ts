import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { DOWN, LEFT, RIGHT, UP, gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Exit } from "../objects/Environment/Exit/exit";
import { Slope } from "../objects/Environment/Slope/slope";
import { StoneCircle } from "../objects/Environment/StoneCircle/stone-circle";
import { Fountain } from "../objects/Environment/Fountain/fountain";
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
import { Spiderbot } from "../objects/Npc/Spiderbot/spiderbot";
import { Armobot } from "../objects/Npc/Armobot/armobot";
import { RandomEncounter } from "../objects/Environment/Encounter/encounter";
import { FrameIndexPattern } from "../helpers/frame-index-pattern";
import { MetaBot } from "../../../services/datacontracts/meta/meta-bot";
import { Chicken } from "../objects/Environment/Chicken/chicken";
import { Museum } from "../objects/Environment/Museum/museum";
import { Stand } from "../objects/Environment/Stand/stand";
import { Shop } from "../objects/Environment/Shop/shop";
import { Deer } from "../objects/Environment/Deer/deer";
import { GiantTree } from "../objects/Environment/GiantTree/giant-tree";
import { ColorSwap } from "../../../services/datacontracts/meta/color-swap";
import { BrushLevel1 } from "./brush-level1";
import { BrushRoad2 } from "./brush-road2";
import { Bot } from "../objects/Bot/bot";
import { Bugcatcher } from "../objects/Npc/Bugcatcher/bugcatcher";
import { HouseSide } from "../objects/Environment/House/house-side";
import { Wardrobe } from "../objects/Environment/Wardrobe/wardrobe";
import { Salesman } from "../objects/Npc/Salesman/salesman";
import { SkillType } from "../helpers/skill-types";
import { InventoryItem } from "../objects/InventoryItem/inventory-item";
import { ANBU_MASK, BOT_MASK, BUNNYEARS_MASK, BUNNY_MASK, Mask, getMaskNameById } from "../objects/Wardrobe/mask";
import { UndergroundLevel1 } from "./underground-level1";
import { BASE, FLOOR, GROUND, HUD } from "../objects/game-object";
 

export class RainbowAlleys1 extends Level { 
  override defaultHeroPosition = new Vector2(gridCells(36), gridCells(32));
  showDebugSprites = false;

  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined }) {
    super();
    this.name = "RainbowAlleys1";
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
    whiteBg.drawLayer = BASE;
    this.addChild(whiteBg);

    for (let x = 1; x < 57; x++) {
      for (let y = -13; y < 45; y++) {
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


    for (let x = -4; x < 40; x++) {
      for (let y = -10; y < 26; y++) {
        const grass = new Sprite({ objectId: 0, resource: resources.images["shortgrass"], position: new Vector2(gridCells(2 * x), gridCells(2 * y)), frameSize: new Vector2(32, 32) });
        grass.drawLayer = BASE;
        this.addChild(grass);
      }
    } 
    for (let y = -1; y < 10; y++) {
      const stoneRoad = new Sprite({ objectId: 0, resource: resources.images["stoneroad"], position: new Vector2(gridCells(1), gridCells(4 * y)), frameSize: new Vector2(64, 64) });
      stoneRoad.drawLayer = FLOOR;
      this.addChild(stoneRoad);
    }

    for (let x = 0; x < 2; x++) { //center road
      for (let y = -5; y < 13; y++) {
        const stoneRoad = new Sprite({ objectId: 0, resource: resources.images["stoneroad"], position: new Vector2(gridCells(21) + gridCells(4*x), gridCells(4 * y)), frameSize: new Vector2(64, 64) });
        stoneRoad.drawLayer = GROUND;
        this.addChild(stoneRoad);
      }  
    }
    for (let x = 0; x < 12; x++) {
      const stoneRoad = new Sprite({ objectId: 0, resource: resources.images["stoneroad"], position: new Vector2(gridCells(5) + gridCells(4 * x), gridCells(12)), frameSize: new Vector2(64, 64) });
      stoneRoad.drawLayer = FLOOR;
      this.addChild(stoneRoad);
    } 
    for (let y = -1; y < 10; y++) {
      const stoneRoad = new Sprite({ objectId: 0, resource: resources.images["stoneroad"], position: new Vector2(gridCells(52), gridCells(4 * y)), frameSize: new Vector2(64, 64) });
      stoneRoad.drawLayer = FLOOR;
      this.addChild(stoneRoad);
    } 
    for (let x = 0; x < 14; x++) {
      const stoneRoad = new Sprite({ objectId: 0, resource: resources.images["stoneroad"], position: new Vector2(gridCells(1) + gridCells(4 * x), gridCells(-4)), frameSize: new Vector2(64, 64) });
      stoneRoad.drawLayer = FLOOR;
      this.addChild(stoneRoad);
    }
    for (let x = 0; x < 14; x++) {
      const stoneRoad = new Sprite({ objectId: 0, resource: resources.images["stoneroad"], position: new Vector2(gridCells(1) + gridCells(4 * x), gridCells(36)), frameSize: new Vector2(64, 64) });
      stoneRoad.drawLayer = FLOOR;
      this.addChild(stoneRoad);
    }

    const museum = new Museum(gridCells(35), gridCells(11));
    this.addChild(museum);

    //STAND
    const maskSelection = [
      new InventoryItem({ id: 0, name: "BunnyMask", image: BUNNY_MASK.name, category: "mask" }),
      new InventoryItem({ id: 0, name: "AnbuMask", image: ANBU_MASK.name, category: "mask" }),
      new InventoryItem({ id: 0, name: "BotMask", image: BOT_MASK.name, category: "mask" }), 
      new InventoryItem({ id: 0, name: "BunnyEarsMask", image: BUNNYEARS_MASK.name, category: "mask" }), 
    ];

    const tmpLvl = new Level();
    tmpLvl.name = "RainbowAlleys1";

    const salesMan = new Salesman(
      {
        position: new Vector2(gridCells(8), gridCells(10) - 0.005),
        heroPosition: new Vector2(gridCells(8), gridCells(11)),
        entranceLevel: tmpLvl,
        items: maskSelection
      });
    if (salesMan.body) { 
      salesMan.body.offsetY += 10;
    }
    this.addChild(salesMan); 
    const stand = new Stand(gridCells(5), gridCells(10));
    this.addChild(stand); 
    const standbg = new Sprite({ position: new Vector2(gridCells(6), gridCells(9)), resource: resources.images["bedroomFloor"], frameSize: new Vector2(142, 32) });
    this.addChild(standbg);
    const anbuMask = new Mask(getMaskNameById(2));
    const bunnyMask = new Mask(getMaskNameById(1));
    const bunnyEarsMask = new Mask(getMaskNameById(4));
    const botMask = new Mask(getMaskNameById(3));
    bunnyMask.frame = 0;
    bunnyEarsMask.frame = 0;
    anbuMask.frame = 0;
    botMask.frame = 0;
    bunnyMask.position = new Vector2(gridCells(7), gridCells(10));
    bunnyEarsMask.position = new Vector2(gridCells(6), gridCells(10));
    anbuMask.position = new Vector2(gridCells(12), gridCells(10));
    botMask.position = new Vector2(gridCells(11), gridCells(10));
    bunnyMask.offsetY -= 30;
    bunnyEarsMask.offsetY -= 20;
    anbuMask.offsetY -= 20;
    botMask.offsetY -= 30;
    this.addChild(bunnyMask);
    this.addChild(bunnyEarsMask);
    this.addChild(anbuMask);
    this.addChild(botMask);

    const wardrobe = new Wardrobe({ position: new Vector2(gridCells(15), gridCells(10)-0.005) });
    if (wardrobe.body) { 
      wardrobe.body.frameSize.x = 24;
      wardrobe.body.flipX = true;
      wardrobe.body.offsetX = 5;
    }
    this.addChild(wardrobe);



    const stand2 = new Stand(gridCells(5), gridCells(2));
    this.addChild(stand2);
    const standbg2 = new Sprite({ position: new Vector2(gridCells(6), gridCells(1)), resource: resources.images["bedroomFloor"], frameSize: new Vector2(142, 32) });
    this.addChild(standbg2);
    const wardrobe2 = new Wardrobe({ position: new Vector2(gridCells(15), gridCells(2) - 0.005) });
    if (wardrobe2.body) {
      wardrobe2.body.frameSize.x = 24;
      wardrobe2.body.flipX = true;
      wardrobe2.body.offsetX = 5;
    }
    this.addChild(wardrobe2); 
    for (let x = 1; x < 5; x++) {
      const stoneRoad = new Sprite({ objectId: 0, resource: resources.images["stoneroad"], position: new Vector2(gridCells(1) + gridCells(4 * x), gridCells(4)), frameSize: new Vector2(64, 64) });
      stoneRoad.drawLayer = FLOOR;
      this.addChild(stoneRoad);
    }
    const stand3 = new Stand(gridCells(5), gridCells(22));
    this.addChild(stand3);
    const standbg3 = new Sprite({ position: new Vector2(gridCells(6), gridCells(21)), resource: resources.images["bedroomFloor"], frameSize: new Vector2(142, 32) });
    this.addChild(standbg3);
    const wardrobe3 = new Wardrobe({ position: new Vector2(gridCells(15), gridCells(22) - 0.005) });
    if (wardrobe3.body) {
      wardrobe3.body.frameSize.x = 24;
      wardrobe3.body.flipX = true;
      wardrobe3.body.offsetX = 5;
    }
    this.addChild(wardrobe3);
    for (let x = 1; x < 5; x++) {
      const stoneRoad = new Sprite({ objectId: 0, resource: resources.images["stoneroad"], position: new Vector2(gridCells(1) + gridCells(4 * x), gridCells(24)), frameSize: new Vector2(64, 64) });
      stoneRoad.drawLayer = FLOOR;
      this.addChild(stoneRoad);
    }


    const stand4 = new Stand(gridCells(5), gridCells(30));
    this.addChild(stand4);
    const standbg4 = new Sprite({ position: new Vector2(gridCells(6), gridCells(29)), resource: resources.images["bedroomFloor"], frameSize: new Vector2(142, 32) });
    this.addChild(standbg4);
    const wardrobe4 = new Wardrobe({ position: new Vector2(gridCells(15), gridCells(30) - 0.005) });
    if (wardrobe4.body) {
      wardrobe4.body.frameSize.x = 24;
      wardrobe4.body.flipX = true;
      wardrobe4.body.offsetX = 5;
    }
    this.addChild(wardrobe4);
    for (let x = 1; x < 5; x++) {
      const stoneRoad = new Sprite({ objectId: 0, resource: resources.images["stoneroad"], position: new Vector2(gridCells(1) + gridCells(4 * x), gridCells(32)), frameSize: new Vector2(64, 64) });
      stoneRoad.drawLayer = FLOOR;
      this.addChild(stoneRoad);
    }

    const stoneCircle = new StoneCircle(gridCells(25), gridCells(13));
    this.addChild(stoneCircle);

    const fountain = new Fountain(gridCells(25), gridCells(13));
    this.addChild(fountain);

    const undergroundentrance = new Sprite(
      {
        resource: resources.images["undergroundentrance"],
        frameSize: new Vector2(127, 170),
        position: new Vector2(gridCells(21), gridCells(-15)),
        offsetX: -1
      });
    this.addChild(undergroundentrance); 
    for (let x = 0; x < 8; x++) {

      const slope = new Slope({ position: new Vector2(gridCells(21) + gridCells(x), gridCells(-7)), showSprite: false, slopeType: DOWN, endScale: new Vector2(0.69, 0.69) });
      this.addChild(slope);


      const slopeUp = new Slope({ position: new Vector2(gridCells(21) + gridCells(x), gridCells(-12)), showSprite: false, slopeType: UP, slopeDirection: DOWN, startScale: new Vector2(0.69, 0.69) });
      this.addChild(slopeUp);
    }
    const sign = new Sprite(
      { objectId: -1, resource: resources.images["sign"], name:"Sign", position: new Vector2(gridCells(21), gridCells(-5)), frameSize: new Vector2(16, 18), isSolid: true }
    );
    sign.textContent = [
      {
        string: [`Underground.`],
      } as Scenario,
    ];
    this.addChild(sign);
    const sign2 = new Sprite(
      { objectId: -1, resource: resources.images["sign"], name: "Sign", position: new Vector2(gridCells(28), gridCells(-5)), frameSize: new Vector2(16, 18), isSolid: true, flipX: true }
    );
    sign2.textContent = [
      {
        string: [`Underground.`],
      } as Scenario,
    ];
    this.addChild(sign2);


    //NPCs <<-- PLACED AT THE END BECAUSE FOR SOME REASON, IT DOESNT RENDER MY ACCOUNT (MAX) ON BOTTOM UNLESS ITS POSITIONED HERE LMAO

    const spiderBot = new Spiderbot({ position: new Vector2(gridCells(24), gridCells(20)), hp: 5, level: 5 });
    const armobot = new Armobot({ position: new Vector2(gridCells(28), gridCells(20)), hp: 5, level: 5 });

    const bystander = new Bugcatcher({ position: new Vector2(gridCells(19), gridCells(8)), moveUpDown: 4, moveLeftRight: 4 });
    this.addChild(bystander); 

    //EXITS
    for (let x = 0; x < 8; x++) {
    
        const brushRoad2Exit = new Exit(
          { position: new Vector2(gridCells(21) + gridCells(x), gridCells(43)), showSprite: true, targetMap: "BrushRoad2", sprite: "white", colorSwap: new ColorSwap([255, 255, 255], [0, 0, 0]) }
        );
        this.addChild(brushRoad2Exit);
    
    }
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 2; y++) { 
      const underground1Exit = new Exit(
        { position: new Vector2(gridCells(21) + gridCells(x), gridCells(-14) + gridCells(y)), showSprite: false, targetMap: "UndergroundLevel1", sprite: "white", colorSwap: new ColorSwap([255, 255, 255], [0, 0, 0]) }
      );
      this.addChild(underground1Exit);
    }
    }

    //Walls
    for (let y = -4; y < 7; y++) {
      const houseSide = new HouseSide({ position: new Vector2(gridCells(-10), gridCells(12) + gridCells(y * 6)) });
      this.addChild(houseSide);

      const houseSide2 = new HouseSide({ position: new Vector2(gridCells(56), gridCells(12) + gridCells(y * 6)) });
      this.addChild(houseSide2);
    }
    for (let x = 0; x < 57; x++) { 
      for (let yMult = 0; yMult < 10; yMult++) {
        if (x < 21 || x > 28) {
          const bb = new Sprite(
            { resource: resources.images["biggerBush"], position: new Vector2(gridCells(x), gridCells(41) + gridCells(yMult)), frameSize: new Vector2(15, 17), isSolid: true }
          );
          this.addChild(bb);
          const bb2 = new Sprite(
            { resource: resources.images["biggerBush"], position: new Vector2(gridCells(x), gridCells(-16) + gridCells(yMult)), frameSize: new Vector2(15, 17), isSolid: true }
          );
          this.addChild(bb2);
        }
      }
    }

   

  }

  override ready() {
    events.on("CHARACTER_EXITS", this, (targetMap: string) => {
      if (targetMap === "BrushRoad2") {
        events.emit("CHANGE_LEVEL", new BrushRoad2({
          heroPosition: new Vector2(gridCells(9), gridCells(1)), itemsFound: this.itemsFound
        }));
      } 
      else if (targetMap === "UndergroundLevel1") {
        events.emit("CHANGE_LEVEL", new UndergroundLevel1({
          heroPosition: new Vector2(gridCells(9), gridCells(1)), itemsFound: this.itemsFound
        }));
      }
    }); 
  } 
}
