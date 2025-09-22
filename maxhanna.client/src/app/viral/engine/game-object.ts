export class GameObject {
  position: { x: number; y: number };
  size: number;
  color: string;
  parent?: any;
  children: any[] = [];

  constructor(params: { position: { x: number; y: number }, size: number, color: string }) {
    this.position = params.position;
    this.size = params.size;
    this.color = params.color;
  }

  step(direction: string, moveStep: number, canvasWidth: number, canvasHeight: number) {
    // Support diagonal movement
    let dx = 0, dy = 0;
    switch (direction) {
      case 'UP': dy = -1; break;
      case 'DOWN': dy = 1; break;
      case 'LEFT': dx = -1; break;
      case 'RIGHT': dx = 1; break;
      case 'UP_LEFT': dx = -1; dy = -1; break;
      case 'UP_RIGHT': dx = 1; dy = -1; break;
      case 'DOWN_LEFT': dx = -1; dy = 1; break;
      case 'DOWN_RIGHT': dx = 1; dy = 1; break;
    }
    // Normalize diagonal movement
    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }
    this.position.x = Math.max(0, Math.min(canvasWidth - this.size, this.position.x + dx * moveStep));
    this.position.y = Math.max(0, Math.min(canvasHeight - this.size, this.position.y + dy * moveStep));
  }

  addChild(gameObject: GameObject) {
    gameObject.parent = this;
    this.children.push(gameObject);
  }

  destroy() {
    this.children.forEach((child: any) => {
      if (typeof child.destroy === 'function') {
        child.destroy();
      }
    });
    if (this.parent && typeof this.parent.removeChild === 'function') {
      this.parent.removeChild(this);
    }
  }

  removeChild(gameObject: GameObject) {
    this.children = this.children.filter((x: any) => x !== gameObject);
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.position.x, this.position.y, this.size, this.size);
  }
}
