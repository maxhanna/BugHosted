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
import { BASE, FLOOR, HUD } from "../objects/game-object";


export class UndergroundLevel1 extends Level {
  override defaultHeroPosition = new Vector2(gridCells(3), gridCells(1));
  showDebugSprites = true;
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined }) {
    super();
    this.name = "UndergroundLevel1";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    }
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }

   
    for (let x = -4; x < 170; x++) {
      for (let y = 0; y < 9; y++) {
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
    

    for (let x = -4; x < 90; x++) {
      for (let y = -10; y < 10; y++) {
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
    let flipX = false; 
    for (let x = -4; x < 44; x++) { 
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

        if ((x < 3 || (x > 25 && x < 30)) && y < 5) {
          const metroFloor = new Sprite({
            objectId: 0, resource: resources.images["metrotile"], position: new Vector2(gridCells(x), gridCells(4) + gridCells(y)), frameSize: new Vector2(16, 16),
            drawLayer: BASE
          });
          this.addChild(metroFloor);
        } 
      }
    }
    for (let railNo = 0; railNo < 3; railNo++) {
      for (let x = 0; x < 8; x++) {
        if (x == 0 || x == 7) {
          const metalRailSide = new Sprite({ position: new Vector2(gridCells(2) + gridCells(8 * railNo) + gridCells(x), gridCells(3)), resource: resources.images["metalrailside"], isSolid: true, frameSize: new Vector2(16, 32), flipX: x === 7, offsetY: -16 });
          this.addChild(metalRailSide);
        } else {
          const metalRail = new Sprite({ position: new Vector2(gridCells(2) + gridCells(8 * railNo) + gridCells(x), gridCells(3)), resource: resources.images["metalrail"], isSolid: true, frameSize: new Vector2(16, 32), offsetY: -16 });
          this.addChild(metalRail);
        }
      }
    }
    for (let x = 0; x < 8; x++) {
      if (x == 0 || x == 7) {
        const metalRailSide = new Sprite({ position: new Vector2(gridCells(30) + gridCells(x), gridCells(3)), resource: resources.images["metalrailside"], isSolid: true, frameSize: new Vector2(16, 32), flipX: x === 7, offsetY: -16 });
        this.addChild(metalRailSide);
      } else {
        const metalRail = new Sprite({ position: new Vector2(gridCells(30) + gridCells(x), gridCells(3)), resource: resources.images["metalrail"], isSolid: true, frameSize: new Vector2(16, 32), offsetY: -16 });
        this.addChild(metalRail);
      }
    }
     
    for (let x = 0; x < 3; x++) {
      if (x == 0 || x == 2) {
        const metalRailSide = new Sprite({ position: new Vector2(gridCells(38) + gridCells(x), gridCells(3)), resource: resources.images["metalrailside"], isSolid: true, frameSize: new Vector2(16, 32), flipX: x === 2, offsetY: -16 });
        this.addChild(metalRailSide);
      } else {
        const metalRail = new Sprite({ position: new Vector2(gridCells(38) + gridCells(x), gridCells(3)), resource: resources.images["metalrail"], isSolid: true, frameSize: new Vector2(16, 32), offsetY: -16 });
        this.addChild(metalRail);
      }
    }
    for (let y = 0; y < 4; y++) {

      const metalRailSide0 = new Sprite({ position: new Vector2(gridCells(2), gridCells(2) + gridCells(y)), resource: resources.images["metalrailside"], isSolid: y != 0, frameSize: new Vector2(5, 16) });
      this.addChild(metalRailSide0);

      const metalRailSide = new Sprite({ position: new Vector2(gridCells(26), gridCells(2) + gridCells(y)), resource: resources.images["metalrailside"], isSolid: y != 0, flipX: true, frameSize: new Vector2(5, 16), offsetX: -5 });
      this.addChild(metalRailSide);

      const metalRailSide2 = new Sprite({ position: new Vector2(gridCells(30), gridCells(2) + gridCells(y)), resource: resources.images["metalrailside"], isSolid: y != 0, frameSize: new Vector2(5, 16)  });
      this.addChild(metalRailSide2); 
    }
    //second floor
    for (let x = 0; x < 70; x++) {
      for (let y = 0; y < 16; y++) {
        if ((x < 37 && y < 12) || (x > 14 && x < 27) ) continue;
        const metroFloor = new Sprite({
          objectId: 0, resource: resources.images["metrotile"], position: new Vector2(gridCells(7) + gridCells(x), gridCells(1) + gridCells(y / 2)),
          drawLayer: BASE, frameSize: new Vector2(16, 16), scale: new Vector2(0.9, 0.9)
        }); 
        this.addChild(metroFloor);
       
        const metroFloor2 = new Sprite({
          objectId: 0, resource: resources.images["metrotile"], position: new Vector2(gridCells(7) + 10 + gridCells(x), gridCells(1) + gridCells(y / 2)),
          drawLayer: BASE, frameSize: new Vector2(16, 16), scale: new Vector2(0.9, 0.9)
        }); 
        this.addChild(metroFloor2);
      } 
    }
    
    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 5; y++) {
        const chair = new Sprite({
          resource: resources.images["chair"],
          position: new Vector2(gridCells(51) + gridCells(x), gridCells(2) + gridCells(y)),
          frameSize: new Vector2(32, 32),
          scale: new Vector2(0.7, 0.7),
          drawLayer: FLOOR
        }); 
        this.addChild(chair);
      }
    }
    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 5; y++) {
        const chair = new Sprite({
          resource: resources.images["chair"],
          position: new Vector2(gridCells(60) + gridCells(x), gridCells(2) + gridCells(y)),
          frameSize: new Vector2(32, 32),
          scale: new Vector2(0.7, 0.7),
          drawLayer: FLOOR
        }); 
        this.addChild(chair);
      }
    }

    for (let y = 0; y < 3; y++) { 
      const advertisementpanelside = new Sprite({
        resource: resources.images["advertisementpanelside"],
        position: new Vector2(gridCells(56), gridCells(3) + gridCells(y)),
        frameSize: new Vector2(32, 62),
        isSolid: true,
        drawLayer: FLOOR,
        scale: new Vector2(0.7, 0.7)
      });
      advertisementpanelside.textContent = [
        {
          string: [`An ad for NightCityAutomaton Corp... That's where robots get made.`],
        } as Scenario,
      ];
      this.addChild(advertisementpanelside); 
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

      const recycling = new Sprite({ position: new Vector2(gridCells(x * 30) + gridCells(-1), gridCells(-1) + 5), resource: resources.images["recycling"], isSolid: false, frameSize: new Vector2(23, 19) });
      this.addChild(recycling);
      const garbage = new Sprite({ position: new Vector2(gridCells(x * 30) + gridCells(-3), gridCells(-1) + 5), resource: resources.images["recycling"], isSolid: false, frameSize: new Vector2(23, 19), colorSwap: new ColorSwap([0,166,60], [200,200,202]) });
      this.addChild(garbage); 
    }

    for (let x = 0; x < 4; x++) {
      const metrobilboard = new Sprite({ position: new Vector2(gridCells(55) + gridCells(x), gridCells(0)), resource: resources.images["metrobilboard"], isSolid: true, frameSize: new Vector2(56, 56), offsetY: -40, preventDraw: x != 0 });
      metrobilboard.textContent = [
        {
          string: [`An ad for NightCityAutomaton Corp... That's where robots get made.`],
        } as Scenario,
      ];
      this.addChild(metrobilboard);
    }
    

    for (let y = 0; y < 8; y++) { 
      const slopeUp0 = new Slope({ position: new Vector2(gridCells(6), gridCells(6) + gridCells(y)), showSprite: this.showDebugSprites, slopeType: UP, slopeDirection: LEFT, startScale: new Vector2(0.74, 0.74), endScale: new Vector2(1, 1) });
      this.addChild(slopeUp0);

      const slopeUp = new Slope({ position: new Vector2(gridCells(22), gridCells(6) + gridCells(y)), showSprite: this.showDebugSprites, slopeType: UP, slopeDirection: RIGHT, startScale: new Vector2(0.74, 0.74), endScale: new Vector2(1, 1) });
      this.addChild(slopeUp);

      const slopeUp2 = new Slope({ position: new Vector2(gridCells(33), gridCells(6) + gridCells(y)), showSprite: this.showDebugSprites, slopeType: UP, slopeDirection: LEFT, startScale: new Vector2(0.74, 0.74), endScale: new Vector2(1, 1) });
      this.addChild(slopeUp2);

      const slopeUp3 = new Slope({ position: new Vector2(gridCells(48), gridCells(0) + gridCells(y)), showSprite: this.showDebugSprites, slopeType: UP, slopeDirection: LEFT, startScale: new Vector2(0.74, 0.74), endScale: new Vector2(1, 1) });
      this.addChild(slopeUp3);

      const slopeUp4 = new Slope({ position: new Vector2(gridCells(75), gridCells(1) + gridCells(y)), showSprite: this.showDebugSprites, slopeType: UP, slopeDirection: RIGHT, startScale: new Vector2(0.74, 0.74), endScale: new Vector2(1, 1) });
      this.addChild(slopeUp4);

      const slopeUp5 = new Slope({ position: new Vector2(gridCells(150), gridCells(1) + gridCells(y)), showSprite: this.showDebugSprites, slopeType: UP, slopeDirection: LEFT, startScale: new Vector2(0.74, 0.74), endScale: new Vector2(1, 1) });
      this.addChild(slopeUp5);

      const slopeDown = new Slope({ position: new Vector2(gridCells(3), gridCells(6) + gridCells(y)), showSprite: this.showDebugSprites, slopeType: DOWN, slopeDirection: RIGHT, endScale: new Vector2(0.74, 0.74) });
      this.addChild(slopeDown); 

      const slopeDown2 = new Slope({ position: new Vector2(gridCells(30), gridCells(6) + gridCells(y)), showSprite: this.showDebugSprites, slopeType: DOWN, slopeDirection: RIGHT, startScale: new Vector2(1, 1), endScale: new Vector2(0.74, 0.74) });
      this.addChild(slopeDown2);

      const slopeDown3 = new Slope({ position: new Vector2(gridCells(25), gridCells(6) + gridCells(y)), showSprite: this.showDebugSprites, slopeType: DOWN, slopeDirection: LEFT, startScale: new Vector2(1, 1), endScale: new Vector2(0.74, 0.74) });
      this.addChild(slopeDown3);

      const slopeDown4 = new Slope({ position: new Vector2(gridCells(44), gridCells(0) + gridCells(y)), showSprite: this.showDebugSprites, slopeType: DOWN, slopeDirection: RIGHT, endScale: new Vector2(0.74, 0.74) });
      this.addChild(slopeDown4);

      const slopeDown5 = new Slope({ position: new Vector2(gridCells(79), gridCells(0) + gridCells(y)), showSprite: this.showDebugSprites, slopeType: DOWN, slopeDirection: LEFT, endScale: new Vector2(0.74, 0.74) });
      this.addChild(slopeDown5);

      const slopeDown6 = new Slope({ position: new Vector2(gridCells(146), gridCells(0) + gridCells(y)), showSprite: this.showDebugSprites, slopeType: DOWN, slopeDirection: RIGHT, endScale: new Vector2(0.74, 0.74) });
      this.addChild(slopeDown6); 
    } 

    const concretestair = new Sprite({
      position: new Vector2(gridCells(3), gridCells(6)),
      resource: resources.images["concretestair"],
      isSolid: false,
      frameSize: new Vector2(70, 92),
      scale: new Vector2(1, 0.8),
      offsetY: -10,
      drawLayer: FLOOR
    }); 
    this.addChild(concretestair);
    const concretestair2 = new Sprite({
      position: new Vector2(gridCells(22), gridCells(6)),
      resource: resources.images["concretestair"],
      isSolid: false,
      drawLayer: FLOOR,
      frameSize: new Vector2(70, 92),
      scale: new Vector2(1, 0.8),
      offsetY: -10,
      flipX: true,
      offsetX: -5
    });
    this.addChild(concretestair2);
    const concretestair3 = new Sprite({
      position: new Vector2(gridCells(30), gridCells(6)),
      resource: resources.images["concretestair"],
      isSolid: false,
      drawLayer: FLOOR,
      frameSize: new Vector2(70, 92),
      scale: new Vector2(1, 0.8),
      offsetY: -10,
    });
    this.addChild(concretestair3);
    const concretestair4 = new Sprite({
      position: new Vector2(gridCells(44), gridCells(0)),
      resource: resources.images["concretestair"],
      isSolid: false,
      drawLayer: FLOOR,
      frameSize: new Vector2(70, 92),
      scale: new Vector2(1, 1),
      offsetY: -10,
    });
    this.addChild(concretestair4);
    for (let y = 0; y < 2; y++) {
      const concretestair5 = new Sprite({
        position: new Vector2(gridCells(75), gridCells(y*4)),
        resource: resources.images["concretestair"],
        isSolid: false,
        drawLayer: FLOOR,
        frameSize: new Vector2(70, 92),
        scale: new Vector2(1, 1), 
        flipX: true,
        offsetY: -12,
      });
      this.addChild(concretestair5);
    }
    const concretestair6 = new Sprite({
      position: new Vector2(gridCells(146), gridCells(0)),
      resource: resources.images["concretestair"],
      isSolid: false,
      drawLayer: FLOOR,
      frameSize: new Vector2(70, 92),
      scale: new Vector2(1, 1),
      offsetY: -10,
    });
    this.addChild(concretestair6);

    //long hallway
    for (let x = 0; x < 67; x++) {
      for (let y = 0; y < 8; y++) {
        if (x > 10 && y > 4) continue;
        const metroFloor = new Sprite({
          objectId: 0, resource: resources.images["metrotile"], position: new Vector2(gridCells(79) + gridCells(x), gridCells(0) + gridCells(y)),
          drawLayer: BASE, frameSize: new Vector2(16, 16) 
        });
        this.addChild(metroFloor); 
      }
    }
    for (let x = 0; x < 10; x++) {
      if (x == 0 || x == 9) {
        const metalRailSide = new Sprite({ position: new Vector2(gridCells(80)  + gridCells(x), gridCells(7)), resource: resources.images["metalrailside"], isSolid: true, frameSize: new Vector2(16, 32), flipX: x === 9, offsetY: -16 });
        this.addChild(metalRailSide);
      } else {
        const metalRail = new Sprite({ position: new Vector2(gridCells(80) + gridCells(x), gridCells(7)), resource: resources.images["metalrail"], isSolid: true, frameSize: new Vector2(16, 32), offsetY: -16 });
        this.addChild(metalRail);
      }
    }
    for (let railNo = 0; railNo < 7; railNo++) {
      for (let x = 0; x < 8; x++) {
        if (x == 0 || x == 7) {
          const metalRailSide = new Sprite({ position: new Vector2(gridCells(90) + gridCells(8 * railNo) + gridCells(x), gridCells(4)), resource: resources.images["metalrailside"], isSolid: true, frameSize: new Vector2(16, 32), flipX: x === 7, offsetY: -16 });
          this.addChild(metalRailSide);
        } else {
          const metalRail = new Sprite({ position: new Vector2(gridCells(90) + gridCells(8 * railNo) + gridCells(x), gridCells(4)), resource: resources.images["metalrail"], isSolid: true, frameSize: new Vector2(16, 32), offsetY: -16 });
          this.addChild(metalRail);
        }
      }
    } 
    for (let y = 0; y < 5; y++) {
      const metalRailSide0 = new Sprite({ position: new Vector2(gridCells(90), gridCells(3) + gridCells(y)), resource: resources.images["metalrailside"], isSolid: y != 0, frameSize: new Vector2(5, 16), });
      this.addChild(metalRailSide0);
    }
    for (let x = 0; x < 66; x++) {
      if (x % 10 == 0) { 
        const metalsewergrillside = new Sprite({ objectId: 0, resource: resources.images["metalsewergrillside"], position: new Vector2(gridCells(80) + gridCells(x), gridCells(0)), frameSize: new Vector2(16, 8), drawLayer: "FLOOR" });
        this.addChild(metalsewergrillside);
      } else {
        const metalsewergrill = new Sprite({ objectId: 0, resource: resources.images["metalsewergrill"], position: new Vector2(gridCells(80) + gridCells(x), gridCells(0)), drawLayer: "FLOOR", frameSize: new Vector2(16, 8) });
        this.addChild(metalsewergrill);
      }
    }
    //long hallway second floor
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 16; y++) {
        const metroFloor = new Sprite({
          objectId: 0, resource: resources.images["metrotile"], position: new Vector2(gridCells(150) + gridCells(x), gridCells(1) + gridCells(y / 2)),
          drawLayer: BASE, frameSize: new Vector2(16, 16), scale: new Vector2(0.9, 0.9)
        });
        this.addChild(metroFloor);

        const metroFloor2 = new Sprite({
          objectId: 0, resource: resources.images["metrotile"], position: new Vector2(gridCells(150) + 10 + gridCells(x), gridCells(1) + gridCells(y / 2)),
          drawLayer: BASE, frameSize: new Vector2(16, 16), scale: new Vector2(0.9, 0.9)
        });
        this.addChild(metroFloor2);
      }
    }
    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 8; y++) {
        const metroFloor = new Sprite({
          objectId: 0, resource: resources.images["metrotile"], position: new Vector2(gridCells(160) + gridCells(x), gridCells(5) + gridCells(y / 2)),
          drawLayer: BASE, frameSize: new Vector2(16, 16), scale: new Vector2(0.9, 0.9)
        });
        this.addChild(metroFloor);

        const metroFloor2 = new Sprite({
          objectId: 0, resource: resources.images["metrotile"], position: new Vector2(gridCells(160) + 10 + gridCells(x), gridCells(5) + gridCells(y / 2)),
          drawLayer: BASE, frameSize: new Vector2(16, 16), scale: new Vector2(0.9, 0.9)
        });
        this.addChild(metroFloor2);
      }
    }
    for (let x = 0; x < 10; x++) {
      const slopeUp0 = new Slope({
        position: new Vector2(gridCells(150) + gridCells(x), gridCells(4)),
        showSprite: this.showDebugSprites,
        slopeType: UP,
        slopeDirection: DOWN,
        slopeStepHeight: new Vector2(0.05, 0.05),
        startScale: new Vector2(0.74, 0.74),
        endScale: new Vector2(0.79, 0.79)
      });
      this.addChild(slopeUp0);
      const slopeUp1 = new Slope({
        position: new Vector2(gridCells(150) + gridCells(x), gridCells(5)),
        showSprite: this.showDebugSprites,
        slopeType: UP,
        slopeDirection: DOWN,
        slopeStepHeight: new Vector2(0.05, 0.05),
        startScale: new Vector2(0.79, 0.79),
        endScale: new Vector2(0.84, 0.84)
      });
      this.addChild(slopeUp1); 
      const slopeUp2 = new Slope({
        position: new Vector2(gridCells(150) + gridCells(x), gridCells(6)),
        showSprite: this.showDebugSprites,
        slopeType: UP,
        slopeDirection: DOWN,
        slopeStepHeight: new Vector2(0.05, 0.05),
        startScale: new Vector2(0.84, 0.84),
        endScale: new Vector2(0.89, 0.89)
      });
      this.addChild(slopeUp2);
      const slopeUp3 = new Slope({
        position: new Vector2(gridCells(150) + gridCells(x), gridCells(7)),
        showSprite: this.showDebugSprites,
        slopeType: UP,
        slopeDirection: DOWN,
        slopeStepHeight: new Vector2(0.05, 0.05),
        startScale: new Vector2(0.89, 0.89),
        endScale: new Vector2(0.94, 0.94)
      });
      this.addChild(slopeUp3); 
      const slopeUp4 = new Slope({
        position: new Vector2(gridCells(150) + gridCells(x), gridCells(8)),
        showSprite: this.showDebugSprites,
        slopeType: UP,
        slopeDirection: DOWN,
        slopeStepHeight: new Vector2(0.06, 0.06),
        startScale: new Vector2(0.94, 0.94),
        endScale: new Vector2(1, 1)
      });
      this.addChild(slopeUp4); 
    }
    for (let y = 1; y < 5; y++) {
      const slopeDown0 = new Slope({
        position: new Vector2(gridCells(160), gridCells(4) + gridCells(y)),
        showSprite: this.showDebugSprites,
        slopeType: DOWN,
        slopeDirection: LEFT,
        slopeStepHeight: new Vector2(0.05, 0.05),
        startScale: new Vector2(1, 1),
        endScale: new Vector2(0.95, 0.95)
      });
      this.addChild(slopeDown0);
    }


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
