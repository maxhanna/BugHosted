import { events } from './engine/events';
import { Component, OnInit } from '@angular/core';
import { Input } from './engine/input';
import { GameObject } from './engine/game-object';
import { GameLoop } from './engine/game-loop';
import { Main } from './engine/main';
import { ChildComponent } from '../child.component';
import { Virus } from './engine/virus';
import { Vector2 } from './engine/vector2';
import { fetchMultiplayerState, fetchOrCreateVirus } from './engine/multiplayer';

@Component({
  selector: 'app-viral',
  templateUrl: './viral.component.html',
  styleUrls: ['./viral.component.css'],
  standalone: false
})
export class ViralComponent extends ChildComponent implements OnInit {
  otherViruses: any[] = [];
  private multiplayerInterval?: any;
  public showPopupMenu: boolean = false;
  public useJoystick: boolean = false;
  togglePopupMenu() {
    this.showPopupMenu = !this.showPopupMenu;
  }
  setControlType(type: 'dpad' | 'joystick') {
    this.useJoystick = type === 'joystick';
    this.showPopupMenu = false;
  }
  public isHeroLocked: boolean = false;
  lockMovementForChat() {
    if (!this.isHeroLocked) {
      console.log('lock movement for chat');
      events.emit('HERO_MOVEMENT_LOCK');
    }
  }
  canvasWidth: number = 800;
  canvasHeight: number = 600;
  moveStep: number = 10;
  private ctx?: CanvasRenderingContext2D;
  public input: Input;
  private gameLoop?: GameLoop;
  private virus?: any;
  public mainScene: Main;

  constructor() {
    super();
    this.input = new Input();
    this.mainScene = new Main({ position: { x: 0, y: 0 } });
  }

  ngOnInit() { 
    // Fetch virus data from backend and update position
    (async () => {
      try { 
        const virusData = await fetchOrCreateVirus(this.parentRef?.user?.id ?? 0); // TODO: replace with actual userId
        this.virus = new Virus({
          id: virusData.id,
          position: new Vector2(virusData.position.x, virusData.position.y),
          size: virusData.size,
          color: virusData.color
        });
        this.mainScene.addChild(this.virus);
      } catch (err) {
        console.error('Failed to fetch or create virus', err);
      }
    })();
    this.multiplayerInterval = setInterval(async () => {
      try {
        if (!this.virus) return;
        const state = await fetchMultiplayerState(
          this.virus.map || 'default',
          this.virus.id,
          { x: this.virus.position.x, y: this.virus.position.y }
        );
        // Update other viruses 
        this.otherViruses = state.entities
          .filter((v: any) => v.id !== this.virus?.id)
          .map((v: any) => new Virus({ id: v.id, position: v.position, size: v.size, color: v.color }));
      } catch (err) {
        console.error('Multiplayer sync error', err);
      }
    }, 1000);
    events.on('HERO_MOVEMENT_LOCK', () => {
      this.isHeroLocked = true;
    });
    events.on('HERO_MOVEMENT_UNLOCK', () => {
      this.isHeroLocked = false;
    });
    const canvas = document.querySelector('canvas');
    if (canvas) {
      this.ctx = (canvas as HTMLCanvasElement).getContext('2d')!;
      this.gameLoop = new GameLoop(
        () => {
          if (!this.isHeroLocked) {
            const direction = this.mainScene.input.direction;
            if (direction) {
              this.virus!.step(direction, this.moveStep, this.canvasWidth, this.canvasHeight);
              events.emit('VIRUS_POSITION', { id: this.virus!.id, position: this.virus!.position });
            }
          }
        },
        () => {
          this.ctx!.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
          // Draw main virus
          this.virus!.draw(this.ctx!);
          // Draw other viruses
          this.otherViruses.forEach(v => v.draw(this.ctx!));
        }
      );
      this.gameLoop.start();
    }
  }
}
