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
import { Bot } from "../objects/Bot/bot";
 

export class BrushRoad2 extends Level { 
  override defaultHeroPosition = new Vector2(gridCells(1), gridCells(5));
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


    const housesStartX = 7;
    const housesStartY = 15;

    const houseSide = new HouseSide({ position: new Vector2(gridCells(housesStartX), gridCells(housesStartY)) } );
    this.addChild(houseSide); 
    const graphitifrog = new Sprite({ objectId: 0, resource: resources.images["graphitifrog"], position: new Vector2(gridCells(housesStartX + 2), gridCells(housesStartY)), frameSize: new Vector2(22, 32), offsetY: -13 });
    this.addChild(graphitifrog);  
    const graphiti1 = new Sprite({ objectId: 0, resource: resources.images["graphiti1"], position: new Vector2(gridCells(housesStartX + 6), gridCells(housesStartY)), frameSize: new Vector2(48, 32), offsetY: -13, offsetX: -5 });
    this.addChild(graphiti1);
    const graphiti2 = new Sprite({ objectId: 0, resource: resources.images["graphiti2"], position: new Vector2(gridCells(housesStartX + 3), gridCells(housesStartY)), frameSize: new Vector2(48, 32), offsetY: -13 });
    this.addChild(graphiti2);
      
    const houseSide2 = new HouseSide( { position: new Vector2(gridCells(housesStartX + 13), gridCells(housesStartY)) } );
    this.addChild(houseSide2); 
    const graphiticornermonster = new Sprite({ objectId: 0, resource: resources.images["graphiticornermonster"], position: new Vector2(gridCells(housesStartX + 22), gridCells(housesStartY)), frameSize: new Vector2(18, 32), offsetX: -8, offsetY: -15 });
    this.addChild(graphiticornermonster);


    const houseSide3 = new HouseSide( { position: new Vector2(gridCells(housesStartX + 26), gridCells(housesStartY)) } );
    this.addChild(houseSide3); 
    const graphiticornermonster2 = new Sprite({ objectId: 0, resource: resources.images["graphiticornermonster"], position: new Vector2(gridCells(housesStartX + 35), gridCells(housesStartY)), frameSize: new Vector2(18, 32), offsetX: -8, offsetY: -15 });
    this.addChild(graphiticornermonster2);

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

    //exits  
 
    for (let x = 0; x < 4; x++) {
      const brushRoad1Exit = new Exit(
        { position: new Vector2(gridCells(-1), gridCells(x) + gridCells(3)), showSprite: true, targetMap: "BrushRoad1", sprite: "white", colorSwap: new ColorSwap([255, 255, 255], [0, 0, 0]) }
      );
      this.addChild(brushRoad1Exit); 
    }
     
     
     
    //Npcs <<-- PLACED AT THE END BECAUSE FOR SOME REASON, IT DOESNT RENDER MY ACCOUNT (MAX) ON BOTTOM UNLESS ITS POSITIONED HERE LMAO

    const bugCatcher = new Bugcatcher({ position: new Vector2(gridCells(13), gridCells(3)) });
    this.addChild(bugCatcher); 

    const armobot = new Bot({ position: new Vector2(gridCells(28), gridCells(20)), spriteName: "armobot" });
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
    }); 
  } 
}
