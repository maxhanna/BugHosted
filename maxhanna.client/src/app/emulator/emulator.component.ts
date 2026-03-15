
import { AfterViewInit, ChangeDetectorRef, Component, HostListener, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { RomService } from '../../services/rom.service';
import { FileService } from '../../services/file.service';
import { FileSearchComponent } from '../file-search/file-search.component';
import { AppComponent } from '../app.component';

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
  @Input() presetForcedCore?: string;
  @Input() skipSaveFileRequested = false;
  @Input() inputtedParentRef?: AppComponent;

  isShowingLoginPanel = false;
  isMenuPanelOpen = false;
  isFullScreen = false;
  romName?: string;
  system?: System;
  isFileUploaderExpanded = false;
  isFaqOpen = false;
  isSystemSelectPanelOpen = false;
  wasMenuOpenBeforeLoggingIn = false;
  faqItems: { question: string; answerHtml: string; expanded: boolean }[] = [
    {
      question: 'My controller is connected but doesn\'t work — what should I do?',
      answerHtml:
        `Unpair all controllers from the PC, then pair and test one controller at a time. 
      Multiple paired controllers or leftover Bluetooth pairings can cause input routing conflicts. 
      Try restarting the browser after pairing. 
      If using a virtual gamepad, confirm the correct mapping in the on-screen controls.
      If using regular gamepads, try re-mapping controls by clicking on the "Remap Controls" button
      when a rom is loaded, or press the controller button in the emulator to bring up the controls mapping screen.`,
      expanded: false
    },
    {
      question: 'I don\'t hear any audio from the game.',
      answerHtml: `Check that the browser tab isn't muted, confirm the correct audio output device is selected in your OS, and ensure the emulator volume (in the menu) is not set to zero. Some browsers require user gesture before audio will play — try clicking the page first.`,
      expanded: false
    },
    {
      question: 'Save states aren\'t persisting between sessions.',
      answerHtml: `Make sure you're logged in and autosave is enabled. Manual saves are available via the "Manual Save" button which calls the emulator save API. Network interruptions or very large save files (PS1/N64) can delay or prevent uploads.`,
      expanded: false
    },
    {
      question: 'The game runs slowly or stutters.',
      answerHtml: `Close other heavy apps/tabs, enable hardware acceleration in your browser, and try reducing the emulator rendering size. On low-end devices, disabling on-screen controls or switching to simpler touch layouts can help.`,
      expanded: false
    },
    {
      question: 'What systems and games are supported?',
      answerHtml: `Available systems include:<ul>
        <li><strong>Nintendo</strong>: Game Boy Advance, Famicom / NES, Virtual Boy, Game Boy, SNES, DS, N64</li>
        <li><strong>Sega</strong>: Master System, Mega Drive / Genesis, Game Gear, Saturn, 32X, CD</li>
        <li><strong>Atari</strong>: 2600, 5200, 7800, Lynx, Jaguar</li>
        <li><strong>Commodore</strong>: Commodore 64, Commodore 128, Amiga, PET, Plus/4, VIC-20</li>
        <li><strong>Other</strong>: PlayStation, PlayStation Portable (PSP), Arcade (MAME/3DO/MAME2003/ColecoVision)</li>
      </ul>
      The emulator supports a wide set of systems.`,
      expanded: false
    },
    {
      question: 'What does the "Autosave" button do?',
      answerHtml: `Toggles automatic periodic saving of the emulator state. (default 3 minutes; increased for large cores like N64/PS1).`,
      expanded: false
    },
    {
      question: 'What does "Enter Fullscreen" do?',
      answerHtml: `This hides the surrounding UI for a native fullscreen experience.`,
      expanded: false
    },
    {
      question: 'What does "Stop Emulator & Return to ROM Selection" do?',
      answerHtml: `Stops the running emulator, cleans up resources, and returns you to the ROM selection UI so you can choose another game. This calls the component's stop/cleanup logic (stopEmulator()).`,
      expanded: false
    },
    {
      question: 'What are the two "Reset Game" buttons?',
      answerHtml: `There are two reset options: "Reset Game (No Save)" restarts the ROM without saving the current state (useful for quick restarts). "Reset Game (Keep Save)" restarts but preserves the current persistent save file so your profile progress remains intact.`,
      expanded: false
    },
    {
      question: 'What does "Manual Save" do?',
      answerHtml: `Triggers an immediate save of the current emulator state to the server. Use this before closing if you don\'t rely on autosave.`,
      expanded: false
    },
    {
      question: 'What does the "Upload Rom(s)" control do?',
      answerHtml: `Uploads selected ROM files to the server (uploads go to the Roms directory).`,
      expanded: false
    },
    {
      question: 'What is "Enable/Disable Joystick" on mobile?',
      answerHtml: `Toggles the touch input mode between a D-pad and an analog joystick-like "zone" layout. The component builds different on-screen layouts depending on this flag (useJoystick) and other settings like two-button mode or Genesis six-button handling.`,
      expanded: false
    },
    {
      question: 'What are the "Fast" and "Slow" speed buttons?',
      answerHtml: `Small on-screen buttons are provided for temporary speed toggles.`,
      expanded: false
    },
    {
      question: 'How are save sizes and autosave intervals handled?',
      answerHtml: `The component enforces a minimum state size per core and adjusts autosave interval time: default is 3 minutes; for large-save cores like N64/PS1 it increases to 10 minutes to reduce upload frequency and prevent timeouts.`,
      expanded: false
    },
    {
      question: 'How can I auto-load a preset ROM via URL?',
      answerHtml: `You can pass query parameters when navigating to /Emulator: use <strong>?rom=FILE_NAME&amp;romId=ID</strong>. The component checks for these and will attempt to load them automatically if provided.`,
      expanded: false
    }
  ];


  private readonly MIN_STATE_SIZE: Record<string, number> = {
    // Light cores
    'fceumm': 8 * 1024,     // NES
    'gambatte': 8 * 1024,     // GB/GBC
    'mgba': 32 * 1024,    // GBA (very reliable floor)
    'genesis_plus_gx': 16 * 1024,    // Genesis / Master System / GG
    'snes9x': 64 * 1024,    // SNES (can be ~500 KB+ on later versions)
    'picodrive': 16 * 1024,    // 32X

    // Heavy cores – use conservative minimums
    'mupen64plus_next': 16 * 1024 * 1024,  // N64 – usually 60–200+ MB
    'mednafen_psx_hw': 1 * 1024 * 1024,   // PS1 (Beetle)
    'pcsx_rearmed': 1 * 1024 * 1024,
    'duckstation': 1 * 1024 * 1024,
    'melonds': 512 * 1024,        // DS
    // add more as you see them in logs
  };
  isSearchVisible = false;
  autosave = true;
  autosaveIntervalTime: number = 180000; // 3 minutes 
  showControls = true;     // show/hide on-screen controls
  useJoystick = false;     // D-pad (false) vs analog "zone" (true)
  segaShowLR = true;       // show L/R pills on Genesis when desired
  status: string = 'Idle';
  preferSixButtonGenesis: boolean = true;
  loadWithoutSave = false;
  private autosaveInterval: any;
  private romObjectUrl?: string;
  private emulatorInstance?: any;
  systemCandidates: Array<{ label: string; core?: string }> = [];
  selectedSystemCore?: string | null = null;
  /** The core explicitly chosen by the user (via system-select panel or DB override). */
  private _forcedCore?: string;
  private _pendingFileToLoad?: { fileName: string; fileId?: number; directory?: string } | null = null;
  private _destroyed = false;
  private _pendingSaveResolve?: (v?: any) => void;
  private _pendingSaveTimer?: any;
  private _captureSaveResolve?: (u8: Uint8Array | null) => void;
  private _gameSizeObs?: ResizeObserver;
  private _onResize?: () => void;
  private _onVVResize?: () => void;
  private _onOrientation?: () => void;

  // private _gameAttrObs?: MutationObserver;
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

  constructor(
    private romService: RomService,
    private fileService: FileService,
    private cdr: ChangeDetectorRef
  ) {
    super();
    this.CORE_REGISTRY = this.buildCoreRegistry(this.fileService);
  }

  /**
   * Deterministic 32-bit unsigned integer derived from a string.
   * Uses FNV-1a 32-bit algorithm with Math.imul for consistent behavior across engines.
   * Returns a positive integer that will be identical for the same input string on every client.
   */
  private stableStringToIntId(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
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
        await this.loadRomThroughService(this.presetRomName, this.presetRomId, undefined, this.presetForcedCore);
      } catch (e) {
        console.error('Failed to auto-load preset ROM', e);
      }
    }
  }

  ngOnDestroy(): void {
    this.status = 'Destroying emulator...';

    try {
      if (this._onResize) window.removeEventListener('resize', this._onResize);
      if (this._onOrientation) window.removeEventListener('orientationchange', this._onOrientation);
      if (this._onVVResize) (window as any).visualViewport?.removeEventListener?.('resize', this._onVVResize);
      if (this._gameSizeObs) { this._gameSizeObs.disconnect(); }
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

    const shouldSave = window.confirm('Save state before closing?');
    if (!shouldSave) {
      if (this.stopEmuSaving || this.isExitingAndReturningToEmulator) {
        this.fullReloadToEmulator();
      } else {
        return this.navigateHome();
      }
    }
    if (!this.stopEmuSaving && !this.isExitingAndReturningToEmulator) {
      this.exitSaving = true;
    }
    this.callEjsSave();
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

      // Special-case: if the file is a .zip, always prompt the user to choose a system
      // via the system-picker panel unless the DB has an actualSystem override.
      // Do NOT fall back to localStorage per-extension preference for .zip files.
      if (!this.selectedSystemCore && ext === 'zip' && !dbOverride) {
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


    try {
      await this.loadRomThroughService(file.fileName, file.id, file.directory, this.selectedSystemCore ?? undefined);
      this.status = 'Running';
    } catch (err) {
      this.status = 'Error loading emulator';
      console.error(err);
    } finally {
      this.cdr.detectChanges();
    }
  }

  onSystemSelectChange(ev: Event) {
    const val = (ev.target as HTMLSelectElement).value;
    this.selectedSystemCore = val || null;
  }

  private async loadRomThroughService(fileName: string, fileId?: number, directory?: string, forcedCore?: string | undefined) {
    // Use the instance-level forced core as a fallback
    const effectiveForcedCore = forcedCore ?? this._forcedCore;
    if (effectiveForcedCore) this._forcedCore = effectiveForcedCore;

    // If a forced core was selected and we have a fileId, persist a system override
    // only if the DB doesn't already have one. Best-effort and non-blocking to
    // avoid delaying emulator startup.
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
    (this as any).currentCore = core;
    console.log(`[EmulatorComponent] Detected core "${core}" for file "${fileName}" (ext: "${this.fileService.getFileExtension(fileName)}") forcedCore=${effectiveForcedCore ?? 'none'}`);
    const renderClamp = this.getRenderClampForCore(core);
    (window as any).EJS_renderClamp = renderClamp;
    window.EJS_core = core;
    // Explicitly set the control scheme so EmulatorJS uses the correct button
    // layout. Without this, genesis_plus_gx resolves to "segaMS" (2 buttons)
    // instead of "segaMD" (6 buttons) because segaMS appears first in the
    // EmulatorJS getCores() iteration order.
    window.EJS_controlScheme = this.ejsControlSchemeForCore(core);
    this.system = this.systemFromCore(core);

    const romDisplayName = this.fileService.getFileWithoutExtension(fileName); // e.g., "Ultimate MK3 (USA)"
    this.applyGamepadControlSettings(romDisplayName, core, this.system);
    // For PlayStation and N64 cores, increase autosave interval to 10 minutes
    // to reduce upload frequency for large save files (e.g. PS1 saves).
    const longIntervalCores = new Set([
      'mupen64plus_next', // N64
      'mednafen_psx_hw', 'pcsx_rearmed', 'duckstation', 'mednafen_psx', // PSX variants
      'psp', 'ppsspp' // PSP — save states can be ~40 MB+
    ]);
    if (longIntervalCores.has(core)) {
      this.autosaveIntervalTime = 10 * 60 * 1000; // 10 minutes
      //console.log(`[EJS] Detected core "${core}", setting autosave interval to 10 minutes to reduce upload frequency for large save files.`);
    } else {
      this.autosaveIntervalTime = 3 * 60 * 1000; // default 3 minutes
    }
    window.EJS_player = "#game";

    this.setCoreAndDataFileLocations(core);
    // ❗ BIOS: set ONLY if required by the selected core; otherwise blank
    window.EJS_biosUrl = this.getBiosUrlForCore(core) ?? "";  // <— key fix
    window.EJS_softLoad = false; // TEMP: ensure full boot path for every run
    window.EJS_gameUrl = this.romObjectUrl;
    const _ejs_gameKey = `${core}:${this.fileService.getFileWithoutExtension(fileName)}`;
    // EJS_gameID MUST be a number — emulator.js hides the netplay button
    // when typeof config.gameId !== "number".
    window.EJS_gameID = this.stableStringToIntId(_ejs_gameKey);
    window.EJS_gameIDKey = _ejs_gameKey; // string key kept for debugging
    window.EJS_gameName = this.fileService.getFileWithoutExtension(this.romName ?? '');
    // Netplay: use same-origin so it shares the existing HTTPS certificate
    // and doesn't need a separate port / firewall rule.
    // The prod-server.js embeds the netplay Socket.IO server on the default
    // namespace — exactly like the upstream EmulatorJS-Netplay server.js.
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
    // Optional callbacks (ok to keep)
    window.EJS_onSaveState = (state: Uint8Array) => this.onSaveState(state);
    window.EJS_onLoadState = async () => {
      try {
        if (!this.parentRef?.user?.id || !this.romName) return;
        // Reuse your existing service to fetch latest server state
        const blob = await this.loadSaveStateFromDB(this.romName);
        if (!blob) { console.warn('[EJS] No cloud save found to load'); return; }

        const u8 = new Uint8Array(await blob.arrayBuffer());
        const { useEjs, useMgr } = await this.waitForLoadApis(4000);
        if (useEjs) return useEjs(u8);
        if (useMgr) return useMgr(u8);
        console.warn('[EJS] No load API available on load button press');
      } catch (e) {
        console.warn('[EJS] onLoadState fetch/apply failed', e);
      }
    };
    this.applyEjsRunOptions(this.system, core);
    // If the build calls back with the instance, capture it early

    window.EJS_ready = (api: any) => {
      try {
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
        console.warn('[EJS] EJS_ready callback failed');
      }

      try { this.onEmulatorReadyForSizing(); } catch { console.warn('[EJS] onEmulatorReadyForSizing failed'); }
    };

    // 6) Ensure CSS present once
    if (!document.querySelector('link[data-ejs-css="1"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/assets/emulatorjs/data/emulator.min.css';
      link.setAttribute('data-ejs-css', '1');
      document.head.appendChild(link);
    }
    // Ensure menu is closed when the emulator starts
    this.isMenuPanelOpen = false;
    try { this.parentRef?.closeOverlay(); } catch { }

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
        this.setLoaderFileLocation(s);

        s.async = false;
        s.defer = false;
        s.setAttribute('data-ejs-loader', '1');
        s.onload = () => {
          window.__ejsLoaderInjected = true;

          // setTimeout(() => {
          //   const roots = document.querySelectorAll('.ejs_virtualGamepad_parent, .ejs-virtualGamepad-parent');
          //   console.log('[EJS] vpad roots detected:', roots.length, roots);
          // }, 1000);

          requestAnimationFrame(() => {
            this.setGameScreenHeight();
            // a second rAF can make it even smoother: 
            requestAnimationFrame(async () => {
              await this.waitForEmulatorAndFocus();
              await this.probeForSaveApi();
              this.tryBindSaveFromUI();
              this.scanAndTagVpadControls();

              try {
                const ok = await this.applySaveStateIfAvailable(saveStateBlob);
              } catch {
                console.warn('[EJS] Unable to apply save state on startup');
              }
              this.lockGameHostHeight();
            });
          });
          resolve();
        };
        s.onerror = () => reject(new Error('Failed to load EmulatorJS loader.js'));
        document.body.appendChild(s);
      });
      // start autosave loop if enabled
      try { this.setupAutosave(); } catch { }
      // Kick off background uploader for any pending exit saves
      try { this.uploadPendingSavesOnStartup(); } catch { }
    } else {
      this.stopLoading();
      this.fullReloadToEmulator();
      return;
    }

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
    console.log('[EJS] assigning custom VirtualGamepadSettings', window.EJS_VirtualGamepadSettings);
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

  private getBiosUrlForCore(core: string): string | undefined {
    switch (core) {
      // PlayStation (common BIOS used by many PS1 cores)
      case 'mednafen_psx_hw':
      case 'pcsx_rearmed':  
      case 'duckstation':
      case 'mednafen_psx':
        return '/assets/emulatorjs/data/cores/scph5501.bin';

      // Nintendo DS firmware
      case 'melonds':
        return undefined;

      case 'yabause':
      case 'segaSaturn':
      case 'sega_saturn':
        // Point to the BIOS you added in step 1
        return '/assets/emulatorjs/data/cores/saturn_bios.bin';

      // NeoGeo / arcade BIOS packs (only for specific ROM sets)
      case 'fbneo':
      case 'mame2003_plus':
        return undefined;

      // By default, do not supply a BIOS URL — caller will treat undefined as "no BIOS".
      default:
        return undefined;
    }
  }


  private applyEjsRunOptions(system: System, core: string | undefined): void {
    const rootStyle = getComputedStyle(document.documentElement);
    //const mainHighlight = (rootStyle.getPropertyValue('--main-highlight-color') || '#3a3a3a').trim();
    const componentBackgroundColor = (rootStyle.getPropertyValue('--component-background-color') || '#3a3a3a').trim();
    // Use the core name for a reliable icon lookup (coreIconMap), falling back to
    // extension-based guessing via the rom filename.
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
    w.EJS_threads = true;               // allow cores to use threads if they want (e.g. for async save state capture); you can disable if you have issues with certain browsers/devices
    w.EJS_color = componentBackgroundColor;        // Sets the main color theme for the emulator
    w.EJS_backgroundColor = componentBackgroundColor; // Sets the background color for the emulator    
    if (systemIcon) {
      w.EJS_backgroundImage = systemIcon; // Sets the background color for the emulator    
    }
    if (core === "psp" || core == "ppsspp") {
      this.applyPSPCoreSettings(w); // force our perf defaults over any saved prefs
    }
    // Default controller mappings for all 4 players.
    // Player 1 gets keyboard + gamepad; Players 2-4 get gamepad-only (no keyboard conflicts).
    const isDPADCentric = (['nes', 'snes', 'gb', 'gbc', 'gba', 'genesis', 'saturn', 'sega_cd', '3do', 'nds'] as string[]).includes(system ?? '') || core === 'yabause';
    const rightStickValues = {
      "UP": isDPADCentric ? 'DPAD_UP' : 'RIGHT_STICK_Y:-1',
      "DOWN": isDPADCentric ? 'DPAD_DOWN' : 'RIGHT_STICK_Y:+1',
      "LEFT": isDPADCentric ? 'DPAD_LEFT' : 'RIGHT_STICK_X:-1',
      "RIGHT": isDPADCentric ? 'DPAD_RIGHT' : 'RIGHT_STICK_X:+1'
    };

    const leftStickValues = {
      "UP": isDPADCentric ? 'DPAD_UP' : 'LEFT_STICK_Y:-1',
      "DOWN": isDPADCentric ? 'DPAD_DOWN' : 'LEFT_STICK_Y:+1',
      "LEFT": isDPADCentric ? 'DPAD_LEFT' : 'LEFT_STICK_X:-1',
      "RIGHT": isDPADCentric ? 'DPAD_RIGHT' : 'LEFT_STICK_X:+1'
    };

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
    if (system === "saturn" || core === "yabause") {

    }
    w.EJS_DEBUG_XX = true;             // debug options 
    w.EJS_EXPERIMENTAL_NETPLAY = true; // required alongside EJS_DEBUG_XX for netplay
    w.EJS_logCoreInfo = false;          // debug options 
    w.EJS_logVideo = false;             // debug options 
    w.EJS_logAudio = false;             // debug options 
    w.EJS_logInput = false;             // debug options 
    w.EJS_logSaves = false;             // debug options  
    w.EJS_paths = { 
      bios:   '/assets/emulatorjs/data/cores/',
      system: '/assets/emulatorjs/data/cores/',
    };

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


    const ejs = (window as any).EJS_emulator || (window as any).EJS;

    const gm = await this.waitForGameManager(5000);
    if (gm && typeof gm.getState === 'function') {
      w.EJS_saveState = async () => {
        const bytes = await Promise.resolve(gm.getState());
        // Normalize to Uint8Array
        return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBufferLike);
      };
      console.log('[EJS] Polyfilled EJS_saveState via gameManager.getState()');
    } else {
      console.warn('[EJS] No gameManager.getState() found; cannot polyfill EJS_saveState');
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
    if (this._exiting) { return; }
    const tmpStatus = this.status;
    this.status = 'Saving State. Please wait...';

    if (this._captureSaveResolve) {
      try {
        const cap = await this.normalizeSavePayload(raw);
        this._captureSaveResolve(cap || null);
      } catch { try { this._captureSaveResolve(null); } catch { } }
      this._captureSaveResolve = undefined;
      return;
    }
    const now = Date.now();
    // If a save is already in progress, skip duplicate uploads
    if (this._saveInProgress) {
      //console.log('[EJS] onSaveState: save already in progress; skipping');
      if (this._pendingSaveResolve) { try { this._pendingSaveResolve(true); } catch { } this._pendingSaveResolve = undefined; }
      return;
    }
    // Rate-limit saves to once per 10s
    if (!this._destroyed && now - this._lastSaveTime < 10000) {
      console.log('[EJS] onSaveState: recent save detected (<10s); skipping upload');
      if (this._pendingSaveResolve) { try { this._pendingSaveResolve(true); } catch { } this._pendingSaveResolve = undefined; }
      return;
    }
    const gameID = (window as any).EJS_gameIDKey || String((window as any).EJS_gameID ?? '');
    const gameName = (window as any).EJS_gameName
      || (this.romName ? this.fileService.getFileWithoutExtension(this.romName) : '');

    // Helpful diagnostics the first few times
    //this.debugDescribePayload(raw); 
    // console.log(
    //   '[EJS] onSaveState fired.',
    //   'user?', !!this.parentRef?.user?.id,
    //   'rom?', !!this.romName,
    //   'hasPayload?', raw != null,
    //   'type=', raw?.constructor?.name ?? typeof raw
    // );

    if (!this.parentRef?.user?.id || !this.romName) return;

    // 1) Try to normalize whatever the callback passed
    let u8: Uint8Array | null = await this.normalizeSavePayload(raw);
    const core = (window as any).EJS_core || '';
    if (u8 && !this.isValidSaveState(u8, core)) {
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
      u8 = this.tryReadSaveFromLocalStorage(gameID, gameName);
    }

    // 3) If still nothing, try IndexedDB (localforage/known DBs)
    if (!u8 || u8.length === 0) {
      u8 = await this.tryReadSaveFromIndexedDB(gameID, gameName);
    }
    this.status = "State Captured. Uploading files to server. Please wait...";
    this.cdr.detectChanges();
    // 4) If still nothing, bail gracefully (avoid TypeError in romService)
    if (!u8 || u8.length === 0) {
      console.warn('[EJS] Save callback had no bytes and no storage fallback found; skipping upload.');
      if (this._pendingSaveResolve) { try { this._pendingSaveResolve(false); } catch { } this._pendingSaveResolve = undefined; }
      this.status = tmpStatus;
      return;
    }

    this._saveInProgress = true;
    try {
      // capture as "in-flight" but route through uploadSaveBytes to dedupe
      await this.trackInFlight((async () => {
        const ok = await this.uploadSaveBytes(u8);
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
    try {
      const w = window as any;
      const ejs = (window as any).EJS_emulator || (window as any).EJS;

      const gm = await this.waitForGameManager(5000);
      // Prefer EJS_saveState if present (native or polyfilled)
      if (typeof w.EJS_saveState === 'function') {
        const u8: Uint8Array = await w.EJS_saveState();
        await this.uploadSaveBytes(u8);
        return true;
      }

      // Fallback: try the GameManager directly
      if (gm && typeof gm.getState === 'function') {
        const raw = await Promise.resolve(gm.getState());
        const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBufferLike);
        await this.uploadSaveBytes(u8);
        return true;
      }
    } catch (e) {
      console.warn('[EJS] postSaveCaptureAndUpload failed', e);
    }
    return false;
  }

  async callEjsSave(): Promise<boolean> {
    this.tempHideEjsMenu(5000);
    this.startLoading();
    try {
      const w = window as any;

      // 1) Best path: bytes immediately
      if (typeof w.EJS_saveState === 'function') {
        const bytes: Uint8Array = await w.EJS_saveState();
        //console.log(`[EJS] EJS_saveState returned ${bytes?.length ?? 0} bytes`);
        await this.uploadSaveBytes(bytes);
        //console.log('callEjsSave: used EJS_saveState -> upload done');
        return true;
      }

      // 2) Fallbacks: trigger any save the build exposes…
      if (this._saveFn) {
        //console.log('[EJS] callEjsSave: using captured save function from instance');
        await this._saveFn();
        // …then capture and upload bytes explicitly
        return await this.postSaveCaptureAndUpload();
      }

      if (this.emulatorInstance?.saveState) {
        // console.log('[EJS] callEjsSave: using saveState method from captured instance');
        await this.emulatorInstance.saveState();
        return await this.postSaveCaptureAndUpload();
      }

      const player = w.EJS_player;
      if (player) {
        const el = typeof player === 'string' ? document.querySelector(player) : player;
        if (el && typeof (el as any).saveState === 'function') {
          //console.log('[EJS] callEjsSave: using saveState method from EJS_player element');
          await (el as any).saveState();
          return await this.postSaveCaptureAndUpload();
        }
      }

      console.warn('No known save API found for EmulatorJS; save skipped');
      return false;
    } catch (e) {
      console.warn('callEjsSave failed', e);
      this.parentRef?.showNotification('Error during save; please try again later.');
      return false;
    } finally {
      this.stopLoading();
    }
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

  private async uploadSaveBytes(u8: Uint8Array) {
    const core = (window as any).EJS_core || '';
    if (!this.isValidSaveState(u8, core)) {
      console.error('[EJS] Refusing to upload invalid save state');
      this.parentRef?.showNotification('Save state data appears invalid; upload skipped.');
      return false;
    }
    if (!u8?.length) {
      console.warn('[EJS] uploadSaveBytes: no bytes to upload; skipping');
      this.setTmpStatus("No save data captured; upload skipped.");
      return false;
    }
    if (!this.parentRef?.user?.id) {
      console.warn('[EJS] uploadSaveBytes: no user; skipping upload');
      this.setTmpStatus("User not logged in; upload skipped.");
      this.openLoginPanel();
      return false;
    }
    if (!this.romName) {
      console.warn('[EJS] uploadSaveBytes: no rom; skipping upload');
      this.setTmpStatus("ROM not identified; upload skipped.");
      return false;
    }
    this.status = 'Sending Data to Server...';
    if (this._inFlightSavePromise) {
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
          console.error('[EJS] Save upload failed:', res.errorText);
          this.setTmpStatus("Server rejected save upload; please try again.");
          if (!this.isMenuPanelOpen) {
            this.parentRef?.showNotification('Server rejected save upload; please try again.');
          }
          return false;
        }
      } catch (err) {
        console.error('[EJS] Save upload exception:', err);
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
      } catch {}
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
      ['zip', 'wad', 'ccd', 'bin', 'iso', 'cue', 'chd', 'pbp'].forEach(e => set.add(e));
    } catch (err) {
      // Fallback to the previous hardcoded list if anything goes wrong
      return [
        'gba', 'gbc', 'gb', 'nes', 'snes', 'sfc', 'n64', 'z64', 'v64', 'nds',
        'smd', 'gen', 'bin', '32x', 'gg', 'sms', 'md',
        'cue', 'iso', 'chd', 'pbp',
        'pce', 'ngp', 'ngc', 'ws', 'wsc', 'lnx',
        'col', 'a26', 'a78', 'jag',
        'adf', 'd64', 'exe', 'com', 'bat',
        'zip',
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

    // Remove any aspect ratio constraints
    gameEl.style.removeProperty('aspect-ratio');

    // Let CSS handle svh/dvh via @supports; provide a pixel fallback so we still look good
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
      //  game.style.removeProperty('aspect-ratio');
    };

    apply();

    try {
      this._gameSizeObs?.disconnect();
      this._gameSizeObs = new ResizeObserver(() => apply());
      this._gameSizeObs.observe(game);
    } catch { }
    try {
      window.addEventListener('resize', apply, { passive: true });
      window.addEventListener('orientationchange', apply, { passive: true });
      (window as any).visualViewport?.addEventListener?.('resize', apply, { passive: true });
    } catch { }
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
    this.startLoading();
    this.cdr.detectChanges();

    await this.safeExit();
  }

  private async probeForSaveApi(maxMs = 3000): Promise<void> {
    const start = Date.now();

    const pickSave = (obj: any): boolean => {
      try {
        if (obj && typeof obj.saveState === 'function') {
          this._saveFn = async () => { try { await obj.saveState(); } catch { } };
          console.log('[EJS] save API bound from', obj);
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

      // Common patterns seen across EJS skins
      // 1) A button with a data attribute for the action:
      let btn = root.querySelector<HTMLButtonElement>('[data-action="quickSave"]');
      if (btn) return btn;

      // 2) Buttons with a title/aria-label that mentions save
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
        try {
          // Ensure the button is still in the DOM before clicking
          if (document.body.contains(btn)) btn.click();
        } catch { }
      };
      console.log('[EJS] save API bound to Quick Save button');
    } else {
      console.warn('[EJS] Quick Save button not found; cannot bind UI-based save');
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

  private debugDescribePayload(raw: any): void {
    try {
      const t = raw?.constructor?.name ?? typeof raw;
      const keys = raw && typeof raw === 'object' ? Object.keys(raw).slice(0, 12) : [];
      const brief: Record<string, any> = {};
      for (const k of keys) {
        const v = (raw as any)[k];
        brief[k] =
          v instanceof Blob ? `Blob(${(v as Blob).size} bytes)` :
            this.isArrayBuffer(v) ? `ArrayBuffer(${(v as ArrayBuffer).byteLength})` :
              this.isTypedArray(v) ? `TypedArray(${(v as Uint8Array).byteLength})` :
                typeof v === 'string' ? `str(${Math.min(v.length, 64)} chars)` :
                  typeof v;
      }
      console.log('[EJS] payload type:', t, 'keys:', keys, 'peek:', brief);
    } catch { }
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

        // chunks: [...]  -> concat
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

        // array-like
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

      // b64 or data:...;base64,...
      for (const { k, v } of candidates) {
        if (!v) continue;
        if (/^data:.*;base64,/.test(v) || /^[A-Za-z0-9+/=\s]+$/.test(v)) {
          try {
            const u8 = this.base64ToU8(v);
            if (u8.length) { console.log('[EJS] localStorage savestate (b64) at', k, 'bytes=', u8.length); return u8; }
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
            if (u8.length) { console.log('[EJS] localStorage savestate JSON(data[]) at', k, 'bytes=', u8.length); return u8; }
          }
          if (obj && typeof obj.buffer === 'string') {
            const u8 = this.base64ToU8(obj.buffer);
            if (u8.length) { console.log('[EJS] localStorage savestate JSON(buffer b64) at', k, 'bytes=', u8.length); return u8; }
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
      if (best) console.log('[EJS] IDB (localforage) savestate bytes=', best.length);
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

      if (best) console.log('[EJS] IDB savestate bytes=', best.length);
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

      // Heavy cores (PS1, N64, PSP) go through a lengthy BIOS / boot
      // sequence.  The WASM module and gameManager become available long
      // before RetroArch actually finishes loading the ROM + BIOS.
      // Calling gameManager.loadState() before that causes a WASM
      // "function signature mismatch" crash because internal function
      // tables aren't populated yet.  We must wait for the core to
      // report that it supports states before we try.
      const heavyCores = new Set([
        'mednafen_psx_hw', 'pcsx_rearmed', 'duckstation', 'mednafen_psx',
        'mupen64plus_next',
        'psp', 'ppsspp'
      ]);
      const isHeavy = heavyCores.has(core);

      // 1) Wait for EJS_ready to fire (set by the EJS_ready callback).
      //    This guarantees the emulator JS wrapper is ready.
      if (!this._ejsReady) {
        const readyTimeout = isHeavy ? 30000 : 12000;
        const start = Date.now();
        while (!this._ejsReady && Date.now() - start < readyTimeout) {
          await new Promise(r => setTimeout(r, 200));
        }
        if (!this._ejsReady) {
          console.warn('[EJS] Timed out waiting for EJS_ready; cannot apply save state.');
          return false;
        }
      }

      // 2) For heavy cores, wait for the RetroArch core to actually
      //    finish initializing by polling supportsStates().  This
      //    returns 1 only after the core's retro_serialize_size()
      //    works, which means the function tables are populated.
      if (isHeavy) {
        this.status = 'Waiting for core to initialize before restoring save…';
        this.cdr.detectChanges();
        console.log('[EJS] Heavy core detected — polling supportsStates() until core is ready…');

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
          console.warn('[EJS] Core did not report state support within 60 s — trying load anyway…');
        } else {
          console.log(`[EJS] Core reports supportsStates=1 after ${Date.now() - start} ms`);
        }

        // Extra grace period: let a few frames render so the core is
        // fully stable before we inject the state.
        await new Promise(r => setTimeout(r, 2000));
      }

      // 3) Try to load the state, with retries for heavy cores in case
      //    the core needs a little more time.
      const maxRetries = isHeavy ? 10 : 5;
      const retryDelayMs = 3000;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (this._destroyed) return false;

        try {
          // Prefer gameManager.loadState (writes to FS, calls WASM)
          const gm = await this.waitForGameManager(2000);
          if (gm && typeof gm.loadState === 'function') {
            gm.loadState(u8);
            console.log(`[EJS] Loaded state via gameManager.loadState (attempt ${attempt})`);
            this.status = 'Running';
            this.cdr.detectChanges();
            return true;
          }

          // Fallback: global EJS_loadState
          const w = window as any;
          if (typeof w.EJS_loadState === 'function') {
            await Promise.resolve(w.EJS_loadState(u8));
            console.log(`[EJS] Loaded state via EJS_loadState (attempt ${attempt})`);
            this.status = 'Running';
            this.cdr.detectChanges();
            return true;
          }

          console.warn('[EJS] No load API available; could not apply save state.');
          this.status = 'Running';
          this.cdr.detectChanges();
          return false;
        } catch (e) {
          console.warn(`[EJS] loadState attempt ${attempt}/${maxRetries} failed:`, e);
          if (attempt < maxRetries) {
            this.status = `Save restore failed, retrying… (${attempt}/${maxRetries})`;
            this.cdr.detectChanges();
            await new Promise(r => setTimeout(r, retryDelayMs));
          }
        }
      }

      console.warn('[EJS] All loadState attempts exhausted; save state not loaded.');
      this.parentRef?.showNotification('Could not restore save state; starting game without it.');
      this.status = 'Running';
      this.cdr.detectChanges();
      return false;
    } catch (e) {
      console.warn('[EJS] applySaveStateIfAvailable failed', e);
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
            console.log('[EJS] uploaded & cleared pending save for', rec.romName);
          } else {
            console.warn('[EJS] failed to upload pending save:', res.errorText);
          }
        } catch (e) { console.warn('[EJS] uploadPendingSavesOnStartup error', e); }
      }
    } catch (e) { console.warn('[EJS] uploadPendingSavesOnStartup failed', e); }
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
  private getRenderClampForCore(core: string) {
    if (core === "psp" || core === "ppsspp") {
      return { maxW: 640, maxH: 360, maxDPR: 1.0 };
    }
    const heavy = new Set([
      'mednafen_psx_hw', 'pcsx_rearmed', 'duckstation', 'mupen64plus_next'
    ]);
    if (heavy.has(core)) return { maxW: 1280, maxH: 720, maxDPR: 1.5 };
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

      const core = String(coreRaw).toLowerCase();
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
      console.warn('[EJS] resizeCanvasBuffer failed', e);
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
    if (canvas) this.resizeCanvasBuffer();
    this.bindResizeBuffer();
  }

  /** Bind resize handlers (call once after emulator is initialized). */
  private bindResizeBuffer() {
    const apply = () => this.resizeCanvasBuffer();
    this._onResize = () => apply();
    this._onOrientation = () => apply();
    this._onVVResize = () => apply();

    // Passive listeners to avoid blocking 
    window.addEventListener('resize', this._onResize, { passive: true });
    window.addEventListener('orientationchange', this._onOrientation, { passive: true });
    (window as any).visualViewport?.addEventListener?.('resize', this._onVVResize, { passive: true });


    // Also observe the #game element for layout changes (optional)
    try {
      const gameEl = document.getElementById('game');
      if (gameEl && typeof ResizeObserver !== 'undefined') {
        if (this._gameSizeObs) this._gameSizeObs.disconnect();
        this._gameSizeObs = new ResizeObserver(() => apply());
        this._gameSizeObs.observe(gameEl);
      }
    } catch { /* ignore */ }

    // Initial call after a short delay so DOM settles
    setTimeout(() => this.resizeCanvasBuffer(), 300);
  }

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
      console.warn('[EJS] Save state is empty → skipping upload');
      this.parentRef?.showNotification('Save state is empty; upload skipped');
      return false;
    }

    // All-zero = definitely corrupt/empty
    if (u8.every(b => b === 0)) {
      console.warn('[EJS] Save state is all zeros → skipping upload');
      this.parentRef?.showNotification('Save state appears to be empty/corrupt (all zeros); upload skipped');
      return false;
    }

    const min = this.MIN_STATE_SIZE[core] ?? 4 * 1024; // safe default
    if (length < min) {
      console.warn(`[EJS] Save state too small for core ${core} (${length} bytes < ${min}) → skipping`);
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

  private loadPreferredCore(ext: string): string | null {
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
    const confirm = window.confirm(
      `Are you sure you want to reset the game? 
      \nThe next save will overwrite your current progress.`);
    if (confirm) {
      const skipSave = window.confirm("Reset without any save state?");
      this.fullReloadToEmulator(this.getReloadParamsSkipSave(skipSave));
    }
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

  private getReloadParamsSkipSave(skipSave = true): Record<string, string> {
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
    setTimeout(async () => {
      await this.fileSearchComponent?.getDirectory();
      this.cdr.detectChanges();
    }, 250);
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

  applyPSPCoreSettings(w: any) {
    w.EJS_vsync = false;
    w.EJS_GL_Options = {
      alpha: false,
      antialias: false,
      depth: true
    };

    // ── Force our defaults by disabling localStorage for PSP ──
    // EmulatorJS's getCoreSettings() lets localStorage override EJS_defaultOptions.
    // For PSP, performance settings are critical — we MUST force them every time.
    w.EJS_disableLocalStorage = true;

    // ── PPSSPP performance-critical core options ──
    // These MUST be set before loader.js runs so the core starts with them.
    // Use the centralized map so tests/tweaks remain in a single place.
    w.EJS_defaultOptions = Object.assign({}, PSP_DEFAULT_OPTIONS);
    w.EJS_defaultOptionsForce = true;
  }

  async applyPSPPerformanceTweak() {
    const core = (window as any).EJS_core;
    if (core !== 'psp' && core !== 'ppsspp') return;
    setTimeout(() => { void this.stabilizePspCanvasSize(2000); }, 500);
    console.log('%c[PSP] Applying post-boot performance tweaks…', 'color:#4af');

    // 1️⃣ Canvas downscaling — prevent GPU upscaling work
    requestAnimationFrame(() => {
      try {
        const canvas = document.querySelector('#game canvas') as HTMLCanvasElement;
        if (!canvas) return;
        canvas.style.imageRendering = 'pixelated';
        canvas.style.maxWidth = '95vw';
        canvas.style.maxHeight = '95vh';
      } catch { }
    });

    // 2️⃣ Force devicePixelRatio to 1 for PSP (big win on high-DPI screens)
    // try {
    //   if (window.devicePixelRatio > 1) {
    //     (window as any).__ORIGINAL_DPR__ = window.devicePixelRatio;
    //     Object.defineProperty(window, 'devicePixelRatio', {
    //       get() { return 1; },
    //       configurable: true
    //     });
    //   }
    // } catch { }

    // 3️⃣ Clamp render buffer
    (window as any).EJS_renderClamp = { maxW: 640, maxH: 360, maxDPR: 1.0 };

    // 4️⃣ Activate fast-forward + disable vsync directly via gameManager APIs
    //    (these are EJS-level controls, not core variables — must use the direct methods)
    try {
      const emu = (window as any).EJS_emulator ?? this.emulatorInstance;

      const ejs = (window as any).EJS_emulator || (window as any).EJS;

      const gm = await this.waitForGameManager(5000);


      if (gm) {
        const opts = PSP_DEFAULT_OPTIONS;
        // fast-forward ratio
        if (typeof gm.setFastForwardRatio === 'function') {
          try {
            const v = opts['ff-ratio'];
            if (v === 'unlimited') gm.setFastForwardRatio(0);
            else if (!isNaN(Number(v))) gm.setFastForwardRatio(Number(v));
          } catch { }
        }
        // toggle fast-forward
        if (typeof gm.toggleFastForward === 'function') {
          try {
            if (opts['fastForward'] === 'enabled') gm.toggleFastForward(1);
          } catch { }
          if (emu) emu.isFastForward = true;
          console.log('[PSP] Fast-forward enabled (per options)');
        }
        // set vsync
        if (typeof gm.setVSync === 'function') {
          try { gm.setVSync(opts['vsync'] === 'disabled' ? false : true); } catch { }
          console.log('[PSP] VSync set (per options)');
        }
        // Push core variables (skip EmulatorJS-level controls)
        if (typeof gm.setVariable === 'function' || typeof gm === 'object') {
          for (const [k, v] of Object.entries(opts)) {
            if (k === 'fastForward' || k === 'ff-ratio' || k === 'vsync') continue;
            try { gm.setVariable(k, String(v)); } catch { }
          }
          console.log('[PSP] Core variables pushed via gameManager');
        }
      }
    } catch { }

    console.log('%c[PSP] Post-boot tweaks applied ✔', 'color:#4f4');
  }


  private CORE_REGISTRY: CoreDescriptor[] = [];   // instance-level

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
      'iso', 'bin', 'cue', 'chd', 'img', 'ccd', 'mdf', 'mds', 'nrg'
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
      { core: 'pcsx_rearmed', label: 'PlayStation (PS1)', exts: uniq(['bin', 'cue', 'chd']), maybeExts: plus(['iso', 'img', 'ccd', 'mdf', 'mds', 'nrg'], exPS1), hints: [/SLUS\d{5}/i, /SLES\d{5}/i, /\bPSX\b|\bPS1\b|\bPlayStation\b/i] },

      // --- Sega ---
      { core: 'genesis_plus_gx', label: 'Sega Mega Drive / Genesis', exts: exGEN, maybeExts: ['bin'], hints: [/\bGENESIS\b|\bMEGADRIVE\b|\bMD\b/i] },
      { core: 'genesis_plus_gx', label: 'Sega CD / Mega‑CD', exts: [], maybeExts: exSAT, hints: [/\bSEGA\s?CD\b|\bMEGA\s?CD\b/i] },
      { core: 'picodrive', label: 'Sega 32X', exts: ['32x'], maybeExts: [], hints: [/\b32X\b/i] },
      { core: 'yabause', label: 'Sega Saturn', exts: [], maybeExts: exSAT, hints: [/\bSATURN\b/i, /\bT-\d{4}/i, /\bMK-\d{4}/i] },

      // --- 3DO ---
      { core: 'opera', label: '3DO', exts: [], maybeExts: ex3DO, hints: [/\b3DO\b/i] },

      // --- Nintendo ---
      { core: 'mupen64plus_next', label: 'Nintendo 64', exts: exN64, maybeExts: [], hints: [/\bN64\b/i] },
      { core: 'melonds', label: 'Nintendo DS (melonDS)', exts: exNDS, maybeExts: [], hints: [/\bNDS\b|\bDS\b/i] },
      { core: 'desmume', label: 'Nintendo DS (DeSmuME)', exts: exNDS, maybeExts: [], hints: [/\bNDS\b|\bDS\b/i] },
      { core: 'mgba', label: 'Game Boy Advance', exts: exGBA, maybeExts: [], hints: [/\bGBA\b/i] },
      { core: 'gambatte', label: 'Game Boy / Game Boy Color', exts: exGBx, maybeExts: [], hints: [/\bGBC\b|\bGB\b/i] },
      { core: 'fceumm', label: 'NES / Famicom', exts: exNES, maybeExts: [], hints: [/\bNES\b|\bFAMICOM\b/i] },
      { core: 'snes9x', label: 'SNES / Super Famicom', exts: plus(exSNES, exSNESExtra), maybeExts: [], hints: [/\bSNES\b|\bSFC\b/i] },

      { core: 'mednafen_vb', label: 'Virtual Boy', exts: ['vb', 'vboy'], maybeExts: [], hints: [/\bVIRTUAL\s?BOY\b|\bVB\b/i] },

      // --- Arcade ---
      { core: 'mame2003_plus', label: 'Arcade (MAME 2003+)', exts: exArc, maybeExts: exArcMaybe, hints: [/\bMAME\b|\bARCADE\b/i] },
      { core: 'fbneo', label: 'Arcade (FBNeo)', exts: exArc, maybeExts: exArcMaybe, hints: [/\bFBNEO\b|\bNEOGEO\b/i] },

      // --- Atari ---
      { core: 'stella2014', label: 'Atari 2600', exts: ['a26'], maybeExts: ['zip'], hints: [/\b2600\b/i] },
      { core: 'prosystem', label: 'Atari 7800', exts: ['a78'], maybeExts: ['zip'], hints: [/\b7800\b/i] },
      { core: 'handy', label: 'Atari Lynx', exts: ['lnx'], maybeExts: ['zip'], hints: [/\bLYNX\b/i] },
      { core: 'virtualjaguar', label: 'Atari Jaguar', exts: ['jag'], maybeExts: ['zip'], hints: [/\bJAGUAR\b/i] },

      // --- Coleco / Commodore / Amiga ---
      { core: 'gearcoleco', label: 'ColecoVision', exts: ['col'], maybeExts: ['zip'], hints: [/\bCOLECO\b/i] },
      { core: 'vice_x64', label: 'Commodore 64', exts: ['d64'], maybeExts: [], hints: [/\bC64\b/i] },
      { core: 'puae', label: 'Commodore Amiga', exts: ['adf'], maybeExts: [], hints: [/\bAMIGA\b/i] },

      // --- Experimental (available only if you actually ship the WASM core files) ---
      { core: 'flycast', label: 'Sega Dreamcast (Flycast) — experimental', exts: exDC, maybeExts: [], hints: [/\bDREAMCAST\b|\bNAOMI\b/i] },  // WASM port required [6](https://github.com/nasomers/flycast-wasm)
      { core: 'vitaquake3', label: 'Quake III Arena (vitaQuake 3)', exts: exQ3, maybeExts: [], hints: [/pak0\.pk3/i] }, // loads *.pk3 [2](https://sources.debian.org/src/libretro-core-info/1.14.0-1/vitaquake3_libretro.info/)
    ];
  }

  /** Central place for ambiguous extensions (chooser-first). */
  private readonly AMBIGUOUS_EXTS = new Set<string>([
    'zip', '7z', 'bin', 'cue', 'iso', 'chd', 'img', 'ccd', 'mdf', 'mds', 'nrg', 'gdi', 'cdi'
  ]);


  private isAmbiguousFile(fileName: string): boolean {
    const ext = this.normExt(fileName, n => this.fileService.getFileExtension(n));
    return this.AMBIGUOUS_EXTS.has(ext);
  }


  private getSystemCandidatesForFile(fileName: string): SystemCandidate[] {
    const ext = this.normExt(fileName, n => this.fileService.getFileExtension(n));

    const candidates: SystemCandidate[] = [
      { label: 'Auto-detect (recommended)', core: undefined }
    ];

    // Add registry matches for this ext. If the file is a .zip, offer all possible systems
    // because zip archives can contain many different ROM types.
    let matches = [] as { label: string; core?: string }[];
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
    let guessedCore: string | null = null;

    try {
      const guessedSystem = this.romService?.guessSystemFromFileName(fileName);
      guessedCore = this.systemToCore(guessedSystem);
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


  private detectCoreEnhanced(fileName: string, forcedCore?: string): string {
    if (forcedCore) return forcedCore;

    const ext = this.normExt(fileName, n => this.fileService.getFileExtension(n));

    // 1) Confident extension mapping (fast path)
    for (const entry of this.CORE_REGISTRY) {
      if (entry.exts?.includes(ext)) return entry.core;
    }

    // 2) Ambiguous extensions: use your existing guesser + registry hints 
    const ambiguousExts = new Set(this.CORE_REGISTRY.flatMap(e => e.maybeExts ?? []));
    for (const s of this.AMBIGUOUS_EXTS) {
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
  private systemToCore(guessed?: string | null): string | null {
    const g = (guessed || '').toLowerCase();
    switch (g) {
      case 'psp': return 'psp';
      case 'ps1':
      case 'psx': return 'pcsx_rearmed';
      case 'saturn': return 'yabause';
      case 'segacd':
      case 'sega_cd': return 'genesis_plus_gx';
      case 'genesis':
      case 'megadrive': return 'genesis_plus_gx';
      case '3do': return 'opera';
      case 'n64': return 'mupen64plus_next';
      case 'nds': return 'melonds';
      case 'snes': return 'snes9x';
      case 'nes': return 'fceumm';
      case 'gba': return 'mgba';
      case 'gb':
      case 'gbc': return 'gambatte';
      case 'vb': return 'mednafen_vb';
      default: return null;
    }
  }

  normExt(fileName: string, getExt: (n: string) => string): string {
    return (getExt(fileName) || '').toLowerCase().trim().replace(/^\./, '');
  }

  normCore(core?: string | null): string {
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

  // Confirm selection from system-chooser popup and proceed to load
  confirmSystemSelection() {
    if (!this._pendingFileToLoad) return;
    const pending = this._pendingFileToLoad;
    // ★ Capture the selected core BEFORE closeOverlay().
    //   closeOverlay() finds #closeOverlay buttons and clicks them, which triggers
    //   cancelSystemSelection() and would clear selectedSystemCore.
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
    void this.loadRomThroughService(pending.fileName, pending.fileId, pending.directory, forced).then(() => {
      this.status = 'Running';
      this.cdr.detectChanges();
    }).catch(e => {
      this.status = 'Error loading emulator';
      console.error(e);
      this.cdr.detectChanges();
    });
  }

  cancelSystemSelection() {
    // Guard: if _pendingFileToLoad is already null, confirmSystemSelection already
    // handled this — don't clobber state (closeOverlay clicks #closeOverlay buttons).
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

  setLoaderFileLocation(s: HTMLScriptElement) {
    // const useCdn = (window.EJS_core === 'psp'
    //   || window.EJS_core === 'ppsspp'
    //   || window.EJS_core === 'yabause'
    //   || window.EJS_core === 'sega_saturn'
    //   || window.EJS_core === 'segaSaturn'
    // );

    // s.src = useCdn
    //   ? 'https://cdn.emulatorjs.org/stable/data/loader.js'
    //   : '/assets/emulatorjs/data/loader.js';
    s.src = '/assets/emulatorjs/data/loader.js';
  }

  /**
   * Map our internal core id to the EmulatorJS "control scheme" system key.
   * EmulatorJS resolves the control scheme via getCore(true) which iterates
   * getCores() and picks the FIRST system whose core-list contains the value.
   * For genesis_plus_gx this incorrectly lands on "segaMS" (Master System,
   * 2 buttons) instead of "segaMD" (Mega Drive, 6 buttons).
   * By explicitly returning the right key here we bypass that ambiguity.
   */
  private ejsControlSchemeForCore(core: string): string | undefined {
    switch (core) {
      case 'genesis_plus_gx': return 'segaMD';
      case 'picodrive': return 'sega32x';
      case 'yabause': return 'segaSaturn';
      case 'smsplus': return 'segaMS';
      default: return undefined; // let EmulatorJS derive it
    }
  }

  setCoreAndDataFileLocations(core: string) {
    // if (core === 'psp'
    //   || core === 'ppsspp'
    //   || core === 'yabause'
    //   || core === 'sega_saturn'
    //   || core === 'segaSaturn') {
    //   window.EJS_pathtodata = "https://cdn.emulatorjs.org/stable/data/";
    //   window.EJS_coreUrl = "https://cdn.emulatorjs.org/stable/data/cores/";
    // } else {
    //   window.EJS_pathtodata = "/assets/emulatorjs/data/";
    //   window.EJS_coreUrl = "/assets/emulatorjs/data/cores/";
    // }

    window.EJS_pathtodata = "/assets/emulatorjs/data/";
    window.EJS_coreUrl = "/assets/emulatorjs/data/cores/";
  }

}

type SystemCandidate = { label: string; core?: string };



type CoreId = string;

type CoreDescriptor = {
  core: CoreId;
  label: string;
  // extensions that are confidently this system
  exts?: string[];
  // extensions that might be this system (only used for chooser)
  maybeExts?: string[];
  // filename heuristics to “bubble up” this candidate for ambiguous files
  hints?: RegExp[];
};

declare global {
  interface Window {
    EJS_player?: string | HTMLElement;
    EJS_core?: string;
    EJS_controlScheme?: string;
    EJS_pathtodata?: string;
    EJS_coreUrl?: string;
    EJS_biosUrl?: string;
    EJS_gameUrl?: string;
    EJS_softLoad?: boolean;
    EJS_gameID?: number;
    EJS_gameIDKey?: string;
    EJS_gameName?: string;
    EJS_gameParent?: string;
    EJS_language?: string;
    EJS_startOnLoaded?: boolean;
    EJS_fullscreenOnLoad?: boolean;
    EJS_fullscreenOnLoaded?: boolean;
    EJS_fullscreen?: boolean;
    EJS_paths?: { [key: string]: string };
    EJS_volume?: number;
    EJS_threads?: boolean;
    EJS_netplayServer?: string;
    EJS_netplayUrl?: string;
    EJS_netplayICEServers?: any;
    EJS_maxThreads?: number;
    EJS_color?: string;
    EJS_backgroundColor?: string;
    EJS_backgroundImage?: string;
    EJS_lightgun?: boolean;
    EJS_onSaveState?: (state: Uint8Array) => void;
    EJS_onLoadState?: () => void;
    __ejsLoaderInjected?: boolean;
    __EJS_ALIVE__?: boolean;
    EJS_defaultOptionsForce?: boolean;
    EJS_defaultOptions?: Record<string, string | number>;
    EJS_disableLocalStorage?: boolean;
    EJS_directKeyboardInput?: boolean;
    EJS_enableGamepads?: boolean;
    EJS_disableAltKey?: boolean;
    EJS_webrtcConfig?: any;
    EJS_iceServers?: any;
    EJS_DEBUG_XX?: boolean;
    EJS_EXPERIMENTAL_NETPLAY?: boolean;
    EJS_logCoreInfo?: boolean;
    EJS_logSaves?: boolean;
    EJS_logVideo?: boolean;
    EJS_logAudio?: boolean;
    EJS_logInput?: boolean;
    EJS_vsync?: boolean;
    EJS_VirtualGamepadSettings?: any;
    EJS_defaultControls?: any;
    EJS_GL_Options?: any;
    EJS?: any;
    EJS_emulator?: any;
    EJS_Buttons?: any;
    EJS_GameManager?: any;
    __EJS__?: any;
    EJS_afterStart?: () => void;
    EJS_ready?: (api: any) => void;
  }
}

type VPadItem =
  | {
    type: 'button';
    text: string;
    id?: string;
    location: 'left' | 'right' | 'center' | 'top';
    left?: number;     // px number
    right?: number;    // px number
    top?: number;      // px number
    fontSize?: number; // px number
    bold?: boolean;
    block?: boolean;
    input_value: number;
  }
  | {
    type: 'dpad';
    location: 'left' | 'right' | 'center' | 'top';
    left?: string;     // percent string: '8%'
    right?: string;    // percent string
    joystickInput?: boolean;
    inputValues: [number, number, number, number];
  }
  | {
    type: 'zone';
    location: 'left' | 'right' | 'center' | 'top';
    left?: string;     // percent string
    right?: string;    // percent string
    top?: string;      // percent string
    joystickInput: true;
    color?: string;
    inputValues: [number, number, number, number];
  };

type System =
  | 'nes' | 'gb' | 'gbc' | 'gba'
  | 'snes'
  | 'genesis'
  | 'nds'
  | 'psp'
  | 'saturn'
  | 'sega_cd'
  | '3do'
  | 'n64'
  | 'ps1';


interface BuildOpts {
  useJoystick: boolean;   // your toggle
  showControls?: boolean; // if false, return [] to hide
  twoButtonMode?: boolean;// enlarge A/B (NES/GB/GBC, optionally GBA)
  buttonSize?: number;    // base size tuning knob (default 65~70 visual)
  genesisSix?: boolean;   // ⟵ add this
}

const GENESIS_6BUTTON = new Set([
  "street-fighter-2-special-champion-edition",
  "super-street-fighter-2",
  "mortal-kombat-2",
  "mortal-kombat-3",
  "ultimate-mk3",
  "eternal-champions",
  "samurai-shodown",
  "weaponlord",
  "fatal-fury-2",
  "fatal-fury-special",
  "art-of-fighting",
  "comix-zone",
  "splatterhouse-3",
  "ranger-x"
]);

const GENESIS_FORCE_THREE = new Set<string>([
  "forgotten-worlds",
  "golden-axe-ii",
  "ms-pac-man"
]);

const PSP_DEFAULT_OPTIONS: Record<string, string> = {
  // EmulatorJS-level speed settings
  'rewindEnabled': 'Disabled',
  // 'fastForward':                    'enabled',
  // 'ff-ratio':                       'unlimited',
  'vsync': 'Disabled',

  // PPSSPP core options
  'ppsspp_cpu_core': 'JIT',
  'ppsspp_fast_memory': 'enabled',
  // 'ppsspp_ignore_bad_memory_access':'enabled',
  // 'ppsspp_io_timing_method':        'Fast',
  // 'ppsspp_force_lag_sync':          'disabled',
  'ppsspp_locked_cpu_speed': '333MHz',

  // Frameskip
  // 'ppsspp_frameskip':               '5',
  // 'ppsspp_frameskiptype':           'Number of frames',
  // 'ppsspp_auto_frameskip':          'enabled',
  // 'ppsspp_frame_duplication':       'enabled',

  // Resolution
  'ppsspp_internal_resolution': '480x272',
  'ppsspp_software_rendering': 'disabled',

  // GPU shortcuts
  // 'ppsspp_skip_buffer_effects':     'disabled',
  // 'ppsspp_skip_gpu_readbacks':      'disabled',
  'ppsspp_lazy_texture_caching': 'enabled',
  // 'ppsspp_disable_range_culling':   'disabled',
  // 'ppsspp_lower_resolution_for_effects': 'disabled',

  // Texture quality
  // 'ppsspp_texture_anisotropic_filtering': 'disabled',
  // 'ppsspp_texture_filtering':       'Nearest',
  // 'ppsspp_texture_scaling_level':   'disabled',
  // 'ppsspp_texture_scaling_type':    'xbrz',
  // 'ppsspp_texture_deposterize':     'disabled',
  // 'ppsspp_texture_shader':          'disabled',
  // 'ppsspp_smart_2d_texture_filtering':'disabled',
  // 'ppsspp_texture_replacement':     'disabled',

  // Spline / tesselation
  // 'ppsspp_spline_quality':          'Low',
  // 'ppsspp_hardware_tesselation':    'disabled',

  // Rendering pipeline
  'ppsspp_gpu_hardware_transform': 'enabled',
  // 'ppsspp_software_skinning':       'enabled',
  // 'ppsspp_inflight_frames':         'Up to 2',
  // 'ppsspp_detect_vsync_swap_interval':'disabled',
  //'ppsspp_backend': 'vulkan',
  // 'ppsspp_mulitsample_level':       'Disabled',
  // 'ppsspp_cropto16x9':              'enabled',

  // Misc
  // 'ppsspp_memstick_inserted':       'enabled',
  // 'ppsspp_cache_iso':               'enabled',
  // 'ppsspp_cheats':                  'disabled',
  // 'ppsspp_psp_model':               'psp_2000_3000',
  // 'ppsspp_language':                'Automatic',
  // 'ppsspp_button_preference':       'Cross',
  // 'ppsspp_analog_is_circular':      'disabled',
  // 'ppsspp_enable_wlan':             'disabled',
};
