/// <reference types="@types/node" />
/// <reference lib="dom" />

export interface TrackPoint {
  x: number; z: number;
  dirX: number; dirZ: number;
  width: number;
  isStartFinish?: boolean;
}

export interface RacingCarVertex {
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
}

export class RacingRenderer {
  private gl: WebGL2RenderingContext;
  private prog!: WebGLProgram;
  private projLoc!: WebGLUniformLocation;
  private viewLoc!: WebGLUniformLocation;
  private modelLoc!: WebGLUniformLocation;
  private colorLoc!: WebGLUniformLocation;
  private textureLoc!: WebGLUniformLocation;
  private hasTexLoc!: WebGLUniformLocation;
  private lightDirLoc!: WebGLUniformLocation;
  private ambientLoc!: WebGLUniformLocation;
  private fogColorLoc!: WebGLUniformLocation;
  private viewPosLoc!: WebGLUniformLocation;
  private useVertexColor!: WebGLUniformLocation;

  private trackVao!: WebGLVertexArrayObject;
  private trackCount = 0;
  private sceneryVao!: WebGLVertexArrayObject;
  private sceneryVbo!: WebGLBuffer;
  private sceneryIbo!: WebGLBuffer;
  private sceneryCount = 0;
  private carVao!: WebGLVertexArrayObject;
  private carCount = 0;
  private wheelVao!: WebGLVertexArrayObject;
  private wheelCount = 0;
  private rearWheelVao!: WebGLVertexArrayObject;
  private rearWheelCount = 0;
  private barrierVao!: WebGLVertexArrayObject;
  private barrierCount = 0;
  private finishVao!: WebGLVertexArrayObject;
  private finishCount = 0;

  private whiteTex!: WebGLTexture;
  private asphaltTex!: WebGLTexture;
  private grassTex!: WebGLTexture;
  private trackTex!: WebGLTexture;

  viewMatrix = new Float32Array(16);
  projMatrix = new Float32Array(16);
  modelMatrix = new Float32Array(16);

  private _trackPoints: TrackPoint[] = [];
  trackLen = 0;
  totalTrackDist = 0;

  // Shadow
  private shadowFBO!: WebGLFramebuffer;
  private shadowTex!: WebGLTexture;
  private shadowProg!: WebGLProgram;
  private shadowLightLoc!: WebGLUniformLocation;
  private shadowModelLoc!: WebGLUniformLocation;
  private shadowSize = 1024;
  private lightSpace = new Float32Array(16);
  private lightView = new Float32Array(16);
  private lightProj = new Float32Array(16);

  sunDir: [number, number, number] = [0.4, 0.7, 0.5];
  sunColor: [number, number, number] = [1.0, 0.95, 0.85];
  ambientColor: [number, number, number] = [0.25, 0.25, 0.3];
  fogColor: [number, number, number] = [0.4, 0.45, 0.5];
  elapsed = 0;

  // Per-track environment theme (set before each race via setTheme). Drives the
  // sky palette, lighting and the scenery kit (ocean/beach/city buildings).
  theme: 'default' | 'miami' | 'city' | 'mountain' = 'default';
  // Sky palette (top / horizon / bottom) used by the sky shader.
  skyTop: [number, number, number] = [0.1, 0.2, 0.5];
  skyHorizon: [number, number, number] = [0.7, 0.75, 0.85];
  skyBottom: [number, number, number] = [0.4, 0.45, 0.5];

  // Track generation parameters
  readonly TRACK_SEGMENTS = 200;
  readonly TRACK_WIDTH = 16;
  readonly TRACK_LENGTH = 2000;

  // Car state for rendering
  carX = 0; carY = 0.3; carZ = 0;
  carYaw = 0; carPitch = 0; carRoll = 0;
  carSpeed = 0;

  // Reusable matrices
  private _scratchTranslate: [number, number, number] = [0, 0, 0];
  private _scratchScale: [number, number, number] = [1, 1, 1];

  // Sky VAO
  private skyVao!: WebGLVertexArrayObject;
  private skyProg!: WebGLProgram;
  private skyProjLoc!: WebGLUniformLocation;
  private skyViewLoc!: WebGLUniformLocation;
  private skySunDirLoc!: WebGLUniformLocation;
  private skyTimeLoc!: WebGLUniformLocation;
  private skyTopLoc!: WebGLUniformLocation;
  private skyHorizonLoc!: WebGLUniformLocation;
  private skyBottomLoc!: WebGLUniformLocation;
  private skySunColorLoc!: WebGLUniformLocation;
  private skyGlowColorLoc!: WebGLUniformLocation;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    // Create white texture (pure white so vertex colors show at full brightness)
    this.whiteTex = this.makeTex(1, 1, new Uint8Array([255, 255, 255]));
    this.asphaltTex = this.makeAsphaltTex();
    this.grassTex = this.makeGrassTex();
    this.trackTex = this.makeTrackMarkingsTex();

    this.initShader();
    this.initShadow();
    this.initSky();
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.generateTrack();
    this.buildTrackMesh();
    this.buildScenery();
    this.buildCarMesh();
  }

  private makeTex(w: number, h: number, data: Uint8Array): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, w, h, 0, gl.RGB, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return t;
  }

  private makeAsphaltTex(): WebGLTexture {
    const size = 64;
    const data = new Uint8Array(size * size * 3);
    for (let i = 0; i < size * size; i++) {
      const g = 55 + (i % 13) + ((i * 7) % 9);
      data[i * 3] = g; data[i * 3 + 1] = g; data[i * 3 + 2] = g;
    }
    return this.makeTex(size, size, data);
  }

  private makeGrassTex(): WebGLTexture {
    const size = 64;
    const data = new Uint8Array(size * size * 3);
    for (let i = 0; i < size * size; i++) {
      const g = 60 + (i % 20);
      const r = 20 + (i * 3 % 15);
      data[i * 3] = r; data[i * 3 + 1] = g; data[i * 3 + 2] = 15 + (i % 10);
    }
    return this.makeTex(size, size, data);
  }

  private makeTrackMarkingsTex(): WebGLTexture {
    const size = 128;
    const data = new Uint8Array(size * size * 3);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 3;
        // No baked checkerboard here — the start/finish band is drawn as its own
        // flat-colored quad so it appears exactly once per lap (the old baked
        // column repeated 4× around the track because the road UV wraps 4×/lap).
        if (y < 2 || y > size - 3) {
          // Crisp white edge lines — clear track boundary without being harsh
          data[i] = 215; data[i + 1] = 215; data[i + 2] = 212;
        } else if (y > size / 2 - 2 && y < size / 2 + 2) {
          // Dashed center line — legible but not dominating
          if (x % 24 < 10) { data[i] = 205; data[i + 1] = 205; data[i + 2] = 201; }
          else { data[i] = 62; data[i + 1] = 62; data[i + 2] = 64; }
        } else {
          // Clean, uniform asphalt — no noise banding, no clutter. Just a smooth
          // dark surface so the road reads clearly at speed.
          const n = 56;
          data[i] = n; data[i + 1] = n; data[i + 2] = n + 2;
        }
      }
    }
    return this.makeTex(size, size, data);
  }

  private vsSrc = `#version 300 es
in vec3 aPos;
in vec3 aNormal;
in vec3 aColor;
in vec2 aUV;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform vec3 uColor;
uniform mat3 uNormalMatrix;
out vec4 vColor;
out vec3 vNormal;
out vec3 vWorldPos;
out vec2 vUV;
out float vDepth;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vec4 vp = uView * wp;
  gl_Position = uProj * vp;
  vColor = vec4(aColor * uColor, 1.0);
  vNormal = normalize(uNormalMatrix * aNormal);
  vWorldPos = wp.xyz;
  vDepth = length(vp.xyz);
  vUV = aUV;
}`;

  private fsSrc = `#version 300 es
precision highp float;
in vec4 vColor;
in vec3 vNormal;
in vec3 vWorldPos;
in vec2 vUV;
in float vDepth;
out vec4 FragColor;
uniform vec3 uLightDir;
uniform vec3 uViewPos;
uniform sampler2D uTexture;
uniform bool uHasTexture;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform bool uUseVertexColor;

void main() {
  vec4 base = vColor;
  if (uHasTexture) base *= texture(uTexture, vUV);
  if (!uUseVertexColor) base = vColor;

  vec3 N = normalize(vNormal);
  vec3 V = normalize(uViewPos - vWorldPos);
  vec3 L = normalize(uLightDir);
  float diff = max(dot(N, L), 0.0);
  vec3 amb = uAmbient * base.rgb;
  vec3 diffColor = diff * vec3(1.0, 0.95, 0.85) * base.rgb;
  vec3 R = reflect(-L, N);
  float spec = pow(max(dot(R, V), 0.0), 16.0);
  vec3 specColor = spec * vec3(0.4);

  vec3 color = amb + diffColor + specColor;
  float fog = clamp((vDepth - 80.0) / 400.0, 0.0, 1.0);
  color = mix(color, uFogColor, fog * vColor.a);
  FragColor = vec4(color, vColor.a);
}`;

  private initShader() {
    const gl = this.gl;
    this.prog = this.createProgram(this.vsSrc, this.fsSrc);
    gl.useProgram(this.prog);
    this.projLoc = gl.getUniformLocation(this.prog, 'uProj')!;
    this.viewLoc = gl.getUniformLocation(this.prog, 'uView')!;
    this.modelLoc = gl.getUniformLocation(this.prog, 'uModel')!;
    this.colorLoc = gl.getUniformLocation(this.prog, 'uColor')!;
    this.textureLoc = gl.getUniformLocation(this.prog, 'uTexture')!;
    this.hasTexLoc = gl.getUniformLocation(this.prog, 'uHasTexture')!;
    this.lightDirLoc = gl.getUniformLocation(this.prog, 'uLightDir')!;
    this.ambientLoc = gl.getUniformLocation(this.prog, 'uAmbient')!;
    this.fogColorLoc = gl.getUniformLocation(this.prog, 'uFogColor')!;
    this.viewPosLoc = gl.getUniformLocation(this.prog, 'uViewPos')!;
    this.useVertexColor = gl.getUniformLocation(this.prog, 'uUseVertexColor')!;
    gl.uniform1i(this.useVertexColor, 1);
  }

  private createProgram(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const v = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(v, vs); gl.compileShader(v);
    if (!gl.getShaderParameter(v, gl.COMPILE_STATUS)) {
      console.error('VS:', gl.getShaderInfoLog(v));
    }
    const f = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(f, fs); gl.compileShader(f);
    if (!gl.getShaderParameter(f, gl.COMPILE_STATUS)) {
      console.error('FS:', gl.getShaderInfoLog(f));
    }
    const p = gl.createProgram()!;
    gl.attachShader(p, v); gl.attachShader(p, f);
    gl.linkProgram(p);
    gl.deleteShader(v); gl.deleteShader(f);
    return p;
  }

  private initShadow() {
    const gl = this.gl;
    this.shadowTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.shadowSize, this.shadowSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shadowFBO = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.drawBuffers([]);

    const dvs = `#version 300 es
in vec3 aPos;
uniform mat4 uLightMatrix;
uniform mat4 uModel;
void main() { gl_Position = uLightMatrix * uModel * vec4(aPos, 1.0); }`;
    const dfs = `#version 300 es
precision highp float;
out vec4 FragColor;
void main() {}`;
    this.shadowProg = this.createProgram(dvs, dfs);
    this.shadowLightLoc = gl.getUniformLocation(this.shadowProg, 'uLightMatrix')!;
    this.shadowModelLoc = gl.getUniformLocation(this.shadowProg, 'uModel')!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private initSky() {
    const gl = this.gl;
    const svs = `#version 300 es
in vec3 aPos;
out vec3 vDir;
uniform mat4 uProj;
uniform mat4 uView;
void main() {
  vDir = aPos;
  mat4 rv = mat4(mat3(uView));
  vec4 p = uProj * rv * vec4(aPos, 1.0);
  gl_Position = p.xyww;
}`;
    const sfs = `#version 300 es
precision highp float;
in vec3 vDir;
out vec4 FragColor;
uniform vec3 uSunDir;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSunColor;
uniform vec3 uGlowColor;
uniform float uTime;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y * 0.5 + 0.5;
  // Smooth blend from ground → horizon → zenith with no hard seam at d.y = 0
  vec3 upper = mix(uHorizon, uTop, clamp(h * 1.5, 0.0, 1.0));
  vec3 lower = mix(uHorizon, uBottom, clamp(-d.y * 3.0, 0.0, 1.0) * 0.5);
  float skyT = clamp(d.y * 4.0 + 0.5, 0.0, 1.0);
  vec3 sky = mix(lower, upper, skyT);
  // Soft, subtle sun — no blinding white disc, no oversaturated glow
  float sunDot = dot(d, normalize(uSunDir));
  float sun = pow(max(sunDot, 0.0), 120.0);
  sky += uSunColor * sun * 0.9;
  float sunGlow = pow(max(sunDot, 0.0), 12.0);
  sky += uGlowColor * sunGlow * 0.18;
  FragColor = vec4(clamp(sky, 0.0, 1.0), 1.0);
}`;
    this.skyProg = this.createProgram(svs, sfs);
    this.skyProjLoc = gl.getUniformLocation(this.skyProg, 'uProj')!;
    this.skyViewLoc = gl.getUniformLocation(this.skyProg, 'uView')!;
    this.skySunDirLoc = gl.getUniformLocation(this.skyProg, 'uSunDir')!;
    this.skyTimeLoc = gl.getUniformLocation(this.skyProg, 'uTime')!;
    this.skyTopLoc = gl.getUniformLocation(this.skyProg, 'uTop')!;
    this.skyHorizonLoc = gl.getUniformLocation(this.skyProg, 'uHorizon')!;
    this.skyBottomLoc = gl.getUniformLocation(this.skyProg, 'uBottom')!;
    this.skySunColorLoc = gl.getUniformLocation(this.skyProg, 'uSunColor')!;
    this.skyGlowColorLoc = gl.getUniformLocation(this.skyProg, 'uGlowColor')!;

    // Full cube: 6 faces × 2 triangles × 3 verts = 36 verts
    const c = 1;
    const verts = new Float32Array([
      // +Z face
      -c, -c, c,  c, -c, c,  c, c, c,
      -c, -c, c,  c, c, c,  -c, c, c,
      // -Z face
      c, -c, -c,  -c, -c, -c,  -c, c, -c,
      c, -c, -c,  -c, c, -c,  c, c, -c,
      // +X face
      c, -c, c,  c, -c, -c,  c, c, -c,
      c, -c, c,  c, c, -c,  c, c, c,
      // -X face
      -c, -c, -c,  -c, -c, c,  -c, c, c,
      -c, -c, -c,  -c, c, c,  -c, c, -c,
      // +Y face
      -c, c, c,  c, c, c,  c, c, -c,
      -c, c, c,  c, c, -c,  -c, c, -c,
      // -Y face
      -c, -c, -c,  c, -c, -c,  c, -c, c,
      -c, -c, -c,  c, -c, c,  -c, -c, c,
    ]);
    this.skyVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.skyVao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  // ─── Track Generation ───
  generateTrack() {
    const segs = this.TRACK_SEGMENTS;
    const pts: TrackPoint[] = [];
    const radius = this.TRACK_LENGTH / (Math.PI * 2);

    // Generate a sine-wave based track that loops
    for (let i = 0; i < segs; i++) {
      const t = (i / segs) * Math.PI * 2;
      const r = radius + Math.sin(t * 3) * 30 + Math.sin(t * 7) * 12 + Math.sin(t * 1.7) * 8;
      const x = Math.cos(t) * r;
      const z = Math.sin(t) * r;

      // Direction (forward)
      const dt = 0.001;
      const tn = t + dt;
      const rn = radius + Math.sin(tn * 3) * 30 + Math.sin(tn * 7) * 12 + Math.sin(tn * 1.7) * 8;
      const dx = Math.cos(tn) * rn - x;
      const dz = Math.sin(tn) * rn - z;
      const len = Math.hypot(dx, dz);
      pts.push({
        x, z,
        dirX: len > 0.001 ? dx / len : 1,
        dirZ: len > 0.001 ? dz / len : 0,
        width: this.TRACK_WIDTH + Math.sin(t * 5) * 1.5,
        isStartFinish: i === 0,
      });
    }

    // Smooth the track
    const smoothPts: TrackPoint[] = [];
    for (let i = 0; i < pts.length; i++) {
      const pi = pts[(i - 1 + pts.length) % pts.length];
      const ci = pts[i];
      const ni = pts[(i + 1) % pts.length];
      smoothPts.push({
        x: (pi.x + ci.x * 2 + ni.x) / 4,
        z: (pi.z + ci.z * 2 + ni.z) / 4,
        dirX: ci.dirX, dirZ: ci.dirZ,
        width: ci.width,
        isStartFinish: ci.isStartFinish,
      });
    }

    // Recalculate directions after smoothing
    for (let i = 0; i < smoothPts.length; i++) {
      const ni = smoothPts[(i + 1) % smoothPts.length];
      const ci = smoothPts[i];
      const dx = ni.x - ci.x;
      const dz = ni.z - ci.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.001) { ci.dirX = dx / len; ci.dirZ = dz / len; }
    }

    this._trackPoints = smoothPts;
    this.totalTrackDist = 0;
    for (let i = 0; i < smoothPts.length; i++) {
      const ni = smoothPts[(i + 1) % smoothPts.length];
      this.totalTrackDist += Math.hypot(ni.x - smoothPts[i].x, ni.z - smoothPts[i].z);
    }
    this.trackLen = smoothPts.length;
  }

  getTrackLength(): number { return this.totalTrackDist; }

  /** Applies the environment theme for the selected track and rebuilds the
   *  scenery geometry. Call before each race (both solo and multiplayer). */
  setTheme(theme: 'default' | 'miami' | 'city' | 'mountain') {
    this.theme = theme;
    switch (theme) {
      case 'miami':
        // Miami: warm tropical dusk — peach horizon, turquoise zenith, hot sun.
        this.skyTop = [0.13, 0.32, 0.6];
        this.skyHorizon = [0.95, 0.68, 0.55];
        this.skyBottom = [0.55, 0.62, 0.7];
        this.sunDir = [0.35, 0.55, 0.45];
        this.sunColor = [1.0, 0.85, 0.7];
        this.ambientColor = [0.32, 0.3, 0.34];
        this.fogColor = [0.62, 0.6, 0.63];
        break;
      case 'city':
        // Downtown: dusk navy + neon — cool sky, warm sodium street glow.
        this.skyTop = [0.05, 0.08, 0.22];
        this.skyHorizon = [0.45, 0.32, 0.5];
        this.skyBottom = [0.2, 0.22, 0.3];
        this.sunDir = [0.25, 0.45, 0.35];
        this.sunColor = [1.0, 0.8, 0.6];
        this.ambientColor = [0.2, 0.2, 0.26];
        this.fogColor = [0.3, 0.3, 0.38];
        break;
      case 'mountain':
        // Alpine: crisp blue sky, clean cool air.
        this.skyTop = [0.08, 0.18, 0.45];
        this.skyHorizon = [0.7, 0.78, 0.88];
        this.skyBottom = [0.45, 0.52, 0.62];
        this.sunDir = [0.4, 0.65, 0.5];
        this.sunColor = [1.0, 0.95, 0.85];
        this.ambientColor = [0.28, 0.28, 0.32];
        this.fogColor = [0.45, 0.5, 0.58];
        break;
      default:
        this.skyTop = [0.1, 0.2, 0.5];
        this.skyHorizon = [0.7, 0.75, 0.85];
        this.skyBottom = [0.4, 0.45, 0.5];
        this.sunDir = [0.4, 0.7, 0.5];
        this.sunColor = [1.0, 0.95, 0.85];
        this.ambientColor = [0.25, 0.25, 0.3];
        this.fogColor = [0.4, 0.45, 0.5];
        break;
    }
    // Rebuild the scenery geometry for the new theme.
    this.buildScenery();
  }

  getTrackPointAlong(dist: number): TrackPoint {
    // Find position along track
    const t = ((dist % this.totalTrackDist) / this.totalTrackDist) * this.trackLen;
    const idx = Math.floor(t) % this.trackLen;
    const frac = t - Math.floor(t);
    const pi = this._trackPoints[idx];
    const ni = this._trackPoints[(idx + 1) % this.trackLen];
    if (!pi || !ni) return this._trackPoints[0] || { x: 0, z: 0, dirX: 1, dirZ: 0, width: 16 };
    return {
      x: pi.x + (ni.x - pi.x) * frac,
      z: pi.z + (ni.z - pi.z) * frac,
      dirX: pi.dirX + (ni.dirX - pi.dirX) * frac,
      dirZ: pi.dirZ + (ni.dirZ - pi.dirZ) * frac,
      width: (pi.width + ni.width) / 2,
    };
  }

  getDistFromPoint(wx: number, wz: number): number {
    let bestDist = Infinity;
    let bestIdx = 0;
    for (let i = 0; i < this._trackPoints.length; i++) {
      const p = this._trackPoints[i];
      const d = Math.hypot(p.x - wx, p.z - wz);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    // Project onto the nearest segment for a CONTINUOUS distance value. The old
    // version returned (bestIdx / len) * total — a stepped, quantized distance
    // that made the wall-clamp target (and off-track pull) jump around, which
    // is what flung the car and made steering feel jittery.
    const p = this._trackPoints[bestIdx];
    const n = this._trackPoints[(bestIdx + 1) % this._trackPoints.length];
    const ax = wx - p.x, az = wz - p.z;
    const sx = n.x - p.x, sz = n.z - p.z;
    const segLenSq = sx * sx + sz * sz;
    let t = segLenSq > 0.0001 ? (ax * sx + az * sz) / segLenSq : 0;
    t = Math.max(0, Math.min(1, t));
    return ((bestIdx + t) / this.trackLen) * this.totalTrackDist;
  }

  // ─── Track Mesh Building ───
  // Split into THREE buffers so each pass can set the right lighting/texture mode:
  //  - trackVao  → asphalt road + grass shoulders (textured)
  //  - barrierVao → red/white barrier walls (flat vertex colors, uHasTexture=0)
  //  - finishVao → start/finish checkerboard quad (flat colors, drawn ONCE per lap)
  private buildTrackMesh() {
    const pts = this._trackPoints;
    const gl = this.gl;
    const verts: number[] = [];
    const idxs: number[] = [];
    const barVerts: number[] = [];
    const barIdxs: number[] = [];
    const perSegVerts = 6; // 3 on each side

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const n = pts[(i + 1) % pts.length];

      // Perpendicular to direction
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const npx = -n.dirZ;
      const npz = n.dirX;
      const hw = p.width / 2;
      const hwN = n.width / 2;

      // Track surface - 6 verts per segment (3 on each side)
      const segDist = i / pts.length;

      // Left edge
      verts.push(p.x + ppx * hw, 0, p.z + ppz * hw, 0, 1, 0, 1, 1, 1, segDist * 4, 0);
      verts.push(n.x + npx * hwN, 0, n.z + npz * hwN, 0, 1, 0, 1, 1, 1, (segDist + 1 / pts.length) * 4, 0);
      // Center
      verts.push(p.x, 0, p.z, 0, 1, 0, 1, 1, 1, segDist * 4, 0.5);
      verts.push(n.x, 0, n.z, 0, 1, 0, 1, 1, 1, (segDist + 1 / pts.length) * 4, 0.5);
      // Right edge
      verts.push(p.x - ppx * hw, 0, p.z - ppz * hw, 0, 1, 0, 1, 1, 1, segDist * 4, 1);
      verts.push(n.x - npx * hwN, 0, n.z - npz * hwN, 0, 1, 0, 1, 1, 1, (segDist + 1 / pts.length) * 4, 1);

      const vi = i * perSegVerts;
      idxs.push(vi, vi + 1, vi + 2);
      idxs.push(vi + 2, vi + 1, vi + 3);
      idxs.push(vi + 2, vi + 3, vi + 5);
      idxs.push(vi + 2, vi + 5, vi + 4);

      // Grass shoulders - wider on each side, clean muted green (no texture bleed).
      // The shader computes base = vColor × texture, and the sampled asphalt is
      // ~0.22 brightness, so the tint is boosted ~4.5× to read as visible grass.
      // Dedicated inner verts sit at the road edge but sample the plain-asphalt
      // region (v=0.25/0.75), so the texture's white edge-line rows (v≈0 / v≈1)
      // never bleed onto the grass.
      const shoulderW = 20;
      const su = 0.3 + segDist * 0.4; // sample the plain asphalt region of the texture
      const suN = 0.3 + (segDist + 1 / pts.length) * 0.4;
      const gr = 0.55, gg = 1.7, gb = 0.4;
      // Left shoulder (inner lip at road edge + outer lip)
      verts.push(p.x + ppx * hw, -0.2, p.z + ppz * hw, 0, 1, 0, gr, gg, gb, su, 0.25);
      verts.push(n.x + npx * hwN, -0.2, n.z + npz * hwN, 0, 1, 0, gr, gg, gb, suN, 0.25);
      verts.push(p.x + ppx * (hw + shoulderW), -0.2, p.z + ppz * (hw + shoulderW), 0, 1, 0, gr, gg, gb, su, 0.25);
      verts.push(n.x + npx * (hwN + shoulderW), -0.2, n.z + npz * (hwN + shoulderW), 0, 1, 0, gr, gg, gb, suN, 0.25);
      // Right shoulder (inner lip at road edge + outer lip)
      verts.push(p.x - ppx * hw, -0.2, p.z - ppz * hw, 0, 1, 0, gr, gg, gb, su, 0.75);
      verts.push(n.x - npx * hwN, -0.2, n.z - npz * hwN, 0, 1, 0, gr, gg, gb, suN, 0.75);
      verts.push(p.x - ppx * (hw + shoulderW), -0.2, p.z - ppz * (hw + shoulderW), 0, 1, 0, gr, gg, gb, su, 0.75);
      verts.push(n.x - npx * (hwN + shoulderW), -0.2, n.z - npz * (hwN + shoulderW), 0, 1, 0, gr, gg, gb, suN, 0.75);

      const si = pts.length * perSegVerts + i * 8;
      // Left shoulder quad (inner -> outer, no shared road-edge verts)
      idxs.push(si, si + 1, si + 2);
      idxs.push(si + 2, si + 1, si + 3);
      // Right shoulder quad
      idxs.push(si + 4, si + 5, si + 6);
      idxs.push(si + 6, si + 5, si + 7);

      // ── Barrier walls (separate buffer, flat vivid colors — no texture multiply) ──
      // The curb band below spans hw → bw, so a 1.5-wide band (3× the old 0.5)
      // needs the walls pushed back the same amount to keep the kerbs inside.
      const barrierH = 0.85;
      const bw = hw + 1.5;
      const bwN = hwN + 1.5;
      // Red/white stripe pattern so the track edge is obvious
      const striped = Math.floor(i / 4) % 2 === 0;
      const br = striped ? 0.95 : 0.8;
      const bg = striped ? 0.95 : 0.1;
      const bb = striped ? 0.95 : 0.08;

      // Left barrier front face (outward normal = +perp)
      const lb = barVerts.length / 11;
      barVerts.push(p.x + ppx * bw, 0, p.z + ppz * bw, ppx, 0, ppz, br, bg, bb, 0, 0);
      barVerts.push(n.x + npx * bwN, 0, n.z + npz * bwN, npx, 0, npz, br, bg, bb, 1, 0);
      barVerts.push(p.x + ppx * bw, barrierH, p.z + ppz * bw, ppx, 0, ppz, br, bg, bb, 0, 1);
      barVerts.push(n.x + npx * bwN, barrierH, n.z + npz * bwN, npx, 0, npz, br, bg, bb, 1, 1);
      barIdxs.push(lb, lb + 1, lb + 2);
      barIdxs.push(lb + 1, lb + 3, lb + 2);

      // Right barrier front face (outward normal = -perp)
      const rb = barVerts.length / 11;
      barVerts.push(p.x - ppx * bw, 0, p.z - ppz * bw, -ppx, 0, -ppz, br, bg, bb, 0, 0);
      barVerts.push(n.x - npx * bwN, 0, n.z - npz * bwN, -npx, 0, -npz, br, bg, bb, 1, 0);
      barVerts.push(p.x - ppx * bw, barrierH, p.z - ppz * bw, -ppx, 0, -ppz, br, bg, bb, 0, 1);
      barVerts.push(n.x - npx * bwN, barrierH, n.z - npz * bwN, -npx, 0, -npz, br, bg, bb, 1, 1);
      barIdxs.push(rb, rb + 2, rb + 1);
      barIdxs.push(rb + 1, rb + 2, rb + 3);

      // ── Curb strips — red/white checkerboard on the floor just inside the
      // walls (track edge hw → wall base bw). Alternating color per segment,
      // staggered between the two sides, gives a classic F1 kerb look. The
      // physics layer scrubs the car's speed while any wheel is over this band.
      const curbTop = 0.02; // just above the road surface so no z-fighting
      const addCurb = (side: 1 | -1, checker: boolean) => {
        const cRed = checker ? 0.93 : 0.85;
        const cGrn = checker ? 0.93 : 0.08;
        const cBlu = checker ? 0.93 : 0.08;
        const dirX = side === 1 ? ppx : -ppx;
        const dirZ = side === 1 ? ppz : -ppz;
        const ci = barVerts.length / 11;
        barVerts.push(p.x + dirX * hw, curbTop, p.z + dirZ * hw, 0, 1, 0, cRed, cGrn, cBlu, 0, 0);
        barVerts.push(n.x + dirX * hwN, curbTop, n.z + dirZ * hwN, 0, 1, 0, cRed, cGrn, cBlu, 1, 0);
        barVerts.push(p.x + dirX * bw, curbTop, p.z + dirZ * bw, 0, 1, 0, cRed, cGrn, cBlu, 0, 1);
        barVerts.push(n.x + dirX * bwN, curbTop, n.z + dirZ * bwN, 0, 1, 0, cRed, cGrn, cBlu, 1, 1);
        // Winding (ci, ci+2, ci+1)/(ci+1, ci+2, ci+3) faces UP (+Y) so the curb
        // survives back-face culling when viewed from the cockpit.
        barIdxs.push(ci, ci + 2, ci + 1);
        barIdxs.push(ci + 1, ci + 2, ci + 3);
      };
      addCurb(1, i % 2 === 0);
      addCurb(-1, i % 2 === 1);

      // Barrier top caps — thin strips over each wall only (never over the road)
      const tcr = striped ? 0.8 : 0.65;
      const tcg = striped ? 0.8 : 0.08;
      const tcb = striped ? 0.8 : 0.06;
      const capW = 0.3; // lip width outboard of the wall face (visible from cockpit, never over the road)
      // Left cap strip (bw -> bw+capW, outboard = +perp)
      const tc = barVerts.length / 11;
      barVerts.push(p.x + ppx * bw, barrierH, p.z + ppz * bw, 0, 1, 0, tcr, tcg, tcb, 0, 0);
      barVerts.push(n.x + npx * bwN, barrierH, n.z + npz * bwN, 0, 1, 0, tcr, tcg, tcb, 1, 0);
      barVerts.push(p.x + ppx * (bw + capW), barrierH, p.z + ppz * (bw + capW), 0, 1, 0, tcr, tcg, tcb, 0, 1);
      barVerts.push(n.x + npx * (bwN + capW), barrierH, n.z + npz * (bwN + capW), 0, 1, 0, tcr, tcg, tcb, 1, 1);
      barIdxs.push(tc, tc + 1, tc + 2);
      barIdxs.push(tc + 1, tc + 3, tc + 2);
      // Right cap strip (-bw -> -(bw+capW), outboard = -perp)
      const tr = barVerts.length / 11;
      barVerts.push(p.x - ppx * bw, barrierH, p.z - ppz * bw, 0, 1, 0, tcr, tcg, tcb, 0, 0);
      barVerts.push(n.x - npx * bwN, barrierH, n.z - npz * bwN, 0, 1, 0, tcr, tcg, tcb, 1, 0);
      barVerts.push(p.x - ppx * (bw + capW), barrierH, p.z - ppz * (bw + capW), 0, 1, 0, tcr, tcg, tcb, 0, 1);
      barVerts.push(n.x - npx * (bwN + capW), barrierH, n.z - npz * (bwN + capW), 0, 1, 0, tcr, tcg, tcb, 1, 1);
      barIdxs.push(tr, tr + 1, tr + 2);
      barIdxs.push(tr + 1, tr + 3, tr + 2);

      // Sponsor boards every 15 segments — bright alternating panels on the outer cap
      if (i % 15 === 0) {
        const boardColors: [number, number, number][] = [
          [0.9, 0.1, 0.1], [0.1, 0.5, 0.9], [0.95, 0.85, 0.1], [0.1, 0.8, 0.3],
        ];
        const bc = boardColors[Math.floor(i / 15) % boardColors.length];
        const boardY = barrierH + 0.5;
        const bTop = barVerts.length / 11;
        barVerts.push(p.x + ppx * (bw + capW), barrierH, p.z + ppz * (bw + capW), 0, 1, 0, ...bc, 0, 0);
        barVerts.push(n.x + npx * (bwN + capW), barrierH, n.z + npz * (bwN + capW), 0, 1, 0, ...bc, 1, 0);
        barVerts.push(p.x + ppx * (bw + capW), boardY, p.z + ppz * (bw + capW), 0, 1, 0, ...bc, 0, 1);
        barVerts.push(n.x + npx * (bwN + capW), boardY, n.z + npz * (bwN + capW), 0, 1, 0, ...bc, 1, 1);
        barIdxs.push(bTop, bTop + 1, bTop + 2);
        barIdxs.push(bTop + 1, bTop + 3, bTop + 2);
      }
    }

    const vertArray = new Float32Array(verts);
    const idxArray = new Uint16Array(idxs);
    this.trackCount = idxArray.length;
    this.trackVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.trackVao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertArray, gl.STATIC_DRAW);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArray, gl.STATIC_DRAW);
    const stride = 11 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);

    // Barrier buffer
    const barArray = new Float32Array(barVerts);
    const barIdxArray = new Uint16Array(barIdxs);
    this.barrierCount = barIdxArray.length;
    this.barrierVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.barrierVao);
    const bvbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, bvbo);
    gl.bufferData(gl.ARRAY_BUFFER, barArray, gl.STATIC_DRAW);
    const bibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, barIdxArray, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);

    // Start/Finish checkerboard — drawn as a separate flat quad at the line so
    // it appears exactly once per lap instead of repeating every quarter lap.
    this.buildFinishLine();
  }

  private buildFinishLine() {
    const gl = this.gl;
    const p = this._trackPoints[0];
    const n = this._trackPoints[1];
    const ppx = -p.dirZ;
    const ppz = p.dirX;
    const hw = p.width / 2;
    const segLen = Math.hypot(n.x - p.x, n.z - p.z) || 1;
    const nx = (n.x - p.x) / segLen;
    const nz = (n.z - p.z) / segLen;
    // A proper start/finish strip CENTERED under the car's spawn point (track
    // distance 0) — the car lines up ON the checkerboard, like a real F1 grid
    // line, and it stays visible in the cockpit view while the other cars sit
    // in your peripheral vision. Longer band + finer grid than the old stub.
    const bandLen = Math.min(9, segLen * 3);
    const bandStart = -bandLen / 2;
    const verts: number[] = [];
    const idxs: number[] = [];
    const cols = 12, rows = 6;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const white = (r + c) % 2 === 0;
        const col = white ? 0.95 : 0.08;
        const f0 = bandStart + (r / rows) * bandLen;
        const f1 = bandStart + ((r + 1) / rows) * bandLen;
        const x0 = p.x + ppx * (c / cols * 2 - 1) * hw + nx * f0;
        const z0 = p.z + ppz * (c / cols * 2 - 1) * hw + nz * f0;
        const x1 = p.x + ppx * ((c + 1) / cols * 2 - 1) * hw + nx * f0;
        const z1 = p.z + ppz * ((c + 1) / cols * 2 - 1) * hw + nz * f0;
        const x2 = p.x + ppx * ((c + 1) / cols * 2 - 1) * hw + nx * f1;
        const z2 = p.z + ppz * ((c + 1) / cols * 2 - 1) * hw + nz * f1;
        const x3 = p.x + ppx * (c / cols * 2 - 1) * hw + nx * f1;
        const z3 = p.z + ppz * (c / cols * 2 - 1) * hw + nz * f1;
        const b = verts.length / 11;
        verts.push(x0, 0.02, z0, 0, 1, 0, col, col, col, 0, 0);
        verts.push(x1, 0.02, z1, 0, 1, 0, col, col, col, 0, 0);
        verts.push(x2, 0.02, z2, 0, 1, 0, col, col, col, 0, 0);
        verts.push(x3, 0.02, z3, 0, 1, 0, col, col, col, 0, 0);
        idxs.push(b, b + 1, b + 2);
        idxs.push(b, b + 2, b + 3);
      }
    }
    const fArray = new Float32Array(verts);
    const fIdxArray = new Uint16Array(idxs);
    this.finishCount = fIdxArray.length;
    this.finishVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.finishVao);
    const fvbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, fvbo);
    gl.bufferData(gl.ARRAY_BUFFER, fArray, gl.STATIC_DRAW);
    const fibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, fibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, fIdxArray, gl.STATIC_DRAW);
    const stride = 11 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
  }

  // ─── Scenery (theme-dependent) ───
  private buildScenery() {
    const gl = this.gl;
    // Free the previous theme's scenery buffers (setTheme rebuilds this on
    // every race start — solo, multiplayer and rematches — so leak-free matters).
    if (this.sceneryVao) { try { gl.deleteVertexArray(this.sceneryVao); } catch { } }
    if (this.sceneryVbo) { try { gl.deleteBuffer(this.sceneryVbo); } catch { } }
    if (this.sceneryIbo) { try { gl.deleteBuffer(this.sceneryIbo); } catch { } }
    const pts = this._trackPoints;
    const verts: number[] = [];
    const idxs: number[] = [];

    // Theme scenery kit: each theme paints its own world beside the track.
    if (this.theme === 'miami') {
      // Ocean plane first (it sits below everything), then the sandy beach band.
      this.addOceanPlane(verts, idxs);
      this.addSandBand(verts, idxs);
      this.addMiamiScenery(verts, idxs);
    } else if (this.theme === 'city') {
      this.addCityScenery(verts, idxs);
    } else if (this.theme === 'mountain') {
      this.addMountainScenery(verts, idxs);
    } else {
      this.addForestScenery(verts, idxs);
    }

    // Grandstands at key points (all themes)
    const gsPositions = [0, Math.floor(pts.length / 4), Math.floor(pts.length / 2), Math.floor(pts.length * 3 / 4)];
    for (const gi of gsPositions) {
      const p = pts[gi];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const gx = p.x + ppx * (p.width / 2 + 8);
      const gz = p.z + ppz * (p.width / 2 + 8);
      this.addGrandstand(verts, idxs, gx, gz, p.dirX, p.dirZ, 4, 3);
    }

    // Light poles every 20 segments (all themes)
    for (let i = 0; i < pts.length; i += 20) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const lx = p.x + ppx * (p.width / 2 + 1) * side;
        const lz = p.z + ppz * (p.width / 2 + 1) * side;
        // Pole
        this.addCylinder(verts, idxs, lx, 0, lz, 0.08, 3, 6, [0.2, 0.2, 0.2]);
        // Light
        this.addSphere(verts, idxs, lx, 3, lz, 0.15, 6, this.theme === 'miami' ? [1, 0.9, 0.65] : [1, 0.95, 0.7]);
      }
    }

    const vertArray = new Float32Array(verts);
    const idxArray = new Uint16Array(idxs);
    this.sceneryCount = idxArray.length;

    this.sceneryVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.sceneryVao);
    this.sceneryVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sceneryVbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertArray, gl.STATIC_DRAW);
    this.sceneryIbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.sceneryIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArray, gl.STATIC_DRAW);
    const stride = 11 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
  }

  // Default theme: the classic pine forest.
  private addForestScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    let treeIdx = 0;
    for (let i = 0; i < pts.length; i += 3) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const dist = p.width / 2 + 24 + Math.random() * 20;
      for (const side of [-1, 1]) {
        const tx = p.x + ppx * dist * side + (Math.random() - 0.5) * 8;
        const tz = p.z + ppz * dist * side + (Math.random() - 0.5) * 8;
        const th = 1.5 + Math.random() * 1.5;
        const tr = 0.15 + Math.random() * 0.1;
        this.addCylinder(verts, idxs, tx, 0, tz, tr, th, 6, [0.3, 0.15, 0.05]);
        const cr = 0.8 + Math.random() * 0.6;
        const ch = 1.2 + Math.random() * 0.6;
        this.addCone(verts, idxs, tx, th - 0.3, tz, cr, ch, 8, [0.05, 0.28 + Math.random() * 0.12, 0.02]);
        if (treeIdx++ > 250) break;
      }
      if (treeIdx > 250) break;
    }
  }

  // Mountain theme: pines + gray rock outcrops + snow caps in the distance.
  private addMountainScenery(verts: number[], idxs: number[]) {
    this.addForestScenery(verts, idxs);
    const pts = this._trackPoints;
    // Rocky outcrops poking up beside the track.
    for (let i = 0; i < pts.length; i += 7) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 30 + Math.random() * 25;
        const rx = p.x + ppx * dist * side + (Math.random() - 0.5) * 10;
        const rz = p.z + ppz * dist * side + (Math.random() - 0.5) * 10;
        const s = 1.2 + Math.random() * 2.2;
        // Lower wide slab + upper peak = rocky silhouette.
        this.addCone(verts, idxs, rx, 0, rz, s * 1.5, s, 6, [0.35, 0.35, 0.38]);
        this.addCone(verts, idxs, rx + s * 0.3, s * 0.55, rz - s * 0.2, s * 0.7, s * 0.8, 6, [0.55, 0.55, 0.6]);
      }
    }
  }

  // City theme: glass towers with lit window grids + rooftop antennas.
  private addCityScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    const towerColors: [number, number, number][] = [
      [0.12, 0.18, 0.32], [0.1, 0.22, 0.28], [0.2, 0.16, 0.3], [0.14, 0.14, 0.38], [0.08, 0.28, 0.34],
    ];
    let towerIdx = 0;
    for (let i = 0; i < pts.length; i += 6) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 42 + Math.random() * 30;
        const tx = p.x + ppx * dist * side + (Math.random() - 0.5) * 12;
        const tz = p.z + ppz * dist * side + (Math.random() - 0.5) * 12;
        const h = 14 + Math.random() * 34;
        const w = 4 + Math.random() * 4;
        const d = 4 + Math.random() * 4;
        const col = towerColors[Math.floor(Math.random() * towerColors.length)];
        this.addBox(verts, idxs, tx, h / 2, tz, w, h, d, col);
        // Lit window grid on all four faces (bright dots at dusk).
        const rows = Math.max(4, Math.floor(h / 4));
        const cols = 2;
        const wn = 0.5;
        for (const sx of [-1, 1]) {
          const zc = tz + sx * (d / 2 + 0.05);
          for (let r = 0; r < rows; r++) {
            const wy = 1 + r * (h - 2) / rows;
            for (let c = 0; c < cols; c++) {
              const xc = tx - w / 2 + 0.8 + c * (w - 1.6) / cols;
              this.addWindowQuad(verts, idxs, xc, wy, zc, wn * 2, wn, 0, sx, [0.95, 0.85, 0.5]);
            }
          }
        }
        for (const sz of [-1, 1]) {
          const xc = tx + sz * (w / 2 + 0.05);
          for (let r = 0; r < rows; r++) {
            const wy = 1 + r * (h - 2) / rows;
            for (let c = 0; c < cols; c++) {
              const zc = tz - d / 2 + 0.8 + c * (d - 1.6) / cols;
              this.addWindowQuad(verts, idxs, xc, wy, zc, wn * 2, wn, sz, 0, [0.95, 0.85, 0.5]);
            }
          }
        }
        // Rooftop antenna + red beacon.
        this.addCylinder(verts, idxs, tx, h, tz, 0.06, 3, 5, [0.3, 0.3, 0.35]);
        this.addSphere(verts, idxs, tx, h + 3, tz, 0.12, 6, [0.9, 0.15, 0.12]);
        if (towerIdx++ > 26) break;
      }
      if (towerIdx > 26) break;
    }
  }

  // Miami theme: beach band + palm trees + art-deco buildings + umbrellas.
  private addOceanPlane(verts: number[], idxs: number[]) {
    // A huge turquoise plane under the whole world — reads as water beyond the sand.
    const c = 900;
    this.addQuad(verts, idxs,
      [-c, -0.4, -c], [c, -0.4, -c], [c, -0.4, c], [-c, -0.4, c],
      [0.05, 0.5, 0.55]);
  }

  private addSandBand(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      const n = pts[(i + 1) % pts.length];
      const ppx = -p.dirZ, ppz = p.dirX;
      const npx = -n.dirZ, npz = n.dirX;
      const inner = p.width / 2 + 18;
      const outer = p.width / 2 + 52;
      for (const side of [-1, 1]) {
        const pIn = [p.x + ppx * inner * side, -0.26, p.z + ppz * inner * side];
        const pOut = [p.x + ppx * outer * side, -0.26, p.z + ppz * outer * side];
        const nIn = [n.x + npx * inner * side, -0.26, n.z + npz * inner * side];
        const nOut = [n.x + npx * outer * side, -0.26, n.z + npz * outer * side];
        this.addGroundQuad(verts, idxs, pIn, nIn, nOut, pOut, [0.85, 0.78, 0.58]);
      }
    }
  }

  private addMiamiScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    // Palm trees along both sides.
    let palmIdx = 0;
    for (let i = 0; i < pts.length; i += 3) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 24 + Math.random() * 16;
        const px = p.x + ppx * dist * side + (Math.random() - 0.5) * 6;
        const pz = p.z + ppz * dist * side + (Math.random() - 0.5) * 6;
        this.addPalmTree(verts, idxs, px, pz, 0.8 + Math.random() * 0.5);
        if (palmIdx++ > 60) break;
      }
      if (palmIdx > 60) break;
    }

    // Art-deco pastel buildings — a Miami skyline behind the beach.
    const pastels: [number, number, number][] = [
      [0.95, 0.6, 0.65], [0.6, 0.85, 0.8], [0.98, 0.85, 0.6], [0.85, 0.75, 0.9], [0.75, 0.85, 0.95],
    ];
    let bIdx = 0;
    for (let i = 0; i < pts.length; i += 8) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 60 + Math.random() * 25;
        const bx = p.x + ppx * dist * side + (Math.random() - 0.5) * 10;
        const bz = p.z + ppz * dist * side + (Math.random() - 0.5) * 10;
        const h = 10 + Math.random() * 16;
        const w = 5 + Math.random() * 3;
        const d = 5 + Math.random() * 3;
        const col = pastels[Math.floor(Math.random() * pastels.length)];
        this.addBox(verts, idxs, bx, h / 2, bz, w, h, d, col);
        // Flat parapet roof for the art-deco look.
        this.addBox(verts, idxs, bx, h + 0.4, bz, w + 0.8, 0.8, d + 0.8, [0.95, 0.95, 0.9]);
        // Window grid on the two long faces.
        const rows = Math.max(3, Math.floor(h / 4));
        for (const sx of [-1, 1]) {
          const zc = bz + sx * (d / 2 + 0.05);
          for (let r = 0; r < rows; r++) {
            const wy = 1 + r * (h - 2) / rows;
            for (let c = 0; c < 3; c++) {
              const xc = bx - w / 2 + 0.9 + c * (w - 1.8) / 3;
              this.addWindowQuad(verts, idxs, xc, wy, zc, 0.8, 0.5, 0, sx, [0.15, 0.35, 0.4]);
            }
          }
        }
        if (bIdx++ > 20) break;
      }
      if (bIdx > 20) break;
    }

    // Beach umbrellas + towels scattered on the sand near the grandstands.
    const gsPositions = [0, Math.floor(pts.length / 4), Math.floor(pts.length / 2), Math.floor(pts.length * 3 / 4)];
    const umbrellaColors: [number, number, number][] = [
      [0.9, 0.25, 0.3], [0.95, 0.8, 0.2], [0.1, 0.65, 0.55], [0.25, 0.5, 0.9], [0.95, 0.55, 0.8],
    ];
    for (const gi of gsPositions) {
      const p = pts[gi];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (let u = 0; u < 3; u++) {
        const dist = p.width / 2 + 26 + Math.random() * 12;
        const side = u % 2 === 0 ? -1 : 1;
        const ux = p.x + ppx * dist * side + (Math.random() - 0.5) * 6;
        const uz = p.z + ppz * dist * side + (Math.random() - 0.5) * 6;
        this.addCylinder(verts, idxs, ux, 0, uz, 0.05, 1.6, 6, [0.85, 0.8, 0.7]);
        this.addCone(verts, idxs, ux, 1.6, uz, 0.9, 0.35, 8, umbrellaColors[Math.floor(Math.random() * umbrellaColors.length)]);
      }
    }
  }

  // A drooping palm: bent trunk + radiating fronds, made from cheap primitives.
  private addPalmTree(verts: number[], idxs: number[], x: number, z: number, s: number) {
    const lean = (Math.random() - 0.5) * 0.8;
    const trunkH = 3.2 * s;
    // Trunk: two segments with a kink for a natural sway.
    this.addCylinder(verts, idxs, x, 0, z, 0.14 * s, trunkH * 0.55, 6, [0.5, 0.36, 0.18]);
    const kinkX = x + lean * 0.4;
    const kinkZ = z + lean * 0.3;
    this.addCylinder(verts, idxs, kinkX, trunkH * 0.55, kinkZ, 0.11 * s, trunkH * 0.45, 6, [0.45, 0.32, 0.16]);
    const topX = kinkX + lean * 0.55;
    const topZ = kinkZ + lean * 0.4;
    const topY = trunkH;
    // 7 fronds radiating out + slightly down.
    const frondCol = [0.06, 0.42, 0.1] as [number, number, number];
    for (let f = 0; f < 7; f++) {
      const a = (f / 7) * Math.PI * 2 + lean * 0.3;
      const len = (1.6 + Math.random() * 0.5) * s;
      const ex = topX + Math.cos(a) * len;
      const ez = topZ + Math.sin(a) * len;
      const ey = topY + 0.2 - Math.random() * 0.7;
      this.addQuad(verts, idxs,
        [topX, topY, topZ], [ex, ey, ez],
        [topX + Math.cos(a) * len * 0.95, ey - 0.15, topZ + Math.sin(a) * len * 0.95],
        [topX + Math.cos(a) * 0.3, topY - 0.15, topZ + Math.sin(a) * 0.3],
        frondCol);
    }
    // A tiny coconut cluster at the crown.
    this.addSphere(verts, idxs, topX + lean * 0.2, topY - 0.1, topZ + lean * 0.15, 0.14 * s, 6, [0.5, 0.35, 0.15]);
  }

  // Ground quad with forced up-normal so sand/water light correctly regardless of winding.
  private addGroundQuad(verts: number[], idxs: number[], a: number[], b: number[], c: number[], d: number[], color: number[]) {
    const [r, g, bl] = color;
    const base = verts.length / 11;
    for (const p of [a, b, c, d]) {
      verts.push(p[0], -0.26, p[2], 0, 1, 0, r, g, bl, 0, 0);
    }
    idxs.push(base, base + 1, base + 2);
    idxs.push(base + 2, base + 3, base);
  }

  // ─── Car Mesh ───
  private buildCarMesh() {
    const gl = this.gl;
    const verts: number[] = [];
    const idxs: number[] = [];

    const [cr, cg, cb] = [0.85, 0.06, 0.06]; // Team red
    const carbon = [0.12, 0.12, 0.14];
    const dark = [0.08, 0.08, 0.10];
    const grey = [0.22, 0.22, 0.24];

    // ── 1. Floor / undertray (wide, low) ──
    this.addBox(verts, idxs, -0.1, 0.02, 0, 2.6, 0.03, 1.05, dark);
    // Floor edge winglets (thin vertical fins along the floor sides)
    this.addBox(verts, idxs, 0.1, 0.06, 0.53, 1.4, 0.07, 0.02, carbon);
    this.addBox(verts, idxs, 0.1, 0.06, -0.53, 1.4, 0.07, 0.02, carbon);
    // Second row of floor edge fences
    this.addBox(verts, idxs, -0.3, 0.05, 0.53, 0.8, 0.05, 0.015, carbon);
    this.addBox(verts, idxs, -0.3, 0.05, -0.53, 0.8, 0.05, 0.015, carbon);
    // Diffuser ramp at the rear (rises toward the back)
    this.addTaperedBox(verts, idxs, -1.1, 0.035, 0, 0.4, 0.13, 0.03, 0.7, 0.45, carbon);
    // Diffuser fins (vertical blades inside the rear diffuser)
    for (const dz of [-0.3, -0.1, 0.1, 0.3]) {
      this.addBox(verts, idxs, -1.15, 0.07, dz, 0.3, 0.08, 0.02, carbon);
    }

    // ── 2. Monocoque / cockpit tub ──
    // Tapers up from the nose joint to the cockpit surround
    this.addTaperedBox(verts, idxs, 0.1, 0.15, 0, 1.15, 0.15, 0.27, 0.3, 0.4, [cr, cg, cb]);
    // Cockpit opening (dark recess sunk into the tub top)
    this.addBox(verts, idxs, 0.45, 0.26, 0, 0.3, 0.02, 0.22, dark);
    // Driver shoulders + torso peeking out of the cockpit
    this.addBox(verts, idxs, 0.3, 0.24, 0, 0.16, 0.07, 0.18, [cr, cg, cb]);
    this.addBox(verts, idxs, 0.33, 0.27, 0, 0.1, 0.05, 0.16, [0.1, 0.1, 0.12]);
    // Driver helmet + visor
    this.addSphere(verts, idxs, 0.42, 0.3, 0, 0.09, 10, [0.95, 0.95, 0.98]);
    this.addBox(verts, idxs, 0.5, 0.3, 0, 0.04, 0.06, 0.1, dark);
    // Steering wheel
    this.addBox(verts, idxs, 0.53, 0.26, 0, 0.02, 0.02, 0.14, dark);

    // ── 3. Halo (over the driver) ──
    this.addBox(verts, idxs, 0.05, 0.3, 0, 0.05, 0.18, 0.06, carbon);   // center pillar
    this.addBox(verts, idxs, 0.4, 0.42, 0, 0.2, 0.04, 0.52, carbon);    // front arch
    this.addBox(verts, idxs, 0.16, 0.42, 0.2, 0.5, 0.04, 0.06, carbon); // left bar
    this.addBox(verts, idxs, 0.16, 0.42, -0.2, 0.5, 0.04, 0.06, carbon); // right bar
    // Halo winglet (small fin on top of the front arch)
    this.addBox(verts, idxs, 0.4, 0.46, 0, 0.1, 0.02, 0.1, carbon);

    // ── 4. Nose cone (stepped, tapering forward) ──
    this.addTaperedBox(verts, idxs, 0.7, 0.13, 0, 0.6, 0.14, 0.1, 0.2, 0.13, [cr, cg, cb]);
    this.addTaperedBox(verts, idxs, 1.05, 0.1, 0, 0.3, 0.1, 0.06, 0.13, 0.09, [cr, cg, cb]);
    // Nose tip: forward-pointing wedge (addCone builds upward, so use a
    // horizontal taper instead of a vertical spike)
    this.addTaperedBox(verts, idxs, 1.3, 0.1, 0, 0.2, 0.06, 0.03, 0.09, 0.04, [cr, cg, cb]);
    // Nose side strakes (vertical fins along the nose sides)
    this.addBox(verts, idxs, 0.9, 0.1, 0.1, 0.5, 0.05, 0.02, carbon);
    this.addBox(verts, idxs, 0.9, 0.1, -0.1, 0.5, 0.05, 0.02, carbon);

    // ── 5. Front wing (4 elements + endplates + pylons) ──
    this.addBox(verts, idxs, 1.2, 0.06, 0, 0.32, 0.025, 1.5, carbon);   // main plane
    this.addBox(verts, idxs, 1.14, 0.1, 0, 0.2, 0.025, 1.42, carbon);   // flap
    this.addBox(verts, idxs, 1.09, 0.08, 0, 0.14, 0.02, 1.34, carbon);  // third element
    this.addBox(verts, idxs, 1.03, 0.07, 0, 0.1, 0.02, 1.26, carbon);   // fourth element
    this.addTaperedBox(verts, idxs, 1.2, 0.11, 0.75, 0.36, 0.22, 0.14, 0.05, 0.05, carbon);  // endplates
    this.addTaperedBox(verts, idxs, 1.2, 0.11, -0.75, 0.36, 0.22, 0.14, 0.05, 0.05, carbon);
    // Endplate lower steps
    this.addBox(verts, idxs, 1.2, 0.05, 0.75, 0.34, 0.08, 0.03, carbon);
    this.addBox(verts, idxs, 1.2, 0.05, -0.75, 0.34, 0.08, 0.03, carbon);
    this.addBox(verts, idxs, 1.2, 0.08, 0.16, 0.1, 0.05, 0.04, carbon); // nose pylons
    this.addBox(verts, idxs, 1.2, 0.08, -0.16, 0.1, 0.05, 0.04, carbon);

    // ── 6. Sidepods (wide intake → narrow rear, with undercut) ──
    this.addTaperedBox(verts, idxs, -0.05, 0.17, 0.5, 1.15, 0.14, 0.25, 0.3, 0.42, [cr, cg, cb]);
    this.addTaperedBox(verts, idxs, -0.05, 0.17, -0.5, 1.15, 0.14, 0.25, 0.3, 0.42, [cr, cg, cb]);
    // Undercut (dark lower half of the sidepod)
    this.addTaperedBox(verts, idxs, -0.05, 0.08, 0.5, 1.0, 0.06, 0.1, 0.26, 0.36, dark);
    this.addTaperedBox(verts, idxs, -0.05, 0.08, -0.5, 1.0, 0.06, 0.1, 0.26, 0.36, dark);
    // Sidepod intakes (dark openings at the front)
    this.addBox(verts, idxs, 0.58, 0.22, 0.5, 0.1, 0.07, 0.24, dark);
    this.addBox(verts, idxs, 0.58, 0.22, -0.5, 0.1, 0.07, 0.24, dark);
    // Sidepod cooling slats (dark outlets on top, seated flush on the surface)
    this.addBox(verts, idxs, -0.35, 0.26, 0.5, 0.3, 0.01, 0.16, dark);
    this.addBox(verts, idxs, -0.35, 0.26, -0.5, 0.3, 0.01, 0.16, dark);

    // ── 7. Engine cover (tall behind the cockpit, sloping down to the rear) ──
    this.addTaperedBox(verts, idxs, -0.5, 0.3, 0, 0.85, 0.12, 0.28, 0.2, 0.32, [cr, cg, cb]);
    // Airbox (tall at the intake, tapering back)
    this.addTaperedBox(verts, idxs, -0.25, 0.42, 0, 0.45, 0.09, 0.17, 0.16, 0.26, carbon);
    this.addBox(verts, idxs, -0.15, 0.47, 0, 0.1, 0.06, 0.14, dark); // intake hole

    // ── 8. Rear wing (main plane + DRS flap + beam wing + gurney + endplates) ──
    this.addBox(verts, idxs, -1.0, 0.4, 0, 0.36, 0.035, 1.05, carbon);
    this.addBox(verts, idxs, -1.0, 0.46, 0, 0.28, 0.03, 1.0, carbon);
    this.addBox(verts, idxs, -1.0, 0.45, 0, 0.08, 0.05, 0.9, carbon); // gurney lip
    this.addBox(verts, idxs, -0.95, 0.3, 0, 0.2, 0.025, 0.7, carbon);
    this.addBox(verts, idxs, -1.0, 0.42, 0.52, 0.34, 0.32, 0.045, carbon);
    this.addBox(verts, idxs, -1.0, 0.42, -0.52, 0.34, 0.32, 0.045, carbon);
    this.addBox(verts, idxs, -0.9, 0.3, 0.22, 0.1, 0.16, 0.04, grey); // support pylons
    this.addBox(verts, idxs, -0.9, 0.3, -0.22, 0.1, 0.16, 0.04, grey);

    // ── 9. Bargeboards (stack of 3 vertical vanes ahead of the sidepods) ──
    this.addBox(verts, idxs, 0.55, 0.1, 0.33, 0.3, 0.12, 0.02, carbon);
    this.addBox(verts, idxs, 0.55, 0.1, -0.33, 0.3, 0.12, 0.02, carbon);
    this.addBox(verts, idxs, 0.55, 0.07, 0.38, 0.26, 0.08, 0.015, carbon);
    this.addBox(verts, idxs, 0.55, 0.07, -0.38, 0.26, 0.08, 0.015, carbon);
    this.addBox(verts, idxs, 0.55, 0.05, 0.43, 0.2, 0.05, 0.012, carbon);
    this.addBox(verts, idxs, 0.55, 0.05, -0.43, 0.2, 0.05, 0.012, carbon);

    // ── 9b. Front wing cascade winglets (stacked vanes on endplates) ──
    this.addBox(verts, idxs, 1.15, 0.2, 0.7, 0.12, 0.06, 0.1, carbon);
    this.addBox(verts, idxs, 1.15, 0.2, -0.7, 0.12, 0.06, 0.1, carbon);
    this.addTaperedBox(verts, idxs, 1.1, 0.16, 0.65, 0.2, 0.1, 0.02, 0.16, 0.02, carbon);
    this.addTaperedBox(verts, idxs, 1.1, 0.16, -0.65, 0.2, 0.1, 0.02, 0.16, 0.02, carbon);

    // ── 9c. Turning vanes (ahead of sidepod undercut, below the bargeboards) ──
    this.addTaperedBox(verts, idxs, 0.35, 0.06, 0.35, 0.25, 0.06, 0.01, 0.14, 0.02, carbon);
    this.addTaperedBox(verts, idxs, 0.35, 0.06, -0.35, 0.25, 0.06, 0.01, 0.14, 0.02, carbon);

    // ── 9d. Front brake duct scoops ──
    this.addBox(verts, idxs, 0.62, 0.12, 0.62, 0.1, 0.1, 0.06, carbon);
    this.addBox(verts, idxs, 0.62, 0.12, -0.62, 0.1, 0.1, 0.06, carbon);

    // ── 9e. DRS actuator pod ──
    this.addBox(verts, idxs, -0.85, 0.38, 0, 0.1, 0.05, 0.08, grey);

    // ── 9f. Livery accent stripe (contrast band on engine cover/sidepods) ──
    const stripe: [number, number, number] = [0.05, 0.05, 0.08];
    this.addBox(verts, idxs, -0.1, 0.335, 0.505, 0.5, 0.02, 0.005, stripe);
    this.addBox(verts, idxs, -0.1, 0.335, -0.505, 0.5, 0.02, 0.005, stripe);

    // ── 10. Mirrors + stalks ──
    this.addBox(verts, idxs, 0.35, 0.3, 0.6, 0.1, 0.05, 0.07, grey);
    this.addBox(verts, idxs, 0.35, 0.3, -0.6, 0.1, 0.05, 0.07, grey);
    this.addStrut(verts, idxs, 0.3, 0.24, 0.52, 0.35, 0.3, 0.6, 0.02, carbon);
    this.addStrut(verts, idxs, 0.3, 0.24, -0.52, 0.35, 0.3, -0.6, 0.02, carbon);

    // ── 11. Exhaust outlets ──
    this.addCylinder(verts, idxs, -0.72, 0.28, 0.18, 0.04, 0.07, 8, grey);
    this.addCylinder(verts, idxs, -0.72, 0.28, -0.18, 0.04, 0.07, 8, grey);

    // ── 12. Rain light ──
    this.addBox(verts, idxs, -1.02, 0.52, 0, 0.05, 0.07, 0.06, [1, 0.15, 0.15]);

    // ── 13. T-cam + antenna ──
    this.addBox(verts, idxs, -0.2, 0.5, 0, 0.04, 0.05, 0.05, [1.0, 0.9, 0.2]);
    this.addCylinder(verts, idxs, -0.6, 0.39, 0, 0.008, 0.3, 6, grey);

    // ── 14. Shark fin (thin blade over the engine cover) ──
    this.addBox(verts, idxs, -0.55, 0.4, 0, 0.5, 0.16, 0.015, carbon);

    // ── 15. Suspension wishbones + pushrods ──
    // Front upper arms (tub → wheel hub)
    this.addStrut(verts, idxs, 0.58, 0.16, 0.22, 0.72, 0.06, 0.72, 0.025, carbon);
    this.addStrut(verts, idxs, 0.58, 0.16, -0.22, 0.72, 0.06, -0.72, 0.025, carbon);
    // Front lower arms
    this.addStrut(verts, idxs, 0.62, 0.05, 0.22, 0.78, 0.02, 0.74, 0.025, carbon);
    this.addStrut(verts, idxs, 0.62, 0.05, -0.22, 0.78, 0.02, -0.74, 0.025, carbon);
    // Front pushrods (lower arm up into the tub)
    this.addStrut(verts, idxs, 0.68, 0.03, 0.72, 0.6, 0.14, 0.18, 0.015, grey);
    this.addStrut(verts, idxs, 0.68, 0.03, -0.72, 0.6, 0.14, -0.18, 0.015, grey);
    // Rear upper arms
    this.addStrut(verts, idxs, -0.52, 0.16, 0.22, -0.64, 0.06, 0.72, 0.025, carbon);
    this.addStrut(verts, idxs, -0.52, 0.16, -0.22, -0.64, 0.06, -0.72, 0.025, carbon);
    // Rear lower arms
    this.addStrut(verts, idxs, -0.56, 0.05, 0.22, -0.7, 0.02, 0.74, 0.025, carbon);
    this.addStrut(verts, idxs, -0.56, 0.05, -0.22, -0.7, 0.02, -0.74, 0.025, carbon);

    const vertArray = new Float32Array(verts);
    const idxArray = new Uint16Array(idxs);
    this.carCount = idxArray.length;

    this.carVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.carVao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertArray, gl.STATIC_DRAW);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArray, gl.STATIC_DRAW);
    const stride = 11 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);

    // Build wheel mesh
    this.buildWheelMesh();
  }

  private buildWheelMesh() {
    const gl = this.gl;
    const stride = 11 * 4;
    // ── Front wheels (narrower) — rim disc + brake disc + hub + tread ──
    const fv: number[] = [];
    const fi: number[] = [];
    // Rim disc (dark, fills the tread inner circle)
    this.addCylinder(fv, fi, 0, 0, 0, 0.15, 0.15, 10, [0.07, 0.07, 0.08]);
    // Brake disc (reddish, slightly wider than the rim so it peeks out)
    this.addCylinder(fv, fi, 0, 0, 0, 0.09, 0.17, 10, [0.35, 0.12, 0.1]);
    // Hub center
    this.addCylinder(fv, fi, 0, 0, 0, 0.04, 0.17, 8, [0.5, 0.5, 0.55]);
    // Tire tread — larger radius so the band wraps the rim
    this.addCylinder(fv, fi, 0, 0, 0, 0.17, 0.12, 10, [0.13, 0.13, 0.14]);
    // Valve stem
    this.addCylinder(fv, fi, 0.14, 0.05, 0, 0.008, 0.05, 4, [0.2, 0.2, 0.2]);
    const fva = new Float32Array(fv);
    const fia = new Uint16Array(fi);
    this.wheelCount = fia.length;
    this.wheelVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.wheelVao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, fva, gl.STATIC_DRAW);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, fia, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);

    // ── Rear wheels (wider tread, slightly larger — like a real F1 car) ──
    const rv: number[] = [];
    const ri: number[] = [];
    this.addCylinder(rv, ri, 0, 0, 0, 0.16, 0.18, 10, [0.07, 0.07, 0.08]);
    this.addCylinder(rv, ri, 0, 0, 0, 0.1, 0.2, 10, [0.35, 0.12, 0.1]);
    this.addCylinder(rv, ri, 0, 0, 0, 0.045, 0.2, 8, [0.5, 0.5, 0.55]);
    this.addCylinder(rv, ri, 0, 0, 0, 0.18, 0.15, 10, [0.13, 0.13, 0.14]); 
    this.addCylinder(rv, ri, 0.15, 0.06, 0, 0.008, 0.05, 4, [0.2, 0.2, 0.2]);
    const rva = new Float32Array(rv);
    const ria = new Uint16Array(ri);
    this.rearWheelCount = ria.length;
    this.rearWheelVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.rearWheelVao);
    const rvbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, rvbo);
    gl.bufferData(gl.ARRAY_BUFFER, rva, gl.STATIC_DRAW);
    const ribo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ribo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ria, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
  }

  // ─── Primitive Helpers ───
  private addBox(verts: number[], idxs: number[], cx: number, cy: number, cz: number, l: number, h: number, w: number, color: number[]) {
    const hw = w / 2, hh = h / 2, hl = l / 2;
    const [r, g, b] = color;
    const n = [
      // front
      [0, 0, 1], // back
      [0, 0, -1], // left
      [-1, 0, 0], // right
      [1, 0, 0], // top
      [0, 1, 0], // bottom
      [0, -1, 0]
    ];
    const v = [
      [-hl, -hh, -hw],
      [hl, -hh, -hw],
      [hl, hh, -hw],
      [-hl, hh, -hw],
      [-hl, -hh, hw],
      [hl, -hh, hw],
      [hl, hh, hw],
      [-hl, hh, hw]
    ];
    const faces = [
      [3, 2, 1, 0],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [2, 3, 7, 6],
      [1, 2, 6, 5],
      [3, 0, 4, 7]
    ];
    const uvs = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1]
    ];
    for (let fi = 0; fi < faces.length; fi++) {
      const face = faces[fi];
      const norm = n[fi];
      const base = verts.length / 11;
      for (let vi = 0; vi < 4; vi++) {
        const vv = v[face[vi]];
        verts.push(cx + vv[0], cy + vv[1], cz + vv[2], norm[0], norm[1], norm[2], r, g, b, uvs[vi][0], uvs[vi][1]);
      }
      idxs.push(base, base + 1, base + 2);
      idxs.push(base + 2, base + 3, base);
    }
  }

  // Single quad (4 corners). Normal is computed from the winding via a cross
  // product, so tapered / sloped faces get correct per-face lighting.
  private addQuad(verts: number[], idxs: number[], a: number[], b: number[], c: number[], d: number[], color: number[]) {
    const [r, g, bl] = color;
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const base = verts.length / 11;
    for (const p of [a, b, c, d]) {
      verts.push(p[0], p[1], p[2], nx, ny, nz, r, g, bl, 0, 0);
    }
    idxs.push(base, base + 1, base + 2);
    idxs.push(base + 2, base + 3, base);
  }

  // Vertical window quad on a building wall. (nx, nz) is the OUTWARD wall
  // normal (e.g. 0,1 for a +Z face, 1,0 for +X). Because the tangent (rx, rz)
  // = (nz, -nx) swaps the corner order for negative normals, this single
  // winding yields an outward normal for every face — no extra flip needed.
  private addWindowQuad(verts: number[], idxs: number[], cx: number, cy: number, cz: number, w: number, h: number, nx: number, nz: number, color: number[]) {
    const hw = w / 2;
    // Left/right offsets along the wall (perpendicular to the outward normal).
    const rx = nz, rz = -nx;
    const a = [cx - rx * hw, cy, cz - rz * hw];
    const b = [cx + rx * hw, cy, cz + rz * hw];
    const c = [cx + rx * hw, cy + h, cz + rz * hw];
    const d = [cx - rx * hw, cy + h, cz - rz * hw];
    this.addQuad(verts, idxs, a, b, c, d, color);
  }

  // Thin box (strut / wishbone) running from point A to point B with a given
  // cross-section thickness. Used for suspension arms, mirror stalks, and
  // wing mounts. Uses the same 11-float vertex layout as addQuad.
  private addStrut(verts: number[], idxs: number[], ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number, color: number[]) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    // Build an orthonormal frame: u is the strut axis, v/w span the cross-section.
    let vx = 0, vy = 1, vz = 0;
    if (Math.abs(uy) > 0.9) { vx = 1; vy = 0; vz = 0; }
    // v = v - (v·u)u, then normalize
    const vdot = vx * ux + vy * uy + vz * uz;
    vx -= vdot * ux; vy -= vdot * uy; vz -= vdot * uz;
    const vlen = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    vx /= vlen; vy /= vlen; vz /= vlen;
    // w = u × v
    const wx = uy * vz - uz * vy;
    const wy = uz * vx - ux * vz;
    const wz = ux * vy - uy * vx;
    const h = t / 2;
    const a0 = [ax - vx * h - wx * h, ay - vy * h - wy * h, az - vz * h - wz * h];
    const a1 = [ax + vx * h - wx * h, ay + vy * h - wy * h, az + vz * h - wz * h];
    const a2 = [ax + vx * h + wx * h, ay + vy * h + wy * h, az + vz * h + wz * h];
    const a3 = [ax - vx * h + wx * h, ay - vy * h + wy * h, az - vz * h + wz * h];
    const b0 = [bx - vx * h - wx * h, by - vy * h - wy * h, bz - vz * h - wz * h];
    const b1 = [bx + vx * h - wx * h, by + vy * h - wy * h, bz + vz * h - wz * h];
    const b2 = [bx + vx * h + wx * h, by + vy * h + wy * h, bz + vz * h + wz * h];
    const b3 = [bx - vx * h + wx * h, by - vy * h + wy * h, bz - vz * h + wz * h];
    this.addQuad(verts, idxs, a0, a1, b1, b0, color); // bottom
    this.addQuad(verts, idxs, a2, a3, b3, b2, color); // top
    this.addQuad(verts, idxs, a1, a2, b2, b1, color); // right (+v)
    this.addQuad(verts, idxs, a0, b0, b3, a3, color); // left (−v)
    this.addQuad(verts, idxs, a0, a3, a2, a1, color); // A cap (−u)
    this.addQuad(verts, idxs, b0, b1, b2, b3, color); // B cap (+u)
  }

  // Frustum prism along X: back face (x = cx - l/2) sized hBack × wBack, front
  // face (x = cx + l/2) sized hFront × wFront. Gives sloped top/bottom/sides
  // for noses, sidepods, engine covers, and diffusers.
  private addTaperedBox(verts: number[], idxs: number[], cx: number, cy: number, cz: number, l: number, hBack: number, hFront: number, wBack: number, wFront: number, color: number[]) {
    const hl = l / 2, hhb = hBack / 2, hhf = hFront / 2, hwb = wBack / 2, hwf = wFront / 2;
    const b0 = [cx - hl, cy - hhb, cz - hwb];
    const b1 = [cx - hl, cy - hhb, cz + hwb];
    const b2 = [cx - hl, cy + hhb, cz + hwb];
    const b3 = [cx - hl, cy + hhb, cz - hwb];
    const f0 = [cx + hl, cy - hhf, cz - hwf];
    const f1 = [cx + hl, cy - hhf, cz + hwf];
    const f2 = [cx + hl, cy + hhf, cz + hwf];
    const f3 = [cx + hl, cy + hhf, cz - hwf];
    // Bottom / top / left / right / back / front — winding chosen so the
    // cross-product normal points outward.
    this.addQuad(verts, idxs, b1, b0, f0, f1, color); // bottom
    this.addQuad(verts, idxs, b2, f2, f3, b3, color); // top
    this.addQuad(verts, idxs, b3, f3, f0, b0, color); // left (z-)
    this.addQuad(verts, idxs, b1, f1, f2, b2, color); // right (z+)
    this.addQuad(verts, idxs, b0, b1, b2, b3, color); // back (x-)
    this.addQuad(verts, idxs, f0, f3, f2, f1, color); // front (x+)
  }

  private addCylinder(verts: number[], idxs: number[], cx: number, cy: number, cz: number, radius: number, height: number, segments: number, color: number[]) {
    const [r, g, b] = color;
    const baseIdx = verts.length / 11;
    const stride = segments + 1;

    // Top ring
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      verts.push(cx + x, cy + height, cz + z, 0, 1, 0, r * 1.1, g * 1.1, b * 1.1, i / segments, 1);
    }
    // Bottom ring
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      verts.push(cx + x, cy, cz + z, 0, -1, 0, r * 0.9, g * 0.9, b * 0.9, i / segments, 0);
    }
    const topStart = baseIdx;
    const bottomStart = baseIdx + stride;

    // Side walls: connect top ring to bottom ring (outward-facing)
    for (let i = 0; i < segments; i++) {
      idxs.push(bottomStart + i, topStart + i, topStart + i + 1);
      idxs.push(bottomStart + i, topStart + i + 1, bottomStart + i + 1);
    }

    // Top cap: fan from center (CCW when viewed from above → +Y normal)
    const topCenter = verts.length / 11;
    verts.push(cx, cy + height, cz, 0, 1, 0, r, g, b, 0.5, 1);
    for (let i = 0; i < segments; i++) {
      idxs.push(topCenter, topStart + i + 1, topStart + i);
    }

    // Bottom cap: fan from center (faces down → visible from below)
    const bottomCenter = verts.length / 11;
    verts.push(cx, cy, cz, 0, -1, 0, r, g, b, 0.5, 0);
    for (let i = 0; i < segments; i++) {
      idxs.push(bottomCenter, bottomStart + i, bottomStart + i + 1);
    }
  }

  private addCone(verts: number[], idxs: number[], cx: number, cy: number, cz: number, radius: number, height: number, segments: number, color: number[]) {
    const [r, g, b] = color;
    const baseIdx = verts.length / 11;

    // Base ring
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      verts.push(cx + Math.cos(a) * radius, cy, cz + Math.sin(a) * radius, 0, -1, 0, r, g, b, i / segments, 0);
    }
    // Tip
    const tipIdx = verts.length / 11;
    verts.push(cx, cy + height, cz, 0, 1, 0, r * 1.3, g * 1.3, b * 1.3, 0.5, 1);

    // Base triangles
    for (let i = 0; i < segments; i++) {
      idxs.push(baseIdx + i, baseIdx + i + 1, baseIdx + segments + 1);
    }

    // Side triangles (base + tip)
    const sideStart = verts.length / 11;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      verts.push(cx + Math.cos(a) * radius, cy, cz + Math.sin(a) * radius, Math.cos(a) * 0.5, 0.5, Math.sin(a) * 0.5, r, g, b, i / segments, 0);
    }
    const tipIdx2 = verts.length / 11;
    verts.push(cx, cy + height, cz, 0, 0.7, 0, r * 1.1, g * 1.1, b * 1.1, 0.5, 1);

    for (let i = 0; i < segments; i++) {
      idxs.push(sideStart + i, tipIdx2, sideStart + i + 1);
    }
  }

  private addSphere(verts: number[], idxs: number[], cx: number, cy: number, cz: number, r: number, segments: number, color: number[]) {
    const [cr, cg, cb] = color;
    const baseIdx = verts.length / 11;
    // Simplified: just 3 rings
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      for (let j = 0; j <= segments; j++) {
        const b = (j / segments) * Math.PI;
        const x = Math.cos(a) * Math.sin(b) * r;
        const y = Math.cos(b) * r;
        const z = Math.sin(a) * Math.sin(b) * r;
        verts.push(cx + x, cy + y, cz + z, x / r, y / r, z / r, cr, cg, cb, i / segments, j / segments);
      }
    }
    const stride = segments + 1;
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < segments; j++) {
        const a = baseIdx + i * stride + j;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        idxs.push(a, b, c);
        idxs.push(c, b, d);
      }
    }
  }

  private addGrandstand(verts: number[], idxs: number[], gx: number, gz: number, dirX: number, dirZ: number, width: number, depth: number) {
    const ppx = -dirZ;
    const ppz = dirX;
    const hw = width / 2;
    // Tiered seats
    const crowdColors: [number, number, number][] = [
      [0.7, 0.15, 0.15], [0.15, 0.3, 0.7], [0.8, 0.7, 0.1],
      [0.9, 0.9, 0.9], [0.15, 0.5, 0.2], [0.6, 0.2, 0.6],
    ];
    for (let tier = 0; tier < 4; tier++) {
      const ty = 0.5 + tier * 0.3;
      const td = 1 + tier * 0.8;
      const tx = gx + ppx * td;
      const tz = gz + ppz * td;
      const c = crowdColors[Math.floor(Math.random() * crowdColors.length)];
      this.addBox(verts, idxs, tx, ty, tz, 0.3, 0.3, hw * 2, c);
    }
    // Roof
    this.addBox(verts, idxs, gx + ppx * 3, 2.5, gz + ppz * 3, 1.5, 0.1, hw * 2.5, [0.3, 0.3, 0.35]);
    // Pillars
    for (const side of [-1, 1]) {
      this.addBox(verts, idxs, gx + ppx * 3 + ppx * side * hw * 1.2, 1.25, gz + ppz * 3 + ppz * side * hw * 1.2, 0.1, 2.5, 0.1, [0.3, 0.3, 0.35]);
    }
  }

  // ─── Rendering ───
  // ─── Rain particles ───
  private _rainParticles: { x: number; y: number; z: number; speed: number }[] = [];
  private _rainVao!: WebGLVertexArrayObject;
  private _rainCount = 0;
  private _rainInitialized = false;

  private initRainParticles() {
    if (this._rainInitialized) return;
    this._rainInitialized = true;
    const gl = this.gl;
    const count = 2000;
    const verts: number[] = [];
    this._rainParticles = [];
    for (let i = 0; i < count; i++) {
      const r = { x: (Math.random() - 0.5) * 200, y: Math.random() * 30, z: (Math.random() - 0.5) * 200, speed: 20 + Math.random() * 15 };
      this._rainParticles.push(r);
      // Each drop is a line: two vertices
      verts.push(r.x, r.y, r.z, 0.5, 0.6, 0.8, 0.3);
      verts.push(r.x, r.y - 0.5, r.z, 0.5, 0.6, 0.8, 0.3);
    }
    this._rainCount = count * 2;
    this._rainVao = gl.createVertexArray()!;
    gl.bindVertexArray(this._rainVao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);
    this._rainBuf = buf;
  }
  private _rainBuf!: WebGLBuffer;

  render(eyeX: number, eyeY: number, eyeZ: number, yaw: number, pitch: number, aspect: number,
    cars: { x: number; y: number; z: number; yaw: number; r: number; g: number; b: number }[], dt: number,
    fovZoom: number = 1.0, shakeX: number = 0, shakeY: number = 0, isRaining: boolean = false, speedRatio: number = 0) {
    const gl = this.gl;
    this.elapsed += dt;

    // Apply FOV zoom (speed-based tunnel vision) and screen shake
    const fov = 1.1 * fovZoom;
    this.mat4Perspective(this.projMatrix, fov, aspect, 0.5, 600);
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
    const eye = [eyeX + shakeX, eyeY + shakeY, eyeZ];
    const lookX = eye[0] + sinY * cosP;
    const lookY = eye[1] - sinP;
    const lookZ = eye[2] + cosY * cosP;
    this.mat4LookAt(this.viewMatrix, eye as number[], [lookX, lookY, lookZ], [0, 1, 0]);

    // ─── Shadow Pass ───
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
    gl.viewport(0, 0, this.shadowSize, this.shadowSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.shadowProg);

    const lightTarget = [eyeX + this.sunDir[0] * 50, eyeY + this.sunDir[1] * 50, eyeZ + this.sunDir[2] * 50];
    const lightEye = [eyeX - this.sunDir[0] * 80, eyeY - this.sunDir[1] * 80, eyeZ - this.sunDir[2] * 80];
    this.mat4LookAt(this.lightView, lightEye, lightTarget, [0, 1, 0]);
    this.mat4Ortho(this.lightProj, -80, 80, -80, 80, 0, 200);
    this.mat4Multiply(this.lightSpace, this.lightProj, this.lightView);

    gl.uniformMatrix4fv(this.shadowLightLoc, false, this.lightSpace);
    this.mat4Identity(this.modelMatrix);
    gl.uniformMatrix4fv(this.shadowModelLoc, false, this.modelMatrix);
    gl.bindVertexArray(this.trackVao);
    gl.drawElements(gl.TRIANGLES, this.trackCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(this.barrierVao);
    gl.drawElements(gl.TRIANGLES, this.barrierCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(this.finishVao);
    gl.drawElements(gl.TRIANGLES, this.finishCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(this.sceneryVao);
    gl.drawElements(gl.TRIANGLES, this.sceneryCount, gl.UNSIGNED_SHORT, 0);

    // ─── Main Pass ───
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.4, 0.45, 0.5, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Sky — fill the background with depth testing OFF and no depth writes so the
    // sky can never z-fight with distant geometry (was flashing white/blue at horizon).
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.useProgram(this.skyProg);
    gl.uniformMatrix4fv(this.skyProjLoc, false, this.projMatrix);
    gl.uniformMatrix4fv(this.skyViewLoc, false, this.viewMatrix);
    gl.uniform3fv(this.skySunDirLoc, this.sunDir);
    gl.uniform1f(this.skyTimeLoc, this.elapsed);
    gl.uniform3fv(this.skyTopLoc, this.skyTop);
    gl.uniform3fv(this.skyHorizonLoc, this.skyHorizon);
    gl.uniform3fv(this.skyBottomLoc, this.skyBottom);
    gl.uniform3fv(this.skySunColorLoc, this.sunColor);
    gl.uniform3fv(this.skyGlowColorLoc, [this.sunColor[0] * 0.85, this.sunColor[1] * 0.75, this.sunColor[2] * 0.6]);
    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 36);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    // NOTE: the whole main geometry pass is rendered with back-face culling DISABLED.
    // The barrier walls are single-sided quads; if their winding is ever off by one
    // mirror, gl.cullFace(gl.BACK) makes the wall vanish ("transparent walls").
    // Rendering them double-sided guarantees walls are always visible.
    gl.disable(gl.CULL_FACE);
    // The sky wrote no depth, so the depth buffer stays at its cleared value
    // and the main geometry pass draws over the sky correctly.

    // Rain: only clears depth (sky already filled the color buffer)
    if (isRaining) {
      gl.clear(gl.DEPTH_BUFFER_BIT);
    }

    // Main program
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.projLoc, false, this.projMatrix);
    gl.uniformMatrix4fv(this.viewLoc, false, this.viewMatrix);
    gl.uniform3fv(this.lightDirLoc, this.sunDir);
    if (isRaining) {
      gl.uniform3fv(this.ambientLoc, new Float32Array([0.15, 0.15, 0.18]));
      gl.uniform3fv(this.fogColorLoc, new Float32Array([0.2, 0.22, 0.25]));
    } else {
      gl.uniform3fv(this.ambientLoc, this.ambientColor);
      gl.uniform3fv(this.fogColorLoc, this.fogColor);
    }
    gl.uniform3f(this.viewPosLoc, eye[0], eye[1], eye[2]);
    gl.uniform1i(this.hasTexLoc, 1);

    // Track (asphalt road + shoulders, textured)
    gl.bindVertexArray(this.trackVao);
    gl.uniform1i(this.textureLoc, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.trackTex);
    gl.uniform1i(this.hasTexLoc, 1);
    this.mat4Identity(this.modelMatrix);
    gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
    gl.uniform3f(this.colorLoc, 1, 1, 1);
    this.setNormalMatrix(this.modelMatrix);
    gl.drawElements(gl.TRIANGLES, this.trackCount, gl.UNSIGNED_SHORT, 0);

    // Start/Finish checkerboard (flat colors — exactly one band per lap)
    gl.bindVertexArray(this.finishVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);
    gl.uniform1i(this.hasTexLoc, 0);
    this.mat4Identity(this.modelMatrix);
    gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
    gl.uniform3f(this.colorLoc, 1, 1, 1);
    this.setNormalMatrix(this.modelMatrix);
    gl.drawElements(gl.TRIANGLES, this.finishCount, gl.UNSIGNED_SHORT, 0);

    // Barrier walls (flat vivid red/white — no dark-texture multiply)
    gl.bindVertexArray(this.barrierVao);
    this.mat4Identity(this.modelMatrix);
    gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
    gl.uniform3f(this.colorLoc, 1, 1, 1);
    this.setNormalMatrix(this.modelMatrix);
    gl.drawElements(gl.TRIANGLES, this.barrierCount, gl.UNSIGNED_SHORT, 0);

    // Scenery (trees, grandstands, light poles)
    gl.bindVertexArray(this.sceneryVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);
    gl.uniform1i(this.hasTexLoc, 1);
    this.mat4Identity(this.modelMatrix);
    gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
    gl.uniform3f(this.colorLoc, 1, 1, 1);
    this.setNormalMatrix(this.modelMatrix);
    gl.drawElements(gl.TRIANGLES, this.sceneryCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);

    // Cars
    for (const car of cars) {
      this.renderCar(car.x, car.y, car.z, car.yaw, car.r, car.g, car.b);
    }

    // ─── Rain Particles (if enabled) ───
    if (isRaining) {
      this.initRainParticles();
    }
    if (this._rainCount > 0) {
      const rain = this._rainParticles;
      const rainData: number[] = [];
      const wind = Math.sin(this.elapsed * 0.3) * 5;
      for (let i = 0; i < rain.length; i++) {
        const r = rain[i];
        r.y -= r.speed * dt;
        r.x += wind * dt;
        if (r.y < -2) { r.y = 25 + Math.random() * 5; r.x = eye[0] + (Math.random() - 0.5) * 200; r.z = eye[2] + (Math.random() - 0.5) * 200; }
        rainData.push(r.x, r.y, r.z, 0.5, 0.6, 0.8, 0.3);
        rainData.push(r.x, r.y - 0.5, r.z, 0.5, 0.6, 0.8, 0.3);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this._rainBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(rainData));

      gl.useProgram(this.prog);
      gl.disable(gl.CULL_FACE);
      gl.depthMask(false);
      gl.bindVertexArray(this._rainVao);
      gl.uniform1i(this.hasTexLoc, 0);
      gl.uniform3f(this.colorLoc, 1, 1, 1);
      this.mat4Identity(this.modelMatrix);
      gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
      gl.drawArrays(gl.LINES, 0, this._rainCount);
      gl.bindVertexArray(null);
      gl.depthMask(true);
      gl.enable(gl.CULL_FACE);
    }
  }

  renderCar(x: number, y: number, z: number, yaw: number, r: number, g: number, b: number) {
    const gl = this.gl;
    gl.useProgram(this.prog);
    // The detailed car body is built from double-sided quads with computed
    // normals, so draw it with back-face culling OFF to avoid any winding
    // mismatch hiding faces. (Re-enabled at the end.)
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.carVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);

    this.mat4Identity(this.modelMatrix);
    this.mat4Translate(this.modelMatrix, [x, y + 0.15, z]);
    // The car mesh is built pointing along +X (nose at +X), but the game's yaw
    // convention puts 0 rad at +Z (velocity = sin(yaw), cos(yaw)). Rotating by
    // yaw alone drew every car 90° off its heading ("horizontal" instead of
    // driving forward). Subtract π/2 to align the nose with the travel dir.
    this.mat4RotateY(this.modelMatrix, yaw - Math.PI / 2);
    this.mat4Scale(this.modelMatrix, [0.8, 0.8, 0.8]);
    gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
    gl.uniform3f(this.colorLoc, r, g, b);
    gl.uniform1i(this.hasTexLoc, 0);
    this.setNormalMatrix(this.modelMatrix);
    gl.drawElements(gl.TRIANGLES, this.carCount, gl.UNSIGNED_SHORT, 0);

    // Wheels
    // The body mesh is scaled 0.8 (floor half-width ≈ 0.52, floor bottom ≈
    // y+0.158), but the wheels are drawn UNscaled — so the old offsets
    // (±0.2 lateral, -0.12 vertical) buried the tires under the floor and left
    // a visible gap between the chassis and the tires. These offsets match the
    // garage model: tire tops touch the floor bottom, and the wheels poke out
    // past the floor/sidepods so the tires read as sitting BESIDE the chassis.
    gl.bindVertexArray(this.wheelVao);
    // The wheels now sit AT the road surface (center y = 0.17, radius 0.17 →
    // tire bottom exactly on the ground) so the chassis rests ON the tires
    // instead of floating above them. Lateral ±0.60 puts the tire tread clearly
    // outside the floor/sidepods — tires read as BESIDE the chassis like a real
    // F1 car. Front wheels pushed to +0.62 (near the nose), rear at -0.55.
    const wheelPositions = [
      [0.62, 0, -0.60],
      [0.62, 0, 0.60],
      [-0.55, 0, -0.60],
      [-0.55, 0, 0.60]
    ];
    for (let wi = 0; wi < wheelPositions.length; wi++) {
      const wp = wheelPositions[wi];
      // Rear wheels (wi >= 2) use the wider, slightly larger rear wheel mesh.
      const rear = wi >= 2;
      gl.bindVertexArray(rear ? this.rearWheelVao : this.wheelVao);
      this.mat4Identity(this.modelMatrix);
      this.mat4Translate(this.modelMatrix, [x, y + 0.17, z]);
      // Same nose-alignment offset as the body above.
      this.mat4RotateY(this.modelMatrix, yaw - Math.PI / 2);
      this.mat4Translate(this.modelMatrix, wp);
      // The wheel cylinder is built along Y (coin standing on its edge). Lay it
      // onto the car's lateral axle (Z) with RX(π/2), then roll it about that
      // axle with RZ. Order matters: mat4Rotate* right-multiplies, so RX is
      // applied to the vertices first, then RZ spins the upright tire forward.
      // Negative angle moves the top of the tire toward the nose (+X travel).
      this.mat4RotateZ(this.modelMatrix, -this.elapsed * 5);
      this.mat4RotateX(this.modelMatrix, Math.PI / 2);
      gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
      gl.uniform3f(this.colorLoc, 0.05, 0.05, 0.05);
      this.setNormalMatrix(this.modelMatrix);
      gl.drawElements(gl.TRIANGLES, rear ? this.rearWheelCount : this.wheelCount, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
  }

  clearCache() {
    this._trackPoints = [];
  }

  // ─── Matrix Helpers ───
  private mat4Identity(out: Float32Array) {
    out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
  }

  private mat4Perspective(out: Float32Array, fov: number, aspect: number, near: number, far: number) {
    const f = 1.0 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
  }

  private mat4Ortho(out: Float32Array, l: number, r: number, b: number, t: number, n: number, f: number) {
    const lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (n - f);
    out[0] = -2 * lr; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = -2 * bt; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 2 * nf; out[11] = 0;
    out[12] = (l + r) * lr; out[13] = (t + b) * bt; out[14] = (n + f) * nf; out[15] = 1;
  }

  private mat4LookAt(out: Float32Array, eye: number[], center: number[], up: number[]) {
    let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    let len = 1 / Math.hypot(zx, zy, zz);
    zx *= len; zy *= len; zz *= len;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz);
    if (len > 0.001) { len = 1 / len; xx *= len; xy *= len; xz *= len; } else { xx = 1; xy = 0; xz = 0; }
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
  }

  private mat4Multiply(out: Float32Array, a: Float32Array, b: Float32Array) {
    for (let i = 0; i < 4; i++) {
      const ai0 = a[i], ai1 = a[4 + i], ai2 = a[8 + i], ai3 = a[12 + i];
      out[i] = ai0 * b[0] + ai1 * b[4] + ai2 * b[8] + ai3 * b[12];
      out[4 + i] = ai0 * b[1] + ai1 * b[5] + ai2 * b[9] + ai3 * b[13];
      out[8 + i] = ai0 * b[2] + ai1 * b[6] + ai2 * b[10] + ai3 * b[14];
      out[12 + i] = ai0 * b[3] + ai1 * b[7] + ai2 * b[11] + ai3 * b[15];
    }
  }

  private mat4Translate(out: Float32Array, v: number[]) {
    out[12] = out[0] * v[0] + out[4] * v[1] + out[8] * v[2] + out[12];
    out[13] = out[1] * v[0] + out[5] * v[1] + out[9] * v[2] + out[13];
    out[14] = out[2] * v[0] + out[6] * v[1] + out[10] * v[2] + out[14];
    out[15] = out[3] * v[0] + out[7] * v[1] + out[11] * v[2] + out[15];
  }

  private mat4RotateY(out: Float32Array, rad: number) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a00 = out[0], a01 = out[1], a02 = out[2], a03 = out[3];
    const a20 = out[8], a21 = out[9], a22 = out[10], a23 = out[11];
    out[0] = a00 * c - a20 * s; out[1] = a01 * c - a21 * s;
    out[2] = a02 * c - a22 * s; out[3] = a03 * c - a23 * s;
    out[8] = a00 * s + a20 * c; out[9] = a01 * s + a21 * c;
    out[10] = a02 * s + a22 * c; out[11] = a03 * s + a23 * c;
  }

  private mat4RotateX(out: Float32Array, rad: number) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a10 = out[4], a11 = out[5], a12 = out[6], a13 = out[7];
    const a20 = out[8], a21 = out[9], a22 = out[10], a23 = out[11];
    out[4] = a10 * c + a20 * s; out[5] = a11 * c + a21 * s;
    out[6] = a12 * c + a22 * s; out[7] = a13 * c + a23 * s;
    out[8] = a20 * c - a10 * s; out[9] = a21 * c - a11 * s;
    out[10] = a22 * c - a12 * s; out[11] = a23 * c - a13 * s;
  }

  private mat4RotateZ(out: Float32Array, rad: number) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a00 = out[0], a01 = out[1], a02 = out[2], a03 = out[3];
    const a10 = out[4], a11 = out[5], a12 = out[6], a13 = out[7];
    out[0] = a00 * c + a10 * s; out[1] = a01 * c + a11 * s;
    out[2] = a02 * c + a12 * s; out[3] = a03 * c + a13 * s;
    out[4] = a10 * c - a00 * s; out[5] = a11 * c - a01 * s;
    out[6] = a12 * c - a02 * s; out[7] = a13 * c - a03 * s;
  }

  private mat4Scale(out: Float32Array, v: number[]) {
    out[0] *= v[0]; out[1] *= v[0]; out[2] *= v[0]; out[3] *= v[0];
    out[4] *= v[1]; out[5] *= v[1]; out[6] *= v[1]; out[7] *= v[1];
    out[8] *= v[2]; out[9] *= v[2]; out[10] *= v[2]; out[11] *= v[2];
  }

  private setNormalMatrix(model: Float32Array) {
    const gl = this.gl;
    const m00 = model[0], m01 = model[1], m02 = model[2];
    const m10 = model[4], m11 = model[5], m12 = model[6];
    const m20 = model[8], m21 = model[9], m22 = model[10];
    const det = m00 * (m11 * m22 - m12 * m21) - m01 * (m10 * m22 - m12 * m20) + m02 * (m10 * m21 - m11 * m20);
    if (Math.abs(det) < 1e-6) return;
    const invDet = 1 / det;
    const nm = [
      (m11 * m22 - m12 * m21) * invDet,
      (m02 * m21 - m01 * m22) * invDet,
      (m01 * m12 - m02 * m11) * invDet,
      (m12 * m20 - m10 * m22) * invDet,
      (m00 * m22 - m02 * m20) * invDet,
      (m10 * m02 - m00 * m12) * invDet,
      (m10 * m21 - m11 * m20) * invDet,
      (m01 * m20 - m00 * m21) * invDet,
      (m00 * m11 - m01 * m10) * invDet,
    ];
    const loc = gl.getUniformLocation(this.prog, 'uNormalMatrix');
    if (loc) gl.uniformMatrix3fv(loc, false, new Float32Array(nm));
  }
}
