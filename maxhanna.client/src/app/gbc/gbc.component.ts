import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { util, GameBoy } from 'jsgbc';
import { FileService } from '../../services/file.service';


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
  autosave = true;
  soundOn = true;

  constructor(private fileService: FileService) { super(); }

  ngOnInit() {
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }
  async ngAfterViewInit() {
    try {
      await this.getGames();
    } catch { }
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
  async getGames() {
    try {
      const res = await this.fileService.getDirectory(this.parentRef?.user!, "roms/") as Array<string>;
      this.gbGamesList = [];
      this.gbColorGamesList = [];
      res.forEach(x => {
        if (x.toLowerCase().includes("poke") && !this.fileService.getFileExtension(x)!.includes("gbs") && !this.fileService.getFileExtension(x)!.includes("sav")) {
          this.pokemonGamesList.push(x);
        }
        else if (this.fileService.getFileExtension(x)!.includes("gbc") && !this.fileService.getFileExtension(x)!.includes("gbs")) {
          this.gbColorGamesList.push(x);
        }
        else if (this.fileService.getFileExtension(x)!.includes("gb") && !this.fileService.getFileExtension(x)!.includes("gbs")) {
          this.gbGamesList.push(x);
        }
      });
    } catch {
      console.log("Could not get games list");
    }
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
  async loadRom(event: Event) {
    this.startLoading();

    if (this.gameboy) {
      const romSelectElement = event.target as HTMLSelectElement;
      const romName = romSelectElement.value;
      if (!confirm(`Load ${romName}?`)) { this.stopLoading(); return; }

      try {
        const response = await this.fileService.getRomFile(this.parentRef?.user!, romName);
        const romSaveFile = romName.split('.')[0] + ".sav";
        const rom = await util.readBlob(response!);

        try {
          const saveStateResponse = await this.fileService.getRomFile(this.parentRef?.user!, romSaveFile);

          if (this.gameboy) {
            this.setGameColors(romName);
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
    
    const romSaveFileName = this.loadRomSelect.nativeElement.value.split('.')[0];
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
          this.fileService.uploadRomFile(this.parentRef?.user!, formData);
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

    if (kbEvent.key.toLowerCase() == 'a') {
      if (up)
        this.gameboy!.joypad.up(4);
      else
        this.gameboy!.joypad.down(4);
    }

    if (kbEvent.key.toLowerCase() == 'b') {
      if (up)
        this.gameboy!.joypad.up(5);
      else
        this.gameboy!.joypad.down(5);
    }


    if (kbEvent.key.toLowerCase() == 'enter') {
      if (up)
        this.gameboy!.joypad.up(7);
      else
        this.gameboy!.joypad.down(7);
    }

    if (kbEvent.key.toLowerCase() == 'shift') {
      if (up)
        this.gameboy!.joypad.up(6);
      else
        this.gameboy!.joypad.down(6);
    }

    if (kbEvent.key.toLowerCase() == 'arrowup') {
      if (up)
        this.gameboy!.joypad.up(2);
      else
        this.gameboy!.joypad.down(2);
    }

    if (kbEvent.key.toLowerCase() == 'arrowdown') {
      if (up)
        this.gameboy!.joypad.up(3);
      else
        this.gameboy!.joypad.down(3);
    }


    if (kbEvent.key.toLowerCase() == 'arrowleft') {
      if (up)
        this.gameboy!.joypad.up(1);
      else
        this.gameboy!.joypad.down(1);
    }

    if (kbEvent.key.toLowerCase() == 'arrowright') {
      if (up)
        this.gameboy!.joypad.up(0);
      else
        this.gameboy!.joypad.down(0);
    }
    console.log(event);
    event.preventDefault();
  }
  beforeUnloadHandler(event: BeforeUnloadEvent) {
    const message = 'Are you sure you want to leave?';
    event.returnValue = message; // Standard for most browsers
    return message; // For some browsers
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
