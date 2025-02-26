import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { SkillType } from "../helpers/skill-types";
import { Exit } from "../objects/Environment/Exit/exit";
import { Level } from "../objects/Level/level";
import { Watch } from "../objects/InventoryItem/Watch/watch";
import { Sprite } from "../objects/sprite";
import { Salesman } from "../objects/Npc/Salesman/salesman";
import { BrushLevel1 } from "./brush-level1"; 
import { GOT_FIRST_METABOT, GOT_WATCH, Scenario, TALKED_TO_BRUSH_SHOP_OWNER0, TALKED_TO_BRUSH_SHOP_OWNER1, TALKED_TO_BRUSH_SHOP_OWNER2, TALKED_TO_MOM, TALKED_TO_MOM_ABOUT_DAD, TALKED_TO_MOM_ABOUT_WATCH, storyFlags } from "../helpers/story-flags";
import { Npc } from "../objects/Npc/npc";
import { Mom } from "../objects/Npc/Mom/mom";
import { Bot } from "../objects/Bot/bot"; 
import { InventoryItem } from "../objects/InventoryItem/inventory-item"; 
import { Tv } from "../objects/Environment/Tv/tv";
import { BASE, FLOOR, HUD } from "../objects/game-object";


export class BrushShop1 extends Level { 
  override defaultHeroPosition = new Vector2(gridCells(3), gridCells(8));
  showDebugSprites = false;

  firstBotSelection = storyFlags.contains(GOT_FIRST_METABOT) ? [] : [
    new InventoryItem({ id: 0, name: "Jaguar", image: "botFrame", category: "botFrame", stats: { hp: 100, type: SkillType.STRENGTH } }),
    new InventoryItem({ id: 1, name: "Ram", image: "botFrame5", category: "botFrame", stats: { hp: 100, type: SkillType.ARMOR } }),
    new InventoryItem({ id: 1, name: "Bee", image: "botFrame7", category: "botFrame", stats: { hp: 100, type: SkillType.SPEED } }),
  ];
  salesman = new Salesman({
    position: new Vector2(gridCells(5), gridCells(5)),
    heroPosition: new Vector2(gridCells(3), gridCells(5)),
    entranceLevel: this,
    items: storyFlags.contains(GOT_FIRST_METABOT) ? [] : this.firstBotSelection,
  }); 
  invisibleSalesman = new Salesman({
    position: new Vector2(gridCells(6), gridCells(5)),
    heroPosition: new Vector2(gridCells(3), gridCells(5)),
    entranceLevel: this,
    items: storyFlags.contains(GOT_FIRST_METABOT) ? [] : this.firstBotSelection,
    preventDraw: true
  }); 

  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined } = {}) {
    super();
    this.name = "BrushShop1";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    }
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 10; y++) {
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

    for (let x = 0; x < gridCells(7); x += gridCells(2)) { // Increment by 25
      for (let y = 0; y < gridCells(7); y += gridCells(2)) { // Increment by 27
        const shopFloor = new Sprite(
          { resource: resources.images["shopFloor"], position: new Vector2(x, y), frameSize: new Vector2(32, 32) }
        );
        shopFloor.drawLayer = BASE;
        this.addChild(shopFloor);
      }
    }

    const cornercounter = new Sprite(
      { resource: resources.images["cornercounter"], position: new Vector2(gridCells(0), gridCells(-1)), frameSize: new Vector2(33, 49), isSolid: true }
    );
    this.addChild(cornercounter);


    const botCasing = new Sprite(
      { resource: resources.images["botcasing"], position: new Vector2(gridCells(2), gridCells(-1)), frameSize: new Vector2(35, 35) }
    );
    this.addChild(botCasing);


    const botFrame = new Bot(
      { position: new Vector2(gridCells(2), gridCells(1)), spriteName: "botFrame2", offsetX: 8, offsetY: -8, isEnemy: false, isDeployed: false }
    );
    botFrame.textContent = [
      {
        string: ["Ahh, This one looks so cool!"],
      } as Scenario,
    ];
    this.addChild(botFrame);


    const botCasing2 = new Sprite(
      { resource: resources.images["botcasing"], position: new Vector2(gridCells(4), gridCells(-1)), frameSize: new Vector2(35, 35) }
    );
    this.addChild(botCasing2);

    const botFrame2 = new Bot(
      { position: new Vector2(gridCells(4), gridCells(1)), spriteName: "botFrame5", offsetX: 8, offsetY: -8 }
    );
    botFrame2.textContent = [
      {
        string: ["OH, I saw this in a competition on TV once!"],
      } as Scenario,
    ];
    this.addChild(botFrame2);


    const cornercounter2 = new Sprite(
      { resource: resources.images["cornercounter"], position: new Vector2(gridCells(6), gridCells(-1)), frameSize: new Vector2(33, 49), flipX: true, isSolid: true }
    );
    this.addChild(cornercounter2);


    for (let x = 0; x < 3; x++) {

      const counterNoLedge = new Sprite(
        { resource: resources.images["counterNoLedge"], position: new Vector2(gridCells(5), gridCells(2) + gridCells(x)), frameSize: new Vector2(16, 32), isSolid: true }
      );
      this.addChild(counterNoLedge);
    }
    for (let x = 0; x < 3; x++) {
      const counterNoLedgeTV = new Sprite(
        { resource: resources.images["counterNoLedge"], position: new Vector2(gridCells(5) + gridCells(x), gridCells(2)), frameSize: new Vector2(16, 32), isSolid: true }
      );
      this.addChild(counterNoLedgeTV);
    }

    const tv = new Tv({ position: new Vector2(gridCells(5), gridCells(2)), spritePosition: new Vector2(gridCells(1), gridCells(-1)) });
    tv.textContent = [
      {
        string: ["Wow, two Meta-Bots are battling on TV!"],
      } as Scenario
    ];
    this.addChild(tv);

    const carpet1 = new Sprite(
      {
        resource: resources.images["carpet"],
        position: new Vector2(gridCells(2), gridCells(6)),
        frameSize: new Vector2(32, 32)
      }
    );
    carpet1.drawLayer = FLOOR;
    this.addChild(carpet1);
    const carpet2 = new Sprite(
      {
        resource: resources.images["carpet"],
        position: new Vector2(gridCells(3), gridCells(6)),
        frameSize: new Vector2(32, 32)
      }
    );
    carpet2.drawLayer = FLOOR;
    this.addChild(carpet2);


    const exitOutside = new Exit({
      position: new Vector2(gridCells(3), gridCells(8)), showSprite: false, targetMap: "BrushLevel1"
    });
    this.addChild(exitOutside);

    //walls:
    for (let y = -16; y <= 224; y += 16) {
      for (let x = -16; x <= 320; x += 16) {
        // Add walls only for the perimeter: top row, bottom row, left column, and right column
        if (y === -16 || y === 224 || x === -16 || x === 320) {
          this.walls.add(`${x},${y}`);
        }
      }
    }

    if (this.salesman.body) {
      this.salesman.body.position.x += 16;
    }
    if (!storyFlags.contains(GOT_WATCH)) {
      this.salesman.textContent = [
        {
          string: ["Top of the morning to you! Did you get a Meta-Bot yet?"],
          addsFlag: TALKED_TO_BRUSH_SHOP_OWNER0,
          bypass: [TALKED_TO_BRUSH_SHOP_OWNER0]
        } as Scenario,
        {
          string: ["Ah, I see. Soon, then, I know it!"],
          requires: [TALKED_TO_BRUSH_SHOP_OWNER0],
        } as Scenario,
      ];
      this.invisibleSalesman.textContent = [
        {
          string: ["Top of the morning to you! Did you get a Meta-Bot yet?"],
          addsFlag: TALKED_TO_BRUSH_SHOP_OWNER0,
          bypass: [TALKED_TO_BRUSH_SHOP_OWNER0]
        } as Scenario,
        {
          string: ["Ah, I see. Soon, then, I know it!"],
          requires: [TALKED_TO_BRUSH_SHOP_OWNER0],
        } as Scenario,
      ];
    } else {
      this.salesman.textContent = [
        {
          string: ["Ahh, what a beautiful morning! Hey kid, are you here to repair your dads meta-bots?"],
          addsFlag: TALKED_TO_BRUSH_SHOP_OWNER1,
          bypass: [TALKED_TO_BRUSH_SHOP_OWNER2, TALKED_TO_BRUSH_SHOP_OWNER1, GOT_FIRST_METABOT],
          requires: [GOT_WATCH]
        } as Scenario,
        {
          string: ["Oh? Youre here to buy your FIRST Meta-Bot?!!"],
          addsFlag: TALKED_TO_BRUSH_SHOP_OWNER2,
          requires: [TALKED_TO_BRUSH_SHOP_OWNER1],
          bypass: [TALKED_TO_BRUSH_SHOP_OWNER2, GOT_FIRST_METABOT]
        } as Scenario,
      ];
      this.invisibleSalesman.textContent = [
        {
          string: ["Ahh, what a beautiful morning! Hey kid, are you here to repair your dads meta-bots?"],
          addsFlag: TALKED_TO_BRUSH_SHOP_OWNER1,
          bypass: [TALKED_TO_BRUSH_SHOP_OWNER2, TALKED_TO_BRUSH_SHOP_OWNER1, GOT_FIRST_METABOT],
          requires: [GOT_WATCH]
        } as Scenario,
        {
          string: ["Oh? Youre here to buy your FIRST Meta-Bot?!!"],
          addsFlag: TALKED_TO_BRUSH_SHOP_OWNER2,
          requires: [TALKED_TO_BRUSH_SHOP_OWNER1],
          bypass: [TALKED_TO_BRUSH_SHOP_OWNER2, GOT_FIRST_METABOT]
        } as Scenario,
      ];
    }  
  

    this.salesman.facingDirection = "LEFT";
    this.salesman.body?.animations?.play("standLeft");
    this.addChild(this.salesman);

    this.invisibleSalesman.facingDirection = "LEFT";
    this.invisibleSalesman.body?.animations?.play("standLeft");
    this.addChild(this.invisibleSalesman);

  }

  override ready() {
    events.on("CHARACTER_EXITS", this, (targetMap: string) => {
      if (targetMap === "BrushLevel1") {
        events.emit("CHANGE_LEVEL", new BrushLevel1({ heroPosition: new Vector2(gridCells(30), gridCells(18)), itemsFound: this.itemsFound }));
      }
    });
    events.on("CHARACTER_PICKS_UP_ITEM", this, (level: any) => { 
      if (storyFlags.contains(GOT_FIRST_METABOT)) {
        console.log("fixing items");
        this.firstBotSelection = [];
        this.salesman.items = this.firstBotSelection;
        this.invisibleSalesman.items = this.firstBotSelection;
      }
    });
  }
}
