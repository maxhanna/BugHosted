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
  private _chatInput: HTMLInputElement | null = null;
  // remembers last direction (defaults to RIGHT)
  private lastDirection: string = RIGHT;
  // toggle for auto forward movement (enabled by default for bike)
  autoForward: boolean = true;
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
  destroy() {
    document.removeEventListener('keydown', this.handleKeydown.bind(this));
    document.removeEventListener('keyup', this.handleKeyup.bind(this));
  }
  get direction() {
    return this.heldDirections[0];
  }

  setChatInput(input: HTMLInputElement) {
    this._chatInput = input;
  }

  get chatInput() {
    return this._chatInput!;
  }

  update() {
    this.lastKeys = { ... this.keys };
    // Auto-forward: if no directions are held, restore the last known direction
    if (this.autoForward && !this.chatSelected) {
      if (this.heldDirections.length === 0) {
        this.heldDirections.unshift(this.lastDirection);
      }
    }
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
    if (document.activeElement != this.chatInput) {
      // remove opposite direction on the same axis so the new press is dominant
      if (direction === LEFT) this.heldDirections = this.heldDirections.filter(d => d !== LEFT && d !== RIGHT);
      else if (direction === RIGHT) this.heldDirections = this.heldDirections.filter(d => d !== LEFT && d !== RIGHT);
      else if (direction === UP) this.heldDirections = this.heldDirections.filter(d => d !== UP && d !== DOWN);
      else if (direction === DOWN) this.heldDirections = this.heldDirections.filter(d => d !== UP && d !== DOWN);

      // remove duplicates of same direction and add to front
      this.heldDirections = this.heldDirections.filter(d => d !== direction);
      this.heldDirections.unshift(direction);
    }
    // remember last direction pressed (any axis)
    this.lastDirection = direction;
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
      if (chatInputElement && chatInputElement.value == '') {
        if (!this.chatSelected) {
          chatInputElement.focus();
          this.chatSelected = true;
          moveLock = true;  
          events.emit("STARTED_TYPING");
        } else {
          chatInputElement.blur();
          this.chatSelected = false;
          moveLock = false; 
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
          events.emit("STARTED_TYPING");
          chatInputElement.focus();
          this.chatSelected = true;
          moveLock = true;
        }
      }
      if (moveLock) {
        this.emitDebounced("HERO_MOVEMENT_LOCK");
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
    console.log("pressed a", sendChat);
    if (sendChat && this.chatInput.value) {
      events.emit("SEND_CHAT_MESSAGE", this.chatInput.value);
      console.log("pressed a, saending chat");
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
      events.emit("CLOSE_MENUS");  
    }
  }
  pressSpace() {
    if (document.activeElement != this.chatInput) {
      this.emitDebounced('SPACEBAR_PRESSED');
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
    if (this.chatInput && this.chatInput.value.trim() == "" && document.activeElement == this.chatInput) {
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
    events.emit("CLOSE_MENUS"); 
  }

  handleControl(direction: string, action: 'press' | 'release', event?: TouchEvent) { 
    if (event) {
      event.preventDefault();
    }
    if (event?.type === 'touchcancel') {
      this.onArrowReleased(direction);
      return;
    }

    const directions = {
      UP: ['UP'],
      UP_LEFT: ['UP', 'LEFT'],
      UP_RIGHT: ['UP', 'RIGHT'],
      DOWN: ['DOWN'],
      DOWN_LEFT: ['DOWN', 'LEFT'],
      DOWN_RIGHT: ['DOWN', 'RIGHT'],
      LEFT: ['LEFT'],
      RIGHT: ['RIGHT'],
    }[direction] || [];

    directions.forEach(dir => {
      if (action === 'press') {
        this.onArrowPressed(dir);
      } else {
        this.onArrowReleased(dir);
      }
    });
  }
 
  verifyCanPressKey() { 
    const currentTime = new Date();
    if ((currentTime.getTime() - inputKeyPressedDate.getTime()) > this.inputKeyPressedTimeout) {
      inputKeyPressedDate = new Date();
      return true;
    }
    return false;
  }
  private emitDebounced(eventName: string, data?: any) {
    if (!this.verifyCanPressKey()) return;
    events.emit(eventName, data);
  }
}
