import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { DOWN, UP, gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Exit } from "../objects/Environment/Exit/exit";
import { Slope } from "../objects/Environment/Slope/slope";
import { StoneCircle } from "../objects/Environment/StoneCircle/stone-circle";
import { Fountain } from "../objects/Environment/Fountain/fountain";
import { Level } from "../objects/Level/level";
import { Sprite } from "../objects/sprite"; 
import { Museum } from "../objects/Environment/Museum/museum";
import { Stand } from "../objects/Environment/Stand/stand";
import { ColorSwap } from "../../../services/datacontracts/meta/color-swap";
import { BrushRoad2 } from "./brush-road2";
import { Bugcatcher } from "../objects/Npc/Bugcatcher/bugcatcher";
import { HouseSide } from "../objects/Environment/House/house-side";
import { Wardrobe } from "../objects/Environment/Wardrobe/wardrobe";
import { Salesman } from "../objects/Npc/Salesman/salesman";
import { InventoryItem } from "../objects/InventoryItem/inventory-item";
import { ANBU_MASK, BOT_MASK, BUNNYEARS_MASK, BUNNY_MASK, Mask, VISOR_MASK, getMaskNameById } from "../objects/Wardrobe/mask";
import { UndergroundLevel1 } from "./underground-level1";
import { BASE, FLOOR } from "../objects/game-object";
import { Sign } from "../objects/Environment/Sign/sign";
import { Bot } from "../objects/Bot/bot";
import { StoneRoad } from "../objects/Environment/StoneRoad/stone-road";
 

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

    for (let x = -4; x < 40; x++) {
      for (let y = -10; y < 26; y++) {
        const grass = new Sprite({ objectId: 0, resource: resources.images["shortgrass"], position: new Vector2(gridCells(2 * x), gridCells(2 * y)), frameSize: new Vector2(32, 32) });
        grass.drawLayer = BASE;
        this.addChild(grass);
      }
    }
    for (let y = -1; y < 10; y++) {
      const stoneRoad = new StoneRoad(gridCells(1), gridCells(4 * y)); 
      this.addChild(stoneRoad);
    }

    for (let x = 0; x < 2; x++) { //center road
      for (let y = -5; y < 13; y++) { 
        const stoneRoad = new StoneRoad(gridCells(21) + gridCells(4 * x), gridCells(4 * y)); 
        this.addChild(stoneRoad);
      }
    }
    for (let x = 0; x < 12; x++) { 
      const stoneRoad = new StoneRoad(gridCells(5) + gridCells(4 * x), gridCells(12));
      this.addChild(stoneRoad); 
    }
    for (let y = -1; y < 10; y++) {
      const stoneRoad = new StoneRoad(gridCells(52), gridCells(4 * y));
      this.addChild(stoneRoad); 
    }
    for (let x = 0; x < 14; x++) {
      const stoneRoad = new StoneRoad(gridCells(1) + gridCells(4 * x), gridCells(-4));
      this.addChild(stoneRoad);  
    }
    for (let x = 0; x < 14; x++) {
      const stoneRoad = new StoneRoad(gridCells(1) + gridCells(4 * x), gridCells(36));
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
      new InventoryItem({ id: 0, name: "VisorMask", image: VISOR_MASK.name, category: "mask" }),
    ];

    const tmpLvl = new Level();
    tmpLvl.name = "RainbowAlleys1";

    const salesMan = new Salesman(
      {
        position: new Vector2(gridCells(8), gridCells(8) - 0.005),
        heroPosition: new Vector2(gridCells(8), gridCells(12)),
        entranceLevel: tmpLvl,
        items: maskSelection
      });
    if (salesMan.body) {
      salesMan.body.offsetY += 26;
    }
    this.addChild(salesMan);
    for (let x = 0; x < 2; x++) {
      const invisibleSalesman = new Salesman({
        position: new Vector2(gridCells(8+x), gridCells(10) - 0.005),
        heroPosition: new Vector2(gridCells(8), gridCells(12)),
        entranceLevel: tmpLvl,
        items: maskSelection,
        preventDraw: !this.showDebugSprites
      });
      this.addChild(invisibleSalesman);

    }
 
    const stand = new Stand(gridCells(5), gridCells(8));
    this.addChild(stand);
    const standbg = new Sprite({
       position: new Vector2(gridCells(6), gridCells(7)), 
      resource: resources.images["bedroomFloor"], 
      frameSize: new Vector2(142, 32),
      offsetY: 34
     });
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
    const offsets = [
      { x: 0, y: -2, dir: "DOWN" },   // Top bot
      { x: -2, y: 0, dir: "RIGHT" },  // Left bot
      { x: 2, y: 0, dir: "LEFT" },    // Right bot
      { x: 0, y: 2, dir: "UP" },      // Bottom bot
    ];
    for (let x = 0; x < 3; x++) {
      const punchingBot = new Bot({
        position: new Vector2(gridCells(45) + gridCells(offsets[x].x), gridCells(30) + gridCells(offsets[x].y)),
        isDeployed: true, isEnemy: true, hp: 100,
        isInvulnerable: true, name: "Punching-Bot", forceDrawName: true,
        preventDrawName: false, isSolid: true, canAttack: false,
        facingDirection: offsets[x].dir as typeof DOWN,
      });
      this.addChild(punchingBot);
    } 

    const stand2 = new Stand(gridCells(5), gridCells(0));
    this.addChild(stand2);
    const standbg2 = new Sprite({
      position: new Vector2(gridCells(6), gridCells(-1)), 
      resource: resources.images["bedroomFloor"],
      frameSize: new Vector2(142, 32),
      offsetY: 34
    });
    this.addChild(standbg2);
    for (let x = 0 ; x < 4; x++) {
      const wardrobe2 = new Wardrobe({ position: new Vector2(gridCells(15 + x), gridCells(2) - 0.005), isVisible: x == 0 });
      if (wardrobe2.body) {
        wardrobe2.body.flipX = true;
        wardrobe2.body.offsetX = 5;
        wardrobe2.body.offsetY = 5; 
        wardrobe2.body.isSolid = true;
      }
      this.addChild(wardrobe2);
    }
   
    for (let x = 1; x < 5; x++) {
      const stoneRoad = new Sprite({ objectId: 0, resource: resources.images["stoneroad"], position: new Vector2(gridCells(1) + gridCells(4 * x), gridCells(4)), frameSize: new Vector2(64, 64) });
      stoneRoad.drawLayer = FLOOR;
      this.addChild(stoneRoad);
    }
    const stand3 = new Stand(gridCells(5), gridCells(20));
    this.addChild(stand3);
    const standbg3 = new Sprite({
      position: new Vector2(gridCells(6), gridCells(19)), 
      resource: resources.images["bedroomFloor"], 
      frameSize: new Vector2(142, 32),
      offsetY: 34 });
    this.addChild(standbg3); 
    for (let x = 1; x < 5; x++) {
      const stoneRoad = new Sprite({ objectId: 0, resource: resources.images["stoneroad"], position: new Vector2(gridCells(1) + gridCells(4 * x), gridCells(24)), frameSize: new Vector2(64, 64) });
      stoneRoad.drawLayer = FLOOR;
      this.addChild(stoneRoad);
    }


    const stand4 = new Stand(gridCells(5), gridCells(28));
    this.addChild(stand4);
    const standbg4 = new Sprite({
      position: new Vector2(gridCells(6), gridCells(27)), 
      resource: resources.images["bedroomFloor"], 
      frameSize: new Vector2(142, 32),
      offsetY: 34 });
    this.addChild(standbg4);
   
    for (let x = 1; x < 5; x++) {
      const stoneRoad = new Sprite({ objectId: 0, resource: resources.images["stoneroad"], position: new Vector2(gridCells(1) + gridCells(4 * x), gridCells(32)), frameSize: new Vector2(64, 64) });
      stoneRoad.drawLayer = FLOOR;
      this.addChild(stoneRoad);
    } 

    const stoneCircle = new StoneCircle(gridCells(25), gridCells(13));
    this.addChild(stoneCircle);

    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 2; y++) {
        const fountain = new Fountain({ position: new Vector2(gridCells(26 - x), gridCells(13 - y)), preventDraw: !(x == 3 && y == 0) });
        this.addChild(fountain);
      }
    }


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
     
    const sign1 = new Sign({ position: new Vector2(gridCells(21), gridCells(-5)), text: ["Underground", "Metro Station"] });
    const sign2 = new Sign({ position: new Vector2(gridCells(28), gridCells(-5)), text: ["Underground", "Metro Station"] });
    const sign3 = new Sign({ position: new Vector2(gridCells(21), gridCells(42)), text: ["Next: Brush Road2.", "Current: Rainbow Alleys." ]});
    const sign4 = new Sign({ position: new Vector2(gridCells(28), gridCells(42)), text: ["Next: Brush Road2.", "Current: Rainbow Alleys."], flipX: true });
    this.addChild(sign1);
    this.addChild(sign2);
    this.addChild(sign3);
    this.addChild(sign4); 


    //NPCs <<-- PLACED AT THE END BECAUSE FOR SOME REASON, IT DOESNT RENDER MY ACCOUNT (MAX) ON BOTTOM UNLESS ITS POSITIONED HERE LMAO 
    const bystander = new Bugcatcher({ position: new Vector2(gridCells(19), gridCells(8)), moveUpDown: 4, moveLeftRight: 4 });
    this.addChild(bystander); 

    //EXITS
    for (let x = 0; x < 8; x++) {
    
        const brushRoad2Exit = new Exit(
          { position: new Vector2(gridCells(21) + gridCells(x), gridCells(43)), showSprite: this.showDebugSprites, targetMap: "BrushRoad2", sprite: "white", colorSwap: new ColorSwap([255, 255, 255], [0, 0, 0]) }
        );
        this.addChild(brushRoad2Exit);
    
    }
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 2; y++) { 
      const underground1Exit = new Exit(
        { position: new Vector2(gridCells(21) + gridCells(x), gridCells(-14) + gridCells(y)), showSprite: this.showDebugSprites, targetMap: "UndergroundLevel1", sprite: "white", colorSwap: new ColorSwap([255, 255, 255], [0, 0, 0]) }
      );
      this.addChild(underground1Exit);
    }
    }

    for (let x = 0 ; x < 4; x++) {
      const metroDoor = new Sprite({
        position: new Vector2(gridCells(22 + (2 * x) + (x == 0 ? 0.5 : x == 1 ? 0.5 : x == 3 ? 0 : 0)), gridCells(-14)),
        resource: resources.images["metrodoor"],
        isSolid: false, 
        frameSize: new Vector2(26, 40),
        scale: new Vector2(0.85, 0.85), 
        offsetX: -16,
        flipX: x > 1,
      });
      this.addChild(metroDoor);
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
