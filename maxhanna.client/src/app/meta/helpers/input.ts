import { Vector2 } from '../../../services/datacontracts/meta/vector2';
import { UP, DOWN, LEFT, RIGHT } from './grid-cells';

export class Input {
  moveInterval: any;
  joystickActive = false;
  joystickOrigin = new Vector2(0, 0);
  joystickCurrentPos = new Vector2(0, 0);
  heldDirections: string[] = [];

  constructor() {
    document.addEventListener("keydown", (e) => {
      this.handleKeydown(e);
    });
    document.addEventListener("keyup", (e) => {
      this.handleKeyup(e);
    });

  }

  get direction() {
    return this.heldDirections[0];
  }

  onArrowPressed(direction: string) {
    if (this.heldDirections.indexOf(direction) === -1) {
      this.heldDirections.unshift(direction);
    }
  }
  onArrowReleased(direction: string) {
    const index = this.heldDirections.indexOf(direction);
    if (index === -1) {
      return;
    }
    this.heldDirections.splice(index, 1);
  }

  handleKeydown(event: KeyboardEvent) {
    const key = event.key;
    switch (key) {
      case 'ArrowUp':
      case 'w':
        //this.moveUp();
        this.onArrowPressed(UP);

        break;
      case 'ArrowDown':
      case 's':
        this.onArrowPressed(DOWN);

        break;
      case 'ArrowLeft':
      case 'a':
        this.onArrowPressed(LEFT);

        break;
      case 'ArrowRight':
      case 'd':
        this.onArrowPressed(RIGHT);

        break;
      case 'Enter':
        //if (document.activeElement === this.chatInput.nativeElement) {
        //  if (this.showingNarrationText) {
        //    this.advanceStartingStoryText();
        //  }
        //  this.chatInput.nativeElement.blur();
        //} else {
        //  this.focusOnChatInput();
        //}
        break;
    }
  }

  handleKeyup(event: KeyboardEvent) {
    const key = event.key;
    switch (key) {
      case 'ArrowUp':
      case 'w':
        this.onArrowReleased(UP);

        break;
      case 'ArrowDown':
      case 's':
        this.onArrowReleased(DOWN);

        break;
      case 'ArrowLeft':
      case 'a':
        this.onArrowReleased(LEFT);

        break;
      case 'ArrowRight':
      case 'd':
        this.onArrowReleased(RIGHT); 
        break;
    }
  }

  startJoystick(event: TouchEvent | MouseEvent): void {
    event.preventDefault();
    this.joystickActive = true;

    // For touch events
    if (event instanceof TouchEvent) {
      const touch = event.touches[0];
      this.joystickOrigin = new Vector2(touch.clientX, touch.clientY);
    }
    // For mouse events
    else if (event instanceof MouseEvent) {
      this.joystickOrigin = new Vector2(event.clientX, event.clientY);
    }
    this.startContinuousMovement();
  }

  moveJoystick(event: Event) {
    if (!this.joystickActive) return;
    let touch = undefined;

    if ((event as TouchEvent).touches) {
      touch = (event as TouchEvent).touches[0];
    }
    const mousePos = (event as MouseEvent);
    const deltaX = (touch?.clientX ?? mousePos.clientX) - (this.joystickOrigin.x);
    const deltaY = (touch?.clientY ?? mousePos.clientY) - (this.joystickOrigin.y);

    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const angle = Math.atan2(deltaY, deltaX);

    const maxDistance = 40;
    const limitedDistance = Math.min(distance, maxDistance);
    const newX = Math.cos(angle) * limitedDistance;
    const newY = Math.sin(angle) * limitedDistance;

    // Move joystick visually
    const joystickElement = document.querySelector('.joystick') as HTMLElement;
    joystickElement.style.transform = `translate(${newX}px, ${newY}px)`;

    // Update current joystick position for continuous movement logic
    this.joystickCurrentPos = new Vector2(newX, newY);
  }

  stopJoystick() {
    this.joystickActive = false;
    // Stop continuous movement
    this.stopContinuousMovement();
    // Reset joystick position
    const joystickElement = document.querySelector('.joystick') as HTMLElement;
    joystickElement.style.transform = 'translate(0px, 0px)';
  }

  startContinuousMovement() {
    this.moveInterval = setInterval(() => {
      this.moveHeroBasedOnJoystick();
    }, 1000 / 35);
  }

  stopContinuousMovement() {
    if (this.moveInterval) {
      clearInterval(this.moveInterval);
      this.moveInterval = null;
      this.onArrowReleased(UP);
      this.onArrowReleased(DOWN);
      this.onArrowReleased(LEFT);
      this.onArrowReleased(RIGHT);
    }
  }

  moveHeroBasedOnJoystick() {
    const threshold = 10;
    if (Math.abs(this.joystickCurrentPos.x) > threshold || Math.abs(this.joystickCurrentPos.y) > threshold) {

      if (Math.abs(this.joystickCurrentPos.x) > Math.abs(this.joystickCurrentPos.y)) {
        // Moving horizontally
        if (this.joystickCurrentPos.x > 0) {
          //this.moveRight(); 
          this.onArrowPressed(RIGHT);
          this.onArrowReleased(LEFT);
          this.onArrowReleased(UP);
          this.onArrowReleased(DOWN);
        } else {
          // this.moveLeft();
          this.onArrowPressed(LEFT);
          this.onArrowReleased(RIGHT);
          this.onArrowReleased(UP);
          this.onArrowReleased(DOWN);
        }
      } else {
        // Moving vertically
        if (this.joystickCurrentPos.y > 0) {
          //this.moveDown(); 
          this.onArrowPressed(DOWN);
          this.onArrowReleased(LEFT);
          this.onArrowReleased(UP);
          this.onArrowReleased(RIGHT);
        } else {
          //this.moveUp(); 
          this.onArrowPressed(UP);
          this.onArrowReleased(LEFT);
          this.onArrowReleased(RIGHT);
          this.onArrowReleased(DOWN);
        }
      }
    }
  }
}
