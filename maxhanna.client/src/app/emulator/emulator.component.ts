
import { AfterViewInit, ChangeDetectorRef, Component, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { RomService } from '../../services/rom.service';
import { FileService } from '../../services/file.service';
import { FileSearchComponent } from '../file-search/file-search.component';
import { AppComponent } from '../app.component';
import {
  VPadItem, System, BuildOpts, SystemCandidate, CoreDescriptor,
  MIN_STATE_SIZE, FAQ_ITEMS, GENESIS_6BUTTON, GENESIS_FORCE_THREE,
  PSP_DEFAULT_OPTIONS, Core
} from './emulator-types';

@Component({
  selector: 'app-emulator',
  templateUrl: './emulator.component.html',
  styleUrls: ['./emulator.component.css'],
  standalone: false
})
export class EmulatorComponent extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild(FileSearchComponent) fileSearchComponent?: FileSearchComponent;

  @Input() presetRomName?: string;
  @Input() presetRomId?: number | undefined;
  @Input() presetForcedCore?: Core | null | undefined;
  @Input() skipSaveFileRequested = false;
  @Input() inputtedParentRef?: AppComponent;

  isSaveConfirmPanelOpen = false;
  saveConfirmType: 'saveAndExit' | 'saveAndReset' | 'save' | undefined;
  saveConfirmMessage?: string;
  saveConfirmCallback?: () => void;
  isShowingLoginPanel = false;
  isMenuPanelOpen = false;
  isFullScreen = false;
  romName?: string;
  system?: System;
  isFileUploaderExpanded = false;
  isFaqOpen = false;
  isResetModalOpen = false;
  skipLoadingSave = true;
  isSystemSelectPanelOpen = false;
  wasMenuOpenBeforeLoggingIn = false;
  faqItems = FAQ_ITEMS;
  isSearchVisible = false;
  autosave = true;
  autosaveIntervalTime: number = 180000; // 3 minutes 
  showControls = true;     // show/hide on-screen controls
  useJoystick = false;     // D-pad (false) vs analog "zone" (true)
  segaShowLR = true;       // show L/R pills on Genesis when desired
  status: string = 'Idle';
  preferSixButtonGenesis: boolean = true;
  loadWithoutSave = false;
  systemCandidates: Array<{ label: string; core?: Core }> = [];
  selectedSystemCore?: Core | null = null;  
private _lastCanvasBufW = 0;
private _lastCanvasBufH = 0; 
  private autosaveInterval: any;
  private romObjectUrl?: string;
  private emulatorInstance?: any;
  private _forcedCore?: Core;
  private _pendingFileToLoad?: { fileName: string; fileId?: number; directory?: string } | null = null;
  private _destroyed = false;
  private _pendingSaveResolve?: (v?: any) => void;
  private _pendingSaveTimer?: any;
  private _captureSaveResolve?: (u8: Uint8Array | null) => void; 
  private CORE_REGISTRY: CoreDescriptor[] = [];
  private _saveFn?: () => Promise<void>;
  private _lastSaveTime: number = 0;
  private _saveInProgress: boolean = false;
  private _inFlightSavePromise?: Promise<boolean>;
  private _exiting = false;
  private exitSaving = false;
  private stopEmuSaving = false;
  private isExitingAndReturningToEmulator = false;
  private _ejsReady = false;
  private lastGoodSaveSize = new Map<string, number>();
  private gameLoadDate?: Date | undefined;
  private readonly SYS_PICK_KEY = 'emu:preferredCoreByExt';
  private readonly heavyCores = new Set<Core>([
    'mednafen_psx_hw', 'pcsx_rearmed', 'duckstation', 'mednafen_psx',
    'mupen64plus_next', 'nds', 'melonDS', 'melonds', 'desmume', 'desmume2015',
    'psp', 'ppsspp', 'dolphin', 'flycast', 'naomi'
  ]);
  constructor(
    private romService: RomService,
    private fileService: FileService,
    private cdr: ChangeDetectorRef
  ) {
    super();
    this.CORE_REGISTRY = this.buildCoreRegistry(this.fileService);
  }


  ngOnInit(): void {
    if (this.inputtedParentRef) {
      this.parentRef = this.inputtedParentRef;
    }
    if (!this.parentRef?.user?.id) {
      this.autosave = false;
    }
    this.ensureLoadedViaRoute();
    if (this.parentRef) {
      this.parentRef.preventShowSecurityPopup = true;
      this.parentRef.navigationComponent?.stopNotifications();
    }
    this.isSearchVisible = true;
  }

  async ngAfterViewInit() {
    this.status = 'Ready - Select a ROM';
    this.cdr.detectChanges();
    // If a preset ROM was provided via query/window, auto-load it now
    if (this.presetRomName && this.presetRomId) {
      try {
        if (this.presetForcedCore) this._forcedCore = this.presetForcedCore;
        await this.loadRomThroughService(this.presetRomName, this.presetRomId, this.presetForcedCore);
      } catch (e) {
        console.error('Failed to auto-load preset ROM', e);
      }
    }
  }

  ngOnDestroy(): void {
    this.status = 'Destroying emulator...';

    try {
    } catch { console.error('Error removing resize listeners'); }

    this._destroyed = true;
    this._ejsReady = false;
    this.clearAutosave();

    if (this.parentRef) {
      this.parentRef.preventShowSecurityPopup = false;
    }
    this.remove_me('EmulatorComponent');
  }

  async safeExit(): Promise<void> {
    this.clearAutosave();
    if (!this.romName || !this.parentRef?.user?.id) {
      if (this.stopEmuSaving || this.isExitingAndReturningToEmulator) {
        this.fullReloadToEmulator();
      } else {
        return this.navigateHome();
      }
    }

    // If we've saved recently (within 10s), skip asking the user again.
    const now = Date.now();
    if (!this._saveInProgress && now - this._lastSaveTime < 10000) {
      if (this.stopEmuSaving || this.isExitingAndReturningToEmulator) {
        this.fullReloadToEmulator();
      } else {
        return this.navigateHome();
      }
    }

    let callback: () => void;
    if (this.stopEmuSaving || this.isExitingAndReturningToEmulator) {
      callback = this.fullReloadToEmulator;
    } else {
      callback = this.navigateHome;
    }
    this.openSaveConfirm('saveAndExit', 'Save state before closing?', callback);
  }

  private navigateHome() {
    setTimeout(() => window.location.replace('/'), 0);
  }

  ensureLoadedViaRoute(): void {
    // SharedArrayBuffer (needed by EJS_threads) requires cross-origin isolation.
    // If the page wasn't served with COOP/COEP headers (e.g. the user opened the
    // emulator via the in-app navigation instead of a direct /Emulator URL), force
    // a full page navigation so Express can apply the required headers.
    if (typeof window !== 'undefined' && !(window as any).crossOriginIsolated) {
      const params = new URLSearchParams();
      if (this.presetRomName) params.set('rom', this.presetRomName);
      if (this.presetRomId != null) params.set('romId', String(this.presetRomId));
      if (this.skipSaveFileRequested) params.set('skipSaveFile', 'true');
      if (this.presetForcedCore || this._forcedCore) params.set('forcedCore', (this.presetForcedCore || this._forcedCore)!);
      const qs = params.toString();
      window.location.replace('/Emulator' + (qs ? '?' + qs : ''));
      return;
    }
  }

  async onRomSelected(file: FileEntry) {
    if (!file.id || !file.fileName) {
      this.status = 'Invalid file selection';
      this.parentRef?.showNotification('Selected file is missing information.');
      this.cdr.detectChanges();
      return;
    }
    this.presetRomId = file.id;
    this.presetRomName = file.fileName;

    if (this.isAmbiguousFile(file.fileName)) {
      this.systemCandidates = this.getSystemCandidatesForFile(file.fileName);
      this.selectedSystemCore = undefined;
      this._forcedCore = undefined;

      // 1) Check DB-persisted system override (from rom_system_overrides via romMetadata.actualSystem)
      const dbOverride = file.romMetadata?.actualSystem;
      if (dbOverride) {
        this.selectedSystemCore = dbOverride;
        this._forcedCore = dbOverride;
      }

      // Determine extension once
      const ext = this.fileService.getFileExtension(file.fileName);
      if (!this.selectedSystemCore && this.fileService.getAmbiguousRomExtensions().includes(ext) && !dbOverride) {
        this._pendingFileToLoad = { fileName: file.fileName, fileId: file.id, directory: file.directory };
        this.isSystemSelectPanelOpen = true;
        this.parentRef?.showOverlay();
      } else {
        // 2) Fall back to localStorage per-extension preference (non-zip or DB-overridden)
        if (!this.selectedSystemCore) {
          const preferred = this.loadPreferredCore(ext);
          if (preferred) {
            this.selectedSystemCore = preferred;
            this._forcedCore = preferred;
          }
        }

        // 3) If still no selection, show the system selection panel
        if (!this.selectedSystemCore) {
          this._pendingFileToLoad = { fileName: file.fileName, fileId: file.id, directory: file.directory };
          this.isSystemSelectPanelOpen = true;
          this.parentRef?.showOverlay();
        }
      }

      this.cdr.detectChanges();
      if (!this.selectedSystemCore) {
        return;
      }
    } 
    this.presetForcedCore = this.selectedSystemCore;
    try {
      await this.loadRomThroughService(file.fileName, file.id, this.selectedSystemCore ?? undefined);
      this.status = 'Running';
    } catch (err) {
      this.status = 'Error loading emulator';
      console.error(err);
    } finally {
      this.cdr.detectChanges();
    }
  }

  onSystemSelectChange(ev: Event) {
    const val = (ev.target as HTMLSelectElement).value as Core;
    this.selectedSystemCore = val || null;
  }

  private async loadRomThroughService(fileName: string, fileId?: number, forcedCore?: Core | null | undefined) {
    // Use the instance-level forced core as a fallback
    const effectiveForcedCore = forcedCore ?? this._forcedCore;
    if (effectiveForcedCore) {
      this._forcedCore = effectiveForcedCore;
    }
    if (fileId != null && effectiveForcedCore) {
      (async () => {
        try {
          const db = await this.romService.getSystemOverride(fileId);
          if (!db) {
            await this.romService.setSystemOverride(fileId, effectiveForcedCore);
          }
        } catch (e) {
          console.error('Failed to persist system override', e);
        }
      })();
    }

    if (window.__ejsLoaderInjected) {
      const reloadParams: Record<string, string> = {};
      if (fileName) reloadParams['romname'] = fileName;
      if (fileId != null) reloadParams['romId'] = String(fileId);
      if (effectiveForcedCore) reloadParams['forcedCore'] = effectiveForcedCore;
      this.fullReloadToEmulator(Object.keys(reloadParams).length ? reloadParams : undefined);
      return;
    }

    this.startLoading();
    this.gameLoadDate = new Date();
    this.isSearchVisible = false;
    this.status = "Loading Rom - " + this.fileService.getFileWithoutExtension(fileName);
    this.cdr.detectChanges();

    // 1) Fetch ROM via your existing API
    const romBlobOrArray = await this.romService.getRomFile(
      fileName, this.parentRef?.user?.id, fileId,
      (loaded, total) => {
        this.displayRomUploadOrDownloadProgress(total, loaded, false);
        this.cdr.detectChanges();
      }
    );

    // 2) Normalize to Blob
    let romBlob: Blob;
    if (romBlobOrArray instanceof Blob) {
      romBlob = romBlobOrArray;
    } else {
      this.stopLoading();
      this.setTmpStatus("Could not retrieve the ROM file.");
      throw new Error('getRomFile errored: expected Blob response');
    }

    // 3) Create a blob: URL and remember it for cleanup
    if (this.romObjectUrl) {
      URL.revokeObjectURL(this.romObjectUrl);
    }
    this.romObjectUrl = URL.createObjectURL(romBlob);
    this.romName = fileName;

    // 4) Try to load existing save state from database (unless explicitly skipped)
    const saveStateBlob =
      (this.skipSaveFileRequested || this.loadWithoutSave)
        ? null
        : await this.loadSaveStateFromDB(fileName);

    // 5) Configure EmulatorJS globals BEFORE adding loader.js
    const core = this.detectCoreEnhanced(fileName, effectiveForcedCore);
    if (!effectiveForcedCore && core && fileId) {
      await this.romService.setSystemOverride(fileId, core);
    }
    (this as any).currentCore = core;
    console.log(`%c[EMU] Detected core "${core}" for file "${fileName}" (ext: "${this.fileService.getFileExtension(fileName)}") forcedCore=${effectiveForcedCore ?? 'none'}`, 'color:#4af');
    const renderClamp = this.getRenderClampForCore(core);
    (window as any).EJS_renderClamp = renderClamp;
    window.EJS_core = core;
    window.EJS_controlScheme = this.ejsControlSchemeForCore(core);
    this.system = this.systemFromCore(core);

    const romDisplayName = this.fileService.getFileWithoutExtension(fileName); // e.g., "Ultimate MK3 (USA)"
    this.applyGamepadControlSettings(romDisplayName, core, this.system);

    if (this.heavyCores.has(core)) {
      this.autosaveIntervalTime = 10 * 60 * 1000; // 10 minutes
      //console.log(`[EMU] Detected core "${core}", setting autosave interval to 10 minutes to reduce upload frequency for large save files.`);
    } else {
      this.autosaveIntervalTime = 3 * 60 * 1000; // default 3 minutes
    }

    // Optional callbacks (ok to keep)
    window.EJS_onSaveState = (state: Uint8Array) => this.onSaveState(state);
    window.EJS_onLoadState = async () => {
      try {
        if (!this.parentRef?.user?.id || !this.romName) return;
        // Reuse your existing service to fetch latest server state
        const blob = await this.loadSaveStateFromDB(this.romName);
        if (!blob) { console.warn('[EMU] No cloud save found to load'); return; }

        const u8 = new Uint8Array(await blob.arrayBuffer());
        const { useEjs, useMgr } = await this.waitForLoadApis(4000);
        if (useEjs) return useEjs(u8);
        if (useMgr) return useMgr(u8);
        console.warn('[EMU] No load API available on load button press');
      } catch (e) {
        console.warn('[EMU] onLoadState fetch/apply failed', e);
      }
    };
    this.applyEjsRunOptions(this.system, core);
    // If the build calls back with the instance, capture it early

    window.EJS_ready = (api: any) => {
      try {
        (window as any).EJS_DEBUG_XX = false;
        (window as any).EJS_EXPERIMENTAL_NETPLAY = true;
        this._ejsReady = true;
        this.scanAndTagVpadControls();
        this.emulatorInstance = api || window.EJS || window.EJS_emulator || this.emulatorInstance;

        this.applyPSPPerformanceTweak();

        // Moment you captured save function originally
        if (this.emulatorInstance?.saveState) {
          this._saveFn = async () => {
            try { await (this.emulatorInstance as any).saveState(); } catch { }
          };
        }

        this.ensureSaveStatePolyfill();
      } catch {
        console.warn('[EMU] EJS_ready callback failed');
      }

      try { this.onEmulatorReadyForSizing(); } catch { console.warn('[EMU] onEmulatorReadyForSizing failed'); }
    }; 

    // Ensure menu is closed when the emulator starts
    this.isMenuPanelOpen = false;
    this.parentRef?.closeOverlay();

    // 7) Clear existing game container
    const gameContainer = document.getElementById('game');
    if (gameContainer) {
      gameContainer.innerHTML = '';
    }
    this.installRuntimeTrackers();
    this.hideEJSMenu();

    // 8) Inject loader.js (it will initialize EmulatorJS)
    if (!window.__ejsLoaderInjected) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/assets/emulatorjs/data/loader.js';
        s.async = false;
        s.defer = false;
        s.setAttribute('data-ejs-loader', '1');
        s.onload = () => {
          try { (window as any).__ejsLoaderInjected = true; } catch { }
          requestAnimationFrame(() => {
            this.setGameScreenHeight();
            requestAnimationFrame(async () => {
              await this.waitForEmulatorAndFocus();
              await this.probeForSaveApi();
              this.tryBindSaveFromUI();
              this.scanAndTagVpadControls();

              try {
                const ok = await this.applySaveStateIfAvailable(saveStateBlob);
              } catch {
                console.warn('[EMU] Unable to apply save state on startup');
              }
              this.lockGameHostHeight();
            });
          });
          resolve();
        };
        s.onerror = (ev) => {
          console.error('Failed to load /assets/emulatorjs/data/loader.js', ev);
          reject(new Error('Failed to load EmulatorJS loader.js'));
        };
        document.body.appendChild(s);
      });
    } else {
      this.stopLoading();
      this.fullReloadToEmulator();
      return;
    }

    // Start autosave loop and upload any pending saves (best-effort)
    try { this.setupAutosave(); } catch { console.error('Failed to set up autosave'); }
    try { this.uploadPendingSavesOnStartup(); } catch { console.error('Failed to upload pending saves on startup'); }

    this.status = 'Running';
    this.stopLoading();
    this.cdr.detectChanges();
  }

  private applyGamepadControlSettings(romDisplayName: string, core: string, system: System | undefined) {
    // Enable six-button layout for Genesis and Saturn on mobile
    const genesisSix = this.shouldUseGenesisSixButtons(romDisplayName, system);

    const vpad = this.buildTouchLayout((system ?? ('gba' as System)), {
      useJoystick: this.useJoystick,
      showControls: this.showControls,
      twoButtonMode: (system === 'nes' || system === 'gb' || system === 'gbc'),
      segaShowLR: false, // keep false to avoid L/R "pills"
      genesisSix: genesisSix, // ⟵ pass the decision in
    });

    const speedButtons: VPadItem[] = [
      {
        type: 'button',
        id: 'speed_fast',
        text: 'Fast',
        location: 'left',
        left: 0, // px from the left edge of the left column
        top: 200, // push down; increase if you need them lower on tall screens
        fontSize: 13, // smaller text
        block: false, // pill-less small button
        input_value: 27
      },
      {
        type: 'button',
        id: 'speed_slow',
        text: 'Slow',
        location: 'left',
        left: 42, // sits next to Fast (≈ 50–60px spacing)
        top: 200,
        fontSize: 13,
        block: false,
        input_value: 29
      },
    ];

    window.EJS_VirtualGamepadSettings = vpad.concat(speedButtons);

    // Safety assert (keeps you from silently falling back)
    for (const it of window.EJS_VirtualGamepadSettings) {
      if (it.type === 'button') {
        if (!('id' in it)) throw new Error(`Missing id on button "${it.text}"`);
        if (typeof (it as any).input_value === 'undefined') throw new Error(`Missing input_value on button "${it.text}"`);
      } else if ((it.type === 'dpad' || it.type === 'zone') && !it.inputValues) {
        throw new Error(`${it.type} missing inputValues`);
      }
    }
    console.log('%c[EMU] assigning custom VirtualGamepadSettings ✔', 'color:#4f4', window.EJS_VirtualGamepadSettings,);
  }

  private hideEJSMenu() {
    (window as any).EJS_Buttons = {
      playPause: true,
      restart: false,
      mute: true,
      settings: true,
      fullscreen: false,
      saveState: false,
      loadState: false,
      screenRecord: false,
      gamepad: !this.onMobile(),
      cheat: true,
      volume: false,
      quickSave: true,
      quickLoad: true,
      screenshot: true,
      netplay: true,
    };
  }

  private async waitForGameManager(maxMs = 5000) {
    const start = performance.now();
    while (performance.now() - start < maxMs) {
      const gm =
        this.emulatorInstance?.gameManager
        || ((window as any).EJS_emulator || (window as any).EJS)?.gameManager
        || (window as any).EJS_GameManager;
      if (gm) return gm;
      await new Promise(r => setTimeout(r, 100));
    }
    return null;
  }

  private getBiosUrlForCore(core: Core): string | undefined {
    switch (core) {
      // PlayStation (common BIOS used by many PS1 cores)
      case 'mednafen_psx_hw':
      case 'pcsx_rearmed':
      case 'duckstation':
      case 'mednafen_psx':
        return '/assets/emulatorjs/data/cores/PSX.zip';

      // Nintendo DS firmware
      case 'melonds':
      case 'nds':
        return '/assets/emulatorjs/data/cores/dsbios.zip';

      case 'desmume':
      case 'desmume2015':
        return '/assets/emulatorjs/data/cores/DESMUME.zip';

      // SNES (Snes9x)
      case 'snes9x':
        return '/assets/emulatorjs/data/cores/Snes9x.zip';

      // Dreamcast (Flycast)
      case 'flycast':
      case 'dreamcast':
        return '/assets/emulatorjs/data/cores/FLYCAST.zip';

      // Dreamcast (Naomi)
      case 'naomi':
        return '/assets/emulatorjs/data/cores/NAOMI.zip';

      // Atari 7800 (ProSystem)
      case 'prosystem':
        return '/assets/emulatorjs/data/cores/PROSYSTEM.zip';

      // 3DO (Opera core)
      case 'opera':
      case '3do':
        return '/assets/emulatorjs/data/cores/3DO.zip';

      // Sega Mega Drive / Genesis (BlastEm pack)
      case 'genesis_plus_gx':
      case 'genesis':
      case 'megadrive':
      case 'blastem':
        return '/assets/emulatorjs/data/cores/BLASTEM.zip';

      // PlayStation 2 (LR-PCSX2 / PS2 pack)
      case 'pcsx2':
      case 'ps2':
      case 'lrps2':
        return '/assets/emulatorjs/data/cores/LRPS2.zip';

      // GameCube / Wii (Dolphin)
      case 'dolphin':
      case 'gamecube':
      case 'gc':
      case 'wii':
        return '/assets/emulatorjs/data/cores/DOLPHIN.zip';

      // Game Boy Advance (mGBA)
      case 'mgba':
      case 'gba':
      case 'gbc':
      case 'gbx':
      case 'gb':
        return '/assets/emulatorjs/data/cores/MGBA.zip';

      // Sony PSP
      case 'psp':
      case 'ppsspp':
        return '/assets/emulatorjs/data/cores/PPSSPP.zip';

      case 'yabause':
      case 'segaSaturn':
      case 'sega_saturn':
        // Point to the BIOS you added in step 1
        return '/assets/emulatorjs/data/cores/saturn_bios.bin';

      // NeoGeo / arcade BIOS packs (only for specific ROM sets)
      case 'fbneo':
      case 'mame2003_plus':
        return undefined;

      case 'dosbox': 
        return '/assets/emulatorjs/data/cores/DOSBOX.zip';

      // By default, do not supply a BIOS URL — caller will treat undefined as "no BIOS".
      default:
        return undefined;
    }
  }


  private applyEjsRunOptions(system: System, core: Core): void {

    window.EJS_player = "#game";

    // ❗ BIOS: set ONLY if required by the selected core; otherwise blank
    window.EJS_biosUrl = this.getBiosUrlForCore(core) ?? "";
    window.EJS_softLoad = false;
    window.EJS_gameUrl = this.romObjectUrl;
    const _ejs_gameKey = `${core}:${this.fileService.getFileWithoutExtension(this.romName ?? '')}`;
    window.EJS_gameID = this.stableStringToIntId(_ejs_gameKey);
    window.EJS_gameIDKey = _ejs_gameKey; // string key kept for debugging
    window.EJS_gameName = this.fileService.getFileWithoutExtension(this.romName ?? '');
    window.EJS_netplayServer = window.location.origin;
    window.EJS_netplayUrl = window.EJS_netplayServer;
    window.EJS_netplayICEServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.nextcloud.com:3478' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
    ];

    // Minimal (STUN-only; for dev)
    window.EJS_iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.nextcloud.com:3478' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
    ];

    // Or full config — many builds also honor this:
    window.EJS_webrtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: ['turns:turn.example.com:5349', 'turn:turn.example.com:3478'],
          username: 'netplay-user',
          credential: 'a-very-strong-password'
        },
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun.nextcloud.com:3478' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
      ],
    };

    window.EJS_startOnLoaded = true;
    window.EJS_volume = 0.5;
    window.EJS_lightgun = false;
    window.__EJS_ALIVE__ = true;
    const rootStyle = getComputedStyle(document.documentElement);
    const componentBackgroundColor = (rootStyle.getPropertyValue('--component-background-color') || '#3a3a3a').trim();
    let systemIcon: string | undefined =
      this.fileSearchComponent?.getSystemIconUrl(this.romName ?? '', core) ?? undefined;
    if (!systemIcon) {
      // Last resort: try extension-based lookup from the rom filename itself
      systemIcon = this.fileSearchComponent?.getSystemIconUrl(this.romName ?? '') ?? undefined;
    }
    const w = window as any;
    w.EJS_defaultOptionsForce = false;  // force defaults every run  (docs: config system)
    w.EJS_directKeyboardInput = true;   // deliver raw key events to the core
    w.EJS_enableGamepads = true;        // let cores read the gamepad state
    w.EJS_disableAltKey = true;         // avoid Alt being swallowed by browser/UI
    w.EJS_fullscreenOnLoad = false;     // start in-window, let user choose fullscreen (bad option, to delete)
    w.EJS_fullscreenOnLoaded = false;   // start in-window, let user choose fullscreen
    w.EJS_fullscreen = false;           // start in-window, let user choose fullscreen (legacy option)
    const canUseThreads = this.canUseThreads(core, system);
    w.EJS_threads = canUseThreads;               // allow cores to use threads if they want (e.g. for async save state capture); you can disable if you have issues with certain browsers/devices
    w.EJS_color = componentBackgroundColor;        // Sets the main color theme for the emulator
    w.EJS_backgroundColor = componentBackgroundColor; // Sets the background color for the emulator    
    if (systemIcon) {
      w.EJS_backgroundImage = systemIcon;
    }
    if (core === "psp" || core == "ppsspp") {
      this.applyPSPCoreSettings(w); // force our perf defaults over any saved prefs
    }
    if (core === 'mupen64plus_next' || system === 'n64') {
      this.applyN64CoreSettings(w);
    } 
    // if (this.onMobile() && (core === 'melonds' || core === 'nds' || core === 'desmume' || core === 'desmume2015')) {
    //   this.applyNDSCoreSettingsForMobile(w);
    // } 
    const isDPADCentric = (system && (['nes', 'snes', 'gb', 'gbc', 'gba', 'genesis', 'saturn', 'sega_cd', '3do', 'nds'] as string[]).includes(system)) || core === 'yabause';
    const isLeftAndRightJoystickInverted = (system && ['n64'].includes(system));
    const rightStickValues = {
      "UP":
        isDPADCentric
          ? 'DPAD_UP'
          : isLeftAndRightJoystickInverted
            ? 'LEFT_STICK_Y:-1'
            : 'RIGHT_STICK_Y:-1',
      "DOWN":
        isDPADCentric
          ? 'DPAD_DOWN'
          : isLeftAndRightJoystickInverted
            ? 'LEFT_STICK_Y:+1'
            : 'RIGHT_STICK_Y:+1',
      "LEFT":
        isDPADCentric
          ? 'DPAD_LEFT'
          : isLeftAndRightJoystickInverted
            ? 'LEFT_STICK_X:-1'
            : 'RIGHT_STICK_X:-1',
      "RIGHT":
        isDPADCentric
          ? 'DPAD_RIGHT'
          : isLeftAndRightJoystickInverted
            ? 'LEFT_STICK_X:+1'
            : 'RIGHT_STICK_X:+1'
    };

    const leftStickValues = {
      "UP":
        isDPADCentric
          ? 'DPAD_UP'
          : isLeftAndRightJoystickInverted
            ? 'RIGHT_STICK_Y:-1'
            : 'LEFT_STICK_Y:-1',
      "DOWN":
        isDPADCentric
          ? 'DPAD_DOWN'
          : isLeftAndRightJoystickInverted
            ? 'RIGHT_STICK_Y:+1'
            : 'LEFT_STICK_Y:+1',
      "LEFT":
        isDPADCentric
          ? 'DPAD_LEFT'
          : isLeftAndRightJoystickInverted
            ? 'RIGHT_STICK_X:-1'
            : 'LEFT_STICK_X:-1',
      "RIGHT":
        isDPADCentric
          ? 'DPAD_RIGHT'
          : isLeftAndRightJoystickInverted
            ? 'RIGHT_STICK_X:+1'
            : 'LEFT_STICK_X:+1'
    };

    console.log(`%c[EMU] Configuring controls for system="${system}" core="${core}" isDPADCentric=${isDPADCentric} isLeftAndRightJoystickInverted=${isLeftAndRightJoystickInverted}`, 'color: orange; font-weight: bold;', { rightStickValues, leftStickValues });

    const gpOnly: Record<number, unknown> = {
      0: { value: '', value2: 'BUTTON_1' },
      1: { value: '', value2: 'BUTTON_3' },
      2: { value: '', value2: 'SELECT' },
      3: { value: '', value2: 'START' },
      4: { value: '', value2: leftStickValues["UP"] },
      5: { value: '', value2: leftStickValues["DOWN"] },
      6: { value: '', value2: leftStickValues["LEFT"] },
      7: { value: '', value2: leftStickValues["RIGHT"] },
      8: { value: '', value2: 'BUTTON_2' },
      9: { value: '', value2: 'BUTTON_4' },
      10: { value: '', value2: 'LEFT_TOP_SHOULDER' },
      11: { value: '', value2: 'RIGHT_TOP_SHOULDER' },
      12: { value: '', value2: 'LEFT_BOTTOM_SHOULDER' },
      13: { value: '', value2: 'RIGHT_BOTTOM_SHOULDER' },
      14: { value: '', value2: 'LEFT_STICK' },
      15: { value: '', value2: 'RIGHT_STICK' },
      16: { value: '', value2: rightStickValues["RIGHT"] },
      17: { value: '', value2: rightStickValues["LEFT"] },
      18: { value: '', value2: rightStickValues["DOWN"] },
      19: { value: '', value2: rightStickValues["UP"] },
      20: { value: '', value2: 'DPAD_RIGHT' },
      21: { value: '', value2: 'DPAD_LEFT' },
      22: { value: '', value2: 'DPAD_UP' },
      23: { value: '', value2: 'DPAD_DOWN' },
      24: {}, 25: {}, 26: {}, 27: {}, 28: {}, 29: {},
    } as Record<number, unknown>;
    w.EJS_defaultControls = {
      0: {
        0: { value: 'x', value2: 'BUTTON_1' },
        1: { value: 's', value2: 'BUTTON_3' },
        2: { value: 'v', value2: 'SELECT' },
        3: { value: 'enter', value2: 'START' },
        4: { value: 'up arrow', value2: leftStickValues["UP"] },
        5: { value: 'down arrow', value2: leftStickValues["DOWN"] },
        6: { value: 'left arrow', value2: leftStickValues["LEFT"] },
        7: { value: 'right arrow', value2: leftStickValues["RIGHT"] },
        8: { value: 'z', value2: 'BUTTON_2' },
        9: { value: 'a', value2: 'BUTTON_4' },
        10: { value: 'q', value2: 'LEFT_TOP_SHOULDER' },
        11: { value: 'e', value2: 'RIGHT_TOP_SHOULDER' },
        12: { value: 'tab', value2: 'LEFT_BOTTOM_SHOULDER' },
        13: { value: 'r', value2: 'RIGHT_BOTTOM_SHOULDER' },
        14: { value: '', value2: 'LEFT_STICK' },
        15: { value: '', value2: 'RIGHT_STICK' },
        16: { value: 'h', value2: rightStickValues["RIGHT"] },
        17: { value: 'f', value2: rightStickValues["LEFT"] },
        18: { value: 'g', value2: rightStickValues["DOWN"] },
        19: { value: 't', value2: rightStickValues["UP"] },
        20: { value: 'l', value2: 'DPAD_RIGHT' },
        21: { value: 'j', value2: 'DPAD_LEFT' },
        22: { value: 'k', value2: 'DPAD_UP' },
        23: { value: 'i', value2: 'DPAD_DOWN' },
        24: { value: '1' }, 25: { value: '2' }, 26: { value: '3' },
        27: {}, 28: {}, 29: {},
      },
      1: { ...gpOnly },
      2: { ...gpOnly },
      3: { ...gpOnly },
    };
    w.EJS_logCoreInfo = false;          // debug options 
    w.EJS_logVideo = false;             // debug options 
    w.EJS_logAudio = false;             // debug options 
    w.EJS_logInput = false;             // debug options 
    w.EJS_logSaves = false;             // debug options  
    w.EJS_paths = {
      bios: '/assets/emulatorjs/data/cores/',
      system: '/assets/emulatorjs/data/cores/',
    };
    w.EJS_pathtodata = '/assets/emulatorjs/data/';

    w.EJS_afterStart = () => {
      try {
        const gameEl = document.getElementById('game');
        const canvas = gameEl?.querySelector('canvas') as HTMLElement | null;
        (canvas ?? gameEl)?.setAttribute?.('tabindex', '0');
        (canvas ?? gameEl)?.focus?.();
      } catch { }
    };
  }

  private async ensureSaveStatePolyfill() {
    const w = window as any;
    if (typeof w.EJS_saveState === 'function') return;

    const gm = await this.waitForGameManager(15000);
    if (!gm) {
      console.warn('[EMU] No gameManager found; cannot polyfill EJS_saveState');
      return;
    }

    const mod = gm.Module;
    if (mod && typeof mod.cwrap === 'function' && typeof mod.EmulatorJSGetState !== 'function') {
      try {
        const saveStateInfoFn = mod.cwrap('save_state_info', 'string', []);
        gm.getState = function () {
          const state = saveStateInfoFn().split('|');
          if (state[2] !== '1') {
            console.error(state[0]);
            throw new Error(state[0]);
          }
          const size = parseInt(state[0]);
          const dataStart = parseInt(state[1]);
          const data = mod.HEAPU8.subarray(dataStart, dataStart + size);
          return new Uint8Array(data);
        };
        // console.log('[EMU] Patched gameManager.getState() → save_state_info cwrap (old-core compat)');
      } catch (e) {
        console.warn('[EMU] Failed to patch getState():', e);
      }
    }

    if (typeof gm.getState === 'function') {
      w.EJS_saveState = async (): Promise<Uint8Array> => {
        const mgr = this.emulatorInstance?.gameManager
          || ((window as any).EJS_emulator || (window as any).EJS)?.gameManager
          || (window as any).EJS_GameManager
          || gm;
        const bytes = await Promise.resolve(mgr.getState());
        return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBufferLike);
      };
      // console.log('[EMU] Polyfilled EJS_saveState via gameManager.getState()');
    } else {
      console.warn('[EMU] No gameManager.getState() found; cannot polyfill EJS_saveState');
    }
  }

  private async loadSaveStateFromDB(romFileName: string): Promise<Blob | null> {
    if (!this.parentRef?.user?.id) {
      console.log('User not logged in; skipping load state from DB');
      return null;
    }
    try {
      const response = await this.romService.getEmulatorJSSaveState(romFileName, this.parentRef.user.id);
      if (response instanceof Blob && response.size > 0) {
        return response;
      }
    } catch (err) {
      console.log('No existing save state found');
    }
    return null;
  }

  private async onSaveState(raw: any) {
    console.debug('[EMU DEBUG] onSaveState called', { raw });
    if (this._exiting) { console.debug('[EMU DEBUG] onSaveState: exiting, abort'); return; }
    const tmpStatus = this.status;
    this.status = 'Saving State. Please wait...';

    if (this._captureSaveResolve) {
      console.debug('[EMU DEBUG] onSaveState: _captureSaveResolve branch');
      try {
        const cap = await this.normalizeSavePayload(raw);
        console.debug('[EMU DEBUG] onSaveState: normalized payload for capture', { cap });
        this._captureSaveResolve(cap || null);
      } catch { try { this._captureSaveResolve(null); } catch { } }
      this._captureSaveResolve = undefined;
      return;
    }
    const now = Date.now();
    // If a save is already in progress, skip duplicate uploads
    if (this._saveInProgress) {
      console.debug('[EMU DEBUG] onSaveState: save already in progress, skipping');
      //console.log('[EMU] onSaveState: save already in progress; skipping');
      if (this._pendingSaveResolve) { try { this._pendingSaveResolve(true); } catch { } this._pendingSaveResolve = undefined; }
      return;
    }
    // Rate-limit saves to once per 10s
    if (!this._destroyed && now - this._lastSaveTime < 10000) {
      console.debug('[EMU DEBUG] onSaveState: recent save detected (<10s), skipping');
      //console.log('[EMU] onSaveState: recent save detected (<10s); skipping upload');
      if (this._pendingSaveResolve) { try { this._pendingSaveResolve(true); } catch { } this._pendingSaveResolve = undefined; }
      return;
    }
    const gameID = (window as any).EJS_gameIDKey || String((window as any).EJS_gameID ?? '');
    const gameName = (window as any).EJS_gameName
      || (this.romName ? this.fileService.getFileWithoutExtension(this.romName) : '');

    if (!this.parentRef?.user?.id || !this.romName) return;

    // 1) Try to normalize whatever the callback passed
    let u8: Uint8Array | null = await this.normalizeSavePayload(raw);
    console.debug('[EMU DEBUG] onSaveState: after normalizeSavePayload', { u8 });
    const core = (window as any).EJS_core || '';
    if (u8 && !this.isValidSaveState(u8, core)) {
      console.debug('[EMU DEBUG] onSaveState: save state invalid, not uploading', { u8, core });
      this.status = 'Save state invalid – not uploading';
      setTimeout(() => {
        this.status = tmpStatus;
        this.cdr.detectChanges();
      }, 4000);
      this.parentRef?.showNotification('Save state data appears invalid; upload skipped.');
      this.cdr.detectChanges();
      return;
    }
    // 2) If callback gave no bytes, try localStorage
    if (!u8 || u8.length === 0) {
      console.debug('[EMU DEBUG] onSaveState: trying localStorage fallback');
      u8 = this.tryReadSaveFromLocalStorage(gameID, gameName);
      console.debug('[EMU DEBUG] onSaveState: after tryReadSaveFromLocalStorage', { u8 });
    }

    // 3) If still nothing, try IndexedDB (localforage/known DBs)
    if (!u8 || u8.length === 0) {
      console.debug('[EMU DEBUG] onSaveState: trying IndexedDB fallback');
      u8 = await this.tryReadSaveFromIndexedDB(gameID, gameName);
      console.debug('[EMU DEBUG] onSaveState: after tryReadSaveFromIndexedDB', { u8 });
    }
    this.status = "State Captured. Uploading files to server. Please wait...";
    this.cdr.detectChanges();
    // 4) If still nothing, bail gracefully (avoid TypeError in romService)
    if (!u8 || u8.length === 0) {
      console.warn('[EMU DEBUG] Save callback had no bytes and no storage fallback found; skipping upload.');
      if (this._pendingSaveResolve) { try { this._pendingSaveResolve(false); } catch { } this._pendingSaveResolve = undefined; }
      this.status = tmpStatus;
      return;
    }

    this._saveInProgress = true;
    try {
      console.debug('[EMU DEBUG] onSaveState: calling uploadSaveBytes', { u8 });
      // capture as "in-flight" but route through uploadSaveBytes to dedupe
      await this.trackInFlight((async () => {
        const ok = await this.uploadSaveBytes(u8);
        console.debug('[EMU DEBUG] onSaveState: uploadSaveBytes result', { ok });
        if (ok) {
          if (this._pendingSaveResolve) { try { this._pendingSaveResolve(true); } catch { } this._pendingSaveResolve = undefined; }
          return true;
        } else {
          if (this._pendingSaveResolve) { try { this._pendingSaveResolve(false); } catch { } this._pendingSaveResolve = undefined; }
          return false;
        }
      })());
    } catch (err) {
      const mb = (u8.length / 1024 / 1024).toFixed(2);
      console.error(`Failed to save state (MB=${mb}):`, err);
      if (this._pendingSaveResolve) { try { this._pendingSaveResolve(false); } catch { } this._pendingSaveResolve = undefined; }
    } finally {
      this._saveInProgress = false;
      this.status = tmpStatus;
    }
  }

  private async postSaveCaptureAndUpload(): Promise<boolean> {
    console.debug('[EMU DEBUG] postSaveCaptureAndUpload called');
    try {
      const w = window as any;

      const gm = await this.waitForGameManager(5000);

      // Prefer EJS_saveState if present (native or polyfilled — it has
      // its own internal retry logic for the "not a function" error).
      if (typeof w.EJS_saveState === 'function') {
        console.debug('[EMU DEBUG] postSaveCaptureAndUpload: using EJS_saveState');
        const u8: Uint8Array = await w.EJS_saveState();
        if (u8 && u8.length > 0) {
          console.debug('[EMU DEBUG] postSaveCaptureAndUpload: got bytes from EJS_saveState', { u8 });
          await this.uploadSaveBytes(u8);
          return true;
        }
        return false;
      }

      // Fallback: try the GameManager directly (with catch for unready core)
      if (gm && typeof gm.getState === 'function') {
        console.debug('[EMU DEBUG] postSaveCaptureAndUpload: using gm.getState');
        try {
          const raw = await Promise.resolve(gm.getState());
          const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBufferLike);
          if (u8 && u8.length > 0) {
            console.debug('[EMU DEBUG] postSaveCaptureAndUpload: got bytes from gm.getState', { u8 });
            await this.uploadSaveBytes(u8);
            return true;
          }
        } catch (innerErr: any) {
          console.warn('[EMU] postSaveCaptureAndUpload: getState() not ready:', innerErr?.message || innerErr);
        }
      }
    } catch (e) {
      console.warn('[EMU] postSaveCaptureAndUpload failed', e);
    }
    return false;
  }

  async callEjsSave(): Promise<boolean> {
    console.debug('[EMU DEBUG] callEjsSave called');
    this.tempHideEjsMenu(5000);
    this.startLoading();
    try {
      const w = window as any;

      // 1) Best path: bytes immediately via polyfilled EJS_saveState
      if (typeof w.EJS_saveState === 'function') {
        console.debug('[EMU DEBUG] callEjsSave: using EJS_saveState');
        const bytes: Uint8Array = await w.EJS_saveState();
        if (bytes && bytes.length > 0) {
          console.debug('[EMU DEBUG] callEjsSave: got bytes from EJS_saveState', { bytes });
          await this.uploadSaveBytes(bytes);
          return true;
        }
      }

      // 2) Fallbacks: trigger any save the build exposes…
      if (this._saveFn) {
        console.debug('[EMU DEBUG] callEjsSave: using _saveFn');
        await this._saveFn();
        const result = await this.postSaveCaptureAndUpload();
        console.debug('[EMU DEBUG] callEjsSave: postSaveCaptureAndUpload result', { result });
        return result;
      }

      if (this.emulatorInstance?.saveState) {
        console.debug('[EMU DEBUG] callEjsSave: using emulatorInstance.saveState');
        await this.emulatorInstance.saveState();
        const result = await this.postSaveCaptureAndUpload();
        console.debug('[EMU DEBUG] callEjsSave: postSaveCaptureAndUpload result', { result });
        return result;
      }

      const player = w.EJS_player;
      if (player) {
        console.debug('[EMU DEBUG] callEjsSave: using EJS_player.saveState');
        const el = typeof player === 'string' ? document.querySelector(player) : player;
        if (el && typeof (el as any).saveState === 'function') {
          await (el as any).saveState();
          const result = await this.postSaveCaptureAndUpload();
          console.debug('[EMU DEBUG] callEjsSave: postSaveCaptureAndUpload result', { result });
          return result;
        }
      }

      console.warn('[EMU DEBUG] No known save API found for EmulatorJS; save skipped');
      return false;
    } catch (e) {
      console.warn('callEjsSave failed', e);
      this.parentRef?.showNotification('Error during save; please try again later.');
      return false;
    } finally {
      this.stopLoading();
    }
  }

  private async uploadSaveBytes(u8: Uint8Array) {
    console.debug('[EMU DEBUG] uploadSaveBytes called', { u8 });
    const core = (window as any).EJS_core || '';
    if (!this.isValidSaveState(u8, core)) {
      console.debug('[EMU DEBUG] uploadSaveBytes: invalid save state', { u8, core });
      console.error('[EMU] Refusing to upload invalid save state');
      this.parentRef?.showNotification('Save state data appears invalid; upload skipped.');
      return false;
    }
    if (!u8?.length) {
      console.debug('[EMU DEBUG] uploadSaveBytes: no bytes to upload');
      console.warn('[EMU] uploadSaveBytes: no bytes to upload; skipping');
      this.setTmpStatus("No save data captured; upload skipped.");
      return false;
    }
    if (!this.parentRef?.user?.id) {
      console.debug('[EMU DEBUG] uploadSaveBytes: no user');
      console.warn('[EMU] uploadSaveBytes: no user; skipping upload');
      this.setTmpStatus("User not logged in; upload skipped.");
      this.openLoginPanel();
      return false;
    }
    if (!this.romName) {
      console.debug('[EMU DEBUG] uploadSaveBytes: no romName');
      console.warn('[EMU] uploadSaveBytes: no rom; skipping upload');
      this.setTmpStatus("ROM not identified; upload skipped.");
      return false;
    }
    this.status = 'Sending Data to Server...';
    if (this._inFlightSavePromise) {
      console.debug('[EMU DEBUG] uploadSaveBytes: _inFlightSavePromise already exists');
      try { return await this._inFlightSavePromise; } catch { return false; }
    }

    this._inFlightSavePromise = (async () => {
      this._saveInProgress = true;
      let ms = 0;
      let error = undefined;
      try {
        const res = await this.romService.saveEmulatorJSState(
          this.romName!, this.parentRef!.user!.id!, u8,
          (loaded, total) => {
            this.displayRomUploadOrDownloadProgress(total, loaded, true);
            this.cdr.detectChanges();
          }
        );
        if (res.ok) {
          this._lastSaveTime = Date.now();
          this.lastGoodSaveSize.set(this.romName!, u8.length);
          ms = res.body?.ms;
          try { this.setupAutosave(); } catch { }
          return true;
        } else {
          console.error('[EMU] Save upload failed:', res.errorText);
          this.setTmpStatus("Server rejected save upload; please try again.");
          if (!this.isMenuPanelOpen) {
            this.parentRef?.showNotification('Server rejected save upload; please try again.');
          }
          return false;
        }
      } catch (err) {
        console.error('[EMU] Save upload exception:', err);
        error = err;
        this.setTmpStatus("Error uploading save; please try again.", "Running");
        if (!this.isMenuPanelOpen) {
          this.parentRef?.showNotification('Error uploading save; please try again later.');
        }
        return false;
      } finally {
        this._saveInProgress = false;
        this._inFlightSavePromise = undefined;

        if (this.stopEmuSaving || this.isExitingAndReturningToEmulator) {
          this.fullReloadToEmulator();
        } else if (this.exitSaving) {
          this.navigateHome();
        } else if (!error) {
          this.setTmpStatus(`Save Complete! (took ${ms ? ms / 1000 + 's' : 'a moment'})`, "Running");
        }
      }
    })();

    return await this._inFlightSavePromise;
  }

  setTmpStatus(msg: string, resetString?: string) {
    const tmpStatus = this.status;
    this.status = msg;
    this.cdr.detectChanges();
    setTimeout(() => {
      this.status = resetString ?? tmpStatus;
      this.cdr.detectChanges();
    }, 4000);
  }

  setupAutosave() {
    try { this.clearAutosave(); } catch { }
    if (!this.autosave || !this.romName || !this.parentRef?.user?.id) return;

    const core = (window as any).EJS_core || '';
    const bootDelayMs = (core === 'melonds') ? 10_000 : 0;
    this.autosaveInterval = setInterval(() => {
      try {
        if (this._saveInProgress) return;
        const needed = Math.max(this.autosaveIntervalTime, 180000) + bootDelayMs;
        if (this.gameLoadDate && Date.now() - this.gameLoadDate.getTime() < needed) return;
        this.callEjsSave();
      } catch { }
    }, this.autosaveIntervalTime);
  }

  clearAutosave() {
    if (this.autosaveInterval) { clearInterval(this.autosaveInterval); this.autosaveInterval = undefined; }
    if (this._pendingSaveTimer) { clearTimeout(this._pendingSaveTimer); this._pendingSaveTimer = undefined; }
  }

  getAllowedFileTypes(): string[] {
    const set = new Set<string>();

    // Base ROM list from FileService
    try {
      (this.fileService.romFileExtensions || []).forEach(e => set.add((e || '').toString().trim().toLowerCase()));

      // Add system-specific groups (use getters where available)
      (this.fileService.getSegaFileExtensions() || []).forEach(e => set.add((e || '').toString().trim().toLowerCase()));
      (this.fileService.getGenesisFileExtensions ? this.fileService.getGenesisFileExtensions() : []).forEach(e => set.add((e || '').toString().trim().toLowerCase()));
      (this.fileService.getPs1FileExtensions ? this.fileService.getPs1FileExtensions() : []).forEach(e => set.add((e || '').toString().trim().toLowerCase()));
      (this.fileService.getPspFileExtensions ? this.fileService.getPspFileExtensions() : []).forEach(e => set.add((e || '').toString().trim().toLowerCase()));
      (this.fileService.getSaturnFileExtensions ? this.fileService.getSaturnFileExtensions() : []).forEach(e => set.add((e || '').toString().trim().toLowerCase()));
      (this.fileService.getNesFileExtensions ? this.fileService.getNesFileExtensions() : []).forEach(e => set.add((e || '').toString().trim().toLowerCase()));
      (this.fileService.getGbaFileExtensions ? this.fileService.getGbaFileExtensions() : []).forEach(e => set.add((e || '').toString().trim().toLowerCase()));
      (this.fileService.getNdsFileExtensions ? this.fileService.getNdsFileExtensions() : []).forEach(e => set.add((e || '').toString().trim().toLowerCase()));
      (this.fileService.getSnesFileExtensions ? this.fileService.getSnesFileExtensions() : []).forEach(e => set.add((e || '').toString().trim().toLowerCase()));
      (this.fileService.getN64FileExtensions ? this.fileService.getN64FileExtensions() : []).forEach(e => set.add((e || '').toString().trim().toLowerCase()));

      // Include a few common ambiguous/aux extensions that are useful for the emulator UI
      this.fileService.getAmbiguousRomExtensions().forEach(e => set.add(e));
    } catch (err) {
      console.error('Error building allowed file types list; falling back to hardcoded list', err);
      return [
        'gba', 'gbc', 'gb', 'nes', 'snes', 'sfc', 'n64', 'z64', 'v64', 'nds',
        'smd', 'gen', 'bin', '32x', 'gg', 'sms', 'md',
        'cue', 'iso', 'chd', 'pbp',
        'pce', 'ngp', 'ngc', 'ws', 'wsc', 'lnx',
        'col', 'a26', 'a78', 'jag',
        'adf', 'd64', 'exe', 'com', 'bat',
        'zip', '7z',
        'wad', 'ccd'
      ];
    }

    return Array.from(set.values());
  }

  getAllowedRomFileTypesString(): string {
    return this.getAllowedFileTypes().map(e => '.' + e.trim().toLowerCase()).join(',');
  }

  private getViewportHeightMinusHeader(pxHeader = 60): string {
    const vv = (window as any).visualViewport;
    const h = Math.round((vv?.height ?? window.innerHeight) - pxHeader);
    return `${h}px`;
  }


  /** Install wrappers so we can close audio & terminate workers on destroy. Idempotent. */
  private installRuntimeTrackers() {
    const w = window as any;

    // Track AudioContexts created by the emulator
    if (!w.__ejsTrackedAudio) {
      w.__ejsTrackedAudio = new Set<BaseAudioContext>();

      const AC = (w.AudioContext || w.webkitAudioContext);
      const OAC = w.OfflineAudioContext;

      if (AC && !w.__ejsPatchedAC) {
        const ACWrapped = function (...args: any[]) {
          const ctx = new (AC as any)(...args);
          try { w.__ejsTrackedAudio.add(ctx); } catch { /* ignore */ }
          return ctx;
        };
        ACWrapped.prototype = AC.prototype;
        w.AudioContext = ACWrapped;
        if (w.webkitAudioContext) w.webkitAudioContext = ACWrapped;
        w.__ejsPatchedAC = true;
      }

      if (OAC && !w.__ejsPatchedOAC) {
        const OACWrapped = function (...args: any[]) {
          const ctx = new (OAC as any)(...args);
          try { w.__ejsTrackedAudio.add(ctx); } catch { /* ignore */ }
          return ctx;
        };
        OACWrapped.prototype = OAC.prototype;
        w.OfflineAudioContext = OACWrapped;
        w.__ejsPatchedOAC = true;
      }
    }

    // Track Workers created by the emulator (main worker & pthreads)
    if (!w.__ejsTrackedWorkers) {
      w.__ejsTrackedWorkers = new Set<Worker | SharedWorker>();

      const OrigWorker = w.Worker;
      const OrigSharedWorker = w.SharedWorker;

      if (OrigWorker && !w.__ejsPatchedWorker) {
        w.Worker = function (...args: any[]) {
          const worker = new OrigWorker(...args);
          try { w.__ejsTrackedWorkers.add(worker); } catch { /* ignore */ }
          return worker;
        };
        w.Worker.prototype = OrigWorker.prototype;
        w.__ejsPatchedWorker = true;
      }

      if (OrigSharedWorker && !w.__ejsPatchedSharedWorker) {
        w.SharedWorker = function (...args: any[]) {
          const sworker = new OrigSharedWorker(...args);
          try { w.__ejsTrackedWorkers.add(sworker); } catch { /* ignore */ }
          return sworker;
        };
        w.SharedWorker.prototype = OrigSharedWorker.prototype;
        w.__ejsPatchedSharedWorker = true;
      }
    }
  }

  /** Try to focus the emulator's interactive element (canvas/iframe/container). */
  private async waitForEmulatorAndFocus(maxAttempts = 8, delayMs = 200): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      if (this._destroyed) {
        return false;
      }
      await new Promise(r => setTimeout(r, delayMs));
      const gameEl = document.getElementById('game');
      if (!gameEl) {
        continue;
      }
      // Prefer canvas, then iframe, then any focusable child
      const canvas = gameEl.querySelector('canvas') as HTMLElement | null;
      const iframe = gameEl.querySelector('iframe') as HTMLElement | null;
      const focusTarget = canvas || iframe || gameEl;
      if (focusTarget) {
        try {
          focusTarget.setAttribute('tabindex', '0');
          (focusTarget as HTMLElement).focus();
          // small user gesture simulation to reduce lost-focus issues
          focusTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          focusTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        } catch (e) {
          // ignore
        }
        return true;
      }
    }
    return false;
  }


  private setGameScreenHeight(): void {
    const gameEl = document.getElementById('game');
    if (!gameEl) return; 
    gameEl.style.removeProperty('aspect-ratio'); 
    gameEl.style.height = this.getViewportHeightMinusHeader(60);
    gameEl.style.maxHeight = this.getViewportHeightMinusHeader(60);
    gameEl.style.width = '100%';
  }

  private lockGameHostHeight(): void {
    const game = document.getElementById('game');
    if (!game) return;

    const apply = () => {
      const h = this.getViewportHeightMinusHeader(60);
      game.style.setProperty('height', h, 'important');
      game.style.setProperty('min-height', h, 'important');
      game.style.setProperty('width', '100%', 'important');
      game.style.setProperty('max-width', '100vw', 'important');
      game.style.setProperty('margin', '0 auto', 'important'); 
    };

    apply(); 
  }

  async toggleFullScreen(): Promise<void> {
    const gameEl = document.getElementById('game');
    if (!gameEl) return;

    const fsButton = (Array.from(document.querySelectorAll('.ejs_menu_button')) as HTMLButtonElement[])
      .find(btn => btn?.textContent?.includes('Enter Fullscreen'));

    if (fsButton) {
      fsButton.click();
    }
  }

  getRomName(): string {
    if (this.romName) {
      return this.fileService.getFileWithoutExtension(this.romName);
    }
    return 'Emulator';
  }


  async stopEmulator() {
    this.status = 'Stopping...';
    this.isExitingAndReturningToEmulator = true;
    this.cdr.detectChanges();

    await this.safeExit();
  }

  private async probeForSaveApi(maxMs = 3000): Promise<void> {
    const start = Date.now();

    const pickSave = (obj: any): boolean => {
      try {
        if (obj && typeof obj.saveState === 'function') {
          this._saveFn = async () => { try { await obj.saveState(); } catch { } };
          console.log('[EMU] save API bound from', obj);
          return true;
        }
      } catch { }
      return false;
    };

    const w = window as any;

    // Try immediately a few well-known spots
    if (pickSave(this.emulatorInstance)) return;
    if (pickSave(w.EJS_emulator)) return;
    if (pickSave(w.EJS)) return;
    if (pickSave(document.querySelector('#game') as any)) return;

    // Poll briefly—some builds attach the instance shortly after loader onload
    while (Date.now() - start < maxMs) {
      if (pickSave(this.emulatorInstance)) return;
      if (pickSave(w.EJS_emulator)) return;
      if (pickSave(w.EJS)) return;

      const player = typeof w.EJS_player === 'string'
        ? document.querySelector(w.EJS_player)
        : (w.EJS_player as any);
      if (pickSave(player)) return;

      await new Promise(r => setTimeout(r, 100));
    }
  }

  /** Try to locate the Quick Save button in the EJS toolbar. */
  private findQuickSaveButton(): HTMLButtonElement | null {
    try {
      const root = document.getElementById('game');
      if (!root) return null; 
      let btn = root.querySelector<HTMLButtonElement>('[data-action="quickSave"]');
      if (btn) return btn; 
      const candidates = Array.from(root.querySelectorAll<HTMLButtonElement>('button, [role="button"]'));
      for (const el of candidates) {
        const t = (el.getAttribute('title') || el.getAttribute('aria-label') || el.textContent || '').toLowerCase();
        if (t.includes('quick save') || t === 'save' || t.includes('save state')) return el as HTMLButtonElement;
      }
    } catch { }
    return null;
  }

  private tryBindSaveFromUI(): void {
    const btn = this.findQuickSaveButton();
    if (btn) {
      this._saveFn = async () => { 
        if (document.body.contains(btn)) {
          btn.click();
        } 
      }; 
    } else {
      console.warn('[EMU] Quick Save button not found; cannot bind UI-based save');
    }
  }

  private isArrayBuffer(v: any): v is ArrayBuffer {
    return v && typeof v === 'object' && typeof (v as ArrayBuffer).byteLength === 'number' && typeof (v as ArrayBuffer).slice === 'function';
  }
  private isTypedArray(v: any): v is Uint8Array {
    return v && typeof v === 'object' && typeof v.byteLength === 'number' && typeof v.BYTES_PER_ELEMENT === 'number';
  }
  private async blobToU8(b: Blob): Promise<Uint8Array> {
    const ab = await b.arrayBuffer();
    return new Uint8Array(ab);
  }
  private base64ToU8(b64: string): Uint8Array {
    const idx = b64.indexOf('base64,');
    const raw = idx >= 0 ? b64.slice(idx + 7) : b64;
    const bin = atob(raw);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  private async normalizeSavePayload(payload: any, depth = 0): Promise<Uint8Array | null> {
    try {
      if (!payload) return null;

      // Direct
      if (this.isTypedArray(payload)) return new Uint8Array(payload);
      if (this.isArrayBuffer(payload)) return new Uint8Array(payload);
      if (typeof Blob !== 'undefined' && payload instanceof Blob) return await this.blobToU8(payload);
      if (typeof payload === 'string' && payload.trim().length) return this.base64ToU8(payload);

      if (typeof payload === 'object' && depth < 3) {
        // Common fields
        const fields = ['buffer', 'data', 'state', 'result', 'save', 'value', 'bytes'];
        for (const f of fields) {
          if (payload[f] != null) {
            const sub = await this.normalizeSavePayload(payload[f], depth + 1);
            if (sub && sub.length) return sub;
          }
        }
 
        if (Array.isArray(payload.chunks) && payload.chunks.length) {
          const parts: Uint8Array[] = [];
          for (const c of payload.chunks) {
            const p = await this.normalizeSavePayload(c, depth + 1);
            if (p && p.length) parts.push(p);
          }
          if (parts.length) {
            const total = parts.reduce((n, u) => n + u.length, 0);
            const out = new Uint8Array(total);
            let off = 0;
            for (const u of parts) { out.set(u, off); off += u.length; }
            return out;
          }
        }
 
        if (typeof (payload as any).byteLength === 'number') {
          return new Uint8Array(payload as ArrayLike<number>);
        }
      }
    } catch { }
    return null;
  }

  private tryReadSaveFromLocalStorage(gameID: string, gameName: string): Uint8Array | null {
    try {
      const ls = window.localStorage;
      const keys = Object.keys(ls);
      const candidates = keys
        .filter(k => /ejs|state|save|quick/i.test(k) && (k.includes(gameID) || k.includes(gameName) || /quick/i.test(k)))
        .map(k => ({ k, v: ls.getItem(k) ?? '' }));
 
      for (const { k, v } of candidates) {
        if (!v) continue;
        if (/^data:.*;base64,/.test(v) || /^[A-Za-z0-9+/=\s]+$/.test(v)) {
          try {
            const u8 = this.base64ToU8(v);
            if (u8.length) {
              return u8;
            }
          } catch { }
        }
      }
      // JSON-wrapped
      for (const { k, v } of candidates) {
        if (!v) continue;
        try {
          const obj = JSON.parse(v);
          if (obj && Array.isArray(obj.data)) {
            const u8 = new Uint8Array(obj.data);
            if (u8.length) {
              //console.log('[EMU] localStorage savestate JSON(data[]) at', k, 'bytes=', u8.length);
              return u8;
            }
          }
          if (obj && typeof obj.buffer === 'string') {
            const u8 = this.base64ToU8(obj.buffer);
            if (u8.length) {
              //console.log('[EMU] localStorage savestate JSON(buffer b64) at', k, 'bytes=', u8.length); 
              return u8;
            }
          }
        } catch { }
      }
    } catch { }
    return null;
  }

  private async tryReadSaveFromLocalForage(gameID: string, gameName: string): Promise<Uint8Array | null> {
    try {
      const lf = (window as any).localforage;
      if (!lf || !lf.keys || !lf.getItem) return null;

      const keys: string[] = await lf.keys();
      const matches = keys.filter(k => /ejs|state|save|quick/i.test(k) && (k.includes(gameID) || k.includes(gameName) || /quick/i.test(k)));

      // Get candidates in parallel (limit to first ~50 for safety)
      const slice = matches.slice(-50);
      const vals = await Promise.all(slice.map(k => lf.getItem(k)));

      let best: Uint8Array | null = null;
      for (const v of vals) {
        let u8: Uint8Array | null = await this.normalizeSavePayload(v);
        if (!u8 || !u8.length) continue;
        if (!best || u8.length > best.length) best = u8; // pick largest
      }
      //if (best) console.log('[EMU] IDB (localforage) savestate bytes=', best.length);
      return best || null;
    } catch { return null; }
  }

  private async tryReadSaveFromIndexedDB(gameID: string, gameName: string): Promise<Uint8Array | null> {
    // First try localforage
    const lfHit = await this.tryReadSaveFromLocalForage(gameID, gameName);
    if (lfHit) return lfHit;

    const dbCandidates = ['localforage', 'EJS', 'emulatorjs', 'emulatorjs-cache', 'emulator', 'kv', 'storage'];
    const storeCandidates = ['keyvaluepairs', 'keyvalue', 'pairs', 'store', 'ejs', 'data', 'kv'];

    try {
      let best: Uint8Array | null = null;

      try {
        const list = (await (indexedDB as any).databases?.()) as { name?: string }[] | undefined;
        if (Array.isArray(list)) {
          for (const d of list) if (d?.name) dbCandidates.push(d.name);
        }
      } catch { }

      const seenDb = new Set<string>();
      for (const dbName of dbCandidates) {
        if (!dbName || seenDb.has(dbName)) continue;
        seenDb.add(dbName);

        const u8 = await this.scanOneIDB(dbName, storeCandidates, (key) =>
          /ejs|state|save|quick/i.test(key) && (key.includes(gameID) || key.includes(gameName) || /quick/i.test(key))
        );
        if (u8 && (!best || u8.length > best.length)) best = u8;
      }

      return best;
    } catch { return null; }
  }

  private async scanOneIDB(
    dbName: string,
    storeCandidates: string[],
    keyFilter: (k: string) => boolean
  ): Promise<Uint8Array | null> {
    const open = indexedDB.open(dbName);
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
      open.onupgradeneeded = () => {
        resolve(open.result);
      };
    });

    try {
      const stores = Array.from(db.objectStoreNames);
      const tryStores = stores.length ? stores : storeCandidates;

      let best: Uint8Array | null = null;

      for (const storeName of tryStores) {
        if (!storeName) continue;
        if (!db.objectStoreNames.contains(storeName)) {
          continue;
        }
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);

        const cursorReq = store.openCursor();
        const hits: Array<Uint8Array> = [];

        await new Promise<void>((resolve) => {
          cursorReq.onsuccess = async () => {
            const cursor = cursorReq.result;
            if (cursor) {
              const k = String(cursor.key);
              if (keyFilter(k)) {
                const val = cursor.value;
                try {
                  const u8 = await this.normalizeSavePayload(val);
                  if (u8 && u8.length) hits.push(u8);
                } catch { }
              }
              cursor.continue();
            } else {
              resolve();
            }
          };
          cursorReq.onerror = () => resolve();
        });

        for (const u8 of hits) {
          if (!best || u8.length > best.length) best = u8;
        }
      }

      db.close();
      return best;
    } catch {
      try { db.close(); } catch { }
      return null;
    }
  }

  private async waitForLoadApis(maxMs = 5000): Promise<{
    useEjs: ((u8: Uint8Array) => any) | null,
    useMgr: ((u8: Uint8Array) => any) | null
  }> {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const w = window as any;
      const useEjs = (typeof w.EJS_loadState === 'function') ? (u8: Uint8Array) => w.EJS_loadState(u8) : null;
      const mgr = (this.emulatorInstance || w.EJS_emulator || w.EJS)?.gameManager;
      const useMgr = (mgr && typeof mgr.loadState === 'function') ? (u8: Uint8Array) => mgr.loadState(u8) : null;
      if (useEjs || useMgr) return { useEjs, useMgr };
      await new Promise(r => setTimeout(r, 100));
    }
    return { useEjs: null, useMgr: null };
  }

  private async applySaveStateIfAvailable(saveStateBlob: Blob | null): Promise<boolean> {
    if (!saveStateBlob) return false;
    try {
      const u8 = new Uint8Array(await saveStateBlob.arrayBuffer());
      const core = (window as any).EJS_core || '';

      const isHeavy = this.heavyCores.has(core);
      if (!this._ejsReady) {
        const readyTimeout = isHeavy ? 120000 : 30000;
        const start = Date.now();
        while (!this._ejsReady && Date.now() - start < readyTimeout) {
          await new Promise(r => setTimeout(r, 200));
        }
        if (!this._ejsReady) {
          console.warn('[EMU] Timed out waiting for EJS_ready; cannot apply save state.');
          return false;
        }
      }

      if (isHeavy) {
        this.status = 'Waiting for core to initialize before restoring save…';
        this.cdr.detectChanges();

        const maxWaitMs = 60000;
        const start = Date.now();
        let coreReady = false;

        while (Date.now() - start < maxWaitMs && !this._destroyed) {
          try {
            const gm = await this.waitForGameManager(2000);
            if (gm?.functions?.supportsStates?.() === 1) {
              coreReady = true;
              break;
            }
          } catch { /* core not ready yet, keep polling */ }
          await new Promise(r => setTimeout(r, 1000));
        }

        if (!coreReady) {
          console.warn('[EMU] Core did not report state support within 60 s — trying load anyway…');
        } else {
          console.log(`[EMU] Core reports supportsStates=1 after ${Date.now() - start} ms`);
        }
        await new Promise(r => setTimeout(r, 2000));
      }

      const maxRetries = isHeavy ? 10 : 5;
      const retryDelayMs = 3000;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (this._destroyed) return false;

        try {
          const gm = await this.waitForGameManager(2000);
          if (gm && typeof gm.loadState === 'function') {
            gm.loadState(u8);
            this.status = 'Running';
            this.cdr.detectChanges();
            return true;
          }

          const w = window as any;
          if (typeof w.EJS_loadState === 'function') {
            await Promise.resolve(w.EJS_loadState(u8));
            this.status = 'Running';
            this.cdr.detectChanges();
            return true;
          }

          console.warn('[EMU] No load API available; could not apply save state.');
          this.status = 'Running';
          this.cdr.detectChanges();
          return false;
        } catch (e) {
          console.warn(`[EMU] loadState attempt ${attempt}/${maxRetries} failed:`, e);
          if (attempt < maxRetries) {
            this.status = `Save restore failed, retrying… (${attempt}/${maxRetries})`;
            this.cdr.detectChanges();
            await new Promise(r => setTimeout(r, retryDelayMs));
          }
        }
      }

      console.warn('[EMU] All loadState attempts exhausted; save state not loaded.');
      this.parentRef?.showNotification('Could not restore save state; starting game without it.');
      this.status = 'Running';
      this.cdr.detectChanges();
      return false;
    } catch (e) {
      console.warn('[EMU] applySaveStateIfAvailable failed', e);
      this.parentRef?.showNotification('Error applying save state; starting game without it.');
      return false;
    }
  }

  private trackInFlight<T>(p: Promise<T>): Promise<T> {
    const wrapped = p.finally(() => {
      if (this._inFlightSavePromise === wrapped as any) {
        this._inFlightSavePromise = undefined;
      }
    });
    // also expose a boolean-ish promise for the barrier
    this._inFlightSavePromise = wrapped.then(() => true, () => false);
    return wrapped;
  }

  // ---------------- IndexedDB pending-save helpers ----------------
  private async openPendingDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('bughosted_pending_saves', 1);
      req.onupgradeneeded = () => {
        try { (req.result as IDBDatabase).createObjectStore('pendingSaves', { keyPath: 'id', autoIncrement: true }); } catch { }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async getAllPendingSaves(): Promise<Array<any>> {
    try {
      const db = await this.openPendingDb();
      const tx = db.transaction('pendingSaves', 'readonly');
      const store = tx.objectStore('pendingSaves');
      const req = store.getAll();
      return await new Promise((resolve) => {
        req.onsuccess = () => { resolve(req.result || []); db.close(); };
        req.onerror = () => { resolve([]); db.close(); };
      });
    } catch { return []; }
  }

  private async removePendingSave(id: number): Promise<void> {
    try {
      const db = await this.openPendingDb();
      const tx = db.transaction('pendingSaves', 'readwrite');
      tx.objectStore('pendingSaves').delete(id);
      await new Promise<void>((res) => { tx.oncomplete = () => { db.close(); res(); }; tx.onerror = () => { db.close(); res(); }; });
    } catch { }
  }

  private async uploadPendingSavesOnStartup(): Promise<void> {
    try {
      const pending = await this.getAllPendingSaves();
      if (!pending?.length) return;
      for (const rec of pending) {
        try {
          const arr = new Uint8Array(await (rec.data as Blob).arrayBuffer());
          const res = await this.romService.saveEmulatorJSState(rec.romName, rec.userId, arr);
          if (res.ok) {
            await this.removePendingSave(rec.id); // <-- remove after success
          } else {
            console.warn('[EMU] failed to upload pending save:', res.errorText);
          }
        } catch (e) { console.warn('[EMU] uploadPendingSavesOnStartup error', e); }
      }
    } catch (e) { console.warn('[EMU] uploadPendingSavesOnStartup failed', e); }
  }

  /** Create or reuse a tiny stylesheet inside the vpad root. */
  private ensureVpadStyleSheet(root: HTMLElement): HTMLStyleElement {
    let style = root.querySelector('style[data-vpad-overrides="min"]') as HTMLStyleElement | null;
    if (style) return style;

    style = document.createElement('style');
    style.setAttribute('data-vpad-overrides', 'min');

    // 🔧 Tweak these two knobs if you want slightly bigger/smaller pills later:
    const PILL_W = this.system === 'genesis' ? 76 : 112;  // px
    const PILL_H = 76;   // px
    const FONT = 30;   // px

    const SEGA = 72;   // px (Genesis round buttons: A/B/C/X/Y/Z)
    const SEGA_FONT = 20;

    const translateXA = this.system != 'genesis' ? -24 : 34;
    const translateXB = this.system != 'genesis' ? -36 : -6;

    const translateYA = this.system != 'genesis' ? 6 : 34;
    const translateYB = this.system != 'genesis' ? 20 : 0;

    style.textContent = `   
.max-dpad { 
  transform: scale(1.30) !important; 
  transform-origin: center left !important; 
}

/* Big pill A/B — single source of truth for size + text */
.max-pill {
  width: ${PILL_W}px !important;
  height: ${PILL_H}px !important;
  line-height: ${PILL_H}px !important;
  border-radius: ${PILL_H / 2}px !important; 
  font-size: ${FONT}px !important;
  font-weight: 700 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}

/* Separate nudges so they sit nicely; adjust if you want more spacing */
.max-pill.is-a { transform: translate(${translateXA}px, ${translateYA}px) !important; }  /* A: left & a hair up */
.max-pill.is-b { transform: translate(${translateXB}px, ${translateYB}px) !important; }  /* B: more left & a bit down */

.max-sega {
  width: ${SEGA}px !important;
  height: ${SEGA}px !important;
  line-height: ${SEGA}px !important;
  border-radius: 50% !important;
  font-size: ${SEGA_FONT}px !important;
  font-weight: 700 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}

/* Speed buttons: small rectangles */
.max-rect {
  width: auto !important;
  height: auto !important;
  min-width: 42px !important;
  min-height: 20px !important;
  padding: 3px 8px !important;
  border-radius: 8px !important;
  font-size: 10px !important;
  line-height: 1.1 !important;
}

/* Start/Select: drop slightly */
.max-nudge-down { transform: translateY(35px) !important; }

/* If wrapper gets the class, keep first child consistent across skins */
.max-pill > *, .max-rect > * { all: inherit; }

/* (Optional) Very narrow screens: make pills a touch smaller, keep nudges balanced */
@media (max-width: 380px) {
  .max-pill {
    width: ${PILL_W - 8}px !important;
    height: ${PILL_H - 6}px !important;
    line-height: ${PILL_H - 6}px !important;
    border-radius: ${(PILL_H - 6) / 2}px !important;
    font-size: ${FONT - 2}px !important;
  }
  .max-pill.is-a { transform: translate(-30px,  6px) !important; }
  .max-pill.is-b { transform: translate(-30px, 18px) !important; } 
  .ejs_cheat_heading {
    color: var(--main-font-color) !important;
  }
  .ejs_cheat_parent {
    background-color: var(--component-background-color) !important;
    color: var(--main-font-color) !important;
  }
}
`;
    root.appendChild(style);
    return style;
  }

  /** Find inner clickable node for a wrapper (works across common skins). */
  private findClickableInside(host: Element | null): HTMLElement | null {
    if (!host) return null;
    const inner =
      host.querySelector('.ejs_button, .ejs-button, button, [role="button"]') as HTMLElement | null
      || (host.firstElementChild as HTMLElement | null);
    return (inner as HTMLElement) || (host as HTMLElement);
  }

  /** Fallback search by visible label (A/B/Fast/Slow/Start/Select). */
  private findByLabel(root: HTMLElement, labels: string[]): HTMLElement | null {
    const want = new Set(labels.map(s => s.trim().toUpperCase()));
    const nodes = root.querySelectorAll('.ejs_button, .ejs-button, button, [role="button"], [class*="button"]');
    for (const n of Array.from(nodes)) {
      const el = n as HTMLElement;
      const txt = (el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '')
        .trim().toUpperCase();
      if (txt && want.has(txt)) return el;
    }
    return null;
  }

  /** Minimal: tag D-pad, A/B (non-Sega), or Sega circles; plus Fast/Slow and Start/Select. */
  private scanAndTagVpadControls(): void {
    const root = document.querySelector('.ejs_virtualGamepad_parent, .ejs-virtualGamepad-parent') as HTMLElement | null;
    if (!root) return;

    // ensure our minimal stylesheet is present in the vpad root
    this.ensureVpadStyleSheet(root);

    // D-pad (all systems)
    const dpad = root.querySelector('.ejs_dpad, .ejs-dpad, [class*="dpad"]') as HTMLElement | null;
    if (dpad) dpad.classList.add('max-dpad');

    // ---------- Sega detection ----------
    const hasGenesis = !!(
      document.getElementById('genA') || document.getElementById('genB') || document.getElementById('genC') ||
      document.getElementById('genX') || document.getElementById('genY') || document.getElementById('genZ')
    );

    if (hasGenesis) {
      // Tag Sega circles and STOP (do not add A/B pills)
      const ids = ['genA', 'genB', 'genC', 'genX', 'genY', 'genZ'];
      for (const id of ids) {
        const host = document.getElementById(id);
        const clickable =
          this.findClickableInside(host) ||
          (id.startsWith('gen') ? this.findByLabel(root, [id.slice(3).toUpperCase()]) : null);

        if (clickable) {
          clickable.classList.remove('max-pill', 'is-a', 'is-b'); // just in case
          clickable.classList.add('max-sega');
        }
      }

      // Speed Fast / Slow
      const fast = this.findClickableInside(document.getElementById('speed_fast')) || this.findByLabel(root, ['FAST']);
      const slow = this.findClickableInside(document.getElementById('speed_slow')) || this.findByLabel(root, ['SLOW']);
      if (fast) fast.classList.add('max-rect');
      if (slow) slow.classList.add('max-rect');

      // Start / Select
      const start = this.findClickableInside(document.getElementById('start')) || this.findByLabel(root, ['START']);
      const select = this.findClickableInside(document.getElementById('select')) || this.findByLabel(root, ['SELECT']);
      if (start) start.classList.add('max-nudge-down');
      if (select) select.classList.add('max-nudge-down');

      return; // <-- IMPORTANT: do not fall through to pill logic
    }

    // ---------- Non-Sega A/B pill logic ----------
    const a = this.findClickableInside(document.getElementById('btnA')) || this.findByLabel(root, ['A']);
    const b = this.findClickableInside(document.getElementById('btnB')) || this.findByLabel(root, ['B']);
    const c = this.findClickableInside(document.getElementById('btnC')) || this.findByLabel(root, ['C']);
    if (a) { a.classList.add('max-pill', 'is-a'); }
    if (b) { b.classList.add('max-pill', 'is-b'); }
    if (c) { c.classList.add('max-pill', 'is-c'); }

    // Speed Fast / Slow
    const fast = this.findClickableInside(document.getElementById('speed_fast')) || this.findByLabel(root, ['FAST']);
    const slow = this.findClickableInside(document.getElementById('speed_slow')) || this.findByLabel(root, ['SLOW']);
    if (fast) fast.classList.add('max-rect');
    if (slow) slow.classList.add('max-rect');

    // Start / Select
    const start = this.findClickableInside(document.getElementById('start')) || this.findByLabel(root, ['START']);
    const select = this.findClickableInside(document.getElementById('select')) || this.findByLabel(root, ['SELECT']);
    if (start) start.classList.add('max-nudge-down');
    if (select) select.classList.add('max-nudge-down');
  }

  leftMovementArea(useJoystick: boolean): VPadItem {
    return useJoystick
      ? {
        type: 'zone',
        location: 'left',
        left: '8%',
        top: '50%',
        joystickInput: true,
        color: 'blue',
        inputValues: [19, 18, 17, 16],
      }
      : {
        type: 'dpad',
        location: 'left',
        left: '8%',
        joystickInput: false,
        inputValues: [4, 5, 6, 7],
      };
  }


  twoButtonRight(): VPadItem[] {
    // Make B a bit left/below; A a bit right/above (classic layout)
    const B: VPadItem = { type: 'button', id: 'btnB', text: 'B', location: 'right', left: 20, top: 75, input_value: 0, bold: true };
    const A: VPadItem = { type: 'button', id: 'btnA', text: 'A', location: 'right', left: 40, top: 10, input_value: 8, bold: true };
    return [B, A];
  }

  genesisThreeRight(): VPadItem[] {
    return [
      { type: 'button', id: 'genC', text: 'C', location: 'right', left: 70, top: 5, input_value: 8, bold: true },
      { type: 'button', id: 'genB', text: 'B', location: 'right', left: 0, top: 35, input_value: 0, bold: true },
      { type: 'button', id: 'genA', text: 'A', location: 'right', left: -115, top: 85, input_value: 1, bold: true },
    ];
  }

  genesisSixRight(): VPadItem[] {
    return [
      // Lower row A/B/C
      { type: 'button', id: 'genC', text: 'C', location: 'right', left: 70, top: 5, input_value: 8, bold: true },
      { type: 'button', id: 'genB', text: 'B', location: 'right', left: 0, top: 35, input_value: 0, bold: true },
      { type: 'button', id: 'genA', text: 'A', location: 'right', left: -115, top: 85, input_value: 1, bold: true },
      // Upper row X/Y/Z (match your build’s scheme)
      { type: 'button', id: 'genX', text: 'X', location: 'right', left: -60, top: -10, input_value: 10, bold: true },
      { type: 'button', id: 'genY', text: 'Y', location: 'right', left: 0, top: -30, input_value: 9, bold: true },
      { type: 'button', id: 'genZ', text: 'Z', location: 'right', left: 60, top: -50, input_value: 11, bold: true },
    ];
  }

  startSelectRow(): VPadItem[] {
    return [
      { type: 'button', id: 'start', text: 'Start', location: 'center', left: 60, top: 0, fontSize: 15, block: true, input_value: 3 },
      { type: 'button', id: 'select', text: 'Select', location: 'center', left: -5, top: 0, fontSize: 15, block: true, input_value: 2 },
    ];
  }

  shouldersTop(hasLR2 = false): VPadItem[] {
    const items: VPadItem[] = [
      { type: 'button', id: 'btnL', text: 'L', location: 'top', left: 10, top: 0, input_value: 10, bold: true, block: true },
      { type: 'button', id: 'btnR', text: 'R', location: 'top', right: 10, top: 0, input_value: 11, bold: true, block: true },
    ];
    if (hasLR2) {
      items.push(
        { type: 'button', id: 'btnL2', text: 'L2', location: 'top', left: 90, top: 0, input_value: 12, bold: true, block: true },
        { type: 'button', id: 'btnR2', text: 'R2', location: 'top', right: 90, top: 0, input_value: 13, bold: true, block: true },
      );
    }
    return items;
  }

  diamondRight(): VPadItem[] {
    return [
      { type: 'button', id: 'btnX', text: 'X', location: 'right', left: -50, top: 30, input_value: 9, bold: true },
      { type: 'button', id: 'btnY', text: 'Y', location: 'right', left: -20, top: -20, input_value: 1, bold: true },
      { type: 'button', id: 'btnB', text: 'B', location: 'right', left: 10, top: 80, input_value: 0, bold: true },
      { type: 'button', id: 'btnA', text: 'A', location: 'right', left: 50, top: 20, input_value: 8, bold: true },
    ];
  }

  systemFromCore(core: string): System {
    const c = core.toLowerCase();
    if (c.includes('snes')) return 'snes';
    if (c.includes('mgba') || c.includes('gba')) return 'gba';
    if (c.includes('gambatte') || c.includes('gbc') || c === 'gb') return 'gbc';
    if (c.includes('fceumm') || c.includes('nestopia') || c === 'nes') return 'nes';
    if (c.includes('genesis') || c.includes('picodrive') || c.includes('megadrive')) return 'genesis';
    if (c.includes('melonds') || c.includes('desmume') || c.includes('nds')) return 'nds';
    if (c === 'psp' || c.includes('ppsspp')) return 'psp';
    if (c.includes('mupen64')) return 'n64';
    if (c.includes('yabause')) return 'saturn';
    if (c.includes('flycast') || c.includes('naomi')) return 'dreamcast';
    if (c.includes('pcsx')) return 'ps1';
    if (c.includes('dolphin')) return 'gamecube';
    if (c.includes('mame') || c.includes('fbplus')) return 'arcade';
    if (c.includes('cps') || c.includes('neogeo')) return 'arcade';
    if (c.includes('dosbox')) return 'dos';
    if (c.includes('wiiu') || c.includes('citra')) return 'wiiu';
    if (c.includes('ps2') || c.includes('pcsx2')) return 'ps2';
    if (c.includes('xbox') || c.includes('xenia')) return 'xbox';
    if (c.includes('nesbox')) return 'nes';
    if (c.includes('arcade')) return 'arcade';
    if (c.includes('atari')) return 'atari';
    if (c.includes('coleco')) return 'coleco';
    if (c.includes('c64') || c.includes('commodore')) return 'c64';
    return 'nes';
  }

  buildTouchLayout(
    system: System,
    opts: BuildOpts & { segaShowLR?: boolean; genesisSix?: boolean } // ⟵ add genesisSix
  ): VPadItem[] {
    const { useJoystick, showControls = true, twoButtonMode, segaShowLR = true, genesisSix = false } = opts;
    if (!showControls) return [];

    const items: VPadItem[] = [];
    items.push(this.leftMovementArea(useJoystick));

    switch (system) {
      case 'snes':
        items.push(...this.diamondRight());
        items.push(...this.shouldersTop(false));
        items.push(...this.startSelectRow());
        break;

      case 'nds':
        items.push(...this.diamondRight());
        items.push(...this.shouldersTop(false));
        items.push(...this.startSelectRow());
        break;

      case 'gba':
        items.push(...this.twoButtonRight());
        items.push(...this.shouldersTop(false));
        items.push(...this.startSelectRow());
        break;

      case 'nes':
      case 'gb':
      case 'gbc':
        items.push(...this.twoButtonRight());
        items.push(...this.startSelectRow());
        break;

      case 'genesis':
      case 'saturn':
        if (genesisSix) {
          items.push(...this.genesisSixRight());
        } else {
          items.push(...this.genesisThreeRight());
        }
        if (segaShowLR) {
          items.push(...this.shouldersTop(false));
        }
        items.push(...this.startSelectRow());
        break;

      case 'psp':
        items.push(...this.diamondRight());
        items.push(...this.shouldersTop(false));
        items.push(...this.startSelectRow());
        break;

      default:
        items.push(...this.twoButtonRight());
        items.push(...this.startSelectRow());
        break;
    }

    return items;
  }

  /** Return a soft clamp for render buffer size based on core. */
  private getRenderClampForCore(core: Core) {
    if (core === "psp" || core === "ppsspp") {
      return { maxW: 640, maxH: 360, maxDPR: 1.0 };
    } 
    
    if (this.onMobile() && (core === 'melonds' || core === 'nds' || core === 'desmume' || core === 'desmume2015')) {
      return { maxW: 256, maxH: 384, maxDPR: 1.0 };
    }

    if (this.heavyCores.has(core)) return { maxW: 1280, maxH: 720, maxDPR: 1.5 };
    // Light cores can go higher
    return { maxW: 1920, maxH: 1080, maxDPR: 2.0 };
  }

  /** Resize the canvas drawing buffer (not just CSS) with DPR clamping and per-core clamps. */
  private resizeCanvasBuffer() {
    try {
      const gameEl = document.getElementById('game');
      if (!gameEl) return;
      const canvas = gameEl.querySelector('canvas') as HTMLCanvasElement | null;
      if (!canvas) return;

      // Determine clamp from detected core (fallback to defaults)

      const coreRaw =
        (this as any).currentCore ||
        (window as any).EJS_core ||
        (this.emulatorInstance?.core) ||
        '';

      const core = String(coreRaw).toLowerCase() as Core;
      const isPsp = core.includes('psp') || core.includes('ppsspp');

      if (isPsp) {
        const PSP_ASPECT = 480 / 272;
        const rect = gameEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        let fitW = rect.width;
        let fitH = rect.width / PSP_ASPECT;
        if (fitH > rect.height) {
          fitH = rect.height;
          fitW = rect.height * PSP_ASPECT;
        }

        const clamp = this.getRenderClampForCore(core);
        const dpr = Math.min(window.devicePixelRatio || 1, clamp.maxDPR);
        const targetW = Math.min(Math.round(fitW * dpr), clamp.maxW);
        const targetH = Math.min(Math.round(fitH * dpr), clamp.maxH);

        if (targetW === this._lastCanvasBufW && targetH === this._lastCanvasBufH) {
          return;
        }

        this._lastCanvasBufW = targetW;
        this._lastCanvasBufH = targetH;

        // ✅ APPLY (you were missing this)
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;

          const gl =
            canvas.getContext('webgl2') ||
            canvas.getContext('webgl') ||
            canvas.getContext('experimental-webgl');

          (gl as any)?.viewport?.(0, 0, targetW, targetH);
        }

        return;
      }

      const clamp = this.getRenderClampForCore(core);

      // Host size in CSS pixels
      const rect = gameEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      // Cap devicePixelRatio to avoid huge buffers on retina displays
      const rawDpr = window.devicePixelRatio || 1;
      const dpr = Math.min(rawDpr, clamp.maxDPR);

      const targetW = Math.min(Math.round(rect.width * dpr), clamp.maxW);
      const targetH = Math.min(Math.round(rect.height * dpr), clamp.maxH);

      if (targetW === this._lastCanvasBufW && targetH === this._lastCanvasBufH) {
        return;
      }
      this._lastCanvasBufW = targetW;
      this._lastCanvasBufH = targetH;

      // Only update when different to avoid thrashing
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;

        // If WebGL, update viewport
        const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
        if (gl && typeof gl.viewport === 'function') gl.viewport(0, 0, targetW, targetH);

        // If emulator exposes a resize hook, call it
        try {
          if (typeof (this.emulatorInstance?.onResize) === 'function') {
            this.emulatorInstance.onResize(targetW, targetH);
          } else if (typeof (this.emulatorInstance?.gameManager?.onResize) === 'function') {
            this.emulatorInstance.gameManager.onResize(targetW, targetH);
          }
        } catch (e) { /* swallow errors from unknown instances */ }
      }
    } catch (e) {
      console.warn('[EMU] resizeCanvasBuffer failed', e);
    }
  }

  private async waitForCanvas(maxMs = 1500) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const canvas = document.querySelector('#game canvas') as HTMLCanvasElement | null;
      if (canvas) return canvas;
      await new Promise(r => setTimeout(r, 50));
    }
    return null;
  }

  private async onEmulatorReadyForSizing() {
    const canvas = await this.waitForCanvas();
    if (canvas) {
      this.resizeCanvasBuffer(); 
      setTimeout(() => {
        this.forceCanvasRelayout();
      }, 5000); 
    } 
   // this.bindResizeBuffer();
  }

  /** Bind resize handlers (call once after emulator is initialized). */
  // private bindResizeBuffer() {
  //   const apply = () => this.resizeCanvasBuffer();
  //   this._onResize = () => apply();
  //   this._onOrientation = () => apply();
  //   this._onVVResize = () => apply();

  //   // Passive listeners to avoid blocking 
  //   window.addEventListener('resize', this._onResize, { passive: true });
  //   window.addEventListener('orientationchange', this._onOrientation, { passive: true });
  //   (window as any).visualViewport?.addEventListener?.('resize', this._onVVResize, { passive: true });


  //   // Also observe the #game element for layout changes (optional)
  //   try {
  //     const gameEl = document.getElementById('game');
  //     if (gameEl && typeof ResizeObserver !== 'undefined') {
  //       if (this._gameSizeObs) this._gameSizeObs.disconnect();
  //       this._gameSizeObs = new ResizeObserver(() => apply());
  //       this._gameSizeObs.observe(gameEl);
  //     }
  //   } catch { /* ignore */ }

  //   // Initial call after a short delay so DOM settles
  //   setTimeout(() => this.resizeCanvasBuffer(), 300);
  // }

  private slugifyName(name: string): string {
    return (name || '')
      .toLowerCase()
      .replace(/\.(zip|7z|md|smd|gen|bin|cue|iso|chd)$/g, '') // drop ext if present
      .replace(/['’]/g, '')                 // remove apostrophes/quotes
      .replace(/[^a-z0-9]+/g, '-')          // non-alnum -> hyphen
      .replace(/-+/g, '-')                  // collapse hyphens
      .replace(/^-|-$/g, '');               // trim hyphens
  }

  /** Map some common abbreviations/aliases to canonical slugs in our sets. */
  private canonicalizeGenesisSlug(slug: string): string {
    // A few helpful aliases
    const aliasMap: Record<string, string> = {
      // MK3 naming variations
      "mk3": "mortal-kombat-3",
      "ultimate-mortal-kombat-3": "ultimate-mk3",
      // Street Fighter II variations
      "street-fighter-ii-special-champion-edition": "street-fighter-2-special-champion-edition",
      "ssf2": "super-street-fighter-2",
      // Golden Axe 2
      "golden-axe-2": "golden-axe-ii",
    };
    return aliasMap[slug] ?? slug;
  }

  private shouldUseGenesisSixButtons(romDisplayName: string, system?: System): boolean {
    if (system === 'genesis') {
      const slug = this.canonicalizeGenesisSlug(this.slugifyName(romDisplayName));
      if (GENESIS_FORCE_THREE.has(slug)) return false;
      if (this.preferSixButtonGenesis) return true;
      return GENESIS_6BUTTON.has(slug);
    } else if (system === 'saturn') {
      return true;
    }
    return false;
  }

  toggleLoadWithoutSave() {
    this.loadWithoutSave = !this.loadWithoutSave;
  }

  private isValidSaveState(u8: Uint8Array, core: string): boolean {
    if (!u8) return false;
    const length = u8.length;
    if (length === 0) {
      console.warn('[EMU] Save state is empty → skipping upload');
      this.parentRef?.showNotification('Save state is empty; upload skipped');
      return false;
    }

    // All-zero = definitely corrupt/empty
    if (u8.every(b => b === 0)) {
      console.warn('[EMU] Save state is all zeros → skipping upload');
      this.parentRef?.showNotification('Save state appears to be empty/corrupt (all zeros); upload skipped');
      return false;
    }

    const min = MIN_STATE_SIZE[core] ?? 4 * 1024; // safe default
    if (length < min) {
      console.warn(`[EMU] Save state too small for core ${core} (${length} bytes < ${min}) → skipping`);
      this.parentRef?.showNotification(`Save state is smaller than expected for this game/core; it may be corrupt. Upload skipped.`);
      return false;
    }

    if (this.romName && core) {
      const lastSize = this.lastGoodSaveSize.get(this.romName);

      if (lastSize !== undefined) {
        if (length < lastSize * 0.3) {
          console.warn('State size is less than 30% of last good size — skipping');
          this.parentRef?.showNotification('Save state is significantly smaller than last known good state; it may be corrupt. Upload skipped.');
          return false;
        }

        if (length > lastSize * 3) {
          console.warn('State size is greater than 300% of last good size — skipping');
          this.parentRef?.showNotification('Save state is significantly larger than last known good state; it may be corrupt. Upload skipped.');
          return false;
        }
      }
    }

    return true;
  }


  private savePreferredCore(ext: string, core: string) {
    try {
      const raw = localStorage.getItem(this.SYS_PICK_KEY) || '{}';
      const obj = JSON.parse(raw);
      obj[ext] = core;
      localStorage.setItem(this.SYS_PICK_KEY, JSON.stringify(obj));
    } catch { }
  }

  private loadPreferredCore(ext: string): Core | null {
    try {
      const raw = localStorage.getItem(this.SYS_PICK_KEY) || '{}';
      const obj = JSON.parse(raw);
      return obj?.[ext] ?? null;
    } catch { return null; }
  }


  remapControls(): void {
    this.tmpShowEjsMenu();
    setTimeout(() => {
      const buttons = document.querySelectorAll<HTMLButtonElement>('button.ejs_menu_button');
      for (const btn of Array.from(buttons)) {
        const label =
          btn.querySelector('.ejs_menu_text')?.textContent?.trim()
          ?? btn.textContent?.trim()
          ?? '';

        if (label.includes('Control Settings')) {
          btn.click();
          return;
        }
      }

      console.warn('Control Settings button not found in menu; cannot remap controls.');
    }, 1000);
  }

  countZeros(u8: Uint8Array, start: number, end?: number): number {
    let zeros = 0;
    const length = u8.length;
    for (let i = start; i < (end ?? length); i++) {
      if (u8[i] === 0) zeros++;
    }
    return zeros;
  }

  resetGame(): void {
    if (!this.romName) return;
    this.closeMenuPanel();
    setTimeout(() => {
      this.skipLoadingSave = true; // default to saving
      this.isResetModalOpen = true;
      this.parentRef?.showOverlay();
    }, 300);
  }

  performReset(): void {
    // perform the reset using the selected save option
    const skipLoadingSave = !this.skipLoadingSave;
    this.isResetModalOpen = false;
    this.parentRef?.closeOverlay();
    this.fullReloadToEmulator(this.getReloadParamsSkipLoadingSaveFile(skipLoadingSave));
  }

  cancelReset(): void {
    this.isResetModalOpen = false;
    this.parentRef?.closeOverlay();
  }

  showMenuPanel() {
    this.isMenuPanelOpen = true;
    this.isFaqOpen = false;
    this.parentRef?.showOverlay();
  }

  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    this.isFaqOpen = false;
    this.parentRef?.closeOverlay();
  }

  toggleFaqItem(index: number) {
    const item = this.faqItems[index];
    if (item) item.expanded = !item.expanded;
  }

  // Public accessor for template to show last save time
  public get lastSaveTime(): Date | null {
    return this._lastSaveTime && this._lastSaveTime > 0 ? new Date(this._lastSaveTime) : null;
  }

  private displayRomUploadOrDownloadProgress(total: number, loaded: number, saving?: boolean) {
    const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : undefined;
    const loadedMb = (loaded / 1024 / 1024);
    const totalMb = total > 0 ? (total / 1024 / 1024) : undefined;
    const msg = saving ? 'Uploading Save' : 'Downloading ROM';
    if (totalMb !== undefined && pct !== undefined) {
      this.status = `${msg} - ${loadedMb.toFixed(2)} / ${totalMb.toFixed(2)} MB (${pct}%)`;
    } else {
      this.status = `${msg} - ${loadedMb.toFixed(2)} MB`;
    }
  }

  private getEmuUrl(): string {
    return `${location.protocol}//${location.host}/Emulator`;
  }

  private getReloadParamsSkipLoadingSaveFile(skipSave = true): Record<string, string> {
    const params: Record<string, string> = { skipSaveFile: skipSave ? 'true' : 'false' };
    const name = this.presetRomName ?? this.romName;
    if (name) params['romname'] = name;
    const id = this.presetRomId;
    if (typeof id !== 'undefined' && id !== null) params['romId'] = String(id);
    return params;
  }

  private fullReloadToEmulator(extraParams?: Record<string, string>): void {
    const base = this.getEmuUrl();
    const q = extraParams ? `?${new URLSearchParams(extraParams).toString()}` : '';
    window.location.replace(base + q);
  }

  async finishFileUploading() {
    console.log('Finished uploading file, refreshing directory in file search component');
    setTimeout(async () => {
      await this.fileSearchComponent?.getDirectory();
      this.cdr.detectChanges();
    }, 1500);
  }

  openLoginPanel() {
    this.closeMenuPanel();
    this.wasMenuOpenBeforeLoggingIn = true;
    setTimeout(() => {
      this.isShowingLoginPanel = true;
      this.parentRef?.showOverlay();
      this.cdr.detectChanges();
    }, 100);
  }

  closeLoginPanel(event?: any) {
    this.isShowingLoginPanel = false;
    this.parentRef?.closeOverlay();
    this.cdr.detectChanges();
    if (this.wasMenuOpenBeforeLoggingIn) {
      setTimeout(() => {
        this.showMenuPanel();
        this.wasMenuOpenBeforeLoggingIn = false;
      }, 100);
    }
  }

  private async stabilizePspCanvasSize(ms = 2000) {
    const start = performance.now();
    while (performance.now() - start < ms) {
      this.resizeCanvasBuffer();     // your clamp
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // Confirm selection from system-chooser popup and proceed to load
  confirmSystemSelection() {
    if (!this._pendingFileToLoad) return;
    const pending = this._pendingFileToLoad;

    const forced = this.selectedSystemCore ?? undefined;
    this._forcedCore = forced;
    this._pendingFileToLoad = null;
    this.isSystemSelectPanelOpen = false;
    this.parentRef?.closeOverlay();
    if (forced) {
      const ext = this.fileService.getFileExtension(pending.fileName);
      this.savePreferredCore(ext, forced);
      // Persist the system override to the database so it's used for icons and future loads
      if (pending.fileId) {
        this.romService.setSystemOverride(pending.fileId, forced).catch(() => { /* best-effort */ });
      }
    }
    // Kick off loading — ignore returned promise here, UI updates handled by caller
    void this.loadRomThroughService(pending.fileName, pending.fileId, forced).then(() => {
      this.status = 'Running';
      this.cdr.detectChanges();
    }).catch(e => {
      this.status = 'Error loading emulator';
      console.error(e);
      this.cdr.detectChanges();
    });
  }

  openSaveConfirm(type: typeof this.saveConfirmType, message?: string, callback?: any) {
    if (!type) {
      type = 'save';
    }
    this.closeMenuPanel();
    this.saveConfirmType = type;
    this.saveConfirmMessage = message;
    this.saveConfirmCallback = callback;
    setTimeout(() => {
      this.isSaveConfirmPanelOpen = true;
      this.parentRef?.showOverlay();
      this.cdr.detectChanges();
    }, 100);
  }

  async handleSaveConfirm(result: 'save' | 'dontSave' | 'cancel') {
    this.isSaveConfirmPanelOpen = false;
    this.saveConfirmType = undefined;
    this.saveConfirmMessage = undefined;
    this.parentRef?.closeOverlay();
    if (result === 'cancel') {
      this.setTmpStatus('Action cancelled.');
      return;
    }
    else if (result === 'save') {
      await this.callEjsSave();
    }
    if (this.saveConfirmCallback && typeof this.saveConfirmCallback === 'function') {
      try {
        this.saveConfirmCallback();
      } catch (e) {
        console.error('Error in save confirm callback:', e);
      } finally {
        this.saveConfirmCallback = undefined;
      }
    } else {
      this.saveConfirmCallback = undefined;
      console.error('Save confirm callback is not a function or is undefined');
    }
  }

  cancelSystemSelection() {
    if (!this._pendingFileToLoad) {
      this.isSystemSelectPanelOpen = false;
      return;
    }
    this.isSystemSelectPanelOpen = false;
    this.parentRef?.closeOverlay();
    this._pendingFileToLoad = null;
    this._forcedCore = undefined;
    this.systemCandidates = [];
    this.selectedSystemCore = undefined;
    this.cdr.detectChanges();
  }

  applyN64CoreSettings(w: any) {
    w.EJS_defaultOptions = Object.assign({}, w.EJS_defaultOptions || {}, {
      'webgl2Enabled': 'enabled'
    });
  }
  applyPSPCoreSettings(w: any) {
    w.EJS_vsync = false;
    w.EJS_GL_Options = {
      alpha: false,
      antialias: false,
      depth: true
    };
    w.EJS_disableLocalStorage = true;
    w.EJS_defaultOptions = Object.assign({}, PSP_DEFAULT_OPTIONS);
    w.EJS_defaultOptionsForce = true;
  }

// applyNDSCoreSettingsForMobile(w: any) {
//   w.EJS_GL_Options = {
//     alpha: false,
//     antialias: false,
//     depth: false,
//     stencil: false,
//     preserveDrawingBuffer: false,
//     premultipliedAlpha: false,
//     desynchronized: true, // try this; safe to A/B test
//     powerPreference: 'high-performance'
//   };

//   w.EJS_vsync = false; 
//   w.EJS_disableLocalStorage = true; 
//   w.EJS_disableDatabases = true; 
//   w.EJS_backgroundImage = '';
//   w.EJS_backgroundBlur = false;
// }
 
  // private scheduleResizeCanvasBuffer = () => {
  //   if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
  //   this._resizeRaf = requestAnimationFrame(() => {
  //     this._resizeRaf = undefined;
  //     this.resizeCanvasBuffer();
  //   });
  // };

  async applyPSPPerformanceTweak() {
    const core = (window as any).EJS_core;
    if (core !== 'psp' && core !== 'ppsspp') return;
    setTimeout(() => { void this.stabilizePspCanvasSize(2000); }, 500);
    // console.log('%c[PSP] Applying post-boot performance tweaks…', 'color:#4af'); 
    requestAnimationFrame(() => {
      try {
        const canvas = document.querySelector('#game canvas') as HTMLCanvasElement;
        if (!canvas) return;
        canvas.style.imageRendering = 'pixelated';
        canvas.style.maxWidth = '95vw';
        canvas.style.maxHeight = '95vh';
      } catch { }
    });

    (window as any).EJS_renderClamp = { maxW: 640, maxH: 360, maxDPR: 1.0 };


    try {
      const emu = (window as any).EJS_emulator ?? this.emulatorInstance;
      const gm = await this.waitForGameManager(5000);


      if (gm) {
        const opts = PSP_DEFAULT_OPTIONS;
        if (typeof gm.setFastForwardRatio === 'function') {
          try {
            const v = opts['ff-ratio'];
            if (v === 'unlimited') gm.setFastForwardRatio(0);
            else if (!isNaN(Number(v))) gm.setFastForwardRatio(Number(v));
          } catch { }
        }
        if (typeof gm.toggleFastForward === 'function') {
          try {
            if (opts['fastForward'] === 'enabled') gm.toggleFastForward(1);
          } catch { }
          if (emu) emu.isFastForward = true;
        }
        // set vsync
        if (typeof gm.setVSync === 'function') {
          try { gm.setVSync(opts['vsync'] === 'disabled' ? false : true); } catch { }
        }
        if (typeof gm.setVariable === 'function' || typeof gm === 'object') {
          for (const [k, v] of Object.entries(opts)) {
            if (k === 'fastForward' || k === 'ff-ratio' || k === 'vsync') continue;
            try { gm.setVariable(k, String(v)); } catch { }
          }
        }
      }
    } catch { }
    //console.log('%c[PSP] Post-boot tweaks applied ✔', 'color:#4f4');
  }

  /** Build the registry using FileService, once. */
  private buildCoreRegistry(fs: FileService): CoreDescriptor[] {
    // Helpers to union arrays with dedupe
    const uniq = <T>(arr: T[]) => Array.from(new Set(arr));
    const plus = (a: string[], b: string[]) => uniq([...a, ...b]);

    // Pull canonical lists from FileService
    const exNES = fs.getNesFileExtensions();       // ['nes','fds']
    const exSNES = fs.getSnesFileExtensions();      // ['snes','sfc','smc','fig']  (+ we'll add a few)
    const exGBA = fs.getGbaFileExtensions();       // ['gba']
    const exGBx = ['gb', 'gbc'];                    // (service provides via getters for keywords; extensions are simple)
    const exN64 = fs.getN64FileExtensions();       // ['z64','n64','v64']
    const exNDS = fs.getNdsFileExtensions();       // ['nds']
    const exPSP = fs.getPspFileExtensions();       // ['psp','iso','cso','pbp']
    const exPS1 = fs.getPs1FileExtensions();       // ['bin','cue','iso','chd','pbp']
    const exSAT = fs.getSaturnFileExtensions();    // ['cue','chd','iso','bin']
    const exGEN = fs.getGenesisFileExtensions();   // ['smd','gen','32x','gg','sms','md']

    // Extra SNES formats commonly seen with libretro (Snes9x)
    const exSNESExtra = ['swc', 'bs', 'st']; // confirmed in libretro Snes9x docs [1](https://docs.libretro.com/library/snes9x/)

    // Arcade
    const exArc = ['zip'];          // MAME2003+, FBNeo
    const exArcMaybe = ['7z'];      // often used in FBNeo/MAME sets

    // Multi-system disc formats to be treated as ambiguous
    const exAmbig = uniq([
      ...exPS1, ...exPSP, ...exSAT,
      ...fs.getAmbiguousRomExtensions()
    ]);

    // Dreamcast (Flycast, experimental): common formats
    const exDC = ['cdi', 'gdi', 'chd', 'cue', 'bin', 'elf', 'zip', '7z']; // libretro flycast supports these; WASM core required [5](https://docs.libretro.com/library/flycast/)

    // 3DO (Opera): typical images
    const ex3DO = ['iso', 'chd', 'cue']; // Opera libretro core supports these in common setups

    // Quake III (vitaQuake 3) – loads .pk3
    const exQ3 = ['pk3']; // from vitaquake3 *.info (supported_extensions="pk3") [2](https://sources.debian.org/src/libretro-core-info/1.14.0-1/vitaquake3_libretro.info/)

    return [
      // --- Sony ---
      { core: 'psp', label: 'PSP', exts: ['pbp'], maybeExts: plus([], exPSP), hints: [/ULUS\d{5}/i, /ULES\d{5}/i, /\bPSP\b/i] },
      { core: 'pcsx_rearmed', label: 'PlayStation (PS1)', exts: uniq(['bin', 'cue', 'chd']), maybeExts: exAmbig, hints: [/SLUS\d{5}/i, /SLES\d{5}/i, /\bPSX\b|\bPS1\b|\bPlayStation\b/i] },

      // --- Sega ---
      { core: 'genesis_plus_gx', label: 'Sega Mega Drive / Genesis', exts: exGEN, maybeExts: exAmbig, hints: [/\bGENESIS\b|\bMEGADRIVE\b|\bMD\b/i] },
      { core: 'genesis_plus_gx', label: 'Sega CD / Mega‑CD', exts: [], maybeExts: exAmbig, hints: [/\bSEGA\s?CD\b|\bMEGA\s?CD\b/i] },
      { core: 'picodrive', label: 'Sega 32X', exts: ['32x'], maybeExts: exAmbig, hints: [/\b32X\b/i] },
      { core: 'yabause', label: 'Sega Saturn', exts: [], maybeExts: exAmbig, hints: [/\bSATURN\b/i, /\bT-\d{4}/i, /\bMK-\d{4}/i] },

      // --- 3DO ---
      { core: 'opera', label: '3DO', exts: [], maybeExts: ex3DO, hints: [/\b3DO\b/i] },

      // --- Nintendo ---
      { core: 'mupen64plus_next', label: 'Nintendo 64', exts: exN64, maybeExts: exAmbig, hints: [/\bN64\b/i] },
      { core: 'desmume2015', label: 'Nintendo DS (DeSmuME)', exts: exNDS, maybeExts: exAmbig, hints: [/\bNDS\b|\bDS\b/i] },
      { core: 'melonds', label: 'Nintendo DS (melonDS)', exts: exNDS, maybeExts: exAmbig, hints: [/\bNDS\b|\bDS\b/i] },
      { core: 'dolphin', label: 'GameCube / Wii (Dolphin)', exts: [], maybeExts: exAmbig, hints: [/\bGAMECUBE\b|\bDOLPHIN\b|\bGC\b|\bWII\b/i] },
      { core: 'mgba', label: 'Game Boy Advance', exts: exGBx, maybeExts: [], hints: [/\bGBA\b/i] },
      { core: 'mgba', label: 'Game Boy / Game Boy Color', exts: exGBx, maybeExts: [], hints: [/\bGBC\b|\bGB\b/i] },
      { core: 'fceumm', label: 'NES / Famicom', exts: exNES, maybeExts: [], hints: [/\bNES\b|\bFAMICOM\b/i] },
      { core: 'snes9x', label: 'SNES / Super Famicom', exts: plus(exSNES, exSNESExtra), maybeExts: [], hints: [/\bSNES\b|\bSFC\b/i] },

      { core: 'mednafen_vb', label: 'Virtual Boy', exts: ['vb', 'vboy'], maybeExts: [], hints: [/\bVIRTUAL\s?BOY\b|\bVB\b/i] },

      // --- Arcade ---
      { core: 'mame2003_plus', label: 'Arcade (MAME 2003+)', exts: exArc, maybeExts: exArcMaybe, hints: [/\bMAME\b|\bARCADE\b/i] },
      { core: 'fbneo', label: 'Arcade (FBNeo)', exts: exArc, maybeExts: exArcMaybe, hints: [/\bFBNEO\b|\bNEOGEO\b/i] },

      // --- Atari ---
      { core: 'stella2014', label: 'Atari 2600', exts: ['a26'], maybeExts: exAmbig, hints: [/\b2600\b/i] },
      { core: 'prosystem', label: 'Atari 7800', exts: ['a78'], maybeExts: exAmbig, hints: [/\b7800\b/i] },
      { core: 'handy', label: 'Atari Lynx', exts: ['lnx'], maybeExts: exAmbig, hints: [/\bLYNX\b/i] },
      { core: 'virtualjaguar', label: 'Atari Jaguar', exts: ['jag'], maybeExts: exAmbig, hints: [/\bJAGUAR\b/i] },

      // --- Coleco / Commodore / Amiga ---
      { core: 'gearcoleco', label: 'ColecoVision', exts: ['col'], maybeExts: exAmbig, hints: [/\bCOLECO\b/i] },
      { core: 'vice_x64', label: 'Commodore 64', exts: ['d64'], maybeExts: [], hints: [/\bC64\b/i] },
      { core: 'puae', label: 'Commodore Amiga', exts: ['adf'], maybeExts: [], hints: [/\bAMIGA\b/i] },

      // --- Experimental (available only if you actually ship the WASM core files) ---
      { core: 'flycast', label: 'Sega Dreamcast (Flycast)', exts: exDC, maybeExts: exAmbig, hints: [/\bDREAMCAST\b|\bNAOMI\b/i] },  // WASM port required [6](https://github.com/nasomers/flycast-wasm)
      { core: 'vitaquake3', label: 'Quake III Arena (vitaQuake 3)', exts: exQ3, maybeExts: [], hints: [/pak0\.pk3/i] }, // loads *.pk3 [2](https://sources.debian.org/src/libretro-core-info/1.14.0-1/vitaquake3_libretro.info/)
    ];
  } 

  private isAmbiguousFile(fileName: string): boolean {
    const ext = this.normExt(fileName, n => this.fileService.getFileExtension(n));
    return this.fileService.getAmbiguousRomExtensions().includes(ext);
  }


  private getSystemCandidatesForFile(fileName: string): SystemCandidate[] {
    const ext = this.normExt(fileName, n => this.fileService.getFileExtension(n));

    const candidates: SystemCandidate[] = [
      { label: 'Auto-detect (recommended)', core: undefined }
    ];

    // Add registry matches for this ext. If the file is a .zip, offer all possible systems
    // because zip archives can contain many different ROM types.
    let matches = [] as { label: string; core?: Core }[];
    if (ext === 'zip') {
      matches = this.CORE_REGISTRY.map(e => ({ label: e.label, core: e.core }));
    } else {
      matches = this.CORE_REGISTRY
        .filter(e => (e.maybeExts ?? []).includes(ext) || (e.exts ?? []).includes(ext))
        .map(e => ({ label: e.label, core: e.core }));
    }
    // Deduplicate by core id + label
    const seen = new Set<string>();
    for (const m of matches) {
      const key = `${m.core}|${m.label}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(m);
      }
    }

    // Bubble up best guess (romService guess, then regex hint)
    let guessedCore: Core | null = null;

    try {
      const guessedSystem = this.romService?.guessSystemFromFileName(fileName);
      guessedCore = this.systemToCore(guessedSystem as System);
    } catch { }

    if (!guessedCore) {
      // try hint regexes
      const hintHit = this.CORE_REGISTRY.find(e =>
        (e.maybeExts ?? []).includes(ext) && e.hints?.some(r => r.test(fileName))
      );
      guessedCore = hintHit?.core ?? null;
    }

    if (guessedCore) {
      const idx = candidates.findIndex(c => this.normCore(c.core) === this.normCore(guessedCore));
      if (idx > 1) {
        const [hit] = candidates.splice(idx, 1);
        candidates.splice(1, 0, hit);
      }
    }

    return this.sortCandidatesByExt(ext, candidates);
  }


  private detectCoreEnhanced(fileName: string, forcedCore?: Core): Core {
    if (forcedCore) return forcedCore;

    const ext = this.normExt(fileName, n => this.fileService.getFileExtension(n));

    // 1) Confident extension mapping (fast path)
    for (const entry of this.CORE_REGISTRY) {
      if (entry.exts?.includes(ext)) return entry.core;
    }

    // 2) Ambiguous extensions: use your existing guesser + registry hints 
    const ambiguousExts = new Set(this.CORE_REGISTRY.flatMap(e => e.maybeExts ?? []));
    for (const s of this.fileService.getAmbiguousRomExtensions()) {
      ambiguousExts.add(s);
    }

    if (ambiguousExts.has(ext)) {
      // 2a) Your service guess (best)
      try {
        const guessed = this.romService?.guessSystemFromFileName(fileName);
        const guessedCore = this.systemToCore(guessed);
        if (guessedCore) return guessedCore;
      } catch { }

      // 2b) Regex hint match (good)
      for (const entry of this.CORE_REGISTRY) {
        if ((entry.maybeExts ?? []).includes(ext) && entry.hints?.some(r => r.test(fileName))) {
          return entry.core;
        }
      }

      // 2c) fallback for ambiguous ext
      // If it's ISO, PSP is common; if cue, PS1 accurate is safe; if bin, Genesis is common but PS1 too
      if (ext === 'cue') return 'mednafen_psx_hw';
      if (ext === 'iso') return 'pcsx_rearmed';
      if (ext === 'bin') return 'genesis_plus_gx';
      if (ext === 'chd') return 'pcsx_rearmed';
    }

    // 3) Final fallback
    return 'mgba';
  }

  /** Map your romService guess strings to a core id. Expand this as your guesser grows. */
  private systemToCore(guessed?: System): Core | null {
    const g = (guessed ?? "").toLowerCase();
    switch (g) {
      case 'psp': return 'psp';
      case 'ps1':
      case 'psx': return 'pcsx_rearmed';
      case 'saturn': return 'yabause';
      case 'dreamcast': return 'flycast';
      case 'segacd':
      case 'sega_cd': return 'genesis_plus_gx';
      case 'genesis':
      case 'megadrive': return 'genesis_plus_gx';
      case '3do': return 'opera';
      case 'n64': return 'mupen64plus_next';
      case 'gamecube': return 'dolphin';
      case 'gc': return 'dolphin';
      case 'nds': return 'desmume2015';
      case 'nintendods': return 'desmume2015';
      case 'ndsi': return 'desmume2015';
      case 'snes': return 'snes9x';
      case 'nes': return 'fceumm';
      case 'gba': return 'mgba';
      case 'gb':
      case 'gbc': return 'mgba';
      case 'vb': return 'mednafen_vb';
      case 'dos': return 'dosbox';
      default: return null;
    }
  }

  private normExt(fileName: string, getExt: (n: string) => string): string {
    return (getExt(fileName) || '').toLowerCase().trim().replace(/^\./, '');
  }

  private normCore(core?: string | null): string {
    return String(core || '').toLowerCase().trim();
  }

  private sortCandidatesByExt(ext: string, list: SystemCandidate[]): SystemCandidate[] {
    const orderByExt: Record<string, string[]> = {
      iso: ['psp', 'pcsx_rearmed', 'mednafen_psx_hw', 'yabause', 'genesis_plus_gx', 'opera'],
      cue: ['mednafen_psx_hw', 'pcsx_rearmed', 'genesis_plus_gx', 'yabause', 'mednafen_pce', 'mednafen_pcfx'],
      chd: ['pcsx_rearmed', 'mednafen_psx_hw', 'yabause', 'genesis_plus_gx', 'opera'],
      bin: ['genesis_plus_gx', 'pcsx_rearmed', 'mednafen_psx_hw', 'yabause', 'mednafen_pce'],
    };

    const preferred = orderByExt[ext] ?? [];
    const rank = (core?: string) => {
      if (!core) return -1; // Auto stays first
      const i = preferred.indexOf(core);
      return i === -1 ? 999 : i;
    };

    return [...list].sort((a, b) => rank(a.core) - rank(b.core));
  }


  private tempHideEjsMenu(durationMs: number = 5000): void {
    try {
      const intervalMs = 100;
      const maxWait = 1000;
      let waited = 0;
      const saved = new Set<HTMLElement>();

      const hideOnce = (): boolean => {
        const els = Array.from(document.querySelectorAll('.ejs_menu_bar:not(.ejs_menu_bar_hidden)')) as HTMLElement[];
        if (!els || els.length === 0) return false;
        els.forEach(el => {
          if (!el.dataset['ejsOriginalStyle']) {
            el.dataset['ejsOriginalStyle'] = el.getAttribute('style') ?? '';
          }
          // apply visual hiding while keeping element in DOM and operable by JS
          el.style.transition = 'transform 0.12s ease, opacity 0.12s ease';
          el.style.transform = 'translateY(-9999px)';
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          saved.add(el);
        });
        return true;
      };

      const attempt = () => {
        if (hideOnce()) {
          // restore after durationMs
          setTimeout(() => {
            saved.forEach(el => {
              try {
                // restore original inline style if present
                const orig = el.dataset['ejsOriginalStyle'] ?? '';
                if (orig) {
                  el.setAttribute('style', orig);
                } else {
                  // clear our temporary properties
                  el.style.transition = '';
                  el.style.transform = '';
                  el.style.opacity = '';
                  el.style.pointerEvents = '';
                }
                delete el.dataset['ejsOriginalStyle'];
              } catch { }
            });
          }, durationMs);
        } else {
          waited += intervalMs;
          if (waited < maxWait) {
            setTimeout(attempt, intervalMs);
          }
        }
      };

      attempt();
    } catch (e) {
      console.warn('tempHideEjsMenu failed', e);
    }
  }

  private tmpShowEjsMenu(durationMs: number = 5000): void {
    try {
      const intervalMs = 100;
      const maxWait = 1000;
      let waited = 0;
      const shown = new Set<HTMLElement>();

      const showOnce = (): boolean => {
        const els = Array.from(document.querySelectorAll('.ejs_menu_bar.ejs_menu_bar_hidden')) as HTMLElement[];
        if (!els || els.length === 0) return false;
        els.forEach(el => {
          try { el.classList.remove('ejs_menu_bar_hidden'); } catch { }
          shown.add(el);
        });
        return true;
      };

      const attemptShow = () => {
        if (showOnce()) {
          // restore hidden class after duration
          setTimeout(() => {
            shown.forEach(el => {
              try { el.classList.add('ejs_menu_bar_hidden'); } catch { }
            });
          }, durationMs);
        } else {
          waited += intervalMs;
          if (waited < maxWait) setTimeout(attemptShow, intervalMs);
        }
      };

      attemptShow();
    } catch (e) {
      console.warn('tmpShowEjsMenu failed', e);
    }
  }

  private stableStringToIntId(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  private ejsControlSchemeForCore(core: string): string | undefined {
    switch (core) {
      case 'genesis_plus_gx': return 'segaMD';
      case 'picodrive': return 'sega32x';
      case 'yabause': return 'segaSaturn';
      case 'smsplus': return 'segaMS';
      default: return undefined; // let EmulatorJS derive it
    }
  } 
    
  private forceCanvasRelayout(): void { 
    console.log('%c[EMU] Forcing canvas relayout ✔', 'color:#4af');
    window.dispatchEvent(new Event('resize'));
  } 

  private canUseThreads(core: Core, system: System): boolean {
    if (system === 'psp' || core === 'psp' || core === 'ppsspp') {
      return true;
    }
    return false;
  }
}