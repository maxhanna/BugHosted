import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { N64EmulatorService } from './n64-emulator.service';
import { ChildComponent } from '../child.component';
import createMupen64PlusWeb from 'mupen64plus-web';

@Component({
  selector: 'app-emulator-n64',
  templateUrl: './emulator-n64.component.html',
  styleUrls: ['./emulator-n64.component.css'],
  standalone: false
})
export class EmulatorN64Component extends ChildComponent implements OnInit, OnDestroy {
  @ViewChild('romInput') romInput!: ElementRef<HTMLInputElement>;
  @ViewChild('screen') screen!: ElementRef<HTMLCanvasElement>;

  loading = false;
  status = 'idle';
  romName?: string;
  private romBuffer?: ArrayBuffer;
  private instance: any;

  constructor(private n64Service: N64EmulatorService) {
    super();
  }

  ngOnInit(): void {}
  ngOnDestroy(): void {
    this.stop();
  }




  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;
    this.romName = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      this.romBuffer = reader.result as ArrayBuffer;
      this.parentRef?.showNotification(`Loaded ${this.romName}`);
    };
    reader.onerror = (e) => {
      console.error(e);
      this.parentRef?.showNotification('Failed to read ROM file');
    };
    reader.readAsArrayBuffer(file);
    const emulatorControls = await createMupen64PlusWeb({

  // REQUIRED: This canvas' id has to be 'canvas' for... reasons
  canvas: document.getElementById('screen'),

  // REQUIRED: An arraybuffer containing the rom data to play
  romData: this.romBuffer,

  // OPTIONAL: These get called roughly before and after each frame
  beginStats: () => {},
  endStats: () => {},

  // OPTIONAL
  coreConfig: {
    emuMode: 0 // 0=pure-interpretter (default)(seems to be more stable), 1=cached
  },

//   // OPTIONAL
//   netplayConfig: {
//     player: 1, // The player (1-4) that we would like to control
//     reliableChannel: myChannel, // websocket-like object that can send and receive the 'tcp' messages described at https://mupen64plus.org/wiki/index.php?title=Mupen64Plus_v2.0_Core_Netplay_Protocol
//     unreliableChannel: myChannel2, // websocket-like object that can send and receive the 'udp' messages described at the link above
//   },

//   // OPTIONAL - Can be used to point to files that the emulator needs if they are moved for whatever reason
//   locateFile: (path: string, prefix: string) => {

//     const publicURL = process.env.PUBLIC_URL;

//     if (path.endsWith('.wasm') || path.endsWith('.data')) {
//       return publicURL + "/dist/" + path;
//     }

//     return prefix + path;
//   },

  // OPTIONAL - Can be used to get notifications for uncaught exceptions
  setErrorStatus: (errorMessage: string) => {
    console.log("errorMessage: %s", errorMessage);
  }
});

emulatorControls.start();

emulatorControls.pause();

emulatorControls.resume();
console.log("Started?");
  }

  async boot() {
    if (!this.romBuffer) {
      this.parentRef?.showNotification('Pick a ROM first');
      return;
    }
    if (!this.screen) {
      this.parentRef?.showNotification('No canvas available');
      return;
    }

    this.loading = true;
    this.status = 'booting';
    try {
      this.instance = await this.n64Service.bootRom(this.romBuffer!, this.screen.nativeElement, {});
      this.status = 'running';
      this.parentRef?.showNotification(`Booted ${this.romName}`);
    } catch (ex) {
      console.error(ex);
      this.status = 'error';
      this.parentRef?.showNotification('Failed to boot ROM: ' + ex);
    } finally {
      this.loading = false;
    }
  }

  async stop() {
    try {
      await this.n64Service.stop();
      this.status = 'stopped';
      this.parentRef?.showNotification('Emulator stopped');
    } catch (e) {
      console.error(e);
    }
  }

  async pause() {
    await this.n64Service.pause();
    this.status = 'paused';
  }

  async resume() {
    await this.n64Service.resume();
    this.status = 'running';
  }

  clearSelection() {
    this.romInput.nativeElement.value = '';
    this.romBuffer = undefined;
    this.romName = undefined;
  }
}
