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
  private sceneryCount = 0;
  private carVao!: WebGLVertexArrayObject;
  private carCount = 0;
  private wheelVao!: WebGLVertexArrayObject;
  private wheelCount = 0;
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
uniform float uTime;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y * 0.5 + 0.5;
  vec3 top = vec3(0.1, 0.2, 0.5);
  vec3 horizon = vec3(0.7, 0.75, 0.85);
  vec3 bottom = vec3(0.4, 0.45, 0.5);
  // Smooth blend from ground → horizon → zenith with no hard seam at d.y = 0
  vec3 upper = mix(horizon, top, clamp(h * 1.5, 0.0, 1.0));
  vec3 lower = mix(horizon, bottom, clamp(-d.y * 3.0, 0.0, 1.0) * 0.5);
  float skyT = clamp(d.y * 4.0 + 0.5, 0.0, 1.0);
  vec3 sky = mix(lower, upper, skyT);
  // Soft, subtle sun — no blinding white disc, no oversaturated glow
  float sunDot = dot(d, normalize(uSunDir));
  float sun = pow(max(sunDot, 0.0), 120.0);
  sky += vec3(1.0, 0.95, 0.8) * sun * 0.9;
  float sunGlow = pow(max(sunDot, 0.0), 12.0);
  sky += vec3(1.0, 0.85, 0.6) * sunGlow * 0.18;
  FragColor = vec4(clamp(sky, 0.0, 1.0), 1.0);
}`;
    this.skyProg = this.createProgram(svs, sfs);
    this.skyProjLoc = gl.getUniformLocation(this.skyProg, 'uProj')!;
    this.skyViewLoc = gl.getUniformLocation(this.skyProg, 'uView')!;
    this.skySunDirLoc = gl.getUniformLocation(this.skyProg, 'uSunDir')!;
    this.skyTimeLoc = gl.getUniformLocation(this.skyProg, 'uTime')!;

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

  // ─── Scenery (trees, grandstands) ───
  private buildScenery() {
    const gl = this.gl;
    const pts = this._trackPoints;
    const verts: number[] = [];
    const idxs: number[] = [];

    // Trees: place along both sides of the track, but well clear of the road
    let treeIdx = 0;
    for (let i = 0; i < pts.length; i += 3) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      // Keep trees far from the asphalt + shoulders so they don't overlap the road
      const dist = p.width / 2 + 24 + Math.random() * 20;

      for (const side of [-1, 1]) {
        const tx = p.x + ppx * dist * side + (Math.random() - 0.5) * 8;
        const tz = p.z + ppz * dist * side + (Math.random() - 0.5) * 8;

        // Tree trunk
        const th = 1.5 + Math.random() * 1.5;
        const tr = 0.15 + Math.random() * 0.1;
        this.addCylinder(verts, idxs, tx, 0, tz, tr, th, 6, [0.3, 0.15, 0.05]);

        // Tree crown (2 cones, slightly smaller)
        const cr = 0.8 + Math.random() * 0.6;
        const ch = 1.2 + Math.random() * 0.6;
        this.addCone(verts, idxs, tx, th - 0.3, tz, cr, ch, 8, [0.05, 0.28 + Math.random() * 0.12, 0.02]);

        if (treeIdx++ > 250) break;
      }
      if (treeIdx > 250) break;
    }

    // Grandstands at key points
    const gsPositions = [0, Math.floor(pts.length / 4), Math.floor(pts.length / 2), Math.floor(pts.length * 3 / 4)];
    for (const gi of gsPositions) {
      const p = pts[gi];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const gx = p.x + ppx * (p.width / 2 + 8);
      const gz = p.z + ppz * (p.width / 2 + 8);
      this.addGrandstand(verts, idxs, gx, gz, p.dirX, p.dirZ, 4, 3);
    }

    // Light poles every 20 segments
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
        this.addSphere(verts, idxs, lx, 3, lz, 0.15, 6, [1, 0.95, 0.7]);
      }
    }

    const vertArray = new Float32Array(verts);
    const idxArray = new Uint16Array(idxs);
    this.sceneryCount = idxArray.length;

    this.sceneryVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.sceneryVao);
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

    // ── 1. Floor / diffuser (wide flat base) ──
    this.addBox(verts, idxs, -0.15, 0.03, 0, 2.6, 0.04, 1.3, dark);
    // Diffuser ramp at rear
    this.addBox(verts, idxs, -1.0, 0.08, 0, 0.3, 0.05, 1.0, carbon);

    // ── 2. Main chassis / cockpit tub ──
    this.addBox(verts, idxs, 0.05, 0.18, 0, 1.6, 0.22, 0.5, [cr, cg, cb]);
    // Side impact structures
    this.addBox(verts, idxs, 0.05, 0.15, 0.36, 1.3, 0.12, 0.12, carbon);
    this.addBox(verts, idxs, 0.05, 0.15, -0.36, 1.3, 0.12, 0.12, carbon);

    // ── 3. Nose cone (tapering forward) ──
    this.addBox(verts, idxs, 0.85, 0.14, 0, 0.55, 0.12, 0.28, [cr, cg, cb]);
    this.addBox(verts, idxs, 1.15, 0.11, 0, 0.25, 0.08, 0.18, [cr, cg, cb]);
    this.addCone(verts, idxs, 1.32, 0.11, 0, 0.09, 0.22, 8, [cr, cg, cb]);

    // ── 4. Front wing ──
    // Main plane
    this.addBox(verts, idxs, 1.2, 0.06, 0, 0.3, 0.03, 1.35, carbon);
    // Secondary flap
    this.addBox(verts, idxs, 1.15, 0.10, 0, 0.2, 0.03, 1.25, carbon);
    // Endplates
    this.addBox(verts, idxs, 1.2, 0.12, 0.67, 0.35, 0.18, 0.04, carbon);
    this.addBox(verts, idxs, 1.2, 0.12, -0.67, 0.35, 0.18, 0.04, carbon);
    // Nose pylons connecting wing to nose
    this.addBox(verts, idxs, 1.2, 0.08, 0.15, 0.1, 0.06, 0.04, carbon);
    this.addBox(verts, idxs, 1.2, 0.08, -0.15, 0.1, 0.06, 0.04, carbon);

    // ── 5. Sidepods (wide, tapering to rear) ──
    this.addBox(verts, idxs, -0.1, 0.18, 0.50, 1.2, 0.20, 0.35, [cr, cg, cb]);
    this.addBox(verts, idxs, -0.1, 0.18, -0.50, 1.2, 0.20, 0.35, [cr, cg, cb]);
    // Sidepod intakes (dark openings)
    this.addBox(verts, idxs, 0.6, 0.20, 0.50, 0.15, 0.06, 0.15, dark);
    this.addBox(verts, idxs, 0.6, 0.20, -0.50, 0.15, 0.06, 0.15, dark);

    // ── 6. Engine cover / airbox ──
    this.addBox(verts, idxs, -0.5, 0.35, 0, 0.8, 0.18, 0.28, [cr, cg, cb]);
    // Airbox
    this.addBox(verts, idxs, -0.25, 0.50, 0, 0.4, 0.14, 0.24, [cr, cg, cb]);
    // Intake hole
    this.addBox(verts, idxs, -0.1, 0.50, 0, 0.08, 0.08, 0.10, dark);

    // ── 7. Halo bar ──
    // Center pillar
    this.addBox(verts, idxs, 0.15, 0.30, 0, 0.05, 0.18, 0.06, carbon);
    // Front arch
    this.addBox(verts, idxs, 0.08, 0.42, 0, 0.18, 0.04, 0.50, carbon);
    // Left side bar
    this.addBox(verts, idxs, -0.15, 0.42, 0.22, 0.55, 0.04, 0.06, carbon);
    // Right side bar
    this.addBox(verts, idxs, -0.15, 0.42, -0.22, 0.55, 0.04, 0.06, carbon);

    // ── 8. Rear wing ──
    // Main plane
    this.addBox(verts, idxs, -1.0, 0.38, 0, 0.35, 0.04, 0.85, carbon);
    // Upper flap (DRS)
    this.addBox(verts, idxs, -1.0, 0.44, 0, 0.3, 0.03, 0.85, carbon);
    // Endplates
    this.addBox(verts, idxs, -1.0, 0.38, 0.43, 0.35, 0.3, 0.04, carbon);
    this.addBox(verts, idxs, -1.0, 0.38, -0.43, 0.35, 0.3, 0.04, carbon);
    // Support pylons
    this.addBox(verts, idxs, -0.9, 0.28, 0.22, 0.1, 0.14, 0.04, grey);
    this.addBox(verts, idxs, -0.9, 0.28, -0.22, 0.1, 0.14, 0.04, grey);

    // ── 9. Bargeboards (vertical turning vanes ahead of sidepods) ──
    this.addBox(verts, idxs, 0.55, 0.10, 0.32, 0.3, 0.08, 0.03, carbon);
    this.addBox(verts, idxs, 0.55, 0.10, -0.32, 0.3, 0.08, 0.03, carbon);

    // ── 10. Exhaust outlet ──
    this.addCylinder(verts, idxs, -0.7, 0.30, 0.20, 0.04, 0.06, 6, grey);
    this.addCylinder(verts, idxs, -0.7, 0.30, -0.20, 0.04, 0.06, 6, grey);

    // ── 11. T-cam (camera on top of airbox) ──
    this.addBox(verts, idxs, 0.0, 0.58, 0, 0.04, 0.05, 0.05, [1.0, 0.9, 0.2]);

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
    const verts: number[] = [];
    const idxs: number[] = [];
    this.addCylinder(verts, idxs, 0, 0, 0, 0.12, 0.12, 8, [0.05, 0.05, 0.05]);
    // Tire tread
    this.addCylinder(verts, idxs, 0, 0, 0, 0.14, 0.1, 8, [0.1, 0.1, 0.1]);

    const va = new Float32Array(verts);
    const ia = new Uint16Array(idxs);
    this.wheelCount = ia.length;
    this.wheelVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.wheelVao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, va, gl.STATIC_DRAW);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ia, gl.STATIC_DRAW);
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
    for (let tier = 0; tier < 4; tier++) {
      const ty = 0.5 + tier * 0.3;
      const td = 1 + tier * 0.8;
      const tx = gx + ppx * td;
      const tz = gz + ppz * td;
      this.addBox(verts, idxs, tx, ty, tz, 0.3, 0.3, hw * 2, [0.4, 0.4, 0.45]);
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
    gl.bindVertexArray(this.wheelVao);
    const wheelPositions = [
      [-0.3, -0.12, -0.2],
      [-0.3, -0.12, 0.2],
      [0.3, -0.12, -0.2],
      [0.3, -0.12, 0.2]
    ];
    for (const wp of wheelPositions) {
      this.mat4Identity(this.modelMatrix);
      this.mat4Translate(this.modelMatrix, [x, y + 0.07, z]);
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
      gl.drawElements(gl.TRIANGLES, this.wheelCount, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindVertexArray(null);
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
