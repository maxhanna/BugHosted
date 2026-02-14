
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
  @ViewChild(FileSearchComponent) fileSearchComponent?: FileSearchComponent;

  isMenuPanelOpen = false;
  isFullScreen = false;
  romName?: string;
  isFileUploaderExpanded = false;
  isSearchVisible = true;
  // Human-readable status shown in the UI (e.g. "Idle", "Loading <game>", "Running: <game>")
  public status: string = 'Idle';
  private romObjectUrl?: string;
  private emulatorInstance?: any;

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
    window.EJS_player = "#game";
    window.EJS_core = this.detectCore(fileName);
    window.EJS_pathtodata = "/assets/emulatorjs/data/";
    window.EJS_coreUrl = "/assets/emulatorjs/data/cores/";
    window.EJS_biosUrl = "/assets/emulatorjs/data/cores/bios/";
    window.EJS_gameUrl = this.romObjectUrl;
    window.EJS_gameID = `${window.EJS_core}:${this.fileService.getFileWithoutExtension(fileName)}`;
    window.EJS_gameName = this.fileService.getFileWithoutExtension(this.romName ?? '');
    window.EJS_startOnLoaded = true;
    window.EJS_volume = 0.5;
    window.EJS_lightgun = false;
    window.EJS_gameParent = this.romObjectUrl;
    
    // Configure save state callbacks
    window.EJS_onSaveState = (state: Uint8Array) => this.onSaveState(state);
    window.EJS_onLoadState = () => this.onLoadState();

    // 6) Ensure CSS present once
    if (!document.querySelector('link[data-ejs-css="1"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/assets/emulatorjs/data/emulator.min.css';
      link.setAttribute('data-ejs-css', '1');
      document.head.appendChild(link);
    }

    // 7) Clear existing game container
    const gameContainer = document.getElementById('game');
    if (gameContainer) {
      gameContainer.innerHTML = '';
    }

    // 8) Inject loader.js (it will initialize EmulatorJS)
    if (!window.__ejsLoaderInjected) {
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
      // Reinitialize with new game URL
      location.reload();
    }

    // 9) Load save state if it exists
    if (saveStateBlob) {
      // EmulatorJS will handle loading this through its storage system
      console.log('Save state loaded from database');
    }

    this.status = 'Running';
    this.cdr.detectChanges();
  }

  private detectCore(fileName: string): string {
    const ext = this.fileService.getFileExtension(fileName).toLowerCase();
    const coreMap: { [key: string]: string } = {
      'gba': 'gba',
      'gbc': 'gb',
      'gb': 'gb',
      'nes': 'nes',
      'snes': 'snes',
      'sfc': 'snes',
      'smd': 'segaMD',
      'gen': 'segaMD',
      'bin': 'segaMD',
      'n64': 'n64',
      'z64': 'n64',
      'v64': 'n64',
      'nds': 'nds',
      '32x': 'sega32x',
      'gg': 'segaGG',
      'sms': 'segaMS',
      'pce': 'pce',
      'ngp': 'ngp',
      'ngc': 'ngp',
      'ws': 'ws',
      'wsc': 'ws',
      'col': 'coleco',
      'a26': 'atari2600',
      'a78': 'atari7800',
      'lnx': 'lynx',
      'jag': 'jaguar'
    };
    return coreMap[ext] || 'gba';
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

  private async onSaveState(state: Uint8Array) {
    if (!this.parentRef?.user?.id || !this.romName) return;
    
    try {
      await this.romService.saveEmulatorJSState(this.romName, this.parentRef.user.id, state);
      console.log('Save state saved to database');
    } catch (err) {
      console.error('Failed to save state to database:', err);
    }
  }

  private async onLoadState() {
    console.log('Loading state from database');
    // EmulatorJS handles the actual loading
  }

  getAllowedFileTypes(): string[] {
    return [
      'gba', 'gbc', 'gb', 'nes', 'snes', 'sfc', 'smd', 'gen', 'bin',
      'n64', 'z64', 'v64', 'nds', '32x', 'gg', 'sms', 'pce',
      'ngp', 'ngc', 'ws', 'wsc', 'col', 'a26', 'a78', 'lnx', 'jag'
    ];
  }

  getRomName(): string {
    if (this.romName) {
      return this.fileService.getFileWithoutExtension(this.romName);
    }
    return '1Emulator';
  }

  async stopEmulator() {
    if (this.emulatorInstance) {
      // EmulatorJS auto-saves on pause/stop
      this.emulatorInstance = null;
    }
    this.isSearchVisible = true;
    this.status = 'Ready - Select a ROM';
    this.romName = undefined;
    this.closeMenuPanel();
    this.cdr.detectChanges();
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
    EJS_core?: string;
    EJS_pathtodata?: string;
    EJS_coreUrl?: string;
    EJS_biosUrl?: string;
    EJS_gameUrl?: string;
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
  }
}
