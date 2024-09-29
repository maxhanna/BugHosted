import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { resources } from "../../helpers/resources";
import { storyFlags, Scenario } from "../../helpers/story-flags";
import { events } from "../../helpers/events";
import { gridCells } from "../../helpers/grid-cells";

export class Npc extends GameObject {
  textContent?: Scenario[];
  textPortraitFrame?: number;
  constructor(x: number, y: number, textConfig?: { content?: Scenario[], portraitFrame?: number }) {
    super({ position: new Vector2(x, y) });
    this.isSolid = true;
    this.textContent = textConfig?.content;
    this.textPortraitFrame = textConfig?.portraitFrame;

    const shadow = new Sprite(
      0, resources.images["shadow"], new Vector2(-8, -19), 1, 0, new Vector2(32, 32), 0, 0, undefined
    );
    this.addChild(shadow);

    const body = new Sprite(
      0, resources.images["knight"], new Vector2(-8, -20), 1, 1, new Vector2(32, 32), 2, 1, undefined, "Knight"
    );
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

    return {
      portraitFrame: this.textPortraitFrame,
      string: match.string,
      addsFlag: match.addsFlag ?? null
    }
  }
}
