export interface CityMesh {
  originalVBO?: Float32Array;
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  ibo: WebGLBuffer;
  indexCount: number;
  indexType?: number;
  texture?: WebGLTexture | null;
  needsFlip?: boolean;
  vertexCount?: number;
  restPositions?: Float32Array;
  restNormals?: Float32Array;
  jointIndices?: Uint16Array;
  jointWeights?: Float32Array;
  minY?: number;
  maxY?: number;
  minX?: number;
  maxX?: number;
  minZ?: number;
  maxZ?: number;
  carName?: string;
  meshName?: string;
  renderScale?: number;
  yawOffset?: number;
}
export interface GltfAnimation {
  name: string;
  duration: number;                       // seconds (longest channel)
  channels: {
    nodeIndex: number;                    // GLTF node index
    path: 'translation' | 'rotation' | 'scale' | 'weights';
    sampler: {
      input: Float32Array;                // keyframe times (seconds)
      output: Float32Array;               // flat values (3 for translation, 4 for rotation, 3 for scale)
      interpolation: 'LINEAR' | 'STEP' | 'CUBICSPLINE';
    };
  }[];
}
export interface BuildingPlacement {
  model: CityMesh[];
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: [number, number, number];
}
export interface CityChunk {
  mesh: CityMesh;
  cx: number;
  cz: number;
  lamps: { x: number; z: number }[];
  hydrants: { x: number; z: number }[];
  buildings: BuildingPlacement[];
  benches: { x: number; z: number; yaw: number }[];
  barrels: { x: number; z: number; yaw: number }[];
  chickens: { x: number; z: number; yaw: number }[];
  trees: { x: number; z: number; yaw: number; scale: number }[];
  supermarkets: { x: number; z: number; yaw: number }[];
  tatami: { x: number; z: number; yaw: number }[];
  cabins: { x: number; z: number; yaw: number }[];
  lighthouses: { x: number; z: number; yaw: number }[];
  tropicalShops: { x: number; z: number; yaw: number }[];
  decorativeAircraft: { x: number; z: number; yaw: number; type: string }[];
}

const CHUNK_SIZE = 80;
const GRID_PITCH = 80;
const BLOCK_SIZE = 30;
const SIDEWALK_SIZE = 55;
const BIOME_RADIUS_MOUNTAIN = 30;
export function getBiome(cx: number, cz: number): string {
  // Airports (expanded — each has multiple rows for long runways + parking)
  if (cx >= 0 && cx <= 3 && cz >= -5 && cz <= -1) return 'aeroport';
  if (cx >= 8 && cx <= 15 && cz >= -8 && cz <= -4) return 'aeroport';
  if (cx >= 22 && cx <= 30 && cz >= -11 && cz <= -6) return 'aeroport';
  if (cx >= 36 && cx <= 46 && cz >= -14 && cz <= -9) return 'aeroport';
  // Island 5 — major aeroport hub
  if (cx >= 33 && cx <= 46 && cz >= 10 && cz <= 17) return 'aeroport';

  // Helper to deterministically carve parking-lot patches out of city/suburb
  const isParkingPatch = () => {
    const h = ((Math.imul(cx, 100003) + Math.imul(cz, 70001)) >>> 0);
    // ~1 in 9 chunks inside a city/suburb becomes a parking lot
    return (h % 9) === 0;
  };

  // Island 1 (Home/Spawn)
  if (cx >= -2 && cx <= 3 && cz >= -2 && cz <= 2) {
    if (cz >= 2 || cz <= -2) return 'beach';
    return isParkingPatch() ? 'parking_lot' : 'city';
  }
  // Bridge 1→2
  if (cx >= 4 && cx <= 5 && cz >= -1 && cz <= 1) return 'bridge';
  // Island 2 (Downtown)
  if (cx >= 6 && cx <= 15 && cz >= -5 && cz <= 5) {
    if (cz >= 4 || cz <= -4) return 'beach';
    return isParkingPatch() ? 'parking_lot' : 'city';
  }
  // Bridge 2→3
  if (cx >= 16 && cx <= 17 && cz >= -2 && cz <= 2) return 'bridge';
  // Island 3 (Suburbs)
  if (cx >= 18 && cx <= 30 && cz >= -7 && cz <= 7) {
    if (cz >= 6 || cz <= -6) return 'beach';
    return isParkingPatch() ? 'parking_lot' : 'suburb';
  }
  // Bridge 3→4
  if (cx >= 31 && cx <= 32 && cz >= -3 && cz <= 3) return 'bridge';
  // Island 4 (Beach Resort)
  if (cx >= 33 && cx <= 50 && cz >= -10 && cz <= 10) {
    if (cz >= 8 || cz <= -8) return 'beach';
    if (cz >= -5 && cz <= 5) return isParkingPatch() ? 'parking_lot' : 'city';
    return isParkingPatch() ? 'parking_lot' : 'suburb';
  }
  // Rural areas (far from cities — rolling hills + farmland)
  if (cx >= -15 && cx <= -4 && cz >= -12 && cz <= 12) {
    const hr = ((Math.imul(cx, 100003) + Math.imul(cz, 70001)) >>> 0);
    return (hr % 3 === 0) ? 'rural_farm' : 'rural_hills';
  }
  if (cx >= 51 && cx <= 70 && cz >= -15 && cz <= 15) {
    const hr = ((Math.imul(cx, 100003) + Math.imul(cz, 70001)) >>> 0);
    return (hr % 3 === 0) ? 'rural_farm' : 'rural_hills';
  }
  if (cx >= -20 && cx <= -16 && cz >= -6 && cz <= 6) { return 'rural_hills'; }
  if (cx >= 71 && cx <= 80 && cz >= -8 && cz <= 8) { return 'rural_farm'; }
  return 'ocean';
}

const BRIDGE_RANGES: { startCx: number; endCx: number; startCz: number; endCz: number }[] = [
  { startCx: 4, endCx: 5, startCz: -1, endCz: 1 },
  { startCx: 16, endCx: 17, startCz: -2, endCz: 2 },
  { startCx: 31, endCx: 32, startCz: -3, endCz: 3 },
];
const BRIDGE_DECK_Y = 4.0;

/** Returns the ground Y offset for a given world position. Bridge ramps, ocean=-2.5, land=0. */
export function getTerrainHeight(x: number, z: number): number {
  const cx = Math.floor(x / 80);
  const cz = Math.floor(z / 80);
  const biome = getBiome(cx, cz);
  if (biome === 'bridge') {
    for (const br of BRIDGE_RANGES) {
      if (cx >= br.startCx && cx <= br.endCx && cz >= br.startCz && cz <= br.endCz) {
        if (cx === br.startCx) return (x - br.startCx * 80) / 80 * BRIDGE_DECK_Y;
        if (cx === br.endCx) return ((br.endCx + 1) * 80 - x) / 80 * BRIDGE_DECK_Y;
        return BRIDGE_DECK_Y;
      }
    }
    return BRIDGE_DECK_Y;
  }
  if (biome === 'ocean') return -2.5;
  return 0.0;
}

/** A grid line is a "boulevard" every 4th line — wider median, palms, lights. */
export function isBoulevard(gridCoord: number): boolean {
  return ((gridCoord % 4) + 4) % 4 === 0;
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
  private gltfSkyProgram!: WebGLProgram;
  private gltfSkyProjLoc!: WebGLUniformLocation;
  private gltfSkyViewLoc!: WebGLUniformLocation;
  private gltfSkyModelLoc!: WebGLUniformLocation;
  private gltfSkyTexLoc!: WebGLUniformLocation;
  private skyProjLoc!: WebGLUniformLocation;
  private skyViewLoc!: WebGLUniformLocation;
  private skySunDirLoc!: WebGLUniformLocation;
  private skyMoonDirLoc!: WebGLUniformLocation;
  private skyDayBlendLoc!: WebGLUniformLocation;
  private skyTimeLoc!: WebGLUniformLocation;
  private skyDayTexLoc!: WebGLUniformLocation;
  private skyNightTexLoc!: WebGLUniformLocation;
  private skyCloudyTexture: WebGLTexture | null = null;
  public skyboxMesh: CityMesh[] | null = null;
  private skyStarryTexture: WebGLTexture | null = null;
  private defaultTexture: WebGLTexture;

  viewMatrix = mat4.create();
  projMatrix = mat4.create();
  private modelMatrix = mat4.create();
  private chunkCache = new Map<string, CityChunk>();
  private meshCache = new Map<string, CityMesh>();
  private gltfCache = new Map<string, Promise<CityMesh[] | null>>();

  public playerMesh: CityMesh | CityMesh[] | null = null;
  public lampMesh: CityMesh | CityMesh[] | null = null;
  public npcMesh: CityMesh | CityMesh[] | null = null;
  public npcMeshes: CityMesh[][] = [];
  public busMesh: CityMesh[] | null = null;
  public copMesh: CityMesh | CityMesh[] | null = null;
  public carMeshes: CityMesh[][] = [];
  public boatMeshes: CityMesh[][] = [];
  public helicopterMeshes: CityMesh[][] = [];
  public planeMeshes: CityMesh[][] = [];
  public motorcycleMeshes: CityMesh[][] = [];
  public policeCarMesh: CityMesh[] | null = null;
  public hospitalMesh: CityMesh[] | null = null;
  public vendingMachineMesh: CityMesh[] | null = null;
  public homeBaseMesh: CityMesh[] | null = null;
  public garageDoorOpenness = 0;
  public garageCarMesh: CityMesh | CityMesh[] | null = null;
  public taxiMesh: CityMesh[] | null = null;
  public hookerMesh: CityMesh[] | null = null;
  public rocketMesh: CityMesh[] | null = null;
  private _warnedPickups: Set<number> = new Set();
  public coltMesh: CityMesh[] | null = null;
  public moneyMesh: CityMesh[] | null = null;
  public rocketLauncherMesh: CityMesh[] | null = null;
  public m4a1Mesh: CityMesh[] | null = null;
  public shotgunMesh: CityMesh[] | null = null;
  public cityBuildingMeshes: CityMesh[][] = [];
  public airportBuildingMeshes: CityMesh[][] = [];
  public airportHangarMesh: CityMesh[] | null = null;
  public suburbBuildingMeshes: CityMesh[][] = [];
  static AIRPORT_BUILDING_NAMES: string[] = [
    'airport_buildings'
  ];
  static CITY_BUILDING_NAMES = [
    'abandonnedBuilding', 'buildingRandom', 'domeStructure',
    'ecds_old_building_04', 'ecds_old_building_05', 'ecds_old_building_06', 'ecds_old_building_07', 'ecds_old_building_08',
    'industrial_building_psx', 'low_polly_building', 'low_poly_apartment_building_2', 'low_poly_apartment_building_3',
    'low_poly_cinema', 'low_poly_city_hall', 'low_poly_gas_station', 'low_poly_hotel_1', 'low_poly_hotel_2',
    'low_poly_pharmacy', 'low_poly_police_station', 'low_poly_school', 'low_poly_shopping_center',
    'panel_apartment_placeholder', 'psx_groceries_store', 'pyaterochka_3d', 'supermarket',
    'ukraine_building', 'abandoned_building_gameready',
    'psx_japanese_warehouse', 'city_building', 'low_poly_apartment_building_1', 
    'fatboys_diner', 'brooklyn_street_building_low_poly', 'brooklyn_street_cornerhouse_low_poly',
    'okraglak_round_office_building_poznan',
    'psxprop_-_old_warehouse',
  ];
  static SUBURB_BUILDING_NAMES = [
    'brooklynCornerhouse', 'brooklynStreetBuilding', 'cabin',
    'hungry_jacks_restaurant_low_poly', 'japanese_storefront__blender',
    'low_poly_burger_restaurant', 'low_poly_cafe', 'low_poly_generic_restaurant', 'low_poly_generic_shop',
    'low_poly_house_2', 'low_poly_house_3', 'low_poly_house_4', 'low_poly_house_5',
    'low_poly_pizza_restaurant', 'low_poly_wooden_cabine', 'residential_family_house', 'ichijoushi_002',
    'low_poly_apartment_building_1', 'ichijoushi___001',
    'low_poly_house_1', 'low_poly_apartment_2',
    'apartament',
    'fatboys_diner',
    'psxprop_-_old_warehouse',
  ];
  public trafficLightMesh: CityMesh[] | null = null;
  public hydrantMesh: CityMesh[] | null = null;
  public benchMeshes: CityMesh[][] = [];
  public barrelMesh: CityMesh[] | null = null;
  public chickenMesh: CityMesh[] | null = null;
  public palmTreeMesh: CityMesh[] | null = null;
  public cityTreeMesh: CityMesh[] | null = null;
  public cylindricalTowerMesh: CityMesh[] | null = null;
  public tropicalShopMesh: CityMesh[] | null = null;
  public ruralShopMesh: CityMesh[] | null = null;
  public tatamiRoomMesh: CityMesh[] | null = null;
  public woodenCabineMesh: CityMesh[] | null = null;
  public balloonMesh: CityMesh[] | null = null;
  public explodedBarrels: Set<string> = new Set();
  public explodedGasStations: Set<string> = new Set();
  public explodedGasStationTimers: Map<string, number> = new Map();
  static readonly GAS_STATION_COOLDOWN = 300000;
  public supermarketLastPayout: Map<string, number> = new Map();

  getNearbyBarrels(x: number, z: number, radius: number): { x: number; z: number }[] {
    const result: { x: number; z: number }[] = [];
    const pcx = Math.floor(x / CHUNK_SIZE);
    const pcz = Math.floor(z / CHUNK_SIZE);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.getCityChunk(pcx + dx, pcz + dz);
        if (!chunk) continue;
        for (const barrel of chunk.barrels) {
          const key = `${barrel.x},${barrel.z}`;
          if (this.explodedBarrels.has(key)) continue;
          if (Math.hypot(barrel.x - x, barrel.z - z) < radius) {
            result.push(barrel);
          }
        }
      }
    }
    return result;
  }

  getNearbySupermarkets(x: number, z: number, radius: number): { x: number; z: number; yaw: number }[] {
    const result: { x: number; z: number; yaw: number }[] = [];
    const pcx = Math.floor(x / CHUNK_SIZE);
    const pcz = Math.floor(z / CHUNK_SIZE);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.getCityChunk(pcx + dx, pcz + dz);
        if (!chunk) continue;
        for (const sm of chunk.supermarkets) {
          if (Math.hypot(sm.x - x, sm.z - z) < radius) {
            result.push(sm);
          }
        }
      }
    }
    return result;
  }

  getNearbyGasStations(x: number, z: number, radius: number): { x: number; z: number }[] {
    const result: { x: number; z: number }[] = [];
    const pcx = Math.floor(x / CHUNK_SIZE);
    const pcz = Math.floor(z / CHUNK_SIZE);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.getCityChunk(pcx + dx, pcz + dz);
        if (!chunk) continue;
        for (const bld of chunk.buildings) {
          const key = `${bld.x},${bld.z}`;
          if (this.explodedGasStations.has(key)) continue;
          const isGas = bld.model && bld.model.length > 0 && bld.model[0].carName && bld.model[0].carName.includes('gas_station');
          if (!isGas) continue;
          if (Math.hypot(bld.x - x, bld.z - z) < radius) {
            result.push({ x: bld.x, z: bld.z });
          }
        }
      }
    }
    return result;
  }
  public currentModelUrl: string | null = null;
  public droppedWeapons: any[] = [];
  public carFireElapsed = 0;
  // --- First-person weapon system ---
  public firstPersonArmsMesh: CityMesh[] | null = null;
  public firstPersonArmsSkeleton: {
    boneParents: Int32Array;
    boneLocalMatrices: Float32Array;      // bind-pose local matrices
    inverseBindMatrices: Float32Array;
    skinRootWorld: Float32Array;
    nodeToBoneIdx: Map<number, number>;
    boneCount: number;
    nodeNames: string[];                  // json.nodes[i].name (for targeted bone overrides)
  } | null = null;
  public firstPersonArmsAnimations: GltfAnimation[] | null = null;

  public mark23Mesh: CityMesh[] | null = null;
  public mark23Skeleton: {
    boneParents: Int32Array;
    boneLocalMatrices: Float32Array;
    inverseBindMatrices: Float32Array;
    skinRootWorld: Float32Array;
    nodeToBoneIdx: Map<number, number>;
    boneCount: number;
    nodeNames: string[];
  } | null = null;
  public mark23Animations: GltfAnimation[] | null = null;

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
  public armOverrideActive = false;
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

    const whiteTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, whiteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([128, 150, 180]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.defaultTexture = whiteTex;

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

    if(dist < 80.0) {
      float atten = 1.0 - (dist / 80.0);
      atten = atten * atten; // Quadratic falloff

      vec3 pL = lightVec / dist;
      float pDiff = max(dot(N, pL), 0.0);

      pointLightContribution += pDiff * vec3(1.0, 0.85, 0.5) * atten * baseColor.rgb * 0.5;

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
        color += vec3(1.0, 0.8, 0.4) * glow * glow * 1.0;
      }
    }
  }

  vec3 finalColor = mix(color, uFogColor, fog * vColor.a);
  FragColor = vec4(finalColor, vColor.a);
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
uniform sampler2D uDaySky;
uniform sampler2D uNightSky;

vec2 dirToUV(vec3 dir) {
    float u = 0.5 - atan(dir.z, dir.x) / 6.283185;
    float v = acos(clamp(dir.y, -1.0, 1.0)) / 3.141592;
    return vec2(u, v);
}

void main() {
    vec3 dir = normalize(vWorldDir);
    vec2 uv = dirToUV(dir);
    
    vec3 dayTex = texture(uDaySky, uv).rgb;
    vec3 nightTex = texture(uNightSky, uv).rgb;
    vec3 texColor = mix(nightTex, dayTex, uDayBlend);
    
    float h = dir.y;
    float t = max(0.0, min(1.0, h * 0.5 + 0.5));
    
    vec3 nightZenith = vec3(0.01, 0.02, 0.05);
    vec3 nightHorizon = vec3(0.03, 0.04, 0.08);
    vec3 dayZenith = vec3(0.2, 0.4, 0.8);
    vec3 dayHorizon = vec3(0.7, 0.8, 0.9);
    
    vec3 zenithColor = mix(nightZenith, dayZenith, uDayBlend);
    vec3 horizonColor = mix(nightHorizon, dayHorizon, uDayBlend);
    vec3 gradColor = mix(horizonColor, zenithColor, pow(t, 0.8));
    
    float horizonFactor = pow(max(0.0, 1.0 - abs(dir.y)), 4.0);
    vec3 skyColor = mix(texColor, gradColor, horizonFactor * 0.3);
    
    float sunDot = max(dot(dir, uSunDir), 0.0);
    vec3 sunColor = mix(vec3(1.0, 0.4, 0.1), vec3(1.0, 0.95, 0.8), uDayBlend);
    float sunDisk = smoothstep(0.997, 0.999, sunDot);
    float sunGlow = pow(sunDot, 16.0) * 0.5 + pow(sunDot, 4.0) * 0.2;
    skyColor += sunColor * (sunDisk * 2.0 + sunGlow * uDayBlend);
    
    float moonDot = max(dot(dir, uMoonDir), 0.0);
    float moonDisk = smoothstep(0.997, 0.999, moonDot);
    float moonGlow = pow(moonDot, 32.0) * 0.3;
    skyColor += vec3(0.8, 0.85, 0.95) * (moonDisk * 1.5 + moonGlow * (1.0 - uDayBlend));
    
    float sunInfluence = max(dot(dir, uSunDir), 0.0);
    vec3 hazeColor = mix(vec3(0.8, 0.4, 0.1), vec3(0.9, 0.7, 0.5), uDayBlend);
    skyColor += hazeColor * horizonFactor * pow(sunInfluence, 2.0) * (uDayBlend * 0.5 + 0.5);
    
    FragColor = vec4(skyColor, 1.0);
}`;
    this.skyProgram = this.createProgram(skyVs, skyFs);
    this.skyProjLoc = gl.getUniformLocation(this.skyProgram, 'uProj')!;
    this.skyViewLoc = gl.getUniformLocation(this.skyProgram, 'uView')!;
    this.skySunDirLoc = gl.getUniformLocation(this.skyProgram, 'uSunDir')!;
    this.skyMoonDirLoc = gl.getUniformLocation(this.skyProgram, 'uMoonDir')!;
    this.skyDayBlendLoc = gl.getUniformLocation(this.skyProgram, 'uDayBlend')!;
    this.skyTimeLoc = gl.getUniformLocation(this.skyProgram, 'uTime')!;
    this.skyDayTexLoc = gl.getUniformLocation(this.skyProgram, 'uDaySky')!;
    this.skyNightTexLoc = gl.getUniformLocation(this.skyProgram, 'uNightSky')!;

    // this.loadTexture('assets/grandtheft/sky_cloudy.png').then(t => this.skyCloudyTexture = t);
    this.loadTexture('assets/grandtheft/sky_starry.png').then(t => this.skyStarryTexture = t);

    const verts = new Float32Array([
      -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, -1, 1, 1, 1, 1, -1, 1, 1,
      1, -1, -1, -1, -1, -1, -1, 1, -1, 1, -1, -1, -1, 1, -1, 1, 1, -1,
      -1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, 1, 1, 1, -1, -1, 1, -1,
      -1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, -1, 1, -1, 1, -1, -1, 1,
      1, -1, 1, 1, -1, -1, 1, 1, -1, 1, -1, 1, 1, 1, -1, 1, 1, 1,
      -1, -1, -1, -1, -1, 1, -1, 1, 1, -1, -1, -1, -1, 1, 1, -1, 1, -1
    ]);
    this.skyVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.skyVao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);

    const gVs = `#version 300 es
in vec3 aPos;
in vec3 aNormal;
in vec4 aColor;
in vec2 aUV;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
out vec2 vUV;
void main() {
  vec4 worldPos = uModel * vec4(aPos, 1.0);
  gl_Position = (uProj * uView * worldPos).xyww;
  vUV = aUV;
}`;
    const gFs = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTexture;
out vec4 FragColor;
void main() {
  FragColor = texture(uTexture, vUV);
}`;
    this.gltfSkyProgram = this.createProgram(gVs, gFs);
    this.gltfSkyProjLoc = gl.getUniformLocation(this.gltfSkyProgram, 'uProj')!;
    this.gltfSkyViewLoc = gl.getUniformLocation(this.gltfSkyProgram, 'uView')!;
    this.gltfSkyModelLoc = gl.getUniformLocation(this.gltfSkyProgram, 'uModel')!;
    this.gltfSkyTexLoc = gl.getUniformLocation(this.gltfSkyProgram, 'uTexture')!;
  }

  private renderSkybox() {
    const gl = this.gl;
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.skyProgram);
    gl.uniformMatrix4fv(this.skyProjLoc, false, this.projMatrix);
    gl.uniformMatrix4fv(this.skyViewLoc, false, this.viewMatrix);
    gl.uniform3f(this.skySunDirLoc, this.sunDir[0], this.sunDir[1], this.sunDir[2]);
    gl.uniform3f(this.skyMoonDirLoc, this.moonDir[0], this.moonDir[1], this.moonDir[2]);
    gl.uniform1f(this.skyDayBlendLoc, this.dayBlend);
    gl.uniform1f(this.skyTimeLoc, performance.now() / 1000);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.skyCloudyTexture || this.defaultTexture);
    gl.uniform1i(this.skyDayTexLoc, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.skyStarryTexture || this.defaultTexture);
    gl.uniform1i(this.skyNightTexLoc, 3);

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
  /**
   * Sample a GLTF animation at time t (seconds). Writes local transforms into
   * `outLocal` (a Float32Array of length boneCount*16). Bones not targeted by
   * the animation keep their bind-pose local matrix from `skeleton.boneLocalMatrices`.
   */
  sampleAnimation(
    anim: GltfAnimation,
    t: number,
    skeleton: {
      boneCount: number;
      boneLocalMatrices: Float32Array;
      nodeToBoneIdx: Map<number, number>;
    },
    outLocal: Float32Array
  ): void {
    // Start from bind pose
    outLocal.set(skeleton.boneLocalMatrices);

    // Loop the animation
    let time = t;
    if (anim.duration > 0) time = time % anim.duration;

    for (const ch of anim.channels) {
      const boneIdx = skeleton.nodeToBoneIdx.get(ch.nodeIndex);
      if (boneIdx === undefined) continue;
      const s = ch.sampler;
      const n = s.input.length;
      if (n === 0) continue;

      // Find keyframe interval [i, i+1]
      let i = 0;
      while (i < n - 1 && s.input[i + 1] <= time) i++;

      const comp = ch.path === 'rotation' ? 4 : 3;
      const interp = s.interpolation;
      const cubic = interp === 'CUBICSPLINE';   // each keyframe has in-tangent, value, out-tangent
      const stride = cubic ? comp * 3 : comp;

      let frac = 0;
      if (i < n - 1) {
        const t0 = s.input[i], t1 = s.input[i + 1];
        if (t1 > t0) frac = Math.min(1, Math.max(0, (time - t0) / (t1 - t0)));
      }

      const base = i * stride;
      const v0 = s.output.subarray(base + (cubic ? comp : 0), base + (cubic ? comp * 2 : comp));
      let v1: Float32Array;
      if (i < n - 1) {
        const b1 = (i + 1) * stride;
        v1 = s.output.subarray(b1 + (cubic ? comp : 0), b1 + (cubic ? comp * 2 : comp));
      } else {
        v1 = v0;   // hold last
      }

      // Build a fresh local matrix from the bind-pose one then overwrite TRS
      const mOff = boneIdx * 16;
      // copy current (bind) so scale/translation not touched by other channels stays
      // (we already set outLocal = bind above, so just patch the channel's path)
      if (ch.path === 'translation') {
        let x = v0[0], y = v0[1], z = v0[2];
        if (interp !== 'STEP') {
          x += (v1[0] - x) * frac;
          y += (v1[1] - y) * frac;
          z += (v1[2] - z) * frac;
        }
        outLocal[mOff + 12] = x;
        outLocal[mOff + 13] = y;
        outLocal[mOff + 14] = z;
      } else if (ch.path === 'scale') {
        let x = v0[0], y = v0[1], z = v0[2];
        if (interp !== 'STEP') {
          x += (v1[0] - x) * frac;
          y += (v1[1] - y) * frac;
          z += (v1[2] - z) * frac;
        }
        // Patch scale into the existing 3x3 (keep rotation/translation)
        // For simplicity assume no rotation channel conflicts; re-normalize axes.
        outLocal[mOff + 0] = x;
        outLocal[mOff + 5] = y;
        outLocal[mOff + 10] = z;
      } else if (ch.path === 'rotation') {
        let qx = v0[0], qy = v0[1], qz = v0[2], qw = v0[3];
        if (interp !== 'STEP') {
          // SLERP
          let dot = qx * v1[0] + qy * v1[1] + qz * v1[2] + qw * v1[3];
          let q2x = v1[0], q2y = v1[1], q2z = v1[2], q2w = v1[3];
          if (dot < 0) { q2x = -q2x; q2y = -q2y; q2z = -q2z; q2w = -q2w; dot = -dot; }
          if (dot > 0.9995) {
            qx += (q2x - qx) * frac; qy += (q2y - qy) * frac; qz += (q2z - qz) * frac; qw += (q2w - qw) * frac;
            const l = Math.hypot(qx, qy, qz, qw) || 1; qx /= l; qy /= l; qz /= l; qw /= l;
          } else {
            const o = dot, theta = Math.acos(Math.min(1, Math.max(-1, o)));
            const sTheta = Math.sin(theta);
            const w0 = Math.sin((1 - frac) * theta) / sTheta;
            const w1 = Math.sin(frac * theta) / sTheta;
            qx = qx * w0 + q2x * w1; qy = qy * w0 + q2y * w1; qz = qz * w0 + q2z * w1; qw = qw * w0 + q2w * w1;
          }
        }
        // Write rotation into the 3x3 of the local matrix, preserving translation/scale
        const tx = outLocal[mOff + 12], ty = outLocal[mOff + 13], tz = outLocal[mOff + 14];
        quatToMat4([qx, qy, qz, qw], new Float32Array(outLocal.buffer, mOff * 4, 16));
        outLocal[mOff + 12] = tx; outLocal[mOff + 13] = ty; outLocal[mOff + 14] = tz;
      }
    }
  }
  /**
 * Given sampled local matrices, compute final joint matrices (world * invBind)
 * suitable for upload to a skinning uniform array, or for CPU skinning.
 */
  computeJointMatrices(
    skeleton: {
      boneCount: number;
      boneParents: Int32Array;
      skinRootWorld: Float32Array;
      inverseBindMatrices: Float32Array;
    },
    localMatrices: Float32Array,
    outJoint: Float32Array        // length boneCount*16
  ): void {
    // Forward kinematics: jointWorld[b] = parentWorld * local[b]
    for (let b = 0; b < skeleton.boneCount; b++) {
      if (skeleton.boneParents[b] < 0) {
        mat4.multiply(
          new Float32Array(outJoint.buffer, b * 16 * 4, 16),
          skeleton.skinRootWorld,
          new Float32Array(localMatrices.buffer, b * 16 * 4, 16)
        );
      }
    }
    for (let b = 0; b < skeleton.boneCount; b++) {
      const p = skeleton.boneParents[b];
      if (p >= 0) {
        mat4.multiply(
          new Float32Array(outJoint.buffer, b * 16 * 4, 16),
          new Float32Array(outJoint.buffer, p * 16 * 4, 16),
          new Float32Array(localMatrices.buffer, b * 16 * 4, 16)
        );
      }
    }
    // Multiply by inverse bind
    for (let b = 0; b < skeleton.boneCount; b++) {
      mat4.multiply(
        new Float32Array(outJoint.buffer, b * 16 * 4, 16),
        new Float32Array(outJoint.buffer, b * 16 * 4, 16),
        new Float32Array(skeleton.inverseBindMatrices.buffer, b * 16 * 4, 16)
      );
    }
  }
  skinMeshGeneric(
    meshes: CityMesh[],
    skeleton: { boneCount: number },
    jointMatrices: Float32Array
  ): void {
    const gl = this.gl;
    for (const mesh of meshes) {
      // Skip meshes that aren't skinnable OR don't have a bind-pose snapshot
      if (!mesh.restPositions || !mesh.jointIndices || !mesh.jointWeights || !mesh.vertexCount) continue;
      if (!mesh.originalVBO) continue;

      const vCount = mesh.vertexCount;
      // Always start from the bind-pose snapshot — never from the live VBO.
      const newData = new Float32Array(mesh.originalVBO);

      for (let i = 0; i < vCount; i++) {
        const px = mesh.restPositions[i * 3];
        const py = mesh.restPositions[i * 3 + 1];
        const pz = mesh.restPositions[i * 3 + 2];
        let sx = 0, sy = 0, sz = 0;
        const j = mesh.jointIndices.subarray(i * 4, i * 4 + 4);
        const w = mesh.jointWeights.subarray(i * 4, i * 4 + 4);
        for (let k = 0; k < 4; k++) {
          if (w[k] <= 0) continue;
          const m = new Float32Array(jointMatrices.buffer, j[k] * 16 * 4, 16);
          sx += (m[0] * px + m[4] * py + m[8] * pz + m[12]) * w[k];
          sy += (m[1] * px + m[5] * py + m[9] * pz + m[13]) * w[k];
          sz += (m[2] * px + m[6] * py + m[10] * pz + m[14]) * w[k];
        }
        newData[i * 12 + 0] = sx;
        newData[i * 12 + 1] = sy;
        newData[i * 12 + 2] = sz;

        if (mesh.restNormals) {
          const nx = mesh.restNormals[i * 3];
          const ny = mesh.restNormals[i * 3 + 1];
          const nz = mesh.restNormals[i * 3 + 2];
          let snx = 0, sny = 0, snz = 0;
          for (let k = 0; k < 4; k++) {
            if (w[k] <= 0) continue;
            const m = new Float32Array(jointMatrices.buffer, j[k] * 16 * 4, 16);
            snx += (m[0] * nx + m[4] * ny + m[8] * nz) * w[k];
            sny += (m[1] * nx + m[5] * ny + m[9] * nz) * w[k];
            snz += (m[2] * nx + m[6] * ny + m[10] * nz) * w[k];
          }
          const l = Math.hypot(snx, sny, snz) || 1;
          newData[i * 12 + 3] = snx / l;
          newData[i * 12 + 4] = sny / l;
          newData[i * 12 + 5] = snz / l;
        }
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, newData);
    }
  }
  // CPU skinning: compute bone transforms, blend vertices, update VBO
  skinPlayerMesh(meshes: CityMesh | CityMesh[], dt: number = 0): void {
    try {
      const skel = this;
      if (!skel.skelBoneParents || !skel.skelBoneLocalMatrices || !skel.skelInverseBindMatrices || !skel.skelSkinRootWorld) return;

      const gl = this.gl;
      const numBones = skel.skelBoneCount;
      const parents = skel.skelBoneParents;
      const invBind = skel.skelInverseBindMatrices;
      const jointMat = skel.skelJointMatrices!;

      const animLocal = new Float32Array(skel.skelBoneLocalMatrices);

      if (this.walkSpeed > 0.1 && numBones > 63) {
        this.applyWalkAnimation(animLocal);
        this.walkTime += dt * Math.min(this.walkSpeed * 0.15, 2.0);
      }

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

      for (let b = 0; b < numBones; b++) {
        if (parents[b] < 0) {
          mat4.multiply(
            new Float32Array(jointMat.buffer, b * 16 * 4, 16),
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

      const tempMat = new Float32Array(16);
      for (let b = 0; b < numBones; b++) {
        const wOff = b * 16;
        const w = new Float32Array(jointMat.buffer, wOff * 4, 16);
        const ib = new Float32Array(invBind.buffer, wOff * 4, 16);
        mat4.multiply(tempMat, w, ib);
        for (let i = 0; i < 16; i++) w[i] = tempMat[i];
      }

      const meshList = Array.isArray(meshes) ? meshes : [meshes];
      for (const mesh of meshList) {
        if (!mesh.jointIndices || !mesh.jointWeights || !mesh.restPositions || !mesh.restNormals || !mesh.vbo) continue;
        const vCount = mesh.vertexCount || 0;
        if (vCount === 0) continue;

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
        const bufferSize = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE) as number;
        const vboVertexCount = Math.floor(bufferSize / (12 * 4));
        const safeVCount = Math.min(vCount, vboVertexCount);
        if (safeVCount === 0) continue;

        const existing = new Float32Array(mesh.originalVBO!);  // always start from rest pose
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, existing);

        if (existing[9] === 0 && existing[6] === 0 && existing[7] === 0 && existing[8] === 0) {
          let allZero = true;
          for (let i = 6; i < Math.min(60, safeVCount * 12); i++) {
            if (existing[i] !== 0) { allZero = false; break; }
          }
          if (allZero) {
            console.warn('skinPlayerMesh: VBO read returned zeros, skipping to avoid corruption');
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
            continue;
          }
        }

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

        for (let v = 0; v < safeVCount; v++) {
          let px = 0, py = 0, pz = 0;
          let nx = 0, ny = 0, nz = 0;
          const rpx = rp[v * 3], rpy = rp[v * 3 + 1], rpz = rp[v * 3 + 2];
          const rnx = rn[v * 3], rny = rn[v * 3 + 1], rnz = rn[v * 3 + 2];

          for (let j = 0; j < 4; j++) {
            const w = jw[v * 4 + j];
            if (w === 0) continue;
            let boneIdx = ji[v * 4 + j];
            // FIX: Prevent NaN from out-of-bounds bone indices (e.g. 255 padding in UNSIGNED_BYTE)
            if (boneIdx >= numBones) boneIdx = 0;
            const bi = boneIdx * 16;

            const m00 = jointMat[bi], m01 = jointMat[bi + 4], m02 = jointMat[bi + 8], m03 = jointMat[bi + 12];
            const m10 = jointMat[bi + 1], m11 = jointMat[bi + 5], m12 = jointMat[bi + 9], m13 = jointMat[bi + 13];
            const m20 = jointMat[bi + 2], m21 = jointMat[bi + 6], m22 = jointMat[bi + 10], m23 = jointMat[bi + 14];

            px += w * (m00 * rpx + m01 * rpy + m02 * rpz + m03);
            py += w * (m10 * rpx + m11 * rpy + m12 * rpz + m13);
            pz += w * (m20 * rpx + m21 * rpy + m22 * rpz + m23);

            nx += w * (m00 * rnx + m01 * rny + m02 * rnz);
            ny += w * (m10 * rnx + m11 * rny + m12 * rnz);
            nz += w * (m20 * rnx + m21 * rny + m22 * rnz);
          }
          // FIX: Safety check — if animation produces NaN/Infinity (e.g. from
          // bad bone indices or corrupted joint matrices), fall back to the
          // rest position instead of corrupting the VBO with NaN vertices
          // (which would make the mesh permanently invisible).
          if (!isFinite(px) || !isFinite(py) || !isFinite(pz)) {
            px = rpx; py = rpy; pz = rpz;
            nx = rnx; ny = rny; nz = rnz;
          }

          const nlen = Math.hypot(nx, ny, nz);
          if (!nlen || isNaN(nlen)) {
            nx = 0; ny = 1; nz = 0;
          } else {
            nx /= nlen; ny /= nlen; nz /= nlen;
          }

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
    } catch (e) {
      console.error('skinPlayerMesh error', e);
    }
  }

  private applyWalkAnimation(animLocal: Float32Array): void {
    const t = this.walkTime;
    const HIPS = 1, LEFT_ARM = 9, LEFT_FOREARM = 10, RIGHT_ARM = 33, RIGHT_FOREARM = 34;
    const LEFT_THIGH = 56, LEFT_KNEE = 57, LEFT_FOOT = 58;
    const RIGHT_THIGH = 61, RIGHT_KNEE = 62, RIGHT_FOOT = 63;

    // FIX: Guard against skeletons that don't have these bone indices.
    // Applying rotations to wrong bones can severely distort or break the mesh.
    const numBones = animLocal.length / 16;
    if (numBones <= RIGHT_FOOT) return; // skeleton too small for walk anim

    const LEG_SWING = 0.5, KNEE_BEND = 0.3, ARM_SWING = 0.4, ELBOW_BEND = 0.15, HIP_BOB = 0.08;
    const leftPhase = t, rightPhase = t + Math.PI;
    const temp = new Float32Array(16), rot = new Float32Array(16);

    const applyRotX = (bone: number, angle: number) => {
      const m = new Float32Array(animLocal.buffer, bone * 16 * 4, 16);
      mat4.identity(rot); mat4.rotateX(rot, rot, angle);
      mat4.multiply(temp, m, rot);
      for (let i = 0; i < 16; i++) m[i] = temp[i];
    };

    applyRotX(LEFT_THIGH, Math.sin(leftPhase) * LEG_SWING);
    applyRotX(LEFT_KNEE, Math.abs(Math.sin(leftPhase)) * -KNEE_BEND);
    applyRotX(RIGHT_THIGH, Math.sin(rightPhase) * LEG_SWING);
    applyRotX(RIGHT_KNEE, Math.abs(Math.sin(rightPhase)) * -KNEE_BEND);

    if (!this.armOverrideActive && this.punchTime <= 0) {
      applyRotX(LEFT_ARM, Math.sin(leftPhase + Math.PI) * ARM_SWING);
      applyRotX(LEFT_FOREARM, Math.abs(Math.sin(leftPhase + Math.PI)) * -ELBOW_BEND);
      applyRotX(RIGHT_ARM, Math.sin(rightPhase + Math.PI) * ARM_SWING);
      applyRotX(RIGHT_FOREARM, Math.abs(Math.sin(rightPhase + Math.PI)) * -ELBOW_BEND);
    } else {
      applyRotX(LEFT_ARM, Math.sin(leftPhase + Math.PI) * ARM_SWING);
      applyRotX(LEFT_FOREARM, Math.abs(Math.sin(leftPhase + Math.PI)) * -ELBOW_BEND);
    }

    const hips = new Float32Array(animLocal.buffer, HIPS * 16 * 4, 16);
    hips[13] += Math.abs(Math.sin(t)) * -HIP_BOB;
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
    // Compute bounds so buildings can be used for collision
    let meshMinY = 0, meshMaxY = 0;
    let meshMinX = Infinity, meshMaxX = -Infinity;
    let meshMinZ = Infinity, meshMaxZ = -Infinity;
    for (let i = 0; i < vertexCount; i++) {
      const x = interleaved[i * 12];
      const y = interleaved[i * 12 + 1];
      const z = interleaved[i * 12 + 2];
      if (y < meshMinY) meshMinY = y;
      if (y > meshMaxY) meshMaxY = y;
      if (x < meshMinX) meshMinX = x;
      if (x > meshMaxX) meshMaxX = x;
      if (z < meshMinZ) meshMinZ = z;
      if (z > meshMaxZ) meshMaxZ = z;
    }

    gl.bindVertexArray(null);

    const originalVBO = new Float32Array(interleaved);

    return {
      vao, vbo, ibo,
      indexCount: indices.length,
      indexType: useUint32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
      texture,
      minY: meshMinY,
      maxY: meshMaxY,
      minX: meshMinX,
      maxX: meshMaxX,
      minZ: meshMinZ,
      maxZ: meshMaxZ,
      originalVBO
    };
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
    indices.push(idxOffset, idxOffset + 2, idxOffset + 1, idxOffset, idxOffset + 3, idxOffset + 2);
  }

  getCityChunk(cx: number, cz: number): CityChunk {
    const key = `${cx},${cz}`;
    if (this.chunkCache.has(key)) return this.chunkCache.get(key)!;

    const verts: number[] = [];
    const indices: number[] = [];
    let idxOffset = 0;
    const buildings: BuildingPlacement[] = [];
    const benches: { x: number; z: number; yaw: number }[] = [];
    const barrels: { x: number; z: number; yaw: number }[] = [];
    const chickens: { x: number; z: number; yaw: number }[] = [];
    const trees: { x: number; z: number; yaw: number; scale: number }[] = [];
    const supermarkets: { x: number; z: number; yaw: number }[] = [];
    const tatami: { x: number; z: number; yaw: number }[] = [];
    const cabins: { x: number; z: number; yaw: number }[] = [];
    const lighthouses: { x: number; z: number; yaw: number }[] = [];
    const tropicalShops: { x: number; z: number; yaw: number }[] = [];
    const decorativeAircraft: { x: number; z: number; yaw: number; type: string }[] = [];

    const worldOriginX = cx * CHUNK_SIZE;
    const worldOriginZ = cz * CHUNK_SIZE;
    const biome = getBiome(cx, cz);

    // ── OCEAN ──────────────────────────────────────────────
    if (biome === 'ocean') {
      const cx2 = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
      const cz2 = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
      // Layered water — three translucent planes give depth gradient & subtle motion look
      this.addPlane(verts, indices, cx2, -2.5, cz2, CHUNK_SIZE, CHUNK_SIZE, 0.0, 0.10, 0.30, 0.85, idxOffset); idxOffset += 4;
      this.addPlane(verts, indices, cx2, -2.2, cz2, CHUNK_SIZE, CHUNK_SIZE, 0.05, 0.25, 0.45, 0.55, idxOffset); idxOffset += 4;
      this.addPlane(verts, indices, cx2, -1.9, cz2, CHUNK_SIZE, CHUNK_SIZE, 0.15, 0.40, 0.60, 0.40, idxOffset); idxOffset += 4;
      const mesh = this.createMesh(verts, indices);
      const chunk: CityChunk = { mesh, cx, cz, lamps: [], hydrants: [], buildings, benches: [], barrels: [], chickens: [], trees: [], supermarkets: [], tatami: [], cabins: [], lighthouses: [], tropicalShops: [], decorativeAircraft: [] };
      this.chunkCache.set(key, chunk);
      return chunk;
    }

    const isWaterAdjacent = () => {
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          if (getBiome(cx + dx, cz + dz) === 'ocean') return true;
        }
      return false;
    };

    const isBeach = biome === 'beach';
    const isSuburb = biome === 'suburb';
    const isCity = biome === 'city';
    const isBridge = biome === 'bridge';
    const isAeroport = biome === 'aeroport';
    const isParkingLot = biome === 'parking_lot';
    const isMountain = biome === 'mountain';
    const isRuralFarm = biome === 'rural_farm';
    const isRuralHills = biome === 'rural_hills';
    const isRural = isRuralFarm || isRuralHills;

    const seed = (cx * 100003 + cz * 70001) >>> 0;
    const rng = this.mulberry32(seed);
    const blocksPerChunk = CHUNK_SIZE / GRID_PITCH;

    // ── GROUND PLANE ───────────────────────────────────────
    if (isBeach) {
      // Sand with subtle color noise
      const sr = 0.76 + (rng() - 0.5) * 0.05;
      const sg = 0.70 + (rng() - 0.5) * 0.05;
      const sb = 0.50 + (rng() - 0.5) * 0.05;
      this.addPlane(verts, indices, worldOriginX + CHUNK_SIZE / 2, 0.0, worldOriginZ + CHUNK_SIZE / 2, CHUNK_SIZE, CHUNK_SIZE, sr, sg, sb, 1.0, idxOffset); idxOffset += 4;
      if (isWaterAdjacent()) {
        const cx2 = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
        const cz2 = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
        // Layered water on the ocean side
        this.addPlane(verts, indices, cx2, -2.5, cz2, CHUNK_SIZE, CHUNK_SIZE, 0.0, 0.10, 0.30, 0.85, idxOffset); idxOffset += 4;
        this.addPlane(verts, indices, cx2, -2.0, cz2, CHUNK_SIZE, CHUNK_SIZE, 0.10, 0.30, 0.50, 0.55, idxOffset); idxOffset += 4;
        // Smooth beach-to-water transition (gentle slope instead of 6-step staircase)
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const [ddx, ddz] of dirs) {
          if (getBiome(cx + ddx, cz + ddz) !== 'ocean') continue;
          const slopeW = 8;
          for (let si = 0; si < slopeW; si++) {
            const t = si / slopeW;
            const sx = ddx !== 0 ? cx * CHUNK_SIZE + (ddx > 0 ? CHUNK_SIZE - t * slopeW : t * slopeW) : cx2;
            const sz = ddz !== 0 ? cz * CHUNK_SIZE + (ddz > 0 ? CHUNK_SIZE - t * slopeW : t * slopeW) : cz2;
            const sy = -t * 2.5;
            const w = ddx !== 0 ? slopeW * 0.6 : CHUNK_SIZE;
            const d = ddz !== 0 ? slopeW * 0.6 : CHUNK_SIZE;
            const shade = 0.65 - t * 0.20;
            this.addBox(verts, indices, sx, sy, sz, w, 0.3, d, shade, shade * 0.92, shade * 0.7, 1.0, idxOffset); idxOffset += 24;
          }
          break;
        }
      }
    } else if (isBridge) {
      // Water under bridge
      const cx2 = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
      const cz2 = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
      this.addPlane(verts, indices, cx2, -2.5, cz2, CHUNK_SIZE, CHUNK_SIZE, 0.0, 0.10, 0.30, 0.85, idxOffset); idxOffset += 4;
      this.addPlane(verts, indices, cx2, -2.0, cz2, CHUNK_SIZE, CHUNK_SIZE, 0.10, 0.30, 0.50, 0.55, idxOffset); idxOffset += 4;
      // Bridge deck
      this.addPlane(verts, indices, worldOriginX + CHUNK_SIZE / 2, BRIDGE_DECK_Y, worldOriginZ + CHUNK_SIZE / 2, CHUNK_SIZE, CHUNK_SIZE, 0.32, 0.32, 0.34, 1.0, idxOffset); idxOffset += 4;
      // Ramp fillers: smooth slope from Y=0 to BRIDGE_DECK_Y using thin overlapping slices
      for (const br of BRIDGE_RANGES) {
        if (cx !== br.startCx && cx !== br.endCx) continue;
        if (cz < br.startCz || cz > br.endCz) continue;
        const numSlices = 40;
        const sliceH = BRIDGE_DECK_Y / numSlices;
        const sliceW = CHUNK_SIZE / numSlices;
        const rampUp = cx === br.startCx;
        for (let si = 0; si < numSlices; si++) {
          const sx = worldOriginX + (rampUp ? si * sliceW + sliceW / 2 : CHUNK_SIZE - si * sliceW - sliceW / 2);
          const sy = (si + 0.5) * sliceH;
          const sh = si === numSlices - 1 ? BRIDGE_DECK_Y - si * sliceH : sliceH * 1.01;
          this.addBox(verts, indices, sx, sy, worldOriginZ + CHUNK_SIZE / 2, sliceW, sh, CHUNK_SIZE, 0.32, 0.32, 0.34, 1.0, idxOffset); idxOffset += 24;
        }
        break;
      }
      // Two suspension towers (one per side, full height)
      for (const side of [-1, 1]) {
        const tz = worldOriginZ + CHUNK_SIZE / 2 + side * (CHUNK_SIZE / 2 - 6);
        for (const tx of [worldOriginX + 16, worldOriginX + CHUNK_SIZE - 16]) {
          // Tower legs (A-frame)
          this.addBox(verts, indices, tx - 1.5, 16, tz - 2, 1, 28, 1, 0.4, 0.4, 0.42, 1.0, idxOffset); idxOffset += 24;
          this.addBox(verts, indices, tx + 1.5, 16, tz - 2, 1, 28, 1, 0.4, 0.4, 0.42, 1.0, idxOffset); idxOffset += 24;
          this.addBox(verts, indices, tx - 1.5, 16, tz + 2, 1, 28, 1, 0.4, 0.4, 0.42, 1.0, idxOffset); idxOffset += 24;
          this.addBox(verts, indices, tx + 1.5, 16, tz + 2, 1, 28, 1, 0.4, 0.4, 0.42, 1.0, idxOffset); idxOffset += 24;
          // Cross-braces
          for (let by = 6; by < 28; by += 7) {
            this.addBox(verts, indices, tx, by, tz - 2, 4, 0.6, 1, 0.45, 0.45, 0.47, 1.0, idxOffset); idxOffset += 24;
            this.addBox(verts, indices, tx, by, tz + 2, 4, 0.6, 1, 0.45, 0.45, 0.47, 1.0, idxOffset); idxOffset += 24;
          }
          // Suspension cables (thin boxes from tower top to deck midpoints)
          for (const sign of [-1, 1]) {
            this.addBox(verts, indices, tx + sign * 10, 10, tz, 20, 0.3, 0.3, 0.25, 0.25, 0.27, 1.0, idxOffset); idxOffset += 24;
          }
        }
      }
      // Guard rails with vertical posts
      const halfSW = SIDEWALK_SIZE / 2;
      for (const side of [-1, 1]) {
        const rz = worldOriginZ + CHUNK_SIZE / 2 + side * halfSW;
        // Top rail
        this.addBox(verts, indices, worldOriginX + CHUNK_SIZE / 2, BRIDGE_DECK_Y + 1.2, rz, CHUNK_SIZE - 4, 0.2, 0.2, 0.6, 0.6, 0.62, 1.0, idxOffset); idxOffset += 24;
        // Mid rail
        this.addBox(verts, indices, worldOriginX + CHUNK_SIZE / 2, BRIDGE_DECK_Y + 0.6, rz, CHUNK_SIZE - 4, 0.15, 0.15, 0.55, 0.55, 0.57, 1.0, idxOffset); idxOffset += 24;
        // Posts
        for (let px = worldOriginX + 4; px < worldOriginX + CHUNK_SIZE - 4; px += 6) {
          this.addBox(verts, indices, px, BRIDGE_DECK_Y + 0.7, rz, 0.2, 1.4, 0.2, 0.5, 0.5, 0.52, 1.0, idxOffset); idxOffset += 24;
        }
      }
      // Center divider
      this.addBox(verts, indices, worldOriginX + CHUNK_SIZE / 2, BRIDGE_DECK_Y + 0.2, worldOriginZ + CHUNK_SIZE / 2, CHUNK_SIZE, 0.4, 0.4, 0.15, 0.15, 0.15, 1.0, idxOffset); idxOffset += 24;
    } else if (isAeroport) {
      this.addPlane(verts, indices, worldOriginX + CHUNK_SIZE / 2, 0.0, worldOriginZ + CHUNK_SIZE / 2, CHUNK_SIZE, CHUNK_SIZE, 0.22, 0.22, 0.24, 1.0, idxOffset); idxOffset += 4;
    } else if (isParkingLot) {
      // Asphalt
      this.addPlane(verts, indices, worldOriginX + CHUNK_SIZE / 2, 0.0, worldOriginZ + CHUNK_SIZE / 2, CHUNK_SIZE, CHUNK_SIZE, 0.10, 0.10, 0.11, 1.0, idxOffset); idxOffset += 4;
    } else if (isRural) {
      // Rural ground — green grass with variation
      const gv = (rng() - 0.5) * 0.08;
      const gr = isRuralFarm ? 0.25 + gv : 0.35 + gv;
      const gg = isRuralFarm ? 0.55 + gv : 0.50 + gv;
      const gb = isRuralFarm ? 0.12 + gv : 0.15 + gv;
      this.addPlane(verts, indices, worldOriginX + CHUNK_SIZE / 2, 0.0, worldOriginZ + CHUNK_SIZE / 2, CHUNK_SIZE, CHUNK_SIZE, gr, gg, gb, 1.0, idxOffset); idxOffset += 4;
    } else {
      // City / Suburb ground (dark asphalt)
      const groundShade = isSuburb ? 0.12 : 0.08;
      this.addPlane(verts, indices, worldOriginX + CHUNK_SIZE / 2, 0.0, worldOriginZ + CHUNK_SIZE / 2, CHUNK_SIZE, CHUNK_SIZE, groundShade, groundShade, groundShade, 1.0, idxOffset); idxOffset += 4;
    }

    // ── PER-BLOCK DETAIL ───────────────────────────────────
    for (let by = 0; by < blocksPerChunk; by++) {
      for (let bx = 0; bx < blocksPerChunk; bx++) {
        const gx = cx * blocksPerChunk + bx;
        const gz = cz * blocksPerChunk + by;
        const blockWorldX = gx * GRID_PITCH + GRID_PITCH / 2;
        const blockWorldZ = gz * GRID_PITCH + GRID_PITCH / 2;

        // Parking lot blocks — paint stripes instead of buildings
        if (isParkingLot) {
          // Rows of parking spaces (two rows with driving aisle between)
          const rowSpacing = 6;
          const stallW = 3, stallD = 5;
          for (let row = 0; row < 5; row++) {
            const rz = blockWorldZ - 14 + row * rowSpacing;
            // Skip middle row to leave an aisle
            if (row === 2) continue;
            for (let col = 0; col < 7; col++) {
              const rx = blockWorldX - 9 + col * 3;
              // White stall lines (two side stripes + back)
              this.addBox(verts, indices, rx - stallW / 2, 0.02, rz, 0.15, 0.04, stallD, 0.9, 0.9, 0.9, 1.0, idxOffset); idxOffset += 24;
              this.addBox(verts, indices, rx + stallW / 2, 0.02, rz, 0.15, 0.04, stallD, 0.9, 0.9, 0.9, 1.0, idxOffset); idxOffset += 24;
              this.addBox(verts, indices, rx, 0.02, rz - stallD / 2, stallW, 0.04, 0.15, 0.9, 0.9, 0.9, 1.0, idxOffset); idxOffset += 24;
            }
          }
          // Curbs around perimeter
          this.addBox(verts, indices, blockWorldX, 0.1, blockWorldZ - 18, 38, 0.2, 0.6, 0.3, 0.3, 0.32, 1.0, idxOffset); idxOffset += 24;
          this.addBox(verts, indices, blockWorldX, 0.1, blockWorldZ + 18, 38, 0.2, 0.6, 0.3, 0.3, 0.32, 1.0, idxOffset); idxOffset += 24;
          continue;
        }

        // Sidewalk slab (skip for beach/aeroport/bridge/rural)
        if (!isBeach && !isAeroport && !isBridge && !isRural) {
          const swShade = 0.38 + (rng() * 0.08);
          this.addBox(verts, indices, blockWorldX, 0.05, blockWorldZ, SIDEWALK_SIZE, 0.1, SIDEWALK_SIZE, swShade, swShade, swShade, 1.0, idxOffset); idxOffset += 24;
        }

        // ── BEACH block: palms, umbrellas, lifeguard tower ──
        if (isBeach) {
          this.addPlane(verts, indices, blockWorldX, 0.03, blockWorldZ, BLOCK_SIZE, BLOCK_SIZE, 0.82, 0.75, 0.55, 1.0, idxOffset); idxOffset += 4;
          const halfSW = SIDEWALK_SIZE / 2;
          // Palm row along the inland edge — bigger scale, properly aligned
          for (let i = 0; i < 4; i++) {
            const px = blockWorldX - halfSW + 5 + i * (SIDEWALK_SIZE / 4);
            const pz = blockWorldZ - halfSW + 5;
            if (this.palmTreeMesh) {
              trees.push({ x: px, z: pz, yaw: rng() * 0.4 - 0.2, scale: 1.8 + rng() * 0.6 });
            } else {
              const ph = 5 + rng() * 3;
              this.addBox(verts, indices, px, ph / 2, pz, 0.4, ph, 0.4, 0.3, 0.18, 0.05, 1.0, idxOffset); idxOffset += 24;
              this.addBox(verts, indices, px, ph + 0.5, pz, 3, 0.6, 3, 0.1, 0.45, 0.05, 1.0, idxOffset); idxOffset += 24;
            }
          }
          // Beach umbrellas — colorful discs
          for (let i = 0; i < 3; i++) {
            if (rng() < 0.6) {
              const ux = blockWorldX - 12 + rng() * 24;
              const uz = blockWorldZ - 12 + rng() * 24;
              const palette = [[1, 0.2, 0.2], [0.2, 0.5, 1], [1, 1, 0.2], [0.9, 0.4, 0.7]];
              const col = palette[Math.floor(rng() * palette.length)];
              this.addBox(verts, indices, ux, 1.5, uz, 0.1, 2.5, 0.1, 0.4, 0.3, 0.2, 1.0, idxOffset); idxOffset += 24; // pole
              this.addBox(verts, indices, ux, 2.6, uz, 3, 0.2, 3, col[0], col[1], col[2], 1.0, idxOffset); idxOffset += 24; // canopy
            }
          }
          // Lifeguard chair (one per block, low probability)
          if (rng() < 0.3) {
            const lx = blockWorldX + halfSW - 5;
            const lz = blockWorldZ + halfSW - 5;
            this.addBox(verts, indices, lx, 1.0, lz, 1.2, 0.15, 1.2, 0.7, 0.5, 0.3, 1.0, idxOffset); idxOffset += 24; // seat
            this.addBox(verts, indices, lx, 2.0, lz - 0.5, 0.15, 2, 0.15, 0.7, 0.5, 0.3, 1.0, idxOffset); idxOffset += 24; // front leg
            this.addBox(verts, indices, lx, 0.8, lz + 0.5, 0.15, 1.6, 0.15, 0.7, 0.5, 0.3, 1.0, idxOffset); idxOffset += 24; // back leg
            this.addBox(verts, indices, lx, 2.2, lz, 0.15, 0.8, 1.2, 0.7, 0.5, 0.3, 1.0, idxOffset); idxOffset += 24; // backrest
          }
          // A couple of benches (properly sparse — max 1 per beach block)
          if (rng() < 0.4) {
            benches.push({ x: blockWorldX, z: blockWorldZ + halfSW - 3, yaw: Math.PI });
          }
          // Tatami dressing rooms along the inland edge
          if (this.tatamiRoomMesh) {
            for (let i = 0; i < 2; i++) {
              if (rng() < 0.5) {
                const tx = blockWorldX - halfSW + 6 + i * (SIDEWALK_SIZE / 2.5) + rng() * 3;
                const tz = blockWorldZ - halfSW + 3;
                tatami.push({ x: tx, z: tz, yaw: 0 });
              }
            }
          }
          // Wooden cabin near the water edge
          if (this.woodenCabineMesh && rng() < 0.4) {
            const cx = blockWorldX + (rng() - 0.5) * 20;
            const cz = blockWorldZ + halfSW - 5;
            cabins.push({ x: cx, z: cz, yaw: rng() > 0.5 ? 0 : Math.PI });
          }
          // Tropical shop — rare on beaches
          if (this.tropicalShopMesh && rng() < 0.15) {
            const sx = blockWorldX + (rng() - 0.5) * 22;
            const sz = blockWorldZ + halfSW - 4;
            tropicalShops.push({ x: sx, z: sz, yaw: rng() > 0.5 ? 0 : Math.PI });
          }
          // Lighthouse at a beach corner — extremely rare
          if (this.cylindricalTowerMesh && rng() < 0.03) {
            const corner = Math.floor(rng() * 4);
            const cx = corner < 2 ? blockWorldX - halfSW + 2 : blockWorldX + halfSW - 2;
            const cz = corner % 2 === 0 ? blockWorldZ - halfSW + 2 : blockWorldZ + halfSW - 2;
            lighthouses.push({ x: cx, z: cz, yaw: corner * Math.PI / 2 });
          }
          continue;
        }

        // ── AEROPORT block: runway + hangars + planes + helipads ──
        if (isAeroport) {
          // Runway strip (always down the center)
          this.addBox(verts, indices, blockWorldX, 0.1, blockWorldZ, 8, 0.2, GRID_PITCH, 0.12, 0.12, 0.13, 1.0, idxOffset); idxOffset += 24;
          for (let dz = -GRID_PITCH / 2 + 4; dz < GRID_PITCH / 2; dz += 8) {
            this.addBox(verts, indices, blockWorldX, 0.11, blockWorldZ + dz, 0.5, 0.05, 3, 1, 1, 1, 0.8, idxOffset); idxOffset += 24;
          }

          // Deterministic chunk role — 2% terminal, 30% helipad, 68% hangar
          const aRole = rng();
          const hasTerminal = aRole < 0.02;
          const hasHelipad = aRole >= 0.02 && aRole < 0.32;
          const HS = 2.5; // hangar scale multiplier

          if (hasTerminal && this.airportBuildingMeshes.length > 0) {
            // Terminal building on one side
            const term = this.airportBuildingMeshes[Math.floor(rng() * this.airportBuildingMeshes.length)];
            const bMinY = this.getModelMinY(term);
            const bx_ = blockWorldX - 24;
            const bz_ = blockWorldZ + (rng() - 0.5) * 14;
            buildings.push({ model: term, x: bx_, y: -bMinY * 3 + 0.15, z: bz_, yaw: Math.PI / 2, scale: [3, 3, 3] });
            // Parking stalls with parked cars
            for (let pi = 0; pi < 5; pi++) {
              const sz = bz_ - 9 + pi * 3.5;
              this.addBox(verts, indices, bx_ + 8, 0.02, sz, 0.15, 0.04, 5, 0.9, 0.9, 0.9, 1.0, idxOffset); idxOffset += 24;
              this.addBox(verts, indices, bx_ + 12, 0.02, sz, 0.15, 0.04, 5, 0.9, 0.9, 0.9, 1.0, idxOffset); idxOffset += 24;
              this.addBox(verts, indices, bx_ + 10, 0.02, sz - 2.5, 4, 0.04, 0.15, 0.9, 0.9, 0.9, 1.0, idxOffset); idxOffset += 24;
              // Place a parked car in every other stall
              if (pi % 2 === 0 && this.carMeshes.length > 0) {
                buildings.push({ model: this.carMeshes[Math.floor(rng() * this.carMeshes.length)], x: bx_ + 10, y: 0.15, z: sz, yaw: 0, scale: [1, 1, 1] });
              }
            }
            // Big hangar opposite side
            if (this.airportHangarMesh) {
              const hm = this.airportHangarMesh;
              buildings.push({ model: hm, x: blockWorldX + 35, y: -this.getModelMinY(hm) * HS + 0.15, z: blockWorldZ, yaw: -Math.PI / 2, scale: [HS, HS, HS] });
            }
          } else if (hasHelipad) {
            // ── Helipad with H marking ──
            const padX = blockWorldX - 25;
            const padZ = blockWorldZ;
            this.addBox(verts, indices, padX, 0.05, padZ, 16, 0.1, 16, 0.4, 0.4, 0.42, 1.0, idxOffset); idxOffset += 24;
            // Yellow border
            this.addBox(verts, indices, padX - 8, 0.06, padZ, 0.3, 0.05, 16, 0.9, 0.8, 0.1, 1.0, idxOffset); idxOffset += 24;
            this.addBox(verts, indices, padX + 8, 0.06, padZ, 0.3, 0.05, 16, 0.9, 0.8, 0.1, 1.0, idxOffset); idxOffset += 24;
            this.addBox(verts, indices, padX, 0.06, padZ - 8, 16, 0.05, 0.3, 0.9, 0.8, 0.1, 1.0, idxOffset); idxOffset += 24;
            this.addBox(verts, indices, padX, 0.06, padZ + 8, 16, 0.05, 0.3, 0.9, 0.8, 0.1, 1.0, idxOffset); idxOffset += 24;
            // White H
            const hw = 0.8, hh = 4;
            this.addBox(verts, indices, padX - 2.5, 0.06, padZ, hw, 0.06, hh, 1, 1, 1, 0.9, idxOffset); idxOffset += 24;
            this.addBox(verts, indices, padX + 2.5, 0.06, padZ, hw, 0.06, hh, 1, 1, 1, 0.9, idxOffset); idxOffset += 24;
            this.addBox(verts, indices, padX, 0.06, padZ, hh * 0.6, 0.06, hw, 1, 1, 1, 0.9, idxOffset); idxOffset += 24;
            // Helicopter on pad
            if (this.helicopterMeshes.length > 0) {
              const heli = this.helicopterMeshes[Math.floor(rng() * this.helicopterMeshes.length)];
              const heliYaw = rng() * Math.PI * 2;
              buildings.push({ model: heli, x: padX, y: 0.15, z: padZ, yaw: heliYaw, scale: [1, 1, 1] });
              decorativeAircraft.push({ x: padX, z: padZ, yaw: heliYaw, type: 'helicopter' });
            }
            // Big hangar + plane on opposite side
            if (this.airportHangarMesh) {
              buildings.push({ model: this.airportHangarMesh, x: blockWorldX + 35, y: -this.getModelMinY(this.airportHangarMesh) * HS + 0.15, z: blockWorldZ, yaw: -Math.PI / 2, scale: [HS, HS, HS] });
              if (this.planeMeshes.length > 0) {
                buildings.push({ model: this.planeMeshes[Math.floor(rng() * this.planeMeshes.length)], x: blockWorldX + 35, y: 0.15, z: blockWorldZ + 18, yaw: Math.PI, scale: [1, 1, 1] });
                decorativeAircraft.push({ x: blockWorldX + 35, z: blockWorldZ + 18, yaw: Math.PI, type: 'plane' });
              }
            }
          } else {
            // ── Hangar row (default) — 1 hangar per side with plane ──
            for (const side of [-1, 1]) {
              if (this.airportHangarMesh) {
                const hx = blockWorldX + side * 35;
                const hz = blockWorldZ;
                buildings.push({
                  model: this.airportHangarMesh,
                  x: hx, y: -this.getModelMinY(this.airportHangarMesh) * HS + 0.15, z: hz,
                  yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2,
                  scale: [HS, HS, HS]
                });
                // Plane in front of each hangar
                if (this.planeMeshes.length > 0) {
                  const pz = hz + (side > 0 ? -14 : 14);
                  const planeYaw = side > 0 ? -Math.PI / 2 : Math.PI / 2;
                  buildings.push({
                    model: this.planeMeshes[Math.floor(rng() * this.planeMeshes.length)],
                    x: hx, y: 0.15, z: pz,
                    yaw: planeYaw,
                    scale: [1, 1, 1]
                  });
                  decorativeAircraft.push({ x: hx, z: pz, yaw: planeYaw, type: 'plane' });
                }
              }
            }
          }

          // Retaining wall where aeroport meets ocean
          for (const [ddx, ddz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            if (getBiome(cx + ddx, cz + ddz) !== 'ocean') continue;
            const wallLen = ddx !== 0 ? 2 : GRID_PITCH;
            const wallWid = ddz !== 0 ? 2 : GRID_PITCH;
            const wx = ddx !== 0 ? blockWorldX + ddx * (GRID_PITCH / 2 - 1) : blockWorldX;
            const wz = ddz !== 0 ? blockWorldZ + ddz * (GRID_PITCH / 2 - 1) : blockWorldZ;
            this.addBox(verts, indices, wx, 1.25, wz, wallLen, 2.5, wallWid, 0.25, 0.25, 0.27, 1.0, idxOffset); idxOffset += 24;
          }
          continue;
        }

        // ── RURAL block: scattered houses, cabins, trees, chickens ──
        if (isRural) {
          const hasBuilding = rng() < 0.35;
          if (hasBuilding) {
            const useHouse = rng() < 0.6;
            let model: CityMesh | CityMesh[];
            if (useHouse && this.suburbBuildingMeshes.length > 0) {
              model = this.suburbBuildingMeshes[Math.floor(rng() * this.suburbBuildingMeshes.length)];
            } else if (this.woodenCabineMesh && rng() < 0.5) {
              model = this.woodenCabineMesh;
            } else if (this.ruralShopMesh) {
              model = this.ruralShopMesh;
            } else if (this.suburbBuildingMeshes.length > 0) {
              model = this.suburbBuildingMeshes[Math.floor(rng() * this.suburbBuildingMeshes.length)];
            } else { model = this.woodenCabineMesh ? this.woodenCabineMesh : []; }
            if (Array.isArray(model) && model.length > 0) {
              const bScale = useHouse ? 2.5 + rng() * 2 : 3 + rng() * 2;
              const bx = blockWorldX + (rng() - 0.5) * 40;
              const bz = blockWorldZ + (rng() - 0.5) * 40;
              const bMinY = this.getModelMinY(model);
              const bYaw = Math.floor(rng() * 4) * Math.PI / 2;
              buildings.push({ model, x: bx, y: -bMinY * bScale + 0.15, z: bz, yaw: bYaw, scale: [bScale, bScale, bScale] });
              // Chickens around every rural house
              for (let ci = 0; ci < 3 + Math.floor(rng() * 4); ci++) {
                chickens.push({ x: bx + (rng() - 0.5) * 12, z: bz + (rng() - 0.5) * 12, yaw: rng() * Math.PI * 2 });
              }
            }
          }
          // Scattered trees
          for (let ti = 0; ti < 8 + Math.floor(rng() * 6); ti++) {
            if (this.palmTreeMesh && rng() < 0.7) {
              const tx = blockWorldX + (rng() - 0.5) * 60;
              const tz = blockWorldZ + (rng() - 0.5) * 60;
              trees.push({ x: tx, z: tz, yaw: rng() * 0.3, scale: 0.8 + rng() * 0.6 });
            }
          }
          // Farm crop rows
          if (isRuralFarm && rng() < 0.6) {
            for (let ri = 0; ri < 4 + Math.floor(rng() * 4); ri++) {
              const cx = blockWorldX + (rng() - 0.5) * 50;
              const cz = blockWorldZ + (rng() - 0.5) * 50;
              this.addBox(verts, indices, cx, 0.15, cz, 1.5 + rng() * 3, 0.3 + rng() * 0.2, 0.5, 0.6 + rng() * 0.3, 0.5 + rng() * 0.2, 0.1, 1.0, idxOffset); idxOffset += 24;
            }
          }
          // Random free-range chickens (not near houses)
          if (rng() < 0.4) {
            chickens.push({ x: blockWorldX + (rng() - 0.5) * 50, z: blockWorldZ + (rng() - 0.5) * 50, yaw: rng() * Math.PI * 2 });
          }
          continue;
        }

        // ── BRIDGE block: rails + divider already done at chunk level ──
        if (isBridge) continue;

        // ── CITY / SUBURB block ──
        const grassG = isSuburb ? 0.42 : 0.10;
        this.addBox(verts, indices, blockWorldX, 0.075, blockWorldZ, BLOCK_SIZE, 0.15, BLOCK_SIZE, 0.08, grassG, 0.08, 1.0, idxOffset); idxOffset += 24;

        // Skip home-base blocks
        if ((cx === 0 && cz === 0) || (cx === 1 && cz === 0)) continue;

        const halfSW = SIDEWALK_SIZE / 2;
        const edges = [
          { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
          { dx: 1, dz: 0 }, { dx: -1, dz: 0 }
        ];

        // Track placed building footprints for overlap prevention
        const placedAABBs: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
        const modelWorldAABB = (model: CityMesh | CityMesh[], px: number, pz: number, scale: [number, number, number], yaw: number): { minX: number; maxX: number; minZ: number; maxZ: number } | null => {
          const arr = Array.isArray(model) ? model : [model];
          let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
          for (const m of arr) {
            if (m.minX === undefined || m.maxX === undefined || m.minZ === undefined || m.maxZ === undefined) return null;
            const rs = m.renderScale ?? 1;
            const sx = scale[0] * rs, sz = scale[2] * rs;
            const hw = (m.maxX - m.minX) / 2 * sx;
            const hd = (m.maxZ - m.minZ) / 2 * sz;
            const rot = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            const swap = Math.abs(rot - Math.PI / 2) < 0.01 || Math.abs(rot - Math.PI * 3 / 2) < 0.01;
            const ehw = swap ? hd : hw;
            const ehd = swap ? hw : hd;
            minX = Math.min(minX, px - ehw); maxX = Math.max(maxX, px + ehw);
            minZ = Math.min(minZ, pz - ehd); maxZ = Math.max(maxZ, pz + ehd);
          }
          return { minX, maxX, minZ, maxZ };
        };
        const overlapsExisting = (bb: { minX: number; maxX: number; minZ: number; maxZ: number }): boolean => {
          const gap = 1.0;
          for (const existing of placedAABBs) {
            if (bb.minX - gap < existing.maxX && bb.maxX + gap > existing.minX &&
                bb.minZ - gap < existing.maxZ && bb.maxZ + gap > existing.minZ) return true;
          }
          return false;
        };
        const tryPlace = (model: CityMesh | CityMesh[], px: number, pz: number, scale: [number, number, number], yaw: number): boolean => {
          const bb = modelWorldAABB(model, px, pz, scale, yaw);
          if (!bb || overlapsExisting(bb)) return false;
          placedAABBs.push(bb);
          return true;
        };

        if (isSuburb) {
          // 1 in 4 suburb blocks gets a POI (storefront)
          if (rng() < 0.25 && this.suburbBuildingMeshes.length > 0) {
            const poiModels = this.suburbBuildingMeshes.filter((_, i) => i % 3 === 0);
            if (poiModels.length > 0) {
              const model = poiModels[Math.floor(rng() * poiModels.length)];
              const poiScale = 5 + rng() * 2;
              const poiMinY = this.getModelMinY(model);
              const sc: [number, number, number] = [poiScale, poiScale, poiScale];
              const pyaw = Math.floor(rng() * 4) * Math.PI / 2;
              if (tryPlace(model, blockWorldX, blockWorldZ, sc, pyaw)) {
                buildings.push({ model, x: blockWorldX, y: -poiMinY * poiScale + 0.15, z: blockWorldZ, yaw: pyaw, scale: sc });
              }
            }
          }

          for (const edge of edges) {
            const numHouses = 1 + Math.floor(rng() * 2);
            const houseWidth = (SIDEWALK_SIZE - 12) / numHouses; // leave 6u corner gap each end
            for (let i = 0; i < numHouses; i++) {
              if (rng() >= 0.7) continue;
              const w = houseWidth;
              const d = 7 + rng() * (SIDEWALK_SIZE * 0.22);
              let px, pz, yaw;
              if (edge.dx === 0) {
                px = blockWorldX - halfSW + 6 + houseWidth / 2 + i * houseWidth;
                pz = blockWorldZ + edge.dz * (halfSW - d / 2 - 1);
                yaw = edge.dz > 0 ? Math.PI : 0;
              } else {
                pz = blockWorldZ - halfSW + 6 + houseWidth / 2 + i * houseWidth;
                px = blockWorldX + edge.dx * (halfSW - d / 2 - 1);
                yaw = edge.dx > 0 ? -Math.PI / 2 : Math.PI / 2;
              }
              const models = this.suburbBuildingMeshes;
              if (models.length > 0) {
                const model = models[Math.floor(rng() * models.length)];
                const scVal = Math.max(w, d) / 15 * 3.2;
                const sc: [number, number, number] = [scVal, scVal, scVal];
                const subMinY = this.getModelMinY(model);
                if (tryPlace(model, px, pz, sc, yaw)) {
                  buildings.push({ model, x: px, y: -subMinY * scVal + 0.15, z: pz, yaw, scale: sc });
                }
              } else {
                const r = 0.5 + rng() * 0.4, g = 0.4 + rng() * 0.3, b = 0.3 + rng() * 0.3;
                const h = 5 + rng() * 7;
                this.addBox(verts, indices, px, h / 2 + 0.04, pz, w, h, d, r, g, b, 1.0, idxOffset); idxOffset += 24;
              }
            }
          }
          // Backyard chickens (suburb only)
          if (rng() < 0.3) {
            chickens.push({ x: blockWorldX + (rng() - 0.5) * 20, z: blockWorldZ + (rng() - 0.5) * 20, yaw: rng() * Math.PI * 2 });
          }
        } else {
          // ── CITY: storefronts with alley gaps ──
          const isBoulevardEdgeX = isBoulevard(gx);    // road running N-S at this grid line
          const isBoulevardEdgeZ = isBoulevard(gz);    // road running E-W

          for (const edge of edges) {
            const numStores = 2 + Math.floor(rng() * 2);
            // Leave 4u gap at each end → no corner collision
            const storeWidth = (SIDEWALK_SIZE - 8) / numStores;
            for (let i = 0; i < numStores; i++) {
              if (rng() >= 0.78) {
                // Empty slot — becomes an alleyway
                if (rng() < 0.4) {
                  // Dumpster in alley
                  const alleyX = edge.dx === 0 ? blockWorldX - halfSW + 4 + storeWidth / 2 + i * storeWidth : blockWorldX + edge.dx * (halfSW - 2);
                  const alleyZ = edge.dz === 0 ? blockWorldZ - halfSW + 4 + storeWidth / 2 + i * storeWidth : blockWorldZ + edge.dz * (halfSW - 2);
                  this.addBox(verts, indices, alleyX, 0.7, alleyZ, 1.6, 1.4, 1.2, 0.2, 0.45, 0.2, 1.0, idxOffset); idxOffset += 24;
                }
                continue;
              }
              const w = storeWidth;
              const d = 7 + rng() * (SIDEWALK_SIZE * 0.18);
              let px, pz, yaw;
              if (edge.dx === 0) {
                px = blockWorldX - halfSW + 4 + storeWidth / 2 + i * storeWidth;
                pz = blockWorldZ + edge.dz * (halfSW - d / 2 - 1);
                yaw = edge.dz > 0 ? Math.PI : 0;
              } else {
                pz = blockWorldZ - halfSW + 4 + storeWidth / 2 + i * storeWidth;
                px = blockWorldX + edge.dx * (halfSW - d / 2 - 1);
                yaw = edge.dx > 0 ? -Math.PI / 2 : Math.PI / 2;
              }
              const models = this.cityBuildingMeshes;
              if (models.length > 0) {
                const model = models[Math.floor(rng() * models.length)];
                let scVal = Math.max(w, d) / 18 * 3.5;
                // Skyscrapers 10x taller and wider
                if (model.length > 0 && model[0].carName && model[0].carName.includes('skyscraper')) scVal *= 10;
                const sc: [number, number, number] = [scVal, scVal, scVal];
                const cityMinY = this.getModelMinY(model);
                if (tryPlace(model, px, pz, sc, yaw)) {
                  buildings.push({ model, x: px, y: -cityMinY * scVal + 0.15, z: pz, yaw, scale: sc });
                  if (model.length > 0 && model[0].carName && model[0].carName.includes('supermarket')) {
                    supermarkets.push({ x: px, z: pz, yaw });
                  }
                }
              } else {
                const r = 0.4 + rng() * 0.4, g = 0.4 + rng() * 0.4, b = 0.4 + rng() * 0.4;
                const h = 12 + rng() * 35;
                this.addBox(verts, indices, px, h / 2 + 0.04, pz, w, h, d, r, g, b, 1.0, idxOffset); idxOffset += 24;
                // Window glow strip
                if (rng() < 0.4) {
                  this.addBox(verts, indices, px, h * 0.6, pz + edge.dz * (d / 2 + 0.05), w * 0.7, h * 0.2, 0.1, 1.0, 0.9, 0.4, 0.7, idxOffset); idxOffset += 24;
                }
              }
            }
          }
          // Alleyway connection — narrow gap between two blocks
          if ((isBoulevardEdgeX || isBoulevardEdgeZ) && rng() < 0.5) {
            // No geometry, just leave the corner clear — already handled by 4u gap
          }
        }
      }
    }

    // ── BOULEVARD MEDIAN + PALM TREES + LIGHTS ─────────────
    if (!isBeach && !isAeroport && !isBridge && !isParkingLot) {
      // Two grid lines cross this chunk: x = cx*80 + 0 and x = cx*80 + 80
      // (the chunk boundary lines). Test each for boulevard status.
      for (const gridX of [cx, cx + 1]) {
        if (!isBoulevard(gridX)) continue;
        const worldX = gridX * GRID_PITCH;
        // Wider, raised median with grass
        this.addBox(verts, indices, worldX, 0.15, worldOriginZ + CHUNK_SIZE / 2, 4, 0.3, CHUNK_SIZE - 4, 0.12, 0.30, 0.10, 1.0, idxOffset); idxOffset += 24;
        // City trees along median — spaced out, replaced with fallback boxes if not loaded
        for (let z = worldOriginZ + 8; z < worldOriginZ + CHUNK_SIZE - 4; z += 16) {
          if (this.cityTreeMesh && Math.floor((z - worldOriginZ) / 16) % 3 === 0) {
            trees.push({ x: worldX, z, yaw: 0, scale: 1.5 + rng() * 0.4 });
          } else if (this.palmTreeMesh) {
            trees.push({ x: worldX, z, yaw: 0, scale: 2.4 + rng() * 0.6 });
          } else {
            this.addBox(verts, indices, worldX, 3, z, 0.4, 6, 0.4, 0.3, 0.18, 0.05, 1.0, idxOffset); idxOffset += 24;
            this.addBox(verts, indices, worldX, 6.2, z, 3, 0.7, 3, 0.1, 0.45, 0.05, 1.0, idxOffset); idxOffset += 24;
          }
          // Bench beside every other palm
          if (Math.floor((z - worldOriginZ) / 16) % 2 === 0) {
            benches.push({ x: worldX + 3, z, yaw: Math.PI / 2 });
          }
        }
      }
      for (const gridZ of [cz, cz + 1]) {
        if (!isBoulevard(gridZ)) continue;
        const worldZ = gridZ * GRID_PITCH;
        this.addBox(verts, indices, worldOriginX + CHUNK_SIZE / 2, 0.15, worldZ, CHUNK_SIZE - 4, 0.3, 4, 0.12, 0.30, 0.10, 1.0, idxOffset); idxOffset += 24;
        for (let x = worldOriginX + 8; x < worldOriginX + CHUNK_SIZE - 4; x += 16) {
          if (this.cityTreeMesh && Math.floor((x - worldOriginX) / 16) % 3 === 0) {
            trees.push({ x, z: worldZ, yaw: 0, scale: 1.5 + rng() * 0.4 });
          } else if (this.palmTreeMesh) {
            trees.push({ x, z: worldZ, yaw: 0, scale: 2.4 + rng() * 0.6 });
          } else {
            this.addBox(verts, indices, x, 3, worldZ, 0.4, 6, 0.4, 0.3, 0.18, 0.05, 1.0, idxOffset); idxOffset += 24;
            this.addBox(verts, indices, x, 6.2, worldZ, 3, 0.7, 3, 0.1, 0.45, 0.05, 1.0, idxOffset); idxOffset += 24;
          }
          if (Math.floor((x - worldOriginX) / 16) % 2 === 0) {
            benches.push({ x, z: worldZ + 3, yaw: 0 });
          }
        }
      }
    }

    // ── ROAD LANE STRIPES (only on non-boulevards to keep boulevards clean) ──
    if (!isMountain && !isBeach && !isAeroport && !isBridge && !isParkingLot) {
      const dashLen = 1.5, dashWid = 0.3, dashH = 0.02, dashSpacing = 4, dashOffset = 2;
      for (let ri = 0; ri < 2; ri++) {
        const roadZ = cz * CHUNK_SIZE + ri * GRID_PITCH;
        if (isBoulevard(cz * blocksPerChunk + ri)) continue;
        for (let x = cx * CHUNK_SIZE + dashOffset; x <= cx * CHUNK_SIZE + CHUNK_SIZE - dashOffset; x += dashSpacing) {
          this.addBox(verts, indices, x, 0.04, roadZ, dashLen, dashH, dashWid, 1, 1, 1, 0.8, idxOffset); idxOffset += 24;
        }
      }
      for (let ri = 0; ri < 2; ri++) {
        const roadX = cx * CHUNK_SIZE + ri * GRID_PITCH;
        if (isBoulevard(cx * blocksPerChunk + ri)) continue;
        for (let z = cz * CHUNK_SIZE + dashOffset; z <= cz * CHUNK_SIZE + CHUNK_SIZE - dashOffset; z += dashSpacing) {
          this.addBox(verts, indices, roadX, 0.04, z, dashWid, dashH, dashLen, 1, 1, 1, 0.8, idxOffset); idxOffset += 24;
        }
      }
    }

    // ── PARKING LOT LIGHTS ──
    if (isParkingLot) {
      // Already handled via lamps array below
    }

    const mesh = this.createMesh(verts, indices);

    // ── LAMPS + HYDRANTS ──
    const lamps: { x: number; z: number }[] = [];
    const hydrants: { x: number; z: number }[] = [];
    if (!isMountain && !isBeach && !isAeroport && !isBridge) {
      const halfSidewalk = SIDEWALK_SIZE / 2;
      const sidewalkEdge = GRID_PITCH / 2 - halfSidewalk;
      for (let ly = 0; ly < 2; ly++) {
        for (let lx = 0; lx < 2; lx++) {
          const lxPos = cx * CHUNK_SIZE + lx * GRID_PITCH - sidewalkEdge;
          const lzPos = cz * CHUNK_SIZE + ly * GRID_PITCH - sidewalkEdge;
          lamps.push({ x: lxPos, z: lzPos });
          const cornerSeed = ((cx * 100003 + cz * 70001) * 31 + ly * 7 + lx * 13) >>> 0;
          const hydrantRng = this.mulberry32(cornerSeed);
          if (hydrantRng() < 0.33) hydrants.push({ x: lxPos + 1.5, z: lzPos + 1.5 });
        }
      }
      // Extra boulevard lights
      if (isCity || isSuburb) {
        for (const gridX of [cx, cx + 1]) {
          if (!isBoulevard(gridX)) continue;
          const worldX = gridX * GRID_PITCH;
          for (let z = worldOriginZ + 12; z < worldOriginZ + CHUNK_SIZE - 4; z += 24) {
            lamps.push({ x: worldX - 6, z });
            lamps.push({ x: worldX + 6, z });
          }
        }
        for (const gridZ of [cz, cz + 1]) {
          if (!isBoulevard(gridZ)) continue;
          const worldZ = gridZ * GRID_PITCH;
          for (let x = worldOriginX + 12; x < worldOriginX + CHUNK_SIZE - 4; x += 24) {
            lamps.push({ x, z: worldZ - 6 });
            lamps.push({ x, z: worldZ + 6 });
          }
        }
      }
      // Parking lot floodlights
      if (isParkingLot) {
        for (let i = 0; i < 4; i++) {
          const fx = worldOriginX + 15 + (i % 2) * 50;
          const fz = worldOriginZ + 15 + Math.floor(i / 2) * 50;
          lamps.push({ x: fx, z: fz });
        }
      }
    }

    // ── PROPS — strictly limited counts to kill lag ──
    // Barrels: max 2 per chunk
    if (!isMountain && !isAeroport && !isBridge) {
      const barrelCount = 1 + Math.floor(rng() * 2);
      for (let i = 0; i < barrelCount; i++) {
        barrels.push({ x: worldOriginX + 6 + rng() * (CHUNK_SIZE - 12), z: worldOriginZ + 6 + rng() * (CHUNK_SIZE - 12), yaw: rng() * Math.PI * 2 });
      }
    }
    // Chickens: suburb only, max 1 per chunk
    if (isSuburb && rng() < 0.3) {
      chickens.push({ x: worldOriginX + 5 + rng() * (CHUNK_SIZE - 10), z: worldOriginZ + 5 + rng() * (CHUNK_SIZE - 10), yaw: rng() * Math.PI * 2 });
    }

    // Force one supermarket per city chunk if we have the model
    if ((isCity || isSuburb) && this.cityBuildingMeshes.length > 0) {
      const smModel = this.cityBuildingMeshes.find(m => m.length > 0 && m[0].carName && m[0].carName.includes('supermarket'));
      if (smModel && supermarkets.length < 1 && rng() < 0.20) {
        const halfSW = SIDEWALK_SIZE / 2;

        // Re-declare edges here because the previous one is out of scope
        const edges = [
          { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
          { dx: 1, dz: 0 }, { dx: -1, dz: 0 }
        ];
        const edge = edges[Math.floor(rng() * edges.length)];
        const w = 8 + rng() * 6;
        const d = 8 + rng() * (SIDEWALK_SIZE * 0.18);
        let px, pz, yaw;
        if (edge.dx === 0) {
          px = worldOriginX + 4 + rng() * (CHUNK_SIZE - 8);
          pz = worldOriginZ + edge.dz * (halfSW - d / 2 - 1);
          yaw = edge.dz > 0 ? Math.PI : 0;
        } else {
          pz = worldOriginZ + 4 + rng() * (CHUNK_SIZE - 8);
          px = worldOriginX + edge.dx * (halfSW - d / 2 - 1);
          yaw = edge.dx > 0 ? -Math.PI / 2 : Math.PI / 2;
        }
        const scale = Math.max(w, d) / 18 * 3.5;
        const cityMinY = this.getModelMinY(smModel);
        buildings.push({ model: smModel, x: px, y: -cityMinY * scale + 0.15, z: pz, yaw, scale: [scale, scale, scale] });
        supermarkets.push({ x: px, z: pz, yaw });
      }
    }

    const chunk: CityChunk = { mesh, cx, cz, lamps, hydrants, buildings, benches, barrels, chickens, trees, supermarkets, tatami, cabins, lighthouses, tropicalShops, decorativeAircraft };
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
    if (gender === 'hooker') {
      return this.getHookerMesh();
    }
    if (this.npcMeshes.length > 0) {
      if (this.npcMeshes.length === 1) return this.npcMeshes[0];
      return this.npcMeshes[hashSeed(seed) % this.npcMeshes.length];
    }
    if (this.npcMesh) return this.npcMesh;

    const color: [number, number, number] = gender === 'female' ? [0.85, 0.45, 0.85] : [0.45, 0.55, 0.85];
    const key = `ped_${gender}_${color.join(',')}`;
    if (this.meshCache.has(key)) return this.meshCache.get(key)!;
    const mesh = this.getPlayerMesh(color);
    this.meshCache.set(key, mesh);
    return mesh;
  }

  getBoatMesh(seed: number | string = 0): CityMesh | CityMesh[] {
    if (this.boatMeshes.length > 0) {
      if (this.boatMeshes.length === 1) return this.boatMeshes[0];
      return this.boatMeshes[hashSeed(seed) % this.boatMeshes.length];
    }
    return this.getNPCCarMesh([0.5, 0.5, 0.5], seed);
  }

  getHelicopterMesh(seed: number | string = 0): CityMesh | CityMesh[] {
    if (this.helicopterMeshes.length > 0) {
      if (this.helicopterMeshes.length === 1) return this.helicopterMeshes[0];
      return this.helicopterMeshes[hashSeed(seed) % this.helicopterMeshes.length];
    }
    return this.getNPCCarMesh([0.5, 0.5, 0.5], seed);
  }

  getPlaneMesh(seed: number | string = 0): CityMesh | CityMesh[] {
    if (this.planeMeshes.length > 0) {
      if (this.planeMeshes.length === 1) return this.planeMeshes[0];
      return this.planeMeshes[hashSeed(seed) % this.planeMeshes.length];
    }
    return this.getNPCCarMesh([0.5, 0.5, 0.5], seed);
  }

  getNPCCarMesh(color: [number, number, number], seed: number | string = 0): CityMesh | CityMesh[] {
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
    if (this.taxiMesh) return this.taxiMesh;
    const key = 'taxi_fallback';
    if (this.meshCache.has(key)) return this.meshCache.get(key)!;
    const verts: number[] = [];
    const indices: number[] = [];
    this.addBox(verts, indices, 0, 0.4, 0, 2.0, 0.8, 4.0, 1.0, 0.85, 0.1, 1.0, 0);
    this.addBox(verts, indices, 0, 1.0, -0.2, 1.6, 0.6, 2.0, 0.05, 0.05, 0.05, 1.0, 24);
    this.addBox(verts, indices, -1.2, 0.2, -1.5, 0.3, 0.4, 0.3, 0.05, 0.05, 0.05, 1.0, 48);
    this.addBox(verts, indices, 1.2, 0.2, -1.5, 0.3, 0.4, 0.3, 0.05, 0.05, 0.05, 1.0, 72);
    this.addBox(verts, indices, -1.2, 0.2, 1.5, 0.3, 0.4, 0.3, 0.05, 0.05, 0.05, 1.0, 96);
    this.addBox(verts, indices, 1.2, 0.2, 1.5, 0.3, 0.4, 0.3, 0.05, 0.05, 0.05, 1.0, 120);
    this.addBox(verts, indices, -0.5, 0.3, -2.0, 0.3, 0.2, 0.1, 1.0, 0.9, 0.4, 1.0, 144);
    this.addBox(verts, indices, 0.5, 0.3, -2.0, 0.3, 0.2, 0.1, 1.0, 0.9, 0.4, 1.0, 168);
    this.addBox(verts, indices, -0.5, 0.3, 2.0, 0.3, 0.2, 0.1, 0.8, 0.0, 0.0, 1.0, 192);
    this.addBox(verts, indices, 0.5, 0.3, 2.0, 0.3, 0.2, 0.1, 0.8, 0.0, 0.0, 1.0, 216);
    this.addBox(verts, indices, 0, 1.4, 0, 0.8, 0.2, 0.4, 0.05, 0.05, 0.05, 1.0, 240);
    const fm = this.createMesh(verts, indices);
    this.meshCache.set(key, fm);
    return fm;
  }

  getHookerMesh(): CityMesh | CityMesh[] {
    if (this.hookerMesh) return this.hookerMesh;
    const key = 'hooker_fallback';
    if (this.meshCache.has(key)) return this.meshCache.get(key)!;
    const verts: number[] = [];
    const indices: number[] = [];
    this.addBox(verts, indices, 0, 0.9, 0, 0.6, 1.2, 0.4, 0.95, 0.45, 0.65, 1.0, 0);
    this.addBox(verts, indices, 0, 1.7, 0, 0.4, 0.4, 0.4, 0.95, 0.78, 0.65, 1.0, 24);
    this.addBox(verts, indices, 0, 1.9, 0, 0.45, 0.2, 0.45, 0.65, 0.1, 0.15, 1.0, 48);
    this.addBox(verts, indices, -0.15, 0.25, 0, 0.18, 0.6, 0.3, 0.4, 0.15, 0.3, 1.0, 0);
    this.addBox(verts, indices, 0.15, 0.25, 0, 0.18, 0.6, 0.3, 0.4, 0.15, 0.3, 1.0, 0);
    const fm = this.createMesh(verts, indices);
    this.meshCache.set(key, fm);
    return fm;
  }

  getHailMarkerMesh(): CityMesh {
    if (this.meshCache.has('hail_marker')) return this.meshCache.get('hail_marker')!;
    const verts: number[] = [];
    const indices: number[] = [];
    const apex = [0, -1.0, 0];
    const r = 0.6;
    const topY = 0.5;
    const base = [[
      [-r, topY, -r], [r, topY, -r], [r, topY, r], [-r, topY, r],
    ]];
    const pushTri = (a: number[], b: number[], c: number[], n: number[]) => {
      const baseIdx = verts.length / 10;
      for (const p of [a, b, c]) {
        verts.push(p[0], p[1], p[2], n[0], n[1], n[2], 1.0, 0.85, 0.1, 1.0);
      }
      indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
    };
    const b0 = base[0][0], b1 = base[0][1], b2 = base[0][2], b3 = base[0][3];
    pushTri(b0, b1, apex, [-0.4, 0.5, -0.4]);
    pushTri(b1, b2, apex, [0.4, 0.5, -0.4]);
    pushTri(b2, b3, apex, [0.4, 0.5, 0.4]);
    pushTri(b3, b0, apex, [-0.4, 0.5, 0.4]);
    pushTri(b0, b3, b2, [0, 1, 0]);
    pushTri(b0, b2, b1, [0, 1, 0]);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('hail_marker', mesh);
    return mesh;
  }

  getDestinationMarkerMesh(): CityMesh {
    if (this.meshCache.has('dest_marker')) return this.meshCache.get('dest_marker')!;
    const verts: number[] = [];
    const indices: number[] = [];
    const SEG = 32;
    const rOut = 4.0, rIn = 3.0;
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2;
      const a1 = ((i + 1) / SEG) * Math.PI * 2;
      const baseIdx = verts.length / 10;
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

  getPickupMesh(): CityMesh {
    if (this.meshCache.has('pickup')) return this.meshCache.get('pickup')!;
    const verts: number[] = [];
    const indices: number[] = [];
    this.addBox(verts, indices, 0, -0.15, 0.15, 0.3, 0.3, 0.3, 1, 1, 1, 1, 0);
    this.addBox(verts, indices, 0, 0, 0, 0.3, 0.3, 0.3, 1, 1, 1, 1, 0);
    this.addBox(verts, indices, -0.1, 0.15, 0, 0.1, 0.1, 0.2, 1, 1, 1, 1, 0);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('pickup', mesh);
    return mesh;
  }

  getDestinationBeamMesh(): CityMesh {
    if (this.meshCache.has('dest_beam')) return this.meshCache.get('dest_beam')!;
    const verts: number[] = [];
    const indices: number[] = [];
    const SEG = 8;
    const r = 0.4;
    const h = 40.0;
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2;
      const a1 = ((i + 1) / SEG) * Math.PI * 2;
      const baseIdx = verts.length / 10;
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
    pitch: number = 0,
    roll: number = 0
  ) {
    mat4.identity(this.modelMatrix);
    mat4.translate(this.modelMatrix, this.modelMatrix, [x, y, z]);
    if (roll) mat4.rotateZ(this.modelMatrix, this.modelMatrix, roll);
    if (pitch) mat4.rotateX(this.modelMatrix, this.modelMatrix, pitch);
    mat4.rotateY(this.modelMatrix, this.modelMatrix, yaw);

    const meshList = Array.isArray(mesh) ? mesh : [mesh];
    const yo = meshList.reduce<number>((o, m) => o || (m.yawOffset ?? 0), 0);
    if (yo) mat4.rotateY(this.modelMatrix, this.modelMatrix, yo);

    if (meshList.some(m => m.needsFlip)) {
      mat4.rotateX(this.modelMatrix, this.modelMatrix, Math.PI);
      mat4.rotateY(this.modelMatrix, this.modelMatrix, Math.PI);
      mat4.translate(this.modelMatrix, this.modelMatrix, [0, -2, 0]);
    }

    if (meshList.some(m => m.texture?.toString().includes('motorcycle'))) {
      mat4.rotateY(this.modelMatrix, this.modelMatrix, Math.PI);
    }

    const renderScale = meshList.reduce((max, m) => Math.max(max, m.renderScale ?? 1), 1);
    if (renderScale !== 1) {
      scale = [scale[0] * renderScale, scale[1] * renderScale, scale[2] * renderScale];
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

    const nightSky = [0.05, 0.06, 0.1];
    const daySky = [0.7, 0.8, 0.9];
    this.skyColor = [
      nightSky[0] + (daySky[0] - nightSky[0]) * dayBlend,
      nightSky[1] + (daySky[1] - nightSky[1]) * dayBlend,
      nightSky[2] + (daySky[2] - nightSky[2]) * dayBlend
    ];

    const nightLight = [0.3, 0.3, 0.4];
    const dayLight = [1.0, 1.0, 0.95];
    this.lightColor = [
      nightLight[0] + (dayLight[0] - nightLight[0]) * dayBlend,
      nightLight[1] + (dayLight[1] - nightLight[1]) * dayBlend,
      nightLight[2] + (dayLight[2] - nightLight[2]) * dayBlend
    ];

    const nightAmb = [0.18, 0.18, 0.25];
    const dayAmb = [0.3, 0.3, 0.35];
    this.ambientColor = [
      nightAmb[0] + (dayAmb[0] - nightAmb[0]) * dayBlend,
      nightAmb[1] + (dayAmb[1] - nightAmb[1]) * dayBlend,
      nightAmb[2] + (dayAmb[2] - nightAmb[2]) * dayBlend
    ];
  } render(
    camX: number, camY: number, camZ: number, camYaw: number, camPitch: number, aspect: number,
    targetX: number, targetY: number, targetZ: number, carYaw: number,
    serverNPCs: any[], otherPlayers: any[], serverPedestrians: any[], parkedCars: any[],
    tracers: any[], muzzleFlashes: any[], rockets: any[], explosions: any[], bloodSplats: any[],
    bloodPools: any[],
    moneyStacks: any[],
    deadBodies: any[],
    vendingMachines: any[],
    playerMesh: CityMesh | CityMesh[] | null,
    markers: any[],
    attachedMeshes: any[],
    playerCarOnFire: boolean,
    carFireX: number, carFireZ: number, carFireYaw: number,
    trafficNodes?: { x: number; z: number }[],
    farPlane?: number,
    enableShadows: boolean = true,
    carRoll: number = 0
  ) {
    const gl = this.gl;
    const now = performance.now();
    const PICKUP_SCALE = 0.2;
    const PICKUP_SPIN_SPEED = 1.5;
    const pickupYaw = (now / 1000) * PICKUP_SPIN_SPEED;
    const dt = (this.lastFrameTime === 0 ? 0 : (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    this.updateSun(dt);

    // FIX: Declare these outside the shadow pass so the main pass can use them!
    const pcx = Math.floor(camX / CHUNK_SIZE);
    const pcz = Math.floor(camZ / CHUNK_SIZE);
    const nearbyLamps: { x: number; y: number; z: number }[] = [];

    // 1. Shadow Pass
    if (enableShadows) {
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

      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const chunk = this.getCityChunk(pcx + dx, pcz + dz);
          this.drawMesh(chunk.mesh, 0, 0, 0, 0, [1, 1, 1], [1, 1, 1, 1], true);
          for (const bld of chunk.buildings) {
            this.drawMesh(bld.model, bld.x, bld.y, bld.z, bld.yaw, bld.scale, [1, 1, 1, 1], true);
          }
          for (const lamp of chunk.lamps) {
            const distSq = (lamp.x - camX) ** 2 + (lamp.z - camZ) ** 2;
            if (distSq < 50 * 50) {
              nearbyLamps.push({ x: lamp.x, y: 1.05, z: lamp.z });
            }
          }
        }
      }
      for (const pc of parkedCars) this.drawMesh(pc.mesh, pc.x, (pc as any)._expY ?? 0, pc.z, pc.yaw, [1, 1, 1], [1, 1, 1, 1], true);
      for (const npc of serverNPCs) {
        const vy = (npc.type === 'helicopter' || npc.type === 'plane') ? (npc.y || 0) : 0;
        this.drawMesh(npc.mesh, npc.x, vy, npc.z, npc.yaw, [1, 1, 1], [1, 1, 1, 1], true);
      }
      for (const ped of serverPedestrians) this.drawMesh(ped.mesh, ped.x, 0, ped.z, ped.yaw, [1, 1, 1], [1, 1, 1, 1], true);
      for (const p of otherPlayers) {
        if (p.passengerOfUserId && p.passengerOfUserId > 0) continue;
        if (p.isInCar) {
          const vType = p.vehicleType || 'car';
          let carMesh: CityMesh | CityMesh[];
          const col: [number, number, number] = [p.carColorR ?? 1, p.carColorG ?? 1, p.carColorB ?? 1];
          if (vType === 'taxi') carMesh = this.getTaxiMesh();
          else if (vType === 'bus') carMesh = this.busMesh || this.getNPCCarMesh(col, p.userId);
          else if (vType === 'boat') carMesh = this.getBoatMesh(p.userId);
          else if (vType === 'helicopter') carMesh = this.getHelicopterMesh(p.userId);
          else if (vType === 'plane') carMesh = this.getPlaneMesh(p.userId);
          else if (vType === 'motorcycle') carMesh = this.motorcycleMeshes.length > 0 ? this.motorcycleMeshes[0] : this.getNPCCarMesh(col, p.userId);
          else if (vType === 'police') carMesh = this.getPoliceCarMesh();
          else carMesh = this.carMeshes.length > 0 ? this.carMeshes[0] : this.getNPCCarMesh(col, p.userId);
          const vehicleY = (vType === 'helicopter' || vType === 'plane') ? (p.posY || 0) : 0;
          this.drawMesh(carMesh, p.posX, vehicleY, p.posZ, p.yaw, [1, 1, 1], [1, 1, 1, 1], true);
        }
        this.drawMesh(p.mesh, p.posX, p.posY, p.posZ, p.yaw, [1, 1, 1], [1, 1, 1, 1], true);
      }
      if (this.hospitalMesh) this.drawMesh(this.hospitalMesh, 40, 0.06, 40, 0, [15, 10, 15], [1, 1, 1, 1], true);
      if (this.homeBaseMesh) this.drawMesh(this.homeBaseMesh, 120, 0, 40, 0, [10, 10, 10], [1, 1, 1, 1], true);
      if (this.vendingMachineMesh) {
        for (const vm of vendingMachines) {
          this.drawMesh(this.vendingMachineMesh, vm.x, 0, vm.z, vm.yaw, [1, 1, 1], [1, 1, 1, 1], true);
        }
      }
      if (playerMesh) {
        this.drawMesh(playerMesh, targetX, targetY, targetZ, carYaw, [1, 1, 1], [1, 1, 1, 1], true, 0, carRoll);
      }
      for (const db of deadBodies) {
        const isHuman = db.type === 'player' || db.type === 'ped_male' || db.type === 'ped_female' || db.type === 'cop';
        const dbPitch = isHuman ? -Math.PI / 2 : 0;
        this.drawMesh(db.mesh, db.x, 0.02, db.z, db.yaw, [1, 1, 1], [0.4, 0.4, 0.4, 1], true, dbPitch);
      }

      for (const w of this.droppedWeapons) {
        if (w == null || w.weaponType == null) continue;
        this.drawMesh(
          this.getWeaponPickupMesh(w.weaponType),
          w.posX, 1.0, w.posZ,
          pickupYaw,
          [PICKUP_SCALE, PICKUP_SCALE, PICKUP_SCALE],
          [1, 1, 1, 1],
          true
        );
      }

      gl.disable(gl.POLYGON_OFFSET_FILL);
    } else {
      // Mobile shadow optimization. Clear the depth buffer so the shader 
      // evaluates to 0.0 (no shadow), skipping the second mesh render pass.
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
      gl.viewport(0, 0, this.shadowMapSize, this.shadowMapSize);
      gl.clear(gl.DEPTH_BUFFER_BIT);
    }

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

    gl.enable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

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
    gl.uniform1i(this.numPointLightsLoc, this.dayBlend < 0.5 ? numLights : 0);
    gl.uniform3fv(this.pointLightPosLoc, pointLightPositions);

    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const chunk = this.getCityChunk(pcx + dx, pcz + dz);
        this.drawMesh(chunk.mesh, 0, 0, 0, 0, [1, 1, 1], [1, 1, 1, 1]);

        if (this.lampMesh) {
          const lampModels = Array.isArray(this.lampMesh) ? this.lampMesh : [this.lampMesh];
          for (const lamp of chunk.lamps) {
            const mi = Math.abs(Math.floor(lamp.x * 7 + lamp.z * 13)) % lampModels.length;
            this.drawMesh(lampModels[mi], lamp.x, 0, lamp.z, 0, [1, 1, 1], [0.25, 0.3, 0.22, 1]);
          }
        }
        if (this.hydrantMesh) {
          for (const hydrant of chunk.hydrants) {
            this.drawMesh(this.hydrantMesh, hydrant.x, 0, hydrant.z, 0, [1, 1, 1], [1, 0, 0, 1]);
          }
        }
        if (this.palmTreeMesh) {
          for (const tree of chunk.trees) {
            this.drawMesh(this.palmTreeMesh, tree.x, 0, tree.z, tree.yaw, [tree.scale, tree.scale, tree.scale], [1, 1, 1, 1]);
          }
        }
        if (this.benchMeshes.length > 0) {
          for (const bench of chunk.benches) {
            const bm = this.benchMeshes[Math.abs((bench.x * 100 + bench.z) | 0) % this.benchMeshes.length];
            this.drawMesh(bm, bench.x, 0, bench.z, bench.yaw, [0.8, 0.8, 0.8], [1, 1, 1, 1]);
          }
        }
        if (this.tatamiRoomMesh) {
          for (const t of chunk.tatami) {
            this.drawMesh(this.tatamiRoomMesh, t.x, 0, t.z, t.yaw, [1, 1, 1], [0.9, 0.8, 0.6, 1]);
          }
        }
        if (this.woodenCabineMesh) {
          for (const c of chunk.cabins) {
            this.drawMesh(this.woodenCabineMesh, c.x, 0, c.z, c.yaw, [1, 1, 1]);
          }
        }
        if (this.cylindricalTowerMesh) {
          for (const l of chunk.lighthouses) {
            this.drawMesh(this.cylindricalTowerMesh, l.x, 0, l.z, l.yaw, [1, 1, 1]);
          }
        }
        if (this.tropicalShopMesh) {
          for (const s of chunk.tropicalShops) {
            this.drawMesh(this.tropicalShopMesh, s.x, 0, s.z, s.yaw, [1, 1, 1]);
          }
        }
        if (this.barrelMesh) {
          for (const barrel of chunk.barrels) {
            const key = `${barrel.x},${barrel.z}`;
            if (this.explodedBarrels.has(key)) continue;
            this.drawMesh(this.barrelMesh, barrel.x, 0, barrel.z, barrel.yaw, [0.5, 0.5, 0.5], [1, 1, 1, 1]);
          }
        }
        if (this.chickenMesh) {
          for (const chicken of chunk.chickens) {
            this.drawMesh(this.chickenMesh, chicken.x, 0, chicken.z, chicken.yaw, [1.5, 1.5, 1.5], [1, 1, 1, 1]);
          }
        }
        for (const bld of chunk.buildings) {
          const key = `${bld.x},${bld.z}`;
          if (this.explodedGasStations.has(key) && bld.model && bld.model.length > 0 && bld.model[0].carName?.includes('gas_station')) {
            const timer = this.explodedGasStationTimers.get(key);
            if (timer && performance.now() - timer < GrandTheftRenderer.GAS_STATION_COOLDOWN) {
              this.drawMesh(bld.model, bld.x, bld.y, bld.z, bld.yaw, bld.scale, [0.15, 0.15, 0.15, 1]);
              continue;
            } else {
              this.explodedGasStations.delete(key);
              this.explodedGasStationTimers.delete(key);
            }
          }
          this.drawMesh(bld.model, bld.x, bld.y, bld.z, bld.yaw, bld.scale, [1, 1, 1, 1]);
        }
      }
    }

    // Clean up expired gas station timers to prevent memory leaks
    for (const [k, t] of this.explodedGasStationTimers) {
      if (now - t >= GrandTheftRenderer.GAS_STATION_COOLDOWN) {
        this.explodedGasStations.delete(k);
        this.explodedGasStationTimers.delete(k);
      }
    }

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
            this.drawMesh(this.trafficLightMesh, node.x + corners[ci][0], 0, node.z + corners[ci][1], yawCorner[ci], [2, 2, 2], [0.25, 0.3, 0.22, 1]);
          }
        }
        const redOn = lightPhase === 0;
        for (const node of trafficNodes) {
          const ndx = node.x - camX, ndz = node.z - camZ;
          if (ndx * ndx + ndz * ndz > 250 * 250) continue;
          for (let ci = 0; ci < corners.length; ci++) {
            const lx = node.x + corners[ci][0];
            const lz = node.z + corners[ci][1];
            this.drawMesh(this.getSphereMesh(0.075), lx + 0.15, 3.86, lz + 0.12, 0, [1, 1, 1], redOn ? [1, 0.1, 0.1, 1] : [0.05, 0.15, 0.05, 0.4]);
            this.drawMesh(this.getSphereMesh(0.075), lx + 0.15, 3.70, lz + 0.12, 0, [1, 1, 1], redOn ? [0.05, 0.15, 0.05, 0.4] : [0.1, 1, 0.1, 1]);
            this.drawMesh(this.getSphereMesh(0.075), lx - 1, 3.86, lz + 1.6, 0, [1, 1, 1], redOn ? [1, 0.1, 0.1, 1] : [0.05, 0.15, 0.05, 0.4]);
            this.drawMesh(this.getSphereMesh(0.075), lx - 1, 3.70, lz + 1.6, 0, [1, 1, 1], redOn ? [0.05, 0.15, 0.05, 0.4] : [0.1, 1, 0.1, 1]);
          }
        }
      } else {
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
            this.drawMesh(this.meshCache.get('tl_pole')!, lx, 0, lz, 0, [1, 1, 1], [0.25, 0.3, 0.22, 1]);
          }
          const redOn = lightPhase === 0;
          for (let ci = 0; ci < corners.length; ci++) {
            const lx = node.x + corners[ci][0];
            const lz = node.z + corners[ci][1];
            this.drawMesh(this.getSphereMesh(0.06), lx, 2.6, lz, 0, [1, 1, 1], redOn ? [1, 0.1, 0.1, 1] : [0.05, 0.15, 0.05, 0.4]);
            this.drawMesh(this.getSphereMesh(0.06), lx, 2.2, lz, 0, [1, 1, 1], redOn ? [0.05, 0.15, 0.05, 0.4] : [0.1, 1, 0.1, 1]);
          }
        }
      }
    }

    for (const pc of parkedCars) {
      const biome = getBiome(Math.floor(pc.x / 80), Math.floor(pc.z / 80));
      const isBoat = pc.type === 'boat';
      const submergeY = biome === 'ocean' ? (isBoat ? 0 : -1.5) : getTerrainHeight(pc.x, pc.z);
      this.drawMesh(pc.mesh, pc.x, (pc as any)._expY ?? submergeY, pc.z, pc.yaw);
    }

    for (const npc of serverNPCs) {
      const biome = getBiome(Math.floor(npc.x / 80), Math.floor(npc.z / 80));
      const submerged = biome === 'ocean';
      const isAircraft = npc.type === 'helicopter' || npc.type === 'plane';
      const terrainY = submerged ? -1.5 : getTerrainHeight(npc.x, npc.z);
      const expY = isAircraft ? (npc.y || 0) : (npc as any)._expY ?? terrainY;
      this.drawMesh(npc.mesh, npc.x, expY, npc.z, npc.yaw);
      if (npc.hasDriver !== false && npc.type !== 'cop') {
        const dMesh = this.getPedestrianMesh(npc.gender || 'male', npc.id);
        const sinY = Math.sin(npc.yaw), cosY = Math.cos(npc.yaw);
        const dOffX = 0.3, dOffZ = 0.2;
        const dwx = npc.x + (dOffX * cosY + dOffZ * sinY);
        const dwz = npc.z + (-dOffX * sinY + dOffZ * cosY);
        this.drawMesh(dMesh, dwx, -0.3, dwz, npc.yaw, [0.85, 0.85, 0.85]);
        if ((npc.passengerCount || 0) > 0) {
          const pMesh = this.getPedestrianMesh('female', npc.id + 1);
          const pOffX = -0.3, pOffZ = 0.2;
          const pwx = npc.x + (pOffX * cosY + pOffZ * sinY);
          const pwz = npc.z + (-pOffX * sinY + pOffZ * cosY);
          this.drawMesh(pMesh, pwx, -0.3, pwz, npc.yaw, [0.7, 0.7, 0.7]);
        }
      }
      if (npc.type === 'police') {
        const isRed = (performance.now() / 300) % 2 < 1;
        const lightColor: [number, number, number, number] = isRed ? [1, 0, 0, 1] : [0, 0, 1, 1];
        this.drawMesh(this.getBoxMesh(0.8, 0.2, 0.4), npc.x, 1.2, npc.z, npc.yaw, [1, 1, 1], lightColor);
      }
      if (npc.state === 'stop') {
        this.drawMesh(this.getBoxMesh(0.4, 0.2, 0.3), npc.x, 1.0, npc.z, npc.yaw, [1, 1, 1], [1, 0, 0, 1]);
      }
    }

    for (const ped of serverPedestrians) this.drawMesh(ped.mesh, ped.x, 0, ped.z, ped.yaw);
    for (const p of otherPlayers) {
      if (p.passengerOfUserId && p.passengerOfUserId > 0) {
        const host = otherPlayers.find(h => h.userId === p.passengerOfUserId);
        if (host && host.isInCar) {
          const sinY = Math.sin(host.yaw), cosY = Math.cos(host.yaw);
          const offX = -0.3, offZ = 0.2;
          const wx = host.posX + (offX * cosY + offZ * sinY);
          const wz = host.posZ + (-offX * sinY + offZ * cosY);
          this.drawMesh(p.mesh, wx, -0.3, wz, host.yaw, [0.85, 0.85, 0.85]);
        }
        continue;
      }
      if (p.isInCar) {
        const vType = p.vehicleType || 'car';
        let carMesh: CityMesh | CityMesh[];
        const col: [number, number, number] = [p.carColorR ?? 1, p.carColorG ?? 1, p.carColorB ?? 1];
        if (vType === 'taxi') carMesh = this.getTaxiMesh();
        else if (vType === 'bus') carMesh = this.busMesh || this.getNPCCarMesh(col, p.userId);
        else if (vType === 'boat') carMesh = this.getBoatMesh(p.userId);
        else if (vType === 'helicopter') carMesh = this.getHelicopterMesh(p.userId);
        else if (vType === 'plane') carMesh = this.getPlaneMesh(p.userId);
        else if (vType === 'motorcycle') carMesh = this.motorcycleMeshes.length > 0 ? this.motorcycleMeshes[0] : this.getNPCCarMesh(col, p.userId);
        else if (vType === 'police') carMesh = this.getPoliceCarMesh();
        else carMesh = this.carMeshes.length > 0 ? this.carMeshes[0] : this.getNPCCarMesh(col, p.userId);
        const vy = (vType === 'helicopter' || vType === 'plane') ? (p.posY || 0) : 0;
        this.drawMesh(carMesh, p.posX, vy, p.posZ, p.yaw);
        const sinY = Math.sin(p.yaw), cosY = Math.cos(p.yaw);
        const offX = 0.3, offZ = 0.2;
        const wx = p.posX + (offX * cosY + offZ * sinY);
        const wz = p.posZ + (-offX * sinY + offZ * cosY);
        this.drawMesh(p.mesh, wx, -0.3, wz, p.yaw, [0.85, 0.85, 0.85]);
      } else {
        this.drawMesh(p.mesh, p.posX, p.posY, p.posZ, p.yaw);
      }
    }

    if (this.hospitalMesh) this.drawMesh(this.hospitalMesh, 40, 0.06, 40, 0, [15, 10, 15]);
    if (this.homeBaseMesh) this.drawMesh(this.homeBaseMesh, 120, 0, 40, 0, [10, 10, 10]);
    if (this.garageCarMesh) this.drawMesh(this.garageCarMesh, 120, 0, 42, 0);

    if (this.vendingMachineMesh) {
      for (const vm of vendingMachines) {
        this.drawMesh(this.vendingMachineMesh, vm.x, 0, vm.z, vm.yaw);
      }
    }

    if (playerMesh) this.drawMesh(playerMesh, targetX, targetY, targetZ, carYaw, [1, 1, 1], [1, 1, 1, 1], false, 0, carRoll);

    if (attachedMeshes && attachedMeshes.length > 0) {
      const sinY = Math.sin(carYaw), cosY = Math.cos(carYaw);
      for (const am of attachedMeshes) {
        const wx = targetX + (am.offsetX * cosY + am.offsetZ * sinY);
        const wz = targetZ + (-am.offsetX * sinY + am.offsetZ * cosY);
        const s = am.scale ?? 1;
        this.drawMesh(am.mesh, wx, targetY + am.offsetY, wz, carYaw + am.yaw, [s, s, s]);
      }
    }

    gl.disable(gl.DEPTH_TEST);
    for (const b of bloodSplats) {
      const t = b.age / b.lifetime;
      const alpha = 1.0 - t;
      const sz = b.size * (1.0 - t * 0.3);
      const tint = 0.85 - t * 0.25;
      this.drawMesh(this.getBloodMesh(), b.x, b.y, b.z, 0, [sz, sz, sz], [tint, 0.0, 0.0, alpha]);
    }

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    for (const bp of bloodPools) {
      const progress = bp.age / bp.lifetime;
      const poolScale = 1 + progress * bp.maxRadius;
      const alpha = Math.max(0, 1.0 - progress * 0.5);
      const rot = ((bp.x * 0.7 + bp.z * 1.3) % (Math.PI * 2));
      this.drawMesh(this.getBloodPoolMesh(bp.variant || 0), bp.x, 0.01, bp.z, rot, [poolScale, 1, poolScale], [1.0, 1.0, 1.0, alpha]);
    }
    for (const ms of moneyStacks) {
      const progress = ms.age / ms.lifetime;
      const alpha = 1.0 - progress;
      const spin = performance.now() / 1000 * 2 + ms.x;
      if (this.moneyMesh) {
        this.drawMesh(this.moneyMesh, ms.x, 0.1, ms.z, spin, [0.1, 0.1, 0.1], [1, 1, 1, alpha]);
      } else {
        this.drawMesh(this.getMoneyStackMesh(), ms.x, 0.01, ms.z, spin, [1, 1, 1], [1, 1, 1, alpha]);
      }
    }
    gl.depthMask(true);

    for (const db of deadBodies) {
      const isHuman = db.type === 'player' || db.type === 'ped_male' || db.type === 'ped_female' || db.type === 'cop';
      const dbPitch = isHuman ? -Math.PI / 2 : 0;
      const elapsed = (performance.now() / 1000) - db.deathTime;
      const fadeAlpha = Math.max(0.4, 1.0 - elapsed / 30);
      this.drawMesh(db.mesh, db.x, 0.02, db.z, -db.yaw, [1, 1, 1], [0.4, 0.4, 0.4, fadeAlpha], false, dbPitch);
    }

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
      const coreScale = 1 + progress * 4;
      const coreAlpha = (1.0 - progress) * 1.2;
      this.drawMesh(this.getExplosionMesh(), e.x, e.y + 0.5, e.z, 0, [coreScale, coreScale, coreScale], [1, 1, 1, Math.min(1, coreAlpha)]);
      const fireScale = 2 + progress * 8;
      const fireAlpha = (1.0 - progress) * 0.8;
      this.drawMesh(this.getExplosionMesh(), e.x, e.y + 1.0, e.z, 0, [fireScale, fireScale * 0.8, fireScale], [1, 0.5, 0.0, fireAlpha]);
      const smokeScale = 3 + progress * 12;
      const smokeAlpha = (1.0 - progress) * 0.5;
      this.drawMesh(this.getExplosionMesh(), e.x, e.y + 2.0 + progress * 3, e.z, 0, [smokeScale, smokeScale, smokeScale], [0.2, 0.2, 0.2, smokeAlpha]);
    }
    for (const m of muzzleFlashes) {
      const t = m.age / m.lifetime;
      const alpha = 1.0 - t;
      const weaponScale = m.weapon === 2 ? 1.4 : m.weapon === 1 ? 1.0 : 0.75;
      const dirLen = Math.hypot(m.dirX, m.dirY, m.dirZ) || 1;
      const fx = m.dirX / dirLen, fy = m.dirY / dirLen, fz = m.dirZ / dirLen;
      const barrelOffset = 1.5;
      const flashX = m.x + fx * barrelOffset;
      const flashY = m.y + fy * barrelOffset;
      const flashZ = m.z + fz * barrelOffset;
      const s = weaponScale * (0.9 + 0.2 * Math.sin(t * 40));
      this.drawMesh(this.getMuzzleFlashMesh(), flashX, flashY, flashZ, 0, [s, s, s], [1.0, 1.0, 1.0, alpha]);
    }

    if (markers && markers.length > 0) {
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(false);
      for (const m of markers) {
        if (m.type === 'destination') {
          const pulse = 1.0 + 0.15 * Math.sin(performance.now() / 250);
          this.drawMesh(this.getDestinationMarkerMesh(), m.x, 0.02, m.z, 0, [pulse, 1, pulse], [1.0, 1.0, 1.0, 1.0]);
        }
      }
      gl.depthMask(true);

      gl.disable(gl.DEPTH_TEST);
      for (const m of markers) {
        if (m.type === 'hail') {
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

    // Draw car fires (reuse explosion fire sphere on hood)
    const fireMesh = this.getExplosionMesh();
    const fireColor: [number, number, number, number] = [1, 0.5, 0.0, 0.9];
    const fireScale = 0.6;
    for (const npc of serverNPCs) {
      if ((npc as any).isBurning) {
        const sinYf = Math.sin(npc.yaw), cosYf = Math.cos(npc.yaw);
        const fx = npc.x + cosYf * 0.8;
        const fz = npc.z + sinYf * 0.8;
        const fireY = (npc.type === 'helicopter' || npc.type === 'plane') ? (npc.y || 0) + 0.6 : 0.6;
        const flicker = 0.85 + Math.sin(now / 100) * 0.15;
        this.drawMesh(fireMesh, fx, fireY, fz, 0, [fireScale * flicker, fireScale * flicker, fireScale * flicker], fireColor);
      }
    }
    for (const pc of parkedCars) {
      if ((pc as any).isBurning) {
        const sinYf = Math.sin(pc.yaw), cosYf = Math.cos(pc.yaw);
        const fx = pc.x + cosYf * 0.8;
        const fz = pc.z + sinYf * 0.8;
        const flicker = 0.85 + Math.sin(now / 100) * 0.15;
        this.drawMesh(fireMesh, fx, 0.6, fz, 0, [fireScale * flicker, fireScale * flicker, fireScale * flicker], fireColor);
      }
    }
    if (playerCarOnFire) {
      const sinYf = Math.sin(carFireYaw), cosYf = Math.cos(carFireYaw);
      const fx = carFireX + cosYf * 0.8;
      const fz = carFireZ + sinYf * 0.8;
      const growth = 1 + Math.min(this.carFireElapsed / 10, 1) * 2;
      const pulse = 1 + Math.sin(now / 200) * 0.25;
      const flicker = 0.85 + Math.sin(now / 100) * 0.15;
      const s = fireScale * 2.5 * growth * pulse * flicker;
      this.drawMesh(fireMesh, fx, 0.8, fz, 0, [s, s, s], fireColor);
    }

    gl.enable(gl.DEPTH_TEST);
    // Draw dropped weapons as rotating pickups (real weapon models)
    if (this.droppedWeapons && this.droppedWeapons.length > 0) {
      for (const dw of this.droppedWeapons) {
        if (dw == null || dw.weaponType == null) continue;
        const hover = Math.sin((now / 1000) * 3 + (dw.id || 0)) * 0.15;
        this.drawMesh(
          this.getWeaponPickupMesh(dw.weaponType),
          dw.posX, 1.0 + hover, dw.posZ,
          pickupYaw + (dw.id || 0),
          [PICKUP_SCALE, PICKUP_SCALE, PICKUP_SCALE],
          [1, 1, 1, 1]
        );
      }
    }
    gl.enable(gl.DEPTH_TEST);

    // ── Skybox (post-scene) ──────────────────────────────
    // Render AFTER the scene so it only fills pixels where
    // depth is still 1.0 (no scene geometry).
    if (this.skyboxMesh) {
      gl.useProgram(this.gltfSkyProgram);
      gl.uniformMatrix4fv(this.gltfSkyProjLoc, false, this.projMatrix);
      const fwdX = Math.sin(camYaw) * Math.cos(camPitch);
      const fwdY = -Math.sin(camPitch);
      const fwdZ = Math.cos(camYaw) * Math.cos(camPitch);
      const skyView = new Float32Array(this.viewMatrix);
      skyView[12] = fwdX * 0.01; skyView[13] = fwdY * 0.01; skyView[14] = fwdZ * 0.01;
      gl.uniformMatrix4fv(this.gltfSkyViewLoc, false, skyView);
      gl.depthMask(false);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      const skyModel = mat4.create();
      mat4.identity(skyModel);
      mat4.translate(skyModel, skyModel, [0, -1, 0]);
      gl.uniformMatrix4fv(this.gltfSkyModelLoc, false, skyModel);
      for (const m of this.skyboxMesh) {
        if (m.texture) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, m.texture);
          gl.uniform1i(this.gltfSkyTexLoc, 0);
        }
        gl.bindVertexArray(m.vao);
        gl.drawElements(gl.TRIANGLES, m.indexCount, m.indexType || gl.UNSIGNED_SHORT, 0);
      }
      gl.depthFunc(gl.LESS);
      gl.enable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.depthMask(true);
    }
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
    const verts: number[] = [], indices: number[] = [];
    const stacks = 6, slices = 10;
    let vIdx = 0;
    for (let stack = 0; stack <= stacks; stack++) {
      const phi = (stack / stacks) * Math.PI;
      const y = Math.cos(phi);
      const r = Math.sin(phi);
      for (let slice = 0; slice <= slices; slice++) {
        const theta = (slice / slices) * Math.PI * 2;
        const x = r * Math.cos(theta);
        const z = r * Math.sin(theta);
        verts.push(x * 0.5, y * 0.5, z * 0.5);
        verts.push(x, y, z);
        verts.push(1.0, 0.5, 0.0, 1.0);
        verts.push(slice / slices, stack / stacks);
        vIdx++;
      }
    }
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
    if (this.meshCache.has('muzzle_flash')) return this.meshCache.get('muzzle_flash')!;
    const verts: number[] = [], indices: number[] = [];
    this.addBox(verts, indices, 0, 0, 0, 0.4, 0.4, 0.4, 1.0, 0.95, 0.7, 1.0, 0);
    this.addBox(verts, indices, 0, 0, 0.55, 0.18, 0.18, 1.1, 1.0, 0.85, 0.3, 1.0, 24);
    this.addBox(verts, indices, 0.45, 0, 0, 0.9, 0.15, 0.15, 1.0, 0.6, 0.15, 1.0, 48);
    this.addBox(verts, indices, 0, 0.45, 0, 0.15, 0.9, 0.15, 1.0, 0.6, 0.15, 1.0, 72);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('muzzle_flash', mesh);
    return mesh;
  }

  private getBloodMesh(): CityMesh {
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
    const key = `bloodpool_${variant}`;
    if (this.meshCache.has(key)) return this.meshCache.get(key)!;
    const verts: number[] = [], indices: number[] = [];
    const rng = this.mulberry32(variant * 7919 + 31);
    const SEGMENTS = 16;
    const centerIdx = 0;
    verts.push(0, 0, 0, 0.35, 0.0, 0.0, 1.0);
    for (let i = 0; i < SEGMENTS; i++) {
      const theta = (i / SEGMENTS) * Math.PI * 2;
      const r = 0.85 + (rng() - 0.5) * 0.40;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      const tint = 0.55 + (rng() - 0.5) * 0.10;
      verts.push(x, 0, z, tint, 0.0, 0.0, 1.0);
    }
    for (let i = 0; i < SEGMENTS; i++) {
      const next = (i + 1) % SEGMENTS;
      indices.push(centerIdx, 1 + next, 1 + i);
    }
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set(key, mesh);
    return mesh;
  }
  getPoliceCarMesh(): CityMesh | CityMesh[] {
    if (this.policeCarMesh) return this.policeCarMesh;
    const key = `police_car`;
    if (this.meshCache.has(key)) return this.meshCache.get(key)!;
    const verts: number[] = [];
    const indices: number[] = [];
    this.addBox(verts, indices, 0, 0.4, 0, 2.0, 0.8, 4.0, 0.1, 0.1, 0.1, 1.0, 0);
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
  private getSphereMesh(radius: number): CityMesh {
    const key = `sphere_${radius}`;
    if (this.meshCache.has(key)) return this.meshCache.get(key)!;
    const verts: number[] = [], indices: number[] = [];
    const stacks = 10, slices = 16;
    const startIndex = verts.length / 10;
    for (let i = 0; i <= stacks; i++) {
      const v = i / stacks;
      const theta = v * Math.PI;
      const sinT = Math.sin(theta), cosT = Math.cos(theta);
      for (let j = 0; j <= slices; j++) {
        const u = j / slices;
        const phi = u * Math.PI * 2;
        const sinP = Math.sin(phi), cosP = Math.cos(phi);
        verts.push(cosP * sinT * radius, cosT * radius, sinP * sinT * radius, cosP * sinT, cosT, sinP * sinT, 1, 1, 1, 1);
      }
    }
    for (let i = 0; i < stacks; i++) {
      for (let j = 0; j < slices; j++) {
        const aI = startIndex + i * (slices + 1) + j;
        const bI = startIndex + (i + 1) * (slices + 1) + j;
        indices.push(aI, bI, aI + 1, bI, bI + 1, aI + 1);
      }
    }
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
      img.src = (url.startsWith('blob:') || url.startsWith('data:')) ? url : url;
    });
  }
  // State for first-person animation playback
  private _fpAnimTime = 0;
  private _fpLoggedStatus = false;
  private _fpCurrentAnim: { arms?: string; mark23?: string } = { arms: 'relax', mark23: 'Draw' };

  /**
   * Called by the component every frame (after render()) to draw first-person
   * arms + Mark23 with the correct animation. The component picks the anim
   * names based on game state (shoot, reload, idle, etc.).
   */
  renderFirstPersonWeapon(
    camX: number, camY: number, camZ: number,
    camYaw: number, camPitch: number,
    weapon: number,
    armsAnim: string,
    mark23Anim: string | null,
    dt: number
  ): void {
    const gl = this.gl;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    const fx = Math.sin(camYaw) * Math.cos(camPitch);
    const fy = -Math.sin(camPitch);
    const fz = Math.cos(camYaw) * Math.cos(camPitch);
    const rightX = Math.cos(camYaw), rightZ = -Math.sin(camYaw);
    if (this.firstPersonArmsMesh) {
      const ax = camX + fx * 0.2 + rightX * 0.06;
      const ay = camY + fy * 0.2 - 1.5;
      const az = camZ + fz * 1.2 + rightZ * 0.06;
      this.drawMesh(this.firstPersonArmsMesh, ax, ay, az, camYaw + Math.PI, [0.6, 0.6, 0.6], [1, 1, 1, 1]);
    }
    if (weapon === 1 && this.mark23Mesh) {
      const mx = camX + fx * 0.4 + rightX * 0.06;
      const my = camY + fy * 2.4 - 2.2;
      const mz = camZ + fz * 3.4 + rightZ * 0.06;
      this.drawMesh(this.mark23Mesh, mx, my, mz, camYaw, [1, 1, 1], [1, 1, 1, 1]);
    }
    gl.enable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
  }
  /**
 * Extract animation data from a parsed GLTF json + buffers.
 * Returns an array of GltfAnimation, one per entry in json.animations.
 * Mirrors the math used by the skin parser above.
 */
  private extractGltfAnimations(json: any, buffers: ArrayBuffer[]): GltfAnimation[] | null {
    if (!json.animations || !json.accessors || !json.bufferViews) return null;
    const out: GltfAnimation[] = [];
    for (const anim of json.animations) {
      const channels: GltfAnimation['channels'] = [];
      let maxTime = 0;
      for (const ch of anim.channels || []) {
        const samplerDef = anim.samplers[ch.sampler];
        if (!samplerDef) continue;

        const inAcc = json.accessors[samplerDef.input];
        const inBV = json.bufferViews[inAcc.bufferView];
        const inBuf = buffers[inBV.buffer];
        const inOff = (inBV.byteOffset || 0) + (inAcc.byteOffset || 0);
        const inCount = inAcc.count;
        const inView = new Float32Array(inBuf, inOff, inCount);
        const times = new Float32Array(inView);   // copy (slice may not align)
        for (let i = 0; i < inCount; i++) if (times[i] > maxTime) maxTime = times[i];

        const outAcc = json.accessors[samplerDef.output];
        const outBV = json.bufferViews[outAcc.bufferView];
        const outBuf = buffers[outBV.buffer];
        const outOff = (outBV.byteOffset || 0) + (outAcc.byteOffset || 0);

        // component count per keyframe:
        //   translation/scale = 3, rotation = 4, weights = N morph targets (skip)
        let comp = 3;
        if (ch.path === 'rotation') comp = 4;
        if (ch.path === 'weights') continue;                 // morph targets not supported
        const totalCount = outAcc.count * comp;
        const output = new Float32Array(outBuf, outOff, totalCount);

        const interpolation = (samplerDef.interpolation || 'LINEAR') as
          'LINEAR' | 'STEP' | 'CUBICSPLINE';

        channels.push({
          nodeIndex: ch.target.node,
          path: ch.target.path as 'translation' | 'rotation' | 'scale',
          sampler: { input: times, output, interpolation },
        });
      }
      out.push({
        name: anim.name || ('anim_' + out.length),
        duration: maxTime,
        channels,
      });
    }
    return out.length > 0 ? out : null;
  }

  /**
   * Separate skeleton-extraction for first-person models. Returns everything
   * skinPlayerMesh needs without polluting the shared `skel*` fields used by
   * the third-person player model.
   */
  private extractGltfSkeleton(json: any, buffers: ArrayBuffer[]) {
    if (!json.skins || json.skins.length === 0) return null;
    const skin = json.skins[0];
    const jointNodes: number[] = skin.joints;
    const numBones = jointNodes.length;
    const nodeToBoneIdx = new Map<number, number>();
    for (let b = 0; b < numBones; b++) nodeToBoneIdx.set(jointNodes[b], b);

    const ibmAcc = json.accessors[skin.inverseBindMatrices];
    const ibmBV = json.bufferViews[ibmAcc.bufferView];
    const ibmBuf = buffers[ibmBV.buffer];
    const ibmOff = (ibmBV.byteOffset || 0) + (ibmAcc.byteOffset || 0);
    const inverseBindMatrices = new Float32Array(ibmBuf, ibmOff, numBones * 16);

    // Build parents + local matrices (same algorithm as loadGLTF)
    const boneLocalTf = new Float32Array(numBones * 16);
    const parents = new Int32Array(numBones);
    parents.fill(-1);
    for (const rootIdx of (json.scenes[json.scene ?? 0]?.nodes || [])) {
      const addParents = (ni: number, pi: number) => {
        (json.nodes[ni] as any).parent = pi;
        for (const c of (json.nodes[ni].children || [])) addParents(c, ni);
      };
      addParents(rootIdx, -1);
    }
    for (let b = 0; b < numBones; b++) {
      const node = json.nodes[jointNodes[b]];
      const pIdx = node.parent ?? -1;
      if (pIdx >= 0 && nodeToBoneIdx.has(pIdx)) parents[b] = nodeToBoneIdx.get(pIdx)!;
      const local = mat4.identity(mat4.create());
      if (node.matrix) { for (let i = 0; i < 16; i++) local[i] = node.matrix[i]; }
      else if (node.rotation || node.translation) {
        const q = node.rotation || [0, 0, 0, 1];
        const t = node.translation || [0, 0, 0];
        const s = node.scale || [1, 1, 1];
        quatPosScaleToMat4([q[0], q[1], q[2], q[3]], [t[0], t[1], t[2]], [s[0], s[1], s[2]], local);
      }
      for (let i = 0; i < 16; i++) boneLocalTf[b * 16 + i] = local[i];
    }
    // skinRootWorld = world transform of the parent of the skeleton root bone
    let skeletonRootNodeIdx = -1;
    for (let b = 0; b < numBones; b++) {
      if (parents[b] < 0) { skeletonRootNodeIdx = jointNodes[b]; break; }
    }
    let skinRootWorld = mat4.identity(mat4.create());
    if (skeletonRootNodeIdx >= 0) {
      const rootParentIdx = json.nodes[skeletonRootNodeIdx].parent ?? -1;
      if (rootParentIdx >= 0) {
        // recompute world transforms
        const nodeWorld = new Map<number, Float32Array>();
        const trav = (ni: number, pw: Float32Array) => {
          const n = json.nodes[ni];
          const local = mat4.identity(mat4.create());
          if (n.matrix) { for (let i = 0; i < 16; i++) local[i] = n.matrix[i]; }
          else if (n.rotation || n.translation) {
            const q = n.rotation || [0, 0, 0, 1], t = n.translation || [0, 0, 0], s = n.scale || [1, 1, 1];
            quatPosScaleToMat4([q[0], q[1], q[2], q[3]], [t[0], t[1], t[2]], [s[0], s[1], s[2]], local);
          }
          const w = mat4.create(); mat4.multiply(w, pw, local);
          nodeWorld.set(ni, w);
          for (const c of (n.children || [])) trav(c, w);
        };
        for (const r of (json.scenes[json.scene ?? 0]?.nodes || [])) trav(r, mat4.identity(mat4.create()));
        const pw = nodeWorld.get(rootParentIdx);
        if (pw) skinRootWorld = new Float32Array(pw);
      }
    }
    const nodeNames: string[] = (json.nodes || []).map((n: any) => n.name || '');
    return {
      boneParents: parents,
      boneLocalMatrices: boneLocalTf,
      inverseBindMatrices,
      skinRootWorld,
      nodeToBoneIdx,
      boneCount: numBones,
      nodeNames,
    };
  }
  async loadGLTF(
    url: string,
    storeSkeleton: boolean = true,
    out?: { animations?: GltfAnimation[] | null; skeleton?: ReturnType<GrandTheftRenderer['extractGltfSkeleton']> }
  ): Promise<CityMesh[] | null> {
    const cached = this.gltfCache.get(url);
    if (cached) return cached;
    const promise = this._loadGLTFImpl(url, storeSkeleton, out);
    this.gltfCache.set(url, promise);
    return promise;
  }
  private async _loadGLTFImpl(
    url: string,
    storeSkeleton: boolean,
    out?: { animations?: GltfAnimation[] | null; skeleton?: ReturnType<GrandTheftRenderer['extractGltfSkeleton']> }
  ): Promise<CityMesh[] | null> {
    try {
      const isGLB = url.endsWith('.glb');
      const raw = await (await fetch(url)).arrayBuffer();

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
              const bufRes = await fetch(base + buf.uri);
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
      const primitiveData: { verts: number[]; indices: number[]; texture: WebGLTexture | null; restPos?: Float32Array; restNrm?: Float32Array; jointIdx?: Uint16Array; jointWgt?: Float32Array; vCount: number; isSkinned?: boolean; meshName?: string }[] = [];

      let globalMinX = Infinity, globalMaxX = -Infinity;
      let globalMinY = Infinity, globalMaxY = -Infinity;
      let globalMinZ = Infinity, globalMaxZ = -Infinity;
      const textureCache = new Map<number, WebGLTexture | null>();

      const entries: { meshIndex: number; transform: Float32Array; nodeIndex: number; nodeName?: string }[] = [];
      if (json.nodes && json.nodes.length > 0 && json.scenes) {
        const identity = mat4.identity(mat4.create());
        const traverse = (nodeIdx: number, parentWorld: Float32Array) => {
          const node = json.nodes[nodeIdx];
          const local = mat4.identity(mat4.create());
          if (node.matrix) { for (let i = 0; i < 16; i++) local[i] = node.matrix[i]; }
          else if (node.rotation || node.translation) {
            const q = node.rotation || [0, 0, 0, 1];
            const t = node.translation || [0, 0, 0];
            const s = node.scale || [1, 1, 1];
            quatPosScaleToMat4([q[0], q[1], q[2], q[3]], [t[0], t[1], t[2]], [s[0], s[1], s[2]], local);
          }
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
      if (entries.length === 0 && json.meshes) {
        const identity = mat4.identity(mat4.create());
        for (let mi = 0; mi < json.meshes.length; mi++) {
          entries.push({ meshIndex: mi, transform: identity, nodeIndex: -1 });
        }
      }

      let isSkinnedModel = false;
      let boneParents: Int32Array | null = null;
      let boneLocalMatrices: Float32Array | null = null;
      let inverseBindMatrices: Float32Array | null = null;
      let nodeToBoneIdx: Map<number, number> | null = null;
      let skeletonRootNodeIdx = -1;
      let skinRootWorld: Float32Array | null = null;
      // FIX: Move rootBoneWorld declaration here so it's in scope for the bounding box calculation later
      let rootBoneWorld: Float32Array | null = null;

      if (json.skins && json.skins.length > 0) {
        const skin = json.skins[0];
        const jointNodes: number[] = skin.joints;
        const numBones = jointNodes.length;
        nodeToBoneIdx = new Map();
        for (let b = 0; b < numBones; b++) nodeToBoneIdx.set(jointNodes[b], b);

        const ibmAcc = json.accessors[skin.inverseBindMatrices];
        const ibmBufView = json.bufferViews[ibmAcc.bufferView];
        const ibmBuf = buffers[ibmBufView.buffer];
        const ibmByteOff = (ibmBufView.byteOffset || 0) + (ibmAcc.byteOffset || 0);
        inverseBindMatrices = new Float32Array(ibmBuf, ibmByteOff, numBones * 16);

        const boneLocalTf = new Float32Array(numBones * 16);
        const parents = new Int32Array(numBones);
        parents.fill(-1);

        const nodeWorldTransforms = new Map<number, Float32Array>();
        const addParents = (nodeIdx: number, parentIdx: number) => {
          json.nodes[nodeIdx].parent = parentIdx;
          for (const child of (json.nodes[nodeIdx].children || [])) addParents(child, nodeIdx);
        };
        for (const rootIdx of (json.scenes[json.scene ?? 0]?.nodes || [])) addParents(rootIdx, -1);

        const traverseNodes = (nodeIdx: number, parentWorld: Float32Array) => {
          const node = json.nodes[nodeIdx];
          const local = mat4.identity(mat4.create());
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

        for (let b = 0; b < numBones; b++) {
          const nodeIdx = jointNodes[b];
          const node = json.nodes[nodeIdx];
          const parentIdx = node.parent ?? -1;
          if (parentIdx >= 0 && nodeToBoneIdx.has(parentIdx)) {
            parents[b] = nodeToBoneIdx.get(parentIdx)!;
          } else {
            if (skeletonRootNodeIdx < 0) skeletonRootNodeIdx = nodeIdx;
          }
          const local = mat4.identity(mat4.create());
          if (node.matrix) { for (let i = 0; i < 16; i++) local[i] = node.matrix[i]; }
          else if (node.rotation || node.translation) {
            const q = node.rotation || [0, 0, 0, 1];
            const t = node.translation || [0, 0, 0];
            const s = node.scale || [1, 1, 1];
            quatPosScaleToMat4([q[0], q[1], q[2], q[3]], [t[0], t[1], t[2]], [s[0], s[1], s[2]], local);
          }
          for (let i = 0; i < 16; i++) boneLocalTf[b * 16 + i] = local[i];
        }

        // FIX: skinRootWorld must be the world transform of the PARENT of the skeleton root bone,
        // not the root bone itself. Otherwise, the root bone's local matrix is applied twice.
        if (skeletonRootNodeIdx >= 0) {
          const rootNode = json.nodes[skeletonRootNodeIdx];
          const rootParentIdx = rootNode.parent ?? -1;
          const parentWorld = rootParentIdx >= 0 ? nodeWorldTransforms.get(rootParentIdx) : undefined;
          skinRootWorld = parentWorld ? new Float32Array(parentWorld) : mat4.identity(mat4.create());
        } else {
          skinRootWorld = mat4.identity(mat4.create());
        }

        // FIX: Compute the root bone's world transform so we can compute the bounding box
        // in the skeleton's world space, not the mesh node's local space.
        let rootBoneIdx = -1;
        for (let b = 0; b < numBones; b++) {
          if (parents[b] < 0) { rootBoneIdx = b; break; }
        }
        if (rootBoneIdx >= 0) {
          rootBoneWorld = mat4.create();
          mat4.multiply(
            rootBoneWorld,
            skinRootWorld!,
            new Float32Array(boneLocalTf.buffer, rootBoneIdx * 16 * 4, 16)
          );
        }

        boneParents = parents;
        boneLocalMatrices = boneLocalTf;
        isSkinnedModel = true;

        if (storeSkeleton) {
          this.skelBoneParents = parents;
          this.skelBoneLocalMatrices = boneLocalTf;
          this.skelInverseBindMatrices = inverseBindMatrices;
          this.skelBoneCount = numBones;
          this.skelNodeToBoneIdx = nodeToBoneIdx;
          this.skelJointMatrices = new Float32Array(numBones * 16);
          this.skelSkinRootWorld = skinRootWorld ? new Float32Array(skinRootWorld) : null;
          this.skelIsReady = false;
        }

        if (storeSkeleton) {
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
      }

      const txPos = (m: Float32Array, x: number, y: number, z: number): [number, number, number] => {
        const w = m[3] * x + m[7] * y + m[11] * z + m[15];
        const invW = w !== 0 ? 1 / w : 1;
        return [
          (m[0] * x + m[4] * y + m[8] * z + m[12]) * invW,
          (m[1] * x + m[5] * y + m[9] * z + m[13]) * invW,
          (m[2] * x + m[6] * y + m[10] * z + m[14]) * invW,
        ];
      };
      const txNrm = (m: Float32Array, x: number, y: number, z: number): [number, number, number] => {
        const nx = m[0] * x + m[4] * y + m[8] * z;
        const ny = m[1] * x + m[5] * y + m[9] * z;
        const nz = m[2] * x + m[6] * y + m[10] * z;
        const len = Math.hypot(nx, ny, nz);
        return len > 0.00001 ? [nx / len, ny / len, nz / len] : [x, y, z];
      };

      for (const entry of entries) {
        const meshDef = json.meshes[entry.meshIndex];
        if (!meshDef) continue;
        const tf = entry.transform;
        const identityTf = tf[0] === 1 && tf[5] === 1 && tf[10] === 1 && tf[15] === 1
          && tf[1] === 0 && tf[2] === 0 && tf[3] === 0 && tf[4] === 0
          && tf[6] === 0 && tf[7] === 0 && tf[8] === 0 && tf[9] === 0
          && tf[11] === 0 && tf[12] === 0 && tf[13] === 0 && tf[14] === 0;

        const entryNode = json.nodes[entry.nodeIndex];
        const isSkinned = isSkinnedModel && entryNode && entryNode.skin !== undefined;

        for (const prim of meshDef.primitives || []) {

          let skipMesh = false;
          if (prim.material !== undefined && json.materials[prim.material]) {
            const mat = json.materials[prim.material];
            const matName = (mat.name || '').toLowerCase();
            if ((mat.alphaMode === 'BLEND' && !mat.pbrMetallicRoughness?.baseColorTexture) || matName.includes('cone') || matName.includes('beam') || matName.includes('volume') || matName.includes('modular') || matName.includes('facad')) {
              skipMesh = true;
            }
          }
          const meshName = (meshDef.name || '').toLowerCase();
          if (meshName.includes('cone') || meshName.includes('beam') || meshName.includes('volume') || meshName.includes('modular') || meshName.includes('facad')) {
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
            // FIX: Support all possible joint component types (UNSIGNED_SHORT, UNSIGNED_BYTE, UNSIGNED_INT)
            if (jiAcc.componentType === 5123) {
              for (let i = 0; i < vCount; i++) {
                const src = new Uint16Array(jiBuf, jiByteOff + i * jiStride, 4);
                jointIdx[i * 4] = src[0]; jointIdx[i * 4 + 1] = src[1];
                jointIdx[i * 4 + 2] = src[2]; jointIdx[i * 4 + 3] = src[3];
              }
            } else if (jiAcc.componentType === 5121) {
              for (let i = 0; i < vCount; i++) {
                const src = new Uint8Array(jiBuf, jiByteOff + i * jiStride, 4);
                jointIdx[i * 4] = src[0]; jointIdx[i * 4 + 1] = src[1];
                jointIdx[i * 4 + 2] = src[2]; jointIdx[i * 4 + 3] = src[3];
              }
            } else if (jiAcc.componentType === 5125) {
              for (let i = 0; i < vCount; i++) {
                const src = new Uint32Array(jiBuf, jiByteOff + i * jiStride, 4);
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

            // AFTER (FIXED):
            // FIX: For skinned meshes, do NOT apply rootBoneWorld to the bounding box.
            // skinPlayerMesh() produces positions in raw restPos space (bind-pose joint
            // matrices are identity), so the center/scale must also be computed from
            // raw restPos. Applying rootBoneWorld here creates a space mismatch that
            // offsets every vertex by -rootBoneWorld_translation * scaleFactor,
            // burying the model underground.
            if (!isSkinned && !identityTf) {
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

          primitiveData.push({ verts, indices, texture, restPos, restNrm, jointIdx, jointWgt, vCount, isSkinned, meshName: meshDef.name || '' });
        }
      }

      if (primitiveData.length === 0) return null;
      const dimX = globalMaxX - globalMinX;
      const dimY = globalMaxY - globalMinY;
      const dimZ = globalMaxZ - globalMinZ;

      let needsRotation = false;
      if (url.includes('citylight') || url.includes('jillValentine') || url.includes('maleNPC') || url.includes('redneck')) {
        if (dimY < dimX || dimY < dimZ) {
          needsRotation = true;
        }
      }
      const needsYFlip = url.includes('crownVic') || url.includes('maleNPC') || url.includes('taxi') || url.includes('hilux');
      const needsY90 = url.includes('pizzaMoped');
      const needsYFlipMoped = url.includes('pizzaMoped');

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
      const centerY = rotMinY;
      const centerZ = (rotMinZ + rotMaxZ) / 2;

      const extraScale: [number, number, number] = url.includes('/bus/') ? [2, 2, 2] : [1, 1, 1];

      if (isSkinnedModel && storeSkeleton) {
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
          if (needsYFlipMoped) {
            x = -x;
            z = -z;
            const nx = verts[i + 3];
            const nz = verts[i + 5];
            verts[i + 3] = -nx;
            verts[i + 5] = -nz;
          }
          if (needsY90) {
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
        mesh.meshName = p.meshName || '';
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
      if (meshes.length > 0) {
        const rawName = url.replace('assets/grandtheft/', '').replace('/scene.gltf', '').replace('.glb', '');
        for (const m of meshes) m.carName = rawName;
      }
      if (out) {
        out.animations = this.extractGltfAnimations(json, buffers);
        out.skeleton = this.extractGltfSkeleton(json, buffers);
      }
      return meshes.length > 0 ? meshes : null;
    } catch (e) {
      console.error('Failed to load glTF', url, e);
      return null;
    }
  }
  clearChunkCache() {
    this.chunkCache.clear();
  }
  /**
 * Returns the real weapon model for an item pickup based on weaponType.
 * 1=Pistol, 2=Rifle, 3=Shotgun, 4=Rocket Launcher.
 * Falls back to the procedural box pickup (getPickupMesh) when no GLTF
 * model is loaded yet (e.g. Shotgun, or models still downloading).
 */
  getWeaponPickupMesh(weaponType: number): CityMesh | CityMesh[] {
    if (weaponType === 1 && this.coltMesh) return this.coltMesh;             // Pistol
    if (weaponType === 2 && this.m4a1Mesh) return this.m4a1Mesh;             // Rifle (M4A1)
    if (weaponType === 3 && this.shotgunMesh) return this.shotgunMesh;       // Shotgun
    if (weaponType === 4 && this.rocketLauncherMesh) return this.rocketLauncherMesh; // Rocket Launcher
    // Log once per missing type so you can see why a pickup is a box
    if (!this._warnedPickups) this._warnedPickups = new Set();
    if (!this._warnedPickups.has(weaponType)) {
      console.warn('[PICKUP] No GLTF model for weaponType', weaponType,
        '— using box fallback. (colt=' + !!this.coltMesh,
        'm4a1=' + !!this.m4a1Mesh,
        'rocketLauncher=' + !!this.rocketLauncherMesh + ')');
      this._warnedPickups.add(weaponType);
    }
    return this.getPickupMesh();                                             // Shotgun / fallback
  }
  private getModelMinY(meshes: CityMesh[]): number {
    let minY = 0;
    for (const m of meshes) {
      if (m.minY !== undefined && m.minY < minY) minY = m.minY;
    }
    return minY;
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