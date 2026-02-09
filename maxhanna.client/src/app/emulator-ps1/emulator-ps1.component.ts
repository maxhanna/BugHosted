
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
    }
  }


  ngOnDestroy(): void {
    try { this.stopGame().catch(() => { }); } catch { }
    // Remove the player element to release DOM references
    try {
      if (this.playerEl?.parentElement) this.playerEl.parentElement.removeChild(this.playerEl);
    } catch { }
    this.playerEl = undefined;
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
      // WASMpsx doesn’t document a formal “stop()”; removing the element is a clean exit
      if (this.playerEl) {
        const el = this.playerEl;
        // Try pause() if present, then detach/recreate
        try { (el as any).pause?.(); } catch { }
        el.remove();
        // Recreate an empty player element so the UI stays ready
        const fresh = document.createElement('wasmpsx-player') as any;
        fresh.style.display = 'block';
        fresh.style.width = '100%';
        fresh.style.height = '100%';
        this.containerRef.nativeElement.appendChild(fresh);
        this.playerEl = fresh;
      }
    } catch (e) { console.warn('stopGame failed', e); }
    finally {
      this.romName = undefined;
      this.isFullScreen = false;
    }
  }




  private async ensureWasmPsxLoaded(): Promise<void> {
    if (this._scriptLoaded) return;

    await new Promise<void>((resolve, reject) => {
      if (document.getElementById('wasmpsx-script')) { this._scriptLoaded = true; resolve(); return; }

      const base = new URL('assets/ps1/', document.baseURI).toString();

      // Map how Emscripten resolves its side files given your names
      (window as any).Module = {
        locateFile: (path: string) => {
          console.log('[wasmpsx] locateFile:', path);
          if (path.endsWith('.worker.js')) return base + 'wasmpsx_worker.js';
          if (path.includes('worker') && path.endsWith('.wasm')) return base + 'wasmpsx_worker.wasm';
          if (path.endsWith('.wasm')) return base + 'wasmpsx_wasm.wasm';
          return base + path;
        }
      };

      const s = document.createElement('script');
      s.id = 'wasmpsx-script';
      s.src = base + 'wasmpsx.min.js';   // 👈 add .js
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