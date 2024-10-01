import { Vector2 } from '../../../services/datacontracts/meta/vector2';
import { events } from './events';
import { UP, DOWN, LEFT, RIGHT } from './grid-cells';

export var inputKeyPressedDate = new Date();
export class Input {
  displayChat? = true;
  heldDirections: string[] = [];
  keys: Record<string, boolean> = {};
  lastKeys: Record<string, boolean> = {};
  inputKeyPressedTimeout = 300;
  chatSelected = false;

  constructor() {
    document.addEventListener("keydown", (e) => {

      if (e.code != " ") {
        this.keys[e.code] = true;
        this.handleKeydown(e);
      } else {
        this.pressA();
      }
    });
    document.addEventListener("keyup", (e) => {

      if (e.code != " ") {
        this.keys[e.code] = false;
        this.handleKeyup(e);
      }
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

  private handleEnter() {
    const currentTime = new Date();
    let moveLock = false;
    if ((currentTime.getTime() - inputKeyPressedDate.getTime()) > this.inputKeyPressedTimeout) {
      inputKeyPressedDate = new Date();

      if (this.chatInput && this.chatInput.value == '') {
        if (!this.chatSelected) {
          this.chatInput.focus();
          this.chatSelected = true;
          moveLock = true;
        } else {
          this.chatInput.blur();
          this.chatSelected = false;
          moveLock = false;
        }
      }
      else if (this.chatInput.value != '') {
        if (this.chatInput == document.activeElement) {
          events.emit("SEND_CHAT_MESSAGE", this.chatInput.value);
          this.chatInput.value = '';
          this.chatInput.blur();
          this.chatSelected = false;
          moveLock = false;
        }
        else { 
          this.chatInput.focus();
          this.chatSelected = true;
          moveLock = true;
        } 
      } 
      if (moveLock) {
        events.emit("HERO_MOVEMENT_LOCK");
      } else {
        events.emit("HERO_MOVEMENT_UNLOCK");
      }
    }
  }

  handleKeydown(event: KeyboardEvent) {
    if (this.chatSelected) {
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
      case 'NumpadEnter':
        this.handleEnter();
        break;
      case 'Backspace':
        this.pressBackspace();
        break;
    }
  }

  handleKeyup(event: KeyboardEvent) {
    const key = event.key;
    //console.log(key);
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
      case ' ':
        this.pressA(false);
        break;
      case 'Enter':
      case 'NumpadEnter':
        this.handleEnter();
        break;
      case 'Backspace':
        this.pressBackspace();
        break; 
      case 'Escape':
        this.pressEscape();
        break;
    }
  }
  pressA(sendChat: boolean = true) {
    const currentTime = new Date();

    if ((currentTime.getTime() - inputKeyPressedDate.getTime()) > this.inputKeyPressedTimeout) {
      console.log("pressed A");
      inputKeyPressedDate = new Date();

      if (sendChat && this.chatInput && this.chatInput.value.trim() != "") {
        events.emit("SEND_CHAT_MESSAGE", this.chatInput.value);
      }
      else {
        events.emit("SPACEBAR_PRESSED");
        this.keys["Space"] = true;
        setTimeout(() => {
          this.keys["Space"] = false;
        }, 50);
      }
    }
  }
  pressStart(sendChat: boolean = true) {
    const currentTime = new Date();
    if ((currentTime.getTime() - inputKeyPressedDate.getTime()) > this.inputKeyPressedTimeout) {
      inputKeyPressedDate = new Date();
      this.pressA(sendChat);
      events.emit("START_PRESSED");
    }
  }
  pressBackspace() {
    const currentTime = new Date();
    if ((currentTime.getTime() - inputKeyPressedDate.getTime()) > 100) {
      inputKeyPressedDate = new Date();
      if (this.chatInput.value.trim() == "") {
        this.chatInput.blur();
        this.chatSelected = false;
        events.emit("HERO_MOVEMENT_UNLOCK");
      }
    }
  }

  pressEscape() {
    const currentTime = new Date();
    if ((currentTime.getTime() - inputKeyPressedDate.getTime()) > 100) {
      inputKeyPressedDate = new Date();
      console.log("Pressed Escape"); 
      this.chatInput.blur();
      this.chatSelected = false;
      events.emit("HERO_MOVEMENT_UNLOCK"); 
    }
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
  get chatInput() {
    return document.getElementById("chatInput") as HTMLInputElement;
  }
}
