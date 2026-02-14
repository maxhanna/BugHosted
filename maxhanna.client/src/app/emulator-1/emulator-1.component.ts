
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
  private autosaveInterval: any;
  // Human-readable status shown in the UI (e.g. "Idle", "Loading <game>", "Running: <game>")
  public status: string = 'Idle';
  private romObjectUrl?: string;
  private emulatorInstance?: any;
  private _destroyed = false;
  private _pendingSaveResolve?: (v?: any) => void;
  private _pendingSaveTimer?: any;
  private _gameSizeObs?: ResizeObserver;
  private _gameAttrObs?: MutationObserver;
  private _saveFn?: () => void;
  private _autosaveKick?: any;



  constructor(
    private romService: RomService,
    private fileService: FileService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  ngOnInit(): void {

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
    // Offer to save state before destroying if a ROM is active
    if (this.romName && this.parentRef?.user?.id) {
      try {
        const shouldSave = window.confirm('Save emulator state before closing?');
        if (shouldSave) {
          // attempt a save and wait briefly for callback
          try { await this.attemptSaveNow(5000); } catch { }
        }
      } catch { }
    }
    // After the save prompt, navigate the user back to the public home page.
    try {
      window.location.replace('/');
    } catch { }
  }

  async onRomSelected(file: FileEntry) {
    try {
      // file.fileName and file.id come from your FileSearchComponent result
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
    this.status = 'Loading ROM...';
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
    window.EJS_onLoadState = () => this.onLoadState();
    this.applyEjsRunOptions();
    // If the build calls back with the instance, capture it early
    (window as any).EJS_ready = (api: any) => {
      try {
        this.emulatorInstance = api || (window as any).EJS || (window as any).EJS_emulator || this.emulatorInstance;
        if (this.emulatorInstance?.saveState) {
          this._saveFn = () => { try { (this.emulatorInstance as any).saveState(); } catch { } };
        }
        console.log('[EJS] instance ready hook fired, has saveState?', !!this._saveFn);
      } catch { }
    };


    // ❌ Remove this line; not needed for normal games and can confuse core loading
    // window.EJS_gameParent = this.romObjectUrl;


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
        // add a cache-buster
        s.src = `/assets/emulatorjs/data/loader.js?v=${Date.now()}`;
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
    } else {
      this.stopLoading();
      this.fullReloadToHome();
      return;
    }

    // 9) Load save state if it exists
    if (saveStateBlob) {
      // EmulatorJS will handle loading this through its storage system
      console.log('Save state loaded from database');
    }

    this.status = 'Running';
    this.stopLoading();
    this.cdr.detectChanges();
  }

  /** Reinitialize EmulatorJS for a new ROM in the same page. */


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
    const gameID = (window as any).EJS_gameID || '';
    const gameName = (window as any).EJS_gameName
      || (this.romName ? this.fileService.getFileWithoutExtension(this.romName) : '');

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

    // 2) If callback gave no bytes, try to pull from localStorage (some skins do this)
    if (!u8 || u8.length === 0) {
      u8 = this.tryReadSaveFromLocalStorage(gameID, gameName);
    }

    // 3) If still nothing, bail gracefully (avoid TypeError in romService)
    if (!u8 || u8.length === 0) {
      console.warn('[EJS] Save callback had no bytes and no localStorage fallback found; skipping upload.');
      // Resolve any pending waiter as "failed"
      if (this._pendingSaveResolve) { try { this._pendingSaveResolve(false); } catch { } this._pendingSaveResolve = undefined; }
      return;
    }

    try {
      await this.romService.saveEmulatorJSState(this.romName, this.parentRef.user.id, u8);
      console.log('Save state saved to database (bytes=', u8.length, ')');

      // resolve any pending save waiters (eg: on destroy)
      if (this._pendingSaveResolve) {
        try { this._pendingSaveResolve(true); } catch { }
        this._pendingSaveResolve = undefined;
      }
    } catch (err) {
      console.error('Failed to save state to database:', err);
      if (this._pendingSaveResolve) {
        try { this._pendingSaveResolve(false); } catch { }
        this._pendingSaveResolve = undefined;
      }
    }
  }


  private async onLoadState() {
    console.log('Loading state from database');
  }

  callEjsSave(): void {
    try {
      // 1) If we discovered a save function, use it
      if (this._saveFn) { this._saveFn(); return; }
      this.startLoading();
      // 2) Preferred: instance API (if later bound)
      if (this.emulatorInstance && typeof (this.emulatorInstance as any).saveState === 'function') {
        (this.emulatorInstance as any).saveState(); return;
      }

      // 3) Global helper (not present in your build, but keep as fallback)
      if (typeof (window as any).EJS_saveState === 'function') {
        (window as any).EJS_saveState();
        this.stopLoading();
        return;
      }

      // 4) Some skins expose saveState() on the player element
      const player = (window as any).EJS_player as any;
      if (player) {
        const el = typeof player === 'string' ? document.querySelector(player) : player;
        if (el && typeof (el as any).saveState === 'function') {
          (el as any).saveState();
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
    this._autosaveKick = setTimeout(() => {
      console.log('[EJS] autosave kick (10s)');
      this.callEjsSave();
    }, 10000);

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
      'smd', 'gen', 'bin', '32x', 'gg', 'sms',
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


  /** Forcefully stop EmulatorJS runtime: audio, workers, RAF, DOM, globals. Safe to call multiple times. */
  private async hardStopEmulatorEJS(): Promise<void> {
    const w = window as any;

    try {

      // 1) Signal shutdown ASAP so late calls are ignored
      w.__EJS_ALIVE__ = false;

      try { if (this.emulatorInstance?.exit) await this.emulatorInstance.exit(); } catch { }
      try { if (typeof w.EJS_stop === 'function') w.EJS_stop(); } catch { }
      try { if (typeof w.EJS_exit === 'function') w.EJS_exit(); } catch { }
      try { (window as any).EJS_volume = 0; } catch { }
      // 2) Terminate any workers (main + pthreads) FIRST
      try {
        const workers: Set<any> | undefined = w.__ejsTrackedWorkers;
        if (workers && workers.size) {
          for (const wk of Array.from(workers)) {
            try { if (typeof wk.terminate === 'function') wk.terminate(); } catch { }
            try { wk?.port?.close?.(); } catch { }
            try { workers.delete(wk); } catch { }
          }
        }
      } catch { }

      // 3) Then close any WebAudio contexts
      try {
        const tracked: Set<BaseAudioContext> | undefined = w.__ejsTrackedAudio;
        if (tracked && tracked.size) {
          await Promise.all(Array.from(tracked).map(async (ctx) => {
            try {
              if (ctx.state !== 'closed') {
                try { await (ctx as any).close?.(); } catch {
                  try { await (ctx as any).suspend?.(); } catch { }
                }
              }
            } catch { }
          }));
          for (const ctx of Array.from(tracked)) {
            try { if (ctx.state === 'closed') tracked.delete(ctx); } catch { }
          }
        }
      } catch { }

      // 4) Cancel any requestAnimationFrame loops
      try {
        if ((this as any)._fitRAF) cancelAnimationFrame((this as any)._fitRAF);
        (this as any)._fitRAF = undefined;
      } catch { }

      // 5) Remove emulator DOM from #game
      try {
        const gameEl = document.getElementById('game');
        if (gameEl) {
          // Also stop any <audio> element that might have been created
          try {
            gameEl.querySelectorAll('audio').forEach(a => {
              try { (a as HTMLAudioElement).pause(); } catch { }
              try { a.remove(); } catch { }
            });
          } catch { }
          gameEl.innerHTML = '';
        }
      } catch { }

      // 6) Clear global callbacks to break references to this component
      try { delete w.EJS_onSaveState; } catch { }
      try { delete w.EJS_onLoadState; } catch { }

      // 7) Null any instance references
      this.emulatorInstance = undefined;

    } catch (err) {
      console.warn('hardStopEmulatorEJS: unexpected error during shutdown', err);
    }
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

  private unlockGameHostHeight(): void {
    try { this._gameSizeObs?.disconnect(); } catch { }
    try { this._gameAttrObs?.disconnect(); } catch { }
    this._gameSizeObs = undefined;
    this._gameAttrObs = undefined;
    try {
      window.removeEventListener('resize', this.lockGameHostHeight as any);
      window.removeEventListener('orientationchange', this.lockGameHostHeight as any);
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
    if (this.romName && this.parentRef?.user?.id) {
      try {
        const shouldSave = window.confirm('Save emulator state before closing?');
        if (shouldSave) {
          // attempt a save and wait briefly for callback
          try { await this.attemptSaveNow(5000); } catch { }
        }
      } catch { }
    }
    try { this.clearAutosave(); } catch { }
    try { await this.hardStopEmulatorEJS(); } catch { }
    try { this.unlockGameHostHeight(); } catch { }

    // Optional best-effort UI cleanup (not required since we're reloading)
    this.isSearchVisible = true;
    this.status = 'Ready - Select a ROM';
    this.romName = undefined;

    // 🚀 Reboot the page to avoid any double-load of emulator.min.js
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
          this._saveFn = () => { try { obj.saveState(); } catch { } };
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
      this._saveFn = () => {
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


  /** Type guards & converters */
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
    // strip data URI prefix if present
    const idx = b64.indexOf('base64,');
    const raw = idx >= 0 ? b64.slice(idx + 7) : b64;
    const bin = atob(raw);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /**
   * Try to pull the most recent savestate from localStorage when the callback gives no bytes.
   * Heuristic: look for keys mentioning EJS/gameID/name/state and base64-ish values.
   */
  private tryReadSaveFromLocalStorage(gameID: string, gameName: string): Uint8Array | null {
    try {
      const ls = window.localStorage;
      const keys = Object.keys(ls);

      // Candidates in order of likelihood
      const candidates = keys
        .filter(k =>
          /ejs|state|save|quick/i.test(k) &&
          (k.includes(gameID) || k.includes(gameName) || /quick/i.test(k))
        )
        .map(k => ({ k, v: ls.getItem(k) ?? '' }));

      // Try base64 values first
      for (const { k, v } of candidates) {
        if (!v) continue;
        // base64-like (letters, numbers, +, /, =), or data:...;base64,...
        if (/^data:.*;base64,/.test(v) || /^[A-Za-z0-9+/=\s]+$/.test(v)) {
          try {
            const u8 = this.base64ToU8(v);
            if (u8 && u8.length > 0) {
              console.log('[EJS] localStorage savestate found at key:', k, 'bytes=', u8.length);
              return u8;
            }
          } catch { /* try next */ }
        }
      }

      // Try JSON-serialized shapes: { data: [numbers] } or { buffer:"base64" }
      for (const { k, v } of candidates) {
        if (!v) continue;
        try {
          const obj = JSON.parse(v);
          // Array-like numeric dump
          if (obj && Array.isArray(obj.data)) {
            const u8 = new Uint8Array(obj.data);
            if (u8.length) {
              console.log('[EJS] localStorage JSON(data[]) savestate at key:', k, 'bytes=', u8.length);
              return u8;
            }
          }
          // Base64 field
          if (obj && typeof obj.buffer === 'string') {
            const u8 = this.base64ToU8(obj.buffer);
            if (u8.length) {
              console.log('[EJS] localStorage JSON(buffer b64) savestate at key:', k, 'bytes=', u8.length);
              return u8;
            }
          }
        } catch { /* ignore non-JSON */ }
      }
    } catch { /* ignore */ }
    return null;
  }

  /** Normalize *any* payload into a Uint8Array we can POST */
  private async normalizeSavePayload(payload: any): Promise<Uint8Array | null> {
    try {
      if (!payload) return null;

      // Raw Uint8Array (or other typed arrays)
      if (this.isTypedArray(payload)) return new Uint8Array(payload);

      // ArrayBuffer
      if (this.isArrayBuffer(payload)) return new Uint8Array(payload);

      // Blob
      if (typeof Blob !== 'undefined' && payload instanceof Blob) {
        return await this.blobToU8(payload);
      }

      // String (likely base64)
      if (typeof payload === 'string' && payload.trim().length) {
        try { return this.base64ToU8(payload); } catch { }
      }

      // Common wrapper shapes: { buffer: ArrayBuffer | base64 }, { data: number[] }
      if (typeof payload === 'object') {
        // buffer: ArrayBuffer
        if (payload.buffer && this.isArrayBuffer(payload.buffer)) {
          return new Uint8Array(payload.buffer);
        }
        // buffer: base64
        if (payload.buffer && typeof payload.buffer === 'string') {
          return this.base64ToU8(payload.buffer);
        }
        // data: number[]
        if (Array.isArray(payload.data)) {
          return new Uint8Array(payload.data);
        }
        // array-like
        if (typeof payload.byteLength === 'number') {
          return new Uint8Array(payload as ArrayLike<number>);
        }
      }

    } catch { /* fallthrough to return null */ }
    return null;
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

  /** Called by `app-file-upload` when upload finishes; refresh file list. */
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
    EJS_afterStart?: () => void;
    EJS_ready?: (api: any) => void;
  }
}