import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ElementRef, ViewChild, HostListener, NgZone
} from '@angular/core';
import { SocialService } from '../../services/social.service';
import { EncryptionService } from '../../services/encryption.service';
import { Story } from '../../services/datacontracts/social/story';
import { TileCacheService } from '../services/tile-cache.service';

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
uniform mat3      u_rot;
uniform float     u_camDist;
uniform vec2      u_resolution;

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
  @ViewChild('pinCanvas') private pinCanvasRef!: ElementRef<HTMLCanvasElement>;

  // ---- public state -------------------------------------------------------
  zoomSliderValue = 30;
  isLoading = false;

  // ---- WebGL --------------------------------------------------------------
  private gl!: WebGLRenderingContext;
  private prog!: WebGLProgram;
  private tex!: WebGLTexture;

  // ---- rotation (row-major 3×3) -------------------------------------------
  private rot = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  private isDragging = false;
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
  private hoveredPin: { label: string; x: number; y: number } | null = null;

  // ---- stories panel ------------------------------------------------------
  showStoriesPanel = false;
  dateFilterValue = 100;
  filteredStories: Story[] = [];
  private minDate: Date | null = null;
  private maxDate: Date | null = null;

  // ---- coordinates display -------------------------------------------------
  coordsDisplay = '0.00°, 0.00°';

  // ---- tile / texture state -----------------------------------------------
  private readonly BASE_ZOOM = 2;
  private readonly TEX_SIZE = 4096;
  private readonly SATELLITE_ZOOM_MIN = 12;
  private readonly SATELLITE_ZOOM_MAX = 19;

  private texCanvas!: HTMLCanvasElement;
  private texCtx!: CanvasRenderingContext2D;

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
    'new york': [40.7128, -74.0060], 'los angeles': [34.0522, -118.2437],
    'chicago': [41.8781, -87.6298], 'london': [51.5074, -0.1278],
    'london, united kingdom': [51.5074, -0.1278], 'paris': [48.8566, 2.3522],
    'berlin': [52.5200, 13.4050], 'tokyo': [35.6762, 139.6503],
    'sydney': [-33.8688, 151.2093], 'toronto': [43.6532, -79.3832],
    'montreal': [45.5017, -73.5673], 'montreal, canada': [45.5017, -73.5673],
    'montreal, quebec': [45.5017, -73.5673], 'montreal, qc': [45.5017, -73.5673],
    'vancouver': [49.2827, -123.1207], 'ottawa': [45.4215, -75.6972],
    'quebec city': [46.8139, -71.2080], 'calgary': [51.0447, -114.0719],
    'edmonton': [53.5461, -113.4938], 'winnipeg': [49.8951, -97.1384],
    'halifax': [44.6488, -63.5752], 'san francisco': [37.7749, -122.4194],
    'seattle': [47.6062, -122.3321], 'miami': [25.7617, -80.1918],
    'boston': [42.3601, -71.0589], 'dubai': [25.2048, 55.2708],
    'singapore': [1.3521, 103.8198], 'hong kong': [22.3193, 114.1694],
    'mumbai': [19.0760, 72.8777], 'delhi': [28.7041, 77.1025],
    'sao paulo': [-23.5505, -46.6333], 'mexico city': [19.4326, -99.1332],
    'buenos aires': [-34.6037, -58.3816], 'moscow': [55.7558, 37.6173],
  };

  constructor(
    private socialService: SocialService,
    private ngZone: NgZone,
    private encryptionService: EncryptionService,
    private tileCacheService: TileCacheService
  ) { }

  // =========================================================================
  // Lifecycle
  // =========================================================================
  ngOnInit(): void { this.loadStories(); }

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
    const loc = this.resolveStoryLocation(story);
    if (!loc) { console.log('No coords for:', story.country, story.city); return; }
    this.rotateToLocation(loc.lat, loc.lon);
    if (loc.precision === 'city') {
      this.zoomSliderValue = Math.max(this.zoomSliderValue, 78);
      this.camDistTarget = this.zoomSliderToCamDist(this.zoomSliderValue);
    }
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

    // R is row-major, but uniformMatrix3fv(false) treats it as column-major,
    // so R is effectively transposed in the shader.
    // We must manually compute R^T * (0,0,-1)

    const vx = -R[2];
    const vy = -R[5];
    const vz = -R[8];

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
    this.uploadTexture();
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

    // Compute which tiles cover the visible cap.
    const capDeg = this.visibleCapDeg();
    const degPerTile = 360 / Math.pow(2, tileZoom);
    // Calculate radius - ensure at least 1 tile even at high zoom
    const calculatedRadius = Math.ceil(capDeg / degPerTile);
    const radius = Math.max(1, Math.min(5, calculatedRadius + 1));

    const [cx, cy] = this.lonLatToTile(centerLon, centerLat, tileZoom);
    const n = Math.pow(2, tileZoom);

    console.log(`updateDetailTiles: zoom=${tileZoom}, center=(${cx},${cy}), radius=${radius}, centerLonLat=(${centerLon.toFixed(4)},${centerLat.toFixed(4)}), capDeg=${capDeg.toFixed(2)}, degPerTile=${degPerTile.toFixed(4)}`);

    const needed: Array<{ tx: number; ty: number; key: string }> = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = ((cx + dx) % n + n) % n;
        const ty = Math.max(0, Math.min(n - 1, cy + dy));
        const key = `${tileZoom}/${tx}/${ty}`;
        needed.push({ tx, ty, key });
      }
    }

    // Register the new view's key set so late-arriving callbacks can self-discard.
    this.currentViewKeys = new Set(needed.map(t => t.key));

    // Repaint the texture synchronously with whatever is already decoded.
    this.repaintTexture(tileZoom, needed);

    // Request all tiles; the service returns immediately from its image cache
    // if the tile was previously decoded, otherwise queues a batch fetch.
    for (const { tx, ty, key } of needed) {
      const ctZ = tileZoom, ctX = tx, ctY = ty, ctKey = key; // capture
      this.pendingTiles++;
      this.isLoading = true;

      this.tileCacheService.getTile(ctZ, ctX, ctY, (img) => {
        this.pendingTiles = Math.max(0, this.pendingTiles - 1);
        if (this.pendingTiles === 0) this.isLoading = false;

        // Discard if the view has moved on while we were waiting.
        if (!this.currentViewKeys.has(ctKey)) return;
        if (!img) return;

        this.paintTile(img, ctX, ctY, ctZ);
        this.uploadTexture();
      });
    }
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
    this.texCtx.fillStyle = '#001a33';
    this.texCtx.fillRect(0, 0, this.TEX_SIZE, this.TEX_SIZE);

    // Base layer (zoom 2) - only draw when NOT at detail zoom level
    // At detail zoom, base tiles would paint underneath and might be wasted
    if (detailZoom <= this.BASE_ZOOM + 2) {
      const bz = this.BASE_ZOOM;
      const bn = Math.pow(2, bz);
      for (let ty = 0; ty < bn; ty++) {
        for (let tx = 0; tx < bn; tx++) {
          const btx = tx, bty = ty;
          this.tileCacheService.getTile(bz, btx, bty, (img) => {
            if (img) {
              this.paintTile(img, btx, bty, bz);
              this.uploadTexture();
            }
          });
        }
      }
    }

    // Detail layer — already-cached only (no new requests here) - draws on TOP of base
    for (const { tx, ty } of detailTiles) {
      const dtx = tx, dty = ty;
      this.tileCacheService.getTile(detailZoom, dtx, dty, (img) => {
        if (img) {
          this.paintTile(img, dtx, dty, detailZoom);
          this.uploadTexture();
        }
      });
    }
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
    gl.uniform1f(gl.getUniformLocation(this.prog, 'u_camDist'), this.camDist);
    gl.uniform2f(gl.getUniformLocation(this.prog, 'u_resolution'), w, h);

    // this.rot is row-major.  uniformMatrix3fv(transpose=false) expects
    // column-major, so passing this.rot as-is effectively transposes it —
    // which is exactly what the shader needs (it applies R^T to the hit
    // point to map from view space back to world/texture space).
    gl.uniformMatrix3fv(gl.getUniformLocation(this.prog, 'u_rot'), false, this.rot);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
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

    for (const story of this.filteredStories) {
      const loc = this.resolveStoryLocation(story);
      if (!loc) continue;
      const proj = this.projectPin(loc.lat, loc.lon, w, h);
      if (!proj) continue;
      const { x, y } = proj;

      const grad = ctx.createRadialGradient(x, y, 0, x, y, 10);
      grad.addColorStop(0, 'rgba(255, 80, 80, 0.9)');
      grad.addColorStop(1, 'rgba(255, 80, 80, 0)');
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4444';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      if (this.hoveredPin?.label === loc.label) {
        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 3;
        ctx.strokeText(loc.label, x + 8, y - 8);
        ctx.fillText(loc.label, x + 8, y - 8);
      }
    }
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
    this.lastX = e.clientX; this.lastY = e.clientY;
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isDragging) { this.checkPinHover(e); return; }
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX; this.lastY = e.clientY;
    this.applyDrag(dx, dy);
  }

  private onMouseUp(): void { this.isDragging = false; }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.zoomSliderValue = Math.max(0, Math.min(100, this.zoomSliderValue - e.deltaY * 0.035));
    this.camDistTarget = this.zoomSliderToCamDist(this.zoomSliderValue);
  }

  private applyDrag(dx: number, dy: number): void {
    const h = this.globeCanvasRef.nativeElement.clientHeight || 600;
    const fov = 35 * Math.PI / 180;
    const f = 1.0 / Math.tan(fov / 2);
    const speed = 1.0 / ((h / 2) * f / this.camDist);
    const ax = dy * speed, ay = dx * speed;
    const cx = Math.cos(ax), sx = Math.sin(ax);
    const cy = Math.cos(ay), sy = Math.sin(ay);
    const Rx = new Float32Array([1, 0, 0, 0, cx, -sx, 0, sx, cx]);
    const Ry = new Float32Array([cy, 0, sy, 0, 1, 0, -sy, 0, cy]);
    this.rot = this.mul3(this.mul3(Ry, Rx), this.rot) as Float32Array<ArrayBuffer>;
  }

  private checkPinHover(e: MouseEvent): void {
    const canvas = this.pinCanvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const w = canvas.width, h = canvas.height;
    this.hoveredPin = null;
    for (const story of this.filteredStories) {
      const loc = this.resolveStoryLocation(story);
      if (!loc) continue;
      const proj = this.projectPin(loc.lat, loc.lon, w, h);
      if (!proj) continue;
      const dx = proj.x - mx, dy = proj.y - my;
      if (Math.sqrt(dx * dx + dy * dy) < 12) {
        this.hoveredPin = { label: loc.label, x: proj.x, y: proj.y };
        break;
      }
    }
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