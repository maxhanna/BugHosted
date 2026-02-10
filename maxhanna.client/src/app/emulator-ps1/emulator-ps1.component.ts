
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
  private _resizeRAF?: number;


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
    // 1) Create and append the <wasmpsx-player> BEFORE loading the script
    this.playerEl = document.createElement('wasmpsx-player') as any;
    if (this.playerEl) {
      this.playerEl.id = 'psxPlayer'; // optional, helpful for debugging
      this.playerEl.style.display = 'block';
      this.playerEl.style.width = '100%';
      this.playerEl.style.height = '100%';
      this.containerRef.nativeElement.appendChild(this.playerEl);
    }
    // 2) Now load the script (it may eagerly look for the element we just added)
    await this.ensureWasmPsxLoaded();

    // 3) Wait for custom element definition/upgrade (browser-level)
    await customElements.whenDefined('wasmpsx-player');
    await this.waitForPlayerReady(this.playerEl);
    // 4) If the first element didn’t upgrade (very rare), replace it once
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
    requestAnimationFrame(() => this.fitPlayerToContainer());

    // Observe container size changes
    if ('ResizeObserver' in window) {
      this._resizeObs = new ResizeObserver(() => this.fitPlayerToContainer());
      this._resizeObs.observe(this.containerRef.nativeElement);
    } 

    // Fullscreen & device orientation
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
    try { this._resizeObs?.disconnect(); } catch {}
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

      // Tell Emscripten how to find side files (wasm + worker)
      (window as any).Module = {
        // This helps some Emscripten builds resolve worker URLs correctly
        mainScriptUrlOrBlob: new URL('assets/ps1/wasmpsx.min.js', document.baseURI).toString(),

        locateFile: (path: string) => {
          console.log('[wasmpsx] locateFile:', path);
          // Worker JS
          if (path.endsWith('.worker.js')) return base + 'wasmpsx_worker.js';
          // Worker WASM (some builds request the worker’s wasm by a different name)
          if (path.includes('worker') && path.endsWith('.wasm')) return base + 'wasmpsx_worker.wasm';
          // Main WASM (Emscripten often asks for something like 'wasmpsx.min.wasm')
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
    });
  }

/** Tell Emscripten about the new render size so the PS1 framebuffer fills the canvas. */
private syncEmscriptenViewport(pxW: number, pxH: number) {
  const host = this.playerEl as any;
  const mod = host?.module || (window as any).Module;
  if (!mod) return;

  try {
    // 1) If your UI is flexible, just push the actual pixel size:
    mod.setCanvasSize?.(pxW, pxH);

    // 2) If you want to *enforce* a specific aspect (e.g., 4:3),
    //    set this once (or whenever your container ratio changes).
    //    Comment this out if you prefer free-stretch to the container.
    // mod.forcedAspectRatio = 4 / 3; // ~1.3333
  } catch {
    // Some builds may not export setCanvasSize; safe to ignore.
  }
}

/** Resize player canvas to fill its container (CSS px) and match DPR for crisp rendering. */
private fitPlayerToContainer() {
  const host = this.playerEl as any;
  const container = this.containerRef?.nativeElement;
  if (!host || !container) return;

  // Container size in CSS pixels
  const rect = container.getBoundingClientRect();
  const cssW = Math.max(0, Math.floor(rect.width));
  const cssH = Math.max(0, Math.floor(rect.height));
  const dpr = window.devicePixelRatio || 1;

  // Try to find the actual <canvas>
  const canvas: HTMLCanvasElement | undefined =
    host.canvas || host.shadowRoot?.querySelector?.('canvas');

  if (!canvas) {
    // Closed shadow? Fallback to CSS-only; ensure host fills the container.
    (host as HTMLElement).style.width = cssW + 'px';
    (host as HTMLElement).style.height = cssH + 'px';
    return;
  }

  // 1) CSS size: make canvas fill container (layout size)
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';

  // 2) Backing store size: match DPR for sharpness on HiDPI/Retina
  const pxW = Math.max(1, Math.floor(cssW * dpr));
  const pxH = Math.max(1, Math.floor(cssH * dpr));
  if (canvas.width !== pxW || canvas.height !== pxH) {
    canvas.width = pxW;
    canvas.height = pxH;
  }

  // 3) Update GL viewport if relevant (safe no-op for 2D)
  try {
    const gl = (canvas as any).getContext?.('webgl2') || (canvas as any).getContext?.('webgl') || (canvas as any).getContext?.('2d');
    (gl as any)?.viewport?.(0, 0, pxW, pxH);
  } catch { /* ignore */ } 

  this.syncEmscriptenViewport(pxW, pxH); 
} 

private scheduleFit() {
  if (this._resizeRAF) cancelAnimationFrame(this._resizeRAF);
  this._resizeRAF = requestAnimationFrame(() => {
    this._resizeRAF = undefined;
    this.fitPlayerToContainer();
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