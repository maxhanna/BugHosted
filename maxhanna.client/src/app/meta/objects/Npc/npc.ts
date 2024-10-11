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
import { MetaBot } from "../../../../services/datacontracts/meta/meta-bot";

export class Npc extends GameObject { 
  metabots: MetaBot[];
  body: Sprite;
  type: string;
  partnerNpcs: Npc[];
  id: number;

  constructor(config: { id: number, position: Vector2, textConfig?: { content?: Scenario[], portraitFrame?: number }, type?: string}) {
    super({ position: config.position });
    this.type = config.type ?? "referee";
    this.id = config.id;
    this.isSolid = true;
    this.textContent = config.textConfig?.content;
    this.textPortraitFrame = config.textConfig?.portraitFrame;
    this.metabots = []; 
    const shadow = new Sprite(
      0,
      resources.images["shadow"],
      new Vector2(-8, -19),
      undefined,
      undefined,
      new Vector2(32, 32),
      undefined,
      undefined,
      undefined
    );
    this.partnerNpcs = [];
    this.addChild(shadow);

    const animations = new Animations(
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
      });
    this.body = new Sprite(
      0,
      resources.images[this.type],
      new Vector2(-8, -20),
      undefined,
      undefined,
      new Vector2(32, 32),
      4,
      5,
      animations,
      this.type,
    );
    this.body.animations?.play("standDown");
    this.addChild(this.body);

  } 
}
