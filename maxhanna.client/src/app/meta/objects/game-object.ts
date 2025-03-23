import { ColorSwap } from "../../../services/datacontracts/meta/color-swap";
import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { events } from "../helpers/events";
import { Scenario, storyFlags } from "../helpers/story-flags";
import { Level } from "./Level/level";
import { Character } from "./character";

export const BASE = "BASE";
export const GROUND = "GROUND";
export const FLOOR = "FLOOR";
export const HUD = "HUD";

export class GameObject {
  parent?: any;
  root?: any;
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
  forceDrawName = false;
  name?: string;
  isOmittable = true;
  beforePreventDrawDistance = false;

  drawingForever = false;
  distanceToHero = new Vector2(0,0);
  heroLocation = new Vector2(0,0);

  constructor(params: {
    position: Vector2,
    colorSwap?: ColorSwap,
    drawLayer?: typeof BASE | typeof GROUND | typeof FLOOR | typeof HUD,
    preventDraw?: boolean,
    preventDrawName?: boolean,
    forceDrawName?: boolean,
    isSolid?: boolean,
    textContent?: Scenario[],
    textPortraitFrame?: number,
    isOmittable?: boolean,
    name?: string, 
  }) {
    this.position = params.position ?? new Vector2(0, 0);
    this.colorSwap = params.colorSwap;
    this.preventDraw = params.preventDraw ?? false;
    this.preventDrawName = params.preventDrawName ?? false;
    this.forceDrawName = params.forceDrawName ?? false;
    this.drawLayer = params.drawLayer;
    this.isSolid = params.isSolid ?? false;
    this.textContent = params.textContent;
    this.textPortraitFrame = params.textPortraitFrame;
    this.name = params.name; 
    this.beforePreventDrawDistance = this.preventDraw;
    this.isOmittable = params.isOmittable ?? true;
    this.root = this;
    while (this.root && this.root.parent) {
      this.root = this.root.parent;
    }

    events.on("CHARACTER_POSITION", this, (char: Character) => { 
      if (char.isUserControlled) {
        this.distanceToHero = new Vector2(Math.abs(this.position.x - char.destinationPosition.x), Math.abs(this.position.y - char.destinationPosition.y)); 
        this.heroLocation = char.position;
      }
      if (char.isUserControlled && !this.beforePreventDrawDistance && this.isOmittable && this.parent?.isOmittable) {
        const thresh = 500;  
        const added = this.distanceToHero.x + this.distanceToHero.y;

        if (added < thresh) {
          this.preventDraw = this.beforePreventDrawDistance;
        } else {
          if (!(this as any).objectId) { 
            this.preventDraw = true; 
          }
        } 
      }
    });
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

  draw(ctx: CanvasRenderingContext2D, x: number, y: number, force = false, forever = false) { 
    if (this.preventDraw) return;
    const drawPosX = x + this.position.x;
    const drawPosY = y + this.position.y;

    this.drawImage(ctx, drawPosX, drawPosY);
    if (this.forceDrawName && !this.preventDrawName) {
      this.drawName(ctx, drawPosX, drawPosY);
    }

    if (this.drawingForever = this.drawingForever || forever || !this.isOmittable) {
      this.sortChildren().forEach((child: GameObject) => child.draw(ctx, drawPosX, drawPosY, true, true));
    }
    else {
      if (force) {
        this.sortChildren().forEach((child: GameObject) => child.draw(ctx, drawPosX, drawPosY, false));
      }
      else { 
        this.sortChildren().forEach((child: GameObject) => child.draw(ctx, drawPosX, drawPosY, true)); 
      }
    } 
  } 

  sortChildren() {
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


  drawName(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    if (this.name) {
      // Set the font style and size for the name
      ctx.font = "7px fontRetroGaming"; // Font and size
      ctx.fillStyle = "chartreuse"; // Text color
      ctx.textAlign = "center"; // Center the text


      // Measure the width of the text
      const textWidth = ctx.measureText(this.name).width;

      // Set box properties for name
      const boxPadding = 2; // Padding around the text
      const boxWidth = textWidth + boxPadding * 2; // Box width
      const boxHeight = 8; // Box height (fixed height)
      const boxX = drawPosX - (boxWidth / 2) + 7; // Center the box horizontally
      const boxY = drawPosY + 23; // Position the box below the player


      // Draw the dark background box for the name
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)"; // Semi-transparent black for the box
      ctx.fillRect(boxX, boxY, boxWidth, boxHeight); // Draw the box

      // Draw the name text on top of the box
      ctx.fillStyle = "chartreuse";
      ctx.fillText(this.name, drawPosX + 7, boxY + boxHeight - 1);
    }
  }

}
