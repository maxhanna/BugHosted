import { events } from './events';
import { UP, DOWN, LEFT, RIGHT } from './grid-cells';

export var inputKeyPressedDate = new Date();
export class Input {
  displayChat? = true;
  heldDirections: string[] = [];
  keys: Record<string, boolean> = {};
  lastKeys: Record<string, boolean> = {};
  inputKeyPressedTimeout = 140;
  chatSelected = false;
  constructor() {
    document.addEventListener("keydown", (e) => {
      if (e.code != " ") {
        this.keys[e.code] = true;
        this.handleKeydown(e);
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
    //console.log("on arrow pressed " + direction);
    if (document.activeElement != this.chatInput && this.heldDirections.indexOf(direction) === -1) {
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
    let moveLock = false; 
    if (this.verifyCanPressKey()) {
      const chatInputElement = this.chatInput;
      console.log(chatInputElement);
      if (chatInputElement && chatInputElement.value == '') {
        if (!this.chatSelected) {
          chatInputElement.focus();
          this.chatSelected = true;
          moveLock = true;
          console.log("chat selected");
        } else {
          chatInputElement.blur();
          this.chatSelected = false;
          moveLock = false;
          console.log("chat blur");
        }
      }
      else if (chatInputElement.value != '') {
        if (chatInputElement === document.activeElement) {
          events.emit("SEND_CHAT_MESSAGE", chatInputElement.value);
          chatInputElement.value = '';
          chatInputElement.blur();
          this.chatSelected = false;
          moveLock = false;
        }
        else {
          chatInputElement.focus();
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
   // console.log(key);
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
      case 'e':
      case 'E': 
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
      case 'q':
      case 'Q':
        this.pressB();
        break; 
      case ' ':
        this.pressSpace();
    }
  }
  pressA(sendChat: boolean = true) {
    console.log("pressed A");
    if (sendChat && this.chatInput && document.activeElement === this.chatInput) {
      events.emit("SEND_CHAT_MESSAGE", this.chatInput.value);
      console.log("chat sent", this.keys);
    }
    else {
      events.emit("SPACEBAR_PRESSED");
      this.keys["Space"] = true;
      setTimeout(() => {
        this.keys["Space"] = false;
      }, 100);
    }
  }
  pressB() {
    if (document.activeElement != this.chatInput) { 
      console.log("pressed B");
      events.emit("CLOSE_INVENTORY_MENU");
      events.emit("CLOSE_HERO_DIALOGUE"); 
    }
  }
  pressSpace() {
    if (document.activeElement != this.chatInput) { 
      events.emit("SPACEBAR_PRESSED");
    }
  }
  pressStart(sendChat: boolean = true) { 
    if (this.chatInput.value != '') { 
      this.pressA(sendChat);
      this.chatInput.blur();
      this.chatSelected = false;
      events.emit("HERO_MOVEMENT_UNLOCK");
    } else {
      events.emit("START_PRESSED");
    }
  }
  pressBackspace() {
    if (this.chatInput.value.trim() == "" && document.activeElement == this.chatInput) {
      console.log("press backspace");
      this.chatInput.blur();
      this.chatSelected = false;
      events.emit("HERO_MOVEMENT_UNLOCK"); 
    }
  }

  pressEscape() { 
    this.chatInput.blur();
    this.chatSelected = false;
    events.emit("HERO_MOVEMENT_UNLOCK"); 
    events.emit("START_PRESSED");
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

  verifyCanPressKey() {
    console.log("can press?");
    const currentTime = new Date();
    if ((currentTime.getTime() - inputKeyPressedDate.getTime()) > this.inputKeyPressedTimeout) {
      inputKeyPressedDate = new Date();
      return true;
    }
    return false;
  }

}
