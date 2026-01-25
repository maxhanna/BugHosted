
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

  // Logging
  _gpPoller: any;
  private _logRawTimer: any = null;
  private _logEffectiveTimer: any = null;
  private _logRawPeriodMs = 750;
  private _logEffectivePeriodMs = 750;

  // Axis behavior
  private _axisDeadzone = 0.2;

  // ---- Debug knobs ----
  private SAVE_DEBUG = true;
  private DEBUG_CLEAR_SAVESTATES = true; // set to false in prod builds

  constructor(private fileService: FileService, private romService: RomService) {
    super();
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

    setTimeout(() => { this.tryApplyLastForConnectedPads().catch(() => { }); }, 0);
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
        const saveGameFile = await this.romService.getN64SaveByName(this.romName, this.parentRef?.user?.id);
        if (saveGameFile) {
          console.log("Found Save File.");
          const saveFile = await this.blobToN64SaveFile(saveGameFile.blob, this.romName);
          if (saveFile) {
            await this.importInGameSaveRam([saveFile], true);
            if (this.DEBUG_CLEAR_SAVESTATES) {
              await this.deleteSavestatesForCurrentRom();
            }
          } else {
            console.log("No Save file found for this ROM.");
            this.parentRef?.showNotification('No save found on server for this ROM.');
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
        await new Promise((r) => setTimeout(r, 350));
      }

      await writeAutoInputConfig(sectionName, config as any);
      this.parentRef?.showNotification(`Applied RAW mapping for "${sectionName}"`);

      const gp = this.currentPad();
      this.persistLastMappingForGp(gp?.id || null, this.selectedMappingName); // <-- ADD

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
    
    try {
        this.refreshGamepads();
        const connectedCount = this.gamepads.filter(g => g?.connected).length;
        this.parentRef?.showNotification(
          `Booting… ${connectedCount} controller${connectedCount === 1 ? '' : 's'} detected`
        );
      } catch {
        this.parentRef?.showNotification(`No Gamepads detected`);
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

    // ✅ Reset meta and start sniffer BEFORE emulator creation
    this._romGoodName = null;
    this._romMd5 = null;
    const restoreSniffer = this.installMupenConsoleSniffer();

    try {
      this.applyGamepadReorder();
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

      if (!this.instance || typeof this.instance.start !== 'function') {
        this.status = 'error';
        throw new Error('Emulator instance missing start method');
      }

      await this.instance.start();
      this.status = 'running';

      // ✅ Stop sniffing once ROM meta printed
      restoreSniffer();

      // Give IDBFS a small head start; reduces "syncfs overlap" churn
      await new Promise(r => setTimeout(r, 400));
      await this.syncFs('post-start');

      await this.safeDebug('SAVE-SCAN', () => this.debugScanAllBatteryForCurrentRom());
      await this.safeDebug('ROM-ID', () => this.debugRomIdentity());

      // Optional (your ini in /assets looks like a stub; safeDebug prevents crashing)
      await this.safeDebug('INI', () => this.debugCheckIniForRacer());

      // Mirrors (keep if you want)
      this.mirrorGoodNameSavesToCanonical().catch(() => { });

      // ✅ This is the key: copy canonical -> emulator key (GoodName).eep and restart once
      this.ensureSaveLoadedForCurrentRom().catch(() => { });

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
      this.debugScanMempaks().catch(() => { });
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
  // Direct-inject (keyboard synth)
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
      const db = await this.openMupenDb();
      if (!db) {
        this.parentRef?.showNotification('IndexedDB "/mupen64plus" not found or missing FILE_DATA.');
        return empty;
      }

      // Pull all rows from FILE_DATA
      const rows: Array<{ key: any; val: any }> = await new Promise((resolve, reject) => {
        const tx = db.transaction('FILE_DATA', 'readonly');
        const os = tx.objectStore('FILE_DATA');
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

      // ---------- Goodname-first targeting ----------
      const goodname = this._romGoodName || null;
      const goodnameKeys = goodname
        ? ['.eep', '.sra', '.fla'].map(ext => `/mupen64plus/saves/${goodname}${ext}`)
        : [];

      const byExactGood = goodname
        ? saveRows.filter(({ key }) => goodnameKeys.includes(String(key)))
        : [];

      let targetRows = saveRows;
      let matchedOnly = false;

      if (byExactGood.length) {
        // ✅ Prefer the active ROM’s Goodname saves
        targetRows = byExactGood;
        matchedOnly = true;
      } else {
        // ---------- Token-based narrowing (your original logic) ----------
        const isRunning = this.status === 'running' && !!this.instance;
        const romToken = this.romTokenForMatching(this.romName);
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
            console.log('No saves matched the current ROM; returning all saves.');
          }
        }
      }

      // ---------- De-duplicate by extension with Goodname -> Canonical -> Any preference ----------
      const userId = this.parentRef?.user?.id ?? 0;
      const extOrder: ('.eep' | '.sra' | '.fla')[] = ['.eep', '.sra', '.fla'];

      const chooseForExt = (ext: '.eep' | '.sra' | '.fla') => {
        const candidates = targetRows.filter(({ key }) => String(key).toLowerCase().endsWith(ext));
        if (!candidates.length) return null;

        // Prefer Goodname exact key if present
        if (goodname) {
          const gk = `/mupen64plus/saves/${goodname}${ext}`;
          const byGood = candidates.find(({ key }) => String(key) === gk);
          if (byGood) return byGood;
        }

        // Then prefer canonical "<base>_<uid><ext>"
        const canonicalName = `/mupen64plus/saves/${this.canonicalSaveFilename(ext, userId)}`;
        const canon = candidates.find(({ key }) => String(key) === canonicalName);
        if (canon) return canon;

        // Else first available
        return candidates[0];
      };

      const chosenRows: Array<{ key: any; val: any }> = [];
      for (const ext of extOrder) {
        const picked = chooseForExt(ext);
        if (picked) chosenRows.push(picked);
      }

      // ---------- Build exported payload ----------
      const exported: N64ExportedSave[] = [];
      for (const { key, val } of chosenRows) {
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
      console.log(`Prepared ${scope} ${count} in-game save file(s) for export.`);
      this.saveDebug(`EXPORT RESULT`, {
        rom: this.romName,
        matchedOnly,
        totalFound: saveRows.length,
        exported: exported.map(e => ({ filename: e.filename, size: e.size }))
      });

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

    this.saveDebug(`SERVER SAVE`, {
      rom: suggestedName,
      inferredExt: ext,
      size
    });

    const base = (suggestedName && suggestedName.replace(/\.[^\.]+$/, '')) || this.canonicalRomBaseFromFileName(this.romName);
    const filename = `${base}${ext}`;
    return new File([blob], filename, { type: blob.type || 'application/octet-stream' });
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
        // Helper: coerce any timestamp-like field to a real Date
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
          // Create a minimal IDBFS-compatible record.
          // IDBFS usually stores one of {contents|data|bytes} plus a timestamp-like field.
          return {
            timestamp: new Date(),     // <-- critical: a real Date instance
            mode: 0o100644,            // optional (regular file, rw-r--r--)
            contents: bytes            // pick one field name consistently
          };
        }

        // Clone and preserve overall shape; convert timestamp to Date
        const clone = JSON.parse(JSON.stringify(existingOrTemplate));
        ensureDate(clone);

        if (clone.contents) clone.contents = bytes;
        else if (clone.data) clone.data = bytes;
        else if (Array.isArray(clone.bytes)) clone.bytes = Array.from(bytes);
        else {
          // Fallback: add a 'contents' field if none matched
          clone.contents = bytes;
        }

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
        const size = bytes.byteLength;

        // Prepare keys (no GoodName write during import; only incoming + canonical) 
        const incomingKey = `/mupen64plus/saves/${name}`;

        // Build all likely keys Mupen might use for this ROM + ext
        const keyCandidates = this.buildSaveKeyCandidates(ext as any, name);

        // Keep canonicalKey just for your debug payload (optional)
        const canonicalKey = userId
          ? `/mupen64plus/saves/${this.canonicalSaveFilename(ext as any, userId)}`
          : incomingKey;

        this.saveDebug(`IMPORT BEGIN`, {
          romName: this.romName,
          userId,
          file: { name, ext, size },
          keys: { incomingKey, canonicalKey, goodKey: null }
        });

        const txRW = db.transaction('FILE_DATA', 'readwrite');
        const osRW = txRW.objectStore('FILE_DATA');

        // const existingIncoming = await new Promise<any>((resolve) => {
        //   const req = osRW.get(incomingKey);
        //   req.onerror = () => resolve(null);
        //   req.onsuccess = () => resolve(req.result || null);
        // });

        //const valueIncoming = makeValue(bytes, existingIncoming ?? templateVal);

        const writes: Promise<void>[] = [];
        for (const key of keyCandidates) {
          // try to preserve stored shape when overwriting
          const existing = await new Promise<any>((resolve) => {
            const req = osRW.get(key);
            req.onerror = () => resolve(null);
            req.onsuccess = () => resolve(req.result || null);
          });

          const value = makeValue(bytes, existing ?? templateVal);
          writes.push(txPut(osRW, key, value));
        }

        await Promise.all(writes);

        this.saveDebug(`IMPORT KEYS WRITTEN`, {
          ext,
          count: keyCandidates.length,
          keys: keyCandidates
        });

        // Verify incoming/canonical only
        const verifyTx = db.transaction('FILE_DATA', 'readonly');
        const verifyOS = verifyTx.objectStore('FILE_DATA');

        const readBack = async (key: string) => new Promise<any>((resolve) => {
          const r = verifyOS.get(key);
          r.onerror = () => resolve(null);
          r.onsuccess = () => resolve(r.result ?? null);
        });

        const vIncoming = await readBack(incomingKey);
        const vCanonical = await readBack(canonicalKey);

        const castToU8 = (v: any) => {
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
        const hCanonical = await this.shortSha(castToU8(vCanonical));

        this.saveDebug(`IMPORT WRITE OK`, {
          incomingKey, canonicalKey, goodKey: null,
          hashes: { src: hb, incoming: hIncoming, canonical: hCanonical }
        });

        written.push(name);
      }

      db.close();

      // Reboot if needed
      if (written.length) {
        console.log(`Imported ${written.length} save file(s): ${written.join(', ')}`);
        this.parentRef?.showNotification(`Imported ${written.length} save file(s): ${written.join(', ')}`);
        const wasRunning = this.status === 'running' || !!this.instance;
        if (wasRunning) {
          await this.stop();
          await new Promise(r => setTimeout(r, 400));
          await this.syncFs('post-import');
        }
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

  // =====================================================
  // Autosave
  // =====================================================

  // =====================================================
  // Autosave (REPLACE the whole method)
  // =====================================================
  private async autosaveTick() {
    if (!this.autosave || this.autosaveInProgress) return;
    this.autosaveInProgress = true;

    try {
      const userId = this.parentRef?.user?.id;
      if (!userId) return;

      // Always export; don’t require matchedOnly to be true
      const result = await this.exportInGameSaveRam();
      const isRunning = this.status === 'running' && !!this.instance;
      if (!isRunning || !result.exported.length) return;

      // Pick the best save for the ACTIVE ROM:
      // 1) Prefer exact Goodname match
      // 2) Else prefer token match
      // 3) Else first (fallback)
      const good = this._romGoodName || '';
      const token = (this.romTokenForMatching(this.romName) || '').toLowerCase();

      const byGood = good
        ? result.exported.find(e => e.filename === `${good}.eep`
          || e.filename === `${good}.sra`
          || e.filename === `${good}.fla`)
        : null;

      const byToken = !byGood && token
        ? result.exported.find(e => {
          const lower = (e.filename || '').toLowerCase();
          const loose = lower.replace(/[^a-z0-9 ]/g, '').trim();
          return loose.includes(token);
        })
        : null;

      const best = byGood || byToken || result.exported[0];
      if (!best) return;

      // IMPORTANT: send the EXACT ROM filename (with extension),
      // so it matches GetN64SaveByName() later.
      const romNameForServer = this.romName || this.canonicalRomBaseFromFileName(this.romName);

      const ext = this.detectSaveExt(best.filename, best.size);
      const filenameForServer = this.canonicalSaveFilenameForUpload(ext);

      const payload: N64StateUpload = {
        userId,
        romName: romNameForServer,          // <— FIX: exact ROM filename with extension
        filename: filenameForServer,        // e.g., "<Base>.eep|.sra|.fla"
        bytes: best.bytes,
        saveTimeMs: Date.now(),
        durationSeconds: 180
      };

      const uploadRes = await this.romService.saveN64State(payload);
      if (!uploadRes.ok) {
        console.warn('Upload failed:', uploadRes.errorText);
      } else {
        console.log('Saved state with payload:', uploadRes);
        this.parentRef?.showNotification?.(`Autosaved ${ext} for ${romNameForServer}`);
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

    // --- ADD: if P1 is empty, try to use a known mapping for this specific device
    (async () => {
      if (this.ports[1].gpIndex == null) {
        const last = this.lastMappingPerGp[ev.gamepad.id];
        if (last) {
          // Mount this controller to P1 and apply its mapping
          this.ports[1].gpIndex = ev.gamepad.index;
          this.selectedGamepadIndex = ev.gamepad.index;
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

      // --- MODIFY: maybeApplyStoredMappingFor() should also check lastMappingPerGp first (see next section)
      this.maybeApplyStoredMappingFor(ev.gamepad.id);
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
        this.refreshGamepads();
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


  /** Persist last mapping name used for a given gamepad.id */
  private persistLastMappingForGp(gamepadId: string | null, mappingName: string | null) {
    if (!gamepadId || !mappingName) return;
    try {
      this.lastMappingPerGp[gamepadId] = mappingName;
      localStorage.setItem(this._lastPerGamepadKey, JSON.stringify(this.lastMappingPerGp));
    } catch { /* ignore */ }
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
      this.parentRef?.showNotification?.(`Auto-applied "${name}" for ${gp.id}`);
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
      this._originalGetGamepadsBase = navigator.getGamepads ? navigator.getGamepads.bind(navigator) : null;
      const self = this;

      (navigator as any).getGamepads = function (): (Gamepad | null)[] {
        const baseArr = (self._originalGetGamepadsBase ? self._originalGetGamepadsBase() : []) || [];
        const chosen: (Gamepad | null)[] = [];
        const used = new Set<number>();

        const pushIf = (idx: number | null) => {
          if (idx == null) return;
          const pad = baseArr[idx];
          if (pad && !used.has(idx)) { chosen.push(pad); used.add(idx); }
        };

        pushIf(self.ports[1].gpIndex);
        pushIf(self.ports[2].gpIndex);
        pushIf(self.ports[3].gpIndex);
        pushIf(self.ports[4].gpIndex);

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

  closeRemapperToPort(port: PlayerPort) {
    this.ports[port].mapping = JSON.parse(JSON.stringify(this.mapping));
    this.showKeyMappings = false;
    this.parentRef?.showNotification(`Updated mapping for P${port}`);
  }

  async onSelectGamepadForPort(port: PlayerPort, value: string | number) {
    const idx = Number(value);
    if (Number.isNaN(idx)) return;

    for (const p of [1, 2, 3, 4] as const) {
      if (p !== port && this.ports[p].gpIndex === idx) {
        this.parentRef?.showNotification(`That controller is already assigned to Player ${p}.`);
        return;
      }
    }

    this.ports[port].gpIndex = idx;
    this.refreshGamepads();
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

        await writeAutoInputConfig(sectionName, cfg as any);
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

  private canonicalSaveFilenameForUpload(ext: '.eep' | '.sra' | '.fla' | string): string {
    const base = this.canonicalRomBaseFromFileName(this.romName);
    return `${base}${ext}`;
  }

  private detectSaveExt(filename: string | null | undefined, size: number): '.eep' | '.sra' | '.fla' {
    const extFromName = (filename?.match(/\.(eep|sra|fla)$/i)?.[0] || '').toLowerCase() as any;
    if (extFromName) return extFromName;
    return this.inferBatteryExtFromSize(size) || '.sra';
  }

  private async mirrorCanonicalToGoodNameIfMissing(): Promise<void> {
    try {
      const dbMeta: Array<{ name?: string }> =
        (indexedDB as any).databases ? await (indexedDB as any).databases() : [];
      const mupenDb = dbMeta.find(d => d.name === '/mupen64plus');
      if (!mupenDb) return;

      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('/mupen64plus');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });
      if (!Array.from(db.objectStoreNames).includes('FILE_DATA')) { db.close(); return; }

      const userId = this.parentRef?.user?.id ?? 0;
      const tryExts: ('.eep' | '.sra' | '.fla')[] = ['.eep', '.sra', '.fla'];

      for (const ext of tryExts) {
        const canonicalName = this.canonicalSaveFilename(ext, userId);
        const canonicalKey = `/mupen64plus/saves/${canonicalName}`;

        const txR = db.transaction('FILE_DATA', 'readonly');
        const osR = txR.objectStore('FILE_DATA');
        const canonicalVal = await new Promise<any>((resolve) => {
          const r = osR.get(canonicalKey);
          r.onerror = () => resolve(null);
          r.onsuccess = () => resolve(r.result ?? null);
        });
        if (!canonicalVal) continue;

        const goodKey = await this.findEmuGoodNameKeyForExt(db, ext).catch(() => null);
        if (goodKey) {
          const txW = db.transaction('FILE_DATA', 'readwrite');
          const osW = txW.objectStore('FILE_DATA');
          await new Promise<void>((resolve, reject) => {
            const w = osW.put(canonicalVal, goodKey);
            w.onerror = () => reject(w.error);
            w.onsuccess = () => resolve();
          });
        }
      }

      db.close();
    } catch (e) {
      console.warn('mirrorCanonicalToGoodNameIfMissing failed', e);
    }
  }

  private async mirrorGoodNameSavesToCanonical(): Promise<void> {
    try {
      const dbMeta: Array<{ name?: string }> =
        (indexedDB as any).databases ? await (indexedDB as any).databases() : [];
      const mupenDb = dbMeta.find(d => d.name === '/mupen64plus');
      if (!mupenDb) return;

      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('/mupen64plus');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });
      if (!Array.from(db.objectStoreNames).includes('FILE_DATA')) { db.close(); return; }

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
      if (!token) { db.close(); return; }

      const saveExts = ['.eep', '.sra', '.fla'];
      const saveRows = rows.filter(({ key }) => {
        const s = String(key).toLowerCase();
        return s.startsWith('/mupen64plus/saves/') && saveExts.some(e => s.endsWith(e));
      });

      const matching = saveRows.filter(({ key }) => {
        const fname = String(key).split('/').pop() || '';
        const lower = fname.toLowerCase();
        const loose = lower.replace(/[^a-z0-9 ]/g, '').trim();
        return loose.includes(token);
      });

      const userId = this.parentRef?.user?.id ?? 0;
      for (const { key } of matching) {
        const fileName = String(key).split('/').pop()!;
        const ext = (fileName.match(/\.(eep|sra|fla)$/i)?.[0] || '').toLowerCase();
        if (!ext) continue;

        const canonicalName = this.canonicalSaveFilename(ext as any, userId);
        const canonicalKey = `/mupen64plus/saves/${canonicalName}`;
        await this.ensureIdbAlias(db, String(key), canonicalKey);
      }

      db.close();
    } catch (e) {
      console.warn('mirrorGoodNameSavesToCanonical failed', e);
    }
  }

  private canonicalSaveFilename(ext: '.eep' | '.sra' | '.fla' | string, userId?: number | null): string {
    const base = this.canonicalRomBaseFromFileName(this.romName);
    const uid = userId ?? this.parentRef?.user?.id ?? 0;
    const suffix = uid && uid > 0 ? `_${uid}` : '';
    return `${base}${suffix}${ext}`;
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
      const r = os.getKey(key);
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


  /**
   * Ensure the current ROM loads the imported save:
   * - Prefer ext order .eep -> .sra -> .fla
   * - Validate by ext-typical size; skip mismatches.
   * - Copy canonical -> GoodName once; restart if changed.
   * - For .eep: honor per-ROM override (e.g. Racer -> 512B), otherwise prefer existing GoodName size.
   * - Keep canonical in sync with the chosen GoodName bytes to avoid confusion on export.
   */

  private async ensureSaveLoadedForCurrentRom(): Promise<void> {
    const userId = this.parentRef?.user?.id ?? 0;
    if (!this.romName || !userId) return;

    const tryExts: ('.eep' | '.sra' | '.fla')[] = ['.eep', '.sra', '.fla'];

    let chosenExt: '.eep' | '.sra' | '.fla' | null = null;
    let canonicalKey: string | null = null;

    try {
      // 1) Choose canonical key (what you imported / stored)
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('/mupen64plus');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });
      if (!Array.from(db.objectStoreNames).includes('FILE_DATA')) { db.close(); return; }

      for (const ext of tryExts) {
        const cand = `/mupen64plus/saves/${this.canonicalSaveFilename(ext, userId)}`;
        const exists = await this.idbKeyExists(db, cand);
        if (!exists) continue;

        const bytes = await this.readIdbBytes(db, cand);
        const sizes = this.expectedSizeForExt(ext);
        if (bytes && sizes.includes(bytes.byteLength)) {
          chosenExt = ext;
          canonicalKey = cand;
          break;
        }
      }

      this.saveDebug(`LOAD-GUARD: canonical ext chosen`, { chosenExt, canonicalKey });
      if (!chosenExt || !canonicalKey) { db.close(); return; }

      const canonicalBytes = await this.readIdbBytes(db, canonicalKey);
      db.close();
      if (!canonicalBytes || canonicalBytes.byteLength === 0) return;

      this.saveDebug(`LOAD-GUARD: canonical bytes`, {
        canonicalKey,
        size: canonicalBytes.byteLength,
        hash: await this.shortSha(canonicalBytes)
      });

      // 2) Determine the emulator’s real save key from GoodName (deterministic)
      const emuKey = this.emuPrimarySaveKey(chosenExt);

      this.saveDebug(`LOAD-GUARD: emuKey chosen`, {
        emuKey,
        goodname: this._romGoodName,
        md5: this._romMd5
      });

      if (!emuKey) {
        // fallback: try previous heuristic (still safe)
        const fallback = await this.waitForGoodNameKey(chosenExt, 2250, 150);
        if (!fallback) return;
        return await this.writeCanonicalToEmuKey(chosenExt, canonicalBytes, fallback);
      }

      // 3) Write canonical -> emuKey and restart if changed
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

    // (Optional) EEPROM override / resizing (only if you still need it)
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

    // Restart once so game re-reads battery save on boot
    if (wrote) {
      try {
        await this.stop();
        await new Promise(r => setTimeout(r, 350));
        await this.boot();
        this.parentRef?.showNotification('Save injected into emulator save key; restarted to reload it.');
      } catch (e) {
        console.warn('Restart after save sync failed', e);
      }
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

  private readCrc1Crc2FromRom(rom: ArrayBuffer): { crc1: string; crc2: string } {
    const dv = new DataView(rom);
    const crc1 = dv.getUint32(0x10, false).toString(16).padStart(8, '0');
    const crc2 = dv.getUint32(0x14, false).toString(16).padStart(8, '0');
    return { crc1, crc2 };
  }

  private async safeDebug(label: string, fn: () => Promise<void>) {
    try { await fn(); }
    catch (e) { console.warn(`[DEBUG:${label}] failed`, e); }
  }

  private async debugRomIdentity(): Promise<void> {
    if (!this.romBuffer) return;
    const { crc1, crc2 } = this.readCrc1Crc2FromRom(this.romBuffer);
    const sha = await this.sha256Hex(this.romBuffer);
    console.log('[ROM-ID]', { romName: this.romName, crc1, crc2, sha256: sha });
  }

  private async debugCheckIniForRacer(): Promise<void> {
    const text = await fetch('/assets/mupen64plus/mupen64plus.ini').then(r => r.text());
    console.log('[INI] length', text.length);
    console.log('[INI] contains "Star Wars Episode I - Racer"?', text.includes('Star Wars Episode I - Racer'));
    console.log('[INI] contains "SaveType=Eeprom 4KB"?', text.includes('SaveType=Eeprom 4KB'));
  }


  private async debugScanAllBatteryForCurrentRom(): Promise<void> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('/mupen64plus');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });

    if (!Array.from(db.objectStoreNames).includes('FILE_DATA')) { db.close(); return; }

    const token = (this.romTokenForMatching(this.romName) || '').toLowerCase();
    const tx = db.transaction('FILE_DATA', 'readonly');
    const os = tx.objectStore('FILE_DATA');

    const rows: Array<{ key: string; size: number; ext: string; matches: boolean }> = await new Promise((resolve, reject) => {
      const out: any[] = [];
      const cur = os.openCursor();
      cur.onerror = () => reject(cur.error);
      cur.onsuccess = (ev: any) => {
        const c = ev.target.result;
        if (c) {
          const keyStr = String(c.key);
          const lower = keyStr.toLowerCase();
          const isBattery = lower.startsWith('/mupen64plus/saves/') &&
            (lower.endsWith('.eep') || lower.endsWith('.sra') || lower.endsWith('.fla'));
          if (isBattery) {
            const fname = lower.split('/').pop() || '';
            const loose = fname.replace(/[^a-z0-9 ]/g, '').trim();
            const matches = !token || loose.includes(token);
            const u8 = this.coerceToU8(c.value);
            const size = u8?.byteLength ?? 0;
            const ext = (fname.match(/\.(eep|sra|fla)$/i)?.[0] || '').toLowerCase();
            out.push({ key: keyStr, size, ext, matches });
          }
          c.continue();
        } else resolve(out);
      };
    });

    console.log('[SAVE-SCAN] battery candidates (.eep/.sra/.fla):', rows);
    db.close();
  }

  private coerceToU8(v: any): Uint8Array | null {
    if (!v) return null;
    if (v instanceof Uint8Array) return v;
    if (v instanceof ArrayBuffer) return new Uint8Array(v);
    if (v?.buffer instanceof ArrayBuffer && typeof v.byteLength === 'number') {
      // handle views correctly:
      return new Uint8Array(v.buffer, v.byteOffset ?? 0, v.byteLength);
    }
    if (v?.contents) return this.coerceToU8(v.contents);
    if (v?.data) return this.coerceToU8(v.data);
    if (Array.isArray(v?.bytes)) return new Uint8Array(v.bytes);
    return null;
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
  private buildSaveKeyCandidates(ext: '.eep' | '.sra' | '.fla', incomingFileName?: string): string[] {
    const keys = new Set<string>();

    // 1) Incoming filename (your current behavior)
    if (incomingFileName) {
      keys.add(`/mupen64plus/saves/${incomingFileName}`);
    }

    // 2) Canonical (your current behavior) - only if userId exists
    const userId = this.parentRef?.user?.id ?? 0;
    if (userId) {
      keys.add(`/mupen64plus/saves/${this.canonicalSaveFilename(ext, userId)}`);
    }

    // 3) Mupen goodname+md5 mode (discussed upstream as SaveFilenameFormat=1)
    //    "%.32s-%.8s" -> goodname32-md5_8 [3](https://mupen64plus.org/wiki/index.php?title=FileLocations)
    const gnMd5 = this.mupenGoodNameMd5Base();
    if (gnMd5) keys.add(`/mupen64plus/saves/${gnMd5}${ext}`);

    // 4) Headername-based candidates (some builds use headername)
    const header = this.romHeaderInternalName();
    if (header) {
      keys.add(`/mupen64plus/saves/${header}${ext}`);
      if (this._romMd5) keys.add(`/mupen64plus/saves/${header}-${this._romMd5.slice(0, 8)}${ext}`);
    }

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

type PlayerPort = 1 | 2 | 3 | 4;

type PortConfig = {
  gpIndex: number | null;
  mapping: Record<string, any>;
  mappingName: string | null;
};
