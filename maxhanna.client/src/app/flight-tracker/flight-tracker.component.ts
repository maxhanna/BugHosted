import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { FlightService } from '../../services/flight.service';
import { TrackedFlight, FlightArc } from '../../services/datacontracts/flight';
import { GlobeComponent, GlobePing } from '../globe/globe.component';

@Component({
  selector: 'app-flight-tracker',
  standalone: false,
  templateUrl: './flight-tracker.component.html',
  styleUrl: './flight-tracker.component.css'
})
export class FlightTrackerComponent extends ChildComponent implements OnInit, OnDestroy {
  @ViewChild(GlobeComponent) globeComponent!: GlobeComponent;

  trackedFlights: TrackedFlight[] = [];
  newCallsign = '';
  newLabel = '';
  newOrigin = '';
  newDest = '';
  selectedFlight: TrackedFlight | null = null;
  isMenuPanelOpen = false;
  statusMessage = '';
  private pollTimer: any = null;

  constructor(private flightService: FlightService) {
    super();
  }

  ngOnInit(): void {
    this.trackedFlights = this.flightService.getTrackedFlights();
    if (this.trackedFlights.length > 0) {
      this.pollFlights();
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.remove_me("FlightTrackerComponent");
  }

  safeDestroy() {
    this.ngOnDestroy();
  }

  get flightPings(): GlobePing[] {
    return this.trackedFlights
      .filter(f => f.enabled && f.lat != null && f.lon != null)
      .map(f => ({
        id: `flight:${f.id}`,
        label: f.label || f.callsign,
        lat: f.lat,
        lon: f.lon,
        data: { ...f, type: 'flight' },
      }));
  }

  get airportPings(): GlobePing[] {
    const pings: GlobePing[] = [];
    for (const f of this.trackedFlights) {
      if (!f.enabled) continue;
      if (f.origin && f.originLat != null && f.originLon != null) {
        pings.push({
          id: `origin:${f.id}`,
          label: `${f.callsign} origin: ${f.origin}`,
          lat: f.originLat,
          lon: f.originLon,
          data: { airportCode: f.origin, type: 'airport', flightId: f.id },
        });
      }
      if (f.destination && f.destLat != null && f.destLon != null) {
        pings.push({
          id: `dest:${f.id}`,
          label: `${f.callsign} destination: ${f.destination}`,
          lat: f.destLat,
          lon: f.destLon,
          data: { airportCode: f.destination, type: 'airport', flightId: f.id },
        });
      }
    }
    return pings;
  }

  get flightArcs(): FlightArc[] {
    return this.trackedFlights
      .filter(f => f.enabled && f.originLat != null && f.originLon != null && f.destLat != null && f.destLon != null)
      .map(f => ({
        from: { lat: f.originLat!, lon: f.originLon! },
        to: { lat: f.destLat!, lon: f.destLon! },
        color: '#ffdd00',
      }));
  }

  async addFlight(): Promise<void> {
    const cs = this.newCallsign.trim().toUpperCase();
    if (!cs) { this.statusMessage = 'Enter a flight number'; return; }
    if (this.trackedFlights.some(f => f.callsign === cs)) {
      this.statusMessage = 'Flight already tracked';
      return;
    }

    const flight: TrackedFlight = {
      id: `flight_${Date.now()}`,
      callsign: cs,
      label: this.newLabel.trim() || cs,
      origin: this.newOrigin.trim().toUpperCase() || undefined,
      destination: this.newDest.trim().toUpperCase() || undefined,
      enabled: true,
    };

    const oCode = flight.origin;
    const dCode = flight.destination;
    if (oCode) {
      const o = this.flightService.getAirportCoords(oCode);
      if (o) { flight.originLat = o.lat; flight.originLon = o.lon; }
    }
    if (dCode) {
      const d = this.flightService.getAirportCoords(dCode);
      if (d) { flight.destLat = d.lat; flight.destLon = d.lon; }
    }

    this.trackedFlights.push(flight);
    this.save();
    this.newCallsign = '';
    this.newLabel = '';

    if (!this.pollTimer) this.startPolling();
    await this.updatePositions();
  }

  removeFlight(id: string): void {
    this.trackedFlights = this.trackedFlights.filter(f => f.id !== id);
    if (this.selectedFlight?.id === id) this.selectedFlight = null;
    this.save();
    if (!this.trackedFlights.length) this.stopPolling();
  }

  toggleFlight(id: string): void {
    const f = this.trackedFlights.find(x => x.id === id);
    if (f) { f.enabled = !f.enabled; this.save(); }
  }

  onPingClicked(ping: GlobePing): void {
    const flight = this.trackedFlights.find(f => `flight:${f.id}` === ping.id);
    if (flight) {
      this.selectedFlight = flight;
      if (this.globeComponent && flight.originLat != null && flight.originLon != null) {
        this.globeComponent.focusPing({
          id: `flight:${flight.id}`,
          lat: flight.lat ?? flight.originLat,
          lon: flight.lon ?? flight.originLon,
          label: flight.label,
          zoom: 50,
          source: 'custom',
        } as any);
      }
    }
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
    if (isLoading) this.startLoading();
    else this.stopLoading();
  }

  private async updatePositions(): Promise<void> {
    const enabled = this.trackedFlights.filter(f => f.enabled);
    if (!enabled.length) return;
    const updated = await this.flightService.updateFlightPositions(enabled);
    for (const u of updated) {
      const idx = this.trackedFlights.findIndex(f => f.id === u.id);
      if (idx >= 0) this.trackedFlights[idx] = u;
    }
    this.save();
    this.statusMessage = '';
  }

  private startPolling(): void {
    this.pollTimer = setInterval(async () => {
      await this.updatePositions();
    }, 30000);
  }

  private stopPolling(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  private pollFlights(): void {
    this.startPolling();
    this.updatePositions();
  }

  private save(): void {
    this.flightService.saveTrackedFlights(this.trackedFlights);
  }
}
