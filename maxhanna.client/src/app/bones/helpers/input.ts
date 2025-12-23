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
    this._onKeyDown = (e: KeyboardEvent) => {
      this.keys[e.code] = true;
      this.handleKeydown(e);
    };
    this._onKeyUp = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
      this.handleKeyup(e);
    };
    document.addEventListener("keydown", this._onKeyDown);
    document.addEventListener("keyup", this._onKeyUp);

    // Clear all held input state when window loses focus or becomes hidden so keys don't stick.
    this._onBlur = () => this.resetAllInputStates();
    this._onVisibility = () => { if (document.hidden) this.resetAllInputStates(); };
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('focus', this._onBlur); // also clear on regain to prevent stale movement
    document.addEventListener('visibilitychange', this._onVisibility);
  }
  destroy() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('focus', this._onBlur);
    document.removeEventListener('visibilitychange', this._onVisibility);
  }
  get direction() {
    return this.heldDirections[0];
  }

  setChatInput(input: HTMLInputElement) {
    this._chatInput = input;
    // keep chatSelected in sync with actual focus state of the input
    // (mobile keyboards and other focus flows may not toggle chatSelected)
    input.addEventListener('focus', () => {
      this.chatSelected = true;
      events.emit("STARTED_TYPING");
    });
    input.addEventListener('blur', () => {
      this.chatSelected = false;
      events.emit("HERO_MOVEMENT_UNLOCK");
    });
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
    // Normalize code for mobile where event.code may be undefined or 'Unidentified'
    let code = event.code;
    if (!code || code === 'Unidentified') {
      const k = event.key;
      if (k && k.length === 1) {
        code = 'Key' + k.toUpperCase();
      } else if (k === ' ') {
        code = 'Space';
      } else {
        code = k || '';
      }
    }

    // If chat is selected allow Enter through so pressing Enter in the chat still triggers send/toggle
    if (this.chatSelected && code !== 'Enter' && code !== 'NumpadEnter') {
      return;
    }

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
    // Normalize code for mobile where event.code may be undefined or 'Unidentified'
    let code = event.code;
    if (!code || code === 'Unidentified') {
      const k = event.key;
      if (k && k.length === 1) {
        code = 'Key' + k.toUpperCase();
      } else if (k === ' ') {
        code = 'Space';
      } else {
        code = k || '';
      }
    }

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
      // Close any open UI menus
      events.emit("CLOSE_INVENTORY_MENU");
      events.emit("CLOSE_HERO_DIALOGUE"); 
      events.emit("CLOSE_MENUS");  
      // Also emit the spacebar-style attack event so B acts as a skill/alternate attack button.
      // This lets the Hero class handle using `currentSkill` when appropriate.
      this.emitDebounced('SPACEBAR_PRESSED');
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

  // --- New helpers for focus/visibility resets ---
  private _onKeyDown!: (e: KeyboardEvent) => void;
  private _onKeyUp!: (e: KeyboardEvent) => void;
  private _onBlur!: () => void;
  private _onVisibility!: () => void;

  private resetAllInputStates() {
    // Release all arrow directions
    this.heldDirections.splice(0, this.heldDirections.length);
    // Clear key and action button maps
    Object.keys(this.keys).forEach(k => this.keys[k] = false);
    Object.keys(this.actionButtons).forEach(k => this.actionButtons[k] = false);
    // Unlock movement if it was locked due to a stuck key
    events.emit("HERO_MOVEMENT_UNLOCK");
  }
}
