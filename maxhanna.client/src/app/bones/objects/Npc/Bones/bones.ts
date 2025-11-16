import { Vector2 } from "../../../../../services/datacontracts/bones/vector2"; 
import { Sprite } from "../../sprite"; 
import { DOWN, LEFT, RIGHT, UP } from "../../../helpers/grid-cells";
import { Animations } from "../../../helpers/animations";
import { resources } from "../../../helpers/resources";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { events } from "../../../helpers/events";
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP } from "./bones-animations";
import { Npc } from "../../Npc/npc"; 

export class Bones extends Npc {
  directionIndex = 0;
  // Per-level dialogue blurbs centralized here instead of scattered across level files
  private static DIALOGUES: Record<string, string[]> = {
    HeroRoom: [
      "Stay a while and listen!"
    ],
    FortPenumbra: [
      "Down here, even the light is tired."
    ],
    CitadelOfVesper: [
      "The Citadel of Vesper, this was a monastary once."
    ],
    GatesOfHell: [
      "This is where the world ends and another starts."
    ],
    RiftedBastion: [
      "Two sides of the same ruin - one frozen, one burning."
    ]
  };

  constructor(params: { position: Vector2, partners?: Npc[], moveUpDown?:number, moveLeftRight?: number, }) {
    super({
      id: Math.floor(Math.random() * (-9999 + 1000)) - 1000,
      position: params.position,
      type: "bones",
      name: "Bones",
      partners: params.partners ? params.partners : [],
      moveUpDown: params.moveUpDown,
      moveLeftRight: params.moveLeftRight,
      body: new Sprite({
        objectId: Math.floor(Math.random() * (-9999 + 1000)) - 1000,
        resource: resources.images["bones"],
        position: new Vector2(0, 0),
        frameSize: new Vector2(40, 40),
        hFrames: 4,
        vFrames: 5,
        offsetY: -10,
        offsetX: -8,
        name: "Bones",
        animations: new Animations(
          {
            walkDown: new FrameIndexPattern(WALK_DOWN),
            walkUp: new FrameIndexPattern(WALK_UP),
            walkLeft: new FrameIndexPattern(WALK_LEFT),
            walkRight: new FrameIndexPattern(WALK_RIGHT),
            standDown: new FrameIndexPattern(STAND_DOWN),
            standRight: new FrameIndexPattern(STAND_RIGHT),
            standLeft: new FrameIndexPattern(STAND_LEFT),
            standUp: new FrameIndexPattern(STAND_UP),
          })
      })
    }) 
    this.type = "bones"; 
    this.textPortraitFrame = 1;
    const shadow = new Sprite({
      resource: resources.images["shadow"],
      position: new Vector2(0, 0),
      offsetY: -6,
      offsetX: -18,
      scale: new Vector2(1.25, 1),
      frameSize: new Vector2(32, 32),
    });
    this.addChild(shadow);
    this.body?.animations?.play("standDown"); 
  }

  override ready() {
    events.on("HERO_REQUESTS_ACTION", this, (params: { hero: any, objectAtPosition: any }) => {
      if (params.objectAtPosition?.id !== this.id) return;

      // Face the player as before
      this.facePlayer(params);

      // Determine dialogue list from parent level name, with simple fallback
      const parentName = this.parent && (this.parent as any).name ? String((this.parent as any).name) : "";
      const list = Bones.DIALOGUES[parentName] || Bones.DIALOGUES[parentName.replace(/\s+/g, "")] || null;
      const blurb = list && list.length ? list[Math.floor(Math.random() * list.length)] : "Hello there.";

      // Show as a floating latestMessage (like Salesman) and clear after 5s
      (this as any).latestMessage = blurb;
      setTimeout(() => {
        if ((this as any).latestMessage === blurb) (this as any).latestMessage = null;
      }, 5000);
      resources.playSound('healing', { allowOverlap: true });
      // Preserve previous behavior: heal the local hero when they interact.
      if (params.hero.isUserControlled) {
        events.emit("HEAL_USER");
      }
    });
  }


  private facePlayer(params: { hero: any; objectAtPosition: any; }) {
    const oldKey = this.body?.animations?.activeKey;
    const oldFacingDirection = this.facingDirection;
    this.facingDirection = params.hero.facingDirection == DOWN ? UP : params.hero.facingDirection == LEFT ? RIGHT : params.hero.facingDirection == UP ? DOWN : LEFT;
    this.body?.animations?.play("stand" + this.facingDirection.charAt(0) + this.facingDirection.substring(1, this.facingDirection.length).toLowerCase());
    console.log("animation : " + this.body?.animations?.activeKey);
    setTimeout(() => {
      if (oldKey) {
        this.body?.animations?.play(oldKey);
      }
      this.facingDirection = oldFacingDirection;
    }, 20000);
  }
}
