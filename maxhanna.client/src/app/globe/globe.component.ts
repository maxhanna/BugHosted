import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ElementRef, ViewChild, HostListener, NgZone
} from '@angular/core';
import { SocialService } from '../../services/social.service';
import { Story } from '../../services/datacontracts/social/story';

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
precision mediump float;
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
  private readonly CAM_MIN = 1.002;  // allows zoom 18 (street level)
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

  constructor(private socialService: SocialService, private ngZone: NgZone) {}

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
    // 0 → CAM_MAX (far), 100 → CAM_MIN (close)
    const t = val / 100;
    this.camDistTarget = this.CAM_MAX - t * (this.CAM_MAX - this.CAM_MIN);
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
        this.stories = resp.stories.filter(s => !!s.country);
        
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
    // Try to find coordinates for the story's location
    const country = story.country;
    const city = story.city;
    
    // First try exact country match
    let lat: number | undefined;
    let lon: number | undefined;
    
    if (country) {
      lat = this.COUNTRY_COORDS[country]?.[0];
      lon = this.COUNTRY_COORDS[country]?.[1];
    }
    
    // Fallback: try city name if country not found
    if ((lat === undefined || lon === undefined) && city) {
      // Some common city coordinates
      const cityCoords: Record<string, [number, number]> = {
        'New York': [40.71, -74.01], 'Los Angeles': [34.05, -118.24], 'Chicago': [41.88, -87.63],
        'London': [51.51, -0.13], 'Paris': [48.86, 2.35], 'Berlin': [52.52, 13.40],
        'Tokyo': [35.68, 139.69], 'Sydney': [-33.87, 151.21], 'Toronto': [43.65, -79.38],
        'San Francisco': [37.77, -122.42], 'Seattle': [47.61, -122.33], 'Miami': [25.76, -80.19],
        'Boston': [42.36, -71.06], 'Vancouver': [49.28, -123.12], 'Montreal': [45.50, -73.57],
        'Dubai': [25.20, 55.27], 'Singapore': [1.35, 103.82], 'Hong Kong': [22.32, 114.17],
        'Mumbai': [19.08, 72.88], 'Delhi': [28.70, 77.10], 'São Paulo': [-23.55, -46.63],
        'Mexico City': [19.43, -99.13], 'Buenos Aires': [-34.60, -58.38], 'Moscow': [55.76, 37.62],
      };
      lat = cityCoords[city]?.[0];
      lon = cityCoords[city]?.[1];
    }
    
    if (lat !== undefined && lon !== undefined) {
      this.rotateToLocation(lat, lon);
    } else {
      console.log('No coordinates found for story:', country, city);
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
    // Map camDist to OSM zoom level:
    //   camDist 8.0  → zoom 2  (whole world)
    //   camDist 2.0  → zoom 5
    //   camDist 1.5  → zoom 7
    //   camDist 1.2  → zoom 10
    //   camDist 1.05 → zoom 14
    //   camDist 1.01 → zoom 17
    //   camDist 1.002→ zoom 18 (street level)
    const surfaceDist = Math.max(0.001, this.camDist - 1.0);
    const z = Math.round(2 + Math.log2(7.0 / surfaceDist));
    return Math.max(2, Math.min(18, z));
  }

  /** Get the lon/lat currently at the center of the view (facing the camera) */
  private getCenterLonLat(): [number, number] {
    // The point facing the camera is the one that maps to (0,0,1) in rotated space.
    // In world space that's R^T * (0,0,1) = third column of R (row-major: R[2], R[5], R[8])
    const R = this.rot;
    const px = R[2], py = R[5], pz = R[8];
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
    if (tileZoom <= this.BASE_ZOOM) return;

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
    const radius = Math.ceil(visibleAngleDeg / degPerTile) + 1;

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
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => { this.tileCache.set(key, img); cb(img); };
    img.onerror = () => { this.tileCache.set(key, 'error'); cb(null); };
    img.src = `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`;
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
    this.renderPins();
  }

  private resizeCanvas(): void {
    const gc = this.globeCanvasRef.nativeElement;
    const pc = this.pinCanvasRef.nativeElement;
    const w  = gc.clientWidth;
    const h  = gc.clientHeight;
    if (gc.width !== w || gc.height !== h) {
      gc.width  = w;
      gc.height = h;
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
    gl.clearColor(0, 0, 0.05, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.prog);

    // Uniforms
    gl.uniform1i(gl.getUniformLocation(this.prog, 'u_tex'), 0);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'u_camDist'), this.camDist);
    gl.uniform2f(gl.getUniformLocation(this.prog, 'u_resolution'), w, h);

    // Pass rotation matrix as mat3 (column-major for GLSL)
    // this.rot is row-major [r00,r01,r02, r10,r11,r12, r20,r21,r22]
    // GLSL mat3 column-major: col0=[r00,r10,r20], col1=[r01,r11,r21], col2=[r02,r12,r22]
    const R = this.rot;
    const rotColMajor = new Float32Array([
      R[0], R[3], R[6],
      R[1], R[4], R[7],
      R[2], R[5], R[8]
    ]);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.prog, 'u_rot'), false, rotColMajor);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
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

    for (const story of this.stories) {
      if (!story.country) continue;
      const coords = this.COUNTRY_COORDS[story.country];
      if (!coords) continue;

      const proj = this.projectPin(coords[0], coords[1], w, h);
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
      if (this.hoveredPin && this.hoveredPin.label === story.country) {
        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 3;
        const label = story.country;
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

    // Only show if facing camera (rz < 0 means toward camera since camera is at +Z)
    if (rz > -0.1) return null;

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
          this.camDistTarget + delta * 0.01));
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
    const delta = e.deltaY * 0.005;
    this.camDistTarget = Math.max(this.CAM_MIN, Math.min(this.CAM_MAX,
      this.camDistTarget + delta));
    this.syncSliderFromDist();
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
    for (const story of this.stories) {
      if (!story.country) continue;
      const coords = this.COUNTRY_COORDS[story.country];
      if (!coords) continue;
      const proj = this.projectPin(coords[0], coords[1], w, h);
      if (!proj) continue;
      const dx = proj.x - mx;
      const dy = proj.y - my;
      if (Math.sqrt(dx*dx + dy*dy) < 12) {
        this.hoveredPin = { label: story.country, x: proj.x, y: proj.y };
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Sync slider value from camDistTarget
  // -------------------------------------------------------------------------
  private syncSliderFromDist(): void {
    const t = (this.CAM_MAX - this.camDistTarget) / (this.CAM_MAX - this.CAM_MIN);
    this.zoomSliderValue = Math.round(t * 100);
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
