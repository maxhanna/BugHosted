export interface CityMesh {
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  ibo: WebGLBuffer;
  indexCount: number;
  indexType?: number;
  texture?: WebGLTexture | null;
  bounds?: { w: number; h: number; d: number };
}

export interface CityChunk {
  mesh: CityMesh;
  cx: number;
  cz: number;
  lamps: { x: number; z: number }[];
}

const CHUNK_SIZE = 80;
const GRID_PITCH = 40;
const BLOCK_SIZE = 30;
const BIOME_RADIUS_CITY = 28;
const BIOME_RADIUS_MOUNTAIN = 35;
const BIOME_RADIUS_SUBURB = 45;
const BIOME_RADIUS_BEACH = 55;
function getBiome(cx: number, cz: number): string {
  const d = Math.sqrt(cx * cx + cz * cz);
  if (d <= BIOME_RADIUS_CITY) return 'city';
  if (d <= BIOME_RADIUS_MOUNTAIN) return 'mountain';
  if (d <= BIOME_RADIUS_SUBURB) return 'suburb';
  if (d <= BIOME_RADIUS_BEACH) return 'beach';
  return 'ocean';
}

export interface RoadNode { x: number; z: number; }
export interface RoadEdge { from: number; to: number; }

// --- Minimal Matrix Math Utilities ---
const mat4 = {
  create: () => new Float32Array(16),
  identity: (m: Float32Array) => {
    m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 0;
    m[4] = 0; m[5] = 1; m[6] = 0; m[7] = 0;
    m[8] = 0; m[9] = 0; m[10] = 1; m[11] = 0;
    m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;
    return m;
  },
  perspective: (out: Float32Array, fovy: number, aspect: number, near: number, far: number) => {
    const f = 1.0 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
    return out;
  },
  ortho: (out: Float32Array, l: number, r: number, b: number, t: number, n: number, f: number) => {
    const lr = 1 / (l - r);
    const bt = 1 / (b - t);
    const nf = 1 / (n - f);
    out[0] = -2 * lr; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = -2 * bt; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 2 * nf; out[11] = 0;
    out[12] = (l + r) * lr; out[13] = (t + b) * bt; out[14] = (n + f) * nf; out[15] = 1;
    return out;
  },
  lookAt: (out: Float32Array, eye: number[], center: number[], up: number[]) => {
    const [ex, ey, ez] = eye;
    let zx = ex - center[0], zy = ey - center[1], zz = ez - center[2];
    let len = 1 / Math.hypot(zx, zy, zz);
    zx *= len; zy *= len; zz *= len;
    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz);
    if (!len) { xx = 0; xy = 0; xz = 0; } else { len = 1 / len; xx *= len; xy *= len; xz *= len; }
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * ex + xy * ey + xz * ez);
    out[13] = -(yx * ex + yy * ey + yz * ez);
    out[14] = -(zx * ex + zy * ey + zz * ez);
    out[15] = 1;
    return out;
  },
  multiply: (out: Float32Array, a: Float32Array, b: Float32Array) => {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return out;
  },
  translate: (out: Float32Array, a: Float32Array, v: number[]) => {
    const x = v[0], y = v[1], z = v[2];
    if (a === out) {
      out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
      out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
      out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
      out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    } else {
      for (let i = 0; i < 12; i++) out[i] = a[i];
      out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
      out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
      out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
      out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    }
    return out;
  },
  rotateY: (out: Float32Array, a: Float32Array, rad: number) => {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    out[0] = a00 * c - a20 * s;
    out[1] = a01 * c - a21 * s;
    out[2] = a02 * c - a22 * s;
    out[3] = a03 * c - a23 * s;
    out[8] = a00 * s + a20 * c;
    out[9] = a01 * s + a21 * c;
    out[10] = a02 * s + a22 * c;
    out[11] = a03 * s + a23 * c;
    if (a !== out) {
      out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7];
      out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    return out;
  },
  rotateX: (out: Float32Array, a: Float32Array, rad: number) => {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    out[4] = a10 * c + a20 * s;
    out[5] = a11 * c + a21 * s;
    out[6] = a12 * c + a22 * s;
    out[7] = a13 * c + a23 * s;
    out[8] = a20 * c - a10 * s;
    out[9] = a21 * c - a11 * s;
    out[10] = a22 * c - a12 * s;
    out[11] = a23 * c - a13 * s;
    if (a !== out) {
      out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3];
      out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    return out;
  },
  scale: (out: Float32Array, a: Float32Array, v: number[]) => {
    const x = v[0], y = v[1], z = v[2];
    out[0] = a[0] * x; out[1] = a[1] * x; out[2] = a[2] * x; out[3] = a[3] * x;
    out[4] = a[4] * y; out[5] = a[5] * y; out[6] = a[6] * y; out[7] = a[7] * y;
    out[8] = a[8] * z; out[9] = a[9] * z; out[10] = a[10] * z; out[11] = a[11] * z;
    out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    return out;
  },
  targetTo: (out: Float32Array, eye: number[], target: number[], up: number[]) => {
    const [ex, ey, ez] = eye;
    let zx = target[0] - ex, zy = target[1] - ey, zz = target[2] - ez;
    let len = 1 / Math.hypot(zx, zy, zz);
    zx *= len; zy *= len; zz *= len;
    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz);
    if (!len) { xx = 0; xy = 0; xz = 0; } else { len = 1 / len; xx *= len; xy *= len; xz *= len; }
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * ex + xy * ey + xz * ez);
    out[13] = -(yx * ex + yy * ey + yz * ez);
    out[14] = -(zx * ex + zy * ey + zz * ez);
    out[15] = 1;
    return out;
  }
};

const CACHE_BUST = 'v1';
function bust(url: string): string { return url + '?_=' + CACHE_BUST; }

export class GrandTheftRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private projLoc: WebGLUniformLocation;
  private viewLoc: WebGLUniformLocation;
  private modelLoc: WebGLUniformLocation;
  private colorLoc: WebGLUniformLocation;
  private normalMatrixLoc: WebGLUniformLocation | null = null;
  private lightDirLoc: WebGLUniformLocation | null = null;
  private viewPosLoc: WebGLUniformLocation | null = null;
  private textureLoc: WebGLUniformLocation | null = null;
  private useTextureLoc: WebGLUniformLocation | null = null;

  private lightColorLoc: WebGLUniformLocation | null = null;
  private ambientColorLoc: WebGLUniformLocation | null = null;
  private fogColorLoc: WebGLUniformLocation | null = null;
  private lightSpaceLoc: WebGLUniformLocation | null = null;
  private shadowMapLoc: WebGLUniformLocation | null = null;

  // Point Lights
  private numPointLightsLoc: WebGLUniformLocation | null = null;
  private pointLightPosLoc: WebGLUniformLocation | null = null;

  // Skybox
  private skyProgram!: WebGLProgram;
  private skyVao!: WebGLVertexArrayObject;
  private skyProjLoc!: WebGLUniformLocation;
  private skyViewLoc!: WebGLUniformLocation;
  private skySunDirLoc!: WebGLUniformLocation;
  private skyMoonDirLoc!: WebGLUniformLocation;
  private skyDayBlendLoc!: WebGLUniformLocation;
  private skyTimeLoc!: WebGLUniformLocation;

  viewMatrix = mat4.create();
  projMatrix = mat4.create();
  private modelMatrix = mat4.create();
  private chunkCache = new Map<string, CityChunk>();
  private meshCache = new Map<string, CityMesh>();

  public playerMesh: CityMesh | CityMesh[] | null = null;
  public lampMesh: CityMesh | CityMesh[] | null = null;
  public npcMesh: CityMesh | CityMesh[] | null = null; 
  public copMesh: CityMesh | CityMesh[] | null = null;
  public carMeshes: CityMesh[][] = []; // Array to hold multiple loaded car models
  public motorcycleMeshes: CityMesh[][] = []; // Array to hold multiple loaded motorcycle models
  public policeCarMesh: CityMesh[] | null = null; // Dedicated mesh for police cars
  public currentModelUrl: string | null = null;

  private timeOfDay = 0.3;
  private lastFrameTime = 0;
  private sunDir = [0, 1, 0];
  private moonDir = [0, -1, 0];
  private dayBlend = 1.0;
  private lightColor = [1, 1, 1];
  private ambientColor = [0.2, 0.2, 0.3];
  private skyColor = [0.5, 0.6, 0.7];
  private dayBlendLoc: WebGLUniformLocation | null = null;

  private shadowMapSize = 2048;
  private shadowFBO!: WebGLFramebuffer;
  private shadowTexture!: WebGLTexture;
  private depthProgram!: WebGLProgram;
  private depthLightSpaceLoc!: WebGLUniformLocation;
  private depthModelLoc!: WebGLUniformLocation;
  private lightProj = mat4.create();
  private lightView = mat4.create();
  private lightSpaceMatrix = mat4.create();

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    const vs = `#version 300 es
in vec3 aPos;
in vec3 aNormal;
in vec4 aColor;
in vec2 aUV;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform mat4 uLightSpaceMatrix;
uniform mat3 uNormalMatrix;
uniform vec4 uColor;
out vec4 vColor;
out vec3 vNormal;
out vec3 vWorldPos;
out float vDepth;
out vec2 vUV;
out vec4 vLightSpacePos;
void main() {
  vec4 worldPos = uModel * vec4(aPos, 1.0);
  vec4 viewPos = uView * worldPos;
  gl_Position = uProj * viewPos;
  vColor = aColor * uColor;
  vNormal = normalize(uNormalMatrix * aNormal);
  vWorldPos = worldPos.xyz;
  vDepth = length(viewPos.xyz);
  vUV = aUV;
  vLightSpacePos = uLightSpaceMatrix * worldPos;
}
`;
    const fs = `#version 300 es
precision highp float;
in vec4 vColor;
in vec3 vNormal;
in vec3 vWorldPos;
in float vDepth;
in vec2 vUV;
in vec4 vLightSpacePos;
out vec4 FragColor;
uniform vec3 uLightDir;
uniform vec3 uViewPos;
uniform sampler2D uTexture;
uniform bool uHasTexture;
uniform vec3 uLightColor;
uniform vec3 uAmbientColor;
uniform vec3 uFogColor;
uniform sampler2D uShadowMap;

#define MAX_POINT_LIGHTS 16
uniform int uNumPointLights;
uniform vec3 uPointLightPos[MAX_POINT_LIGHTS];
uniform float uDayBlend; 

void main() {
  vec4 baseColor = vColor;
  if (uHasTexture) {
    baseColor *= texture(uTexture, vUV);
  }
  
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uViewPos - vWorldPos);
  
  // Soft Shadow calculation (PCF)
  vec3 projCoords = vLightSpacePos.xyz / vLightSpacePos.w;
  projCoords = projCoords * 0.5 + 0.5;
  float shadow = 0.0;
  if (projCoords.z <= 1.0 && projCoords.x >= 0.0 && projCoords.x <= 1.0 && projCoords.y >= 0.0 && projCoords.y <= 1.0) {
    float currentDepth = projCoords.z;
    vec3 L = normalize(uLightDir);
    float bias = max(0.005 * (1.0 - dot(N, L)), 0.0005);
    vec2 texelSize = vec2(1.0 / 2048.0);
    for(int x = -1; x <= 1; ++x) {
      for(int y = -1; y <= 1; ++y) {
        float pcfDepth = texture(uShadowMap, projCoords.xy + vec2(x, y) * texelSize).r;
        shadow += currentDepth - bias > pcfDepth ? 1.0 : 0.0;
      }
    }
    shadow /= 9.0;
  }
  
  // Directional Sun Light
  vec3 L = normalize(uLightDir);
  float diff = max(dot(N, L), 0.0);
  vec3 R = reflect(-L, N);
  float spec = pow(max(dot(R, V), 0.0), 32.0);
  
  vec3 ambient = uAmbientColor * baseColor.rgb;
  vec3 diffuse = (1.0 - shadow) * diff * uLightColor * baseColor.rgb;
  vec3 specular = (1.0 - shadow) * spec * uLightColor * vec3(0.6);
  
   // Point Lights (Street Lamps)
  vec3 pointLightContribution = vec3(0.0);
  for(int i = 0; i < MAX_POINT_LIGHTS; i++) {
    if(i >= uNumPointLights) break;
    vec3 lightVec = uPointLightPos[i] - vWorldPos;
    float dist = length(lightVec);

    // Expanded radius from 25.0 to 80.0 so it hits the floor and street
    if(dist < 80.0) {
      float atten = 1.0 - (dist / 80.0);
      atten = atten * atten; // Quadratic falloff

      vec3 pL = lightVec / dist;
      float pDiff = max(dot(N, pL), 0.0);

      // Increased intensity multiplier from 2.0 to 4.0, made color slightly warmer
      pointLightContribution += pDiff * vec3(1.0, 0.85, 0.5) * atten * baseColor.rgb * 4.0;

      vec3 pR = reflect(-pL, N);
      float pSpec = pow(max(dot(pR, V), 0.0), 16.0);
      pointLightContribution += pSpec * vec3(1.0, 0.85, 0.5) * atten * 0.8;
    }
  }
  
  vec3 color = ambient + diffuse + specular + pointLightContribution;
  float fog = clamp((vDepth - 80.0) / 250.0, 0.0, 1.0);

  // Lamp bulb glow at night
  if (uDayBlend < 0.5) {
    for(int i = 0; i < MAX_POINT_LIGHTS; i++) {
      if(i >= uNumPointLights) break;
      vec3 lightVec = uPointLightPos[i] - vWorldPos;
      float dist = length(lightVec);
      if(dist < 2.5) {
        float glow = 1.0 - (dist / 2.5);
        color += vec3(1.0, 0.8, 0.4) * glow * glow * 3.0;
      }
    }
  }

  vec3 finalColor = mix(color, uFogColor, fog * baseColor.a);
  FragColor = vec4(finalColor, baseColor.a);
}
`;

    this.program = this.createProgram(vs, fs);
    gl.useProgram(this.program);
    this.projLoc = gl.getUniformLocation(this.program, 'uProj')!;
    this.viewLoc = gl.getUniformLocation(this.program, 'uView')!;
    this.modelLoc = gl.getUniformLocation(this.program, 'uModel')!;
    this.colorLoc = gl.getUniformLocation(this.program, 'uColor')!;
    this.normalMatrixLoc = gl.getUniformLocation(this.program, 'uNormalMatrix');
    this.lightDirLoc = gl.getUniformLocation(this.program, 'uLightDir');
    this.viewPosLoc = gl.getUniformLocation(this.program, 'uViewPos');
    this.textureLoc = gl.getUniformLocation(this.program, 'uTexture');
    this.useTextureLoc = gl.getUniformLocation(this.program, 'uHasTexture');

    this.lightColorLoc = gl.getUniformLocation(this.program, 'uLightColor');
    this.ambientColorLoc = gl.getUniformLocation(this.program, 'uAmbientColor');
    this.fogColorLoc = gl.getUniformLocation(this.program, 'uFogColor');
    this.lightSpaceLoc = gl.getUniformLocation(this.program, 'uLightSpaceMatrix');
    this.shadowMapLoc = gl.getUniformLocation(this.program, 'uShadowMap');
    this.numPointLightsLoc = gl.getUniformLocation(this.program, 'uNumPointLights');
    this.dayBlendLoc = gl.getUniformLocation(this.program, 'uDayBlend');
    this.pointLightPosLoc = gl.getUniformLocation(this.program, 'uPointLightPos[0]');

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);      
    gl.cullFace(gl.BACK);        
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Depth Shader for Shadow Map
    const depthVs = `#version 300 es
in vec3 aPos;
uniform mat4 uLightSpaceMatrix;
uniform mat4 uModel;
void main() {
  gl_Position = uLightSpaceMatrix * uModel * vec4(aPos, 1.0);
}`;
    const depthFs = `#version 300 es
precision highp float;
out vec4 FragColor;
void main() { }`;
    this.depthProgram = this.createProgram(depthVs, depthFs);
    this.depthLightSpaceLoc = gl.getUniformLocation(this.depthProgram, 'uLightSpaceMatrix')!;
    this.depthModelLoc = gl.getUniformLocation(this.depthProgram, 'uModel')!;

    // Shadow FBO
    this.shadowTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.shadowMapSize, this.shadowMapSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.shadowFBO = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTexture, 0);
    gl.drawBuffers([]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.initSkybox();
  }

  private initSkybox() {
    const gl = this.gl;
    const skyVs = `#version 300 es
in vec3 aPos;
out vec3 vWorldDir;
uniform mat4 uProj;
uniform mat4 uView;
void main() {
  vWorldDir = transpose(mat3(uView)) * aPos;
  mat4 rotView = mat4(mat3(uView));
  vec4 clipPos = uProj * rotView * vec4(aPos, 1.0);
  gl_Position = clipPos.xyww;
}`;
    const skyFs = `#version 300 es
precision highp float;
in vec3 vWorldDir;
out vec4 FragColor;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uDayBlend;
uniform float uTime;

float hash(vec3 p) {
    p = fract(p * 0.3183099 + .1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
    vec3 dir = normalize(vWorldDir);
    float h = dir.y;
    float t = max(0.0, min(1.0, h * 0.5 + 0.5));
    
    vec3 nightZenith = vec3(0.01, 0.02, 0.05);
    vec3 nightHorizon = vec3(0.03, 0.04, 0.08);
    vec3 dayZenith = vec3(0.2, 0.4, 0.8);
    vec3 dayHorizon = vec3(0.7, 0.8, 0.9);
    
    vec3 zenithColor = mix(nightZenith, dayZenith, uDayBlend);
    vec3 horizonColor = mix(nightHorizon, dayHorizon, uDayBlend);
    vec3 skyColor = mix(horizonColor, zenithColor, pow(t, 0.8));
    
    float sunDot = max(dot(dir, uSunDir), 0.0);
    vec3 sunColor = mix(vec3(1.0, 0.4, 0.1), vec3(1.0, 0.95, 0.8), uDayBlend);
    float sunDisk = smoothstep(0.997, 0.999, sunDot);
    float sunGlow = pow(sunDot, 16.0) * 0.5 + pow(sunDot, 4.0) * 0.2;
    skyColor += sunColor * (sunDisk * 2.0 + sunGlow * uDayBlend);
    
    float moonDot = max(dot(dir, uMoonDir), 0.0);
    float moonDisk = smoothstep(0.997, 0.999, moonDot);
    float moonGlow = pow(moonDot, 32.0) * 0.3;
    skyColor += vec3(0.8, 0.85, 0.95) * (moonDisk * 1.5 + moonGlow * (1.0 - uDayBlend));
    
    if (dir.y > 0.0) {
        vec3 starDir = dir * 150.0;
        float star = hash(floor(starDir));
        float starBrightness = smoothstep(0.995, 1.0, star) * (1.0 - uDayBlend);
        starBrightness *= 0.7 + 0.3 * sin(uTime * 5.0 + star * 100.0);
        starBrightness *= smoothstep(0.0, 0.2, dir.y);
        skyColor += vec3(starBrightness);
    }
    
    float horizonGlow = pow(max(0.0, 1.0 - abs(dir.y)), 4.0);
    float sunInfluence = max(dot(dir, uSunDir), 0.0);
    vec3 hazeColor = mix(vec3(0.8, 0.4, 0.1), vec3(0.9, 0.7, 0.5), uDayBlend);
    skyColor += hazeColor * horizonGlow * pow(sunInfluence, 2.0) * (uDayBlend * 0.5 + 0.5);
    
    FragColor = vec4(skyColor, 1.0);
}`;
    this.skyProgram = this.createProgram(skyVs, skyFs);
    this.skyProjLoc = gl.getUniformLocation(this.skyProgram, 'uProj')!;
    this.skyViewLoc = gl.getUniformLocation(this.skyProgram, 'uView')!;
    this.skySunDirLoc = gl.getUniformLocation(this.skyProgram, 'uSunDir')!;
    this.skyMoonDirLoc = gl.getUniformLocation(this.skyProgram, 'uMoonDir')!;
    this.skyDayBlendLoc = gl.getUniformLocation(this.skyProgram, 'uDayBlend')!;
    this.skyTimeLoc = gl.getUniformLocation(this.skyProgram, 'uTime')!;
 
    // 36 vertices (12 triangles) for a cube
    const verts = new Float32Array([
      // Front face (Z = 1)
      -1, -1, 1, 1, -1, 1, 1, 1, 1,
      -1, -1, 1, 1, 1, 1, -1, 1, 1,
      // Back face (Z = -1)
      1, -1, -1, -1, -1, -1, -1, 1, -1,
      1, -1, -1, -1, 1, -1, 1, 1, -1,
      // Top face (Y = 1)
      -1, 1, 1, 1, 1, 1, 1, 1, -1,
      -1, 1, 1, 1, 1, -1, -1, 1, -1,
      // Bottom face (Y = -1)
      -1, -1, -1, 1, -1, -1, 1, -1, 1,
      -1, -1, -1, 1, -1, 1, -1, -1, 1,
      // Right face (X = 1)
      1, -1, 1, 1, -1, -1, 1, 1, -1,
      1, -1, 1, 1, 1, -1, 1, 1, 1,
      // Left face (X = -1)
      -1, -1, -1, -1, -1, 1, -1, 1, 1,
      -1, -1, -1, -1, 1, 1, -1, 1, -1
    ]);
    this.skyVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.skyVao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);
  }

  private renderSkybox() {
    const gl = this.gl;
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE); // Prevent triangle clipping
    gl.useProgram(this.skyProgram);
    gl.uniformMatrix4fv(this.skyProjLoc, false, this.projMatrix);
    gl.uniformMatrix4fv(this.skyViewLoc, false, this.viewMatrix);
    gl.uniform3f(this.skySunDirLoc, this.sunDir[0], this.sunDir[1], this.sunDir[2]);
    gl.uniform3f(this.skyMoonDirLoc, this.moonDir[0], this.moonDir[1], this.moonDir[2]);
    gl.uniform1f(this.skyDayBlendLoc, this.dayBlend);
    gl.uniform1f(this.skyTimeLoc, performance.now() / 1000);

    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 36);
    gl.bindVertexArray(null);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }

  async initPlayerModel(modelUrl?: string): Promise<void> {
    this.currentModelUrl = modelUrl || null;
    if (modelUrl) {
      const loaded = await this.loadGLTF(modelUrl);
      if (loaded && loaded.length > 0) {
        this.playerMesh = loaded;
        return;
      }
    }
    this.playerMesh = this.generateSamplePlayerModel();
  }

  resize(w: number, h: number) {
    this.gl.canvas.width = w;
    this.gl.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
  }

  private createShader(type: number, source: string): WebGLShader | null {
    const shader = this.gl.createShader(type);
    if (!shader) { console.error('Failed to create shader'); return null; }
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private createProgram(vs: string, fs: string): WebGLProgram {
    const program = this.gl.createProgram()!;
    const vsh = this.createShader(this.gl.VERTEX_SHADER, vs);
    const fsh = this.createShader(this.gl.FRAGMENT_SHADER, fs);
    if (!vsh || !fsh) {
      if (vsh) this.gl.deleteShader(vsh);
      if (fsh) this.gl.deleteShader(fsh);
      this.gl.deleteProgram(program);
      throw new Error('Shader compilation failed');
    }
    this.gl.attachShader(program, vsh);
    this.gl.attachShader(program, fsh);

    this.gl.bindAttribLocation(program, 0, 'aPos');
    this.gl.bindAttribLocation(program, 1, 'aNormal');
    this.gl.bindAttribLocation(program, 2, 'aColor');
    this.gl.bindAttribLocation(program, 3, 'aUV');

    this.gl.linkProgram(program);
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const info = this.gl.getProgramInfoLog(program);
      console.error('Shader link error:', info);
      this.gl.deleteProgram(program);
      throw new Error('Program link failed');
    }
    return program;
  }

  private mulberry32(seed: number) {
    return function () {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
  }

  private createMesh(verts: number[], indices: number[], texture: WebGLTexture | null = null): CityMesh {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    const vbo = gl.createBuffer()!;
    const ibo = gl.createBuffer()!;
    gl.bindVertexArray(vao);

    let maxIndex = 0;
    for (let i = 0; i < indices.length; i++) if (indices[i] > maxIndex) maxIndex = indices[i];
    const vertexCount = maxIndex + 1;
    let floatsPerVertex = Math.round(verts.length / vertexCount) || 7;

    const targetFloats = 12;
    const interleaved = new Float32Array(vertexCount * targetFloats);

    if (floatsPerVertex === 7) {
      const positions = new Float32Array(vertexCount * 3);
      const colors = new Float32Array(vertexCount * 4);
      for (let i = 0; i < vertexCount; i++) {
        const base = i * 7;
        positions[i * 3] = verts[base];
        positions[i * 3 + 1] = verts[base + 1];
        positions[i * 3 + 2] = verts[base + 2];
        colors[i * 4] = verts[base + 3];
        colors[i * 4 + 1] = verts[base + 4];
        colors[i * 4 + 2] = verts[base + 5];
        colors[i * 4 + 3] = verts[base + 6];
      }
      const normals = new Float32Array(vertexCount * 3);
      for (let i = 0; i < indices.length; i += 3) {
        const ia = indices[i] * 3, ib = indices[i + 1] * 3, ic = indices[i + 2] * 3;
        const v1x = positions[ib] - positions[ia], v1y = positions[ib + 1] - positions[ia + 1], v1z = positions[ib + 2] - positions[ia + 2];
        const v2x = positions[ic] - positions[ia], v2y = positions[ic + 1] - positions[ia + 1], v2z = positions[ic + 2] - positions[ia + 2];
        const nx = v1y * v2z - v1z * v2y, ny = v1z * v2x - v1x * v2z, nz = v1x * v2y - v1y * v2x;
        normals[ia] += nx; normals[ia + 1] += ny; normals[ia + 2] += nz;
        normals[ib] += nx; normals[ib + 1] += ny; normals[ib + 2] += nz;
        normals[ic] += nx; normals[ic + 1] += ny; normals[ic + 2] += nz;
      }
      for (let i = 0; i < vertexCount; i++) {
        const ni = i * 3;
        const l = Math.hypot(normals[ni], normals[ni + 1], normals[ni + 2]) || 1.0;
        normals[ni] /= l; normals[ni + 1] /= l; normals[ni + 2] /= l;
      }
      for (let i = 0; i < vertexCount; i++) {
        const dst = i * targetFloats;
        interleaved[dst] = positions[i * 3];
        interleaved[dst + 1] = positions[i * 3 + 1];
        interleaved[dst + 2] = positions[i * 3 + 2];
        interleaved[dst + 3] = normals[i * 3];
        interleaved[dst + 4] = normals[i * 3 + 1];
        interleaved[dst + 5] = normals[i * 3 + 2];
        interleaved[dst + 6] = colors[i * 4];
        interleaved[dst + 7] = colors[i * 4 + 1];
        interleaved[dst + 8] = colors[i * 4 + 2];
        interleaved[dst + 9] = colors[i * 4 + 3];
        interleaved[dst + 10] = 0;
        interleaved[dst + 11] = 0;
      }
    } else if (floatsPerVertex === 10) {
      for (let i = 0; i < vertexCount; i++) {
        const src = i * 10;
        const dst = i * targetFloats;
        interleaved.set(verts.slice(src, src + 10), dst);
        interleaved[dst + 10] = 0;
        interleaved[dst + 11] = 0;
      }
    } else if (floatsPerVertex === 12) {
      interleaved.set(verts);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);

    const useUint32 = maxIndex > 0xffff;
    if (useUint32) gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
    else gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    const stride = targetFloats * 4;
    const posLoc = 0;
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, stride, 0);

    const normalLoc = 1;
    gl.enableVertexAttribArray(normalLoc);
    gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, stride, 12);

    const colorLoc = 2;
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, stride, 24);

    const uvLoc = 3;
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, stride, 40);

    gl.bindVertexArray(null);
    return { vao, vbo, ibo, indexCount: indices.length, indexType: useUint32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, texture };
  }

  private computeNormalMatrix(out: Float32Array, m: Float32Array) {
    const m00 = m[0], m01 = m[1], m02 = m[2];
    const m10 = m[4], m11 = m[5], m12 = m[6];
    const m20 = m[8], m21 = m[9], m22 = m[10];
    const det = m00 * (m11 * m22 - m12 * m21) - m01 * (m10 * m22 - m12 * m20) + m02 * (m10 * m21 - m11 * m20);
    if (!det) {
      out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0; out[4] = 1; out[5] = 0; out[6] = 0; out[7] = 0; out[8] = 1;
      return out;
    }
    const invDet = 1 / det;
    out[0] = (m11 * m22 - m12 * m21) * invDet; out[1] = (m12 * m20 - m10 * m22) * invDet; out[2] = (m10 * m21 - m11 * m20) * invDet;
    out[3] = (m02 * m21 - m01 * m22) * invDet; out[4] = (m00 * m22 - m02 * m20) * invDet; out[5] = (m02 * m10 - m00 * m12) * invDet;
    out[6] = (m01 * m12 - m02 * m11) * invDet; out[7] = (m02 * m10 - m00 * m12) * invDet; out[8] = (m00 * m11 - m01 * m10) * invDet;
    return out;
  }

  private addBox(verts: number[], indices: number[], x: number, y: number, z: number, w: number, h: number, d: number, r: number, g: number, b: number, a: number, idxOffset: number) {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const faces = [
      [hw, hh, -hd, -hw, hh, -hd, -hw, hh, hd, hw, hh, hd],
      [-hw, -hh, -hd, hw, -hh, -hd, hw, -hh, hd, -hw, -hh, hd],
      [-hw, hh, hd, -hw, -hh, hd, hw, -hh, hd, hw, hh, hd],
      [hw, hh, -hd, hw, -hh, -hd, -hw, -hh, -hd, -hw, hh, -hd],
      [-hw, hh, -hd, -hw, -hh, -hd, -hw, -hh, hd, -hw, hh, hd],
      [hw, hh, hd, hw, -hh, hd, hw, -hh, -hd, hw, hh, -hd]
    ];
    for (let i = 0; i < 6; i++) {
      const f = faces[i];
      const shade = 0.8 + (i * 0.05);
      for (let j = 0; j < 12; j += 3) {
        verts.push(x + f[j], y + f[j + 1], z + f[j + 2], r * shade, g * shade, b * shade, a);
      }
    }
    for (let i = 0; i < 24; i += 4) {
      indices.push(i + idxOffset, i + 1 + idxOffset, i + 2 + idxOffset, i + idxOffset, i + 2 + idxOffset, i + 3 + idxOffset);
    }
  }

  private addPlane(verts: number[], indices: number[], x: number, y: number, z: number, w: number, d: number, r: number, g: number, b: number, a: number, idxOffset: number) {
    verts.push(
      x - w / 2, y, z - d / 2, r, g, b, a,
      x + w / 2, y, z - d / 2, r, g, b, a,
      x + w / 2, y, z + d / 2, r, g, b, a,
      x - w / 2, y, z + d / 2, r, g, b, a
    );
    indices.push(idxOffset, idxOffset + 1, idxOffset + 2, idxOffset, idxOffset + 2, idxOffset + 3);
  }

  getCityChunk(cx: number, cz: number): CityChunk {
    const key = `${cx},${cz}`;
    if (this.chunkCache.has(key)) return this.chunkCache.get(key)!;

    const verts: number[] = [];
    const indices: number[] = [];
    let idxOffset = 0;

    const worldOriginX = cx * CHUNK_SIZE;
    const worldOriginZ = cz * CHUNK_SIZE;
    const biome = getBiome(cx, cz);

    if (biome === 'ocean') {
      const cx2 = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
      const cz2 = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
      this.addPlane(verts, indices, cx2, -2.5, cz2, CHUNK_SIZE, CHUNK_SIZE, 0.0, 0.2, 0.5, 0.8, idxOffset);
      idxOffset += 4;
      const mesh = this.createMesh(verts, indices);
      const chunk = { mesh, cx, cz, lamps: [] };
      this.chunkCache.set(key, chunk);
      return chunk;
    }

    const isWaterAdjacent = () => {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          if (getBiome(cx + dx, cz + dz) === 'ocean') return true;
        }
      }
      return false;
    };

    const isBeach = biome === 'beach';
    const isSuburb = biome === 'suburb';
    const isMountain = biome === 'mountain';
    const isCity = biome === 'city';

    const seed = (cx * 100003 + cz * 70001) >>> 0;
    const rng = this.mulberry32(seed);
    const blocksPerChunk = CHUNK_SIZE / GRID_PITCH;

    // Ground layer: differs by biome
    if (isBeach) {
      this.addPlane(verts, indices, worldOriginX + CHUNK_SIZE / 2, 0.0, worldOriginZ + CHUNK_SIZE / 2, CHUNK_SIZE, CHUNK_SIZE, 0.76, 0.70, 0.50, 1.0, idxOffset);
    } else if (isMountain) {
      this.addPlane(verts, indices, worldOriginX + CHUNK_SIZE / 2, 0.0, worldOriginZ + CHUNK_SIZE / 2, CHUNK_SIZE, CHUNK_SIZE, 0.25, 0.22, 0.18, 1.0, idxOffset);
    } else {
      this.addPlane(verts, indices, worldOriginX + CHUNK_SIZE / 2, 0.0, worldOriginZ + CHUNK_SIZE / 2, CHUNK_SIZE, CHUNK_SIZE, 0.08, 0.08, 0.08, 1.0, idxOffset);
    }
    idxOffset += 4;

    // Water edge for beach chunks adjacent to ocean
    if (isBeach && isWaterAdjacent()) {
      const cx2 = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
      const cz2 = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
      this.addPlane(verts, indices, cx2, -0.5, cz2, CHUNK_SIZE, CHUNK_SIZE, 0.0, 0.3, 0.6, 0.7, idxOffset);
      idxOffset += 4;
    }

    for (let by = 0; by < blocksPerChunk; by++) {
      for (let bx = 0; bx < blocksPerChunk; bx++) {
        const gx = cx * blocksPerChunk + bx;
        const gz = cz * blocksPerChunk + by;
        const blockWorldX = gx * GRID_PITCH + GRID_PITCH / 2;
        const blockWorldZ = gz * GRID_PITCH + GRID_PITCH / 2;

        if (isMountain) {
          // Rocky terrain: stack rock boxes for a mountain feel
          const rockCount = 3 + Math.floor(rng() * 5);
          for (let ri = 0; ri < rockCount; ri++) {
            const rx = blockWorldX - 12 + rng() * 24;
            const rz = blockWorldZ - 12 + rng() * 24;
            const rw = 2 + rng() * 6;
            const rd = 2 + rng() * 6;
            const rh = 1 + rng() * (12 + Math.max(0, BIOME_RADIUS_MOUNTAIN - Math.sqrt(cx * cx + cz * cz)) * 3);
            const shade = 0.2 + rng() * 0.25;
            this.addBox(verts, indices, rx, rh / 2, rz, rw, rh, rd, shade, shade * 0.9, shade * 0.8, 1.0, idxOffset);
            idxOffset += 24;
          }
          // Sparse small trees
          if (rng() < 0.3) {
            const tx = blockWorldX - 10 + rng() * 20;
            const tz = blockWorldZ - 10 + rng() * 20;
            const th = 2 + rng() * 4;
            this.addBox(verts, indices, tx, th / 2, tz, 0.3, th, 0.3, 0.15, 0.08, 0.05, 1.0, idxOffset);
            idxOffset += 24;
            this.addBox(verts, indices, tx, th + 0.5, tz, 1.5, 1.0, 1.5, 0.05, 0.25, 0.05, 1.0, idxOffset);
            idxOffset += 24;
          }
          continue;
        }

        // Sidewalk
        this.addPlane(verts, indices, blockWorldX, 0.02, blockWorldZ, BLOCK_SIZE + 6, BLOCK_SIZE + 6, 0.4, 0.4, 0.4, 1.0, idxOffset);
        idxOffset += 4;

        if (isBeach) {
          // Sand lot with occasional palm-like shapes
          this.addPlane(verts, indices, blockWorldX, 0.03, blockWorldZ, BLOCK_SIZE, BLOCK_SIZE, 0.82, 0.75, 0.55, 1.0, idxOffset);
          idxOffset += 4;
          if (rng() < 0.2) {
            const px = blockWorldX - 8 + rng() * 16;
            const pz = blockWorldZ - 8 + rng() * 16;
            const ph = 3 + rng() * 4;
            this.addBox(verts, indices, px, ph / 2, pz, 0.3, ph, 0.3, 0.3, 0.15, 0.05, 1.0, idxOffset);
            idxOffset += 24;
            this.addBox(verts, indices, px, ph + 0.5, pz, 2.5, 0.5, 2.5, 0.0, 0.4, 0.0, 1.0, idxOffset);
            idxOffset += 24;
          }
          continue;
        }

        // Grass / Lot
        const grassG = isSuburb ? 0.35 : 0.1;
        this.addPlane(verts, indices, blockWorldX, 0.03, blockWorldZ, BLOCK_SIZE, BLOCK_SIZE, 0.08, grassG, 0.08, 1.0, idxOffset);
        idxOffset += 4;

        // Buildings: fewer in suburbs, more in city
        const buildChance = isSuburb ? 0.45 : 0.75;
        if (rng() >= buildChance) continue;

        if (isSuburb) {
          const w = 6 + rng() * 10;
          const d = 6 + rng() * 10;
          const h = 4 + rng() * 6;
          const r = 0.5 + rng() * 0.4;
          const g = 0.4 + rng() * 0.3;
          const b = 0.3 + rng() * 0.3;
          this.addBox(verts, indices, blockWorldX, h / 2 + 0.04, blockWorldZ, w, h, d, r, g, b, 1.0, idxOffset);
          idxOffset += 24;
          // Roof
          this.addBox(verts, indices, blockWorldX, h + 0.04 + 0.4, blockWorldZ, w + 0.5, 0.8, d + 0.5, 0.4, 0.15, 0.1, 1.0, idxOffset);
          idxOffset += 24;
        } else {
          const w = 6 + rng() * (BLOCK_SIZE - 14);
          const d = 6 + rng() * (BLOCK_SIZE - 14);
          const h = 10 + rng() * 50;
          const r = 0.4 + rng() * 0.4;
          const g = 0.4 + rng() * 0.4;
          const b = 0.4 + rng() * 0.4;
          this.addBox(verts, indices, blockWorldX, h / 2 + 0.04, blockWorldZ, w, h, d, r, g, b, 1.0, idxOffset);
          idxOffset += 24;
        }
      }
    }

    const mesh = this.createMesh(verts, indices);

    const lamps: { x: number; z: number }[] = [];
    if (!isMountain && !isBeach) {
      for (let ly = 0; ly <= 2; ly++) {
        for (let lx = 0; lx <= 2; lx++) {
          lamps.push({ x: cx * CHUNK_SIZE + lx * 40 - 8, z: cz * CHUNK_SIZE + ly * 40 - 8 });
        }
      }
    }

    const chunk = { mesh, cx, cz, lamps };
    this.chunkCache.set(key, chunk);
    return chunk;
  }

  getRoadNodesInRadius(cx: number, cz: number, radius: number): { x: number; z: number }[] {
    const nodes: { x: number; z: number }[] = [];
    const startGx = Math.floor((cx * CHUNK_SIZE) / GRID_PITCH) - radius;
    const startGz = Math.floor((cz * CHUNK_SIZE) / GRID_PITCH) - radius;
    const endGx = Math.ceil((cx * CHUNK_SIZE + CHUNK_SIZE) / GRID_PITCH) + radius;
    const endGz = Math.ceil((cz * CHUNK_SIZE + CHUNK_SIZE) / GRID_PITCH) + radius;
    for (let gx = startGx; gx <= endGx; gx++) {
      for (let gz = startGz; gz <= endGz; gz++) {
        const biome = getBiome(Math.floor(gx / (CHUNK_SIZE / GRID_PITCH)), Math.floor(gz / (CHUNK_SIZE / GRID_PITCH)));
        if (biome === 'mountain' || biome === 'beach' || biome === 'ocean') continue;
        nodes.push({ x: gx * GRID_PITCH, z: gz * GRID_PITCH });
      }
    }
    return nodes;
  }

  getRoadEdges(nodes: { x: number; z: number }[]): [number, number][] {
    const edges: [number, number][] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = Math.abs(nodes[i].x - nodes[j].x);
        const dz = Math.abs(nodes[i].z - nodes[j].z);
        if ((dx === GRID_PITCH && dz === 0) || (dx === 0 && dz === GRID_PITCH)) {
          edges.push([i, j]);
        }
      }
    }
    return edges;
  }

  getPlayerMesh(color: [number, number, number]): CityMesh {
    const key = `player_${color.join(',')}`;
    if (this.meshCache.has(key)) return this.meshCache.get(key)!;
    const verts: number[] = [];
    const indices: number[] = [];

    const addSphere = (cx: number, cy: number, cz: number, radius: number, stacks: number, slices: number, r: number, g: number, b: number, a: number) => {
      const startIndex = verts.length / 10;
      for (let i = 0; i <= stacks; i++) {
        const v = i / stacks;
        const theta = v * Math.PI;
        const sinT = Math.sin(theta), cosT = Math.cos(theta);
        for (let j = 0; j <= slices; j++) {
          const u = j / slices;
          const phi = u * Math.PI * 2;
          const sinP = Math.sin(phi), cosP = Math.cos(phi);
          const x = cosP * sinT;
          const y = cosT;
          const z = sinP * sinT;
          verts.push(cx + x * radius, cy + y * radius, cz + z * radius, x, y, z, r, g, b, a);
        }
      }
      for (let i = 0; i < stacks; i++) {
        for (let j = 0; j < slices; j++) {
          const aI = startIndex + i * (slices + 1) + j;
          const bI = startIndex + (i + 1) * (slices + 1) + j;
          indices.push(aI, bI, aI + 1, bI, bI + 1, aI + 1);
        }
      }
    };

    const addCylinder = (cx: number, cy: number, cz: number, radius: number, height: number, slices: number, r: number, g: number, b: number, a: number) => {
      const startIndex = verts.length / 10;
      for (let i = 0; i <= 1; i++) {
        const y = cy + (i === 0 ? -height / 2 : height / 2);
        for (let j = 0; j <= slices; j++) {
          const u = j / slices;
          const phi = u * Math.PI * 2;
          const sinP = Math.sin(phi), cosP = Math.cos(phi);
          const nx = cosP, nz = sinP;
          verts.push(cx + cosP * radius, y, cz + sinP * radius, nx, 0, nz, r, g, b, a);
        }
      }
      for (let j = 0; j < slices; j++) {
        const aI = startIndex + j;
        const bI = startIndex + (slices + 1) + j;
        indices.push(aI, bI, aI + 1, bI, bI + 1, aI + 1);
      }
    };

    addCylinder(0, 0.9, 0, 0.28, 0.9, 18, color[0], color[1], color[2], 1.0);
    addSphere(0, 1.6, 0, 0.18, 10, 18, color[0] * 0.9, color[1] * 0.9, color[2] * 0.9, 1.0);
    addSphere(0, 0.45, 0, 0.2, 8, 16, color[0], color[1], color[2], 1.0);
    addCylinder(-0.45, 1.05, 0, 0.08, 0.7, 12, color[0] * 0.9, color[1] * 0.9, color[2] * 0.9, 1.0);
    addCylinder(0.45, 1.05, 0, 0.08, 0.7, 12, color[0] * 0.9, color[1] * 0.9, color[2] * 0.9, 1.0);
    addSphere(-0.45, 0.6, -0.02, 0.09, 6, 12, color[0] * 0.95, color[1] * 0.95, color[2] * 0.95, 1.0);
    addSphere(0.45, 0.6, -0.02, 0.09, 6, 12, color[0] * 0.95, color[1] * 0.95, color[2] * 0.95, 1.0);
    addCylinder(-0.18, -0.6, 0, 0.11, 1.2, 16, color[0], color[1], color[2], 1.0);
    addCylinder(0.18, -0.6, 0, 0.11, 1.2, 16, color[0], color[1], color[2], 1.0);
    addSphere(-0.18, -1.2, 0, 0.11, 6, 12, color[0], color[1], color[2], 1.0);
    addSphere(0.18, -1.2, 0, 0.11, 6, 12, color[0], color[1], color[2], 1.0);

    const mesh = this.createMesh(verts, indices);
    this.meshCache.set(key, mesh);
    return mesh;
  }

  getOtherPlayerMesh(color: [number, number, number]): CityMesh { return this.getPlayerMesh(color); }

  getPedestrianMesh(gender: string): CityMesh {
    if (gender === 'female') {
      const color: [number, number, number] = [0.85, 0.45, 0.85];
      const key = `ped_female_${color.join(',')}`;
      if (this.meshCache.has(key)) return this.meshCache.get(key)!;
      const mesh = this.getPlayerMesh(color);
      this.meshCache.set(key, mesh);
      return mesh;
    } else {
      const color: [number, number, number] = [0.45, 0.55, 0.85];
      const key = `ped_male_${color.join(',')}`;
      if (this.meshCache.has(key)) return this.meshCache.get(key)!;
      const mesh = this.getPlayerMesh(color);
      this.meshCache.set(key, mesh);
      return mesh;
    }
  }

  getNPCCarMesh(color: [number, number, number]): CityMesh | CityMesh[] {
    if (this.carMeshes.length > 0) {
      return this.carMeshes[Math.floor(Math.random() * this.carMeshes.length)];
    }
    const key = `car_${color.join(',')}`;
    if (this.meshCache.has(key)) return this.meshCache.get(key)!;
    const verts: number[] = [];
    const indices: number[] = [];
    this.addBox(verts, indices, 0, 0.4, 0, 2.0, 0.8, 4.0, color[0], color[1], color[2], 1.0, 0);
    this.addBox(verts, indices, 0, 1.0, -0.2, 1.6, 0.6, 2.0, color[0] * 0.6, color[1] * 0.6, color[2] * 0.6, 1.0, 24);
    this.addBox(verts, indices, -1.2, 0.2, -1.5, 0.3, 0.4, 0.3, 0.1, 0.1, 0.1, 1.0, 48);
    this.addBox(verts, indices, 1.2, 0.2, -1.5, 0.3, 0.4, 0.3, 0.1, 0.1, 0.1, 1.0, 72);
    this.addBox(verts, indices, -1.2, 0.2, 1.5, 0.3, 0.4, 0.3, 0.1, 0.1, 0.1, 1.0, 96);
    this.addBox(verts, indices, 1.2, 0.2, 1.5, 0.3, 0.4, 0.3, 0.1, 0.1, 0.1, 1.0, 120);
    this.addBox(verts, indices, -0.5, 0.3, -2.0, 0.3, 0.2, 0.1, 1.0, 0.9, 0.4, 1.0, 144);
    this.addBox(verts, indices, 0.5, 0.3, -2.0, 0.3, 0.2, 0.1, 1.0, 0.9, 0.4, 1.0, 168);
    this.addBox(verts, indices, -0.5, 0.3, 2.0, 0.3, 0.2, 0.1, 0.8, 0.0, 0.0, 1.0, 192);
    this.addBox(verts, indices, 0.5, 0.3, 2.0, 0.3, 0.2, 0.1, 0.8, 0.0, 0.0, 1.0, 216);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set(key, mesh);
    return mesh;
  }

  getMotorcycleMesh(color: [number, number, number]): CityMesh | CityMesh[] {
    if (this.motorcycleMeshes.length > 0) {
      return this.motorcycleMeshes[Math.floor(Math.random() * this.motorcycleMeshes.length)];
    }
    const key = `moto_${color.join(',')}`;
    if (this.meshCache.has(key)) return this.meshCache.get(key)!;
    const verts: number[] = [];
    const indices: number[] = [];
    this.addBox(verts, indices, 0, 0.3, 0, 0.8, 0.5, 2.4, color[0], color[1], color[2], 1.0, 0);
    this.addBox(verts, indices, 0, 0.6, -0.2, 0.6, 0.3, 0.8, color[0] * 0.7, color[1] * 0.7, color[2] * 0.7, 1.0, 24);
    this.addBox(verts, indices, 0, 0.8, -1.0, 0.7, 0.1, 0.1, 0.2, 0.2, 0.2, 1.0, 48);
    this.addBox(verts, indices, 0, 0.2, -1.0, 0.15, 0.4, 0.15, 0.05, 0.05, 0.05, 1.0, 72);
    this.addBox(verts, indices, 0, 0.2, 1.0, 0.15, 0.4, 0.15, 0.05, 0.05, 0.05, 1.0, 96);
    this.addBox(verts, indices, 0, 0.3, -1.3, 0.2, 0.15, 0.05, 1.0, 0.9, 0.4, 1.0, 120);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set(key, mesh);
    return mesh;
  }

  projectToScreen(wx: number, wy: number, wz: number, canvasW: number, canvasH: number): { x: number; y: number } | null {
    const vp = mat4.create();
    mat4.multiply(vp, this.projMatrix, this.viewMatrix);
    const x = vp[0] * wx + vp[4] * wy + vp[8] * wz + vp[12];
    const y = vp[1] * wx + vp[5] * wy + vp[9] * wz + vp[13];
    const z = vp[2] * wx + vp[6] * wy + vp[10] * wz + vp[14];
    const w = vp[3] * wx + vp[7] * wy + vp[11] * wz + vp[15];
    if (w <= 0) return null;
    return { x: (x / w + 1) / 2 * canvasW, y: (1 - y / w) / 2 * canvasH };
  }

  clearCache() {
    this.chunkCache.clear();
    this.meshCache.clear();
  }

  private drawMesh(
    mesh: CityMesh | CityMesh[],
    x: number, y: number, z: number,
    yaw: number,
    scale: [number, number, number] = [1, 1, 1],
    color: [number, number, number, number] = [1, 1, 1, 1],
    isShadowPass: boolean = false,
    pitch: number = 0
  ) {
    mat4.identity(this.modelMatrix);
    mat4.translate(this.modelMatrix, this.modelMatrix, [x, y, z]);
    if (pitch) mat4.rotateX(this.modelMatrix, this.modelMatrix, pitch);
    mat4.rotateY(this.modelMatrix, this.modelMatrix, yaw);
    mat4.scale(this.modelMatrix, this.modelMatrix, scale);

    if (isShadowPass) {
      this.gl.uniformMatrix4fv(this.depthModelLoc, false, this.modelMatrix);
    } else {
      this.gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
      this.gl.uniform4f(this.colorLoc, color[0], color[1], color[2], color[3]);
      if (this.normalMatrixLoc) {
        const nm = this.computeNormalMatrix(new Float32Array(9), this.modelMatrix);
        this.gl.uniformMatrix3fv(this.normalMatrixLoc, false, nm);
      }
    }

    const meshes = Array.isArray(mesh) ? mesh : [mesh];
    for (const m of meshes) {
      if (!isShadowPass && m.texture) {
        this.gl.uniform1i(this.useTextureLoc, 1);
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, m.texture);
        this.gl.uniform1i(this.textureLoc, 0);
      } else if (!isShadowPass) {
        this.gl.uniform1i(this.useTextureLoc, 0);
      }

      this.gl.bindVertexArray(m.vao);
      this.gl.drawElements(this.gl.TRIANGLES, m.indexCount, m.indexType || this.gl.UNSIGNED_SHORT, 0);
    }
  }

  private updateSun(dt: number) {
    this.timeOfDay = (this.timeOfDay + dt / 120.0) % 1.0;
    const angle = this.timeOfDay * Math.PI * 2 - Math.PI / 2;
    this.sunDir = [Math.cos(angle), Math.sin(angle), 0.3];
    const len = Math.hypot(this.sunDir[0], this.sunDir[1], this.sunDir[2]);
    this.sunDir = [this.sunDir[0] / len, this.sunDir[1] / len, this.sunDir[2] / len];
    this.moonDir = [-this.sunDir[0], -this.sunDir[1], -this.sunDir[2]];

    const sunHeight = this.sunDir[1];
    let dayBlend = Math.max(0, Math.min(1, (sunHeight + 0.1) / 0.3));
    this.dayBlend = dayBlend;

    const nightSky = [0.05, 0.06, 0.1];   // Slightly brighter sky
    const daySky = [0.7, 0.8, 0.9];
    this.skyColor = [
      nightSky[0] + (daySky[0] - nightSky[0]) * dayBlend,
      nightSky[1] + (daySky[1] - nightSky[1]) * dayBlend,
      nightSky[2] + (daySky[2] - nightSky[2]) * dayBlend
    ];

    const nightLight = [0.3, 0.3, 0.4];   // Brightened moonlight (was 0.15)
    const dayLight = [1.0, 1.0, 0.95];
    this.lightColor = [
      nightLight[0] + (dayLight[0] - nightLight[0]) * dayBlend,
      nightLight[1] + (dayLight[1] - nightLight[1]) * dayBlend,
      nightLight[2] + (dayLight[2] - nightLight[2]) * dayBlend
    ];

    const nightAmb = [0.18, 0.18, 0.25];  // Brightened ambient so shadows aren't pure black (was 0.08)
    const dayAmb = [0.3, 0.3, 0.35];
    this.ambientColor = [
      nightAmb[0] + (dayAmb[0] - nightAmb[0]) * dayBlend,
      nightAmb[1] + (dayAmb[1] - nightAmb[1]) * dayBlend,
      nightAmb[2] + (dayAmb[2] - nightAmb[2]) * dayBlend
    ]; 
  }

  render(
    camX: number, camY: number, camZ: number, camYaw: number, camPitch: number, aspect: number,
    targetX: number, targetY: number, targetZ: number, carYaw: number,
    serverNPCs: any[], otherPlayers: any[], serverPedestrians: any[], parkedCars: any[],
    tracers: any[], muzzleFlashes: any[], rockets: any[], explosions: any[], bloodSplats: any[],
    bloodPools: any[],
    moneyStacks: any[],
    deadBodies: any[],
    playerMesh: CityMesh | CityMesh[] | null
  ) {
    const gl = this.gl;
    const now = performance.now();
    const dt = (this.lastFrameTime === 0 ? 0 : (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    this.updateSun(dt);

    // 1. Shadow Pass
    const shadowDist = 80.0;
    mat4.ortho(this.lightProj, -shadowDist, shadowDist, -shadowDist, shadowDist, -shadowDist, shadowDist * 2);
    const sunPos = [camX - this.sunDir[0] * 50, camY - this.sunDir[1] * 50, camZ - this.sunDir[2] * 50];
    mat4.lookAt(this.lightView, sunPos, [camX, camY, camZ], [0, 1, 0]);
    mat4.multiply(this.lightSpaceMatrix, this.lightProj, this.lightView);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
    gl.viewport(0, 0, this.shadowMapSize, this.shadowMapSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.depthProgram);
    gl.uniformMatrix4fv(this.depthLightSpaceLoc, false, this.lightSpaceMatrix);

    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2.0, 2.0);

    const pcx = Math.floor(camX / CHUNK_SIZE);
    const pcz = Math.floor(camZ / CHUNK_SIZE);

    // Gather nearby lamps for point lights
    const nearbyLamps: { x: number; y: number; z: number }[] = [];

    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const chunk = this.getCityChunk(pcx + dx, pcz + dz);
        this.drawMesh(chunk.mesh, 0, 0, 0, 0, [1, 1, 1], [1, 1, 1, 1], true);
        for (const lamp of chunk.lamps) {
          const distSq = (lamp.x - camX) ** 2 + (lamp.z - camZ) ** 2;
          if (distSq < 50 * 50) {
            nearbyLamps.push({ x: lamp.x, y: 4.5, z: lamp.z });
          }
        }
      }
    }
    for (const pc of parkedCars) this.drawMesh(pc.mesh, pc.x, 0, pc.z, pc.yaw, [1, 1, 1], [1, 1, 1, 1], true);
    for (const npc of serverNPCs) this.drawMesh(npc.mesh, npc.x, 0, npc.z, npc.yaw, [1, 1, 1], [1, 1, 1, 1], true);
    for (const ped of serverPedestrians) this.drawMesh(ped.mesh, ped.x, 0, ped.z, ped.yaw, [1, 1, 1], [1, 1, 1, 1], true);
    for (const p of otherPlayers) this.drawMesh(p.mesh, p.posX, p.posY, p.posZ, p.yaw, [1, 1, 1], [1, 1, 1, 1], true);
    if (playerMesh) this.drawMesh(playerMesh, targetX, targetY, targetZ, carYaw, [1, 1, 1], [1, 1, 1, 1], true);
    for (const db of deadBodies) {
      const isHuman = db.type === 'player' || db.type === 'ped_male' || db.type === 'ped_female' || db.type === 'cop';
      const dbPitch = isHuman ? -Math.PI / 2 : 0;
      this.drawMesh(db.mesh, db.x, 0.02, db.z, db.yaw, [1, 1, 1], [0.4, 0.4, 0.4, 1], true, dbPitch);
    }

    gl.disable(gl.POLYGON_OFFSET_FILL);

    // 2. Main Pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    mat4.perspective(this.projMatrix, Math.PI / 4, aspect, 0.1, 500.0);
    const dirX = Math.sin(camYaw) * Math.cos(camPitch);
    const dirY = -Math.sin(camPitch);
    const dirZ = Math.cos(camYaw) * Math.cos(camPitch);
    mat4.lookAt(this.viewMatrix, [camX, camY, camZ], [camX + dirX, camY + dirY, camZ + dirZ], [0, 1, 0]);

    this.renderSkybox();

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.projLoc, false, this.projMatrix);
    gl.uniformMatrix4fv(this.viewLoc, false, this.viewMatrix);

    gl.uniform3f(this.lightDirLoc, this.sunDir[0], this.sunDir[1], this.sunDir[2]);
    gl.uniform3f(this.lightColorLoc, this.lightColor[0], this.lightColor[1], this.lightColor[2]);
    gl.uniform3f(this.ambientColorLoc, this.ambientColor[0], this.ambientColor[1], this.ambientColor[2]);
    gl.uniform3f(this.fogColorLoc, this.skyColor[0], this.skyColor[1], this.skyColor[2]);
    gl.uniformMatrix4fv(this.lightSpaceLoc, false, this.lightSpaceMatrix);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
    gl.uniform1i(this.shadowMapLoc, 1);

    // Point lights (only at night)
    nearbyLamps.sort((a, b) => (a.x - camX) ** 2 + (a.z - camZ) ** 2 - ((b.x - camX) ** 2 + (b.z - camZ) ** 2));
    const pointLights = nearbyLamps.slice(0, 16);
    const pointLightPositions = new Float32Array(16 * 3);
    const numLights = Math.min(16, pointLights.length);
    for (let i = 0; i < numLights; i++) {
      pointLightPositions[i * 3] = pointLights[i].x;
      pointLightPositions[i * 3 + 1] = pointLights[i].y;
      pointLightPositions[i * 3 + 2] = pointLights[i].z;
    }

    gl.uniform1f(this.dayBlendLoc, this.dayBlend);  
    gl.uniform1i(this.numPointLightsLoc, this.dayBlend < 0.5 ? numLights : 0); // Only at night
    gl.uniform3fv(this.pointLightPosLoc, pointLightPositions);

    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const chunk = this.getCityChunk(pcx + dx, pcz + dz);
        this.drawMesh(chunk.mesh, 0, 0, 0, 0, [1, 1, 1], [1, 1, 1, 1]);

        // Draw Lamp Models
        if (this.lampMesh) {
          for (const lamp of chunk.lamps) {
            this.drawMesh(this.lampMesh, lamp.x, 0, lamp.z, 0, [1, 1, 1], [1, 1, 1, 1]);
          }
        }
      }
    }

    for (const pc of parkedCars) this.drawMesh(pc.mesh, pc.x, 0, pc.z, pc.yaw);

    for (const npc of serverNPCs) {
      this.drawMesh(npc.mesh, npc.x, 0, npc.z, npc.yaw);
      // Draw Police Lights
      if (npc.type === 'police') {
        const isRed = (performance.now() / 300) % 2 < 1;
        const lightColor: [number, number, number, number] = isRed ? [1, 0, 0, 1] : [0, 0, 1, 1];
        // Draw a flashing box on the roof
        this.drawMesh(this.getBoxMesh(0.8, 0.2, 0.4), npc.x, 1.2, npc.z, npc.yaw, [1, 1, 1], lightColor);
      }
    }

    for (const ped of serverPedestrians) this.drawMesh(ped.mesh, ped.x, 0, ped.z, ped.yaw);
    for (const p of otherPlayers) this.drawMesh(p.mesh, p.posX, p.posY, p.posZ, p.yaw);
    if (playerMesh) this.drawMesh(playerMesh, targetX, targetY, targetZ, carYaw);

    // Draw dead bodies
    for (const db of deadBodies) {
      const isHuman = db.type === 'player' || db.type === 'ped_male' || db.type === 'ped_female' || db.type === 'cop';
      const dbPitch = isHuman ? -Math.PI / 2 : 0;
      const elapsed = (performance.now() / 1000) - db.deathTime;
      const fadeAlpha = Math.max(0.4, 1.0 - elapsed / 30);
      this.drawMesh(db.mesh, db.x, 0.02, db.z, db.yaw, [1, 1, 1], [0.4, 0.4, 0.4, fadeAlpha], false, dbPitch);
    }

    gl.disable(gl.DEPTH_TEST);

    for (const b of bloodSplats) {
      const alpha = 1.0 - (b.age / b.lifetime);
      this.drawMesh(this.getBloodMesh(), b.x, b.y, b.z, 0, [1, 1, 1], [1, 1, 1, alpha]);
    }
    for (const bp of bloodPools) {
      const progress = bp.age / bp.lifetime;
      const poolScale = 1 + progress * bp.maxRadius;
      const alpha = Math.max(0, 1.0 - progress * 0.5);
      this.drawMesh(this.getBloodPoolMesh(), bp.x, 0.01, bp.z, 0, [poolScale, 1, poolScale], [0.6, 0.0, 0.0, alpha]);
    }
    for (const t of tracers) {
      const alpha = 1.0 - (t.age / t.lifetime);
      const mesh = this.getTracerMesh();
      mat4.identity(this.modelMatrix);
      mat4.targetTo(this.modelMatrix, [t.originX, t.originY, t.originZ], [t.originX + t.dirX * 50, t.originY + t.dirY * 50, t.originZ + t.dirZ * 50], [0, 1, 0]);
      const scaleMat = mat4.create();
      mat4.scale(scaleMat, scaleMat, [0.05, 0.05, 50]);
      mat4.multiply(this.modelMatrix, this.modelMatrix, scaleMat);
      gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
      gl.uniform4f(this.colorLoc, 1.0, 0.8, 0.0, alpha);
      gl.uniform1i(this.useTextureLoc, 0);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, mesh.indexType || gl.UNSIGNED_SHORT, 0);
    }
    for (const r of rockets) this.drawMesh(this.getRocketMesh(), r.x, r.y, r.z, 0, [1, 1, 1], [1, 1, 1, 1]);
    for (const e of explosions) {
      const progress = e.age / e.lifetime;
      const scale = 1 + progress * 10;
      const alpha = 1.0 - progress;
      this.drawMesh(this.getExplosionMesh(), e.x, e.y, e.z, 0, [scale, scale, scale], [1, 1, 1, alpha]);
    }
    for (const m of muzzleFlashes) {
      const alpha = 1.0 - (m.age / m.lifetime);
      this.drawMesh(this.getExplosionMesh(), m.x, m.y, m.z, 0, [0.5, 0.5, 0.5], [1, 1, 1, alpha]);
    }

    for (const ms of moneyStacks) {
      const progress = ms.age / ms.lifetime;
      const alpha = 1.0 - progress;
      this.drawMesh(this.getMoneyStackMesh(), ms.x, 0.01, ms.z, ms.yaw || 0, [1, 1, 1], [1, 1, 1, alpha]);
    }

    gl.enable(gl.DEPTH_TEST);
  }

  private getTracerMesh(): CityMesh {
    if (this.meshCache.has('tracer')) return this.meshCache.get('tracer')!;
    const verts: number[] = [], indices: number[] = [];
    this.addBox(verts, indices, 0, 0, 0.5, 1, 1, 1, 1.0, 0.8, 0.0, 1.0, 0);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('tracer', mesh);
    return mesh;
  }

  private getRocketMesh(): CityMesh {
    if (this.meshCache.has('rocket')) return this.meshCache.get('rocket')!;
    const verts: number[] = [], indices: number[] = [];
    this.addBox(verts, indices, 0, 0, 0, 0.3, 0.3, 1.5, 1.0, 0.2, 0.2, 1.0, 0);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('rocket', mesh);
    return mesh;
  }

  private getExplosionMesh(): CityMesh {
    if (this.meshCache.has('explosion')) return this.meshCache.get('explosion')!;
    const verts: number[] = [], indices: number[] = [];
    this.addBox(verts, indices, 0, 0, 0, 1, 1, 1, 1.0, 0.5, 0.0, 1.0, 0);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('explosion', mesh);
    return mesh;
  }

  private getBloodMesh(): CityMesh {
    if (this.meshCache.has('blood')) return this.meshCache.get('blood')!;
    const verts: number[] = [], indices: number[] = [];
    this.addBox(verts, indices, 0, 0, 0, 0.5, 0.5, 0.5, 0.8, 0.0, 0.0, 1.0, 0);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('blood', mesh);
    return mesh;
  }

  private getBloodPoolMesh(): CityMesh {
    if (this.meshCache.has('bloodpool')) return this.meshCache.get('bloodpool')!;
    const verts: number[] = [], indices: number[] = [];
    // y = 0 to sit flat on the ground (will be pushed slightly up by drawMesh scale)
    this.addPlane(verts, indices, 0, 0, 0, 1, 1, 0.6, 0.0, 0.0, 1.0, 0);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('bloodpool', mesh);
    return mesh;
  }
  getPoliceCarMesh(): CityMesh | CityMesh[] {
    if (this.policeCarMesh) {
      return this.policeCarMesh;
    }
    const key = `police_car`;
    if (this.meshCache.has(key)) return this.meshCache.get(key)!;
    const verts: number[] = [];
    const indices: number[] = [];
    // Black body
    this.addBox(verts, indices, 0, 0.4, 0, 2.0, 0.8, 4.0, 0.1, 0.1, 0.1, 1.0, 0);
    // White doors
    this.addBox(verts, indices, 0, 0.6, 0, 2.1, 0.4, 2.0, 0.9, 0.9, 0.9, 1.0, 24);
    this.addBox(verts, indices, 0, 1.0, -0.2, 1.6, 0.6, 2.0, 0.1, 0.1, 0.1, 1.0, 48);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set(key, mesh);
    return mesh;
  }

  getMoneyStackMesh(): CityMesh {
    if (this.meshCache.has('moneyStack')) return this.meshCache.get('moneyStack')!;
    const verts: number[] = [], indices: number[] = [];
    this.addBox(verts, indices, 0, 0.06, 0, 0.15, 0.12, 0.25, 0.2, 0.6, 0.2, 1.0, 0);
    this.addBox(verts, indices, 0, 0.06, 0, 0.17, 0.02, 0.27, 1.0, 0.9, 0.1, 1.0, 24);
    this.addBox(verts, indices, 0, 0.12, 0, 0.13, 0.02, 0.23, 0.3, 0.7, 0.3, 1.0, 48);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('moneyStack', mesh);
    return mesh;
  }

  private getBoxMesh(w: number, h: number, d: number): CityMesh {
    const key = `box_${w}_${h}_${d}`;
    if (this.meshCache.has(key)) return this.meshCache.get(key)!;
    const verts: number[] = [], indices: number[] = [];
    this.addBox(verts, indices, 0, 0, 0, w, h, d, 1, 1, 1, 1, 0);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set(key, mesh);
    return mesh;
  }
  private loadTexture(url: string): Promise<WebGLTexture | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const tex = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
        this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img);
        this.gl.generateMipmap(this.gl.TEXTURE_2D);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.REPEAT);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.REPEAT);
        resolve(tex);
      };
      img.onerror = () => { console.error('Failed to load texture:', url); resolve(null); };
      img.src = bust(url);
    });
  }

  async loadGLTF(url: string): Promise<CityMesh[] | null> {
    try {
      const isGLB = url.endsWith('.glb');
      const raw = await (await fetch(bust(url))).arrayBuffer();

      let json: any;
      let binBuffer: ArrayBuffer | null = null;

      if (isGLB) {
        const header = new Uint32Array(raw, 0, 3);
        const version = header[1];
        if (version !== 2) { console.error('Unsupported glTF version', version); return null; }
        let offset = 12;
        while (offset < raw.byteLength) {
          const chunkHeader = new Uint32Array(raw, offset, 2);
          const chunkLen = chunkHeader[0];
          const chunkType = chunkHeader[1];
          offset += 8;
          if (chunkType === 0x4E4F534A) {
            const decoder = new TextDecoder();
            json = JSON.parse(decoder.decode(new Uint8Array(raw, offset, chunkLen)));
          } else if (chunkType === 0x004E4942) {
            binBuffer = raw.slice(offset, offset + chunkLen);
          }
          offset += chunkLen;
        }
      } else {
        const decoder = new TextDecoder();
        json = JSON.parse(decoder.decode(new Uint8Array(raw)));
      }

      if (!json) return null;

      const base = url.substring(0, url.lastIndexOf('/') + 1);
      const buffers: ArrayBuffer[] = [];
      if (json.buffers) {
        for (const buf of json.buffers) {
          if (buf.uri) {
            if (buf.uri.startsWith('data:')) {
              const b64 = buf.uri.split(',')[1];
              const binaryStr = atob(b64);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
              buffers.push(bytes.buffer);
            } else {
              const bufRes = await fetch(bust(base + buf.uri));
              buffers.push(await bufRes.arrayBuffer());
            }
          } else if (binBuffer) {
            buffers.push(binBuffer);
          }
        }
      } else if (binBuffer) {
        buffers.push(binBuffer);
      }

      const meshes: CityMesh[] = [];
      const primitiveData: { verts: number[]; indices: number[]; texture: WebGLTexture | null }[] = [];

      let globalMinX = Infinity, globalMaxX = -Infinity;
      let globalMinY = Infinity, globalMaxY = -Infinity;
      let globalMinZ = Infinity, globalMaxZ = -Infinity;
      const textureCache = new Map<number, WebGLTexture | null>();

      // Build node transform list from node hierarchy
      const entries: { meshIndex: number; transform: Float32Array }[] = [];
      if (json.nodes && json.nodes.length > 0 && json.scenes) {
        const identity = mat4.identity(mat4.create());
        const traverse = (nodeIdx: number, parentWorld: Float32Array) => {
          const node = json.nodes[nodeIdx];
          const local = mat4.create();
          if (node.matrix) { for (let i = 0; i < 16; i++) local[i] = node.matrix[i]; }
          else { mat4.identity(local); }
          const world = mat4.create();
          mat4.multiply(world, parentWorld, local);
          if (node.mesh !== undefined) entries.push({ meshIndex: node.mesh, transform: world });
          for (const child of (node.children || [])) traverse(child, world);
        };
        const scene = json.scenes[json.scene ?? 0];
        if (scene?.nodes) {
          for (const rootIdx of scene.nodes) traverse(rootIdx, identity);
        }
      }
      // Fallback: if no nodes reference meshes, process all meshes directly
      if (entries.length === 0 && json.meshes) {
        const identity = mat4.identity(mat4.create());
        for (let mi = 0; mi < json.meshes.length; mi++) {
          entries.push({ meshIndex: mi, transform: identity });
        }
      }

      // Helper: transform a vec3 by a 4x4 matrix
      const txPos = (m: Float32Array, x: number, y: number, z: number): [number, number, number] => {
        const w = m[3] * x + m[7] * y + m[11] * z + m[15];
        const invW = w !== 0 ? 1 / w : 1;
        return [
          (m[0] * x + m[4] * y + m[8] * z + m[12]) * invW,
          (m[1] * x + m[5] * y + m[9] * z + m[13]) * invW,
          (m[2] * x + m[6] * y + m[10] * z + m[14]) * invW,
        ];
      };
      // Helper: transform a normal by the upper-left 3x3 (no translation)
      const txNrm = (m: Float32Array, x: number, y: number, z: number): [number, number, number] => {
        const nx = m[0] * x + m[4] * y + m[8] * z;
        const ny = m[1] * x + m[5] * y + m[9] * z;
        const nz = m[2] * x + m[6] * y + m[10] * z;
        const len = Math.hypot(nx, ny, nz);
        return len > 0.00001 ? [nx / len, ny / len, nz / len] : [x, y, z];
      };

      // First pass: extract raw geometry, apply node transforms, find global bounding box
      for (const entry of entries) {
        const meshDef = json.meshes[entry.meshIndex];
        if (!meshDef) continue;
        const tf = entry.transform;
        const identityTf = tf[0] === 1 && tf[5] === 1 && tf[10] === 1 && tf[15] === 1
          && tf[1] === 0 && tf[2] === 0 && tf[3] === 0 && tf[4] === 0
          && tf[6] === 0 && tf[7] === 0 && tf[8] === 0 && tf[9] === 0
          && tf[11] === 0 && tf[12] === 0 && tf[13] === 0 && tf[14] === 0;

        for (const prim of meshDef.primitives || []) {

          let skipMesh = false;
          if (prim.material !== undefined && json.materials[prim.material]) {
            const mat = json.materials[prim.material];
            const matName = (mat.name || '').toLowerCase();
            if (mat.alphaMode === 'BLEND' || matName.includes('cone') || matName.includes('beam') || matName.includes('volume')) {
              skipMesh = true;
            }
          }
          const meshName = (meshDef.name || '').toLowerCase();
          if (meshName.includes('cone') || meshName.includes('beam') || meshName.includes('volume')) {
            skipMesh = true;
          }
          if (skipMesh) continue;

          const verts: number[] = [];
          const indices: number[] = [];

          if (prim.indices !== undefined) {
            const idxAcc = json.accessors[prim.indices];
            const idxBufView = json.bufferViews[idxAcc.bufferView];
            const buf = buffers[idxBufView.buffer];
            const count = idxAcc.count;
            const idxByteOffset = (idxBufView.byteOffset || 0) + (idxAcc.byteOffset || 0);

            if (idxAcc.componentType === 5125) {
              const view = new Uint32Array(buf, idxByteOffset, count);
              for (let i = 0; i < count; i++) indices.push(view[i]);
            } else if (idxAcc.componentType === 5123) {
              const view = new Uint16Array(buf, idxByteOffset, count);
              for (let i = 0; i < count; i++) indices.push(view[i]);
            } else if (idxAcc.componentType === 5121) {
              const view = new Uint8Array(buf, idxByteOffset, count);
              for (let i = 0; i < count; i++) indices.push(view[i]);
            }
          } else {
            const posAcc = json.accessors[prim.attributes.POSITION];
            for (let i = 0; i < posAcc.count; i++) indices.push(i);
          }

          const posAcc = json.accessors[prim.attributes.POSITION];
          const posBufView = json.bufferViews[posAcc.bufferView];
          const posBuf = buffers[posBufView.buffer];

          const posStride = (posBufView.byteStride || 12) / 4;
          const posOffset = (posBufView.byteOffset || 0) + (posAcc.byteOffset || 0);
          const posData = new Float32Array(posBuf, 0, posBuf.byteLength / 4);

          let normData: Float32Array | null = null;
          let normStride = 3, normOffset = 0;
          if (prim.attributes.NORMAL !== undefined) {
            const normAcc = json.accessors[prim.attributes.NORMAL];
            const normBufView = json.bufferViews[normAcc.bufferView];
            const normBuf = buffers[normBufView.buffer];
            normStride = (normBufView.byteStride || 12) / 4;
            normOffset = (normBufView.byteOffset || 0) + (normAcc.byteOffset || 0);
            normData = new Float32Array(normBuf, 0, normBuf.byteLength / 4);
          }

          let uvData: Float32Array | null = null;
          let uvStride = 2, uvOffset = 0;
          if (prim.attributes.TEXCOORD_0 !== undefined) {
            const uvAcc = json.accessors[prim.attributes.TEXCOORD_0];
            const uvBufView = json.bufferViews[uvAcc.bufferView];
            const uvBuf = buffers[uvBufView.buffer];
            uvStride = (uvBufView.byteStride || 8) / 4;
            uvOffset = (uvBufView.byteOffset || 0) + (uvAcc.byteOffset || 0);
            uvData = new Float32Array(uvBuf, 0, uvBuf.byteLength / 4);
          }

          const vCount = posAcc.count;

          for (let i = 0; i < vCount; i++) {
            const pi = (posOffset / 4) + i * posStride;
            let x = posData[pi], y = posData[pi + 1], z = posData[pi + 2];

            if (!identityTf) {
              [x, y, z] = txPos(tf, x, y, z);
            }
            verts.push(x, y, z);

            if (x < globalMinX) globalMinX = x; if (x > globalMaxX) globalMaxX = x;
            if (y < globalMinY) globalMinY = y; if (y > globalMaxY) globalMaxY = y;
            if (z < globalMinZ) globalMinZ = z; if (z > globalMaxZ) globalMaxZ = z;

            if (normData) {
              const ni = (normOffset / 4) + i * normStride;
              let nx = normData[ni], ny = normData[ni + 1], nz = normData[ni + 2];
              if (!identityTf) {
                [nx, ny, nz] = txNrm(tf, nx, ny, nz);
              }
              verts.push(nx, ny, nz);
            } else {
              verts.push(0, 1, 0);
            }
            verts.push(1, 1, 1, 1);

            if (uvData) {
              const ui = (uvOffset / 4) + i * uvStride;
              verts.push(uvData[ui], uvData[ui + 1]); 
            } else {
              verts.push(0, 0);
            }
          } 

          let texture: WebGLTexture | null = null;
          if (json.materials && json.textures && json.images) {
            const matIndex = prim.material;
            if (matIndex !== undefined) { 
              if (textureCache.has(matIndex)) {
                texture = textureCache.get(matIndex)!;
              } else {
                const mat = json.materials[matIndex];
                let texInfo = null;

                if (mat.pbrMetallicRoughness) {
                  texInfo = mat.pbrMetallicRoughness.baseColorTexture;
                }
                if (!texInfo && mat.extensions && mat.extensions.KHR_materials_unlit) {
                  texInfo = mat.extensions.KHR_materials_unlit.baseColorTexture;
                }
                if (!texInfo && mat.emissiveTexture) {
                  texInfo = mat.emissiveTexture;
                }

                if (texInfo) {
                  const textureIndex = texInfo.index;
                  if (json.textures[textureIndex] && json.images[json.textures[textureIndex].source]) {
                    const imageInfo = json.images[json.textures[textureIndex].source];
                    let imgUrl = '';
                    let isBlob = false;
                    if (imageInfo.uri) {
                      const cleanUri = imageInfo.uri.replace(/\\/g, '/');
                      imgUrl = cleanUri.startsWith('data:') ? cleanUri : base + cleanUri; 
                    } else if (imageInfo.bufferView !== undefined) {
                      const bView = json.bufferViews[imageInfo.bufferView];
                      const buf = buffers[bView.buffer];
                      const offset = bView.byteOffset || 0;
                      const len = bView.byteLength;
                      const blob = new Blob([new Uint8Array(buf, offset, len)], { type: imageInfo.mimeType });
                      imgUrl = URL.createObjectURL(blob);
                      isBlob = true;
                    }
                    if (imgUrl) {
                      texture = await this.loadTexture(imgUrl);
                      if (isBlob) URL.revokeObjectURL(imgUrl);
                    }
                  }
                }
                textureCache.set(matIndex, texture);
              }
            }
          }

          primitiveData.push({ verts, indices, texture });
        }
      }

      if (primitiveData.length === 0) return null;
      // Second pass: Calculate global transformations
      const dimX = globalMaxX - globalMinX;
      const dimY = globalMaxY - globalMinY;
      const dimZ = globalMaxZ - globalMinZ;

      let needsRotation = false;
      if (url.includes('citylight') || url.includes('jillValentine') || url.includes('maleNPC')) {
        // Humanoid/lamp: if not tallest on Y, it's Z-up lying on its side
        if (dimY < dimX || dimY < dimZ) {
          needsRotation = true;
        }
      }
      // Standard Z-up to Y-up rotation
      const angleX = needsRotation ? -Math.PI / 2 : 0;
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);

      let rotMinX = Infinity, rotMaxX = -Infinity;
      let rotMinY = Infinity, rotMaxY = -Infinity;
      let rotMinZ = Infinity, rotMaxZ = -Infinity;

      // Calculate bounds AFTER rotation to ensure perfect grounding
      for (const p of primitiveData) {
        for (let i = 0; i < p.verts.length; i += 12) {
          let x = p.verts[i];
          let y = p.verts[i + 1];
          let z = p.verts[i + 2];

          if (needsRotation) {
            let y2 = y * cosX - z * sinX;
            let z2 = y * sinX + z * cosX;
            y = y2;
            z = z2;
          }

          if (x < rotMinX) rotMinX = x; if (x > rotMaxX) rotMaxX = x;
          if (y < rotMinY) rotMinY = y; if (y > rotMaxY) rotMaxY = y;
          if (z < rotMinZ) rotMinZ = z; if (z > rotMaxZ) rotMaxZ = z;
        }
      }

      const finalHeight = rotMaxY - rotMinY;
      const targetHeight = url.includes('citylight') ? 5.0 : 2.0;
      const scaleFactor = targetHeight / Math.max(0.001, finalHeight);
      const centerX = (rotMinX + rotMaxX) / 2;
      const centerY = rotMinY; // Set base to exactly y=0
      const centerZ = (rotMinZ + rotMaxZ) / 2;

      // Apply global scaling and rotation to all primitives
      for (const p of primitiveData) {
        const { verts, indices, texture } = p;
        for (let i = 0; i < verts.length; i += 12) {
          let x = verts[i];
          let y = verts[i + 1];
          let z = verts[i + 2];

          if (needsRotation) {
            let y2 = y * cosX - z * sinX;
            let z2 = y * sinX + z * cosX;
            y = y2;
            z = z2;

            // Apply rotation to normals
            let nx = verts[i + 3];
            let ny = verts[i + 4];
            let nz = verts[i + 5];
            let ny2 = ny * cosX - nz * sinX;
            let nz2 = ny * sinX + nz * cosX;
            verts[i + 3] = nx;
            verts[i + 4] = ny2;
            verts[i + 5] = nz2;
          }

          verts[i] = (x - centerX) * scaleFactor;
          verts[i + 1] = (y - centerY) * scaleFactor;
          verts[i + 2] = (z - centerZ) * scaleFactor;
        }

        if (indices.length > 0 && verts.length > 0) {
          meshes.push(this.createMesh(verts, indices, texture));
        }
      }

      return meshes.length > 0 ? meshes : null;
    } catch (e) {
      console.error('Failed to load glTF', url, e);
      return null;
    }
  }

  generateSamplePlayerModel(): CityMesh {
    const verts: number[] = [];
    const indices: number[] = [];
    const col: [number, number, number] = [0.2, 0.8, 1.0];

    this.addBox(verts, indices, 0, 0.5, 0, 0.7, 0.8, 0.4, col[0], col[1], col[2], 1.0, 0);
    this.addBox(verts, indices, 0, 1.15, 0, 0.4, 0.3, 0.4, col[0] * 0.9, col[1] * 0.9, col[2] * 0.9, 1.0, verts.length / 7);
    this.addBox(verts, indices, -0.55, 0.7, 0, 0.2, 0.6, 0.2, col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, 1.0, verts.length / 7);
    this.addBox(verts, indices, 0.55, 0.7, 0, 0.2, 0.6, 0.2, col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, 1.0, verts.length / 7);
    this.addBox(verts, indices, -0.2, 0.05, 0, 0.2, 0.5, 0.2, col[0] * 0.7, col[1] * 0.7, col[2] * 0.7, 1.0, verts.length / 7);
    this.addBox(verts, indices, 0.2, 0.05, 0, 0.2, 0.5, 0.2, col[0] * 0.7, col[1] * 0.7, col[2] * 0.7, 1.0, verts.length / 7);

    return this.createMesh(verts, indices);
  }
}