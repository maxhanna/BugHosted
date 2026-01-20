
import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import createMupen64PlusWeb from 'mupen64plus-web';
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
  private _sdlPadName: string | null = null;           // the exact SDL device name Mupen prints
  private _lastAppliedSectionName: string | null = null;// to avoid re-applying in a loop

  // ---- Mapping UI/store ----
  showKeyMappings = false;
  savedMappingsNames: string[] = [];
  private _mappingsStoreKey = 'n64_mappings_store_v1';
  selectedMappingName: string | null = null;

  private _romGoodName: string | null = null;
  private _romMd5: string | null = null;

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
  ports: Record<PlayerPort, PortConfig> = {
    1: { gpIndex: null, mapping: {}, mappingName: null },
    2: { gpIndex: null, mapping: {}, mappingName: null },
    3: { gpIndex: null, mapping: {}, mappingName: null },
    4: { gpIndex: null, mapping: {}, mappingName: null },
  };
  editingPort: PlayerPort | null = null;
  private _applyingAll = false;

  // Remapper (list) helpers
  liveTest = true;
  private _recordingFor: string | null = null;
  exportText: string | null = null;

  // Optional direct-inject keyboard synth (OFF by default)
  directInjectMode = false;
  private _directInjectPoller = 0;
  private _directPrevState: Record<string, boolean> = {};
  trackGp = (_: number, gp: { index: number }) => gp.index;

  // UI modal / fullscreen
  isMenuPanelVisible = false;
  isFullScreen = false;

  // Persist keys
  private _mappingKey = 'n64_gamepad_mapping_v1';
  showFileSearch = false;
  private _autoDetectTimer: any = null;

  private hasLoadedLastInput = false;
  private bootGraceUntil = 0;
  private _ensureRanThisBoot = false;

  // Autosave
  autosave = true;
  private autosaveTimer: any = null;
  private autosavePeriodMs = 3 * 60 * 1000;
  private autosaveInProgress = false;
  private _fileDataNormalizedOnce = false;

  // Canvas resize
  private _canvasResizeAdded = false;
  private _resizeHandler = () => this.resizeCanvasToParent();
  private _resizeObserver?: ResizeObserver;

  // Reorder wrapper only (no translator)
  private _originalGetGamepadsBase: any = null;
  private _gpWrapperInstalled = false;

  // Logging
  _gpPoller: any;
  private _logRawTimer: any = null;
  private _logEffectiveTimer: any = null;
  private _logRawPeriodMs = 750;
  private _logEffectivePeriodMs = 750;

  // Axis behavior
  private _axisDeadzone = 0.2;

  // ---- Debug knobs ---- 
  private DEBUG_CLEAR_SAVESTATES = true; // set to false in prod builds

  constructor(private fileService: FileService, private romService: RomService) {
    super();
  }

  ngOnInit(): void {
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
      document.removeEventListener('fullscreenchange', this._onFullscreenChange);
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


  async onFileSearchSelected(file: FileEntry) {
    try {
      if (!file) {
        this.parentRef?.showNotification('Invalid file selected');
        return;
      }
      this.startLoading();

      // 1) Download ROM
      const response = await this.romService.getRomFile(file.fileName ?? "", this.parentRef?.user?.id, file.id);
      if (!response) {
        this.parentRef?.showNotification('Failed to download selected ROM');
        return;
      }
      const buffer = await response.arrayBuffer();
      this.romBuffer = buffer;
      this.romName = file.fileName || "";
      console.log(`Loaded ${this.romName} from search`);

      // 2) Apply last input selection (pads/mapping) if any
      await this.loadLastInputSelectionAndApply().catch(() => { });

      // 3) Boot once to ensure FS/IDBFS is ready
      await this.boot();
      await this.waitForRomIdentity(2000).catch(() => { });

      // 4) Fetch latest server save for this ROM and inject it
      const userId = this.parentRef?.user?.id;
      if (userId && this.romName) {
        const res = await this.romService.getN64SaveByName(this.romName, userId);
        if (res) {
          console.log("Found Save File.");
          const saveFile = await this.blobToN64SaveFile(res.blob, res.filename); // exact filename from server
          await this.importInGameSaveRam([saveFile], /* skipBoot */ true);

          if (this.DEBUG_CLEAR_SAVESTATES) {
            await this.deleteSavestatesForCurrentRom();
          }

          // // 5) Restart emulator so the game reads the imported battery save
          // await this.stop();
          // await new Promise(r => setTimeout(r, 300));
          // await this.boot();
        } else {
          console.log("No save file found for this ROM.");
          this.parentRef?.showNotification('No save found on server for this ROM.');
        }
      }
    } catch (e) {
      console.error('Error loading ROM from search', e);
      this.parentRef?.showNotification('Error loading ROM from search');
    } finally {
      this.stopLoading();
    }
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
      const fsId = this.fullscreenContainer?.nativeElement?.id;
      if (fsId && container.id !== fsId) {
        this.isFullScreen = false;
      }
    } catch (e) {
      console.warn('Failed to resize canvas', e);
    }
  }

  private currentPad(): Gamepad | null {
    const pads = this.getGamepadsBase();
    const idx = this.selectedGamepadIndex ?? 0;
    return pads[idx] || null;
  }

  private generateDefaultRawMappingForPad(gp: Gamepad) {
    const id = gp.id;
    const m: Record<string, any> = {};
    m['A Button'] = { type: 'button', index: 0, gamepadId: id };
    m['B Button'] = { type: 'button', index: 1, gamepadId: id };
    m['Z Trig'] = { type: 'button', index: 6, gamepadId: id };
    m['L Trig'] = { type: 'button', index: 4, gamepadId: id };
    m['R Trig'] = { type: 'button', index: 5, gamepadId: id };
    m['Start'] = { type: 'button', index: 9, gamepadId: id };
    m['DPad U'] = { type: 'button', index: 12, gamepadId: id };
    m['DPad D'] = { type: 'button', index: 13, gamepadId: id };
    m['DPad L'] = { type: 'button', index: 14, gamepadId: id };
    m['DPad R'] = { type: 'button', index: 15, gamepadId: id };
    m['Analog X+'] = { type: 'axis', index: 0, axisDir: 1, gamepadId: id };
    m['Analog X-'] = { type: 'axis', index: 0, axisDir: -1, gamepadId: id };
    m['Analog Y+'] = { type: 'axis', index: 1, axisDir: 1, gamepadId: id };
    m['Analog Y-'] = { type: 'axis', index: 1, axisDir: -1, gamepadId: id };
    m['C Button R'] = { type: 'axis', index: 2, axisDir: 1, gamepadId: id };
    m['C Button L'] = { type: 'axis', index: 2, axisDir: -1, gamepadId: id };
    m['C Button D'] = { type: 'axis', index: 3, axisDir: 1, gamepadId: id };
    m['C Button U'] = { type: 'axis', index: 3, axisDir: -1, gamepadId: id };
    this.mapping = m;
  }

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
        for (let b = 0; b < gp.buttons.length; b++) {
          if ((gp.buttons[b] as any).pressed) {
            this.mapping[control] = { type: 'button', index: b, gamepadId: gp.id };
            this._recordingFor = null;
            this.parentRef?.showNotification(`${control} → button(${b})`);
            return;
          }
        }
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
      this.parentRef?.showNotification('Failed to apply mapping');
    }
  }

  onMappingSelect(name: string) {
    this.selectedMappingName = name || null;
    this.applySelectedMapping();
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

    if (this.status === 'running' || this.status === 'booting') {
      // ❌ Never write InputAutoCfg while emulator is alive
      this.parentRef?.showNotification(
        'Controller mapping will be applied on next launch.'
      );
      return;
    }

    const config: Record<string, string> = {};
    const handled = new Set<string>();

    const pairAxis = (minus: string, plus: string, axis: string) => {
      const a = this.mapping[minus];
      const b = this.mapping[plus];
      if (a && b && a.type === 'axis' && b.type === 'axis') {
        config[axis] = `axis(${a.index}-,${b.index}+)`;
        handled.add(minus);
        handled.add(plus);
      }
    };

    pairAxis('Analog X-', 'Analog X+', 'X Axis');
    pairAxis('Analog Y-', 'Analog Y+', 'Y Axis');

    for (const k of Object.keys(this.mapping)) {
      if (handled.has(k)) continue;
      const m = this.mapping[k];
      if (!m) continue;
      config[k] = m.type === 'button'
        ? `button(${m.index})`
        : `axis(${m.index}${m.axisDir === -1 ? '-' : '+'})`;
    }

    const sectionName =
      this._sdlPadName ||
      Object.values(this.mapping).find(v => v?.gamepadId)?.gamepadId ||
      this.currentPad()?.id ||
      'Custom Gamepad';

    await this.writeInputAutoCfgSection(sectionName, config);
    this._lastAppliedSectionName = sectionName;

    this.parentRef?.showNotification(
      `Mapping saved for "${sectionName}". Restart emulator to apply.`
    );
  } catch (e) {
    console.error('applyMappingToEmulator failed', e);
  }
} 

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
      } catch (e) {
        console.log("Failed to select gamepad: ", e);
      } finally {
        this.ensureP1InitializedFromSinglePad();
      }
      return;
    }

    this.selectedGamepadIndex = idx;
    this.refreshGamepads();
    this.applyGamepadReorder();

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
        await new Promise((r) => setTimeout(r, 320));
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

  async boot() {
    if (!this.romBuffer) {
      this.parentRef?.showNotification('Pick a ROM first');
      return;
    }
    if (this.autosave) {
      this.startAutosaveLoop();
    }
    this._ensureRanThisBoot = false;

    const canvasEl = this.canvas?.nativeElement as HTMLCanvasElement | undefined;
    if (!canvasEl) {
      this.parentRef?.showNotification('No canvas available');
      return;
    }

    this.resizeCanvasToParent();

    if (!this._canvasResizeAdded) {
      try {
        window.addEventListener('resize', this._resizeHandler);
        document.addEventListener('fullscreenchange', this._onFullscreenChange);
        window.addEventListener('orientationchange', this._resizeHandler);
        this._canvasResizeAdded = true;
      } catch { /* ignore */ }
    }

    this.loading = true;
    this.status = 'booting';

// ✅ Apply mapping BEFORE emulator exists
if (Object.keys(this.mapping || {}).length) {
  const section =
    this._sdlPadName ||
    Object.values(this.mapping).find(v => v?.gamepadId)?.gamepadId ||
    this.currentPad()?.id ||
    'Custom Gamepad';

  await this.writeInputAutoCfgSection(
    section,
    this.buildAutoInputConfigFromMapping(this.mapping)
  );

  this._lastAppliedSectionName = section;
}

    // ✅ Reset meta and start sniffer BEFORE emulator creation
    this._romGoodName = null;
    this._romMd5 = null;
    const restoreSniffer = this.installMupenConsoleSniffer();

    try {
      //this.applyGamepadReorder();
      if (this.directInjectMode) this.enableDirectInject();
this.restoreGamepadGetter();
      this.instance = await createMupen64PlusWeb({ 
        preRun: [ this._preRunIdbfsGuards ], 
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

      if (!this.instance || typeof this.instance.start !== 'function') {
        this.status = 'error';
        throw new Error('Emulator instance missing start method');
      }

      // Order matters: install read-only sync BEFORE start() 
      // Install guards *immediately*, before any IDBFS sync kicks in
      this.installHiddenIdbfsGuardsBrutal({ passes: 8, interval: 40 });
      //this.installSyncfsGate();         // keep: single-flight debounce
      this.installIdbfsReadOnlySync();  // read-only sync + installs brutal guard again for populate
      this.pruneUnsupportedNodesUnder('/mupen64plus'); // optional but helpful

      // await this.repairAllIdbTimestampFields();
      await this.normalizeMupenFileDataShapes();

      //const FS = (this.instance as any)?.FS;
      // console.log('IDBFS guards:',
      //   FS?.filesystems?.IDBFS?.storeLocalEntry?.__guarded,
      //   FS?.filesystems?.IDBFS?.storeRemoteEntry?.__guarded
      // );
      // console.log('Mounts:', FS?.mounts?.map((m: any) => ({
      //   typeHasGuards: !!(m?.type?.storeLocalEntry?.__guarded),
      // })));

      await this.instance.start();
      this.status = 'running';

      //await this.repairIdbfsMetaTimestamps(); 
      await this.waitForRomIdentity(2000); 

      restoreSniffer();// ✅ Stop sniffing once ROM meta printed

      // Give IDBFS a small head start; reduces "syncfs overlap" churn
      await new Promise(r => setTimeout(r, 400));


      this.parentRef?.showNotification(`Booted ${this.romName}`);
      this.bootGraceUntil = performance.now() + 1500;
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    } catch (ex) {
      console.error('Failed to boot emulator', ex);
      this.status = 'error';
      this.parentRef?.showNotification('Failed to boot emulator');
      this.restoreGamepadGetter();
      throw ex;
    } finally {
      // Always restore to avoid leaving console patched if something throws early
      try { restoreSniffer(); } catch { /* ignore */ }
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
      this.applyGamepadReorder();
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
    if (this.savedMappingsNames.length === 0) this.loadMappingsList();
    this._bootstrapDetectOnce();

    // Pause the background auto-detect while interacting with dropdowns
    this.stopGamepadAutoDetect();

    if (this.ports[1].gpIndex == null && this.gamepads.length) {
      const std = this.gamepads.find(g => g.mapping === 'standard') ?? this.gamepads[0];
      if (std) {
        this.ports[1].gpIndex = std.index;
        this.ensureDefaultMappingForPort(1);
      }
    }
  }

  closeMenuPanel() {
    this.isMenuPanelVisible = false;
    this.parentRef?.closeOverlay();
    // Resume
    this.startGamepadAutoDetect();
  }


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
  }

  disableDirectInject() {
    if (this._directInjectPoller) {
      clearTimeout(this._directInjectPoller as any);
      this._directInjectPoller = 0;
    }
    this._directPrevState = {};
  }

  toggleDirectInject(enabled?: boolean) {
    if (typeof enabled === 'boolean') this.directInjectMode = enabled;
    else this.directInjectMode = !this.directInjectMode;
    if (this.directInjectMode) this.enableDirectInject();
    else this.disableDirectInject();
  }

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


  async exportInGameSaveRam(): Promise<ExportInGameSaveRamResult> {
    const empty: ExportInGameSaveRamResult = {
      romName: this.romName ?? null,
      matchedOnly: false,
      totalFound: 0,
      exported: []
    };

    try {
      const db = await this.openMupenDb();
      if (!db) return empty;

      const rows: Array<{ key: any; val: any }> = await new Promise((resolve, reject) => {
        const tx = db.transaction('FILE_DATA', 'readonly');
        const os = tx.objectStore('FILE_DATA');
        const res: any[] = [];
        const cur = os.openCursor();
        cur.onerror = () => reject(cur.error);
        cur.onsuccess = (ev: any) => {
          const c = ev.target.result;
          if (c) { res.push({ key: c.key, val: c.value }); c.continue(); }
          else resolve(res);
        };
      });

      const exported: N64ExportedSave[] = [];

      for (const { key, val } of rows) {
        const path = String(key);
        if (!path.startsWith('/mupen64plus/saves/')) continue;
        if (!/\.(eep|sra|fla)$/i.test(path)) continue;

        const ab = this.normalizeToArrayBuffer(val);
        if (!ab) continue;

        exported.push({
          key: path,
          filename: path.split('/').pop()!,
          kind: 'battery',
          size: ab.byteLength,
          bytes: new Uint8Array(ab)
        });
      }

      db.close();

      return {
        romName: this.romName ?? null,
        matchedOnly: false,
        totalFound: exported.length,
        exported
      };
    } catch (err) {
      console.error('exportInGameSaveRam failed', err);
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


  private async blobToN64SaveFile(blob: Blob, filename: string): Promise<File> {
    return new File(
      [blob],
      filename, // ✅ EXACT server filename
      { type: 'application/octet-stream' }
    );
  }


  async importInGameSaveRam(files: FileList | File[], skipBoot: boolean = false) {
    try {
      const db = await this.openMupenDb();
      if (!db) {
        this.parentRef?.showNotification('IndexedDB "/mupen64plus" not found or missing FILE_DATA.');
        return;
      }
      // Load a template row if needed to match stored shape
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
      const userId = this.parentRef?.user?.id ?? 0;

      const makeValue = (bytes: Uint8Array, existingOrTemplate?: any) => {
        const now = new Date();
        const v = existingOrTemplate ? JSON.parse(JSON.stringify(existingOrTemplate)) : { contents: bytes, timestamp: now };

        if (v.contents !== undefined) v.contents = bytes;
        else if (v.data !== undefined) v.data = bytes;
        else if (Array.isArray(v.bytes)) v.bytes = Array.from(bytes);
        else v.contents = bytes;

        if (!(v.timestamp instanceof Date)) v.timestamp = now;
        if ('mtime' in v && !(v.mtime instanceof Date)) v.mtime = now;
        if ('ctime' in v && !(v.ctime instanceof Date)) v.ctime = now;
        if ('atime' in v && !(v.atime instanceof Date)) v.atime = now;

        return v;
      };

      const txPut = (os: IDBObjectStore, key: string, val: any) => new Promise<void>((resolve, reject) => {
        const r = os.put(val, key);
        r.onerror = () => reject(r.error);
        r.onsuccess = () => resolve();
      });

      for (const fAny of Array.from(files)) {
        const f = fAny as File;
        const name = f.name;
        const ext = (name.match(/\.(eep|sra|fla)$/i)?.[0] || '').toLowerCase() as '.eep' | '.sra' | '.fla' | string;
        if (!allowedExts.includes(ext)) {
          this.parentRef?.showNotification(`Skipped "${name}" (unsupported type)`);
          continue;
        }

        const bytes = new Uint8Array(await f.arrayBuffer());

        const saveKey = `/mupen64plus/saves/${f.name}`;

        const tx = db.transaction('FILE_DATA', 'readwrite');
        const os = tx.objectStore('FILE_DATA');

        await new Promise<void>((resolve, reject) => {
          const r = os.put(
            { contents: bytes, timestamp: new Date() },
            saveKey
          );
          r.onerror = () => reject(r.error);
          r.onsuccess = () => resolve();
        });


        written.push(name);
      }

      db.close();

      // Reboot if needed
      if (written.length) {
        console.log(`Imported ${written.length} save file(s): ${written.join(', ')}`);
        this.parentRef?.showNotification(`Imported ${written.length} save file(s): ${written.join(', ')}`);
        const wasRunning = this.status === 'running' || !!this.instance;
        await this.normalizeMupenFileDataShapes();
        // if (wasRunning) {
        //   await this.stop();
        //   await new Promise(r => setTimeout(r, 400));
        //   // await this.syncFs('post-import');
        // }
        if (!skipBoot) {
          await this.boot();
        }
      } else {
        console.log("No Save files imported");
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


  private async autosaveTick() {
    if (!this.autosave || this.autosaveInProgress) return;
    this.autosaveInProgress = true;

    try {
      const userId = this.parentRef?.user?.id;
      if (!userId) return;

      const result = await this.exportInGameSaveRam();
      const isRunning = this.status === 'running' && !!this.instance;
      if (!isRunning || !result.exported.length) return;

      // Prefer one save type: .sra > .fla > .eep
      const pick =
        result.exported.find(s => s.filename.toLowerCase().endsWith('.sra')) ||
        result.exported.find(s => s.filename.toLowerCase().endsWith('.fla')) ||
        result.exported.find(s => s.filename.toLowerCase().endsWith('.eep'));

      if (!pick) return;

      let uploadedCount = 0;
      try {
        await this.romService.saveN64State({
          userId,
          romName: this.romName!,   // make sure romName is set
          filename: pick.filename,  // exact mupen filename
          emuKey: pick.key,         // exact IDBFS path
          bytes: pick.bytes,
          saveTimeMs: Date.now()
        });
        uploadedCount = 1;
      } catch (e) {
        console.warn('Autosave upload failed:', e);
      }

      if (uploadedCount > 0) {
        this.parentRef?.showNotification(`Autosaved ${uploadedCount} file(s) for ${result.romName ?? 'current ROM'}.`);
      }
    } catch (err) {
      console.error('autosaveTick error', err);
    } finally {
      this.autosaveInProgress = false;
      console.log("Finished Autosave");
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

  private _onGamepadConnected = (ev: GamepadEvent) => {
    this.refreshGamepads();

    if (this.ports[1].gpIndex == null && this.gamepads.length) {
      if (!this.hasLoadedLastInput) {
        const std = this.gamepads.find(g => g.mapping === 'standard');
        this.assignFirstDetectedToP1(std ? std.index : ev.gamepad.index);
      } else {
        this.applyGamepadReorder();
      }
    }


if (!this.instance && this.status !== 'running' && this.status !== 'booting') {
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

    for (const p of [1, 2, 3, 4] as const) {
      const idx = this.ports[p].gpIndex;
      if (idx != null && !this.gamepads.some(g => g.index === idx)) {
        this.ports[p].gpIndex = null;
        this.parentRef?.showNotification?.(`P${p} controller disconnected`);
      }
    }
    this.applyGamepadReorder();
  };

  startGamepadAutoDetect() {
    const tick = () => {
      try {
        const before = this.gamepads.map(g => g.index).join(',');

        // ✅ REQUIRED: pull fresh browser state
        this.refreshGamepads();

        const after = this.gamepads.map(g => g.index).join(',');

        // If P1 is not assigned yet, pick a sensible default (prefer a 'standard' pad)
        if (this.ports[1].gpIndex == null && this.gamepads.length) {
          if (!this.hasLoadedLastInput) {
            const std = this.gamepads.find(g => g.mapping === 'standard');
            this.assignFirstDetectedToP1(std ? std.index : this.gamepads[0].index);
          } else {
            this.applyGamepadReorder();
          }
        }

        // Re-apply reorder if the visible list changed
        if (before !== after) {
          this.applyGamepadReorder();
        }
      } catch {
        console.log('Gamepad auto-detect tick failed');
      }
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


  private assignFirstDetectedToP1(preferredIdx?: number) {
    const pads = this.getGamepadsBase();
    if (!pads || !pads.length) return;

    const std = pads.find(p => p && p.mapping === 'standard');
    const chosen = std ?? (typeof preferredIdx === 'number' ? pads[preferredIdx] : pads[0]);
    if (!chosen) return;

    const idx = chosen.index;
    this.ports[1].gpIndex = idx;

    this.ensureDefaultMappingForPort(1);
    this.selectedGamepadIndex = idx;

    // Now that P1 is assigned, enable the reorder wrapper
    this.applyGamepadReorder();
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

  
// --- Reorder wrapper (safe fallback until P1 assigned) ---
private installReorderWrapper() {
  if (this._gpWrapperInstalled) return;

  // ❌ Never install the wrapper while the emulator is running
  if (this.instance || this.status === 'running' || this.status === 'booting') return;

  try {
    this._originalGetGamepadsBase = navigator.getGamepads
      ? navigator.getGamepads.bind(navigator)
      : null;

    const self = this;

    (navigator as any).getGamepads = function (): (Gamepad | null)[] {
      const baseArr = (self._originalGetGamepadsBase ? self._originalGetGamepadsBase() : []) || [];

      // Until P1 is assigned, do not reorder — return native list
      if (self.ports[1].gpIndex == null) return baseArr;

      const chosen: (Gamepad | null)[] = [];
      const used = new Set<number>();
      const pushIf = (idx: number | null) => {
        if (idx == null) return;
        const pad = baseArr[idx];
        if (pad && !used.has(idx)) { chosen.push(pad); used.add(idx); }
      };

      // Assigned ports first
      pushIf(self.ports[1].gpIndex);
      pushIf(self.ports[2].gpIndex);
      pushIf(self.ports[3].gpIndex);
      pushIf(self.ports[4].gpIndex);

      // Then everyone else
      for (let i = 0; i < baseArr.length; i++) {
        if (!used.has(i)) chosen.push(baseArr[i]);
      }
      return chosen;
    };

    this._gpWrapperInstalled = true;
  } catch (e) {
    console.warn('Failed installing reorder wrapper', e);
  }
}

applyGamepadReorder() {
  try {
    // ❌ Do NOT install the wrapper while the emulator is running
    if (this.instance || this.status === 'running' || this.status === 'booting') return;
    this.installReorderWrapper(); // safe to call repeatedly when stopped/idle
  } catch (e) {
    console.warn('Failed to apply gamepad reorder', e);
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

  // Always fetch the raw browser list (wrapper only affects navigator.getGamepads())
  private getGamepadsBase(): (Gamepad | null)[] {
    const getter = this._originalGetGamepadsBase || (navigator.getGamepads ? navigator.getGamepads.bind(navigator) : null);
    return getter ? getter() : [];
  }

  restoreGamepadGetter() {
    try { this.uninstallReorderWrapper(); } catch { /* ignore */ }
  }


  closeRemapperToPort(port: PlayerPort) {
    this.ports[port].mapping = JSON.parse(JSON.stringify(this.mapping));
    this.showKeyMappings = false;
    this.parentRef?.showNotification(`Updated mapping for P${port}`);
  }


  async onSelectGamepadForPort(port: PlayerPort, value: string) {
    // Convert sentinel to null
    if (value === '__none__') {
      if (this.ports[port].gpIndex != null) {
        this.ports[port].gpIndex = null;
        this.applyGamepadReorder(); // reflect multi-port order
      }
      return;
    }

    const idx = parseInt(value, 10);
    if (Number.isNaN(idx)) return;

    // Prevent duplicate controller assignment across ports
    for (const p of [1, 2, 3, 4] as const) {
      if (p !== port && this.ports[p].gpIndex === idx) {
        this.parentRef?.showNotification(`That controller is already assigned to Player ${p}.`);
        return;
      }
    }

    // IMPORTANT: do NOT call refreshGamepads() here; it rebuilds the list and can reset selection.
    this.ports[port].gpIndex = idx;
    this.applyGamepadReorder();
    this.ensureDefaultMappingForPort(port);
  }


  onPortMappingSelect(port: PlayerPort, name: string) {
    this.ports[port].mappingName = name || null;
    this.applySelectedMappingForPort(port);
  }

  async applySelectedMappingForPort(port: PlayerPort) {
    const name = this.ports[port].mappingName;
    if (!name) {
      const idx = this.ports[port].gpIndex;
      const pads = this.getGamepadsBase();
      const gp = (idx != null) ? pads[idx] : null;

      this.ports[port].mapping = {};
      if (gp?.mapping === 'standard') {
        this.generateDefaultRawMappingForPad(gp);
        this.ports[port].mapping = JSON.parse(JSON.stringify(this.mapping));
        this.parentRef?.showNotification(`Default RAW mapping for P${port} (standard controller).`);
      }
      return;
    }

    try {
      const uid = this.parentRef?.user?.id;
      if (uid) {
        try {
          const m = await this.romService.getMapping(uid, name);
          if (m) {
            const idx = this.ports[port].gpIndex;
            const gpId = this.gamepadIdFromIndex(idx);
            const rebound = this.rebindMappingToPad(JSON.parse(JSON.stringify(m)), gpId);
            this.migrateMappingToIdsIfNeeded();
            this.ports[port].mapping = rebound;
            this.parentRef?.showNotification(`Applied mapping "${name}" to P${port}`);
            return;
          }
        } catch {/* fall back to local */ }
      }

      const raw = localStorage.getItem(this._mappingsStoreKey);
      const store = raw ? JSON.parse(raw) : {};
      const m = store[name];
      if (m) {
        const idx = this.ports[port].gpIndex;
        const gpId = this.gamepadIdFromIndex(idx);
        const rebound = this.rebindMappingToPad(JSON.parse(JSON.stringify(m)), gpId);
        this.migrateMappingToIdsIfNeeded();
        this.ports[port].mapping = rebound;
        this.parentRef?.showNotification(`Applied mapping "${name}" to P${port}`);
      } else {
        this.parentRef?.showNotification('Selected mapping not found');
        await this.loadMappingsList();
      }
    } catch (e) {
      console.error('applySelectedMappingForPort failed', e);
      this.parentRef?.showNotification('Failed to apply mapping');
    }
  }

  async applyAllPortMappings() {
    if (this._applyingAll) return;
    this._applyingAll = true;

    try {
      const wasRunning = !!this.instance || this.status === 'running';
      if (wasRunning) {
        await this.stop();
        await new Promise(r => setTimeout(r, 350));
      }

      for (const p of [1, 2, 3, 4] as const) {
        const idx = this.ports[p].gpIndex;
        if (idx == null) continue;
        this.ensureDefaultMappingForPort(p);

        const gpId = this.gamepadIdFromIndex(idx);
        if (!gpId) continue;

        const perPortMapping = this.rebindMappingToPad(
          JSON.parse(JSON.stringify(this.ports[p].mapping || {})),
          gpId
        );
        this.ports[p].mapping = perPortMapping; 
        const cfg = this.buildAutoInputConfigFromMapping(perPortMapping);
        const sectionName = gpId;
        await this.safeWriteAutoCfg(sectionName, cfg); 
      }

      if (this.multiPortActive() && this.directInjectMode) {
        this.toggleDirectInject(false);
        this.parentRef?.showNotification('Direct-inject disabled for multi-controller mode.');
      }

      this.applyGamepadReorder();

      if (wasRunning) await this.boot();
    } catch (e) {
      console.error('applyAllPortMappings failed', e);
      this.parentRef?.showNotification('Failed to apply multi-controller mappings');
    } finally {
      this._applyingAll = false;
    }
  }

private async safeWriteAutoCfg(sectionName: string, cfg: Record<string,string>) {
  try {
    // If you still want to try the library helper:
    // const res = await writeAutoInputConfig(sectionName, cfg as any);
    // if (!res || !res.autoInputConfig) throw new Error('no-base-config');
    // (Avoid reading res.autoInputConfig.matchScore; it may not exist.)
    // return res;

    // Recommended: skip the helper entirely:
    await this.writeInputAutoCfgSection(sectionName, cfg);
  } catch {
    // Fallback: always write the section directly
    await this.writeInputAutoCfgSection(sectionName, cfg);
  }
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


  async downloadCurrentSaves() {
    try {
      const result = await this.exportInGameSaveRam();
      if (!result.exported.length) {
        this.parentRef?.showNotification('No in-game save RAM found to download.');
        return;
      }
      const scope = result.matchedOnly ? 'matching' : 'all';
      this.parentRef?.showNotification(`Downloading ${result.exported.length} ${scope} save file(s).`);

      const userId = this.parentRef?.user?.id ?? 0;

      for (const item of result.exported) {
        const ext = this.detectSaveExt(item.filename, item.size);
        const base = this.canonicalRomBaseFromFileName(this.romName);
        const filename = userId ? `${base}_${userId}${ext}` : `${base}${ext}`;
        this.downloadBytesAs(filename, item.bytes);
      }
    } catch (e) {
      console.error('downloadCurrentSaves failed', e);
      this.parentRef?.showNotification('Failed to download save(s).');
    }
  }

  openSavePicker() {
    const el = this.saveFileInput?.nativeElement;
    if (!el) {
      this.parentRef?.showNotification('Save file picker not available.');
      return;
    }
    el.click();
  }

  async onSaveFilePicked(ev: Event) {
    try {
      const input = ev.target as HTMLInputElement;
      const files = input.files;
      if (!files || files.length === 0) return;

      await this.importInGameSaveRam(files, /* skipBoot */ false);
      if (this.DEBUG_CLEAR_SAVESTATES) {
        await this.deleteSavestatesForCurrentRom();
      }
    } catch (e) {
      console.error('onSaveFilePicked failed', e);
      this.parentRef?.showNotification('Failed to import save files.');
    } finally {
      try { (ev.target as HTMLInputElement).value = ''; } catch { }
    }
  }

  private toPlainArrayBuffer(
    input: Uint8Array | ArrayBuffer | SharedArrayBuffer | ArrayBufferView
  ): ArrayBuffer {
    if (input instanceof ArrayBuffer) {
      return input.slice(0);
    }

    const hasSAB = typeof SharedArrayBuffer !== 'undefined';
    if (hasSAB && input instanceof SharedArrayBuffer) {
      return new Uint8Array(input).slice().buffer;
    }

    if (ArrayBuffer.isView(input as any)) {
      const view = input as ArrayBufferView;
      const backing = view.buffer as ArrayBuffer | SharedArrayBuffer;

      if (hasSAB && backing instanceof SharedArrayBuffer) {
        return new Uint8Array(backing, view.byteOffset, view.byteLength).slice().buffer;
      }

      return (backing as ArrayBuffer).slice(view.byteOffset, view.byteOffset + view.byteLength);
    }

    throw new Error('Unsupported buffer type for Blob');
  }

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
      this.isFullScreen = !!document.fullscreenElement && document.fullscreenElement === canvasEl;
      this.resizeCanvasToParent();
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    } catch { /* ignore */ }
  };

  private ensureP1InitializedFromSinglePad() {
    if (this.ports[1].gpIndex == null && this.selectedGamepadIndex != null) {
      this.ports[1].gpIndex = this.selectedGamepadIndex;
      this.ports[1].mapping = { ...this.mapping };
      this.ports[1].mappingName = this.selectedMappingName;
    }
  }

  private buildAutoInputConfigFromMapping(mapping: Record<string, any>): Record<string, string> {
    const config: Record<string, string> = {};
    const handled = new Set<string>();

    const pairAxis = (minusKey: string, plusKey: string, axisName: string) => {
      const mMinus = mapping[minusKey];
      const mPlus = mapping[plusKey];
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

    for (const key of Object.keys(mapping)) {
      if (handled.has(key)) continue;
      const m = mapping[key];
      if (!m) continue;
      if (m.type === 'button') {
        config[key] = `button(${m.index})`;
      } else if (m.type === 'axis') {
        config[key] = `axis(${m.index}${m.axisDir === -1 ? '-' : '+'})`;
      }
    }

    return config;
  }

  private gamepadIdFromIndex(idx: number | null): string | null {
    if (idx == null) return null;
    const pads = this.getGamepadsBase();
    const gp = pads[idx];
    return gp?.id ?? null;
  }

  private ensureDefaultMappingForPort(p: PlayerPort) {
    if (Object.keys(this.ports[p].mapping || {}).length) return;
    const idx = this.ports[p].gpIndex;
    if (idx == null) return;

    const pads = this.getGamepadsBase();
    const gp = pads[idx];
    if (gp && gp.mapping === 'standard') {
      this.generateDefaultRawMappingForPad(gp);
      this.ports[p].mapping = JSON.parse(JSON.stringify(this.mapping));
    }
  }

  remapAction(p: PlayerPort) {
    if (this.ports[p].gpIndex) {
      this.editingPort = p;
      this.selectedGamepadIndex = this.ports[p].gpIndex;
      this.showKeyMappings = true;
    } else {
      this.parentRef?.showNotification('Assign a controller to P' + p + ' first');
    }
  }
  closeRemapAction() {
    if (this.editingPort) {
      this.closeRemapperToPort(this.editingPort);
    } else {
      this.showKeyMappings = false;
    }
  }

  private canonicalRomBaseFromFileName(romName?: string): string {
    if (!romName) return 'Unknown';
    let base = romName.replace(/\.(z64|n64|v64|zip|7z|rom)$/i, '');
    return base || 'Unknown';
  }

  private detectSaveExt(filename: string | null | undefined, size: number): '.eep' | '.sra' | '.fla' {
    const extFromName = (filename?.match(/\.(eep|sra|fla)$/i)?.[0] || '').toLowerCase() as any;
    if (extFromName) return extFromName;
    return this.inferBatteryExtFromSize(size) || '.sra';
  }

  private multiPortActive(): boolean {
    return [1, 2, 3, 4].filter(p => this.ports[p as PlayerPort].gpIndex != null).length > 1;
  }

  get playerPorts(): PlayerPort[] { return [1, 2, 3, 4]; }

  // ---- Debug utility: delete savestates for current ROM only (to prevent masking battery) ----
  private async deleteSavestatesForCurrentRom(): Promise<void> {
    const db = await this.openMupenDb();
    if (!db) {
      this.parentRef?.showNotification('IndexedDB "/mupen64plus" not found or missing FILE_DATA.');
      return;
    }
    const token = this.romTokenForMatching(this.romName);
    if (!token) { db.close(); return; }

    const tx = db.transaction('FILE_DATA', 'readwrite');
    const os = tx.objectStore('FILE_DATA');

    const keysToDelete: string[] = await new Promise((resolve, reject) => {
      const keys: string[] = [];
      const cur = os.openCursor();
      cur.onerror = () => reject(cur.error);
      cur.onsuccess = (ev: any) => {
        const c = ev.target.result;
        if (c) {
          const keyStr = String(c.key);
          const lower = keyStr.toLowerCase();
          if (lower.startsWith('/mupen64plus/savestates/')) {
            const fname = lower.split('/').pop() || lower;
            const loose = fname.replace(/[^a-z0-9 ]/g, '').trim();
            if (loose.includes(token)) keys.push(keyStr);
          }
          c.continue();
        } else resolve(keys);
      };
    });

    await Promise.all(keysToDelete.map(key => new Promise<void>((resolve) => {
      const del = os.delete(key);
      del.onerror = () => resolve();
      del.onsuccess = () => resolve();
    })));
    db.close();
  }

/** Install IDBFS guards *before* any mount/sync via Emscripten preRun. */
private _preRunIdbfsGuards = (Module: any) => {
  try {
    const FS = Module?.FS;
    if (!FS) return;

    // 1) Make FS.syncfs read-only (allow populate reads; no-op writes)
    const originalSyncfs = (typeof FS.syncfs === 'function') ? FS.syncfs.bind(FS) : null;

    const roSync = (populate: boolean, cb: (err?: any) => void) => {
      try {
        if (populate && originalSyncfs) {
          // remote -> local (read) — allowed
          originalSyncfs(true, (_: any) => { try { cb?.(); } catch {} });
        } else {
          // local -> remote (write) — block
          setTimeout(() => { try { cb?.(); } catch {} }, 0);
        }
      } catch {
        try { cb?.(); } catch {}
      }
    };

    (roSync as any).__preRunGuard = true;
    FS.syncfs = roSync;

    // 2) Swallow "node type not supported" throws inside IDBFS helpers
    const IDBFS = FS.filesystems?.IDBFS;
    if (IDBFS) {
      const wrap = (name: 'storeLocalEntry' | 'storeRemoteEntry') => {
        const fn = (IDBFS as any)[name];
        if (typeof fn !== 'function' || (fn as any).__guarded) return;
        const orig = fn.bind(IDBFS);

        const guarded = (...args: any[]) => {
          try {
            return orig(...args);
          } catch (e: any) {
            const msg = String(e?.message || e).toLowerCase();
            if (msg.includes('node type not supported')) {
              console.warn(`[IDBFS] ${name}: swallowed unsupported node`);
              // If the last arg is a callback, call it to signal "continue"
              const cb = [...args].reverse().find(a => typeof a === 'function');
              try { cb?.(); } catch {}
              return;
            }
            throw e;
          }
        };
        (guarded as any).__guarded = true;
        (IDBFS as any)[name] = guarded;
      };

      wrap('storeLocalEntry');
      wrap('storeRemoteEntry');
    }
  } catch {
    /* ignore preRun guard failures */
  }
};


  private async waitForRomIdentity(ms = 1500): Promise<boolean> {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      if (this._romGoodName || this._romMd5) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  }
  /** Capture core-printed ROM metadata (Goodname + MD5) during boot. */
  
/** Capture core-printed ROM metadata AND the SDL device name during boot. */
private installMupenConsoleSniffer(timeoutMs = 2500): () => void {
  const originalLog  = console.log.bind(console);
  const originalInfo = (console.info?.bind(console)) || originalLog;
  const originalWarn = console.warn.bind(console);

  const parse = (s: string) => {
    if (typeof s !== 'string') return;

    // Core metadata
    const mg = s.match(/(?:@{3}\s*)?Core:\s*Goodname:\s*(.+)$/i);
    if (mg?.[1]) this._romGoodName = mg[1].trim();

    const mm = s.match(/(?:@{3}\s*)?Core:\s*MD5:\s*([0-9A-F]{32})/i);
    if (mm?.[1]) this._romMd5 = mm[1].toUpperCase();

    // ✅ SDL input device name (what InputAutoCfg sections must match)
    // Examples printed by Mupen's input plugin:
    //  - Input: Using auto-configuration for device 'Xbox 360 Controller'
    //  - Input: No auto-configuration found for device 'Wireless Controller'
    const ia = s.match(/Input:\s+(?:Using auto-configuration for device|No auto-configuration found for device)\s+'(.+?)'/i);
    if (ia?.[1]) this._sdlPadName = ia[1].trim();
  };

  const wrap = (fn: (...a: any[]) => void) => (...args: any[]) => {
    try { parse(args?.[0]); } catch {}
    fn(...args);
  };

  console.log = wrap(originalLog);
  console.info = wrap(originalInfo as any);
  console.warn = wrap(originalWarn);

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    console.log = originalLog;
    console.info = originalInfo as any;
    console.warn = originalWarn;
  };

  const start = performance.now();
  const tick = () => {
    // restore after we have meta OR after timeout
    if ((this._romGoodName && this._romMd5) || performance.now() - start > timeoutMs) {
      restore();
    } else {
      setTimeout(tick, 100);
    }
  };
  tick();

  return restore;
}
 
  /** Find & guard hidden IDBFS storeLocalEntry/storeRemoteEntry even if not at FS.filesystems.IDBFS. */
  private installHiddenIdbfsGuardsBrutal(opts?: { passes?: number; interval?: number }): void {
    const passes = Math.max(1, Math.min(20, opts?.passes ?? 8));
    const interval = Math.max(10, Math.min(200, opts?.interval ?? 40));

    const already = (window as any).__hiddenIdbfsGuardInstalled as boolean;
    if (already) return;

    const swallow = (name: 'storeLocalEntry' | 'storeRemoteEntry', obj: any) => {
      if (!obj || typeof obj[name] !== 'function' || obj[name].__guarded) return false;

      const orig = obj[name].bind(obj);

      const guarded = (...args: any[]) => {
        // Find callback if present
        let cb: any = null;
        for (let i = args.length - 1; i >= 0; i--) {
          if (typeof args[i] === 'function') { cb = args[i]; break; }
        }

        const wrappedCb = (err?: any) => {
          if (err && /node type not supported/i.test(String(err?.message || err))) {
            console.warn(`[IDBFS] ${name}: swallowed unsupported node error (cb)`);
            try { cb && cb(); } catch { }
            return;
          }
          try { cb && cb(err); } catch { }
        };

        try {
          if (cb) {
            const a = [...args];
            a[args.lastIndexOf(cb)] = wrappedCb;
            return orig(...a);
          }
          return orig(...args);
        } catch (e: any) {
          if (/node type not supported/i.test(String(e?.message || e))) {
            console.warn(`[IDBFS] ${name}: swallowed unsupported node throw`);
            try { cb && cb(); } catch { }
            return;
          }
          throw e;
        }
      };

      (guarded as any).__guarded = true;
      obj[name] = guarded;
      return true;
    };

    const tryPatchRoots = () => {
      let patched = 0;
      const roots = new Set<any>([
        (this.instance as any) || null,
        (this.instance as any)?.Module || null,
        (window as any) || null
      ].filter(Boolean));

      // shallow scan each root’s enumerable properties
      for (const root of roots) {
        try {
          const keys = Object.keys(root);
          for (const k of keys) {
            const v = (root as any)[k];
            if (!v || typeof v !== 'object') continue;

            try { patched += swallow('storeLocalEntry', v) ? 1 : 0; } catch { }
            try { patched += swallow('storeRemoteEntry', v) ? 1 : 0; } catch { }
          }
        } catch { /* ignore */ }
      }

      if (patched) {
        console.log(`[IDBFS] hidden guard: patched ${patched} method(s) this pass`);
      }
    };

    tryPatchRoots(); // immediate
    let n = 1;
    const timer = setInterval(() => {
      tryPatchRoots();
      if (++n >= passes) {
        clearInterval(timer);
        (window as any).__hiddenIdbfsGuardInstalled = true;
      }
    }, interval);
  }

  /** Make FS.syncfs read-only: allow populate reads; no-op writes. Also guard hidden store*Entry during populate. */
  private installIdbfsReadOnlySync(): void {
    const FS = (this.instance as any)?.FS || (window as any).FS;
    if (!FS) return;
    if ((FS as any).__roSyncInstalled) return;

    const original = (typeof FS.syncfs === 'function') ? FS.syncfs.bind(FS) : null;

    const roSync = (populate: boolean, cb: (err?: any) => void) => {
      if (populate && original) {
        // ⬇️ Ensure the hidden store*Entry functions are guarded *before* populate runs
        try { this.installHiddenIdbfsGuardsBrutal({ passes: 6, interval: 30 }); } catch { }

        try {
          original(true, (_?: any) => { try { cb?.(); } catch { } });
        } catch {
          try { cb?.(); } catch { }
        }
        return;
      }
      // Block local->remote (write) syncs which can hit special nodes
      setTimeout(() => { try { cb?.(); } catch { } }, 0);
    };

    (roSync as any).__roSyncInstalled = true;
    FS.syncfs = roSync;

    // If this build exposes IDBFS.syncfs, stub it similarly
    const IDBFS = FS.filesystems?.IDBFS;
    if (IDBFS && typeof IDBFS.syncfs === 'function') {
      const origIdbfs = IDBFS.syncfs.bind(IDBFS);
      IDBFS.syncfs = (mount: any, populate: boolean, cb: (err?: any) => void) => {
        if (populate) {
          try { this.installHiddenIdbfsGuardsBrutal({ passes: 6, interval: 30 }); } catch { }
          try { origIdbfs(mount, true, (_?: any) => { try { cb?.(); } catch { } }); }
          catch { try { cb?.(); } catch { } }
        } else {
          setTimeout(() => { try { cb?.(); } catch { } }, 0);
        }
      };
    }
  }

  /** Try to convert any numeric/string timestamps to Date across all DBs/stores. */
  private async repairAllIdbTimestampFields(): Promise<void> {
    const dbList: string[] = await (async () => {
      try {
        const infos = await (indexedDB as any).databases?.() || [];
        const names = infos.map((d: any) => d?.name).filter(Boolean);
        // Fallback guesses if databases() isn't supported:
        if (!names.length) return [
          '/mupen64plus', 'EM_FS', 'IDBFS', 'MUPEN64PLUS', 'MUPEN', 'FS',
        ];
        return names;
      } catch {
        return ['/mupen64plus', 'EM_FS', 'IDBFS', 'MUPEN64PLUS', 'MUPEN', 'FS'];
      }
    })();

    const fixDeep = (val: any) => {
      const fixOne = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        const coerce = (k: string) => {
          if (obj[k] != null && !(obj[k] instanceof Date)) {
            const n = Number(obj[k]);
            if (!Number.isNaN(n)) obj[k] = new Date(n);
          }
        };
        coerce('timestamp'); coerce('mtime'); coerce('atime'); coerce('ctime');
        if (obj.attr) {
          if (obj.attr.timestamp != null && !(obj.attr.timestamp instanceof Date)) {
            const n = Number(obj.attr.timestamp);
            if (!Number.isNaN(n)) obj.attr.timestamp = new Date(n);
          }
        }
      };

      const walk = (v: any) => {
        if (!v) return;
        if (Array.isArray(v)) { v.forEach(walk); return; }
        if (typeof v === 'object') {
          fixOne(v);
          Object.values(v).forEach(walk);
        }
      };
      walk(val);
      return val;
    };

    for (const name of dbList) {
      try {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open(name);
          req.onerror = () => resolve(null as any); // ignore
          req.onsuccess = () => resolve(req.result);
        });
        if (!db) continue;

        const stores = Array.from(db.objectStoreNames);
        for (const storeName of stores) {
          await new Promise<void>((resolve) => {
            try {
              const tx = db.transaction(storeName, 'readwrite');
              const os = tx.objectStore(storeName);
              const cur = os.openCursor();
              cur.onerror = () => resolve();
              cur.onsuccess = (ev: any) => {
                const c = ev.target.result;
                if (!c) { resolve(); return; }
                const fixed = fixDeep(c.value);
                try { if (fixed !== c.value) c.update(fixed); } catch { }
                c.continue();
              };
            } catch { resolve(); }
          });
        }
        try { db.close(); } catch { }
      } catch { /* ignore */ }
    }
  }

// --- IDB helpers for FILE_DATA ---
private async _idbGet(os: IDBObjectStore, key: string): Promise<any | null> {
  return await new Promise((resolve) => {
    const r = os.get(key);
    r.onerror = () => resolve(null);
    r.onsuccess = () => resolve(r.result ?? null);
  });
}
private async _idbPut(os: IDBObjectStore, key: string, val: any): Promise<void> {
  return await new Promise((resolve) => {
    const r = os.put(val, key);
    r.onerror = () => resolve();
    r.onsuccess = () => resolve();
  });
}

/** Build an INI section with required keys + your bindings. */
private _buildInputAutoCfgSection(sectionName: string, cfg: Record<string,string>): string {
  const lines: string[] = [];
  lines.push(`[${sectionName}]`);
  // Required/common keys per Mupen InputAutoCfg examples
  lines.push(`plugged = True`);
  lines.push(`plugin = 2`);
  lines.push(`mouse = False`);
  lines.push(`AnalogDeadzone = 4096,4096`);
  lines.push(`AnalogPeak = 32768,32768`);
  for (const [k, v] of Object.entries(cfg)) lines.push(`${k} = ${v}`);
  return lines.join('\n') + '\n\n';
}

/** Insert or replace a section in /mupen64plus/InputAutoCfg.ini (IndexedDB). */
private async writeInputAutoCfgSection(sectionName: string, cfg: Record<string,string>): Promise<void> {
  const db = await this.openMupenDb();
  if (!db) return;

  const tx = db.transaction('FILE_DATA', 'readwrite');
  const os = tx.objectStore('FILE_DATA');
  const key = '/mupen64plus/InputAutoCfg.ini';

  const row = await this._idbGet(os, key);
  const dec = new TextDecoder();
  const enc = new TextEncoder();

  let current = '';
  if (row) {
    const ab = this.normalizeToArrayBuffer(row) ?? this.normalizeToArrayBuffer(row.contents) ?? null;
    if (ab) current = dec.decode(new Uint8Array(ab));
  }

  const sectionText = this._buildInputAutoCfgSection(sectionName, cfg);
  const esc = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionRe = new RegExp(String.raw`^\[${esc}\][\s\S]*?(?=^\[|\Z)`, 'm');

  const nextText = current
    ? (sectionRe.test(current) ? current.replace(sectionRe, sectionText)
                               : current.trimEnd() + '\n\n' + sectionText)
    : sectionText;

  const bytes = enc.encode(nextText);
  await this._idbPut(os, key, { contents: bytes, timestamp: new Date() });

  try { db.close(); } catch {}
}

  private async normalizeMupenFileDataShapes(): Promise<void> {
    if (this._fileDataNormalizedOnce) return;
    this._fileDataNormalizedOnce = true;

    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('/mupen64plus');
        req.onerror = () => resolve(null as any);
        req.onsuccess = () => resolve(req.result);
      });
      if (!db || !Array.from(db.objectStoreNames).includes('FILE_DATA')) { db?.close?.(); return; }

      const tx = db.transaction('FILE_DATA', 'readwrite');
      const os = tx.objectStore('FILE_DATA');

      await new Promise<void>((resolve) => {
        const cur = os.openCursor();
        cur.onerror = () => resolve();
        cur.onsuccess = (ev: any) => {
          const c = ev.target.result;
          if (!c) { resolve(); return; }

          const k = c.key as string;
          let v = c.value;
          const now = new Date();

          // Decide if malformed:
          let malformed = false;

          // case 1: bare bytes
          const isBareBytes =
            v instanceof ArrayBuffer ||
            (v?.buffer instanceof ArrayBuffer && typeof v.byteLength === 'number') ||
            Array.isArray(v?.bytes);

          // case 2: object with bad timestamp type
          const hasBadTimestamp =
            v && typeof v === 'object' && 'timestamp' in v && !(v.timestamp instanceof Date);

          if (isBareBytes || hasBadTimestamp) {
            malformed = true;
          }

          if (malformed) {
            // Rewrap
            const u8 =
              v instanceof ArrayBuffer
                ? new Uint8Array(v)
                : (v?.buffer instanceof ArrayBuffer && typeof v.byteLength === 'number')
                  ? new Uint8Array(v.buffer, v.byteOffset ?? 0, v.byteLength)
                  : Array.isArray(v?.bytes)
                    ? new Uint8Array(v.bytes)
                    : null;

            // Create normalized object
            const nv: any = { contents: u8 ?? new Uint8Array(0), timestamp: now };
            if ('mtime' in v && !(v.mtime instanceof Date)) nv.mtime = now;
            if ('ctime' in v && !(v.ctime instanceof Date)) nv.ctime = now;
            if ('atime' in v && !(v.atime instanceof Date)) nv.atime = now;

            try { c.update(nv); } catch { /* ignore */ }
          }

          c.continue();
        };
      });

      try { db.close(); } catch { }
    } catch { /* ignore */ }
  }

  /** Remove non-file/dir nodes under a path to prevent IDBFS choking on them. */
  private pruneUnsupportedNodesUnder(root = '/mupen64plus'): void {
    try {
      const FS = (this.instance as any)?.FS;
      if (!FS) return;

      const isFile = (m: number) => FS.isFile?.(m) ?? ((m & 0o170000) === 0o100000);
      const isDir = (m: number) => FS.isDir?.(m) ?? ((m & 0o170000) === 0o040000);

      const walk = (p: string) => {
        let list: string[] = [];
        try { list = FS.readdir(p).filter((n: string) => n !== '.' && n !== '..'); }
        catch { return; }

        for (const name of list) {
          const child = p.endsWith('/') ? p + name : `${p}/${name}`;
          let mode = 0;
          try { mode = FS.lookupPath(child)?.node?.mode ?? 0; } catch { }

          if (isDir(mode)) {
            walk(child);
            continue;
          }
          if (!isFile(mode) && !isDir(mode)) {
            try { FS.unlink?.(child); console.warn('[IDBFS] pruned special node', child); } catch { }
          }
        }
      };

      walk(root);
    } catch (e) {
      console.warn('pruneUnsupportedNodesUnder failed', e);
    }
  }

  private async openMupenDb(): Promise<IDBDatabase | null> {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('/mupen64plus');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });
      if (!Array.from(db.objectStoreNames).includes('FILE_DATA')) {
        db.close();
        return null;
      }
      return db;
    } catch {
      return null;
    }
  }
}

// ---------------------------
// Types
// --------------------------- 

export type N64ExportedSave = {
  key: string;        // "/mupen64plus/saves/ExactName.sra"
  filename: string;   // "ExactName.sra"
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

type PlayerPort = 1 | 2 | 3 | 4;

type PortConfig = {
  gpIndex: number | null;
  mapping: Record<string, any>;
  mappingName: string | null;
};