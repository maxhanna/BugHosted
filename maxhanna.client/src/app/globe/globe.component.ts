import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ElementRef, ViewChild, HostListener, NgZone,
  EventEmitter, Input, Output
} from '@angular/core';
import { SocialService } from '../../services/social.service';
import { EncryptionService } from '../../services/encryption.service';
import { NewsService } from '../../services/news.service';
import { NewsPin } from '../../services/datacontracts/news/news-data';
import { Story } from '../../services/datacontracts/social/story';
import { TileCacheService } from '../services/tile-cache.service';
import { FlightService } from '../../services/flight.service';
import { TrackedFlight } from '../../services/datacontracts/flight';

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
  if (disc < 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.05, 1.0); return; }

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
  source: 'story' | 'custom' | 'news';
  story?: Story;
  newsPin?: NewsPin;
  data?: unknown;
}

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
  dateFilterValue: number = 0;
  filteredStories: Story[] = [];
  @Input() set pings(value: GlobePing[] | null | undefined) {
    this.customPings = Array.isArray(value) ? value : [];
  }
  @Input() arcs: Arc[] = [];
  @Output() isLoadingEvent = new EventEmitter<boolean>();
  @Output() pingClicked = new EventEmitter<GlobePing>();

  // ---- WebGL --------------------------------------------------------------
  private gl!: WebGLRenderingContext;
  private prog!: WebGLProgram;
  private tex!: WebGLTexture;
  private detailTex!: WebGLTexture;

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
  private customPings: GlobePing[] = [];
  private hoveredPin: { id: string; label: string; x: number; y: number } | null = null;
  private activePingId: string | null = null;
  private pingTourTimer: ReturnType<typeof setInterval> | null = null;
  private pingTourIndex = 0;

  // ---- flight pins ---------------------------------------------------------
  trackedFlights: TrackedFlight[] = [];
  activeDataTab: 'stories' | 'news' | 'flights' = 'stories';
  private flightsLoaded = false;
  private flightInterval: ReturnType<typeof setInterval> | null = null;
  showDataPanel = false;

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
  private readonly COUNTRY_COORDS: Record<string, [number, number]> = {
    'United States': [37.09, -95.71], 'USA': [37.09, -95.71], 'US': [37.09, -95.71],
    'United Kingdom': [55.37, -3.43], 'UK': [55.37, -3.43], 'Britain': [55.37, -3.43],
    'Canada': [56.13, -106.34], 'Australia': [-25.27, 133.77], 'Germany': [51.16, 10.45],
    'France': [46.22, 2.21], 'Japan': [36.20, 138.25], 'China': [35.86, 104.19],
    'India': [20.59, 78.96], 'Brazil': [-14.23, -51.92], 'Russia': [61.52, 105.31],
    'Mexico': [23.63, -102.55], 'Italy': [41.87, 12.56], 'Spain': [40.46, -3.74],
    'South Korea': [35.90, 127.76], 'Netherlands': [52.13, 5.29], 'Sweden': [60.12, 18.64],
    'Norway': [60.47, 8.46], 'Denmark': [56.26, 9.50], 'Finland': [61.92, 25.74],
    'Poland': [51.91, 19.14], 'Ukraine': [48.37, 31.16], 'Turkey': [38.96, 35.24],
    'Saudi Arabia': [23.88, 45.07], 'Israel': [31.04, 34.85], 'Egypt': [26.82, 30.80],
    'South Africa': [-30.55, 22.93], 'Nigeria': [9.08, 8.67], 'Kenya': [-0.02, 37.90],
    'Argentina': [-38.41, -63.61], 'Chile': [-35.67, -71.54], 'Colombia': [4.57, -74.29],
    'Pakistan': [30.37, 69.34], 'Bangladesh': [23.68, 90.35], 'Indonesia': [-0.78, 113.92],
    'Thailand': [15.87, 100.99], 'Vietnam': [14.05, 108.27], 'Philippines': [12.87, 121.77],
    'Malaysia': [4.21, 101.97], 'Singapore': [1.35, 103.82], 'New Zealand': [-40.90, 174.88],
    'Switzerland': [46.81, 8.22], 'Austria': [47.51, 14.55], 'Belgium': [50.50, 4.46],
    'Portugal': [39.39, -8.22], 'Greece': [39.07, 21.82], 'Czech Republic': [49.81, 15.47],
    'Romania': [45.94, 24.96], 'Hungary': [47.16, 19.50], 'Ireland': [53.41, -8.24],
    'Iran': [32.42, 53.68], 'Iraq': [33.22, 43.67], 'Afghanistan': [33.93, 67.70],
  };

  private readonly CITY_COORDS: Record<string, [number, number]> = {
    'newyork': [40.7128, -74.0060], 'losangeles': [34.0522, -118.2437], 'chicago': [41.8781, -87.6298], 'london': [51.5074, -0.1278], 'london,unitedkingdom': [51.5074, -0.1278], 'paris': [48.8566, 2.3522], 'berlin': [52.5200, 13.4050], 'tokyo': [35.6762, 139.6503], 'sydney': [-33.8688, 151.2093], 'toronto': [43.6532, -79.3832], 'montreal': [45.5017, -73.5673], 'montreal,canada': [45.5017, -73.5673], 'montreal,quebec': [45.5017, -73.5673], 'montreal,qc': [45.5017, -73.5673], 'vancouver': [49.2827, -123.1207], 'ottawa': [45.4215, -75.6972], 'quebeccity': [46.8139, -71.2080], 'calgary': [51.0447, -114.0719], 'edmonton': [53.5461, -113.4938], 'winnipeg': [49.8951, -97.1384], 'halifax': [44.6488, -63.5752], 'sanfrancisco': [37.7749, -122.4194], 'seattle': [47.6062, -122.3321], 'miami': [25.7617, -80.1918], 'boston': [42.3601, -71.0589], 'dubai': [25.2048, 55.2708], 'singapore': [1.3521, 103.8198], 'hongkong': [22.3193, 114.1694], 'mumbai': [19.0760, 72.8777], 'delhi': [28.7041, 77.1025], 'saopaulo': [-23.5505, -46.6333], 'mexicocity': [19.4326, -99.1332], 'buenosaires': [-34.6037, -58.3816], 'moscow': [55.7558, 37.6173], 'montreal,qc,canada': [45.5017, -73.5673], 'montréal': [45.5017, -73.5673], 'montréal,québec': [45.5017, -73.5673], 'montréal,qc,canada': [45.5017, -73.5673], 'washington': [38.9072, -77.0369], 'washingtondc': [38.9072, -77.0369], 'philadelphia': [39.9526, -75.1652], 'atlanta': [33.7490, -84.3880], 'dallas': [32.7767, -96.7970], 'houston': [29.7604, -95.3698], 'austin': [30.2672, -97.7431], 'denver': [39.7392, -104.9903], 'phoenix': [33.4484, -112.0740], 'lasvegas': [36.1699, -115.1398], 'portland': [45.5152, -122.6784], 'sandiego': [32.7157, -117.1611], 'minneapolis': [44.9778, -93.2650], 'detroit': [42.3314, -83.0458], 'cleveland': [41.4993, -81.6944], 'pittsburgh': [40.4406, -79.9959], 'charlotte': [35.2271, -80.8431], 'nashville': [36.1627, -86.7816], 'neworleans': [29.9511, -90.0715], 'orlando': [28.5383, -81.3792], 'tampa': [27.9506, -82.4572], 'saltlakecity': [40.7608, -111.8910], 'kansascity': [39.0997, -94.5786], 'stlouis': [38.6270, -90.1994], 'st.louis': [38.6270, -90.1994], 'sanantonio': [29.4241, -98.4936], 'columbus': [39.9612, -82.9988], 'indianapolis': [39.7684, -86.1581], 'milwaukee': [43.0389, -87.9065], 'cincinnati': [39.1031, -84.5120], 'raleigh': [35.7796, -78.6382], 'baltimore': [39.2904, -76.6122], 'anchorage': [61.2181, -149.9003], 'honolulu': [21.3099, -157.8581], 'hamilton': [43.2557, -79.8711], 'mississauga': [43.5890, -79.6441], 'brampton': [43.7315, -79.7624], 'laval': [45.6066, -73.7124], 'longueuil': [45.5312, -73.5181], 'gatineau': [45.4765, -75.7013], 'sherbrooke': [45.4042, -71.8929], 'trois-rivieres': [46.3432, -72.5436], 'trois-rivières': [46.3432, -72.5436], 'kingston': [44.2312, -76.4860], 'london,ontario': [42.9849, -81.2453], 'kitchener': [43.4516, -80.4925], 'waterloo': [43.4643, -80.5204], 'windsor': [42.3149, -83.0364], 'saskatoon': [52.1579, -106.6702], 'regina': [50.4452, -104.6189], 'victoria': [48.4284, -123.3656], 'kelowna': [49.8880, -119.4960], 'stjohns': [47.5615, -52.7126], 'st.johns': [47.5615, -52.7126], 'fredericton': [45.9636, -66.6431], 'moncton': [46.0878, -64.7782], 'charlottetown': [46.2382, -63.1311], 'yellowknife': [62.4540, -114.3718], 'whitehorse': [60.7212, -135.0568], 'iqaluit': [63.7467, -68.5170], 'dublin': [53.3498, -6.2603], 'edinburgh': [55.9533, -3.1883], 'glasgow': [55.8642, -4.2518], 'manchester': [53.4808, -2.2426], 'birmingham': [52.4862, -1.8904], 'liverpool': [53.4084, -2.9916], 'bristol': [51.4545, -2.5879], 'cardiff': [51.4816, -3.1791], 'belfast': [54.5973, -5.9301], 'amsterdam': [52.3676, 4.9041], 'rotterdam': [51.9244, 4.4777], 'brussels': [50.8503, 4.3517], 'antwerp': [51.2194, 4.4025], 'zurich': [47.3769, 8.5417], 'geneva': [46.2044, 6.1432], 'vienna': [48.2082, 16.3738], 'prague': [50.0755, 14.4378], 'warsaw': [52.2297, 21.0122], 'krakow': [50.0647, 19.9450], 'budapest': [47.4979, 19.0402], 'bucharest': [44.4268, 26.1025], 'sofia': [42.6977, 23.3219], 'athens': [37.9838, 23.7275], 'istanbul': [41.0082, 28.9784], 'ankara': [39.9334, 32.8597], 'madrid': [40.4168, -3.7038], 'barcelona': [41.3874, 2.1686], 'lisbon': [38.7223, -9.1393], 'porto': [41.1579, -8.6291], 'rome': [41.9028, 12.4964], 'milan': [45.4642, 9.1900], 'naples': [40.8518, 14.2681], 'venice': [45.4408, 12.3155], 'florence': [43.7696, 11.2558], 'munich': [48.1351, 11.5820], 'hamburg': [53.5511, 9.9937], 'cologne': [50.9375, 6.9603], 'frankfurt': [50.1109, 8.6821], 'copenhagen': [55.6761, 12.5683], 'stockholm': [59.3293, 18.0686], 'oslo': [59.9139, 10.7522], 'helsinki': [60.1699, 24.9384], 'reykjavik': [64.1466, -21.9426], 'tallinn': [59.4370, 24.7536], 'riga': [56.9496, 24.1052], 'vilnius': [54.6872, 25.2797], 'kyiv': [50.4501, 30.5234], 'kiev': [50.4501, 30.5234], 'zagreb': [45.8150, 15.9819], 'belgrade': [44.7866, 20.4489], 'sarajevo': [43.8563, 18.4131], 'dubrovnik': [42.6507, 18.0944], 'tokyo,japan': [35.6762, 139.6503], 'osaka': [34.6937, 135.5023], 'kyoto': [35.0116, 135.7681], 'yokohama': [35.4437, 139.6380], 'seoul': [37.5665, 126.9780], 'busan': [35.1796, 129.0756], 'beijing': [39.9042, 116.4074], 'shanghai': [31.2304, 121.4737], 'shenzhen': [22.5431, 114.0579], 'guangzhou': [23.1291, 113.2644], 'taipei': [25.0330, 121.5654], 'bangkok': [13.7563, 100.5018], 'hanoi': [21.0278, 105.8342], 'hochiminhcity': [10.8231, 106.6297], 'kualalumpur': [3.1390, 101.6869], 'jakarta': [-6.2088, 106.8456], 'manila': [14.5995, 120.9842], 'cebu': [10.3157, 123.8854], 'phnompenh': [11.5564, 104.9282], 'vientiane': [17.9757, 102.6331], 'yangon': [16.8409, 96.1735], 'dhaka': [23.8103, 90.4125], 'karachi': [24.8607, 67.0011], 'lahore': [31.5204, 74.3587], 'islamabad': [33.6844, 73.0479], 'kolkata': [22.5726, 88.3639], 'bangalore': [12.9716, 77.5946], 'bengaluru': [12.9716, 77.5946], 'chennai': [13.0827, 80.2707], 'hyderabad': [17.3850, 78.4867], 'pune': [18.5204, 73.8567], 'ahmedabad': [23.0225, 72.5714], 'cairo': [30.0444, 31.2357], 'alexandria': [31.2001, 29.9187], 'casablanca': [33.5731, -7.5898], 'marrakesh': [31.6295, -7.9811], 'algiers': [36.7538, 3.0588], 'tunis': [36.8065, 10.1815], 'lagos': [6.5244, 3.3792], 'abuja': [9.0765, 7.3986], 'accra': [5.6037, -0.1870], 'nairobi': [-1.2921, 36.8219], 'addisababa': [8.9806, 38.7578], 'kampala': [0.3476, 32.5825], 'kigali': [-1.9441, 30.0619], 'daressalaam': [-6.7924, 39.2083], 'johannesburg': [-26.2041, 28.0473], 'capetown': [-33.9249, 18.4241], 'durban': [-29.8587, 31.0218], 'doha': [25.2854, 51.5310], 'riyadh': [24.7136, 46.6753], 'jeddah': [21.4858, 39.1925], 'telaviv': [32.0853, 34.7818], 'jerusalem': [31.7683, 35.2137], 'beirut': [33.8938, 35.5018], 'amman': [31.9539, 35.9106], 'baghdad': [33.3152, 44.3661], 'tehran': [35.6892, 51.3890], 'sydney,australia': [-33.8688, 151.2093], 'melbourne': [-37.8136, 144.9631], 'brisbane': [-27.4698, 153.0251], 'perth': [-31.9523, 115.8613], 'adelaide': [-34.9285, 138.6007], 'canberra': [-35.2809, 149.1300], 'auckland': [-36.8485, 174.7633], 'wellington': [-41.2865, 174.7762], 'christchurch': [-43.5321, 172.6362], 'riodejaneiro': [-22.9068, -43.1729], 'brasilia': [-15.7939, -47.8828], 'salvador': [-12.9777, -38.5016], 'recife': [-8.0476, -34.8770], 'lima': [-12.0464, -77.0428], 'bogota': [4.7110, -74.0721], 'medellin': [6.2442, -75.5812], 'santiago': [-33.4489, -70.6693], 'montevideo': [-34.9011, -56.1645], 'quito': [-0.1807, -78.4678], 'guayaquil': [-2.1700, -79.9224], 'caracas': [10.4806, -66.9036], 'panamacity': [8.9824, -79.5199], 'sanjose': [9.9281, -84.0907], 'havana': [23.1136, -82.3666], 'kingston,jamaica': [17.9712, -76.7936], 'santodomingo': [18.4861, -69.9312], 'saint-hubert': [45.5500, -73.5000], 'bromont': [45.2742, -72.4958], 'laval-des-rapides': [45.5761, -73.6784], 'beaconsfield': [45.4473, -73.9036], 'pointe-claire': [45.4608, -73.8350], 'dorval': [45.4445, -73.7404], 'boucherville': [45.6080, -73.4887], 'blainville': [45.6420, -73.8952], 'saint-jerome': [45.7756, -74.0032], 'victoriaville': [46.0520, -71.9611], 'niagarafalls,on': [43.0896, -79.0849], 'oakville': [43.4675, -79.6877], 'st.catharines': [43.1594, -79.2469], 'albany,ny': [42.6526, -73.7562], 'syracuse,ny': [43.0481, -76.1474], 'rochester,ny': [43.1566, -77.6088], 'buffalo,ny': [42.8864, -78.8784], 'hartford,ct': [41.7658, -72.6734], 'springfield,il': [39.7817, -89.6501], 'wichita,ks': [37.6872, -97.3301], 'topeka,ks': [39.0473, -95.6752], 'lincoln,ne': [40.8136, -96.7026], 'omaha,ne': [41.2565, -95.9345], 'louisville,ky': [38.2527, -85.7585], 'lexington,ky': [38.0406, -84.5037], 'birmingham,al': [33.5186, -86.8104], 'mobile,al': [30.6954, -88.0399], 'tulsa,ok': [36.1539, -95.9928], 'oklahomacity,ok': [35.4676, -97.5164], 'littlerock,ar': [34.7465, -92.2896], 'newark,nj': [40.7357, -74.1724], 'jerseycity,nj': [40.7178, -74.0431], 'paterson,nj': [40.9168, -74.1718], 'lyon,france': [45.7640, 4.8357], 'marseille,france': [43.2965, 5.3698], 'toulouse,france': [43.6047, 1.4442], 'nice,france': [43.7102, 7.2620], 'bordeaux,france': [44.8378, -0.5792], 'strasbourg,france': [48.5734, 7.7521], 'amersfoort,netherlands': [52.1561, 5.3878], 'utrecht,netherlands': [52.0907, 5.1214], 'gand/gent,belgium': [51.0543, 3.7174], 'leuven,belgium': [50.8798, 4.7005], 'tampere,finland': [61.4981, 23.7600], 'turku,finland': [60.4518, 22.2666], 'bergen,norway': [60.3913, 5.3221], 'trondheim,norway': [63.4305, 10.3951], 'malmö,sweden': [55.6050, 13.0038], 'nagoya,japan': [35.1815, 136.9066], 'sapporo,japan': [43.0618, 141.3545], 'fukuoka,japan': [33.5904, 130.4017], 'hiroshima,japan': [34.3853, 132.4553], 'bandung,indonesia': [-6.9147, 107.6098], 'surabaya,indonesia': [-7.2575, 112.7521], 'medan,indonesia': [3.5952, 98.6722], 'semarang,indonesia': [-6.9667, 110.4167], 'yogyakarta,indonesia': [-7.8014, 110.3643], 'ahmedabad,india': [23.0225, 72.5714], 'pune,india': [18.5204, 73.8567], 'jaipur,india': [26.9124, 75.7873], 'lucknow,india': [26.8467, 80.9462], 'kanpur,india': [26.4499, 80.3319], 'indore,india': [22.7196, 75.8577], 'nagpur,india': [21.1458, 79.0882], 'coimbatore,india': [11.0168, 76.9558], 'casablanca,morocco': [33.5731, -7.5898], 'rabat,morocco': [34.0209, -6.8417], 'marrakech,morocco': [31.6295, -7.9811], 'fes,morocco': [34.0331, -5.0000], 'dakar,senegal': [14.7167, -17.4677], 'ouagadougou,burkinafaso': [12.3714, -1.5197], 'bamako,mali': [12.6392, -8.0029], 'accra,ghana': [5.6037, -0.1870], 'kumasi,ghana': [6.6885, -1.6244], 'monrovia,liberia': [6.3005, -10.7969], 'freetown,sierraleone': [8.4657, -13.2317], 'portoalegre,brazil': [-30.0277, -51.2287], 'curitiba,brazil': [-25.4284, -49.2733], 'recife,brazil': [-8.0476, -34.8770], 'salvador,brazil': [-12.9777, -38.5016], 'fortaleza,brazil': [-3.7172, -38.5433], 'belohorizonte,brazil': [-19.9167, -43.9345], 'valparaiso,chile': [-33.0472, -71.6127], 'concepcion,chile': [-36.8201, -73.0444], 'antofagasta,chile': [-23.6500, -70.4000], 'lapaz,bolivia': [-16.5000, -68.1500], 'sucre,bolivia': [-19.0333, -65.2627], 'cali,colombia': [3.4516, -76.5320], 'barranquilla,colombia': [10.9685, -74.7813], 'medellin,colombia': [6.2442, -75.5812], 'quito,ecuador': [-0.1807, -78.4678], 'guayaquil,ecuador': [-2.1700, -79.9224],
  };
  constructor(
    private socialService: SocialService,
    private newsService: NewsService,
    private ngZone: NgZone,
    private encryptionService: EncryptionService,
    private tileCacheService: TileCacheService,
    private flightService: FlightService
  ) { }

  // =========================================================================
  // Lifecycle
  // =========================================================================
  ngOnInit(): void {
    this.loadStories();
    this.loadNewsPins(); 
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
      // Update flight positions periodically
      if (!this.flightInterval) {
        this.flightInterval = setInterval(async () => {
          this.trackedFlights = await this.flightService.updateFlightPositions(this.trackedFlights);
        }, 15000);
      }
    } catch (error) {
      console.error('Failed to load flights:', error);
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

  onStoryClick(story: Story): void {
    const ping = this.storyToPing(story);
    if (ping) this.focusPing(ping);
  }

  onNewsPinClick(pin: NewsPin): void {
    const ping = this.newsPinToPing(pin);
    if (ping) this.focusPing(ping);
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
    const storyPings = this.filteredStories
      .map(story => this.storyToPing(story))
      .filter((ping): ping is ResolvedGlobePing => !!ping);
    const newsPings = this.newsPins
      .map(pin => this.newsPinToPing(pin))
      .filter((ping): ping is ResolvedGlobePing => !!ping);
    const customPings = this.customPings
      .map((ping, index) => this.resolveCustomPing(ping, index))
      .filter((ping): ping is ResolvedGlobePing => !!ping);

    return [...storyPings, ...newsPings, ...customPings];
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

  // =========================================================================
  // WebGL
  // =========================================================================
  private initWebGL(): void {
    const canvas = this.globeCanvasRef.nativeElement;
    const gl = canvas.getContext('webgl') as WebGLRenderingContext;
    if (!gl) { console.error('WebGL not supported'); return; }
    this.gl = gl;

    const vert = this.compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const frag = this.compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      console.error('Shader link error:', gl.getProgramInfoLog(prog));
    this.prog = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
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
    gl.clearColor(0, 0, 0.05, 1);
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
  
      const color = ping.source === 'story' ? '255, 80, 80'
        : ping.source === 'news' ? '255, 180, 50'
        : '74, 170, 255';
      const flightData = ping.data as any;
      const isFlight = flightData?.type === 'flight';
      const isAirport = flightData?.type === 'airport';

      if (isFlight) {
        this.drawPlaneIcon(ctx, x, y, flightData?.heading, isActive);
      } else {  
      const grad = ctx.createRadialGradient(x, y, 0, x, y, 10);
      grad.addColorStop(0, `rgba(${color}, ${isActive ? '1' : '0.9'})`);
      grad.addColorStop(1, `rgba(${color}, 0)`);
      ctx.beginPath();
      ctx.arc(x, y, isActive ? 14 : 10, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

 
      ctx.beginPath();
      ctx.arc(x, y, isActive ? 5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = ping.source === 'story' ? '#ff4444' : ping.source === 'news' ? '#44ff44' : '#4aaaff';
  
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
        default:
          this.drawCustomIcon(ctx, x, y, s);
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

  private drawPlaneIcon(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number | undefined | null, isActive: boolean): void {
    const size = isActive ? 7 : 5;
    const headingRad = heading != null ? (heading * Math.PI / 180) : 0;
    const glowSize = isActive ? 16 : 12;

    const grad = ctx.createRadialGradient(x, y, 0, x, y, glowSize);
    grad.addColorStop(0, 'rgba(255, 220, 0, 0.3)');
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

    ctx.fillStyle = '#ffdd00';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
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
    if (!this.arcs.length) return;
    const canvas = this.pinCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;

    for (const arc of this.arcs) {
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
    if (ping.source === 'news' && ping.newsPin?.articleUrl) {
      window.open(ping.newsPin.articleUrl, '_blank');
      return;
    }
    this.focusPing(ping);
    if (ping) {
      this.focusPing(ping);
      this.pingClicked.emit({
        id: ping.id,
        label: ping.label,
        lat: ping.lat,
        lon: ping.lon,
        data: ping.data,
      });
    }
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
      const r = this.CITY_COORDS[this.normalizeName(c)];
      if (r) return r;
    }
    return undefined;
  }

  private lookupCoords(map: Record<string, [number, number]>, name?: string)
    : [number, number] | undefined {
    if (!name) return undefined;
    const t = name.trim();
    if (map[t]) return map[t];
    const n = this.normalizeName(t);
    return Object.entries(map).find(([k]) => this.normalizeName(k) === n)?.[1];
  }

  private normalizeName(s: string): string {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s*,\s*/g, ', ')
      .replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private formatLocationLabel(city?: string, country?: string): string {
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
