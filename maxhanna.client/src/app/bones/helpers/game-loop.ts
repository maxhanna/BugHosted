export class GameLoop {
  lastFrameTime = 0; accumulatedTime = 0; timeStep = 1000/60; update: Function; render: Function; rafId?: number; isRunning = false;
  constructor(update: Function, render: Function) { this.update = update; this.render = render; }
  mainLoop = async (timestamp: number) => { if (!this.isRunning) return; let deltaTime = timestamp - this.lastFrameTime; this.lastFrameTime = timestamp; this.accumulatedTime += deltaTime; while (this.accumulatedTime >= this.timeStep) { await this.update(this.timeStep); this.accumulatedTime -= this.timeStep; } this.render(); this.rafId = requestAnimationFrame(this.mainLoop); }
  start() { if (!this.isRunning) { this.isRunning = true; this.rafId = requestAnimationFrame(this.mainLoop); } }
  stop() { if (this.rafId) cancelAnimationFrame(this.rafId); this.isRunning = false; }
}
