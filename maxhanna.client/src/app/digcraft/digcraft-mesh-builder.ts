import { BlockId, BLOCK_COLORS, CHUNK_SIZE, WORLD_HEIGHT } from './digcraft-types';

// Face directions + vertex corners (matching renderer FACES)
const FACES: { dir: number[]; verts: number[][]; brightness: number }[] = [
  { dir: [0, 1, 0], verts: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], brightness: 1.0 },   // top
  { dir: [0, -1, 0], verts: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]], brightness: 0.5 },   // bottom
  { dir: [0, 0, 1], verts: [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]], brightness: 0.8 },   // south
  { dir: [0, 0, -1], verts: [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0]], brightness: 0.8 },   // north
  { dir: [1, 0, 0], verts: [[1, 0, 1], [1, 1, 1], [1, 1, 0], [1, 0, 0]], brightness: 0.7 },   // east
  { dir: [-1, 0, 0], verts: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]], brightness: 0.7 },   // west
];

export interface NeighborChunkData {
  cx: number;
  cz: number;
  blocks: Uint8Array;
  biomeColumn?: Uint8Array;
  waterLevel?: Uint8Array | null;
  fluidIsSource?: Uint8Array | null;
}

export interface MeshResult {
  key: string;
  vData: Float32Array; // interleaved 3 pos + 3 color + 1 brightness + 1 alpha
  iData: Uint32Array;
}

/**
 * Build a simplified opaque mesh for `chunk` using neighbor chunks for lookups.
 * This is intentionally a conservative, correct builder focused on moving heavy
 * CPU work off the main thread. It produces the same interleaved vertex layout
 * used by the renderer: [x,y,z, r,g,b, brightness, alpha].
 */
export function buildOpaqueChunkMesh(
  cx: number,
  cz: number,
  blocks: Uint8Array,
  biomeColumn: Uint8Array | undefined,
  neighbors: Record<string, NeighborChunkData | undefined>,
  lowEndMode: boolean
): MeshResult {
  const key = `${cx},${cz}`;
  const positions: number[] = [];
  const colors: number[] = [];
  const brightness: number[] = [];
  const alphas: number[] = [];
  const indices: number[] = [];
  let vertCount = 0;

  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;

  // fast in-chunk lookup using 3D index
  const CS = CHUNK_SIZE;
  const WH = WORLD_HEIGHT;
  const idx = (x: number, y: number, z: number) => (y * CS + z) * CS + x;

  const getBlockAtWorld = (wx: number, wy: number, wz: number): number => {
    if (wy < 0 || wy >= WH) return BlockId.AIR;
    const ccx = Math.floor(wx / CS);
    const ccz = Math.floor(wz / CS);
    const localX = wx - ccx * CS;
    const localZ = wz - ccz * CS;
    const nkey = `${ccx},${ccz}`;
    const nd = nkey === key ? { cx, cz, blocks } : neighbors[nkey];
    if (!nd) return BlockId.AIR;
    if (localX < 0 || localX >= CS || localZ < 0 || localZ >= CS) return BlockId.AIR;
    return nd.blocks[idx(localX, wy, localZ)];
  };

  const pushQuad = (p0: [number, number, number], p1: [number, number, number], p2: [number, number, number], p3: [number, number, number], col: { r: number; g: number; b: number }, bright: number, alpha = 1.0) => {
    const base = vertCount;
    for (const p of [p0, p1, p2, p3]) {
      positions.push(p[0], p[1], p[2]);
      colors.push(col.r * bright, col.g * bright, col.b * bright);
      brightness.push(bright);
      alphas.push(alpha);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    vertCount += 4;
  };

  for (let y = 0; y < WH; y++) {
    for (let z = 0; z < CS; z++) {
      for (let x = 0; x < CS; x++) {
        const blockId = blocks[idx(x, y, z)];
        if (blockId === BlockId.AIR) continue;
        if (blockId === BlockId.WATER && !lowEndMode) continue;
        if (blockId === BlockId.LAVA && !lowEndMode) continue;

        const bc = BLOCK_COLORS[blockId] ?? { r: 1, g: 0, b: 1, a: 1 };

        for (let fi = 0; fi < FACES.length; fi++) {
          const face = FACES[fi];
          const nx = x + face.dir[0];
          const ny = y + face.dir[1];
          const nz = z + face.dir[2];
          const neighbor = getBlockAtWorld(ox + nx, ny, oz + nz);
          const isTransparentNeighbor = neighbor === BlockId.AIR || neighbor === BlockId.WATER || neighbor === BlockId.LEAVES || neighbor === BlockId.GLASS || neighbor === BlockId.TALLGRASS || neighbor === BlockId.CHEST || neighbor === BlockId.BONFIRE || neighbor === BlockId.TORCH || neighbor === BlockId.CAULDRON || neighbor === BlockId.CAULDRON_LAVA || neighbor === BlockId.CAULDRON_WATER || (neighbor === BlockId.LAVA && !lowEndMode);
          if (!isTransparentNeighbor) continue;

          // Build world-space verts for this face
          const v0 = face.verts[0]; const v1 = face.verts[1]; const v2 = face.verts[2]; const v3 = face.verts[3];
          const c0: [number, number, number] = [ox + x + v0[0], y + v0[1], oz + z + v0[2]];
          const c1: [number, number, number] = [ox + x + v1[0], y + v1[1], oz + z + v1[2]];
          const c2: [number, number, number] = [ox + x + v2[0], y + v2[1], oz + z + v2[2]];
          const c3: [number, number, number] = [ox + x + v3[0], y + v3[1], oz + z + v3[2]];

          pushQuad(c0, c1, c2, c3, { r: bc.r, g: bc.g, b: bc.b }, face.brightness, 1.0);
        }
      }
    }
  }

  // Convert to interleaved Float32Array
  const stride = 8;
  const vData = new Float32Array(vertCount * stride);
  for (let i = 0; i < vertCount; i++) {
    const o = i * stride;
    vData[o] = positions[i * 3];
    vData[o + 1] = positions[i * 3 + 1];
    vData[o + 2] = positions[i * 3 + 2];
    vData[o + 3] = colors[i * 3];
    vData[o + 4] = colors[i * 3 + 1];
    vData[o + 5] = colors[i * 3 + 2];
    vData[o + 6] = brightness[i];
    vData[o + 7] = alphas[i];
  }

  const iData = new Uint32Array(indices);
  return { key, vData, iData };
}
