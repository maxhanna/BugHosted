import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import createMupen64PlusWeb, { writeAutoInputConfig } from 'mupen64plus-web';
import { FileService } from '../../services/file.service';
import { N64StateUpload, RomService } from '../../services/rom.service';
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

  // --- Autosave toggle & internals ---
  autosave = true;                 // your UI toggle (starts ON)
  private autosaveTimer: any = null;
  private autosavePeriodMs = 3 * 60 * 1000; // 3 minutes
  private autosaveInProgress = false;

  // Avoid re-uploading identical bytes (filename-kind keyed)
  private lastUploadedHashes = new Map<string, string>(); // key (kind:filename) -> sha256

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

  async ngOnDestroy(): Promise<void> {
    this.stopAutosaveLoop();
    if (confirm('Save your progress on the server before exiting?')) {
      await this.autosaveTick();
    }
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


  /** Try to infer N64 battery save extension from file size. */
  private inferBatteryExtFromSize(size: number): '.eep' | '.sra' | '.fla' | null {
    if (size === 512 || size === 2048) return '.eep';     // 4Kb or 16Kb EEPROM
    if (size === 32768) return '.sra';                    // 32KB SRAM
    if (size === 131072) return '.fla';                   // 128KB FlashRAM
    return null;
  }

  /** Build a base name from the current ROM (strip extension and common codes). */
  private baseNameFromRom(): string {
    const name = this.romName || 'Unknown';
    let base = name.replace(/\.(z64|n64|v64|zip|7z|rom)$/i, '');
    base = base
      .replace(/\s+/g, ' ')
      .replace(/\s*\((?:U|E|J|JU|USA|Europe|Japan|V\d+(\.\d+)?)\)\s*/gi, ' ')
      .replace(/\s*\[(?:!|b\d*|h\d*|o\d*|t\d*|M\d*|a\d*)\]\s*/gi, ' ')
      .trim();
    return base || 'Unknown';
  }

  /** Wrap a Blob into a File with a derived filename; detects battery save extension by size. */
  private async blobToN64SaveFile(blob: Blob, suggestedName?: string): Promise<File | null> {
    const size = blob.size;
    const ext = this.inferBatteryExtFromSize(size);
    if (!ext) {
      // Not a battery save we can import with this function (likely a savestate container .sav/.srm)
      this.parentRef?.showNotification('Downloaded blob is not a recognized battery save (.eep/.sra/.fla).');
      return null;
    }
    const base = (suggestedName && suggestedName.replace(/\.[^\.]+$/, '')) || this.baseNameFromRom();
    const filename = `${base}${ext}`;
    return new File([blob], filename, { type: blob.type || 'application/octet-stream' });
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
      this.startLoading();
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


      if (this.parentRef?.user?.id) {
        let saveGameFile: Blob | null = null;
        saveGameFile = await this.romService.getN64StateFile(this.romName, this.parentRef?.user?.id);
        if (saveGameFile) {
          const saveFile = await this.blobToN64SaveFile(saveGameFile, this.romName);
          if (saveFile) {
            await this.importInGameSaveRam([saveFile], true);
          } else {
            this.parentRef?.showNotification('No valid save found on server for this ROM.');
          }
        }
      }
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
    this.stopLoading();
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
    if (this.autosave) {
      this.startAutosaveLoop();
    }
    const canvasEl = this.canvas?.nativeElement as HTMLCanvasElement | undefined;
    if (!canvasEl) {
      this.parentRef?.showNotification('No canvas available');
      return;
    }

    this.resizeCanvasToParent();

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
      this.stopAutosaveLoop();
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
    if (this.savedMappingsNames.length === 0) {
      this.loadMappingsList();
    }
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


  /** Compute a robust token from the current ROM name to match save files. */
  private romTokenForMatching(name?: string): string | null {
    if (!name) return null;
    // Strip extension and normalize
    let base = name.replace(/\.(z64|n64|v64|zip|7z|rom)$/i, '');
    // Collapse whitespace, remove common bracketed codes (region/verification)
    base = base
      .replace(/\s+/g, ' ')
      .replace(/\s*\((?:U|E|J|JU|USA|Europe|Japan|V\d+(\.\d+)?)\)\s*/gi, ' ')
      .replace(/\s*\[(?:!|b\d*|h\d*|o\d*|t\d*|M\d*|a\d*)\]\s*/gi, ' ')
      .trim()
      .toLowerCase();
    // Also create a "looser" token without punctuation
    const loose = base.replace(/[^a-z0-9 ]/g, '').trim();
    return loose || null;
  }

  /** Export in-game save RAM for the currently running ROM; otherwise export all.
   *  Returns a concrete object with metadata and raw bytes (Uint8Array).
   */
  async exportInGameSaveRam(): Promise<ExportInGameSaveRamResult> {
    const empty: ExportInGameSaveRamResult = {
      romName: this.romName ?? null,
      matchedOnly: false,
      totalFound: 0,
      exported: []
    };

    try {
      const dbList: Array<{ name?: string }> =
        (indexedDB as any).databases ? await (indexedDB as any).databases() : [];
      const mupenDbMeta = dbList.find(d => d.name === '/mupen64plus') || null;
      if (!mupenDbMeta) {
        this.parentRef?.showNotification('IndexedDB "/mupen64plus" not found.');
        return empty;
      }

      const openDb = (name: string) => new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(name);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });

      const db = await openDb('/mupen64plus');
      const storeName = 'FILE_DATA';
      if (!Array.from(db.objectStoreNames).includes(storeName)) {
        this.parentRef?.showNotification('FILE_DATA store not found in /mupen64plus.');
        db.close();
        return empty;
      }

      const rows: Array<{ key: any; val: any }> = await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const os = tx.objectStore(storeName);
        const res: Array<{ key: any; val: any }> = [];
        const cursorReq = os.openCursor();
        cursorReq.onerror = () => reject(cursorReq.error);
        cursorReq.onsuccess = (ev: any) => {
          const cursor = ev.target.result;
          if (cursor) { res.push({ key: cursor.key, val: cursor.value }); cursor.continue(); }
          else resolve(res);
        };
      });

      // Filter for save RAM files
      const saveExts = ['.eep', '.sra', '.fla'];
      const saveRows = rows.filter(({ key }) => {
        const s = String(key).toLowerCase();
        return s.startsWith('/mupen64plus/saves/') && saveExts.some(e => s.endsWith(e));
      });

      if (!saveRows.length) {
        this.parentRef?.showNotification('No in-game save RAM found under /mupen64plus/saves.');
        db.close();
        return { ...empty, totalFound: 0, exported: [] };
      }

      // Decide whether to narrow to current ROM or export all
      const isRunning = this.status === 'running' && !!this.instance;
      const romToken = this.romTokenForMatching(this.romName);
      let targetRows = saveRows;
      let matchedOnly = false;

      if (isRunning && romToken) {
        // Match by filename token (loose) or includes original romName lowercased
        const tokenMatches = (keyStr: string) => {
          const fileName = keyStr.split('/').pop() || keyStr;
          const lower = fileName.toLowerCase();
          const loose = lower.replace(/[^a-z0-9 ]/g, '').trim();
          return loose.includes(romToken) || lower.includes((this.romName || '').toLowerCase());
        };
        const narrowed = saveRows.filter(({ key }) => tokenMatches(String(key)));
        if (narrowed.length) {
          targetRows = narrowed;
          matchedOnly = true;
        } else {
          this.parentRef?.showNotification('No saves matched the current ROM; returning all saves.');
        }
      }

      // Build concrete results (no downloads here)
      const exported: N64ExportedSave[] = [];
      for (const { key, val } of targetRows) {
        const ab = this.normalizeToArrayBuffer(val);
        if (!ab) continue;
        const filename = String(key).split('/').pop() || 'save_ram.bin';
        exported.push({
          key: String(key),
          filename,
          kind: 'battery',
          size: ab.byteLength,
          bytes: new Uint8Array(ab)
        });
      }

      db.close();

      const result: ExportInGameSaveRamResult = {
        romName: this.romName ?? null,
        matchedOnly,
        totalFound: saveRows.length,
        exported
      };

      // Optional UX: summarize
      const count = exported.length;
      const scope = matchedOnly ? 'matching' : 'all';
      this.parentRef?.showNotification(`Prepared ${count} ${scope} in-game save file(s) for export.`);

      return result;
    } catch (err) {
      console.error('exportInGameSaveRam failed', err);
      this.parentRef?.showNotification('Failed to export in-game save RAM');
      return empty;
    }
  } 

  /** Normalize common IDBFS value shapes to ArrayBuffer. */
  private normalizeToArrayBuffer(val: any): ArrayBuffer | null {
    if (val instanceof ArrayBuffer) return val;
    if (val?.buffer instanceof ArrayBuffer && typeof val.byteLength === 'number') return val.buffer;
    const fromObj = (field: any) => field instanceof ArrayBuffer ? field
      : field?.buffer instanceof ArrayBuffer ? field.buffer : null;
    let ab = null;
    if (val?.contents) ab = fromObj(val.contents);
    if (!ab && val?.data) ab = fromObj(val.data);
    if (!ab && Array.isArray(val?.bytes)) ab = new Uint8Array(val.bytes).buffer;
    if (!ab && typeof val === 'string' && /^[A-Za-z0-9+/=]+$/.test(val)) {
      try {
        const bin = atob(val);
        const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        ab = u8.buffer;
      } catch { /* ignore */ }
    }
    return ab;
  }


  /** Import battery saves (.eep/.sra/.fla) into /mupen64plus/saves/, then restart emulator. */
  async importInGameSaveRam(files: FileList | File[], skipBoot: boolean = false) {
    try {
      // 1) Open the /mupen64plus → FILE_DATA store
      const dbMeta: Array<{ name?: string }> =
        (indexedDB as any).databases ? await (indexedDB as any).databases() : [];
      const mupenDb = dbMeta.find(d => d.name === '/mupen64plus');
      if (!mupenDb) {
        this.parentRef?.showNotification('IndexedDB "/mupen64plus" not found.');
        return;
      }
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('/mupen64plus'); req.onerror = () => reject(req.error); req.onsuccess = () => resolve(req.result);
      });
      if (!Array.from(db.objectStoreNames).includes('FILE_DATA')) {
        this.parentRef?.showNotification('FILE_DATA store not found.');
        db.close();
        return;
      }

      // 2) Fetch an existing /mupen64plus/saves record as a template for value shape
      const getTemplate = async (): Promise<any | null> => {
        const tx = db.transaction('FILE_DATA', 'readonly');
        const os = tx.objectStore('FILE_DATA');
        const rows: Array<{ key: any; val: any }> = await new Promise((resolve, reject) => {
          const res: any[] = []; const cur = os.openCursor();
          cur.onerror = () => reject(cur.error);
          cur.onsuccess = (ev: any) => { const c = ev.target.result; if (c) { res.push({ key: c.key, val: c.value }); c.continue(); } else resolve(res); };
        });
        const sample = rows.find(r => String(r.key).startsWith('/mupen64plus/saves/'));
        return sample ? sample.val : null;
      };
      const templateVal = await getTemplate();

      // 3) For each selected file, write it to /mupen64plus/saves/<filename>
      const allowedExts = ['.eep', '.sra', '.fla'];
      const written: string[] = [];
      for (const fAny of Array.from(files)) {
        const f = fAny as File;
        const name = f.name;
        const lower = name.toLowerCase();
        if (!allowedExts.some(e => lower.endsWith(e))) {
          this.parentRef?.showNotification(`Skipped "${name}" (unsupported type)`);
          continue;
        }
        const bytes = new Uint8Array(await f.arrayBuffer());
        const key = `/mupen64plus/saves/${name}`;

        // Read existing record (if any), otherwise build a new record using the template
        const txRW = db.transaction('FILE_DATA', 'readwrite');
        const osRW = txRW.objectStore('FILE_DATA');
        const existing = await new Promise<any>((resolve) => {
          const req = osRW.get(key);
          req.onerror = () => resolve(null);
          req.onsuccess = () => resolve(req.result || null);
        });

        let value: any = null;
        if (existing) {
          // Overwrite only the payload field we recognize
          if (existing.contents) existing.contents = bytes;
          else if (existing.data) existing.data = bytes;
          else if (existing.bytes && Array.isArray(existing.bytes)) existing.bytes = Array.from(bytes);
          else value = bytes; // last resort: raw ArrayBuffer-like value
          value = value ?? existing;
        } else if (templateVal) {
          // Clone template and drop in new bytes; preserve mode/timestamp if present
          const clone = JSON.parse(JSON.stringify(templateVal));
          if (clone.contents) clone.contents = bytes;
          else if (clone.data) clone.data = bytes;
          else if (clone.bytes && Array.isArray(clone.bytes)) clone.bytes = Array.from(bytes);
          else value = bytes;
          value = value ?? clone;
        } else {
          // Minimal new value; many IDBFS builds accept raw bytes-like payloads
          value = bytes;
        }

        await new Promise<void>((resolve, reject) => {
          const req = osRW.put(value, key);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve();
        });
        written.push(name);
      }

      db.close();

      if (written.length) {
        this.parentRef?.showNotification(`Imported ${written.length} save file(s): ${written.join(', ')}`);
        // Restart emulator so it performs its IDBFS sync-on-start and the game sees the new saves
        const wasRunning = this.status === 'running' || !!this.instance;
        if (wasRunning) { await this.stop(); await new Promise(r => setTimeout(r, 150)); }
        if (!skipBoot) {
          await this.boot();
        }
      } else {
        this.parentRef?.showNotification('No save files imported.');
      }
    } catch (err) {
      console.error('importInGameSaveRam failed', err);
      this.parentRef?.showNotification('Failed to import save files');
    }
  }

  getAllowedRomFileTypes(): string[] {
    return this.fileService.n64FileExtensions;
  }
  getAllowedRomFileTypesString(): string {
    return this.fileService.n64FileExtensions.map(e => '.' + e.trim().toLowerCase()).join(',');
  }

  /** Upload current ROM’s save state */
  private async autosaveTick() {
    if (!this.autosave || this.autosaveInProgress) return;
    this.autosaveInProgress = true;

    try {
      // Must have a userId to save server-side
      const userId = this.parentRef?.user?.id;
      if (!userId) { return; }

      // 1) Export current ROM’s saves (if emulator running, it will narrow automatically)
      const result = await this.exportInGameSaveRam();
      const isRunning = this.status === 'running' && !!this.instance;

      // We only upload when playing (as requested). If you prefer to upload “all” when idle, change this.
      if (!isRunning || !result.exported.length || !result.matchedOnly) {
        return; // no current ROM or nothing matched → skip
      }

      // 2) Upload only changed files (hash-based dedupe)
      let uploadedCount = 0;
      for (const item of result.exported) {
        const hash = await this.sha256Hex(item.bytes);
        const key = `${item.filename}`;
        if (this.lastUploadedHashes.get(key) === hash) continue; // unchanged since last upload

        const payload: N64StateUpload = {
          userId,
          romName: result.romName ?? 'Unknown',
          filename: item.filename,           // e.g., 'GoldenEye 007 (U) [!].eep'
          bytes: item.bytes,                 // Uint8Array
          saveTimeMs: Date.now(),
          durationSeconds: 180/* compute since last tick or session */
        };

        try {
          const uploadRes = await this.romService.saveN64State(payload);
          if (uploadRes.ok) {
            // success
          } else {
            console.warn('Upload failed:', uploadRes.errorText);
          }
          this.lastUploadedHashes.set(key, hash);
          uploadedCount++;
        } catch (e) {
          console.warn('autosave: saveN64State failed for', item.filename, e);
        }
      }

      if (uploadedCount > 0) {
        this.parentRef?.showNotification(`Autosaved ${uploadedCount} file(s) for ${result.romName ?? 'current ROM'}.`);
      }
    } catch (err) {
      console.error('autosaveTick error', err);
    } finally {
      this.autosaveInProgress = false;
    }
  }

  private startAutosaveLoop() {
    this.stopAutosaveLoop(); // clear any existing
    if (!this.autosave) return;
    if (!this.parentRef?.user?.id) {
      this.parentRef?.showNotification('Autosave requires user login.');
      return;
    }
    this.autosaveTimer = setInterval(() => this.autosaveTick(), this.autosavePeriodMs);
  }

  private stopAutosaveLoop() {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  /** Normalize input into a tight ArrayBuffer (no offset/extra bytes). */
  private toTightArrayBuffer(input: ArrayBuffer | ArrayBufferView): ArrayBuffer {
    if (input instanceof ArrayBuffer) return input;
    const view = input as ArrayBufferView;
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  }

  /** Compute SHA-256 hex for ArrayBuffer or any typed array view. */
  private async sha256Hex(input: ArrayBuffer | ArrayBufferView): Promise<string> {
    const ab = this.toTightArrayBuffer(input);
    const digest = await crypto.subtle.digest('SHA-256', ab);
    const u8 = new Uint8Array(digest);
    return Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

type N64ExportedSave = {
  key: string;                // full virtual path in IDBFS (/mupen64plus/saves/...)
  filename: string;           // leaf filename
  kind: 'battery';            // battery saves only (.eep/.sra/.fla)
  size: number;               // in bytes
  bytes: Uint8Array;          // raw bytes
};

type ExportInGameSaveRamResult = {
  romName: string | null;
  matchedOnly: boolean;       // true if narrowed to current ROM, false if exported all
  totalFound: number;         // number of save files found under /mupen64plus/saves/
  exported: N64ExportedSave[];// the actual items returned
};
