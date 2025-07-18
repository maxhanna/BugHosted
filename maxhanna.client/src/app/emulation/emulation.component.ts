import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Nostalgist } from 'nostalgist'
import { ChildComponent } from '../child.component';
import { RomService } from '../../services/rom.service';
import { FileService } from '../../services/file.service';
import { FileEntry } from '../../services/datacontracts/file/file-entry';

@Component({
    selector: 'app-emulation',
    templateUrl: './emulation.component.html',
    styleUrl: './emulation.component.css',
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
  displayAB = true;
  displayC = true;
  isSearchVisible = true;
  isFullScreen = false;
  showControls = this.onMobile();
  readonly coreMapping: { [key: string]: string } = {
    'gba': 'mgba',               // Game Boy Advance
    'gbc': 'mgba',           // Game Boy Color
    'gb': 'mgba',            // Game Boy
    'nes': 'fceumm',             // Nintendo Entertainment System
    'sfc': 'snes9x',             // Super Famicom
    'smc': 'snes9x',             // Super Nintendo (alternate extension)
    'snes': 'snes9x',            // Super Nintendo
    'vb': 'mednafen_vb',         // Virtual Boy
    'ws': 'mednafen_wswan',      // WonderSwan
    'wsc': 'mednafen_wswan',     // WonderSwan Color

    // Sega
    'gen': 'genesis_plus_gx',    // Sega Genesis / Mega Drive
    'md': 'genesis_plus_gx',     // Sega Mega Drive (alternate extension)
    'smd': 'genesis_plus_gx',    // Sega Genesis / Mega Drive
    '32x': 'genesis_plus_gx',    // Sega 32X
    'sms': 'genesis_plus_gx',    // Sega Master System
    'gg': 'genesis_plus_gx',     // Sega Game Gear

    // PC Engine / TurboGrafx
    'pce': 'mednafen_pce_fast',  // PC Engine / TurboGrafx-16
    'sgx': 'mednafen_supergrafx',// SuperGrafx

    // Neo Geo Pocket
    'ngp': 'mednafen_ngp',       // Neo Geo Pocket
    'ngpc': 'mednafen_ngp',      // Neo Geo Pocket Color

    // Arcade (FBA/MAME)
    'zip': 'mame2003_plus',      // Arcade ZIP (fallback to MAME 2003 Plus)
    'fba': 'fbalpha2012',        // Final Burn Alpha general
    'fba_cps1': 'fbalpha2012_cps1', // Capcom CPS1
    'fba_cps2': 'fbalpha2012_cps2', // Capcom CPS2
    'fba_neogeo': 'fbalpha2012_neogeo', // Neo Geo
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
  oldCanvasWidth = 0;
  oldCanvasHeight = 0;
  oldSpeakerDisplay = '';
  controlsSet = false;
  showHelpText =  false;
  autosaveInterval: any;
  autosaveIntervalTime: number = 60000; // 1 minute in milliseconds
  autosave = true;
  currentVolume = 99;
  maxVolume = 99;
  actionDelay = 50;
  unlockedCanvas: boolean = false;
  keybindings: { [action: string]: string } = {
    a: 'x',
    b: 'z',
    c: 'a',
    start: 'Enter',
    select: 'Shift',
    l: 'q',
    r: 'w',
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight'
  };  
  readonly defaultKeybindings: { [action: string]: string } = {
    a: 'x',
    b: 'z',
    c: 'a',
    l: 'q', // left trigger
    r: 'w', // right trigger
    start: 'Enter',
    select: 'Shift',
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight'
  };
  waitingForKey: string | null = null;
  showControlBindings = false;

  constructor(private romService: RomService, private fileService: FileService) { super(); }

  async ngOnInit() {  
    this.overrideGetUserMedia();
    this.setupEventListeners();

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        this.canvas.nativeElement.style.width = "100%";
        this.canvas.nativeElement.style.height = this.onMobile() ? "90vh" : "325px";
        this.canvas.nativeElement.width = this.canvas.nativeElement.offsetWidth;
        this.canvas.nativeElement.height = 325;
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

      // Check if key matches any binding
      const pressedKey = event.key;
      const action = Object.entries(this.keybindings).find(([_, val]) => val === pressedKey)?.[0];

      if (action) {
        this.nostalgist?.pressDown(action);
        event.preventDefault(); // prevent default browser action
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
      if (confirm("Save game 💾?")) { await this.saveState(false); }
    }
    await this.clearAutosave();
    await this.nostalgist?.getEmulator().exit();
    this.isSearchVisible = true;
    this.currentFileType = '';
    this.selectedRomName = '';
    this.controlsSet = false;
    this.displayAB = false;
    this.displayC = false;
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
      backgroundColor: 'black',
      zIndex: '1',
      width: '100%',
      height: (this.onMobile() && this.showControls ? '60vh' : !this.showControls ? '100%' : '60vh'),
    }
    const core = this.coreMapping[fileType.toLowerCase()] || 'default_core'; // Replace 'default_core' with a fallback core if needed

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
    this.getDisplayAB();
    this.getDisplayC();
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
      }, this.actionDelay); // Adjust the delay as needed
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
    this.fileService.getFileExtension(fileName).toLowerCase()
  }

  removeAccents(str: string) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
        const elementUnderTouch = document.elementFromPoint(currentX, currentY);
        const deltaX = currentX - startX;
        const deltaY = currentY - startY;
        // Determine the direction of the swipe
        const threshold = 10; // Adjust this value to your needs 
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          if (deltaX > threshold) {
            this.nostalgist!.pressDown('right'); // Right 
          } else if (deltaX < -threshold) {
            this.nostalgist!.pressDown('left') // Left 
          }
        } else {
          if (deltaY > threshold) {
            this.nostalgist!.pressDown('down'); // Down  
          } else if (deltaY < -threshold) {
            this.nostalgist!.pressDown('up'); // Up  
          }
        }
      }, { passive: false });
    };

    addPressReleaseEvents("start", "start");
    addPressReleaseEvents("select", "select");
    addPressReleaseEvents("a", "a");
    addPressReleaseEvents("b", "b");
    addPressReleaseEvents("c", "c");
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

    // Handle mousedown and touchstart for pressing down
    const handleMouseDownOrTouchStart = (e: Event) => {
      e.preventDefault();
      pressDown(direction, secondaryDirection);
    };

    // Handle mouseup and touchend for pressing up
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

    if (this.onMobile()) {
      controls.classList.toggle('fullscreenControlsBottom');
      startSelect.classList.toggle('fullscreenControlsTop');
    }


    if (!this.isFullScreen) {
      this.canvas.nativeElement
      if (this.onMobile()) {
        if (!this.showControls) {
          this.unlockedCanvas = true;
        }
        await elem.requestFullscreen(); 
      } else {
        this.unlockedCanvas = true;
        await canvas!.requestFullscreen();
      }
    } else {

      if (document.exitFullscreen) {
        document.exitFullscreen(); 
        this.unlockedCanvas = false;
      }
    }
  }
  getDisplayAB() {
    return true;
  }
  getDisplayC() {
    const ft = this.currentFileType.toLowerCase().trim();
    this.displayC = ft != '' && (this.segaFileTypes.includes(ft) || this.snesFileTypes.includes(ft));
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
