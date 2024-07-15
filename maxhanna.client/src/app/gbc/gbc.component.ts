import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { util, GameBoy } from 'jsgbc';
import { FileService } from '../../services/file.service';
import { RomService } from '../../services/rom.service';
import { DirectoryResults } from '../../services/datacontracts/file/directory-results';
import { FileEntry } from '../../services/datacontracts/file-entry';
 

@Component({
  selector: 'app-gbc',
  templateUrl: './gbc.component.html',
  styleUrl: './gbc.component.css'
})
export class GbcComponent extends ChildComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('localFileOpen') localFileOpen!: ElementRef<HTMLInputElement>;
  @ViewChild('loadRomSelect') loadRomSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;
  gameboy: undefined | GameBoy;
  gbGamesList: Array<string> = [];
  gbColorGamesList: Array<string> = [];
  pokemonGamesList: Array<string> = [];
  romDirectory: FileEntry[] = [];
  autosave = true;
  soundOn = true;
  selectedRomName = "";

  constructor(private fileService: FileService, private romService: RomService) { super(); }

  ngOnInit() {
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }
  async ngAfterViewInit() { 
    this.gameboy = new GameBoy({
      lcd: { canvas: this.canvas.nativeElement }
    });
    this.setHTMLControls();
    window.addEventListener('keydown', e => this.canvasKeypress(e, false), false); //Sets keyboard controls
    window.addEventListener('keyup', e => this.canvasKeypress(e, true), false); //Sets keyboard controls

    const debouncedSaveGame = this.debounce(this.saveGame.bind(this), 2000); // Adjust delay as needed (2 seconds in this case) -- ensures game cannot be saved more then once per n second(s).

    this.gameboy.addListener("mbcRamWrite", () => { // Allows the server to handle saving the game automatically
      if (this.autosave) {
        debouncedSaveGame(false);
      }
    });
  }
  getFileExtension(fileName: string) {
    this.fileService.getFileExtension(fileName).toLowerCase()
  }

  removeAccents(str: string) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  private setGameColors(title: string) {
    if (this.gameboy) {
      const lcTitle = title.toLowerCase();
      let colors = [
        { red: 235, green: 235, blue: 235 },    // Almost White with a hint of Green
        { red: 192, green: 192, blue: 192 },    // Light Gray
        { red: 96, green: 96, blue: 96 },       // Medium Gray
        { red: 20, green: 45, blue: 20 },       // Almost Black with a hint of Green
      ];
      if (lcTitle.includes("blue")) {
        colors = [
          { red: 255, green: 255, blue: 255 },
          { red: 192, green: 192, blue: 192 },
          { red: 96, green: 96, blue: 192 },
          { red: 0, green: 0, blue: 0 },
        ];
      } else if (lcTitle.includes("red")) {
        colors = [
          { red: 255, green: 255, blue: 255 },
          { red: 192, green: 192, blue: 192 },
          { red: 192, green: 96, blue: 96 },
          { red: 0, green: 0, blue: 0 },
        ];
      }
      const gameboyColors = colors.map(color => {
        const hex = color.red << 16 | color.green << 8 | color.blue;
        return hex;
      });
      this.gameboy!.colors = gameboyColors;
    }
  }
  async loadRom(file: FileEntry) {
    this.startLoading();

    if (this.gameboy) { 
      this.selectedRomName = file.fileName;
      if (!confirm(`Load ${this.selectedRomName}?`)) { this.stopLoading(); return; }

      try {
        const response = await this.romService.getRomFile(this.selectedRomName, this.parentRef?.user);
        const romSaveFile = this.fileService.getFileWithoutExtension(this.selectedRomName) + ".sav";
        const rom = await util.readBlob(response!);

        try {
          const saveStateResponse = await this.romService.getRomFile(romSaveFile, this.parentRef?.user);

          if (this.gameboy) {
            this.setGameColors(this.selectedRomName);
            this.gameboy.replaceCartridge(rom);
          }

          if (saveStateResponse) {
            console.log("Got a saved game file from backend.");
            const result = await util.readBlob(saveStateResponse);
            await this.gameboy!.loadBatteryFileArrayBuffer(result);
          }
        } catch (e) {
          this.gameboy!.replaceCartridge(rom);
        }
      } catch (ex) {
        console.error(ex);
      }
    }
    this.stopLoading();

    const tmpAutosave = this.autosave;
    this.autosave = false;
    console.log("Disabling autosave for 20 seconds to prevent unwanted overwrites");
    setTimeout(() => {
      this.autosave = tmpAutosave; // Re-enable autosave after 20 seconds
    }, 20000);
  }
  toggleSound() {
    if (!this.soundOn) {
      this.gameboy?.audioDevice.setVolume(100);
    } else {
      this.gameboy?.audioDevice.setVolume(0);
    }
    this.soundOn = !this.soundOn;
  }
  async saveGame(forceSaveLocal: boolean) {
    console.log("Saving game");

    const romSaveFileName = this.fileService.getFileWithoutExtension(this.selectedRomName);
    if (this.gameboy && romSaveFileName) {
      try {
        if (!this.autosave || forceSaveLocal) {
          util.saveAs(this.gameboy.getBatteryFileArrayBuffer(), romSaveFileName + ".sav");
        } else {
          const formData = new FormData();
          const ab = this.gameboy.getBatteryFileArrayBuffer();
          if (ab) {
            const blob = new Blob([ab]);
            formData.append('files', blob, romSaveFileName + ".sav");
          }
          this.romService.uploadRomFile(this.parentRef?.user!, formData);
        }
      } catch { console.error("Error while saving game!"); }
    }
  }
  setHTMLControls() {
    const addPressReleaseEvents = (elementClass: string, joypadIndex: number) => {
      const element = document.getElementsByClassName(elementClass)[0];

      element.addEventListener("mousedown", () => {
        this.gameboy!.joypad.down(joypadIndex);
      });

      const handleMouseUp = () => {
        this.gameboy!.joypad.up(joypadIndex);
      };

      element.addEventListener("mouseup", handleMouseUp);

      document.addEventListener("mouseup", (event) => {
        if (event.target !== element) {
          handleMouseUp();
        }
      });

      element.addEventListener("touchstart", (e) => {
        e.preventDefault();
        this.gameboy!.joypad.down(joypadIndex);
      }, { passive: false });

      element.addEventListener("touchend", (e) => {
        e.preventDefault();
        this.gameboy!.joypad.up(joypadIndex);
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
            this.gameboy!.joypad.down(0); // Right
            this.gameboy!.joypad.up(1);   // Ensure left is not pressed
            this.gameboy!.joypad.up(3);   // Ensure down is not pressed
            this.gameboy!.joypad.up(2);   // Ensure up is not pressed 
            setTimeout(() => this.gameboy!.joypad.up(0), timeout);   // Ensure up is not pressed 
          } else if (deltaX < -threshold) {
            this.gameboy!.joypad.down(1); // Left
            this.gameboy!.joypad.up(0);   // Ensure right is not pressed 
            this.gameboy!.joypad.up(3);   // Ensure down is not pressed
            this.gameboy!.joypad.up(2);   // Ensure up is not pressed  
            setTimeout(() => this.gameboy!.joypad.up(1), timeout);  // Ensure up is not pressed  
          }
        } else {
          if (deltaY > threshold) {
            this.gameboy!.joypad.down(3); // Down
            this.gameboy!.joypad.up(2);   // Ensure up is not pressed 
            this.gameboy!.joypad.up(1);   // Ensure left is not pressed 
            this.gameboy!.joypad.up(0);   // Ensure right is not pressed 
            setTimeout(() => this.gameboy!.joypad.up(3), timeout);   // Ensure right is not pressed 
          } else if (deltaY < -threshold) {
            this.gameboy!.joypad.down(2); // Up
            this.gameboy!.joypad.up(3);   // Ensure down is not pressed
            this.gameboy!.joypad.up(1);   // Ensure left is not pressed 
            this.gameboy!.joypad.up(0);   // Ensure right is not pressed 
            setTimeout(() => this.gameboy!.joypad.up(2), timeout);   // Ensure right is not pressed 
          }
        }
      }, { passive: false });

      element.addEventListener("touchend", (e) => {
        e.preventDefault();
        this.gameboy!.joypad.up(joypadIndex);
      }, { passive: false });
    };

    addPressReleaseEvents("start", 7);
    addPressReleaseEvents("select", 6);
    addPressReleaseEvents("a", 4);
    addPressReleaseEvents("b", 5);
    addPressReleaseEvents("up", 2);
    addPressReleaseEvents("down", 3);
    addPressReleaseEvents("left", 1);
    addPressReleaseEvents("right", 0);
    addPressReleaseEvents("up-right", 2);
    addPressReleaseEvents("up-right", 0);
    addPressReleaseEvents("up-left", 2);
    addPressReleaseEvents("up-left", 1);
    addPressReleaseEvents("down-right", 3);
    addPressReleaseEvents("down-right", 0);
    addPressReleaseEvents("down-left", 3);
    addPressReleaseEvents("down-left", 1);
  }

  canvasKeypress(event: Event, up: boolean) {
    const kbEvent = event as KeyboardEvent;
    const targetElement = kbEvent.target as HTMLElement;

    if (targetElement.tagName.toLowerCase() === 'input' || targetElement.tagName.toLowerCase() === 'textarea') {
      return;
    }

    if (kbEvent.key.toLowerCase() == 'a') {
      if (up)
        this.gameboy!.joypad.up(4);
      else
        this.gameboy!.joypad.down(4);
      event.preventDefault();
    }
    else if (kbEvent.key.toLowerCase() == 'b') {
      if (up)
        this.gameboy!.joypad.up(5);
      else
        this.gameboy!.joypad.down(5);
      event.preventDefault();
    }
    else if (kbEvent.key.toLowerCase() == 'enter') {
      if (up)
        this.gameboy!.joypad.up(7);
      else
        this.gameboy!.joypad.down(7);
      event.preventDefault();
    }
    else if (kbEvent.key.toLowerCase() == 'shift') {
      if (up)
        this.gameboy!.joypad.up(6);
      else
        this.gameboy!.joypad.down(6);
      event.preventDefault();
    }
    else if (kbEvent.key.toLowerCase() == 'arrowup') {
      if (up)
        this.gameboy!.joypad.up(2);
      else
        this.gameboy!.joypad.down(2);
      event.preventDefault();
    }
    else if (kbEvent.key.toLowerCase() == 'arrowdown') {
      if (up)
        this.gameboy!.joypad.up(3);
      else
        this.gameboy!.joypad.down(3);
      event.preventDefault();
    }
    else if (kbEvent.key.toLowerCase() == 'arrowleft') {
      if (up)
        this.gameboy!.joypad.up(1);
      else
        this.gameboy!.joypad.down(1);
      event.preventDefault();
    }
    else if (kbEvent.key.toLowerCase() == 'arrowright') {
      if (up)
        this.gameboy!.joypad.up(0);
      else
        this.gameboy!.joypad.down(0);
      event.preventDefault();
    }
  }
  beforeUnloadHandler(event: BeforeUnloadEvent) {
    const message = 'Are you sure you want to leave?';
    return message;
  }
  ngOnDestroy() {
    if (this.gameboy) {
      try {
        this.gameboy.audioDevice.setVolume(0);
        this.gameboy.audioController.disable();
        this.gameboy.turnOff();
        this.gameboy.stop();
      } catch (e) { }
    }
    window.removeEventListener('beforeunload', this.beforeUnloadHandler);

  }
  async fileChanged() {
    const file = this.localFileOpen.nativeElement.files![0];
    try {
      const rom = await util.readBlob(file);
      if (this.gameboy)
        this.gameboy.replaceCartridge(rom);
    } catch (error) { console.error(error); }
  }
} 
