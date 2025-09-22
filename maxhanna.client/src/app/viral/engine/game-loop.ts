export class GameLoop {
  private rafId?: number;
  private isRunning = false;
  private update: () => void;
  private render: () => void;
  constructor(update: () => void, render: () => void) {
    this.update = update;
    this.render = render;
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
  private mainLoop = (timestamp: number) => {
    if (!this.isRunning) return;
    this.update();
    this.render();
    this.rafId = requestAnimationFrame(this.mainLoop);
  }
}
