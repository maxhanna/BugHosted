export interface CityMesh {
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  ibo: WebGLBuffer;
  indexCount: number;
  indexType?: number;
  texture?: WebGLTexture | null;
  bounds?: { w: number; h: number; d: number };
  needsFlip?: boolean;
  vertexCount?: number;
  restPositions?: Float32Array;
  restNormals?: Float32Array;
  jointIndices?: Uint16Array;
  jointWeights?: Float32Array;
}

export interface CityChunk {
  mesh: CityMesh;
  cx: number;
  cz: number;
  lamps: { x: number; z: number }[];
}

const CHUNK_SIZE = 80;
const GRID_PITCH = 80;
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
  rotateZ: (out: Float32Array, a: Float32Array, rad: number) => {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    out[0] = a00 * c - a10 * s;
    out[1] = a01 * c - a11 * s;
    out[2] = a02 * c - a12 * s;
    out[3] = a03 * c - a13 * s;
    out[4] = a00 * s + a10 * c;
    out[5] = a01 * s + a11 * c;
    out[6] = a02 * s + a12 * c;
    out[7] = a03 * s + a13 * c;
    if (a !== out) {
      out[8] = a[8]; out[9] = a[9]; out[10] = a[10]; out[11] = a[11];
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

// Quaternion to 4x4 rotation matrix (column-major, as used by mat4)
function quatToMat4(q: number[], out: Float32Array): void {
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const xx = qx * qx, yy = qy * qy, zz = qz * qz;
  const xy = qx * qy, xz = qx * qz, yz = qy * qz;
  const wx = qw * qx, wy = qw * qy, wz = qw * qz;
  out[0] = 1 - 2 * (yy + zz);
  out[1] = 2 * (xy + wz);
  out[2] = 2 * (xz - wy);
  out[3] = 0;
  out[4] = 2 * (xy - wz);
  out[5] = 1 - 2 * (xx + zz);
  out[6] = 2 * (yz + wx);
  out[7] = 0;
  out[8] = 2 * (xz + wy);
  out[9] = 2 * (yz - wx);
  out[10] = 1 - 2 * (xx + yy);
  out[11] = 0;
  out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
}
// Quaternion + translation + scale to 4x4 matrix
function quatPosScaleToMat4(q: number[], t: number[], s: number[], out: Float32Array): void {
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const sx = s[0], sy = s[1], sz = s[2];
  const xx = qx * qx, yy = qy * qy, zz = qz * qz;
  const xy = qx * qy, xz = qx * qz, yz = qy * qz;
  const wx = qw * qx, wy = qw * qy, wz = qw * qz;
  out[0] = (1 - 2 * (yy + zz)) * sx;
  out[1] = 2 * (xy + wz) * sx;
  out[2] = 2 * (xz - wy) * sx;
  out[3] = 0;
  out[4] = 2 * (xy - wz) * sy;
  out[5] = (1 - 2 * (xx + zz)) * sy;
  out[6] = 2 * (yz + wx) * sy;
  out[7] = 0;
  out[8] = 2 * (xz + wy) * sz;
  out[9] = 2 * (yz - wx) * sz;
  out[10] = (1 - 2 * (xx + yy)) * sz;
  out[11] = 0;
  out[12] = t[0]; out[13] = t[1]; out[14] = t[2]; out[15] = 1;
}

const CACHE_BUST = 'v1';
function bust(url: string): string { return url + '?_=' + CACHE_BUST; }

// Deterministic integer hash for skin/mesh selection.
// Used so that all clients pick the same skin for a given entity id,
// regardless of when they receive the entity update from the server.
// fmix32 finalizer from MurmurHash3 — good distribution for small inputs.
function hashSeed(s: number | string): number {
  let h: number;
  if (typeof s === 'number') {
    h = s | 0;
  } else {
    h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
  }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

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
  public npcMeshes: CityMesh[][] = [];
  public busMesh: CityMesh[] | null = null;
  public copMesh: CityMesh | CityMesh[] | null = null;
  public carMeshes: CityMesh[][] = [];
  public motorcycleMeshes: CityMesh[][] = [];
  public policeCarMesh: CityMesh[] | null = null;
  public hospitalMesh: CityMesh[] | null = null;
  public vendingMachineMesh: CityMesh[] | null = null;
  // FIX: Home base mesh — the japaneseShop. Loaded from
  // assets/grandtheft/japaneseShop/scene.gltf. Rendered at building center
  // (120, 40) — chunk (1,0), one block east of the hospital. The procedural
  // building for this chunk is suppressed in getCityChunk().
  public homeBaseMesh: CityMesh[] | null = null;
  // FIX: Garage state. The component sets these each frame. The renderer
  // draws a black door panel that slides up based on openness, and the
  // stored car mesh inside the garage when present.
  public garageDoorOpenness = 0;
  public garageCarMesh: CityMesh | CityMesh[] | null = null;
  // Taxi mesh — loaded from assets/grandtheft/taxi/scene.gltf by the
  // component. Falls back to a yellow-and-black checker box mesh
  // generated procedurally in getTaxiMesh() if the GLTF isn't loaded yet.
  public taxiMesh: CityMesh[] | null = null;
  // Hooker NPC model - loaded from assets/grandtheft/hooker/scene.gltf.
  // Used for both world pedestrians (gender='hooker') and the passenger
  // mesh (so the skin is preserved across the ride, like
  // taxiMission.passengerMesh).
  public hookerMesh: CityMesh[] | null = null;
  public rocketMesh: CityMesh[] | null = null;
  public coltMesh: CityMesh[] | null = null;
  public trafficLightMesh: CityMesh[] | null = null;
  public currentModelUrl: string | null = null;

  // Skeleton data for CPU skinning (used by Franklin model)
  public skelBoneParents: Int32Array | null = null;
  public skelBoneLocalMatrices: Float32Array | null = null;
  public skelInverseBindMatrices: Float32Array | null = null;
  public skelBoneCount = 0;
  public skelNodeToBoneIdx: Map<number, number> | null = null;
  public skelJointMatrices: Float32Array | null = null;
  public skelBindWorldMatrices: Float32Array | null = null;
  public skelBindJointMatrices: Float32Array | null = null;
  public skelSkinRootWorld: Float32Array | null = null;
  public skelIsReady = false;
  // Transform params applied after CPU skinning (same as loadGLTF's second pass)
  public skelNeedsRotation = false;
  public skelAngleX = 0;
  public skelCosX = 1;
  public skelSinX = 0;
  public skelNeedsYFlip = false;
  public skelNeedsY90 = false;
  public skelNeedsYFlipMoped = false;
  public skelCenterX = 0;
  public skelCenterY = 0;
  public skelCenterZ = 0;
  public skelScaleFactor = 1;
  public skelExtraScale: [number, number, number] = [1, 1, 1];
  // Per-frame arm override when pistol is equipped
  public armOverrideActive = false;
  // Walk animation state
  public walkSpeed = 0;
  public walkTime = 0;
  public punchTime = 0;

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

  async initPlayerModel(modelUrl?: string, needsFlip: boolean = true): Promise<void> {
    this.currentModelUrl = modelUrl || null;
    if (modelUrl) {
      const loaded = await this.loadGLTF(modelUrl);
      if (loaded && loaded.length > 0) {
        for (const m of loaded) m.needsFlip = needsFlip;
        this.playerMesh = loaded;
        return;
      }
    }
    this.playerMesh = this.generateSamplePlayerModel();
  }

  // CPU skinning: compute bone transforms, blend vertices, update VBO
  skinPlayerMesh(meshes: CityMesh | CityMesh[], dt: number = 0): void {
    const skel = this;
    if (!skel.skelBoneParents || !skel.skelBoneLocalMatrices || !skel.skelInverseBindMatrices || !skel.skelSkinRootWorld) return;

    const gl = this.gl;
    const numBones = skel.skelBoneCount;
    const parents = skel.skelBoneParents;
    const invBind = skel.skelInverseBindMatrices;
    const jointMat = skel.skelJointMatrices!;

    // Create working copy of local matrices for animation
    const animLocal = new Float32Array(skel.skelBoneLocalMatrices);

    // ---- Apply walk animation to animLocal (Franklin only - 66 bones) ----
    if (this.walkSpeed > 0.1 && numBones > 63) {
      this.applyWalkAnimation(animLocal);
      this.walkTime += dt * Math.min(this.walkSpeed * 0.15, 2.0);
    }

    // ---- Apply arm override/punch (only if skeleton has right arm bones) ----
    if (numBones > 35) {
      if (this.armOverrideActive) {
        const m33 = new Float32Array(animLocal.buffer, 33 * 16 * 4, 16);
        quatToMat4([0, 0.7071068, 0, 0.7071068], m33);
        m33[12] = 0; m33[13] = 0.709; m33[14] = 0;

        const m34 = new Float32Array(animLocal.buffer, 34 * 16 * 4, 16);
        quatToMat4([0, 0, 0, 1], m34);
        m34[12] = 0; m34[13] = 1.142; m34[14] = 0;

        const m35 = new Float32Array(animLocal.buffer, 35 * 16 * 4, 16);
        quatToMat4([0.5, 0, 0, 0.8660254], m35);
        m35[12] = 0; m35[13] = 1.434; m35[14] = 0;
      } else if (this.punchTime > 0) {
        const t = this.punchTime / 0.3;
        const punchAmount = t < 0.5 ? t * 2 : 2 - t * 2;
        const extendAngle = -0.8 * punchAmount;

        const m33 = new Float32Array(animLocal.buffer, 33 * 16 * 4, 16);
        quatToMat4([Math.sin(extendAngle / 2), 0, 0, Math.cos(extendAngle / 2)], m33);
        m33[12] = 0; m33[13] = 0.709; m33[14] = 0;

        const m34 = new Float32Array(animLocal.buffer, 34 * 16 * 4, 16);
        quatToMat4([0, 0, 0, 1], m34);
        m34[12] = 0; m34[13] = 1.142; m34[14] = 0;

        const m35 = new Float32Array(animLocal.buffer, 35 * 16 * 4, 16);
        quatToMat4([0, 0, 0, 1], m35);
        m35[12] = 0; m35[13] = 1.434; m35[14] = 0;
      }
    }

    // ---- 1. Compute bone world transforms from animLocal ----
    for (let b = 0; b < numBones; b++) {
      if (parents[b] < 0) {
        mat4.multiply(
          jointMat,
          skel.skelSkinRootWorld,
          new Float32Array(animLocal.buffer, b * 16 * 4, 16)
        );
      }
    }
    for (let b = 0; b < numBones; b++) {
      if (parents[b] >= 0) {
        mat4.multiply(
          new Float32Array(jointMat.buffer, b * 16 * 4, 16),
          new Float32Array(jointMat.buffer, parents[b] * 16 * 4, 16),
          new Float32Array(animLocal.buffer, b * 16 * 4, 16)
        );
      }
    }

    // ---- 2. Compute joint matrices: jointMat[i] = world[i] * invBind[i] ----
    const tempMat = new Float32Array(16);
    for (let b = 0; b < numBones; b++) {
      const wOff = b * 16;
      const w = new Float32Array(jointMat.buffer, wOff * 4, 16);
      const ib = new Float32Array(invBind.buffer, wOff * 4, 16);
      mat4.multiply(tempMat, w, ib);
      for (let i = 0; i < 16; i++) w[i] = tempMat[i];
    }

    // ---- 4. Skin each vertex, apply global transforms, upload VBO ----
    const meshList = Array.isArray(meshes) ? meshes : [meshes];
    for (const mesh of meshList) {
      if (!mesh.jointIndices || !mesh.jointWeights || !mesh.restPositions || !mesh.restNormals || !mesh.vbo) continue;
      const vCount = mesh.vertexCount || 0;
      if (vCount === 0) continue;

      // Read back existing VBO data to preserve color and UV
      const existing = new Float32Array(vCount * 12);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
      gl.getBufferSubData(gl.ARRAY_BUFFER, 0, existing);

      const ji = mesh.jointIndices;
      const jw = mesh.jointWeights;
      const rp = mesh.restPositions;
      const rn = mesh.restNormals;

      const needsRotation = this.skelNeedsRotation;
      const cosX = this.skelCosX, sinX = this.skelSinX;
      const needsYFlip = this.skelNeedsYFlip;
      const needsYFlipMoped = this.skelNeedsYFlipMoped;
      const needsY90 = this.skelNeedsY90;
      const cx = this.skelCenterX, cy = this.skelCenterY, cz = this.skelCenterZ;
      const sf = this.skelScaleFactor;
      const ex = this.skelExtraScale[0], ey = this.skelExtraScale[1], ez = this.skelExtraScale[2];

      for (let v = 0; v < vCount; v++) {
        let px = 0, py = 0, pz = 0;
        let nx = 0, ny = 0, nz = 0;
        const rpx = rp[v * 3], rpy = rp[v * 3 + 1], rpz = rp[v * 3 + 2];
        const rnx = rn[v * 3], rny = rn[v * 3 + 1], rnz = rn[v * 3 + 2];

        for (let j = 0; j < 4; j++) {
          const w = jw[v * 4 + j];
          if (w === 0) continue;
          const bi = ji[v * 4 + j] * 16;
          const m00 = jointMat[bi], m01 = jointMat[bi + 1], m02 = jointMat[bi + 2], m03 = jointMat[bi + 3];
          const m10 = jointMat[bi + 4], m11 = jointMat[bi + 5], m12 = jointMat[bi + 6], m13 = jointMat[bi + 7];
          const m20 = jointMat[bi + 8], m21 = jointMat[bi + 9], m22 = jointMat[bi + 10], m23 = jointMat[bi + 11];

          px += w * (m00 * rpx + m01 * rpy + m02 * rpz + m03);
          py += w * (m10 * rpx + m11 * rpy + m12 * rpz + m13);
          pz += w * (m20 * rpx + m21 * rpy + m22 * rpz + m23);

          nx += w * (m00 * rnx + m01 * rny + m02 * rnz);
          ny += w * (m10 * rnx + m11 * rny + m12 * rnz);
          nz += w * (m20 * rnx + m21 * rny + m22 * rnz);
        }

        const nlen = Math.hypot(nx, ny, nz) || 1;
        nx /= nlen; ny /= nlen; nz /= nlen;

        let fx = px, fy = py, fz = pz;
        let fnx = nx, fny = ny, fnz = nz;

        if (needsRotation) {
          let ty = fy * cosX - fz * sinX;
          let tz = fy * sinX + fz * cosX;
          fy = ty; fz = tz;
          let tny = fny * cosX - fnz * sinX;
          let tnz = fny * sinX + fnz * cosX;
          fny = tny; fnz = tnz;
        }
        if (needsYFlip) { fx = -fx; fz = -fz; fnx = -fnx; fnz = -fnz; }
        if (needsYFlipMoped) { fx = -fx; fz = -fz; fnx = -fnx; fnz = -fnz; }
        if (needsY90) {
          const tx = fx; fx = fz; fz = -tx;
          const tnx = fnx; fnx = fnz; fnz = -tnx;
        }

        const dst = v * 12;
        existing[dst] = (fx - cx) * sf * ex;
        existing[dst + 1] = (fy - cy) * sf * ey;
        existing[dst + 2] = (fz - cz) * sf * ez;
        existing[dst + 3] = fnx;
        existing[dst + 4] = fny;
        existing[dst + 5] = fnz;
      }

      gl.bufferSubData(gl.ARRAY_BUFFER, 0, existing);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
  }

  // Apply procedural walk cycle to a copy of local bone matrices
  private applyWalkAnimation(animLocal: Float32Array): void {
    const t = this.walkTime;
    // Bone indices for the mixamorig skeleton
    const HIPS = 1, LEFT_ARM = 9, LEFT_FOREARM = 10, RIGHT_ARM = 33, RIGHT_FOREARM = 34;
    const LEFT_THIGH = 56, LEFT_KNEE = 57, LEFT_FOOT = 58;
    const RIGHT_THIGH = 61, RIGHT_KNEE = 62, RIGHT_FOOT = 63;
    const LEG_SWING = 0.5, KNEE_BEND = 0.3, ARM_SWING = 0.4, ELBOW_BEND = 0.15, HIP_BOB = 0.08;
    const leftPhase = t, rightPhase = t + Math.PI;
    const temp = new Float32Array(16), rot = new Float32Array(16);

    const applyRotX = (bone: number, angle: number) => {
      const m = new Float32Array(animLocal.buffer, bone * 16 * 4, 16);
      mat4.identity(rot); mat4.rotateX(rot, rot, angle);
      mat4.multiply(temp, m, rot);
      for (let i = 0; i < 16; i++) m[i] = temp[i];
    };

    // Left leg
    applyRotX(LEFT_THIGH, Math.sin(leftPhase) * LEG_SWING);
    applyRotX(LEFT_KNEE, Math.abs(Math.sin(leftPhase)) * -KNEE_BEND);

    // Right leg
    applyRotX(RIGHT_THIGH, Math.sin(rightPhase) * LEG_SWING);
    applyRotX(RIGHT_KNEE, Math.abs(Math.sin(rightPhase)) * -KNEE_BEND);

    // Arms swing opposite to legs (skip right arm if arm override or punch active)
    if (!this.armOverrideActive && this.punchTime <= 0) {
      applyRotX(LEFT_ARM, Math.sin(leftPhase + Math.PI) * ARM_SWING);
      applyRotX(LEFT_FOREARM, Math.abs(Math.sin(leftPhase + Math.PI)) * -ELBOW_BEND);
      applyRotX(RIGHT_ARM, Math.sin(rightPhase + Math.PI) * ARM_SWING);
      applyRotX(RIGHT_FOREARM, Math.abs(Math.sin(rightPhase + Math.PI)) * -ELBOW_BEND);
    } else {
      // Left arm still swings when override is active on right
      applyRotX(LEFT_ARM, Math.sin(leftPhase + Math.PI) * ARM_SWING);
      applyRotX(LEFT_FOREARM, Math.abs(Math.sin(leftPhase + Math.PI)) * -ELBOW_BEND);
    }

    // Hip vertical bob
    const hips = new Float32Array(animLocal.buffer, HIPS * 16 * 4, 16);
    hips[13] += Math.abs(Math.sin(t)) * -HIP_BOB;
    // Hip slight yaw twist
    mat4.identity(rot); mat4.rotateY(rot, rot, Math.sin(t) * 0.05);
    mat4.multiply(temp, hips, rot);
    for (let i = 0; i < 16; i++) hips[i] = temp[i];
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

        // Skip building generation for the hospital chunk — the hospital
        // model is drawn separately in the render loop and occupies this
        // block. Without this, a procedural building would overlap the hospital.
        if (cx === 0 && cz === 0) continue;
        // FIX: Skip building generation for the home base chunk (1, 0).
        // The japaneseShop model is drawn separately and occupies this
        // block, replacing the procedural building that would spawn here.
        if (cx === 1 && cz === 0) continue;

        // Buildings: fewer in suburbs, more in city
        const buildChance = isSuburb ? 0.45 : 0.75;
        if (rng() >= buildChance) continue;

        if (isSuburb) {
          const w = 10 + rng() * 14;
          const d = 10 + rng() * 14;
          const h = 6 + rng() * 14;
          const r = 0.5 + rng() * 0.4;
          const g = 0.4 + rng() * 0.3;
          const b = 0.3 + rng() * 0.3;
          this.addBox(verts, indices, blockWorldX, h / 2 + 0.04, blockWorldZ, w, h, d, r, g, b, 1.0, idxOffset);
          idxOffset += 24;
          // Roof
          this.addBox(verts, indices, blockWorldX, h + 0.04 + 0.4, blockWorldZ, w + 0.5, 0.8, d + 0.5, 0.4, 0.15, 0.1, 1.0, idxOffset);
          idxOffset += 24;
        } else {
          const maxDim = BLOCK_SIZE + 6;
          const w = 14 + rng() * (maxDim - 14);
          const d = 14 + rng() * (maxDim - 14);
          const h = 20 + rng() * 100;
          const r = 0.4 + rng() * 0.4;
          const g = 0.4 + rng() * 0.4;
          const b = 0.4 + rng() * 0.4;
          this.addBox(verts, indices, blockWorldX, h / 2 + 0.04, blockWorldZ, w, h, d, r, g, b, 1.0, idxOffset);
          idxOffset += 24;
        }
      }
    }

    // Road center line markings
    if (!isMountain && !isBeach) {
      const dashLen = 1.5;
      const dashWid = 0.3;
      const dashH = 0.02;
      const dashSpacing = 4;
      const dashOffset = 2;
      // Horizontal roads (along X, at fixed Z)
      for (let ri = 0; ri < 2; ri++) {
        const roadZ = cz * CHUNK_SIZE + ri * GRID_PITCH;
        for (let x = cx * CHUNK_SIZE + dashOffset; x <= cx * CHUNK_SIZE + CHUNK_SIZE - dashOffset; x += dashSpacing) {
          this.addBox(verts, indices, x, 0.04, roadZ, dashLen, dashH, dashWid, 1, 1, 1, 0.8, idxOffset);
          idxOffset += 24;
        }
      }
      // Vertical roads (along Z, at fixed X)
      for (let ri = 0; ri < 2; ri++) {
        const roadX = cx * CHUNK_SIZE + ri * GRID_PITCH;
        for (let z = cz * CHUNK_SIZE + dashOffset; z <= cz * CHUNK_SIZE + CHUNK_SIZE - dashOffset; z += dashSpacing) {
          this.addBox(verts, indices, roadX, 0.04, z, dashWid, dashH, dashLen, 1, 1, 1, 0.8, idxOffset);
          idxOffset += 24;
        }
      }
    }

    const mesh = this.createMesh(verts, indices);

    const lamps: { x: number; z: number }[] = [];
    if (!isMountain && !isBeach) {
      const halfSidewalk = (BLOCK_SIZE + 6) / 2;
      const sidewalkEdge = GRID_PITCH / 2 - halfSidewalk;
      for (let ly = 0; ly < 2; ly++) {
        for (let lx = 0; lx < 2; lx++) {
          lamps.push({ x: cx * CHUNK_SIZE + lx * GRID_PITCH - sidewalkEdge, z: cz * CHUNK_SIZE + ly * GRID_PITCH - sidewalkEdge });
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

  getLampsNear(x: number, z: number, radius: number): { x: number; z: number }[] {
    // Gather lamp post positions from nearby city chunks. Used for
    // traffic car collision detection so cars don't drive through lamps.
    const lamps: { x: number; z: number }[] = [];
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunkRadius = Math.ceil(radius / CHUNK_SIZE) + 1;
    for (let dz = -chunkRadius; dz <= chunkRadius; dz++) {
      for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
        const chunk = this.getCityChunk(cx + dx, cz + dz);
        for (const lamp of chunk.lamps) {
          if (Math.abs(lamp.x - x) < radius && Math.abs(lamp.z - z) < radius) {
            lamps.push(lamp);
          }
        }
      }
    }
    return lamps;
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

  getPedestrianMesh(gender: string, seed: number | string = 0): CityMesh | CityMesh[] {
    // NEW: Hooker peds use the dedicated hooker mesh so their skin is
    // preserved across the ride and on drop-off (mirrors the way
    // taxiMission.passengerMesh captures the exact mesh instance).
    if (gender === 'hooker') {
      return this.getHookerMesh();
    }
    // If we have loaded GLTF NPC meshes (redneck, jillValentine), pick
    // deterministically by `seed` so every client picks the same skin for the
    // same entity id and the skin doesn't flicker between sync frames.
    if (this.npcMeshes.length > 0) {
      if (this.npcMeshes.length === 1) return this.npcMeshes[0];
      return this.npcMeshes[hashSeed(seed) % this.npcMeshes.length];
    }
    // Fallback to legacy single npcMesh if it exists
    if (this.npcMesh) return this.npcMesh;

    // Fallback to generated geometry
    const color: [number, number, number] = gender === 'female' ? [0.85, 0.45, 0.85] : [0.45, 0.55, 0.85];
    const key = `ped_${gender}_${color.join(',')}`;
    if (this.meshCache.has(key)) return this.meshCache.get(key)!;
    const mesh = this.getPlayerMesh(color);
    this.meshCache.set(key, mesh);
    return mesh;
  }

  getNPCCarMesh(color: [number, number, number], seed: number | string = 0): CityMesh | CityMesh[] {
    // 10% chance to spawn a bus, deterministic per seed so the choice is
    // stable across sync frames and identical across clients.
    if (this.busMesh && (hashSeed(seed) % 10) < 1) {
      return this.busMesh;
    }
    if (this.carMeshes.length > 0) {
      if (this.carMeshes.length === 1) return this.carMeshes[0];
      return this.carMeshes[hashSeed(seed) % this.carMeshes.length];
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

  getMotorcycleMesh(color: [number, number, number], seed: number | string = 0): CityMesh | CityMesh[] {
    if (this.motorcycleMeshes.length > 0) {
      if (this.motorcycleMeshes.length === 1) return this.motorcycleMeshes[0];
      return this.motorcycleMeshes[hashSeed(seed) % this.motorcycleMeshes.length];
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

  getTaxiMesh(): CityMesh | CityMesh[] {
    // Prefer the loaded GLTF taxi model.
    if (this.taxiMesh) return this.taxiMesh;
    // Fallback: a yellow cab with a black-and-yellow checker stripe down
    // the side, so the vehicle is still recognisable as a taxi even if
    // the GLTF hasn't finished loading (or is missing).
    const key = 'taxi_fallback';
    if (this.meshCache.has(key)) return this.meshCache.get(key)!;
    const verts: number[] = [];
    const indices: number[] = [];
    // Yellow body
    this.addBox(verts, indices, 0, 0.4, 0, 2.0, 0.8, 4.0, 1.0, 0.85, 0.1, 1.0, 0);
    // Black cabin / window band
    this.addBox(verts, indices, 0, 1.0, -0.2, 1.6, 0.6, 2.0, 0.05, 0.05, 0.05, 1.0, 24);
    // Wheels
    this.addBox(verts, indices, -1.2, 0.2, -1.5, 0.3, 0.4, 0.3, 0.05, 0.05, 0.05, 1.0, 48);
    this.addBox(verts, indices, 1.2, 0.2, -1.5, 0.3, 0.4, 0.3, 0.05, 0.05, 0.05, 1.0, 72);
    this.addBox(verts, indices, -1.2, 0.2, 1.5, 0.3, 0.4, 0.3, 0.05, 0.05, 0.05, 1.0, 96);
    this.addBox(verts, indices, 1.2, 0.2, 1.5, 0.3, 0.4, 0.3, 0.05, 0.05, 0.05, 1.0, 120);
    // Headlights
    this.addBox(verts, indices, -0.5, 0.3, -2.0, 0.3, 0.2, 0.1, 1.0, 0.9, 0.4, 1.0, 144);
    this.addBox(verts, indices, 0.5, 0.3, -2.0, 0.3, 0.2, 0.1, 1.0, 0.9, 0.4, 1.0, 168);
    // Tail lights (red)
    this.addBox(verts, indices, -0.5, 0.3, 2.0, 0.3, 0.2, 0.1, 0.8, 0.0, 0.0, 1.0, 192);
    this.addBox(verts, indices, 0.5, 0.3, 2.0, 0.3, 0.2, 0.1, 0.8, 0.0, 0.0, 1.0, 216);
    // 'TAXI' roof sign — small black box on the roof so it's obviously a cab
    this.addBox(verts, indices, 0, 1.4, 0, 0.8, 0.2, 0.4, 0.05, 0.05, 0.05, 1.0, 240);
    const fm = this.createMesh(verts, indices);
    this.meshCache.set(key, fm);
    return fm;
  }

  /**
   * NEW: Returns the hooker mesh, falling back to a procedural pink
   * figure if the GLTF hasn't loaded yet. Mirrors getTaxiMesh()'s
   * fallback pattern. Used by getPedestrianMesh('hooker', ...) and by
   * the component's passenger state so the skin is identical in both
   * world and seat.
   */
  getHookerMesh(): CityMesh | CityMesh[] {
    if (this.hookerMesh) return this.hookerMesh;
    const key = 'hooker_fallback';
    if (this.meshCache.has(key)) return this.meshCache.get(key)!;
    const verts: number[] = [];
    const indices: number[] = [];
    // Pink dress torso
    this.addBox(verts, indices, 0, 0.9, 0, 0.6, 1.2, 0.4, 0.95, 0.45, 0.65, 1.0, 0);
    // Light skin head
    this.addBox(verts, indices, 0, 1.7, 0, 0.4, 0.4, 0.4, 0.95, 0.78, 0.65, 1.0, 24);
    // Red hair
    this.addBox(verts, indices, 0, 1.9, 0, 0.45, 0.2, 0.45, 0.65, 0.1, 0.15, 1.0, 48);
    // Legs (pink boots)
    this.addBox(verts, indices, -0.15, 0.25, 0, 0.18, 0.6, 0.3, 0.4, 0.15, 0.3, 1.0, 0);
    this.addBox(verts, indices, 0.15, 0.25, 0, 0.18, 0.6, 0.3, 0.4, 0.15, 0.3, 1.0, 0);
    const fm = this.createMesh(verts, indices);
    this.meshCache.set(key, fm);
    return fm;
  }

  // Giant floating arrow / cone marker that hovers above a hailing
  // pedestrian. Rendered with depth test off so it shines through
  // buildings (see render()). The caller animates y with a sine bob and
  // scales the marker via drawMesh scale.
  getHailMarkerMesh(): CityMesh {
    if (this.meshCache.has('hail_marker')) return this.meshCache.get('hail_marker')!;
    const verts: number[] = [];
    const indices: number[] = [];
    // Downward-pointing pyramid (apex at the bottom) — like a map pin.
    // Built from 4 triangular sides + a square base. Apex at y=-1.0,
    // base at y=0.5, so the tip points down toward the pedestrian.
    const apex = [0, -1.0, 0];
    const r = 0.6;
    const topY = 0.5;
    const base = [[
      [-r, topY, -r], [r, topY, -r], [r, topY, r], [-r, topY, r],
    ]];
    // We use the 10-float-per-vertex layout so we can pass explicit
    // normals (createMesh auto-computes normals only for 7-float input).
    // Colours are pure taxi-yellow; the caller tints via drawMesh color.
    // Parameter types are required (noImplicitAny): each vertex is a
    // 3-tuple [x, y, z] and each normal is a 3-tuple [nx, ny, nz].
    const pushTri = (a: number[], b: number[], c: number[], n: number[]) => {
      const baseIdx = verts.length / 10;
      for (const p of [a, b, c]) {
        verts.push(p[0], p[1], p[2], n[0], n[1], n[2], 1.0, 0.85, 0.1, 1.0);
      }
      indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
    };
    const b0 = base[0][0], b1 = base[0][1], b2 = base[0][2], b3 = base[0][3];
    // 4 slanted sides
    pushTri(b0, b1, apex, [-0.4, 0.5, -0.4]);
    pushTri(b1, b2, apex, [0.4, 0.5, -0.4]);
    pushTri(b2, b3, apex, [0.4, 0.5, 0.4]);
    pushTri(b3, b0, apex, [-0.4, 0.5, 0.4]);
    // Top square (so the marker reads as a solid object from above)
    pushTri(b0, b3, b2, [0, 1, 0]);
    pushTri(b0, b2, b1, [0, 1, 0]);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('hail_marker', mesh);
    return mesh;
  }

  // Flat ground ring drawn at the destination. Lies at y≈0.02 so it sits
  // just above the road. Rendered with depth write off so it blends
  // cleanly over the road texture.
  getDestinationMarkerMesh(): CityMesh {
    if (this.meshCache.has('dest_marker')) return this.meshCache.get('dest_marker')!;
    const verts: number[] = [];
    const indices: number[] = [];
    // Ring: outer radius 4, inner radius 3, 32 segments around. Laid
    // flat in the XZ plane (normal = +Y) so it hugs the ground.
    const SEG = 32;
    const rOut = 4.0, rIn = 3.0;
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2;
      const a1 = ((i + 1) / SEG) * Math.PI * 2;
      const baseIdx = verts.length / 10;
      // 4 verts: (in0, out0, out1, in1) — two triangles per segment.
      const pushV = (a: number, r: number) => verts.push(
        Math.cos(a) * r, 0, Math.sin(a) * r,
        0, 1, 0,
        0.1, 1.0, 0.2, 1.0
      );
      pushV(a0, rIn); pushV(a0, rOut); pushV(a1, rOut); pushV(a1, rIn);
      indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
    }
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('dest_marker', mesh);
    return mesh;
  }

  // Vertical translucent beam that shoots up from the destination so the
  // player can see the drop-off from anywhere on the map. Rendered with
  // depth test off and additive-ish alpha so it glows over buildings.
  getDestinationBeamMesh(): CityMesh {
    if (this.meshCache.has('dest_beam')) return this.meshCache.get('dest_beam')!;
    const verts: number[] = [];
    const indices: number[] = [];
    // Thin tall cylinder, height 40m, radius 0.4. Built as 8 segments.
    const SEG = 8;
    const r = 0.4;
    const h = 40.0;
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2;
      const a1 = ((i + 1) / SEG) * Math.PI * 2;
      const baseIdx = verts.length / 10;
      // Bottom ring (y=0) and top ring (y=h). Outward-facing normals.
      const pushV = (a: number, y: number) => verts.push(
        Math.cos(a) * r, y, Math.sin(a) * r,
        Math.cos(a), 0, Math.sin(a),
        0.2, 1.0, 0.3, 0.35
      );
      pushV(a0, 0); pushV(a0, h); pushV(a1, h); pushV(a1, 0);
      indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
    }
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('dest_beam', mesh);
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

    // Flip upside-down GLTF models (e.g. maleNPC).
    // rotateX(π) then rotateY(π) ≡ rotateZ(π), which maps (x,y,z)→(-x,-y,z).
    // This flips Y (upright) and mirrors X (negligible for symmetric characters)
    // while preserving Z direction and winding order.
    const meshList = Array.isArray(mesh) ? mesh : [mesh];
    if (meshList.some(m => m.needsFlip)) {
      mat4.rotateX(this.modelMatrix, this.modelMatrix, Math.PI);
      mat4.rotateY(this.modelMatrix, this.modelMatrix, Math.PI);
      mat4.translate(this.modelMatrix, this.modelMatrix, [0, -2, 0]);
    }

    // Apply180° rotation around Y-axis for motorcycle meshes to flip them
    if (meshList.some(m => m.texture?.toString().includes('motorcycle'))) {
      mat4.rotateY(this.modelMatrix, this.modelMatrix, Math.PI);
    }

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
    vendingMachines: any[],
    playerMesh: CityMesh | CityMesh[] | null,
    // taxiMode visual markers — see TaxiMarker type in the component.
    // 'hail'        : floating arrow above a hailing pedestrian
    // 'destination' : flat ground ring at the drop-off point
    // 'beam'        : tall translucent beam at the drop-off point
    markers: any[],
    // Meshes drawn attached to the player's vehicle (position + yaw
    // follow the player). Used for the taxi passenger: the component
    // populates this with the picked-up ped's mesh and a back-seat
    // offset so the passenger visibly rides along in the cab.
    // offsetX/Z are in the player's LOCAL frame (before yaw rotation)
    attachedMeshes: any[],
    trafficNodes?: { x: number; z: number }[],
    farPlane?: number
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
    for (const pc of parkedCars) this.drawMesh(pc.mesh, pc.x, (pc as any)._expY ?? 0, pc.z, pc.yaw, [1, 1, 1], [1, 1, 1, 1], true);
    for (const npc of serverNPCs) this.drawMesh(npc.mesh, npc.x, 0, npc.z, npc.yaw, [1, 1, 1], [1, 1, 1, 1], true);
    for (const ped of serverPedestrians) this.drawMesh(ped.mesh, ped.x, 0, ped.z, ped.yaw, [1, 1, 1], [1, 1, 1, 1], true);
    for (const p of otherPlayers) {
      // FIX: Skip passengers in the shadow pass — they're drawn inside
      // the host's car in the main pass. Drawing them here would cast
      // a shadow at their stale on-foot position.
      if (p.passengerOfUserId && p.passengerOfUserId > 0) continue;
      if (p.isInCar) {
        // FIX: Use the same vehicleType-based mesh selection as the main pass.
        const vType = p.vehicleType || 'car';
        let carMesh: CityMesh | CityMesh[];
        const col: [number, number, number] = [p.carColorR ?? 1, p.carColorG ?? 1, p.carColorB ?? 1];
        if (vType === 'taxi') carMesh = this.getTaxiMesh();
        else if (vType === 'bus') carMesh = this.busMesh || this.getNPCCarMesh(col, p.userId);
        else if (vType === 'motorcycle') carMesh = this.motorcycleMeshes.length > 0 ? this.motorcycleMeshes[0] : this.getNPCCarMesh(col, p.userId);
        else if (vType === 'police') carMesh = this.getPoliceCarMesh();
        else carMesh = this.carMeshes.length > 0 ? this.carMeshes[0] : this.getNPCCarMesh(col, p.userId);
        this.drawMesh(carMesh, p.posX, 0, p.posZ, p.yaw, [1, 1, 1], [1, 1, 1, 1], true);
      }
      this.drawMesh(p.mesh, p.posX, p.posY, p.posZ, p.yaw, [1, 1, 1], [1, 1, 1, 1], true);
    }
    if (this.hospitalMesh) this.drawMesh(this.hospitalMesh, 40, 0.06, 40, 0, [15, 10, 15], [1, 1, 1, 1], true);
    // FIX: Draw home base (japaneseShop) in shadow pass at building center (120, 40)
    if (this.homeBaseMesh) this.drawMesh(this.homeBaseMesh, 120, 0, 40, 0, [10, 10, 10], [1, 1, 1, 1], true);
    if (this.vendingMachineMesh) {
      for (const vm of vendingMachines) {
        this.drawMesh(this.vendingMachineMesh, vm.x, 0, vm.z, vm.yaw, [1, 1, 1], [1, 1, 1, 1], true);
      }
    }
    if (playerMesh) {
      if (this.skelBoneCount > 0) {
        this.skinPlayerMesh(playerMesh, dt);
        this.skelIsReady = true;
      }
      this.drawMesh(playerMesh, targetX, targetY, targetZ, carYaw, [1, 1, 1], [1, 1, 1, 1], true);
    }
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

    mat4.perspective(this.projMatrix, Math.PI / 4, aspect, 0.1, farPlane ?? 500.0);
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

    // --- Traffic lights at intersections ---
    if (trafficNodes) {
      const lightPhase = Math.floor(performance.now() / 6000) % 2;
      const sidewalkOffset = 22;
      const yawCorner = [Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4];
      const corners = [
        [-sidewalkOffset, -sidewalkOffset],
        [sidewalkOffset, -sidewalkOffset],
        [-sidewalkOffset, sidewalkOffset],
        [sidewalkOffset, sidewalkOffset],
      ];
      if (this.trafficLightMesh) {
        for (const node of trafficNodes) {
          const ndx = node.x - camX, ndz = node.z - camZ;
          if (ndx * ndx + ndz * ndz > 250 * 250) continue;
          for (let ci = 0; ci < corners.length; ci++) {
            this.drawMesh(this.trafficLightMesh, node.x + corners[ci][0], 0, node.z + corners[ci][1], yawCorner[ci], [2, 2, 2]);
          }
        }
        // Draw the coloured indicator lights on the lamp posts at each corner
        // (sidewalk, not mid-road). Red when lightPhase === 0 (horizontal),
        // green when lightPhase === 1.
        const redOn = lightPhase === 0;
        for (const node of trafficNodes) {
          const ndx = node.x - camX, ndz = node.z - camZ;
          if (ndx * ndx + ndz * ndz > 250 * 250) continue;
          for (let ci = 0; ci < corners.length; ci++) {
            const lx = node.x + corners[ci][0];
            const lz = node.z + corners[ci][1];
            this.drawMesh(this.getBoxMesh(0.6, 0.2, 0.6), lx, 4.6, lz, 0, [0.3, 0.3, 0.3], redOn ? [1, 0.1, 0.1, 1] : [0.05, 0.15, 0.05, 0.4]);
            this.drawMesh(this.getBoxMesh(0.6, 0.2, 0.6), lx, 4.2, lz, 0, [0.3, 0.3, 0.3], redOn ? [0.05, 0.15, 0.05, 0.4] : [0.1, 1, 0.1, 1]);
          }
        }
      } else {
        // Fallback: box poles + coloured lights on sidewalk
        const poleMesh = this.meshCache.get('tl_pole');
        if (!poleMesh) {
          const pv: number[] = []; const pi: number[] = [];
          this.addBox(pv, pi, 0, 2.3, 0, 0.2, 4.6, 0.2, 0.06, 0.06, 0.06, 1.0, 0);
          this.meshCache.set('tl_pole', this.createMesh(pv, pi));
        }
        for (const node of trafficNodes) {
          const ndx = node.x - camX, ndz = node.z - camZ;
          if (ndx * ndx + ndz * ndz > 250 * 250) continue;
          for (let ci = 0; ci < corners.length; ci++) {
            const lx = node.x + corners[ci][0];
            const lz = node.z + corners[ci][1];
            this.drawMesh(this.meshCache.get('tl_pole')!, lx, 0, lz, 0, [1, 1, 1], [1, 1, 1, 1]);
          }
          const redOn = lightPhase === 0;
          for (let ci = 0; ci < corners.length; ci++) {
            const lx = node.x + corners[ci][0];
            const lz = node.z + corners[ci][1];
            this.drawMesh(this.getBoxMesh(0.6, 0.2, 0.6), lx, 4.6, lz, 0, [0.3, 0.3, 0.3], redOn ? [1, 0.1, 0.1, 1] : [0.05, 0.15, 0.05, 0.4]);
            this.drawMesh(this.getBoxMesh(0.6, 0.2, 0.6), lx, 4.2, lz, 0, [0.3, 0.3, 0.3], redOn ? [0.05, 0.15, 0.05, 0.4] : [0.1, 1, 0.1, 1]);
          }
        }
      }
    }

    for (const pc of parkedCars) this.drawMesh(pc.mesh, pc.x, (pc as any)._expY ?? 0, pc.z, pc.yaw);

    for (const npc of serverNPCs) {
      // FIX: Apply explosion jump offset (_expY) if the car was launched
      // by a nearby explosion. This makes traffic cars jump too.
      const expY = (npc as any)._expY ?? 0;
      this.drawMesh(npc.mesh, npc.x, expY, npc.z, npc.yaw);
      // NEW (Feature 1): Draw a driver mesh inside the car. Skip
      // on-foot cops (type 'cop') — those aren't vehicles. The
      // driver mesh is positioned at the same offset as the
      // player's driverInCarMesh (offsetX:0.3, offsetY:0.3,
      // offsetZ:0.2) and rotated by the car's yaw.
      if (npc.hasDriver !== false && npc.type !== 'cop') {
        const dMesh = this.getPedestrianMesh(npc.gender || 'male', npc.id);
        const sinY = Math.sin(npc.yaw), cosY = Math.cos(npc.yaw);
        // Driver seat (right side: +0.3 X). Y = -0.3 to sit inside the
        // car cabin instead of sticking out through the roof.
        const dOffX = 0.3, dOffZ = 0.2;
        const dwx = npc.x + (dOffX * cosY + dOffZ * sinY);
        const dwz = npc.z + (-dOffX * sinY + dOffZ * cosY);
        this.drawMesh(dMesh, dwx, -0.3, dwz, npc.yaw, [0.85, 0.85, 0.85]);
        // Front passenger (if any) — left side: -0.3 X
        if ((npc.passengerCount || 0) > 0) {
          const pMesh = this.getPedestrianMesh('female', npc.id + 1);
          const pOffX = -0.3, pOffZ = 0.2;
          const pwx = npc.x + (pOffX * cosY + pOffZ * sinY);
          const pwz = npc.z + (-pOffX * sinY + pOffZ * cosY);
          this.drawMesh(pMesh, pwx, -0.3, pwz, npc.yaw, [0.7, 0.7, 0.7]);
        }
      }
      // Draw Police Lights
      if (npc.type === 'police') {
        const isRed = (performance.now() / 300) % 2 < 1;
        const lightColor: [number, number, number, number] = isRed ? [1, 0, 0, 1] : [0, 0, 1, 1];
        // Draw a flashing box on the roof
        this.drawMesh(this.getBoxMesh(0.8, 0.2, 0.4), npc.x, 1.2, npc.z, npc.yaw, [1, 1, 1], lightColor);
      }
      // Draw brake light for stopped traffic cars
      if (npc.state === 'stop') {
        this.drawMesh(this.getBoxMesh(0.4, 0.2, 0.3), npc.x, 1.0, npc.z, npc.yaw, [1, 1, 1], [1, 0, 0, 1]);
      }
    }

    for (const ped of serverPedestrians) this.drawMesh(ped.mesh, ped.x, 0, ped.z, ped.yaw);
    for (const p of otherPlayers) {
      // FIX: If this player is a passenger in another player's car
      // (passengerOfUserId != 0), skip drawing them here — they'll be
      // drawn inside the host's car below. This prevents the passenger
      // from appearing as a separate on-foot model next to the car.
      if (p.passengerOfUserId && p.passengerOfUserId > 0) {
        // Find the host player and draw the passenger inside their car
        const host = otherPlayers.find(h => h.userId === p.passengerOfUserId);
        if (host && host.isInCar) {
          const sinY = Math.sin(host.yaw), cosY = Math.cos(host.yaw);
          // Passenger seat: left side (-0.3 X), same Z as driver
          const offX = -0.3, offZ = 0.2;
          const wx = host.posX + (offX * cosY + offZ * sinY);
          const wz = host.posZ + (-offX * sinY + offZ * cosY);
          this.drawMesh(p.mesh, wx, -0.3, wz, host.yaw, [0.85, 0.85, 0.85]);
        }
        // If host not found or not in car, skip drawing — the passenger
        // is effectively invisible until the host's data arrives. This
        // is better than showing them standing at a stale position.
        continue;
      }
      // If the other player is in a car (as the driver), draw a car
      // mesh under them and position their character mesh at the
      // driver seat offset (same convention as driverInCarMesh).
      // This makes their car visible — and carjackable — to us.
      if (p.isInCar) {
        // FIX: Pick the correct car mesh based on the player's vehicleType
        // instead of always using carMeshes[0]. This matches the same
        // mesh-selection logic used in pollNPCs for NPC cars.
        const vType = p.vehicleType || 'car';
        let carMesh: CityMesh | CityMesh[];
        const col: [number, number, number] = [p.carColorR ?? 1, p.carColorG ?? 1, p.carColorB ?? 1];
        if (vType === 'taxi') {
          carMesh = this.getTaxiMesh();
        } else if (vType === 'bus') {
          carMesh = this.busMesh || this.getNPCCarMesh(col, p.userId);
        } else if (vType === 'motorcycle') {
          carMesh = this.motorcycleMeshes.length > 0
            ? this.motorcycleMeshes[0]
            : this.getNPCCarMesh(col, p.userId);
        } else if (vType === 'police') {
          carMesh = this.getPoliceCarMesh();
        } else {
          carMesh = this.carMeshes.length > 0
            ? this.carMeshes[0]
            : this.getNPCCarMesh(col, p.userId);
        }
        this.drawMesh(carMesh, p.posX, 0, p.posZ, p.yaw);
        const sinY = Math.sin(p.yaw), cosY = Math.cos(p.yaw);
        const offX = 0.3, offZ = 0.2;
        const wx = p.posX + (offX * cosY + offZ * sinY);
        const wz = p.posZ + (-offX * sinY + offZ * cosY);
        // Y = -0.3 to sit inside the car cabin instead of sticking out.
        this.drawMesh(p.mesh, wx, -0.3, wz, p.yaw, [0.85, 0.85, 0.85]);
      } else {
        this.drawMesh(p.mesh, p.posX, p.posY, p.posZ, p.yaw);
      }
    }

    // Draw the hospital at its fixed world location (block center of
    // chunk 0,0). Only one exists. The procedural building for this chunk
    // is suppressed in getCityChunk() to make room.
    if (this.hospitalMesh) {
      this.drawMesh(this.hospitalMesh, 40, 0.06, 40, 0, [15, 10, 15]);
    }
    // FIX: Draw home base (japaneseShop) at building center (120, 40) —
    // chunk (1, 0). One block east of the hospital. The procedural
    // building for this chunk is suppressed in getCityChunk().
    if (this.homeBaseMesh) {
      this.drawMesh(this.homeBaseMesh, 120, 0, 40, 0, [10, 10, 10]);
    }
    // FIX: Draw the stored car inside the garage (if any).
    if (this.garageCarMesh) {
      this.drawMesh(this.garageCarMesh, 120, 0, 42, 0);
    }

    // Draw vending machines at their procedural positions.
    if (this.vendingMachineMesh) {
      for (const vm of vendingMachines) {
        this.drawMesh(this.vendingMachineMesh, vm.x, 0, vm.z, vm.yaw);
      }
    }

    if (playerMesh) this.drawMesh(playerMesh, targetX, targetY, targetZ, carYaw);

    // Attached meshes (e.g. taxi passenger) — drawn relative to the
    // player's vehicle. The component supplies an offset in the
    // player's LOCAL frame; we rotate it by carYaw so the passenger
    // stays in the back seat when the cab turns.
    if (attachedMeshes && attachedMeshes.length > 0) {
      const sinY = Math.sin(carYaw), cosY = Math.cos(carYaw);
      for (const am of attachedMeshes) {
        // Rotate (offsetX, offsetZ) by carYaw to get world-space delta.
        // Forward in the player's frame is +Z, which maps to
        // (sin(yaw), cos(yaw)) in world space — matching how the
        // movement code in updateCar() applies acceleration.
        const wx = targetX + (am.offsetX * cosY + am.offsetZ * sinY);
        const wz = targetZ + (-am.offsetX * sinY + am.offsetZ * cosY);
        const s = am.scale ?? 1;
        this.drawMesh(am.mesh, wx, targetY + am.offsetY, wz, carYaw + am.yaw, [s, s, s]);
      }
    }

    // Flying blood particles — always render on top (depth test off).
    gl.disable(gl.DEPTH_TEST);
    for (const b of bloodSplats) {
      const t = b.age / b.lifetime;
      const alpha = 1.0 - t;
      // Slight darken as the droplet ages (oxidation), plus shrink slightly.
      const sz = b.size * (1.0 - t * 0.3);
      const tint = 0.85 - t * 0.25;
      this.drawMesh(this.getBloodMesh(), b.x, b.y, b.z, 0, [sz, sz, sz], [tint, 0.0, 0.0, alpha]);
    }

    // Ground decals (blood pools, money stacks) live at y=0.01 and MUST be
    // depth-tested so they're occluded by buildings, walls, cars, and other
    // world geometry. Without this they render through everything.
    // Disable depth WRITES so overlapping decals blend correctly instead of
    // one hiding the other.
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    for (const bp of bloodPools) {
      const progress = bp.age / bp.lifetime;
      const poolScale = 1 + progress * bp.maxRadius;
      const alpha = Math.max(0, 1.0 - progress * 0.5);
      // Slight random rotation per pool (based on position) so the blobs
      // don't all align the same way. Deterministic so the pool doesn't
      // spin as it grows.
      const rot = ((bp.x * 0.7 + bp.z * 1.3) % (Math.PI * 2));
      this.drawMesh(this.getBloodPoolMesh(bp.variant || 0), bp.x, 0.01, bp.z, rot, [poolScale, 1, poolScale], [1.0, 1.0, 1.0, alpha]);
    }
    for (const ms of moneyStacks) {
      const progress = ms.age / ms.lifetime;
      const alpha = 1.0 - progress;
      this.drawMesh(this.getMoneyStackMesh(), ms.x, 0.01, ms.z, ms.yaw || 0, [1, 1, 1], [1, 1, 1, alpha]);
    }
    gl.depthMask(true);

    // Dead bodies are solid 3D meshes — they need full depth test AND depth
    // write so they're occluded by walls and properly occlude things behind them.
    for (const db of deadBodies) {
      const isHuman = db.type === 'player' || db.type === 'ped_male' || db.type === 'ped_female' || db.type === 'cop';
      const dbPitch = isHuman ? -Math.PI / 2 : 0;
      const elapsed = (performance.now() / 1000) - db.deathTime;
      const fadeAlpha = Math.max(0.4, 1.0 - elapsed / 30);
      this.drawMesh(db.mesh, db.x, 0.02, db.z, -db.yaw, [1, 1, 1], [0.4, 0.4, 0.4, fadeAlpha], false, dbPitch);
    }

    // Tracers / rockets / explosions / muzzle flashes are bright overlay
    // effects — disable depth test again so they always render on top.
    gl.disable(gl.DEPTH_TEST);
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
    for (const r of rockets) {
      const yaw = Math.atan2(r.vx, r.vz);
      const rocketScale = this.rocketMesh ? [0.15, 0.15, 0.15] : [1, 1, 1];
      this.drawMesh(this.getRocketMesh(), r.x, r.y, r.z, yaw, rocketScale as [number, number, number], [1, 1, 1, 1]);
    }
    for (const e of explosions) {
      const progress = e.age / e.lifetime;
      // FIX: Multi-layer explosion for depth-appropriate look.
      // Layer 1: Bright yellow-white core (expands fast, fades fast)
      const coreScale = 1 + progress * 4;
      const coreAlpha = (1.0 - progress) * 1.2;
      this.drawMesh(this.getExplosionMesh(), e.x, e.y + 0.5, e.z, 0, [coreScale, coreScale, coreScale], [1, 1, 1, Math.min(1, coreAlpha)]);
      // Layer 2: Orange fireball (larger, slightly delayed expansion)
      const fireScale = 2 + progress * 8;
      const fireAlpha = (1.0 - progress) * 0.8;
      this.drawMesh(this.getExplosionMesh(), e.x, e.y + 1.0, e.z, 0, [fireScale, fireScale * 0.8, fireScale], [1, 0.5, 0.0, fireAlpha]);
      // Layer 3: Dark smoke (largest, slow expansion, fades to dark)
      const smokeScale = 3 + progress * 12;
      const smokeAlpha = (1.0 - progress) * 0.5;
      this.drawMesh(this.getExplosionMesh(), e.x, e.y + 2.0 + progress * 3, e.z, 0, [smokeScale, smokeScale, smokeScale], [0.2, 0.2, 0.2, smokeAlpha]);
    }
    for (const m of muzzleFlashes) {
      // Simple visible muzzle flash: a small bright 3D star (crossed boxes)
      // positioned 1.5m in front of the player along the shoot direction.
      // The 3D mesh has faces pointing in all directions, so it's visible
      // from any camera angle and at least one face always catches the sun.
      const t = m.age / m.lifetime;
      const alpha = 1.0 - t;
      const weaponScale = m.weapon === 2 ? 1.4 : m.weapon === 1 ? 1.0 : 0.75;

      // Position 1.5m forward along the shoot direction — clearly in front
      // of the player, not inside their chest. No targetTo / rotation
      // matrices needed because the star mesh is 3D and visible from any
      // angle.
      const dirLen = Math.hypot(m.dirX, m.dirY, m.dirZ) || 1;
      const fx = m.dirX / dirLen, fy = m.dirY / dirLen, fz = m.dirZ / dirLen;
      const barrelOffset = 1.5;
      const flashX = m.x + fx * barrelOffset;
      const flashY = m.y + fy * barrelOffset;
      const flashZ = m.z + fz * barrelOffset;

      // Slight scale flicker for visual interest.
      const s = weaponScale * (0.9 + 0.2 * Math.sin(t * 40));
      this.drawMesh(this.getMuzzleFlashMesh(), flashX, flashY, flashZ, 0, [s, s, s], [1.0, 1.0, 1.0, alpha]);
    }

    // --- Taxi-mode markers ---
    // Ground ring is depth-tested (occluded by buildings). Hail markers
    // and the destination beam render on top so the player can always
    // see where to go.
    if (markers && markers.length > 0) {
      // Disable back-face culling for marker rendering. The pyramid
      // hail marker and the thin destination beam are built from
      // hand-rolled triangles whose winding isn't guaranteed to match
      // the rest of the scene's CCW convention — disabling cull here
      // ensures the markers are visible from every camera angle.
      gl.disable(gl.CULL_FACE);
      // First pass: ground rings (depth test ON, depth write OFF so
      // overlapping decals blend).
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(false);
      for (const m of markers) {
        if (m.type === 'destination') {
          const pulse = 1.0 + 0.15 * Math.sin(performance.now() / 250);
          this.drawMesh(this.getDestinationMarkerMesh(), m.x, 0.02, m.z, 0, [pulse, 1, pulse], [1.0, 1.0, 1.0, 1.0]);
        }
      }
      gl.depthMask(true);

      // Second pass: hail markers + destination beam — always on top.
      gl.disable(gl.DEPTH_TEST);
      for (const m of markers) {
        if (m.type === 'hail') {
          // Bob up and down 0.3m around y=3.2 (above the ped's head).
          const bob = Math.sin(performance.now() / 300 + (m.phase || 0)) * 0.3;
          this.drawMesh(this.getHailMarkerMesh(), m.x, 3.2 + bob, m.z, performance.now() / 600, [1.4, 1.4, 1.4], [1.0, 1.0, 1.0, 1.0]);
        } else if (m.type === 'beam') {
          const pulse = 0.8 + 0.2 * Math.sin(performance.now() / 200);
          this.drawMesh(this.getDestinationBeamMesh(), m.x, 0, m.z, 0, [1, 1, 1], [1.0, 1.0, 1.0, pulse]);
        }
      }
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
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

  private getRocketMesh(): CityMesh | CityMesh[] {
    if (this.rocketMesh) return this.rocketMesh;
    if (this.meshCache.has('rocket')) return this.meshCache.get('rocket')!;
    const verts: number[] = [], indices: number[] = [];
    this.addBox(verts, indices, 0, 0, 0, 0.3, 0.3, 1.5, 1.0, 0.2, 0.2, 1.0, 0);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('rocket', mesh);
    return mesh;
  }

  private getExplosionMesh(): CityMesh {
    if (this.meshCache.has('explosion')) return this.meshCache.get('explosion')!;
    // FIX: Build a sphere (icosphere-like) instead of a cube for a more
    // realistic explosion shape. The sphere is built from latitude/longitude
    // subdivisions, with outward-facing normals so lighting works.
    const verts: number[] = [], indices: number[] = [];
    const stacks = 6, slices = 10;
    let vIdx = 0;
    for (let stack = 0; stack <= stacks; stack++) {
      const phi = (stack / stacks) * Math.PI; // 0..π (top to bottom)
      const y = Math.cos(phi);
      const r = Math.sin(phi);
      for (let slice = 0; slice <= slices; slice++) {
        const theta = (slice / slices) * Math.PI * 2;
        const x = r * Math.cos(theta);
        const z = r * Math.sin(theta);
        // Position (radius 0.5)
        verts.push(x * 0.5, y * 0.5, z * 0.5);
        // Normal (outward)
        verts.push(x, y, z);
        // Color (orange — overridden by drawMesh color multiplier)
        verts.push(1.0, 0.5, 0.0, 1.0);
        // UV
        verts.push(slice / slices, stack / stacks);
        vIdx++;
      }
    }
    // Build faces
    for (let stack = 0; stack < stacks; stack++) {
      for (let slice = 0; slice < slices; slice++) {
        const a = stack * (slices + 1) + slice;
        const b = a + 1;
        const c = a + (slices + 1);
        const d = c + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('explosion', mesh);
    return mesh;
  }

  private getMuzzleFlashMesh(): CityMesh {
    // 3D muzzle flash "star" — a bright center cube plus 3 perpendicular
    // elongated spikes (along X, Y, Z). All 3D, so visible from any
    // camera angle. Uses addBox (7 floats/vertex) — createMesh
    // synthesizes outward normals via triangle winding, so each face
    // lights correctly and at least one face always catches the sun.
    if (this.meshCache.has('muzzle_flash')) return this.meshCache.get('muzzle_flash')!;
    const verts: number[] = [], indices: number[] = [];

    // Bright yellow-white center cube
    this.addBox(verts, indices, 0, 0, 0, 0.4, 0.4, 0.4, 1.0, 0.95, 0.7, 1.0, 0);
    // Forward spike along +Z (the barrel direction) — bright yellow
    this.addBox(verts, indices, 0, 0, 0.55, 0.18, 0.18, 1.1, 1.0, 0.85, 0.3, 1.0, 24);
    // Side spike along +X — orange
    this.addBox(verts, indices, 0.45, 0, 0, 0.9, 0.15, 0.15, 1.0, 0.6, 0.15, 1.0, 48);
    // Vertical spike along +Y — orange
    this.addBox(verts, indices, 0, 0.45, 0, 0.15, 0.9, 0.15, 1.0, 0.6, 0.15, 1.0, 72);

    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('muzzle_flash', mesh);
    return mesh;
  }

  private getBloodMesh(): CityMesh {
    // Small sphere — looks like a flying blood droplet, not a red cube.
    // The size is then scaled per-particle via drawMesh's scale parameter.
    // NOTE: pushes 10 floats per vertex (pos3+norm3+color4) to match the
    // 10-float branch of createMesh. Do NOT mix with addBox (7 floats) here.
    if (this.meshCache.has('blood')) return this.meshCache.get('blood')!;
    const verts: number[] = [], indices: number[] = [];
    const stacks = 5, slices = 8;
    for (let i = 0; i <= stacks; i++) {
      const v = i / stacks;
      const theta = v * Math.PI;
      const sinT = Math.sin(theta), cosT = Math.cos(theta);
      for (let j = 0; j <= slices; j++) {
        const u = j / slices;
        const phi = u * Math.PI * 2;
        const sinP = Math.sin(phi), cosP = Math.cos(phi);
        const x = cosP * sinT, y = cosT, z = sinP * sinT;
        verts.push(x * 0.5, y * 0.5, z * 0.5, x, y, z, 0.75, 0.0, 0.0, 1.0);
      }
    }
    for (let i = 0; i < stacks; i++) {
      for (let j = 0; j < slices; j++) {
        const aI = i * (slices + 1) + j;
        const bI = (i + 1) * (slices + 1) + j;
        indices.push(aI, bI, aI + 1, bI, bI + 1, aI + 1);
      }
    }
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('blood', mesh);
    return mesh;
  }

  private getBloodPoolMesh(variant: number = 0): CityMesh {
    // Irregular 16-sided blob shape, different per variant. Darker color at
    // the center (oxidized blood), lighter at the edges (fresh blood).
    // Clockwise winding (when viewed from above) gives upward-facing normals
    // so the pool is lit correctly by the sun.
    const key = `bloodpool_${variant}`;
    if (this.meshCache.has(key)) return this.meshCache.get(key)!;
    const verts: number[] = [], indices: number[] = [];

    // Seeded RNG so each variant is different but deterministic.
    const rng = this.mulberry32(variant * 7919 + 31);

    const SEGMENTS = 16;
    const centerIdx = 0;

    // Center vertex: darker (oxidized)
    verts.push(0, 0, 0, 0.35, 0.0, 0.0, 1.0);

    // Perimeter vertices: lighter (fresh), randomized radius for organic blob
    for (let i = 0; i < SEGMENTS; i++) {
      const theta = (i / SEGMENTS) * Math.PI * 2;
      // Base radius 0.85, vary +/- 0.20 per vertex for irregular shape
      const r = 0.85 + (rng() - 0.5) * 0.40;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      // Slight color variation around the perimeter
      const tint = 0.55 + (rng() - 0.5) * 0.10;
      verts.push(x, 0, z, tint, 0.0, 0.0, 1.0);
    }

    // Triangle fan with clockwise winding (when viewed from above) for
    // upward-facing normals. Triangle = (center, i+1, i) so that the cross
    // product (perim[i+1] - center) x (perim[i] - center) points +Y.
    for (let i = 0; i < SEGMENTS; i++) {
      const next = (i + 1) % SEGMENTS;
      indices.push(centerIdx, 1 + next, 1 + i);
    }

    const mesh = this.createMesh(verts, indices);
    this.meshCache.set(key, mesh);
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
        this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img);
        this.gl.generateMipmap(this.gl.TEXTURE_2D);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.REPEAT);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.REPEAT);
        resolve(tex);
      };
      img.onerror = () => { console.error('Failed to load texture:', url); resolve(null); };
      img.src = (url.startsWith('blob:') || url.startsWith('data:')) ? url : bust(url);
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
      const primitiveData: { verts: number[]; indices: number[]; texture: WebGLTexture | null; restPos?: Float32Array; restNrm?: Float32Array; jointIdx?: Uint16Array; jointWgt?: Float32Array; vCount: number; isSkinned?: boolean }[] = [];

      let globalMinX = Infinity, globalMaxX = -Infinity;
      let globalMinY = Infinity, globalMaxY = -Infinity;
      let globalMinZ = Infinity, globalMaxZ = -Infinity;
      const textureCache = new Map<number, WebGLTexture | null>();

      // Build node transform list from node hierarchy
      const entries: { meshIndex: number; transform: Float32Array; nodeIndex: number }[] = [];
      if (json.nodes && json.nodes.length > 0 && json.scenes) {
        const identity = mat4.identity(mat4.create());
        const traverse = (nodeIdx: number, parentWorld: Float32Array) => {
          const node = json.nodes[nodeIdx];
          const local = mat4.create();
          if (node.matrix) { for (let i = 0; i < 16; i++) local[i] = node.matrix[i]; }
          else { mat4.identity(local); }
          const world = mat4.create();
          mat4.multiply(world, parentWorld, local);
          if (node.mesh !== undefined) entries.push({ meshIndex: node.mesh, transform: world, nodeIndex: nodeIdx });
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
          entries.push({ meshIndex: mi, transform: identity, nodeIndex: -1 });
        }
      }

      // Parse skin data if present
      let isSkinnedModel = false;
      let boneParents: Int32Array | null = null;
      let boneLocalMatrices: Float32Array | null = null;
      let inverseBindMatrices: Float32Array | null = null;
      let nodeToBoneIdx: Map<number, number> | null = null;
      let skeletonRootNodeIdx = -1;
      let skinRootWorld: Float32Array | null = null;

      if (json.skins && json.skins.length > 0) {
        const skin = json.skins[0];
        const jointNodes: number[] = skin.joints;
        const numBones = jointNodes.length;
        nodeToBoneIdx = new Map();
        for (let b = 0; b < numBones; b++) nodeToBoneIdx.set(jointNodes[b], b);

        // Parse inverse bind matrices
        const ibmAcc = json.accessors[skin.inverseBindMatrices];
        const ibmBufView = json.bufferViews[ibmAcc.bufferView];
        const ibmBuf = buffers[ibmBufView.buffer];
        const ibmByteOff = (ibmBufView.byteOffset || 0) + (ibmAcc.byteOffset || 0);
        inverseBindMatrices = new Float32Array(ibmBuf, ibmByteOff, numBones * 16);

        // Build bone hierarchy and local transforms from node tree
        const boneLocalTf = new Float32Array(numBones * 16);
        const parents = new Int32Array(numBones);
        parents.fill(-1);

        // First, collect all node world transforms
        const nodeWorldTransforms = new Map<number, Float32Array>();
        // Add parent references to nodes for hierarchy building
        const addParents = (nodeIdx: number, parentIdx: number) => {
          json.nodes[nodeIdx].parent = parentIdx;
          for (const child of (json.nodes[nodeIdx].children || [])) addParents(child, nodeIdx);
        };
        for (const rootIdx of (json.scenes[json.scene ?? 0]?.nodes || [])) addParents(rootIdx, -1);

        const traverseNodes = (nodeIdx: number, parentWorld: Float32Array) => {
          const node = json.nodes[nodeIdx];
          const local = mat4.create();
          if (node.matrix) { for (let i = 0; i < 16; i++) local[i] = node.matrix[i]; }
          else if (node.rotation || node.translation) {
            const q = node.rotation || [0, 0, 0, 1];
            const t = node.translation || [0, 0, 0];
            const s = node.scale || [1, 1, 1];
            quatPosScaleToMat4([q[0], q[1], q[2], q[3]], [t[0], t[1], t[2]], [s[0], s[1], s[2]], local);
          }
          const world = mat4.create();
          mat4.multiply(world, parentWorld, local);
          nodeWorldTransforms.set(nodeIdx, world);
          for (const child of (node.children || [])) traverseNodes(child, world);
        };
        for (const rootIdx of (json.scenes[json.scene ?? 0]?.nodes || [])) {
          traverseNodes(rootIdx, mat4.identity(mat4.create()));
        }

        // For each bone, find its parent and store local transform
        for (let b = 0; b < numBones; b++) {
          const nodeIdx = jointNodes[b];
          const node = json.nodes[nodeIdx];
          const parentIdx = node.parent ?? -1;
          if (parentIdx >= 0 && nodeToBoneIdx.has(parentIdx)) {
            parents[b] = nodeToBoneIdx.get(parentIdx)!;
          } else {
            if (skeletonRootNodeIdx < 0) skeletonRootNodeIdx = nodeIdx;
          }
          const local = mat4.create();
          if (node.matrix) { for (let i = 0; i < 16; i++) local[i] = node.matrix[i]; }
          else if (node.rotation || node.translation) {
            const q = node.rotation || [0, 0, 0, 1];
            const t = node.translation || [0, 0, 0];
            const s = node.scale || [1, 1, 1];
            quatPosScaleToMat4([q[0], q[1], q[2], q[3]], [t[0], t[1], t[2]], [s[0], s[1], s[2]], local);
          }
          for (let i = 0; i < 16; i++) boneLocalTf[b * 16 + i] = local[i];
        }

        if (skeletonRootNodeIdx >= 0) {
          skinRootWorld = nodeWorldTransforms.get(skeletonRootNodeIdx) || mat4.identity(mat4.create());
        }

        boneParents = parents;
        boneLocalMatrices = boneLocalTf;
        isSkinnedModel = true;

        // Store skeleton data on renderer for later CPU skinning
        this.skelBoneParents = parents;
        this.skelBoneLocalMatrices = boneLocalTf;
        this.skelInverseBindMatrices = inverseBindMatrices;
        this.skelBoneCount = numBones;
        this.skelNodeToBoneIdx = nodeToBoneIdx;
        this.skelJointMatrices = new Float32Array(numBones * 16);
        this.skelSkinRootWorld = skinRootWorld ? new Float32Array(skinRootWorld) : null;
        this.skelIsReady = false;

        // Compute bind-pose world transforms for each bone
        this.skelBindWorldMatrices = new Float32Array(numBones * 16);
        for (let b = 0; b < numBones; b++) {
          if (parents[b] < 0) {
            mat4.multiply(
              new Float32Array(this.skelBindWorldMatrices.buffer, b * 16 * 4, 16),
              skinRootWorld!,
              new Float32Array(boneLocalTf.buffer, b * 16 * 4, 16)
            );
          }
        }
        for (let b = 0; b < numBones; b++) {
          if (parents[b] >= 0) {
            const pIdx = parents[b];
            mat4.multiply(
              new Float32Array(this.skelBindWorldMatrices.buffer, b * 16 * 4, 16),
              new Float32Array(this.skelBindWorldMatrices.buffer, pIdx * 16 * 4, 16),
              new Float32Array(boneLocalTf.buffer, b * 16 * 4, 16)
            );
          }
        }

        // Compute bind-pose joint matrices: jointMat[b] = bindWorld[b] * inverseBind[b]
        this.skelBindJointMatrices = new Float32Array(numBones * 16);
        for (let b = 0; b < numBones; b++) {
          const bindWorld = new Float32Array(this.skelBindWorldMatrices.buffer, b * 16 * 4, 16);
          const invBind = new Float32Array(inverseBindMatrices.buffer, b * 16 * 4, 16);
          mat4.multiply(
            new Float32Array(this.skelBindJointMatrices.buffer, b * 16 * 4, 16),
            bindWorld,
            invBind
          );
        }
      }

      // Helper: transform a vec3 by a4x4 matrix
      const txPos = (m: Float32Array, x: number, y: number, z: number): [number, number, number] => {
        const w = m[3] * x + m[7] * y + m[11] * z + m[15];
        const invW = w !== 0 ? 1 / w : 1;
        return [
          (m[0] * x + m[4] * y + m[8] * z + m[12]) * invW,
          (m[1] * x + m[5] * y + m[9] * z + m[13]) * invW,
          (m[2] * x + m[6] * y + m[10] * z + m[14]) * invW,
        ];
      };
      // Helper: transform a normal by the upper-left3x3 (no translation)
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

        // Check if this entry's node has a skin reference
        const entryNode = json.nodes[entry.nodeIndex];
        const isSkinned = isSkinnedModel && entryNode && entryNode.skin !== undefined;

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

          // Read skin data if this is a skinned primitive
          let restPos: Float32Array | undefined;
          let restNrm: Float32Array | undefined;
          let jointIdx: Uint16Array | undefined;
          let jointWgt: Float32Array | undefined;

          if (isSkinned && prim.attributes.JOINTS_0 !== undefined && prim.attributes.WEIGHTS_0 !== undefined) {
            restPos = new Float32Array(vCount * 3);
            for (let i = 0; i < vCount; i++) {
              const pi = (posOffset / 4) + i * posStride;
              restPos[i * 3] = posData[pi];
              restPos[i * 3 + 1] = posData[pi + 1];
              restPos[i * 3 + 2] = posData[pi + 2];
            }
            restNrm = new Float32Array(vCount * 3);
            if (normData) {
              for (let i = 0; i < vCount; i++) {
                const ni = (normOffset / 4) + i * normStride;
                restNrm[i * 3] = normData[ni];
                restNrm[i * 3 + 1] = normData[ni + 1];
                restNrm[i * 3 + 2] = normData[ni + 2];
              }
            } else {
              for (let i = 0; i < vCount * 3; i++) restNrm[i] = i % 3 === 1 ? 1 : 0;
            }
            const jiAcc = json.accessors[prim.attributes.JOINTS_0];
            const jiBufView = json.bufferViews[jiAcc.bufferView];
            const jiBuf = buffers[jiBufView.buffer];
            const jiByteOff = (jiBufView.byteOffset || 0) + (jiAcc.byteOffset || 0);
            const jiStride = jiBufView.byteStride || 8;
            jointIdx = new Uint16Array(vCount * 4);
            if (jiAcc.componentType === 5123) {
              for (let i = 0; i < vCount; i++) {
                const src = new Uint16Array(jiBuf, jiByteOff + i * jiStride, 4);
                jointIdx[i * 4] = src[0]; jointIdx[i * 4 + 1] = src[1];
                jointIdx[i * 4 + 2] = src[2]; jointIdx[i * 4 + 3] = src[3];
              }
            }
            const wgtAcc = json.accessors[prim.attributes.WEIGHTS_0];
            const wgtBufView = json.bufferViews[wgtAcc.bufferView];
            const wgtBuf = buffers[wgtBufView.buffer];
            const wgtByteOff = (wgtBufView.byteOffset || 0) + (wgtAcc.byteOffset || 0);
            const wgtStride = wgtBufView.byteStride || 16;
            jointWgt = new Float32Array(vCount * 4);
            for (let i = 0; i < vCount; i++) {
              const src = new Float32Array(wgtBuf, wgtByteOff + i * wgtStride, 4);
              jointWgt[i * 4] = src[0]; jointWgt[i * 4 + 1] = src[1];
              jointWgt[i * 4 + 2] = src[2]; jointWgt[i * 4 + 3] = src[3];
            }
          }

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

          primitiveData.push({ verts, indices, texture, restPos, restNrm, jointIdx, jointWgt, vCount, isSkinned });
        }
      }

      if (primitiveData.length === 0) return null;
      // Second pass: Calculate global transformations
      const dimX = globalMaxX - globalMinX;
      const dimY = globalMaxY - globalMinY;
      const dimZ = globalMaxZ - globalMinZ;

      let needsRotation = false;
      if (url.includes('citylight') || url.includes('jillValentine') || url.includes('maleNPC') || url.includes('redneck')) {
        if (dimY < dimX || dimY < dimZ) {
          needsRotation = true;
        }
      }
      // Car models face -Z (OpenGL convention), flip180° around Y to face +Z
      const needsYFlip = url.includes('crownVic') || url.includes('maleNPC') || url.includes('taxi') || url.includes('hilux');
      // FIX: pizzaMoped faces -X (backwards), so it needs BOTH the 180° Y
      // flip (to face +Z convention like other cars) AND a 90° Y rotation
      // to align with the forward axis. Without the Y flip, the model
      // appears backwards when driving forward.
      const needsY90 = url.includes('pizzaMoped');
      const needsYFlipMoped = url.includes('pizzaMoped');

      // Redneck ships lying on its BACK (head along local -Z), so it needs +π/2 around X
      // to stand up. Face-down models (head along +Z) use -π/2.
      // Face-down models (head along +Z) use -π/2; face-up (head along -Z)
      // use +π/2. Add new characters to the appropriate branch based on
      // how their source GLTF was authored.
      const angleX = needsRotation
        ? (url.includes('redneck') ? Math.PI / 2 : -Math.PI / 2)
        : 0;
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);

      let rotMinX = Infinity, rotMaxX = -Infinity;
      let rotMinY = Infinity, rotMaxY = -Infinity;
      let rotMinZ = Infinity, rotMaxZ = -Infinity;

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
          if (needsYFlip) {
            x = -x;
            z = -z;
          }
          // FIX: Apply 180° Y flip to pizzaMoped so it faces forward.
          if (needsYFlipMoped) {
            x = -x;
            z = -z;
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

      // Bus: ~2x as wide (X), tall (Y), and long (Z).
      const extraScale: [number, number, number] = url.includes('/bus/') ? [2, 2, 2] : [1, 1, 1];

      // Store skinning transform parameters for later CPU skinning
      if (isSkinnedModel) {
        this.skelNeedsRotation = needsRotation;
        this.skelAngleX = angleX;
        this.skelCosX = cosX;
        this.skelSinX = sinX;
        this.skelNeedsYFlip = needsYFlip;
        this.skelNeedsY90 = needsY90;
        this.skelNeedsYFlipMoped = needsYFlipMoped;
        this.skelCenterX = centerX;
        this.skelCenterY = centerY;
        this.skelCenterZ = centerZ;
        this.skelScaleFactor = scaleFactor;
        this.skelExtraScale = extraScale;
      }

      // Apply global scaling and rotation to all primitives
      for (const p of primitiveData) {
        const { verts, indices, texture, restPos, restNrm, jointIdx, jointWgt, vCount, isSkinned } = p;
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
          if (needsYFlip) {
            x = -x;
            z = -z;
            const nx = verts[i + 3];
            const nz = verts[i + 5];
            verts[i + 3] = -nx;
            verts[i + 5] = -nz;
          }
          // FIX: Apply 180° Y flip to pizzaMoped normals too.
          if (needsYFlipMoped) {
            x = -x;
            z = -z;
            const nx = verts[i + 3];
            const nz = verts[i + 5];
            verts[i + 3] = -nx;
            verts[i + 5] = -nz;
          }
          if (needsY90) {
            // Rotate 90° clockwise around Y: +X → +Z
            const tmpX = x;
            x = z;
            z = -tmpX;
            const ntmpX = verts[i + 3];
            verts[i + 3] = verts[i + 5];
            verts[i + 5] = -ntmpX;
          }

          verts[i] = (x - centerX) * scaleFactor * extraScale[0];
          verts[i + 1] = (y - centerY) * scaleFactor * extraScale[1];
          verts[i + 2] = (z - centerZ) * scaleFactor * extraScale[2];
        }

        const mesh = this.createMesh(verts, indices, texture);
        if (isSkinned && restPos && restNrm && jointIdx && jointWgt) {
          mesh.vertexCount = vCount;
          mesh.restPositions = restPos;
          mesh.restNormals = restNrm;
          mesh.jointIndices = jointIdx;
          mesh.jointWeights = jointWgt;
        }
        if (indices.length > 0 && verts.length > 0) {
          meshes.push(mesh);
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