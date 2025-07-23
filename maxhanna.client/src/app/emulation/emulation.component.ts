import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
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
  soundOn = false;
  lastSaved?: Date;
  currentFileType = ''; 
  isSearchVisible = true;
  isFullScreen = false;
  showControls = this.onMobile();
  private currentKeyListeners: { type: string; listener: EventListener }[] = [];
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

  constructor(private romService: RomService, private fileService: FileService) {
    super();
  }

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
  }

  async ngOnDestroy() {
    await this.stopEmulator().then(async () => {
      this.isLoading = false;
      this.nostalgist = undefined;
      this.parentRef?.setViewportScalability(true);
      this.parentRef?.removeResizeListener();
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
    formData.append('files', res?.state!, this.fileService.getFileWithoutExtension(this.selectedRomName) + ".sav");
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
    this.closeMenuPanel();
  }

  async loadState() {
    if (!this.selectedRomName) return alert("You must select a rom to do that");
    const romSaveFile = this.fileService.getFileWithoutExtension(this.selectedRomName) + ".sav";
    const saveStateResponse = await this.romService.getRomFile(romSaveFile, this.parentRef?.user?.id);
    await this.nostalgist?.loadState(saveStateResponse!);
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
    if (!this.soundOn) {
      this.nostalgist?.sendCommand("MUTE");
    } else {
      this.nostalgist?.sendCommand("MUTE");
    }
    this.soundOn = !this.soundOn;
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
      const element = document.getElementsByClassName(elementClass)[0];
      if (!element) return;
      if (this.elementListenerMap.get(element)) {
        return;
      }
      this.elementListenerMap.set(element, true);
      element.addEventListener("mousedown", () => {
        this.nostalgist?.pressDown(joypadIndex);
      });
      const handleMouseUp = () => {
        this.nostalgist?.pressUp(joypadIndex);
      };
      element.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("mouseup", (event) => {
        if (event.target !== element) {
          handleMouseUp();
        }
      });
      element.addEventListener("touchstart", (e) => {
        e.preventDefault();
        this.nostalgist?.pressDown(joypadIndex);
      }, { passive: false });
      element.addEventListener("touchend", (e) => {
        e.preventDefault();
        this.nostalgist?.pressUp(joypadIndex);
        element.classList.remove('active');
      }, { passive: false });
      let startX: number, startY: number;
      element.addEventListener("touchstart", (e) => {
        startX = (e as TouchEvent).touches[0].clientX;
        startY = (e as TouchEvent).touches[0].clientY;
        element.classList.add('active');
      });
      element.addEventListener("touchmove", (e) => {
        e.preventDefault();
        const touchEvent = e as TouchEvent;
        const touch = touchEvent.touches[0];
        const currentX = touch.clientX;
        const currentY = touch.clientY;
        const deltaX = currentX - startX;
        const deltaY = currentY - startY;
        const threshold = 10;
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          if (deltaX > threshold) {
            this.nostalgist!.pressDown('right');
          } else if (deltaX < -threshold) {
            this.nostalgist!.pressDown('left');
          }
        } else {
          if (deltaY > threshold) {
            this.nostalgist!.pressDown('down');
          } else if (deltaY < -threshold) {
            this.nostalgist!.pressDown('up');
          }
        }
      }, { passive: false });
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
    this.addDirectionalListeners(document.getElementsByClassName('up-right')[0] as HTMLElement, "up", "right");
    this.addDirectionalListeners(document.getElementsByClassName('up-left')[0] as HTMLElement, "up", "left");
    this.addDirectionalListeners(document.getElementsByClassName('down-left')[0] as HTMLElement, "down", "left");
    this.addDirectionalListeners(document.getElementsByClassName('down-right')[0] as HTMLElement, "down", "right");
  }

  addDirectionalListeners(element: HTMLElement, direction: string, secondaryDirection?: string) {
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
    const handleMouseDownOrTouchStart = (e: Event) => {
      e.preventDefault();
      pressDown(direction, secondaryDirection);
    };
    const handleMouseUpOrTouchEnd = (e: Event) => {
      e.preventDefault();
      pressUp(direction, secondaryDirection);
    };
    element.addEventListener("mousedown", handleMouseDownOrTouchStart);
    element.addEventListener("touchstart", handleMouseDownOrTouchStart, { passive: false });
    document.addEventListener("mouseup", (event) => {
      if (event.target === element) {
        handleMouseUpOrTouchEnd(event);
      }
    });
    document.addEventListener("touchend", (event) => {
      if ((event as TouchEvent).target === element) {
        handleMouseUpOrTouchEnd(event);
      }
    }, { passive: false });
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
    const controls = document.getElementsByClassName('controls')[0];
    const nintendo = document.getElementsByClassName('nintendo')[0] as HTMLDivElement;
    const startSelect = document.getElementsByClassName('start-select')[0];
    // if (this.onMobile()) {
    //   controls.classList.toggle('fullscreenControlsBottom');
    //   startSelect.classList.toggle('fullscreenControlsTop');
    // }
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

      // Ensure controls are visible in fullscreen if they should be
      if (this.showControls) {
        const controls = document.querySelector('.controls') as HTMLElement;
        if (controls) {
          controls.style.visibility = 'visible';
        }
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