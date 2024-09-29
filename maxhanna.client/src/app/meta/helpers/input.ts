import { Vector2 } from '../../../services/datacontracts/meta/vector2';
import { events } from './events';
import { UP, DOWN, LEFT, RIGHT } from './grid-cells';

export class Input {
  moveInterval: any;
  joystickActive = false;
  joystickOrigin = new Vector2(0, 0);
  joystickCurrentPos = new Vector2(0, 0);
  heldDirections: string[] = [];
  keys: Record<string, boolean> = {};
  lastKeys: Record<string, boolean> = {};

  constructor() {
    document.addEventListener("keydown", (e) => {
      const chatInput = document.getElementById("chatInput") as HTMLInputElement;
      if (document.activeElement === chatInput && e.code != "Enter") {
        return;
      }
      this.keys[e.code] = true;  
      this.handleKeydown(e);
    });
    document.addEventListener("keyup", (e) => {
      this.keys[e.code] = false; 
      this.handleKeyup(e);
    });

  }

  get direction() {
    return this.heldDirections[0];
  }

  update() {
    this.lastKeys = { ... this.keys };
  }

  getActionJustPressed(keyCode: string) {
    let justPressed = false;
    if (this.keys[keyCode] && !this.lastKeys[keyCode]) {
      justPressed = true;
    }
    return justPressed;
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
    const chatInput = document.getElementById("chatInput") as HTMLInputElement; 
    if (chatInput?.value.trim() != "" && !this.getActionJustPressed("Enter")) {
      return;
    }
    const key = event.key;
    switch (key) {
      case 'ArrowUp':
      case 'w': 
      case 'W': 
        this.onArrowPressed(UP); 
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        this.onArrowPressed(DOWN); 
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.onArrowPressed(LEFT); 
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.onArrowPressed(RIGHT); 
        break;
      case 'Enter':
        if (this.getActionJustPressed("Enter")) {
          if (chatInput && chatInput.value == '') {
            chatInput.focus();
          } else if (chatInput.value != '') {
            events.emit("SEND_CHAT_MESSAGE", chatInput.value);
          }
        }
        break;
    }
  }

  handleKeyup(event: KeyboardEvent) {
    const key = event.key;
    switch (key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        this.onArrowReleased(UP); 
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        this.onArrowReleased(DOWN); 
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.onArrowReleased(LEFT); 
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.onArrowReleased(RIGHT); 
        break;
    }
  }
  pressA() {
    this.keys["Space"] = true;
    setTimeout(() => {
      this.keys["Space"] = false;
    }, 100);
  }
  handleControl(direction: string, action: 'press' | 'release', event?: TouchEvent) {
    // Prevent the default action to avoid any unwanted scrolling behavior on mobile
    if (event) {
      event.preventDefault();
    }

    if (action === 'press') {
      switch (direction) {
        case 'UP':
          this.onArrowPressed('UP');
          break;
        case 'UP_LEFT':
          this.onArrowPressed('UP');
          this.onArrowPressed('LEFT');
          break;
        case 'UP_RIGHT':
          this.onArrowPressed('UP');
          this.onArrowPressed('RIGHT');
          break;
        case 'DOWN':
          this.onArrowPressed('DOWN');
          break;
        case 'DOWN_LEFT':
          this.onArrowPressed('DOWN');
          this.onArrowPressed('LEFT');
          break;
        case 'DOWN_RIGHT':
          this.onArrowPressed('DOWN');
          this.onArrowPressed('RIGHT');
          break;
        case 'LEFT':
          this.onArrowPressed('LEFT');
          break;
        case 'RIGHT':
          this.onArrowPressed('RIGHT');
          break;
        default:
          break;
      }
    } else if (action === 'release') {
      switch (direction) {
        case 'UP':
          this.onArrowReleased('UP');
          break;
        case 'UP_LEFT':
          this.onArrowReleased('UP');
          this.onArrowReleased('LEFT');
          break;
        case 'UP_RIGHT':
          this.onArrowReleased('UP');
          this.onArrowReleased('RIGHT');
          break;
        case 'DOWN':
          this.onArrowReleased('DOWN');
          break;
        case 'DOWN_LEFT':
          this.onArrowReleased('DOWN');
          this.onArrowReleased('LEFT');
          break;
        case 'DOWN_RIGHT':
          this.onArrowReleased('DOWN');
          this.onArrowReleased('RIGHT');
          break;
        case 'LEFT':
          this.onArrowReleased('LEFT');
          break;
        case 'RIGHT':
          this.onArrowReleased('RIGHT');
          break;
        default:
          break;
      }
    }
  } 
}
