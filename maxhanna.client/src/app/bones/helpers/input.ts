import { events } from './events';
import { UP, DOWN, LEFT, RIGHT } from './grid-cells';

export var inputKeyPressedDate = new Date();
export class Input {
  displayChat? = true;
  heldDirections: string[] = [];
  keys: Record<string, boolean> = {};
  // semantic action buttons (distinct from physical key codes)
  actionButtons: Record<string, boolean> = {};
  lastKeys: Record<string, boolean> = {};
  lastActionButtons: Record<string, boolean> = {};
  inputKeyPressedTimeout = 140;
  chatSelected = false;
  private _chatInput: HTMLInputElement | null = null;
  constructor() {
    document.addEventListener("keydown", (e) => {
      // store by event.code so other systems can check e.g. "KeyA" / "Space"
      this.keys[e.code] = true;
      this.handleKeydown(e);
    });
    document.addEventListener("keyup", (e) => {
      this.keys[e.code] = false;
      this.handleKeyup(e);
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
    this.lastActionButtons = { ...this.actionButtons };
  }

  getActionJustPressed(keyCode: string) {
    let justPressed = false;
    if (this.keys[keyCode] && !this.lastKeys[keyCode]) {
      justPressed = true;
    }
    return justPressed;
  }

  // semantic action query (e.g. 'A', 'SPACE')
  getSemanticActionJustPressed(actionName: string) {
    let justPressed = false;
    if (this.actionButtons[actionName] && !this.lastActionButtons[actionName]) {
      justPressed = true;
    }
    return justPressed;
  }

  isSemanticActionDown(actionName: string) {
    return !!this.actionButtons[actionName];
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
    const code = event.code;
    switch (code) {
      case 'ArrowUp':
      case 'KeyW':
        this.onArrowPressed(UP);
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.onArrowPressed(DOWN);
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.onArrowPressed(LEFT);
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.onArrowPressed(RIGHT);
        break;
      case 'Enter':
      case 'NumpadEnter':
        this.handleEnter();
        break;
      case 'Backspace':
        this.pressBackspace();
        break;
      case 'KeyE':
        // start A-button attack when key is pressed
        this.pressAStart(false);
        break;
      case 'Space':
        // start space attack on keydown so holding registers
        this.pressSpaceStart();
        break;
    }
  }

  handleKeyup(event: KeyboardEvent) {
    const code = event.code;
    switch (code) {
      case 'ArrowUp':
      case 'KeyW':
        this.onArrowReleased(UP);
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.onArrowReleased(DOWN);
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.onArrowReleased(LEFT);
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.onArrowReleased(RIGHT);
        break; 
      case 'KeyE':
        // end A-button short-press behavior: treat as releasing the A button
        this.pressAEnd();
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
      case 'KeyQ':
        this.pressB();
        break; 
      case 'Space':
        // end space press when released
        this.pressSpaceEnd();
        break;
      
    }
  }
  pressA(sendChat: boolean = true) {
    console.log("pressed a", sendChat);
    if (sendChat && this.chatInput.value) {
      events.emit("SEND_CHAT_MESSAGE", this.chatInput.value);
      console.log("pressed a, saending chat");
    }
    else {
      // legacy short-click behaviour: emit one attack and mark KeyA briefly
      events.emit("SPACEBAR_PRESSED");
      this.actionButtons["A"] = true;
      this.keys["KeyA"] = true;
      setTimeout(() => {
        this.actionButtons["A"] = false;
        this.keys["KeyA"] = false;
      }, 100);
    }
  }
  // call when A-button is pressed (keydown/mousedown)
  pressAStart(sendChat: boolean = true) {
    if (sendChat && this.chatInput.value) {
      events.emit("SEND_CHAT_MESSAGE", this.chatInput.value);
      return;
    }
    events.emit("SPACEBAR_PRESSED");
    this.actionButtons["A"] = true;
    this.keys["KeyA"] = true;
  }
  // call when A-button is released (keyup/mouseup)
  pressAEnd() {
    this.actionButtons["A"] = false;
    this.keys["KeyA"] = false;
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
  // start of space press (keydown)
  pressSpaceStart() {
    if (document.activeElement != this.chatInput) {
      this.emitDebounced('SPACEBAR_PRESSED');
      this.actionButtons["SPACE"] = true;
      this.keys["Space"] = true;
    }
  }
  // end of space press (keyup)
  pressSpaceEnd() {
    this.actionButtons["SPACE"] = false;
    this.keys["Space"] = false;
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
