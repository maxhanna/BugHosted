import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Gameboy } from "gameboy-emulator";
import { HttpClient, HttpParams } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-game',
  templateUrl: './game.component.html',
  styleUrl: './game.component.css'
})
export class GameComponent extends ChildComponent implements OnInit {
  gameboy: any;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;
  gamesList: Array<string> = [];
  currentGameFile = "";
  autosave: boolean = true;
  constructor(private http: HttpClient) {
    super();
  }
  async ngOnInit() {
    this.fileInput?.nativeElement?.addEventListener('change', this.onFileChange);
    this.getGames();
    this.gameboy = new Gameboy();
    //if (crossOriginIsolated || window.crossOriginIsolated) {
    //  alert("isolated!");
    //} else { alert("not iso0lated!"); }
  }
  setButtonState(button: string, value: boolean) {
    this.gameboy.input[button] = value;
  }
  async getGames() {
    const params = new HttpParams().set('directory', "roms/");
    this.promiseWrapper(lastValueFrom(await this.http.get<Array<string>>('/file/getdirectory', { params })).then(res => this.gamesList = res.filter(game => !game.includes(".gbs"))));
  }
  async loadRom(romEvent: Event) {
    const romSelectElement = romEvent.target as HTMLSelectElement;
    const rom = romSelectElement.value;
    if (!confirm(`Load ${rom}?`)) { return; }

    this.currentGameFile = rom;
    const target = encodeURIComponent(this.currentGameFile);
    this.startLoading();
    try {

      const response = await this.http.get(`/file/getRomfile/${target}`, { responseType: 'blob' }).toPromise();
      const arrayBuffer = await this.toArrayBuffer(new Blob([response!], { type: 'application/octet-stream' }));
      const romSaveFile = rom.split('.')[0] + ".gbs";
      try {
        const saveStateResponse = await this.http.get(`/file/getRomfile/${romSaveFile}`, { responseType: 'blob' }).toPromise();
        const saveStateArrayBuffer = await this.toArrayBuffer(new Blob([saveStateResponse!], { type: 'application/octet-stream' }));
        if (saveStateArrayBuffer.byteLength > 0) {
          this.loadGame(arrayBuffer, saveStateArrayBuffer);
        } else {
          this.loadGame(arrayBuffer, undefined);
        }
      } catch (e) {
        this.loadGame(arrayBuffer, undefined);
      }
    } catch (ex) {
      console.error(ex);
    }
    this.stopLoading();
  }
  async onFileChange(event: any) {
    if (this.fileInput?.nativeElement?.files && this.fileInput?.nativeElement?.files[0]) {
      this.uploadRomToServer();
      const rom = await this.toArrayBuffer(this.fileInput.nativeElement.files[0]);
      this.loadGame(rom, undefined);
    } else { alert("nothing to load!"); }
  }
  async uploadRomToServer() {
    if (!this.fileInput.nativeElement.files) { alert("No file to upload!"); }
    const files = this.fileInput.nativeElement.files;
    var fileNames = [];
    for (let x = 0; x < files!.length; x++) {
      fileNames.push(files![x].name);
    }
    if (confirm(`Upload : ${fileNames.join(',')} ?`)) {
      try {
        const formData = new FormData();
        for (let i = 0; i < files!.length; i++) {
          formData.append('files', files!.item(i)!);
        }
        await this.http.post('/file/uploadrom', formData).toPromise();
      } catch (ex) {
        console.log(ex);
      }
    }
  }
  async saveGameState(blob: any) {
    if (this.autosave) {
      const formData = new FormData();
      const ab = blob;
      const newTitle = this.currentGameFile.split('.')[0] + '.gbs';
      // Check if save RAM data exists
      if (ab) {
        const blob = new Blob([ab]);
        formData.append('files', blob, newTitle);
      }
      await this.http.post('/file/uploadrom', formData, { responseType: 'text' }).toPromise().then(res => console.log("game saved successfully!"));
    } 
  }
  toggleAutosave(): void {
    this.autosave = !this.autosave;
  }
  private loadGame(rom: any, saveState: any) {
    try {
      this.gameboy.loadGame(rom as ArrayBuffer);
    } catch (ex) {
      console.error("failed to loadGame : " + ex);
    }
    this.gameboy.apu.enableSound();
    this.setGameColors(this.gameboy.cartridge!.title);
    const context = document.querySelector('canvas')?.getContext('2d');
    this.gameboy.onFrameFinished((imageData: ImageData) => {
      context!.putImageData(imageData, 0, 0);
    });
    this.gameboy.setOnWriteToCartridgeRam(() => {
      this.saveGameState(this.gameboy.getCartridgeSaveRam()); //replace this with a save method that takes the games name and makes a gbs out of it.
    })
    if (saveState != undefined && saveState != null) {
      this.gameboy.setCartridgeSaveRam(saveState);
    }

    this.gameboy.run();
  }

  private setGameColors(title: string) {
    let colors = [
      { red: 235, green: 235, blue: 235 },    // Almost White with a hint of Green
      { red: 192, green: 192, blue: 192 },    // Light Gray
      { red: 96, green: 96, blue: 96 },       // Medium Gray
      { red: 20, green: 45, blue: 20 },       // Almost Black with a hint of Green
    ];
    if (title.toLowerCase().includes("blue")) {
      colors = [
        { red: 255, green: 255, blue: 255 },
        { red: 192, green: 192, blue: 192 },
        { red: 96, green: 96, blue: 192 },
        { red: 0, green: 0, blue: 0 },
      ];
    } else if (title.toLowerCase().includes("red")) {
      colors = [
        { red: 255, green: 255, blue: 255 },
        { red: 192, green: 192, blue: 192 },
        { red: 192, green: 96, blue: 96 },
        { red: 0, green: 0, blue: 0 },
      ];
    }
    this.gameboy.gpu.colors = colors;
  }
  // Function to convert Blob to ArrayBuffer
  private toArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert to ArrayBuffer'));
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
  }
}
