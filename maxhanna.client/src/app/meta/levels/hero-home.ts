import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Exit } from "../objects/Exit/exit";
import { Level } from "../objects/Level/level";
import { Watch } from "../objects/Watch/watch";
import { Sprite } from "../objects/sprite";
import { BrushLevel1 } from "./brush-level1";
import { HeroRoomLevel } from "./hero-room";
import { GOT_WATCH, Scenario, TALKED_TO_MOM, TALKED_TO_MOM_ABOUT_DAD, TALKED_TO_MOM_ABOUT_WATCH } from "../helpers/story-flags";
import { Npc } from "../objects/Npc/npc";


export class HeroHomeLevel extends Level { 
  override defaultHeroPosition = new Vector2(gridCells(18), gridCells(2));
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined } = {}) {
    super();
    this.name = "HeroHome";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    }
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }
    const room = new Sprite(
      0, resources.images["heroHome"], new Vector2(0, 0), undefined, undefined, new Vector2(320, 220)
    );
    this.addChild(room);

    const cornercounter = new Sprite(
      0, resources.images["cornercounter"], new Vector2(gridCells(0), gridCells(1)), undefined, undefined, new Vector2(33, 49)
    );
    cornercounter.isSolid = true;
    this.addChild(cornercounter);

    const stove = new Sprite(
      0, resources.images["stove"], new Vector2(gridCells(2), gridCells(1)), undefined, undefined, new Vector2(32, 34)
    );
    stove.isSolid = true;
    this.addChild(stove);

    const sink = new Sprite(
      0, resources.images["sink"],
      new Vector2(gridCells(4), gridCells(1)),
      undefined,
      undefined,
      new Vector2(65, 34)
    );
    sink.isSolid = true;
    this.addChild(sink);

    const fridge = new Sprite(
      0, resources.images["fridge"],
      new Vector2(gridCells(0), gridCells(3)),
      new Vector2(1.25, 1.25),
      undefined,
      new Vector2(22, 41)
    );
    fridge.isSolid = true;
    this.addChild(fridge);
     
    if (!this.itemsFound.includes("watch")) {
      const watch = new Watch({ id: 0, position: new Vector2(gridCells(3), gridCells(1)) });
      this.addChild(watch);
    } 

    const blinds = new Sprite(
      0, resources.images["blinds"],
      new Vector2(gridCells(5), 0.01),
      new Vector2(0.75, 0.75),
      undefined,
      new Vector2(30, 26)
    );
    this.addChild(blinds);

    const painting = new Sprite(
      0, resources.images["painting"],
      new Vector2(gridCells(9), 0.01),
      new Vector2(0.75, 0.75),
      undefined,
      new Vector2(30, 28)
    );
    painting.textContent = [
      {
        string: ["A picture of dads beautiful garden on display."],
      } as Scenario,
    ];
    this.addChild(painting);


    const blinds2 = new Sprite(
      0, resources.images["blinds"],
      new Vector2(gridCells(13), 0.01),
      new Vector2(0.75, 0.75),
      undefined,
      new Vector2(30, 26)
    );
    blinds2.textPortraitFrame = 0;
    blinds2.textContent = [
      {
        string: ["Ahh, what a beautiful morning!"], 
      } as Scenario,
    ];
    this.addChild(blinds2);

    const chair = new Sprite(
      0,
      resources.images["chair"],
      new Vector2(gridCells(5), gridCells(5)),
      undefined,
      undefined,
      new Vector2(32, 32)
    );
    chair.drawLayer = "FLOOR";
    this.addChild(chair);

    const chair2 = new Sprite(
      0, resources.images["chair"],
      new Vector2(gridCells(5), gridCells(8)),
      undefined,
      undefined,
      new Vector2(32, 32)
    );
    chair2.drawLayer = "FLOOR";
    this.addChild(chair2);
    const chair3 = new Sprite(
      0,
      resources.images["chair"],
      new Vector2(gridCells(13), gridCells(5)),
      undefined,
      undefined,
      new Vector2(32, 32)
    );
    chair3.drawLayer = "FLOOR";
    this.addChild(chair3);

    const chair4 = new Sprite(
      0, resources.images["chair"],
      new Vector2(gridCells(13), gridCells(8)),
      undefined,
      undefined,
      new Vector2(32, 32)
    );
    chair4.drawLayer = "FLOOR";
    this.addChild(chair4);


    const carpet1 = new Sprite(
      0,
      resources.images["carpet"],
      new Vector2(gridCells(10), gridCells(12)),
      undefined,
      undefined,
      new Vector2(32, 32)
    );
    carpet1.drawLayer = "FLOOR";
    this.addChild(carpet1);
    const carpet2 = new Sprite(
      0,
      resources.images["carpet"],
      new Vector2(gridCells(9), gridCells(12)),
      undefined,
      undefined,
      new Vector2(32, 32)
    );
    carpet2.drawLayer = "FLOOR";
    this.addChild(carpet2);


    const npc1 = new Npc({
      id: -1972,
      position: new Vector2(gridCells(13), gridCells(6)),
      textConfig: {
        content: [
          {
            string: ["Your father still uses that old tech, but as he always says its all in how you use it! He uses that watch to command our farm-bots."],
            requires: [GOT_WATCH],
            addsFlag: TALKED_TO_MOM_ABOUT_DAD,
          } as Scenario,
          {
            string: ["Go grab your fathers watch."],
            requires: [TALKED_TO_MOM_ABOUT_WATCH],
          } as Scenario,
          {
            string: ["We need you to run some errands... Can you grab your fathers watch thats on the counter my sweet little angel cakes?"],
            requires: [TALKED_TO_MOM],
            addsFlag: TALKED_TO_MOM_ABOUT_WATCH,
          } as Scenario,
          {
            string: [`Grumble grumble, another day at work on the farm!... Your dads bot short circuited while trying to water the plants this morning.`],
            addsFlag: TALKED_TO_MOM,
          } as Scenario
        ],
        portraitFrame: 2
      },
      type: "mom"
    });
    this.addChild(npc1);

    const exitBackToRoom = new Exit(gridCells(18), gridCells(2), true, (Math.PI * 3) / 2);
    exitBackToRoom.targetMap = "HeroRoom";
    this.addChild(exitBackToRoom);


    const exitOutside = new Exit(gridCells(10), gridCells(13), false, (Math.PI * 3) / 2);
    exitOutside.targetMap = "BrushLevel1";
    this.addChild(exitOutside);

    this.walls = new Set();
    //walls:
    for (let y = -16; y <= 224; y += 16) {
      for (let x = -16; x <= 320; x += 16) {
        // Add walls only for the perimeter: top row, bottom row, left column, and right column
        if (y === -16 || y === 224 || x === -16 || x === 320) {
          this.walls.add(`${x},${y}`);
        }
      }
    }
  }

  override ready() {
    events.on("HERO_EXITS", this, (targetMap: string) => {
      if (targetMap === "HeroRoom") {
        events.emit("CHANGE_LEVEL", new HeroRoomLevel({
          heroPosition: new Vector2(gridCells(18), gridCells(2))
        }));
      }
      else if (targetMap === "BrushLevel1") {
        events.emit("CHANGE_LEVEL", new BrushLevel1({
          heroPosition: new Vector2(gridCells(18), gridCells(2))
        }));
      }
    })
  }
}
