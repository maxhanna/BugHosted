
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { PsxKeyMap } from '../../datacontracts/ps1/psx-key-map';
import { KeyBinding } from '../../datacontracts/ps1/key-binding';
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

  isMenuPanelOpen = false;
  isFullScreen = false;
  romName?: string;
  isFileUploaderExpanded = false;
  // Human-readable status shown in the UI (e.g. "Idle", "Loading <game>", "Running: <game>")
  public status: string = 'Idle';
  private romObjectUrl?: string;
 
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
    this.status = 'Loading…';
    try { 
      await this.loadRomThroughService(
        "Super Mario Advance 2 - Super Mario World (Europe) (En,Fr,De,Es).gba"
        // , /* fileId? */ 123
      );
      this.status = 'Running';
    } catch (err) {
      this.status = 'Error loading emulator';
      console.error(err);
    } finally {
      this.cdr.detectChanges();
    }
  }
  async ngOnDestroy(): Promise<void> {
    if (this.romObjectUrl) {
      URL.revokeObjectURL(this.romObjectUrl);
    }
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
    // 1) Fetch ROM via your existing API
    const romBlobOrArray = await this.romService.getRomFile(fileName, this.parentRef?.user?.id, fileId);

    // 2) Normalize to Blob
    let romBlob: Blob;
    if (romBlobOrArray instanceof Blob) {
      romBlob = romBlobOrArray;
    } else {
      throw new Error('getRomFile errored: expected Blob response');
    }

    // 3) Create a blob: URL and remember it for cleanup
    this.romObjectUrl = URL.createObjectURL(romBlob);
    this.romName = fileName;

    // 4) Configure EmulatorJS globals BEFORE adding loader.js
    window.EJS_player = "#game";
    window.EJS_pathtodata = "/assets/emulatorjs/data/";
    window.EJS_coreUrl = "/assets/emulatorjs/data/cores/";
    window.EJS_biosUrl = "/assets/emulatorjs/data/cores/bios/";
    window.EJS_gameUrl = this.romObjectUrl;   // 👈 blob URL  
    window.EJS_gameID = `gba:${this.romName ?? 'unknown'}`; // or a hash of the filename 
    window.EJS_gameName = this.fileService.getFileWithoutExtension(this.romName ?? '');
    window.EJS_startOnLoaded = true;

    // 5) Ensure CSS present once
    if (!document.querySelector('link[data-ejs-css="1"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/assets/emulatorjs/data/emulator.min.css';
      link.setAttribute('data-ejs-css', '1');
      document.head.appendChild(link);
    }

    // 6) Inject loader.js once (executed after globals are set)
    if (!window.__ejsLoaderInjected && !document.querySelector('script[data-ejs-loader="1"]')) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/assets/emulatorjs/data/loader.js';
        s.async = false;
        s.defer = false;
        s.setAttribute('data-ejs-loader', '1');
        s.onload = () => { window.__ejsLoaderInjected = true; resolve(); };
        s.onerror = () => reject(new Error('Failed to load EmulatorJS loader.js'));
        document.body.appendChild(s);
      });
    } else {
      // If loader already loaded (navigate away and back), EJS will read the new globals automatically
      // Optionally, you can trigger a re-init if needed depending on your flow.
    }
  }

  getRomName(): string {
    if (this.romName) {
      return this.romName;
    }
    else return '1Emulator';
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

declare global {
  interface Window {
    EJS_player?: string | HTMLElement;
    EJS_pathtodata?: string;
    EJS_coreUrl?: string;
    EJS_biosUrl?: string;
    EJS_gameUrl?: string;
    EJS_gameID?: string;
    EJS_gameName?: string;
    EJS_language?: string;
    EJS_startOnLoaded?: boolean;
    __ejsLoaderInjected?: boolean; // guard so we don't double load
  }
}
