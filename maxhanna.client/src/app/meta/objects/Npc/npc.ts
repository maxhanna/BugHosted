import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { resources } from "../../helpers/resources";
import { storyFlags, Scenario } from "../../helpers/story-flags";
import { events } from "../../helpers/events";
import { gridCells } from "../../helpers/grid-cells";
import { Animations } from "../../helpers/animations";
import { FrameIndexPattern } from "../../helpers/frame-index-pattern";
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP, PICK_UP_DOWN } from "../Hero/hero-animations";

export class Npc extends GameObject {
  textContent?: Scenario[];
  textPortraitFrame?: number;
  constructor(x: number, y: number, textConfig?: { content?: Scenario[], portraitFrame?: number }, type = "referee") {
    super({ position: new Vector2(x, y) });
    this.isSolid = true;
    this.textContent = textConfig?.content;
    this.textPortraitFrame = textConfig?.portraitFrame;

    const shadow = new Sprite(
      0, resources.images["shadow"], new Vector2(-8, -19), 1, 0, new Vector2(32, 32), 0, 0, undefined
    );
    this.addChild(shadow);

    const animations = type == "referee" ? new Animations(
      {
        walkDown: new FrameIndexPattern(WALK_DOWN),
        walkUp: new FrameIndexPattern(WALK_UP),
        walkLeft: new FrameIndexPattern(WALK_LEFT),
        walkRight: new FrameIndexPattern(WALK_RIGHT),
        standDown: new FrameIndexPattern(STAND_DOWN),
        standRight: new FrameIndexPattern(STAND_RIGHT),
        standLeft: new FrameIndexPattern(STAND_LEFT),
        standUp: new FrameIndexPattern(STAND_UP),
        pickupDown: new FrameIndexPattern(PICK_UP_DOWN),
      }) : undefined;
    const body = new Sprite(
      0, resources.images[type], new Vector2(-8, -20), 1, 1, new Vector2(32, 32), 2, 1, animations, type,
    );
    body.animations?.play("standDown");
    this.addChild(body);

  }
  getContent() {
    if (!this.textContent) {
      return;
    }
    //Maybe expand with story flag logic, etc.
    const match = storyFlags.getRelevantScenario(this.textContent);
    if (!match) {
      console.log("No matches found in this list!", this.textContent);
      return null;
    }

    console.log("Getting content " + match.string);
    return {
      portraitFrame: this.textPortraitFrame,
      string: match.string,
      addsFlag: match.addsFlag ?? null
    }
  }
}
