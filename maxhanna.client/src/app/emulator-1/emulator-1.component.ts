
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
  // Human-readable status shown in the UI (e.g. "Idle", "Loading <game>", "Running: <game>")
  public status: string = 'Idle';
   


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
    
  }

  async ngOnDestroy(): Promise<void> {
   
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