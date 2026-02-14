
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
const core = this.detectCore(fileName);
window.EJS_core       = core;
window.EJS_player     = "#game";
window.EJS_pathtodata = "/assets/emulatorjs/data/";
window.EJS_coreUrl    = "/assets/emulatorjs/data/cores/";

// ❗ BIOS: set ONLY if required by the selected core; otherwise blank
window.EJS_biosUrl    = this.getBiosUrlForCore(core) ?? "";  // <— key fix

window.EJS_gameUrl    = this.romObjectUrl;
window.EJS_gameID     = `${core}:${this.fileService.getFileWithoutExtension(fileName)}`;
window.EJS_gameName   = this.fileService.getFileWithoutExtension(this.romName ?? '');
window.EJS_startOnLoaded = true;
window.EJS_volume     = 0.5;
window.EJS_lightgun   = false;

// Optional callbacks (ok to keep)
window.EJS_onSaveState = (state: Uint8Array) => this.onSaveState(state);
window.EJS_onLoadState = () => this.onLoadState();

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

/** Return a BIOS URL if the core truly needs one; otherwise undefined/empty */
private getBiosUrlForCore(core: string): string | undefined {
  switch (core) {
    case 'mednafen_psx_hw':
    case 'pcsx_rearmed': // if you ever switch PSX cores
      // Make sure this file exists in dist/assets/emulatorjs/data/cores/bios/
      return '/assets/emulatorjs/data/cores/bios/scph5501.bin';

    case 'melonds': // Nintendo DS typically needs firmware/bios
      // You can also use a single firmware.bin if your core build expects it
      return '/assets/emulatorjs/data/cores/bios/nds/firmware.bin';

    // Arcade examples (only for specific sets/systems)
    case 'fbneo':
    case 'mame2003_plus':
      // Example: NeoGeo BIOS pack; only needed for NeoGeo titles
      // return '/assets/emulatorjs/data/cores/bios/neogeo.zip';
      return ''; // leave blank by default; set per-ROM if you know it’s needed

    default:
      // Most 8/16/32-bit consoles (e.g., mgba for GBA) run fine without BIOS
      return '';
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
      'bin': 'mednafen_psx_hw',
      'iso': 'mednafen_psx_hw',
      'chd': 'mednafen_psx_hw',
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
      'pbp': 'ppsspp',
      // Doom
      'wad': 'prboom'
    };
    return coreMap[ext] || 'mgba';
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
