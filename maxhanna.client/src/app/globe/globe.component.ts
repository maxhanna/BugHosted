import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ElementRef, ViewChild, HostListener, NgZone,
  EventEmitter, Input, Output
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SocialService } from '../../services/social.service';
import { EncryptionService } from '../../services/encryption.service';
import { NewsService } from '../../services/news.service';
import { NewsPin } from '../../services/datacontracts/news/news-data';
import { Story } from '../../services/datacontracts/social/story';
import { TileCacheService } from '../services/tile-cache.service';
import { FlightService } from '../../services/flight.service';
import { TrackedFlight } from '../../services/datacontracts/flight';
import { UserService, UserWithLocation } from '../../services/user.service';
import { User } from '../../services/datacontracts/user/user';
import { CITY_COORDS, COUNTRY_COORDS, TOWN_COORDS } from './coordinates';

// ---------------------------------------------------------------------------
// Vertex shader
// ---------------------------------------------------------------------------
const VERT_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Fragment shader — ray-sphere intersection, equirectangular texture sample
// ---------------------------------------------------------------------------
const FRAG_SRC = `
precision highp float;
varying vec2 v_uv;

uniform sampler2D u_tex;
uniform sampler2D u_detailTex;
uniform mat3      u_rot;
uniform float     u_camDist;
uniform vec2      u_resolution;
uniform float     u_detailEnabled;
uniform float     u_detailZoom;
uniform float     u_detailOriginX;
uniform float     u_detailOriginY;
uniform float     u_detailCols;
uniform float     u_detailRows;

const float PI = 3.14159265358979;

void main() {
  float fov = 35.0 * PI / 180.0;
  float f   = 1.0 / tan(fov * 0.5);
  float asp = u_resolution.x / u_resolution.y;
  vec3 rayDir = normalize(vec3(v_uv.x * asp / f, v_uv.y / f, -1.0));

  vec3 camPos = vec3(0.0, 0.0, u_camDist);
  float a    = dot(rayDir, rayDir);
  float b    = 2.0 * dot(camPos, rayDir);
  float c    = dot(camPos, camPos) - 1.0;
  float disc = b*b - 4.0*a*c;
  if (disc < 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.05, 0.0); return; }

  float t  = (-b - sqrt(disc)) / (2.0*a);
  vec3 hit = camPos + t * rayDir;
  vec3 p   = u_rot * hit;

  float lon = atan(p.x, p.z);
  float lat = asin(clamp(p.y, -1.0, 1.0));
  float u   = (lon / (2.0*PI)) + 0.5;
  float v   = 0.5 - (lat / PI);

  vec4 baseColor = texture2D(u_tex, vec2(u, v));

  if (u_detailEnabled > 0.5) {
    float n = exp2(u_detailZoom);
    float mercLat = clamp(lat, -1.48442223, 1.48442223);
    float tileX = ((lon + PI) / (2.0 * PI)) * n;
    float tileY = (1.0 - log(tan(mercLat) + (1.0 / cos(mercLat))) / PI) * 0.5 * n;
    float dx = mod(tileX - u_detailOriginX + n, n);
    float dy = tileY - u_detailOriginY;

    if (dx >= 0.0 && dx < u_detailCols && dy >= 0.0 && dy < u_detailRows) {
      vec4 detailColor = texture2D(u_detailTex, vec2(dx / u_detailCols, dy / u_detailRows));
      if (detailColor.a > 0.1) {
        baseColor = detailColor;
      }
    }
  }

  gl_FragColor = baseColor;
}
`;

export interface Arc {
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  color?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export interface GlobePing {
  id?: string | number;
  label?: string;
  lat?: number;
  lon?: number;
  city?: string;
  country?: string;
  zoom?: number;
  data?: unknown;
}

export interface ResolvedGlobePing {
  id: string;
  lat: number;
  lon: number;
  label: string;
  zoom: number;
  source: 'story' | 'custom' | 'news' | 'user';
  story?: Story;
  newsPin?: NewsPin;
  user?: User;
  data?: unknown;
  city?: string;
  country?: string;
}

// Ping type colors array - keeps all colors in one place for easy maintenance
const pingTypeColors = [
  '255, 80, 80',      // Story (red)
  '255, 180, 50',     // News (orange) 
  '80, 160, 255',     // User (blue)
  '74, 170, 255',     // Custom (light blue)
  '255, 100, 100',    // City (lighter red)
  '255, 200, 100',    // Country (lighter orange)
  '100, 200, 100',    // Town (light green)
];

@Component({
  selector: 'app-globe',
  templateUrl: './globe.component.html',
  styleUrls: ['./globe.component.css'],
  standalone: false
})
export class GlobeComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('globeCanvas') private globeCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('detailCanvas') private detailCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('pinCanvas') private pinCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('editLatInput') private editLatInput!: ElementRef<HTMLInputElement>;
  @ViewChild('editLonInput') private editLonInput!: ElementRef<HTMLInputElement>;

  // ---- public state -------------------------------------------------------
  zoomSliderValue = 30;
  isLoading = false;
  minDate: Date = new Date(0);
  maxDate: Date = new Date();
  dateFilterValue: number = 100;
  filteredStories: Story[] = [];
  showStoriesPins = true;
  showNewsPins = true;
  showUsersPins = true;
  showFlightsPins = true;
  showCityCoords = false;
  showCountryCoords = false;
  showTownCoords = false;
  @Input() set pings(value: GlobePing[] | null | undefined) {
    this.customPings = Array.isArray(value) ? value : [];
  }
  @Input() arcs: Arc[] = [];
  @Input() inputtedParentRef: any;
  @Output() isLoadingEvent = new EventEmitter<boolean>();
  @Output() pingClicked = new EventEmitter<GlobePing>();

  // ---- popup --------------------------------------------------------------
  isCoordsEditPopupOpen = false;
  editLat = 0;
  editLon = 0;

  // ---- WebGL --------------------------------------------------------------
  private gl!: WebGLRenderingContext;
  private prog!: WebGLProgram;
  private tex!: WebGLTexture;
  private detailTex!: WebGLTexture;
  private posBuf!: WebGLBuffer;
  private vertShader!: WebGLShader;
  private fragShader!: WebGLShader;

  // ---- rotation (row-major 3×3) -------------------------------------------
  private rot = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  private isDragging = false;
  private dragMoved = false;
  private lastX = 0;
  private lastY = 0;

  // ---- zoom ---------------------------------------------------------------
  private camDist = 3.0;
  private camDistTarget = 3.0;
  private readonly CAM_MIN = 1.00005;
  private readonly CAM_MAX = 8.0;

  // ---- animation ----------------------------------------------------------
  private rafId = 0;
  private destroyed = false;

  // ---- story pins ---------------------------------------------------------
  private stories: Story[] = [];
  newsPins: NewsPin[] = [];
  filteredNewsPins: NewsPin[] = [];
  minNewsDate: Date | null = null;
  maxNewsDate: Date | null = null;
  newsDateFilterValue: number = 100;
  private customPings: GlobePing[] = [];
  private hoveredPin: { id: string; label: string; x: number; y: number } | null = null;
  hoveredFlightCallsign: string | null = null;
  private activePingId: string | null = null;
  private pingTourTimer: ReturnType<typeof setInterval> | null = null;
  private pingTourIndex = 0;

  // ---- flight pins ---------------------------------------------------------
  trackedFlights: TrackedFlight[] = [];
  allFlightStates: any[] = [];
  get userId(): number { return this.inputtedParentRef?.user?.id || 0; }
  activeDataTab: 'stories' | 'news' | 'flights' | 'users' | 'general' = 'stories';
  usersWithLocations: UserWithLocation[] = [];
  userSearchTerm: string = '';
  private flightsLoaded = false;
  private allFlightsLoaded = false;
  flightInterval: ReturnType<typeof setInterval> | null = null;
  showDataPanel = false;
  newCallsign = '';
  selectedFlight: any = null;
  showFlightDetail = false;
  selectedNewsPin: NewsPin | null = null;
  showNewsPopup = false;
  showClusterPopup = false;
  selectedClusterPings: ResolvedGlobePing[] = [];
  clusterLocationLabel = '';
  showStoryPopup = false;
  selectedStory: Story | null = null;
  showUserPopup = false;
  selectedUser: User | null = null;
  selectedUserPing: ResolvedGlobePing | null = null;
  flightArcs: Arc[] = [];
  accordionStates: { [key: string]: boolean } = {
    news: false,
    user: false,
    story: false,
    custom: false
  };
  isRefreshingFlights = false;

  // ---- coordinates display -------------------------------------------------
  coordsDisplay = '0.00°, 0.00°'; 
  // ---- tile / texture state -----------------------------------------------
  private readonly BASE_ZOOM = 2;
  private readonly TEX_SIZE = 4096;
  private readonly TILE_SIZE = 256;
  private readonly MAX_DETAIL_RADIUS = 5;
  private readonly MAX_ATLAS_TILES = 16;
  private readonly SATELLITE_ZOOM_MIN = 12;
  private readonly SATELLITE_ZOOM_MAX = 19;

  private texCanvas!: HTMLCanvasElement;
  private texCtx!: CanvasRenderingContext2D;
  private detailTexCanvas!: HTMLCanvasElement;
  private detailTexCtx!: CanvasRenderingContext2D;
  private detailAtlas = {
    enabled: false,
    zoom: 0,
    originX: 0,
    originY: 0,
    cols: 1,
    rows: 1,
  };

  // Stamp of the view that the current texture was built for.
  // We only rebuild when something changes enough to matter.
  private lastBuiltZoom = -1;
  private lastBuiltLon = 999;
  private lastBuiltLat = 999;

  // The set of "z/x/y" keys that belong to the current view.
  // Tile callbacks check this before painting, so stale tiles from a
  // previous view are silently discarded even if they arrive late.
  private currentViewKeys = new Set<string>();

  // Pending tile count drives isLoading.
  private pendingTiles = 0;

  // Flag to track if base layer (zoom 2) has been painted at least once.
  private baseLayerPainted = false;


  constructor(
    private socialService: SocialService,
    private newsService: NewsService,
    private ngZone: NgZone,
    private encryptionService: EncryptionService,
    private tileCacheService: TileCacheService,
    private flightService: FlightService,
    private userService: UserService
  ) {}

  // =========================================================================
  // Lifecycle
  // =========================================================================
  ngOnInit(): void {
    this.loadStories();
    this.loadNewsPins();
    this.loadUsersWithLocations();
    this.loadFlights();
    this.loadAllFlights();
  }

  ngAfterViewInit(): void {
    this.initWebGL();
    this.buildTexCanvas();
    this.loadBaseTiles();
    this.bindMouseEvents();
    this.bindTouchEvents();
    this.ngZone.runOutsideAngular(() => this.loop());
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopPingTour();
    cancelAnimationFrame(this.rafId);
    this.destroyWebGL();
  }

  private destroyWebGL(): void {
    const gl = this.gl;
    if (!gl) return;
    gl.deleteTexture(this.tex);
    gl.deleteTexture(this.detailTex);
    gl.deleteProgram(this.prog);
    gl.deleteShader(this.vertShader);
    gl.deleteShader(this.fragShader);
    gl.deleteBuffer(this.posBuf);
    if (this.flightInterval) {
      clearInterval(this.flightInterval);
      this.flightInterval = null;
    }
  }

  // =========================================================================
  // Zoom slider (template binding)
  // =========================================================================
  onZoomSlider(event: Event): void {
    const val = +(event.target as HTMLInputElement).value;
    this.zoomSliderValue = val;
    this.camDistTarget = this.zoomSliderToCamDist(val);
  }

  // =========================================================================
  // Flights
  // =========================================================================
  async loadFlights(): Promise<void> {
    try {
      this.isRefreshingFlights = true;
      this.trackedFlights = await this.flightService.getTrackedFlights(this.userId);
      this.flightsLoaded = true;
      await this.loadAllFlights();
      if (!this.flightInterval) {
        this.flightInterval = setInterval(async () => {
          this.trackedFlights = await this.flightService.updateFlightPositions(this.trackedFlights);
          await this.loadAllFlights();
        }, 15000);
      }
    } catch (error) {
      console.error('Failed to load flights:', error);
    } finally {
      this.isRefreshingFlights = false;
    }
  }

  async loadAllFlights(): Promise<void> {
    try {
      const callsigns = this.trackedFlights?.map(f => f.callsign).filter(Boolean) || [];
      const states = callsigns.length ? await this.flightService.getStates(callsigns) : [];
      this.allFlightStates = states || [];
      this.allFlightsLoaded = true;
    } catch (error) {
      console.error('Failed to load all flight states:', error);
    }
  }

  toggleFlightTracking(): void {
    if (this.flightInterval) {
      clearInterval(this.flightInterval);
      this.flightInterval = null;
    } else {
      this.loadFlights();
    }
  }

  async addFlight(): Promise<void> {
    const cs = this.newCallsign.trim().toUpperCase();
    if (!cs) return;

    let lat: number | undefined;
    let lon: number | undefined;
    let altitude: number | undefined;
    let heading: number | undefined;
    let velocity: number | undefined;

    for (const state of this.allFlightStates) {
      const scs = state[1]?.trim().toUpperCase();
      if (scs === cs) {
        lat = state[6];
        lon = state[5];
        altitude = state[7];
        heading = state[10];
        velocity = state[9];
        break;
      }
    }

    const flight: TrackedFlight = {
      id: `flight_${Date.now()}`,
      callsign: cs,
      label: cs,
      lat,
      lon,
      altitude,
      heading,
      velocity,
      enabled: true,
    };

    const dbId = await this.flightService.addTrackedFlight(this.userId, cs);
    if (dbId) flight.id = dbId;

    this.trackedFlights = [...this.trackedFlights, flight];
    this.newCallsign = '';

    if (!this.flightInterval) {
      await this.loadFlights();
    } else {
      await this.loadAllFlights();
    }

    if (lat === undefined || lon === undefined) {
      for (const state of this.allFlightStates) {
        const scs = state[1]?.trim().toUpperCase();
        if (scs === cs) {
          lat = state[6];
          lon = state[5];
          altitude = state[7];
          heading = state[10];
          velocity = state[9];
          break;
        }
      }
      if (lat !== undefined && lon !== undefined) {
        this.trackedFlights = this.trackedFlights.map(f =>
          f.id === flight.id ? { ...f, lat, lon, altitude, heading, velocity } : f
        );
      }
    }

    if (lat !== undefined && lon !== undefined) {
      this.focusPing({
        id: `flight:${cs}`,
        lat,
        lon,
        label: cs,
        zoom: 0,
        source: 'custom',
        data: { type: 'flight', callsign: cs },
      });
    }
  }

  async removeFlight(id: string): Promise<void> {
    this.trackedFlights = this.trackedFlights.filter(f => f.id !== id);
    await this.flightService.deleteTrackedFlight(Number(id), this.userId);
  }

  async toggleFlight(id: string): Promise<void> {
    const flight = this.trackedFlights.find(f => f.id === id);
    if (flight) {
      flight.enabled = !flight.enabled;
      await this.flightService.updateTrackedFlight(Number(id), this.userId, flight.enabled);
    }
  }

  onFlightClick(ping: ResolvedGlobePing): void {
    const flightData = ping.data as any;
    const callsign = flightData?.callsign;
    const tracked = this.trackedFlights.find(f =>
      f.enabled && f.callsign.trim().toUpperCase() === callsign?.toUpperCase()
    );

    this.selectedFlight = {
      ...(tracked || {}),
      callsign: flightData?.callsign || ping.label,
      lat: ping.lat,
      lon: ping.lon,
      altitude: flightData?.altitude,
      heading: flightData?.heading,
      velocity: flightData?.velocity,
      registration: flightData?.registration,
      aircraftType: flightData?.aircraftType,
      typeDescription: flightData?.typeDescription,
      owner: flightData?.owner,
      hex: flightData?.hex,
      onGround: flightData?.onGround,
      timePosition: flightData?.timePosition,
      lastContact: flightData?.lastContact,
      isTracked: !!tracked,
    };

    this.flightArcs = [];
    if (tracked?.originLat != null && tracked?.originLon != null &&
        tracked?.destLat != null && tracked?.destLon != null) {
      this.flightArcs.push({
        from: { lat: tracked.originLat, lon: tracked.originLon },
        to: { lat: tracked.destLat, lon: tracked.destLon },
        color: '#00ddff',
      });
    }

    this.showFlightDetail = true;
    this.showDataPanel = false;
    this.focusPing(ping);
  }

  focusTrackedFlight(flight: TrackedFlight): void {
    this.selectedFlight = flight;
    this.flightArcs = [];
    if (flight.originLat != null && flight.originLon != null &&
        flight.destLat != null && flight.destLon != null) {
      this.flightArcs.push({
        from: { lat: flight.originLat, lon: flight.originLon },
        to: { lat: flight.destLat, lon: flight.destLon },
        color: '#00ddff',
      });
    }
    this.showFlightDetail = true;
    this.showDataPanel = false;

    const lat = flight.lat;
    const lon = flight.lon;
    if (lat != null && lon != null) {
      this.focusPing({
        id: `flight:${flight.callsign}`,
        lat,
        lon,
        label: flight.callsign,
        zoom: 0,
        source: 'custom',
        data: { type: 'flight', callsign: flight.callsign },
      });
    }
  }

  closeFlightDetail(): void {
    this.showFlightDetail = false;
    this.selectedFlight = null;
  }

  closeNewsPopup(): void {
    this.showNewsPopup = false;
    this.selectedNewsPin = null;
  }

  openNewsArticleInNewTab(): void {
    if (this.selectedNewsPin?.articleUrl) {
      window.open(this.selectedNewsPin.articleUrl, '_blank');
    }
  }

  closeStoryPopup(): void {
    this.showStoryPopup = false;
    this.selectedStory = null;
  }

  openStoryInSocial(): void {
    if (this.selectedStory?.id) {
      window.open(`${window.location.origin}/Social/${this.selectedStory.id}`, '_blank');
    } else {
      window.open(`${window.location.origin}/Social`, '_blank');
    }
  }

  closeClusterPopup(): void {
    this.showClusterPopup = false;
    this.selectedClusterPings = [];
    this.clusterLocationLabel = '';
  }

  onClusterPingClick(ping: ResolvedGlobePing): void {
    if (ping.source === 'news' && ping.newsPin) {
      this.selectedNewsPin = ping.newsPin;
      this.showNewsPopup = true;
      this.showClusterPopup = false;
      return;
    }
    if (ping.source === 'story' && ping.story) {
      this.selectedStory = ping.story;
      this.showStoryPopup = true;
      this.showClusterPopup = false;
      this.focusPing(ping);
      return;
    }
    if (ping.source === 'user' && ping.user) {
      this.selectedUser = ping.user;
      this.selectedUserPing = ping;
      this.showUserPopup = true;
      this.showClusterPopup = false;
      return;
    }
    this.focusPing(ping);
    this.closeClusterPopup();
  }

  closeUserPopup(): void {
    this.showUserPopup = false;
    this.selectedUser = null;
  }

  openUserProfile(user: User): void {
    if (user.id) {
      window.open(`https://bughosted.com/User/${user.id}`, '_blank');
    }
  }

  // Get pings by source type for accordion
  getClusterPingsBySource(source: string): ResolvedGlobePing[] {
    return this.selectedClusterPings.filter(ping => ping.source === source);
  }

  // Toggle accordion for a specific source
  toggleAccordion(source: string): void {
    this.accordionStates[source] = !this.accordionStates[source];
  }

  // =========================================================================
  // Stories
  // =========================================================================
  private async loadStories(): Promise<void> {
    try {
      const resp = await this.socialService.getStories(
        undefined, undefined, undefined, undefined, undefined, 1, 100
      );
      if (resp?.stories) {
        this.stories = resp.stories.filter(s => !!s.country || !!s.city);
        for (const story of this.stories) {
          if (story.date && !(story.date instanceof Date)) {
            story.date = new Date(story.date);
          }
          if (story.storyText && story.user?.id) {
            try {
              story.storyText = this.encryptionService.decryptContent(
                story.storyText, String(story.user.id)
              );
            } catch { /* keep encrypted */ }
          }
        }
        const dates = this.stories
          .map(s => s.date).filter((d): d is Date => !!d)
          .sort((a, b) => a.getTime() - b.getTime());
        if (dates.length) {
          this.minDate = dates[0];
          this.maxDate = dates[dates.length - 1];
        }
        this.applyDateFilter();
      }
    } catch { /* non-fatal */ }
  }

  private async loadNewsPins(): Promise<void> {
    try {
      this.newsPins = await this.newsService.getNewsPins();
      const dates = this.newsPins
        .map(p => p.createdAt).filter((d): d is Date => !!d)
        .sort((a, b) => a.getTime() - b.getTime());
      if (dates.length) {
        this.minNewsDate = dates[0];
        this.maxNewsDate = dates[dates.length - 1];
      }
      this.applyNewsDateFilter();
    } catch { /* non-fatal */ }
  }

  private async loadUsersWithLocations(): Promise<void> {
    try {
      this.usersWithLocations = await this.userService.getUsersWithLocations();
      this.resolveUserLocations();
    } catch { /* non-fatal */ }
  }

  private resolveUserLocations(): void {
    for (const user of this.usersWithLocations) {
      const result = this.findBestLocationMatch(user.city, user.country);
      if (result) {
        user.city = result.city;
        user.country = result.country;
      }
    }
  }

  private findBestLocationMatch(city?: string, country?: string): { city: string; country: string } | null {
    const tc = city?.trim();
    const tco = country?.trim();
    if (!tc && !tco) return null;

    // Try matching against CITY_COORDS first
    const coords = this.lookupCityCoords(tc, tco);
    if (coords) {
      // Find which key matched to get the canonical name
      const matchedKey = this.findMatchingCityKey(tc, tco);
      if (matchedKey) {
        const parts = matchedKey.split(',').map(p => p.trim()).filter(Boolean);
        const matchedCity = this.titleCase(parts[0]);
        // Extract country from the matched key
        let matchedCountry = '';
        for (let i = 1; i < parts.length; i++) {
          const p = parts[i];
          const dashParts = p.split('-').map(x => x.trim()).filter(Boolean);
          for (const dp of dashParts) {
            if (this.lookupCoords(COUNTRY_COORDS, dp)) {
              matchedCountry = this.titleCase(dp);
              break;
            }
          }
          if (matchedCountry) break;
        }
        if (matchedCountry) return { city: matchedCity, country: matchedCountry };
        // Fallback to the last part if no country match
        return { city: matchedCity, country: this.titleCase(parts[parts.length - 1]) };
      }
      // If we can't find the key but have coordinates, just title-case what we have
      if (tc) {
        // Try to extract just the city name before any comma
        const cityPart = tc.split(',')[0]?.trim();
        return { city: this.titleCase(cityPart || tc), country: tco ? this.titleCase(tco) : '' };
      }
    }

    // Try matching against COUNTRY_COORDS
    const countryMatch = tco ? this.lookupCoords(COUNTRY_COORDS, tco) : null;
    if (countryMatch && tco) {
      // Find the exact key match
      const key = Object.keys(COUNTRY_COORDS).find(k =>
        this.normalizeName(k) === this.normalizeName(tco)
      );
      return { city: tc ? this.titleCase(tc.split(',')[0]?.trim() || tc) : '', country: this.titleCase(key || tco) };
    }

    return null;
  }

  private findMatchingCityKey(city?: string, country?: string): string | null {
    if (!city) return null;
    const tc = city.trim(), tco = country?.trim();
    const part = tc.split(',')[0]?.trim();
    const candidates = [
      tco ? `${tc}, ${tco}` : '', tc,
      part && tco ? `${part}, ${tco}` : '', part || '',
    ].filter(Boolean);

    const nCandidates = candidates.map(c => this.normalizeName(c));

    for (const [key, nKey] of Object.entries(this.CITY_COORDS_KEYS_CACHE || this.buildCityKeysCache())) {
      for (const nc of nCandidates) {
        if (nKey === nc) return key;
      }
    }

    // Substring matching: check if the normalized city name is a prefix of any key
    const nSearch = this.normalizeName(part || tc);
    for (const [key, nKey] of Object.entries(this.CITY_COORDS_KEYS_CACHE || this.buildCityKeysCache())) {
      // Check if search term is a substring of the key (matching start of the city part)
      const keyCityPart = nKey.split(',')[0]?.trim();
      if (keyCityPart && keyCityPart.startsWith(nSearch)) return key;
      if (nKey.includes(nSearch)) {
        // If country is provided, prefer keys that also contain the country
        if (tco && nKey.includes(this.normalizeName(tco))) return key;
        if (!tco) return key;
      }
    }

    return null;
  }

  private CITY_COORDS_KEYS_CACHE: Record<string, string> | null = null;

  private buildCityKeysCache(): Record<string, string> {
    this.CITY_COORDS_KEYS_CACHE = {};
    for (const key of Object.keys(CITY_COORDS)) {
      this.CITY_COORDS_KEYS_CACHE[key] = this.normalizeName(key);
    }
    return this.CITY_COORDS_KEYS_CACHE;
  }

  get dateFilterLabel(): string {
    if (!this.minDate || !this.maxDate) return 'All time';
    const totalMs = this.maxDate.getTime() - this.minDate.getTime();
    const days = Math.ceil(totalMs / 86400000);
    const filtered = Math.floor(days * (this.dateFilterValue / 100));
    const start = new Date(this.maxDate.getTime() - filtered * 86400000);
    return `${start.toLocaleDateString()} - ${this.maxDate.toLocaleDateString()}`;
  }

  onDateFilter(event: Event): void {
    this.dateFilterValue = parseInt((event.target as HTMLInputElement).value, 10);
    this.applyDateFilter();
  }

  private applyDateFilter(): void {
    if (!this.minDate || !this.maxDate) { this.filteredStories = this.stories; return; }
    const totalDays = (this.maxDate.getTime() - this.minDate.getTime()) / 86400000;
    const cutoff = new Date(
      this.maxDate.getTime() - totalDays * (this.dateFilterValue / 100) * 86400000
    );
    this.filteredStories = this.stories.filter(s => !s.date || s.date >= cutoff);
  }

  get newsDateFilterLabel(): string {
    if (!this.minNewsDate || !this.maxNewsDate) return 'All time';
    const totalMs = this.maxNewsDate.getTime() - this.minNewsDate.getTime();
    const days = Math.ceil(totalMs / 86400000);
    const filtered = Math.floor(days * (this.newsDateFilterValue / 100));
    const start = new Date(this.maxNewsDate.getTime() - filtered * 86400000);
    return `${start.toLocaleDateString()} - ${this.maxNewsDate.toLocaleDateString()}`;
  }

  onNewsDateFilter(event: Event): void {
    this.newsDateFilterValue = parseInt((event.target as HTMLInputElement).value, 10);
    this.applyNewsDateFilter();
  }

  private applyNewsDateFilter(): void {
    if (!this.minNewsDate || !this.maxNewsDate) { this.filteredNewsPins = this.newsPins; return; }
    const totalDays = (this.maxNewsDate.getTime() - this.minNewsDate.getTime()) / 86400000;
    const cutoff = new Date(
      this.maxNewsDate.getTime() - totalDays * (this.newsDateFilterValue / 100) * 86400000
    );
    this.filteredNewsPins = this.newsPins.filter(p => !p.createdAt || p.createdAt >= cutoff);
  }

  onStoryClick(story: Story): void {
    const ping = this.storyToPing(story);
    if (ping) {
      this.selectedStory = story;
      this.showStoryPopup = true;
      this.focusPing(ping);
    }
  }

  onNewsPinClick(pin: NewsPin): void {
    this.selectedNewsPin = pin;
    this.showNewsPopup = true;
    const ping = this.newsPinToPing(pin);
    if (ping) this.focusPing(ping);
  }

  onUserClick(user: UserWithLocation): void {
    const ping = this.userToPing(user);
    if (ping) {
      this.focusPing(ping);
      this.showDataPanel = false;
    }
  }

  focusPing(ping: ResolvedGlobePing | GlobePing): void {
    const resolved = this.isResolvedPing(ping) ? ping : this.resolveCustomPing(ping, 0);
    if (!resolved) return;

    this.activePingId = resolved.id;
    this.rotateToLocation(resolved.lat, resolved.lon);
    this.zoomSliderValue = Math.max(this.zoomSliderValue, resolved.zoom);
    this.camDistTarget = this.zoomSliderToCamDist(this.zoomSliderValue);
    this.lastBuiltZoom = -1;
  }

  focusPingById(id: string | number): void {
    const ping = this.getAllPings().find(p => p.id === String(id));
    if (ping) this.focusPing(ping);
  }

  focusNextPing(): void {
    const pings = this.getAllPings();
    if (!pings.length) return;
    this.pingTourIndex = (this.pingTourIndex + 1) % pings.length;
    this.focusPing(pings[this.pingTourIndex]);
  }

  startPingTour(intervalMs = 4500): void {
    this.stopPingTour();
    const pings = this.getAllPings();
    if (!pings.length) return;

    this.pingTourIndex = -1;
    this.focusNextPing();
    this.pingTourTimer = setInterval(() => this.focusNextPing(), Math.max(1200, intervalMs));
  }

  stopPingTour(): void {
    if (this.pingTourTimer) {
      clearInterval(this.pingTourTimer);
      this.pingTourTimer = null;
    }
  }

  private isResolvedPing(ping: ResolvedGlobePing | GlobePing): ping is ResolvedGlobePing {
    return typeof (ping as ResolvedGlobePing).id === 'string'
      && typeof ping.lat === 'number'
      && typeof ping.lon === 'number'
      && typeof (ping as ResolvedGlobePing).zoom === 'number';
  }

  private getAllPings(): ResolvedGlobePing[] {
    const storyPings = this.showStoriesPins ? this.filteredStories
      .map(story => this.storyToPing(story))
      .filter((ping): ping is ResolvedGlobePing => !!ping) : [];
    const newsPings = this.showNewsPins ? this.filteredNewsPins
      .map(pin => this.newsPinToPing(pin))
      .filter((ping): ping is ResolvedGlobePing => !!ping) : [];
    const customPings = this.customPings
      .map((ping, index) => this.resolveCustomPing(ping, index))
      .filter((ping): ping is ResolvedGlobePing => !!ping);
    const userPings = this.showUsersPins ? this.usersWithLocations
      .map(user => this.userToPing(user))
      .filter((ping): ping is ResolvedGlobePing => !!ping) : [];

    // Add country/city coordinates if enabled
    const coordPings: ResolvedGlobePing[] = [];
    if (this.showCountryCoords) {
      for (const [country, coords] of Object.entries(COUNTRY_COORDS)) {
        coordPings.push({
          id: `country:${country}`,
          lat: coords[0],
          lon: coords[1],
          label: country,
          zoom: 58,
          source: 'custom',
          data: { type: 'country', name: country },
        });
      }
    }
    if (this.showCityCoords) {
      for (const [city, coords] of Object.entries(CITY_COORDS)) {
        coordPings.push({
          id: `city:${city}`,
          lat: coords[0],
          lon: coords[1],
          label: this.formatCityLabelFromKey(city),
          zoom: 82,
          source: 'custom',
          data: { type: 'city', name: city },
        });
      }
    }
    if (this.showTownCoords) {
      for (const [town, coords] of Object.entries(TOWN_COORDS)) {
        coordPings.push({
          id: `town:${town}`,
          lat: coords[0],
          lon: coords[1],
          label: town,
          zoom: 70,
          source: 'custom',
          data: { type: 'town', name: town },
        });
      }
    }

    const flightPings = this.showFlightsPins ? this.getFlightPings() : [];
    return [...flightPings, ...storyPings, ...newsPings, ...customPings, ...userPings, ...coordPings];
  }

  private getFlightPings(): ResolvedGlobePing[] {
    const pings: ResolvedGlobePing[] = [];
    const limit = 500;
    const states = this.allFlightStates.slice(0, limit);

    for (const state of states) {
      if (state.length < 10) {
        console.warn('Skipping malformed flight state:', state);
        continue; // Ensure state has enough fields
      }
      const callsign = state[1];
      const lat = state[6];
      const lon = state[5];
      const heading = state[10];
      const altitude = state[7];
      const velocity = state[9];
      if (lat == null || lon == null || !callsign) continue;

      const isTracked = this.trackedFlights.some(f =>
        f.enabled && f.callsign && typeof f.callsign === 'string' && f.callsign.trim().toUpperCase() === callsign.toUpperCase()
      );

      pings.push({
        id: `flight:${callsign}`,
        lat,
        lon,
        label: callsign,
        zoom: 0,
        source: 'custom',
        data: {
          type: 'flight',
          callsign,
          heading,
          altitude,
          velocity,
          isTracked,
          registration: state[11],
          aircraftType: state[12],
          typeDescription: state[13],
          owner: state[14],
          hex: state[0],
          onGround: state[8],
          timePosition: state[3],
          lastContact: state[4],
        },
      });
    }

    for (const flight of this.trackedFlights) {
      if (!flight.enabled) continue;
      if (flight.originLat != null && flight.originLon != null) {
        pings.push({
          id: `airport:${flight.id}:origin`,
          lat: flight.originLat,
          lon: flight.originLon,
          label: flight.origin || 'Origin',
          zoom: 0,
          source: 'custom',
          data: { type: 'airport' },
        });
      }
      if (flight.destLat != null && flight.destLon != null) {
        pings.push({
          id: `airport:${flight.id}:dest`,
          lat: flight.destLat,
          lon: flight.destLon,
          label: flight.destination || 'Destination',
          zoom: 0,
          source: 'custom',
          data: { type: 'airport' },
        });
      }
    }

    return pings;
  }

  private newsPinToPing(pin: NewsPin): ResolvedGlobePing | null {
    if (pin.lat == null || pin.lon == null) return null;
    return {
      id: `news:${pin.id}`,
      lat: pin.lat,
      lon: pin.lon,
      label: pin.label || pin.articleTitle || 'News',
      zoom: pin.locationType === 'city' ? 82 : 58,
      source: 'news',
      newsPin: pin,
    };
  }
  saveCoords() {
    const lat = this.editLat;
    const long = this.editLon;
    this.closeCoordsEditPopup();
    this.rotateToLocation(lat, long);
  }
  changeEditLatLon() { 
    this.editLat = parseFloat(this.editLatInput.nativeElement.value);
    this.editLon = parseFloat(this.editLonInput.nativeElement.value);
  }
  openCoordsEditPopup() {
    console.log("opening coords display");
    this.editLat = 0;
    this.editLon = 0;
    this.isCoordsEditPopupOpen = true;
    this.inputtedParentRef.openOverlay();
  }
  closeCoordsEditPopup(): void {
    this.isCoordsEditPopupOpen = false; 
    this.inputtedParentRef.closeOverlay();
  }
  private userToPing(userWithLoc: UserWithLocation): ResolvedGlobePing | null {
    const user = userWithLoc.user;
    const coords = userWithLoc.city
      ? this.lookupCityCoords(userWithLoc.city, userWithLoc.country)
      : this.lookupCoords(COUNTRY_COORDS, userWithLoc.country);
    if (!coords) return null;
    return {
      id: `user:${user.id}`,
      lat: coords[0],
      lon: coords[1],
      label: `${user.username} (${this.formatLocationLabel(userWithLoc.city, userWithLoc.country)})`,
      zoom: userWithLoc.city ? 82 : 58,
      source: 'user',
      user: user,
      city: userWithLoc.city,
      country: userWithLoc.country,
    };
  }

  private storyToPing(story: Story): ResolvedGlobePing | null {
    const loc = this.resolveStoryLocation(story);
    if (!loc) return null;

    return {
      id: `story:${story.id ?? `${loc.label}:${story.date ?? ''}`}`,
      lat: loc.lat,
      lon: loc.lon,
      label: loc.label,
      zoom: loc.precision === 'city' ? 82 : 58,
      source: 'story',
      story,
    };
  }

  private resolveCustomPing(ping: GlobePing, index: number): ResolvedGlobePing | null {
    const lat = typeof ping.lat === 'number' ? ping.lat : undefined;
    const lon = typeof ping.lon === 'number' ? ping.lon : undefined;
    const coords = lat !== undefined && lon !== undefined
      ? [lat, lon] as [number, number]
      : this.lookupCityCoords(ping.city, ping.country) ?? this.lookupCoords(COUNTRY_COORDS, ping.country);

    if (!coords) return null;

    const label = ping.label || this.formatLocationLabel(ping.city, ping.country);
    return {
      id: `custom:${ping.id ?? `${label}:${index}`}`,
      lat: coords[0],
      lon: coords[1],
      label,
      zoom: ping.zoom ?? (ping.city ? 82 : 58),
      source: 'custom',
      data: ping.data,
    };
  }

  private rotateToLocation(lat: number, lon: number): void {
    const latR = lat * Math.PI / 180;
    const lonR = lon * Math.PI / 180;
    const px = Math.cos(latR) * Math.sin(lonR);
    const py = Math.sin(latR);
    const pz = Math.cos(latR) * Math.cos(lonR);

    let ux = 0, uy = 1, uz = 0;
    if (Math.abs(px * ux + py * uy + pz * uz) > 0.99) { ux = 1; uy = 0; uz = 0; }

    let rx = uy * pz - uz * py, ry = uz * px - ux * pz, rz = ux * py - uy * px;
    const rLen = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
    rx /= rLen; ry /= rLen; rz /= rLen;

    const bx = py * rz - pz * ry, by = pz * rx - px * rz, bz = px * ry - py * rx;
    this.rot = new Float32Array([rx, ry, rz, bx, by, bz, px, py, pz]);
  }

  // Filter users based on search term
  get filteredUsersWithLocations(): UserWithLocation[] {
    if (!this.userSearchTerm) {
      return this.usersWithLocations;
    }
    
    const searchTerm = this.userSearchTerm.toLowerCase();
    return this.usersWithLocations.filter(user => {
      // Filter by user name or ID
      const userName = user.user?.username?.toLowerCase() || '';
      const userId = user.user?.id?.toString() || '';
      return userName.includes(searchTerm) || userId.includes(searchTerm);
    });
  }

  onUserSearch(event: Event): void {
    this.userSearchTerm = (event.target as HTMLInputElement).value;
  }

  // =========================================================================
  // WebGL
  // =========================================================================
  private initWebGL(): void {
    const canvas = this.globeCanvasRef.nativeElement;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false }) as WebGLRenderingContext;
    if (!gl) { console.error('WebGL not supported'); return; }
    this.gl = gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.vertShader = this.compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    this.fragShader = this.compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, this.vertShader);
    gl.attachShader(prog, this.fragShader);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      console.error('Shader link error:', gl.getProgramInfoLog(prog));
    this.prog = prog;

    this.posBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      1, -1, 1, 1, -1, 1
    ]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // placeholder 1×1 dark blue
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 80, 255]));

    this.detailTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.detailTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0]));
  }

  private compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      console.error('Shader compile error:', gl.getShaderInfoLog(s));
    return s;
  }

  // =========================================================================
  // Tile / texture system
  // =========================================================================

  // ---- coordinate helpers -------------------------------------------------

  private camDistToTileZoom(): number {
    const sd = Math.max(this.CAM_MIN - 1, this.camDist - 1.0);
    return Math.max(2, Math.min(this.SATELLITE_ZOOM_MAX,
      Math.round(2 + Math.log2(7.0 / sd))
    ));
  }

  private getCenterLonLat(): [number, number] {
    const R = this.rot;

    const vx = R[6];
    const vy = R[7];
    const vz = R[8];

    const lon = Math.atan2(vx, vz) * 180 / Math.PI;
    const lat = Math.asin(Math.max(-1, Math.min(1, vy))) * 180 / Math.PI;

    return [lon, lat];
  }

  private lonLatToTile(lon: number, lat: number, z: number): [number, number] {
    const n = Math.pow(2, z);
    const latRad = lat * Math.PI / 180;
    return [
      Math.max(0, Math.min(n - 1, Math.floor((lon + 180) / 360 * n))),
      Math.max(0, Math.min(n - 1,
        Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
      )),
    ];
  }

  /**
   * Angular radius (degrees) of the visible spherical cap.
   * Derived from the ray-sphere geometry: for a ray at half-FOV, the
   * sphere-surface angle from the viewing axis satisfies
   *   sin(α) = sin(halfFov) · camDist
   * so the cap angle = π − halfFov − α.
   */
  private visibleCapDeg(): number {
    const halfFov = 35 / 2 * Math.PI / 180;
    const sinA = Math.sin(halfFov) * this.camDist;
    if (sinA >= 1) return 90;
    return (Math.PI - halfFov - Math.asin(sinA)) * 180 / Math.PI;
  }

  // ---- texture canvas -----------------------------------------------------

  private buildTexCanvas(): void {
    this.texCanvas = document.createElement('canvas');
    this.texCanvas.width = this.TEX_SIZE;
    this.texCanvas.height = this.TEX_SIZE;
    this.texCtx = this.texCanvas.getContext('2d')!;
    this.texCtx.fillStyle = '#001a33';
    this.texCtx.fillRect(0, 0, this.TEX_SIZE, this.TEX_SIZE);
    this.detailTexCanvas = document.createElement('canvas');
    this.detailTexCanvas.width = this.TILE_SIZE;
    this.detailTexCanvas.height = this.TILE_SIZE;
    this.detailTexCtx = this.detailTexCanvas.getContext('2d')!;
    this.uploadTexture();
    this.uploadDetailTexture();
  }

  // ---- base tiles (zoom 2, 4×4 = 16 tiles, always visible) ---------------

  private loadBaseTiles(): void {
    const z = this.BASE_ZOOM;
    const n = Math.pow(2, z);
    let done = 0;
    const total = n * n;

    for (let ty = 0; ty < n; ty++) {
      for (let tx = 0; tx < n; tx++) {
        const cx = tx, cy = ty; // capture
        this.tileCacheService.getTile(z, cx, cy, (img) => {
          if (img) this.paintTile(img, cx, cy, z);
          if (++done === total) this.uploadTexture();
        });
      }
    }
  }

  // ---- detail tiles -------------------------------------------------------

  /**
   * Called every frame from the render loop.
   *
   * When the view has changed enough:
   *  1. Cancel any pending (not yet sent) tile requests for the old view.
   *  2. Record the new set of relevant tile keys in currentViewKeys.
   *  3. Repaint the texture from scratch using whatever is already decoded.
   *  4. Fire getTile() for tiles that aren't decoded yet; the callback
   *     paints and re-uploads only if the key is still in currentViewKeys.
   */
  private updateDetailTiles(): void {
    const tileZoom = this.camDistToTileZoom();
    if (tileZoom <= this.BASE_ZOOM) return;

    const [centerLon, centerLat] = this.getCenterLonLat();

    // Movement threshold: finer at high zoom so panning stays sharp.
    const threshold = tileZoom >= 12 ? 0.08
      : tileZoom >= 10 ? 0.25
        : tileZoom >= 7 ? 0.75 : 2.0;

    const zoomChanged = tileZoom !== this.lastBuiltZoom;
    const movedEnough = Math.abs(centerLon - this.lastBuiltLon) > threshold
      || Math.abs(centerLat - this.lastBuiltLat) > threshold;
    if (!zoomChanged && !movedEnough) return;

    // Commit new view state BEFORE any async work so re-entrant calls
    // from the same frame don't trigger duplicate updates.
    this.lastBuiltZoom = tileZoom;
    this.lastBuiltLon = centerLon;
    this.lastBuiltLat = centerLat;

    // Drop queued (unsent) requests from the previous view.
    this.tileCacheService.cancelPending();

    const needed = this.getVisibleTiles(tileZoom, centerLon, centerLat);
    if (needed.length === 0) return;

    const n = Math.pow(2, tileZoom);
    const minDx = Math.min(...needed.map(t => t.dx));
    const maxDx = Math.max(...needed.map(t => t.dx));
    const minDy = Math.min(...needed.map(t => t.dy));
    const maxDy = Math.max(...needed.map(t => t.dy));
    const [cx, cy] = this.lonLatToTile(centerLon, centerLat, tileZoom);
    this.detailAtlas = {
      enabled: true,
      zoom: tileZoom,
      originX: ((cx + minDx) % n + n) % n,
      originY: Math.max(0, Math.min(n - 1, cy + minDy)),
      cols: maxDx - minDx + 1,
      rows: maxDy - minDy + 1,
    };

    // Register the new view's key set so late-arriving callbacks can self-discard.
    this.currentViewKeys = new Set(needed.map(t => t.key));

    // Repaint the texture synchronously with whatever is already decoded.
    this.repaintTexture(tileZoom, needed);
    this.repaintDetailAtlas(needed);

    // Request all tiles; the service returns immediately from its image cache
    // if the tile was previously decoded, otherwise queues a batch fetch.
    for (const { tx, ty, key } of needed) {
      const ctZ = tileZoom, ctX = tx, ctY = ty, ctKey = key;
      this.pendingTiles++;
      this.isLoading = true;
      this.isLoadingEvent.emit(true);

      this.tileCacheService.getTile(ctZ, ctX, ctY, (img) => {
        this.pendingTiles = Math.max(0, this.pendingTiles - 1);
        if (this.pendingTiles === 0) {
          this.isLoading = false;
          this.isLoadingEvent.emit(false);
        }

        // Discard if the view has moved on while we were waiting.
        if (!this.currentViewKeys.has(ctKey)) {
          return;
        }
        if (!img) {
          return;
        }

        this.repaintDetailAtlas(needed);
      });
    }
  }

  private getVisibleTiles(tileZoom: number, centerLon: number, centerLat: number)
    : Array<{ tx: number; ty: number; key: string; dx: number; dy: number }> {
    const n = Math.pow(2, tileZoom);
    const [cx, cy] = this.lonLatToTile(centerLon, centerLat, tileZoom);
    const radius = this.getAdaptiveDetailRadius(tileZoom);
    const tiles: Array<{ tx: number; ty: number; key: string; dx: number; dy: number }> = [];

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = ((cx + dx) % n + n) % n;
        const ty = Math.max(0, Math.min(n - 1, cy + dy));
        const key = `${tileZoom}/${tx}/${ty}`;
        if (!tiles.some(t => t.key === key)) {
          tiles.push({ tx, ty, key, dx, dy });
        }
      }
    }

    return tiles.sort((a, b) => {
      const ar = Math.max(Math.abs(a.dx), Math.abs(a.dy));
      const br = Math.max(Math.abs(b.dx), Math.abs(b.dy));
      return ar - br || (Math.abs(a.dx) + Math.abs(a.dy)) - (Math.abs(b.dx) + Math.abs(b.dy));
    });
  }

  private getAdaptiveDetailRadius(tileZoom: number): number {
    if (tileZoom >= 17) return 3;
    if (tileZoom >= 15) return 4;
    return this.MAX_DETAIL_RADIUS;
  }

  /**
   * Repaint the whole texture from scratch using only already-decoded images.
   * Order: ocean fill → base zoom-2 layer → detail layer.
   * This runs synchronously; getTile() returns immediately from the image
   * cache when the tile is already decoded.
   */
  private repaintTexture(
    detailZoom: number,
    detailTiles: Array<{ tx: number; ty: number }>
  ): void {
    // Check if any base tiles are cached yet - if not, don't clear canvas (wait for base layer to load)
    const bz = this.BASE_ZOOM;
    const bn = Math.pow(2, bz);
    let hasBaseTiles = false;
    for (let ty = 0; ty < bn; ty++) {
      for (let tx = 0; tx < bn; tx++) {
        const key = `${bz}/${tx}/${ty}`;
        if (this.tileCacheService.getCachedTile(key)) {
          hasBaseTiles = true;
          break;
        }
      }
      if (hasBaseTiles) break;
    }

    if (!hasBaseTiles) {
      return;
    }

    this.texCtx.fillStyle = '#001a33';
    this.texCtx.fillRect(0, 0, this.TEX_SIZE, this.TEX_SIZE);

    // Always paint base layer (zoom 2) - ONLY use cached images, don't trigger fetches
    for (let ty = 0; ty < bn; ty++) {
      for (let tx = 0; tx < bn; tx++) {
        const key = `${bz}/${tx}/${ty}`;
        const cached = this.tileCacheService.getCachedTile(key);
        if (cached) {
          this.paintTile(cached, tx, ty, bz);
        }
      }
    }
    // Upload after all synchronous painting is done
    this.uploadTexture();
  }

  private repaintDetailAtlas(
    detailTiles: Array<{ tx: number; ty: number; key: string }>
  ): void {
    if (!this.detailTexCtx) return;

    const cols = Math.max(1, Math.min(this.MAX_ATLAS_TILES, this.detailAtlas.cols));
    const rows = Math.max(1, Math.min(this.MAX_ATLAS_TILES, this.detailAtlas.rows));
    const width = cols * this.TILE_SIZE;
    const height = rows * this.TILE_SIZE;

    if (this.detailTexCanvas.width !== width || this.detailTexCanvas.height !== height) {
      this.detailTexCanvas.width = width;
      this.detailTexCanvas.height = height;
      this.detailTexCtx = this.detailTexCanvas.getContext('2d')!;
    }

    this.detailTexCtx.clearRect(0, 0, width, height);

    const n = Math.pow(2, this.detailAtlas.zoom);
    for (const { tx, ty, key } of detailTiles) {
      const cached = this.tileCacheService.getCachedTile(key);
      if (!cached) continue;

      const col = ((tx - this.detailAtlas.originX) % n + n) % n;
      const row = ty - this.detailAtlas.originY;
      if (col < 0 || col >= cols || row < 0 || row >= rows) continue;

      this.detailTexCtx.drawImage(
        cached,
        col * this.TILE_SIZE,
        row * this.TILE_SIZE,
        this.TILE_SIZE,
        this.TILE_SIZE
      );
    }

    this.detailAtlas.cols = cols;
    this.detailAtlas.rows = rows;
    this.uploadDetailTexture();
  }

  // ---- tile painting (Mercator → equirectangular) -------------------------

  /**
   * Paint one Mercator tile into the equirectangular texture canvas.
   *
   * The WebGL shader samples the texture as a simple equirectangular map
   * (lon/lat both linear).  Mercator tiles have a non-linear latitude
   * mapping that must be inverted row by row.
   *
   * Correct Web Mercator → lat conversion:
   *   latMax = atan(sinh(π · (1 − 2·ty/n)))
   *   latMin = atan(sinh(π · (1 − 2·(ty+1)/n)))
   */
  private paintTile(img: HTMLImageElement, tx: number, ty: number, z: number): void {
    const n = Math.pow(2, z);

    // Check if context is valid
    if (!this.texCtx) {
      return;
    }

    // Check if image is valid
    if (!img || img.width === 0 || img.height === 0) {
      return;
    }

    // Geographic bounds of this tile
    const lonMin = (tx / n) * 360 - 180;
    const lonMax = ((tx + 1) / n) * 360 - 180;
    const latMax = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n))) * 180 / Math.PI;
    const latMin = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + 1) / n))) * 180 / Math.PI;

    // Equirectangular UV (v=0 at north pole)
    const uMin = (lonMin + 180) / 360;
    const uMax = (lonMax + 180) / 360;
    const vMin = 1 - (latMax + 90) / 180;
    const vMax = 1 - (latMin + 90) / 180;

    // Destination rect in texture pixels
    const destX = Math.round(uMin * this.TEX_SIZE);
    const destY = Math.round(vMin * this.TEX_SIZE);
    const destW = Math.max(1, Math.round((uMax - uMin) * this.TEX_SIZE));
    const destH = Math.max(1, Math.round((vMax - vMin) * this.TEX_SIZE));
    if (destW <= 0 || destH <= 0) return;

    // Decode source tile to pixel data
    const src = document.createElement('canvas');
    src.width = src.height = 256;
    const srcCtx = src.getContext('2d')!;
    srcCtx.drawImage(img, 0, 0, 256, 256);
    const srcPx = srcCtx.getImageData(0, 0, 256, 256).data;

    // Pre-compute Mercator Y at tile lat bounds (for srcFrac calculation)
    const mercMax = Math.log(Math.tan(Math.PI / 4 + latMax * Math.PI / 180 / 2));
    const mercMin = Math.log(Math.tan(Math.PI / 4 + latMin * Math.PI / 180 / 2));
    const mercRange = mercMax - mercMin;

    // Remap rows: equirectangular (linear lat) → Mercator source row
    const out = this.texCtx.createImageData(destW, destH);
    const dst = out.data;

    for (let row = 0; row < destH; row++) {
      // Geographic lat for this equirectangular row
      const latDeg = latMax - (row / destH) * (latMax - latMin);
      const latRad = latDeg * Math.PI / 180;

      // Mercator Y at this lat, normalised 0→1 inside the tile (0=top)
      const mercY = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
      const srcFrac = (mercMax - mercY) / mercRange;
      const srcRow = Math.min(255, Math.max(0, Math.round(srcFrac * 255)));

      const srcOff = srcRow * 256 * 4;
      const dstOff = row * destW * 4;

      for (let col = 0; col < destW; col++) {
        const srcCol = Math.min(255, Math.max(0, Math.round((col / destW) * 255)));
        const si = srcOff + srcCol * 4;
        const di = dstOff + col * 4;
        dst[di] = srcPx[si];
        dst[di + 1] = srcPx[si + 1];
        dst[di + 2] = srcPx[si + 2];
        dst[di + 3] = 255;
      }
    }

    this.texCtx.putImageData(out, destX, destY);
  }

  private uploadTexture(): void {
    const gl = this.gl;
    if (!gl) return;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.texCanvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  }

  private uploadDetailTexture(): void {
    const gl = this.gl;
    if (!gl || !this.detailTexCanvas) return;
    gl.bindTexture(gl.TEXTURE_2D, this.detailTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.detailTexCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  // =========================================================================
  // Render loop
  // =========================================================================
  private loop(): void {
    if (this.destroyed) return;
    this.rafId = requestAnimationFrame(() => this.loop());

    // Update coordinates display
    const [lon, lat] = this.getCenterLonLat();
    this.coordsDisplay = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;

    this.camDist += (this.camDistTarget - this.camDist) * 0.1;

    if (this.camDistToTileZoom() > this.BASE_ZOOM) {
      this.updateDetailTiles();
    }

    this.resizeCanvas();
    this.renderGlobe();
    this.renderPins();
    this.renderArcs();
  }

  private resizeCanvas(): void {
    const gc = this.globeCanvasRef.nativeElement;
    const dc = this.detailCanvasRef.nativeElement;
    const pc = this.pinCanvasRef.nativeElement;
    const w = gc.clientWidth, h = gc.clientHeight;
    if (gc.width !== w || gc.height !== h) {
      gc.width = dc.width = pc.width = w;
      gc.height = dc.height = pc.height = h;
    }
  }

  private renderGlobe(): void {
    const gl = this.gl;
    if (!gl) return;
    const w = this.globeCanvasRef.nativeElement.width;
    const h = this.globeCanvasRef.nativeElement.height;

    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0.05, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);

    gl.uniform1i(gl.getUniformLocation(this.prog, 'u_tex'), 0);
    gl.uniform1i(gl.getUniformLocation(this.prog, 'u_detailTex'), 1);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'u_camDist'), this.camDist);
    gl.uniform2f(gl.getUniformLocation(this.prog, 'u_resolution'), w, h);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'u_detailEnabled'), this.detailAtlas.enabled ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'u_detailZoom'), this.detailAtlas.zoom);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'u_detailOriginX'), this.detailAtlas.originX);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'u_detailOriginY'), this.detailAtlas.originY);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'u_detailCols'), this.detailAtlas.cols);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'u_detailRows'), this.detailAtlas.rows);

    // this.rot is row-major.  uniformMatrix3fv(transpose=false) expects
    // column-major, so passing this.rot as-is effectively transposes it —
    // which is exactly what the shader needs (it applies R^T to the hit
    // point to map from view space back to world/texture space).
    gl.uniformMatrix3fv(gl.getUniformLocation(this.prog, 'u_rot'), false, this.rot);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.detailTex);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  // =========================================================================
  // Pin rendering (2D overlay)
  // =========================================================================
  private renderPins(): void {
    const canvas = this.pinCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    for (const ping of this.getAllPings()) {
      const proj = this.projectPin(ping.lat, ping.lon, w, h);
      if (!proj) continue;
      const { x, y } = proj;
      const isActive = this.activePingId === ping.id;
  
      const color = ping.source === 'story' ? pingTypeColors[0]
        : ping.source === 'news' ? pingTypeColors[1]
        : ping.source === 'user' ? pingTypeColors[2]
        : pingTypeColors[3];

      // Determine if this is a city, country or town ping (special case)
      let pingColor = color;
      if (ping.source === 'custom') {
        const ptype = (ping.data as any)?.type;
        if (ptype === 'town') {
          pingColor = pingTypeColors[6]; // Town color
        } else if (ping.city) {
          pingColor = pingTypeColors[4];  // City color
        } else if (ping.country) {
          pingColor = pingTypeColors[5];  // Country color
        }
      }
      
      const flightData = ping.data as any;
      const isFlight = flightData?.type === 'flight';
      const isAirport = flightData?.type === 'airport';

      if (isFlight) {
        this.drawPlaneIcon(ctx, x, y, flightData?.heading, isActive, flightData?.isTracked);
        
        // Show callsign on hover for flights
        if (this.hoveredPin?.id === ping.id) {
          ctx.font = 'bold 12px sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = 'rgba(0,0,0,0.8)';
          ctx.lineWidth = 3;
          ctx.strokeText(flightData?.callsign || ping.label, x + 8, y - 8);
          ctx.fillText(flightData?.callsign || ping.label, x + 8, y - 8);
        }
      } else {  
      const grad = ctx.createRadialGradient(x, y, 0, x, y, 10);
      grad.addColorStop(0, `rgba(${pingColor}, ${isActive ? '1' : '0.9'})`);
      grad.addColorStop(1, `rgba(${pingColor}, 0)`);
      ctx.beginPath();
      ctx.arc(x, y, isActive ? 14 : 10, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

  
      ctx.beginPath();
      ctx.arc(x, y, isActive ? 5 : 4, 0, Math.PI * 2);
      // Update icon color to match ping type
      ctx.fillStyle = ping.source === 'story' ? 'rgb(255, 68, 68)' 
        : ping.source === 'news' ? 'rgb(255, 180, 50)' 
        : ping.source === 'user' ? 'rgb(85, 136, 255)' 
        : (ping.source === 'custom' && (ping.data as any)?.type === 'town') ? 'rgb(100, 200, 100)'
        : (ping.source === 'custom' && ping.city) ? 'rgb(255, 100, 100)'
        : (ping.source === 'custom' && ping.country) ? 'rgb(255, 200, 100)'
        : 'rgb(74, 170, 255)';
  
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;

      const s = isActive ? 7 : 6;
      switch (ping.source) {
        case 'story':
          this.drawStoryIcon(ctx, x, y, s);
          break;
        case 'news':
          this.drawNewsIcon(ctx, x, y, s);
          break;
        case 'user':
          this.drawUserIcon(ctx, x, y, s);
          break;
        default:
          // For custom pings, consider town vs city vs country
          if ((ping.data as any)?.type === 'town') {
            this.drawTownIcon(ctx, x, y, s);
          } else if (ping.city) {
            this.drawCustomIcon(ctx, x, y, s);
          } else if (ping.country) {
            this.drawCustomIcon(ctx, x, y, s);
          } else {
            this.drawCustomIcon(ctx, x, y, s);
          }
          break;
      }

      if (this.hoveredPin?.id === ping.id || isActive) {
        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 3;
        ctx.strokeText(ping.label, x + 8, y - 8);
        ctx.fillText(ping.label, x + 8, y - 8);
      }
    }
  }
}

  private drawPlaneIcon(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number | undefined | null, isActive: boolean, isTracked: boolean = false): void {
    const size = isActive ? 8 : 6;
    const headingRad = heading != null ? (heading * Math.PI / 180) : 0;
    const glowSize = isActive ? 18 : 14;
    const color = isTracked ? '#00ddff' : '#ffdd00';

    const grad = ctx.createRadialGradient(x, y, 0, x, y, glowSize);
    grad.addColorStop(0, isTracked ? 'rgba(0, 221, 255, 0.4)' : 'rgba(255, 220, 0, 0.4)');
    grad.addColorStop(1, 'rgba(255, 220, 0, 0)');
    ctx.beginPath();
    ctx.arc(x, y, glowSize, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(headingRad);

    const s = size;

    // Draw a more realistic airplane shape
    ctx.beginPath();
    
    // Fuselage
    ctx.moveTo(s * 1.2, 0);
    ctx.lineTo(s * 0.4, -s * 0.3);
    ctx.lineTo(s * 0.4, s * 0.3);
    ctx.closePath();
    
    // Wings
    ctx.moveTo(s * 0.4, -s * 0.3);
    ctx.lineTo(-s * 0.2, -s * 0.8);
    ctx.lineTo(-s * 0.2, s * 0.8);
    ctx.lineTo(s * 0.4, s * 0.3);
    
    // Tail
    ctx.moveTo(-s * 0.2, -s * 0.8);
    ctx.lineTo(-s * 0.6, -s * 0.4);
    ctx.lineTo(-s * 0.6, s * 0.4);
    ctx.lineTo(-s * 0.2, s * 0.8);
    
    ctx.closePath();

    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (isTracked && !isActive) {
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#00ddff';
      ctx.globalAlpha = 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawStoryIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    const hw = s * 0.8, hh = s * 1.1;
    const left = x - hw, top = y - hh;
    ctx.beginPath();
    ctx.moveTo(left + 2, top);
    ctx.lineTo(left + hw * 2 - 2, top);
    ctx.quadraticCurveTo(left + hw * 2, top, left + hw * 2, top + 2);
    ctx.lineTo(left + hw * 2, top + hh * 2 - 2);
    ctx.quadraticCurveTo(left + hw * 2, top + hh * 2, left + hw * 2 - 2, top + hh * 2);
    ctx.lineTo(left + 2, top + hh * 2);
    ctx.quadraticCurveTo(left, top + hh * 2, left, top + hh * 2 - 2);
    ctx.lineTo(left, top + 2);
    ctx.quadraticCurveTo(left, top, left + 2, top);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    ctx.restore();
  }

  private renderArcs(): void {
    const allArcs = [...this.arcs, ...this.flightArcs];
    if (!allArcs.length) return;
    const canvas = this.pinCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;

    for (const arc of allArcs) {
      const steps = 40;
      const pts: { x: number; y: number }[] = [];

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const p = this.greatCircleInterpolate(arc.from.lat, arc.from.lon, arc.to.lat, arc.to.lon, t);
        const proj = this.projectPin(p.lat, p.lon, w, h);
        if (proj) pts.push(proj);
      }

      if (pts.length < 2) continue;

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.strokeStyle = arc.color || '#ffdd00';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  private greatCircleInterpolate(lat1: number, lon1: number, lat2: number, lon2: number, t: number): { lat: number; lon: number } {
    const φ1 = lat1 * Math.PI / 180, λ1 = lon1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180, λ2 = lon2 * Math.PI / 180;

    const Δφ = φ2 - φ1, Δλ = λ2 - λ1;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    const δ = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    if (δ < 0.001) {
      return { lat: lat1 + (lat2 - lat1) * t, lon: lon1 + (lon2 - lon1) * t };
    }

    const A = Math.sin((1 - t) * δ) / Math.sin(δ);
    const B = Math.sin(t * δ) / Math.sin(δ);

    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);

    return {
      lat: Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI,
      lon: Math.atan2(y, x) * 180 / Math.PI,
    }; 
  }

  private drawNewsIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    const hw = s, hh = s * 0.85;
    const left = x - hw, top = y - hh;
    ctx.beginPath();
    ctx.moveTo(left + 2, top);
    ctx.lineTo(left + hw * 2 - 2, top);
    ctx.quadraticCurveTo(left + hw * 2, top, left + hw * 2, top + 2);
    ctx.lineTo(left + hw * 2, top + hh * 2 - 2);
    ctx.quadraticCurveTo(left + hw * 2, top + hh * 2, left + hw * 2 - 2, top + hh * 2);
    ctx.lineTo(left + 2, top + hh * 2);
    ctx.quadraticCurveTo(left, top + hh * 2, left, top + hh * 2 - 2);
    ctx.lineTo(left, top + 2);
    ctx.quadraticCurveTo(left, top, left + 2, top);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(left + 3, top + 3, hw * 2 - 6, 4);

    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    const ly = top + 10;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(left + 3, ly + i * 4);
      ctx.lineTo(left + hw * 2 - 3, ly + i * 4);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(left + (hw * 2) / 2, ly);
    ctx.lineTo(left + (hw * 2) / 2, ly + 8);
    ctx.stroke();
  }

  private drawCustomIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    ctx.beginPath();
    ctx.arc(x, y - s * 0.15, s * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - s * 0.75, y - s * 0.15);
    ctx.quadraticCurveTo(x, y + s, x + s * 0.75, y - s * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private drawTownIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    // Simple house/town-shaped icon
    ctx.beginPath();
    ctx.moveTo(x - s * 0.6, y + s * 0.2);
    ctx.lineTo(x, y - s * 0.8);
    ctx.lineTo(x + s * 0.6, y + s * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.rect(x - s * 0.45, y + s * 0.2, s * 0.9, s * 0.7);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - s * 0.08, y + s * 0.55, s * 0.16, s * 0.35);
    ctx.fillStyle = '#000000';
  }

  private drawUserIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    const hw = s * 0.55, hh = s * 0.7;
    const top = y - hh;

    ctx.beginPath();
    ctx.arc(x, top, s * 0.3, Math.PI, 0);
    ctx.lineTo(x + hw, top + s * 0.3);
    ctx.lineTo(x + hw * 0.75, top + hh + s * 0.15);
    ctx.lineTo(x - hw * 0.75, top + hh + s * 0.15);
    ctx.lineTo(x - hw, top + s * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, top + s * 0.05, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  private projectPin(latDeg: number, lngDeg: number, w: number, h: number)
    : { x: number; y: number } | null {
    const lat = latDeg * Math.PI / 180;
    const lng = lngDeg * Math.PI / 180;
    const px = Math.cos(lat) * Math.sin(lng);
    const py = Math.sin(lat);
    const pz = Math.cos(lat) * Math.cos(lng);

    const R = this.rot;
    const rx = R[0] * px + R[1] * py + R[2] * pz;
    const ry = R[3] * px + R[4] * py + R[5] * pz;
    const rz = R[6] * px + R[7] * py + R[8] * pz;
    if (rz < -0.1) return null;

    const fov = 35 * Math.PI / 180;
    const f = 1.0 / Math.tan(fov / 2);
    const asp = w / h;
    const denom = this.camDist - rz;
    return {
      x: ((f / asp) * rx / denom * 0.5 + 0.5) * w,
      y: (1 - (f * ry / denom * 0.5 + 0.5)) * h,
    };
  }

  // =========================================================================
  // Input handling
  // =========================================================================
  private bindMouseEvents(): void {
    const gc = this.globeCanvasRef.nativeElement;
    gc.addEventListener('mousedown', e => this.onMouseDown(e));
    gc.addEventListener('mousemove', e => this.onMouseMove(e));
    gc.addEventListener('mouseup', () => this.onMouseUp());
    gc.addEventListener('mouseleave', () => this.onMouseUp());
    gc.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    gc.addEventListener('click', e => this.onClick(e));
  }

  private bindTouchEvents(): void {
    const gc = this.globeCanvasRef.nativeElement;
    let lastDist = 0;
    let isZooming = false; // Track if we're in zoom mode
    
    // Prevent pull-to-refresh on mobile
    gc.addEventListener('touchstart', (e) => {
      // Check if the touch started on the globe canvas
      if (e.target === gc) {
        // Prevent default behavior for touchstart on canvas to prevent pull-to-refresh
        e.preventDefault();
      }
    }, { passive: false });
    
    gc.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.lastX = e.touches[0].clientX;
        this.lastY = e.touches[0].clientY;
        isZooming = false; // Reset zoom state
      } else if (e.touches.length === 2) {
        lastDist = this.touchDist(e);
        isZooming = true; // Set zoom mode
      }
    }, { passive: true });
    
    gc.addEventListener('touchmove', e => {
      if (e.touches.length === 1 && this.isDragging && !isZooming) {
        const dx = e.touches[0].clientX - this.lastX;
        const dy = e.touches[0].clientY - this.lastY;
        this.lastX = e.touches[0].clientX;
        this.lastY = e.touches[0].clientY;
        this.applyDrag(dx, dy);
      } else if (e.touches.length === 2) {
        const dist = this.touchDist(e);
        const delta = lastDist - dist;
        lastDist = dist;
        this.camDistTarget = Math.max(this.CAM_MIN,
          Math.min(this.CAM_MAX, this.camDistTarget + delta * 0.004));
        this.syncSliderFromDist();
      }
    }, { passive: true });
    
    gc.addEventListener('touchend', (e) => { 
      this.isDragging = false;
      isZooming = false; // Reset zoom state when touch ends
      
      // Handle tap on a pin (if not a drag)
      if (!this.dragMoved && e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        const rect = gc.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        
        // Create a mock event object for pin click logic
        const mockEvent = {
          clientX: touch.clientX,
          clientY: touch.clientY,
          preventDefault: () => {},
          stopPropagation: () => {}
        };
        
        // Call the pin click handler directly (similar to onClick but for touch)
        this.handleClickOnPin(mockEvent as any);
      }
    }, { passive: true });
  }

  // Handle pin clicks specifically for touch events
  private handleClickOnPin(e: any): void {
    if (this.dragMoved) return;
    
    const ping = this.findPingAtEvent(e);
    if (!ping) {
      this.flightArcs = [];
      return;
    }

    const allPings = this.getAllPings();
    const sameLocationPings = allPings.filter(p =>
      Math.abs(p.lat - ping.lat) < 0.001 && Math.abs(p.lon - ping.lon) < 0.001
    );

    if (sameLocationPings.length > 1) {
      this.selectedClusterPings = sameLocationPings;
      this.clusterLocationLabel = ping.label;
      this.showClusterPopup = true;
      this.focusPing(ping);
      return;
    }

    if (ping.source === 'news' && ping.newsPin) {
      this.selectedNewsPin = ping.newsPin;
      this.showNewsPopup = true;
      return;
    }

    if (ping.source === 'story' && ping.story) {
      this.selectedStory = ping.story;
      this.showStoryPopup = true;
      this.focusPing(ping);
      return;
    }

    if (ping.source === 'user' && ping.user) {
      this.selectedUser = ping.user;
      this.selectedUserPing = ping;
      this.showUserPopup = true;
      this.focusPing(ping);
      return;
    }

    const pingData = ping.data as any;
    if (pingData?.type === 'flight') {
      this.onFlightClick(ping);
      return;
    }
    this.focusPing(ping);
    this.pingClicked.emit({
      id: ping.id,
      label: ping.label,
      lat: ping.lat,
      lon: ping.lon,
      data: ping.data,
    });
  }

  private touchDist(e: TouchEvent): number {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private onMouseDown(e: MouseEvent): void {
    this.isDragging = true;
    this.dragMoved = false;
    this.lastX = e.clientX; this.lastY = e.clientY;
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isDragging) { 
      this.checkPinHover(e); 
      // Only position tooltip if we have a hover and it's a flight
      if (this.hoveredFlightCallsign) {
        this.positionTooltip(e);
      }
      return; 
    }
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) this.dragMoved = true;
    this.lastX = e.clientX; this.lastY = e.clientY;
    this.applyDrag(dx, dy);
  }

  private onMouseUp(): void { this.isDragging = false; }

  private positionTooltip(e: MouseEvent): void {
    if (!this.hoveredFlightCallsign) return;
    
    const tooltip = document.querySelector('.flight-tooltip') as HTMLElement;
    if (!tooltip) return;
    
    // Position the tooltip near the mouse cursor
    tooltip.style.left = (e.clientX + 10) + 'px';
    tooltip.style.top = (e.clientY - 10) + 'px';
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.zoomSliderValue = Math.max(0, Math.min(100, this.zoomSliderValue - e.deltaY * 0.035));
    this.camDistTarget = this.zoomSliderToCamDist(this.zoomSliderValue);
  }

  private onClick(e: MouseEvent): void {
    if (this.dragMoved) return;
    const ping = this.findPingAtEvent(e);
    if (!ping) {
      this.flightArcs = [];
      return;
    }

    const allPings = this.getAllPings();
    const sameLocationPings = allPings.filter(p =>
      Math.abs(p.lat - ping.lat) < 0.001 && Math.abs(p.lon - ping.lon) < 0.001
    );

    if (sameLocationPings.length > 1) {
      this.selectedClusterPings = sameLocationPings;
      this.clusterLocationLabel = ping.label;
      this.showClusterPopup = true;
      this.focusPing(ping);
      return;
    }

    if (ping.source === 'news' && ping.newsPin) {
      this.selectedNewsPin = ping.newsPin;
      this.showNewsPopup = true;
      return;
    }

    if (ping.source === 'story' && ping.story) {
      this.selectedStory = ping.story;
      this.showStoryPopup = true;
      this.focusPing(ping);
      return;
    }

    if (ping.source === 'user' && ping.user) {
      this.selectedUser = ping.user;
      this.selectedUserPing = ping;
      this.showUserPopup = true;
      this.focusPing(ping);
      return;
    }

    const pingData = ping.data as any;
    if (pingData?.type === 'flight') {
      this.onFlightClick(ping);
      return;
    }
    this.focusPing(ping);
    this.pingClicked.emit({
      id: ping.id,
      label: ping.label,
      lat: ping.lat,
      lon: ping.lon,
      data: ping.data,
    });
  }

  private applyDrag(dx: number, dy: number): void {
    const h = this.globeCanvasRef.nativeElement.clientHeight || 600;
    const fov = 35 * Math.PI / 180;
    const f = 1.0 / Math.tan(fov / 2);
    const speed = 1.0 / ((h / 2) * f / this.camDist) * this.getDragSensitivityScale();
    const ax = dy * speed, ay = dx * speed;
    const cx = Math.cos(ax), sx = Math.sin(ax);
    const cy = Math.cos(ay), sy = Math.sin(ay);
    const Rx = new Float32Array([1, 0, 0, 0, cx, -sx, 0, sx, cx]);
    const Ry = new Float32Array([cy, 0, sy, 0, 1, 0, -sy, 0, cy]);
    this.rot = this.mul3(this.mul3(Ry, Rx), this.rot) as Float32Array<ArrayBuffer>;
  }

  private getDragSensitivityScale(): number {
    const tileZoom = this.camDistToTileZoom();
    if (tileZoom < this.SATELLITE_ZOOM_MIN) return 1;

    const zoomT = Math.min(
      1,
      (tileZoom - this.SATELLITE_ZOOM_MIN) / (this.SATELLITE_ZOOM_MAX - this.SATELLITE_ZOOM_MIN)
    );
    const surfaceT = 1 - Math.min(1, Math.max(0, (this.camDist - this.CAM_MIN) / 0.08));
    const closeScale = 0.16 - 0.11 * Math.max(zoomT, surfaceT);
    return Math.max(0.035, closeScale);
  }

  private checkPinHover(e: MouseEvent): void {
    const ping = this.findPingAtEvent(e);
    this.hoveredPin = ping ? { id: ping.id, label: ping.label, x: 0, y: 0 } : null;
    
    // Set hovered flight callsign if hovering over a flight
    if (ping && ping.data && (ping.data as any).type === 'flight') {
      this.hoveredFlightCallsign = (ping.data as any).callsign || ping.label;
    } else {
      this.hoveredFlightCallsign = null;
    }
  }

  private findPingAtEvent(e: MouseEvent): ResolvedGlobePing | null {
    const canvas = this.pinCanvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const w = canvas.width, h = canvas.height;
    let closest: { ping: ResolvedGlobePing; distance: number; x: number; y: number } | null = null;

    for (const ping of this.getAllPings()) {
      const proj = this.projectPin(ping.lat, ping.lon, w, h);
      if (!proj) continue;
      const dx = proj.x - mx, dy = proj.y - my;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 14 && (!closest || distance < closest.distance)) {
        closest = { ping, distance, x: proj.x, y: proj.y };
      }
    }

    if (closest) {
      this.hoveredPin = { id: closest.ping.id, label: closest.ping.label, x: closest.x, y: closest.y };
      return closest.ping;
    }

    // Clear the hover state if no ping is found
    this.hoveredPin = null;
    return null;
  }

  // =========================================================================
  // Slider ↔ camDist conversion
  // =========================================================================
  private syncSliderFromDist(): void {
    this.zoomSliderValue = Math.round(this.camDistToZoomSlider(this.camDistTarget));
  }
  private zoomSliderToCamDist(v: number): number {
    const t = Math.max(0, Math.min(100, v)) / 100;
    return 1 + (this.CAM_MAX - 1) * Math.pow((this.CAM_MIN - 1) / (this.CAM_MAX - 1), t);
  }
  private camDistToZoomSlider(dist: number): number {
    const s = Math.max(this.CAM_MIN - 1, Math.min(this.CAM_MAX - 1, dist - 1));
    return 100 * Math.log(s / (this.CAM_MAX - 1)) /
      Math.log((this.CAM_MIN - 1) / (this.CAM_MAX - 1));
  }

  // =========================================================================
  // Location helpers
  // =========================================================================
  private resolveStoryLocation(story: Story)
    : { lat: number; lon: number; label: string; precision: 'city' | 'country' } | null {
    const city = this.lookupCityCoords(story.city, story.country);
    if (city) return {
      lat: city[0], lon: city[1],
      label: this.formatLocationLabel(story.city, story.country),
      precision: 'city',
    };
    const country = this.lookupCoords(COUNTRY_COORDS, story.country);
    if (country && story.country)
      return { lat: country[0], lon: country[1], label: story.country, precision: 'country' };
    return null;
  }

  private lookupCityCoords(city?: string, country?: string): [number, number] | undefined {
    if (!city) return undefined;
    const tc = city.trim(), tco = country?.trim();
    const part = tc.split(',')[0]?.trim();
    const candidates = [
      tco ? `${tc}, ${tco}` : '', tc,
      part && tco ? `${part}, ${tco}` : '', part || '',
    ].filter(Boolean);
    for (const c of candidates) {
      const r = this.lookupCoords(CITY_COORDS, c);
      if (r) return r;
    }
    
    // Try substring/prefix matching — effective for "Montreal" → "Montreal, Quebec - Canada"
    const nPart = this.normalizeName(part || tc);
    if (nPart) {
      for (const [key, coords] of Object.entries(CITY_COORDS)) {
        const nKey = this.normalizeName(key);
        const keyCityPart = nKey.split(',')[0]?.trim();
        if (keyCityPart && (keyCityPart === nPart || keyCityPart.startsWith(nPart) || keyCityPart.includes(nPart))) {
          return coords;
        }
        if (nKey.includes(nPart)) return coords;
      }
    }

    // If no exact match, try fuzzy matching on the city name without country
    if (tc) {
      const fuzzyMatch = this.fuzzyLookupCity(CITY_COORDS, tc);
      if (fuzzyMatch) return fuzzyMatch;
    }
    
    // If country is provided, try to match with just the country name
    if (tco) {
      const countryMatch = this.lookupCoords(COUNTRY_COORDS, tco);
      if (countryMatch) {
        const citiesWithCountry = Object.keys(CITY_COORDS).filter(cityKey => 
          cityKey.includes(tco) || cityKey.includes(this.normalizeName(tco))
        );
        if (citiesWithCountry.length > 0) {
          // Use substring/prefix matching against city part
          const nSearch = this.normalizeName(part || tc);
          for (const key of citiesWithCountry) {
            const nKey = this.normalizeName(key);
            const keyCityPart = nKey.split(',')[0]?.trim();
            if (keyCityPart && (keyCityPart === nSearch || keyCityPart.startsWith(nSearch) || keyCityPart.includes(nSearch))) {
              return CITY_COORDS[key];
            }
          }
          // Fallback: return the first city in the matched country
          return CITY_COORDS[citiesWithCountry[0]];
        }
      }
    }
    
    return undefined;
  }

private lookupCoords(map: Record<string, [number, number]>, name?: string)
    : [number, number] | undefined {
    if (!name) return undefined;
    const t = name.trim();
    if (map[t]) return map[t];
    const n = this.normalizeName(t);
    // Try exact match first, then fuzzy match
    const exactMatch = Object.entries(map).find(([k]) => this.normalizeName(k) === n)?.[1];
    if (exactMatch) return exactMatch;
    
    // If no exact match, try fuzzy matching for city names
    if (map === CITY_COORDS) {
      return this.fuzzyLookupCity(map, t);
    }
    
    return undefined;
  }



  private fuzzyLookupCity(map: Record<string, [number, number]>, name: string): [number, number] | undefined {
    const threshold = 0.4; // Lowered threshold — Levenshtein is harsh on prefix/substring matches
    
    const normalizedSearch = this.normalizeName(name);
    const searchCityPart = normalizedSearch.split(',')[0]?.trim();
    
    // First try substring/prefix matching (much more effective for partial matches)
    if (searchCityPart) {
      for (const [key, coords] of Object.entries(map)) {
        const nKey = this.normalizeName(key);
        const keyCityPart = nKey.split(',')[0]?.trim();
        if (keyCityPart && (keyCityPart === searchCityPart || keyCityPart.startsWith(searchCityPart) || keyCityPart.includes(searchCityPart))) {
          return coords;
        }
      }
    }
    
    // Fallback to Levenshtein-based similarity
    const matches = Object.keys(map).map(cityKey => {
      const normalizedCity = this.normalizeName(cityKey);
      const similarity = this.calculateSimilarity(normalizedSearch, normalizedCity);
      return { city: cityKey, similarity };
    }).filter(match => match.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity);
    
    if (matches.length > 0) {
      return map[matches[0].city];
    }
    
    return undefined;
  }
  
  private calculateSimilarity(s1: string, s2: string): number {
    // Using a simple Levenshtein distance ratio approach
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    if (longer.length === 0) {
      return 1.0;
    }
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }
  
  private levenshteinDistance(s1: string, s2: string): number {
    // Simple implementation of Levenshtein distance algorithm
    if (s1.length < s2.length) {
      return this.levenshteinDistance(s2, s1);
    }
    
    const row = Array(s2.length + 1).fill(0);
    for (let j = 0; j < row.length; j++) {
      row[j] = j;
    }
    
    for (let i = 1; i <= s1.length; i++) {
      let prev = i - 1;
      for (let j = 0; j < s2.length; j++) {
        let val;
        if (s1[i - 1] === s2[j]) {
          val = prev;
        } else {
          val = Math.min(
            row[j],
            row[j + 1],
            prev
          ) + 1;
        }
        prev = row[j + 1];
        row[j + 1] = val;
      }
    }
    
    return row[s2.length];
  } 

  private normalizeName(s: string): string {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s*,\s*/g, ', ')
      .replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private titleCase(s: string): string {
    if (!s) return s;
    return s.replace(/_/g, ' ')
      .split(/[\s\-\/ ,]+/)
      .map(w => w ? (w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()) : '')
      .filter(Boolean)
      .join(' ');
  }

  private formatCityLabelFromKey(key: string): string {
    const parts = key.split(',').map(p => p.trim()).filter(Boolean);
    const name = this.titleCase(parts[0]);
    if (parts.length === 1) return name;
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i];
      const countryMatch = Object.keys(COUNTRY_COORDS).find(c => this.normalizeName(c) === this.normalizeName(p));
      if (countryMatch) return `${name}, ${countryMatch}`;
    }
    const canadianProvinces = ['Ontario', 'Quebec', 'British Columbia', 'Alberta', 'Manitoba', 'Saskatchewan', 'Nova Scotia', 'New Brunswick', 'Newfoundland and Labrador', 'Prince Edward Island', 'Northwest Territories', 'Yukon', 'Nunavut',
      'on','qc','bc','ab','mb','sk','ns','nb','nl','pe','nt','yt','nu'];
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i];
      if (canadianProvinces.map(x => this.normalizeName(x)).includes(this.normalizeName(p))) return `${name}, Canada`;
    }
    const rest = parts.slice(1).map(p => this.titleCase(p)).join(', ');
    return `${name}${rest ? ', ' + rest : ''}`;
  }

  formatLocationLabel(city?: string, country?: string): string {
    const c = city?.trim(), co = country?.trim();
    return (c && co) ? `${c}, ${co}` : c || co || 'Unknown location';
  }

  // =========================================================================
  // Matrix helpers (row-major 3×3)
  // =========================================================================
  private mul3(a: Float32Array, b: Float32Array): Float32Array {
    const r = new Float32Array(9);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    return r;
  }

  @HostListener('document:mouseup')
  onDocMouseUp(): void { this.isDragging = false; }
}
