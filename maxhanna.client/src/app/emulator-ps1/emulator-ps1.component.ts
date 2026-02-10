
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
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
  isFileUploaderExpanded = false;
  private playerEl?: WasmPsxPlayerElement;
  private _scriptLoaded = false;
  //resizing 
  private _resizeObs?: ResizeObserver;
  private _onFullscreenChange = () => this.scheduleFit();
  private _onOrientationChange = () => this.scheduleFit(); 
  private _fitRAF?: number;



  constructor(
    private romService: RomService,
    private fileService: FileService,
    private ngZone: NgZone,
  ) {
    super();
  }

  ngOnInit(): void {
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

    // 7) Observers/events (fine to keep these)
    if ('ResizeObserver' in window) {
      this._resizeObs = new ResizeObserver(() => this.fitPlayerToContainer());
      this._resizeObs.observe(this.containerRef.nativeElement);
    }
    window.addEventListener('resize', this._onOrientationChange, { passive: true });
    document.addEventListener('fullscreenchange', this._onFullscreenChange, { passive: true });
    window.addEventListener('orientationchange', this._onOrientationChange, { passive: true });
  }


  ngOnDestroy(): void {
    // 1) Exit fullscreen if still active (avoids a stuck fullscreen session)
    try {
      if (document.fullscreenElement) {
        (document as any).exitFullscreen?.();
      }
    } catch { /* ignore */ }

    // 2) Stop the game & release element
    try { this.stopGame().catch(() => { }); } catch { /* ignore */ }

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
  }

  async onFileSearchSelected(file: FileEntry) {
    try {
      if (!file) { this.parentRef?.showNotification('Invalid file selected'); return; }
      if (!this.playerEl) {
        await this.ensureWasmPsxLoaded();
      }

      this.startLoading();
      this.romName = file.fileName || 'Unknown';

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

      requestAnimationFrame(() => this.fitPlayerToContainer());
      // And one more micro-pass in case the player adjusts after init
      setTimeout(() => this.fitPlayerToContainer(), 0);

      this.parentRef?.showNotification(`Booted ${this.getRomName()}`);
    } catch (e) {
      console.error('PS1 load failed', e);
      this.parentRef?.showNotification('Failed to load game');
    } finally {
      this.stopLoading();
    }
  }

  async stopGame() {
    try {
      const el = this.playerEl as any;
      if (!el) return;

      // 1) Pause if API exists
      try { el.pause?.(); } catch { /* ignore */ }

      // 2) Call a destroy/dispose/reset if the custom element exposes it
      // (Many emulators provide one of these; if not present, that's fine.)
      try { el.destroy?.(); } catch { /* ignore */ }
      try { el.dispose?.(); } catch { /* ignore */ }
      try { el.reset?.(); } catch { /* ignore */ }

      // 3) Terminate worker(s) if exposed
      try { el.worker?.terminate?.(); } catch { /* ignore */ }
      // Some builds keep an array of workers
      try {
        if (Array.isArray(el.workers)) {
          el.workers.forEach((w: Worker) => { try { w.terminate(); } catch { } });
          el.workers = [];
        }
      } catch { /* ignore */ }

      // 4) Close audio context if present
      try { await el.audioCtx?.close?.(); } catch { /* ignore */ }

      // 5) If Emscripten Module is hung, try to quit()
      try { await el.module?.quit?.(); } catch { /* ignore */ }

      // 6) Remove from DOM
      try { el.remove(); } catch { /* ignore */ }

      // 7) Drop references so GC can collect
      try {
        if (el.module) el.module = undefined;
        if (el.worker) el.worker = undefined;
      } catch { /* ignore */ }

      // 8) Recreate an empty player if you want to keep the UI alive
      const fresh = document.createElement('wasmpsx-player') as any;
      fresh.style.display = 'block';
      fresh.style.width = '100%';
      fresh.style.height = '100%';
      this.containerRef.nativeElement.appendChild(fresh);
      this.playerEl = fresh;
    } catch (e) {
      console.warn('stopGame failed', e);
    } finally {
      this.romName = undefined;
      this.isFullScreen = false;
      this.isMenuPanelOpen = false;
      this.isFileUploaderExpanded = false;
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
          // 🔽 use the proxy worker instead of the minified one
          if (path.endsWith('.worker.js')) return base + 'wasmpsx_worker_proxy.js';
          // Worker WASM (keep original)
          if (path.includes('worker') && path.endsWith('.wasm')) return base + 'wasmpsx_worker.wasm';
          // Main WASM
          if (path.endsWith('.wasm')) return base + 'wasmpsx_wasm.wasm';
          // Fallback
          return base + path;
        }
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

  async toggleFullscreen(): Promise<void> {
    const target = this.fullscreenContainer?.nativeElement || this.containerRef.nativeElement;
    if (!document.fullscreenElement) {
      await target.requestFullscreen?.();
      this.isFullScreen = true;
    } else {
      await (document as any).exitFullscreen?.();
      this.isFullScreen = false;
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

  /** Resize the DOM canvas to fill the container, then resize the *runtime* render buffer. */
  private fitPlayerToContainer() {
    const host = this.playerEl as any;
    const container = this.containerRef?.nativeElement;
    if (!host || !container) return;

    // 1) Container size in CSS pixels
    const rect = container.getBoundingClientRect();
    const cssW = Math.max(0, Math.floor(rect.width));
    const cssH = Math.max(0, Math.floor(rect.height));
    const dpr = window.devicePixelRatio || 1;

    // 2) Find the canvas (open shadow or property)
    const canvas: HTMLCanvasElement | undefined =
      host.canvas || host.shadowRoot?.querySelector?.('canvas');

    // If we cannot reach the canvas (closed shadow), at least size the host
    if (!canvas) {
      (host as HTMLElement).style.width = cssW + 'px';
      (host as HTMLElement).style.height = cssH + 'px';
      // We still try to resize the runtime (worker/main) below.
    } else {
      // 3) CSS layout size
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';

      // 4) Backing pixel size (for crisp rendering on HiDPI)
      const pxW = Math.max(1, Math.floor(cssW * dpr));
      const pxH = Math.max(1, Math.floor(cssH * dpr));
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
      }
    }

    // 5) Resize the actual *render buffer + viewport* in whichever place owns GL
    //    (Emscripten main-thread module OR a Worker with OffscreenCanvas).
    this.resizeRuntimeRenderBuffer(cssW, cssH, dpr);
  }

  /** Resize the *runtime* (Emscripten/GL) render buffer so the game fills the canvas. */
  private resizeRuntimeRenderBuffer(cssW: number, cssH: number, dpr: number) {
    const host = this.playerEl as any;
    const pxW = Math.max(1, Math.floor(cssW * dpr));
    const pxH = Math.max(1, Math.floor(cssH * dpr));

    // A) If this build runs on the main thread, use Emscripten's Module.setCanvasSize
    const mod = host?.module || (window as any).Module;
    if (mod?.setCanvasSize) {
      try {
        mod.setCanvasSize(pxW, pxH);       // updates framebuffer + viewport (main thread)
        // If you want strict 4:3 letterboxing from Emscripten, uncomment:
        // mod.forcedAspectRatio = 4 / 3;  // apply once if desired
        return;
      } catch { /* fall through */ }
    }

    // B) If the renderer lives in a Worker/OffscreenCanvas, ask the worker to resize.
    if (host?.worker?.postMessage) {
      try {
        host.worker.postMessage({ type: 'canvas-resize', width: pxW, height: pxH, dpr });
        return;
      } catch { /* ignore */ }
    }

    // C) Last resort (no-ops on worker builds): try updating GL viewport on main thread
    try {
      const canvas: HTMLCanvasElement | undefined =
        host.canvas || host.shadowRoot?.querySelector?.('canvas');
      const gl = (canvas as any)?.getContext?.('webgl2')
        || (canvas as any)?.getContext?.('webgl')
        || (canvas as any)?.getContext?.('2d');
      (gl as any)?.viewport?.(0, 0, pxW, pxH);
    } catch { /* ignore */ }
  }

// Drop-in replacement for scheduleFit()
private scheduleFit = () => {
  if (this._fitRAF) cancelAnimationFrame(this._fitRAF);
  this._fitRAF = requestAnimationFrame(() => {
    this._fitRAF = undefined;
    this.fitPlayerToContainer();
  });
};

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