import { events } from './events';
export class Camera {
  position: { x: number; y: number };
  heroId?: number;
  constructor(config: { position: { x: number; y: number }, heroId?: number }) {
    this.position = config.position;
    this.heroId = config.heroId;
    // Subscribe to character movement events
    events.on('CHARACTER_POSITION', (hero: any) => {
      if (!this.heroId || hero.id === this.heroId) {
        this.centerPositionOnTarget(hero.position);
      }
    });
  }
  centerPositionOnTarget(target: { x: number; y: number }) {
    // Center camera on character, similar to Meta
    const personHalf = 8;
    const canvasWidth = 320;
    const canvasHeight = 220;
    const halfWidth = -personHalf + (canvasWidth / 2);
    const halfHeight = -personHalf + (canvasHeight / 2);
    this.position = {
      x: -target.x + halfWidth,
      y: -target.y + halfHeight
    };
  }
  destroy() {}
}
