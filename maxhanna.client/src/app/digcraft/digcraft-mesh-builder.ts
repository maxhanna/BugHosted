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

export interface FluidMeshResult {
  key: string;
  wVData?: Float32Array;
  wIData?: Uint32Array;
  lVData?: Float32Array;
  lIData?: Uint32Array;
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

/** Build water and lava meshes for a chunk (returns typed arrays or undefined if empty) */
export function buildFluidMeshes(
  cx: number,
  cz: number,
  blocks: Uint8Array,
  waterLevel: Uint8Array | undefined,
  fluidIsSource: Uint8Array | undefined,
  neighbors: Record<string, NeighborChunkData | undefined>,
  lowEndMode: boolean
): FluidMeshResult {
  const key = `${cx},${cz}`;
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
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

  const getFluidLevelAtWorld = (wx: number, wy: number, wz: number): number => {
    if (wy < 0 || wy >= WH) return 0;
    const ccx = Math.floor(wx / CS);
    const ccz = Math.floor(wz / CS);
    const localX = wx - ccx * CS;
    const localZ = wz - ccz * CS;
    const nkey = `${ccx},${ccz}`;
    if (nkey === key) {
      if (!waterLevel) return 8;
      return waterLevel[idx(localX, wy, localZ)];
    }
    const nd = neighbors[nkey];
    if (!nd) return 0;
    if (!nd.waterLevel) return (getBlockAtWorld(wx, wy, wz) === BlockId.WATER || getBlockAtWorld(wx, wy, wz) === BlockId.LAVA) ? 8 : 0;
    return nd.waterLevel[idx(localX, wy, localZ)];
  };

  const isFluidSourceAtWorld = (wx: number, wy: number, wz: number): boolean => {
    if (wy < 0 || wy >= WH) return false;
    const ccx = Math.floor(wx / CS);
    const ccz = Math.floor(wz / CS);
    const localX = wx - ccx * CS;
    const localZ = wz - ccz * CS;
    const nkey = `${ccx},${ccz}`;
    if (nkey === key) {
      if (!fluidIsSource) return getFluidLevelAtWorld(wx, wy, wz) >= 8;
      return fluidIsSource[idx(localX, wy, localZ)] > 0;
    }
    const nd = neighbors[nkey];
    if (!nd) return (getBlockAtWorld(wx, wy, wz) === BlockId.WATER || getBlockAtWorld(wx, wy, wz) === BlockId.LAVA);
    if (!nd.fluidIsSource) return (getBlockAtWorld(wx, wy, wz) === BlockId.WATER || getBlockAtWorld(wx, wy, wz) === BlockId.LAVA);
    return nd.fluidIsSource[idx(localX, wy, localZ)] > 0;
  };

  // Local in-chunk lookup
  const _blocks = blocks;
  const _getBlock = (lx: number, ly: number, lz: number): number => {
    if (lx >= 0 && lx < CS && ly >= 0 && ly < WH && lz >= 0 && lz < CS)
      return _blocks[(ly * CS + lz) * CS + lx];
    return getBlockAtWorld(ox + lx, ly, oz + lz);
  };

  const stride = 8;
  const time = typeof performance !== 'undefined' ? (performance.now() / 1000) : (Date.now() / 1000);

  // Helper to compute fluid surface height
  const fluidSurfaceHeight = (level: number, isSource: boolean, hasFluidAbove: boolean): number => {
    if (hasFluidAbove || isSource) return 1.0;
    const clamped = Math.max(0, Math.min(8, level || 0));
    return 0.16 + (clamped / 8) * 0.84;
  };

  // Water
  const wPos: number[] = [], wCol: number[] = [], wBright: number[] = [], wAlpha: number[] = [], wIdx: number[] = [];
  let wVc = 0;
  const wc = BLOCK_COLORS[BlockId.WATER] ?? { r: 0.2, g: 0.45, b: 0.78, a: 0.55 };

  for (let y = 0; y < WH; y++) {
    for (let z = 0; z < CS; z++) {
      for (let x = 0; x < CS; x++) {
        if (_getBlock(x, y, z) !== BlockId.WATER) continue;
        const level = Math.max(0, Math.min(8, getFluidLevelAtWorld(ox + x, y, oz + z) || 8));
        const isSource = isFluidSourceAtWorld(ox + x, y, oz + z);
        const hasWaterAbove = getBlockAtWorld(ox + x, y + 1, oz + z) === BlockId.WATER;
        const h = fluidSurfaceHeight(level, isSource, hasWaterAbove);
        const westH = fluidSurfaceHeight(getFluidLevelAtWorld(ox + x - 1, y, oz + z), isFluidSourceAtWorld(ox + x - 1, y, oz + z), getBlockAtWorld(ox + x - 1, y + 1, oz + z) === BlockId.WATER);
        const eastH = fluidSurfaceHeight(getFluidLevelAtWorld(ox + x + 1, y, oz + z), isFluidSourceAtWorld(ox + x + 1, y, oz + z), getBlockAtWorld(ox + x + 1, y + 1, oz + z) === BlockId.WATER);
        const northH = fluidSurfaceHeight(getFluidLevelAtWorld(ox + x, y, oz + z - 1), isFluidSourceAtWorld(ox + x, y, oz + z - 1), getBlockAtWorld(ox + x, y + 1, oz + z - 1) === BlockId.WATER);
        const southH = fluidSurfaceHeight(getFluidLevelAtWorld(ox + x, y, oz + z + 1), isFluidSourceAtWorld(ox + x, y, oz + z + 1), getBlockAtWorld(ox + x, y + 1, oz + z + 1) === BlockId.WATER);
        const flowX = (westH - eastH);
        const flowZ = (northH - southH);
        for (let fi = 0; fi < FACES.length; fi++) {
          const face = FACES[fi];
          const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
          const nb = _getBlock(nx, ny, nz);
          if (nb === BlockId.WATER) continue;
          const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393)) >>> 0);
          const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
          const jitter = 0.94 + rnd * 0.1;
          for (let vi = 0; vi < face.verts.length; vi++) {
            const v = face.verts[vi];
            let topH = h;
            if (fi === 0) {
              if (vi === 0) topH = (h + westH + northH) / 3;
              else if (vi === 1) topH = (h + eastH + northH) / 3;
              else if (vi === 2) topH = (h + eastH + southH) / 3;
              else topH = (h + westH + southH) / 3;
              topH += Math.sin(time * 2.0 + (ox + x + v[0]) * 2.2 + (oz + z + v[2]) * 1.8) * 0.01;
            }
            wPos.push(ox + x + v[0], y + (v[1] >= 0.99 ? topH : v[1]), oz + z + v[2]);
            const flowShade = fi === 0 ? 1.0 + ((flowX * (v[0] - 0.5) + flowZ * (v[2] - 0.5)) * 0.08) : 1.0;
            wCol.push(wc.r * jitter * flowShade, wc.g * jitter * flowShade, wc.b * jitter * flowShade);
            wBright.push(face.brightness * (0.92 + rnd * 0.08));
            wAlpha.push(fi === 0 ? 0.52 : 0.42);
          }
          wIdx.push(wVc, wVc + 1, wVc + 2, wVc, wVc + 2, wVc + 3);
          wVc += 4;
        }
      }
    }
  }

  // Lava (similar to water)
  const lPos: number[] = [], lCol: number[] = [], lBright: number[] = [], lAlpha: number[] = [], lIdx: number[] = [];
  let lVc = 0;
  const lc = BLOCK_COLORS[BlockId.LAVA] ?? { r: 1.0, g: 0.45, b: 0.05, a: 0.92 };

  for (let y = 0; y < WH; y++) {
    for (let z = 0; z < CS; z++) {
      for (let x = 0; x < CS; x++) {
        if (_getBlock(x, y, z) !== BlockId.LAVA) continue;
        const level = Math.max(0, Math.min(8, getFluidLevelAtWorld(ox + x, y, oz + z) || 8));
        const isSource = isFluidSourceAtWorld(ox + x, y, oz + z);
        const hasLavaAbove = getBlockAtWorld(ox + x, y + 1, oz + z) === BlockId.LAVA;
        const h = fluidSurfaceHeight(level, isSource, hasLavaAbove);
        const westH = fluidSurfaceHeight(getFluidLevelAtWorld(ox + x - 1, y, oz + z), isFluidSourceAtWorld(ox + x - 1, y, oz + z), getBlockAtWorld(ox + x - 1, y + 1, oz + z) === BlockId.LAVA);
        const eastH = fluidSurfaceHeight(getFluidLevelAtWorld(ox + x + 1, y, oz + z), isFluidSourceAtWorld(ox + x + 1, y, oz + z), getBlockAtWorld(ox + x + 1, y + 1, oz + z) === BlockId.LAVA);
        const northH = fluidSurfaceHeight(getFluidLevelAtWorld(ox + x, y, oz + z - 1), isFluidSourceAtWorld(ox + x, y, oz + z - 1), getBlockAtWorld(ox + x, y + 1, oz + z - 1) === BlockId.LAVA);
        const southH = fluidSurfaceHeight(getFluidLevelAtWorld(ox + x, y, oz + z + 1), isFluidSourceAtWorld(ox + x, y, oz + z + 1), getBlockAtWorld(ox + x, y + 1, oz + z + 1) === BlockId.LAVA);
        const flowX = (westH - eastH);
        const flowZ = (northH - southH);
        for (let fi = 0; fi < FACES.length; fi++) {
          const face = FACES[fi];
          const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
          const nb = _getBlock(nx, ny, nz);
          if (nb === BlockId.LAVA) continue;
          const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393)) >>> 0);
          const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
          const jitter = 0.95 + rnd * 0.1;
          for (let vi = 0; vi < face.verts.length; vi++) {
            const v = face.verts[vi];
            let topH = h;
            if (fi === 0) {
              if (vi === 0) topH = (h + westH + northH) / 3;
              else if (vi === 1) topH = (h + eastH + northH) / 3;
              else if (vi === 2) topH = (h + eastH + southH) / 3;
              else topH = (h + westH + southH) / 3;
              topH += Math.sin(time * 1.5 + (ox + x + v[0]) * 1.7 + (oz + z + v[2]) * 2.1) * 0.008;
            }
            lPos.push(ox + x + v[0], y + (v[1] >= 0.99 ? topH : v[1]), oz + z + v[2]);
            const flowShade = fi === 0 ? 1.0 + ((flowX * (v[0] - 0.5) + flowZ * (v[2] - 0.5)) * 0.08) : 1.0;
            lCol.push(lc.r * jitter * flowShade, lc.g * jitter * flowShade, lc.b * jitter * flowShade);
            lBright.push(face.brightness * (1.0 + rnd * 0.12));
            lAlpha.push(fi === 0 ? 0.78 : 0.62);
          }
          lIdx.push(lVc, lVc + 1, lVc + 2, lVc, lVc + 2, lVc + 3);
          lVc += 4;
        }
      }
    }
  }

  const out: FluidMeshResult = { key };

  if (wVc > 0) {
    const wData = new Float32Array(wVc * stride);
    for (let i = 0; i < wVc; i++) {
      const o = i * stride;
      wData[o] = wPos[i * 3];
      wData[o + 1] = wPos[i * 3 + 1];
      wData[o + 2] = wPos[i * 3 + 2];
      wData[o + 3] = wCol[i * 3];
      wData[o + 4] = wCol[i * 3 + 1];
      wData[o + 5] = wCol[i * 3 + 2];
      wData[o + 6] = wBright[i];
      wData[o + 7] = wAlpha[i];
    }
    out.wVData = wData;
    out.wIData = new Uint32Array(wIdx);
  }

  if (lVc > 0) {
    const lData = new Float32Array(lVc * stride);
    for (let i = 0; i < lVc; i++) {
      const o = i * stride;
      lData[o] = lPos[i * 3];
      lData[o + 1] = lPos[i * 3 + 1];
      lData[o + 2] = lPos[i * 3 + 2];
      lData[o + 3] = lCol[i * 3];
      lData[o + 4] = lCol[i * 3 + 1];
      lData[o + 5] = lCol[i * 3 + 2];
      lData[o + 6] = lBright[i];
      lData[o + 7] = lAlpha[i];
    }
    out.lVData = lData;
    out.lIData = new Uint32Array(lIdx);
  }

  return out;
}
