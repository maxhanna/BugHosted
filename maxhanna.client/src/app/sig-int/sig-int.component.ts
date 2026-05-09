import { Component, OnInit } from '@angular/core';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-sig-int',
  standalone: false,
  templateUrl: './sig-int.component.html',
  styleUrl: './sig-int.component.css'
})
export class SigIntComponent extends ChildComponent implements OnInit {
  constructor() {
    super();
  }

  isMenuPanelOpen = false;

  ngOnInit(): void {
  }
  ngOnDestroy(): void {
    this.remove_me("SigIntComponent");
  }
  safeDestroy() {
    this.ngOnDestroy();
  }
  showMenuPanel() {
    this.isMenuPanelOpen = true;
    this.parentRef?.showOverlay();
  }

  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    this.parentRef?.closeOverlay();
  }

  isLoadingEventFired(isLoading: boolean) {
    if (isLoading) {
      this.startLoading();
    } else {
      this.stopLoading();
    }
  }
}
