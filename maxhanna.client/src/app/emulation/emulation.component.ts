import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
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
  gbGamesList: Array<string> = [];
  gbColorGamesList: Array<string> = [];
  pokemonGamesList: Array<string> = [];
  romDirectory: FileEntry[] = [];
  autosave = true;
  soundOn = true;
  currentFileType = '';
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
    'nes': 'fceux',             // Nintendo Entertainment System
    'fds': 'fceux',             // Famicom Disk System
    'sfc': 'snes9x',            // Super Famicom
    'smc': 'snes9x',            // Super Nintendo (alternate extension)
    'snes': 'snes9x',           // Super Nintendo
    'nds': 'desmume',           // Nintendo DS
  };
  segaFileTypes: string[] =  Object.keys(this.coreMapping).filter(([key, value]) => value.includes('genesis'));
  oldNintendoDisplay = '';
  oldSpeakerDisplay = '';
  async ngOnInit() {
    this.setHTMLControls();
    this.overrideGetUserMedia();
     

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        this.canvas.nativeElement.width = 380;
        this.canvas.nativeElement.height = 325;
      }
    });
  }
  ngOnDestroy() {
    this.nostalgist?.exit();
    this.nostalgist = undefined;
  }
  async saveState() {
    const res = await this.nostalgist?.saveState();

    const formData = new FormData();
    formData.append('files', res?.state!, this.fileService.getFileWithoutExtension(this.selectedRomName) + ".sav"); 
    await this.romService.uploadRomFile(this.parentRef?.user!, formData);
  }
  async stopEmulator() {
    await this.nostalgist?.exit();
  }
  async loadState() {
    const romSaveFile = this.fileService.getFileWithoutExtension(this.selectedRomName) + ".sav";
    const saveStateResponse = await this.romService.getRomFile(this.parentRef?.user!, romSaveFile);
    console.log(romSaveFile + "  got save state response ? " + saveStateResponse?.size);

    await this.nostalgist?.loadState(saveStateResponse!);
  }
  async loadRom(file: FileEntry) {
    try {

      this.startLoading();
      this.nostalgist?.getEmulator().exit();
      const romSaveFile = this.fileService.getFileWithoutExtension(file.fileName) + ".sav";
      this.selectedRomName = file.fileName;
      const saveStateResponse = await this.romService.getRomFile(this.parentRef?.user!, romSaveFile);
      console.log(romSaveFile + "  got save state response ? " + saveStateResponse?.size);

      const response = await this.romService.getRomFile(this.parentRef?.user!, file.fileName);
      const fileType = this.currentFileType = this.fileService.getFileExtension(file?.fileName!);
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
    } catch (error) {
      console.error("how?" + (error as Error).message);
    }
  }


  getFileExtension(fileName: string) {
    this.fileService.getFileExtension(fileName).toLowerCase()
  }

  removeAccents(str: string) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  private debounce(func: Function, wait: number) {
    let timeout: any;
    return function (this: any, ...args: any[]) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        func.apply(context, args);
      }, wait);
    };
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
      //  this.gameboy!.joypad.up(joypadIndex);
      }, { passive: false });
    };

    addPressReleaseEvents("start", "start");
    addPressReleaseEvents("select", "select");
    addPressReleaseEvents("a", "a");
    addPressReleaseEvents("b", "b");
    addPressReleaseEvents("y", "y");
    addPressReleaseEvents("up", "up");
    addPressReleaseEvents("down", "down");
    addPressReleaseEvents("left", "left");
    addPressReleaseEvents("right", "right");

    document.getElementsByClassName('up-right')[0].addEventListener("mousedown", () => {
      this.nostalgist?.pressDown("up");
      this.nostalgist?.pressDown("right");
      this.nostalgist?.pressUp("up");
      this.nostalgist?.pressUp("right");
    });
    document.getElementsByClassName('up-left')[0].addEventListener("mousedown", () => {
      this.nostalgist?.pressDown("up");
      this.nostalgist?.pressDown("left");
      this.nostalgist?.pressUp("up");
      this.nostalgist?.pressUp("left");
    });
    document.getElementsByClassName('down-left')[0].addEventListener("mousedown", () => {
      this.nostalgist?.pressDown("down");
      this.nostalgist?.pressDown("left");
      this.nostalgist?.pressUp("down");
      this.nostalgist?.pressUp("left");
    });
    document.getElementsByClassName('down-right')[0].addEventListener("mousedown", () => {
      this.nostalgist?.pressDown("down");
      this.nostalgist?.pressDown("right");
      this.nostalgist?.pressUp("down");
      this.nostalgist?.pressUp("right");
    });

  }

  canvasKeypress(event: Event, up: boolean) {
    const kbEvent = event as KeyboardEvent;
    const targetElement = kbEvent.target as HTMLElement;

    if (targetElement.tagName.toLowerCase() === 'input' || targetElement.tagName.toLowerCase() === 'textarea') {
      return;
    }

    if (kbEvent.key.toLowerCase() == 'a') {
      if (up)
        this.nostalgist?.pressUp('a');
      else
        this.nostalgist?.pressDown('a');
      event.preventDefault();
    }
    else if (kbEvent.key.toLowerCase() == 'b') {
      if (up)
        this.nostalgist?.pressUp('b');
      else
        this.nostalgist?.pressDown('b');
      event.preventDefault();
    }
    else if (kbEvent.key.toLowerCase() == 'enter') {
      if (up)
        this.nostalgist?.pressUp('start');
      else
        this.nostalgist?.pressDown('start');
      event.preventDefault();
    }
    else if (kbEvent.key.toLowerCase() == 'shift') {
      if (up)
        this.nostalgist?.pressUp('select');
      else
        this.nostalgist?.pressDown('select');
      event.preventDefault();
    }
    else if (kbEvent.key.toLowerCase() == 'arrowup') {
      if (up)
        this.nostalgist?.pressUp('up');
      else
        this.nostalgist?.pressDown('up');
      event.preventDefault();
    }
    else if (kbEvent.key.toLowerCase() == 'arrowdown') {
      if (up)
        this.nostalgist?.pressUp('down');
      else
        this.nostalgist?.pressDown('down');
      event.preventDefault();
    }
    else if (kbEvent.key.toLowerCase() == 'arrowleft') {
      if (up)
        this.nostalgist?.pressUp('left');
      else
        this.nostalgist?.pressDown('left');
      event.preventDefault();
    }
    else if (kbEvent.key.toLowerCase() == 'arrowright') {
      if (up)
        this.nostalgist?.pressUp('right');
      else
        this.nostalgist?.pressDown('right');
      event.preventDefault();
    }
  }
  beforeUnloadHandler(event: BeforeUnloadEvent) {
    const message = 'Are you sure you want to leave?';
    return message;
  } 
  overrideGetUserMedia() {
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      console.warn("getUserMedia request blocked");
      return Promise.reject(new Error("Webcam access is blocked."));
    };
  }
  toggleFullscreen() {
    const elem = this.fullscreenContainer.nativeElement;
    const controls = document.getElementsByClassName('controls')[0];
    const speaker = document.getElementsByClassName('speaker')[0] as HTMLDivElement;
    const nintendo = document.getElementsByClassName('nintendo')[0] as HTMLDivElement;
    const startSelect = document.getElementsByClassName('start-select')[0];
    const canvas = this.canvas.nativeElement;

    controls.classList.toggle('fullscreenControlsBottom');
    startSelect.classList.toggle('fullscreenControlsTop');

    // Toggle visibility and position
    const isFullScreen = document.fullscreenElement;
    if (!isFullScreen) {
      this.oldNintendoDisplay = nintendo.style.display;
      this.oldSpeakerDisplay = speaker.style.display;
    }
    if (isFullScreen) {
      speaker.style.display = 'none';
      nintendo.style.display = 'none';
    } else {
      speaker.style.display = this.oldSpeakerDisplay;
      nintendo.style.display = this.oldNintendoDisplay;
    }

    // Request or exit fullscreen
    if (!isFullScreen) {
      if (this.onMobile() && elem.requestFullscreen) {
        elem.requestFullscreen();
      } else {
        canvas.requestFullscreen();
      }
    } else {
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
