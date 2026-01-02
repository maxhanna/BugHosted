import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import createMupen64PlusWeb, { writeAutoInputConfig } from 'mupen64plus-web';
import { FileService } from '../../services/file.service';
import { RomService } from '../../services/rom.service';
import { FileEntry } from '../../services/datacontracts/file/file-entry';

@Component({
  selector: 'app-emulator-n64',
  templateUrl: './emulator-n64.component.html',
  styleUrl: './emulator-n64.component.css',
  standalone: false
})
export class EmulatorN64Component extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('romInput') romInput!: ElementRef<HTMLInputElement>;
  @ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('fullscreenContainer') fullscreenContainer!: ElementRef<HTMLDivElement>;

  loading = false;
  status = 'idle';
  romName?: string;
  private romBuffer?: ArrayBuffer;
  private instance: any;
  gamepads: Array<{ index: number; id: string; mapping: string; connected: boolean }> = [];
  selectedGamepadIndex: number | null = null;
  showKeyMappings = false;
  // Named mapping store
  savedMappingsNames: string[] = [];
  private _mappingsStoreKey = 'n64_mappings_store_v1';
  selectedMappingName: string | null = null;
  private _gpPoller = 0;
  private _originalGetGamepads: any = null;
  // mapping: N64 control name -> { type: 'button'|'axis', index: number, axisDir?: 1|-1 }
  mapping: Record<string, any> = {};
  n64Controls = ['A Button', 'B Button', 'Z Trig', 'Start', 'DPad U', 'DPad D', 'DPad L', 'DPad R', 'C Button U', 'C Button D', 'C Button L', 'C Button R', 'L Trig', 'R Trig', 'Analog X+', 'Analog X-', 'Analog Y+', 'Analog Y-'];
  private _recordingFor: string | null = null;
  exportText: string | null = null;
  private _runtimeTranslatorEnabled = false;
  private _originalGetGamepadsRuntime: any = null;
  directInjectMode = false;
  private _directInjectPoller = 0;
  private _directPrevState: Record<string, boolean> = {};
  isMenuPanelVisible: boolean = false;
  isFullScreen: boolean = false;
  private _mappingKey = 'n64_gamepad_mapping_v1';
  showFileSearch = false;
  private _canvasResizeAdded = false;
  private _resizeHandler = () => this.resizeCanvasToParent();
  private _resizeObserver?: ResizeObserver;
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

  constructor(private fileService: FileService, private romService: RomService) {
    super();
  }

  // Load the list of named mappings from localStorage
  async loadMappingsList() {
    // Try to load from backend first, fall back to localStorage
    try {
      const uid = this.parentRef?.user?.id;
      if (uid) {
        const names = await this.romService.listMappings(uid);
        if (names && Array.isArray(names)) {
          this.savedMappingsNames = names.sort();
          if (this.selectedMappingName && !this.savedMappingsNames.includes(this.selectedMappingName)) {
            this.selectedMappingName = null;
          }
          return;
        }
      }
    } catch (e) {
      console.warn('Backend mappings list failed, falling back to localStorage', e);
    }

    try {
      const raw = localStorage.getItem(this._mappingsStoreKey);
      const store = raw ? JSON.parse(raw) : {};
      this.savedMappingsNames = Object.keys(store || {}).sort();
      if (this.selectedMappingName && !this.savedMappingsNames.includes(this.selectedMappingName)) {
        this.selectedMappingName = null;
      }
    } catch (e) {
      console.error('Failed to load mappings list', e);
      this.savedMappingsNames = [];
      this.selectedMappingName = null;
    }
  }

  // Prompt the user for a mapping name and save the current mapping under that name
  async saveMappingAs() {
    try {
      const name = window.prompt('Enter a name for this mapping:');
      if (!name) return;
      const uid = this.parentRef?.user?.id;
      const payload = JSON.parse(JSON.stringify(this.mapping || {}));
      if (uid) {
        // Ask server for list first to avoid attempting save when limit reached
        try {
          const names = await this.romService.listMappings(uid);
          if (names && Array.isArray(names) && names.length >= 50 && !names.includes(name)) {
            this.parentRef?.showNotification('Mapping limit reached (50). Delete an existing mapping before adding a new one.');
            return;
          }
        } catch (e) {
          // ignore and try save; server-side also enforces limit
        }

        const res = await this.romService.saveMapping(uid, name, payload);
        if (res && res.ok) {
          this.parentRef?.showNotification(`Mapping saved as "${name}"`);
          await this.loadMappingsList();
          this.selectedMappingName = name;
          return;
        }

        // if server returned a structured error (e.g. limit reached), show it and do not fallback
        if (res && !res.ok) {
          const msg = res.text || `Server rejected save (status ${res.status})`;
          this.parentRef?.showNotification(msg);
          return;
        }
        // otherwise res === null means server unreachable; fall back to localStorage
      }

      // fallback to localStorage
      const raw = localStorage.getItem(this._mappingsStoreKey);
      const store = raw ? JSON.parse(raw) : {};
      // enforce local limit as well if storing locally
      const existingLocalCount = Object.keys(store || {}).length;
      if (!store[name] && existingLocalCount >= 50) {
        this.parentRef?.showNotification('Local mapping limit reached (50). Delete a mapping before adding a new one.');
        return;
      }
      if (store[name]) {
        const overwrite = window.confirm(`A mapping named "${name}" already exists. Overwrite?`);
        if (!overwrite) return;
      }
      store[name] = payload;
      localStorage.setItem(this._mappingsStoreKey, JSON.stringify(store));
      this.parentRef?.showNotification(`Mapping saved as "${name}" (local)`);
      this.loadMappingsList();
      this.selectedMappingName = name;
    } catch (e) {
      console.error('Failed to save mapping as', e);
      this.parentRef?.showNotification('Failed to save mapping');
    }
  }

  // Apply a named mapping (set mapping and apply to emulator)
  async applySelectedMapping() {
    if (!this.selectedMappingName) return;
    try {
      const uid = this.parentRef?.user?.id;
      if (uid) {
        try {
          const m = await this.romService.getMapping(uid, this.selectedMappingName as string);
          if (m) {
            this.mapping = JSON.parse(JSON.stringify(m));
            await this.applyMappingToEmulator();
            this.parentRef?.showNotification(`Applied mapping "${this.selectedMappingName}"`);
            return;
          }
        } catch (e) {
          console.warn('Backend mapping fetch failed, falling back to localStorage', e);
        }
      }

      // fallback to localStorage
      const raw = localStorage.getItem(this._mappingsStoreKey);
      const store = raw ? JSON.parse(raw) : {};
      const m = store[this.selectedMappingName];
      if (!m) {
        this.parentRef?.showNotification('Selected mapping not found');
        this.loadMappingsList();
        return;
      }
      this.mapping = JSON.parse(JSON.stringify(m));
      await this.applyMappingToEmulator();
      this.parentRef?.showNotification(`Applied mapping "${this.selectedMappingName}"`);
    } catch (e) {
      console.error('Failed to apply selected mapping', e);
      this.parentRef?.showNotification('Failed to apply mapping');
    }
  }

  // Optional: delete a named mapping
  async deleteSelectedMapping() {
    if (!this.selectedMappingName) return;
    try {
      const ok = window.confirm(`Delete mapping "${this.selectedMappingName}"?`);
      if (!ok) return;
      const uid = this.parentRef?.user?.id;
      if (uid) {
        const res = await this.romService.deleteMapping(uid, this.selectedMappingName as string);
        if (res) {
          this.parentRef?.showNotification(`Deleted mapping "${this.selectedMappingName}"`);
          this.selectedMappingName = null;
          await this.loadMappingsList();
          return;
        }
        // if backend delete failed, fall through to local deletion
      }

      const raw = localStorage.getItem(this._mappingsStoreKey);
      const store = raw ? JSON.parse(raw) : {};
      delete store[this.selectedMappingName];
      localStorage.setItem(this._mappingsStoreKey, JSON.stringify(store));
      this.parentRef?.showNotification(`Deleted mapping "${this.selectedMappingName}" (local)`);
      this.selectedMappingName = null;
      this.loadMappingsList();
    } catch (e) {
      console.error('Failed to delete mapping', e);
      this.parentRef?.showNotification('Failed to delete mapping');
    }
  }

  // Called by template when user selects a mapping from the dropdown
  onMappingSelect(name: string) {
    if (!name) return;
    this.selectedMappingName = name;
    this.applySelectedMapping();
  }

  ngOnInit(): void { }

  ngAfterViewInit(): void {
    const canvasEl = this.canvas?.nativeElement;
    if (!canvasEl) return;
    if (canvasEl.id !== 'canvas') canvasEl.id = 'canvas';

    const container = (this.fullscreenContainer?.nativeElement) ??
      canvasEl.parentElement ?? document.body;

    // Initial sizing before anything starts
    this.resizeCanvasToParent();

    // Observe container resizes
    this._resizeObserver = new ResizeObserver(() => {
      this.resizeCanvasToParent();
      // Nudge SDL/Emscripten so input/viewports realign
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    });
    this._resizeObserver.observe(container);

    // Also listen to fullscreen & orientation changes (mobile)
    document.addEventListener('fullscreenchange', this._resizeHandler);
    window.addEventListener('orientationchange', this._resizeHandler);
  }

  ngOnDestroy(): void {
    this.stop();
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = undefined;
    }

    if (this._canvasResizeAdded) {
      try { window.removeEventListener('resize', this._resizeHandler); } catch { }
      this._canvasResizeAdded = false;
    }
    try {
      document.removeEventListener('fullscreenchange', this._resizeHandler);
      window.removeEventListener('orientationchange', this._resizeHandler);
    } catch { }
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
      // Ensure canvas fills parent container before initializing the emulator
      this.resizeCanvasToParent();
      if (!this._canvasResizeAdded) {
        try { window.addEventListener('resize', this._resizeHandler); this._canvasResizeAdded = true; } catch { }
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
        innerWidth: canvasEl.width,
        innerHeight: canvasEl.height,
        beginStats: () => { },
        endStats: () => { },
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
    console.log('instance.Module:', (this.instance as any)?.Module);
    console.log('global Module:', (globalThis as any).Module);
    console.log('global FS:', (globalThis as any).FS);
  }

  // Resize canvas pixel buffer and CSS to fill the parent container

  private resizeCanvasToParent() {
    try {
      const canvasEl = this.canvas?.nativeElement as HTMLCanvasElement | undefined;
      if (!canvasEl) return;

      const container = (this.fullscreenContainer?.nativeElement) ??
        (canvasEl.parentElement ?? document.body);

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      // 1) CSS size controls layout
      canvasEl.style.width = rect.width + 'px';
      canvasEl.style.height = rect.height + 'px';

      // 2) Backing buffer scaled for crisp rendering
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvasEl.width !== w) canvasEl.width = w;
      if (canvasEl.height !== h) canvasEl.height = h;
    } catch (e) {
      console.warn('Failed to resize canvas', e);
    }
  }


  /** Handler for file selected from the file-search component. */
  async onFileSearchSelected(file: FileEntry) {
    try {
      if (!file) {
        this.parentRef?.showNotification('Invalid file selected');
        return;
      }
      // Try to fetch the file bytes from the server endpoint. Adjust URL if your API differs.
      const response = await this.romService.getRomFile(file.fileName ?? "", this.parentRef?.user?.id);

      if (!response) {
        this.parentRef?.showNotification('Failed to download selected ROM');
        return;
      }
      const buffer = await response.arrayBuffer();
      this.romBuffer = buffer;
      this.romName = file.fileName || "";
      this.parentRef?.showNotification(`Loaded ${this.romName} from search`);
      // Auto-boot after selection for convenience
      try {
        await this.boot();
      } catch (e) {
        // boot will show notifications on failure
      }
    } catch (e) {
      console.error('Error loading ROM from search', e);
      this.parentRef?.showNotification('Error loading ROM from search');
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
    if (m.type === 'axis') return `axis ${m.index} ${m.axisDir === 1 ? '+' : '-'} (gp ${m.gpIndex})`;
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
      console.debug('Applying mapping to emulator. joyName=', joyName, 'config=', config);
      await writeAutoInputConfig(joyName, config as any);
      this.parentRef?.showNotification('Applied mapping to emulator configuration');

      // enable runtime translator so mapping takes effect immediately without restart
      if (this.directInjectMode) {
        this.enableDirectInject();
      } else {
        this.enableRuntimeTranslator();
      }

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
    this.directInjectMode = true;
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

    // ✨ Make sure the backing buffer matches the container *now*
    this.resizeCanvasToParent();

    // Attach listeners if they weren’t added in file-select path
    if (!this._canvasResizeAdded) {
      try {
        window.addEventListener('resize', this._resizeHandler);
        document.addEventListener('fullscreenchange', this._resizeHandler); // also catch fullscreen exit
        window.addEventListener('orientationchange', this._resizeHandler);  // mobile rotate
        this._canvasResizeAdded = true;
      } catch { /* ignore */ }
    }

    this.loading = true;
    this.status = 'booting';
    try {
      this.applyGamepadReorder();
      if (Object.keys(this.mapping).length || this.selectedGamepadIndex !== null) {
        if (this.directInjectMode) this.enableDirectInject();
        else this.enableRuntimeTranslator();
      }

      // Use the *freshly* sized backing buffer here
      this.instance = await createMupen64PlusWeb({
        canvas: canvasEl,
        innerWidth: canvasEl.width,
        innerHeight: canvasEl.height,
        romData: new Int8Array(this.romBuffer!),
        beginStats: () => { },
        endStats: () => { },
        coreConfig: { emuMode: 0 },
        setErrorStatus: (msg: string) => console.log('Mupen error:', msg),
        locateFile: (path: string) => `/assets/mupen64plus/${path}`,
      });

      if (this.instance && typeof this.instance.start === 'function') {
        await this.instance.start();
        this.status = 'running';
        this.parentRef?.showNotification(`Booted ${this.romName}`);

        // Kick SDL/Emscripten to re-validate layout once rendering begins
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); // harmless nudge
        // (SDL/Emscripten often recomputes on window resize/fullscreen events) [2](https://wiki.libsdl.org/SDL2/README-emscripten)[3](https://stackoverflow.com/questions/63987317/proper-way-to-handle-sdl2-resizing-in-emscripten)
      } else {
        this.status = 'error';
        throw new Error('Emulator instance missing start method');
      }
    } catch (ex) {
      console.error('Failed to boot emulator', ex);
      this.status = 'error';
      this.parentRef?.showNotification('Failed to boot emulator');
      this.restoreGamepadGetter();
      throw ex;
    } finally {
      this.loading = false;
      console.log('instance.Module:', (this.instance as any)?.Module);
      console.log('global Module:', (globalThis as any).Module);
      console.log('global FS:', (globalThis as any).FS);
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
      this.disableDirectInject();
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
      navigator.getGamepads = function () {
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

  // -- Direct-inject mode: poll gamepads and synthesize input events (keyboard)
  enableDirectInject() {
    if (this._directInjectPoller) return;
    this._directPrevState = {};
    const poll = () => {
      try {
        const g = navigator.getGamepads ? navigator.getGamepads() : [];
        for (let i = 0; i < g.length; i++) {
          const gp = g[i];
          if (!gp) continue;
          // for every mapping entry, if it targets this gp index, map to keys
          for (const ctrl of Object.keys(this.mapping)) {
            const m = this.mapping[ctrl];
            if (!m || m.gpIndex == null) continue;
            if (m.gpIndex !== gp.index) continue;
            const stateKey = `${gp.index}:${ctrl}`;
            if (m.type === 'button') {
              const pressed = !!(gp.buttons && gp.buttons[m.index] && (gp.buttons[m.index] as any).pressed);
              const prev = !!this._directPrevState[stateKey];
              const keyCode = this.getKeyForControl(ctrl);
              if (pressed && !prev) {
                this.dispatchKeyboard(keyCode, true);
                this._directPrevState[stateKey] = true;
              } else if (!pressed && prev) {
                this.dispatchKeyboard(keyCode, false);
                this._directPrevState[stateKey] = false;
              }
            }
            if (m.type === 'axis') {
              const aidx = m.index;
              const val = (gp.axes && gp.axes[aidx]) || 0;
              const plusKey = this.getKeyForControl(ctrl.replace(/[-+]$/, '+'));
              const minusKey = this.getKeyForControl(ctrl.replace(/[-+]$/, '-'));
              // threshold-based mapping
              if (val > 0.5) {
                const pk = `${gp.index}:${ctrl}:+`;
                if (!this._directPrevState[pk]) {
                  if (plusKey) this.dispatchKeyboard(plusKey, true);
                  this._directPrevState[pk] = true;
                }
              } else {
                const pk = `${gp.index}:${ctrl}:+`;
                if (this._directPrevState[pk]) {
                  if (plusKey) this.dispatchKeyboard(plusKey, false);
                  this._directPrevState[pk] = false;
                }
              }
              if (val < -0.5) {
                const mk = `${gp.index}:${ctrl}:-`;
                if (!this._directPrevState[mk]) {
                  if (minusKey) this.dispatchKeyboard(minusKey, true);
                  this._directPrevState[mk] = true;
                }
              } else {
                const mk = `${gp.index}:${ctrl}:-`;
                if (this._directPrevState[mk]) {
                  if (minusKey) this.dispatchKeyboard(minusKey, false);
                  this._directPrevState[mk] = false;
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('Direct-inject poll error', e);
      }
      this._directInjectPoller = window.setTimeout(poll, 80) as any;
    };
    poll();
    this.parentRef?.showNotification('Direct-inject input mode enabled');
  }

  disableDirectInject() {
    if (this._directInjectPoller) {
      clearTimeout(this._directInjectPoller as any);
      this._directInjectPoller = 0;
    }
    this._directPrevState = {};
    this.parentRef?.showNotification('Direct-inject input mode disabled');
  }

  // map a logical N64 control name to a keyboard code used for synthetic events
  private getKeyForControl(ctrl: string): string | null {
    const map: Record<string, string> = {
      'A Button': 'KeyZ',
      'B Button': 'KeyX',
      'Z Trig': 'KeyA',
      'Start': 'Enter',
      'DPad U': 'ArrowUp',
      'DPad D': 'ArrowDown',
      'DPad L': 'ArrowLeft',
      'DPad R': 'ArrowRight',
      'C Button U': 'KeyI',
      'C Button D': 'KeyK',
      'C Button L': 'KeyJ',
      'C Button R': 'KeyL',
      'L Trig': 'KeyQ',
      'R Trig': 'KeyW',
      'Analog X+': 'ArrowRight',
      'Analog X-': 'ArrowLeft',
      'Analog Y+': 'ArrowDown',
      'Analog Y-': 'ArrowUp'
    };
    return map[ctrl] || null;
  }

  // dispatch a synthetic keyboard event on the canvas so the emulator (SDL) can pick it up
  private dispatchKeyboard(code: string | null, down: boolean) {
    try {
      if (!code) return;
      const canvasEl = this.canvas?.nativeElement as HTMLCanvasElement | undefined;
      if (!canvasEl) return;
      const eventType = down ? 'keydown' : 'keyup';
      const ev = new KeyboardEvent(eventType, { bubbles: true, cancelable: true, code: code, key: code });
      canvasEl.dispatchEvent(ev);
      console.debug('Dispatched', eventType, 'for', code);
    } catch (e) {
      console.warn('Failed to dispatch keyboard event', e);
    }
  }

  toggleDirectInject(enabled?: boolean) {
    if (typeof enabled === 'boolean') this.directInjectMode = enabled;
    else this.directInjectMode = !this.directInjectMode;
    if (this.directInjectMode) this.enableDirectInject();
    else this.disableDirectInject();
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
  showMenuPanel() {
    this.isMenuPanelVisible = true;
    this.parentRef?.showOverlay();
    this.loadMappingsList();
  }
  closeMenuPanel() {
    this.isMenuPanelVisible = false;
    this.parentRef?.closeOverlay();
  }


  async toggleFullscreen() {
    this.closeMenuPanel();
    const canvas = this.canvas?.nativeElement;
    if (!this.isFullScreen) {
      await canvas?.requestFullscreen();
    } else {
      await document.exitFullscreen?.();
    }
    this.isFullScreen = !!document.fullscreenElement;
  }

  
/** Export savestate by enumerating all IndexedDB DBs/stores and downloading newest match. */
async exportSavestateFromIndexedDB(slot: number = 0) {
  const exts = ['.st', '.sav', '.state', '.bin'];
  const slotTokens = [`slot${slot}`, `.st${slot}`, `_${slot}.st`, `.${slot}.st`];

  const looksLikeState = (key: any) => {
    const s = String(key).toLowerCase();
    const hasExt = exts.some((e) => s.endsWith(e));
    const looksSlot = slotTokens.some((t) => s.includes(t));
    return hasExt || looksSlot;
  };

  const toArrayBuffer = (u8: Uint8Array) => u8.slice().buffer;

  try {
    const candidates: Array<{ dbName: string; store: string; key: any; when: number; ab: ArrayBuffer }> = [];
    const dbMetaList: Array<{ name?: string }> =
      (indexedDB as any).databases ? await (indexedDB as any).databases() : [];

    const openDb = (name: string) =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(name);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });

    for (const meta of dbMetaList) {
      const name = meta.name;
      if (!name) continue;
      let db: IDBDatabase | null = null;
      try {
        db = await openDb(name);
        const stores = Array.from(db.objectStoreNames);

        for (const storeName of stores) {
          const tx = db.transaction(storeName, 'readonly');
          const os = tx.objectStore(storeName);

          const rows: Array<{ key: any; val: any }> = await new Promise((resolve, reject) => {
            const res: Array<{ key: any; val: any }> = [];
            const cursorReq = os.openCursor();
            cursorReq.onerror = () => reject(cursorReq.error);
            cursorReq.onsuccess = (ev: any) => {
              const cursor = ev.target.result;
              if (cursor) { res.push({ key: cursor.key, val: cursor.value }); cursor.continue(); }
              else resolve(res);
            };
          });

          for (const { key, val } of rows) {
            // Heuristic #1: key looks like savestate path
            if (looksLikeState(key)) {
              const ab = normalizeToArrayBuffer(val);
              if (ab) candidates.push({ dbName: name, store: storeName, key, when: Date.now(), ab });
              continue;
            }
            // Heuristic #2: value object has a path/name field that looks like savestate
            const path = val?.path || val?.name || val?.filename || val?.url;
            if (path && looksLikeState(path)) {
              const ab = normalizeToArrayBuffer(val);
              if (ab) candidates.push({ dbName: name, store: storeName, key, when: Date.now(), ab });
              continue;
            }
          }
        }
      } catch (e) {
        console.warn(`IndexedDB read error for DB "${name}"`, e);
      } finally {
        try { db?.close(); } catch {}
      }
    }

    if (!candidates.length) {
      this.parentRef?.showNotification('No savestate found in IndexedDB.');
      return;
    }

    // newest candidate (we’re using Date.now() as we scan)
    const best = candidates.sort((a, b) => b.when - a.when)[0];
    const filename = this.composeSavestateFilename(slot);

    const blob = new Blob([best.ab], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);

    this.parentRef?.showNotification(`Downloaded savestate from IndexedDB (db: ${best.dbName}, store: ${best.store})`);
  } catch (err) {
    console.error('IndexedDB export failed', err);
    this.parentRef?.showNotification('Failed to export savestate from IndexedDB');
  }

  /** Normalize typical Emscripten/IDBFS value shapes to ArrayBuffer. */
  function normalizeToArrayBuffer(val: any): ArrayBuffer | null {
    // Raw ArrayBuffer
    if (val instanceof ArrayBuffer) return val;
    // Typed arrays
    if (val?.buffer instanceof ArrayBuffer && typeof val.byteLength === 'number') {
      return val.buffer;
    }
    // Common object shapes in IDBFS-like stores:
    // { contents: Uint8Array|ArrayBuffer }   OR   { data: Uint8Array|ArrayBuffer }
    if (val?.contents) {
      const c = val.contents;
      if (c instanceof ArrayBuffer) return c;
      if (c?.buffer instanceof ArrayBuffer) return c.buffer;
    }
    if (val?.data) {
      const d = val.data;
      if (d instanceof ArrayBuffer) return d;
      if (d?.buffer instanceof ArrayBuffer) return d.buffer;
    }
    // Some stores stash bytes under { bytes: [...] } or { value: [...] }
    const arr = val?.bytes || val?.value;
    if (Array.isArray(arr)) return new Uint8Array(arr).buffer;

    // Final fallback: if val is string (base64?), try to decode
    if (typeof val === 'string' && /^[A-Za-z0-9+/=]+$/.test(val)) {
      try {
        const bin = atob(val);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return u8.buffer;
      } catch {}
    }
    return null;
  }
}


/** Diagnostic: enumerate IndexedDB, Cache Storage, and Web Storage and log what’s there. */
async dumpSiteStorage(slot: number = 0) {
  const exts = ['.st', '.sav', '.state', '.bin'];
  const slotTokens = [`slot${slot}`, `.st${slot}`, `_${slot}.st`, `.${slot}.st`];

  const looksLikeState = (name: string) => {
    const lower = name.toLowerCase();
    const hasExt = exts.some((e) => lower.endsWith(e));
    const looksSlot = slotTokens.some((t) => lower.includes(t));
    return hasExt || looksSlot;
  };

  console.group('=== Storage Dump (Cache, WebStorage, IndexedDB) ===');

  // ---- Cache Storage ----
  try {
    const cacheNames = await caches.keys();
    console.group('Cache Storage');
    console.log('cacheNames:', cacheNames);
    for (const name of cacheNames) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      const urls = keys.map((r) => r.url);
      console.log(`[${name}] entries:`, urls);
      const candidates = urls.filter(looksLikeState);
      if (candidates.length) console.warn(`[${name}] savestate candidates:`, candidates);
    }
    console.groupEnd();
  } catch (e) {
    console.warn('CacheStorage not available / failed:', e);
  }

  // ---- Web Storage ----
  try {
    console.group('Web Storage');
    const lsKeys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) || '');
    const ssKeys = Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i) || '');
    console.log('localStorage keys:', lsKeys);
    console.log('sessionStorage keys:', ssKeys);
    const lsCandidates = lsKeys.filter((k) => k && looksLikeState(k));
    const ssCandidates = ssKeys.filter((k) => k && looksLikeState(k));
    if (lsCandidates.length) console.warn('localStorage savestate-like keys:', lsCandidates);
    if (ssCandidates.length) console.warn('sessionStorage savestate-like keys:', ssCandidates);
    console.groupEnd();
  } catch (e) {
    console.warn('Web Storage scan failed:', e);
  }

  // ---- IndexedDB ----
  console.group('IndexedDB');
  const dbMetaList: Array<{ name?: string; version?: number }> =
    (indexedDB as any).databases ? await (indexedDB as any).databases() : [];

  if (!dbMetaList.length) {
    // Fallback: try opening a few likely names if databases() isn’t supported
    // NOTE: you can add known mount-point names here (e.g., '/data', '/mupen64plus')
    console.warn('indexedDB.databases() not supported; add known DB names to probe if needed.');
  } else {
    console.log('IndexedDB databases:', dbMetaList);
  }

  const openDb = (name: string) =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(name);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });

  // iterate over all DBs we can see
  for (const meta of dbMetaList) {
    const name = meta.name;
    if (!name) continue;
    try {
      const db = await openDb(name);
      console.group(`DB "${name}" (version ${db.version})`);

      const stores = Array.from(db.objectStoreNames);
      console.log('objectStores:', stores);
      for (const storeName of stores) {
        try {
          const tx = db.transaction(storeName, 'readonly');
          const os = tx.objectStore(storeName);
          console.group(`Store "${storeName}"`);

          // enumerate records
          const rows: Array<{ key: any; val: any }> = await new Promise((resolve, reject) => {
            const res: Array<{ key: any; val: any }> = [];
            const cursorReq = os.openCursor();
            cursorReq.onerror = () => reject(cursorReq.error);
            cursorReq.onsuccess = (ev: any) => {
              const cursor = ev.target.result;
              if (cursor) {
                res.push({ key: cursor.key, val: cursor.value });
                cursor.continue();
              } else resolve(res);
            };
          });

          console.log(`count: ${rows.length}`);
          const candidates = rows.filter(({ key }) => looksLikeState(String(key)));
          if (candidates.length) {
            console.warn('savestate-like keys:', candidates.map(c => c.key));
          } else {
            // Sometimes the savestate key isn’t obviously named; log a sample of record shapes
            const shapes = rows.slice(0, Math.min(rows.length, 5)).map(({ key, val }) => ({
              key,
              type: val?.constructor?.name,
              fields: val && typeof val === 'object' ? Object.keys(val) : [],
            }));
            console.log('sample record shapes:', shapes);
          }

          console.groupEnd(); // store
        } catch (storeErr) {
          console.warn(`Failed to read store "${storeName}"`, storeErr);
        }
      }
      console.groupEnd(); // DB
      db.close();
    } catch (dbErr) {
      console.warn(`Failed to open DB "${name}"`, dbErr);
    }
  }

  console.groupEnd(); // IndexedDB
  console.groupEnd(); // root
}


/** Look for savestate-like files in Cache Storage and download the newest match. */
async exportSavestateFromCacheStorage(slot: number = 0) {
  try {
    const cacheNames = await caches.keys(); // list named caches
    // Heuristics for savestate names
    const exts = ['.st', '.sav', '.state', '.bin'];
    const slotTokens = [`slot${slot}`, `.st${slot}`, `_${slot}.st`, `.${slot}.st`];

    const candidates: Array<{name: string; url: string; when: number; resp: Response}> = [];

    for (const name of cacheNames) {
      const cache = await caches.open(name);
      const requests = await cache.keys(); // all Request keys in this cache
      for (const req of requests) {
        const url = req.url.toLowerCase();
        const hasExt = exts.some((e) => url.endsWith(e));
        const looksLikeSlot = slotTokens.some((t) => url.includes(t));
        if (!hasExt && !looksLikeSlot) continue;

        const resp = await cache.match(req);
        if (resp) {
          candidates.push({ name, url: req.url, when: Date.now(), resp });
        }
      }
    }

    if (!candidates.length) {
      this.parentRef?.showNotification('No savestate found in Cache Storage.');
      return;
    }

    // Pick newest candidate and stream to Blob
    const best = candidates.sort((a, b) => b.when - a.when)[0];
    const blob = await best.resp.blob();
    const filename = this.composeSavestateFilename(slot);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 100);

    this.parentRef?.showNotification(`Downloaded savestate from Cache Storage: ${best.url}`);
  } catch (err) {
    console.error('CacheStorage export failed', err);
    this.parentRef?.showNotification('Failed to export savestate from Cache Storage');
  }
}

/** Try to find savestate-like entries in localStorage/sessionStorage and download. */
exportSavestateFromWebStorage(slot: number = 0) {
  const scan = (store: Storage, label: string) => {
    try {
      const exts = ['.st', '.sav', '.state', '.bin'];
      const slotTokens = [`slot${slot}`, `.st${slot}`, `_${slot}.st`, `.${slot}.st`];

      for (let i = 0; i < store.length; i++) {
        const key = store.key(i) || '';
        const lower = key.toLowerCase();
        const hasExt = exts.some((e) => lower.endsWith(e));
        const looksLikeSlot = slotTokens.some((t) => lower.includes(t));
        if (!hasExt && !looksLikeSlot) continue;

        const value = store.getItem(key);
        if (!value) continue;

        // Try base64 → Blob; else try JSON with {data:...}
        let blob: Blob | null = null;
        try {
          // Heuristic: if value looks like base64
          if (/^[A-Za-z0-9+/=]+$/.test(value) && value.length > 64) {
            const byteChars = atob(value);
            const bytes = new Uint8Array(byteChars.length);
            for (let j = 0; j < byteChars.length; j++) bytes[j] = byteChars.charCodeAt(j);
            blob = new Blob([bytes.buffer], { type: 'application/octet-stream' });
          } else {
            const obj = JSON.parse(value);
            const arr = obj?.data || obj?.contents;
            if (arr) {
              const u8 = Array.isArray(arr) ? new Uint8Array(arr) :
                         (arr?.buffer ? new Uint8Array(arr) : null);
              if (u8) blob = new Blob([u8.buffer], { type: 'application/octet-stream' });
            }
          }
        } catch {}

        if (blob) {
          const filename = this.composeSavestateFilename(slot);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = filename; a.style.display = 'none';
          document.body.appendChild(a); a.click();
          setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
          this.parentRef?.showNotification(`Downloaded savestate from ${label} key "${key}"`);
          return;
        }
      }
      this.parentRef?.showNotification(`No savestate found in ${label}.`);
    } catch (e) {
      console.warn(`${label} scan failed`, e);
    }
  };

  scan(localStorage, 'localStorage');
  scan(sessionStorage, 'sessionStorage');
}


  /** Focus the canvas so SDL/core receives key events. */
  private async ensureCanvasFocus() {
    const canvasEl = this.canvas?.nativeElement as HTMLCanvasElement | undefined;
    if (!canvasEl) return;
    try {
      // Make sure canvas can receive focus
      if (!canvasEl.hasAttribute('tabindex')) canvasEl.setAttribute('tabindex', '0');
      canvasEl.focus();
      // tiny delay so focus settles
      await new Promise((r) => setTimeout(r, 30));
    } catch { }
  }

  /** Synthetic quick-save (adjust key if your build uses another binding). */
  private async tryTriggerCoreQuickSave() {
    const canvasEl = this.canvas?.nativeElement as HTMLCanvasElement | undefined;
    if (!canvasEl) return;

    // If your wrapper has an API, prefer it:
    // if (this.instance?.quickSave) return this.instance.quickSave(/*slot?*/);

    const down = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code: 'F5', key: 'F5' });
    const up = new KeyboardEvent('keyup', { bubbles: true, cancelable: true, code: 'F5', key: 'F5' });
    canvasEl.dispatchEvent(down);
    await new Promise((r) => setTimeout(r, 40));
    canvasEl.dispatchEvent(up);
  }

  /**
   * Ensure Emscripten’s FS is synchronized.
   * If IDBFS is used, syncfs(true) will pull remote → local; syncfs(false) pushes local → remote.
   * We’ll do a pull to make sure we can read new files.
   */
  private async syncFS(pull: boolean = true) {
    const Module = this.instance?.Module;
    const FS = Module?.FS;
    if (!FS || typeof FS.syncfs !== 'function') return;

    await new Promise<void>((resolve, reject) => {
      try {
        FS.syncfs(pull, (err: any) => (err ? reject(err) : resolve()));
      } catch (e) {
        // Some builds expose Module.syncFS instead
        try {
          if (typeof Module.syncFS === 'function') {
            Module.syncFS(pull, (err: any) => (err ? reject(err) : resolve()));
          } else {
            resolve();
          }
        } catch {
          resolve();
        }
      }
    });
  }

  /**
   * Find the most recent savestate file anywhere in the FS tree.
   * We walk directories from the root and look for common extensions or slot tokens.
   */
  private findLatestSavestateFile(slot: number): { path: string; mtime: number } | null {
    const Module = this.instance?.Module;
    const FS = Module?.FS;
    if (!FS) {
      console.warn('FS not available for savestate search');
      return null;
    }
    const allowedExts = ['.st', '.sav', '.state', '.bin']; // adjust if your build uses a specific extension
    const slotTokens = [
      `slot${slot}`,
      `.st${slot}`,
      `_${slot}.st`,
      `.${slot}.st`,
    ];

    let best: { path: string; mtime: number } | null = null;

    // Depth-first traversal from root
    const stack: string[] = ['/'];
    const visited = new Set<string>();

    const safeReaddir = (path: string): string[] => {
      try {
        return FS.readdir(path) as string[];
      } catch {
        console.log('Failed to read dir during savestate search:', path);
        return [];
      }
    };

    const safeStat = (path: string): any => {
      try {
        return FS.stat(path);
      } catch {
        console.log('Failed to stat path during savestate search:', path);
        return null;
      }
    };

    while (stack.length) {
      const dir = stack.pop()!;
      if (visited.has(dir)) continue;
      visited.add(dir);

      const entries = safeReaddir(dir);
      for (const name of entries) {
        if (name === '.' || name === '..') continue;
        const fullPath = dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`;
        const stat = safeStat(fullPath);
        if (!stat) continue;

        const isDir = stat.mode && (stat.mode & 0x4000); // S_IFDIR
        if (isDir) {
          stack.push(fullPath);
          continue;
        }

        const lower = name.toLowerCase();
        const hasAllowedExt = allowedExts.some((ext) => lower.endsWith(ext));
        const looksLikeSlot = slotTokens.some((t) => lower.includes(t));

        // Heuristics: either extension matches OR slot token matches
        if (!hasAllowedExt && !looksLikeSlot) continue;

        // Optional: include ROM name token to be stricter
        if (this.romName) {
          const token = this.romName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9._-]/g, '');
          // If names differ wildly, we still accept; comment the next line to enforce strict match:
          // if (!lower.includes(token)) continue;
        }

        const mtime = stat.mtime ? Number(new Date(stat.mtime)) : Date.now();
        if (!best || mtime > best.mtime) {
          best = { path: fullPath, mtime };
        }
      }
    }

    return best;
  }

  /** Read bytes of a file path from FS and return Uint8Array. */
  private readFileBytes(file: { path: string }): Uint8Array | null {
    const Module = this.instance?.Module;
    const FS = Module?.FS;
    if (!FS) return null;
    try {
      const data = FS.readFile(file.path);
      return data instanceof Uint8Array ? data : new Uint8Array(data);
    } catch (e) {
      console.warn('readFileBytes failed for', file.path, e);
      return null;
    }
  }

  /** Compose download name. */
  private composeSavestateFilename(slot: number): string {
    const base = (this.romName || 'n64-game').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    return `${base}.slot${slot}.${ts}.savestate`;
  }


  /** Narrowing helper so TS understands when it's a SharedArrayBuffer */
  private isSharedArrayBuffer(x: unknown): x is SharedArrayBuffer {
    return typeof SharedArrayBuffer !== 'undefined' && x instanceof SharedArrayBuffer;
  }

  /** Normalize Uint8Array / ArrayBuffer / SharedArrayBuffer to a real ArrayBuffer (no union errors) */
  private toArrayBuffer(bytes: Uint8Array | ArrayBuffer | SharedArrayBuffer): ArrayBuffer {
    // 1) If we already have a typed-array view, copy it via slice() on the view itself
    //    (returns a new Uint8Array with its own ArrayBuffer)
    if (bytes instanceof Uint8Array) {
      const copyView = bytes.slice();         // ✅ avoids using bytes.buffer.slice(...)
      return copyView.buffer;                 // This is a plain ArrayBuffer
    }

    // 2) If it's a plain ArrayBuffer, return a shallow copy so the return type is unambiguous
    if (bytes instanceof ArrayBuffer) {
      return bytes.slice(0);                  // ✅ ArrayBuffer → ArrayBuffer
    }

    // 3) If it's a SharedArrayBuffer, copy its contents into a fresh ArrayBuffer
    if (this.isSharedArrayBuffer(bytes)) {
      const view = new Uint8Array(bytes);     // view over SAB
      const copy = new Uint8Array(view.length);
      copy.set(view);                         // copy SAB → AB-backed typed array
      return copy.buffer;                     // ✅ ArrayBuffer
    }

    // 4) Fallback for unexpected cases: coerce into a typed view and copy
    const v = new Uint8Array(bytes as any);
    const copy = v.slice();
    return copy.buffer;                       // ✅ ArrayBuffer
  }

  /** Create a Blob from various byte representations (TS-safe) */
  private toBlob(bytes: Uint8Array | ArrayBuffer | SharedArrayBuffer): Blob {
    const ab = this.toArrayBuffer(bytes);
    return new Blob([ab], { type: 'application/octet-stream' });
  }

  /** Download helper that accepts Uint8Array / ArrayBuffer / SharedArrayBuffer */
  private downloadBlob(filename: string, bytes: Uint8Array | ArrayBuffer | SharedArrayBuffer) {
    try {
      const blob = this.toBlob(bytes);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (e) {
      console.warn('Failed to download blob', e);
    }
  }


  getAllowedRomFileTypes(): string[] {
    return this.fileService.n64FileExtensions;
  }
  getAllowedRomFileTypesString(): string {
    // file-upload expects extensions in the form ".ext" or MIME types; provide dot-prefixed extensions
    return this.fileService.n64FileExtensions.map(e => '.' + e.trim().toLowerCase()).join(',');
  }
}
