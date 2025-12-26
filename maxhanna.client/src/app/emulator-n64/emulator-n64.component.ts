import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import createMupen64PlusWeb, { writeAutoInputConfig } from 'mupen64plus-web';

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
  // mapping: N64 control name -> { type: 'button'|'axis', index: number, axisDir?: 1|-1 }
  mapping: Record<string, any> = {};
  n64Controls = ['A Button','B Button','Z Trig','Start','DPad U','DPad D','DPad L','DPad R','C Button U','C Button D','C Button L','C Button R','L Trig','R Trig','Analog X+','Analog X-','Analog Y+','Analog Y-'];
  private _recordingFor: string | null = null;
  exportText: string | null = null;
  private _runtimeTranslatorEnabled = false;
  private _originalGetGamepadsRuntime: any = null;

  // mapping of control name -> virtual button index that emulator will read (we choose a stable layout)
  private _virtualIndexForControl: Record<string, number> = {
    'A Button': 0,
    'B Button': 1,
    'Z Trig': 2,
    'Start': 3,
    'DPad U': 4,
    'DPad D': 5,
    'DPad L': 6,
    'DPad R': 7,
    'C Button U': 8,
    'C Button D': 9,
    'C Button L': 10,
    'C Button R': 11,
    'L Trig': 12,
    'R Trig': 13
  };

  constructor() {
    super();
  }

  ngOnInit(): void {}
  ngOnDestroy(): void { 
    this.restoreGamepadGetter();
  } 

  // load saved mapping on init if present
  private _mappingKey = 'n64_gamepad_mapping_v1';

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
  

  clearSelection() {
    this.romInput.nativeElement.value = '';
    this.romBuffer = undefined;
    this.romName = undefined;
  }

  // -- Mapping helpers -------------------------------------------------------
  startRecording(control: string) {
    this._recordingFor = control;
    this.parentRef?.showNotification(`Recording mapping for ${control}. Press a button on the controller.`);
    // start a short-term poller to capture the first pressed button
    const cap = () => {
      const g = navigator.getGamepads ? navigator.getGamepads() : [];
      for (let i = 0; i < g.length; i++) {
        const gp = g[i];
        if (!gp) continue;
        for (let b = 0; b < gp.buttons.length; b++) {
          if ((gp.buttons[b] as any).pressed) {
            this.mapping[control] = { type: 'button', index: b, gpIndex: gp.index };
            this._recordingFor = null;
            this.parentRef?.showNotification(`${control} mapped to button ${b} (gamepad ${gp.index})`);
            return;
          }
        }
        // simple axis capture (if axis beyond threshold)
        for (let a = 0; a < gp.axes.length; a++) {
          const v = gp.axes[a];
          if (Math.abs(v) > 0.7) {
            this.mapping[control] = { type: 'axis', index: a, axisDir: v > 0 ? 1 : -1, gpIndex: gp.index };
            this._recordingFor = null;
            this.parentRef?.showNotification(`${control} mapped to axis ${a} ${v > 0 ? '+' : '-'}`);
            return;
          }
        }
      }
      if (this._recordingFor) {
        setTimeout(cap, 200);
      }
    };
    cap();
  }

  formatMapping(m: any) {
    if (!m) return '';
    if (m.type === 'button') return `button ${m.index} (gp ${m.gpIndex})`;
    if (m.type === 'axis') return `axis ${m.index} ${m.axisDir === 1 ? '+' : '-' } (gp ${m.gpIndex})`;
    return JSON.stringify(m);
  }

  saveMapping() {
    try {
      localStorage.setItem(this._mappingKey, JSON.stringify(this.mapping || {}));
      this.parentRef?.showNotification('Mapping saved');
    } catch (e) {
      console.error('Failed to save mapping', e);
    }
  }

  loadMapping() {
    try {
      const raw = localStorage.getItem(this._mappingKey);
      if (raw) {
        this.mapping = JSON.parse(raw);
        this.parentRef?.showNotification('Mapping loaded');
      } else {
        this.parentRef?.showNotification('No saved mapping found');
      }
    } catch (e) {
      console.error('Failed to load mapping', e);
    }
  }

  exportMapping() {
    // Provide JSON and a simple INI-like snippet for manual insertion into InputAutoCfg
    const json = JSON.stringify(this.mapping, null, 2);
    const lines: string[] = ['# N64 mapping export (manual format)'];
    const handled = new Set<string>();
    // pair analog axes into X/Y Axis entries when both sides present
    const tryPair = (minusKey: string, plusKey: string, axisName: string) => {
      const mMinus = this.mapping[minusKey];
      const mPlus = this.mapping[plusKey];
      if (mMinus && mPlus && mMinus.type === 'axis' && mPlus.type === 'axis' && mMinus.gpIndex === mPlus.gpIndex) {
        lines.push(`${axisName} = axis(${mMinus.index}-,${mPlus.index}+)`);
        handled.add(minusKey);
        handled.add(plusKey);
        return true;
      }
      return false;
    };

    tryPair('Analog X-', 'Analog X+', 'X Axis');
    tryPair('Analog Y-', 'Analog Y+', 'Y Axis');

    for (const ctrl of Object.keys(this.mapping)) {
      if (handled.has(ctrl)) continue;
      const m = this.mapping[ctrl];
      if (m.type === 'button') {
        lines.push(`${ctrl} = button(${m.index})`);
      } else if (m.type === 'axis') {
        // single-sided axis
        lines.push(`${ctrl} = axis(${m.index}${m.axisDir === -1 ? '-' : '+'})`);
      } else {
        lines.push(`${ctrl} = ${JSON.stringify(m)}`);
      }
    }
    this.exportText = `JSON:\n${json}\n\nINI-LIKE:\n${lines.join('\n')}`;
  }

  /** Apply the current mapping into the emulator's InputAutoCfg (IDBFS) and restart emulator. */
  async applyMappingToEmulator() {
    try {
      // Build config entries from our mapping object, pairing analog axes when possible
      const config: Record<string, string> = {};
      const handled = new Set<string>();

      const pairAxis = (minusKey: string, plusKey: string, axisName: string) => {
        const mMinus = this.mapping[minusKey];
        const mPlus = this.mapping[plusKey];
        if (mMinus && mPlus && mMinus.type === 'axis' && mPlus.type === 'axis' && mMinus.gpIndex === mPlus.gpIndex) {
          // e.g. X Axis = axis(0-,0+)
          config[axisName] = `axis(${mMinus.index}-,${mPlus.index}+)`;
          handled.add(minusKey);
          handled.add(plusKey);
          return true;
        }
        return false;
      };

      pairAxis('Analog X-', 'Analog X+', 'X Axis');
      pairAxis('Analog Y-', 'Analog Y+', 'Y Axis');

      for (const key of Object.keys(this.mapping)) {
        if (handled.has(key)) continue;
        const m = this.mapping[key];
        if (!m) continue;
        if (m.type === 'button') {
          config[key] = `button(${m.index})`;
        } else if (m.type === 'axis') {
          config[key] = `axis(${m.index}${m.axisDir === -1 ? '-' : '+'})`;
        }
      }

      // Decide joystick name using one of the mapped gpIndex values
      const anyEntry = Object.values(this.mapping).find((v: any) => v && v.gpIndex != null);
      const gpIndex = anyEntry ? anyEntry.gpIndex : this.selectedGamepadIndex;
      const gp = (navigator.getGamepads ? navigator.getGamepads() : [])[gpIndex ?? 0];
      const joyName = (gp && gp.id) ? gp.id : `Custom Gamepad ${gpIndex ?? 0}`;

      // Stop emulator if running
      const wasRunning = !!this.instance || this.status === 'running';
      if (wasRunning) {
        await this.stop();
        // small pause to ensure IDBFS is writable
        await new Promise((r) => setTimeout(r, 150));
      }

      // write config into emulator IDBFS
      await writeAutoInputConfig(joyName, config as any);
      this.parentRef?.showNotification('Applied mapping to emulator configuration');

      // enable runtime translator so mapping takes effect immediately without restart
      this.enableRuntimeTranslator();

      // restart emulator if it was running
      if (wasRunning) {
        await this.boot();
      }
    } catch (e) {
      console.error('Failed to apply mapping to emulator', e);
      this.parentRef?.showNotification('Failed to apply mapping');
    }
  }

  /** Called when user picks a different controller in the UI. */
  async onSelectGamepad(value: string | number) {
    const idx = Number(value);
    this.selectedGamepadIndex = Number.isNaN(idx) ? null : idx;
    // update the list (keep the explicit selection)
    this.refreshGamepads();

    // If emulator is currently running, restart it so it binds the new controller
    if (this.instance || this.status === 'running') {
      try {
        // stop current instance (restores getGamepads)
        await this.stop();
        // small delay to ensure resources are cleaned up
        await new Promise((r) => setTimeout(r, 120));
        // boot will reapply the gamepad reorder and start the emulator
        await this.boot();
      } catch (e) {
        console.error('Failed to restart emulator with new controller', e);
        this.parentRef?.showNotification('Failed to restart emulator with selected controller');
      }
    }
  }

  // -- Emulator control methods ---------------------------------------------
  async boot() {
    if (!this.romBuffer) {
      this.parentRef?.showNotification('Pick a ROM first');
      return;
    }
    const canvasEl = this.canvas?.nativeElement as HTMLCanvasElement | undefined;
    if (!canvasEl) {
      this.parentRef?.showNotification('No canvas available');
      return;
    }

    this.loading = true;
    this.status = 'booting';
    try {
      // ensure selected gamepad is exposed as player 1
      this.applyGamepadReorder();

      this.instance = await createMupen64PlusWeb({
        canvas: canvasEl,
        romData: new Int8Array(this.romBuffer!),
        beginStats: () => {},
        endStats: () => {},
        coreConfig: { emuMode: 0 },
        setErrorStatus: (errorMessage: string) => {
          console.log('Mupen error:', errorMessage);
        },
        locateFile: (path: string, prefix?: string) => {
          return `/assets/mupen64plus/${path}`;
        }
      });

      if (this.instance && typeof this.instance.start === 'function') {
        await this.instance.start();
        this.status = 'running';
        this.parentRef?.showNotification(`Booted ${this.romName}`);
      } else {
        this.status = 'error';
        throw new Error('Emulator instance missing start method');
      }
    } catch (ex) {
      console.error('Failed to boot emulator', ex);
      this.status = 'error';
      this.parentRef?.showNotification('Failed to boot emulator');
      // ensure we restore patched getter on failure
      this.restoreGamepadGetter();
      throw ex;
    } finally {
      this.loading = false;
    }
  }

  async stop() {
    try {
      if (this.instance && typeof this.instance.stop === 'function') {
        await this.instance.stop();
      }
    } catch (e) {
      console.error('Error stopping emulator', e);
    } finally {
      this.instance = null;
      this.status = 'stopped';
      // disable runtime translator if enabled
      this.disableRuntimeTranslator();
      this.restoreGamepadGetter();
      this.parentRef?.showNotification('Emulator stopped');
    }
  }

  async pause() {
    try {
      if (this.instance && typeof this.instance.pause === 'function') {
        await this.instance.pause();
        this.status = 'paused';
      }
    } catch (e) {
      console.error('Error pausing emulator', e);
    }
  }

  async resume() {
    try {
      if (this.instance && typeof this.instance.resume === 'function') {
        await this.instance.resume();
        this.status = 'running';
      }
    } catch (e) {
      console.error('Error resuming emulator', e);
    }
  }

  // -- Runtime translator ----------------------------------------------------
  enableRuntimeTranslator() {
    if (this._runtimeTranslatorEnabled) return;
    try {
      this._originalGetGamepadsRuntime = navigator.getGamepads ? navigator.getGamepads.bind(navigator) : null;
      const self = this;
      navigator.getGamepads = function() {
        const origArr = (self._originalGetGamepadsRuntime ? self._originalGetGamepadsRuntime() : []) || [];
        const out: any[] = [];
        for (let gi = 0; gi < origArr.length; gi++) {
          const gp = origArr[gi];
          if (!gp) { out.push(null); continue; }
          // build virtual buttons array
          const maxButtons = 16; // ensure enough slots
          const virtButtons: any[] = [];
          for (let i = 0; i < maxButtons; i++) {
            virtButtons.push({ pressed: false, touched: false, value: 0 });
          }
          // copy original buttons to a temp map
          const origButtons = (gp.buttons || []).map((b: any) => ({ pressed: !!b.pressed, value: b.value ?? (b.pressed ? 1 : 0) }));
          // for each mapping entry that targets this physical gamepad, map into virtual indexes
          for (const ctrl of Object.keys(self.mapping)) {
            const m = self.mapping[ctrl];
            if (!m || m.gpIndex == null) continue;
            if (m.gpIndex !== gp.index) continue;
            if (m.type === 'button') {
              const phys = m.index;
              const virt = self._virtualIndexForControl[ctrl];
              if (virt == null) continue;
              const b = origButtons[phys];
              if (b) virtButtons[virt] = { pressed: !!b.pressed, touched: !!b.pressed, value: b.value };
            }
            // axis mapping: we will synthesize virtual axes by placing axis value in designated slots
            if (m.type === 'axis') {
              // find a virtual axis index for X/Y by convention: use 0 for X, 1 for Y
              let virtAxisIndex = -1;
              if (ctrl.startsWith('Analog X')) virtAxisIndex = 0;
              if (ctrl.startsWith('Analog Y')) virtAxisIndex = 1;
              // we'll store axes later
            }
          }
          // Build virtual axes array
          const origAxes = gp.axes || [];
          const virtAxes: number[] = [];
          // default to copying first two axes into the first two virtual slots
          virtAxes[0] = origAxes[0] ?? 0;
          virtAxes[1] = origAxes[1] ?? 0;
          // create a virtual gamepad-like object
          const vgp = {
            id: gp.id,
            index: gp.index,
            connected: gp.connected,
            mapping: gp.mapping,
            axes: virtAxes,
            buttons: virtButtons,
            timestamp: gp.timestamp
          };
          out[gi] = vgp;
        }
        return out as any;
      } as any;
      this._runtimeTranslatorEnabled = true;
      this.parentRef?.showNotification('Runtime input translator enabled');
    } catch (e) {
      console.error('Failed to enable runtime translator', e);
    }
  }

  disableRuntimeTranslator() {
    if (!this._runtimeTranslatorEnabled) return;
    try {
      if (this._originalGetGamepadsRuntime) {
        navigator.getGamepads = this._originalGetGamepadsRuntime;
        this._originalGetGamepadsRuntime = null;
      }
    } catch (e) {
      // ignore
    }
    this._runtimeTranslatorEnabled = false;
    this.parentRef?.showNotification('Runtime input translator disabled');
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
