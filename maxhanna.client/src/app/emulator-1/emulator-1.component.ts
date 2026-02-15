
import { AfterViewInit, ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { RomService } from '../../services/rom.service';
import { FileService } from '../../services/file.service';
import { FileSearchComponent } from '../file-search/file-search.component';

@Component({
  selector: 'app-emulator-1',
  templateUrl: './emulator-1.component.html',
  styleUrl: './emulator-1.component.css',
  standalone: false
})
export class Emulator1Component extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild(FileSearchComponent) fileSearchComponent?: FileSearchComponent;

  isMenuPanelOpen = false;
  isFullScreen = false;
  romName?: string;
  isFileUploaderExpanded = false;
  isFaqOpen = false;
  faqItems: { question: string; answerHtml: string; expanded: boolean }[] = [
    {
      question: "My controller is connected but doesn't work—what should I do?",
      answerHtml: `Unpair all controllers from the PC, then pair and test one controller at a time. Multiple paired controllers or leftover Bluetooth pairings can cause input routing conflicts. Also try restarting the browser after pairing.`,
      expanded: false
    },
    {
      question: "I don't hear any audio from the game.",
      answerHtml: `Check that the browser tab isn't muted, confirm the correct audio output device is selected in your OS, and ensure the emulator volume (in the menu) is not set to zero.`,
      expanded: false
    },
    {
      question: "Save states aren't persisting between sessions.",
      answerHtml: `Make sure you're logged in and that autosave is enabled. If autosave is off, use the manual save option before closing. Network interruptions can prevent saves from reaching the server.`,
      expanded: false
    },
    {
      question: "The game runs slowly or stutters.",
      answerHtml: `Close other heavy apps/tabs, enable hardware acceleration in your browser, and try reducing the emulator rendering resolution if available.`,
      expanded: false
    },
    {
      question: "What games/systems are available?",
      answerHtml: `Available systems include:<ul>
        <li><strong>Nintendo</strong>: Game Boy Advance, Famicom / NES, Virtual Boy, Game Boy, SNES, DS, N64</li>
        <li><strong>Sega</strong>: Master System, Mega Drive / Genesis, Game Gear, Saturn, 32X, CD</li>
        <li><strong>Atari</strong>: 2600, 5200, 7800, Lynx, Jaguar</li>
        <li><strong>Commodore</strong>: Commodore 64, Commodore 128, Amiga, PET, Plus/4, VIC-20</li>
        <li><strong>Other</strong>: PlayStation, PlayStation Portable (PSP), Arcade (MAME/3DO/MAME2003/ColecoVision)</li>
      </ul>
      Note: Not every ROM for every system may be available — the list above shows supported systems; available games depend on what has been uploaded to the Roms directory.`,
      expanded: false
    }
  ];
  isSearchVisible = true;
  autosave = true;
  autosaveIntervalTime: number = 180000; // 3 minutes 
  showControls = true;     // show/hide on-screen controls
  useJoystick = false;     // D-pad (false) vs analog "zone" (true)
  segaShowLR = true;       // show L/R pills on Genesis when desired
  status: string = 'Idle';
  private autosaveInterval: any;
  private romObjectUrl?: string;
  private emulatorInstance?: any;
  private _destroyed = false;
  private _pendingSaveResolve?: (v?: any) => void;
  private _pendingSaveTimer?: any;
  private _captureSaveResolve?: (u8: Uint8Array | null) => void;
  private _gameSizeObs?: ResizeObserver;
  private _gameAttrObs?: MutationObserver;
  private _saveFn?: () => Promise<void>;
  private _autosaveKick?: any;
  private _lastSaveTime: number = 0;
  private _saveInProgress: boolean = false;
  private _inFlightSavePromise?: Promise<boolean>;
  private _exiting = false;

  constructor(
    private romService: RomService,
    private fileService: FileService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  ngOnInit(): void {
    if (this.parentRef) {
      this.parentRef.preventShowSecurityPopup = true;
    }
  }

  async ngAfterViewInit() {
    // EmulatorJS will be initialized when a ROM is selected
    this.status = 'Ready - Select a ROM';
    this.cdr.detectChanges();
    // listen for fullscreen changes to keep UI state in sync
    document.addEventListener('fullscreenchange', this.onFullscreenChangeBound);
    document.addEventListener('webkitfullscreenchange', this.onFullscreenChangeBound as any);
  }


  async ngOnDestroy(): Promise<void> {
    this._destroyed = true;
    try { this.clearAutosave(); } catch { }
    if (this.parentRef) {
      this.parentRef.preventShowSecurityPopup = false;
      try {
        let shouldSave = false;
        if (this.romName && this.parentRef?.user?.id) {
          // If the user saved recently (within 10s), skip prompting and skip save.
          if (Date.now() - this._lastSaveTime < 10000) {
            shouldSave = false;
          } else {
            shouldSave = window.confirm('Save emulator state before closing?');
          }
        }

        if (shouldSave && this.romName && this.parentRef?.user?.id) {
          try {
            const u8 = await this.captureSaveOnce(8000);
            if (u8 && u8.length) {
              await this.savePendingState(this.parentRef.user.id, this.romName, u8);
              console.log('[EJS] pending save stored locally for background upload');
            } else {
              console.warn('[EJS] captureSaveOnce timed out or returned no data');
            }
          } catch (e) {
            console.warn('[EJS] exit save capture failed', e);
          }
          finally {
            window.location.replace('/');
          }
        } else {
          window.location.replace('/');
        }
      } catch {
        window.location.replace('/');
      }
    } else {
      window.location.replace('/');
    }
  }

  async onRomSelected(file: FileEntry) {
    try {
      await this.loadRomThroughService(file.fileName!, file.id);
      this.status = 'Running';
    } catch (err) {
      this.status = 'Error loading emulator';
      console.error(err);
    } finally {
      this.cdr.detectChanges();
    }
  }

  private async loadRomThroughService(fileName: string, fileId?: number) {
    if (window.__ejsLoaderInjected) {
      return this.fullReloadToHome();
    }

    this.startLoading();
    this.isSearchVisible = false;
    this.status = "Loading Rom - " + this.fileService.getFileWithoutExtension(fileName);
    this.cdr.detectChanges();

    // 1) Fetch ROM via your existing API
    const romBlobOrArray = await this.romService.getRomFile(fileName, this.parentRef?.user?.id, fileId);

    // 2) Normalize to Blob
    let romBlob: Blob;
    if (romBlobOrArray instanceof Blob) {
      romBlob = romBlobOrArray;
    } else {
      this.stopLoading();
      throw new Error('getRomFile errored: expected Blob response');
    }

    // 3) Create a blob: URL and remember it for cleanup
    if (this.romObjectUrl) {
      URL.revokeObjectURL(this.romObjectUrl);
    }
    this.romObjectUrl = URL.createObjectURL(romBlob);
    this.romName = fileName;

    // 4) Try to load existing save state from database
    const saveStateBlob = await this.loadSaveStateFromDB(fileName);

    // 5) Configure EmulatorJS globals BEFORE adding loader.js
    const core = this.detectCore(fileName);
    window.EJS_core = core;

    this.ensureTouchOverlaySizingCss();
    const system = this.systemFromCore(core);
    window.EJS_VirtualGamepadSettings = this.buildTouchLayout(system, {
      useJoystick: this.useJoystick,
      showControls: this.showControls,
      twoButtonMode: (system === 'nes' || system === 'gb' || system === 'gbc'), // big A/B on 2‑button systems
      segaShowLR: this.segaShowLR
    });

    // For PlayStation and N64 cores, increase autosave interval to 10 minutes
    // to reduce upload frequency for large save files (e.g. PS1 saves).
    const longIntervalCores = new Set([
      'mupen64plus_next', // N64
      'mednafen_psx_hw', 'pcsx_rearmed', 'duckstation', 'mednafen_psx' // PSX variants
    ]);
    if (longIntervalCores.has(core)) {
      this.autosaveIntervalTime = 10 * 60 * 1000; // 10 minutes
    } else {
      this.autosaveIntervalTime = 3 * 60 * 1000; // default 3 minutes
    }
    window.EJS_player = "#game";
    window.EJS_pathtodata = "/assets/emulatorjs/data/";
    window.EJS_coreUrl = "/assets/emulatorjs/data/cores/";

    // ❗ BIOS: set ONLY if required by the selected core; otherwise blank
    window.EJS_biosUrl = this.getBiosUrlForCore(core) ?? "";  // <— key fix
    window.EJS_softLoad = false; // TEMP: ensure full boot path for every run
    window.EJS_gameUrl = this.romObjectUrl;
    window.EJS_gameID = `${core}:${this.fileService.getFileWithoutExtension(fileName)}`;
    window.EJS_gameName = this.fileService.getFileWithoutExtension(this.romName ?? '');
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


    this.applyEjsRunOptions();
    // If the build calls back with the instance, capture it early
    (window as any).EJS_ready = (api: any) => {
      try {
        this.emulatorInstance = api || (window as any).EJS || (window as any).EJS_emulator || this.emulatorInstance;
        if (this.emulatorInstance?.saveState) {
          this._saveFn = async () => { try { await (this.emulatorInstance as any).saveState(); } catch { } };
        }
        console.log('[EJS] instance ready hook fired, has saveState?', !!this._saveFn);
      } catch { }
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
        s.src = `/assets/emulatorjs/data/loader.js`;
        s.async = false;
        s.defer = false;
        s.setAttribute('data-ejs-loader', '1');
        s.onload = () => {
          window.__ejsLoaderInjected = true;
          requestAnimationFrame(() => {
            this.setGameScreenHeight();
            // a second rAF can make it even smoother: 
            requestAnimationFrame(async () => {
              await this.waitForEmulatorAndFocus();
              await this.probeForSaveApi();
              this.tryBindSaveFromUI();
              try {
                const ok = await this.applySaveStateIfAvailable(saveStateBlob);
                if (ok) {
                  console.log('[EJS] Auto-restored previous session');
                }
              } catch {
                console.warn('[EJS] Unable to apply save state on startup');
              }
              this.lockGameHostHeight();
              this.inspectVPadOnce(); //debug vpad layout on startup, can remove after confirming stable
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
      this.fullReloadToHome();
      return;
    }

    if (saveStateBlob) {
      console.log('Save state loaded from database');
    }
    this.status = 'Running';
    this.stopLoading();
    this.cdr.detectChanges();
  }

  /** Show only Quick Save/Load so we can programmatically trigger saves. */
  private hideEJSMenu() {
    (window as any).EJS_Buttons = {
      playPause: false,
      restart: false,
      mute: false,
      settings: false,
      fullscreen: false,
      saveState: false,
      loadState: false,
      screenRecord: false,
      gamepad: false,
      cheat: false,
      volume: false,
      quickSave: true,
      quickLoad: true,
      screenshot: false,
    };
  }


  /**
   * Return a BIOS/firmware URL when the selected core requires one.
   * Return `undefined` when no BIOS is required (caller will fall back to empty string).
   * Keep this list minimal and explicit — prefer per-ROM overrides for unusual cases.
   */
  private getBiosUrlForCore(core: string): string | undefined {
    switch (core) {
      // PlayStation (common BIOS used by many PS1 cores)
      case 'mednafen_psx_hw':
      case 'pcsx_rearmed': // if you ever switch PSX cores
      case 'duckstation':
      case 'mednafen_psx':
        return '/assets/emulatorjs/data/cores/bios/scph5501.bin';

      // Nintendo DS firmware
      case 'melonds':
        return '/assets/emulatorjs/data/cores/bios/nds/firmware.bin';

      // NeoGeo / arcade BIOS packs (only for specific ROM sets)
      case 'fbneo':
      case 'mame2003_plus':
        // If you need NeoGeo BIOS support, place a zip or appropriate files here and
        // return the path to it. Default is to return undefined so cores that don't
        // need BIOS won't get confused.
        // return '/assets/emulatorjs/data/cores/bios/neogeo.zip';
        return undefined;

      // By default, do not supply a BIOS URL — caller will treat undefined as "no BIOS".
      default:
        return undefined;
    }
  }

  private detectCore(fileName: string): string {
    const ext = this.fileService.getFileExtension(fileName).toLowerCase();
    const coreMap: { [key: string]: string } = {
      // Game Boy / Game Boy Color
      'gba': 'mgba',
      'gbc': 'gambatte',
      'gb': 'gambatte',
      // Nintendo
      'nes': 'fceumm',
      'snes': 'snes9x',
      'sfc': 'snes9x',
      'n64': 'mupen64plus_next',
      'z64': 'mupen64plus_next',
      'v64': 'mupen64plus_next',
      'nds': 'melonds',
      // Sega
      'smd': 'genesis_plus_gx',
      'gen': 'genesis_plus_gx',
      '32x': 'picodrive',
      'gg': 'genesis_plus_gx',
      'sms': 'genesis_plus_gx',
      'md': 'genesis_plus_gx',
      // PlayStation
      'cue': 'mednafen_psx_hw',
      'bin': 'pcsx_rearmed',
      'iso': 'pcsx_rearmed',
      'chd': 'pcsx_rearmed',
      // Other systems
      'pce': 'mednafen_pce',
      'ngp': 'mednafen_ngp',
      'ngc': 'mednafen_ngp',
      'ws': 'mednafen_wswan',
      'wsc': 'mednafen_wswan',
      'col': 'gearcoleco',
      'a26': 'stella2014',
      'a78': 'prosystem',
      'lnx': 'handy',
      'jag': 'virtualjaguar',
      // Arcade
      'zip': 'mame2003_plus',
      // DOS
      'exe': 'dosbox_pure',
      'com': 'dosbox_pure',
      'bat': 'dosbox_pure',
      // PC-FX
      'ccd': 'mednafen_pcfx',
      // 3DO
      //'iso': 'opera',
      // Sega Saturn
      // 'cue': 'yabause',
      // Amiga
      'adf': 'puae',
      // Commodore 64
      'd64': 'vice_x64',
      // PSP
      'pbp': 'pcsx_rearmed',
      // Doom
      'wad': 'prboom'
    };
    return coreMap[ext] || 'mgba';
  }

  /** Make sure every run uses *your* options (not cached ones) and input is enabled. */
  private applyEjsRunOptions(): void {
    const w = window as any;

    // Always apply your defaults on *every* start (prevents old cached settings from winning)
    // Supported by recent 4.2.x builds.
    w.EJS_defaultOptionsForce = true;              // force defaults every run  (docs: config system)
    // If you ever want to test without any caching at all, uncomment:
    // w.EJS_disableLocalStorage = true;

    // Ensure input is enabled each run (names are stable across 4.x)
    w.EJS_directKeyboardInput = true;              // deliver raw key events to the core
    w.EJS_enableGamepads = true;              // let cores read the gamepad state
    w.EJS_disableAltKey = true;              // avoid Alt being swallowed by browser/UI

    // Optional quality-of-life: when the emulator starts, focus the game element so inputs flow
    w.EJS_afterStart = () => {
      try {
        const gameEl = document.getElementById('game');
        const canvas = gameEl?.querySelector('canvas') as HTMLElement | null;
        (canvas ?? gameEl)?.setAttribute?.('tabindex', '0');
        (canvas ?? gameEl)?.focus?.();
      } catch { }
    };
  }

  // bound handler so we can add/remove listeners easily
  private onFullscreenChangeBound = this.onFullscreenChange.bind(this);

  private onFullscreenChange() {
    const fsEl = (document as any).fullscreenElement || (document as any).webkitFullscreenElement || null;
    this.isFullScreen = !!fsEl;
    // When exiting fullscreen restore layout if necessary
    if (!this.isFullScreen) {
      const gameEl = document.getElementById('game');
      if (gameEl) {
        if (this.romName) {
          gameEl.style.height = 'calc(100vh - 60px)';
          gameEl.style.removeProperty('aspect-ratio');
        } else {
          gameEl.style.height = '';
          gameEl.style.aspectRatio = '4/3';
        }
      }
    }
    this.cdr.detectChanges();
  }

  private async loadSaveStateFromDB(romFileName: string): Promise<Blob | null> {
    if (!this.parentRef?.user?.id) return null;

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

    // If we're trying to capture a single save for exit (fire-and-forget),
    // resolve the capture promise and skip the normal upload path.
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
      console.log('[EJS] onSaveState: save already in progress; skipping');
      if (this._pendingSaveResolve) { try { this._pendingSaveResolve(true); } catch { } this._pendingSaveResolve = undefined; }
      return;
    }
    // Rate-limit saves to once per 10s
    if (!this._destroyed && now - this._lastSaveTime < 10000) {
      console.log('[EJS] onSaveState: recent save detected (<10s); skipping upload');
      if (this._pendingSaveResolve) { try { this._pendingSaveResolve(true); } catch { } this._pendingSaveResolve = undefined; }
      return;
    }
    const gameID = (window as any).EJS_gameID || '';
    const gameName = (window as any).EJS_gameName
      || (this.romName ? this.fileService.getFileWithoutExtension(this.romName) : '');

    // Helpful diagnostics the first few times
    this.debugDescribePayload(raw);

    console.log(
      '[EJS] onSaveState fired.',
      'user?', !!this.parentRef?.user?.id,
      'rom?', !!this.romName,
      'hasPayload?', raw != null,
      'type=', raw?.constructor?.name ?? typeof raw
    );

    if (!this.parentRef?.user?.id || !this.romName) return;

    // 1) Try to normalize whatever the callback passed
    let u8: Uint8Array | null = await this.normalizeSavePayload(raw);

    // 2) If callback gave no bytes, try localStorage
    if (!u8 || u8.length === 0) {
      u8 = this.tryReadSaveFromLocalStorage(gameID, gameName);
    }

    // 3) If still nothing, try IndexedDB (localforage/known DBs)
    if (!u8 || u8.length === 0) {
      u8 = await this.tryReadSaveFromIndexedDB(gameID, gameName);
    }

    // 4) If still nothing, bail gracefully (avoid TypeError in romService)
    if (!u8 || u8.length === 0) {
      console.warn('[EJS] Save callback had no bytes and no storage fallback found; skipping upload.');
      if (this._pendingSaveResolve) { try { this._pendingSaveResolve(false); } catch { } this._pendingSaveResolve = undefined; }
      return;
    }

    this._saveInProgress = true;
    try {
      // capture as "in-flight"
      await this.trackInFlight((async () => {
        const result = await this.romService.saveEmulatorJSState(this.romName!, this.parentRef!.user!.id!, u8);
        if (result.ok) {
          this._lastSaveTime = Date.now();
          console.log('Save state saved to database (bytes=', u8.length, ')');
          if (this._pendingSaveResolve) { try { this._pendingSaveResolve(true); } catch { } this._pendingSaveResolve = undefined; }
          return true;
        } else {
          console.error('Save state upload failed:', result.errorText);
          if (this._pendingSaveResolve) { try { this._pendingSaveResolve(false); } catch { } this._pendingSaveResolve = undefined; }
          return false;
        }
      })());
    } catch (err) {
      console.error('Failed to save state (bytes=', u8.length, '):', err);
      if (this._pendingSaveResolve) { try { this._pendingSaveResolve(false); } catch { } this._pendingSaveResolve = undefined; }
    } finally {
      this._saveInProgress = false;
    }
  }


  async callEjsSave(): Promise<void> {
    try {
      // 1) If we discovered a save function, use it
      if (this._saveFn) { await this._saveFn(); return; }
      this.startLoading();
      // 2) Preferred: instance API (if later bound)
      if (this.emulatorInstance && typeof (this.emulatorInstance as any).saveState === 'function') {
        await (this.emulatorInstance as any).saveState(); return;
      }

      // 3) Global helper (not present in your build, but keep as fallback)
      if (typeof (window as any).EJS_saveState === 'function') {
        await (window as any).EJS_saveState();
        this.stopLoading();
        return;
      }

      // 4) Some skins expose saveState() on the player element
      const player = (window as any).EJS_player as any;
      if (player) {
        const el = typeof player === 'string' ? document.querySelector(player) : player;
        if (el && typeof (el as any).saveState === 'function') {
          await (el as any).saveState();
          this.stopLoading();
          return;
        }
      }

      console.warn('No known save API found for EmulatorJS; save skipped');
      this.stopLoading();
    } catch (e) {
      console.warn('callEjsSave failed', e);
    }
  }

  /** Attempt a save and wait for `onSaveState` callback. Resolves true if saved. */
  private attemptSaveNow(timeoutMs = 5000): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      // if no user or rom, nothing to do
      if (!this.parentRef?.user?.id || !this.romName) return resolve(false);
      // set pending resolver
      this._pendingSaveResolve = (v?: any) => { resolve(!!v); };
      // call save trigger
      try { this.callEjsSave(); } catch { }
      // fallback timeout
      try { this._pendingSaveTimer = setTimeout(() => { if (this._pendingSaveResolve) { this._pendingSaveResolve(false); this._pendingSaveResolve = undefined; } resolve(false); }, timeoutMs); } catch { resolve(false); }
    });
  }


  setupAutosave() {
    try { this.clearAutosave(); } catch { }
    if (!this.autosave || !this.romName || !this.parentRef?.user?.id) return;

    // Kick a first save after 10s so you can verify quickly
    // Kick the first autosave after at least 3 minutes (or the configured interval, whichever is larger)
    const kickDelay = Math.max(this.autosaveIntervalTime, 180000);
    this._autosaveKick = setTimeout(() => {
      console.log('[EJS] autosave initial kick after', kickDelay, 'ms');
      this.callEjsSave();
    }, kickDelay);

    this.autosaveInterval = setInterval(() => {
      try {
        console.log('[EJS] autosave tick');
        this.callEjsSave();
      } catch (e) { console.warn('Autosave call failed', e); }
    }, this.autosaveIntervalTime);
  }

  clearAutosave() {
    if (this._autosaveKick) { clearTimeout(this._autosaveKick); this._autosaveKick = undefined; }
    if (this.autosaveInterval) { clearInterval(this.autosaveInterval); this.autosaveInterval = undefined; }
    if (this._pendingSaveTimer) { clearTimeout(this._pendingSaveTimer); this._pendingSaveTimer = undefined; }
  }

  getAllowedFileTypes(): string[] {
    return [
      // Nintendo
      'gba', 'gbc', 'gb', 'nes', 'snes', 'sfc', 'n64', 'z64', 'v64', 'nds',
      // Sega
      'smd', 'gen', 'bin', '32x', 'gg', 'sms', 'md',
      // PlayStation
      'cue', 'iso', 'chd', 'pbp',
      // Other Handhelds
      'pce', 'ngp', 'ngc', 'ws', 'wsc', 'lnx',
      // Atari
      'col', 'a26', 'a78', 'jag',
      // Computer Systems
      'adf', 'd64', 'exe', 'com', 'bat',
      // Arcade
      'zip',
      // Other
      'wad', 'ccd'
    ];
  }


  getAllowedRomFileTypesString(): string {
    return this.getAllowedFileTypes().map(e => '.' + e.trim().toLowerCase()).join(',');
  }


  /** Keep #game at 100vh - 60px whether EJS or the core tries to resize it. */
  private lockGameHostHeight(): void {
    const game = document.getElementById('game');
    if (!game) return;

    const apply = () => {
      try {
        game.style.setProperty('height', 'calc(100vh - 60px)', 'important');
        game.style.setProperty('min-height', 'calc(100vh - 60px)', 'important');
        game.style.setProperty('width', '100%', 'important');
        game.style.setProperty('max-width', '960px', 'important');
        game.style.setProperty('margin', '0 auto', 'important');
        // Optional: ensure no inline aspect-ratio sneaks in
        game.style.removeProperty('aspect-ratio');
      } catch { }
    };

    // Initial apply
    apply();

    // Re-apply if size changes (e.g., orientation, address bar hide/show)
    try {
      this._gameSizeObs?.disconnect();
      this._gameSizeObs = new ResizeObserver(() => apply());
      this._gameSizeObs.observe(game);
    } catch { }

    // Re-apply if someone (skin) modifies inline style attributes
    try {
      this._gameAttrObs?.disconnect();
      this._gameAttrObs = new MutationObserver(() => apply());
      this._gameAttrObs.observe(game, { attributes: true, attributeFilter: ['style'] });
    } catch { }

    // Re-apply on viewport changes (mobile browser chrome show/hide)
    try {
      window.addEventListener('resize', apply, { passive: true });
      window.addEventListener('orientationchange', apply, { passive: true });
    } catch { }
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
      if (this._destroyed) return false;
      await new Promise(r => setTimeout(r, delayMs));
      const gameEl = document.getElementById('game');
      if (!gameEl) continue;
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

  /** Force the game container to fill vertical space minus a 60px header. */
  private setGameScreenHeight(): void {
    const gameEl = document.getElementById('game');
    if (!gameEl) return;
    // Use calc so it responds to viewport changes; remove aspect-ratio to allow full height
    gameEl.style.height = 'calc(100vh - 60px)';
    gameEl.style.maxHeight = '100vh';
    // Keep width at 100% but allow the core renderer to scale
    gameEl.style.width = '100%';
    // Remove the aspect ratio so the height takes effect
    gameEl.style.removeProperty('aspect-ratio');
  }

  async toggleFullScreen(): Promise<void> {
    const gameEl = document.getElementById('game');
    if (!gameEl) return;

    try {
      if (!this.isFullScreen) {
        // request fullscreen on the game container
        if ((gameEl as any).requestFullscreen) await (gameEl as any).requestFullscreen();
        else if ((gameEl as any).webkitRequestFullscreen) await (gameEl as any).webkitRequestFullscreen();
        this.isFullScreen = true;
        // ensure sizing in fullscreen
        gameEl.style.height = 'calc(100vh - 60px)';
        gameEl.style.removeProperty('aspect-ratio');
      } else {
        await this.exitFullScreen();
      }
    } catch (e) {
      console.error('Fullscreen request failed', e);
    }
    this.cdr.detectChanges();
    // try to focus after toggling
    await this.waitForEmulatorAndFocus();
  }

  private async exitFullScreen(): Promise<void> {
    try {
      if ((document as any).exitFullscreen) await (document as any).exitFullscreen();
      else if ((document as any).webkitExitFullscreen) await (document as any).webkitExitFullscreen();
    } catch (e) {
      // ignore
    }
    this.isFullScreen = false;
    const gameEl = document.getElementById('game');
    if (gameEl) {
      gameEl.style.height = this.romName ? 'calc(100vh - 60px)' : '';
      if (!this.romName) gameEl.style.aspectRatio = '4/3';
      gameEl.style.removeProperty('max-height');
    }
    this.cdr.detectChanges();
  }

  getRomName(): string {
    if (this.romName) {
      return this.fileService.getFileWithoutExtension(this.romName);
    }
    return '1Emulator';
  }


  async stopEmulator() {
    this.status = 'Stopping...';
    this.startLoading();
    this.cdr.detectChanges();

    if (this.romName && this.parentRef?.user?.id) {
      const shouldSave = window.confirm('Save emulator state before closing?');
      if (shouldSave) { await this.flushSavesBeforeExit(12000); }
    }

    this.clearAutosave();
    this.isSearchVisible = true;
    this.romName = undefined;
    this.stopLoading();
    this.cdr.detectChanges();
    this.fullReloadToHome();
  }

  /**
   * Probe common places where builds expose the running emulator instance or API.
   * When a .saveState() function is found, cache it in this._saveFn.
   */
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

    console.warn('[EJS] probeForSaveApi: no saveState() found in this build');
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

  /** Bind the Quick Save UI as our save function (used by autosave/manual save). */
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


  /** ---------------- TYPE GUARDS & CONVERTERS ---------------- */
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

  /** ---------------- PAYLOAD INSPECTOR (DEBUG) ---------------- */
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

  /** ---------------- DEEP NORMALIZER ----------------
   * Try hard to convert ANY payload into Uint8Array:
   * - direct types (Uint8Array/ArrayBuffer/Blob/string b64)
   * - wrapper objects: { buffer }, { data }, { state }, { result }, { save }, { value }, { chunks: [...] }, etc.
   */
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

  /** ---------------- localStorage FALLBACK (kept) ---------------- */
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

  /** ---------------- IndexedDB FALLBACKS ---------------- */

  // 1) Prefer localforage if present (many EmulatorJS builds use it)
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

  // 2) Raw IndexedDB sweep for common DB/store names
  private async tryReadSaveFromIndexedDB(gameID: string, gameName: string): Promise<Uint8Array | null> {
    // First try localforage
    const lfHit = await this.tryReadSaveFromLocalForage(gameID, gameName);
    if (lfHit) return lfHit;

    const dbCandidates = ['localforage', 'EJS', 'emulatorjs', 'emulatorjs-cache', 'emulator', 'kv', 'storage'];
    const storeCandidates = ['keyvaluepairs', 'keyvalue', 'pairs', 'store', 'ejs', 'data', 'kv'];

    const pickBest = (cands: Array<{ key: string; val: any }>): Uint8Array | null => {
      let best: Uint8Array | null = null;
      for (const { val } of cands) {
        // normalize each
        // eslint-disable-next-line no-await-in-loop
        // (make sync for picker; we converted earlier)
      }
      return best;
    };

    try {
      let best: Uint8Array | null = null;

      // If browser supports listing DBs, include them
      try {
        const list = (await (indexedDB as any).databases?.()) as { name?: string }[] | undefined;
        if (Array.isArray(list)) {
          for (const d of list) if (d?.name) dbCandidates.push(d.name);
        }
      } catch { }

      // Iterate DBs
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

  /** Open a DB and iterate stores to find a match; return largest bytes found. */
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
        // Not creating stores; just resolve with empty
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
          // skip unknown store names
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


  /** Wait until a load API is available (EJS_loadState or gameManager.loadState). */
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

  /** Apply a save-state Blob to the running emulator as soon as APIs are ready. */
  private async applySaveStateIfAvailable(saveStateBlob: Blob | null): Promise<boolean> {
    if (!saveStateBlob) return false;
    try {
      const u8 = new Uint8Array(await saveStateBlob.arrayBuffer());
      const { useEjs, useMgr } = await this.waitForLoadApis(6000);
      if (useEjs) { await Promise.resolve(useEjs(u8)); console.log('[EJS] Loaded state via EJS_loadState'); return true; }
      if (useMgr) { await Promise.resolve(useMgr(u8)); console.log('[EJS] Loaded state via gameManager.loadState'); return true; }
      console.warn('[EJS] No load API available; could not apply save state.');
      return false;
    } catch (e) {
      console.warn('[EJS] applySaveStateIfAvailable failed', e);
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
  private delay(ms: number) {
    return new Promise<void>(r => setTimeout(r, ms));
  }

  // Ensure bytes become a tight, real ArrayBuffer (never SharedArrayBuffer)
  private toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const buf: any = (bytes as any).buffer;
    if (buf instanceof ArrayBuffer) {
      return buf.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    const copy = Uint8Array.from(bytes);
    return copy.buffer;
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

  private async savePendingState(userId: number, romName: string, u8: Uint8Array): Promise<number | null> {
    try {
      const db = await this.openPendingDb();
      const tx = db.transaction('pendingSaves', 'readwrite');
      const store = tx.objectStore('pendingSaves');
      const ab = this.toArrayBuffer(u8);
      const blob = new Blob([ab]);
      const addReq = store.add({ userId, romName, data: blob, ts: Date.now() });
      return await new Promise<number | null>((resolve) => {
        addReq.onsuccess = () => { resolve(addReq.result as number); db.close(); };
        addReq.onerror = () => { resolve(null); db.close(); };
      });
    } catch (e) { console.warn('savePendingState failed', e); return null; }
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

  private async removePendingSave(id: number): Promise<boolean> {
    try {
      const db = await this.openPendingDb();
      const tx = db.transaction('pendingSaves', 'readwrite');
      const store = tx.objectStore('pendingSaves');
      const req = store.delete(id);
      return await new Promise((resolve) => {
        req.onsuccess = () => { resolve(true); db.close(); };
        req.onerror = () => { resolve(false); db.close(); };
      });
    } catch { return false; }
  }

  // Attempt to upload any pending saves found in IndexedDB. Runs on startup.
  private async uploadPendingSavesOnStartup(): Promise<void> {
    try {
      const pending = await this.getAllPendingSaves();
      if (!pending || !pending.length) return;
      for (const rec of pending) {
        try {
          const blob: Blob = rec.data;
          const arr = new Uint8Array(await blob.arrayBuffer());
          const res = await this.romService.saveEmulatorJSState(rec.romName, rec.userId, arr);
          if (res.ok) {
            await this.removePendingSave(rec.id);
            console.log('[EJS] uploaded pending save for', rec.romName);
          } else {
            console.warn('[EJS] failed to upload pending save:', res.errorText);
          }
        } catch (e) { console.warn('[EJS] uploadPendingSavesOnStartup error', e); }
      }
    } catch (e) { console.warn('[EJS] uploadPendingSavesOnStartup failed', e); }
  }

  // Capture a single save from the emulator (resolves with bytes or null on timeout)
  private captureSaveOnce(timeoutMs = 5000): Promise<Uint8Array | null> {
    return new Promise((resolve) => {
      this._captureSaveResolve = (u8: Uint8Array | null) => { resolve(u8 || null); };
      try { this.callEjsSave(); } catch (e) { resolve(null); this._captureSaveResolve = undefined; }
      setTimeout(() => {
        if (this._captureSaveResolve) { try { this._captureSaveResolve(null); } catch { } this._captureSaveResolve = undefined; }
      }, timeoutMs);
    });
  }

  /** Stop autosave and wait for any current or final save attempt to complete. */
  private async flushSavesBeforeExit(timeoutMs = 12000): Promise<boolean> {
    this._exiting = true;
    try { this.clearAutosave(); } catch { }

    // If a save is already in-flight, await it (with a cap).
    if (this._inFlightSavePromise) {
      const done = await Promise.race([
        this._inFlightSavePromise,
        this.delay(timeoutMs).then(() => false)
      ]);
      return !!done;
    }

    // Otherwise, trigger a save and wait for the EJS callback round trip
    const attempt = this.attemptSaveNow(Math.min(timeoutMs, 10000));
    const done = await Promise.race([
      attempt,
      this.delay(timeoutMs).then(() => false)
    ]);
    return !!done;
  }



  private ensureTouchOverlaySizingCss(): void {
    if (document.querySelector('style[data-ejs-touch-sizing="1"]')) return;

    const css = ` 
  #gbaA, #gbaB, #genA, #genB, #genC {
    width: 96px !important;
    height: 96px !important;
    line-height: 96px !important;
    font-size: 34px !important;
    border-radius: 50% !important;
    z-index: 9999 !important;
  } 
  #gbaA > *, #gbaB > *, #genA > *, #genB > *, #genC > * {
    width: 96px !important;
    height: 96px !important;
    line-height: 96px !important;
    font-size: 34px !important;
    border-radius: 50% !important;
  }
 
  #game .ejs_dpad, #game .ejs-dpad {
    transform: scale(1.3) !important;
    transform-origin: center left !important;
  }
  `;
    const style = document.createElement('style');
    style.setAttribute('data-ejs-touch-sizing', '1');
    style.textContent = css;
    document.head.appendChild(style);
  }


  leftMovementArea(useJoystick: boolean): VPadItem {
    // For analog zone, indices must be [19,18,17,16] and joystickInput: true.
    // For dpad, indices are [4,5,6,7] (UP,DOWN,LEFT,RIGHT).                 // [2](https://emulatorjs.org/docs4devs/virtual-gamepad-settings/)
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
        width: "100px",
        height: "100px",
        inputValues: [4, 5, 6, 7],
      };
  }

  startSelectRow(): VPadItem[] {
    return [
      { type: 'button', text: 'Start', id: 'start', location: 'center', left: 60, top: 0, fontSize: 15, block: true, input_value: 3 },
      { type: 'button', text: 'Select', id: 'select', location: 'center', left: -5, top: 0, fontSize: 15, block: true, input_value: 2 },
    ];
  }

  shouldersTop(hasLR2 = false): VPadItem[] {
    const items: VPadItem[] = [
      { type: 'button', text: 'L', location: 'top', left: 10, top: 0, input_value: 10, bold: true, block: true },
      { type: 'button', text: 'R', location: 'top', left: 270, top: 0, input_value: 11, bold: true, block: true },
    ];
    if (hasLR2) {
      items.push(
        { type: 'button', text: 'L2', location: 'top', left: 90, top: 0, input_value: 12, bold: true, block: true },
        { type: 'button', text: 'R2', location: 'top', left: 190, top: 0, input_value: 13, bold: true, block: true },
      );
    }
    return items;
  }

  diamondRight(): VPadItem[] {
    return [
      { type: 'button', text: 'X', location: 'right', left: 0, top: 0, input_value: 9, bold: true }, // X
      { type: 'button', text: 'Y', location: 'right', left: 40, top: 40, input_value: 1, bold: true }, // Y
      { type: 'button', text: 'B', location: 'right', left: 81, top: 40, input_value: 0, bold: true }, // B
      { type: 'button', text: 'A', location: 'right', left: 40, top: 80, input_value: 8, bold: true }, // A
    ];
  }


  twoButtonRight(enlarge = true): VPadItem[] {
    const A: VPadItem = {
      type: 'button',
      id: 'gbaA',
      text: 'A',
      location: 'right',
      left: 40,
      top: 80,
      input_value: 8,
      bold: true
    };
    const B: VPadItem = {
      type: 'button',
      id: 'gbaB',
      text: 'B',
      location: 'right',
      left: 81,
      top: 40,
      input_value: 0,
      bold: true
    };
    if (enlarge) {
      (A as any).block = true; (A as any).fontSize = 32; // numbers (px)
      (B as any).block = true; (B as any).fontSize = 32;
      A.left = (A.left ?? 40) - 20;
      A.top = (A.top ?? 80) + 20;
      B.left = (B.left ?? 81) - 10;
      B.top = (B.top ?? 40) + 20;
    }
    return [B, A];
  }


  genesisThreeRight(): VPadItem[] {
    return [
      { type: 'button', id: 'genC', text: 'C', location: 'right', left: 0, top: 0, input_value: 8, bold: true },
      { type: 'button', id: 'genB', text: 'B', location: 'right', left: 81, top: 40, input_value: 0, bold: true },
      { type: 'button', id: 'genA', text: 'A', location: 'right', left: 40, top: 80, input_value: 1, bold: true },
    ];
  }

  /** Log what the virtual gamepad rendered, and hard-patch sizes if needed */
  private inspectVPadOnce(): void {
    const root = document.getElementById('game')!;
    const once = () => {
      const vpad = root.querySelector('.ejs_virtualGamepad_parent, .ejs-virtualGamepad-parent') as HTMLElement | null;
      if (!vpad) return;

      // List our buttons if present
      const ids = ['gbaA', 'gbaB', 'genA', 'genB', 'genC'];
      console.log('[EJS] vpad present. Found IDs:', ids.map(id => !!document.getElementById(id)));

      // As an ultimate override, force inline size (beats stylesheets)
      const bump = (id: string) => {
        const el = document.getElementById(id) as HTMLElement | null;
        if (!el) return;
        el.style.width = '96px';
        el.style.height = '96px';
        el.style.lineHeight = '96px';
        el.style.fontSize = '34px';
        el.style.borderRadius = '50%';
        // Try inner node too (some skins have an inner <button>)
        const inner = el.firstElementChild as HTMLElement | null;
        if (inner) {
          inner.style.width = '96px';
          inner.style.height = '96px';
          inner.style.lineHeight = '96px';
          inner.style.fontSize = '34px';
          inner.style.borderRadius = '50%';
        }
      };
      ['gbaA', 'gbaB', 'genA', 'genB', 'genC'].forEach(bump);

      obs.disconnect();
    };

    const obs = new MutationObserver(once);
    obs.observe(root, { childList: true, subtree: true });
    // also try once after a small delay
    setTimeout(once, 750);
  }



  systemFromCore(core: string): System {
    const c = core.toLowerCase();
    if (c.includes('snes')) return 'snes';
    if (c.includes('mgba') || c.includes('gba')) return 'gba';
    if (c.includes('gambatte') || c.includes('gbc') || c === 'gb') return 'gbc';
    if (c.includes('fceumm') || c.includes('nestopia') || c === 'nes') return 'nes';
    if (c.includes('genesis') || c.includes('picodrive') || c.includes('megadrive')) return 'genesis';
    if (c.includes('melonds') || c.includes('desmume') || c.includes('nds')) return 'nds';
    return 'nes';
  }

  buildTouchLayout(
    system: System,
    opts: BuildOpts & { segaShowLR?: boolean } // optional flag for Genesis shoulders
  ): VPadItem[] {
    const { useJoystick, showControls = true, twoButtonMode, segaShowLR = true } = opts;
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
        items.push(...this.twoButtonRight(true));
        items.push(...this.shouldersTop(false));
        items.push(...this.startSelectRow());
        break;

      case 'nes':
      case 'gb':
      case 'gbc':
        items.push(...this.twoButtonRight(true));
        items.push(...this.startSelectRow());
        break;

      case 'genesis':
        items.push(...this.genesisThreeRight());
        if (segaShowLR) {
          items.push(...this.shouldersTop(false));
        }
        items.push(...this.startSelectRow());
        break;

      default:
        items.push(...this.twoButtonRight(true));
        items.push(...this.startSelectRow());
        break;
    }

    return items;
  }
  showMenuPanel() {
    this.isMenuPanelOpen = true;
    this.parentRef?.showOverlay();
  }

  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    this.parentRef?.closeOverlay();
  }

  toggleFaqItem(index: number) {
    const item = this.faqItems[index];
    if (item) item.expanded = !item.expanded;
  }

  private getEmuHomeUrl(): string {
    return `${location.protocol}//${location.host}/1Emulator`;
  }

  private fullReloadToHome(extraParams?: Record<string, string>): void {
    const base = this.getEmuHomeUrl();
    const q = extraParams ? `?${new URLSearchParams(extraParams).toString()}` : '';
    window.location.replace(base + q);
  }

  finishFileUploading() {
    try { this.fileSearchComponent?.getDirectory(); } catch (e) { }
  }
}

declare global {
  interface Window {
    EJS_player?: string | HTMLElement;
    EJS_core?: string;
    EJS_pathtodata?: string;
    EJS_coreUrl?: string;
    EJS_biosUrl?: string;
    EJS_gameUrl?: string;
    EJS_softLoad?: boolean;
    EJS_gameID?: string;
    EJS_gameName?: string;
    EJS_gameParent?: string;
    EJS_language?: string;
    EJS_startOnLoaded?: boolean;
    EJS_paths?: { [key: string]: string };
    EJS_volume?: number;
    EJS_lightgun?: boolean;
    EJS_onSaveState?: (state: Uint8Array) => void;
    EJS_onLoadState?: () => void;
    __ejsLoaderInjected?: boolean;
    __EJS_ALIVE__?: boolean;
    EJS_defaultOptionsForce?: boolean;
    EJS_disableLocalStorage?: boolean;
    EJS_directKeyboardInput?: boolean;
    EJS_enableGamepads?: boolean;
    EJS_disableAltKey?: boolean;
    EJS_VirtualGamepadSettings?: any;
    EJS_Buttons?: any;
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
    left?: number;
    right?: number;
    top?: number;
    fontSize?: number;
    bold?: boolean;
    block?: boolean;
    input_value: number;
    size?: number;
    width?: number;
    height?: number;
  }
  | {
    type: 'dpad';
    location: 'left' | 'right' | 'center' | 'top';
    left?: string;
    right?: string;
    width?: string;
    height?: string;
    joystickInput?: boolean;
    inputValues: [number, number, number, number]
  }
  | {
    type: 'zone';
    location: 'left' | 'right' | 'center' | 'top';
    left?: string;
    right?: string;
    top?: string;
    joystickInput: true;
    color?: string;
    inputValues: [number, number, number, number]
  };

type System =
  | 'nes' | 'gb' | 'gbc' | 'gba'
  | 'snes'
  | 'genesis'
  | 'nds';

interface BuildOpts {
  useJoystick: boolean;   // your toggle
  showControls?: boolean; // if false, return [] to hide
  twoButtonMode?: boolean;// enlarge A/B (NES/GB/GBC, optionally GBA)
  buttonSize?: number;    // base size tuning knob (default 65~70 visual)
}

const RETRO = {
  B: 0, Y: 1, SELECT: 2, START: 3, UP: 4, DOWN: 5, LEFT: 6, RIGHT: 7,
  A: 8, X: 9, L: 10, R: 11, L2: 12, R2: 13, L3: 14, R3: 15,
  LSTICK_R: 16, LSTICK_L: 17, LSTICK_D: 18, LSTICK_U: 19,
  RSTICK_R: 20, RSTICK_L: 21, RSTICK_D: 22, RSTICK_U: 23,
} as const;
