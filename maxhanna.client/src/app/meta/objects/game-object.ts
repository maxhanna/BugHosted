import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { events } from "../helpers/events";
import { Input } from "../helpers/input";

export class GameObject {
  parent: any;
  children: any;
  position: Vector2;
  input: Input;
  hasReadyBeenCalled = false;

  constructor({ position }: { position: Vector2 }) {
    this.position = position ?? new Vector2(0, 0);
    this.children = [];
    this.input = new Input();
    this.parent = null;
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
    this.parent.removeChild(this);
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y:number) {
    const drawPosX = x + this.position.x;
    const drawPosY = y + this.position.y;

    this.drawImage(ctx, drawPosX, drawPosY);

    this.children.forEach((child: any) => child.draw(ctx, drawPosX, drawPosY));
  }

  drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {

  }

  addChild(gameObject: GameObject) {
    gameObject.parent = this;
    this.children.push(gameObject);
  }

  removeChild(gameObject: GameObject) {
    console.log(`removing gameObject child : ${gameObject.position.x}, ${gameObject.position.y}`);
    events.unsubscribe(gameObject);

    this.children = this.children.filter((x:any) => {
      return gameObject !== x;
    });
  }
}
