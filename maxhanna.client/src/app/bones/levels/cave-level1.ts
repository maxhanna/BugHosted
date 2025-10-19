import { Vector2 } from "../../../services/datacontracts/bones/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Scenario, TALKED_TO_A, TALKED_TO_B } from "../helpers/story-flags";
import { Exit } from "../objects/Environment/Exit/exit";
import { Level } from "../objects/Level/level"; 
import { Watch } from "../objects/InventoryItem/Watch/watch"; 
import { Sprite } from "../objects/sprite";
import { Npc } from "../objects/Npc/npc";
import { HeroRoomLevel } from "./hero-room";

export class CaveLevel1 extends Level { 
  override defaultHeroPosition = new Vector2(gridCells(1), gridCells(1));
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined }) {
    super();
    this.name = "CaveLevel1";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    } 
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }

    this.background = new Sprite(
      {
        resource: resources.images["cave"], 
        frameSize: new Vector2(320, 220)
      }
    );

    const ground = new Sprite({
      resource: resources.images["caveGround"],  
      frameSize: new Vector2(320, 220)
    }
    ); 
    this.addChild(ground);

    const exit = new Exit({ position: new Vector2(gridCells(2), gridCells(4)) });
    this.addChild(exit);

    const watch = new Watch({ id: 0, position: new Vector2(gridCells(5), gridCells(2)) });
    this.addChild(watch);

    const npc1 = new Npc(
      {
        id: -512,
        position: new Vector2(gridCells(5), gridCells(5)),
        textConfig: {
          content: [
            {
              string: ["I just can't stand that guy."],
              requires: [TALKED_TO_B],
              bypass: [TALKED_TO_A],
              addsFlag: TALKED_TO_A,
            } as Scenario,
            {
              string: ["He is the worst."],
              requires: [TALKED_TO_A],
            } as Scenario,
            {
              string: ["Grumble grumble, another day at work!"],
            } as Scenario
          ],
          portraitFrame: 1
        },
        type: "knight"
    });
    this.addChild(npc1);

    const npc2 = new Npc({
      id: -652,
      position: new Vector2(gridCells(8), gridCells(5)),
      textConfig: {
        content: [
          {
            string: ["YOU ALREADY TALKED TO ME B!"],
            requires: [TALKED_TO_B],
          } as Scenario,
          {
            string: ["Ello mate B!"],
            requires: [],
            bypass: [],
            addsFlag: TALKED_TO_B
          } as Scenario
        ],
        portraitFrame: 0
      },
      type: "knight"
    });
    this.addChild(npc2);
     
  }

  override ready() {
    events.on("CHARACTER_EXITS", this, () => { 
      events.emit("CHANGE_LEVEL", new HeroRoomLevel({
        heroPosition: new Vector2(gridCells(18), gridCells(2)), 
      }));
    })
  }
}
