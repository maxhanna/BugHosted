import { ColorSwap } from "../../../services/datacontracts/meta/color-swap";
import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { events } from "../helpers/events";
import { resources } from "../helpers/resources";
import { Scenario, storyFlags } from "../helpers/story-flags";
import { Sprite } from "./sprite";

export const BASE = "BASE";
export const GROUND = "GROUND";
export const FLOOR = "FLOOR";
export const HUD = "HUD";

export class GameObject {
  parent?: any;
  children: any = [];
  position: Vector2; 
  hasReadyBeenCalled = false;
  isSolid = false;
  drawLayer?: typeof BASE | typeof GROUND | typeof FLOOR | typeof HUD;
  textContent?: Scenario[];
  textPortraitFrame?: number;
  colorSwap?: ColorSwap = undefined;
  preventDraw: boolean = false;
  preventDrawName: boolean = false;
  name?: string; 

  constructor(params: {
    position: Vector2,
    colorSwap?: ColorSwap,
    drawLayer?: typeof BASE | typeof GROUND | typeof FLOOR | typeof HUD,
    preventDraw?: boolean,
    preventDrawName?: boolean,
    isSolid?: boolean,
    textContent?: Scenario[],
    textPortraitFrame?: number,
    name?: string, 
  }) {
    this.position = params.position ?? new Vector2(0, 0);
    this.colorSwap = params.colorSwap;
    this.preventDraw = params.preventDraw ?? false;
    this.preventDrawName = params.preventDrawName ?? false;
    this.drawLayer = params.drawLayer;
    this.isSolid = params.isSolid ?? false;
    this.textContent = params.textContent;
    this.textPortraitFrame = params.textPortraitFrame;
    this.name = params.name; 
  }

  stepEntry(delta: number, root: any) {
    this.children.forEach((child: any) => child.stepEntry(delta, root));
    //Call ready on the first frame
    if (!this.hasReadyBeenCalled) {
      this.hasReadyBeenCalled = true;
      this.ready();
    }

    this.step(delta, root);
  }

  step(delta: number, root: any) {
    //Called once every frame
  }

  ready() {
    //Called before the first step
  }

  destroy() {
    this.children.forEach((child: any) => {
      child.destroy();
    });
    if (this.parent) { 
      this.parent.removeChild(this);
    }
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number) {
    if (this.preventDraw) return;
    const drawPosX = x + this.position.x;
    const drawPosY = y + this.position.y;

    this.drawImage(ctx, drawPosX, drawPosY);

    this.getOrderedChildrenForDraw().forEach((child: GameObject) => child.draw(ctx, drawPosX, drawPosY));
  }
  getOrderedChildrenForDraw() {
    return [...this.children].sort((a, b) => {
      // Step 1: Prioritize by drawLayer order: BASE < GROUND < FLOOR < all others
      if (a.drawLayer === BASE && b.drawLayer !== BASE) {
        return -1;
      }
      if (b.drawLayer === BASE && a.drawLayer !== BASE) {
        return 1;
      }

      if (a.drawLayer === GROUND && b.drawLayer !== GROUND) {
        return -1;
      }
      if (b.drawLayer === GROUND && a.drawLayer !== GROUND) {
        return 1;
      }

      if (a.drawLayer === FLOOR && b.drawLayer !== FLOOR) {
        return -1;
      }
      if (b.drawLayer === FLOOR && a.drawLayer !== FLOOR) {
        return 1;
      }

      // Step 2: If both objects are on the same drawLayer or none of the above, sort by y position
      return a.position.y - b.position.y;
    });
  }



  drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {

  }

  addChild(gameObject: GameObject) {
    gameObject.parent = this;
    this.children.push(gameObject);
  }

  removeChild(gameObject: GameObject) {
    events.unsubscribe(gameObject);

    this.children = this.children.filter((x:any) => {
      return gameObject !== x;
    });
  }
  getContent() { 
    if (!this.textContent) {
      return;
    }
    //Maybe expand with story flag logic, etc.
    const match = storyFlags.getRelevantScenario(this.textContent);
    if (!match) { 
      return undefined;
    }
    if (match.addsFlag && match.addsFlag == "START_FIGHT") { 
      events.emit("START_FIGHT", this);
    } 
    return {
      portraitFrame: this.textPortraitFrame,
      string: match.string,
      addsFlag: match.addsFlag ?? undefined,
      canSelectItems: match.canSelectItems
    } as Scenario;
  }
}
