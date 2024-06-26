import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Nostalgist } from 'nostalgist'
import { ChildComponent } from '../child.component';
import { RomService } from '../../services/rom.service';
import { FileEntry } from '../../services/datacontracts/file-entry';
import { FileService } from '../../services/file.service';

@Component({
  selector: 'app-emulation',
  templateUrl: './emulation.component.html',
  styleUrl: './emulation.component.css'
})
export class EmulationComponent extends ChildComponent implements OnInit, OnDestroy {
  constructor(private romService: RomService, private fileService: FileService) { super(); }
  selectedRomName = '';
  nostalgist: Nostalgist | undefined;
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
  currentFileType = '';
  isSearchVisible = true;
  isFullScreen = false;
  coreMapping: { [key: string]: string } = {
    'sgx': 'mednafen_supergrafx', // SuperGrafx
    'vb': 'mednafen_vb',        // Virtual Boy
    'ws': 'mednafen_wswan',     // WonderSwan
    'wsc': 'mednafen_wswan',    // WonderSwan Color
    'gba': 'mgba',              // Game Boy Advance
    'gbc': 'mgba',              // Game Boy Color
    'gb': 'mgba',               // Game Boy
    'gen': 'genesis_plus_gx',   // Sega Genesis/Mega Drive
    'md': 'genesis_plus_gx',    // Sega Mega Drive (alternate extension)
    'smd': 'genesis_plus_gx',   // Sega Genesis/Mega Drive
    '32x': 'genesis_plus_gx',   // Sega 32X
    'sms': 'genesis_plus_gx',   // Sega Master System
    'gg': 'genesis_plus_gx',    // Sega Game Gear
    'nes': 'fceumm',             // Nintendo Entertainment System
    'fds': 'fceux',             // Famicom Disk System
    'sfc': 'snes9x',            // Super Famicom
    'smc': 'snes9x',            // Super Nintendo (alternate extension)
    'snes': 'snes9x',           // Super Nintendo
    'nds': 'desmume',           // Nintendo DS
  };
  segaFileTypes: string[] = Object.entries(this.coreMapping)
    .filter(([key, value]) => value.includes('genesis'))
    .map(([key, value]) => key);
  snesFileTypes: string[] = Object.entries(this.coreMapping)
    .filter(([key, value]) => value.includes('snes'))
    .map(([key, value]) => key);
  gameboyFileTypes: string[] = Object.entries(this.coreMapping)
    .filter(([key, value]) => key.includes('gb'))
    .map(([key, value]) => key);
  oldNintendoDisplay = '';
  oldSpeakerDisplay = '';

  autosaveInterval: any;
  autosaveIntervalTime: number = 60000; // 1 minute in milliseconds
  autosave = true;
  currentVolume = 100;

  async ngOnInit() {
    this.setHTMLControls();
    this.overrideGetUserMedia();
    this.setupEventListeners();

    document.addEventListener('fullscreenchange', () => {
      console.log("inside fullscreenchange document listener");
      if (!document.fullscreenElement) {
        this.canvas.nativeElement.width = 380;
        this.canvas.nativeElement.height = 325;
      }
      this.isFullScreen = !this.isFullScreen;
    });
  }
  override async remove_me(componentTitle: string) {
    this.stopEmulator();
    this.isLoading = false;  // Ensure this is executed regardless of saveState result
    if (this.parentRef && this.unique_key) {
      this.parentRef.removeComponent(this.unique_key);
    } else {
      console.log("key not found: " + componentTitle);
    }
  }
  async ngOnDestroy() { 
    await this.clearAutosave();
    this.nostalgist?.exit();
    this.nostalgist = undefined;
  }
  setupEventListeners() {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' || event.key === 'Esc') {
        console.log('Escape key pressed');
        if (this.isFullScreen) {
          console.log("toggling fs");
          this.toggleFullscreen();
        }
      }
    });
  }
  async saveState() {
    const res = await this.nostalgist?.saveState();

    const formData = new FormData();
    formData.append('files', res?.state!, this.fileService.getFileWithoutExtension(this.selectedRomName) + ".sav");
    await this.romService.uploadRomFile(this.parentRef?.user!, formData);
  }
  async stopEmulator() {
    if (this.selectedRomName != '' && confirm("Save game?")) { this.saveState(); }
    await this.clearAutosave();
    await this.nostalgist?.getEmulator().exit();
    this.isSearchVisible = true;
    this.currentFileType = '';
    this.selectedRomName = '';
  }
  async loadState() {
    const romSaveFile = this.fileService.getFileWithoutExtension(this.selectedRomName) + ".sav";
    const saveStateResponse = await this.romService.getRomFile(romSaveFile, this.parentRef?.user);
 
    await this.nostalgist?.loadState(saveStateResponse!);
  }
  async loadRom(file: FileEntry) {
 
    this.startLoading();
     this.isSearchVisible = false; 
    const romSaveFile = this.fileService.getFileWithoutExtension(file.fileName) + ".sav";
    this.selectedRomName = file.fileName;
    const saveStateResponse = await this.romService.getRomFile(romSaveFile, this.parentRef?.user);
 
    const response = await this.romService.getRomFile(file.fileName, this.parentRef?.user);
    const fileType = this.currentFileType = file?.fileType ?? this.fileService.getFileExtension(file?.fileName!);
 
    const style = {
      backgroundColor: 'black',
      zIndex: '1',
      width: '380px',
      height: '325px',
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
    this.stopLoading();

    this.setupAutosave();

  }

  onVolumeChange(event: Event) {
    const inputElement = event.target as HTMLInputElement;
    const targetVolume = Number(inputElement.value);
    this.adjustVolumeIncrementally(targetVolume);
  }

  adjustVolumeIncrementally(targetVolume: number) {
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
      }, 100); // Adjust the delay as needed
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
      this.currentVolume = Math.min(100, this.currentVolume + 1);
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
        console.log('Autosaving game state...');
        await this.saveState();
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
  }
  async saveGame(forceSaveLocal: boolean) {
    console.log("Saving game");
    const { state } = await this.nostalgist!.saveState();
  }
  setHTMLControls() {
    const addPressReleaseEvents = (elementClass: string, joypadIndex: string) => {
      const element = document.getElementsByClassName(elementClass)[0];

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
      }, { passive: false });

      let startX: number, startY: number;
      element.addEventListener("touchstart", (e) => {
        startX = (e as TouchEvent).touches[0].clientX;
        startY = (e as TouchEvent).touches[0].clientY;
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
        const timeout = 50; // Idk browser delay of some sort?
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

      element.addEventListener("touchend", (e) => {
        e.preventDefault();
        this.nostalgist!.pressUp(joypadIndex)
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
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      console.warn("getUserMedia request blocked");
      return Promise.reject(new Error("Webcam access is blocked."));
    };
  }
  async toggleFullscreen() {
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
      this.oldNintendoDisplay = nintendo.style.display;
      nintendo.style.display = 'none';

      if (this.onMobile()) {
        await elem.requestFullscreen();
      } else {
        await canvas!.requestFullscreen();
      }
    } else {
      nintendo.style.display = this.oldNintendoDisplay;

      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  onMobile() {
    return (/Mobi|Android/i.test(navigator.userAgent));
  }
  getAllowedFileTypes(): string[] {
    return Object.keys(this.coreMapping);
  }
}
