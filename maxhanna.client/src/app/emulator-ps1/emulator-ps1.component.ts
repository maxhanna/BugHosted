
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';


@Component({
  selector: 'app-emulator-ps1',
  templateUrl: './emulator-ps1.component.html',
  styleUrl: './emulator-ps1.component.css',
  standalone: false
})
export class EmulatorPS1Component extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
  isMenuPanelOpen = false;
  constructor( ) {
    super();
  }

  ngOnInit(): void {
    
  }

  ngAfterViewInit(): void {
    
  }

  async ngOnDestroy(): Promise<void> {
   
  }

  async onFileSearchSelected(file: FileEntry) {
    
  } 
  showMenuPanel() {
    this.isMenuPanelOpen = true;
    this.parentRef?.showOverlay();
  }
  closeMenuPanel(){
    this.isMenuPanelOpen = false;
    this.parentRef?.closeOverlay();
  }
}