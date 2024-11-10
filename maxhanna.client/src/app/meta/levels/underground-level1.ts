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
import { RainbowAlleys1 } from "./rainbow-alleys1";


export class UndergroundLevel1 extends Level {
  override defaultHeroPosition = new Vector2(gridCells(36), gridCells(32));
  showDebugSprites = false;
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined }) {
    super();
    this.name = "UndergroundLevel1";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    }
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }

    for (let x = -4; x < 40; x++) {
      for (let y = -10; y < 10; y++) {
        const metroWall = new Sprite({ objectId: 0, resource: resources.images["metrowall"], position: new Vector2(gridCells(2 * x), gridCells(y)), frameSize: new Vector2(32, 16), flipX: Math.random() > 0.5, flipY: Math.random() > 0.5 });
        metroWall.drawLayer = "BASE";
        this.addChild(metroWall); 
      }
    }
    let flipX = false; 
    for (let x = -4; x < 40; x++) { 
      if (x % 10 == 0) {
        flipX = !flipX;
        const metalsewergrillside = new Sprite({ objectId: 0, resource: resources.images["metalsewergrillside"], position: new Vector2(gridCells(x), gridCells(0)), frameSize: new Vector2(16, 8), flipX: flipX });
        metalsewergrillside.drawLayer = "FLOOR";
        this.addChild(metalsewergrillside);


        if ((x > 5) && (x < 25 || x > 29)) {
          const metalsewergrillside2 = new Sprite({ objectId: 0, resource: resources.images["metalsewergrillside"], position: new Vector2(gridCells(x), gridCells(6)), frameSize: new Vector2(16, 8), flipX: flipX, offsetX: -2, offsetY: 10, scale: new Vector2(0.9, 0.9) });
          metalsewergrillside2.drawLayer = "FLOOR";
          this.addChild(metalsewergrillside2);
        }
      } else {
        const metalsewergrill = new Sprite({ objectId: 0, resource: resources.images["metalsewergrill"], position: new Vector2(gridCells(x), gridCells(0)), frameSize: new Vector2(16, 8) });
        metalsewergrill.drawLayer = "FLOOR";
        this.addChild(metalsewergrill);
        if ((x > 5) && (x < 25 || x > 29)) {
          const metalsewergrill2 = new Sprite({ objectId: 0, resource: resources.images["metalsewergrill"], position: new Vector2(gridCells(x), gridCells(6)), frameSize: new Vector2(16, 8), offsetY: 10, scale: new Vector2(0.9, 0.9) });
          metalsewergrill2.drawLayer = "FLOOR";
          this.addChild(metalsewergrill2);
          const metalsewergrill3 = new Sprite({ objectId: 0, resource: resources.images["metalsewergrill"], position: new Vector2(gridCells(x) - 5, gridCells(6)), frameSize: new Vector2(16, 8), offsetY: 10, scale: new Vector2(0.9, 0.9) });
          metalsewergrill3.drawLayer = "FLOOR";
          this.addChild(metalsewergrill3); 
        } 
      } 

      for (let y = 0; y < 4; y++) {
        const metroFloor = new Sprite({ objectId: 0, resource: resources.images["metrotile"], position: new Vector2(gridCells(x), gridCells(0) + gridCells(y)), frameSize: new Vector2(16, 16) });
        metroFloor.drawLayer = "BASE";
        this.addChild(metroFloor);

        if ((x < 3 || (x > 25 && x < 30))&& y<3) { 
          const metroFloor = new Sprite({ objectId: 0, resource: resources.images["metrotile"], position: new Vector2(gridCells(x), gridCells(4) + gridCells(y)), frameSize: new Vector2(16, 16) });
          metroFloor.drawLayer = "BASE";
          this.addChild(metroFloor);
        }

        if (y < 2) { 
          const metroFloor2 = new Sprite({ objectId: 0, resource: resources.images["metrotile"], position: new Vector2(gridCells(x), gridCells(7) + gridCells(y)), frameSize: new Vector2(16, 16) });
          metroFloor2.drawLayer = "BASE";
          this.addChild(metroFloor2);
        }
      }
    }
    for (let x = 0; x < 8; x++) {
      if (x == 0 || x == 7) {
        const metalRailSide = new Sprite({ position: new Vector2(gridCells(3) + gridCells(x), gridCells(3)), resource: resources.images["metalrailside"], isSolid: true, frameSize: new Vector2(16, 32), flipX: x === 7, offsetY: -16 });
        this.addChild(metalRailSide);
      } else { 
        const metalRail = new Sprite({ position: new Vector2(gridCells(3) +gridCells(x), gridCells(3)), resource: resources.images["metalrail"], isSolid: true, frameSize: new Vector2(16, 32), offsetY: -16 });
        this.addChild(metalRail);
      }
    }

    for (let x = 0; x < 5; x++) {
      const graphitisun = new Sprite({ position: new Vector2(gridCells(x * 30), gridCells(-3)), resource: resources.images["graphitisun"], isSolid: false, frameSize: new Vector2(60, 32) });
      this.addChild(graphitisun);

      const graphitiskull = new Sprite({ position: new Vector2(gridCells(x * 30) + gridCells(5), gridCells(-3)), resource: resources.images["graphitiskull"], isSolid: false, frameSize: new Vector2(32, 41) });
      this.addChild(graphitiskull);

      const graphitiyack = new Sprite({ position: new Vector2(gridCells(x * 30) + gridCells(2), gridCells(-7)), resource: resources.images["graphitiyack"], isSolid: false, frameSize: new Vector2(75, 40) });
      this.addChild(graphitiyack);

      const graphiticornermonster = new Sprite({ position: new Vector2(gridCells(x * 30) + gridCells(7), gridCells(-3)), resource: resources.images["graphiticornermonster"], flipX: true, isSolid: false, frameSize: new Vector2(18, 32) });
      this.addChild(graphiticornermonster);

      const graphitibunny = new Sprite({ position: new Vector2(gridCells(x * 30) + gridCells(4), gridCells(-5)), resource: resources.images["graphitibunny"], flipX: true, isSolid: false, frameSize: new Vector2(18, 29) });
      this.addChild(graphitibunny);

      const graphiti1 = new Sprite({ position: new Vector2(gridCells(x * 30) + gridCells(1), gridCells(-5)), resource: resources.images["graphiti1"], isSolid: false, frameSize: new Vector2(48, 32) });
      this.addChild(graphiti1);
      const graphiti2 = new Sprite({ position: new Vector2(gridCells(x * 30) + gridCells(-1.3), gridCells(-5.5)), resource: resources.images["graphiti2"], isSolid: false, frameSize: new Vector2(48, 32) });
      this.addChild(graphiti2); 

      
    }
     
    for (let x = 0; x < 8; x++) {

      const slopeDown = new Slope({ position: new Vector2(gridCells(3), gridCells(6) + gridCells(x)), showSprite: this.showDebugSprites, slopeType: DOWN, slopeDirection: RIGHT, endScale: new Vector2(0.74, 0.74) });
      this.addChild(slopeDown); 

      const slopeUp0 = new Slope({ position: new Vector2(gridCells(6), gridCells(6) + gridCells(x)), showSprite: this.showDebugSprites, slopeType: UP, slopeDirection: LEFT, startScale: new Vector2(0.74, 0.74), endScale: new Vector2(1, 1) });
      this.addChild(slopeUp0);

      const slopeUp = new Slope({ position: new Vector2(gridCells(22), gridCells(6) + gridCells(x)), showSprite: this.showDebugSprites, slopeType: UP, slopeDirection: RIGHT, startScale: new Vector2(0.74, 0.74), endScale: new Vector2(1, 1) });
      this.addChild(slopeUp);

      const slopeDown2 = new Slope({ position: new Vector2(gridCells(30), gridCells(6) + gridCells(x)), showSprite: this.showDebugSprites, slopeType: DOWN, slopeDirection: RIGHT, startScale: new Vector2(1, 1), endScale: new Vector2(0.74, 0.74) });
      this.addChild(slopeDown2);

      const slopeDown3 = new Slope({ position: new Vector2(gridCells(25), gridCells(6) + gridCells(x)), showSprite: this.showDebugSprites, slopeType: DOWN, slopeDirection: LEFT, startScale: new Vector2(1, 1), endScale: new Vector2(0.74, 0.74) });
      this.addChild(slopeDown3);

      const slopeUp2 = new Slope({ position: new Vector2(gridCells(33), gridCells(6) + gridCells(x)), showSprite: this.showDebugSprites, slopeType: UP, slopeDirection: LEFT, startScale: new Vector2(0.74, 0.74), endScale: new Vector2(1, 1) });
      this.addChild(slopeUp2);
    } 

    const concretestair = new Sprite({ position: new Vector2(gridCells(3), gridCells(6)), resource: resources.images["concretestair"], isSolid: false, frameSize: new Vector2(70, 72), scale: new Vector2(1, 0.8), offsetY: 3 });
    this.addChild(concretestair);
    const concretestair2 = new Sprite({ position: new Vector2(gridCells(22), gridCells(6)), resource: resources.images["concretestair"], isSolid: false, frameSize: new Vector2(70, 72), scale: new Vector2(1, 0.8), offsetY: 3, flipX: true, offsetX: -5 });
    this.addChild(concretestair2); 
    const concretestair3 = new Sprite({ position: new Vector2(gridCells(30), gridCells(6)), resource: resources.images["concretestair"], isSolid: false, frameSize: new Vector2(70, 72), scale: new Vector2(1, 0.8), offsetY: 3});
    this.addChild(concretestair3);

    //EXITS
    for (let x = 0; x < 8; x++) {
      const brushRoad2Exit = new Exit(
        { position: new Vector2(gridCells(0) + gridCells(x), gridCells(0)), showSprite: this.showDebugSprites, targetMap: "RainbowAlleys1", sprite: "white", colorSwap: new ColorSwap([255, 255, 255], [0, 0, 0]) }
      );
      this.addChild(brushRoad2Exit);
    }

    //Walls





  }

  override ready() {
    events.on("HERO_EXITS", this, (targetMap: string) => {
      if (targetMap === "RainbowAlleys1") {
        events.emit("CHANGE_LEVEL", new RainbowAlleys1({
          heroPosition: new Vector2(gridCells(23), gridCells(-12)), itemsFound: this.itemsFound
        }));
      }
    });
  }
}
