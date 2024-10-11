import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Exit } from "../objects/Exit/exit";
import { Level } from "../objects/Level/level";
import { Watch } from "../objects/Watch/watch";
import { Sprite } from "../objects/sprite"; 
import { CaveLevel1 } from "./cave-level1";
import { HeroHomeLevel } from "./hero-home";
import { GOT_WATCH, START_FIGHT, Scenario, TALKED_TO_MOM, TALKED_TO_MOM_ABOUT_DAD, TALKED_TO_MOM_ABOUT_WATCH } from "../helpers/story-flags";
import { Npc } from "../objects/Npc/npc";
import { Animations } from "../helpers/animations";
import { STAND_DOWN } from "../objects/Hero/hero-animations";
import { FrameIndexPattern } from "../helpers/frame-index-pattern";
import { MetaBot, SPEED_TYPE } from "../../../services/datacontracts/meta/meta-bot";
import { Chicken } from "../objects/Chicken/chicken";
import { House } from "../objects/House/house";
import { Deer } from "../objects/Deer/deer";
import { Water } from "../objects/Water/water";
 

export class BrushLevel1 extends Level { 
  override defaultHeroPosition = new Vector2(gridCells(18), gridCells(2));
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined } = {}) {
    super();
    this.name = "BrushLevel1";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    } 
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }

  
    const whiteBg = new Sprite(
      0, resources.images["white"], new Vector2(0, 0), new Vector2(1000, 1000), 1, new Vector2(2, 2)
    );
    whiteBg.drawLayer = "FLOOR";
    this.addChild(whiteBg);

       
     

    const house = new House( gridCells(8), gridCells(12) ); 
    this.addChild(house);

    const sign = new Sprite(
      0, resources.images["sign"], new Vector2(gridCells(5), gridCells(14)), undefined, 1, new Vector2(16, 16)
    );
    sign.isSolid = true; 
    sign.textContent = [
      {
        string: [`Your House.`],
      } as Scenario,
    ];
    this.addChild(sign); 

    const rivalHouse = new House(gridCells(8), gridCells(3));
    this.addChild(rivalHouse); 

    const rivalSign = new Sprite(
      0, resources.images["sign"], new Vector2(gridCells(5), gridCells(8)), undefined, 1, new Vector2(16, 16)
    );
    rivalSign.isSolid = true;
    rivalSign.textContent = [
      {
        string: [`Rivals' House.`],
      } as Scenario,
    ];
    this.addChild(rivalSign);


    for (let x = 0; x < 3; x++) {
      const water = new Water(gridCells(2 * x) + gridCells(25), gridCells(7));
      water.drawLayer = "FLOOR";
      this.addChild(water);
    }
    for (let x = 0; x < 3; x++) {
      const water = new Water(gridCells(2 * x) + gridCells(25), gridCells(9));
      water.drawLayer = "FLOOR";
      this.addChild(water);
    }
    for (let x = 0; x < 3; x++) {
      const water = new Water(gridCells(2 * x) + gridCells(25), gridCells(11));
      water.drawLayer = "FLOOR";
      this.addChild(water);
    }


    for (let x = 0; x < 3; x++) {
      const brickRoad = new Sprite(
        0, resources.images["brickRoad"], new Vector2(gridCells(22) + gridCells(2*x), gridCells(12)), undefined, 1, new Vector2(32, 32)
      );
      brickRoad.drawLayer = "FLOOR";
      this.addChild(brickRoad);
    }

    const tree = new Sprite(
      0, resources.images["tree"], new Vector2(gridCells(28), gridCells(8)), undefined, 1, new Vector2(128, 128)
    );
    tree.isSolid = true;
    this.addChild(tree);

    const chicken = new Chicken(gridCells(7), gridCells(7));
    this.addChild(chicken);

    const deer = new Deer(gridCells(10), gridCells(8));
    this.addChild(deer);

    const referee = new Npc({
      id: -27, position: new Vector2(gridCells(5), gridCells(5)), textConfig: {
        content: [
          {
            string: ["You want a fight?!"],
            addsFlag: START_FIGHT,
          } as Scenario
        ],
        portraitFrame: 2,
      }, type: "referee"
    });
    const refereeMetabot = new MetaBot(-146, referee.id, SPEED_TYPE, "Wasp", false, new Vector2(0, 0));
    refereeMetabot.hp = 10;
    refereeMetabot.level = 5;
    referee.metabots.push(refereeMetabot);
    this.addChild(referee);


    const referee2 = new Npc({
      id: -124,
      position: new Vector2(gridCells(5), gridCells(10)),
      textConfig: {
        content: [
          {
            string: ["You want to fight both of us huh?!"],
            addsFlag: START_FIGHT,
          } as Scenario
        ],
        portraitFrame: 2,
      },
      type: "referee"
    });
    const refereeMetabot2 = new MetaBot(-145, referee2.id, SPEED_TYPE, "Zippy", false, new Vector2(0, 0));
    refereeMetabot2.level = 5;
    referee2.metabots.push(refereeMetabot2);
    referee2.partnerNpcs.push(referee);
    this.addChild(referee2);


    for (let x = 0; x < 43; x++) {
      const goldPath = new Sprite(
        0, resources.images["goldenPath"], new Vector2(x * 14, 0), new Vector2(1, 1), 1, new Vector2(14, 16)
      );
      goldPath.drawLayer = "FLOOR";
      this.addChild(goldPath);
    }


    for (let x = 0; x < 38; x++) {
      const fence = new Sprite(
        0, resources.images["fenceHorizontal"], new Vector2(x * gridCells(1), gridCells(1)), undefined, 1, new Vector2(16, 16)
      );
      fence.isSolid = true;
      this.addChild(fence);

      const fence2 = new Sprite(
        0, resources.images["fenceHorizontal"], new Vector2(x * gridCells(1), gridCells(18)), undefined, 1, new Vector2(16, 16)
      );
      fence2.isSolid = true;
      this.addChild(fence2);
    }

    for (let y = 0; y < 37; y++) {
      const fence = new Sprite(
        0, resources.images["fenceVertical"], new Vector2(gridCells(0), y * gridCells(1) / 2), undefined, 1, new Vector2(16, 16)
      );
      fence.isSolid = true;
      this.addChild(fence);

      const fence2 = new Sprite(
        0, resources.images["fenceVertical"], new Vector2(gridCells(37), y * gridCells(1) / 2), undefined, 1, new Vector2(16, 16)
      );
      fence2.isSolid = true;
      this.addChild(fence2);
    }

    for (let y = 0; y < 37; y++) {
      const bb = new Sprite(
        0, resources.images["biggerBush"], new Vector2(gridCells(-1), gridCells(y)/2), undefined, 1, new Vector2(15, 17)
      );
      bb.isSolid = true;
      this.addChild(bb);

      const bb2 = new Sprite(
        0, resources.images["biggerBush"], new Vector2(gridCells(38), gridCells(y)/2), undefined, 1, new Vector2(15, 17)
      );
      bb2.isSolid = true;
      this.addChild(bb2);
    }

    for (let x = 0; x < 10; x++) {
      const shrub = new Sprite(
        0, resources.images["shrub"], new Vector2(gridCells(3) + (x * 1.5) * gridCells(1), gridCells(5)), new Vector2(0.45, 0.45), 1, new Vector2(56, 56)
      );
      this.addChild(shrub);
    }

    const flowerBush = new Sprite(
      0, resources.images["flowerbush"], new Vector2(gridCells(2), gridCells(2)), undefined, 1, new Vector2(18, 64), 4, 1,
      new Animations({ standDown: new FrameIndexPattern(STAND_DOWN) })
    );
    this.addChild(flowerBush);


    const heroHomeExit = new Exit(gridCells(18), gridCells(2), true, (Math.PI * 3) / 2);
    heroHomeExit.targetMap = "HeroHome";
    this.addChild(heroHomeExit);
    //Walls: 
  }

  override ready() {
    events.on("HERO_EXITS", this, (targetMap: string) => {
      if (targetMap === "HeroHome") {
        events.emit("CHANGE_LEVEL", new HeroHomeLevel({
          heroPosition: new Vector2(gridCells(10), gridCells(11))
        })); 
      } 
    })

   }
}
