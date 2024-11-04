import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Exit } from "../objects/Environment/Exit/exit";
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
 

export class RainbowAlleys1 extends Level { 
  override defaultHeroPosition = new Vector2(gridCells(36), gridCells(32));
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
    whiteBg.drawLayer = "FLOOR";
    this.addChild(whiteBg);

    for (let x = -4; x < 24; x++) {
      for (let y = -4; y < 22; y++) {
        const grass = new Sprite({ objectId: 0, resource: resources.images["shortgrass"], position: new Vector2(gridCells(2 * x), gridCells(2 * y)), frameSize: new Vector2(32, 32) });
        grass.drawLayer = "FLOOR";
        this.addChild(grass);
      }
    }

    for (let y = 0; y < 10; y++) {
      const grass = new Sprite({ objectId: 0, resource: resources.images["stoneroad"], position: new Vector2(gridCells(1), gridCells(4 * y)), frameSize: new Vector2(64, 64) });
      grass.drawLayer = "FLOOR";
      this.addChild(grass);
    }

    const stoneCircle = new StoneCircle(gridCells(25), gridCells(13));
    this.addChild(stoneCircle);

    const fountain = new Fountain(gridCells(25), gridCells(13));
    this.addChild(fountain);

    const museum = new Museum(gridCells(35), gridCells(10));
    this.addChild(museum);


    const bugCatcher = new Bugcatcher({ position: new Vector2(gridCells(8), gridCells(10)-0.005) });
    bugCatcher.body.offsetY += 10;
    this.addChild(bugCatcher);

    const stand = new Stand(gridCells(5), gridCells(10));
    this.addChild(stand);

    const standbg = new Sprite({ position: new Vector2(gridCells(6), gridCells(9)), resource: resources.images["bedroomFloor"], frameSize: new Vector2(142, 32) });
    this.addChild(standbg);
    //NPCs <<-- PLACED AT THE END BECAUSE FOR SOME REASON, IT DOESNT RENDER MY ACCOUNT (MAX) ON BOTTOM UNLESS ITS POSITIONED HERE LMAO

    const spiderBot = new Spiderbot({ position: new Vector2(gridCells(24), gridCells(20)), hp: 5, level: 5 });
    const armobot = new Armobot({ position: new Vector2(gridCells(28), gridCells(20)), hp: 5, level: 5 });

    const bystander = new Bugcatcher({ position: new Vector2(gridCells(19), gridCells(8)), moveUpDown: 4, moveLeftRight: 2 });
    this.addChild(bystander);

    for (let y = 0; y < 10; y++) { 
      const houseSide = new HouseSide({ position: new Vector2(gridCells(-10), gridCells(12) + gridCells(y * 6)) });
      this.addChild(houseSide);
    }

    //EXITS
    for (let x = 0; x < 4; x++) {
      const brushRoad2Exit = new Exit(
        { position: new Vector2(gridCells(-1), gridCells(x) + gridCells(3)), showSprite: true, targetMap: "BrushRoad2", sprite: "white", colorSwap: new ColorSwap([255, 255, 255], [0, 0, 0]) }
      );
      this.addChild(brushRoad2Exit);
    }

  }

  override ready() {
    events.on("HERO_EXITS", this, (targetMap: string) => { 
      if (targetMap === "BrushRoad2") {
        events.emit("CHANGE_LEVEL", new BrushRoad2({
          heroPosition: new Vector2(gridCells(9), gridCells(1)), itemsFound: this.itemsFound
        }));
      } 
    }); 
  } 
}
