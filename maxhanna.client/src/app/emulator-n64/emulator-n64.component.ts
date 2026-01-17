
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
  @ViewChild('saveFileInput') saveFileInput!: ElementRef<HTMLInputElement>;

  // ---- State ----
  loading = false;
  status: 'idle' | 'booting' | 'running' | 'paused' | 'stopped' | 'error' = 'idle';
  romName?: string;
  private romBuffer?: ArrayBuffer;
  private instance: any;

  // ---- Gamepads ----
  gamepads: Array<{ index: number; id: string; mapping: string; connected: boolean }> = [];
  selectedGamepadIndex: number | null = null;

  // ---- Mapping UI/store ----
  showKeyMappings = false;
  savedMappingsNames: string[] = [];
  private _mappingsStoreKey = 'n64_mappings_store_v1';
  selectedMappingName: string | null = null;

  // mapping: N64 control -> { type:'button'|'axis', index:number, axisDir?:1|-1, gamepadId:string }
  mapping: Record<string, any> = {};
  n64Controls = [
    'A Button', 'B Button', 'Z Trig', 'Start',
    'DPad U', 'DPad D', 'DPad L', 'DPad R',
    'C Button U', 'C Button D', 'C Button L', 'C Button R',
    'L Trig', 'R Trig',
    'Analog X+', 'Analog X-',
    'Analog Y+', 'Analog Y-'
  ];

  // Remapper (list) helpers
  liveTest = true;
  private _recordingFor: string | null = null;
  exportText: string | null = null;

  // Optional direct-inject keyboard synth (OFF by default)
  directInjectMode = false;
  private _directInjectPoller = 0;
  private _directPrevState: Record<string, boolean> = {};

  // UI modal / fullscreen
  isMenuPanelVisible = false;
  isFullScreen = false;

  // Persist keys
  private _mappingKey = 'n64_gamepad_mapping_v1';
  private readonly _lastPerGamepadKey = 'n64_last_mapping_per_gp_v1';
  private lastMappingPerGp: Record<string, string> = {};
  showFileSearch = false;
  private _autoDetectTimer: any = null;

  private hasLoadedLastInput = false;
  private bootGraceUntil = 0;

  // Autosave
  autosave = true;
  private autosaveTimer: any = null;
  private autosavePeriodMs = 3 * 60 * 1000;
  private autosaveInProgress = false;
  private lastUploadedHashes = new Map<string, string>();

  // Canvas resize
  private _canvasResizeAdded = false;
  private _resizeHandler = () => this.resizeCanvasToParent();
  private _resizeObserver?: ResizeObserver;

  // Reorder wrapper only (no translator)
  private _originalGetGamepadsBase: any = null;
  private _gpWrapperInstalled = false;
  private _reorderSelectedFirst = false;

  // Logging
  _gpPoller: any; // just a flag for your UI button
  private _logRawTimer: any = null;
  private _logEffectiveTimer: any = null;
  private _logRawPeriodMs = 750;
  private _logEffectivePeriodMs = 750;

  // Axis behavior
  private _axisDeadzone = 0.2;

  constructor(private fileService: FileService, private romService: RomService) {
    super();
  }

  // =====================================================
  // Named mappings (backend/local)
  // =====================================================
  async loadMappingsList() {
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

  async saveMappingAs() {
    try {
      const selectedGamepadName = this.gamepads[this.selectedGamepadIndex ?? 0]?.id || '';
      const name = window.prompt('Enter a name for this mapping:', selectedGamepadName);
      if (!name) return;
      const uid = this.parentRef?.user?.id;
      const payload = JSON.parse(JSON.stringify(this.mapping || {}));

      if (uid) {
        try {
          const names = await this.romService.listMappings(uid);
          if (names && Array.isArray(names) && names.length >= 50 && !names.includes(name)) {
            this.parentRef?.showNotification('Mapping limit reached (50). Delete an existing mapping before adding a new one.');
            return;
          }
        } catch { /* ignore */ }

        const res = await this.romService.saveMapping(uid, name, payload);
        if (res && res.ok) {
          this.parentRef?.showNotification(`Mapping saved as "${name}"`);
          await this.loadMappingsList();
          this.selectedMappingName = name;
          return;
        }
        if (res && !res.ok) {
          const msg = res.text || `Server rejected save (status ${res.status})`;
          this.parentRef?.showNotification(msg);
          return;
        }
      }

      // Fallback local
      const raw = localStorage.getItem(this._mappingsStoreKey);
      const store = raw ? JSON.parse(raw) : {};
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

  async applySelectedMapping() {
    // Selecting "Default" clears selectedMappingName or sets it to ''
    if (!this.selectedMappingName) {
      const gp = this.currentPad();
      this.mapping = {};
      if (gp?.mapping === 'standard') {
        this.generateDefaultRawMappingForPad(gp);
        this.parentRef?.showNotification('Default RAW mapping generated for standard profile.');
      } else {
        this.parentRef?.showNotification('Default mapping cleared — remap manually or record.');
      }
      await this.applyMappingToEmulator();
      return;
    }

    try {
      const uid = this.parentRef?.user?.id;
      if (uid) {
        try {
          const m = await this.romService.getMapping(uid, this.selectedMappingName as string);
          if (m) {
            const gp = this.currentPad();
            this.mapping = this.rebindMappingToPad(JSON.parse(JSON.stringify(m)), gp?.id || null);
            this.migrateMappingToIdsIfNeeded();
            await this.applyMappingToEmulator();
            this.parentRef?.showNotification(`Applied mapping "${this.selectedMappingName}" to selected controller`);
            return;
          }
        } catch (e) {
          console.warn('Backend mapping fetch failed, falling back to localStorage', e);
        }
      }

      const raw = localStorage.getItem(this._mappingsStoreKey);
      const store = raw ? JSON.parse(raw) : {};
      const m = store[this.selectedMappingName];
      if (!m) {
        this.parentRef?.showNotification('Selected mapping not found');
        this.loadMappingsList();
        return;
      }
      const gp = this.currentPad();
      this.mapping = this.rebindMappingToPad(JSON.parse(JSON.stringify(m)), gp?.id || null);
      this.migrateMappingToIdsIfNeeded();
      await this.applyMappingToEmulator();
      this.parentRef?.showNotification(`Applied mapping "${this.selectedMappingName}" to selected controller`);
    } catch (e) {
      console.error('Failed to apply selected mapping', e);
      this.parentRef?.showNotification('Failed to apply mapping');
    }
  }

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

  onMappingSelect(name: string) {
    // name === '' => Default
    this.selectedMappingName = name || null;
    this.applySelectedMapping();
  }

  // =====================================================
  // Lifecycle
  // =====================================================
  ngOnInit(): void {
    try {
      const raw = localStorage.getItem(this._lastPerGamepadKey);
      this.lastMappingPerGp = raw ? JSON.parse(raw) : {};
    } catch {
      this.lastMappingPerGp = {};
    }
  }

  ngAfterViewInit(): void {
    const canvasEl = this.canvas?.nativeElement;
    if (!canvasEl) return;
    if (canvasEl.id !== 'canvas') canvasEl.id = 'canvas';

    const container = (this.fullscreenContainer?.nativeElement) ?? canvasEl.parentElement ?? document.body;

    this.resizeCanvasToParent();

    this._resizeObserver = new ResizeObserver(() => {
      this.resizeCanvasToParent();
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    });
    this._resizeObserver.observe(container);

    window.addEventListener('orientationchange', this._resizeHandler);

    window.addEventListener('gamepadconnected', this._onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this._onGamepadDisconnected);

    document.addEventListener('fullscreenchange', this._onFullscreenChange);

    canvasEl?.addEventListener('click', () => this._bootstrapDetectOnce());

    this.startGamepadAutoDetect();
    // this.startGamepadLoggingRaw();
    // this.startGamepadLoggingEffective();
  }

  async ngOnDestroy(): Promise<void> {
    this.stopAutosaveLoop();
    if (this.romName && confirm('Save your progress on the server before exiting?')) {
      await this.autosaveTick();
    }
    this.stop();

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = undefined;
    }

    if (this._canvasResizeAdded) {
      try { window.removeEventListener('resize', this._resizeHandler); } catch { /* ignore */ }
      this._canvasResizeAdded = false;
    }

    try {
      document.removeEventListener('fullscreenchange', this._resizeHandler);
      window.removeEventListener('orientationchange', this._resizeHandler);
    } catch { /* ignore */ }

    this.stopGamepadAutoDetect();
    try {
      window.removeEventListener('gamepadconnected', this._onGamepadConnected);
      window.removeEventListener('gamepaddisconnected', this._onGamepadDisconnected);
    } catch { /* ignore */ }

    this.stopGamepadLoggingRaw();
    this.stopGamepadLoggingEffective();
  }

  // =====================================================
  // File selection & canvas sizing
  // =====================================================
  async onFileSearchSelected(file: FileEntry) {
    try {
      if (!file) {
        this.parentRef?.showNotification('Invalid file selected');
        return;
      }
      this.startLoading();

      const response = await this.romService.getRomFile(file.fileName ?? "", this.parentRef?.user?.id, file.id);
      if (!response) {
        this.parentRef?.showNotification('Failed to download selected ROM');
        return;
      }
      const buffer = await response.arrayBuffer();
      this.romBuffer = buffer;
      this.romName = file.fileName || "";
      console.log(`Loaded ${this.romName} from search`);

      await this.loadLastInputSelectionAndApply();

      if (this.parentRef?.user?.id) {
        const saveGameFile = await this.romService.getN64StateFile(this.romName, this.parentRef?.user?.id);
        if (saveGameFile) {
          const saveFile = await this.blobToN64SaveFile(saveGameFile, this.romName);
          if (saveFile) {
            await this.importInGameSaveRam([saveFile], true);
          } else {
            this.parentRef?.showNotification('No valid save found on server for this ROM.');
          }
        }
      }

      try {
        await this.boot();
      } catch { /* ignore */ }
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

  private resizeCanvasToParent() {
    try {
      const canvasEl = this.canvas?.nativeElement as HTMLCanvasElement | undefined;
      if (!canvasEl) return;

      const container = (this.fullscreenContainer?.nativeElement) ?? (canvasEl.parentElement ?? document.body);
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvasEl.style.width = rect.width + 'px';
      canvasEl.style.height = rect.height + 'px';

      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvasEl.width !== w) canvasEl.width = w;
      if (canvasEl.height !== h) canvasEl.height = h;
      if (container.id != this.fullscreenContainer.nativeElement.id) {
        this.isFullScreen = false;
      }
    } catch (e) {
      console.warn('Failed to resize canvas', e);
    }
  }

  // =====================================================
  // RAW-first mapping helpers
  // =====================================================
  private currentPad(): Gamepad | null {
    const pads = this.getGamepadsBase();
    const idx = this.selectedGamepadIndex ?? 0;
    return pads[idx] || null;
  }

  /** Generate a DualSense/XInput-like RAW mapping for a standard-profile pad. */
  private generateDefaultRawMappingForPad(gp: Gamepad) {
    const id = gp.id;
    const m: Record<string, any> = {};

    // Face/triggers/start
    m['A Button'] = { type: 'button', index: 0, gamepadId: id };
    m['B Button'] = { type: 'button', index: 1, gamepadId: id };
    m['Z Trig'] = { type: 'button', index: 6, gamepadId: id }; // L2
    m['L Trig'] = { type: 'button', index: 4, gamepadId: id }; // L1
    m['R Trig'] = { type: 'button', index: 5, gamepadId: id }; // R1
    m['Start'] = { type: 'button', index: 9, gamepadId: id };

    // DPad (standard buttons)
    m['DPad U'] = { type: 'button', index: 12, gamepadId: id };
    m['DPad D'] = { type: 'button', index: 13, gamepadId: id };
    m['DPad L'] = { type: 'button', index: 14, gamepadId: id };
    m['DPad R'] = { type: 'button', index: 15, gamepadId: id };

    // Analog (left stick)
    m['Analog X+'] = { type: 'axis', index: 0, axisDir: 1, gamepadId: id };
    m['Analog X-'] = { type: 'axis', index: 0, axisDir: -1, gamepadId: id };
    m['Analog Y+'] = { type: 'axis', index: 1, axisDir: 1, gamepadId: id };   // browser Y+: down
    m['Analog Y-'] = { type: 'axis', index: 1, axisDir: -1, gamepadId: id };  // browser Y-: up

    // C-Buttons (right stick)
    m['C Button R'] = { type: 'axis', index: 2, axisDir: 1, gamepadId: id };  // RX+
    m['C Button L'] = { type: 'axis', index: 2, axisDir: -1, gamepadId: id }; // RX-
    m['C Button D'] = { type: 'axis', index: 3, axisDir: 1, gamepadId: id };  // RY+
    m['C Button U'] = { type: 'axis', index: 3, axisDir: -1, gamepadId: id }; // RY-

    this.mapping = m;
  }

  /** Force all entries to the selected pad id (fix re-import across variants). */
  private rebindMappingToPad(mapping: Record<string, any>, gamepadId: string | null): Record<string, any> {
    if (!gamepadId) return mapping;
    for (const key of Object.keys(mapping || {})) {
      const m = mapping[key];
      if (!m) continue;
      m.gamepadId = gamepadId;
      if (m.type === 'axis' && (m.axisDir !== 1 && m.axisDir !== -1)) {
        m.axisDir = 1;
      }
    }
    return mapping;
  }

  // ---- List UI actions ----
  recordCtrl(ctrl: string) { this.startRecording(ctrl); }
  clearCtrl(ctrl: string) { delete this.mapping[ctrl]; }
  clearAllMappings() { this.mapping = {}; this.parentRef?.showNotification('Cleared all mappings (not applied yet)'); }
  regenDefaultForSelectedPad() {
    const gp = this.currentPad();
    if (!gp) { this.parentRef?.showNotification('No controller selected'); return; }
    if (gp.mapping !== 'standard') this.parentRef?.showNotification('Controller is not standard; defaults may differ.');
    this.generateDefaultRawMappingForPad(gp);
  }

  startRecording(control: string) {
    this._recordingFor = control;
    this.parentRef?.showNotification(`Recording mapping for ${control}. Press a button or move an axis on the controller.`);

    const cap = () => {
      const g = this.getGamepadsBase();
      for (const gp of g) {
        if (!gp) continue;

        // Buttons
        for (let b = 0; b < gp.buttons.length; b++) {
          if ((gp.buttons[b] as any).pressed) {
            this.mapping[control] = { type: 'button', index: b, gamepadId: gp.id };
            this._recordingFor = null;
            this.parentRef?.showNotification(`${control} → button(${b})`);
            return;
          }
        }
        // Axes
        for (let a = 0; a < gp.axes.length; a++) {
          const v = gp.axes[a];
          if (Math.abs(v) > 0.7) {
            this.mapping[control] = { type: 'axis', index: a, axisDir: v > 0 ? 1 : -1, gamepadId: gp.id };
            this._recordingFor = null;
            this.parentRef?.showNotification(`${control} → axis(${a}${v > 0 ? '+' : '-'})`);
            return;
          }
        }
      }
      if (this._recordingFor) setTimeout(cap, 120);
    };
    cap();
  }

  bindingText(ctrl: string): string {
    const m = this.mapping[ctrl];
    if (!m) return '(unbound)';
    return m.type === 'button'
      ? `button(${m.index})`
      : `axis(${m.index}${m.axisDir === 1 ? '+' : '-'})`;
  }

  isRowActive(ctrl: string): boolean {
    if (!this.liveTest) return false;
    try {
      const gp = this.currentPad();
      if (!gp) return false;
      const m = this.mapping[ctrl];
      if (!m) return false;
      if (m.type === 'button') {
        return !!(gp.buttons && gp.buttons[m.index] && (gp.buttons[m.index] as any).pressed);
      } else {
        const v = (gp.axes && gp.axes[m.index]) || 0;
        const dz = Math.abs(v) < this._axisDeadzone ? 0 : v;
        return (m.axisDir === 1 && dz > 0.5) || (m.axisDir === -1 && dz < -0.5);
      }
    } catch {
      return false;
    }
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
        const gp = this.currentPad();
        this.mapping = this.rebindMappingToPad(JSON.parse(raw), gp?.id || null);
        this.migrateMappingToIdsIfNeeded();
        this.parentRef?.showNotification('Mapping loaded & rebound to selected controller');
      } else {
        this.parentRef?.showNotification('No saved mapping found');
      }
    } catch (e) {
      console.error('Failed to load mapping', e);
    }
  }

  async applyMappingToEmulator() {
    try {
      this.migrateMappingToIdsIfNeeded();

      const config: Record<string, string> = {};
      const handled = new Set<string>();

      const pairAxis = (minusKey: string, plusKey: string, axisName: string) => {
        const mMinus = this.mapping[minusKey];
        const mPlus = this.mapping[plusKey];
        if (mMinus && mPlus && mMinus.type === 'axis' && mPlus.type === 'axis' &&
          mMinus.gamepadId && mPlus.gamepadId && mMinus.gamepadId === mPlus.gamepadId) {
          config[axisName] = `axis(${mMinus.index}-,${mPlus.index}+)`;
          handled.add(minusKey); handled.add(plusKey);
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

      // Section name: exact device id (canonical requirement)
      let sectionName = 'Custom Gamepad';
      for (const v of Object.values(this.mapping)) {
        if (v?.gamepadId) { sectionName = v.gamepadId; break; }
      }
      if (sectionName === 'Custom Gamepad') {
        const gp = this.currentPad();
        if (gp?.id) sectionName = gp.id;
      }

      console.log('[InputAutoCfg] writing section for:', sectionName);

      const wasRunning = !!this.instance || this.status === 'running';
      if (wasRunning) {
        await this.stop();
        await new Promise((r) => setTimeout(r, 150));
      }

      await writeAutoInputConfig(sectionName, config as any);
      this.parentRef?.showNotification(`Applied RAW mapping for "${sectionName}"`);

      if (this.directInjectMode) this.enableDirectInject();

      if (wasRunning) await this.boot();
    } catch (e) {
      console.error('Failed to apply mapping to emulator', e);
      this.parentRef?.showNotification('Failed to apply mapping');
    }
  }

  // =====================================================
  // Gamepad selection
  // =====================================================
  async onSelectGamepad(value: string | number) {
    const idx = Number(value);
    if (Number.isNaN(idx)) return;

    if (this.selectedGamepadIndex === idx) {
      this.applyGamepadReorder();
      if (this.directInjectMode) this.enableDirectInject();

      try {
        const uid = this.parentRef?.user?.id;
        const token = this.romTokenForMatching(this.romName);
        if (uid && token) {
          const pads = this.getGamepadsBase();
          const gp = pads[idx];
          const gamepadId = gp?.id ?? null;
          await this.romService.saveLastInputSelection({
            userId: uid, romToken: token,
            mappingName: this.selectedMappingName ?? null,
            gamepadId
          });
        }
      } catch { /* ignore */ }

      return;
    }

    this.selectedGamepadIndex = idx;
    this.refreshGamepads();

    // Reorder immediately (keep selected-first)
    this.applyGamepadReorder();

    // Default mapping when empty and standard profile
    const gpNow = this.currentPad();
    if (gpNow && gpNow.mapping === 'standard' && !Object.keys(this.mapping || {}).length) {
      this.generateDefaultRawMappingForPad(gpNow);
      this.parentRef?.showNotification('Default RAW mapping generated from standard profile.');
      await this.applyMappingToEmulator();
    }

    const now = performance.now();
    if (this.status === 'booting' || now < this.bootGraceUntil) {
      try {
        const uid = this.parentRef?.user?.id;
        const token = this.romTokenForMatching(this.romName);
        if (uid && token) {
          const pads = this.getGamepadsBase();
          const gp = pads[this.selectedGamepadIndex ?? 0];
          const gamepadId = gp?.id ?? null;
          await this.romService.saveLastInputSelection({
            userId: uid, romToken: token,
            mappingName: this.selectedMappingName ?? null,
            gamepadId
          });
        }
      } catch { /* ignore */ }
      return;
    }

    if (this.instance || this.status === 'running') {
      try {
        await this.stop();
        await new Promise((r) => setTimeout(r, 120));
        await this.boot();
      } catch (e) {
        console.error('Failed to restart emulator with new controller', e);
        this.parentRef?.showNotification('Failed to restart emulator with selected controller');
      }
    }

    try {
      const uid = this.parentRef?.user?.id;
      const token = this.romTokenForMatching(this.romName);
      if (uid && token) {
        const pads = this.getGamepadsBase();
        const gp = pads[this.selectedGamepadIndex ?? 0];
        const gamepadId = gp?.id ?? null;
        await this.romService.saveLastInputSelection({
          userId: uid, romToken: token,
          mappingName: this.selectedMappingName ?? null,
          gamepadId
        });
      }
    } catch { /* ignore */ }
  }

  // =====================================================
  // Emulator control (RAW-only)
  // =====================================================
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
        document.addEventListener('fullscreenchange', this._resizeHandler);
        window.addEventListener('orientationchange', this._resizeHandler);
        this._canvasResizeAdded = true;
      } catch { /* ignore */ }
    }

    this.loading = true;
    this.status = 'booting';
    try {
      this.applyGamepadReorder();

      // RAW-only: no translator; optional direct-inject
      if (this.directInjectMode) this.enableDirectInject();

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
        this.bootGraceUntil = performance.now() + 1500;
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
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
      this.disableDirectInject();
      this.restoreGamepadGetter();
      if (this.romName) { 
        this.parentRef?.showNotification('Emulator stopped');
      }
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

  async toggleFullscreen() {
    this.closeMenuPanel();
    const canvas = this.canvas?.nativeElement;
    if (!this.isFullScreen) {
      await canvas?.requestFullscreen();
      this.isFullScreen = true;
    } else {
      await (document as any).exitFullscreen?.();
      this.isFullScreen = false;
    }
  }

  showMenuPanel() {
    this.isMenuPanelVisible = true;
    this.parentRef?.showOverlay();
    if (this.savedMappingsNames.length === 0) {
      this.loadMappingsList();
    }
    this._bootstrapDetectOnce();
  }

  closeMenuPanel() {
    this.isMenuPanelVisible = false;
    this.parentRef?.closeOverlay();
  }

  // =====================================================
  // Direct-inject (keyboard synth) — IMPLEMENTED
  // =====================================================
  enableDirectInject() {
    if (this._directInjectPoller) return;
    this._directPrevState = {};

    const poll = () => {
      try {
        const g = this.getGamepadsBase();
        for (const gp of g) {
          if (!gp) continue;

          for (const ctrl of Object.keys(this.mapping || {})) {
            const m = this.mapping[ctrl];
            if (!m || !m.gamepadId || gp.id !== m.gamepadId) continue;

            const stateKey = `${gp.id}:${ctrl}`;
            if (m.type === 'button') {
              const pressed = !!(gp.buttons && gp.buttons[m.index] && (gp.buttons[m.index] as any).pressed);
              const prev = !!this._directPrevState[stateKey];
              const keyCode = this.getKeyForControl(ctrl);
              if (keyCode) {
                if (pressed && !prev) { this.dispatchKeyboard(keyCode, true); this._directPrevState[stateKey] = true; }
                else if (!pressed && prev) { this.dispatchKeyboard(keyCode, false); this._directPrevState[stateKey] = false; }
              }
            } else if (m.type === 'axis') {
              const aidx = m.index;
              const val = (gp.axes && gp.axes[aidx]) || 0;
              const plusKey = this.getKeyForControl(ctrl.replace(/[-+]$/, '+'));
              const minusKey = this.getKeyForControl(ctrl.replace(/[-+]$/, '-'));
              const pk = `${gp.id}:${ctrl}:+`;
              const mk = `${gp.id}:${ctrl}:-`;

              if (val > 0.5) {
                if (!this._directPrevState[pk]) {
                  if (plusKey) this.dispatchKeyboard(plusKey, true);
                  this._directPrevState[pk] = true;
                }
              } else if (this._directPrevState[pk]) {
                if (plusKey) this.dispatchKeyboard(plusKey, false);
                this._directPrevState[pk] = false;
              }

              if (val < -0.5) {
                if (!this._directPrevState[mk]) {
                  if (minusKey) this.dispatchKeyboard(minusKey, true);
                  this._directPrevState[mk] = true;
                }
              } else if (this._directPrevState[mk]) {
                if (minusKey) this.dispatchKeyboard(minusKey, false);
                this._directPrevState[mk] = false;
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
    //this.parentRef?.showNotification('Direct-inject input mode enabled');
  }

  disableDirectInject() {
    if (this._directInjectPoller) {
      clearTimeout(this._directInjectPoller as any);
      this._directInjectPoller = 0;
    }
    this._directPrevState = {};
    //this.parentRef?.showNotification('Direct-inject input mode disabled');
  }

  toggleDirectInject(enabled?: boolean) {
    if (typeof enabled === 'boolean') this.directInjectMode = enabled;
    else this.directInjectMode = !this.directInjectMode;
    if (this.directInjectMode) this.enableDirectInject();
    else this.disableDirectInject();
  }

  /** Key mapping for synth (adjust to taste) */
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

  private dispatchKeyboard(code: string | null, down: boolean) {
    try {
      if (!code) return;
      const canvasEl = this.canvas?.nativeElement as HTMLCanvasElement | undefined;
      if (!canvasEl) return;
      const ev = new KeyboardEvent(down ? 'keydown' : 'keyup', { bubbles: true, cancelable: true, code, key: code });
      canvasEl.dispatchEvent(ev);
    } catch (e) {
      console.warn('Failed to dispatch keyboard event', e);
    }
  }

  // =====================================================
  // Export/import in-game save RAM
  // =====================================================
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

      const isRunning = this.status === 'running' && !!this.instance;
      const romToken = this.romTokenForMatching(this.romName);
      let targetRows = saveRows;
      let matchedOnly = false;

      if (isRunning && romToken) {
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

      const count = exported.length;
      const scope = matchedOnly ? 'matching' : 'all';
      console.log(`Prepared ${count} ${scope} in-game save file(s) for export.`);

      return result;
    } catch (err) {
      console.error('exportInGameSaveRam failed', err);
      this.parentRef?.showNotification('Failed to export in-game save RAM');
      return empty;
    }
  }

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
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        ab = u8.buffer;
      } catch { /* ignore */ }
    }
    return ab;
  }

  private inferBatteryExtFromSize(size: number): '.eep' | '.sra' | '.fla' | null {
    if (size === 512 || size === 2048) return '.eep';
    if (size === 32768) return '.sra';
    if (size === 131072) return '.fla';
    return null;
  }

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

  private async blobToN64SaveFile(blob: Blob, suggestedName?: string): Promise<File | null> {
    const size = blob.size;
    const ext = this.inferBatteryExtFromSize(size);
    if (!ext) {
      console.log('Downloaded blob is not a recognized battery save (.eep/.sra/.fla).');
      return null;
    }
    const base = (suggestedName && suggestedName.replace(/\.[^\.]+$/, '')) || this.baseNameFromRom();
    const filename = `${base}${ext}`;
    return new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  }

  async importInGameSaveRam(files: FileList | File[], skipBoot: boolean = false) {
    try {
      const dbMeta: Array<{ name?: string }> =
        (indexedDB as any).databases ? await (indexedDB as any).databases() : [];
      const mupenDb = dbMeta.find(d => d.name === '/mupen64plus');
      if (!mupenDb) {
        this.parentRef?.showNotification('IndexedDB "/mupen64plus" not found.');
        return;
      }
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('/mupen64plus');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });
      if (!Array.from(db.objectStoreNames).includes('FILE_DATA')) {
        this.parentRef?.showNotification('FILE_DATA store not found.');
        db.close();
        return;
      }

      const getTemplate = async (): Promise<any | null> => {
        const tx = db.transaction('FILE_DATA', 'readonly');
        const os = tx.objectStore('FILE_DATA');
        const rows: Array<{ key: any; val: any }> = await new Promise((resolve, reject) => {
          const res: any[] = [];
          const cur = os.openCursor();
          cur.onerror = () => reject(cur.error);
          cur.onsuccess = (ev: any) => {
            const c = ev.target.result;
            if (c) { res.push({ key: c.key, val: c.value }); c.continue(); }
            else resolve(res);
          };
        });
        const sample = rows.find(r => String(r.key).startsWith('/mupen64plus/saves/'));
        return sample ? sample.val : null;
      };
      const templateVal = await getTemplate();

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

        const txRW = db.transaction('FILE_DATA', 'readwrite');
        const osRW = txRW.objectStore('FILE_DATA');
        const existing = await new Promise<any>((resolve) => {
          const req = osRW.get(key);
          req.onerror = () => resolve(null);
          req.onsuccess = () => resolve(req.result || null);
        });

        let value: any = null;
        if (existing) {
          if (existing.contents) existing.contents = bytes;
          else if (existing.data) existing.data = bytes;
          else if (existing.bytes && Array.isArray(existing.bytes)) existing.bytes = Array.from(bytes);
          else value = bytes;
          value = value ?? existing;
        } else if (templateVal) {
          const clone = JSON.parse(JSON.stringify(templateVal));
          if (clone.contents) clone.contents = bytes;
          else if (clone.data) clone.data = bytes;
          else if (clone.bytes && Array.isArray(clone.bytes)) clone.bytes = Array.from(bytes);
          else value = bytes;
          value = value ?? clone;
        } else {
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

  // =====================================================
  // Autosave
  // =====================================================
  private async autosaveTick() {
    if (!this.autosave || this.autosaveInProgress) return;
    this.autosaveInProgress = true;

    try {
      const userId = this.parentRef?.user?.id;
      if (!userId) { return; }

      const result = await this.exportInGameSaveRam();
      const isRunning = this.status === 'running' && !!this.instance;

      if (!isRunning || !result.exported.length || !result.matchedOnly) {
        return;
      }

      let uploadedCount = 0;
      for (const item of result.exported) {
        const hash = await this.sha256Hex(item.bytes);
        const key = `${item.filename}`;
        if (this.lastUploadedHashes.get(key) === hash) continue;

        const payload: N64StateUpload = {
          userId,
          romName: result.romName ?? 'Unknown',
          filename: item.filename,
          bytes: item.bytes,
          saveTimeMs: Date.now(),
          durationSeconds: 180
        };

        try {
          const uploadRes = await this.romService.saveN64State(payload);
          if (!uploadRes.ok) {
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
    this.stopAutosaveLoop();
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

  private toTightArrayBuffer(input: ArrayBuffer | ArrayBufferView): ArrayBuffer {
    if (input instanceof ArrayBuffer) return input;
    const view = input as ArrayBufferView;
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  }

  private async sha256Hex(input: ArrayBuffer | ArrayBufferView): Promise<string> {
    const ab = this.toTightArrayBuffer(input);
    const digest = await crypto.subtle.digest('SHA-256', ab);
    const u8 = new Uint8Array(digest);
    return Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // =====================================================
  // Gamepad events & auto-detect
  // =====================================================
  private _onGamepadConnected = (ev: GamepadEvent) => {
    this.refreshGamepads();

    if (this.selectedGamepadIndex === null && this.gamepads.length) {
      if (!this.hasLoadedLastInput) {
        const std = this.gamepads.find(g => g.mapping === 'standard');
        this.onSelectGamepad(std ? std.index : ev.gamepad.index);
      } else {
        this.applyGamepadReorder();
      }
    }

    if (this.instance || this.status === 'running') {
      this.applyGamepadReorder();
    }

    this.maybeApplyStoredMappingFor(ev.gamepad.id);
  };

  private _onGamepadDisconnected = (_ev: GamepadEvent) => {
    this.refreshGamepads();
    if (this.selectedGamepadIndex !== null) {
      const stillThere = this.gamepads.some(g => g.index === this.selectedGamepadIndex);
      if (!stillThere) this.selectedGamepadIndex = null;
    }
  };

  startGamepadAutoDetect() {
    const tick = () => {
      try {
        const before = this.gamepads.map(g => g.index).join(',');
        this.refreshGamepads();
        const after = this.gamepads.map(g => g.index).join(',');

        if (this.selectedGamepadIndex === null && this.gamepads.length) {
          if (!this.hasLoadedLastInput) {
            const std = this.gamepads.find(g => g.mapping === 'standard');
            this.onSelectGamepad(std ? std.index : this.gamepads[0].index);
          } else {
            this.applyGamepadReorder();
          }
        }

        if (before !== after) {
          this.applyGamepadReorder();
        }
      } catch { console.log('Gamepad auto-detect tick failed'); }
      this._autoDetectTimer = setTimeout(tick, 750);
    };
    tick();
  }

  stopGamepadAutoDetect() {
    if (this._autoDetectTimer) {
      clearTimeout(this._autoDetectTimer);
      this._autoDetectTimer = null;
    }
  }

  private async loadLastInputSelectionAndApply(): Promise<void> {
    try {
      const uid = this.parentRef?.user?.id;
      if (!uid) return;

      const token = this.romTokenForMatching(this.romName);
      if (!token) return;

      this.refreshGamepads();

      const sel = await this.romService.getLastInputSelection(uid, token);
      if (!sel) return;

      // Select by id if present
      if (sel.gamepadId) {
        const pads = this.getGamepadsBase();
        const found = pads.find(gp => gp && gp.id === sel.gamepadId);
        if (found) {
          await this.onSelectGamepad(found.index);
        }
      }

      if (sel.mappingName) {
        if (!this.savedMappingsNames.length) await this.loadMappingsList();

        if (this.savedMappingsNames.includes(sel.mappingName)) {
          this.selectedMappingName = sel.mappingName;
          await this.applySelectedMapping();
        } else {
          try {
            const m = await this.romService.getMapping(uid, sel.mappingName);
            if (m) {
              const gp = this.currentPad();
              this.mapping = this.rebindMappingToPad(JSON.parse(JSON.stringify(m)), gp?.id || null);
              this.migrateMappingToIdsIfNeeded();
              await this.applyMappingToEmulator();
              this.selectedMappingName = sel.mappingName;
              console.log(`Applied last mapping "${sel.mappingName}" for this ROM.`);
            } else {
              console.log(`Last mapping "${sel.mappingName}" not found; using defaults.`);
            }
          } catch {
            console.log(`Failed to fetch last mapping "${sel.mappingName}".`);
          }
        }
      }
    } catch (e) {
      console.warn('loadLastInputSelectionAndApply failed', e);
    }

    this.hasLoadedLastInput = true;
  }

  // =====================================================
  // Reorder wrapper (only)
  // =====================================================
  private installReorderWrapper() {
    if (this._gpWrapperInstalled) return;
    try {
      this._originalGetGamepadsBase = navigator.getGamepads ? navigator.getGamepads.bind(navigator) : null;
      const self = this;

      (navigator as any).getGamepads = function (): (Gamepad | null)[] {
        const baseArr = (self._originalGetGamepadsBase ? self._originalGetGamepadsBase() : []) || [];
        if (!self._reorderSelectedFirst || self.selectedGamepadIndex == null) return baseArr;

        const selIdx = self.selectedGamepadIndex;
        const sel = baseArr[selIdx];
        if (!sel) return baseArr;
        return [sel, ...baseArr.filter((_: any, i: number) => i !== selIdx)];
      };

      this._gpWrapperInstalled = true;
    } catch (e) {
      console.warn('Failed installing reorder wrapper', e);
    }
  }

  private uninstallReorderWrapper() {
    if (!this._gpWrapperInstalled) return;
    try {
      if (this._originalGetGamepadsBase) {
        (navigator as any).getGamepads = this._originalGetGamepadsBase;
      }
    } catch { /* ignore */ }
    this._gpWrapperInstalled = false;
    this._originalGetGamepadsBase = null;
  }

  // =====================================================
  // Base getter + resolver + migration
  // =====================================================
  private getGamepadsBase(): (Gamepad | null)[] {
    const getter = this._originalGetGamepadsBase || (navigator.getGamepads ? navigator.getGamepads.bind(navigator) : null);
    return getter ? getter() : [];
  }

  private migrateMappingToIdsIfNeeded() {
    const arr = this.getGamepadsBase();
    for (const key of Object.keys(this.mapping || {})) {
      const m = this.mapping[key];
      if (!m) continue;
      if (!m.gamepadId && typeof m.gpIndex === 'number') {
        const gp = arr[m.gpIndex];
        if (gp?.id) {
          m.gamepadId = gp.id;
        }
      }
    }
  }

  // =====================================================
  // Logging
  // =====================================================
  private dumpGamepadDetails(label: string, list: (Gamepad | null)[]) {
    const payload = list.map(gp => {
      if (!gp) return null;
      const buttons = (gp.buttons || []).map((b: any, i: number) => ({
        i,
        pressed: !!b.pressed,
        value: b.value ?? (b.pressed ? 1 : 0)
      }));
      const axes = (gp.axes || []).map((v: number, i: number) => ({ i, value: v }));
      const pressedIdx = buttons.filter(b => b?.pressed).map(b => b?.i);
      return {
        id: gp.id,
        index: gp.index,
        mapping: gp.mapping,
        connected: gp.connected,
        timestamp: gp.timestamp,
        axesCount: axes.length,
        buttonsCount: buttons.length,
        axes,
        buttons,
        pressedIdx
      };
    });
    console.groupCollapsed(`[${label}] Gamepads snapshot`);
    console.table(payload);
    console.log(payload);
    console.groupEnd();
  }

  startGamepadLoggingRaw() {
    this.stopGamepadLoggingRaw();
    const tick = () => {
      try {
        const raw = this.getGamepadsBase();
        this.dumpGamepadDetails('RAW', raw);
      } catch (e) {
        console.warn('Raw gamepad log error', e);
      }
      this._logRawTimer = setTimeout(tick, this._logRawPeriodMs);
    };
    tick();
  }

  stopGamepadLoggingRaw() {
    if (this._logRawTimer) {
      clearTimeout(this._logRawTimer);
      this._logRawTimer = null;
    }
  }

  startGamepadLoggingEffective() {
    this.stopGamepadLoggingEffective();
    const tick = () => {
      try {
        const effective = (navigator.getGamepads ? navigator.getGamepads() : []) || [];
        this.dumpGamepadDetails('EFFECTIVE', effective as any);
      } catch (e) {
        console.warn('Effective gamepad log error', e);
      }
      this._logEffectiveTimer = setTimeout(tick, this._logEffectivePeriodMs);
    };
    tick();
  }

  stopGamepadLoggingEffective() {
    if (this._logEffectiveTimer) {
      clearTimeout(this._logEffectiveTimer);
      this._logEffectiveTimer = null;
    }
  }

  // Compatibility with your UI buttons
  startGamepadLogging() {
    this._gpPoller = 1;
    this.startGamepadLoggingRaw();
    this.startGamepadLoggingEffective();
  }
  stopGamepadLogging() {
    this._gpPoller = 0;
    this.stopGamepadLoggingRaw();
    this.stopGamepadLoggingEffective();
  }

  // =====================================================
  // Misc
  // =====================================================
  private _bootstrapDetectOnce() {
    let runs = 0;
    const burst = () => {
      this.refreshGamepads();
      runs++;
      if (runs < 8) setTimeout(burst, 250);
    };
    burst();
  }

  private async maybeApplyStoredMappingFor(id: string) {
    const knownName = this.savedMappingsNames.find(n => n.toLowerCase() === id.toLowerCase());
    if (knownName) {
      this.selectedMappingName = knownName;
      await this.applySelectedMapping();
    }
  }

  refreshGamepads() {
    try {
      const g = this.getGamepadsBase();
      this.gamepads = [];
      for (const gp of g) {
        if (!gp) continue;
        this.gamepads.push({ index: gp.index, id: gp.id, mapping: gp.mapping || '', connected: gp.connected });
      }
      if (this.selectedGamepadIndex === null && this.gamepads.length) {
        const std = this.gamepads.find((p) => p.mapping === 'standard');
        this.selectedGamepadIndex = std ? std.index : this.gamepads[0].index;
      }
    } catch (e) {
      console.warn('Failed to read gamepads', e);
    }
  }

  applyGamepadReorder() {
    if (this.selectedGamepadIndex === null) return;
    try {
      this._reorderSelectedFirst = true;
      this.installReorderWrapper();
    } catch (e) {
      console.warn('Failed to apply gamepad reorder', e);
    }
  }

  restoreGamepadGetter() {
    try {
      this.uninstallReorderWrapper();
      this._reorderSelectedFirst = false;
    } catch { /* ignore */ }
  }

  /**
   * Trigger an automatic download of the current in-game battery saves
   * (only those that match the currently loaded ROM if available).
   */
  async downloadCurrentSaves() {
    try {
      const result = await this.exportInGameSaveRam();

      if (!result.exported.length) {
        this.parentRef?.showNotification('No in-game save RAM found to download.');
        return;
      }

      // If multiple are matched, download each as a separate file.
      const scope = result.matchedOnly ? 'matching' : 'all';
      this.parentRef?.showNotification(`Downloading ${result.exported.length} ${scope} save file(s).`);

      for (const item of result.exported) {
        // Prefer a ROM-derived name if the item name isn't clean
        const filename = item.filename || (this.baseNameFromRom() + (this.inferBatteryExtFromSize(item.size) || '.bin'));
        this.downloadBytesAs(filename, item.bytes);
      }
    } catch (e) {
      console.error('downloadCurrentSaves failed', e);
      this.parentRef?.showNotification('Failed to download save(s).');
    }
  }

  /** Programmatically click the hidden file input. */
  openSavePicker() {
    const el = this.saveFileInput?.nativeElement;
    if (!el) {
      this.parentRef?.showNotification('Save file picker not available.');
      return;
    }
    el.click();
  }

  /** Handle files selected by the user and import them into IndexedDB. */
  async onSaveFilePicked(ev: Event) {
    try {
      const input = ev.target as HTMLInputElement;
      const files = input.files;
      if (!files || files.length === 0) return;

      // This will write to /mupen64plus/FILE_DATA and restart the emulator if needed.
      await this.importInGameSaveRam(files, /* skipBoot */ false);
    } catch (e) {
      console.error('onSaveFilePicked failed', e);
      this.parentRef?.showNotification('Failed to import save files.');
    } finally {
      // allow picking the same file again by clearing the input
      try { (ev.target as HTMLInputElement).value = ''; } catch { }
    }
  }

  /** Normalize any buffer-like to a *plain* ArrayBuffer (never SharedArrayBuffer). */
  private toPlainArrayBuffer(
    input: Uint8Array | ArrayBuffer | SharedArrayBuffer | ArrayBufferView
  ): ArrayBuffer {
    // Fast path: plain ArrayBuffer → clone (avoid sharing/mutation)
    if (input instanceof ArrayBuffer) {
      return input.slice(0);
    }

    // Handle SharedArrayBuffer explicitly
    const hasSAB = typeof SharedArrayBuffer !== 'undefined';
    if (hasSAB && input instanceof SharedArrayBuffer) {
      // Copy SAB into a new, non-shared ArrayBuffer
      return new Uint8Array(input).slice().buffer;
    }

    // If it's a Uint8Array or any view
    if (ArrayBuffer.isView(input as any)) {
      const view = input as ArrayBufferView;
      const backing = view.buffer as ArrayBuffer | SharedArrayBuffer;

      // If the backing is SAB, copy into a normal buffer
      if (hasSAB && backing instanceof SharedArrayBuffer) {
        return new Uint8Array(backing, view.byteOffset, view.byteLength).slice().buffer;
      }

      // Otherwise slice the ArrayBuffer to a tight copy
      return (backing as ArrayBuffer).slice(view.byteOffset, view.byteOffset + view.byteLength);
    }

    // If we reach here TS allowed a type we didn't expect at runtime
    throw new Error('Unsupported buffer type for Blob');
  }

  /** Trigger a browser download for bytes. Accepts various buffer-like inputs. */
  private downloadBytesAs(
    filename: string,
    bytes: Uint8Array | ArrayBuffer | SharedArrayBuffer | ArrayBufferView
  ) {
    try {
      const ab: ArrayBuffer = this.toPlainArrayBuffer(bytes);
      const blob = new Blob([ab], { type: 'application/octet-stream' });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.warn('downloadBytesAs failed', e);
      this.parentRef?.showNotification(`Failed to download "${filename}".`);
    }
  }

  private romTokenForMatching(name?: string): string | null {
    if (!name) return null;
    let base = name.replace(/\.(z64|n64|v64|zip|7z|rom)$/i, '');
    base = base
      .replace(/\s+/g, ' ')
      .replace(/\s*\((?:U|E|J|JU|USA|Europe|Japan|V\d+(\.\d+)?)\)\s*/gi, ' ')
      .replace(/\s*\[(?:!|b\d*|h\d*|o\d*|t\d*|M\d*|a\d*)\]\s*/gi, ' ')
      .trim()
      .toLowerCase();
    const loose = base.replace(/[^a-z0-9 ]/g, '').trim();
    return loose || null;
  }

  private _onFullscreenChange = () => {
    try {
      const canvasEl = this.canvas?.nativeElement;
      // We are in fullscreen iff the fullscreenElement is the canvas
      this.isFullScreen = !!document.fullscreenElement && document.fullscreenElement === canvasEl;

      // Ensure the canvas resizes correctly after the UI reflows
      this.resizeCanvasToParent();

      // Optional: force a re-lay out for emu
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    } catch { /* ignore */ }
  };

}

// ---------------------------
// Types
// ---------------------------
type N64ExportedSave = {
  key: string;
  filename: string;
  kind: 'battery';
  size: number;
  bytes: Uint8Array;
};

type ExportInGameSaveRamResult = {
  romName: string | null;
  matchedOnly: boolean;
  totalFound: number;
  exported: N64ExportedSave[];
};