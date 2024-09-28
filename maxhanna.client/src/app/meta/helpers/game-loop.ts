import { Sprite } from "../objects/sprite";
import { FrameIndexPattern } from "./frame-index-pattern";

export class GameLoop {
  lastFrameTime = 0;
  accumulatedTime = 0;
  timeStep = 1000 / 60;
  update: Function;
  render: Function;
  ctx?: CanvasRenderingContext2D = undefined;
  rafId?: number;
  isRunning = false;

  constructor(update: Function, render: Function) {
    this.update = update;
    this.render = render; 
  }

  getCtx() {
    const canvas: HTMLCanvasElement = document.getElementById("gameCanvas") as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    return ctx;
  }
  mainLoop = async (timestamp: number) => {
    //console.log(timestamp);
    if (!this.isRunning) return;

    let deltaTime = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;
    this.accumulatedTime += deltaTime;

    while (this.accumulatedTime >= this.timeStep) { 
      await this.update(this.timeStep);
      this.accumulatedTime -= this.timeStep;
    }

    this.render();

    this.rafId = requestAnimationFrame(this.mainLoop);
  }


  start() {
    if (!this.isRunning) {
      this.isRunning = true;
      this.rafId = requestAnimationFrame(this.mainLoop);
    }
  }
  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
    this.isRunning = false;
  }
}
