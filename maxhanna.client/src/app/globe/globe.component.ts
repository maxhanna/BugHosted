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
  showCityCoords = true;
  showCountryCoords = true;
  @Input() set pings(value: GlobePing[] | null | undefined) {
    this.customPings = Array.isArray(value) ? value : [];
  }
  @Input() arcs: Arc[] = [];
  @Input() inputtedParentRef: any;
  @Output() isLoadingEvent = new EventEmitter<boolean>();
  @Output() pingClicked = new EventEmitter<GlobePing>();

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
  private activePingId: string | null = null;
  private pingTourTimer: ReturnType<typeof setInterval> | null = null;
  private pingTourIndex = 0;

  // ---- flight pins ---------------------------------------------------------
  trackedFlights: TrackedFlight[] = [];
  allFlightStates: any[] = [];
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

  // ---- country / city coords ----------------------------------------------
  private readonly COUNTRY_COORDS: Record<string, [number, number]> = { "Afghanistan": [33.94, 67.71], "Albania": [41.15, 20.17], "Algeria": [28.03, 1.66], "Andorra": [42.51, 1.52], "Angola": [-11.20, 17.87], "Antigua and Barbuda": [17.06, -61.80], "Argentina": [-38.42, -63.62], "Armenia": [40.07, 45.04], "Australia": [-25.27, 133.77], "Austria": [47.52, 14.55], "Azerbaijan": [40.14, 47.58], "Bahamas": [25.03, -77.40], "Bahrain": [26.07, 50.55], "Bangladesh": [23.68, 90.36], "Barbados": [13.19, -59.54], "Belarus": [53.71, 27.95], "Belgium": [50.50, 4.47], "Belize": [17.19, -88.50], "Benin": [9.31, 2.32], "Bhutan": [27.51, 90.43], "Bolivia": [-16.29, -63.59], "Bosnia and Herzegovina": [43.92, 17.68], "Botswana": [-22.33, 24.68], "Brazil": [-14.24, -51.93], "Brunei": [4.54, 114.73], "Bulgaria": [42.73, 25.49], "Burkina Faso": [12.24, -1.56], "Burundi": [-3.37, 29.92], "Cabo Verde": [16.00, -24.01], "Cambodia": [12.57, 104.99], "Cameroon": [7.37, 12.35], "Canada": [56.13, -106.35], "Central African Republic": [6.61, 20.94], "Chad": [15.45, 18.73], "Chile": [-35.68, -71.54], "China": [35.86, 104.20], "Colombia": [4.57, -74.30], "Comoros": [-11.88, 43.87], "Congo (Republic)": [-0.23, 15.83], "Congo (DRC)": [-4.04, 21.76], "Costa Rica": [9.75, -83.75], "Croatia": [45.10, 15.20], "Cuba": [21.52, -77.78], "Cyprus": [35.13, 33.43], "Czech Republic": [49.82, 15.47], "Denmark": [56.26, 9.50], "Djibouti": [11.83, 42.59], "Dominica": [15.41, -61.37], "Dominican Republic": [18.74, -70.16], "Ecuador": [-1.83, -78.18], "Egypt": [26.82, 30.80], "El Salvador": [13.79, -88.90], "Equatorial Guinea": [1.65, 10.27], "Eritrea": [15.18, 39.78], "Estonia": [58.60, 25.01], "Eswatini": [-26.52, 31.47], "Ethiopia": [9.15, 40.49], "Fiji": [-17.71, 178.07], "Finland": [61.92, 25.75], "France": [46.23, 2.21], "Gabon": [-0.80, 11.61], "Gambia": [13.44, -15.31], "Georgia": [42.32, 43.36], "Germany": [51.17, 10.45], "Ghana": [7.95, -1.02], "Greece": [39.07, 21.82], "Grenada": [12.12, -61.68], "Guatemala": [15.78, -90.23], "Guinea": [9.95, -9.70], "Guinea-Bissau": [11.80, -15.18], "Guyana": [4.86, -58.93], "Haiti": [18.97, -72.29], "Honduras": [15.20, -86.24], "Hungary": [47.16, 19.50], "Iceland": [64.96, -19.02], "India": [20.59, 78.96], "Indonesia": [-0.79, 113.92], "Iran": [32.43, 53.69], "Iraq": [33.22, 43.68], "Ireland": [53.41, -8.24], "Israel": [31.05, 34.85], "Italy": [41.87, 12.57], "Jamaica": [18.11, -77.30], "Japan": [36.20, 138.25], "Jordan": [30.59, 36.24], "Kazakhstan": [48.02, 66.92], "Kenya": [-0.02, 37.91], "Kiribati": [1.87, -157.36], "Kuwait": [29.31, 47.48], "Kyrgyzstan": [41.20, 74.77], "Laos": [19.86, 102.50], "Latvia": [56.88, 24.60], "Lebanon": [33.85, 35.86], "Lesotho": [-29.61, 28.23], "Liberia": [6.43, -9.43], "Libya": [26.34, 17.23], "Liechtenstein": [47.17, 9.56], "Lithuania": [55.17, 23.88], "Luxembourg": [49.82, 6.13], "Madagascar": [-18.77, 46.87], "Malawi": [-13.25, 34.30], "Malaysia": [4.21, 101.98], "Maldives": [3.20, 73.22], "Mali": [17.57, -3.99], "Malta": [35.94, 14.38], "Marshall Islands": [7.13, 171.18], "Mauritania": [21.01, -10.94], "Mauritius": [-20.35, 57.55], "Mexico": [23.63, -102.55], "Micronesia": [7.43, 150.55], "Moldova": [47.41, 28.37], "Monaco": [43.74, 7.42], "Mongolia": [46.86, 103.84], "Montenegro": [42.71, 19.37], "Morocco": [31.79, -7.09], "Mozambique": [-18.67, 35.53], "Myanmar": [21.92, 95.96], "Namibia": [-22.56, 17.07], "Nauru": [-0.52, 166.93], "Nepal": [28.39, 84.12], "Netherlands": [52.13, 5.29], "New Zealand": [-40.90, 174.89], "Nicaragua": [12.87, -85.21], "Niger": [17.61, 8.08], "Nigeria": [9.08, 8.68], "North Korea": [40.34, 127.51], "North Macedonia": [41.61, 21.75], "Norway": [60.47, 8.47], "Oman": [21.47, 55.98], "Pakistan": [30.38, 69.35], "Palau": [7.52, 134.58], "Panama": [8.54, -80.78], "Papua New Guinea": [-6.31, 143.96], "Paraguay": [-23.44, -58.44], "Peru": [-9.19, -75.02], "Philippines": [12.88, 121.77], "Poland": [51.92, 19.15], "Portugal": [39.40, -8.22], "Qatar": [25.35, 51.18], "Romania": [45.94, 24.97], "Russia": [61.52, 105.32], "Rwanda": [-1.94, 29.87], "Saint Kitts and Nevis": [17.36, -62.78], "Saint Lucia": [13.91, -60.98], "Saint Vincent and the Grenadines": [12.98, -61.29], "Samoa": [-13.76, -172.10], "San Marino": [43.94, 12.46], "Sao Tome and Principe": [0.19, 6.61], "Saudi Arabia": [23.89, 45.08], "Senegal": [14.50, -14.45], "Serbia": [44.02, 21.01], "Seychelles": [-4.68, 55.49], "Sierra Leone": [8.46, -11.78], "Singapore": [1.35, 103.82], "Slovakia": [48.67, 19.70], "Slovenia": [46.15, 14.99], "Solomon Islands": [-9.65, 160.16], "Somalia": [5.15, 46.20], "South Africa": [-30.56, 22.94], "South Korea": [35.91, 127.76], "South Sudan": [6.88, 31.31], "Spain": [40.46, -3.75], "Sri Lanka": [7.87, 80.77], "Sudan": [12.86, 30.22], "Suriname": [3.92, -56.03], "Sweden": [60.13, 18.64], "Switzerland": [46.82, 8.23], "Syria": [34.80, 38.99], "Taiwan": [23.70, 120.96], "Tajikistan": [38.86, 71.28], "Tanzania": [-6.37, 34.89], "Thailand": [15.87, 100.99], "Timor-Leste": [-8.87, 125.73], "Togo": [8.62, 0.82], "Tonga": [-21.18, -175.20], "Trinidad and Tobago": [10.69, -61.22], "Tunisia": [33.89, 9.54], "Turkey": [38.96, 35.24], "Turkmenistan": [38.97, 59.56], "Tuvalu": [-7.11, 177.65], "Uganda": [1.37, 32.29], "Ukraine": [48.38, 31.17], "United Arab Emirates": [23.42, 53.85], "United Kingdom": [55.38, -3.44], "United States": [37.09, -95.71], "Uruguay": [-32.52, -55.77], "Uzbekistan": [41.38, 64.59], "Vanuatu": [-15.38, 166.96], "Vatican City": [41.90, 12.45], "Venezuela": [6.42, -66.59], "Vietnam": [14.06, 108.28], "Yemen": [15.55, 48.52], "Zambia": [-13.13, 27.85], "Zimbabwe": [-19.02, 29.15] };
  
  private readonly CITY_COORDS: Record<string, [number, number]> = { 'New York, New York – USA': [40.7128, -74.0060], 'Los Angeles, California – USA': [34.0522, -118.2437], 'Chicago, Illinois – USA': [41.8781, -87.6298], 'London, England – United Kingdom': [51.5074, -0.1278], 'Paris, Île-de-France – France': [48.8566, 2.3522], 'Berlin, Berlin – Germany': [52.5200, 13.4050], 'Tokyo, Tokyo Prefecture – Japan': [35.6762, 139.6503], 'Sydney, New South Wales – Australia': [-33.8688, 151.2093], 'Toronto, Ontario – Canada': [43.6532, -79.3832], 'Montréal, Québec – Canada': [45.5017, -73.5673], 'Vancouver, British Columbia – Canada': [49.2827, -123.1207], 'Ottawa, Ontario – Canada': [45.4215, -75.6972], 'Québec City, Québec – Canada': [46.8139, -71.2080], 'Calgary, Alberta – Canada': [51.0447, -114.0719], 'Edmonton, Alberta – Canada': [53.5461, -113.4938], 'Winnipeg, Manitoba – Canada': [49.8951, -97.1384], 'Halifax, Nova Scotia – Canada': [44.6488, -63.5752], 'San Francisco, California – USA': [37.7749, -122.4194], 'Seattle, Washington – USA': [47.6062, -122.3321], 'Miami, Florida – USA': [25.7617, -80.1918], 'Boston, Massachusetts – USA': [42.3601, -71.0589], 'Dubai, Dubai – United Arab Emirates': [25.2048, 55.2708], 'Singapore, Singapore – Singapore': [1.3521, 103.8198], 'Hong Kong, Hong Kong – China': [22.3193, 114.1694], 'Mumbai, Maharashtra – India': [19.0760, 72.8777], 'Delhi, Delhi – India': [28.7041, 77.1025], 'São Paulo, São Paulo – Brazil': [-23.5505, -46.6333], 'Mexico City, Mexico City – Mexico': [19.4326, -99.1332], 'Buenos Aires, Buenos Aires – Argentina': [-34.6037, -58.3816], 'Moscow, Moscow – Russia': [55.7558, 37.6173], 'Washington, DC – USA': [38.9072, -77.0369], 'Philadelphia, Pennsylvania – USA': [39.9526, -75.1652], 'Atlanta, Georgia – USA': [33.7490, -84.3880], 'Dallas, Texas – USA': [32.7767, -96.7970], 'Houston, Texas – USA': [29.7604, -95.3698], 'Austin, Texas – USA': [30.2672, -97.7431], 'Denver, Colorado – USA': [39.7392, -104.9903], 'Phoenix, Arizona – USA': [33.4484, -112.0740], 'Las Vegas, Nevada – USA': [36.1699, -115.1398], 'Portland, Oregon – USA': [45.5152, -122.6784], 'San Diego, California – USA': [32.7157, -117.1611], 'Minneapolis, Minnesota – USA': [44.9778, -93.2650], 'Detroit, Michigan – USA': [42.3314, -83.0458], 'Cleveland, Ohio – USA': [41.4993, -81.6944], 'Pittsburgh, Pennsylvania – USA': [40.4406, -79.9959], 'Charlotte, North Carolina – USA': [35.2271, -80.8431], 'Nashville, Tennessee – USA': [36.1627, -86.7816], 'New Orleans, Louisiana – USA': [29.9511, -90.0715], 'Orlando, Florida – USA': [28.5383, -81.3792], 'Tampa, Florida – USA': [27.9506, -82.4572], 'Salt Lake City, Utah – USA': [40.7608, -111.8910], 'Kansas City, Missouri – USA': [39.0997, -94.5786], 'St. Louis, Missouri – USA': [38.6270, -90.1994], 'San Antonio, Texas – USA': [29.4241, -98.4936], 'Columbus, Ohio – USA': [39.9612, -82.9988], 'Indianapolis, Indiana – USA': [39.7684, -86.1581], 'Milwaukee, Wisconsin – USA': [43.0389, -87.9065], 'Cincinnati, Ohio – USA': [39.1031, -84.5120], 'Raleigh, North Carolina – USA': [35.7796, -78.6382], 'Baltimore, Maryland – USA': [39.2904, -76.6122], 'Anchorage, Alaska – USA': [61.2181, -149.9003], 'Honolulu, Hawaii – USA': [21.3099, -157.8581], 'Hamilton, Ontario – Canada': [43.2557, -79.8711], 'Mississauga, Ontario – Canada': [43.5890, -79.6441], 'Brampton, Ontario – Canada': [43.7315, -79.7624], 'Laval, Québec – Canada': [45.6066, -73.7124], 'Longueuil, Québec – Canada': [45.5312, -73.5181], 'Gatineau, Québec – Canada': [45.4765, -75.7013], 'Sherbrooke, Québec – Canada': [45.4042, -71.8929], 'Trois-Rivières, Québec – Canada': [46.3432, -72.5436], 'Kingston, Ontario – Canada': [44.2312, -76.4860], 'London, Ontario – Canada': [42.9849, -81.2453], 'Kitchener, Ontario – Canada': [43.4516, -80.4925], 'Waterloo, Ontario – Canada': [43.4643, -80.5204], 'Windsor, Ontario – Canada': [42.3149, -83.0364], 'Saskatoon, Saskatchewan – Canada': [52.1579, -106.6702], 'Regina, Saskatchewan – Canada': [50.4452, -104.6189], 'Victoria, British Columbia – Canada': [48.4284, -123.3656], 'Kelowna, British Columbia – Canada': [49.8880, -119.4960], 'St. John\'s, Newfoundland and Labrador – Canada': [47.5615, -52.7126], 'Fredericton, New Brunswick – Canada': [45.9636, -66.6431], 'Moncton, New Brunswick – Canada': [46.0878, -64.7782], 'Charlottetown, Prince Edward Island – Canada': [46.2382, -63.1311], 'Yellowknife, Northwest Territories – Canada': [62.4540, -114.3718], 'Whitehorse, Yukon – Canada': [60.7212, -135.0568], 'Iqaluit, Nunavut – Canada': [63.7467, -68.5170], 'Dublin, Leinster – Ireland': [53.3498, -6.2603], 'Edinburgh, Scotland – United Kingdom': [55.9533, -3.1883], 'Glasgow, Scotland – United Kingdom': [55.8642, -4.2518], 'Manchester, England – United Kingdom': [53.4808, -2.2426], 'Birmingham, England – United Kingdom': [52.4862, -1.8904], 'Liverpool, England – United Kingdom': [53.4084, -2.9916], 'Bristol, England – United Kingdom': [51.4545, -2.5879], 'Cardiff, Wales – United Kingdom': [51.4816, -3.1791], 'Belfast, Northern Ireland – United Kingdom': [54.5973, -5.9301], 'Amsterdam, North Holland – Netherlands': [52.3676, 4.9041], 'Rotterdam, South Holland – Netherlands': [51.9244, 4.4777], 'Brussels, Brussels-Capital Region – Belgium': [50.8503, 4.3517], 'Antwerp, Flanders – Belgium': [51.2194, 4.4025], 'Zürich, Zürich – Switzerland': [47.3769, 8.5417], 'Geneva, Geneva – Switzerland': [46.2044, 6.1432], 'Vienna, Vienna – Austria': [48.2082, 16.3738], 'Prague, Prague – Czech Republic': [50.0755, 14.4378], 'Warsaw, Masovian – Poland': [52.2297, 21.0122], 'Kraków, Lesser Poland – Poland': [50.0647, 19.9450], 'Budapest, Central Hungary – Hungary': [47.4979, 19.0402], 'Bucharest, Bucharest – Romania': [44.4268, 26.1025], 'Sofia, Sofia City – Bulgaria': [42.6977, 23.3219], 'Athens, Attica – Greece': [37.9838, 23.7275], 'Istanbul, Istanbul – Türkiye': [41.0082, 28.9784], 'Ankara, Ankara – Türkiye': [39.9334, 32.8597], 'Madrid, Community of Madrid – Spain': [40.4168, -3.7038], 'Barcelona, Catalonia – Spain': [41.3874, 2.1686], 'Lisbon, Lisbon – Portugal': [38.7223, -9.1393], 'Porto, Porto – Portugal': [41.1579, -8.6291], 'Rome, Lazio – Italy': [41.9028, 12.4964], 'Milan, Lombardy – Italy': [45.4642, 9.1900], 'Naples, Campania – Italy': [40.8518, 14.2681], 'Venice, Veneto – Italy': [45.4408, 12.3155], 'Florence, Tuscany – Italy': [43.7696, 11.2558], 'Munich, Bavaria – Germany': [48.1351, 11.5820], 'Hamburg, Hamburg – Germany': [53.5511, 9.9937], 'Cologne, North Rhine-Westphalia – Germany': [50.9375, 6.9603], 'Frankfurt, Hesse – Germany': [50.1109, 8.6821], 'Copenhagen, Capital Region – Denmark': [55.6761, 12.5683], 'Stockholm, Stockholm – Sweden': [59.3293, 18.0686], 'Oslo, Oslo – Norway': [59.9139, 10.7522], 'Helsinki, Uusimaa – Finland': [60.1699, 24.9384], 'Reykjavík, Capital Region – Iceland': [64.1466, -21.9426], 'Tallinn, Harju County – Estonia': [59.4370, 24.7536], 'Riga, Riga – Latvia': [56.9496, 24.1052], 'Vilnius, Vilnius County – Lithuania': [54.6872, 25.2797], 'Kyiv, Kyiv – Ukraine': [50.4501, 30.5234], 'Zagreb, City of Zagreb – Croatia': [45.8150, 15.9819], 'Belgrade, Belgrade – Serbia': [44.7866, 20.4489], 'Sarajevo, Sarajevo Canton – Bosnia and Herzegovina': [43.8563, 18.4131], 'Dubrovnik, Dubrovnik-Neretva – Croatia': [42.6507, 18.0944], 'Osaka, Osaka Prefecture – Japan': [34.6937, 135.5023], 'Kyoto, Kyoto Prefecture – Japan': [35.0116, 135.7681], 'Yokohama, Kanagawa – Japan': [35.4437, 139.6380], 'Seoul, Seoul Special City – South Korea': [37.5665, 126.9780], 'Busan, Busan – South Korea': [35.1796, 129.0756], 'Beijing, Beijing Municipality – China': [39.9042, 116.4074], 'Shanghai, Shanghai Municipality – China': [31.2304, 121.4737], 'Shenzhen, Guangdong – China': [22.5431, 114.0579], 'Guangzhou, Guangdong – China': [23.1291, 113.2644], 'Taipei, Taipei – Taiwan': [25.0330, 121.5654], 'Bangkok, Bangkok – Thailand': [13.7563, 100.5018], 'Hanoi, Hanoi – Vietnam': [21.0278, 105.8342], 'Ho Chi Minh City, Ho Chi Minh – Vietnam': [10.8231, 106.6297], 'Kuala Lumpur, Kuala Lumpur – Malaysia': [3.1390, 101.6869], 'Jakarta, Jakarta – Indonesia': [-6.2088, 106.8456], 'Manila, Metro Manila – Philippines': [14.5995, 120.9842], 'Cebu, Central Visayas – Philippines': [10.3157, 123.8854], 'Phnom Penh, Phnom Penh – Cambodia': [11.5564, 104.9282], 'Vientiane, Vientiane Prefecture – Laos': [17.9757, 102.6331], 'Yangon, Yangon Region – Myanmar': [16.8409, 96.1735], 'Dhaka, Dhaka – Bangladesh': [23.8103, 90.4125], 'Karachi, Sindh – Pakistan': [24.8607, 67.0011], 'Lahore, Punjab – Pakistan': [31.5204, 74.3587], 'Islamabad, Islamabad Capital Territory – Pakistan': [33.6844, 73.0479], 'Kolkata, West Bengal – India': [22.5726, 88.3639], 'Bengaluru, Karnataka – India': [12.9716, 77.5946], 'Chennai, Tamil Nadu – India': [13.0827, 80.2707], 'Hyderabad, Telangana – India': [17.3850, 78.4867], 'Pune, Maharashtra – India': [18.5204, 73.8567], 'Ahmedabad, Gujarat – India': [23.0225, 72.5714], 'Cairo, Cairo – Egypt': [30.0444, 31.2357], 'Alexandria, Alexandria – Egypt': [31.2001, 29.9187], 'Casablanca, Casablanca-Settat – Morocco': [33.5731, -7.5898], 'Marrakesh, Marrakesh-Safi – Morocco': [31.6295, -7.9811], 'Algiers, Algiers – Algeria': [36.7538, 3.0588], 'Tunis, Tunis – Tunisia': [36.8065, 10.1815], 'Lagos, Lagos – Nigeria': [6.5244, 3.3792], 'Abuja, Federal Capital Territory – Nigeria': [9.0765, 7.3986], 'Accra, Greater Accra – Ghana': [5.6037, -0.1870], 'Nairobi, Nairobi – Kenya': [-1.2921, 36.8219], 'Addis Ababa, Addis Ababa – Ethiopia': [8.9806, 38.7578], 'Kampala, Central Region – Uganda': [0.3476, 32.5825], 'Kigali, Kigali – Rwanda': [-1.9441, 30.0619], 'Dar es Salaam, Dar es Salaam – Tanzania': [-6.7924, 39.2083], 'Johannesburg, Gauteng – South Africa': [-26.2041, 28.0473], 'Cape Town, Western Cape – South Africa': [-33.9249, 18.4241], 'Durban, KwaZulu-Natal – South Africa': [-29.8587, 31.0218], 'Doha, Doha – Qatar': [25.2854, 51.5310], 'Riyadh, Riyadh – Saudi Arabia': [24.7136, 46.6753], 'Jeddah, Mecca – Saudi Arabia': [21.4858, 39.1925], 'Tel Aviv, Tel Aviv – Israel': [32.0853, 34.7818], 'Jerusalem, Jerusalem – Israel': [31.7683, 35.2137], 'Beirut, Beirut – Lebanon': [33.8938, 35.5018], 'Amman, Amman – Jordan': [31.9539, 35.9106], 'Baghdad, Baghdad – Iraq': [33.3152, 44.3661], 'Tehran, Tehran – Iran': [35.6892, 51.3890], 'Melbourne, Victoria – Australia': [-37.8136, 144.9631], 'Brisbane, Queensland – Australia': [-27.4698, 153.0251], 'Perth, Western Australia – Australia': [-31.9523, 115.8613], 'Adelaide, South Australia – Australia': [-34.9285, 138.6007], 'Canberra, Australian Capital Territory – Australia': [-35.2809, 149.1300], 'Auckland, Auckland – New Zealand': [-36.8485, 174.7633], 'Wellington, Wellington – New Zealand': [-41.2865, 174.7762], 'Christchurch, Canterbury – New Zealand': [-43.5321, 172.6362], 'Rio de Janeiro, Rio de Janeiro – Brazil': [-22.9068, -43.1729], 'Brasília, Federal District – Brazil': [-15.7939, -47.8828], 'Salvador, Bahia – Brazil': [-12.9777, -38.5016], 'Recife, Pernambuco – Brazil': [-8.0476, -34.8770], 'Lima, Lima – Peru': [-12.0464, -77.0428], 'Bogotá, Bogotá – Colombia': [4.7110, -74.0721], 'Medellín, Antioquia – Colombia': [6.2442, -75.5812], 'Santiago, Santiago Metropolitan – Chile': [-33.4489, -70.6693], 'Montevideo, Montevideo – Uruguay': [-34.9011, -56.1645], 'Quito, Pichincha – Ecuador': [-0.1807, -78.4678], 'Guayaquil, Guayas – Ecuador': [-2.1700, -79.9224], 'Caracas, Capital District – Venezuela': [10.4806, -66.9036], 'Panama City, Panamá – Panama': [8.9824, -79.5199], 'San José, San José – Costa Rica': [9.9281, -84.0907], 'Havana, La Habana – Cuba': [23.1136, -82.3666], 'Kingston, Surrey – Jamaica': [17.9712, -76.7936], 'Santo Domingo, Distrito Nacional – Dominican Republic': [18.4861, -69.9312], 'Saint-Hubert, Québec – Canada': [45.5500, -73.5000], 'Bromont, Québec – Canada': [45.2742, -72.4958], 'Laval-des-Rapides, Québec – Canada': [45.5761, -73.6784], 'Beaconsfield, Québec – Canada': [45.4473, -73.9036], 'Pointe-Claire, Québec – Canada': [45.4608, -73.8350], 'Dorval, Québec – Canada': [45.4445, -73.7404], 'Boucherville, Québec – Canada': [45.6080, -73.4887], 'Blainville, Québec – Canada': [45.6420, -73.8952], 'Saint-Jérôme, Québec – Canada': [45.7756, -74.0032], 'Victoriaville, Québec – Canada': [46.0520, -71.9611], 'Niagara Falls, Ontario – Canada': [43.0896, -79.0849], 'Oakville, Ontario – Canada': [43.4675, -79.6877], 'St. Catharines, Ontario – Canada': [43.1594, -79.2469], 'Albany, New York – USA': [42.6526, -73.7562], 'Syracuse, New York – USA': [43.0481, -76.1474], 'Rochester, New York – USA': [43.1566, -77.6088], 'Buffalo, New York – USA': [42.8864, -78.8784], 'Hartford, Connecticut – USA': [41.7658, -72.6734], 'Springfield, Illinois – USA': [39.7817, -89.6501], 'Wichita, Kansas – USA': [37.6872, -97.3301], 'Topeka, Kansas – USA': [39.0473, -95.6752], 'Lincoln, Nebraska – USA': [40.8136, -96.7026], 'Omaha, Nebraska – USA': [41.2565, -95.9345], 'Louisville, Kentucky – USA': [38.2527, -85.7585], 'Lexington, Kentucky – USA': [38.0406, -84.5037], 'Birmingham, Alabama – USA': [33.5186, -86.8104], 'Mobile, Alabama – USA': [30.6954, -88.0399], 'Tulsa, Oklahoma – USA': [36.1539, -95.9928], 'Oklahoma City, Oklahoma – USA': [35.4676, -97.5164], 'Little Rock, Arkansas – USA': [34.7465, -92.2896], 'Newark, New Jersey – USA': [40.7357, -74.1724], 'Jersey City, New Jersey – USA': [40.7178, -74.0431], 'Paterson, New Jersey – USA': [40.9168, -74.1718], 'Lyon, Auvergne-Rhône-Alpes – France': [45.7640, 4.8357], 'Marseille, Provence-Alpes-Côte d\'Azur – France': [43.2965, 5.3698], 'Toulouse, Occitanie – France': [43.6047, 1.4442], 'Nice, Provence-Alpes-Côte d\'Azur – France': [43.7102, 7.2620], 'Bordeaux, Nouvelle-Aquitaine – France': [44.8378, -0.5792], 'Strasbourg, Grand Est – France': [48.5734, 7.7521], 'Amersfoort, Utrecht – Netherlands': [52.1561, 5.3878], 'Utrecht, Utrecht – Netherlands': [52.0907, 5.1214], 'Ghent, Flanders – Belgium': [51.0543, 3.7174], 'Leuven, Flanders – Belgium': [50.8798, 4.7005], 'Tampere, Pirkanmaa – Finland': [61.4981, 23.7600], 'Turku, Southwest Finland – Finland': [60.4518, 22.2666], 'Bergen, Vestland – Norway': [60.3913, 5.3221], 'Trondheim, Trøndelag – Norway': [63.4305, 10.3951], 'Malmö, Skåne – Sweden': [55.6050, 13.0038], 'Nagoya, Aichi – Japan': [35.1815, 136.9066], 'Sapporo, Hokkaido – Japan': [43.0618, 141.3545], 'Fukuoka, Fukuoka – Japan': [33.5904, 130.4017], 'Hiroshima, Hiroshima – Japan': [34.3853, 132.4553], 'Bandung, West Java – Indonesia': [-6.9147, 107.6098], 'Surabaya, East Java – Indonesia': [-7.2575, 112.7521], 'Medan, North Sumatra – Indonesia': [3.5952, 98.6722], 'Semarang, Central Java – Indonesia': [-6.9667, 110.4167], 'Yogyakarta, Special Region of Yogyakarta – Indonesia': [-7.8014, 110.3643], 'Jaipur, Rajasthan – India': [26.9124, 75.7873], 'Lucknow, Uttar Pradesh – India': [26.8467, 80.9462], 'Kanpur, Uttar Pradesh – India': [26.4499, 80.3319], 'Indore, Madhya Pradesh – India': [22.7196, 75.8577], 'Nagpur, Maharashtra – India': [21.1458, 79.0882], 'Coimbatore, Tamil Nadu – India': [11.0168, 76.9558], 'Rabat, Rabat-Salé-Kénitra – Morocco': [34.0209, -6.8417], 'Marrakech, Marrakesh-Safi – Morocco': [31.6295, -7.9811], 'Fes, Fès-Meknès – Morocco': [34.0331, -5.0000], 'Dakar, Dakar – Senegal': [14.7167, -17.4677], 'Ouagadougou, Centre – Burkina Faso': [12.3714, -1.5197], 'Bamako, Bamako – Mali': [12.6392, -8.0029], 'Kumasi, Ashanti – Ghana': [6.6885, -1.6244], 'Monrovia, Montserrado – Liberia': [6.3005, -10.7969], 'Freetown, Western Area – Sierra Leone': [8.4657, -13.2317], 'Porto Alegre, Rio Grande do Sul – Brazil': [-30.0277, -51.2287], 'Curitiba, Paraná – Brazil': [-25.4284, -49.2733], 'Fortaleza, Ceará – Brazil': [-3.7172, -38.5433], 'Belo Horizonte, Minas Gerais – Brazil': [-19.9167, -43.9345], 'Valparaíso, Valparaíso – Chile': [-33.0472, -71.6127], 'Concepción, Biobío – Chile': [-36.8201, -73.0444], 'Antofagasta, Antofagasta – Chile': [-23.6500, -70.4000], 'La Paz, La Paz – Bolivia': [-16.5000, -68.1500], 'Sucre, Chuquisaca – Bolivia': [-19.0333, -65.2627], 'Cali, Valle del Cauca – Colombia': [3.4516, -76.5320], 'Barranquilla, Atlántico – Colombia': [10.9685, -74.7813], 'Nepean, Ontario – Canada': [45.3543, -75.7416], 'Verdun, Québec – Canada': [45.4596, -73.5719], 'Burnaby, British Columbia – Canada': [49.2488, -122.9805], 'Bacolod, Western Visayas – Philippines': [10.6711, 122.9502], 'Bacolod City, Western Visayas – Philippines': [10.6711, 122.9502], 'Lanús, Buenos Aires – Argentina': [-34.7025, -58.3954], 'Padang, West Sumatra – Indonesia': [-0.9471, 100.4172], 'Dollard-des-Ormeaux, Québec – Canada': [45.4944, -73.8238], 'Słupsk, Pomerania – Poland': [54.4641, 17.0285], 'Moss, Viken – Norway': [59.4341, 10.6576], 'Cottbus, Brandenburg – Germany': [51.7563, 14.3329], 'Arnhem, Gelderland – Netherlands': [51.9851, 5.8987], 'Albuquerque, New Mexico – USA': [35.0845, -106.6511], 'Tucson, Arizona – USA': [32.2226, -110.9747], 'El Paso, Texas – USA': [31.7619, -106.4850], 'Boise, Idaho – USA': [43.6150, -116.2023], 'Spokane, Washington – USA': [47.6588, -117.4260], 'Sacramento, California – USA': [38.5816, -121.4944], 'Fresno, California – USA': [36.7378, -119.7871], 'Riverside, California – USA': [33.9533, -117.3961], 'Tampa Bay Area (St. Petersburg), Florida – USA': [27.7709, -82.6695], 'Memphis, Tennessee – USA': [35.1495, -90.0490], 'Prince Albert, Saskatchewan – Canada': [53.2033, -105.7558], 'Red Deer, Alberta – Canada': [52.2681, -113.8112], 'Lethbridge, Alberta – Canada': [49.6960, -112.8450], 'Medicine Hat, Alberta – Canada': [50.0417, -110.6764], 'Thunder Bay, Ontario – Canada': [48.3809, -89.2477], 'Sudbury, Ontario – Canada': [46.4917, -81.0100], 'Abbotsford, British Columbia – Canada': [49.0504, -122.3045], 'Kamloops, British Columbia – Canada': [50.6745, -120.3273], 'Prince George, British Columbia – Canada': [53.9171, -122.7497], 'White Rock, British Columbia – Canada': [49.0560, -122.8080], 'St. Albert, Alberta – Canada': [53.6300, -113.6250], 'Grande Prairie, Alberta – Canada': [55.1710, -118.8010], 'Seville, Andalusia – Spain': [37.3891, -5.9845], 'Valencia, Valencian Community – Spain': [39.4699, -0.3763], 'Málaga, Andalusia – Spain': [36.7213, -4.4214], 'Kiev (Kyiv), Kyiv – Ukraine': [50.4501, 30.5234], 'Minsk, Minsk – Belarus': [53.9006, 27.5590], 'Chisinau, Chisinau – Moldova': [47.0105, 28.8638], 'Skopje, Skopje – North Macedonia': [41.9973, 21.4280], 'Tirana, Tirana County – Albania': [41.3275, 19.8189], 'Wrocław, Lower Silesian – Poland': [51.1079, 17.0385], 'Poznań, Greater Poland – Poland': [52.4064, 16.9252], 'Gdańsk, Pomeranian – Poland': [54.3520, 18.6466], 'Kabul, Kabul – Afghanistan': [34.5289, 69.1725], 'Damascus, Damascus – Syria': [33.5138, 36.2765], 'Mecca, Makkah – Saudi Arabia': [21.3891, 39.8579], 'Medina, Al Madinah – Saudi Arabia': [24.5247, 39.5692], 'Isfahan, Isfahan – Iran': [32.6546, 51.6680], 'Colombo, Western Province – Sri Lanka': [6.9271, 79.8612], 'Kathmandu, Bagmati – Nepal': [27.7172, 85.3240], 'Ulaanbaatar, Ulaanbaatar – Mongolia': [47.8864, 106.9057], 'Guadalajara, Jalisco – Mexico': [20.6597, -103.3496], 'Monterrey, Nuevo León – Mexico': [25.6866, -100.3161], 'Guatemala City, Guatemala Department – Guatemala': [14.6349, -90.5069], 'Asunción, Asunción – Paraguay': [-25.2637, -57.5759], 'Kinshasa, Kinshasa – Democratic Republic of the Congo': [-4.4419, 15.2663], 'Luanda, Luanda – Angola': [-8.8390, 13.2343], 'Abidjan, Abidjan – Côte d\'Ivoire': [5.3600, -4.0083], 'Khartoum, Khartoum – Sudan': [15.5007, 32.5599], 'Harare, Harare – Zimbabwe': [-17.8292, 31.0537], 'Maputo, Maputo – Mozambique': [-25.9692, 32.5732], 'Antananarivo, Analamanga – Madagascar': [-18.8792, 47.5079], 'Ibadan, Oyo – Nigeria': [7.3964, 3.9168], 'Kano, Kano – Nigeria': [12.0022, 8.5920], 'Abu Dhabi, Abu Dhabi – United Arab Emirates': [24.4539, 54.3773], 'Muscat, Muscat – Oman': [23.5880, 58.3829], 'Kuwait City, Al Asimah – Kuwait': [29.3759, 47.9774], 'Manama, Capital Governorate – Bahrain': [26.2285, 50.5860], 'Yerevan, Yerevan – Armenia': [40.1792, 44.4991], 'Tbilisi, Tbilisi – Georgia': [41.7151, 44.8271], 'Baku, Baku – Azerbaijan': [40.4093, 49.8671], 'Ashgabat, Ashgabat – Turkmenistan': [37.9601, 58.3261], 'Tashkent, Tashkent – Uzbekistan': [41.2995, 69.2401], 'Dushanbe, Dushanbe – Tajikistan': [38.5598, 68.7870], 'Bishkek, Bishkek – Kyrgyzstan': [42.8746, 74.5698], 'Almaty, Almaty – Kazakhstan': [43.2220, 76.8512], 'Paramaribo, Paramaribo – Suriname': [5.8520, -55.2038], 'Georgetown, Demerara-Mahaica – Guyana': [6.8013, -58.1553], };
  
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
    const saved = this.flightService.getTrackedFlights();
    if (saved.length > 0) {
      this.loadFlights();
    }
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
      this.trackedFlights = this.flightService.getTrackedFlights();
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
    }
  }

  async loadAllFlights(): Promise<void> {
    try {
      const states = await this.flightService.getStates();
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

    this.trackedFlights = [...this.trackedFlights, flight];
    this.flightService.saveTrackedFlights(this.trackedFlights);
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
        this.flightService.saveTrackedFlights(this.trackedFlights);
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

  removeFlight(id: string): void {
    this.trackedFlights = this.trackedFlights.filter(f => f.id !== id);
    this.flightService.saveTrackedFlights(this.trackedFlights);
  }

  toggleFlight(id: string): void {
    const flight = this.trackedFlights.find(f => f.id === id);
    if (flight) {
      flight.enabled = !flight.enabled;
      this.flightService.saveTrackedFlights(this.trackedFlights);
    }
  }

  onFlightClick(ping: ResolvedGlobePing): void {
    const flightData = ping.data as any;
    const callsign = flightData?.callsign;
    const tracked = this.trackedFlights.find(f =>
      f.enabled && f.callsign.trim().toUpperCase() === callsign?.toUpperCase()
    );

    this.selectedFlight = tracked || {
      callsign: flightData?.callsign || ping.label,
      lat: ping.lat,
      lon: ping.lon,
      altitude: flightData?.altitude,
      heading: flightData?.heading,
      velocity: flightData?.velocity,
      isTracked: false,
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
    this.flightArcs = [];
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
    } catch { /* non-fatal */ }
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
      for (const [country, coords] of Object.entries(this.COUNTRY_COORDS)) {
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
      for (const [city, coords] of Object.entries(this.CITY_COORDS)) {
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

  private userToPing(userWithLoc: UserWithLocation): ResolvedGlobePing | null {
    const user = userWithLoc.user;
    const coords = userWithLoc.city
      ? this.lookupCityCoords(userWithLoc.city, userWithLoc.country)
      : this.lookupCoords(this.COUNTRY_COORDS, userWithLoc.country);
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
      : this.lookupCityCoords(ping.city, ping.country) ?? this.lookupCoords(this.COUNTRY_COORDS, ping.country);

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
      
      // Determine if this is a city or country ping (special case)
      let pingColor = color;
      if (ping.source === 'custom') {
        // For custom pings, check if it's a city or country  
        if (ping.city) {
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
        : ping.source === 'news' ? 'rgb(68, 255, 68)' 
        : ping.source === 'user' ? 'rgb(85, 136, 255)' 
        : ping.source === 'custom' && ping.city ? 'rgb(255, 100, 100)'
        : ping.source === 'custom' && ping.country ? 'rgb(255, 200, 100)'
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
          // For custom pings, we need to consider city vs country
          if (ping.city) {
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
    const size = isActive ? 7 : 5;
    const headingRad = heading != null ? (heading * Math.PI / 180) : 0;
    const glowSize = isActive ? 16 : 12;
    const color = isTracked ? '#00ddff' : '#ffdd00';

    const grad = ctx.createRadialGradient(x, y, 0, x, y, glowSize);
    grad.addColorStop(0, isTracked ? 'rgba(0, 221, 255, 0.3)' : 'rgba(255, 220, 0, 0.3)');
    grad.addColorStop(1, 'rgba(255, 220, 0, 0)');
    ctx.beginPath();
    ctx.arc(x, y, glowSize, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(headingRad);

    const s = size;

    ctx.beginPath();
    ctx.moveTo(s * 1.4, 0);
    ctx.lineTo(s * 0.5, -s * 0.5);
    ctx.lineTo(-s * 0.6, -s * 0.3);
    ctx.lineTo(-s * 1.2, -s * 0.6);
    ctx.lineTo(-s * 1.2, s * 0.6);
    ctx.lineTo(-s * 0.6, s * 0.3);
    ctx.lineTo(s * 0.5, s * 0.5);
    ctx.closePath();

    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (isTracked && !isActive) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
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
    gc.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.lastX = e.touches[0].clientX;
        this.lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        lastDist = this.touchDist(e);
      }
    }, { passive: true });
    gc.addEventListener('touchmove', e => {
      if (e.touches.length === 1 && this.isDragging) {
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
    gc.addEventListener('touchend', () => { this.isDragging = false; }, { passive: true });
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
    if (!this.isDragging) { this.checkPinHover(e); return; }
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) this.dragMoved = true;
    this.lastX = e.clientX; this.lastY = e.clientY;
    this.applyDrag(dx, dy);
  }

  private onMouseUp(): void { this.isDragging = false; }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.zoomSliderValue = Math.max(0, Math.min(100, this.zoomSliderValue - e.deltaY * 0.035));
    this.camDistTarget = this.zoomSliderToCamDist(this.zoomSliderValue);
  }

  private onClick(e: MouseEvent): void {
    if (this.dragMoved) return;
    const ping = this.findPingAtEvent(e);
    if (!ping) return;

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
    const country = this.lookupCoords(this.COUNTRY_COORDS, story.country);
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
      const r = this.lookupCoords(this.CITY_COORDS, c);
      if (r) return r;
    }
    
    // If no exact match, try fuzzy matching on the city name without country
    if (tc) {
      const fuzzyMatch = this.fuzzyLookupCity(this.CITY_COORDS, tc);
      if (fuzzyMatch) return fuzzyMatch;
    }
    
    // If country is provided, try to match with just the country name
    if (tco) {
      const countryMatch = this.lookupCoords(this.COUNTRY_COORDS, tco);
      if (countryMatch) {
        // If country matches, try to find a city that includes this country
        // This is for cases like Arnhem, Netherlands -> Arnhem, Gelderland - Netherlands
        const citiesWithCountry = Object.keys(this.CITY_COORDS).filter(cityKey => 
          cityKey.includes(tco) || cityKey.includes(this.normalizeName(tco))
        );
        if (citiesWithCountry.length > 0) {
          // Try to find best match among these
          const candidates = citiesWithCountry.map(cityKey => ({
            city: cityKey,
            similarity: this.calculateSimilarity(this.normalizeName(tc), this.normalizeName(cityKey))
          })).sort((a, b) => b.similarity - a.similarity);
          
          if (candidates.length > 0 && candidates[0].similarity > 0.5) {
            return this.CITY_COORDS[candidates[0].city];
          }
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
    if (map === this.CITY_COORDS) {
      return this.fuzzyLookupCity(map, t);
    }
    
    return undefined;
  }



  private fuzzyLookupCity(map: Record<string, [number, number]>, name: string): [number, number] | undefined {
    // Simple fuzzy matching for city names
    const threshold = 0.7; // Minimum similarity ratio
    
    // Normalize the search term
    const normalizedSearch = this.normalizeName(name);
    
    // Find the closest matching city name
    const matches = Object.keys(map).map(cityKey => {
      const normalizedCity = this.normalizeName(cityKey);
      const similarity = this.calculateSimilarity(normalizedSearch, normalizedCity);
      return {
        city: cityKey,
        similarity: similarity
      };
    }).filter(match => match.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity);
    
    // Return the best match if one exists
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
      const countryMatch = Object.keys(this.COUNTRY_COORDS).find(c => this.normalizeName(c) === this.normalizeName(p));
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
