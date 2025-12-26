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
  gamepads: Array<{ index: number; id: string; mapping: string; connected: boolean }> = [];
  selectedGamepadIndex: number | null = null;
  private _gpPoller = 0;
  private _originalGetGamepads: any = null;

  constructor(private n64Service: N64EmulatorService) {
    super();
  }

  ngOnInit(): void {}
  ngOnDestroy(): void {
    this.stop();
    this.restoreGamepadGetter();
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

      // If user selected a gamepad, reorder navigator.getGamepads so the selected
      // device appears as index 0 (player 1) to the emulator. This is a runtime
      // workaround when multiple controllers are connected and the emulator
      // picks the first device it finds.
      this.applyGamepadReorder();

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
      // Ensure selected gamepad is exposed as player 1 before booting
      this.applyGamepadReorder();
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
    // restore navigator.getGamepads to original behavior
    this.restoreGamepadGetter();
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

  // -- Gamepad helper methods -------------------------------------------------
  refreshGamepads() {
    try {
      const g = navigator.getGamepads ? navigator.getGamepads() : [];
      this.gamepads = [];
      for (let i = 0; i < g.length; i++) {
        const gp = g[i];
        if (!gp) continue;
        this.gamepads.push({ index: gp.index, id: gp.id, mapping: gp.mapping || '', connected: gp.connected });
      }
      // default to first standard-mapped device if available
      if (this.selectedGamepadIndex === null && this.gamepads.length) {
        const std = this.gamepads.find((p) => p.mapping === 'standard');
        this.selectedGamepadIndex = std ? std.index : this.gamepads[0].index;
      }
    } catch (e) {
      console.warn('Failed to read gamepads', e);
    }
  }

  startGamepadLogging() {
    const poll = () => {
      try {
        const g = navigator.getGamepads ? navigator.getGamepads() : [];
        // update the UI list so user can pick newly connected devices
        this.refreshGamepads();
        for (let i = 0; i < g.length; i++) {
          const gp = g[i];
          if (!gp) continue;
          // light console output for debugging while emulator runs
          // show active buttons
          const pressed = (gp.buttons as any[]).map((b: any, bi: number) => b.pressed ? bi : -1).filter((v: number) => v >= 0);
          if (pressed.length) console.log(`[Gamepad ${gp.index}] ${gp.id} pressed:`, pressed);
        }
      } catch (e) {
        console.warn('Gamepad poll error', e);
      }
      this._gpPoller = window.setTimeout(poll, 750) as any;
    };
    poll();
  }

  stopGamepadLogging() {
    if (this._gpPoller) {
      clearTimeout(this._gpPoller);
      this._gpPoller = 0;
    }
  }

  applyGamepadReorder() {
    if (this.selectedGamepadIndex === null) return;
    try {
      if (!this._originalGetGamepads) {
        this._originalGetGamepads = navigator.getGamepads ? navigator.getGamepads.bind(navigator) : null;
      }
      const orig = this._originalGetGamepads || (() => []);
      const sel = this.selectedGamepadIndex;
      navigator.getGamepads = () => {
        const arr = orig() || [];
        if (!arr || arr.length <= sel) return arr;
        const selected = arr[sel];
        if (!selected) return arr;
        // Put selected at index 0, keep others in the same order skipping selected
        const reordered = [selected, ...arr.filter((_: any, i: number) => i !== sel)];
        return reordered;
      };
    } catch (e) {
      console.warn('Failed to patch navigator.getGamepads', e);
    }
  }

  restoreGamepadGetter() {
    try {
      if (this._originalGetGamepads) {
        navigator.getGamepads = this._originalGetGamepads;
        this._originalGetGamepads = null;
      }
    } catch (e) {
      // ignore
    }
  }
}
