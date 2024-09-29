import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Scenario, TALKED_TO_A, TALKED_TO_B } from "../helpers/story-flags";
import { Exit } from "../objects/Exit/exit";
import { Level } from "../objects/Level/level"; 
import { Watch } from "../objects/Watch/watch"; 
import { Sprite } from "../objects/sprite";
import { Npc } from "../objects/Npc/npc";
import { HeroRoomLevel } from "./hero-room";

export class CaveLevel1 extends Level {
  walls: Set<string>;
  override defaultHeroPosition = new Vector2(gridCells(1), gridCells(1));
  constructor(params: { heroPosition?: Vector2 } = {}) {
    super();
    this.name = "CaveLevel1";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    }
    this.background = new Sprite(
      0, resources.images["cave"],
      new Vector2(0, 0),
      1,
      1,
      new Vector2(320, 220)
    );

    const ground = new Sprite(
      0,
      resources.images["caveGround"],
      new Vector2(0, 0),
      1,
      1,
      new Vector2(320, 220)
    ); 
    this.addChild(ground);

    const exit = new Exit(gridCells(2), gridCells(4));
    this.addChild(exit);

    const watch = new Watch(gridCells(5), gridCells(2));
    this.addChild(watch);

    const npc1 = new Npc(gridCells(5), gridCells(5), {
      content: [
        {
          string: "I just can't stand that guy.",
          requires: [TALKED_TO_B],
          bypass: [TALKED_TO_A],
          addsFlag: TALKED_TO_A,
        },
        {
          string: "He is the worst.",
          requires: [TALKED_TO_A], 
        },
        {
          string: "Grumble grumble, another day at work!", 
        }
      ],
      portraitFrame: 1
    });
    this.addChild(npc1);

    const npc2 = new Npc(gridCells(8), gridCells(5), {
      content: [
        {
          string: "YOU ALREADY TALKED TO ME B!",
          requires: [TALKED_TO_B],
        } as Scenario,
        {
          string: "Ello mate B!",
          requires: [],
          bypass: [],
          addsFlag: TALKED_TO_B
        } as Scenario
      ],
      portraitFrame: 0
    });
    this.addChild(npc2);

    this.walls = new Set();
  }

  override ready() {
    events.on("HERO_EXITS", this, () => { 
      events.emit("CHANGE_LEVEL", new HeroRoomLevel({
        heroPosition: new Vector2(gridCells(8), gridCells(8))
      }));
    })
  }
}
