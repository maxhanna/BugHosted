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
  gameboy = new Gameboy();
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  gamesList: Array<string> = [];
  constructor(private http: HttpClient) {
    super();
    this.getGames();
  }
  ngOnInit() {
    this.fileInput?.nativeElement?.addEventListener('change', this.onFileChange);
    this.getGames();
  }
  async getGames() {
    const params = new HttpParams().set('directory', "roms/");
    this.promiseWrapper(lastValueFrom(await this.http.get<Array<string>>('/file/getdirectory', { params })).then(res => this.gamesList = res));
  }
  async loadRom(rom: string) {
    if (!confirm(`Load ${rom}?`)) { return; }
    const target = encodeURIComponent(rom);
    this.startLoading();
    try {
      const response = await this.http.get(`/file/getRomfile/${target}`, { responseType: 'blob' }).toPromise();
      const arrayBuffer = await this.toArrayBuffer(new Blob([response!], { type: 'application/octet-stream' }));
      this.loadGame(arrayBuffer); // Run the game
    } catch (ex) {
      console.log("about to throw error!");
      console.error(ex);
    }
    this.stopLoading();
  }
  async onFileChange(event: any) {
    if (this.fileInput?.nativeElement?.files && this.fileInput?.nativeElement?.files[0]) {
      this.uploadRomToServer();
      const rom = await this.toArrayBuffer(this.fileInput.nativeElement.files[0]);
      this.loadGame(rom); // Run the game
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
      this.startLoading();
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
  private loadGame(rom: unknown) {
    try {
      this.gameboy.loadGame(rom as ArrayBuffer);
    } catch (ex) {
      console.log("failed to loadGame : " + ex);
    }
    
    this.gameboy.apu.enableSound();
    this.setGameColors(this.gameboy.cartridge!.title);
    const context = document.querySelector('canvas')?.getContext('2d');
    this.gameboy.onFrameFinished((imageData: ImageData) => {
      context!.putImageData(imageData, 0, 0);
    });
    console.log("running game");
    this.gameboy.run();
  }

  private setGameColors(title: string) {
    let colors = [ //Default colors
      { red: 255, green: 255, blue: 255 },
      { red: 192, green: 192, blue: 192 },
      { red: 96, green: 96, blue: 96 },
      { red: 0, green: 0, blue: 0 },
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
