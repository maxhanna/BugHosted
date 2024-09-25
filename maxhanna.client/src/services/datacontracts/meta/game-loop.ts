export class GameLoop {
  lastFrameTime: number;
  accumulatedTime: number;
  timeStep: number;
  update: any;
  render: any;
  rafId: number | null;
  isRunning: boolean;
  constructor(update: any, render: any) {
    this.lastFrameTime = 0;
    this.accumulatedTime = 0;
    this.timeStep = 1000 / 60; // 60 frames per second 

    this.update = update;
    this.render = render;

    this.rafId = null;
    this.isRunning = false;
  }

  mainLoop = (timestamp: number) => {
    if (!this.isRunning) return;

    let deltaTime = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;
    this.accumulatedTime += deltaTime;

    while (this.accumulatedTime >= this.timeStep) { 
      this.update(this.timeStep);
      this.accumulatedTime -= this.timeStep;
    }

    this.render();

    this.rafId = requestAnimationFrame(this.mainLoop);
  }

  start() {
    if (!this.isRunning && this.mainLoop) {
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
  getCtx() {
    if (document.getElementById('gameCanvas')) {
      const ctx = (document.getElementById('gameCanvas') as HTMLCanvasElement).getContext('2d');
      return ctx;
    } return null;
  }
}
