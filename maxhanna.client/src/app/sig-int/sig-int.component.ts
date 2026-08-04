import { Component, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { GlobeComponent } from '../globe/globe.component';

@Component({
  selector: 'app-sig-int',
  standalone: false,
  templateUrl: './sig-int.component.html',
  styleUrl: './sig-int.component.css'
})
export class SigIntComponent extends ChildComponent implements OnInit {
  
  @ViewChild(GlobeComponent) globeComponent!: GlobeComponent; 
  isMenuPanelOpen = false;

  constructor() {
    super();
  } 
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

  isLoadingEventFired(isLoading: any) {
    if (isLoading) {
      this.startLoading();
    } else {
      this.stopLoading();
    }
  }

  // Uses the HTML5 Geolocation API (navigator.geolocation) to get the user's
  // precise GPS coordinates and centers the globe on them — far more accurate
  // than the IP-based city/country lookup used by "Center Current Location".
  getPreciseLocation() {
    if (!('geolocation' in navigator)) {
      this.parentRef?.showNotification('Geolocation is not supported by your browser.');
      return;
    }
    this.startLoading();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.stopLoading();
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        this.globeComponent?.focusPing({
          id: 'html5-location',
          lat,
          lon,
          label: 'Your precise location',
          zoom: 82,
          source: 'custom',
          data: { type: 'custom' },
        });
        this.parentRef?.showNotification(
          `Precise location found: ${lat.toFixed(4)}, ${lon.toFixed(4)}`
        );
        this.closeMenuPanel();
      },
      (err) => {
        this.stopLoading();
        const msg = err.code === err.PERMISSION_DENIED
          ? 'Location permission denied. Enable location access in your browser and try again.'
          : err.code === err.POSITION_UNAVAILABLE
            ? 'Location unavailable. Try again in a moment.'
            : 'Location request timed out. Try again.';
        this.parentRef?.showNotification(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }
}
