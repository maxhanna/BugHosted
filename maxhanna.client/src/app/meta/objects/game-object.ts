import { ColorSwap } from "../../../services/datacontracts/meta/color-swap";
import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { events } from "../helpers/events";
import { Scenario, storyFlags } from "../helpers/story-flags";

export class GameObject {
  parent?: any;
  children: any = [];
  position: Vector2; 
  hasReadyBeenCalled = false;
  isSolid = false;
  drawLayer?: any;
  textContent?: Scenario[];
  textPortraitFrame?: number;
  colorSwap?: ColorSwap = undefined;
  preventDraw: boolean = false;

  constructor(params: { position: Vector2, colorSwap?: ColorSwap }) {
    this.position = params.position ?? new Vector2(0, 0);
    this.colorSwap = params.colorSwap; 
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
      if (b.drawLayer === "FLOOR") {
        return 1;
      } else { 
        return a.position.y >= b.position.y ? 1 : -1
      }
    })
  }
  drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {

  }

  addChild(gameObject: GameObject) {
    gameObject.parent = this;
    this.children.push(gameObject);
  }

  removeChild(gameObject: GameObject) {
    //console.log(`removing gameObject child : ${gameObject.position.x}, ${gameObject.position.y}`);
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
      console.log("No matches found in this list!", this.textContent);
      return null;
    }
    if (match.addsFlag && match.addsFlag == "START_FIGHT") {
      events.emit("START_FIGHT", this);
    } 
    return {
      portraitFrame: this.textPortraitFrame,
      string: match.string,
      addsFlag: match.addsFlag ?? null,
      canSelectItems: match.canSelectItems
    }
  }
}
