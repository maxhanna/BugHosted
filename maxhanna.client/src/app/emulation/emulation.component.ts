import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { UserService } from '../../services/user.service';
import { Nostalgist } from 'nostalgist';
import { ChildComponent } from '../child.component';
import { RomService } from '../../services/rom.service';
import { FileService } from '../../services/file.service';
import { FileEntry } from '../../services/datacontracts/file/file-entry';

@Component({
  selector: 'app-emulation',
  templateUrl: './emulation.component.html',
  styleUrls: ['./emulation.component.css'],
  standalone: false
})
export class EmulationComponent extends ChildComponent implements OnInit, OnDestroy {
  isMenuPanelOpen = false;
  selectedRomName?: string;
  nostalgist: Nostalgist | undefined;
  elementListenerMap = new WeakMap<Element, boolean>();
  @ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('localFileOpen') localFileOpen!: ElementRef<HTMLInputElement>;
  @ViewChild('loadRomSelect') loadRomSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('fullscreenContainer') fullscreenContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('stopButton') stopButton!: ElementRef<HTMLButtonElement>;
  gbGamesList: Array<string> = [];
  gbColorGamesList: Array<string> = [];
  pokemonGamesList: Array<string> = [];
  romDirectory: FileEntry[] = [];
  soundOn = true;
  lastSaved?: Date;
  currentFileType = '';
  isSearchVisible = true;
  isFullScreen = false;
  hapticFeedbackEnabled = this.onMobile();
  showControls = this.onMobile();
  private currentKeyListeners: { type: string; listener: EventListener }[] = [];
  private touchControls: Map<number, string[]> = new Map(); // touchId to array of joypadIndices
  readonly coreMapping: { [key: string]: string } = {
    'gba': 'mgba',
    'gbc': 'mgba',
    'gb': 'mgba',
    'nes': 'fceumm',
    'sfc': 'snes9x',
    'smc': 'snes9x',
    'snes': 'snes9x',
    'vb': 'mednafen_vb',
    'ws': 'mednafen_wswan',
    'wsc': 'mednafen_wswan',
    'gen': 'genesis_plus_gx',
    'md': 'genesis_plus_gx',
    'smd': 'genesis_plus_gx',
    '32x': 'genesis_plus_gx',
    'sms': 'genesis_plus_gx',
    'gg': 'genesis_plus_gx',
    'pce': 'mednafen_pce_fast',
    'sgx': 'mednafen_supergrafx',
    'ngp': 'mednafen_ngp',
    'ngpc': 'mednafen_ngp',
    'zip': 'mame2003_plus',
    'fba': 'fbalpha2012',
    'fba_cps1': 'fbalpha2012_cps1',
    'fba_cps2': 'fbalpha2012_cps2',
    'fba_neogeo': 'fbalpha2012_neogeo',
  };
  readonly allowedFileTypes = Object.keys(this.coreMapping).map(ext => `.${ext}`).join(',');
  readonly segaFileTypes: string[] = Object.entries(this.coreMapping)
    .filter(([key, value]) => value.includes('genesis'))
    .map(([key, value]) => key);
  readonly snesFileTypes: string[] = Object.entries(this.coreMapping)
    .filter(([key, value]) => value.includes('snes'))
    .map(([key, value]) => key);
  readonly gameboyFileTypes: string[] = Object.entries(this.coreMapping)
    .filter(([key, value]) => key.includes('gb'))
    .map(([key, value]) => key);
  readonly gameboyAdvancedFileTypes: string[] = Object.entries(this.coreMapping)
    .filter(([key, value]) => key.includes('gba'))
    .map(([key, value]) => key);
  oldCanvasWidth = 0;
  oldCanvasHeight = 0;
  oldSpeakerDisplay = '';
  controlsSet = false;
  showHelpText = false;
  autosaveInterval: any;
  autosaveIntervalTime: number = 60000;
  autosave = true;
  currentVolume = 99;
  maxVolume = 99;
  actionDelay = 50;
  unlockedCanvas: boolean = false;
  keybindings: { [action: string]: string } = {
    a: 'x',
    b: 'z',
    c: 'a',
    x: 's',
    y: 'a',
    l: 'q',
    r: 'w',
    start: 'Enter',
    select: 'Shift',
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight'
  };
  readonly defaultKeybindings: { [action: string]: string } = {
    a: 'x',
    b: 'z',
    c: 'a',
    x: 's',
    y: 'a',
    l: 'q',
    r: 'w',
    start: 'Enter',
    select: 'Shift',
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight'
  };
  waitingForKey: string | null = null;
  showControlBindings = false;
  useJoystick = false;

  // joystick runtime state
  private joystickState: {
    active: boolean;
    pointerId?: number | null;
    originX: number;
    originY: number;
    pressed: Set<string>;
  } = { active: false, pointerId: null, originX: 0, originY: 0, pressed: new Set() };

  private joystickListeners: Array<{ elem: EventTarget, type: string, fn: EventListenerOrEventListenerObject }> = [];

  constructor(private romService: RomService, private fileService: FileService, private userService: UserService) {
    super();
  }

  onToggleJoystick() {
    this.useJoystick = !this.useJoystick;
    // Rebind controls to apply change (teardown then setup)
    this.controlsSet = false;
    setTimeout(() => this.setHTMLControls(), 10);
    this.closeMenuPanel();
  }

  private setupJoystick() {
    try {
      const base = document.getElementById('joystickBase');
      const knob = document.getElementById('joystickKnob');
      if (!base || !knob) return;

      const rect = base.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Wrap pointer handlers as generic EventListener to satisfy DOM types
      const pointerDown: EventListener = (e: Event) => {
        const ev = e as PointerEvent;
        this.joystickPointerDown(ev, base, knob, centerX, centerY);
      };
      const pointerMove: EventListener = (e: Event) => {
        const ev = e as PointerEvent;
        this.joystickPointerMove(ev, base, knob, centerX, centerY);
      };
      const pointerUp: EventListener = (e: Event) => {
        const ev = e as PointerEvent;
        this.joystickPointerUp(ev, base, knob);
      };

      base.addEventListener('pointerdown', pointerDown);
      document.addEventListener('pointermove', pointerMove);
      document.addEventListener('pointerup', pointerUp);

      this.joystickListeners.push({ elem: base, type: 'pointerdown', fn: pointerDown });
      this.joystickListeners.push({ elem: document, type: 'pointermove', fn: pointerMove });
      this.joystickListeners.push({ elem: document, type: 'pointerup', fn: pointerUp });
    } catch (ex) {
      console.warn('setupJoystick failed', ex);
    }
  }

  private teardownJoystick() {
    try {
      for (const l of this.joystickListeners) {
        l.elem.removeEventListener(l.type, l.fn as EventListener);
      }
      this.joystickListeners = [];
      // reset knob position
      const knob = document.getElementById('joystickKnob');
      if (knob) knob.style.transform = 'translate(0px, 0px)';
      // release any pressed directions
      this.joystickState.pressed.forEach(dir => this.nostalgist?.pressUp(dir));
      this.joystickState.pressed.clear();
      this.joystickState.active = false;
      this.joystickState.pointerId = null;
    } catch (ex) { }
  }

  private joystickPointerDown(ev: PointerEvent, base: HTMLElement, knob: HTMLElement, cx: number, cy: number) {
    try {
      ev.preventDefault();
      (ev.target as Element).setPointerCapture?.(ev.pointerId);
      this.joystickState.active = true;
      this.joystickState.pointerId = ev.pointerId;
      const r = base.getBoundingClientRect();
      const originX = r.left + r.width / 2;
      const originY = r.top + r.height / 2;
      this.joystickState.originX = originX;
      this.joystickState.originY = originY;
      this.processJoystickMove(ev.clientX, ev.clientY, knob, originX, originY);
    } catch (ex) { }
  }

  private joystickPointerMove(ev: PointerEvent, base: HTMLElement | null, knob: HTMLElement | null, cx?: number, cy?: number) {
    if (!this.joystickState.active || this.joystickState.pointerId !== ev.pointerId) return;
    ev.preventDefault();
    const knobEl = document.getElementById('joystickKnob');
    const baseEl = document.getElementById('joystickBase');
    if (!knobEl || !baseEl) return;
    const r = baseEl.getBoundingClientRect();
    const originX = r.left + r.width / 2;
    const originY = r.top + r.height / 2;
    this.processJoystickMove(ev.clientX, ev.clientY, knobEl, originX, originY);
  }

  private joystickPointerUp(ev: PointerEvent, base?: HTMLElement | null, knob?: HTMLElement | null) {
    if (!this.joystickState.active || this.joystickState.pointerId !== ev.pointerId) return;
    ev.preventDefault();
    // release pressed directions
    this.joystickState.pressed.forEach(dir => this.nostalgist?.pressUp(dir));
    this.joystickState.pressed.clear();
    this.joystickState.active = false;
    this.joystickState.pointerId = null;
    const knobEl = document.getElementById('joystickKnob');
    if (knobEl) knobEl.style.transform = 'translate(0px, 0px)';
  }

  private processJoystickMove(clientX: number, clientY: number, knobEl: HTMLElement, originX: number, originY: number) {
    const dx = clientX - originX;
    const dy = clientY - originY;
    // clamp to radius
    const maxRadius = 60; // pixels
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const limitedDist = Math.min(dist, maxRadius);
    const knobX = Math.round(nx * limitedDist);
    const knobY = Math.round(ny * limitedDist);
    knobEl.style.transform = `translate(${knobX}px, ${knobY}px)`;

    // decide directions pressed with deadzone
    const deadzone = 0.35; // fraction of maxRadius
    const pressX = (Math.abs(dx) / maxRadius) > deadzone ? (dx > 0 ? 'right' : 'left') : null;
    const pressY = (Math.abs(dy) / maxRadius) > deadzone ? (dy > 0 ? 'down' : 'up') : null;

    const desired = new Set<string>();
    if (pressX) desired.add(pressX);
    if (pressY) desired.add(pressY);

    // release any directions not desired and press any new ones
    this.joystickState.pressed.forEach(dir => {
      if (!desired.has(dir)) {
        this.nostalgist?.pressUp(dir);
        this.joystickState.pressed.delete(dir);
      }
    });
    desired.forEach(dir => {
      if (!this.joystickState.pressed.has(dir)) {
        this.nostalgist?.pressDown(dir);
        this.joystickState.pressed.add(dir);
      }
    });
  }

  // Millisecond timestamp when current play session started (set when emulator launched/load state/start new run)
  runStartMs?: number = undefined;

  async ngOnInit() {
    this.overrideGetUserMedia();
    this.setupEventListeners();
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        this.canvas.nativeElement.style.height = (this.onMobile() ? '60vh' : '100vh');
        console.log("set canvas height: " + this.canvas.nativeElement.style.height);
      }
      this.isFullScreen = !this.isFullScreen;
    });
    this.parentRef?.setViewportScalability(false);
    this.parentRef?.addResizeListener();
    // Load user mute setting
    const uid = this.parentRef?.user?.id;
    if (uid) {
      this.userService.getUserSettings(uid).then(s => {
        if (s && typeof s.muteSounds === 'boolean') {
          this.soundOn = !s.muteSounds; // soundOn true means not muted
        }
      }).catch(()=>{});
    }
  }

  async ngOnDestroy() {
    await this.stopEmulator().then(async () => {
      this.stopLoading();
      this.nostalgist = undefined;
      this.parentRef?.setViewportScalability(true);
      this.parentRef?.removeResizeListener();
      // Release all inputs
      this.touchControls.forEach((controls) => {
        controls.forEach(control => this.nostalgist?.pressUp(control));
      });
      this.touchControls.clear();
    });
  }

  setupEventListeners() {
    document.addEventListener('keydown', (event) => {
      if (this.waitingForKey) {
        event.preventDefault();
        const newKey = event.key;
        this.keybindings[this.waitingForKey] = newKey;
        this.waitingForKey = null;
        this.parentRef?.showNotification(`Bound to "${newKey}"`);
        return;
      }
      const pressedKey = event.key;
      const action = Object.entries(this.keybindings).find(([_, val]) => val === pressedKey)?.[0];
      if (action) {
        this.nostalgist?.pressDown(action);
        event.preventDefault();
      }
    });

    document.addEventListener('keyup', (event) => {
      const releasedKey = event.key;
      const action = Object.entries(this.keybindings).find(([_, val]) => val === releasedKey)?.[0];
      if (action) {
        this.nostalgist?.pressUp(action);
        event.preventDefault();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' || event.key === 'Esc') {
        if (this.isFullScreen) {
          this.toggleFullscreen();
        }
      }
    });
  }

  async saveState(isAutosave?: boolean) {
    if (!this.parentRef?.user?.id) return;
    if (!this.selectedRomName) return alert("Must have a rom selected to save!");
    const res = await this.nostalgist?.saveState();
    const formData = new FormData();
    formData.append('files', (res as any).state!, this.fileService.getFileWithoutExtension(this.selectedRomName) + ".sav");
    // attach timing fields so server can record play duration alongside the uploaded save
    try {
      if (this.runStartMs) {
        const saveMs = Date.now();
        const durationSeconds = Math.max(0, Math.floor((saveMs - this.runStartMs) / 1000));
        formData.append('startTimeMs', String(this.runStartMs));
        formData.append('saveTimeMs', String(saveMs));
        formData.append('durationSeconds', String(durationSeconds));
      }
    } catch (e) { /* ignore timing attach errors */ }

    await this.romService.uploadRomFile(this.parentRef.user.id, formData).then(res => {
      if (!isAutosave) {
        this.parentRef?.showNotification("Game data saved on the server.");
      }
      this.lastSaved = new Date();
      this.closeMenuPanel();
    });
  }

  async stopEmulator() {
    if (this.selectedRomName && this.selectedRomName != '' && this.parentRef && this.parentRef.user) {
      if (confirm("Save game 💾?")) {
        await this.saveState(false);
      }
    }
    await this.clearAutosave();
    await this.nostalgist?.getEmulator().exit();
    this.isSearchVisible = true;
    this.currentFileType = '';
    this.selectedRomName = '';
    this.controlsSet = false;
    this.touchControls.forEach((controls) => {
      controls.forEach(control => this.nostalgist?.pressUp(control));
    });
    this.touchControls.clear();
    this.closeMenuPanel();
  }

  async loadState() {
    if (!this.selectedRomName) return alert("You must select a rom to do that");
    const romSaveFile = this.fileService.getFileWithoutExtension(this.selectedRomName) + ".sav";
    const saveStateResponse = await this.romService.getRomFile(romSaveFile, this.parentRef?.user?.id);
    await this.nostalgist?.loadState(saveStateResponse!);
  // mark session start when a state is loaded
  this.runStartMs = Date.now();
  }

  async loadRom(file: FileEntry) {
    this.startLoading();
    this.isSearchVisible = false;
    const romSaveFile = this.fileService.getFileWithoutExtension(file.fileName ?? "") + ".sav";
    this.selectedRomName = file.fileName ?? "";
    const saveStateResponse = await this.romService.getRomFile(romSaveFile, this.parentRef?.user?.id);
    const response = await this.romService.getRomFile(file.fileName ?? "", this.parentRef?.user?.id);
    const fileType = this.currentFileType = file?.fileType ?? this.fileService.getFileExtension(file?.fileName!);
    const style = {
      backgroundColor: 'unset',
      zIndex: '1',
      height: (this.onMobile() ? '60vh' : '100vh'),
      width: (this.onMobile() ? '97vw' : '100vw')
    };
    const core = this.coreMapping[fileType.toLowerCase()] || 'default_core';
    this.nostalgist = await Nostalgist.launch({
      core: core,
      rom: { fileName: this.selectedRomName, fileContent: response! },
      style: style,
      element: this.canvas.nativeElement,
      state: saveStateResponse != null ? saveStateResponse : undefined,
      runEmulatorManually: true
    });
    await this.nostalgist.launchEmulator();
    setTimeout(() => {
      if (!this.soundOn) {
        this.nostalgist?.sendCommand('MUTE');
      }
    }, 1);
    this.setHTMLControls();
    this.setupAutosave();
  // mark session start when rom is loaded/launched
  this.runStartMs = Date.now();
    this.stopLoading();
  }

  onVolumeChange(event: Event) {
    const inputElement = event.target as HTMLInputElement;
    const targetVolume = Number(inputElement.value);
    this.adjustVolumeIncrementally(targetVolume);
  }

  adjustVolumeIncrementally(targetVolume: number) {
    if (!this.soundOn) {
      this.toggleSound();
    }
    const step = targetVolume > this.currentVolume ? 1 : -1;
    const steps = Math.abs(targetVolume - this.currentVolume);
    const adjustVolumeStep = (count: number) => {
      if (count <= 0) {
        return;
      }
      setTimeout(() => {
        if (step > 0) {
          this.increaseVolume();
        } else {
          this.decreaseVolume();
        }
        adjustVolumeStep(count - 1);
      }, this.actionDelay);
    };
    adjustVolumeStep(steps);
  }

  decreaseVolume() {
    if (this.nostalgist) {
      this.currentVolume = Math.max(0, this.currentVolume - 1);
      this.nostalgist.sendCommand('VOLUME_DOWN');
    }
  }

  increaseVolume() {
    if (this.nostalgist) {
      this.currentVolume = Math.min(this.maxVolume, this.currentVolume + 1);
      this.nostalgist.sendCommand('VOLUME_UP');
    }
  }

  setupAutosave() {
    this.clearAutosave();
    this.autosave = false;
    setTimeout(() => {
      this.autosave = true;
    }, 60000);
    this.autosaveInterval = setInterval(async () => {
      if (this.autosave && this.nostalgist && this.selectedRomName != '') {
        await this.saveState(true);
      }
    }, this.autosaveIntervalTime);
  }

  async clearAutosave() {
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
      this.autosaveInterval = undefined;
    }
  }

  getFileExtension(fileName: string) {
    this.fileService.getFileExtension(fileName).toLowerCase();
  }

  toggleSound() {
    // Emulator MUTE command toggles audio state internally
    this.nostalgist?.sendCommand("MUTE");
    this.soundOn = !this.soundOn; // flip local state
    const muted = !this.soundOn; // mute_sounds value to persist
    if (this.parentRef?.user?.id) {
      this.userService.updateMuteSounds(this.parentRef.user.id, muted).catch(()=>{});
    }
    this.closeMenuPanel();
  }

  isSnesGame(): boolean {
    const ft = this.currentFileType.toLowerCase().trim();
    return this.snesFileTypes.includes(ft);
  }

  isGbaGame(): boolean {
    const ft = this.currentFileType.toLowerCase().trim();
    return this.gameboyAdvancedFileTypes.includes(ft);
  }

  isSegaGame(): boolean {
    const ft = this.currentFileType.toLowerCase().trim();
    return this.segaFileTypes.includes(ft);
  }

  setHTMLControls() {
    if (this.controlsSet) {
      return;
    } else {
      this.controlsSet = true;
    }
    const addPressReleaseEvents = (elementClass: string, joypadIndex: string) => {
      const element = document.getElementsByClassName(elementClass)[0] as HTMLElement;
      if (!element || this.elementListenerMap.get(element)) return;
      this.elementListenerMap.set(element, true);

      element.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        const touchId = touch.identifier;
        this.touchControls.set(touchId, [joypadIndex]);
        this.nostalgist?.pressDown(joypadIndex);
        element.classList.add('active');
        if (this.hapticFeedbackEnabled && 'vibrate' in navigator) {
          navigator.vibrate(50);
        }
      }, { passive: false });

      element.addEventListener('touchend', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        const touchId = touch.identifier;
        const controls = this.touchControls.get(touchId);
        if (controls) {
          controls.forEach(control => this.nostalgist?.pressUp(control));
          this.touchControls.delete(touchId);
          element.classList.remove('active');
        }
      }, { passive: false });

      element.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        const touchId = touch.identifier;
        const controls = this.touchControls.get(touchId);
        if (controls) {
          controls.forEach(control => this.nostalgist?.pressUp(control));
          this.touchControls.delete(touchId);
          element.classList.remove('active');
        }
      }, { passive: false });

      element.addEventListener('mousedown', () => {
        this.nostalgist?.pressDown(joypadIndex);
        element.classList.add('active');
      });

      const handleMouseUp = () => {
        this.nostalgist?.pressUp(joypadIndex);
        element.classList.remove('active');
      };

      element.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('mouseup', (event) => {
        if (event.target !== element) {
          handleMouseUp();
        }
      });
    };

    addPressReleaseEvents("start", "start");
    addPressReleaseEvents("select", "select");
    if (this.isSnesGame()) {
      addPressReleaseEvents("a", "a");
      addPressReleaseEvents("b", "b");
      addPressReleaseEvents("x", "x");
      addPressReleaseEvents("y", "y");
    } else {
      addPressReleaseEvents("a", "a");
      addPressReleaseEvents("b", "b");
    }
    if (this.isSegaGame()) {
      addPressReleaseEvents("c", "c");
    }
    if (this.isSnesGame() || this.isGbaGame() || this.isSegaGame()) {
      addPressReleaseEvents("l", "l");
      addPressReleaseEvents("r", "r");
    }
    addPressReleaseEvents("up", "up");
    addPressReleaseEvents("down", "down");
    addPressReleaseEvents("left", "left");
    addPressReleaseEvents("right", "right");
    // add diagonal directional listeners only if dpad elements exist (not using joystick)
    const ur = document.getElementsByClassName('up-right')[0] as HTMLElement | undefined;
    const ul = document.getElementsByClassName('up-left')[0] as HTMLElement | undefined;
    const dl = document.getElementsByClassName('down-left')[0] as HTMLElement | undefined;
    const dr = document.getElementsByClassName('down-right')[0] as HTMLElement | undefined;
    if (!this.useJoystick) {
      if (ur) this.addDirectionalListeners(ur, "up", "right");
      if (ul) this.addDirectionalListeners(ul, "up", "left");
      if (dl) this.addDirectionalListeners(dl, "down", "left");
      if (dr) this.addDirectionalListeners(dr, "down", "right");
    }

    // If joystick mode is enabled, initialize joystick listeners
    if (this.useJoystick) {
      this.setupJoystick();
    } else {
      this.teardownJoystick();
    }
  }

  addDirectionalListeners(element: HTMLElement, direction: string, secondaryDirection?: string) {
    const directions = [direction];
    if (secondaryDirection) directions.push(secondaryDirection);

    element.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const touchId = touch.identifier;
      this.touchControls.set(touchId, directions);
      directions.forEach(dir => this.nostalgist?.pressDown(dir));
      element.classList.add('active');
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    }, { passive: false });

    element.addEventListener('touchend', (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const touchId = touch.identifier;
      const controls = this.touchControls.get(touchId);
      if (controls) {
        controls.forEach(control => this.nostalgist?.pressUp(control));
        this.touchControls.delete(touchId);
        element.classList.remove('active');
      }
    }, { passive: false });

    element.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const touchId = touch.identifier;
      const controls = this.touchControls.get(touchId);
      if (controls) {
        controls.forEach(control => this.nostalgist?.pressUp(control));
        this.touchControls.delete(touchId);
        element.classList.remove('active');
      }
    }, { passive: false });

    const pressDown = (primaryDirection: string, secondaryDirection?: string) => {
      this.nostalgist?.pressDown(primaryDirection);
      if (secondaryDirection) {
        this.nostalgist?.pressDown(secondaryDirection);
      }
    };

    const pressUp = (primaryDirection: string, secondaryDirection?: string) => {
      this.nostalgist?.pressUp(primaryDirection);
      if (secondaryDirection) {
        this.nostalgist?.pressUp(secondaryDirection);
      }
    };

    const handleMouseDown = () => {
      pressDown(direction, secondaryDirection);
      element.classList.add('active');
    };

    const handleMouseUp = () => {
      pressUp(direction, secondaryDirection);
      element.classList.remove('active');
    };

    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseup', (event) => {
      if (event.target === element) {
        handleMouseUp();
      }
    });
  }

  overrideGetUserMedia() {
    if (navigator && navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        console.warn("getUserMedia request blocked");
        return Promise.reject(new Error("Webcam access is blocked."));
      };
    }
  }

  async toggleFullscreen() {
    this.closeMenuPanel();
    const elem = this.fullscreenContainer.nativeElement;
    const canvas = this.nostalgist?.getCanvas();
    if (!this.isFullScreen) {
      if (this.onMobile()) {
        if (!this.showControls) {
          this.unlockedCanvas = true;
        }
        await elem.requestFullscreen();
      } else {
        this.unlockedCanvas = true;
        await canvas!.requestFullscreen();
      }
      if (this.showControls) {
        const controls = document.querySelector('.controls') as HTMLElement;
        if (controls) controls.style.visibility = 'visible';
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        this.unlockedCanvas = false;
      }
    }
  }

  getAllowedFileTypes(): string[] {
    return this.fileService.romFileExtensions;
  }

  get keybindingEntriesList() {
    return Object.entries(this.keybindings);
  }

  getKeybinding(action: string): string {
    return this.keybindings[action] || this.defaultKeybindings[action] || 'Unbound';
  }

  showMenuPanel() {
    if (this.isMenuPanelOpen) {
      this.closeMenuPanel();
      return;
    }
    this.isMenuPanelOpen = true;
    if (this.parentRef) {
      this.parentRef.showOverlay();
    }
    this.touchControls.forEach((controls) => {
      controls.forEach(control => this.nostalgist?.pressUp(control));
    });
    this.touchControls.clear();
  }

  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    if (this.parentRef) {
      this.parentRef.closeOverlay();
    }
    setTimeout(() => {
      if (this.selectedRomName) {
        this.controlsSet = false;
        this.setHTMLControls();
      }
    }, 3);
  }

  shareLink() {
    const link = `https://bughosted.com/Emulator`;
    try {
      navigator.clipboard.writeText(link);
      this.parentRef?.showNotification(`${link} copied to clipboard!`);
    } catch {
      this.parentRef?.showNotification("Error: Unable to share link!");
      console.log("Error: Unable to share link!");
    }
    this.closeMenuPanel();
  }
}