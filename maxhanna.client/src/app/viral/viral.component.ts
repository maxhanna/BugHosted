import { events } from './engine/events';
import { Component, OnInit } from '@angular/core';
import { Input } from './engine/input';
import { GameObject } from './engine/game-object';
import { GameLoop } from './engine/game-loop';
import { Main } from './engine/main';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-viral',
  templateUrl: './viral.component.html',
  styleUrls: ['./viral.component.css'],
  standalone: false
})
export class ViralComponent extends ChildComponent implements OnInit {
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
  private box?: GameObject;
  public mainScene: Main;

  constructor() {
    super();
    this.input = new Input();
    this.mainScene = new Main({ position: { x: 0, y: 0 } });
  }

  ngOnInit() {
  // Optionally, open menu on some event or button
    events.on('HERO_MOVEMENT_LOCK', () => {
      this.isHeroLocked = true;
    });
    events.on('HERO_MOVEMENT_UNLOCK', () => {
      this.isHeroLocked = false;
    });
    const canvas = document.querySelector('canvas');
    if (canvas) {
      this.ctx = (canvas as HTMLCanvasElement).getContext('2d')!;
      this.box = new GameObject({
        position: { x: 100, y: 100 },
        size: 40,
        color: '#4caf50'
      });
      this.gameLoop = new GameLoop(
        () => {
          if (!this.isHeroLocked) {
            const direction = this.mainScene.input.direction;
            if (direction) {
              this.box!.step(direction, this.moveStep, this.canvasWidth, this.canvasHeight);
              // Emit character position event for camera
              events.emit('CHARACTER_POSITION', { id: 1, position: this.box!.position });
            }
          }
        },
        () => {
          this.ctx!.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
          this.box!.draw(this.ctx!);
        }
      );
      this.gameLoop.start();
    }
  }
}
