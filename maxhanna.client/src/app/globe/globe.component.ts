import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ElementRef, ViewChild, HostListener, NgZone
} from '@angular/core';
import { SocialService } from '../../services/social.service';
import { EncryptionService } from '../../services/encryption.service';
import { Story } from '../../services/datacontracts/social/story';
import { TileCacheService } from '../services/tile-cache.service';

// ---------------------------------------------------------------------------
// Vertex shader — renders a sphere via ray-sphere intersection
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
// Fragment shader — ray-sphere intersection, samples tile texture atlas
// ---------------------------------------------------------------------------
const FRAG_SRC = `
precision highp float;
varying vec2 v_uv;

uniform sampler2D u_tex;
uniform mat3      u_rot;      // globe rotation (row-major, passed column-major)
uniform float     u_camDist;  // camera distance along +Z
uniform vec2      u_resolution;

const float PI = 3.14159265358979;

void main() {
  // Reconstruct ray direction in view space
  float fov   = 35.0 * PI / 180.0;
  float f     = 1.0 / tan(fov * 0.5);
  float asp   = u_resolution.x / u_resolution.y;
  vec3 rayDir = normalize(vec3(v_uv.x * asp / f, v_uv.y / f, -1.0));

  // Camera at (0,0,camDist) in world space
  vec3 camPos = vec3(0.0, 0.0, u_camDist);

  // Ray-sphere intersection (unit sphere at origin)
  float a = dot(rayDir, rayDir);
  float b = 2.0 * dot(camPos, rayDir);
  float c = dot(camPos, camPos) - 1.0;
  float disc = b*b - 4.0*a*c;
  if (disc < 0.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.05, 1.0);
    return;
  }
  float t = (-b - sqrt(disc)) / (2.0*a);
  vec3 hit = camPos + t * rayDir;

  // Apply inverse globe rotation to get texture coords
  // u_rot is the globe rotation; inverse = transpose for orthogonal matrix
  vec3 p = u_rot * hit;

  // Spherical coords -> UV
  float lon = atan(p.x, p.z);
  float lat = asin(clamp(p.y, -1.0, 1.0));
  float u   = (lon / (2.0*PI)) + 0.5;
  float v   = (lat / PI) + 0.5;

  gl_FragColor = texture2D(u_tex, vec2(u, v));
}
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
@Component({
  selector: 'app-globe',
  templateUrl: './globe.component.html',
  styleUrls: ['./globe.component.css'],
  standalone: false
})
export class GlobeComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('globeCanvas') private globeCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('detailCanvas') private detailCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('pinCanvas')   private pinCanvasRef!:   ElementRef<HTMLCanvasElement>;

  // ---- public state -------------------------------------------------------
  zoomSliderValue = 30; // 0-100

  // ---- private WebGL state ------------------------------------------------
  private gl!: WebGLRenderingContext;
  private prog!: WebGLProgram;
  private tex!: WebGLTexture;
  private texReady = false; // kept for future use

  // ---- rotation -----------------------------------------------------------
  // rot is a 9-element row-major 3×3 rotation matrix
  private rot = new Float32Array([1,0,0, 0,1,0, 0,0,1]);
  private isDragging = false;
  private lastX = 0;
  private lastY = 0;

  // ---- zoom ---------------------------------------------------------------
  private camDist       = 3.0;
  private camDistTarget = 3.0;
  private readonly CAM_MIN = 1.00005;  // allows zoom 19 where imagery is available
  private readonly CAM_MAX = 8.0;

  // ---- animation ----------------------------------------------------------
  private rafId = 0;
  private destroyed = false;

  // ---- story pins ---------------------------------------------------------
  private stories: Story[] = [];
  private hoveredPin: { label: string; x: number; y: number } | null = null;

  // ---- stories panel ------------------------------------------------------
  showStoriesPanel = false;
  dateFilterValue = 100;
  filteredStories: Story[] = [];
  private minDate: Date | null = null;
  private maxDate: Date | null = null;

  // ---- tile texture -------------------------------------------------------
  // Base world map (zoom 2) always loaded; detail layer loaded when zoomed in
  private readonly BASE_ZOOM = 2;
  private texCanvas!: HTMLCanvasElement;   // composite canvas uploaded to WebGL
  private texCtx!: CanvasRenderingContext2D;
  // Use a large texture so detail tiles have room to be crisp
  private readonly TEX_SIZE = 4096;
  private tileCache = new Map<string, HTMLImageElement | 'loading' | 'error'>();
  private lastDetailZoom = -1;
  private lastDetailCenterLon = 999;
  private lastDetailCenterLat = 999;
  private detailUpdatePending = false;
  private readonly SATELLITE_TILE_ZOOM_MIN = 12;
  private readonly SATELLITE_TILE_ZOOM_MAX = 19;
  private readonly SATELLITE_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';

  // ---- country coords lookup ----------------------------------------------
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
    'new york': [40.7128, -74.0060],
    'los angeles': [34.0522, -118.2437],
    'chicago': [41.8781, -87.6298],
    'london': [51.5074, -0.1278],
    'london, united kingdom': [51.5074, -0.1278],
    'paris': [48.8566, 2.3522],
    'berlin': [52.5200, 13.4050],
    'tokyo': [35.6762, 139.6503],
    'sydney': [-33.8688, 151.2093],
    'toronto': [43.6532, -79.3832],
    'montreal': [45.5017, -73.5673],
    'montreal, canada': [45.5017, -73.5673],
    'montreal, quebec': [45.5017, -73.5673],
    'montreal, qc': [45.5017, -73.5673],
    'vancouver': [49.2827, -123.1207],
    'ottawa': [45.4215, -75.6972],
    'quebec city': [46.8139, -71.2080],
    'calgary': [51.0447, -114.0719],
    'edmonton': [53.5461, -113.4938],
    'winnipeg': [49.8951, -97.1384],
    'halifax': [44.6488, -63.5752],
    'san francisco': [37.7749, -122.4194],
    'seattle': [47.6062, -122.3321],
    'miami': [25.7617, -80.1918],
    'boston': [42.3601, -71.0589],
    'dubai': [25.2048, 55.2708],
    'singapore': [1.3521, 103.8198],
    'hong kong': [22.3193, 114.1694],
    'mumbai': [19.0760, 72.8777],
    'delhi': [28.7041, 77.1025],
    'sao paulo': [-23.5505, -46.6333],
    'mexico city': [19.4326, -99.1332],
    'buenos aires': [-34.6037, -58.3816],
    'moscow': [55.7558, 37.6173],
  };

  constructor(private socialService: SocialService, private ngZone: NgZone, private encryptionService: EncryptionService, private tileCacheService: TileCacheService) {}

  // -------------------------------------------------------------------------
  ngOnInit(): void {
    this.loadStories();
  }

  ngAfterViewInit(): void {
    this.initWebGL();
    this.buildTileTexture();
    this.bindMouseEvents();
    this.bindTouchEvents();
    this.ngZone.runOutsideAngular(() => this.loop());
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.rafId);
  }

  // -------------------------------------------------------------------------
  // Zoom slider
  // -------------------------------------------------------------------------
  onZoomSlider(event: Event): void {
    const val = +(event.target as HTMLInputElement).value;
    this.zoomSliderValue = val;
    this.camDistTarget = this.zoomSliderToCamDist(val);
  }

  // -------------------------------------------------------------------------
  // Story loading
  // -------------------------------------------------------------------------
  private async loadStories(): Promise<void> {
    try {
      const resp = await this.socialService.getStories(
        undefined, undefined, undefined, undefined, undefined, 1, 100
      );
      if (resp && resp.stories) {
        this.stories = resp.stories.filter(s => !!s.country || !!s.city);
        
        // Decrypt story text
        for (const story of this.stories) {
          if (story.storyText && story.user?.id) {
            try {
              story.storyText = this.encryptionService.decryptContent(story.storyText, String(story.user.id));
            } catch (e) {
              // Keep encrypted if decryption fails
            }
          }
        }
        
        // Calculate date range
        const dates = this.stories
          .map(s => s.date)
          .filter((d): d is Date => !!d)
          .sort((a, b) => a.getTime() - b.getTime());
        
        if (dates.length > 0) {
          this.minDate = dates[0];
          this.maxDate = dates[dates.length - 1];
        }
        
        this.applyDateFilter();
      }
    } catch {
      // non-fatal — globe still works without pins
    }
  }

  get dateFilterLabel(): string {
    if (!this.minDate || !this.maxDate) return 'All time';
    const days = Math.ceil((this.maxDate.getTime() - this.minDate.getTime()) / (1000 * 60 * 60 * 24));
    const filteredDays = Math.floor(days * (this.dateFilterValue / 100));
    const startDate = new Date(this.maxDate.getTime() - filteredDays * 24 * 60 * 60 * 1000);
    return `${startDate.toLocaleDateString()} - ${this.maxDate.toLocaleDateString()}`;
  }

  onDateFilter(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    this.dateFilterValue = value;
    this.applyDateFilter();
  }

  private applyDateFilter(): void {
    if (!this.minDate || !this.maxDate) {
      this.filteredStories = this.stories;
      return;
    }
    
    const totalDays = (this.maxDate.getTime() - this.minDate.getTime()) / (1000 * 60 * 60 * 24);
    const cutoffDays = totalDays * (this.dateFilterValue / 100);
    const cutoffDate = new Date(this.maxDate.getTime() - cutoffDays * 24 * 60 * 60 * 1000);
    
    this.filteredStories = this.stories.filter(s => {
      if (!s.date) return true;
      return s.date >= cutoffDate;
    });
  }

  onStoryClick(story: Story): void {
    const location = this.resolveStoryLocation(story);

    if (location) {
      this.rotateToLocation(location.lat, location.lon);
      if (location.precision === 'city') {
        this.zoomSliderValue = Math.max(this.zoomSliderValue, 78);
        this.camDistTarget = this.zoomSliderToCamDist(this.zoomSliderValue);
      }
    } else {
      console.log('No coordinates found for story:', story.country, story.city);
    }
  }

  private rotateToLocation(lat: number, lon: number): void {
    // Build an absolute rotation matrix that places (lat, lon) facing the camera.
    // The camera is at +Z, so we need the globe rotated so that the 3D point
    // corresponding to (lat, lon) ends up at (0, 0, 1) in rotated space.
    //
    // Strategy: construct R such that R * p = (0, 0, 1), where p is the unit
    // vector for (lat, lon).  The simplest correct way is to build an
    // orthonormal frame whose Z-column IS p, then take the transpose (= inverse).

    const latRad = lat * Math.PI / 180;
    const lonRad = lon * Math.PI / 180;

    // Unit vector on the sphere for this location (Y-up, Z toward camera at lon=0)
    const px = Math.cos(latRad) * Math.sin(lonRad);
    const py = Math.sin(latRad);
    const pz = Math.cos(latRad) * Math.cos(lonRad);

    // We want the globe's "forward" direction (the point facing the camera) to be p.
    // Build an orthonormal basis with p as the Z axis.
    // Use world-up (0,1,0) to derive X and Y, falling back to (1,0,0) near poles.
    let ux = 0, uy = 1, uz = 0; // world up
    const dot = px * ux + py * uy + pz * uz;
    if (Math.abs(dot) > 0.99) { ux = 1; uy = 0; uz = 0; } // near pole: use world X

    // X axis = up × forward (right vector)
    let rx = uy * pz - uz * py;
    let ry = uz * px - ux * pz;
    let rz = ux * py - uy * px;
    const rLen = Math.sqrt(rx*rx + ry*ry + rz*rz) || 1;
    rx /= rLen; ry /= rLen; rz /= rLen;

    // Y axis = forward × right (up vector in the frame)
    const bx = py * rz - pz * ry;
    const by = pz * rx - px * rz;
    const bz = px * ry - py * rx;

    // The frame matrix F has columns [right, up, forward]:
    //   F = [ rx, bx, px ]
    //       [ ry, by, py ]
    //       [ rz, bz, pz ]
    //
    // We want R such that R * p = (0,0,1).
    // R = F^T (transpose of the frame, since F is orthonormal).
    // Row-major storage: R[row*3+col]
    this.rot = new Float32Array([
      rx, ry, rz,   // row 0 = right vector
      bx, by, bz,   // row 1 = up vector
      px, py, pz    // row 2 = forward vector (= p, so R*p = (0,0,1) ✓)
    ]);
  }

  // -------------------------------------------------------------------------
  // WebGL init
  // -------------------------------------------------------------------------
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
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Shader link error:', gl.getProgramInfoLog(prog));
    }
    this.prog = prog;

    // Full-screen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1,-1,  1,-1,  -1,1,
       1,-1,  1, 1,  -1,1
    ]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    // Texture
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // Placeholder 1×1 blue pixel
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 80, 255]));
  }

  private compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(s));
    }
    return s;
  }

  // -------------------------------------------------------------------------
  // Tile texture system
  // -------------------------------------------------------------------------

  /** Convert camDist to an OSM zoom level (0-18) */
  private camDistToTileZoom(): number {
    // Map camDist to slippy-map zoom level:
    //   camDist 8.0  → zoom 2  (whole world)
    //   camDist close to 1.0 → zoom 18/19 where imagery exists
    const surfaceDist = Math.max(this.CAM_MIN - 1, this.camDist - 1.0);
    const z = Math.round(2 + Math.log2(7.0 / surfaceDist));
    return Math.max(2, Math.min(this.SATELLITE_TILE_ZOOM_MAX, z));
  }

  /** Get the lon/lat currently at the center of the view (facing the camera) */
  private getCenterLonLat(): [number, number] {
    // The point facing the camera is the one that maps to (0,0,1) in rotated space.
    // In world space that's R^T * (0,0,1) = third row of R (row-major: R[6], R[7], R[8])
    const R = this.rot;
    const px = R[6], py = R[7], pz = R[8];
    const lat = Math.asin(Math.max(-1, Math.min(1, py))) * 180 / Math.PI;
    const lon = Math.atan2(px, pz) * 180 / Math.PI;
    return [lon, lat];
  }

  /** Convert lon/lat to OSM tile x/y at zoom z */
  private lonLatToTile(lon: number, lat: number, z: number): [number, number] {
    const n = Math.pow(2, z);
    const x = Math.floor((lon + 180) / 360 * n);
    const latRad = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return [
      Math.max(0, Math.min(n - 1, x)),
      Math.max(0, Math.min(n - 1, y))
    ];
  }

  /** Build the initial 1024×1024 texture canvas and load base zoom-2 tiles */
  private buildTileTexture(): void {
    this.texCanvas = document.createElement('canvas');
    this.texCanvas.width  = this.TEX_SIZE;
    this.texCanvas.height = this.TEX_SIZE;
    this.texCtx = this.texCanvas.getContext('2d')!;
    this.texCtx.fillStyle = '#001a33';
    this.texCtx.fillRect(0, 0, this.TEX_SIZE, this.TEX_SIZE);

    // Upload placeholder immediately so the globe renders (dark ocean)
    this.uploadTexture(this.texCanvas);

    // Load base zoom-2 world map (4×4 = 16 tiles)
    this.loadBaseTiles();
  }

  private loadBaseTiles(): void {
    const z = this.BASE_ZOOM;
    const n = Math.pow(2, z); // 4
    const tileSize = this.TEX_SIZE / n; // 1024 per tile at 4096 texture
    let loaded = 0;
    const total = n * n;

    for (let tx = 0; tx < n; tx++) {
      for (let ty = 0; ty < n; ty++) {
        this.loadTile(z, tx, ty, (img) => {
          if (img) {
            this.texCtx.drawImage(img, tx * tileSize, ty * tileSize, tileSize, tileSize);
          }
          loaded++;
          if (loaded === total) {
            this.uploadTexture(this.texCanvas);
          }
        });
      }
    }
  }

  /**
   * Load detail tiles for the current view center at the appropriate zoom level.
   * Called from the render loop when camDist changes significantly or the view rotates.
   */
  private updateDetailTiles(): void {
    const tileZoom = this.camDistToTileZoom();
    const [centerLon, centerLat] = this.getCenterLonLat();

    // Refresh threshold: tighter at high zoom so tiles update as you pan
    const threshold = tileZoom >= 10 ? 0.3 : tileZoom >= 7 ? 1.0 : 2.0;
    const lonDiff = Math.abs(centerLon - this.lastDetailCenterLon);
    const latDiff = Math.abs(centerLat - this.lastDetailCenterLat);
    const zoomChanged = tileZoom !== this.lastDetailZoom;
    const movedEnough = lonDiff > threshold || latDiff > threshold;

    if (!zoomChanged && !movedEnough) return;
    if (tileZoom <= this.BASE_ZOOM || tileZoom >= this.SATELLITE_TILE_ZOOM_MIN) return;

    this.lastDetailZoom = tileZoom;
    this.lastDetailCenterLon = centerLon;
    this.lastDetailCenterLat = centerLat;

    // How many tiles to load around center depends on zoom level.
    // At zoom 3-5 we need a wide patch; at zoom 10+ just the immediate area.
    // The visible angular extent shrinks as camDist approaches 1.
    const fovDeg = 35;
    const halfFovRad = (fovDeg / 2) * Math.PI / 180;
    // Angular radius of visible area on the sphere surface
    const visibleAngleDeg = Math.asin(Math.sin(halfFovRad) * this.camDist) * 180 / Math.PI;
    // Degrees per tile at this zoom
    const degPerTile = 360 / Math.pow(2, tileZoom);
    // Radius in tiles needed to cover the visible area, plus 1 for margin
    const radius = Math.min(4, Math.ceil(visibleAngleDeg / degPerTile) + 1);

    const [cx, cy] = this.lonLatToTile(centerLon, centerLat, tileZoom);
    const n = Math.pow(2, tileZoom);

    const tilesToLoad: Array<{ tx: number; ty: number }> = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = ((cx + dx) % n + n) % n;
        const ty = Math.max(0, Math.min(n - 1, cy + dy));
        tilesToLoad.push({ tx, ty });
      }
    }

    let loaded = 0;
    const total = tilesToLoad.length;
    let anyDrawn = false;

    for (const { tx, ty } of tilesToLoad) {
      this.loadTile(tileZoom, tx, ty, (img) => {
        if (img) {
          this.drawDetailTile(img, tx, ty, tileZoom);
          anyDrawn = true;
        }
        loaded++;
        if (loaded === total && anyDrawn) {
          this.uploadTexture(this.texCanvas);
        }
      });
    }
  }

  /**
   * Draw a single detail tile into the equirectangular texture canvas.
   * Converts the tile's Mercator bounds to equirectangular UV coords.
   */
  private drawDetailTile(img: HTMLImageElement, tx: number, ty: number, z: number): void {
    const n = Math.pow(2, z);

    // Tile lon bounds
    const lonMin = (tx / n) * 360 - 180;
    const lonMax = ((tx + 1) / n) * 360 - 180;

    // Tile lat bounds: Mercator → geographic
    const mercMax = Math.PI - (2 * Math.PI * ty) / n;
    const mercMin = Math.PI - (2 * Math.PI * (ty + 1)) / n;
    const latMax = (2 * Math.atan(Math.exp(mercMax)) - Math.PI / 2) * 180 / Math.PI;
    const latMin = (2 * Math.atan(Math.exp(mercMin)) - Math.PI / 2) * 180 / Math.PI;

    // Map to texture canvas UV (equirectangular)
    const uMin = (lonMin + 180) / 360;
    const uMax = (lonMax + 180) / 360;
    const vMin = 1 - (latMax + 90) / 180;
    const vMax = 1 - (latMin + 90) / 180;

    const destX = Math.round(uMin * this.TEX_SIZE);
    const destY = Math.round(vMin * this.TEX_SIZE);
    const destW = Math.max(1, Math.round((uMax - uMin) * this.TEX_SIZE));
    const destH = Math.max(1, Math.round((vMax - vMin) * this.TEX_SIZE));

    if (destW <= 0 || destH <= 0) return;

    // Decode the tile into a temp canvas at its native 256×256
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = 256; srcCanvas.height = 256;
    const srcCtx = srcCanvas.getContext('2d')!;
    srcCtx.drawImage(img, 0, 0, 256, 256);
    const srcData = srcCtx.getImageData(0, 0, 256, 256).data;

    // Build the destination image data with Mercator→equirectangular remap
    const outData = this.texCtx.createImageData(destW, destH);
    const out = outData.data;

    for (let row = 0; row < destH; row++) {
      // Geographic lat for this destination row
      const latDeg = latMax - (row / destH) * (latMax - latMin);
      const latRad = latDeg * Math.PI / 180;

      // Mercator Y for this lat, normalised 0→1 within the tile (0=top)
      const mercY = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
      const srcFrac = (mercMax - mercY) / (mercMax - mercMin);
      const srcRow = Math.round(srcFrac * 255);
      if (srcRow < 0 || srcRow > 255) continue;

      const srcRowOff = srcRow * 256 * 4;
      const dstRowOff = row * destW * 4;

      for (let col = 0; col < destW; col++) {
        // Source column: scale col to 0-255
        const srcCol = Math.round((col / destW) * 255);
        const si = srcRowOff + srcCol * 4;
        const di = dstRowOff + col * 4;
        out[di]     = srcData[si];
        out[di + 1] = srcData[si + 1];
        out[di + 2] = srcData[si + 2];
        out[di + 3] = 255;
      }
    }

    this.texCtx.putImageData(outData, destX, destY);
  }

private loadTile(z: number, tx: number, ty: number, cb: (img: HTMLImageElement | null) => void): void {
    const key = `${z}/${tx}/${ty}`;
    const cached = this.tileCache.get(key);
    if (cached instanceof HTMLImageElement) { cb(cached); return; }
    if (cached === 'loading') return; // already in flight, skip duplicate
    if (cached === 'error')   { cb(null); return; }

    this.tileCache.set(key, 'loading');

    // First try to get from our database cache
    this.tileCacheService.getTile(z, tx, ty).subscribe({
      next: (response: { imageData?: string }) => {
        if (response && response.imageData) {
          // Found in cache - load from base64 data
          const img = new Image();
          img.onload = () => { this.tileCache.set(key, img); cb(img); };
          img.onerror = () => { 
            // Failed to load cached image, fetch from external API
            this.fetchExternalTile(z, tx, ty, key, cb);
          };
          img.src = response.imageData;
        } else {
          // Not found in cache, fetch from external API
          this.fetchExternalTile(z, tx, ty, key, cb);
        }
      },
      error: () => {
        // Error or not found in cache, fetch from external API
        this.fetchExternalTile(z, tx, ty, key, cb);
      }
    });
  }

  private fetchExternalTile(z: number, tx: number, ty: number, key: string, cb: (img: HTMLImageElement | null) => void): void {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.tileCache.set(key, img);
      // Save to our database cache
      this.saveTileToCache(z, tx, ty, img);
      cb(img);
    };
    img.onerror = () => { this.tileCache.set(key, 'error'); cb(null); };
    img.src = `${this.SATELLITE_TILE_URL}/${z}/${ty}/${tx}`;
  }

  private saveTileToCache(z: number, tx: number, ty: number, img: HTMLImageElement): void {
    try {
      // Convert image to data URL for storage
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      
      this.tileCacheService.saveTile(z, tx, ty, dataUrl);
    } catch {
      // Silently fail - not critical
    }
  }

  private uploadTexture(canvas: HTMLCanvasElement): void {
    const gl = this.gl;
    if (!gl) return;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  }

  // -------------------------------------------------------------------------
  // Render loop
  // -------------------------------------------------------------------------
  private loop(): void {
    if (this.destroyed) return;
    this.rafId = requestAnimationFrame(() => this.loop());

    // Smooth zoom
    this.camDist += (this.camDistTarget - this.camDist) * 0.1;

    // Load detail tiles whenever we're zoomed in past the base level
    const tileZoom = this.camDistToTileZoom();
    if (tileZoom > this.BASE_ZOOM) {
      this.updateDetailTiles();
    }

    this.resizeCanvas();
    this.renderGlobe();
    this.renderSatelliteDetail();
    this.renderPins();
  }

  private resizeCanvas(): void {
    const gc = this.globeCanvasRef.nativeElement;
    const dc = this.detailCanvasRef.nativeElement;
    const pc = this.pinCanvasRef.nativeElement;
    const w  = gc.clientWidth;
    const h  = gc.clientHeight;
    if (gc.width !== w || gc.height !== h) {
      gc.width  = w;
      gc.height = h;
      dc.width  = w;
      dc.height = h;
      pc.width  = w;
      pc.height = h;
    }
  }

  private renderGlobe(): void {
    const gl = this.gl;
    if (!gl) return;
    const canvas = this.globeCanvasRef.nativeElement;
    const w = canvas.width;
    const h = canvas.height;

    gl.viewport(0, 0, w, h);
    // Only clear when not actively dragging - keeps previous frame visible during interaction
    if (!this.isDragging) {
      gl.clearColor(0, 0, 0.05, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    gl.useProgram(this.prog);

    // Uniforms
    gl.uniform1i(gl.getUniformLocation(this.prog, 'u_tex'), 0);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'u_camDist'), this.camDist);
    gl.uniform2f(gl.getUniformLocation(this.prog, 'u_resolution'), w, h);

    // Pass inverse rotation matrix as mat3 (column-major for GLSL)
    // this.rot is row-major [r00,r01,r02, r10,r11,r12, r20,r21,r22]
    // The shader maps view-space hits back to world-space texture coords, so it needs R^T.
    const R = this.rot;
    const rotColMajor = new Float32Array([
      R[0], R[1], R[2],
      R[3], R[4], R[5],
      R[6], R[7], R[8]
    ]);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.prog, 'u_rot'), false, rotColMajor);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

private renderSatelliteDetail(): void {
    const canvas = this.detailCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    const z = this.camDistToTileZoom();
    if (z < this.SATELLITE_TILE_ZOOM_MIN) return;

    // Don't clear - keep previous frame visible while loading new tiles

    const [centerLon, centerLat] = this.getCenterLonLat();
    const center = this.lonLatToWorldPixel(centerLon, centerLat, z);
    const topLeftX = center.x - w / 2;
    const topLeftY = center.y - h / 2;
    const firstTileX = Math.floor(topLeftX / 256);
    const firstTileY = Math.floor(topLeftY / 256);
    const lastTileX = Math.floor((topLeftX + w) / 256);
    const lastTileY = Math.floor((topLeftY + h) / 256);
    const tileCount = Math.pow(2, z);

    const alpha = Math.max(0, Math.min(1, (z - this.SATELLITE_TILE_ZOOM_MIN + 1) / 2));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, w, h);

    for (let ty = firstTileY; ty <= lastTileY; ty++) {
      if (ty < 0 || ty >= tileCount) continue;

      for (let tx = firstTileX; tx <= lastTileX; tx++) {
        const wrappedTx = ((tx % tileCount) + tileCount) % tileCount;
        const dx = Math.round(tx * 256 - topLeftX);
        const dy = Math.round(ty * 256 - topLeftY);

        const cached = this.tileCache.get(`${z}/${wrappedTx}/${ty}`);
        if (cached instanceof HTMLImageElement) {
          ctx.drawImage(cached, dx, dy, 256, 256);
        } else if (!cached) {
          this.loadTile(z, wrappedTx, ty, (img) => {
            if (!img || this.destroyed) return;
            this.renderSatelliteDetail();
          });
        }
      }
    }

    const gradient = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.65);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Pin rendering on 2D overlay canvas
  // -------------------------------------------------------------------------
  private renderPins(): void {
    const canvas = this.pinCanvasRef.nativeElement;
    const ctx    = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    for (const story of this.filteredStories) {
      const location = this.resolveStoryLocation(story);
      if (!location) continue;

      const proj = this.projectPin(location.lat, location.lon, w, h);
      if (!proj) continue;

      const { x, y } = proj;

      // Glow
      const grad = ctx.createRadialGradient(x, y, 0, x, y, 10);
      grad.addColorStop(0, 'rgba(255, 80, 80, 0.9)');
      grad.addColorStop(1, 'rgba(255, 80, 80, 0)');
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Dot
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4444';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      // Label on hover
      if (this.hoveredPin && this.hoveredPin.label === location.label) {
        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 3;
        const label = location.label;
        ctx.strokeText(label, x + 8, y - 8);
        ctx.fillText(label, x + 8, y - 8);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Project lat/lng to screen coords
  // -------------------------------------------------------------------------
  private projectPin(
    latDeg: number, lngDeg: number, w: number, h: number
  ): { x: number; y: number } | null {
    const lat = latDeg * Math.PI / 180;
    const lng = lngDeg * Math.PI / 180;

    // 3D point on unit sphere (Y-up, Z toward camera at lon=0)
    const px = Math.cos(lat) * Math.sin(lng);
    const py = Math.sin(lat);
    const pz = Math.cos(lat) * Math.cos(lng);

    // Apply globe rotation (R is row-major 3×3)
    const R  = this.rot;
    const rx = R[0]*px + R[1]*py + R[2]*pz;
    const ry = R[3]*px + R[4]*py + R[5]*pz;
    const rz = R[6]*px + R[7]*py + R[8]*pz;

    // Only show if facing camera.
    if (rz < -0.1) return null;

    // Perspective projection
    const d   = this.camDist;
    const fov = 35 * Math.PI / 180;
    const f   = 1.0 / Math.tan(fov / 2);
    const asp = w / h;
    const denom = d - rz; // distance from camera to point along Z
    const clipX = (f / asp) * rx / denom;
    const clipY = f * ry / denom;

    return {
      x: (clipX * 0.5 + 0.5) * w,
      y: (1 - (clipY * 0.5 + 0.5)) * h
    };
  }

  // -------------------------------------------------------------------------
  // Mouse / touch interaction
  // -------------------------------------------------------------------------
  private bindMouseEvents(): void {
    const gc = this.globeCanvasRef.nativeElement;
    gc.addEventListener('mousedown',  (e) => this.onMouseDown(e));
    gc.addEventListener('mousemove',  (e) => this.onMouseMove(e));
    gc.addEventListener('mouseup',    ()  => this.onMouseUp());
    gc.addEventListener('mouseleave', ()  => this.onMouseUp());
    gc.addEventListener('wheel',      (e) => this.onWheel(e), { passive: false });
  }

  private bindTouchEvents(): void {
    const gc = this.globeCanvasRef.nativeElement;
    let lastTouchDist = 0;
    gc.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.lastX = e.touches[0].clientX;
        this.lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        lastTouchDist = this.touchDist(e);
      }
    }, { passive: true });
    gc.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && this.isDragging) {
        const dx = e.touches[0].clientX - this.lastX;
        const dy = e.touches[0].clientY - this.lastY;
        this.lastX = e.touches[0].clientX;
        this.lastY = e.touches[0].clientY;
        this.applyDrag(dx, dy);
      } else if (e.touches.length === 2) {
        const dist = this.touchDist(e);
        const delta = lastTouchDist - dist;
        lastTouchDist = dist;
        this.camDistTarget = Math.max(this.CAM_MIN, Math.min(this.CAM_MAX,
          this.camDistTarget + delta * 0.004));
        this.syncSliderFromDist();
      }
    }, { passive: true });
    gc.addEventListener('touchend', () => { this.isDragging = false; }, { passive: true });
  }

  private touchDist(e: TouchEvent): number {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx*dx + dy*dy);
  }

  private onMouseDown(e: MouseEvent): void {
    this.isDragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isDragging) {
      // Check hover for pins
      this.checkPinHover(e);
      return;
    }
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.applyDrag(dx, dy);
  }

  private onMouseUp(): void {
    this.isDragging = false;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.zoomSliderValue = Math.max(0, Math.min(100, this.zoomSliderValue - e.deltaY * 0.035));
    this.camDistTarget = this.zoomSliderToCamDist(this.zoomSliderValue);
  }

  private applyDrag(dx: number, dy: number): void {
    // Make drag feel like grabbing the sphere surface.
    // The globe's apparent radius on screen (in pixels) is:
    //   r_px = (h/2) * f / camDist   where f = 1/tan(fov/2)
    // Dragging r_px pixels should rotate by ~1 radian (half-turn across diameter).
    // So: angle = drag_px / r_px = drag_px * camDist / (h/2 * f)
    const canvas = this.globeCanvasRef.nativeElement;
    const h = canvas.clientHeight || 600;
    const fov = 35 * Math.PI / 180;
    const f = 1.0 / Math.tan(fov / 2);
    // Globe apparent radius in pixels
    const rPx = (h / 2) * f / this.camDist;
    // 1 pixel of drag = 1/rPx radians of rotation
    const speed = 1.0 / rPx;

    const ax = dy * speed; // pitch
    const ay = dx * speed; // yaw

    const cx = Math.cos(ax), sx = Math.sin(ax);
    const cy = Math.cos(ay), sy = Math.sin(ay);

    const Rx = new Float32Array([1, 0, 0,  0, cx, -sx,  0, sx, cx]);
    const Ry = new Float32Array([cy, 0, sy,  0, 1, 0,  -sy, 0, cy]);

    this.rot = this.mul3(this.mul3(Ry, Rx), this.rot) as Float32Array<ArrayBuffer>;
  }

  // -------------------------------------------------------------------------
  // Pin hover detection
  // -------------------------------------------------------------------------
  private checkPinHover(e: MouseEvent): void {
    const canvas = this.pinCanvasRef.nativeElement;
    const rect   = canvas.getBoundingClientRect();
    const mx     = e.clientX - rect.left;
    const my     = e.clientY - rect.top;
    const w      = canvas.width;
    const h      = canvas.height;

    this.hoveredPin = null;
    for (const story of this.filteredStories) {
      const location = this.resolveStoryLocation(story);
      if (!location) continue;
      const proj = this.projectPin(location.lat, location.lon, w, h);
      if (!proj) continue;
      const dx = proj.x - mx;
      const dy = proj.y - my;
      if (Math.sqrt(dx*dx + dy*dy) < 12) {
        this.hoveredPin = { label: location.label, x: proj.x, y: proj.y };
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Sync slider value from camDistTarget
  // -------------------------------------------------------------------------
  private syncSliderFromDist(): void {
    this.zoomSliderValue = Math.round(this.camDistToZoomSlider(this.camDistTarget));
  }

  private zoomSliderToCamDist(value: number): number {
    const t = Math.max(0, Math.min(100, value)) / 100;
    const maxSurfaceDist = this.CAM_MAX - 1;
    const minSurfaceDist = this.CAM_MIN - 1;
    return 1 + maxSurfaceDist * Math.pow(minSurfaceDist / maxSurfaceDist, t);
  }

  private camDistToZoomSlider(dist: number): number {
    const surfaceDist = Math.max(this.CAM_MIN - 1, Math.min(this.CAM_MAX - 1, dist - 1));
    const maxSurfaceDist = this.CAM_MAX - 1;
    const minSurfaceDist = this.CAM_MIN - 1;
    return 100 * Math.log(surfaceDist / maxSurfaceDist) / Math.log(minSurfaceDist / maxSurfaceDist);
  }

  private resolveStoryLocation(story: Story): { lat: number; lon: number; label: string; precision: 'city' | 'country' } | null {
    const cityCoords = this.lookupCityCoords(story.city, story.country);
    if (cityCoords) {
      return {
        lat: cityCoords[0],
        lon: cityCoords[1],
        label: this.formatLocationLabel(story.city, story.country),
        precision: 'city',
      };
    }

    const countryCoords = this.lookupCoords(this.COUNTRY_COORDS, story.country);
    if (countryCoords && story.country) {
      return {
        lat: countryCoords[0],
        lon: countryCoords[1],
        label: story.country,
        precision: 'country',
      };
    }

    return null;
  }

  private lookupCityCoords(city?: string, country?: string): [number, number] | undefined {
    if (!city) return undefined;

    const trimmedCity = city.trim();
    const trimmedCountry = country?.trim();
    const cityPart = trimmedCity.split(',')[0]?.trim();
    const candidates = [
      trimmedCountry ? `${trimmedCity}, ${trimmedCountry}` : '',
      trimmedCity,
      cityPart && trimmedCountry ? `${cityPart}, ${trimmedCountry}` : '',
      cityPart || '',
    ].filter(Boolean);

    for (const candidate of candidates) {
      const coords = this.CITY_COORDS[this.normalizeLocationName(candidate)];
      if (coords) return coords;
    }

    return undefined;
  }

  private lookupCoords(coords: Record<string, [number, number]>, name?: string): [number, number] | undefined {
    if (!name) return undefined;

    const trimmedName = name.trim();
    const direct = coords[trimmedName];
    if (direct) return direct;

    const normalized = this.normalizeLocationName(trimmedName);
    const match = Object.entries(coords).find(([key]) => this.normalizeLocationName(key) === normalized);
    return match?.[1];
  }

  private normalizeLocationName(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private formatLocationLabel(city?: string, country?: string): string {
    const cityLabel = city?.trim();
    const countryLabel = country?.trim();
    if (cityLabel && countryLabel) return `${cityLabel}, ${countryLabel}`;
    return cityLabel || countryLabel || 'Unknown location';
  }

  private lonLatToWorldPixel(lon: number, lat: number, z: number): { x: number; y: number } {
    const tileCount = Math.pow(2, z);
    const sinLat = Math.sin(Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180);
    const x = ((lon + 180) / 360) * tileCount * 256;
    const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * tileCount * 256;
    return { x, y };
  }

  // -------------------------------------------------------------------------
  // Matrix helpers (row-major 3×3)
  // -------------------------------------------------------------------------
  private mul3(a: Float32Array, b: Float32Array): Float32Array {
    const r = new Float32Array(9);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        r[i*3+j] = a[i*3+0]*b[0*3+j] + a[i*3+1]*b[1*3+j] + a[i*3+2]*b[2*3+j];
      }
    }
    return r;
  }

  // -------------------------------------------------------------------------
  // Host listeners for global mouse-up (drag release outside canvas)
  // -------------------------------------------------------------------------
  @HostListener('document:mouseup')
  onDocMouseUp(): void {
    this.isDragging = false;
  }
}
