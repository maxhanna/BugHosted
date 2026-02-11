import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { UserService } from '../../services/user.service';
import { Nostalgist } from 'nostalgist';
import { ChildComponent } from '../child.component';
import { RomService } from '../../services/rom.service';
import { FileService } from '../../services/file.service';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { FileSearchComponent } from '../file-search/file-search.component';
import { PadBind } from '../../services/datacontracts/emulation/PadBind';

@Component({
  selector: 'app-emulation',
  templateUrl: './emulation.component.html',
  styleUrl: './emulation.component.css',
  standalone: false
})
export class EmulationComponent extends ChildComponent implements OnInit, OnDestroy {
  @ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('localFileOpen') localFileOpen!: ElementRef<HTMLInputElement>;
  @ViewChild('loadRomSelect') loadRomSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('fullscreenContainer') fullscreenContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('stopButton') stopButton!: ElementRef<HTMLButtonElement>;
  @ViewChild(FileSearchComponent) fileSearchComponent?: FileSearchComponent;

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
  isMenuPanelOpen = false;
  selectedRomName?: string;
  selectedRomFileEntry?: FileEntry;
  nostalgist: Nostalgist | undefined;
  elementListenerMap = new WeakMap<Element, boolean>();
  keyboardCaptureEnabled = false;
  private connectedPads = new Map<number, Gamepad>();
  private gamepadPollTimer?: number;
  private touchControls: Map<number, string[]> = new Map();
  private _padNotifyTimer?: number;
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
  autosaveIntervalTime: number = 180000;
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
  private registeredListeners: Array<{ elem: EventTarget, type: string, fn: EventListenerOrEventListenerObject }> = [];
  private _prevGetUserMedia: typeof navigator.mediaDevices.getUserMedia | undefined;
  private gamepadMonitoringActive = false;
  showControllerPadBindings = false;
  bindingPlayer = 1;
  // Per-player, per-action bindings
  private padBindings: Record<number, Record<string, PadBind>> = {};
  // Listener runtime state
  private padListen?: { player: number; action: string; raf?: number; startedAt: number; prev?: Gamepad[] };
  private _lastPadCountNotified = -1;

  private addRegisteredListener(elem: EventTarget, type: string, fn: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions, uniqueBy: 'elem-type-fn' | 'elem-type' = 'elem-type-fn') {
    const exists = this.registeredListeners.some(l => {
      if (l.elem !== elem) return false;
      if (l.type !== type) return false;
      if (uniqueBy === 'elem-type') return true;
      return l.fn === fn;
    });
    if (exists) return;
    try {
      (elem as any).addEventListener(type, fn, options);
      this.registeredListeners.push({ elem, type, fn });
    } catch (e) { }
  }

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
    this.enableGamepadMonitoringScoped();


    const fullscreenHandler: EventListener = () => {
      if (!document.fullscreenElement) {
        this.canvas.nativeElement.style.height = (this.onMobile() ? '60vh' : '100vh');
        console.log("set canvas height: " + this.canvas.nativeElement.style.height);
      }
      this.isFullScreen = !this.isFullScreen;
    };
    this.addRegisteredListener(document, 'fullscreenchange', fullscreenHandler as EventListener);
    this.parentRef?.setViewportScalability(false);
    this.parentRef?.addResizeListener();
    // Load user mute setting
    const uid = this.parentRef?.user?.id;
    if (uid) {
      this.userService.getUserSettings(uid).then(s => {
        if (s && typeof s.muteMusicEmulator === 'boolean') {
          this.soundOn = !s.muteMusicEmulator; // soundOn true means not muted
        }
      }).catch(() => { });
    }
  }

  async ngOnDestroy() {
    try {
      await this.stopEmulator();
    } catch (ex) {
      console.warn('stopEmulator failed during destroy', ex);
    } finally {
      this.disableGamepadMonitoring();
      this.stopLoading();
      this.nostalgist = undefined;
      this.parentRef?.setViewportScalability(true);
      this.parentRef?.removeResizeListener();
      // Release all inputs
      this.touchControls.forEach((controls) => {
        controls.forEach(control => this.nostalgist?.pressUp(control));
      });
      this.touchControls.clear();

      // Remove any registered event listeners
      for (const l of this.registeredListeners) {
        try {
          (l.elem as any).removeEventListener(l.type, l.fn as EventListener);
        } catch (e) { }
      }
      this.registeredListeners = [];

      // teardown joystick listeners if any remain
      try { this.teardownJoystick(); } catch (e) { }

      // reset element listener tracking
      this.elementListenerMap = new WeakMap<Element, boolean>();

      // restore getUserMedia if we overrode it
      try {
        if (this._prevGetUserMedia && navigator && navigator.mediaDevices) {
          navigator.mediaDevices.getUserMedia = this._prevGetUserMedia;
        }
      } catch (e) { }
    }
  }


  setupEventListeners() {
    const isTextInputTarget = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return true;
      // Editable DIVs (search bars, rich text, etc.)
      if ((el as HTMLElement).isContentEditable) return true;
      // If the target is inside an input/textarea/contentEditable parent
      return !!el.closest('input, textarea, [contenteditable="true"]');
    };

    const keyDownForBinding: EventListener = (event) => {
      const e = event as KeyboardEvent;

      // Let rebind UI capture regardless of captureEnabled
      if (this.waitingForKey) {
        e.preventDefault();
        const newKey = e.key;
        this.keybindings[this.waitingForKey] = newKey;
        this.waitingForKey = null;
        this.parentRef?.showNotification(`Bound to "${newKey}"`);
        return;
      }

      // If we are not actively playing a ROM, or user is typing in a field, do nothing
      if (!this.keyboardCaptureEnabled || isTextInputTarget(e.target)) return;

      const pressedKey = e.key;
      const action = Object.entries(this.keybindings).find(([_, val]) => val === pressedKey)?.[0];
      if (action) {
        this.nostalgist?.pressDown(action);
        e.preventDefault();
      }
    };
    this.addRegisteredListener(document, 'keydown', keyDownForBinding as EventListener);

    const keyUpHandler: EventListener = (event) => {
      const e = event as KeyboardEvent;

      // Only handle key-up if capture is active (rebinding doesn't need keyup)
      if (!this.keyboardCaptureEnabled || isTextInputTarget(e.target)) return;

      const releasedKey = e.key;
      const action = Object.entries(this.keybindings).find(([_, val]) => val === releasedKey)?.[0];
      if (action) {
        this.nostalgist?.pressUp(action);
        e.preventDefault();
      }
    };
    this.addRegisteredListener(document, 'keyup', keyUpHandler as EventListener);

    const escapeHandler: EventListener = (event) => {
      const k = (event as KeyboardEvent).key;
      if (k === 'Escape' || k === 'Esc') {
        if (this.isFullScreen) {
          this.toggleFullscreen();
        }
      }
    };
    this.addRegisteredListener(document, 'keydown', escapeHandler as EventListener);
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
    this.keyboardCaptureEnabled = false;
    this.isSearchVisible = true;
    this.enableGamepadMonitoringScoped();
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
    this.selectedRomFileEntry = file;

    const romSaveFile = this.fileService.getFileWithoutExtension(file.fileName ?? "") + ".sav";
    this.selectedRomName = file.fileName ?? "";
    const saveStateResponse = await this.romService.getRomFile(romSaveFile, this.parentRef?.user?.id);
    const response = await this.romService.getRomFile(file.fileName ?? "", this.parentRef?.user?.id, file.id);
    const fileType = this.currentFileType = file?.fileType ?? this.fileService.getFileExtension(file?.fileName!);

    const style = {
      backgroundColor: 'unset',
      zIndex: '1',
      height: (this.onMobile() ? '60vh' : '100vh'),
      width: (this.onMobile() ? '97vw' : '100vw')
    };
    const core = this.coreMapping[fileType.toLowerCase()] || 'default_core';

    // NEW: Build dynamic controller → port mapping before launching
    const portConfig = this.buildRetroArchPortsConfig(4);

    // NEW: merge per-player pad bindings to retroarchConfig
    const padRebindConfig = this.getRetroarchPadConfigForAllPlayers();

    this.nostalgist = await Nostalgist.launch({
      core,
      rom: { fileName: this.selectedRomName, fileContent: response! },
      style,
      element: this.canvas.nativeElement,
      state: saveStateResponse != null ? saveStateResponse : undefined,
      runEmulatorManually: true,
      retroarchConfig: {
        ...portConfig,
        ...padRebindConfig,
      }
    });


    await this.nostalgist.launchEmulator();
    setTimeout(() => { if (!this.soundOn) this.nostalgist?.sendCommand('MUTE'); }, 1);
    this.keyboardCaptureEnabled = true;
    this.setHTMLControls();
    this.setupAutosave();
    this.disableGamepadMonitoringScoped();
    this.runStartMs = Date.now();
    this.stopLoading();

    // Optional: small toast with how many controllers were seen
    const pads = this.getConnectedGamepads();
    if (pads.length > 0) {
      this.parentRef?.showNotification?.(`Controllers ready: ${pads.length} detected`);
    }
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
      this.userService.updateComponentMute(this.parentRef.user.id, 'emulator', true, muted).catch(() => { console.log("failed to update emulator mute setting"); });
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

  isGbGame(): boolean {
    const ft = this.currentFileType.toLowerCase().trim();
    return this.gameboyFileTypes.includes(ft);
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

      const touchStart = (e: TouchEvent) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        const touchId = touch.identifier;
        this.touchControls.set(touchId, [joypadIndex]);
        this.nostalgist?.pressDown(joypadIndex);
        element.classList.add('active');
        if (this.hapticFeedbackEnabled && 'vibrate' in navigator) {
          navigator.vibrate(50);
        }
      };
      this.addRegisteredListener(element, 'touchstart', touchStart as EventListener, { passive: false });

      const touchEnd = (e: TouchEvent) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        const touchId = touch.identifier;
        const controls = this.touchControls.get(touchId);
        if (controls) {
          controls.forEach(control => this.nostalgist?.pressUp(control));
          this.touchControls.delete(touchId);
          element.classList.remove('active');
        }
      };
      this.addRegisteredListener(element, 'touchend', touchEnd as EventListener, { passive: false });

      const touchCancel = (e: TouchEvent) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        const touchId = touch.identifier;
        const controls = this.touchControls.get(touchId);
        if (controls) {
          controls.forEach(control => this.nostalgist?.pressUp(control));
          this.touchControls.delete(touchId);
          element.classList.remove('active');
        }
      };
      this.addRegisteredListener(element, 'touchcancel', touchCancel as EventListener, { passive: false });

      const mouseDown = () => {
        this.nostalgist?.pressDown(joypadIndex);
        element.classList.add('active');
      };
      this.addRegisteredListener(element, 'mousedown', mouseDown as EventListener);

      const handleMouseUp = () => {
        this.nostalgist?.pressUp(joypadIndex);
        element.classList.remove('active');
      };
      this.addRegisteredListener(element, 'mouseup', handleMouseUp as EventListener);

      const docMouseUp = (event: MouseEvent) => {
        if (event.target !== element) {
          handleMouseUp();
        }
      };
      this.addRegisteredListener(document, 'mouseup', docMouseUp as EventListener, undefined, 'elem-type');
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


    const touchStart = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const touchId = touch.identifier;
      this.touchControls.set(touchId, directions);
      directions.forEach(dir => this.nostalgist?.pressDown(dir));
      element.classList.add('active');
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    };
    this.addRegisteredListener(element, 'touchstart', touchStart as EventListener, { passive: false });

    const touchEnd = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const touchId = touch.identifier;
      const controls = this.touchControls.get(touchId);
      if (controls) {
        controls.forEach(control => this.nostalgist?.pressUp(control));
        this.touchControls.delete(touchId);
        element.classList.remove('active');
      }
    };
    this.addRegisteredListener(element, 'touchend', touchEnd as EventListener, { passive: false });

    const touchCancel = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const touchId = touch.identifier;
      const controls = this.touchControls.get(touchId);
      if (controls) {
        controls.forEach(control => this.nostalgist?.pressUp(control));
        this.touchControls.delete(touchId);
        element.classList.remove('active');
      }
    };
    this.addRegisteredListener(element, 'touchcancel', touchCancel as EventListener, { passive: false });

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

    this.addRegisteredListener(element, 'mousedown', handleMouseDown as EventListener);
    this.addRegisteredListener(element, 'mouseup', handleMouseUp as EventListener);

    const docMouseUp = (event: MouseEvent) => {
      if (event.target === element) {
        handleMouseUp();
      }
    };
    this.addRegisteredListener(document, 'mouseup', docMouseUp as EventListener, undefined, 'elem-type');
  }

  overrideGetUserMedia() {
    if (navigator && navigator.mediaDevices) {
      try {
        this._prevGetUserMedia = navigator.mediaDevices.getUserMedia;
      } catch (e) { }
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
    let baseTypes = this.fileService.romFileExtensions;
    baseTypes = baseTypes.filter(x => !this.fileService.n64FileExtensions.includes(x));
    baseTypes = baseTypes.filter(x => !this.fileService.ps1FileExtensions.includes(x));
    return baseTypes;
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
    this.enableGamepadMonitoringScoped();
    this.touchControls.forEach((controls) => {
      controls.forEach(control => this.nostalgist?.pressUp(control));
    });
    this.touchControls.clear();
    this.keyboardCaptureEnabled = false;
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
    if (this.selectedRomName) {
      this.keyboardCaptureEnabled = true;
      this.disableGamepadMonitoringScoped();
    }
    this.showControllerPadBindings = false;
  }

  isSimpleDpadGame(): boolean {
    return !this.isSegaGame();
  }

  getRomName() {
    return this.fileService.getFileWithoutExtension(this.selectedRomName || '');
  }

  async rescanControllersAndRebind(maxPlayers = 4) {
    // Briefly enable monitoring to see new pads
    this.enableGamepadMonitoringScoped();
    // Apply by quick restart (preserves progress if you also call saveState) 
    if (this.selectedRomFileEntry && this.selectedRomName) {
      if (this.autosave) {
        await this.saveState(true);
      }
      await this.stopEmulator();
      await this.loadRom(this.selectedRomFileEntry);
    }
    // Back to lean mode
    this.disableGamepadMonitoringScoped();
  }

  // Optional: expose a quick read of connected pads (sorted by index)
  getConnectedGamepads(): Gamepad[] {
    // Some browsers leave nulls in navigator.getGamepads(); filter them out and skip audio-like devices
    const pads = (navigator.getGamepads?.() || []).filter((p): p is Gamepad => !!p && !this.isLikelyAudioDeviceId(p.id));
    // Keep our map in sync (covers cases where 'gamepadconnected' isn't fired reliably)
    this.connectedPads.clear();
    for (const p of pads) this.connectedPads.set(p.index, p);
    return pads.sort((a, b) => a.index - b.index);
  }

  /**
   * Builds a RetroArch ports config from currently connected gamepads.
   * For example:
   *   input_player1_joypad_index = "0"
   *   input_player2_joypad_index = "1"
   *   ...
   * RetroArch will then use those physical pad indices for each player port.
   * If there are fewer pads than players, those ports fall back to keyboard/onscreen.
   */
  private buildRetroArchPortsConfig(maxPlayers = 4): Record<string, string> {
    const pads = this.getConnectedGamepads();
    const cfg: Record<string, string> = {};
    for (let p = 1; p <= maxPlayers; p++) {
      const pad = pads[p - 1];
      if (pad) {
        // Important: use the physical Gamepad.index as the joypad index for this port
        cfg[`input_player${p}_joypad_index`] = String(pad.index);
      }
    }
    return cfg;
  }

  /** Enable listeners + (optional) poller – idempotent. */
  private enableGamepadMonitoringScoped() {
    if (this.gamepadMonitoringActive) return;
    this.gamepadMonitoringActive = true;
    this.enableGamepadMonitoring(); // your existing function
  }

  /** Disable listeners + poller – idempotent. */
  private disableGamepadMonitoringScoped() {
    if (!this.gamepadMonitoringActive) return;
    this.gamepadMonitoringActive = false;
    this.disableGamepadMonitoring(); // your existing function
  }

  /** Start listening for Gamepad connect/disconnect and keep a small poll as fallback. */

  private enableGamepadMonitoring() {
    const addPad = (gp: Gamepad) => {
      if (this.isLikelyAudioDeviceId(gp.id)) return; // ignore likely audio devices
      this.connectedPads.set(gp.index, gp);
      this.scheduleControllerCountNotification(); // debounce instead of immediate toast
    };

    const removePad = (idx: number) => {
      this.connectedPads.delete(idx);
      this.scheduleControllerCountNotification(); // debounce instead of immediate toast
    };

    // Events
    window.addEventListener('gamepadconnected', (e: Event) => {
      const ev = e as GamepadEvent;
      if (ev.gamepad) { 
        addPad(ev.gamepad); 
      }
    });
    window.addEventListener('gamepaddisconnected', (e: Event) => {
      const ev = e as GamepadEvent;
      if (ev.gamepad) { 
        removePad(ev.gamepad.index); 
      }
    });

    // Fallback poll
    this.gamepadPollTimer = window.setInterval(() => {
      const seen = new Set<number>();
      for (const gp of (navigator.getGamepads?.() || [])) {
        if (!gp) continue;
        if (this.isLikelyAudioDeviceId(gp.id)) continue; // skip audio/headset devices
        seen.add(gp.index);
        if (!this.connectedPads.has(gp.index)) {
          this.connectedPads.set(gp.index, gp);
        }
      }

      let changed = false;
      for (const idx of [...this.connectedPads.keys()]) {
        if (!seen.has(idx)) {
          this.connectedPads.delete(idx);
          changed = true;
        }
      }

      // If anything changed in this tick, schedule a single coalesced toast
      if (changed) {
        this.scheduleControllerCountNotification();
      }
    }, 1000);
  }


  /** Stop the poller (call in ngOnDestroy). */
  private disableGamepadMonitoring() {
    if (this.gamepadPollTimer) {
      clearInterval(this.gamepadPollTimer);
      this.gamepadPollTimer = undefined;
    }
    if (this._padNotifyTimer) {
      clearTimeout(this._padNotifyTimer);
      this._padNotifyTimer = undefined;
    }
    this._lastPadCountNotified = -1;
  }
 // Heuristic: exclude audio/headset/speaker devices from being treated as gamepads
  private isLikelyAudioDeviceId(id?: string | null): boolean {
    if (!id) return false;
    try {
      const s = id.toLowerCase();
      const bad = [
        'poly', 'bt700', 'headset', 'headphone', 'audio', 'hands-free', 'handsfree',
        'speaker', 'earbud', 'earbuds', 'earphone', 'airpod'
      ];
      return bad.some(k => s.includes(k));
    } catch {
      return false;
    }
  }
  // Returns the currently active system and its relevant actions to rebind.
  // We trim to only what matters for the selected ROM/core.
  getActionsForSystem(): string[] {
    // NES: dpad + A/B + Select/Start
    if (this.currentFileType && ['nes'].includes(this.currentFileType.toLowerCase())) {
      return ['up', 'down', 'left', 'right', 'a', 'b', 'select', 'start'];
    }
    // SNES: dpad + A/B/X/Y + L/R + Select/Start
    if (this.isSnesGame()) {
      return ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'l', 'r', 'select', 'start'];
    }
    // Genesis/Mega Drive: 3-button default (A/B/C + Start).
    // If you want to expose 6-button, add: 'x','y','z','mode'
    if (this.isSegaGame()) {
      return ['up', 'down', 'left', 'right', 'a', 'b', 'c', 'start'];
    }
    // GBA: dpad + A/B + L/R + Start/Select
    if (this.isGbaGame()) {
      return ['up', 'down', 'left', 'right', 'a', 'b', 'l', 'r', 'select', 'start'];
    }
    // GB/GBC: dpad + A/B + Start/Select
    if (this.isGbGame()) {
      return ['up', 'down', 'left', 'right', 'a', 'b', 'select', 'start'];
    }
    // Default fallback: dpad + A/B + Start/Select
    return ['up', 'down', 'left', 'right', 'a', 'b', 'select', 'start'];
  }

  // Human-readable label for a binding
  getPadBindingLabel(player: number, action: string): string {
    const b = this.padBindings[player]?.[action];
    if (!b) return 'Set';
    return b.type === 'btn' ? `Button ${b.index}` : `Axis ${b.index} ${b.sign}`;
  }

  hasPadBinding(player: number, action: string) {
    return !!this.padBindings[player]?.[action];
  }

  clearPadBinding(player: number, action: string) {
    if (this.padBindings[player]) delete this.padBindings[player][action];
  }

  resetControllerBindings(player: number) {
    this.padBindings[player] = {};
  }

  // Is any listener active for this action?
  isListening(action: string) {
    return this.padListen?.action === action;
  }

  // Start a one-shot capture: first pressed button or significant axis motion becomes the binding.
  listenForPad(player: number, action: string) {
    // Ensure our monitoring is on while listening
    this.enableGamepadMonitoringScoped();

    if (this.padListen?.raf) cancelAnimationFrame(this.padListen.raf);
    this.padListen = { player, action, startedAt: performance.now(), prev: (navigator.getGamepads?.() || []).slice() as Gamepad[] };

    const DEADZONE = 0.45;    // axis threshold
    const TIMEOUT_MS = 6000;  // safety timeout

    const step = () => {
      const now = performance.now();
      if (!this.padListen || now - this.padListen.startedAt > TIMEOUT_MS) {
        this.padListen = undefined;
        return;
      }
      const prev = this.padListen.prev || [];
      const cur = (navigator.getGamepads?.() || []).slice() as Gamepad[];

      // Scan all pads for first edge (button down) or axis threshold
      for (const gp of cur) {
        if (!gp) continue;

        // Buttons: look for first rising edge
        for (let i = 0; i < gp.buttons.length; i++) {
          const was = prev[gp.index]?.buttons?.[i]?.pressed ?? false;
          const is = gp.buttons[i].pressed;
          if (!was && is) {
            this.setPadBinding(player, action, { type: 'btn', index: i });
            this.padListen = undefined;
            return;
          }
        }
        // Axes: look for magnitude over threshold from near-zero
        for (let i = 0; i < gp.axes.length; i++) {
          const prevVal = Math.abs(prev[gp.index]?.axes?.[i] ?? 0);
          const curVal = gp.axes[i];
          if (prevVal < 0.15 && Math.abs(curVal) >= DEADZONE) {
            const sign: '+' | '-' = curVal >= 0 ? '+' : '-';
            this.setPadBinding(player, action, { type: 'axis', index: i, sign });
            this.padListen = undefined;
            return;
          }
        }
      }

      this.padListen.prev = cur;
      this.padListen.raf = requestAnimationFrame(step);
    };

    this.padListen.raf = requestAnimationFrame(step);
  }

  private setPadBinding(player: number, action: string, bind: PadBind) {
    if (!this.padBindings[player]) this.padBindings[player] = {};
    this.padBindings[player][action] = bind;
    this.parentRef?.showNotification?.(`P${player} ${action.toUpperCase()} → ${this.getPadBindingLabel(player, action)}`);
  }

  /**
   * Build RetroArch config keys from our padBindings:
   *  - buttons → input_player{n}_{action}_btn = "<index>"
   *  - axes    → input_player{n}_{action}_axis = "<+/-index>"
   *
   * RetroArch consumes these keys at launch. See the default retroarch.cfg for input_* fields. 
   */
  private getRetroarchPadConfigForAllPlayers(): Record<string, string> {
    const cfg: Record<string, string> = {};
    for (const pStr of Object.keys(this.padBindings)) {
      const p = Number(pStr);
      const actions = this.padBindings[p];
      for (const [action, b] of Object.entries(actions)) {
        const keyBase = `input_player${p}_${action}`;
        if (b.type === 'btn') {
          cfg[`${keyBase}_btn`] = String(b.index);
        } else {
          cfg[`${keyBase}_axis`] = `${b.sign}${b.index}`;
        }
      }
    }
    return cfg;
  }

  /**
   * Apply the bindings by restarting the current ROM with an extended retroarchConfig.
   */
  async applyPadBindingsAndRestart() {
    this.showControllerPadBindings = false;
    if (!this.selectedRomName) return;
    try { await this.saveState(true); } catch { }
    const file: FileEntry = { fileName: this.selectedRomName, fileType: this.currentFileType } as any;
    await this.stopEmulator();
    await this.loadRom(file); // loadRom already merges our pad config (see change below)
    this.closeMenuPanel();
  }

  onBindingPlayerChange(ev: Event) {
    const target = ev.target as HTMLSelectElement | null;
    if (!target) return;
    this.bindingPlayer = Number(target.value) || 1;
  }

  /** Show a single toast with the current number of connected controllers. */
  private notifyControllerCount() {
    const count = this.connectedPads.size;
    if (count === this._lastPadCountNotified) return; // no change → no toast
    this._lastPadCountNotified = count;

    const msg = count === 0
      ? 'No controllers connected'
      : count === 1
        ? '1 controller connected'
        : `${count} controllers connected`;

    this.parentRef?.showNotification?.(msg);
  }

  // Schedule one toast after a short delay, coalescing bursts of changes
  private scheduleControllerCountNotification(delay = 200) {
    if (this._padNotifyTimer) {
      clearTimeout(this._padNotifyTimer);
    }
    this._padNotifyTimer = window.setTimeout(() => {
      this._padNotifyTimer = undefined;
      this.notifyControllerCount(); // uses _lastPadCountNotified to avoid dupes
    }, delay);
  }

  finishFileUploading() {
    this.fileSearchComponent?.getDirectory();
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