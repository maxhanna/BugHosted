import { GameObject } from './game-object';
import { events } from './events';
import { Vector2 } from './vector2';

export class Virus extends GameObject {
  id: number;
  consumedObjects: any[] = [];

  constructor(params: { id: number, position: Vector2, size: number, color: string }) {
    super({ position: params.position, size: params.size, color: params.color });
    this.id = params.id;
    this.size = params.size;
    this.color = params.color;
  }

  consume(object: any) {
    if (!object.consumed) {
      object.consumed = true;
      this.size += object.growthValue || 1;
      this.consumedObjects.push(object);
      events.emit('VIRUS_CONSUMED', { virusId: this.id, objectId: object.id, growthValue: object.growthValue });
      // TODO: Trigger backend call to /Viral/ConsumeObject
    }
  }

  override draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.position.x, this.position.y, this.size, 0, 2 * Math.PI);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.restore();
  }
}
