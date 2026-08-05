/// <reference types="@types/node" />
/// <reference lib="dom" />

import { RIM_TINTS, DECAL_COLORS, RacingCarAppearance } from '../../services/datacontracts/racing/racing-types';

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

export interface CrowdPerson {
  x: number; y: number; z: number;
  shirt: [number, number, number];
  skin: [number, number, number];
  hair: [number, number, number];
  pants: [number, number, number];
  pose: number;        // 0 = arms down, 1 = both arms up, 2 = one arm up
  scale: number;       // height variance ~0.85-1.15
  phase: number;       // animation phase offset (per-person)
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
  private lightMatrixLoc!: WebGLUniformLocation;
  private sunColorLoc!: WebGLUniformLocation;
  private shadowMapLoc!: WebGLUniformLocation;
  private shadowTexelLoc!: WebGLUniformLocation;
  private heatGlowLoc!: WebGLUniformLocation;
  private metallicLoc!: WebGLUniformLocation;
  private rimTintLoc!: WebGLUniformLocation;
  private rimStrengthLoc!: WebGLUniformLocation;

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
  private wheelRimVao!: WebGLVertexArrayObject;
  private wheelRimCount = 0;
  private rearWheelVao!: WebGLVertexArrayObject;
  private rearWheelCount = 0;
  private rearWheelRimVao!: WebGLVertexArrayObject;
  private rearWheelRimCount = 0;
  private brakeVao!: WebGLVertexArrayObject;
  private brakeCount = 0;
  private rearBrakeVao!: WebGLVertexArrayObject;
  private rearBrakeCount = 0;
  // Branded rim-face disc (own VAO so it can be drawn textured) + its texture.
  private rimFaceVao!: WebGLVertexArrayObject;
  private rimFaceCount = 0;
  private rearRimFaceVao!: WebGLVertexArrayObject;
  private rearRimFaceCount = 0;
  private tireBrandTex!: WebGLTexture;
  private barrierVao!: WebGLVertexArrayObject;
  private barrierCount = 0;
  private finishVao!: WebGLVertexArrayObject;
  private finishCount = 0;
  // Per-car appearance meshes: accent (sidepod stripes + exhaust), decal
  // (engine-cover stripes + nose plate) and underglow (neon pool under the car).
  private accentVao!: WebGLVertexArrayObject;
  private accentCount = 0;
  private decalVao!: WebGLVertexArrayObject;
  private decalCount = 0;
  private glowVao!: WebGLVertexArrayObject;
  private glowCount = 0;

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
  theme: 'default' | 'miami' | 'city' | 'mountain' | 'alpine' | 'desert' | 'monaco' | 'montreal' | 'italy' = 'default';
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

  // Rear-view mirror: a second camera renders the world from behind the car
  // into this FBO, then a screen-space quad blits it at the top of the view.
  private mirrorTex!: WebGLTexture;
  private mirrorDepth!: WebGLRenderbuffer;
  private mirrorFBO!: WebGLFramebuffer;
  private mirrorProg!: WebGLProgram;
  private mirrorTexLoc!: WebGLUniformLocation;
  private mirrorVao!: WebGLVertexArrayObject;
  private mirrorW = 512;
  private mirrorH = 288;
  private mirrorProj!: Float32Array;
  private mirrorView!: Float32Array;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    // Create white texture (pure white so vertex colors show at full brightness)
    this.whiteTex = this.makeTex(1, 1, new Uint8Array([255, 255, 255]));
    this.asphaltTex = this.makeAsphaltTex();
    this.grassTex = this.makeGrassTex();
    this.trackTex = this.makeTrackMarkingsTex();
    this.tireBrandTex = this.makeTireBrandTex();

    this.initShader();
    this.initShadow();
    this.initSky();
    this.initMirror();
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

  // Tire-brand texture: a small procedural canvas with crisp 'BHOSTED'
  // lettering arced around a dark rim, mapped onto the rim face via planar UVs
  // (replaces the old raised-stud branding so the text reads as real lettering).
  private makeTireBrandTex(): WebGLTexture {
    const gl = this.gl;
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d')!;
    // Dark rim base
    g.fillStyle = '#141416';
    g.fillRect(0, 0, size, size);
    // Subtle inner ring accent
    g.strokeStyle = '#26262a';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(size / 2, size / 2, size * 0.32, 0, Math.PI * 2);
    g.stroke();
    // 'BHOSTED' lettering arced around the rim, letters upright at the top
    // and rotating to stay radial — reads like real tire sidewall branding.
    const text = 'BHOSTED';
    const cx = size / 2;
    const cy = size / 2;
    const radius = size * 0.34;
    g.font = 'bold 44px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#e8e8ea';
    const startAng = -Math.PI / 2 - 0.5;
    const step = 0.16;
    for (let i = 0; i < text.length; i++) {
      const a = startAng + i * step;
      g.save();
      g.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
      g.rotate(a + Math.PI / 2);
      g.fillText(text[i], 0, 0);
      g.restore();
    }
    // Small center cap text
    g.font = 'bold 15px Arial, sans-serif';
    g.fillStyle = '#6a6a70';
    g.fillText('GRAND PRIX', cx, cy + 3);
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
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
uniform mat4 uLightMatrix;
uniform vec3 uColor;
uniform mat3 uNormalMatrix;
out vec4 vColor;
out vec3 vNormal;
out vec3 vWorldPos;
out vec2 vUV;
out float vDepth;
out vec4 vLightPos;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vec4 vp = uView * wp;
  gl_Position = uProj * vp;
  vColor = vec4(aColor * uColor, 1.0);
  vNormal = normalize(uNormalMatrix * aNormal);
  vWorldPos = wp.xyz;
  vDepth = length(vp.xyz);
  vUV = aUV;
  vLightPos = uLightMatrix * wp;
}`;

  private fsSrc = `#version 300 es
precision highp float;
in vec4 vColor;
in vec3 vNormal;
in vec3 vWorldPos;
in vec2 vUV;
in float vDepth;
in vec4 vLightPos;
out vec4 FragColor;
uniform vec3 uLightDir;
uniform vec3 uViewPos;
uniform sampler2D uTexture;
uniform bool uHasTexture;
uniform vec3 uAmbient;
uniform vec3 uSunColor;
uniform vec3 uFogColor;
uniform bool uUseVertexColor;
uniform sampler2D uShadowMap;
uniform float uShadowTexel;
uniform float uHeatGlow;
uniform float uMetallic;
uniform vec3 uRimTint;
uniform float uRimStrength;

// Soft 3x3 PCF directional shadow. sp is light-space UV/depth (0..1).
// Outside the ortho frustum (which only wraps +-80m around the camera) -> lit.
float calcShadow(vec3 sp, float NdotL) {
  if (sp.x < 0.0 || sp.x > 1.0 || sp.y < 0.0 || sp.y > 1.0 || sp.z < 0.0 || sp.z > 1.0) return 1.0;
  float bias = max(0.0008, 0.0025 * (1.0 - NdotL));
  float depth = sp.z - bias;
  float sum = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      float d = texture(uShadowMap, sp.xy + vec2(float(x), float(y)) * uShadowTexel).r;
      sum += step(depth, d);
    }
  }
  return sum / 9.0;
}

void main() {
  vec4 base = vColor;
  if (uHasTexture) base *= texture(uTexture, vUV);
  if (!uUseVertexColor) base = vColor;

  // Rim tint — colors the metal wheel parts per-car; strength 0 leaves parts
  // at their vertex color (black tire band + brake rotor stay untinted).
  base.rgb = mix(base.rgb, base.rgb * uRimTint, uRimStrength);

  vec3 N = normalize(vNormal);
  vec3 V = normalize(uViewPos - vWorldPos);
  vec3 L = normalize(uLightDir);
  float NdotL = max(dot(N, L), 0.0);

  // Hemispheric ambient: faces pointing up catch sky light, undersides get
  // ground bounce — lifts the flat look without washing out the scene.
  float upness = N.y * 0.5 + 0.5;
  vec3 amb = uAmbient * base.rgb * (0.55 + 0.9 * upness);

  float shadow = calcShadow(vLightPos.xyz / vLightPos.w * 0.5 + 0.5, NdotL);
  vec3 diffColor = NdotL * uSunColor * base.rgb * shadow;

  // Blinn-Phong specular tinted by the sun — warm highlights on paint/glass.
  // uMetallic (from the skin finish) boosts the highlight: matte wraps stay
  // flat, chrome paints get a sharp mirror glint.
  vec3 H = normalize(L + V);
  float specAmt = pow(max(dot(N, H), 0.0), 48.0);
  vec3 specColor = specAmt * uSunColor * (0.55 + uMetallic * 0.85) * (shadow * 0.9 + 0.1);

  // Fresnel rim — silhouettes catch the sky so cars and building edges pop.
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 rimColor = fres * uSunColor * 0.12;

  vec3 color = amb + diffColor + specColor + rimColor;

  // Brake-disc heat glow — emissive orange that fades in as the wheels spin
  // up. uHeatGlow is driven by wheel speed in renderCar (0 when parked).
  color += uHeatGlow * vec3(1.0, 0.45, 0.08);

  float fog = clamp((vDepth - 80.0) / 400.0, 0.0, 1.0);
  color = mix(color, uFogColor, fog * vColor.a);

  // Filmic tone map (ACES Narkowicz) + gamma — richer midtones, no blown highlights.
  color = clamp(color, 0.0, 1.0);
  color = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);
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
    this.lightMatrixLoc = gl.getUniformLocation(this.prog, 'uLightMatrix')!;
    this.sunColorLoc = gl.getUniformLocation(this.prog, 'uSunColor')!;
    this.shadowMapLoc = gl.getUniformLocation(this.prog, 'uShadowMap')!;
    this.shadowTexelLoc = gl.getUniformLocation(this.prog, 'uShadowTexel')!;
    this.heatGlowLoc = gl.getUniformLocation(this.prog, 'uHeatGlow')!;
    this.metallicLoc = gl.getUniformLocation(this.prog, 'uMetallic')!;
    this.rimTintLoc = gl.getUniformLocation(this.prog, 'uRimTint')!;
    this.rimStrengthLoc = gl.getUniformLocation(this.prog, 'uRimStrength')!;
    gl.uniform1i(this.useVertexColor, 1);
    gl.uniform1f(this.heatGlowLoc, 0);
    gl.uniform1f(this.metallicLoc, 0.45);
    gl.uniform3f(this.rimTintLoc, 0.72, 0.72, 0.75);
    gl.uniform1f(this.rimStrengthLoc, 0);
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

  // Rear-view mirror FBO + blit quad. The world is rendered a second time from
  // a rear-facing camera into mirrorTex, then drawn as a textured quad at the
  // top of the screen via a tiny 2D blit program.
  private initMirror() {
    const gl = this.gl;
    this.mirrorProj = new Float32Array(16);
    this.mirrorView = new Float32Array(16);

    this.mirrorTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.mirrorTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.mirrorW, this.mirrorH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Depth buffer so the rear view occludes correctly (near cars block far ones).
    this.mirrorDepth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.mirrorDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, this.mirrorW, this.mirrorH);

    this.mirrorFBO = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.mirrorFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.mirrorTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.mirrorDepth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Tiny blit shader: samples the mirror texture onto a screen-space quad.
    const mvs = `#version 300 es
in vec2 aPos;
in vec2 aUV;
out vec2 vUV;
void main() { vUV = aUV; gl_Position = vec4(aPos, 0.0, 1.0); }`;
    const mfs = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 FragColor;
uniform sampler2D uTex;
void main() { FragColor = texture(uTex, vUV); }`;
    this.mirrorProg = this.createProgram(mvs, mfs);
    this.mirrorTexLoc = gl.getUniformLocation(this.mirrorProg, 'uTex')!;

    // Screen-space quad: centered horizontally, near the top. Aspect matches
    // the mirror render target so the image isn't stretched.
    const cw = gl.canvas.width || 1280;
    const ch = gl.canvas.height || 720;
    const qw = Math.min(0.4 * cw, 480);      // pixel width (cap for huge screens)
    const qh = qw * (this.mirrorH / this.mirrorW);
    const nx = qw / cw;                        // NDC half-width
    const ny = qh / ch;                        // NDC half-height
    const topY = 1 - 0.02 - ny;                // top margin 2%
    const quad = new Float32Array([
      -nx, topY - ny, 0, 0,
      nx, topY - ny, 1, 0,
      -nx, topY + ny, 0, 1,
      nx, topY + ny, 1, 1,
    ]);
    this.mirrorVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.mirrorVao);
    const qb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
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
  setTheme(theme: 'default' | 'miami' | 'city' | 'mountain' | 'alpine' | 'desert' | 'monaco' | 'montreal' | 'italy') {
    this.theme = theme;
    switch (theme) {
      case 'miami':
        this.skyTop = [0.13, 0.32, 0.6];
        this.skyHorizon = [0.95, 0.68, 0.55];
        this.skyBottom = [0.55, 0.62, 0.7];
        this.sunDir = [0.35, 0.55, 0.45];
        this.sunColor = [1.0, 0.85, 0.7];
        this.ambientColor = [0.32, 0.3, 0.34];
        this.fogColor = [0.62, 0.6, 0.63];
        break;
      case 'city':
        this.skyTop = [0.05, 0.08, 0.22];
        this.skyHorizon = [0.45, 0.32, 0.5];
        this.skyBottom = [0.2, 0.22, 0.3];
        this.sunDir = [0.25, 0.45, 0.35];
        this.sunColor = [1.0, 0.8, 0.6];
        this.ambientColor = [0.2, 0.2, 0.26];
        this.fogColor = [0.3, 0.3, 0.38];
        break;
      case 'mountain':
        this.skyTop = [0.08, 0.18, 0.45];
        this.skyHorizon = [0.7, 0.78, 0.88];
        this.skyBottom = [0.45, 0.52, 0.62];
        this.sunDir = [0.4, 0.65, 0.5];
        this.sunColor = [1.0, 0.95, 0.85];
        this.ambientColor = [0.28, 0.28, 0.32];
        this.fogColor = [0.45, 0.5, 0.58];
        break;
      case 'alpine':
        // High-altitude snow: deep blue zenith, crisp white horizon, cold light.
        this.skyTop = [0.02, 0.05, 0.25];
        this.skyHorizon = [0.75, 0.8, 0.9];
        this.skyBottom = [0.5, 0.55, 0.65];
        this.sunDir = [0.3, 0.6, 0.4];
        this.sunColor = [1.0, 0.98, 0.95];
        this.ambientColor = [0.3, 0.32, 0.38];
        this.fogColor = [0.55, 0.58, 0.65];
        break;
      case 'desert':
        // Marrakech: hot golden sun, warm sandy horizon, hazy air.
        this.skyTop = [0.15, 0.25, 0.5];
        this.skyHorizon = [0.92, 0.78, 0.58];
        this.skyBottom = [0.6, 0.5, 0.35];
        this.sunDir = [0.5, 0.65, 0.55];
        this.sunColor = [1.0, 0.88, 0.65];
        this.ambientColor = [0.35, 0.32, 0.28];
        this.fogColor = [0.58, 0.55, 0.5];
        break;
      case 'monaco':
        // Monaco: Riviera afternoon — bright azure sky, crisp sea light.
        this.skyTop = [0.08, 0.25, 0.55];
        this.skyHorizon = [0.7, 0.78, 0.88];
        this.skyBottom = [0.45, 0.55, 0.65];
        this.sunDir = [0.4, 0.7, 0.5];
        this.sunColor = [1.0, 0.95, 0.85];
        this.ambientColor = [0.28, 0.3, 0.35];
        this.fogColor = [0.45, 0.5, 0.55];
        break;
      case 'montreal':
        // Montreal: late afternoon — warm golden light, hazy river air.
        this.skyTop = [0.1, 0.2, 0.45];
        this.skyHorizon = [0.82, 0.72, 0.65];
        this.skyBottom = [0.5, 0.48, 0.52];
        this.sunDir = [0.3, 0.55, 0.45];
        this.sunColor = [1.0, 0.9, 0.75];
        this.ambientColor = [0.28, 0.27, 0.3];
        this.fogColor = [0.48, 0.48, 0.52];
        break;
      case 'italy':
        // Monza: bright Italian summer — clear blue sky, warm sun.
        this.skyTop = [0.06, 0.15, 0.45];
        this.skyHorizon = [0.65, 0.72, 0.82];
        this.skyBottom = [0.4, 0.45, 0.52];
        this.sunDir = [0.45, 0.75, 0.5];
        this.sunColor = [1.0, 0.95, 0.85];
        this.ambientColor = [0.25, 0.26, 0.3];
        this.fogColor = [0.4, 0.45, 0.5];
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
    if (this._birdsVao) { try { gl.deleteVertexArray(this._birdsVao); } catch { } }
    if (this._birdsBuf) { try { gl.deleteBuffer(this._birdsBuf); } catch { } }
    if (this._balloonVao) { try { gl.deleteVertexArray(this._balloonVao); } catch { } }
    if (this._balloonVbo) { try { gl.deleteBuffer(this._balloonVbo); } catch { } }
    if (this._balloonIbo) { try { gl.deleteBuffer(this._balloonIbo); } catch { } }
    if (this._crowdVao) { try { gl.deleteVertexArray(this._crowdVao); } catch { } }
    if (this._crowdBuf) { try { gl.deleteBuffer(this._crowdBuf); } catch { } }
    if (this._confettiVao) { try { gl.deleteVertexArray(this._confettiVao); } catch { } }
    if (this._confettiBuf) { try { gl.deleteBuffer(this._confettiBuf); } catch { } }
    this._crowdPeople = [];
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
    } else if (this.theme === 'alpine') {
      this.addAlpineScenery(verts, idxs);
    } else if (this.theme === 'desert') {
      // Wide sandy apron under everything, then the dunes/mesas/oases on top.
      this.addDesertGround(verts, idxs);
      this.addDesertScenery(verts, idxs);
    } else if (this.theme === 'monaco') {
      this.addMonacoScenery(verts, idxs);
    } else if (this.theme === 'montreal') {
      this.addMontrealScenery(verts, idxs);
    } else if (this.theme === 'italy') {
      this.addItalyScenery(verts, idxs);
    } else {
      this.addForestScenery(verts, idxs);
    }

    // Drifting cumulus clouds high over the circuit, tinted per theme.
    this.addClouds(verts, idxs);

    // Grandstands at key points (all themes) — every 1/8 of the lap now, so
    // there's always a packed stand roaring somewhere on the circuit. The
    // start/finish and mid-lap stands are the big showpiece ones.
    const gsPositions = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875].map(f => Math.floor(f * pts.length));
    for (const gi of gsPositions) {
      const p = pts[gi];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const gx = p.x + ppx * (p.width / 2 + 8);
      const gz = p.z + ppz * (p.width / 2 + 8);
      const wide = gi === 0 || gi === Math.floor(pts.length / 2);
      this.addGrandstand(verts, idxs, gx, gz, p.dirX, p.dirZ, wide ? 5 : 3.5, 3);
    }

    // ── Crowds lining the fences ──
    // Packed rows of spectators right next to the barriers on both sides, every
    // ~16 segments, so cheering people line the whole lap — not just the
    // grandstands. Each one is a posed, animated figure (legs, torso, arms,
    // head) drawn per-frame so they bob and cheer. They stand OUTSIDE the
    // barrier wall (hw + 1.5) and its cap (hw + 1.8) so nobody ever appears on
    // the track or the kerbs.
    const fenceCrowdShirts: [number, number, number][] = this.crowdShirtsForTheme();
    const fenceSkins: [number, number, number][] = [
      [0.85, 0.65, 0.5], [0.55, 0.36, 0.22], [0.95, 0.82, 0.66], [0.4, 0.26, 0.15],
    ];
    const fenceHairs: [number, number, number][] = [
      [0.1, 0.08, 0.06], [0.55, 0.38, 0.18], [0.9, 0.85, 0.7], [0.18, 0.12, 0.08], [0.3, 0.2, 0.12],
    ];
    for (let i = 0; i < pts.length; i += 16) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const side = (i / 16) % 2 === 0 ? -1 : 1;
      // 1.0 clear of the barrier cap (wall face at hw+1.5, cap to hw+1.8).
      const baseX = p.x + ppx * (p.width / 2 + 2.8) * side;
      const baseZ = p.z + ppz * (p.width / 2 + 2.8) * side;
      const n = 2 + Math.floor(Math.random() * 2); // 2-3 spectators per cluster
      for (let s = 0; s < n; s++) {
        const off = (s - n / 2) * 0.8;
        this._crowdPeople.push({
          x: baseX + ppx * off,
          y: 0,
          z: baseZ + ppz * off,
          shirt: fenceCrowdShirts[Math.floor(Math.random() * fenceCrowdShirts.length)],
          skin: fenceSkins[Math.floor(Math.random() * fenceSkins.length)],
          hair: fenceHairs[Math.floor(Math.random() * fenceHairs.length)],
          pants: [0.12, 0.12, 0.16],
          pose: Math.floor(Math.random() * 3),
          scale: 0.85 + Math.random() * 0.3,
          phase: Math.random() * Math.PI * 2,
        });
      }
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

    // ── Start/Finish gantry over the start line ──
    const sf = pts[0];
    this.addStartGantry(verts, idxs, sf.x, sf.z, sf.dirX, sf.dirZ, sf.width);

    // ── Corner furniture: tire barriers, marshal posts + braking boards ──
    // Detect the sharpest bends from the heading change between segments, then
    // dress each apex like a real circuit (runoff tires, marshal, brake boards).
    const turns: { i: number; t: number; s: number }[] = [];
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const cross = p0.dirX * p1.dirZ - p0.dirZ * p1.dirX;
      const dot = p0.dirX * p1.dirX + p0.dirZ * p1.dirZ;
      const t = Math.abs(Math.atan2(cross, dot));
      if (t > 0.04) turns.push({ i, t, s: cross > 0 ? -1 : 1 });
    }
    turns.sort((a, b) => b.t - a.t);
    const picked: typeof turns = [];
    for (const c of turns) {
      if (picked.length >= 8) break;
      // Circular distance so a corner straddling the start/finish seam (e.g.
      // segments 197..202) can't be picked twice as two different bends.
      if (picked.every(p => {
        const d = Math.abs(p.i - c.i);
        return Math.min(d, pts.length - d) > 18;
      })) picked.push(c);
    }
    for (const c of picked) {
      const p = pts[c.i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      // Outside of the turn (opposite the curvature center) — perp scaled by the
      // turn sign places the furniture on the runoff side of the apex.
      const ox = ppx * c.s;
      const oz = ppz * c.s;
      // Tire barrier stack on the runoff side, just beyond the wall.
      this.addTireBarrier(verts, idxs, p.x + ox * (p.width / 2 + 4), p.z + oz * (p.width / 2 + 4), ppx, ppz, 5);
      // Marshal post just past the barrier wall.
      this.addMarshalPost(verts, idxs, p.x + ox * (p.width / 2 + 2.6), p.z + oz * (p.width / 2 + 2.6), ppx, ppz, c.s);
      // Braking boards ~50m and ~100m before the apex (segment ≈ 10m), on the
      // same runoff side as the barrier so they face the oncoming driver.
      for (const back of [5, 10]) {
        const bi = (c.i - back + pts.length) % pts.length;
        const bp = pts[bi];
        const bpx = -bp.dirZ;
        const bpz = bp.dirX;
        const bx = bp.x + bpx * (bp.width / 2 + 1.6) * c.s;
        const bz = bp.z + bpz * (bp.width / 2 + 1.6) * c.s;
        this.addBrakeBoard(verts, idxs, bx, bz, bpx, bpz);
      }
    }

    const vertArray = new Float32Array(verts);
    // Dense themes (Miami skyline + clouds + trees) can exceed 65 535 indices,
    // so scenery uses 32-bit indices (WebGL2 supports gl.UNSIGNED_INT natively).
    const idxArray = new Uint32Array(idxs);
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

    // Animated sky objects (birds + balloons) get rebuilt alongside the theme
    // so their positions orbit the freshly generated circuit.
    this.initSkyObjects();
    this.initConfetti();
  }

  // Default theme: a rich mixed forest with three tree types and undergrowth.
  // Three tree archetypes: tall pine (cone), round deciduous (sphere on trunk),
  // and multi-tiered evergreen (stacked cones). Undergrowth shrubs fill the gaps.
  private addForestScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    const trunk = [0.3, 0.15, 0.05];
    const greenLight = [0.1, 0.35, 0.06];
    const greenMid = [0.05, 0.28, 0.04];
    const greenDark = [0.03, 0.2, 0.03];

    let treeIdx = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const dist = p.width / 2 + 22 + Math.random() * 22;
      for (const side of [-1, 1]) {
        const tx = p.x + ppx * dist * side + (Math.random() - 0.5) * 10;
        const tz = p.z + ppz * dist * side + (Math.random() - 0.5) * 10;
        const roll = Math.random();

        if (roll < 0.35) {
          // Tall pine: single tall cone on a thin trunk — classic forest silhouette.
          const th = 2.0 + Math.random() * 2.5;
          this.addCylinder(verts, idxs, tx, 0, tz, 0.12, th, 6, trunk);
          const cr = 0.7 + Math.random() * 0.8;
          const ch = 1.5 + Math.random() * 1.2;
          this.addCone(verts, idxs, tx, th - 0.2, tz, cr, ch, 10, greenMid);
          // Darker lower cone for depth
          this.addCone(verts, idxs, tx, th - 0.2 + ch * 0.4, tz, cr * 0.65, ch * 0.6, 10, greenDark);
          // Light tip
          this.addCone(verts, idxs, tx, th - 0.2 + ch * 0.8, tz, cr * 0.25, ch * 0.25, 8, greenLight);

        } else if (roll < 0.65) {
          // Round deciduous: sphere on a short trunk — broadleaf hardwood.
          const th = 0.6 + Math.random() * 0.5;
          this.addCylinder(verts, idxs, tx, 0, tz, 0.1, th, 5, trunk);
          const sr = 0.5 + Math.random() * 0.6;
          this.addSphere(verts, idxs, tx, th + sr * 0.7, tz, sr, 10, greenLight);
          // Slightly darker inner sphere for volume
          this.addSphere(verts, idxs, tx, th + sr * 0.5, tz, sr * 0.7, 8, greenMid);

        } else {
          // Multi-tiered evergreen: 3 stacked cones getting thinner — full Christmas tree.
          const th = 0.8 + Math.random() * 0.5;
          this.addCylinder(verts, idxs, tx, 0, tz, 0.1, th, 5, trunk);
          const bottleDefs = [
            { r: 0.5 + Math.random() * 0.3, h: 0.6 + Math.random() * 0.3, c: greenDark },
            { r: 0.8 + Math.random() * 0.4, h: 0.7 + Math.random() * 0.3, c: greenMid },
            { r: 0.6 + Math.random() * 0.3, h: 0.5 + Math.random() * 0.2, c: greenLight },
          ];
          let y = th - 0.2;
          for (const def of bottleDefs) {
            this.addCone(verts, idxs, tx, y, tz, def.r, def.h, 10, def.c);
            y += def.h * 0.6;
          }
        }

        // Undergrowth: small shrubs near the tree base
        if (Math.random() < 0.4) {
          const sx = tx + (Math.random() - 0.5) * 1.5;
          const sz = tz + (Math.random() - 0.5) * 1.5;
          this.addSphere(verts, idxs, sx, 0.2, sz, 0.2 + Math.random() * 0.15, 6, greenDark);
        }

        if (treeIdx++ > 200) break;
      }
      if (treeIdx > 200) break;
    }
    // Scattered distant background trees (smaller, fewer segments)
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = 120 + Math.random() * 100;
      const dx = pts[0].x + Math.cos(a) * dist;
      const dz = pts[0].z + Math.sin(a) * dist;
      this.addCone(verts, idxs, dx, 0, dz, 0.6 + Math.random() * 0.5, 1.0 + Math.random() * 0.8, 6, greenDark);
    }
  }

  // Mountain theme: dramatic granite cliffs, rocky peaks, scree slopes, distant
  // mountain silhouettes, and scattered alpine pines.
  private addMountainScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    const rock = [0.32, 0.30, 0.28];
    const rockLight = [0.45, 0.43, 0.40];
    const rockDark = [0.22, 0.20, 0.18];
    const snow = [0.85, 0.88, 0.92];
    const pine = [0.04, 0.22, 0.05];

    // The circuit is a loop around the origin, so all distant scenery must sit
    // beyond the track's outer edge. The old code scattered peaks from pts[0]
    // (a point ON the track) at radii 180-400, which dropped mountains directly
    // onto the far side of the loop. Compute the track's outer extent instead.
    let outer = 0;
    for (const p of pts) {
      const r = Math.hypot(p.x, p.z) + p.width / 2;
      if (r > outer) outer = r;
    }

    // ── Distant mountain range (single silhouette ring beyond the track) ──
    const ridgeColors: number[][] = [[0.38, 0.38, 0.42], [0.42, 0.42, 0.46], [0.46, 0.46, 0.5]];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const mh = 25 + Math.random() * 55;
      const mw = 30 + Math.random() * 40;
      // Base radius extends inward toward the track, so pin the ring distance to
      // outer + baseRadius + margin — the cone can never reach the tarmac.
      const dist = outer + mw + 30 + Math.random() * 120;
      const mx = Math.cos(a) * dist;
      const mz = Math.sin(a) * dist;
      const col = ridgeColors[k % ridgeColors.length];
      this.addCone(verts, idxs, mx, 0, mz, mw, mh, 8, col);
      // Snow dusting only on the tallest peaks — one cap, no stacked layers.
      if (mh > 55) {
        this.addCone(verts, idxs, mx, mh * 0.72, mz, mw * 0.35, mh * 0.28, 6, snow);
      }
    }

    // ── Near granite cliffs and rock faces (single-cone peaks) ──
    // Each feature is ONE cone — the old code stacked 2-3 differently-coloured
    // cones (rock + rockLight + snow cap), which read as "two layered" peaks.
    // The cone helper already brightens the tip, so the shading stays natural.
    for (let i = 0; i < pts.length; i += 5) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 34 + Math.random() * 24;
        const rx = p.x + ppx * dist * side + (Math.random() - 0.5) * 8;
        const rz = p.z + ppz * dist * side + (Math.random() - 0.5) * 8;
        const s = 1.0 + Math.random() * 2.5;
        const roll = Math.random();

        if (roll < 0.4) {
          // Steep pointed peak
          this.addCone(verts, idxs, rx, 0, rz, s * 1.2, s * 2.4, 8, rockLight);
          if (s > 1.8) {
            this.addCone(verts, idxs, rx, s * 2.0, rz, s * 0.3, s * 0.4, 5, snow);
          }
        } else if (roll < 0.7) {
          // Broad rounded plateau
          this.addCone(verts, idxs, rx, 0, rz, s * 1.8, s * 1.3, 7, rockDark);
        } else {
          // Scree slope
          this.addCone(verts, idxs, rx, 0, rz, s * 2.0, s * 0.9, 8, rock);
        }
      }
    }

    // ── Alpine pines scattered among the rocks ──
    let pineIdx = 0;
    for (let i = 0; i < pts.length; i += 4) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 26 + Math.random() * 20;
        const tx = p.x + ppx * dist * side + (Math.random() - 0.5) * 10;
        const tz = p.z + ppz * dist * side + (Math.random() - 0.5) * 10;
        const th = 1.0 + Math.random() * 1.8;
        this.addCylinder(verts, idxs, tx, 0, tz, 0.08, th, 5, [0.3, 0.15, 0.05]);
        // Scraggy alpine pine: narrow cone, dark green
        this.addCone(verts, idxs, tx, th - 0.2, tz, 0.4 + Math.random() * 0.5, 0.6 + Math.random() * 0.5, 8, pine);
        this.addCone(verts, idxs, tx, th - 0.1, tz, 0.3 + Math.random() * 0.3, 0.4 + Math.random() * 0.3, 8, [0.06, 0.28, 0.06]);
        if (pineIdx++ > 100) break;
      }
      if (pineIdx > 100) break;
    }

    // ── Snow patches on the ground (white flattened spheres, outside the track) ──
    // Same ring logic as the peaks: radius strictly beyond the track's outer
    // edge, so snow never lands on the tarmac.
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = outer + 20 + Math.random() * 110;
      const sx = Math.cos(a) * dist;
      const sz = Math.sin(a) * dist;
      this.addSphere(verts, idxs, sx, 0.05, sz, 1.5 + Math.random() * 3.0, 6, snow);
    }
  }

  // Fluffy cumulus clouds drifting high above the circuit, tinted per theme
  // so they blend into each world's sky (Miami gets a bright festive sky full
  // of them; mountain/alpine get crisp white ones; city gets dim grey).
  private addClouds(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    let cx = 0, cz = 0;
    for (const p of pts) { cx += p.x; cz += p.z; }
    cx /= pts.length; cz /= pts.length;
    // Keep the clouds BEYOND the track's outer extent (same convention as the
    // mountains), so no cloud ever hangs low over the circuit itself.
    let outer = 0;
    for (const p of pts) {
      const r = Math.hypot(p.x, p.z) + p.width / 2;
      if (r > outer) outer = r;
    }
    const count = this.theme === 'miami' ? 10 : this.theme === 'mountain' || this.theme === 'alpine' ? 8 : 6;
    const base = this.theme === 'city'
      ? [0.16, 0.17, 0.2]
      : this.theme === 'mountain' || this.theme === 'alpine'
        ? [0.95, 0.96, 0.99]
        : [0.98, 0.98, 1.0];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const dist = outer + 30 + Math.random() * 140;
      const px = cx + Math.cos(a) * dist;
      const pz = cz + Math.sin(a) * dist;
      const py = 55 + Math.random() * 35;
      const r = 9 + Math.random() * 7;
      const dim = 0.9 + Math.random() * 0.1;
      const col = [base[0] * dim, base[1] * dim, base[2] * dim];
      // A puffy cluster of three overlapping spheres, flattened by scale.
      this.addSphere(verts, idxs, px, py, pz, r, 7, col);
      this.addSphere(verts, idxs, px + r * 0.8, py + r * 0.15, pz + r * 0.4, r * 0.65, 7, col);
      this.addSphere(verts, idxs, px - r * 0.7, py + r * 0.1, pz - r * 0.5, r * 0.55, 7, col);
      // Flattened base for a classic cumulus silhouette.
      this.addSphere(verts, idxs, px + r * 0.1, py - r * 0.55, pz, r * 0.8, 7, col);
    }
  }

  // City theme: a dense downtown — a varied skyline of towers & blocks,
  // overpasses that cross above the track, elevated highway ramps and street
  // furniture (benches) along the sidewalks.
  private addCityScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    const palette: [number, number, number][] = [
      [0.12, 0.18, 0.32], [0.1, 0.22, 0.28], [0.2, 0.16, 0.3], [0.14, 0.14, 0.38], [0.08, 0.28, 0.34],
      [0.16, 0.12, 0.26], [0.1, 0.16, 0.28], [0.24, 0.2, 0.3], [0.12, 0.24, 0.24], [0.18, 0.18, 0.36],
    ];

    // Dense skyline: mix of building archetypes along both sides of the track.
    let bIdx = 0;
    for (let i = 0; i < pts.length; i += 4) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 40 + Math.random() * 26;
        const bx = p.x + ppx * dist * side + (Math.random() - 0.5) * 10;
        const bz = p.z + ppz * dist * side + (Math.random() - 0.5) * 10;
        const h = 12 + Math.random() * 38;
        const w = 4 + Math.random() * 5;
        const d = 4 + Math.random() * 5;
        const col = palette[Math.floor(Math.random() * palette.length)];
        this.addCityBuilding(verts, idxs, bx, bz, h, w, d, col);
        if (bIdx++ > 40) break;
      }
      if (bIdx > 40) break;
    }

    // Overpasses: elevated decks crossing OVER the road — drive underneath.
    const overpassEvery = Math.max(10, Math.floor(pts.length / 6));
    for (let k = 0; k < 6; k++) {
      const p = pts[(k * overpassEvery) % pts.length];
      this.addOverpass(verts, idxs, p);
    }

    // Elevated parallel highway ramps on the far side of the track.
    let rampIdx = 0;
    for (let i = 0; i < pts.length; i += 22) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 62 + Math.random() * 18;
        const rx = p.x + ppx * dist * side;
        const rz = p.z + ppz * dist * side;
        this.addHighwayRamp(verts, idxs, rx, rz, p.dirX, p.dirZ, 26 + Math.random() * 22);
        if (rampIdx++ > 7) break;
      }
      if (rampIdx > 7) break;
    }

    // Benches along the sidewalks.
    let benchIdx = 0;
    for (let i = 0; i < pts.length; i += 8) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 14 + Math.random() * 8;
        const bx = p.x + ppx * dist * side + (Math.random() - 0.5) * 3;
        const bz = p.z + ppz * dist * side + (Math.random() - 0.5) * 3;
        this.addBench(verts, idxs, bx, bz, p.dirX, p.dirZ);
        if (benchIdx++ > 34) break;
      }
      if (benchIdx > 34) break;
    }
  }

  // Picks one of several building archetypes for the city skyline.
  private addCityBuilding(verts: number[], idxs: number[], bx: number, bz: number, h: number, w: number, d: number, col: number[]) {
    const roll = Math.random();
    if (roll < 0.22) {
      this.addGlassTower(verts, idxs, bx, bz, h, w, d, col);
    } else if (roll < 0.4) {
      this.addSetbackTower(verts, idxs, bx, bz, h, w, d, col);
    } else if (roll < 0.58) {
      this.addLowRiseBlock(verts, idxs, bx, bz, h * 0.7, w, d, col);
    } else if (roll < 0.72) {
      this.addDomedHall(verts, idxs, bx, bz, h * 0.8, w, d, col);
    } else if (roll < 0.86) {
      this.addWaterTowerRoof(verts, idxs, bx, bz, h * 0.8, w, d, col);
    } else {
      this.addSpire(verts, idxs, bx, bz, h, w, d, col);
    }
  }

  // Classic glass tower: lit window grid on all four faces + antenna + beacon.
  private addGlassTower(verts: number[], idxs: number[], tx: number, tz: number, h: number, w: number, d: number, col: number[]) {
    this.addBox(verts, idxs, tx, h / 2, tz, w, h, d, col);
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
    this.addCylinder(verts, idxs, tx, h, tz, 0.06, 3, 5, [0.3, 0.3, 0.35]);
    this.addSphere(verts, idxs, tx, h + 3, tz, 0.12, 6, [0.9, 0.15, 0.12]);
  }

  // Art-deco setback tower: stacked shrinking tiers with a parapet crown.
  private addSetbackTower(verts: number[], idxs: number[], bx: number, bz: number, h: number, w: number, d: number, col: number[]) {
    const tiers: [number, number][] = [
      [h * 0.55, 1], [h * 0.3, 0.8], [h * 0.18, 0.58],
    ];
    let y = 0;
    for (const [th, scale] of tiers) {
      this.addBox(verts, idxs, bx, y + th / 2, bz, w * scale, th, d * scale, col);
      y += th;
    }
    // Parapet crown + tiny spire tip.
    this.addBox(verts, idxs, bx, y + 0.3, bz, w * 0.42, 0.6, d * 0.42, [0.85, 0.85, 0.9]);
    this.addCone(verts, idxs, bx, y + 0.7, bz, w * 0.16, 1.4, 6, [0.7, 0.7, 0.78]);
  }

  // Wide low-rise commercial block: flat roof + rooftop units + storefronts.
  private addLowRiseBlock(verts: number[], idxs: number[], bx: number, bz: number, h: number, w: number, d: number, col: number[]) {
    this.addBox(verts, idxs, bx, h / 2, bz, w * 1.4, h, d * 1.4, col);
    // Flat roof + parapet + rooftop HVAC units.
    this.addBox(verts, idxs, bx, h + 0.35, bz, w * 1.4 + 0.6, 0.7, d * 1.4 + 0.6, [0.75, 0.75, 0.8]);
    for (const ux of [-0.8, 0.8]) {
      this.addBox(verts, idxs, bx + ux, h + 1.4, bz, 0.8, 0.9, 0.8, [0.45, 0.45, 0.5]);
    }
    // Storefront window strip on the two long faces.
    const rows = Math.max(2, Math.floor(h / 4));
    const cols = 4;
    for (const sx of [-1, 1]) {
      const zc = bz + sx * (d * 1.4 / 2 + 0.05);
      for (let r = 0; r < rows; r++) {
        const wy = 1 + r * (h - 2) / rows;
        for (let c = 0; c < cols; c++) {
          const xc = bx - w * 1.4 / 2 + 1 + c * (w * 1.4 - 2) / cols;
          this.addWindowQuad(verts, idxs, xc, wy, zc, 0.9, 0.6, 0, sx, [0.9, 0.85, 0.6]);
        }
      }
    }
  }

  // Civic hall: block + columned portico + dome.
  private addDomedHall(verts: number[], idxs: number[], bx: number, bz: number, h: number, w: number, d: number, col: number[]) {
    this.addBox(verts, idxs, bx, h / 2, bz, w, h, d, col);
    for (let c = 0; c < 4; c++) {
      const cx = bx - w / 2 + (c + 0.5) * (w / 4);
      this.addBox(verts, idxs, cx, h * 0.45, bz - d / 2 - 0.4, 0.4, h * 0.9, 0.4, [0.85, 0.85, 0.9]);
    }
    this.addBox(verts, idxs, bx, h + 0.3, bz, w + 0.8, 0.6, d + 0.8, [0.85, 0.85, 0.9]);
    this.addSphere(verts, idxs, bx, h + 1.5, bz, Math.max(w, d) * 0.5, 6, [0.5, 0.6, 0.7]);
    this.addCylinder(verts, idxs, bx, h + 2.4, bz, 0.06, 1.2, 6, [0.85, 0.85, 0.9]);
  }

  // Rooftop water tower: legs + cylindrical tank + conical roof.
  private addWaterTowerRoof(verts: number[], idxs: number[], bx: number, bz: number, h: number, w: number, d: number, col: number[]) {
    this.addBox(verts, idxs, bx, h / 2, bz, w, h, d, col);
    const ty = h + 0.8;
    for (const lx of [-0.9, 0.9]) {
      for (const lz of [-0.9, 0.9]) {
        this.addBox(verts, idxs, bx + lx, ty + 0.5, bz + lz, 0.25, 1, 0.25, [0.45, 0.45, 0.5]);
      }
    }
    this.addCylinder(verts, idxs, bx, ty + 1.2, bz, 1.1, 1.4, 8, [0.55, 0.4, 0.3]);
    this.addCone(verts, idxs, bx, ty + 2.6, bz, 1.15, 0.8, 8, [0.35, 0.3, 0.28]);
  }

  // Slender spire: slim shaft + needle.
  private addSpire(verts: number[], idxs: number[], bx: number, bz: number, h: number, w: number, d: number, col: number[]) {
    this.addBox(verts, idxs, bx, h / 2, bz, w, h, d, col);
    this.addBox(verts, idxs, bx, h + h * 0.3, bz, w * 0.45, h * 0.6, d * 0.45, col);
    this.addCone(verts, idxs, bx, h * 1.9, bz, w * 0.18, h * 0.35, 6, [0.6, 0.6, 0.65]);
  }

  // Elevated road deck crossing OVER the track — you drive underneath it.
  private addOverpass(verts: number[], idxs: number[], p: any) {
    const ppx = -p.dirZ;
    const ppz = p.dirX;
    const deckY = 7;
    const halfSpan = p.width / 2 + 30;
    this.addOrientedBox(verts, idxs, p.x, deckY, p.z, halfSpan * 2, 0.4, 5.5, ppx, ppz, [0.35, 0.37, 0.42]);
    // Guard rails along both long edges.
    for (const s of [-1, 1]) {
      const ox = p.x + p.dirX * (5.5 / 2 - 0.15) * s;
      const oz = p.z + p.dirZ * (5.5 / 2 - 0.15) * s;
      this.addOrientedBox(verts, idxs, ox, deckY + 0.45, oz, halfSpan * 2, 0.5, 0.25, ppx, ppz, [0.55, 0.55, 0.6]);
    }
    // Support pillars outside the road, under the deck (clear of the curbs).
    for (const s of [-1, 1]) {
      for (const off of [p.width / 2 + 10, p.width / 2 + 19, p.width / 2 + 28]) {
        const px = p.x + ppx * off * s;
        const pz = p.z + ppz * off * s;
        this.addBox(verts, idxs, px, deckY / 2, pz, 0.9, deckY, 0.9, [0.4, 0.4, 0.45]);
      }
    }
  }

  // Elevated highway segment running parallel to the track, with pillars.
  private addHighwayRamp(verts: number[], idxs: number[], hx: number, hz: number, dirX: number, dirZ: number, len: number) {
    const deckY = 5;
    this.addOrientedBox(verts, idxs, hx, deckY, hz, len, 0.35, 7, dirX, dirZ, [0.35, 0.37, 0.42]);
    for (const s of [-1, 1]) {
      const ox = hx + (-dirZ) * (7 / 2 - 0.12) * s;
      const oz = hz + (dirX) * (7 / 2 - 0.12) * s;
      this.addOrientedBox(verts, idxs, ox, deckY + 0.4, oz, len, 0.45, 0.22, dirX, dirZ, [0.55, 0.55, 0.6]);
    }
    const steps = Math.max(2, Math.floor(len / 8));
    for (let i = 0; i <= steps; i++) {
      const t = -0.5 + (i / steps);
      const px = hx + dirX * len * t;
      const pz = hz + dirZ * len * t;
      for (const s of [-1, 1]) {
        this.addBox(verts, idxs, px + (-dirZ) * 3 * s, deckY / 2, pz + (dirX) * 3 * s, 0.7, deckY, 0.7, [0.4, 0.4, 0.45]);
      }
    }
  }

  // Simple street bench: wood seat + backrest + metal legs.
  private addBench(verts: number[], idxs: number[], bx: number, bz: number, dirX: number, dirZ: number) {
    const wood: [number, number, number] = [0.55, 0.42, 0.28];
    const metal: [number, number, number] = [0.35, 0.37, 0.4];
    const ppx = -dirZ, ppz = dirX;
    // Seat
    this.addOrientedBox(verts, idxs, bx, 0.5, bz, 1.7, 0.08, 0.5, dirX, dirZ, wood);
    // Backrest (offset toward the back edge)
    this.addOrientedBox(verts, idxs, bx - ppx * 0.1, 0.88, bz - ppz * 0.1, 1.7, 0.55, 0.08, dirX, dirZ, wood);
    // Legs
    for (const s of [-1, 1]) {
      this.addBox(verts, idxs, bx + dirX * 0.7 * s, 0.25, bz + dirZ * 0.7 * s, 0.1, 0.5, 0.4, metal);
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

  // Alpine snow theme: snow-covered pines, snow banks, ice patches, mountain peaks.
  private addAlpineScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    // Snow-covered forest beside the track.
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
        this.addCylinder(verts, idxs, tx, 0, tz, tr, th, 6, [0.35, 0.2, 0.08]);
        const cr = 0.8 + Math.random() * 0.6;
        const ch = 1.2 + Math.random() * 0.6;
        this.addCone(verts, idxs, tx, th - 0.3, tz, cr, ch, 8, [0.02, 0.18, 0.06]);
        // Snow cap on the cone tip
        this.addCone(verts, idxs, tx, th - 0.3 + ch * 0.7, tz, cr * 0.4, ch * 0.3, 6, [0.92, 0.94, 0.98]);
        if (treeIdx++ > 200) break;
      }
      if (treeIdx > 200) break;
    }
    // Snow banks along the track edge (white mounds)
    for (let i = 0; i < pts.length; i += 6) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const sx = p.x + ppx * (p.width / 2 + 2) * side;
        const sz = p.z + ppz * (p.width / 2 + 2) * side;
        this.addCone(verts, idxs, sx, 0, sz, 1.2 + Math.random() * 1.0, 0.6 + Math.random() * 0.4, 6, [0.9, 0.92, 0.96]);
      }
    }
    // Distant pointed mountain peaks — placed beyond the track's outer edge.
    // (The old code scattered from pts[0], a point ON the circuit, so peaks at
    // radii 200-500 landed on the far side of the loop.)
    let outer = 0;
    for (const p of pts) {
      const r = Math.hypot(p.x, p.z) + p.width / 2;
      if (r > outer) outer = r;
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const mh = 30 + Math.random() * 60;
      const mw = 40 + Math.random() * 30;
      // Pin the ring distance so the wide base never reaches back to the track.
      const dist = outer + mw + 40 + Math.random() * 110;
      const mx = Math.cos(a) * dist;
      const mz = Math.sin(a) * dist;
      this.addCone(verts, idxs, mx, 0, mz, mw, mh, 8, [0.45, 0.5, 0.55]);
      this.addCone(verts, idxs, mx, mh * 0.7, mz, mw * 0.35, mh * 0.3, 6, [0.85, 0.88, 0.95]);
    }
  }

  // Desert theme (Marrakech): sand, cacti, adobe buildings, dusty haze.
  // Wide sandy apron under the whole desert — dry sand from the track edge out
  // past the dunes, so Marrakech reads as endless desert rather than grass.
  private addDesertGround(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      const n = pts[(i + 1) % pts.length];
      const ppx = -p.dirZ, ppz = p.dirX;
      const npx = -n.dirZ, npz = n.dirX;
      const inner = p.width / 2 + 16;
      const outer = p.width / 2 + 80;
      for (const side of [-1, 1]) {
        const pIn = [p.x + ppx * inner * side, -0.26, p.z + ppz * inner * side];
        const pOut = [p.x + ppx * outer * side, -0.26, p.z + ppz * outer * side];
        const nIn = [n.x + npx * inner * side, -0.26, n.z + npz * inner * side];
        const nOut = [n.x + npx * outer * side, -0.26, n.z + npz * outer * side];
        this.addGroundQuad(verts, idxs, pIn, nIn, nOut, pOut, [0.85, 0.76, 0.55]);
      }
    }
  }

  private addDesertScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    const sand = [0.82, 0.72, 0.52];
    const sandLight = [0.92, 0.84, 0.62];
    const sandDark = [0.66, 0.56, 0.4];
    const rock = [0.62, 0.45, 0.3];
    const rockDark = [0.45, 0.32, 0.22];

    // Track outer extent so distant dunes/mesas never sit on the circuit.
    let outer = 0;
    for (const p of pts) {
      const r = Math.hypot(p.x, p.z) + p.width / 2;
      if (r > outer) outer = r;
    }

    // ── Wind-combed sand dunes along the track: big soft cones with a swept
    // tail so they read as dunes sculpted by the wind, not cones. Bases sink
    // slightly below the -0.26 apron so no disc edge shows under them. ──
    for (let i = 0; i < pts.length; i += 5) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 24 + Math.random() * 26;
        const dx = p.x + ppx * dist * side + (Math.random() - 0.5) * 8;
        const dz = p.z + ppz * dist * side + (Math.random() - 0.5) * 8;
        const s = 4 + Math.random() * 5;
        const h = 1.2 + Math.random() * 1.8;
        const col = Math.random() < 0.5 ? sand : sandLight;
        // Main dune + swept tail (offset lower cone) for a natural wind shape.
        this.addCone(verts, idxs, dx, -0.15, dz, s, h, 8, col);
        this.addCone(verts, idxs, dx + (Math.random() - 0.5) * s * 1.4, -0.15, dz + (Math.random() - 0.5) * s * 1.4, s * 0.8, h * 0.7, 7, sandDark);
      }
    }

    // ── Distant giant dunes ringing the horizon (beyond the track). ──
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const dist = outer + 50 + Math.random() * 120;
      const mx = Math.cos(a) * dist;
      const mz = Math.sin(a) * dist;
      const s = 16 + Math.random() * 18;
      const h = 4 + Math.random() * 5;
      this.addCone(verts, idxs, mx, -0.15, mz, s, h, 8, sand);
      this.addCone(verts, idxs, mx + s * 0.4, -0.15, mz, s * 0.7, h * 0.8, 7, sandLight);
    }

    // ── Rocky mesas & cliffs — flat-topped buttes and jagged pinnacles far
    // beyond the track, in warm desert rock tones. ──
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const dist = outer + 40 + Math.random() * 100;
      const mx = Math.cos(a) * dist;
      const mz = Math.sin(a) * dist;
      const s = 10 + Math.random() * 10;
      const h = 8 + Math.random() * 12;
      const roll = Math.random();
      if (roll < 0.45) {
        // Flat-topped mesa: broad cone + squared-off box cap.
        this.addCone(verts, idxs, mx, 0, mz, s, h, 8, rock);
        this.addBox(verts, idxs, mx, h - 1.5, mz, s * 0.55, 2.2, s * 0.55, rockDark);
      } else if (roll < 0.75) {
        // Jagged cliff: two stacked offset cones.
        this.addCone(verts, idxs, mx, -0.15, mz, s, h, 7, rock);
        this.addCone(verts, idxs, mx + s * 0.35, h * 0.4, mz - s * 0.2, s * 0.6, h * 0.65, 6, rockDark);
      } else {
        // Pinnacle: narrow tall cone with a lighter cap.
        this.addCone(verts, idxs, mx, -0.15, mz, s * 0.8, h * 1.3, 7, rockDark);
        this.addCone(verts, idxs, mx, h * 0.85, mz, s * 0.28, h * 0.35, 6, rock);
      }
    }
    // Nearer rocky outcrops among the dunes.
    for (let i = 0; i < pts.length; i += 9) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 30 + Math.random() * 20;
        const rx = p.x + ppx * dist * side + (Math.random() - 0.5) * 6;
        const rz = p.z + ppz * dist * side + (Math.random() - 0.5) * 6;
        const s = 2 + Math.random() * 3;
        this.addCone(verts, idxs, rx, -0.15, rz, s, s * (1.2 + Math.random() * 1.2), 7, Math.random() < 0.5 ? rock : rockDark);
      }
    }

    // ── Oases: a pool of water ringed by palms and reeds, at a few fixed
    // points around the lap so drivers always pass one. ──
    for (const oi of [Math.floor(pts.length / 5), Math.floor(pts.length / 2), Math.floor(pts.length * 4 / 5)]) {
      const p = pts[oi];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const side = Math.random() < 0.5 ? -1 : 1;
      const dist = p.width / 2 + 40 + Math.random() * 14;
      const ox = p.x + ppx * dist * side;
      const oz = p.z + ppz * dist * side;
      const r = 4 + Math.random() * 2;
      // Water pool (sits just above the -0.26 sand band so no z-fighting).
      this.addQuad(verts, idxs,
        [ox - r, -0.22, oz - r], [ox + r, -0.22, oz - r],
        [ox + r, -0.22, oz + r], [ox - r, -0.22, oz + r],
        [0.15, 0.45, 0.42]);
      // Palms ringing the water.
      for (let pi = 0; pi < 6; pi++) {
        const a = (pi / 6) * Math.PI * 2 + Math.random() * 0.6;
        const px = ox + Math.cos(a) * (r + 2.5 + Math.random() * 2);
        const pz = oz + Math.sin(a) * (r + 2.5 + Math.random() * 2);
        this.addPalmTree(verts, idxs, px, pz, 0.9 + Math.random() * 0.5);
      }
      // Reeds + a scrub bush at the water's edge.
      for (let ri = 0; ri < 4; ri++) {
        const a = Math.random() * Math.PI * 2;
        const rx = ox + Math.cos(a) * r * 0.8;
        const rz = oz + Math.sin(a) * r * 0.8;
        this.addCone(verts, idxs, rx, 0, rz, 0.12, 0.5 + Math.random() * 0.4, 5, [0.2, 0.4, 0.15]);
      }
      this.addSphere(verts, idxs, ox + r * 0.6, 0.25, oz + r * 0.4, 0.5, 7, [0.25, 0.5, 0.18]);
    }

    // ── Camels: small caravans of two-three plodding between the dunes. ──
    for (const ci of [Math.floor(pts.length / 6), Math.floor(pts.length / 3), Math.floor(pts.length * 2 / 3)]) {
      const p = pts[ci];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const side = Math.random() < 0.5 ? -1 : 1;
      const dist = p.width / 2 + 34 + Math.random() * 12;
      const bx = p.x + ppx * dist * side;
      const bz = p.z + ppz * dist * side;
      const n = 2 + Math.floor(Math.random() * 2);
      for (let k = 0; k < n; k++) {
        this.addCamel(verts, idxs, bx + ppx * k * 1.8, bz + ppz * k * 1.8, ppx, ppz, 0.8 + Math.random() * 0.2);
      }
    }

    // ── Shanty villages: clusters of flat-roofed mud-brick shacks with a palm
    // or two, tucked into the dunes at fixed points. ──
    for (const vi of [Math.floor(pts.length / 7), Math.floor(pts.length * 3 / 7), Math.floor(pts.length * 5 / 7)]) {
      const p = pts[vi];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const side = Math.random() < 0.5 ? -1 : 1;
      const dist = p.width / 2 + 30 + Math.random() * 12;
      const vx = p.x + ppx * dist * side;
      const vz = p.z + ppz * dist * side;
      const huts = 4 + Math.floor(Math.random() * 3);
      for (let h = 0; h < huts; h++) {
        const hx = vx + (Math.random() - 0.5) * 16;
        const hz = vz + (Math.random() - 0.5) * 16;
        this.addShack(verts, idxs, hx, hz, ppx, ppz, 0.7 + Math.random() * 0.3);
      }
      this.addPalmTree(verts, idxs, vx + 3, vz + 2, 0.8);
      this.addPalmTree(verts, idxs, vx - 3, vz - 2, 0.7);
    }

    // ── Cacti: saguaro with arms + barrel cactus, scattered in the open. ──
    let cactusIdx = 0;
    for (let i = 0; i < pts.length; i += 6) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 26 + Math.random() * 20;
        const cx = p.x + ppx * dist * side + (Math.random() - 0.5) * 8;
        const cz = p.z + ppz * dist * side + (Math.random() - 0.5) * 8;
        if (Math.random() < 0.65) {
          // Saguaro: tall trunk + one or two arms.
          const ch = 1.2 + Math.random() * 1.4;
          const cCol = [0.16, 0.28, 0.12];
          this.addCylinder(verts, idxs, cx, 0, cz, 0.07, ch, 6, cCol);
          const arms = 1 + Math.floor(Math.random() * 2);
          for (let a = 0; a < arms; a++) {
            const as = a === 0 ? -1 : 1;
            const ay = ch * (0.35 + Math.random() * 0.3);
            // Horizontal arm + vertical tip.
            this.addCylinder(verts, idxs, cx + as * 0.12, ay, cz, 0.045, 0.3, 5, cCol);
            this.addCylinder(verts, idxs, cx + as * 0.38, ay + 0.12, cz, 0.045, 0.35 + Math.random() * 0.2, 5, cCol);
          }
        } else {
          // Barrel cactus: squat rounded body + tiny bloom.
          this.addSphere(verts, idxs, cx, 0.3, cz, 0.3, 8, [0.18, 0.3, 0.13]);
          this.addSphere(verts, idxs, cx, 0.55, cz, 0.14, 6, [0.95, 0.55, 0.3]);
        }
        if (cactusIdx++ > 34) break;
      }
      if (cactusIdx > 34) break;
    }
  }

  // A small two-humped camel plodding along dirX/dirZ, built from primitives.
  private addCamel(verts: number[], idxs: number[], x: number, z: number, dirX: number, dirZ: number, s: number) {
    const body = [0.75, 0.6, 0.42];
    const dark = [0.5, 0.38, 0.26];
    // 4 legs
    for (const [lx, lz] of [[0.3, 0.14], [0.3, -0.14], [-0.3, 0.14], [-0.3, -0.14]]) {
      this.addCylinder(verts, idxs, x + lx * s, 0.4 * s, z + lz * s, 0.045 * s, 0.8 * s, 5, dark);
    }
    // Body (oriented along travel dir)
    this.addOrientedBox(verts, idxs, x, 0.9 * s, z, 1.4 * s, 0.5 * s, 0.45 * s, dirX, dirZ, body);
    // Hump
    this.addSphere(verts, idxs, x + dirX * 0.1 * s, 1.25 * s, z + dirZ * 0.1 * s, 0.26 * s, 6, body);
    // Neck + head at the front
    const nx = x + dirX * 0.6 * s;
    const nz = z + dirZ * 0.6 * s;
    this.addOrientedBox(verts, idxs, nx, 1.25 * s, nz, 0.5 * s, 0.9 * s, 0.16 * s, dirX, dirZ, body);
    this.addSphere(verts, idxs, nx + dirX * 0.35 * s, 1.75 * s, nz + dirZ * 0.35 * s, 0.13 * s, 6, dark);
    // Tail
    this.addCylinder(verts, idxs, x - dirX * 0.62 * s, 1.05 * s, z - dirZ * 0.62 * s, 0.03 * s, 0.3 * s, 4, dark);
  }

  // A flat-roofed mud-brick shack for the shanty villages.
  private addShack(verts: number[], idxs: number[], x: number, z: number, dirX: number, dirZ: number, s: number) {
    const mud = [0.78, 0.64, 0.44];
    const roof = [0.55, 0.42, 0.28];
    const h = 1.3 * s;
    // Walls (oriented along the track so the door faces the road)
    this.addOrientedBox(verts, idxs, x, h / 2, z, 1.6 * s, h, 1.3 * s, dirX, dirZ, mud);
    // Flat roof, slightly overhanging
    this.addOrientedBox(verts, idxs, x, h + 0.12 * s, z, 1.8 * s, 0.2 * s, 1.5 * s, dirX, dirZ, roof);
    // Dark doorway on the road-facing long face. The wall face is at wid/2 =
    // 0.65s, so the door sits at 0.72s — far enough out to never z-fight with
    // the mud walls even at distance.
    const px = -dirZ, pz = dirX;
    const fx = x + px * (0.72 * s), fz = z + pz * (0.72 * s);
    this.addQuad(verts, idxs,
      [fx - dirX * 0.2 * s, 0.05, fz - dirZ * 0.2 * s],
      [fx + dirX * 0.2 * s, 0.05, fz + dirZ * 0.2 * s],
      [fx + dirX * 0.2 * s, 0.85 * s, fz + dirZ * 0.2 * s],
      [fx - dirX * 0.2 * s, 0.85 * s, fz - dirZ * 0.2 * s],
      [0.25, 0.18, 0.12]);
  }

  // Monaco theme: riviera coastline, yachts, grand hotels, casino, harbour.
  private addMonacoScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    // Ocean plane (water)
    this.addOceanPlane(verts, idxs);
    // Promenade buildings (luxury hotels, casino)
    const pastels: [number, number, number][] = [
      [0.92, 0.85, 0.72], [0.85, 0.78, 0.68], [0.95, 0.88, 0.78], [0.78, 0.82, 0.88], [0.88, 0.82, 0.75],
    ];
    let bIdx = 0;
    for (let i = 0; i < pts.length; i += 6) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 30 + Math.random() * 20;
        const bx = p.x + ppx * dist * side + (Math.random() - 0.5) * 8;
        const bz = p.z + ppz * dist * side + (Math.random() - 0.5) * 8;
        const h = 15 + Math.random() * 25;
        const w = 5 + Math.random() * 4;
        const d = 5 + Math.random() * 4;
        const col = pastels[Math.floor(Math.random() * pastels.length)];
        this.addBox(verts, idxs, bx, h / 2, bz, w, h, d, col);
        // Rooftop terrace
        this.addBox(verts, idxs, bx, h + 0.1, bz, w + 0.6, 0.2, d + 0.6, [0.9, 0.9, 0.85]);
        if (bIdx++ > 30) break;
      }
      if (bIdx > 30) break;
    }
    // Yachts in the harbour (small boxes on the water)
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = 80 + Math.random() * 40;
      const yx = pts[0].x + Math.cos(a) * dist;
      const yz = pts[0].z + Math.sin(a) * dist;
      this.addBox(verts, idxs, yx, 0.1, yz, 2.5, 0.4, 1.0, [0.9, 0.9, 0.95]);
      this.addBox(verts, idxs, yx, 0.5, yz, 2.0, 0.8, 0.4, [0.8, 0.8, 0.85]);
    }
  }

  // Montreal theme: parc island, river, biosphere, grandstands.
  private addMontrealScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    // River plane (dark blue water)
    this.addOceanPlane(verts, idxs);
    // Park trees (dense green canopy)
    let treeIdx = 0;
    for (let i = 0; i < pts.length; i += 4) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 25 + Math.random() * 18;
        const tx = p.x + ppx * dist * side + (Math.random() - 0.5) * 6;
        const tz = p.z + ppz * dist * side + (Math.random() - 0.5) * 6;
        const th = 1.2 + Math.random() * 1.0;
        this.addCylinder(verts, idxs, tx, 0, tz, 0.08, th, 5, [0.3, 0.18, 0.06]);
        this.addSphere(verts, idxs, tx, th + 0.5, tz, 0.8 + Math.random() * 0.5, 6, [0.05, 0.35, 0.08]);
        if (treeIdx++ > 80) break;
      }
      if (treeIdx > 80) break;
    }
  }

  // Italy (Monza) theme: sprawling park, ancient trees, temple ruins, grandstands.
  private addItalyScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    // Classic tall Italian pines (stone pine umbrella shape)
    let treeIdx = 0;
    for (let i = 0; i < pts.length; i += 3) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 22 + Math.random() * 18;
        const tx = p.x + ppx * dist * side + (Math.random() - 0.5) * 6;
        const tz = p.z + ppz * dist * side + (Math.random() - 0.5) * 6;
        const th = 1.5 + Math.random() * 1.2;
        this.addCylinder(verts, idxs, tx, 0, tz, 0.06, th, 5, [0.3, 0.2, 0.08]);
        // Stone pine umbrella canopy
        this.addCone(verts, idxs, tx, th - 0.3, tz, 1.2 + Math.random() * 0.8, 0.8 + Math.random() * 0.5, 8, [0.03, 0.22, 0.05]);
        this.addCone(verts, idxs, tx, th + 0.1, tz, 0.8 + Math.random() * 0.5, 0.5 + Math.random() * 0.3, 8, [0.05, 0.28, 0.06]);
        if (treeIdx++ > 150) break;
      }
      if (treeIdx > 150) break;
    }
  }

  private addMiamiScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    // Palms + flowering subtropical trees (jacaranda pink / flame orange) along
    // both sides — a varied, lush streetscape instead of rows of identical palms.
    let palmIdx = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 24 + Math.random() * 16;
        const px = p.x + ppx * dist * side + (Math.random() - 0.5) * 6;
        const pz = p.z + ppz * dist * side + (Math.random() - 0.5) * 6;
        if (Math.random() < 0.62) {
          this.addPalmTree(verts, idxs, px, pz, 0.7 + Math.random() * 0.6);
        } else {
          this.addFloweringTree(verts, idxs, px, pz, 0.8 + Math.random() * 0.5);
        }
        if (palmIdx++ > 110) break;
      }
      if (palmIdx > 110) break;
    }

    // Dense pastel skyline behind the beach: low art-deco blocks, taller
    // glass towers and setback towers for a real Miami vista.
    const pastels: [number, number, number][] = [
      [0.95, 0.6, 0.65], [0.6, 0.85, 0.8], [0.98, 0.85, 0.6], [0.85, 0.75, 0.9], [0.75, 0.85, 0.95],
      [0.95, 0.7, 0.55], [0.65, 0.95, 0.9], [0.9, 0.8, 0.7],
    ];
    let bIdx = 0;
    for (let i = 0; i < pts.length; i += 5) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 60 + Math.random() * 25;
        const bx = p.x + ppx * dist * side + (Math.random() - 0.5) * 10;
        const bz = p.z + ppz * dist * side + (Math.random() - 0.5) * 10;
        const h = 10 + Math.random() * 30;
        const w = 5 + Math.random() * 3;
        const d = 5 + Math.random() * 3;
        const col = pastels[Math.floor(Math.random() * pastels.length)];
        const roll = Math.random();
        if (roll < 0.3 && h > 18) {
          // Tall glass tower with a lit beacon.
          this.addGlassTower(verts, idxs, bx, bz, h, w, d, col);
        } else if (roll < 0.45 && h > 14) {
          // Art-deco setback tower.
          this.addSetbackTower(verts, idxs, bx, bz, h, w, d, col);
        } else {
          this.addBox(verts, idxs, bx, h / 2, bz, w, h, d, col);
          // Flat parapet roof for the art-deco look.
          this.addBox(verts, idxs, bx, h + 0.4, bz, w + 0.8, 0.8, d + 0.8, [0.95, 0.95, 0.9]);
        }
        // Window grid on the two long faces (skip for glass towers — they bake
        // their own warm-lit windows).
        if (roll >= 0.3) {
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
        }
        if (bIdx++ > 44) break;
      }
      if (bIdx > 44) break;
    }

    // Beach umbrellas + towels + beach balls scattered on the sand near the
    // grandstands — a lively sunbather scene in full colour.
    const gsPositions = [0, Math.floor(pts.length / 4), Math.floor(pts.length / 2), Math.floor(pts.length * 3 / 4)];
    const umbrellaColors: [number, number, number][] = [
      [0.9, 0.25, 0.3], [0.95, 0.8, 0.2], [0.1, 0.65, 0.55], [0.25, 0.5, 0.9], [0.95, 0.55, 0.8],
      [0.95, 0.35, 0.9], [0.2, 0.8, 0.85],
    ];
    const towelColors: [number, number, number][] = [
      [0.95, 0.35, 0.4], [0.3, 0.7, 0.95], [0.95, 0.85, 0.2], [0.3, 0.85, 0.55], [0.95, 0.55, 0.8], [0.95, 0.65, 0.3],
    ];
    const ballColors: [number, number, number][] = [
      [0.95, 0.3, 0.3], [0.3, 0.6, 0.95], [0.98, 0.85, 0.2], [0.25, 0.8, 0.45], [0.95, 0.45, 0.75],
    ];
    for (const gi of gsPositions) {
      const p = pts[gi];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (let u = 0; u < 4; u++) {
        const dist = p.width / 2 + 26 + Math.random() * 12;
        const side = u % 2 === 0 ? -1 : 1;
        const ux = p.x + ppx * dist * side + (Math.random() - 0.5) * 6;
        const uz = p.z + ppz * dist * side + (Math.random() - 0.5) * 6;
        this.addCylinder(verts, idxs, ux, 0, uz, 0.05, 1.6, 6, [0.85, 0.8, 0.7]);
        this.addCone(verts, idxs, ux, 1.6, uz, 0.9, 0.35, 8, umbrellaColors[Math.floor(Math.random() * umbrellaColors.length)]);
        // Striped towel lying flat on the sand beside the umbrella pole.
        // (addQuad with explicit y so it sits just above the sand band at -0.26
        // instead of z-fighting with it.)
        if (Math.random() < 0.85) {
          const tcol = towelColors[Math.floor(Math.random() * towelColors.length)];
          const tx = ux + (Math.random() < 0.5 ? 1.1 : -1.1);
          const tz = uz + (Math.random() < 0.5 ? 1.0 : -1.0);
          this.addQuad(verts, idxs,
            [tx - 1.0, -0.23, tz - 0.55], [tx + 1.0, -0.23, tz - 0.55],
            [tx + 1.0, -0.23, tz + 0.55], [tx - 1.0, -0.23, tz + 0.55], tcol);
        }
        // Beach ball resting on the sand nearby (bottom at sand level -0.26,
        // centre at -0.26 + radius 0.3 so it doesn't float).
        if (Math.random() < 0.7) {
          this.addSphere(verts, idxs, ux + (Math.random() - 0.5) * 3, 0.04, uz + (Math.random() - 0.5) * 3, 0.3, 8, ballColors[Math.floor(Math.random() * ballColors.length)]);
        }
      }
    }

    // Boardwalk benches along the beach.
    for (const gi of gsPositions) {
      const p = pts[gi];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (let b = 0; b < 3; b++) {
        const dist = p.width / 2 + 24 + Math.random() * 8;
        const side = b % 2 === 0 ? -1 : 1;
        const bx = p.x + ppx * dist * side + (Math.random() - 0.5) * 5;
        const bz = p.z + ppz * dist * side + (Math.random() - 0.5) * 5;
        this.addBench(verts, idxs, bx, bz, p.dirX, p.dirZ);
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

  // A flowering subtropical tree — jacaranda-pink or flame-orange blossom
  // canopy on a slender trunk, for lively Miami streetscapes.
  private addFloweringTree(verts: number[], idxs: number[], x: number, z: number, s: number) {
    const lean = (Math.random() - 0.5) * 0.5;
    const trunkH = 2.2 * s;
    this.addCylinder(verts, idxs, x, 0, z, 0.12 * s, trunkH, 6, [0.42, 0.28, 0.14]);
    const topX = x + lean * 0.4;
    const topZ = z + lean * 0.3;
    // Pink jacaranda or orange flame tree.
    const blossom: [number, number, number] = Math.random() < 0.55
      ? [0.93, 0.45, 0.72]
      : [0.98, 0.55, 0.25];
    const r = (0.9 + Math.random() * 0.5) * s;
    // Big billowing bloom made of three overlapping spheres.
    this.addSphere(verts, idxs, topX, trunkH + r * 0.7, topZ, r, 8, blossom);
    this.addSphere(verts, idxs, topX + r * 0.45, trunkH + r * 0.55, topZ + r * 0.2, r * 0.65, 7, blossom);
    this.addSphere(verts, idxs, topX - r * 0.4, trunkH + r * 0.5, topZ - r * 0.25, r * 0.6, 7, blossom);
    // A hint of green foliage underneath.
    this.addSphere(verts, idxs, topX, trunkH + r * 0.35, topZ, r * 0.8, 7, [0.12, 0.4, 0.12]);
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
    // Accent mesh (sidepod livery stripe + exhaust tips) — tinted per car by
    // the accent/livery color. Decal mesh (engine-cover stripes + nose plate)
    // is colored per car by the decal style.
    const accVerts: number[] = [];
    const accIdxs: number[] = [];
    const decVerts: number[] = [];
    const decIdxs: number[] = [];

    const [cr, cg, cb] = [0.85, 0.06, 0.06]; // Team red
    const carbon = [0.12, 0.12, 0.14];
    const dark = [0.08, 0.08, 0.10];
    const grey = [0.22, 0.22, 0.24];
    const [mrl, mgl, mbl] = [0.95, 0.95, 0.98]; // helmet white

    // ── 1. Floor / undertray (wide, low, with diffuser tunnels) ──
    // Main floor plank
    this.addBox(verts, idxs, -0.1, 0.02, 0, 2.6, 0.03, 1.05, dark);
    // Floor edge winglets (thin vertical fins along the floor sides)
    this.addBox(verts, idxs, 0.1, 0.06, 0.53, 1.4, 0.07, 0.02, carbon);
    this.addBox(verts, idxs, 0.1, 0.06, -0.53, 1.4, 0.07, 0.02, carbon);
    // Second row of floor edge fences
    this.addBox(verts, idxs, -0.3, 0.05, 0.53, 0.8, 0.05, 0.015, carbon);
    this.addBox(verts, idxs, -0.3, 0.05, -0.53, 0.8, 0.05, 0.015, carbon);
    // Floor tea tray (leading edge ramp under the nose)
    this.addTaperedBox(verts, idxs, 0.7, 0.01, 0, 0.5, 0.03, 0.02, 0.4, 0.5, carbon);
    // Floor edge strakes (curved profile at the floor rear)
    this.addTaperedBox(verts, idxs, -0.9, 0.03, 0.52, 0.5, 0.05, 0.02, 0.08, 0.02, carbon);
    this.addTaperedBox(verts, idxs, -0.9, 0.03, -0.52, 0.5, 0.05, 0.02, 0.08, 0.02, carbon);
    // Diffuser ramp at the rear (rises toward the back)
    this.addTaperedBox(verts, idxs, -1.1, 0.035, 0, 0.4, 0.13, 0.03, 0.7, 0.45, carbon);
    // Diffuser tunnels (two channels carved into the floor rear)
    this.addTaperedBox(verts, idxs, -1.1, 0.01, 0.18, 0.4, 0.06, 0.02, 0.2, 0.08, dark);
    this.addTaperedBox(verts, idxs, -1.1, 0.01, -0.18, 0.4, 0.06, 0.02, 0.2, 0.08, dark);
    // Diffuser fins (vertical blades inside the rear diffuser)
    for (const dz of [-0.3, -0.1, 0.1, 0.3]) {
      this.addBox(verts, idxs, -1.15, 0.07, dz, 0.3, 0.08, 0.02, carbon);
    }

    // ── 2. Sculpted body hull (nose → tub → engine cover, 16-station loft) ──
    // Each station is a superellipse cross-section skinned along X. The curve
    // is carefully shaped: a sharp nose tip, an S-duct dip, tub shoulder, airbox
    // hump, and a tapered rear engine cover — all one continuous smooth surface.
    this.addLoft(verts, idxs, [
      { x: -1.06, y: 0.10, cz: 0, h: 0.17, w: 0.28 },  // rear tail, narrow
      { x: -0.90, y: 0.11, cz: 0, h: 0.19, w: 0.32 },  // gearbox housing
      { x: -0.74, y: 0.13, cz: 0, h: 0.22, w: 0.36 },  // engine cover rising
      { x: -0.58, y: 0.16, cz: 0, h: 0.26, w: 0.40 },  // engine cover mid
      { x: -0.42, y: 0.20, cz: 0, h: 0.32, w: 0.44 },  // engine cover hump
      { x: -0.26, y: 0.22, cz: 0, h: 0.38, w: 0.47 },  // airbox intake base
      { x: -0.10, y: 0.21, cz: 0, h: 0.34, w: 0.50 },  // cockpit rear
      { x: 0.06, y: 0.19, cz: 0, h: 0.28, w: 0.52 },   // cockpit mid (widest)
      { x: 0.22, y: 0.18, cz: 0, h: 0.24, w: 0.51 },   // cockpit surround
      { x: 0.38, y: 0.17, cz: 0, h: 0.21, w: 0.47 },   // tub shoulder
      { x: 0.54, y: 0.15, cz: 0, h: 0.18, w: 0.40 },   // tub taper
      { x: 0.70, y: 0.14, cz: 0, h: 0.16, w: 0.34 },   // nose base
      { x: 0.86, y: 0.12, cz: 0, h: 0.14, w: 0.28 },   // nose S-duct dip
      { x: 1.04, y: 0.10, cz: 0, h: 0.11, w: 0.21 },   // nose mid
      { x: 1.22, y: 0.09, cz: 0, h: 0.08, w: 0.14 },   // nose tip taper
      { x: 1.38, y: 0.09, cz: 0, h: 0.06, w: 0.08 },   // rounded nose tip
    ], 24, [cr, cg, cb], true);

    // Cockpit opening (dark recess sunk into the tub top)
    this.addBox(verts, idxs, 0.30, 0.285, 0, 0.32, 0.02, 0.24, dark);
    // Driver shoulders + torso peeking out of the cockpit
    this.addBox(verts, idxs, 0.26, 0.27, 0, 0.18, 0.07, 0.20, [cr, cg, cb]);
    this.addBox(verts, idxs, 0.29, 0.30, 0, 0.12, 0.05, 0.18, [0.1, 0.1, 0.12]);

    // ── 2b. Driver helmet + visor (detailed: helmet shell, visor strip, chin) ──
    this.addSphere(verts, idxs, 0.40, 0.315, 0, 0.09, 14, [mrl, mgl, mbl]);
    // Visor strip (dark band across the helmet front)
    this.addBox(verts, idxs, 0.45, 0.315, 0, 0.04, 0.05, 0.12, dark);
    // Visor opening (small dark rectangle on the visor)
    this.addBox(verts, idxs, 0.47, 0.315, 0, 0.02, 0.03, 0.08, [0.02, 0.02, 0.04]);
    // Helmet chin (small grey block below the sphere)
    this.addBox(verts, idxs, 0.40, 0.265, 0, 0.06, 0.03, 0.08, [0.2, 0.2, 0.22]);
    // Helmet tear-off posts (tiny protrusions on visor sides)
    this.addBox(verts, idxs, 0.47, 0.315, 0.06, 0.01, 0.01, 0.01, [0.6, 0.6, 0.6]);
    this.addBox(verts, idxs, 0.47, 0.315, -0.06, 0.01, 0.01, 0.01, [0.6, 0.6, 0.6]);

    // ── 2c. Steering wheel + display ──
    // Steering wheel column
    this.addBox(verts, idxs, 0.50, 0.27, 0, 0.02, 0.02, 0.14, dark);
    // Steering wheel grips (slightly wider, curved feel)
    this.addBox(verts, idxs, 0.50, 0.27, 0.07, 0.02, 0.025, 0.02, [0.15, 0.15, 0.16]);
    this.addBox(verts, idxs, 0.50, 0.27, -0.07, 0.02, 0.025, 0.02, [0.15, 0.15, 0.16]);
    // Steering wheel display screen (small bright rectangle)
    this.addBox(verts, idxs, 0.52, 0.28, 0, 0.01, 0.03, 0.06, [0.0, 0.3, 0.6]);
    // Steering wheel buttons (tiny coloured dots)
    this.addBox(verts, idxs, 0.50, 0.285, 0.04, 0.01, 0.01, 0.01, [1, 0, 0]);
    this.addBox(verts, idxs, 0.50, 0.285, -0.04, 0.01, 0.01, 0.01, [0, 0.5, 0]);
    this.addBox(verts, idxs, 0.50, 0.285, 0.08, 0.01, 0.01, 0.01, [0, 0.4, 1]);
    this.addBox(verts, idxs, 0.50, 0.285, -0.08, 0.01, 0.01, 0.01, [1, 0.8, 0]);

    // ── 3. Halo (over the driver — aero profile with rounded bars) ──
    // Center pillar (from tub base up to the top arch)
    this.addCylinder(verts, idxs, 0.05, 0.25, 0, 0.025, 0.18, 10, carbon);
    // Front arch (the iconic halo top bar, wider than the tub)
    this.addBox(verts, idxs, 0.4, 0.42, 0, 0.2, 0.04, 0.52, carbon);
    // Front arch aero fairing (thicker center, slightly streamlined)
    this.addTaperedBox(verts, idxs, 0.4, 0.42, 0, 0.2, 0.05, 0.04, 0.52, 0.48, carbon);
    // Left side bar (from tub to front arch)
    this.addStrut(verts, idxs, 0.05, 0.25, 0.2, 0.4, 0.42, 0.26, 0.025, carbon);
    // Right side bar
    this.addStrut(verts, idxs, 0.05, 0.25, -0.2, 0.4, 0.42, -0.26, 0.025, carbon);
    // Left top bar (rear of arch to front of arch)
    this.addStrut(verts, idxs, 0.05, 0.42, 0.24, 0.4, 0.42, 0.26, 0.025, carbon);
    // Right top bar
    this.addStrut(verts, idxs, 0.05, 0.42, -0.24, 0.4, 0.42, -0.26, 0.025, carbon);
    // Halo winglet (small fin on top of the front arch, for aero)
    this.addBox(verts, idxs, 0.4, 0.46, 0, 0.1, 0.02, 0.1, carbon);

    // ── 4. Nose details (S-duct, strakes, pitot probe) ──
    // Nose side strakes (thin fins along the sculpted nose flanks)
    this.addBox(verts, idxs, 0.92, 0.10, 0.13, 0.5, 0.05, 0.02, carbon);
    this.addBox(verts, idxs, 0.92, 0.10, -0.13, 0.5, 0.05, 0.02, carbon);
    // Nose S-duct outlet (small dark opening on the nose underside)
    this.addBox(verts, idxs, 0.85, 0.02, 0, 0.15, 0.02, 0.08, dark);
    // Nose tip pitot probe (thin forward-pointing rod)
    this.addBox(verts, idxs, 1.40, 0.10, 0, 0.06, 0.015, 0.015, [0.3, 0.3, 0.35]);
    // Nose tip pitot probe tip (tiny red cap)
    this.addBox(verts, idxs, 1.44, 0.10, 0, 0.02, 0.02, 0.02, [1, 0.1, 0.1]);

    // ── 5. Front wing (cambered multi-element + sculpted endplates + pylons) ──
    // Each element is arched so the tips rise toward the endplates, giving the
    // real F1 wing profile. 8 segments per element for smoother curvature.
    const frontWingEls = [
      { x: 1.22, y: 0.05, span: 1.55, l: 0.36, h: 0.025, lift: 0.025 },  // main plane
      { x: 1.15, y: 0.09, span: 1.48, l: 0.22, h: 0.025, lift: 0.022 },   // second element
      { x: 1.09, y: 0.07, span: 1.40, l: 0.16, h: 0.022, lift: 0.018 },   // third element
      { x: 1.03, y: 0.06, span: 1.32, l: 0.12, h: 0.02, lift: 0.015 },    // fourth element
      { x: 0.97, y: 0.05, span: 1.24, l: 0.08, h: 0.018, lift: 0.012 },   // fifth element (cascade)
    ];
    for (const el of frontWingEls) {
      const segs = 8;
      for (let i = 0; i < segs; i++) {
        const z0 = -el.span / 2 + (el.span / segs) * i;
        const z1 = z0 + el.span / segs;
        const t0 = Math.abs(z0) / (el.span / 2);
        const t1 = Math.abs(z1) / (el.span / 2);
        const y0 = el.y + t0 * t0 * el.lift;
        const y1 = el.y + t1 * t1 * el.lift;
        this.addBox(verts, idxs, el.x, (y0 + y1) / 2, (z0 + z1) / 2, el.l, el.h, (z1 - z0) * 1.15, carbon);
      }
    }
    // Front wing endplates (sculpted shape: tapered front, full height at rear)
    this.addTaperedBox(verts, idxs, 1.3, 0.12, 0.78, 0.4, 0.25, 0.15, 0.04, 0.04, carbon);
    this.addTaperedBox(verts, idxs, 1.3, 0.12, -0.78, 0.4, 0.25, 0.15, 0.04, 0.04, carbon);
    // Endplate lower step (the "foot" at the base)
    this.addBox(verts, idxs, 1.22, 0.04, 0.78, 0.36, 0.08, 0.03, carbon);
    this.addBox(verts, idxs, 1.22, 0.04, -0.78, 0.36, 0.08, 0.03, carbon);
    // Endplate trailing edge (thin vertical strip at the rear of the endplate)
    this.addBox(verts, idxs, 1.04, 0.12, 0.78, 0.02, 0.25, 0.03, carbon);
    this.addBox(verts, idxs, 1.04, 0.12, -0.78, 0.02, 0.25, 0.03, carbon);
    // Front wing cascade winglets on the endplates (stacked vanes)
    this.addBox(verts, idxs, 1.15, 0.22, 0.74, 0.12, 0.06, 0.08, carbon);
    this.addBox(verts, idxs, 1.15, 0.22, -0.74, 0.12, 0.06, 0.08, carbon);
    this.addBox(verts, idxs, 1.12, 0.18, 0.70, 0.16, 0.05, 0.06, carbon);
    this.addBox(verts, idxs, 1.12, 0.18, -0.70, 0.16, 0.05, 0.06, carbon);
    // Nose pylons (connecting the wing to the nose, aero-shaped)
    this.addBox(verts, idxs, 1.22, 0.08, 0.16, 0.12, 0.05, 0.04, carbon);
    this.addBox(verts, idxs, 1.22, 0.08, -0.16, 0.12, 0.05, 0.04, carbon);

    // ── 6. Sidepods (rounded sculpted lofts with pronounced undercut) ──
    for (const sgn of [1, -1]) {
      // Sidepod body (round cross-section, coke-bottle waist)
      this.addLoft(verts, idxs, [
        { x: 0.58, y: 0.17, cz: 0.48 * sgn, h: 0.28, w: 0.34 }, // intake mouth
        { x: 0.34, y: 0.18, cz: 0.50 * sgn, h: 0.27, w: 0.38 }, // widest point
        { x: 0.08, y: 0.18, cz: 0.50 * sgn, h: 0.25, w: 0.37 }, // mid
        { x: -0.18, y: 0.17, cz: 0.49 * sgn, h: 0.22, w: 0.33 }, // tapering
        { x: -0.42, y: 0.16, cz: 0.47 * sgn, h: 0.18, w: 0.28 }, // coke bottle
        { x: -0.64, y: 0.14, cz: 0.44 * sgn, h: 0.14, w: 0.22 }, // rear taper
        { x: -0.84, y: 0.12, cz: 0.38 * sgn, h: 0.10, w: 0.14 }, // tail
      ], 18, [cr, cg, cb], true);
    }
    // Sidepod intake mouths (dark openings on the front face)
    this.addBox(verts, idxs, 0.585, 0.19, 0.5, 0.02, 0.14, 0.28, dark);
    this.addBox(verts, idxs, 0.585, 0.19, -0.5, 0.02, 0.14, 0.28, dark);
    // Sidepod undercut (dark recessed band at the bottom of the sidepod)
    this.addBox(verts, idxs, 0.35, 0.04, 0.5, 0.6, 0.08, 0.34, dark);
    this.addBox(verts, idxs, 0.35, 0.04, -0.5, 0.6, 0.08, 0.34, dark);
    // Sidepod cooling slats (dark outlets on top, flush with the surface)
    this.addBox(verts, idxs, -0.35, 0.26, 0.5, 0.3, 0.01, 0.16, dark);
    this.addBox(verts, idxs, -0.35, 0.26, -0.5, 0.3, 0.01, 0.16, dark);
    // Sidepod gills (small vertical slots on the sidepod sides)
    for (let g = 0; g < 3; g++) {
      const gx = 0.10 - g * 0.12;
      this.addBox(verts, idxs, gx, 0.12, 0.5, 0.02, 0.04, 0.02, dark);
      this.addBox(verts, idxs, gx, 0.12, -0.5, 0.02, 0.04, 0.02, dark);
    }

    // ── 7. Engine cover (the body hull above already forms the curved cover) ──
    // Airbox intake (tall at the front, tapering back, seated on the hull hump)
    this.addTaperedBox(verts, idxs, -0.25, 0.42, 0, 0.45, 0.09, 0.17, 0.16, 0.26, carbon);
    this.addBox(verts, idxs, -0.15, 0.47, 0, 0.1, 0.06, 0.14, dark); // intake hole
    // Airbox inner divider (splits the intake into left/right channels)
    this.addBox(verts, idxs, -0.15, 0.45, 0, 0.08, 0.04, 0.02, carbon);

    // ── 8. Rear wing (3-element: beam wing, main plane, DRS flap + endplates) ──
    // Arch all three elements so the tips rise toward the endplates (8 segments).
    const rearWingEls = [
      { x: -1.02, y: 0.35, span: 1.05, l: 0.30, h: 0.03, lift: 0.015 },  // beam wing (lowest)
      { x: -1.02, y: 0.42, span: 1.08, l: 0.38, h: 0.035, lift: 0.02 },  // main plane
      { x: -1.02, y: 0.49, span: 1.02, l: 0.26, h: 0.03, lift: 0.015 },   // DRS flap
    ];
    for (const el of rearWingEls) {
      const segs = 8;
      for (let i = 0; i < segs; i++) {
        const z0 = -el.span / 2 + (el.span / segs) * i;
        const z1 = z0 + el.span / segs;
        const t0 = Math.abs(z0) / (el.span / 2);
        const t1 = Math.abs(z1) / (el.span / 2);
        const y0 = el.y + t0 * t0 * el.lift;
        const y1 = el.y + t1 * t1 * el.lift;
        this.addBox(verts, idxs, el.x, (y0 + y1) / 2, (z0 + z1) / 2, el.l, el.h, (z1 - z0) * 1.15, carbon);
      }
    }
    // Rear wing endplates (sculpted shape with curved cutout)
    this.addBox(verts, idxs, -1.02, 0.42, 0.54, 0.38, 0.28, 0.045, carbon);
    this.addBox(verts, idxs, -1.02, 0.42, -0.54, 0.38, 0.28, 0.045, carbon);
    // Endplate curved cutout (dark recess in the endplate face)
    this.addBox(verts, idxs, -1.02, 0.38, 0.54, 0.02, 0.08, 0.025, dark);
    this.addBox(verts, idxs, -1.02, 0.38, -0.54, 0.02, 0.08, 0.025, dark);
    // Endplate trailing edge extension (narrow strip at the rear)
    this.addBox(verts, idxs, -0.83, 0.42, 0.54, 0.03, 0.28, 0.02, carbon);
    this.addBox(verts, idxs, -0.83, 0.42, -0.54, 0.03, 0.28, 0.02, carbon);
    // DRS actuator pod (the mechanism that opens the flap)
    this.addBox(verts, idxs, -0.85, 0.40, 0, 0.10, 0.05, 0.08, grey);
    // Rear wing support pylons (connecting wing to the gearbox)
    this.addBox(verts, idxs, -0.92, 0.32, 0.22, 0.10, 0.16, 0.04, grey);
    this.addBox(verts, idxs, -0.92, 0.32, -0.22, 0.10, 0.16, 0.04, grey);
    // Beam wing support (small struts from gearbox to beam wing)
    this.addBox(verts, idxs, -0.95, 0.30, 0.15, 0.06, 0.06, 0.03, carbon);
    this.addBox(verts, idxs, -0.95, 0.30, -0.15, 0.06, 0.06, 0.03, carbon);
    // Gurney lip (tiny flap at the trailing edge of the main plane)
    this.addBox(verts, idxs, -1.02, 0.45, 0, 0.06, 0.04, 0.92, carbon);
    // Monkey seat (small winglet below the beam wing, for exhaust blowing)
    this.addBox(verts, idxs, -1.04, 0.28, 0, 0.12, 0.02, 0.50, carbon);

    // ── 9. Bargeboards (stack of 3 vertical vanes ahead of the sidepods) ──
    this.addBox(verts, idxs, 0.55, 0.10, 0.33, 0.30, 0.12, 0.02, carbon);
    this.addBox(verts, idxs, 0.55, 0.10, -0.33, 0.30, 0.12, 0.02, carbon);
    this.addBox(verts, idxs, 0.55, 0.07, 0.38, 0.26, 0.08, 0.015, carbon);
    this.addBox(verts, idxs, 0.55, 0.07, -0.38, 0.26, 0.08, 0.015, carbon);
    this.addBox(verts, idxs, 0.55, 0.05, 0.43, 0.20, 0.05, 0.012, carbon);
    this.addBox(verts, idxs, 0.55, 0.05, -0.43, 0.20, 0.05, 0.012, carbon);
    // Bargeboard footplate (small horizontal vane at the base)
    this.addBox(verts, idxs, 0.55, 0.015, 0.38, 0.20, 0.01, 0.12, carbon);
    this.addBox(verts, idxs, 0.55, 0.015, -0.38, 0.20, 0.01, 0.12, carbon);

    // ── 9b. Front wing cascade winglets (extra vanes on the endplates) ──
    this.addBox(verts, idxs, 1.15, 0.22, 0.74, 0.12, 0.06, 0.08, carbon);
    this.addBox(verts, idxs, 1.15, 0.22, -0.74, 0.12, 0.06, 0.08, carbon);
    this.addBox(verts, idxs, 1.12, 0.18, 0.70, 0.16, 0.05, 0.06, carbon);
    this.addBox(verts, idxs, 1.12, 0.18, -0.70, 0.16, 0.05, 0.06, carbon);

    // ── 9c. Turning vanes (ahead of sidepod undercut, below the bargeboards) ──
    this.addTaperedBox(verts, idxs, 0.35, 0.06, 0.35, 0.25, 0.06, 0.01, 0.14, 0.02, carbon);
    this.addTaperedBox(verts, idxs, 0.35, 0.06, -0.35, 0.25, 0.06, 0.01, 0.14, 0.02, carbon);

    // ── 9d. Front brake duct scoops (detailed: inlet + channel) ──
    this.addBox(verts, idxs, 0.62, 0.12, 0.62, 0.10, 0.10, 0.06, carbon);
    this.addBox(verts, idxs, 0.62, 0.12, -0.62, 0.10, 0.10, 0.06, carbon);
    // Brake duct inlet (dark opening)
    this.addBox(verts, idxs, 0.67, 0.12, 0.62, 0.02, 0.06, 0.04, dark);
    this.addBox(verts, idxs, 0.67, 0.12, -0.62, 0.02, 0.06, 0.04, dark);
    // Brake duct hose (thin tube from the duct to the hub)
    this.addStrut(verts, idxs, 0.62, 0.12, 0.62, 0.72, 0.06, 0.72, 0.015, grey);
    this.addStrut(verts, idxs, 0.62, 0.12, -0.62, 0.72, 0.06, -0.72, 0.015, grey);

    // ── 9e. Livery accent stripe (contrast band on engine cover/sidepods) ──
    // Lives in the ACCENT mesh so its color is the per-car livery accent (white
    // verts × uColor — the shader multiplies vertex color by the car color).
    this.addBox(accVerts, accIdxs, -0.1, 0.30, 0.505, 0.5, 0.02, 0.005, [1, 1, 1]);
    this.addBox(accVerts, accIdxs, -0.1, 0.30, -0.505, 0.5, 0.02, 0.005, [1, 1, 1]);

    // ── 10. Mirrors + stalks ──
    this.addBox(verts, idxs, 0.35, 0.30, 0.60, 0.10, 0.05, 0.07, grey);
    this.addBox(verts, idxs, 0.35, 0.30, -0.60, 0.10, 0.05, 0.07, grey);
    this.addStrut(verts, idxs, 0.30, 0.24, 0.52, 0.35, 0.30, 0.60, 0.02, carbon);
    this.addStrut(verts, idxs, 0.30, 0.24, -0.52, 0.35, 0.30, -0.60, 0.02, carbon);
    // Mirror reflective surface (small bright rectangle on the mirror face)
    this.addBox(verts, idxs, 0.40, 0.30, 0.60, 0.02, 0.03, 0.05, [0.6, 0.65, 0.7]);
    this.addBox(verts, idxs, 0.40, 0.30, -0.60, 0.02, 0.03, 0.05, [0.6, 0.65, 0.7]);

    // ── 11. Exhaust outlets (accent mesh → colored by the livery accent) ──
    this.addCylinder(accVerts, accIdxs, -0.72, 0.28, 0.18, 0.04, 0.07, 10, [1, 1, 1]);
    this.addCylinder(accVerts, accIdxs, -0.72, 0.28, -0.18, 0.04, 0.07, 10, [1, 1, 1]);
    // Exhaust tailpipe inner (dark opening)
    this.addCylinder(accVerts, accIdxs, -0.70, 0.28, 0.18, 0.025, 0.02, 8, dark);
    this.addCylinder(accVerts, accIdxs, -0.70, 0.28, -0.18, 0.025, 0.02, 8, dark);

    // ── 12. Rain light (bright red LED cluster at the rear) ──
    this.addBox(verts, idxs, -1.035, 0.52, 0, 0.05, 0.07, 0.06, [1, 0.15, 0.15]);
    // Rain light inner LEDs (small bright dots)
    this.addBox(verts, idxs, -1.03, 0.52, 0.02, 0.01, 0.03, 0.01, [1, 0.5, 0.5]);
    this.addBox(verts, idxs, -1.03, 0.52, -0.02, 0.01, 0.03, 0.01, [1, 0.5, 0.5]);
    this.addBox(verts, idxs, -1.03, 0.52, 0, 0.01, 0.03, 0.01, [1, 0.5, 0.5]);

    // ── 13. T-cam + antenna ──
    this.addBox(verts, idxs, -0.20, 0.50, 0, 0.04, 0.05, 0.05, [1.0, 0.9, 0.2]);
    this.addCylinder(verts, idxs, -0.60, 0.39, 0, 0.008, 0.30, 8, grey);

    // ── 14. Shark fin (thin blade over the engine cover) ──
    this.addBox(verts, idxs, -0.55, 0.40, 0, 0.50, 0.16, 0.015, carbon);

    // ── Decal livery (per-car colored stripes over the engine cover + a nose
    // number plate). White verts — uColor carries the decal style's color.
    this.addBox(decVerts, decIdxs, -0.3, 0.375, 0.06, 1.0, 0.01, 0.09, [1, 1, 1]);
    this.addBox(decVerts, decIdxs, -0.3, 0.375, -0.06, 1.0, 0.01, 0.09, [1, 1, 1]);
    this.addBox(decVerts, decIdxs, 1.12, 0.12, 0, 0.10, 0.14, 0.012, [1, 1, 1]);

    // ── 15. Suspension wishbones + pushrods (detailed double-wishbone layout) ──
    // Front upper arms (tub → wheel hub, forward-swept)
    this.addStrut(verts, idxs, 0.58, 0.16, 0.22, 0.72, 0.06, 0.72, 0.025, carbon);
    this.addStrut(verts, idxs, 0.58, 0.16, -0.22, 0.72, 0.06, -0.72, 0.025, carbon);
    // Front upper rear arms
    this.addStrut(verts, idxs, 0.54, 0.16, 0.22, 0.68, 0.06, 0.72, 0.025, carbon);
    this.addStrut(verts, idxs, 0.54, 0.16, -0.22, 0.68, 0.06, -0.72, 0.025, carbon);
    // Front lower arms
    this.addStrut(verts, idxs, 0.62, 0.05, 0.22, 0.78, 0.02, 0.74, 0.025, carbon);
    this.addStrut(verts, idxs, 0.62, 0.05, -0.22, 0.78, 0.02, -0.74, 0.025, carbon);
    // Front lower rear arms
    this.addStrut(verts, idxs, 0.58, 0.05, 0.22, 0.74, 0.02, 0.74, 0.025, carbon);
    this.addStrut(verts, idxs, 0.58, 0.05, -0.22, 0.74, 0.02, -0.74, 0.025, carbon);
    // Front pushrods (lower arm up into the tub)
    this.addStrut(verts, idxs, 0.68, 0.03, 0.72, 0.60, 0.14, 0.18, 0.015, grey);
    this.addStrut(verts, idxs, 0.68, 0.03, -0.72, 0.60, 0.14, -0.18, 0.015, grey);
    // Front anti-roll bar (thin bar connecting the pushrods)
    this.addStrut(verts, idxs, 0.60, 0.14, 0.18, 0.60, 0.14, -0.18, 0.012, grey);
    // Rear upper arms
    this.addStrut(verts, idxs, -0.52, 0.16, 0.22, -0.64, 0.06, 0.72, 0.025, carbon);
    this.addStrut(verts, idxs, -0.52, 0.16, -0.22, -0.64, 0.06, -0.72, 0.025, carbon);
    // Rear upper rear arms
    this.addStrut(verts, idxs, -0.56, 0.16, 0.22, -0.68, 0.06, 0.72, 0.025, carbon);
    this.addStrut(verts, idxs, -0.56, 0.16, -0.22, -0.68, 0.06, -0.72, 0.025, carbon);
    // Rear lower arms
    this.addStrut(verts, idxs, -0.56, 0.05, 0.22, -0.70, 0.02, 0.74, 0.025, carbon);
    this.addStrut(verts, idxs, -0.56, 0.05, -0.22, -0.70, 0.02, -0.74, 0.025, carbon);
    // Rear lower rear arms
    this.addStrut(verts, idxs, -0.60, 0.05, 0.22, -0.74, 0.02, 0.74, 0.025, carbon);
    this.addStrut(verts, idxs, -0.60, 0.05, -0.22, -0.74, 0.02, -0.74, 0.025, carbon);
    // Rear anti-roll bar
    this.addStrut(verts, idxs, -0.54, 0.14, 0.18, -0.54, 0.14, -0.18, 0.012, grey);

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

    // Accent VAO (livery stripe + exhaust) — drawn with the per-car accent color.
    const accArray = new Float32Array(accVerts);
    const accIdxArray = new Uint16Array(accIdxs);
    this.accentCount = accIdxArray.length;
    this.accentVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.accentVao);
    const avbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, avbo);
    gl.bufferData(gl.ARRAY_BUFFER, accArray, gl.STATIC_DRAW);
    const aibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, aibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, accIdxArray, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);

    // Decal VAO (stripes + nose plate) — drawn only when a decal is equipped.
    const decArray = new Float32Array(decVerts);
    const decIdxArray = new Uint16Array(decIdxs);
    this.decalCount = decIdxArray.length;
    this.decalVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.decalVao);
    const dvbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, dvbo);
    gl.bufferData(gl.ARRAY_BUFFER, decArray, gl.STATIC_DRAW);
    const dibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, dibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, decIdxArray, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);

    // Underglow quad — a flat pool under the car drawn with additive blending,
    // tinted by the per-car neon color. Sits just above the road (the body
    // translate is +0.15, so local y -0.13 lands ~0.046 above the asphalt).
    const gv: number[] = [];
    const gi: number[] = [];
    const glowL = 1.5, glowW = 0.72;
    const gy = -0.13;
    gv.push(-glowL, gy, -glowW, 0, 1, 0, 1, 1, 1, 0, 0);
    gv.push(glowL, gy, -glowW, 0, 1, 0, 1, 1, 1, 1, 0);
    gv.push(glowL, gy, glowW, 0, 1, 0, 1, 1, 1, 1, 1);
    gv.push(-glowL, gy, -glowW, 0, 1, 0, 1, 1, 1, 0, 0);
    gv.push(glowL, gy, glowW, 0, 1, 0, 1, 1, 1, 1, 1);
    gv.push(-glowL, gy, glowW, 0, 1, 0, 1, 1, 1, 0, 1);
    gi.push(0, 1, 2, 3, 4, 5);
    this.glowCount = gi.length;
    this.glowVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.glowVao);
    const gvbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, gvbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gv), gl.STATIC_DRAW);
    const gibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(gi), gl.STATIC_DRAW);
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
    // ── Front wheels (narrower) — solid rim disc + brake disc + hub + tread ──
    // The rim is a SOLID disc that fills the tire's inner circle (no spokes):
    // open-spoke wheels sweep like a windmill when spinning. A closed rim keeps
    // the wheel looking fully round at any rotation speed.
    const fv: number[] = [];
    const fi: number[] = [];
    // Rim barrel — its OWN mesh/VAO (white verts) so the per-car rim tint
    // (uRimTint) colors the metal without ever tinting the black tire band.
    const fvRim: number[] = [];
    const fiRim: number[] = [];
    // ── Brake assembly (drawn separately so its heat glow only hits the disc) ──
    const fb: number[] = [];
    const fbi: number[] = [];
    // ── Branded rim face (own mesh: planar UVs carry the crisp BHOSTED tex) ──
    const frf: number[] = [];
    const frfi: number[] = [];
    // Rim disc (white so the rim tint shows at full strength; fills the tread
    // inner circle — 0.165 ≈ tread 0.17)
    this.addCylinder(fvRim, fiRim, 0, 0, 0, 0.165, 0.15, 18, [1, 1, 1]);
    // Branded rim face — sits slightly proud of the rim cap (0.152 > 0.15) so
    // the texture never z-fights the cap, and under the tire band (0.17). White
    // verts so the shader's `base *= texture` shows the lettering at full color.
    this.addRimRing(frf, frfi, 0, 0.152, 0, 0.135, 0.065, [1, 1, 1]);
    // Tire tread — larger radius so the band wraps the rim
    this.addCylinder(fv, fi, 0, 0, 0, 0.17, 0.12, 18, [0.13, 0.13, 0.14]);
    // Tire sidewall lettering (small raised bumps on the tread side)
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.2;
      this.addBox(fv, fi, Math.cos(a) * 0.17, 0.12, Math.sin(a) * 0.17, 0.02, 0.01, 0.02, [0.2, 0.2, 0.2]);
    }
    // Valve stem
    this.addCylinder(fv, fi, 0.14, 0.05, 0, 0.008, 0.05, 6, [0.2, 0.2, 0.2]);
    // Brake rotor — thin ventilated steel disc that sits PROUD of the rim
    // (top cap at z=0.17 vs rim face at 0.152) so the disc reads inside the
    // tire, visible through the rim's centre bore. uHeatGlow is enabled only
    // while drawing this mesh in renderCar, so the rotor glows hot while the
    // black rubber band stays dark.
    this.addCylinder(fb, fbi, 0, 0, 0, 0.078, 0.17, 22, [0.42, 0.40, 0.38]);
    // Drilled ventilation holes — small dark bores punched through the disc.
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.35;
      this.addCylinder(fb, fbi, Math.cos(a) * 0.052, 0, Math.sin(a) * 0.052, 0.011, 0.19, 8, [0.03, 0.03, 0.04]);
    }
    // Brake caliper — red block straddling the rotor edge, proud of the disc.
    this.addBox(fb, fbi, 0.07, 0.16, 0, 0.045, 0.05, 0.06, [0.85, 0.12, 0.10]);
    // Hub centre cap (slightly proud of the rotor face).
    this.addCylinder(fb, fbi, 0, 0, 0, 0.028, 0.19, 12, [0.22, 0.22, 0.26]);
    // Front rim barrel VAO (tinted per rim style).
    const fvaRim = new Float32Array(fvRim);
    const fiaRim = new Uint16Array(fiRim);
    this.wheelRimCount = fiaRim.length;
    this.wheelRimVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.wheelRimVao);
    const rvbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, rvbo);
    gl.bufferData(gl.ARRAY_BUFFER, fvaRim, gl.STATIC_DRAW);
    const ribo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ribo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, fiaRim, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);

    // Front TIRE VAO (band + sidewall lettering + valve) — never tinted.
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
    this.brakeCount = fbi.length;
    this.brakeVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.brakeVao);
    const bvbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, bvbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(fb), gl.STATIC_DRAW);
    const bibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(fbi), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
    // Branded front rim face VAO (own buffers so it can be drawn textured).
    this.rimFaceCount = frfi.length;
    this.rimFaceVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.rimFaceVao);
    const rfbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, rfbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(frf), gl.STATIC_DRAW);
    const rfibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rfibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(frfi), gl.STATIC_DRAW);
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
    // Same closed-rim design as the fronts — solid disc, no spokes to sweep.
    const rv: number[] = [];
    const ri: number[] = [];
    const rvRim: number[] = [];
    const riRim: number[] = [];
    const rb: number[] = [];
    const rbi: number[] = [];
    // ── Branded rear rim face (own mesh: planar UVs carry the BHOSTED tex) ──
    const rrf: number[] = [];
    const rrfi: number[] = [];
    this.addCylinder(rvRim, riRim, 0, 0, 0, 0.175, 0.18, 18, [1, 1, 1]);
    // Rear rim face — slightly proud of the rim cap (0.182 > 0.18), white verts
    // so the lettering texture shows at full brightness.
    this.addRimRing(rrf, rrfi, 0, 0.182, 0, 0.145, 0.07, [1, 1, 1]);
    this.addCylinder(rv, ri, 0, 0, 0, 0.18, 0.15, 18, [0.13, 0.13, 0.14]); 
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.2;
      this.addBox(rv, ri, Math.cos(a) * 0.18, 0.15, Math.sin(a) * 0.18, 0.02, 0.01, 0.02, [0.2, 0.2, 0.2]);
    }
    this.addCylinder(rv, ri, 0.15, 0.06, 0, 0.008, 0.05, 6, [0.2, 0.2, 0.2]);
    this.addCylinder(rb, rbi, 0, 0, 0, 0.088, 0.2, 22, [0.42, 0.40, 0.38]);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.35;
      this.addCylinder(rb, rbi, Math.cos(a) * 0.058, 0, Math.sin(a) * 0.058, 0.012, 0.215, 8, [0.03, 0.03, 0.04]);
    }
    this.addBox(rb, rbi, 0.08, 0.19, 0, 0.05, 0.055, 0.065, [0.85, 0.12, 0.10]);
    this.addCylinder(rb, rbi, 0, 0, 0, 0.031, 0.22, 12, [0.22, 0.22, 0.26]);
    // Rear rim barrel VAO (tinted per rim style).
    const rvaRim = new Float32Array(rvRim);
    const riaRim = new Uint16Array(riRim);
    this.rearWheelRimCount = riaRim.length;
    this.rearWheelRimVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.rearWheelRimVao);
    const rrvbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, rrvbo);
    gl.bufferData(gl.ARRAY_BUFFER, rvaRim, gl.STATIC_DRAW);
    const rribo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rribo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, riaRim, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);

    // Rear TIRE VAO (band + sidewall lettering + valve) — never tinted.
    const rva = new Float32Array(rv);
    const ria = new Uint16Array(ri);
    this.rearWheelCount = ria.length;
    this.rearWheelVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.rearWheelVao);
    const rrvbo2 = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, rrvbo2);
    gl.bufferData(gl.ARRAY_BUFFER, rva, gl.STATIC_DRAW);
    const rribo2 = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rribo2);
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
    this.rearBrakeCount = rbi.length;
    this.rearBrakeVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.rearBrakeVao);
    const rbbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, rbbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rb), gl.STATIC_DRAW);
    const rbibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rbibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(rbi), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
    // Branded rear rim face VAO (own buffers so it can be drawn textured).
    this.rearRimFaceCount = rrfi.length;
    this.rearRimFaceVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.rearRimFaceVao);
    const rrfbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, rrfbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rrf), gl.STATIC_DRAW);
    const rrfibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rrfibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(rrfi), gl.STATIC_DRAW);
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
  // Annular rim face (ring with a centre bore) so the brake rotor shows
  // through the wheel. Planar UVs are normalised to the OUTER radius so the
  // BHOSTED lettering (drawn mid-texture) lands on the ring, not the hole.
  private addRimRing(verts: number[], idxs: number[], cx: number, cy: number, cz: number, outerRadius: number, innerRadius: number, color: number[]) {
    const [r, g, b] = color;
    const segments = 28;
    const baseIdx = verts.length / 11;
    // Inner bore ring
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const x = Math.cos(a) * innerRadius;
      const z = Math.sin(a) * innerRadius;
      verts.push(cx + x, cy, cz + z, 0, 1, 0, r, g, b, 0.5 + x / (outerRadius * 2), 0.5 + z / (outerRadius * 2));
    }
    const innerStart = baseIdx;
    // Outer ring
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const x = Math.cos(a) * outerRadius;
      const z = Math.sin(a) * outerRadius;
      verts.push(cx + x, cy, cz + z, 0, 1, 0, r, g, b, 0.5 + x / (outerRadius * 2), 0.5 + z / (outerRadius * 2));
    }
    const outerStart = innerStart + segments + 1;
    for (let i = 0; i < segments; i++) {
      idxs.push(innerStart + i, innerStart + i + 1, outerStart + i);
      idxs.push(innerStart + i + 1, outerStart + i + 1, outerStart + i);
    }
  }

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

  // Box whose length runs along an arbitrary XZ direction (dirX, dirZ), with
  // height along Y and width perpendicular to the direction. Used for overpass
  // decks, highway ramps and benches that must align with the track's heading.
  private addOrientedBox(verts: number[], idxs: number[], cx: number, cy: number, cz: number, len: number, h: number, wid: number, dirX: number, dirZ: number, color: number[]) {
    const dl = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
    const ux = dirX / dl, uz = dirZ / dl;
    const vx = -uz, vz = ux; // perpendicular (right-hand)
    const hl = len / 2, hh = h / 2, hw = wid / 2;
    const corner = (sx: number, sy: number, sz: number): number[] => [
      cx + ux * hl * sx + vx * hw * sz,
      cy + hh * sy,
      cz + uz * hl * sx + vz * hw * sz,
    ];
    // 8 corners (naming mirrors addTaperedBox: b=back/u-, f=front/u+, 0=v-, 1=v+,
    // y- bottom / y+ top):
    //   b0=c00 back-bottom-left, b1=c01 back-bottom-right, b2=c03 back-top-right,
    //   b3=c02 back-top-left, f0=c10 front-bottom-left, f1=c11 front-bottom-right,
    //   f2=c13 front-top-right, f3=c12 front-top-left.
    const c00 = corner(-1, -1, -1), c01 = corner(-1, -1, 1), c02 = corner(-1, 1, -1), c03 = corner(-1, 1, 1);
    const c10 = corner(1, -1, -1), c11 = corner(1, -1, 1), c12 = corner(1, 1, -1), c13 = corner(1, 1, 1);
    // Same windings as addTaperedBox (proven outward normals via addQuad's cross):
    this.addQuad(verts, idxs, c01, c00, c10, c11, color); // bottom (b1,b0,f0,f1)
    this.addQuad(verts, idxs, c03, c13, c12, c02, color); // top (b2,f2,f3,b3)
    this.addQuad(verts, idxs, c02, c12, c10, c00, color); // left v- (b3,f3,f0,b0)
    this.addQuad(verts, idxs, c01, c11, c13, c03, color); // right v+ (b1,f1,f2,b2)
    this.addQuad(verts, idxs, c00, c01, c03, c02, color); // back u- (b0,b1,b2,b3)
    this.addQuad(verts, idxs, c10, c12, c13, c11, color); // front u+ (f0,f3,f2,f1)
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

  // Smooth sculpted hull along X: skins superellipse cross-sections between
  // consecutive stations. Each station has x (along the car, nose = +X),
  // y (vertical center), cz (lateral center), h (full height) and w (full
  // lateral width). The perimeter is sampled `segs` times around, so the
  // surface is genuinely curved — no flat box faces. Optionally closes the
  // two open ends with small fan caps (degenerate triangles are culled).
  private addLoft(verts: number[], idxs: number[], stations: Array<{ x: number; y: number; cz: number; h: number; w: number }>, segs: number, color: number[], closeCaps: boolean) {
    const n = 4; // superellipse exponent: 2 = ellipse, 4 = rounded rect
    const rings: number[][][] = stations.map(st => {
      const ring: number[][] = [];
      const hw = st.w / 2, hh = st.h / 2;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const sx = ca < 0 ? -1 : 1, sy = sa < 0 ? -1 : 1;
        const lx = sx * Math.pow(Math.abs(ca), 2 / n) * hw;
        const ly = sy * Math.pow(Math.abs(sa), 2 / n) * hh;
        ring.push([st.x, st.y + ly, st.cz + lx]);
      }
      return ring;
    });
    // Skin consecutive stations. Quad order (A0, B0, B1, A1) yields outward
    // cross-product normals (verified against the addTaperedBox convention).
    for (let s = 0; s < stations.length - 1; s++) {
      const A = rings[s], B = rings[s + 1];
      for (let i = 0; i < segs; i++) {
        this.addQuad(verts, idxs, A[i], B[i], B[i + 1], A[i + 1], color);
      }
    }
    if (closeCaps) {
      // Front cap (last station): fan winding gives +X outward normal.
      const F = rings[rings.length - 1];
      const fc = stations[stations.length - 1];
      for (let i = 0; i < segs; i++) {
        this.addQuad(verts, idxs, [fc.x, fc.y, fc.cz], F[i + 1], F[i], [fc.x, fc.y, fc.cz], color);
      }
      // Back cap (first station): reversed fan gives −X outward normal.
      const R = rings[0];
      const rc = stations[0];
      for (let i = 0; i < segs; i++) {
        this.addQuad(verts, idxs, [rc.x, rc.y, rc.cz], R[i], R[i + 1], [rc.x, rc.y, rc.cz], color);
      }
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
    // Track-themed crowd palette — each circuit's fans wear local colors
    // (Miami pastels, Monza tricolour, Montreal blues, etc.).
    const crowdShirts: [number, number, number][] = this.crowdShirtsForTheme();
    const skins: [number, number, number][] = [
      [0.85, 0.65, 0.5], [0.55, 0.36, 0.22], [0.95, 0.82, 0.66], [0.4, 0.26, 0.15],
    ];
    const hairs: [number, number, number][] = [
      [0.1, 0.08, 0.06], [0.55, 0.38, 0.18], [0.9, 0.85, 0.7], [0.18, 0.12, 0.08], [0.3, 0.2, 0.12],
    ];
    // Standing crowd along the front rail (closest to the track) + a second
    // row up on the first tier — posed, animated figures instead of blocks.
    const standPeople: [number, number][] = [
      // front rail row (5) spans the width of the stand; 5 more up on the first
      // tier, staggered so the crowd fills the stand instead of clumping.
      [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0],
      [-1.6, 1], [-0.6, 1], [0.4, 1], [1.4, 1], [2.4, 1],
    ];
    for (const [off, tier] of standPeople) {
      const bx = gx + ppx * (off * hw * 0.45 + tier * 0.9);
      const bz = gz + ppz * (off * hw * 0.35 + tier * 0.9);
      const ty = 0.1 + tier * 0.35;
      this._crowdPeople.push({
        x: bx,
        y: ty,
        z: bz,
        shirt: crowdShirts[Math.floor(Math.random() * crowdShirts.length)],
        skin: skins[Math.floor(Math.random() * skins.length)],
        hair: hairs[Math.floor(Math.random() * hairs.length)],
        pants: [0.12, 0.12, 0.16],
        pose: Math.floor(Math.random() * 3),
        scale: 0.9 + Math.random() * 0.25,
        phase: Math.random() * Math.PI * 2,
      });
    }
    // Roof
    this.addBox(verts, idxs, gx + ppx * 3, 2.5, gz + ppz * 3, 1.5, 0.1, hw * 2.5, [0.3, 0.3, 0.35]);
    // Pillars
    for (const side of [-1, 1]) {
      this.addBox(verts, idxs, gx + ppx * 3 + ppx * side * hw * 1.2, 1.25, gz + ppz * 3 + ppz * side * hw * 1.2, 0.1, 2.5, 0.1, [0.3, 0.3, 0.35]);
    }
    // Team flags on poles at each end — flown in the circuit's two most
    // iconic colors (e.g. Italian red/green at Monza, blue/white in Montreal).
    for (const side of [-1, 1]) {
      const fx = gx + ppx * 0.6 * side;
      const fz = gz + ppz * 0.6 * side;
      this.addCylinder(verts, idxs, fx, 0, fz, 0.045, 2.4, 6, [0.55, 0.55, 0.58]);
      const flagCols = this.themeFlagColors();
      this.addBox(verts, idxs, fx + ppx * 0.55 * side, 1.8, fz + ppz * 0.55 * side, 0.02, 0.55, 0.35, flagCols[side === 1 ? 0 : 1]);
    }
  }

  // Track-themed jersey palette for crowd figures, keyed by the circuit theme.
  private crowdShirtsForTheme(): [number, number, number][] {
    switch (this.theme) {
      case 'miami':
        // Pastel beach palette: hot pink, aqua, coral, mint, lavender, cream.
        return [[0.95, 0.45, 0.6], [0.2, 0.7, 0.75], [0.95, 0.55, 0.35],
          [0.45, 0.85, 0.6], [0.75, 0.6, 0.9], [1, 0.9, 0.75], [0.3, 0.8, 0.9], [0.95, 0.85, 0.3]];
      case 'italy':
        // Monza — Italian tricolour crowd.
        return [[0.8, 0.1, 0.1], [0, 0.55, 0.15], [0.9, 0.9, 0.9],
          [0.7, 0.1, 0.1], [0, 0.45, 0.12], [0.85, 0.85, 0.85]];
      case 'montreal':
        // Quebec blues & whites with maple-leaf red accents.
        return [[0.1, 0.3, 0.8], [0.9, 0.9, 0.95], [0.05, 0.2, 0.6],
          [0.95, 0.3, 0.3], [0.7, 0.85, 1], [0.1, 0.25, 0.7]];
      case 'monaco':
        // Riviera — red & white, casino gold.
        return [[0.8, 0.1, 0.1], [0.9, 0.9, 0.95], [0.7, 0.12, 0.12],
          [0.85, 0.85, 0.9], [0.9, 0.75, 0.25], [0.95, 0.95, 0.98]];
      case 'desert':
        // Marrakech — Morocco red & green with sandy earth tones.
        return [[0.75, 0.1, 0.1], [0, 0.45, 0.15], [0.8, 0.6, 0.35],
          [0.9, 0.9, 0.9], [0.6, 0.3, 0.1], [0, 0.4, 0.12]];
      case 'mountain':
      case 'alpine':
        // Snow circuits — cool alpine blues, whites and pine greens.
        return [[0.1, 0.5, 0.7], [0.9, 0.9, 0.95], [0, 0.4, 0.25],
          [0.7, 0.8, 1], [0.85, 0.9, 0.95], [0.1, 0.35, 0.55]];
      case 'city':
        // Downtown — concrete greys with signal red & amber.
        return [[0.5, 0.55, 0.6], [0.85, 0.3, 0.2], [0.2, 0.3, 0.45],
          [0.8, 0.8, 0.8], [0.35, 0.45, 0.55], [0.9, 0.75, 0.2]];
      default:
        return [[0.7, 0.15, 0.15], [0.15, 0.3, 0.7], [0.8, 0.7, 0.1],
          [0.9, 0.9, 0.9], [0.15, 0.5, 0.2], [0.6, 0.2, 0.6], [0.1, 0.65, 0.65], [0.95, 0.5, 0.15]];
    }
  }

  // Two most iconic flag colors for the current circuit (used on grandstand
  // flag poles). Falls back to the first two jersey colors.
  private themeFlagColors(): [number, number, number][] {
    switch (this.theme) {
      case 'italy': return [[0.8, 0.1, 0.1], [0, 0.55, 0.15]];   // red + green
      case 'montreal': return [[0.1, 0.3, 0.8], [0.9, 0.9, 0.95]]; // blue + white
      case 'monaco': return [[0.8, 0.1, 0.1], [0.9, 0.9, 0.95]];   // red + white
      case 'desert': return [[0.75, 0.1, 0.1], [0, 0.45, 0.15]];   // red + green
      case 'mountain': case 'alpine': return [[0.1, 0.5, 0.7], [0.9, 0.9, 0.95]];
      case 'miami': return [[0.95, 0.45, 0.6], [0.2, 0.7, 0.75]];  // pink + aqua
      default: return this.crowdShirtsForTheme().slice(0, 2);
    }
  }

  // Start/Finish arch: two pillars, a cross beam over the road, a checker
  // banner and gantry lights — the classic circuit start gantry.
  private addStartGantry(verts: number[], idxs: number[], x: number, z: number, dirX: number, dirZ: number, width: number) {
    const ppx = -dirZ;
    const ppz = dirX;
    const hw = width / 2;
    const beamY = 4.4;
    // Pillars on both sides of the road
    for (const side of [-1, 1]) {
      this.addBox(verts, idxs, x + ppx * (hw + 1.3) * side, beamY / 2, z + ppz * (hw + 1.3) * side, 0.5, beamY, 0.5, [0.25, 0.25, 0.3]);
    }
    // Cross beam over the track
    this.addOrientedBox(verts, idxs, x, beamY, z, width + 3, 0.45, 0.7, ppx, ppz, [0.35, 0.35, 0.4]);
    // Checker banner hanging under the beam (alternating panels)
    for (let s = 0; s < 6; s++) {
      const off = (s - 2.5) * (width / 6);
      const checker = s % 2 === 0;
      this.addBox(verts, idxs, x + ppx * off, beamY - 0.55, z + ppz * off, 0.06, 0.9, width / 6 * 1.05, checker ? [0.92, 0.92, 0.92] : [0.12, 0.12, 0.14]);
    }
    // Gantry lights on the beam
    for (const side of [-1, 0, 1]) {
      this.addSphere(verts, idxs, x + ppx * (hw / 2) * side, beamY + 0.4, z + ppz * (hw / 2) * side, 0.16, 6, [1, 0.95, 0.7]);
    }
  }

  // A stack of tires (2 high) running along the perpendicular direction — the
  // classic runoff crash wall at corner apexes.
  private addTireBarrier(verts: number[], idxs: number[], x: number, z: number, ppx: number, ppz: number, tires: number) {
    for (let r = 0; r < 2; r++) {
      for (let t = 0; t < tires; t++) {
        const off = (t - (tires - 1) / 2) * 1.1;
        const tx = x + ppx * off;
        const tz = z + ppz * off;
        this.addCylinder(verts, idxs, tx, r * 0.32, tz, 0.5, 0.3, 10, r === 0 ? [0.09, 0.09, 0.1] : [0.12, 0.12, 0.13]);
      }
    }
  }

  // Marshal post: white hut, red roof and a yellow flag on a pole.
  private addMarshalPost(verts: number[], idxs: number[], x: number, z: number, ppx: number, ppz: number, side: number) {
    this.addBox(verts, idxs, x, 0.5, z, 1.1, 1, 1.1, [0.85, 0.85, 0.88]);
    this.addBox(verts, idxs, x, 1.05, z, 1.3, 0.12, 1.3, [0.85, 0.15, 0.15]);
    const px = x + ppx * 0.9 * side;
    const pz = z + ppz * 0.9 * side;
    this.addCylinder(verts, idxs, px, 0, pz, 0.035, 2.4, 6, [0.55, 0.55, 0.58]);
    this.addBox(verts, idxs, px + ppx * 0.6 * side, 1.9, pz + ppz * 0.6 * side, 0.02, 0.6, 0.35, [1, 0.85, 0.15]);
  }

  // Braking distance board: red panel with a white stripe on a post just off
  // the track edge, angled toward the oncoming driver.
  private addBrakeBoard(verts: number[], idxs: number[], x: number, z: number, ppx: number, ppz: number) {
    this.addBox(verts, idxs, x, 0.6, z, 0.08, 1.2, 0.08, [0.6, 0.6, 0.62]);
    this.addBox(verts, idxs, x + ppx * 0.3, 1.15, z + ppz * 0.3, 0.06, 0.85, 0.6, [0.9, 0.12, 0.12]);
    this.addBox(verts, idxs, x + ppx * 0.33, 1.15, z + ppz * 0.33, 0.03, 0.3, 0.62, [0.95, 0.95, 0.95]);
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

  // ─── Tire smoke particles ───
  // Grey puffs emitted at the rear wheels when a car is sliding hard (high
  // slip). Pooled, billboarded toward the camera each frame (like rain) and
  // drawn with a tiny dedicated program so per-vertex alpha fades them out.
  private _smokeParticles: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; maxLife: number; size: number }[] = [];
  private _smokeVao!: WebGLVertexArrayObject;
  private _smokeBuf!: WebGLBuffer;
  private _smokeMax = 120;
  private _smokeInitialized = false;
  private smokeProg!: WebGLProgram;
  private smokeProjLoc!: WebGLUniformLocation;
  private smokeViewLoc!: WebGLUniformLocation;

  private initSmoke() {
    if (this._smokeInitialized) return;
    this._smokeInitialized = true;
    const gl = this.gl;
    const vs = `#version 300 es\nin vec3 aPos;\nin vec4 aColor;\nuniform mat4 uProj;\nuniform mat4 uView;\nout vec4 vColor;\nvoid main() { vColor = aColor; gl_Position = uProj * uView * vec4(aPos, 1.0); }`;
    const fs = `#version 300 es\nprecision highp float;\nin vec4 vColor;\nout vec4 FragColor;\nvoid main() { FragColor = vColor; }`;
    this.smokeProg = this.createProgram(vs, fs);
    this.smokeProjLoc = gl.getUniformLocation(this.smokeProg, 'uProj')!;
    this.smokeViewLoc = gl.getUniformLocation(this.smokeProg, 'uView')!;
    this._smokeVao = gl.createVertexArray()!;
    gl.bindVertexArray(this._smokeVao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, this._smokeMax * 6 * 7 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);
    this._smokeBuf = buf;
  }

  // Spawns grey puffs at the rear wheels of a car that is sliding (slide > 0.35).
  // Rear wheel world positions derived from the car's yaw (nose +X after the
  // yaw-π/2 model rotation → forward = (sin yaw, cos yaw), lateral = ±0.60).
  private emitSmoke(x: number, z: number, yaw: number, slide: number) {
    if (this._smokeParticles.length >= this._smokeMax) return;
    const intensity = Math.min((slide - 0.35) / 0.65, 1);
    if (intensity <= 0) return;
    const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
    for (const side of [-1, 1]) {
      const wx = x - 0.55 * sinY - side * 0.60 * cosY;
      const wz = z - 0.55 * cosY + side * 0.60 * sinY;
      const count = 1 + Math.floor(intensity * 2 + Math.random());
      for (let i = 0; i < count; i++) {
        if (this._smokeParticles.length >= this._smokeMax) return;
        this._smokeParticles.push({
          x: wx + (Math.random() - 0.5) * 0.15,
          y: 0.2 + Math.random() * 0.15,
          z: wz + (Math.random() - 0.5) * 0.15,
          vx: -sinY * (0.5 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.6,
          vy: 1.0 + Math.random() * 1.2,
          vz: -cosY * (0.5 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.6,
          life: 0,
          maxLife: 0.45 + Math.random() * 0.4,
          size: 0.15 + Math.random() * 0.1
        });
      }
    }
  }

  // Advances smoke once per frame (main pass only, so mirror doesn't double-age
  // the pool) and rebuilds camera-facing billboard quads into the dynamic buffer.
  private updateSmoke(dt: number) {
    const parts = this._smokeParticles;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.maxLife) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vy *= (1 - 0.4 * dt);
      p.vx *= (1 - 0.6 * dt); p.vz *= (1 - 0.6 * dt);
    }
  }

  private drawSmoke(proj: Float32Array, view: Float32Array) {
    const gl = this.gl;
    const parts = this._smokeParticles;
    if (parts.length === 0) return;
    this.initSmoke();
    // Camera axes: rows of the view matrix (world-space right / up).
    const rx = view[0], ry = view[4], rz = view[8];
    const ux = view[1], uy = view[5], uz = view[9];
    const data: number[] = [];
    for (const p of parts) {
      const t = p.life / p.maxLife;
      const s = p.size * (0.5 + t * 1.8);
      const alpha = Math.max(0, 0.5 * (1 - t));
      const gray = 0.5 + t * 0.15;
      const hx = rx * s, hy = ry * s, hz = rz * s;
      const wx = ux * s, wy = uy * s, wz = uz * s;
      const cx = p.x, cy = p.y, cz = p.z;
      data.push(cx - hx + wx, cy - hy + wy, cz - hz + wz, gray, gray, gray + 0.03, alpha);
      data.push(cx + hx + wx, cy + hy + wy, cz + hz + wz, gray, gray, gray + 0.03, alpha);
      data.push(cx + hx - wx, cy + hy - wy, cz + hz - wz, gray, gray, gray + 0.03, alpha);
      data.push(cx - hx + wx, cy - hy + wy, cz - hz + wz, gray, gray, gray + 0.03, alpha);
      data.push(cx + hx - wx, cy + hy - wy, cz + hz - wz, gray, gray, gray + 0.03, alpha);
      data.push(cx - hx - wx, cy - hy - wy, cz - hz - wz, gray, gray, gray + 0.03, alpha);
    }
    gl.useProgram(this.smokeProg);
    gl.uniformMatrix4fv(this.smokeProjLoc, false, proj);
    gl.uniformMatrix4fv(this.smokeViewLoc, false, view);
    gl.bindVertexArray(this._smokeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._smokeBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data));
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 7);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.bindVertexArray(null);
  }

  // Distant birds + hot-air balloons — animated sky objects that wheel over
  // the circuit. Birds are a dynamic per-frame buffer (flapping wings), the
  // balloons are one shared mesh drawn per balloon via model-matrix translate.
  private _birdsVao!: WebGLVertexArrayObject;
  private _birdsBuf!: WebGLBuffer;
  private _birds: { phase: number; speed: number; radius: number; alt: number; ang: number; dir: number; size: number; shade: number }[] = [];
  // Falling confetti — small camera-facing squares tumbling over the start/
  // finish line and grandstands (drawn per-frame like the birds, culled by
  // distance so far stands cost nothing).
  private _confettiVao!: WebGLVertexArrayObject;
  private _confettiBuf!: WebGLBuffer;
  private _confettiCount = 0;
  private _confetti: { x: number; y: number; z: number; vx: number; vy: number; vz: number; phase: number; spin: number; size: number; color: [number, number, number] }[] = [];
  private _crowdVao!: WebGLVertexArrayObject;
  private _crowdBuf!: WebGLBuffer;
  // Preallocated per-frame geometry for the animated crowd (never GC'd).
  // 6 boxes/person × 36 verts = 216 verts, each 11 floats.
  private _crowdData!: Float32Array;
  private _crowdPeople: CrowdPerson[] = [];
  // 0..1 crowd reaction level — spikes when a car roars past a grandstand and
  // decays over a few seconds. Amplifies bob/sway/wave in drawCrowd so the
  // crowd visibly cheers harder in sync with the audio reaction moment.
  private _crowdExcitement = 0;
  private _balloonVao!: WebGLVertexArrayObject;
  private _balloonVbo!: WebGLBuffer;
  private _balloonIbo!: WebGLBuffer;
  private _balloonCount = 0;
  private _balloons: { ang: number; radius: number; alt: number; phase: number; color: [number, number, number] }[] = [];
  private _trackCenterX = 0;
  private _trackCenterZ = 0;

  // Builds the animated sky-object geometry (bird flock params, balloon mesh)
  // once per circuit, centered on the track centroid so they orbit the race.
  private initSkyObjects() {
    const gl = this.gl;
    const pts = this._trackPoints;
    let cx = 0, cz = 0;
    if (pts.length) {
      for (const p of pts) { cx += p.x; cz += p.z; }
      cx /= pts.length; cz /= pts.length;
    }
    this._trackCenterX = cx;
    this._trackCenterZ = cz;

    // Birds — theme-flavoured flocks wheeling above the circuit. Miami gets
    // darting white seagulls over the bay; the mountain/alpine worlds get big
    // soaring eagles; the desert gets circling vultures; elsewhere small dark
    // passerines.
    this._birds = [];
    const isMiami = this.theme === 'miami';
    const isHighCountry = this.theme === 'mountain' || this.theme === 'alpine';
    const isDesert = this.theme === 'desert';
    const birdCount = isMiami ? 26 : isHighCountry ? 16 : isDesert ? 14 : 18;
    for (let i = 0; i < birdCount; i++) {
      const eagle = isHighCountry && i % 3 === 0;
      const vulture = isDesert && i % 2 === 0;
      this._birds.push({
        phase: Math.random() * Math.PI * 2,
        speed: eagle || vulture ? 0.04 + Math.random() * 0.05 : isMiami ? 0.09 + Math.random() * 0.08 : 0.05 + Math.random() * 0.09,
        radius: isMiami ? 110 + Math.random() * 90 : eagle || vulture ? 170 + Math.random() * 120 : 160 + Math.random() * 130,
        alt: isMiami ? 18 + Math.random() * 16 : eagle || vulture ? 55 + Math.random() * 30 : 34 + Math.random() * 30,
        ang: Math.random() * Math.PI * 2,
        dir: Math.random() < 0.5 ? 1 : -1,
        size: eagle ? 1.7 + Math.random() * 0.4 : vulture ? 1.3 + Math.random() * 0.3 : isMiami ? 0.7 + Math.random() * 0.25 : 0.9 + Math.random() * 0.3,
        shade: isMiami ? 0.85 + Math.random() * 0.08 : vulture ? 0.12 : eagle ? 0.1 : 0.08 + Math.random() * 0.05,
      });
    }

    // Hot-air balloons — a handful of colourful ones drifting nearby (more in
    // the festive Miami sky).
    this._balloons = [];
    const balloonColors: [number, number, number][] = [
      [0.9, 0.25, 0.2], [0.2, 0.55, 0.9], [0.95, 0.75, 0.15],
      [0.35, 0.8, 0.35], [0.85, 0.4, 0.7], [0.95, 0.5, 0.8], [0.4, 0.75, 0.95],
    ];
    for (let i = 0; i < (isMiami ? 7 : 4); i++) {
      this._balloons.push({
        ang: Math.random() * Math.PI * 2,
        radius: 190 + Math.random() * 120,
        alt: 26 + Math.random() * 14,
        phase: Math.random() * Math.PI * 2,
        color: balloonColors[i % balloonColors.length],
      });
    }

    // Balloon mesh — one white envelope sphere + a basket, tinted per balloon
    // via the color uniform (colorLoc multiplies the baked per-vertex color).
    const bverts: number[] = [];
    const bidxs: number[] = [];
    this.addSphere(bverts, bidxs, 0, 0, 0, 1, 10, [1, 1, 1]);
    this.addBox(bverts, bidxs, 0, -1.7, 0, 0.7, 0.55, 0.7, [0.45, 0.3, 0.18]);
    const bv = new Float32Array(bverts);
    const bi = new Uint16Array(bidxs);
    this._balloonCount = bi.length;
    this._balloonVao = gl.createVertexArray()!;
    gl.bindVertexArray(this._balloonVao);
    this._balloonVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._balloonVbo);
    gl.bufferData(gl.ARRAY_BUFFER, bv, gl.STATIC_DRAW);
    this._balloonIbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._balloonIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, bi, gl.STATIC_DRAW);
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

    // Birds — dynamic buffer, one triangle pair per bird × 11 floats each.
    // (bufferData sizing uses the bird count, so theme-flavoured flock sizes
    //  are all covered).
    this._birdsVao = gl.createVertexArray()!;
    gl.bindVertexArray(this._birdsVao);
    this._birdsBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._birdsBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this._birds.length * 6 * 11), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);

    // Animated crowd — one big dynamic buffer rebuilt every frame with bob,
    // arm-wave and leg-sway offsets. Each person = 6 boxes (legs, torso, 2
    // arms, head, hair) × 36 verts = 216 verts × 11 floats. Sized for up to
    // 120 people with room to spare (fence crowds ~30 + 8 grandstands × 8).
    const maxCrowdVerts = 140 * 216;
    this._crowdData = new Float32Array(maxCrowdVerts * 11);
    this._crowdVao = gl.createVertexArray()!;
    gl.bindVertexArray(this._crowdVao);
    this._crowdBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._crowdBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this._crowdData, gl.DYNAMIC_DRAW);
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

  // Builds the falling-confetti field: colourful squares that shower down over
  // the start/finish line and grandstands, then recycle back to the top. Drawn
  // as camera-facing billboards each frame (shared quad mesh, per-particle
  // transform), culled by distance so far stands cost nothing in the mirror.
  private initConfetti() {
    const gl = this.gl;
    const pts = this._trackPoints;
    const dense = this.theme === 'miami';   // Miami is a celebration
    const perStand = dense ? 26 : 12;
    const confettiColors: [number, number, number][] = [
      [0.95, 0.25, 0.3], [0.2, 0.7, 0.95], [0.98, 0.8, 0.1], [0.3, 0.85, 0.4],
      [0.95, 0.5, 0.85], [0.95, 0.6, 0.2], [0.55, 0.45, 0.95], [0.95, 0.95, 0.98],
    ];
    this._confetti = [];
    // Anchor clusters at the start/finish and each grandstand.
    const anchors: { x: number; z: number }[] = [{ x: pts[0].x, z: pts[0].z }];
    for (const f of [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
      const p = pts[Math.floor(f * pts.length)];
      anchors.push({ x: p.x, z: p.z });
    }
    for (const a of anchors) {
      for (let i = 0; i < perStand; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        this._confetti.push({
          x: a.x + (Math.random() - 0.5) * 24 + side * 10,
          y: 4 + Math.random() * 14,
          z: a.z + (Math.random() - 0.5) * 24,
          vx: (Math.random() - 0.5) * 0.6,
          vy: 0.8 + Math.random() * 0.9,
          vz: (Math.random() - 0.5) * 0.6,
          phase: Math.random() * Math.PI * 2,
          spin: 2 + Math.random() * 5,
          size: 0.09 + Math.random() * 0.09,
          color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
        });
      }
    }
    this._confettiCount = this._confetti.length * 6;

    // Shared quad mesh (one unit square, centred on origin) drawn per particle
    // via an instance-less dynamic buffer rebuilt each frame, like the birds.
    this._confettiVao = gl.createVertexArray()!;
    gl.bindVertexArray(this._confettiVao);
    this._confettiBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._confettiBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this._confettiCount * 11), gl.DYNAMIC_DRAW);
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

  // Animates + draws the confetti shower. view gives the camera axes for the
  // billboards; particles beyond ~110m are skipped so far clusters don't cost
  // anything (the mirror pass rebuilds the same set, so the cull matters).
  private drawConfetti(dt: number, view: Float32Array, eye: number[]) {
    const gl = this.gl;
    const t = this.elapsed;
    if (!this._confetti.length || !this._confettiVao) return;

    // Camera right/up in world space (columns of the view matrix, column-major).
    const rxx = view[0], rxy = view[4], rxz = view[8];
    const uxx = view[1], uxy = view[5], uxz = view[9];
    const data: number[] = [];
    for (const c of this._confetti) {
      // Fall + gentle sway + slight flutter.
      c.y -= c.vy * dt;
      c.x += c.vx * dt + Math.sin(t * 2 + c.phase) * 0.12 * dt;
      c.z += c.vz * dt + Math.cos(t * 1.7 + c.phase) * 0.1 * dt;
      c.phase += c.spin * dt;
      if (c.y < 0.3) c.y = 12 + Math.random() * 10;   // recycle to the top
      if (Math.hypot(c.x - eye[0], c.z - eye[2]) > 110) continue;

      const s = c.size;
      const ca = Math.cos(c.phase), sa = Math.sin(c.phase);
      // Rotate the billboard basis by the spin angle around the view axis.
      const ax = rxx * ca + uxx * sa, ay = rxy * ca + uxy * sa, az = rxz * ca + uxz * sa;
      const bx = -rxx * sa + uxx * ca, by = -rxy * sa + uxy * ca, bz = -rxz * sa + uxz * ca;
      const col = c.color;
      const base = data.length / 11;
      const p = (ox: number, oy: number, oz: number, nx: number, ny: number, nz: number) => {
        data.push(c.x + ax * ox + bx * oz, c.y + ay * ox + by * oz, c.z + az * ox + bz * oz, nx, ny, nz, col[0], col[1], col[2], 0, 0);
      };
      // Two triangles of a unit square in the billboard plane (size s).
      p(-s, 0, -s, 0, 1, 0); p(s, 0, -s, 0, 1, 0); p(-s, 0, s, 0, 1, 0);
      p(s, 0, -s, 0, 1, 0); p(s, 0, s, 0, 1, 0); p(-s, 0, s, 0, 1, 0);
    }
    if (!data.length) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._confettiBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data));
    gl.bindVertexArray(this._confettiVao);
    gl.uniform1i(this.hasTexLoc, 0);
    gl.uniform3f(this.colorLoc, 1, 1, 1);
    this.mat4Identity(this.modelMatrix);
    gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
    this.setNormalMatrix(this.modelMatrix);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 11);
    gl.bindVertexArray(null);
  }

  // Animated birds + balloons, drawn after the static scenery in the world pass
  // (so they also show up in the rear-view mirror). Runs with the main program
  // already bound and proj/view set; only per-object model matrices change.
  private drawSkyObjects(dt: number) {
    const gl = this.gl;
    const t = this.elapsed;
    const cx = this._trackCenterX, cz = this._trackCenterZ;

    // Birds: flocks wheel around the circuit with flapping wings.
    if (this._birds.length && this._birdsBuf && this._birdsVao) {
      const data: number[] = [];
      for (const b of this._birds) {
        b.ang += b.dir * b.speed * dt;
        const bx = cx + Math.cos(b.ang) * b.radius;
        const bz = cz + Math.sin(b.ang) * b.radius;
        const by = b.alt + Math.sin(t * 0.7 + b.phase) * 2.5;
        // Big eagles flap slower and deeper; small seagulls flutter fast.
        const flapFreq = b.size >= 1.5 ? 5.5 : 9;
        const flap = Math.sin(t * flapFreq + b.phase) * 0.22 * (b.size >= 1.5 ? 0.8 : 1);
        // Flight direction + perpendicular for wing spread (scaled by size)
        const dx = Math.cos(b.ang + Math.PI / 2) * b.dir;
        const dz = Math.sin(b.ang + Math.PI / 2) * b.dir;
        const px = -dz, pz = dx;
        const shade = b.shade;
        const bodyF = 0.16 * b.size;
        const wing = 0.9 * b.size;
        // Vertex layout matches the scenery VAO: pos(3) normal(3) color(3) uv(2)
        const mk = (x: number, y: number, z: number) => {
          data.push(x, y, z, 0, 1, 0, shade, shade, shade + 0.01, 0, 0);
        };
        // Left wing triangle (body → tip, wingtip dips opposite the flap)
        mk(bx - dx * bodyF, by + flap, bz - dz * bodyF);
        mk(bx, by, bz);
        mk(bx + px * wing, by - flap * 0.6, bz + pz * wing);
        // Right wing triangle
        mk(bx + dx * bodyF, by + flap, bz + dz * bodyF);
        mk(bx, by, bz);
        mk(bx - px * wing, by - flap * 0.6, bz - pz * wing);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this._birdsBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data));
      gl.bindVertexArray(this._birdsVao);
      gl.uniform1i(this.hasTexLoc, 0);
      gl.uniform3f(this.colorLoc, 1, 1, 1);
      this.mat4Identity(this.modelMatrix);
      gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
      this.setNormalMatrix(this.modelMatrix);
      gl.drawArrays(gl.TRIANGLES, 0, this._birds.length * 6);
      gl.bindVertexArray(null);
    }

    // Balloons: slow orbit + gentle vertical bob.
    if (this._balloons.length && this._balloonVao && this._balloonCount) {
      for (const bal of this._balloons) {
        bal.ang += 0.012 * dt;
        const bx = cx + Math.cos(bal.ang) * bal.radius;
        const bz = cz + Math.sin(bal.ang) * bal.radius;
        const by = bal.alt + Math.sin(t * 0.5 + bal.phase) * 1.8;
        this.mat4Translate(this.modelMatrix, [bx, by, bz]);
        gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
        this.setNormalMatrix(this.modelMatrix);
        gl.uniform1i(this.hasTexLoc, 0);
        gl.uniform3f(this.colorLoc, bal.color[0], bal.color[1], bal.color[2]);
        gl.bindVertexArray(this._balloonVao);
        gl.drawElements(gl.TRIANGLES, this._balloonCount, gl.UNSIGNED_SHORT, 0);
        gl.bindVertexArray(null);
      }
    }
  }

  /** Spikes the crowd animation into a cheering frenzy (used when a car
   *  roars past a grandstand). Level 0..1; decays back to 0 over ~4s. */
  exciteCrowd(level = 1) {
    this._crowdExcitement = Math.max(0, Math.min(1, Math.max(this._crowdExcitement, level)));
  }

  render(eyeX: number, eyeY: number, eyeZ: number, yaw: number, pitch: number, aspect: number,
    cars: (RacingCarAppearance & { x: number; y: number; z: number; yaw: number; r: number; g: number; b: number; speed?: number; accel?: number; spin?: number; slide?: number })[], dt: number,
    fovZoom: number = 1.0, shakeX: number = 0, shakeY: number = 0, isRaining: boolean = false, speedRatio: number = 0,
    playerSpeed: number = 0, playerAccel: number = 0, playerSpin: number = 0, playerSlide: number = 0, playerAppearance?: RacingCarAppearance) {
    const gl = this.gl;
    this.elapsed += dt;
    // Crowd reaction decays smoothly back to calm (~4s from full excitement).
    if (this._crowdExcitement > 0) {
      this._crowdExcitement = Math.max(0, this._crowdExcitement - dt * 0.25);
    }

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
    // Push occluders away from the light so the shader's small depth bias is
    // enough — kills shadow acne without peter-panning (detached shadows).
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2.0, 2.0);
    gl.bindVertexArray(this.trackVao);
    gl.drawElements(gl.TRIANGLES, this.trackCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(this.barrierVao);
    gl.drawElements(gl.TRIANGLES, this.barrierCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(this.finishVao);
    gl.drawElements(gl.TRIANGLES, this.finishCount, gl.UNSIGNED_SHORT, 0);
    // Scenery uses 32-bit indices (dense Miami skyline can exceed 16-bit).
    gl.bindVertexArray(this.sceneryVao);
    gl.drawElements(gl.TRIANGLES, this.sceneryCount, gl.UNSIGNED_INT, 0);
    // Cars cast shadows on the track — the single most visible shadow in the game.
    for (const car of cars) {
      this.renderCarShadow(car.x, car.y, car.z, car.yaw, car.speed ?? 0, car.spin, car.slide ?? 0);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);

    // ─── Main Pass ───
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.4, 0.45, 0.5, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.drawWorldScene(this.projMatrix, this.viewMatrix, eye as number[], cars, dt, isRaining, true);

    // ─── Rear-view mirror (a second camera looking back, blitted on top) ───
    this.renderMirror(eyeX, eyeY, eyeZ, yaw, cars, dt, isRaining, playerSpeed, playerAccel, playerSpin, playerSlide, playerAppearance);
  }

  // Appends one box (6 faces × 2 tris = 36 verts, 11 floats each) into the
  // preallocated dynamic crowd buffer, returning the next write index.
  private pushBoxVerts(d: Float32Array, wi: number, cx: number, cy: number, cz: number,
    l: number, h: number, w: number, r: number, g: number, b: number): number {
    const hx = l / 2, hy = h / 2, hz = w / 2;
    const v = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
      d[wi++] = cx + x; d[wi++] = cy + y; d[wi++] = cz + z;
      d[wi++] = nx; d[wi++] = ny; d[wi++] = nz;
      d[wi++] = r; d[wi++] = g; d[wi++] = b;
      d[wi++] = 0; d[wi++] = 0;
    };
    // +Z
    v(-hx, -hy, hz, 0, 0, 1); v(hx, -hy, hz, 0, 0, 1); v(hx, hy, hz, 0, 0, 1);
    v(-hx, -hy, hz, 0, 0, 1); v(hx, hy, hz, 0, 0, 1); v(-hx, hy, hz, 0, 0, 1);
    // -Z
    v(hx, -hy, -hz, 0, 0, -1); v(-hx, -hy, -hz, 0, 0, -1); v(-hx, hy, -hz, 0, 0, -1);
    v(hx, -hy, -hz, 0, 0, -1); v(-hx, hy, -hz, 0, 0, -1); v(hx, hy, -hz, 0, 0, -1);
    // +X
    v(hx, -hy, hz, 1, 0, 0); v(hx, -hy, -hz, 1, 0, 0); v(hx, hy, -hz, 1, 0, 0);
    v(hx, -hy, hz, 1, 0, 0); v(hx, hy, -hz, 1, 0, 0); v(hx, hy, hz, 1, 0, 0);
    // -X
    v(-hx, -hy, -hz, -1, 0, 0); v(-hx, -hy, hz, -1, 0, 0); v(-hx, hy, hz, -1, 0, 0);
    v(-hx, -hy, -hz, -1, 0, 0); v(-hx, hy, hz, -1, 0, 0); v(-hx, hy, -hz, -1, 0, 0);
    // +Y
    v(-hx, hy, hz, 0, 1, 0); v(hx, hy, hz, 0, 1, 0); v(hx, hy, -hz, 0, 1, 0);
    v(-hx, hy, hz, 0, 1, 0); v(hx, hy, -hz, 0, 1, 0); v(-hx, hy, -hz, 0, 1, 0);
    // -Y
    v(-hx, -hy, -hz, 0, -1, 0); v(hx, -hy, -hz, 0, -1, 0); v(hx, -hy, hz, 0, -1, 0);
    v(-hx, -hy, -hz, 0, -1, 0); v(hx, -hy, hz, 0, -1, 0); v(-hx, -hy, hz, 0, -1, 0);
    return wi;
  }

  // Animated crowd — rebuilt every frame so spectators bob, sway and wave
  // their arms (poses vary per person). Drawn after static scenery with the
  // main program already bound and proj/view set (mirror pass included).
  // Spectators farther than CROWD_CULL_DIST from the camera are skipped, so
  // the per-frame rebuild cost only covers the crowd you can actually see
  // (this halves the cost again in the rear-view mirror pass, which reuses it).
  private static CROWD_CULL_DIST = 80;
  private drawCrowd(eye: number[]) {
    const gl = this.gl;
    if (!this._crowdVao || !this._crowdBuf || !this._crowdData || !this._crowdPeople.length) return;
    gl.useProgram(this.prog);
    const t = this.elapsed;
    const data = this._crowdData;
    const cull2 = RacingRenderer.CROWD_CULL_DIST * RacingRenderer.CROWD_CULL_DIST;
    const ex = eye[0];
    const ez = eye[2];
    // Reaction frenzy multiplier — amplifies every animation channel when the
    // crowd has been excited (car roaring past a grandstand), decaying over
    // a few seconds so the "cheer harder" effect ramps down naturally.
    const frenzy = 1 + this._crowdExcitement * 1.6;
    const waveSpeed = 4.1 + this._crowdExcitement * 3.2;
    let w = 0;
    for (const p of this._crowdPeople) {
      const dx = p.x - ex;
      const dz = p.z - ez;
      if (dx * dx + dz * dz > cull2) continue;
      const s = p.scale;
      const bob = Math.sin(t * 2.4 + p.phase) * 0.04 * frenzy * s;
      const legSway = Math.sin(t * 2.4 + p.phase) * 0.03 * frenzy * s;
      const y0 = p.y + bob;
      const ty = y0 + 0.72 * s;
      const [sr, sg, sb] = p.shirt;
      const [kr, kg, kb] = p.skin;
      const [hr, hg, hb] = p.hair;
      const [pr, pg, pb] = p.pants;
      // Legs (pants)
      w = this.pushBoxVerts(data, w, p.x + legSway * 0.4, y0 + 0.24 * s, p.z, 0.2 * s, 0.48 * s, 0.24 * s, pr, pg, pb);
      // Torso (shirt)
      w = this.pushBoxVerts(data, w, p.x, ty, p.z, 0.26 * s, 0.48 * s, 0.3 * s, sr, sg, sb);
      // Head (skin)
      w = this.pushBoxVerts(data, w, p.x, ty + 0.34 * s, p.z, 0.17 * s, 0.17 * s, 0.17 * s, kr, kg, kb);
      // Hair (small cap on the head)
      w = this.pushBoxVerts(data, w, p.x, ty + 0.45 * s, p.z, 0.19 * s, 0.06 * s, 0.19 * s, hr, hg, hb);
      // Arms
      const armLen = 0.4 * s;
      const shoulderY = ty + 0.18 * s;
      const sway = Math.sin(t * 2.9 + p.phase * 1.3) * 0.05 * frenzy * s;
      const wave = Math.sin(t * waveSpeed + p.phase) * 0.09 * frenzy * s;
      if (p.pose === 0) {
        // Arms hanging down, gentle sway
        w = this.pushBoxVerts(data, w, p.x - 0.21 * s + sway, shoulderY - armLen / 2, p.z, 0.07 * s, armLen, 0.09 * s, sr, sg, sb);
        w = this.pushBoxVerts(data, w, p.x + 0.21 * s - sway, shoulderY - armLen / 2, p.z, 0.07 * s, armLen, 0.09 * s, sr, sg, sb);
      } else if (p.pose === 1) {
        // Both arms up, waving
        w = this.pushBoxVerts(data, w, p.x - 0.2 * s, shoulderY + armLen / 2 + wave, p.z, 0.07 * s, armLen, 0.09 * s, sr, sg, sb);
        w = this.pushBoxVerts(data, w, p.x + 0.2 * s, shoulderY + armLen / 2 - wave, p.z, 0.07 * s, armLen, 0.09 * s, sr, sg, sb);
      } else {
        // One arm up, one down
        w = this.pushBoxVerts(data, w, p.x - 0.21 * s + sway, shoulderY - armLen / 2, p.z, 0.07 * s, armLen, 0.09 * s, sr, sg, sb);
        w = this.pushBoxVerts(data, w, p.x + 0.2 * s, shoulderY + armLen / 2 + wave, p.z, 0.07 * s, armLen, 0.09 * s, sr, sg, sb);
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this._crowdBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    gl.bindVertexArray(this._crowdVao);
    gl.uniform1i(this.hasTexLoc, 0);
    gl.uniform3f(this.colorLoc, 1, 1, 1);
    this.mat4Identity(this.modelMatrix);
    gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
    this.setNormalMatrix(this.modelMatrix);
    gl.drawArrays(gl.TRIANGLES, 0, w / 11);
    gl.bindVertexArray(null);
  }

  // Shared world renderer used by both the main pass and the rear-view mirror.
  // Draws sky + track + finish + barrier + scenery + cars (+ optional rain).
  // `drawRain` is false for the mirror so rain particles aren't drawn twice.
  private drawWorldScene(proj: Float32Array, view: Float32Array, eye: number[],
    cars: (RacingCarAppearance & { x: number; y: number; z: number; yaw: number; r: number; g: number; b: number; speed?: number; accel?: number; spin?: number; slide?: number })[],
    dt: number, isRaining: boolean, drawRain: boolean) {
    const gl = this.gl;

    // Sky — fill the background with depth testing OFF and no depth writes so the
    // sky can never z-fight with distant geometry (was flashing white/blue at horizon).
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.useProgram(this.skyProg);
    gl.uniformMatrix4fv(this.skyProjLoc, false, proj);
    gl.uniformMatrix4fv(this.skyViewLoc, false, view);
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
    gl.uniformMatrix4fv(this.projLoc, false, proj);
    gl.uniformMatrix4fv(this.viewLoc, false, view);
    gl.uniform3fv(this.lightDirLoc, this.sunDir);
    // Per-theme sun color drives diffuse + specular (warm Miami, cool city).
    if (isRaining) {
      gl.uniform3fv(this.sunColorLoc, new Float32Array([this.sunColor[0] * 0.5, this.sunColor[1] * 0.5, this.sunColor[2] * 0.55]));
    } else {
      gl.uniform3fv(this.sunColorLoc, this.sunColor);
    }
    // Bind the shadow map and its projection so the world gets real shadows.
    gl.uniformMatrix4fv(this.lightMatrixLoc, false, this.lightSpace);
    gl.uniform1f(this.shadowTexelLoc, 1.0 / this.shadowSize);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.uniform1i(this.shadowMapLoc, 1);
    gl.activeTexture(gl.TEXTURE0);
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

    // Scenery (trees, grandstands, light poles) — 32-bit indices for dense
    // themes (Miami skyline + clouds can exceed 65 535).
    gl.bindVertexArray(this.sceneryVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);
    gl.uniform1i(this.hasTexLoc, 1);
    this.mat4Identity(this.modelMatrix);
    gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
    gl.uniform3f(this.colorLoc, 1, 1, 1);
    this.setNormalMatrix(this.modelMatrix);
    gl.drawElements(gl.TRIANGLES, this.sceneryCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);

    // Distant birds + hot-air balloons wheeling over the circuit
    this.drawSkyObjects(dt);

    // Confetti showering over the start/finish + grandstands
    this.drawConfetti(dt, view, eye);

    // Cars — pass the integrated spin so every pass draws the identical wheel
    // angle (the mirror's drawWorldScene call renders the same cars again).
    for (const car of cars) {
      this.renderCar(car.x, car.y, car.z, car.yaw, car.r, car.g, car.b, car.speed ?? 0, car.accel ?? 0, car.spin, car.slide ?? 0, car);
      // Tire smoke only in the main pass (mirror skips so the pool ages once).
      if (drawRain && (car.slide ?? 0) > 0.35) {
        this.emitSmoke(car.x, car.z, car.yaw, car.slide ?? 0);
      }
    }
    // Advance + draw smoke puffs (camera-facing billboards) once per frame.
    if (drawRain) {
      this.updateSmoke(dt);
      this.drawSmoke(proj, view);
    }

    // Animated crowd figures (drawn after scenery so they pop over it; before
    // the HUD-adjacent pass, and included in the rear-view mirror too).
    // Culled to the ~80m radius around the camera so distant spectators cost
    // nothing to rebuild (matters even more in the mirror pass).
    this.drawCrowd(eye);

    // ─── Rain Particles (if enabled and requested) ───
    if (drawRain && isRaining) {
      this.initRainParticles();
    }
    if (drawRain && this._rainCount > 0) {
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

  // Renders the world from a rear-facing camera into the mirror FBO, then
  // blits that texture onto a quad at the top-center of the screen.
  private renderMirror(eyeX: number, eyeY: number, eyeZ: number, yaw: number,
    cars: (RacingCarAppearance & { x: number; y: number; z: number; yaw: number; r: number; g: number; b: number; speed?: number; accel?: number; spin?: number; slide?: number })[],
    dt: number, isRaining: boolean, playerSpeed: number = 0, playerAccel: number = 0, playerSpin: number = 0, playerSlide: number = 0, playerAppearance?: RacingCarAppearance) {
    const gl = this.gl;

    // Rear camera: just above the driver's eye, looking straight back with a
    // slight downward tilt so the road and trailing cars fill the mirror.
    const mEye = [eyeX, eyeY + 0.22, eyeZ];
    const mYaw = yaw + Math.PI;
    const mPitch = 0.06;
    const cosY = Math.cos(mYaw), sinY = Math.sin(mYaw);
    const cosP = Math.cos(mPitch), sinP = Math.sin(mPitch);
    const lookX = mEye[0] + sinY * cosP;
    const lookY = mEye[1] - sinP;
    const lookZ = mEye[2] + cosY * cosP;
    this.mat4Perspective(this.mirrorProj, 1.35, this.mirrorW / this.mirrorH, 0.5, 600);
    this.mat4LookAt(this.mirrorView, mEye as number[], [lookX, lookY, lookZ], [0, 1, 0]);

    // Render the world into the mirror texture.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.mirrorFBO);
    gl.viewport(0, 0, this.mirrorW, this.mirrorH);
    gl.clearColor(0.4, 0.45, 0.5, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.drawWorldScene(this.mirrorProj, this.mirrorView, mEye, cars, dt, isRaining, false);
    // The player's own car isn't in `cars` (first-person camera sits inside it),
    // but a real F1 mirror shows your own rear wing — draw it in the mirror pass
    // with the SAME integrated spin the main pass would use, so the wheels stay
    // in sync instead of re-deriving an angle from a positional formula. Uses
    // the equipped skin color + appearance (was hardcoded team red before).
    const pa = playerAppearance ?? {};
    this.renderCar(eyeX, 0.1, eyeZ, yaw,
      pa.skin?.[0] ?? 0.85, pa.skin?.[1] ?? 0.06, pa.skin?.[2] ?? 0.06,
      playerSpeed, playerAccel, playerSpin, playerSlide, pa);
    // Own-car tire smoke: puffs at the rear wheels show in the mirror when you
    // are sliding hard. Emitted (no dt update — the main pass ages the pool).
    if (playerSlide > 0.35) {
      this.emitSmoke(eyeX, eyeZ, yaw, playerSlide);
      this.drawSmoke(this.mirrorProj, this.mirrorView);
    }

    // Blit the mirror texture onto the top-center of the screen.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.mirrorProg);
    gl.uniform1i(this.mirrorTexLoc, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.mirrorTex);
    gl.bindVertexArray(this.mirrorVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }

  renderCar(x: number, y: number, z: number, yaw: number, r: number, g: number, b: number, speed: number = 0, accel: number = 0, spin?: number, slide: number = 0, appearance?: RacingCarAppearance) {
    const gl = this.gl;
    const app = appearance ?? {};
    gl.useProgram(this.prog);
    // The detailed car body is built from double-sided quads with computed
    // normals, so draw it with back-face culling OFF to avoid any winding
    // mismatch hiding faces. (Re-enabled at the end.)
    gl.disable(gl.CULL_FACE);
    // Paint finish specular (from the skin) + rim tint defaults. The rim tint
    // is strength 0 here so the body/decal/accent draws below stay unpainted.
    gl.uniform1f(this.metallicLoc, app.metallic ?? 0.45);
    gl.uniform1f(this.rimStrengthLoc, 0);
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

    // Decal livery (engine-cover stripes + nose plate) — per-car color from
    // the decal style. Same body transform, drawn right over the paint.
    if (app.decalStyle && DECAL_COLORS[app.decalStyle]) {
      const dc = DECAL_COLORS[app.decalStyle];
      gl.uniform3f(this.colorLoc, dc[0], dc[1], dc[2]);
      gl.bindVertexArray(this.decalVao);
      gl.drawElements(gl.TRIANGLES, this.decalCount, gl.UNSIGNED_SHORT, 0);
    }
    // Livery accent (sidepod stripes + exhaust tips) — per-car accent color.
    const acc = app.accent ?? [0.16, 0.16, 0.2];
    gl.uniform3f(this.colorLoc, acc[0], acc[1], acc[2]);
    gl.bindVertexArray(this.accentVao);
    gl.drawElements(gl.TRIANGLES, this.accentCount, gl.UNSIGNED_SHORT, 0);

    // Neon underglow — additive pool of light beneath the car, drawn while the
    // body transform is still bound (before the wheels overwrite the matrix).
    if (app.glow) {
      const g = app.glow;
      const pulse = 0.75 + 0.25 * Math.sin(this.elapsed * 3 + z * 0.6);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform3f(this.colorLoc, g[0] * pulse, g[1] * pulse, g[2] * pulse);
      gl.bindVertexArray(this.glowVao);
      gl.drawElements(gl.TRIANGLES, this.glowCount, gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(null);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

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
    ];    // Wheel-speed heat: fades the brake glow in as |speed| climbs. Full glow
    // around 30 u/s (max ~55), no glow when parked. A subtle sine flicker
    // (faster with speed) keeps the disc alive, and hard braking (accel < -0.3,
    // i.e. the brake pedal actually applied) adds a brief hotter flash on top.
    const heatBase = Math.min(Math.abs(speed) / 30, 1) * 0.85;
    const flicker = 0.9 + 0.1 * Math.sin(this.elapsed * (7 + Math.abs(speed) * 0.3));
    const brakeFlash = accel < -0.3 ? Math.min(1, -accel) * 0.55 : 0;
    const heatGlow = Math.min(1.35, heatBase * flicker + brakeFlash);
    // The glow is scoped to the brake mesh only: the rim face and black tire
    // band are drawn with uHeatGlow = 0 so they stay dark; the uniform is
    // enabled just before the brake draw below and cleared again after.
    gl.uniform1f(this.heatGlowLoc, 0);
    for (let wi = 0; wi < wheelPositions.length; wi++) {
      const wp = wheelPositions[wi];
      // Rear wheels (wi >= 2) use the wider, slightly larger rear wheel mesh.
      const rear = wi >= 2;
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
      // Spin tracks the car's real speed: angular velocity = speed / wheel radius
      // (radius 0.17 → ~5.9 rad/s per unit of speed), clamped so the tread doesn't
      // strobe, and 0 when the car is parked. Reverse shows the tires rolling back.
      // Integrated spin angle (radians) passed from the game loop, so the wheels
      // roll smoothly through speed changes. Falls back to the old positional
      // formula only if a caller hasn't supplied one.
      // Slip scrubs the wheels: when the car slides (slide 0..1) the tires lose
      // forward traction, so the visual spin drops toward the road speed minus
      // the slip — a drifting wheel visibly slows/stalls instead of over-rolling.
      const slipFactor = Math.max(0, 1 - Math.min(slide, 1) * 0.75);
      const wheelSpin = spin !== undefined
        ? spin * slipFactor
        : this.elapsed * Math.min(Math.abs(speed) / 0.17, 40) * (speed < 0 ? 1 : -1) * slipFactor;
      this.mat4RotateZ(this.modelMatrix, wheelSpin);
      this.mat4RotateX(this.modelMatrix, Math.PI / 2);
      gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
      this.setNormalMatrix(this.modelMatrix);
      // Branded rim face — drawn first (under the tread) with the BHOSTED
      // texture mapped via planar UVs. Same transform as the wheel so the
      // lettering spins with it.
      // Rim tint per style — colors the branded ring + rim barrel; strength is
      // cleared again before the tire so the black rubber stays black.
      const rimTint = app.rimStyle && RIM_TINTS[app.rimStyle] ? RIM_TINTS[app.rimStyle] : [0.72, 0.72, 0.75];
      gl.uniform3f(this.rimTintLoc, rimTint[0], rimTint[1], rimTint[2]);
      gl.uniform1f(this.rimStrengthLoc, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tireBrandTex);
      gl.uniform1i(this.hasTexLoc, 1);
      gl.uniform3f(this.colorLoc, 1, 1, 1);
      gl.bindVertexArray(rear ? this.rearRimFaceVao : this.rimFaceVao);
      gl.drawElements(gl.TRIANGLES, rear ? this.rearRimFaceCount : this.rimFaceCount, gl.UNSIGNED_SHORT, 0);
      // Rim barrel (metal) — tinted per rim style.
      gl.bindVertexArray(rear ? this.rearWheelRimVao : this.wheelRimVao);
      gl.drawElements(gl.TRIANGLES, rear ? this.rearWheelRimCount : this.wheelRimCount, gl.UNSIGNED_SHORT, 0);
      gl.uniform1f(this.rimStrengthLoc, 0);
      // Tire (untextured) drawn over the rim face — stays black, never tinted.
      gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);
      gl.uniform1i(this.hasTexLoc, 0);
      gl.uniform3f(this.colorLoc, 0.05, 0.05, 0.05);
      gl.bindVertexArray(rear ? this.rearWheelVao : this.wheelVao);
      gl.drawElements(gl.TRIANGLES, rear ? this.rearWheelCount : this.wheelCount, gl.UNSIGNED_SHORT, 0);
      // Brake assembly — same placement/roll, but the heat glow uniform is
      // enabled ONLY here so the glowing rotor shows inside the tire while
      // the black rubber band stays dark.
      gl.uniform1f(this.heatGlowLoc, heatGlow);
      gl.bindVertexArray(rear ? this.rearBrakeVao : this.brakeVao);
      gl.drawElements(gl.TRIANGLES, rear ? this.rearBrakeCount : this.brakeCount, gl.UNSIGNED_SHORT, 0);
      gl.uniform1f(this.heatGlowLoc, 0);
    }
    gl.uniform1f(this.heatGlowLoc, 0);
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
  }

  // Same transforms as renderCar, but into the shadow depth map so cars cast
  // shadows on the track and scenery. Cull state is left untouched (the shadow
  // pass runs with culling disabled, matching the double-sided geometry).
  private renderCarShadow(x: number, y: number, z: number, yaw: number, speed: number = 0, spin?: number, slide: number = 0) {
    const gl = this.gl;
    gl.useProgram(this.shadowProg);
    gl.bindVertexArray(this.carVao);
    this.mat4Identity(this.modelMatrix);
    this.mat4Translate(this.modelMatrix, [x, y + 0.15, z]);
    this.mat4RotateY(this.modelMatrix, yaw - Math.PI / 2);
    this.mat4Scale(this.modelMatrix, [0.8, 0.8, 0.8]);
    gl.uniformMatrix4fv(this.shadowModelLoc, false, this.modelMatrix);
    gl.drawElements(gl.TRIANGLES, this.carCount, gl.UNSIGNED_SHORT, 0);

    const wheelPositions = [
      [0.62, 0, -0.60],
      [0.62, 0, 0.60],
      [-0.55, 0, -0.60],
      [-0.55, 0, 0.60]
    ];
    for (let wi = 0; wi < wheelPositions.length; wi++) {
      const wp = wheelPositions[wi];
      const rear = wi >= 2;
      gl.bindVertexArray(rear ? this.rearWheelVao : this.wheelVao);
      this.mat4Identity(this.modelMatrix);
      this.mat4Translate(this.modelMatrix, [x, y + 0.17, z]);
      this.mat4RotateY(this.modelMatrix, yaw - Math.PI / 2);
      this.mat4Translate(this.modelMatrix, wp);
      const slipFactor = Math.max(0, 1 - Math.min(slide, 1) * 0.75);
      const wheelSpin = spin !== undefined
        ? spin * slipFactor
        : this.elapsed * Math.min(Math.abs(speed) / 0.17, 40) * (speed < 0 ? 1 : -1) * slipFactor;
      this.mat4RotateZ(this.modelMatrix, wheelSpin);
      this.mat4RotateX(this.modelMatrix, Math.PI / 2);
      gl.uniformMatrix4fv(this.shadowModelLoc, false, this.modelMatrix);
      gl.drawElements(gl.TRIANGLES, rear ? this.rearWheelCount : this.wheelCount, gl.UNSIGNED_SHORT, 0);
      // Rim barrel too, so the wheel shadow keeps its full silhouette.
      gl.bindVertexArray(rear ? this.rearWheelRimVao : this.wheelRimVao);
      gl.drawElements(gl.TRIANGLES, rear ? this.rearWheelRimCount : this.wheelRimCount, gl.UNSIGNED_SHORT, 0);
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
