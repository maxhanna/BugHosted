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
  @ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;

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

    try {
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = (e) => reject(e);
        reader.readAsArrayBuffer(file);
      });

      this.romBuffer = buffer;
      this.parentRef?.showNotification(`Loaded ${this.romName}`);

      const canvasEl = this.canvas?.nativeElement as HTMLCanvasElement | undefined;
      if (!canvasEl) {
        this.parentRef?.showNotification('No canvas available');
        return;
      }
      // some runtimes expect id 'canvas'
      if (canvasEl.id !== 'canvas') canvasEl.id = 'canvas';

      // Initialize mupen64plus-web with the ROM bytes and canvas
      this.instance = await createMupen64PlusWeb({
        canvas: canvasEl,
        romData: new Int8Array(this.romBuffer),
        beginStats: () => {},
        endStats: () => {},
        coreConfig: { emuMode: 0 },
        setErrorStatus: (errorMessage: string) => {
          console.log('Mupen error:', errorMessage);
        },
        // Ensure the Emscripten module locates its .wasm/.data files from our assets folder
        locateFile: (path: string, prefix?: string) => {
          return `/assets/mupen64plus/${path}`;
        }
      });

      if (this.instance && typeof this.instance.start === 'function') {
        await this.instance.start();
        this.status = 'running';
      }
    } catch (e) {
      console.error('Failed to load ROM / initialize emulator', e);
      this.parentRef?.showNotification('Failed to load ROM');
    }
  }

  async boot() {
    if (!this.romBuffer) {
      this.parentRef?.showNotification('Pick a ROM first');
      return;
    }
    if (!this.canvas) {
      this.parentRef?.showNotification('No canvas available');
      return;
    }

    this.loading = true;
    this.status = 'booting';
    try {
      this.instance = await this.n64Service.bootRom(this.romBuffer!, this.canvas.nativeElement, {});
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
