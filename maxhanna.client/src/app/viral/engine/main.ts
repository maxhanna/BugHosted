import { GameObject } from './game-object';
import { events } from './events';
import { Input } from './input';
import { Camera } from './camera';
import { Inventory } from './inventory';

export class Main extends GameObject {
  level?: any = undefined;
  camera: Camera;
  input: Input = new Input();
  inventory: Inventory;
  heroId?: number;
  hero?: any;
  partyMembers?: { heroId: number, name: string, color?: string }[] = [];
  isOmittable = false;

  constructor(config: { position: { x: number; y: number }, heroId?: number, hero?: any, partyMembers?: { heroId: number, name: string, color?: string }[] }) {
    super({ position: config.position, size: 0, color: '' });
    this.heroId = config.heroId;
    this.hero = config.hero;
    this.partyMembers = config.partyMembers || [];
    this.inventory = new Inventory({ character: this.hero, partyMembers: this.partyMembers });
    this.camera = new Camera({ position: { x: 0, y: 0 }, heroId: this.heroId });
    this.isOmittable = false;
    // events.on('HERO_MOVEMENT_LOCK', this, () => { console.log('hero lock'); });
    // events.on('HERO_MOVEMENT_UNLOCK', this, () => { console.log('hero unlock'); });
  }

  setHeroId(heroId: number) {
    this.heroId = heroId;
    this.camera.heroId = heroId;
  }

  setLevel(newLevelInstance: any) {
    if (this.level) {
      this.level.destroy();
    }
    this.level = newLevelInstance;
    this.addChild(this.level);
  }

  drawBackground(ctx: CanvasRenderingContext2D) {
    if (this.level?.background?.drawImage) {
      this.level.background.drawImage(ctx, 0, 0);
    }
  }

  drawObjects(ctx: CanvasRenderingContext2D) {
    this.children.forEach((child: any) => {
      if (!child.drawLayer || child.drawLayer !== 'HUD') {
        child.draw(ctx, 0, 0);
      }
    });
  }

  drawForeground(ctx: CanvasRenderingContext2D) {
    this.children.forEach((child: any) => {
      if (child.drawLayer === 'HUD') {
        child.draw(ctx, 0, 0);
      }
    });
  }

  override destroy() {
    this.input.destroy();
    this.camera.destroy();
    this.inventory.destroy();
    super.destroy();
  }
}
