
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import createMupen64PlusWeb, { EmulatorControls, writeAutoInputConfig, getAllSaveFiles } from 'mupen64plus-web';
import { FileService } from '../../services/file.service';
import { N64StateUpload, RomService } from '../../services/rom.service';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { FileSearchComponent } from '../file-search/file-search.component';
import { PortConfig } from '../../services/datacontracts/n64/PortConfig';
import { PlayerPort } from '../../services/datacontracts/n64/PlayerPort';

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
  @ViewChild(FileSearchComponent) fileSearchComponent?: FileSearchComponent;

  // ---- State ----
  loading = false;
  isFileUploaderExpanded = false;
  status: 'idle' | 'booting' | 'running' | 'paused' | 'stopped' | 'error' = 'idle';
  romName?: string;
  private romBuffer?: ArrayBuffer;
  private instance: EmulatorControls | null = null;
  private _romGoodName: string | null = null;
  private _romMd5: string | null = null;
  private _restartLock = Promise.resolve();
  private performanceMode = false;
  private _listenersDisabledForPerf = false;
  private perfLockedSize: { width: number; height: number; dpr: number } | null = null;


  // ---- Gamepads ----
  gamepads: Array<{ index: number; id: string; mapping: string; connected: boolean }> = [];
  selectedGamepadIndex: number | null = null;

  // ---- Mapping UI/store ----
  showKeyMappings = false;
  showControllerAssignments = false;
  trackGp = (_: number, gp: { index: number; id: string }) => gp.index;

  savedMappingsNames: string[] = [];
  private _mappingsStoreKey = 'n64_mappings_store_v1';
  selectedMappingName: string | null = null;
  private _bootstrapTimers: number[] = [];

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
    1: { gpIndex: null, gpId: null, mapping: {}, mappingName: null, autoFill: true },
    2: { gpIndex: null, gpId: null, mapping: {}, mappingName: null, autoFill: true },
    3: { gpIndex: null, gpId: null, mapping: {}, mappingName: null, autoFill: true },
    4: { gpIndex: null, gpId: null, mapping: {}, mappingName: null, autoFill: true },
  };

  editingPort: PlayerPort | null = null;
  private _applyingAll = false;

  // Remapper (list) helpers
  liveTest = true;
  private _recordingFor: string | null = null;
  exportText: string | null = null;

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
  private SAVE_DEBUG = false;

  constructor(
    private fileService: FileService,
    private romService: RomService,
    private ngZone: NgZone,
    private cdRef: ChangeDetectorRef
  ) {
    super();
  }

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

      if (!this.performanceMode) {
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
      }

    });
    this._resizeObserver.observe(container);
    window.addEventListener('orientationchange', this._resizeHandler as any, { passive: true });
    window.addEventListener('gamepadconnected', this._onGamepadConnected as any, { passive: true });
    window.addEventListener('gamepaddisconnected', this._onGamepadDisconnected as any, { passive: true });

    document.addEventListener('fullscreenchange', this._onFullscreenChange);
    canvasEl?.addEventListener('click', () => this._bootstrapDetectOnce());

    this.startGamepadAutoDetect();

    setTimeout(() => { this.tryApplyLastForConnectedPads().catch(() => { }); }, 0);
  }

  async ngOnDestroy(): Promise<void> {
    this.releaseKeyboardAndFocus();
    this.stopAutosaveLoop();
    if (this.romName && confirm('Save your progress on the server before exiting?')) {
      await this.autosaveTick();
    }
    await this.stop();

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = undefined;
    }

    if (this._canvasResizeAdded) {
      try {
        window.removeEventListener('resize', this._resizeHandler);
      } catch {
        console.error("Failed to remove resize event listener");
      }
      this._canvasResizeAdded = false;
    }

    try {
      document.removeEventListener('fullscreenchange', this._onFullscreenChange);
      window.removeEventListener('orientationchange', this._resizeHandler);
    } catch { console.error("Failed to remove fullscreen or orientation event listeners"); }

    this.stopGamepadAutoDetect();
    try {
      window.removeEventListener('gamepadconnected', this._onGamepadConnected);
      window.removeEventListener('gamepaddisconnected', this._onGamepadDisconnected);
    } catch { console.error("Failed to remove gamepad connection event listeners"); }

    this.stopGamepadLogging();
    for (const id of this._bootstrapTimers) {
      clearTimeout(id);
    }
    this._bootstrapTimers = [];
  }

  async onFileSearchSelected(file: FileEntry) {
    try {
      if (!file) {
        this.parentRef?.showNotification('Invalid file selected');
        return;
      }
      this.startLoading();

      // Always stop any prior instance before loading a new ROM
      await this.stop();

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

      // If server has a save for this ROM, import it BEFORE booting
      if (this.parentRef?.user?.id) {
        const saveGameFile = await this.romService.getN64SaveByName(this.romName, this.parentRef?.user?.id);
        if (saveGameFile) {
          console.log("Found Save File (import before boot).");
          const saveFile = await this.blobToN64SaveFile(saveGameFile.blob, saveGameFile.fileName);
          if (saveFile) {
            await this.importInGameSaveRam([saveFile], /* skipBoot */ true);
            this.parentRef?.showNotification('Loaded save file from server.');
          } else {
            this.parentRef?.showNotification('No save found on server for this ROM.');
          }
        }
      }

      // Boot exactly once
      await this.boot();
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

  /** Enter high-performance mode: disable non-critical listeners & timers, freeze canvas size */
  private enterPerformanceMode() {
    if (this.performanceMode) return;
    this.performanceMode = true;

    // Stop any periodic scanning/polling that isn’t strictly needed during play
    this.stopGamepadAutoDetect();
    this.stopGamepadLogging();

    // Freeze canvas size to avoid layout/resize churn
    const c = this.canvas?.nativeElement;
    if (c) {
      this.perfLockedSize = { width: c.width, height: c.height, dpr: window.devicePixelRatio || 1 };
    }
    // Remove global listeners that may fire during gameplay
    this.disableGlobalListenersForPerf();

    // (Optional) if you want to relax direct-inject polling during gameplay:
    // if (this.directInjectMode) { /* you can raise the poll interval a bit here if desired */ }
  }

  /** Exit high-performance mode: restore listeners so UI/actions work again */
  private exitPerformanceMode() {
    if (!this.performanceMode) return;
    this.performanceMode = false;

    // Re-attach needed listeners
    this.restoreGlobalListenersAfterPerf();
    this.perfLockedSize = null; // 🔓 Unlock: allow normal canvas resizes again


    // You can choose NOT to restart auto-detect immediately to keep it quiet until user opens menu.
    // If you want auto-detect only when the menu is visible:
    if (this.isMenuPanelVisible || this.status !== 'running') {
      this.startGamepadAutoDetect();
    }
    this.resizeCanvasToParent(); // Force one resize now that perf mode is off, to sync with UI
  }

  /** Remove global listeners while playing */
  private disableGlobalListenersForPerf() {
    if (this._listenersDisabledForPerf) return;
    try { window.removeEventListener('gamepadconnected', this._onGamepadConnected as any); } catch { }
    try { window.removeEventListener('gamepaddisconnected', this._onGamepadDisconnected as any); } catch { }
    try { window.removeEventListener('orientationchange', this._resizeHandler as any); } catch { }

    if (this._canvasResizeAdded) {
      try { window.removeEventListener('resize', this._resizeHandler as any); } catch { }
      this._canvasResizeAdded = false;
    }

    if (this._resizeObserver) {
      try { this._resizeObserver.disconnect(); } catch { }
    }

    this._listenersDisabledForPerf = true;
  }

  /** Restore global listeners after performance mode is off */
  private restoreGlobalListenersAfterPerf() {
    if (!this._listenersDisabledForPerf) return;

    window.addEventListener('gamepadconnected', this._onGamepadConnected as any, { passive: true });
    window.addEventListener('gamepaddisconnected', this._onGamepadDisconnected as any, { passive: true });
    window.addEventListener('orientationchange', this._resizeHandler as any, { passive: true });

    if (!this._canvasResizeAdded) {
      window.addEventListener('resize', this._resizeHandler as any, { passive: true });
      this._canvasResizeAdded = true;
    }

    if (this._resizeObserver) {
      const container = (this.fullscreenContainer?.nativeElement) ?? this.canvas?.nativeElement?.parentElement ?? document.body;
      try { this._resizeObserver.observe(container); } catch { }
    }

    this._listenersDisabledForPerf = false;
  }

  private resizeCanvasToParent() {
    try {
      const canvasEl = this.canvas?.nativeElement as HTMLCanvasElement | undefined;
      if (!canvasEl) return;

      // 🚫 During performance mode, keep the locked size (no reflow/realloc)
      if (this.performanceMode && this.perfLockedSize) {
        const { width, height } = this.perfLockedSize;
        if (canvasEl.width !== width) canvasEl.width = width;
        if (canvasEl.height !== height) canvasEl.height = height;

        // Optional: also lock CSS size to prevent layout changes
        // (keeps visual size stable if parent changes)
        canvasEl.style.width = `${Math.round(width / (window.devicePixelRatio || 1))}px`;
        canvasEl.style.height = `${Math.round(height / (window.devicePixelRatio || 1))}px`;
        return; // <-- do not compute new size
      }

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

  // =====================================================
  // RAW-first mapping helpers
  // =====================================================
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

  recordCtrl(ctrl: string) {
    this.startRecording(ctrl);
  }

  clearCtrl(ctrl: string) {
    delete this.mapping[ctrl];
  }

  clearAllMappings() {
    this.mapping = {};
    this.parentRef?.showNotification('Cleared all mappings (not applied yet)');
  }

  regenDefaultForSelectedPad() {
    const gp = this.currentPad();
    if (!gp) {
      this.parentRef?.showNotification('No controller selected');
      return;
    }
    if (gp.mapping !== 'standard') {
      this.parentRef?.showNotification('Controller is not standard; defaults may differ.');
    }
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

      // Section name
      let sectionName = 'Custom Gamepad';
      for (const v of Object.values(this.mapping)) {
        if ((v as any)?.gamepadId) { sectionName = (v as any).gamepadId; break; }
      }
      if (sectionName === 'Custom Gamepad') {
        const gp = this.currentPad();
        if (gp?.id) sectionName = gp.id;
      }

      console.log('[InputAutoCfg] writing section for:', sectionName);

      const wasRunning = !!this.instance || this.status === 'running';
      if (wasRunning) {
        // Clean stop (guarded), then write config, then boot once
        await this.stop();
        await new Promise(r => setTimeout(r, 350));
      }

      await writeAutoInputConfig(sectionName, config as any);
      console.log(`Applied RAW mapping for "${sectionName}"`);

      const gp = this.currentPad();
      this.persistLastMappingForGp(gp?.id || null, this.selectedMappingName);

      if (wasRunning) {
        await this.boot();
      }
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
        await this.safeRestart('select-gamepad');
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
    } catch (e) {
      console.error('Failed to persist selected controller:', e);
    }
  }


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

    let connectedCount = 0;
    try {
      this.refreshGamepads();
      connectedCount = this.gamepads.filter(g => g?.connected).length;
    } catch { }

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

    // Reset meta and start sniffer BEFORE emulator creation
    this._romGoodName = null;
    this._romMd5 = null;
    const restoreSniffer = this.installMupenConsoleSniffer();

    try {
      this.applyGamepadReorder();
      await this.ngZone.runOutsideAngular(async () => {
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
        await this.instance!.start();
      });

      this.status = 'running';

      // Ensure canvas has focus on some stacks (helps input routing)
      canvasEl.focus?.();

      // Stop sniffing once ROM meta printed
      restoreSniffer();
      await new Promise(r => setTimeout(r, 50));
      await this.forceCanvasLayoutSync(/* emitResizeEvent */ true);
      this.ensureSaveLoadedForCurrentRom(); // Copy canonical -> emulator key (GoodName).eep and restart once if changed
      this.enterPerformanceMode();  // minimize non-critical overhead during gameplay


      this.ngZone.run(() => {
        this.parentRef?.showNotification(
          `Booted ${this.romName}. ${connectedCount} controller${connectedCount === 1 ? '' : 's'} detected.`
        );
        this.bootGraceUntil = performance.now() + 1500;
        this.cdRef.markForCheck();
      });

      this.bootGraceUntil = performance.now() + 1500;
      if (!this.performanceMode) {
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
      }
    } catch (ex) {
      console.error('Failed to boot emulator', ex);
      this.status = 'error';
      this.parentRef?.showNotification('Failed to boot emulator.');
      this.restoreGamepadGetter();
      throw ex;
    } finally {
      try { restoreSniffer(); } catch { /* ignore */ }
      this.loading = false;
      this.debugScanMempaks().catch(() => { });
    }
  }


  async stop() {
    try {
      this.exitPerformanceMode();
      if (this.instance && typeof this.instance.stop === 'function') {
        try {
          await this.instance.stop();
        } catch (e: any) {
          // Swallow the known abort on some mupen builds
          const msg = String(e || '');
          if (msg.includes('RomClosedVideo') || msg.includes('missing function')) {
            console.warn('[EMU] stop(): ignoring RomClosedVideo abort');
          } else {
            console.error('Error stopping emulator', e);
          }
        }
      }
      this.releaseKeyboardAndFocus();
      this.stopAutosaveLoop();
      if (document.fullscreenElement) {
        await this.toggleFullscreen(false);
      }
    } finally {
      this.instance = null;
      this.status = 'stopped';
      this.restoreGamepadGetter();
      if (this.romName) {
        this.parentRef?.showNotification('Emulator stopped');
      }
    }
  }

  private async safeRestart(reason = 'generic') {
    this._restartLock = this._restartLock.then(async () => {
      try {
        console.debug('[EMU] safeRestart:', reason);
        await this.stop();
        await new Promise(r => setTimeout(r, 350));
        await this.boot();
      } catch (e) {
        console.error('[EMU] safeRestart failed', e);
      }
    });
    await this._restartLock;
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

  async stopGame() {
    this.startLoading();
    try {
      await this.stop();
      this.romBuffer = undefined;
      this.romName = undefined;
      this.parentRef?.showNotification('ROM unloaded');
    }
    catch (e) {
      console.error('Error stopping game', e);
    } finally {
      this.stopLoading();
    }
  }

  async toggleFullscreen(open?: boolean) {
    this.closeMenuPanel();
    if (!this.isFullScreen || open) {
      const canvas = this.canvas?.nativeElement;
      await canvas?.requestFullscreen();
      this.isFullScreen = true;
    } else if (!open) {
      await (document as any).exitFullscreen?.();
      this.isFullScreen = false;
    } else {
      await (document as any).exitFullscreen?.();
      this.isFullScreen = false;
    }
  }

  showMenuPanel() {
    this.isMenuPanelVisible = true;
    this.parentRef?.showOverlay();
    this.exitPerformanceMode();
    if (this.savedMappingsNames.length === 0) {
      this.loadMappingsList();
    }
    this._bootstrapDetectOnce();
  }

  closeMenuPanel() {
    this.isMenuPanelVisible = false;
    this.parentRef?.closeOverlay();
    this.cancelPortMappings();

    if (this.status === 'running') {
      this.enterPerformanceMode();
    } else {
      this.startGamepadAutoDetect();
    }
  }

  openControllerAssignments() {
    this.showControllerAssignments = true;
    this.stopGamepadAutoDetect();
  }

  closeControllerAssignments() {
    this.showControllerAssignments = false;
    this.startGamepadAutoDetect();
  }

  cancelPortMappings() {
    this.closeControllerAssignments();
    this.showKeyMappings = false;
  }

  private async blobToN64SaveFile(blob: Blob, serverFileName: string): Promise<File> {
    return new File([blob], serverFileName, { type: 'application/octet-stream' });
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

      const makeValue = (bytes: Uint8Array, existingOrTemplate?: any) => {
        const ensureDate = (obj: any) => {
          if (!obj) return;
          const t = obj.timestamp ?? obj.mtime ?? obj.time ?? null;
          if (t instanceof Date) return;
          if (typeof t === 'number') obj.timestamp = new Date(t);
          else if (typeof t === 'string') {
            const d = new Date(t);
            obj.timestamp = Number.isNaN(+d) ? new Date() : d;
          } else {
            obj.timestamp = new Date();
          }
        };

        if (!existingOrTemplate) {
          return {
            timestamp: new Date(),
            mode: 0o100644,
            contents: bytes
          };
        }
        const clone = JSON.parse(JSON.stringify(existingOrTemplate));
        ensureDate(clone);
        if (clone.contents) clone.contents = bytes;
        else if (clone.data) clone.data = bytes;
        else if (Array.isArray(clone.bytes)) clone.bytes = Array.from(bytes);
        else clone.contents = bytes;
        return clone;
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
          this.saveDebug(`SKIP`, { name, reason: 'unsupported-ext' });
          continue;
        }

        const bytes = new Uint8Array(await f.arrayBuffer());
        const incomingKey = `/mupen64plus/saves/${name}`;

        const keyCandidates = this.buildSaveKeyCandidates(ext as any, name);

        this.saveDebug(`IMPORT BEGIN`, {
          romName: this.romName,
          file: { name, ext, size: bytes.byteLength },
          keys: { incomingKey, goodKey: null }
        });

        const txRW = db.transaction('FILE_DATA', 'readwrite');
        const osRW = txRW.objectStore('FILE_DATA');

        const writes: Promise<void>[] = [];
        for (const key of keyCandidates) {
          const existing = await new Promise<any>((resolve) => {
            const req = osRW.get(key);
            req.onerror = () => resolve(null);
            req.onsuccess = () => resolve(req.result || null);
          });

          const value = makeValue(bytes, existing ?? templateVal);
          writes.push(txPut(osRW, key, value));
        }

        await Promise.all(writes);

        const verifyTx = db.transaction('FILE_DATA', 'readonly');
        const verifyOS = verifyTx.objectStore('FILE_DATA');

        const readBack = async (key: string) => new Promise<any>((resolve) => {
          const r = verifyOS.get(key);
          r.onerror = () => resolve(null);
          r.onsuccess = () => resolve(r.result ?? null);
        });

        const vIncoming = await readBack(incomingKey);

        const castToU8 = (v: any): Uint8Array | null => {
          if (!v) return null;
          if (v instanceof ArrayBuffer) return new Uint8Array(v);
          if (v?.buffer instanceof ArrayBuffer && typeof v.byteLength === 'number') return new Uint8Array(v.buffer, v.byteOffset ?? 0, v.byteLength);
          if (v?.contents) return castToU8(v.contents);
          if (v?.data) return castToU8(v.data);
          if (Array.isArray(v?.bytes)) return new Uint8Array(v.bytes);
          return null;
        };

        const hb = await this.shortSha(bytes);
        const hIncoming = await this.shortSha(castToU8(vIncoming));

        this.saveDebug(`IMPORT WRITE OK`, {
          incomingKey, goodKey: null,
          hashes: { src: hb, incoming: hIncoming }
        });

        written.push(name);
      }

      db.close();

      if (written.length) {
        console.log(`Imported ${written.length} save file(s): ${written.join(', ')}`);
        //this.parentRef?.showNotification(`Imported ${written.length} save file(s): ${written.join(', ')}`);

        // Only restart if needed:
        // - EEPROM: no hard restart
        // - SRAM/Flash: restart when emulator is already running
        if (!skipBoot && (this.status === 'running' || !!this.instance)) {
          const importedExts = written
            .map(n => (n.match(/\.(eep|sra|fla)$/i)?.[0] || '').toLowerCase());

          const hasSraOrFla = importedExts.some(ext => ext === '.sra' || ext === '.fla');
          if (hasSraOrFla) {
            await this.safeRestart('post-import');
          } else {
            // Only .eep imported: keep it zero-restart
            this.parentRef?.showNotification('EEPROM save imported (no restart). If not visible, open the in-game save menu.');
          }
        }

      } else {
        console.log("No save files imported");
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
    if (!this.autosave || this.autosaveInProgress || !this.romName) return;
    this.autosaveInProgress = true;

    try {
      const userId = this.parentRef?.user?.id;
      if (!userId) return;

      // Always collect current saves from emulator; don’t require matchedOnly to be true
      const saves = await this.downloadCurrentSaves(true, true);
      const isRunning = this.status === 'running' && !!this.instance;
      if (!isRunning || !saves || !saves.length) return;

      const best = saves[0];
      if (!best) return;

      const payload: N64StateUpload = {
        userId,
        romName: this.romName,          // <— FIX: exact ROM filename with extension
        filename: best.filename,        // e.g., "<Base>.eep|.sra|.fla"
        bytes: best.bytes,
        saveTimeMs: Date.now(),
        durationSeconds: 180
      };

      const uploadRes = await this.romService.saveN64State(payload);
      if (!uploadRes.ok) {
        console.warn('Upload failed:', uploadRes.errorText);
      } else {
        console.log('Saved state with payload:', uploadRes);
        this.parentRef?.showNotification?.(`Autosaved ${this.romName}`);
      }
    } catch (err) {
      console.error('autosaveTick error', err);
    } finally {
      this.autosaveInProgress = false;
      await this.syncFs('post-autosave');
      console.log('Finished Autosave');
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

  // =====================================================
  // Gamepad events & auto-detect
  // ===================================================== 
  private _onGamepadConnected = (ev: GamepadEvent) => {
    this.refreshGamepads();

    this.normalizePortsAfterRefresh(); // ✨ make sure P1 gets the first/only pad

    const total = this.gamepads.filter(g => g.connected).length;
    this.parentRef?.showNotification(
      `Gamepad connected: ${this.truncateId(ev.gamepad?.id)} (port ${ev.gamepad?.index}). ` +
      `Detected ${total} controller${total === 1 ? '' : 's'} `
    );

    (async () => {
      if (this.ports[1].gpIndex == null) {
        const last = this.lastMappingPerGp[ev.gamepad.id];
        if (last) {
          // Mount this controller to P1 and apply its mapping
          this.ports[1].gpIndex = ev.gamepad.index;
          this.ports[1].gpId = ev.gamepad.id;
          this.selectedGamepadIndex = ev.gamepad.index;
          console.debug('[GP] _onGamepadConnected: assigned P1 gpId', ev.gamepad.id, 'index', ev.gamepad.index);
          await this.applyMappingNameToCurrentPad(last);
          this.applyGamepadReorder();
          return; // done
        }
      }

      // existing “first standard or first available” path
      if (this.ports[1].gpIndex == null && this.gamepads.length) {
        if (!this.hasLoadedLastInput) {
          const std = this.gamepads.find(g => g.mapping === 'standard');
          this.assignFirstDetectedToP1(std ? std.index : ev.gamepad.index);
        } else {
          this.applyGamepadReorder();
        }
      }

      if (this.instance || this.status === 'running') {
        this.applyGamepadReorder();
      }

      this.maybeApplyStoredMappingFor(ev.gamepad.id);

      if (this.status === 'booting' || this.status === 'running') {
        await this.stop();
        setTimeout(() => this.boot(), 500);
      }
    })().catch(() => { });
  };


  private _onGamepadDisconnected = (_ev: GamepadEvent) => {
    this.refreshGamepads();
    if (this.selectedGamepadIndex !== null) {
      const stillThere = this.gamepads.some(g => g.index === this.selectedGamepadIndex);
      if (!stillThere) this.selectedGamepadIndex = null;
    }

    for (const p of [1, 2, 3, 4] as const) {
      const idx = this.ports[p].gpIndex;
      const gid = this.ports[p].gpId;
      // if neither index nor id is present in current snapshot, clear
      const indexStillThere = (idx != null) ? this.gamepads.some(g => g.index === idx) : false;
      const idStillThere = (gid != null) ? this.gamepads.some(g => g.id === gid) : false;
      if (!indexStillThere && !idStillThere) {
        this.ports[p].gpIndex = null;
        this.ports[p].gpId = null;
        this.parentRef?.showNotification?.(`P${p} controller disconnected`);
      }
    }
    this.applyGamepadReorder();
  };

  startGamepadAutoDetect() {
    if (this.performanceMode) {
      return;
    }
    this.stopGamepadAutoDetect();
    const tick = () => {
      try {
        const before = this.gamepads.map(g => g.index).join(',');
        this.refreshGamepads();
        this.normalizePortsAfterRefresh(); // ✨ 
        const after = this.gamepads.map(g => g.index).join(',');

        if (this.ports[1].gpIndex == null && this.gamepads.length) {
          if (!this.hasLoadedLastInput) {
            const std = this.gamepads.find(g => g.mapping === 'standard');
            this.assignFirstDetectedToP1(std ? std.index : this.gamepads[0].index);
          } else {
            this.applyGamepadReorder();
          }
        }

        if (before !== after) {
          console.debug('[GP] autoDetect changed order', { before, after });
          this.applyGamepadReorder();
        }
      } catch { console.log('Gamepad auto-detect tick failed'); }
      this._autoDetectTimer = setTimeout(tick, this.performanceMode ? 999999 : 750);
    };
    tick();
  }

  stopGamepadAutoDetect() {
    if (this._autoDetectTimer) {
      clearTimeout(this._autoDetectTimer);
      this._autoDetectTimer = null;
    }
  }


  /** Persist last mapping name used for a given gamepad.id */
  private persistLastMappingForGp(gamepadId: string | null, mappingName: string | null) {
    if (!gamepadId || !mappingName) return;
    try {
      this.lastMappingPerGp[gamepadId] = mappingName;
      localStorage.setItem(this._lastPerGamepadKey, JSON.stringify(this.lastMappingPerGp));
    } catch { /* ignore */ }
  }

  // Truncate long IDs for UI display, appending an ellipsis if truncated
  private truncateId(id?: string | null, maxLen: number = 50): string {
    if (!id) return '';
    try {
      return id.length > maxLen ? id.substring(0, maxLen) + '...' : id;
    } catch {
      return id as string;
    }
  }

  // Public helper used by templates to render a readable label for a gamepad option
  formatGamepadLabel(gp: { id?: string | null; mapping?: string | null; index?: number } | any): string {
    if (!gp) return '';
    const idPart = this.truncateId(gp.id ?? '');
    const mapPart = gp.mapping ? `(${gp.mapping})` : '';
    const idxPart = typeof gp.index === 'number' ? `[#${gp.index}]` : '';
    return `${idPart} ${mapPart} ${idxPart}`.trim();
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

          const gp = this.currentPad();
          this.persistLastMappingForGp(gp?.id || null, name); // <-- ADD

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
        console.log('Default RAW mapping generated for standard profile.');
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
            console.log(`Applied mapping "${this.selectedMappingName}" to selected controller`);
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
      console.log(`Applied mapping "${this.selectedMappingName}" to selected controller`);
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
    this.applySelectedMapping().then(() => {
      const gp = this.currentPad();
      this.persistLastMappingForGp(gp?.id || null, this.selectedMappingName);
    }).catch(() => { });
  }

  /** Try to auto-pick a connected pad that has a stored mapping; returns true if applied */
  private async tryApplyLastForConnectedPads(): Promise<boolean> {
    this.refreshGamepads();
    // Prefer a pad that has a known mapping stored in lastMappingPerGp
    for (const gp of this.gamepads) {
      const name = this.lastMappingPerGp[gp.id];
      if (!name) continue;

      // Select this pad, set mapping, apply, assign to P1
      this.selectedGamepadIndex = gp.index;
      this.ports[1].gpIndex = gp.index;
      this.selectedMappingName = name;

      await this.applySelectedMapping();
      this.applyGamepadReorder();
      this.ensureP1InitializedFromSinglePad();
      console.log(`Auto-applied "${name}" for ${gp.id}`);
      return true;
    }
    return false;
  }

  /** Centralized helper: apply the given mapping name to this.selectedGamepadIndex and persist it */
  private async applyMappingNameToCurrentPad(mappingName: string) {
    this.selectedMappingName = mappingName || null;
    await this.applySelectedMapping();
    const gp = this.currentPad();
    this.persistLastMappingForGp(gp?.id || null, this.selectedMappingName);
  }


  private assignFirstDetectedToP1(preferredIdx?: number) {
    // Respect explicit "none" on P1
    if (this.ports[1].autoFill === false) return;

    const pads = this.getGamepadsBase();
    if (!pads || !pads.length) return;

    const std = pads.find(p => p && p.mapping === 'standard');
    const chosen = std ?? (typeof preferredIdx === 'number' ? pads[preferredIdx] : pads[0]);
    if (!chosen) return;

    const idx = chosen.index;
    this.ports[1].gpIndex = idx;

    this.ensureDefaultMappingForPort(1);
    this.selectedGamepadIndex = idx;
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

  private installReorderWrapper() {
    if (this._gpWrapperInstalled) return;
    try {
      this._originalGetGamepadsBase =
        navigator.getGamepads ? navigator.getGamepads.bind(navigator) : null;

      (navigator as any).getGamepads = () => {
        const baseArr: (Gamepad | null)[] =
          (this._originalGetGamepadsBase ? this._originalGetGamepadsBase() : []) || [];

        const isReal = (g: Gamepad | null) =>
          !!g && g.connected && ((g.buttons?.length ?? 0) + (g.axes?.length ?? 0) > 0);

        const resolveForPort = (port: PlayerPort): { pad: Gamepad; idx: number } | null => {
          const wantIdx = this.ports[port]?.gpIndex;
          const wantId = this.ports[port]?.gpId;

          if (typeof wantIdx === 'number' && baseArr[wantIdx] && isReal(baseArr[wantIdx])) {
            return { pad: baseArr[wantIdx]!, idx: wantIdx };
          }
          if (wantId) {
            const idx = baseArr.findIndex(g => g && g.id === wantId && isReal(g));
            if (idx !== -1) return { pad: baseArr[idx]!, idx };
          }
          return null;
        };

        const used = new Set<number>();
        const out: Gamepad[] = [];

        // P1..P4 first
        ([1, 2, 3, 4] as const).forEach(port => {
          const res = resolveForPort(port);
          if (!res) return;
          if (!used.has(res.idx)) {
            out.push(res.pad);
            used.add(res.idx);
          }
        });

        // The rest, skipping phantom devices
        for (let i = 0; i < baseArr.length; i++) {
          const g = baseArr[i];
          if (!isReal(g)) continue;
          if (!used.has(i)) {
            out.push(g!);
            used.add(i);
          }
        }

        return out;
      };

      this._gpWrapperInstalled = true;
      console.debug('[GP] installReorderWrapper installed (compact mode)');
      this.dumpGamepadDetails('EFFECTIVE AFTER REORDER', (navigator.getGamepads ? navigator.getGamepads() : []) as any);
    } catch (e) {
      console.warn('Failed installing reorder wrapper', e);
    }
  }

  closeRemapperToPort(port: PlayerPort) {
    this.ports[port].mapping = JSON.parse(JSON.stringify(this.mapping));
    this.showKeyMappings = false;
    this.parentRef?.showNotification(`Updated mapping for P${port}`);
  }



  async onSelectGamepadForPort(port: PlayerPort, value: string | number) {
    const raw = String(value);

    // User explicitly chose "none"
    if (raw === '__none__') {
      this.setPortNone(port);
      return;
    }

    const idx = Number(raw);
    if (Number.isNaN(idx)) {
      this.parentRef?.showNotification('Invalid controller selection');
      return;
    }

    // Ensure our snapshot includes that index
    if (!this.gamepads.some(g => g.index === idx)) {
      this.refreshGamepads();
      if (!this.gamepads.some(g => g.index === idx)) {
        this.parentRef?.showNotification('Selected controller is not available.');
        return;
      }
    }

    // Prevent assigning same physical pad to multiple ports (compare by index)
    for (const p of [1, 2, 3, 4] as const) {
      if (p !== port && this.ports[p].gpIndex === idx) {
        this.parentRef?.showNotification(`That controller is already assigned to Player ${p}.`);
        return;
      }
    }

    // User explicitly picked a controller for this port -> allow future auto fills for this port
    const gp = this.gamepads.find(g => g.index === idx)!;
    this.ports[port].gpIndex = idx;
    this.ports[port].gpId = gp.id;     // keep as a hint to re-resolve later
    this.ports[port].autoFill = true;  // <- re-enable autofill for this port
    this.applyGamepadReorder();

    // Give a usable mapping right away if it's a standard profile
    this.ensureDefaultMappingForPort(port);

    this.parentRef?.showNotification?.(`Player ${port} assigned to controller #${idx}`);
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
      const gpId = this.gamepadIdFromIndex(idx);
      const name = this.ports[port].mappingName;
      this.persistLastMappingForGp(gpId, name);

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
    let success = false;

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

        this.ports[p].gpId = gpId;
        const perPortMapping = this.rebindMappingToPad(
          JSON.parse(JSON.stringify(this.ports[p].mapping || {})),
          gpId
        );
        this.ports[p].mapping = perPortMapping;

        const cfg = this.buildAutoInputConfigFromMapping(perPortMapping);
        const sectionName = gpId;

        await writeAutoInputConfig(sectionName, cfg as any);
      }

      this.applyGamepadReorder();
      success = true;

      if (wasRunning) {
        await this.boot();
      }
    } catch (e) {
      console.error('applyAllPortMappings failed', e);
      this.parentRef?.showNotification('Failed to apply multi-controller mappings');
      success = false;
    } finally {
      this._applyingAll = false;
      if (success) {
        this.cancelPortMappings();
      }
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
    console.debug('[GP] uninstallReorderWrapper removed');
  }

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

  /** Release fullscreen/pointer lock, keyboard grabs and focus after emu stop. */
  private releaseKeyboardAndFocus(): void { 
    this.toggleFullscreen(false); 
    try {
      // Exit pointer lock if any (some builds use this indirectly)
      (document as any).exitPointerLock?.();
    } catch { }

    try {
      // Blur the canvas and any currently focused element
      const canvasEl = this.canvas?.nativeElement as HTMLCanvasElement | undefined;
      canvasEl?.blur?.();
      (document.activeElement as HTMLElement | null)?.blur?.();
    } catch { }

    try {
      // Try to re-focus the app shell (optional)
      window.focus?.();
    } catch { }

    // --- Emscripten-specific: detatch global event listeners if exposed
    try {
      const JSEvents = (window as any).JSEvents || (globalThis as any).JSEvents || (self as any).JSEvents;
      if (JSEvents?.removeAllEventListeners) {
        // Nuclear option: remove all Emscripten-managed event listeners.
        JSEvents.removeAllEventListeners();
      } else if (JSEvents?.eventHandlers && Array.isArray(JSEvents.eventHandlers)) {
        // Safer: remove only keyboard handlers and ones attached to our canvas/document
        const handlers = JSEvents.eventHandlers.slice();
        for (const h of handlers) {
          const type = h?.eventTypeString;
          const target = h?.target;
          const isKb = type === 'keydown' || type === 'keyup' || type === 'keypress';
          const isOurTarget =
            target === document ||
            target === document.body ||
            target === this.canvas?.nativeElement;
          if (isKb || isOurTarget) {
            try { JSEvents.removeEventListener?.(target, type, h.useCapture); } catch { }
          }
        }
      }
    } catch { }

    // In case the emu used DOM0 handlers, null them out
    try {
      (document as any).onkeydown = null;
      (document as any).onkeyup = null;
      (document as any).onkeypress = null;
    } catch { }
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

  // =====================================================
  // Misc
  // =====================================================
  private _bootstrapDetectOnce() {
    let runs = 0;
    const burst = () => {
      this.refreshGamepads();
      runs++;
      if (runs < 8) {
        const id = window.setTimeout(burst, 250);
        this._bootstrapTimers.push(id);
      }
    };
    burst();
  }


  private async maybeApplyStoredMappingFor(id: string) {
    // --- ADD: prefer last-per-gamepad
    const lastName = this.lastMappingPerGp[id];
    if (lastName) {
      // If the saved mapping exists, apply it and persist again
      const has = this.savedMappingsNames.includes(lastName);
      if (!has && !this.savedMappingsNames.length) {
        await this.loadMappingsList();
      }
      if (this.savedMappingsNames.includes(lastName)) {
        this.selectedMappingName = lastName;
        await this.applySelectedMapping();
        this.persistLastMappingForGp(id, lastName);
        return;
      }
    }

    // --- Fallback to prior behavior: look for a mapping literally named after the gamepad id
    const knownName = this.savedMappingsNames.find(n => n.toLowerCase() === id.toLowerCase());
    if (knownName) {
      this.selectedMappingName = knownName;
      await this.applySelectedMapping();
      // also persist under last-per-gp for next time
      this.persistLastMappingForGp(id, knownName);
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

      // ✨ Add this:
      this.normalizePortsAfterRefresh();

    } catch (e) {
      console.warn('Failed to read gamepads', e);
    }
  }

  applyGamepadReorder() {
    try {
      this.installReorderWrapper();
    } catch (e) {
      console.warn('Failed to apply gamepad reorder', e);
    }
  }

  restoreGamepadGetter() {
    try {
      this.uninstallReorderWrapper();
    } catch { /* ignore */ }
  }

  async downloadCurrentSaves(preferRomMatch?: boolean, skipDownload?: boolean): Promise<Array<{ filename: string; bytes: Uint8Array }> | null> {
    try {
      // Prefer emulator instance API when available (more reliable)
      if (this.instance) {
        try {
          const saves = await getAllSaveFiles();
          console.debug('downloadCurrentSaves: got saves from instance', saves);

          const normalized = (saves || []).map((s: any) => {
            if (!s) return null;
            // mupen module shape: { fileKey: '/mupen64plus/saves/NAME.eep', contents: Uint8Array }
            if (s.fileKey && (s.contents || s.contents === 0)) {
              const fk = String(s.fileKey);
              const filename = fk.split('/').pop() || fk;
              return { filename, bytes: s.contents instanceof Uint8Array ? s.contents : new Uint8Array(s.contents) };
            }
            return null;
          }).filter(Boolean) as Array<{ filename: string; bytes: Uint8Array }>;

          if (!normalized.length) {
            this.parentRef?.showNotification('No in-game save RAM found to download.');
            return null;
          }

          // If caller asked for a best-match by ROM name, try to find one
          if (preferRomMatch) {
            const best = this.findBestSaveMatch(normalized, this.romName);
            if (best) {
              if (!skipDownload) {
                this.parentRef?.showNotification(`Downloading matching save: ${best.filename}`);
                this.downloadBytesAs(best.filename, best.bytes instanceof Uint8Array ? best.bytes : new Uint8Array(best.bytes));
              }
              return [best];
            }
            return null;
          }

          if (!skipDownload) {
            this.parentRef?.showNotification(`Downloading ${normalized.length} save file(s) from emulator instance.`);
            for (const s of normalized) {
              this.downloadBytesAs(s.filename, s.bytes instanceof Uint8Array ? s.bytes : new Uint8Array(s.bytes));
            }
          }
          return normalized;
        } catch (err) {
          console.debug('getAllSaveFiles failed:', err);
        }
      }
    } catch (e) {
      console.error('downloadCurrentSaves failed', e);
      this.parentRef?.showNotification('Failed to download save(s).');
    }
    return null;
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

      // Force a one-shot reflow + size update even in perf mode
      // (it temporarily unlocks, resizes twice, then re-locks if needed)
      this.forceCanvasLayoutSync(/* emitResizeEvent */ true).catch(() => { });
    } catch { /* ignore */ }
  };


  /** Force a one-shot reflow + canvas size sync, preserving perf mode if it was on. */
  private async forceCanvasLayoutSync(emitResizeEvent = false): Promise<void> {
    const wasPerf = this.performanceMode;
    const prevLock = this.perfLockedSize;

    // Temporarily unlock so resize computes against container/DPR
    this.performanceMode = false;
    this.perfLockedSize = null;

    // Let layout settle a frame, then size, then another frame (accounts for scrollbars/fullscreen CSS)
    await new Promise(r => requestAnimationFrame(r));
    this.resizeCanvasToParent();
    await new Promise(r => requestAnimationFrame(r));
    this.resizeCanvasToParent();

    if (emitResizeEvent) {
      // Let any viewer/shell update if they listen for resize
      window.dispatchEvent(new Event('resize'));
    }

    // Restore perf mode lock (to the *new* size) if we were in perf mode
    if (wasPerf) {
      const c = this.canvas?.nativeElement;
      if (c) this.perfLockedSize = { width: c.width, height: c.height, dpr: window.devicePixelRatio || 1 };
      this.performanceMode = true;
    } else {
      this.perfLockedSize = null; // leave unlocked for normal resizing
    }
  }


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

  visibleGpIndexForPort(p: PlayerPort): number | null {
    try {
      // Prefer persisted index
      const idx = this.ports[p].gpIndex;
      if (idx != null && this.gamepads.some(g => g.index === idx)) return idx;

      // Fallback to gpId to recover after a refresh
      const gid = this.ports[p].gpId;
      if (gid) {
        const found = this.gamepads.find(g => g.id === gid);
        if (found) return found.index;
      }
      return null;
    } catch {
      return null;
    }
  }
  // Return the visible/stable gamepad id for a player port (or '__none__')
  visibleGpIdForPort(p: PlayerPort): string {
    try {
      const gid = this.ports[p].gpId;
      if (gid) {
        const foundById = this.gamepads.find(g => g.id === gid);
        if (foundById) return foundById.id;

        // fallback: try resolving by current index
        const idx = this.ports[p].gpIndex;
        if (idx != null) {
          const byIdx = this.gamepads.find(g => g.index === idx);
          if (byIdx) return byIdx.id;
        }
        // if we can't find an option that exists, prefer __none__ to avoid a mismatch
        return '__none__';
      }
      const idx = this.ports[p].gpIndex;
      if (idx == null) return '__none__';
      const found = this.gamepads.find(g => g.index === idx);
      return found ? found.id : '__none__';
    } catch {
      return '__none__';
    }
  }

  // -----------------
  // Save matching helpers
  // -----------------
  private normalizeForMatch(s: string | null | undefined): string {
    if (!s) return '';
    return String(s)
      .toLowerCase()
      .replace(/\.(eep|sra|fla)$/i, '')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private levenshtein(a: string, b: string): number {
    const al = a.length, bl = b.length;
    if (!al) return bl;
    if (!bl) return al;
    const v0 = new Array(bl + 1).fill(0);
    const v1 = new Array(bl + 1).fill(0);
    for (let j = 0; j <= bl; j++) v0[j] = j;
    for (let i = 0; i < al; i++) {
      v1[0] = i + 1;
      for (let j = 0; j < bl; j++) {
        const cost = a[i] === b[j] ? 0 : 1;
        v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
      }
      for (let j = 0; j <= bl; j++) v0[j] = v1[j];
    }
    return v0[bl];
  }

  private findBestSaveMatch(saves: Array<{ filename: string; bytes: Uint8Array }>, romName?: string | null) {
    if (!romName) return null;
    const target = this.normalizeForMatch(romName);
    if (!target) return null;

    const targetWords = new Set(target.split(' ').filter(Boolean));

    let best: { save: any; score: number } | null = null;
    for (const s of saves) {
      const name = this.normalizeForMatch(s.filename.replace(/\.[^.]+$/, ''));
      if (!name) continue;

      // Exact substring match wins
      if (name === target || name.includes(target) || target.includes(name)) {
        return { filename: s.filename, bytes: s.bytes };
      }

      const nameWords = name.split(' ').filter(Boolean);
      const matchedWords = nameWords.filter(w => targetWords.has(w)).length;
      const wordScore = matchedWords / Math.max(1, targetWords.size);

      // tie-breaker: normalized edit distance
      const dist = this.levenshtein(name, target);
      const maxLen = Math.max(name.length, target.length) || 1;
      const editScore = 1 - (dist / maxLen);

      const score = Math.max(wordScore, 0) * 0.7 + Math.max(editScore, 0) * 0.3;

      if (!best || score > best.score) {
        best = { save: s, score };
      }
    }

    return best ? { filename: best.save.filename, bytes: best.save.bytes } : null;
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

  private canonicalSaveFilename(
    ext: '.eep' | '.sra' | '.fla'
  ): string {
    const base = this.canonicalRomBaseFromFileName(this.romName);
    return `${base}${ext}`;
  }


  private async ensureIdbAlias(db: IDBDatabase, fromKey: string, toKey: string): Promise<void> {
    if (fromKey === toKey) return;

    const tx = db.transaction('FILE_DATA', 'readwrite');
    const os = tx.objectStore('FILE_DATA');

    const fromVal = await new Promise<any>((resolve) => {
      const r = os.get(fromKey);
      r.onerror = () => resolve(null);
      r.onsuccess = () => resolve(r.result ?? null);
    });
    if (!fromVal) return;

    const toVal = await new Promise<any>((resolve) => {
      const r = os.get(toKey);
      r.onerror = () => resolve(null);
      r.onsuccess = () => resolve(r.result ?? null);
    });

    if (!toVal) {
      await new Promise<void>((resolve, reject) => {
        const w = os.put(fromVal, toKey);
        w.onerror = () => reject(w.error);
        w.onsuccess = () => resolve();
      });
    }
  }

  private async readIdbBytes(db: IDBDatabase, key: string): Promise<Uint8Array | null> {
    const tx = db.transaction('FILE_DATA', 'readonly');
    const os = tx.objectStore('FILE_DATA');
    const val = await new Promise<any>((resolve) => {
      const r = os.get(key);
      r.onerror = () => resolve(null);
      r.onsuccess = () => resolve(r.result ?? null);
    });
    if (!val) return null;

    const toU8 = (v: any): Uint8Array | null => {
      if (v instanceof ArrayBuffer) return new Uint8Array(v);
      if (v?.buffer instanceof ArrayBuffer && typeof v.byteLength === 'number') return new Uint8Array(v.buffer, v.byteOffset ?? 0, v.byteLength);
      if (v?.contents) return toU8(v.contents);
      if (v?.data) return toU8(v.data);
      if (Array.isArray(v?.bytes)) return new Uint8Array(v.bytes);
      return null;
    };
    return toU8(val);
  }


  // drop-in replacement for your current writeIdbBytes()
  private async writeIdbBytes(db: IDBDatabase, key: string, bytes: Uint8Array): Promise<void> {
    const tx = db.transaction('FILE_DATA', 'readwrite');
    const os = tx.objectStore('FILE_DATA');

    // read existing to preserve stored shape if present
    const existing = await new Promise<any>((resolve) => {
      const r = os.get(key);
      r.onerror = () => resolve(null);
      r.onsuccess = () => resolve(r.result ?? null);
    });

    // ensure timestamp is a real Date and choose a consistent payload field
    const ensureDate = (obj: any) => {
      if (!obj) return;
      const t = obj.timestamp ?? obj.mtime ?? obj.time ?? null;
      if (t instanceof Date) return;
      if (typeof t === 'number') obj.timestamp = new Date(t);
      else if (typeof t === 'string') {
        const d = new Date(t);
        obj.timestamp = Number.isNaN(+d) ? new Date() : d;
      } else {
        obj.timestamp = new Date();
      }
    };

    let value: any;
    if (!existing) {
      // NEW ROW: create an IDBFS-compatible object
      value = {
        timestamp: new Date(),   // <- critical: real Date instance
        mode: 0o100644,          // (optional) regular file
        contents: bytes          // pick one content key; be consistent
      };
    } else {
      // EXISTING ROW: keep shape, update its bytes and timestamp
      const clone = JSON.parse(JSON.stringify(existing));
      ensureDate(clone);
      if (clone.contents) clone.contents = bytes;
      else if (clone.data) clone.data = bytes;
      else if (Array.isArray(clone.bytes)) clone.bytes = Array.from(bytes);
      else clone.contents = bytes;
      value = clone;
    }

    await new Promise<void>((resolve, reject) => {
      const w = os.put(value, key);
      w.onerror = () => reject(w.error);
      w.onsuccess = () => resolve();
    });
  }



  private async idbKeyExists(db: IDBDatabase, key: string): Promise<boolean> {
    const tx = db.transaction('FILE_DATA', 'readonly');
    const os = tx.objectStore('FILE_DATA');
    return await new Promise<boolean>((resolve) => {
      const r = os.get(key); // using get() is broadly compatible
      r.onerror = () => resolve(false);
      r.onsuccess = () => resolve(r.result !== undefined && r.result !== null);
    });
  }



  private bytesEqual(a: Uint8Array | null, b: Uint8Array | null): boolean {
    if (!a || !b) return false;
    if (a.byteLength !== b.byteLength) return false;
    for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  private expectedSizeForExt(ext: '.eep' | '.sra' | '.fla'): number[] {
    if (ext === '.eep') return [512, 2048];
    if (ext === '.sra') return [32768];
    if (ext === '.fla') return [131072];
    return [];
  }

  private async waitForGoodNameKey(ext: '.eep' | '.sra' | '.fla', timeoutMs = 2000, intervalMs = 150): Promise<string | null> {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      try {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open('/mupen64plus');
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result);
        });
        if (!Array.from(db.objectStoreNames).includes('FILE_DATA')) { db.close(); return null; }

        const goodKey = await this.findEmuGoodNameKeyForExt(db, ext).catch(() => null);
        db.close();
        if (goodKey) return goodKey;
      } catch { /* ignore and retry */ }
      await new Promise(r => setTimeout(r, intervalMs));
    }
    return null;
  }


  /** If EEPROM is 2048 but the game actually needs 512, try a 512-byte truncated variant. */
  private maybeDownsizeEeprom4K(bytes: Uint8Array): Uint8Array | null {
    if (!bytes || bytes.byteLength !== 2048) return null;
    // Heuristic: many titles (e.g., Star Wars Episode I: Racer) are EEPROM 4K (512B).
    // Write a 512B truncated copy as a fallback for GoodName.
    return bytes.slice(0, 512);
  }



  private async ensureSaveLoadedForCurrentRom(): Promise<void> {
    if (!this.romName) return;

    const tryExts: ('.eep' | '.sra' | '.fla')[] = ['.eep', '.sra', '.fla'];

    try {
      const db = await this.openMupenDb();
      if (!db) return;

      let chosenExt: '.eep' | '.sra' | '.fla' | null = null;
      let canonicalKey: string | null = null;

      // ONLY look for canonical ROM save
      for (const ext of tryExts) {
        const key = `/mupen64plus/saves/${this.canonicalSaveFilename(ext)}`;
        if (await this.idbKeyExists(db, key)) {
          chosenExt = ext;
          canonicalKey = key;
          break;
        }
      }

      this.saveDebug('LOAD-GUARD: chosen', { chosenExt, canonicalKey });
      if (!chosenExt || !canonicalKey) {
        db.close();
        return;
      }

      const canonicalBytes = await this.readIdbBytes(db, canonicalKey);
      db.close();
      if (!canonicalBytes) return;

      // Emulator GoodName key (what mupen actually reads)
      const emuKey = this.emuPrimarySaveKey(chosenExt);
      if (!emuKey) return;

      await this.writeCanonicalToEmuKey(chosenExt, canonicalBytes, emuKey);
    } catch (e) {
      console.warn('ensureSaveLoadedForCurrentRom failed', e);
    }
  }


  private async writeCanonicalToEmuKey(
    ext: '.eep' | '.sra' | '.fla',
    canonicalBytes: Uint8Array,
    emuKey: string
  ): Promise<void> {
    const db2 = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('/mupen64plus');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
    if (!Array.from(db2.objectStoreNames).includes('FILE_DATA')) { db2.close(); return; }

    const emuBytes = await this.readIdbBytes(db2, emuKey);
    let wrote = false;

    let targetBytes = canonicalBytes;
    if (ext === '.eep') {
      const override = this.eepromSizeOverrideForRom();
      if (override === 512 && canonicalBytes.byteLength === 2048) {
        const downsized = this.maybeDownsizeEeprom4K(canonicalBytes);
        if (downsized) targetBytes = downsized;
      }
    }

    if (!this.bytesEqual(targetBytes, emuBytes)) {
      await this.writeIdbBytes(db2, emuKey, targetBytes);
      wrote = true;
      this.saveDebug(`LOAD-GUARD: wrote canonical -> emuKey`, {
        emuKey,
        size: targetBytes.byteLength,
        hash: await this.shortSha(targetBytes)
      });
    } else {
      this.saveDebug(`LOAD-GUARD: emuKey already matches canonical`, { emuKey });
    }

    db2.close();

    // ✅ Zero-restart for EEPROM
    if (wrote && ext === '.eep') {
      // No hard restart; many N64 titles read EEPROM state at or near title/menu.
      // Most games will notice immediately when entering the Save/Load screen or after a soft return to menu.
      this.parentRef?.showNotification('EEPROM save injected (no restart). If not visible yet, open/return to the save menu.');
      return;
    }

    // Keep existing behavior for SRAM/Flash (needs a reload to be safe)
    if (wrote && (ext === '.sra' || ext === '.fla')) {
      await this.safeRestart('load-guard');
      this.parentRef?.showNotification('Save injected; emulator restarted to reload it.');
    }
  }


  private async findEmuGoodNameKeyForExt(db: IDBDatabase, ext: '.eep' | '.sra' | '.fla'): Promise<string | null> {
    const rows: Array<{ key: any; val: any }> = await new Promise((resolve, reject) => {
      const res: any[] = [];
      const tx = db.transaction('FILE_DATA', 'readonly');
      const os = tx.objectStore('FILE_DATA');
      const cur = os.openCursor();
      cur.onerror = () => reject(cur.error);
      cur.onsuccess = (ev: any) => {
        const c = ev.target.result;
        if (c) { res.push({ key: c.key, val: c.value }); c.continue(); }
        else resolve(res);
      };
    });

    const token = this.romTokenForMatching(this.romName);
    if (!token) return null;

    const lowerExt = ext.toLowerCase();
    const saveRows = rows.filter(({ key }) => {
      const s = String(key).toLowerCase();
      return s.startsWith('/mupen64plus/saves/') && s.endsWith(lowerExt);
    });

    const match = saveRows.find(({ key }) => {
      const fname = String(key).split('/').pop() || '';
      const loose = fname.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      return loose.includes(token);
    });

    return match ? String(match.key) : null;
  }

  private multiPortActive(): boolean {
    return [1, 2, 3, 4].filter(p => this.ports[p as PlayerPort].gpIndex != null).length > 1;
  }

  get playerPorts(): PlayerPort[] { return [1, 2, 3, 4]; }

  private saveDebug(...args: any[]) {
    if (!this.SAVE_DEBUG) return;
    const tag = `[SAVE-DEBUG]`;
    console.log(tag, ...args);
  }

  private async debugScanMempaks(): Promise<void> {
    try {
      const db = await this.openMupenDb();
      if (!db) {
        this.parentRef?.showNotification('IndexedDB "/mupen64plus" not found or missing FILE_DATA.');
        return;
      }

      const rows: Array<{ key: any; val: any }> = await new Promise((resolve, reject) => {
        const tx = db.transaction('FILE_DATA', 'readonly');
        const os = tx.objectStore('FILE_DATA');
        const out: any[] = [];
        const cur = os.openCursor();
        cur.onerror = () => reject(cur.error);
        cur.onsuccess = (ev: any) => {
          const c = ev.target.result;
          if (c) { out.push({ key: c.key, val: c.value }); c.continue(); }
          else resolve(out);
        };
      });

      const mempakRows = rows.filter(r => String(r.key).toLowerCase().startsWith('/mupen64plus/mempaks/'));
      const summarize = (val: any): number => {
        if (!val) return 0;
        if (val instanceof ArrayBuffer) return val.byteLength;
        if (val?.buffer instanceof ArrayBuffer && typeof val.byteLength === 'number') return val.byteLength;
        if (val?.contents?.byteLength) return val.contents.byteLength;
        if (val?.data?.byteLength) return val.data.byteLength;
        if (Array.isArray(val?.bytes)) return val.bytes.length;
        return 0;
      };

      this.saveDebug(`MEMPAKS`, mempakRows.map(r => ({
        key: String(r.key),
        size: summarize(r.val)
      })));

      db.close();
    } catch (e) {
      this.saveDebug('MEMPAKS scan failed', e);
    }
  }

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

  private async shortSha(bytes: Uint8Array | ArrayBuffer | ArrayBufferView | null): Promise<string> {
    if (!bytes) return 'null';
    const ab = bytes instanceof Uint8Array
      ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      : (bytes as any).buffer ? (bytes as any).buffer : (bytes as ArrayBuffer);
    const digest = await crypto.subtle.digest('SHA-256', ab);
    const u8 = new Uint8Array(digest);
    const hex = Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 12);
  }

  // Optional: serialize FS.syncfs if you ever call it.
  private _idbfsSync = Promise.resolve();
  private async syncFs(label = 'manual'): Promise<void> {
    const FS: any = (window as any).FS;
    if (!FS?.syncfs) return;
    const run = () => new Promise<void>(resolve => {
      try { FS.syncfs(false, () => resolve()); } catch { resolve(); }
    });
    this._idbfsSync = this._idbfsSync.then(run, run);
    await this._idbfsSync;
  }

  /** Heuristic/override of EEPROM size for specific ROMs (by loose token). */
  private eepromSizeOverrideForRom(): 512 | 2048 | null {
    // Normalize: lowercase, collapse spaces
    const raw = this.romTokenForMatching(this.romName) || '';
    const t = raw.replace(/\s+/g, ' ').trim(); // <-- collapse multiple spaces

    // Cover common variants for Racer
    const isRacer =
      t.includes('star wars episode i racer') ||
      t.includes('star wars episode 1 racer') ||
      t.includes('star wars ep1 racer') ||
      // light fallback in case title is shortened:
      (t.includes('star wars') && t.includes('racer') && (t.includes('episode') || t.includes('ep1')));

    if (isRacer) return 512;

    // Add more overrides here as needed (Zelda etc.) — not necessary right now.
    return null;
  }

  /** Capture core-printed ROM metadata (Goodname + MD5) during boot. */
  private installMupenConsoleSniffer(): () => void {
    const originalLog = console.log.bind(console);

    console.log = (...args: any[]) => {
      try {
        originalLog(...args);

        const msg = args?.[0];
        if (typeof msg !== 'string') return;

        const mGood = msg.match(/@@@\s*Core:\s*Goodname:\s*(.+)$/i);
        if (mGood?.[1]) this._romGoodName = mGood[1].trim();

        const mMd5 = msg.match(/@@@\s*Core:\s*MD5:\s*([0-9A-F]{32})/i);
        if (mMd5?.[1]) this._romMd5 = mMd5[1].toUpperCase();
      } catch {
        // never block boot
      }
    };

    return () => { console.log = originalLog; };
  }

  /** ROM header internal name (offset 0x20..0x33), trimmed. */
  private romHeaderInternalName(): string | null {
    if (!this.romBuffer) return null;
    try {
      const u8 = new Uint8Array(this.romBuffer);
      const start = 0x20;
      const end = 0x34; // exclusive
      const slice = u8.slice(start, end);
      let s = '';
      for (const b of slice) {
        if (b === 0) break;
        s += String.fromCharCode(b);
      }
      s = s.replace(/\s+/g, ' ').trim();
      return s || null;
    } catch {
      return null;
    }
  }

  /** Mupen "SaveFilenameFormat=1" style: goodname(32) + "-" + md5(8) */
  private mupenGoodNameMd5Base(): string | null {
    if (!this._romGoodName || !this._romMd5) return null;
    const good32 = this._romGoodName.slice(0, 32);
    const md58 = this._romMd5.slice(0, 8);
    return `${good32}-${md58}`;
  }

  /** Candidate IDBFS keys under /mupen64plus/saves for a given ext. */


  private buildSaveKeyCandidates(
    ext: '.eep' | '.sra' | '.fla',
    incomingFileName?: string
  ): string[] {
    const keys = new Set<string>();

    // Keep incoming filename (compat/diagnostics)
    if (incomingFileName) {
      keys.add(`/mupen64plus/saves/${incomingFileName}`);
    }

    // Always also write canonical key (no suffix)
    const canonical = this.canonicalSaveFilename(ext);
    keys.add(`/mupen64plus/saves/${canonical}`);

    return Array.from(keys);
  }



  /** The save key the emulator is most likely using right now (based on GoodName). */
  private emuPrimarySaveKey(ext: '.eep' | '.sra' | '.fla'): string | null {
    if (!this._romGoodName) return null;
    return `/mupen64plus/saves/${this._romGoodName}${ext}`;
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

  private setPortNone(port: PlayerPort) {
    // Explicit user intent: do not auto-assign this port anymore until user picks a controller again.
    this.ports[port].gpIndex = null;
    this.ports[port].gpId = null;
    this.ports[port].mapping = {};
    this.ports[port].mappingName = null;
    this.ports[port].autoFill = false; // <- lock
    this.applyGamepadReorder();
    this.parentRef?.showNotification?.(`Player ${port} set to none`);
  }

  /** Enforce invariants so the first/only pad sits on P1 before we reorder. */

  private normalizePortsAfterRefresh() {
    // Build a quick lookup of connected pads by index
    const connected = new Map<number, { index: number; id: string }>();
    for (const g of this.gamepads) {
      if (g?.connected && typeof g.index === 'number') {
        connected.set(g.index, g as any);
      }
    }

    // 1) If exactly one pad is connected and P1 is empty AND allowed to auto-fill, assign it to P1.
    if (
      connected.size === 1 &&
      this.ports[1].gpIndex == null &&
      this.ports[1].autoFill === true
    ) {
      const only = Array.from(connected.values())[0];
      this.ports[1].gpIndex = only.index;
      this.ports[1].gpId = only.id;
      this.ensureDefaultMappingForPort(1);
    }

    // 2) If P1 points to a non-existent pad but some pad exists, promote one to P1 ONLY if autoFill is true.
    const p1Idx = this.ports[1].gpIndex;
    const p1Exists = (p1Idx != null) && connected.has(p1Idx);
    if (!p1Exists && connected.size > 0 && this.ports[1].autoFill === true) {
      const first = Array.from(connected.values())[0];
      this.ports[1].gpIndex = first.index;
      this.ports[1].gpId = first.id;
      this.ensureDefaultMappingForPort(1);
    }

    // 3) Ensure no duplicate assignment of a single pad across ports; P1 has priority.
    const claimed = new Set<number>();
    for (const p of [1, 2, 3, 4] as const) {
      const idx = this.ports[p].gpIndex;
      if (idx == null) continue;
      if (claimed.has(idx)) {
        // Already used by a lower-numbered port; drop this assignment.
        this.ports[p].gpIndex = null;
        this.ports[p].gpId = null;
      } else {
        // Keep only if actually connected
        if (connected.has(idx)) {
          claimed.add(idx);
        } else {
          this.ports[p].gpIndex = null;
          this.ports[p].gpId = null;
        }
      }
    }

    // 4) If we ended up with exactly one connected pad total, reflect it in selectedGamepadIndex too.
    // (This affects UI only; safe to leave as-is.)
    if (connected.size === 1) {
      const only = Array.from(connected.values())[0];
      this.selectedGamepadIndex = only.index;
    }
  }

  getRomName(): string | null {
    return this.fileService.getFileWithoutExtension(this.romName || '');
  }
  finishFileUploading() {
    this.isFileUploaderExpanded = false;
    if (this.fileSearchComponent) {
      this.fileSearchComponent.getDirectory();
    }
  }
}