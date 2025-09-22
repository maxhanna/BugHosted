export class Input {
  // Joystick state
  public joystickActive: boolean = false;
  public joystickCenter = { x: 60, y: 60 };
  public joystickKnob = { x: 60, y: 60 };
  public joystickRadius = 50;
  public knobRadius = 30;

  onJoystickStart(event: MouseEvent | TouchEvent) {
    event.preventDefault();
    this.joystickActive = true;
    document.addEventListener('mousemove', this.onJoystickMoveBound);
    document.addEventListener('touchmove', this.onJoystickMoveBound);
    document.addEventListener('mouseup', this.onJoystickEndBound);
    document.addEventListener('touchend', this.onJoystickEndBound);
  }

  onJoystickMove(event: MouseEvent | TouchEvent) {
    if (!this.joystickActive) return;
    let clientX, clientY;
    if (event instanceof MouseEvent) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    }
    // Get joystick base position
    const base = document.getElementById('joystick-base');
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    // Clamp knob within joystick radius
    const dx = x - this.joystickCenter.x;
    const dy = y - this.joystickCenter.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    let knobX = x, knobY = y;
    if (dist > this.joystickRadius) {
      knobX = this.joystickCenter.x + dx * this.joystickRadius / dist;
      knobY = this.joystickCenter.y + dy * this.joystickRadius / dist;
    }
    this.joystickKnob = { x: knobX, y: knobY };
    // Calculate direction with improved diagonal sensitivity
    const angle = Math.atan2(dy, dx);
    let direction = null;
    if (dist > 10) {
      const deg = angle * 180 / Math.PI;
      // Use 8-way mapping with wider diagonal zones
      if (deg >= -22.5 && deg < 22.5) direction = 'RIGHT';
      else if (deg >= 22.5 && deg < 67.5) direction = 'DOWN_RIGHT';
      else if (deg >= 67.5 && deg < 112.5) direction = 'DOWN';
      else if (deg >= 112.5 && deg < 157.5) direction = 'DOWN_LEFT';
      else if (deg >= 157.5 || deg < -157.5) direction = 'LEFT';
      else if (deg >= -157.5 && deg < -112.5) direction = 'UP_LEFT';
      else if (deg >= -112.5 && deg < -67.5) direction = 'UP';
      else if (deg >= -67.5 && deg < -22.5) direction = 'UP_RIGHT';
    }
    const diagonalMap: Record<string, [string, string]> = {
      UP_LEFT: ['UP', 'LEFT'],
      UP_RIGHT: ['UP', 'RIGHT'],
      DOWN_LEFT: ['DOWN', 'LEFT'],
      DOWN_RIGHT: ['DOWN', 'RIGHT']
    };
    if (typeof direction === 'string' && diagonalMap.hasOwnProperty(direction)) {
      this.heldDirections = [direction];
      this.setDirection(direction);
    } else {
      this.setDirection(direction);
    }
  }

  onJoystickEnd(event: MouseEvent | TouchEvent) {
    this.joystickActive = false;
    this.joystickKnob = { ...this.joystickCenter };
    this.setDirection(null);
    document.removeEventListener('mousemove', this.onJoystickMoveBound);
    document.removeEventListener('touchmove', this.onJoystickMoveBound);
    document.removeEventListener('mouseup', this.onJoystickEndBound);
    document.removeEventListener('touchend', this.onJoystickEndBound);
  }

  public onJoystickMoveBound = this.onJoystickMove.bind(this);
  public onJoystickEndBound = this.onJoystickEnd.bind(this);
  setDirection(direction: string | null) {
    // Clear all held directions, then set the new one if not null
    this.heldDirections = [];
    if (direction) {
      this.heldDirections.unshift(direction);
    }
  }
  private _keydownListener: any;
  private _keyupListener: any;
  handleControl(direction: string, action: 'press' | 'release', event?: TouchEvent) {
    if (event) {
      event.preventDefault();
    }
    if (event?.type === 'touchcancel') {
      this.onArrowReleased(direction);
      return;
    }

    // For diagonals, press both directions at once
    const diagonalMap: Record<string, [string, string]> = {
      UP_LEFT: ['UP', 'LEFT'],
      UP_RIGHT: ['UP', 'RIGHT'],
      DOWN_LEFT: ['DOWN', 'LEFT'],
      DOWN_RIGHT: ['DOWN', 'RIGHT']
    };
    if (typeof direction === 'string' && diagonalMap.hasOwnProperty(direction)) {
      if (action === 'press') {
        // For diagonal, set heldDirections to only the diagonal direction
        this.heldDirections = [direction];
      } else {
        // On release, remove the diagonal direction
        this.onArrowReleased(direction);
      }
    } else {
      if (action === 'press') {
        this.onArrowPressed(direction);
      } else {
        this.onArrowReleased(direction);
      }
    }
  }
  pressA() {
    // Implement A button logic here
    console.log('A button pressed');
    // Example: events.emit('A_PRESSED');
  }

  pressB() {
    // Implement B button logic here
    console.log('B button pressed');
    // Example: events.emit('B_PRESSED');
  }
  pressStart() {
    // Implement start button logic here
    // For now, just log to console and emit an event if needed
    console.log('START button pressed');
    // Example: events.emit('START_PRESSED');
  }
  heldDirections: string[] = [];
  keys: Record<string, boolean> = {};
  lastKeys: Record<string, boolean> = {};
  constructor() {
    this._keydownListener = (e: KeyboardEvent) => {
      this.keys[e.key] = true;
      this.handleKeydown(e);
    };
    this._keyupListener = (e: KeyboardEvent) => {
      this.keys[e.key] = false;
      this.handleKeyup(e);
    };
    document.addEventListener("keydown", this._keydownListener);
    document.addEventListener("keyup", this._keyupListener);
  }

  destroy() {
    document.removeEventListener("keydown", this._keydownListener);
    document.removeEventListener("keyup", this._keyupListener);
  }
  get direction() {
    return this.heldDirections[0];
  }
  update() {
    this.lastKeys = { ...this.keys };
  }
  onArrowPressed(direction: string) {
    if (this.heldDirections.indexOf(direction) === -1) {
      this.heldDirections.unshift(direction);
    }
  }
  onArrowReleased(direction: string) {
    const index = this.heldDirections.indexOf(direction);
    if (index === -1) return;
    this.heldDirections.splice(index, 1);
  }
  handleKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        this.onArrowPressed('UP');
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        this.onArrowPressed('DOWN');
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.onArrowPressed('LEFT');
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.onArrowPressed('RIGHT');
        break;
    }
  }
  handleKeyup(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        this.onArrowReleased('UP');
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        this.onArrowReleased('DOWN');
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.onArrowReleased('LEFT');
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.onArrowReleased('RIGHT');
        break;
    }
  }
}
