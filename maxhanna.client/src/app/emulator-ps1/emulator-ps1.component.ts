
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { PsxKeyMap } from '../../datacontracts/ps1/psx-key-map';
import { KeyBinding } from '../../datacontracts/ps1/key-binding';
import { ChildComponent } from '../child.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { RomService } from '../../services/rom.service';
import { FileService } from '../../services/file.service';
import { FileSearchComponent } from '../file-search/file-search.component';

@Component({
  selector: 'app-emulator-ps1',
  templateUrl: './emulator-ps1.component.html',
  styleUrl: './emulator-ps1.component.css',
  standalone: false
})
export class EmulatorPS1Component extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('container') containerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('fullscreenContainer') fullscreenContainer!: ElementRef<HTMLDivElement>;
  @ViewChild(FileSearchComponent) fileSearchComponent?: FileSearchComponent;

  isMenuPanelOpen = false;
  isFullScreen = false;
  romName?: string;
  // Human-readable status shown in the UI (e.g. "Idle", "Loading <game>", "Running: <game>")
  public status: string = 'Idle';
  isFileUploaderExpanded = false;
  private playerEl?: WasmPsxPlayerElement;
  private _scriptLoaded = false;
  //resizing 
  private _resizeObs?: ResizeObserver;
  private _onFullscreenChange = () => {
    try {
      if (this.isFullScreen) {
        this.isFullScreen = false;
      } else {
        this.isFullScreen = true;
      }
      this.ngZone.run(() => {
        this.scheduleFit();
        try { this.cdr.detectChanges(); } catch { }
      });
    } catch {
      this.scheduleFit();
    }
  };
  private _onOrientationChange = () => this.scheduleFit();
  private _fitRAF?: number;
  private _menuPollTimer?: number; 
  // --- PS1 multi‑gamepad support (2 ports like the real console) ---
  private readonly _maxPads = 2;
  private _portLabels = ['Port 1', 'Port 2'];
  public connectedPadsUI: Array<{ slot: number; id: string } | null> = [null, null];
  private _lastSeenPadIds: string[] = [];
  // Player slots → which browser gamepad index is assigned to each PS1 port
  private _players: Array<{ gpIndex: number | null }> = [
    { gpIndex: null }, // Player 1
    { gpIndex: null }  // Player 2
  ]; 
  // If true, 2nd pad mirrors Player 1 keys (safe if your build only reads P1 keys)
  private mirrorSecondPadToP1 = true; 
  // P1 keyboard mapping (common web PS1 defaults)
  private readonly _mapP1: PsxKeyMap = {
    cross: { key: 'z', code: 'KeyZ' },
    circle: { key: 'x', code: 'KeyX' },
    square: { key: 's', code: 'KeyS' },
    triangle: { key: 'd', code: 'KeyD' },
    l1: { key: 'w', code: 'KeyW' },
    l2: { key: 'e', code: 'KeyE' },
    r1: { key: 'r', code: 'KeyR' },
    r2: { key: 't', code: 'KeyT' },
    select: { key: 'c', code: 'KeyC' },
    start: { key: 'v', code: 'KeyV' },
    up: { key: 'ArrowUp', code: 'ArrowUp' },
    down: { key: 'ArrowDown', code: 'ArrowDown' },
    left: { key: 'ArrowLeft', code: 'ArrowLeft' },
    right: { key: 'ArrowRight', code: 'ArrowRight' },
  }; 
  // P2 keyboard mapping (only used if mirrorSecondPadToP1=false AND your build supports P2 keys)
  private readonly _mapP2: PsxKeyMap = {
    cross: { key: 'm', code: 'KeyM' },   // choose keys your build uses for P2
    circle: { key: 'n', code: 'KeyN' },
    square: { key: 'j', code: 'KeyJ' },
    triangle: { key: 'k', code: 'KeyK' },
    l1: { key: 'u', code: 'KeyU' },
    l2: { key: 'i', code: 'KeyI' },
    r1: { key: 'o', code: 'KeyO' },
    r2: { key: 'p', code: 'KeyP' },
    select: { key: '1', code: 'Digit1' },
    start: { key: '2', code: 'Digit2' },
    up: { key: 'w', code: 'KeyW' },
    down: { key: 's', code: 'KeyS' },
    left: { key: 'a', code: 'KeyA' },
    right: { key: 'd', code: 'KeyD' },
  }; 
  // Gamepad polling state
  private _gpRAF?: number;
  private _axisDeadzone = 0.40;      // left‑stick → D‑Pad deadzone
  private _triggerThreshold = 0.50;  // L2/R2 analog threshold
  private _useLeftStickAsDpad = true; 
  // Track synthesized keys per player so we can send balanced keyup events
  private _keysDown = new Set<string>(); 
  private readonly SAVE_STATE_KEY_PREFIX = "ps1_save_state_";

  constructor(
    private romService: RomService,
    private fileService: FileService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  ngOnInit(): void {
    this.startMenuGamepadMonitor(); 
    // window.addEventListener('keydown', (e) => console.log('[DOWN]', e.key, e.code, e.keyCode, e.which));
    // window.addEventListener('keyup', (e) => console.log('[UP  ]', e.key, e.code, e.keyCode, e.which));
  } 

  async ngAfterViewInit() {
    // 1) Create and append the element
    this.playerEl = document.createElement('wasmpsx-player') as any;
    if (this.playerEl) {
      this.playerEl.id = 'psxPlayer';
      this.playerEl.style.display = 'block';
      this.playerEl.style.width = '100%';
      this.playerEl.style.height = '100%';
      this.containerRef.nativeElement.appendChild(this.playerEl);
    }

    // 2) Load the wasmpsx script (this registers the custom element)
    await this.ensureWasmPsxLoaded(); 
    // 3) Now it can be defined + upgraded
    await customElements.whenDefined('wasmpsx-player');
    // 4) Wait until the player signals internal readiness
    await this.waitForPlayerReady(this.playerEl);
    // 5) If (rarely) still not upgraded to the class with readFile, swap once
    if (typeof (this.playerEl as any).readFile !== 'function') {
      const upgraded = document.createElement('wasmpsx-player') as any;
      upgraded.id = 'psxPlayer';
      upgraded.style.display = 'block';
      upgraded.style.width = '100%';
      upgraded.style.height = '100%';
      this.containerRef.nativeElement.replaceChild(upgraded, this.playerEl!);
      this.playerEl = upgraded;
      await this.waitForPlayerReady(this.playerEl);
    }
    // 6) Now that the element is upgraded/ready, fit once
    requestAnimationFrame(() => this.fitPlayerToContainer());
    // 7) Observers/events
    if ('ResizeObserver' in window) {
      this._resizeObs = new ResizeObserver(() => this.scheduleFit());
      this._resizeObs.observe(this.containerRef.nativeElement);
    }
    window.addEventListener('resize', this._onOrientationChange, { passive: true });
    document.addEventListener('fullscreenchange', this._onFullscreenChange, { passive: true });
    window.addEventListener('orientationchange', this._onOrientationChange, { passive: true });
    const onGpConnect = (e: GamepadEvent) => {
      this.ngZone.run(() => {
        this._lastSeenPadIds = [];          // force “change”
        this._recomputePorts(true);         // toast now
        this.cdr.detectChanges();
      });
    };
    const onGpDisconnect = (e: GamepadEvent) => {
      this.ngZone.run(() => {
        this._lastSeenPadIds = [];
        this._recomputePorts(true);
        this.cdr.detectChanges();
      });
    };
    window.addEventListener('gamepadconnected', onGpConnect);
    window.addEventListener('gamepaddisconnected', onGpDisconnect);

    // Ensure we start fresh AFTER the player is initialized
    this._lastSeenPadIds = [];
    this.ngZone.run(() => this._recomputePorts(true));
  }

  async ngOnDestroy(): Promise<void> {
    // 1) Exit fullscreen if still active (avoids a stuck fullscreen session)
    try {
      if (document.fullscreenElement) {
        (document as any).exitFullscreen?.();
      }
    } catch { /* ignore */ }

    // 2) Stop the game & release element
    await this.stopGame(false);

    this.stopGameplayGamepadLoop();
    this.stopMenuGamepadMonitor();

    // 3) Defensive DOM removal
    try {
      if (this.playerEl?.parentElement) {
        this.playerEl.parentElement.removeChild(this.playerEl);
      }
    } catch { /* ignore */ }

    // 4) Drop references
    this.playerEl = undefined;
    try { this._resizeObs?.disconnect(); } catch { }
    this._resizeObs = undefined;
    document.removeEventListener('fullscreenchange', this._onFullscreenChange);
    window.removeEventListener('orientationchange', this._onOrientationChange);
    window.removeEventListener('resize', this._onOrientationChange);
    await this.hardStopEmulator();
    if (this._fitRAF) { cancelAnimationFrame(this._fitRAF); this._fitRAF = undefined; }
  }

  async onFileSearchSelected(file: FileEntry) {
    try {
      if (!file) { this.parentRef?.showNotification('Invalid file selected'); return; }
      if (!this.playerEl) {
        await this.ensureWasmPsxLoaded();
      }

      this.startLoading();
      this.romName = file.fileName || 'Unknown';
      this.status = `Loading: ${this.getRomName()}`;

      // 1) Download ROM blob via your RomService
      const blobResp = await this.romService.getRomFile(file.fileName ?? '', this.parentRef?.user?.id, file.id);
      if (!blobResp) { this.parentRef?.showNotification('Failed to download ROM'); return; }
      const ab = await blobResp.arrayBuffer();
      console.log('Downloaded ROM, size:', ab.byteLength);

      // 2) Use readFile() to avoid CORS on blob URLs
      const gameFile = new File([ab], this.romName, { type: 'application/octet-stream' });
      console.log('readFile exists:', typeof (this.playerEl as any).readFile);
      if (typeof (this.playerEl as any).readFile !== 'function') {
        console.error('WASMpsx player readFile function not found');
        throw new Error('wasmpsx-player not initialized');
      }

      (this.playerEl as any).readFile(gameFile); // WASMpsx API
      console.log('WASMpsx readFile called');

      this.stopMenuGamepadMonitor();
      this.startGameplayGamepadLoop();

      requestAnimationFrame(() => this.fitPlayerToContainer());
      // And one more micro-pass in case the player adjusts after init
      setTimeout(() => this.fitPlayerToContainer(), 0);

      this.parentRef?.showNotification(`Booted ${this.getRomName()}`);
      this.status = `Running: ${this.getRomName()}`;
    } catch (e) {
      console.error('PS1 load failed', e);
      this.parentRef?.showNotification('Failed to load game');
      this.status = 'Error loading game';
    } finally {
      this.stopLoading();
    }
  }

  async stopGame(recreate: boolean = true) {
    try {
      const el = this.playerEl as any;
      if (!el) return;

await this.hardStopEmulator();   // ← stop runtime, workers, audio, GPU
 

      // recreate ONLY if requested
      if (recreate) {
        const fresh = document.createElement('wasmpsx-player') as any;
        fresh.style.display = 'block';
        fresh.style.width = '100%';
        fresh.style.height = '100%';
        this.containerRef.nativeElement.appendChild(fresh);
        this.playerEl = fresh;
        this.scheduleFit();
      } else {
        this.playerEl = undefined;
      }

      this.stopGameplayGamepadLoop();
      this.startMenuGamepadMonitor();

    } catch (e) {
      console.warn('stopGame failed', e);
    } finally {
      this.romName = undefined;
      this.isFullScreen = false;
      this.isMenuPanelOpen = false;
      this.isFileUploaderExpanded = false;
      this.status = 'Stopped';
    }
  }

  private async ensureWasmPsxLoaded(): Promise<void> {
    if (this._scriptLoaded) return;

    await new Promise<void>((resolve, reject) => {
      if (document.getElementById('wasmpsx-script')) { this._scriptLoaded = true; resolve(); return; }

      const base = new URL('assets/ps1/', document.baseURI).toString();

      (window as any).Module = {
        mainScriptUrlOrBlob: new URL('assets/ps1/wasmpsx.min.js', document.baseURI).toString(),
        locateFile: (path: string) => {
          if (path.endsWith('.worker.js')) return base + 'wasmpsx_worker.js';
          if (path.includes('worker') && path.endsWith('.wasm')) return base + 'wasmpsx_worker.wasm';
          if (path.endsWith('.wasm')) return base + 'wasmpsx_wasm.wasm';
          return base + path;
        },
        noExitRuntime: false,
      };

      const s = document.createElement('script');
      s.id = 'wasmpsx-script';
      s.src = base + 'wasmpsx.min.js';
      s.async = true;
      s.onload = () => { this._scriptLoaded = true; resolve(); };
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });
  }

/** 
 * Forcefully stop the emulation runtime (main loop, workers, GPU, audio). 
 * Safe to call multiple times.
 */
private async hardStopEmulator(): Promise<void> {
  try {
    const el = this.playerEl as any;
    const M = (window as any).Module;

    // 0) Best-effort pause/stop on the custom element itself
    try { el?.pause?.(); } catch {}
    try { el?.stop?.(); } catch {}
    try { el?.destroy?.(); } catch {}
    try { el?.dispose?.(); } catch {}
    try { el?.reset?.(); } catch {}

    // 1) Stop/abort the Emscripten main loop (various APIs across versions)
    try { M?.Browser?.mainLoop?.pause?.(); } catch {} 
    try {
      if (M && M.Browser && M.Browser.mainLoop) {
        M.Browser.mainLoop.scheduler = () => {};
      }
    } catch {}
    try { (M as any)?._emscripten_cancel_main_loop?.(); } catch {}
    try { (M as any).cancelMainLoop?.(); } catch {}
    try { (M as any).ABORT = true; } catch {}

    // 2) Tell the runtime it can exit (if still running)
    try { M.noExitRuntime = false; } catch {}
    try { M.quit?.(0); } catch {}
    try { M.exit?.(0); } catch {}
    try { M._exit?.(0); } catch {}

    // 3) Terminate any workers (main worker and pthreads)
    try { el?.worker?.terminate?.(); } catch {}
    try {
      if (Array.isArray(el?.workers)) {
        el.workers.forEach((w: any) => { try { w.terminate(); } catch {} });
        el.workers = [];
      }
    } catch {}
    try { M?.PThread?.terminateAllThreads?.(); } catch {}
    try { M?.worker?.terminate?.(); } catch {}
    try {
      if (Array.isArray(M?.workers)) {
        M.workers.forEach((w: any) => { try { w.terminate(); } catch {} });
        M.workers = [];
      }
    } catch {}

    // 4) Stop WebAudio (close contexts, audio worklets)
    try {
      // Close contexts tracked by the wrapper we installed previously
      const tracked: Set<BaseAudioContext> | undefined = (window as any).__trackedAudioCtxSet;
      if (tracked && tracked.size) {
        await Promise.all(Array.from(tracked).map(async (ctx) => {
          try {
            if (ctx.state !== 'closed') {
              try { await (ctx as any).close?.(); } catch {
                try { await (ctx as any).suspend?.(); } catch {}
              }
            }
          } catch {}
        }));
        for (const ctx of Array.from(tracked)) {
          if (ctx.state === 'closed') tracked.delete(ctx);
        }
      }
    } catch {}
    try { await el?.audioCtx?.close?.(); } catch {}
    try { await M?.SDL?.audio?.context?.close?.(); } catch {}
    try { M && (M.SDL && (M.SDL.audio && (M.SDL.audio.noAudio = true))); } catch {}
    try {
      const n = el?.audioWorkletNode;
      if (n?.port?.close) n.port.close();
      if (n?.disconnect) n.disconnect();
    } catch {}

    // 5) Release GPU contexts (WebGL), OffscreenCanvas
    try {
      const canvas: HTMLCanvasElement | OffscreenCanvas | undefined =
        el?.canvas || el?.shadowRoot?.querySelector?.('canvas');
      const gl: WebGLRenderingContext | WebGL2RenderingContext | null =
        (canvas as any)?.getContext?.('webgl2') ||
        (canvas as any)?.getContext?.('webgl') || null;
      if (gl && (gl as any).getExtension) {
        const ext = (gl as any).getExtension('WEBGL_lose_context');
        try { ext?.loseContext?.(); } catch {}
      }
      // If using OffscreenCanvas in worker, the worker termination above usually suffices.
    } catch {}

    // 6) Remove element from DOM last (prevents re-creation races)
    try { el?.remove?.(); } catch {}

  } catch (error) {
    console.log('hardStopEmulator: unexpected error during shutdown', error);
  }
  
  const tracked = (window as any).__trackedAudioCtxSet as Set<BaseAudioContext> | undefined; 
  const trackedStates: AudioContextState[] = tracked
    ? [...tracked].map((ctx) => ctx.state)
    : []; 
  console.log('post-stop',
    'raf?', this._gpRAF,
    'menuPoll?', this._menuPollTimer,
    'fitRAF?', this._fitRAF,
    'trackedAudio:', trackedStates,
    'document.fullscreenElement?', !!document.fullscreenElement
  ); 
}

  async toggleFullscreen(): Promise<void> {
    const target = this.fullscreenContainer?.nativeElement || this.containerRef.nativeElement;
    if (!document.fullscreenElement) {
      await target.requestFullscreen?.();
    } else {
      await (document as any).exitFullscreen?.(); 
    }
  }

  private waitForPlayerReady(el: any, timeoutMs = 20000): Promise<void> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('wasmpsx not ready in time')), timeoutMs);

      if (el?.isReady === true) { clearTimeout(t); return resolve(); }
      if (el?.ready instanceof Promise) { el.ready.then(() => { clearTimeout(t); resolve(); }).catch(reject); return; }

      el?.addEventListener?.('ready', () => { clearTimeout(t); resolve(); }, { once: true });

      const iv = setInterval(() => {
        if (el?.worker || el?.module) { clearInterval(iv); clearTimeout(t); resolve(); }
      }, 100);

      const host = document.querySelector('wasmpsx-player');
      const canvas = host?.shadowRoot?.querySelector?.('canvas');
      console.log({
        hasWorker: !!(host as any)?.worker,
        worker: (host as any)?.worker,
        moduleOnElement: !!(host as any)?.module,
        moduleOnWindow: !!(window as any)?.Module,
        canvasPresent: !!canvas,
        canvasSize: canvas ? { cssW: canvas.clientWidth, cssH: canvas.clientHeight, attrW: (canvas as HTMLCanvasElement).width, attrH: (canvas as HTMLCanvasElement).height } : null
      });
    })
  }

  /** Force the emulator picture to fill the container by scaling the actual framebuffer via CSS. */
  private fitPlayerToContainer() {
    const host = this.playerEl as any;
    const container = this.containerRef?.nativeElement as HTMLElement | undefined;
    if (!host || !container) return;

    // Ensure the container acts as a positioning context and clips any overflow.
    container.style.position = container.style.position || 'relative';
    container.style.overflow = 'hidden';

    // Container size in CSS pixels
    const rect = container.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));

    // Find the canvas the emulator draws to
    const canvas: HTMLCanvasElement | undefined =
      host.canvas || host.shadowRoot?.querySelector?.('canvas');
    if (!canvas) {
      // Closed shadow or not created yet—at least size the host so we get no layout surprises
      (host as HTMLElement).style.width = cssW + 'px';
      (host as HTMLElement).style.height = cssH + 'px';
      return;
    }

    // Try to detect the real framebuffer size (best is WebGL drawing buffer)
    let fbW = canvas.width || 1;
    let fbH = canvas.height || 1;
    try {
      const gl =
        (canvas as any).getContext?.('webgl2') ||
        (canvas as any).getContext?.('webgl') ||
        null;
      if (gl && gl.drawingBufferWidth && gl.drawingBufferHeight) {
        fbW = gl.drawingBufferWidth;
        fbH = gl.drawingBufferHeight;
      }
    } catch { /* ignore */ }

    // If the attributes were changed earlier, normalize so our transform math is consistent
    // We’ll size the CSS box to the framebuffer and scale from there.
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.width = fbW + 'px';
    canvas.style.height = fbH + 'px';

    // Choose scaling strategy:
    //   COVER = fills the entire container (might crop a little, like background-size: cover)
    //   CONTAIN = fits entirely with letterboxing/pillarboxing
    const COVER = true;
    const scaleX = cssW / fbW;
    const scaleY = cssH / fbH;
    const scale = COVER ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);

    // Center the scaled image (optional — keeps it visually centered when aspect differs)
    const scaledW = fbW * scale;
    const scaledH = fbH * scale;
    const offsetX = Math.floor((cssW - scaledW) / 2);
    const offsetY = Math.floor((cssH - scaledH) / 2);

    canvas.style.transformOrigin = 'top left';
    canvas.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

    // Nicer upscaling
    canvas.style.imageRendering = 'pixelated';
    (host as HTMLElement).style.display = 'block'; // defensive
    this.debugCanvasSizing();
    // If your container was 0 height due to CSS, nothing will fill. Make sure upstream gives it height.
  }

  private debugCanvasSizing() {
    const host = this.playerEl as any;
    const container = this.containerRef?.nativeElement as HTMLElement | undefined;
    const canvas: HTMLCanvasElement | undefined =
      host.canvas || host.shadowRoot?.querySelector?.('canvas');

    const rect = container?.getBoundingClientRect();
    let fbW = canvas?.width, fbH = canvas?.height;
    try {
      const gl =
        (canvas as any)?.getContext?.('webgl2') ||
        (canvas as any)?.getContext?.('webgl');
      if (gl) { fbW = gl.drawingBufferWidth; fbH = gl.drawingBufferHeight; }
    } catch { }

    console.log('container:', rect?.width, rect?.height,
      'canvas attr:', canvas?.width, canvas?.height,
      'framebuffer:', fbW, fbH,
      'css:', canvas && getComputedStyle(canvas).width, canvas && getComputedStyle(canvas).height);
  }

  // Drop-in replacement for scheduleFit()
  private scheduleFit = () => {
    if (this._fitRAF) cancelAnimationFrame(this._fitRAF);
    this._fitRAF = requestAnimationFrame(() => {
      this._fitRAF = undefined;
      this.fitPlayerToContainer();
    });
  }; 

  /** Start polling gamepads and mapping them to emulator keys (P1/P2). */
  private startGameplayGamepadLoop() {
    const loop = () => {
      this._pollGamepadsP1P2();
      this._gpRAF = requestAnimationFrame(loop);
    };
    if (!this._gpRAF) this._gpRAF = requestAnimationFrame(loop);
  }

  private stopGameplayGamepadLoop() {
    if (this._gpRAF) cancelAnimationFrame(this._gpRAF);
    this._gpRAF = undefined;
  }

  /** Poll both PS1 slots and apply mappings. */
  private _pollGamepadsP1P2() {
    const pads = this._getEligiblePadsSnapshot();

    const ids = pads.map(p => p.id);
    const last = this._lastSeenPadIds;
    const changed = ids.length !== last.length || ids.some((id, i) => id !== last[i]);
    const firstAppearance = last.length === 0 && ids.length > 0; // optional helper

    if (changed || firstAppearance) {
      this.ngZone.run(() => {
        console.log('[GP] change detected → recomputing ports:', ids);
        this._recomputePorts(true);
        this._lastSeenPadIds = ids;
      });
    }

    // Stay outside Angular for input synthesis (no change detection needed)
    for (let p = 0; p < this._maxPads; p++) {
      const idx = this._players[p].gpIndex;
      if (idx == null) continue;

      const raw = navigator.getGamepads?.() || [];
      const gp = raw[idx] as Gamepad | null | undefined;
      if (!this._isEligiblePad(gp)) continue;

      const map = (p === 0 || this.mirrorSecondPadToP1) ? this._mapP1 : this._mapP2;
      this._applyPadToKeys(p, gp, map);
    }
    if (!this.romName) {
      console.log("GP SNAPSHOT:", navigator.getGamepads());
    }
  }

  /** Map a gamepad to a specific player's key map. */
  private _applyPadToKeys(
    player: number,
    gp: Gamepad,
    map: PsxKeyMap
  ) {
    const B = gp.buttons;
    const btn = (i: number) => !!(B[i] && (B[i].pressed || B[i].value > 0.5));
    const analogBtn = (i: number, th = this._triggerThreshold) => !!(B[i] && (B[i].value ?? 0) > th);

    // Face buttons (standard mapping indices 0–3) [3](https://stackoverflow.com/questions/37721782/what-are-passive-event-listeners)
    this._setKeyP(player, map.cross, btn(0));
    this._setKeyP(player, map.circle, btn(1));
    this._setKeyP(player, map.square, btn(2));
    this._setKeyP(player, map.triangle, btn(3));

    // Shoulders / triggers (4–7)
    this._setKeyP(player, map.l1, btn(4));
    this._setKeyP(player, map.r1, btn(5));
    this._setKeyP(player, map.l2, analogBtn(6));
    this._setKeyP(player, map.r2, analogBtn(7));

    // Select / Start (8–9)
    this._setKeyP(player, map.select, btn(8));
    this._setKeyP(player, map.start, btn(9));

    // D‑Pad (12–15). Also allow LS as D‑Pad with deadzone. [3](https://stackoverflow.com/questions/37721782/what-are-passive-event-listeners)
    const up = btn(12) || (this._useLeftStickAsDpad && (gp.axes[1] ?? 0) < -this._axisDeadzone);
    const down = btn(13) || (this._useLeftStickAsDpad && (gp.axes[1] ?? 0) > this._axisDeadzone);
    const left = btn(14) || (this._useLeftStickAsDpad && (gp.axes[0] ?? 0) < -this._axisDeadzone);
    const right = btn(15) || (this._useLeftStickAsDpad && (gp.axes[0] ?? 0) > this._axisDeadzone);

    this._setKeyP(player, map.up, up);
    this._setKeyP(player, map.down, down);
    this._setKeyP(player, map.left, left);
    this._setKeyP(player, map.right, right);
  }

  /** Synthesize keydown/keyup once per change, namespaced by player. */
  private _setKeyP(player: number, mapping: { key: string; code: string }, pressed: boolean) {
    const { key, code } = mapping;
    const id = `${player}:${key}|${code}`;
    const isDown = this._keysDown.has(id);

    const targets = this._getInputTargets();

    if (pressed && !isDown) {
      this._keysDown.add(id);
      for (const t of targets) this._dispatchKey(t, 'keydown', key, code);
    } else if (!pressed && isDown) {
      this._keysDown.delete(id);
      for (const t of targets) this._dispatchKey(t, 'keyup', key, code);
    }
  }


  /** Release any keys currently held by a specific player (on disconnect). */
  private _releaseAllKeysForPlayer(player: number) {
    const prefix = `${player}:`;
    for (const id of Array.from(this._keysDown)) {
      if (!id.startsWith(prefix)) continue;
      const rest = id.substring(prefix.length);
      const [key, code] = rest.split('|');
      document.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true }));
      this._keysDown.delete(id);
    }
  }

  /** Release all keys for all players (on destroy). */
  private _releaseAllKeys() {
    for (const id of Array.from(this._keysDown)) {
      // id format: `${player}:${key}|${code}`
      const colon = id.indexOf(':');
      const pipe = id.indexOf('|', colon + 1);
      const key = id.substring(colon + 1, pipe);
      const code = id.substring(pipe + 1);
      for (const t of this._getInputTargets()) {
        this._dispatchKey(t, 'keyup', key, code);
      }
      this._keysDown.delete(id);
    }
  }


  /** Accept only “real” pads: connected & have the standard mapping */
  private _isEligiblePad(gp: Gamepad | null | undefined): gp is Gamepad {
    if (!gp || !gp.connected) return false;

    const id = gp.id.toLowerCase();

    // BLOCK audio devices that pretend to be gamepads
    if (
      id.includes('poly') ||
      id.includes('bt700') ||
      id.includes('headset') ||
      id.includes('headphone') ||
      id.includes('audio') ||
      id.includes('hands-free') ||
      id.includes('speaker')
    ) {
      return false;
    }

    // STRICT MODE — only real controllers
    return gp.mapping === 'standard';
  }

  /** Resolve current snapshot of eligible pads in a stable order */
  private _getEligiblePadsSnapshot(): Gamepad[] {
    const arr = (navigator.getGamepads?.() || []) as (Gamepad | null | undefined)[];
    return arr.filter(this._isEligiblePad).sort((a, b) => a.index - b.index);
  }

  /** Assign up to two pads to PS1 ports (stable: Port 1 first, then Port 2). */
  private _assignPortsFromSnapshot(pads: Gamepad[], notify = false) {
    // Keep old slots to compare later
    const oldP1 = this._players[0].gpIndex;
    const oldP2 = this._players[1].gpIndex;
    // Candidate list: in index order
    const firstTwo = pads.slice(0, this._maxPads);

    // Fill ports in order
    for (let p = 0; p < this._maxPads; p++) {
      const chosen = firstTwo[p];
      this._players[p].gpIndex = chosen ? chosen.index : null;
      this.connectedPadsUI[p] = chosen ? { slot: p, id: chosen.id } : null;
    }

    // Toast changes (optional)
    if (notify) {
      const newP1 = this._players[0].gpIndex;
      const newP2 = this._players[1].gpIndex;

      if (oldP1 !== newP1) {
        if (newP1 != null) this.parentRef?.showNotification(`Connected → ${this._portLabels[0]} (${this.connectedPadsUI[0]?.id})`);
        else this.parentRef?.showNotification(`Disconnected ← ${this._portLabels[0]}`);
      }
      if (oldP2 !== newP2) {
        if (newP2 != null) this.parentRef?.showNotification(`Connected → ${this._portLabels[1]} (${this.connectedPadsUI[1]?.id})`);
        else this.parentRef?.showNotification(`Disconnected ← ${this._portLabels[1]}`);
      }
    }
  }

  /** When a single pad connects, re-evaluate all and re-pack into Port 1/2. */
  private _recomputePorts(notify = true) {
    const snapshot = this._getEligiblePadsSnapshot();
    this._assignPortsFromSnapshot(snapshot, notify);
  }


  private startMenuGamepadMonitor() {
    if (this._menuPollTimer) return;

    this._menuPollTimer = window.setInterval(() => {
      const pads = this._getEligiblePadsSnapshot();
      const ids = pads.map(p => p.id);

      if (ids.join() !== this._lastSeenPadIds.join()) {
        this.ngZone.run(() => {
          this._lastSeenPadIds = ids;
          this._recomputePorts(true);
          this.cdr.detectChanges(); // <-- THIS MAKES TOAST + UI WORK
        });
      }
    }, 500);
  }

  private stopMenuGamepadMonitor() {
    if (this._menuPollTimer) {
      clearInterval(this._menuPollTimer);
      this._menuPollTimer = undefined;
    }
  }

  // Map KeyboardEvent.code to legacy keyCode used by some SDL paths
  private _codeToKeyCode(code: string): number {
    if (!code) return 0;
    if (code.startsWith('Key') && code.length === 4) {
      return code.charCodeAt(3); // KeyZ -> 'Z' -> 90
    }
    if (code.startsWith('Digit')) {
      const n = Number(code.substring(5));
      return isFinite(n) ? (48 + n) : 0; // Digit1 -> 49
    }
    switch (code) {
      case 'ArrowUp': return 38;
      case 'ArrowDown': return 40;
      case 'ArrowLeft': return 37;
      case 'ArrowRight': return 39;
      case 'Enter': return 13;
      case 'Space': return 32;
      case 'ShiftLeft':
      case 'ShiftRight': return 16;
      case 'ControlLeft':
      case 'ControlRight': return 17;
      case 'AltLeft':
      case 'AltRight': return 18;
      default: return 0;
    }
  }

  private _getInputTargets(): EventTarget[] {
    const targets: EventTarget[] = [window, document];
    const host = this.playerEl as any;
    const canvas = host?.shadowRoot?.querySelector?.('canvas') as HTMLCanvasElement | null;
    if (canvas) {
      // make sure it can receive focus
      if (!canvas.hasAttribute('tabindex')) canvas.setAttribute('tabindex', '0');
      try { canvas.focus(); } catch { }
      targets.unshift(canvas); // prioritize the canvas first
    }
    // Also try the host custom element
    if (host) targets.push(host as EventTarget);
    return targets;
  }

  // Dispatch a KeyboardEvent with legacy props patched and composed=true
  private _dispatchKey(
    target: EventTarget,
    type: 'keydown' | 'keyup',
    key: string,
    code: string
  ) {
    const keyCode = this._codeToKeyCode(code);
    const ev = new KeyboardEvent(type, {
      key,
      code,
      bubbles: true,
      cancelable: true,
      composed: true,  // cross shadow boundary
    });

    // Patch read-only legacy props via getter (many SDL paths read these)
    try {
      Object.defineProperty(ev, 'keyCode', { get: () => keyCode });
      Object.defineProperty(ev, 'which', { get: () => keyCode });
    } catch { /* ignore */ }

    try { (target as any).dispatchEvent(ev); } catch { /* ignore */ }
  }

  
/** Build the storage key for the current ROM. */
private getSaveStateKey(): string {
  const base = this.getRomName() || "unnamed_rom";
  return this.SAVE_STATE_KEY_PREFIX + base.toLowerCase();
}

/** Save a snapshot of emulator RAM+VRAM to IndexedDB. */
async saveState() {
  try {
    if (!this.playerEl || typeof (this.playerEl as any).saveState !== "function") {
      this.parentRef?.showNotification("Save state not supported by this build.");
      return;
    }

    const blob: Blob = await (this.playerEl as any).saveState();
    const arrayBuf = await blob.arrayBuffer();

    // Store in IndexedDB (Emscripten FS DB)
    const key = this.getSaveStateKey();
    await this.storeBinaryInIndexedDB(key, new Uint8Array(arrayBuf));

    this.parentRef?.showNotification(`Saved state for ${this.getRomName()}`);
  } catch (e) {
    console.error("Save state failed:", e);
    this.parentRef?.showNotification("Save state failed.");
  }
}


/** Load state from IndexedDB and feed it into the emulator. */
async loadState() {
  try {
    if (!this.playerEl || typeof (this.playerEl as any).loadState !== "function") {
      this.parentRef?.showNotification("Load state not supported by this build.");
      return;
    }

    const key = this.getSaveStateKey();
    const data = await this.retrieveBinaryFromIndexedDB(key);
    if (!data) {
      this.parentRef?.showNotification("No saved state found.");
      return;
    } 

    const ab = await this.retrieveArrayBufferFromIndexedDB(key);
    if (!ab) { /* notify no state */ return; }
    const blob = new Blob([ab], { type: "application/octet-stream" });
    await (this.playerEl as any).loadState(blob);

    this.parentRef?.showNotification(`Loaded state for ${this.getRomName()}`);
  } catch (e) {
    console.error("Load state failed:", e);
    this.parentRef?.showNotification("Load state failed.");
  }
}

private async retrieveArrayBufferFromIndexedDB(key: string): Promise<ArrayBuffer | null> {
  const { storeName } = this.getDbInfo();
  const db = await this.openIDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => {
      const result = req.result as ArrayBuffer | undefined;
      resolve(result ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}


/** Remove stored save state for current ROM. */
async clearState() {
  const key = this.getSaveStateKey();
  await this.removeFromIndexedDB(key);
  this.parentRef?.showNotification("Save state cleared.");
} 

// -----------------------------
// IndexedDB HELPER FUNCTIONS
// -----------------------------
private getDbInfo() {
  const dbName = "EM_FS_" + window.location.pathname;
  const storeName = "FILE_DATA";
  const dbVersion = 20;
  return { dbName, storeName, dbVersion };
}

private async openIDB(): Promise<IDBDatabase> {
  const { dbName, dbVersion, storeName } = this.getDbInfo();
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, dbVersion);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

private async storeBinaryInIndexedDB(key: string, data: Uint8Array): Promise<void> {
  const { storeName } = this.getDbInfo();
  const db = await this.openIDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], "readwrite");
    const store = tx.objectStore(storeName);

    const req = store.put(data, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

private async retrieveBinaryFromIndexedDB(key: string): Promise<Uint8Array | null> {
  const { storeName } = this.getDbInfo();
  const db = await this.openIDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], "readonly");
    const store = tx.objectStore(storeName);

    const req = store.get(key);
    req.onsuccess = () => {
      resolve(req.result ? new Uint8Array(req.result) : null);
    };
    req.onerror = () => reject(req.error);
  });
}

private async removeFromIndexedDB(key: string): Promise<void> {
  const { storeName } = this.getDbInfo();
  const db = await this.openIDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], "readwrite");
    const store = tx.objectStore(storeName);

    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
} 

  getRomName(): string {
    const n = this.romName || '';
    return n.replace(/\.(bin|img|iso|cue|mdf|pbp|chd)$/i, '');
  }

  getAllowedRomFileTypes(): string[] {
    return this.fileService.ps1FileExtensions;
  }

  getAllowedRomFileTypesString(): string {
    return this.fileService.ps1FileExtensions.map(e => '.' + e.trim().toLowerCase()).join(',');
  }

  finishFileUploading() {
    this.isFileUploaderExpanded = false;
    this.parentRef?.closeOverlay();
  }

  showMenuPanel() {
    this.isMenuPanelOpen = true;
    this.parentRef?.showOverlay();
  }

  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    this.parentRef?.closeOverlay();
  }
}