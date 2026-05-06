import { BlockId, BLOCK_COLORS, CHUNK_SIZE, WORLD_HEIGHT, getBlockHealth } from './digcraft-types';
import { BiomeId } from './digcraft-biome';

const TRANSPARENT_BLOCKS = new Set([
  BlockId.AIR,
  BlockId.LEAVES,
  BlockId.WATER,
  BlockId.SHRUB,
  BlockId.TREE,
  BlockId.TALLGRASS,
  BlockId.CHEST,
  BlockId.BONFIRE,
  BlockId.WINDOW_OPEN, BlockId.DOOR_OPEN,
  BlockId.SEAWEED,
  BlockId.CACTUS,
  BlockId.BAMBOO,
  BlockId.TORCH,
  BlockId.NETHER_STALACTITE, BlockId.NETHER_STALAGMITE,
  BlockId.CAULDRON, BlockId.CAULDRON_LAVA, BlockId.CAULDRON_WATER,
  BlockId.LAVA]);
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
  blockHealth: Uint8Array | undefined,
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

  const pushQuad = (
    p0: [number, number, number], p1: [number, number, number], p2: [number, number, number], p3: [number, number, number],
    col: { r: number; g: number; b: number }, bright: number, alpha = 1.0,
    bx: number = 0, by: number = 0, bz: number = 0, fi: number = 0, blAdd: number = 0, oreMarker: number = 0
  ) => {
    const base = vertCount;
    const verts = [p0, p1, p2, p3];
    for (let vi = 0; vi < verts.length; vi++) {
      const p = verts[vi];
      positions.push(p[0], p[1], p[2]);
      const seed = (((bx * 73856093) ^ (by * 19349663) ^ (bz * 83492791) ^ (fi * 374761393) ^ vi) >>> 0);
      const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
      const jitter = 0.96 + rnd * 0.08;
      colors.push(col.r * jitter, col.g * jitter, col.b * jitter);
      const faceBright = bright * (0.9 + rnd * 0.1);
      const baked = blAdd > 0 ? Math.max(faceBright, blAdd) : (oreMarker > 0 ? oreMarker : faceBright);
      brightness.push(baked);
      alphas.push(alpha);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    vertCount += 4;
  };

  // Helper: push damage/crack overlay for a face (4x4 grid cells, based on block health)
  const tryPushDamageOverlay = (
    c0: [number, number, number], c1: [number, number, number], c2: [number, number, number], c3: [number, number, number],
    face: { dir: number[]; verts: number[][]; brightness: number },
    bx: number, by: number, bz: number, blockId: number
  ) => {
    if (!blockHealth || blockHealth.length === 0) return;
    const blockH = blockHealth[idx(bx, by, bz)];
    const maxH = getBlockHealth(blockId);
    if (blockH > 0 && blockH < maxH && maxH > 1) {
      const damageGridSize = 4;
      const cellSize = 1 / damageGridSize;
      const inset = 0.02;
      const offset = 0.003;
      const damageRatio = (maxH - blockH) / maxH;
      const cellsToDraw = Math.floor(damageRatio * 16);
      const edgeU = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
      const edgeV = [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]];
      const faceNx = face.dir[0];
      const faceNy = face.dir[1];
      const faceNz = face.dir[2];
      let drawnCells = 0;
      for (let gy = 0; gy < damageGridSize && drawnCells < cellsToDraw; gy++) {
        for (let gx = 0; gx < damageGridSize && drawnCells < cellsToDraw; gx++) {
          const u0 = inset + gx * cellSize;
          const v0_ = inset + gy * cellSize;
          const u1 = u0 + cellSize - inset;
          const v1_ = v0_ + cellSize - inset;
          const ox_ = faceNx * offset;
          const oy_ = faceNy * offset;
          const oz_ = faceNz * offset;
          const crackVerts = [
            [c0[0] + edgeU[0] * u0 + edgeV[0] * v0_ + ox_, c0[1] + edgeU[1] * u0 + edgeV[1] * v0_ + oy_, c0[2] + edgeU[2] * u0 + edgeV[2] * v0_ + oz_],
            [c0[0] + edgeU[0] * u1 + edgeV[0] * v0_ + ox_, c0[1] + edgeU[1] * u1 + edgeV[1] * v0_ + oy_, c0[2] + edgeU[2] * u1 + edgeV[2] * v0_ + oz_],
            [c0[0] + edgeU[0] * u1 + edgeV[0] * v1_ + ox_, c0[1] + edgeU[1] * u1 + edgeV[1] * v1_ + oy_, c0[2] + edgeU[2] * u1 + edgeV[2] * v1_ + oz_],
            [c0[0] + edgeU[0] * u0 + edgeV[0] * v1_ + ox_, c0[1] + edgeU[1] * u0 + edgeV[1] * v1_ + oy_, c0[2] + edgeU[2] * u0 + edgeV[2] * v1_ + oz_],
          ];
          for (let cvi = 0; cvi < 4; cvi++) {
            const pv = crackVerts[cvi];
            positions.push(pv[0], pv[1], pv[2]);
            colors.push(0.06, 0.06, 0.06);
            brightness.push(face.brightness * 0.25);
            alphas.push(0.9);
          }
          indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
          vertCount += 4;
          drawnCells++;
        }
      }
    }
  };

  // Helper: determine leaf tint + base blend amount from biome id (copied from renderer for fidelity)
  const getLeafTint = (biome: number): { tint: { r: number; g: number; b: number } | null; blend: number } => {
    switch (biome) {
      case BiomeId.DESERT:
      case BiomeId.BADLANDS:
      case BiomeId.WOODED_BADLANDS:
      case BiomeId.ERODED_BADLANDS:
      case BiomeId.SAVANNA:
      case BiomeId.SAVANNA_PLATEAU:
      case BiomeId.WINDSWEPT_SAVANNA:
        return { tint: { r: 1.0, g: 0.92, b: 0.22 }, blend: 0.82 };
      case BiomeId.JUNGLE:
      case BiomeId.BAMBOO_JUNGLE:
      case BiomeId.SPARSE_JUNGLE:
      case BiomeId.MEADOW:
      case BiomeId.FLOWER_FOREST:
      case BiomeId.CHERRY_GROVE:
      case BiomeId.SWAMP:
      case BiomeId.MANGROVE_SWAMP:
        return { tint: { r: 1.0, g: 0.83, b: 0.34 }, blend: 0.42 };
      case BiomeId.SNOWY_PLAINS:
      case BiomeId.ICE_PLAINS:
      case BiomeId.ICE_SPIKE_PLAINS:
      case BiomeId.SNOWY_BEACH:
      case BiomeId.FROZEN_PEAKS:
      case BiomeId.SNOWY_SLOPES:
      case BiomeId.SNOWY_TAIGA:
      case BiomeId.JAGGED_PEAKS:
        return { tint: { r: 1.0, g: 1.0, b: 1.0 }, blend: 0.72 };
      default:
        return { tint: null, blend: 0 };
    }
  };


  for (let y = 0; y < WH; y++) {
    for (let z = 0; z < CS; z++) {
      for (let x = 0; x < CS; x++) {
        const blockId = blocks[idx(x, y, z)];
        if (blockId === BlockId.AIR) continue;
        if (blockId === BlockId.WATER && !lowEndMode) continue;
        if (blockId === BlockId.LAVA && !lowEndMode) continue;

        const bc = BLOCK_COLORS[blockId] ?? { r: 1, g: 0, b: 1, a: 1 };

        // Emissive blocks light themselves — spreading is done in the shader via uPointLights
        let blAdd = 0;
        if (blockId === BlockId.LAVA || blockId === BlockId.GLOWSTONE) blAdd = 1.9;
        else if ((blockId as number) === 54 /* TORCH */) blAdd = 1.85;
        else if (blockId === BlockId.BONFIRE) blAdd = 1.7;

        // Shiny ores: mark with exactly 1.15 so the vertex shader applies proximity shimmer
        const isShinyOre = blockId === BlockId.GOLD_ORE || blockId === BlockId.DIAMOND_ORE ||
          blockId === BlockId.AMETHYST || blockId === BlockId.COPPER_ORE ||
          blockId === BlockId.QUARTZ_ORE || blockId === BlockId.AMETHYST_BRICK;
        const oreMarker = isShinyOre ? 1.15 : 0;

        // Special-case: CACTUS — render as regular block with vertical lines and pricks
        if (blockId === BlockId.CACTUS) {
          const cactusBase = { r: bc.r, g: bc.g, b: bc.b };

          // Full-size cactus body so sides touch
          const bodyScale = 1.003;

          // Render each visible face as a block with vertical line pattern
          for (let fi = 0; fi < FACES.length; fi++) {
            const face = FACES[fi];

            const v0 = face.verts[0]; const v1 = face.verts[1]; const v2 = face.verts[2]; const v3 = face.verts[3];
            // Apply body scale
            const c0: [number, number, number] = [ox + x + v0[0] * bodyScale + (1 - bodyScale) / 2, y + v0[1], oz + z + v0[2] * bodyScale + (1 - bodyScale) / 2];
            const c1: [number, number, number] = [ox + x + v1[0] * bodyScale + (1 - bodyScale) / 2, y + v1[1], oz + z + v1[2] * bodyScale + (1 - bodyScale) / 2];
            const c2: [number, number, number] = [ox + x + v2[0] * bodyScale + (1 - bodyScale) / 2, y + v2[1], oz + z + v2[2] * bodyScale + (1 - bodyScale) / 2];
            const c3: [number, number, number] = [ox + x + v3[0] * bodyScale + (1 - bodyScale) / 2, y + v3[1], oz + z + v3[2] * bodyScale + (1 - bodyScale) / 2];

            const edgeU = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
            const edgeV = [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]];

            const lineThickness = 0.12;
            const margin = 0.12;

            // Deterministic random based on block position
            const seed0 = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0);
            const rnd0 = (((seed0 * 1103515245 + 12345) >>> 0) % 1000) / 1000;
            const baseShade = 0.85 + rnd0 * 0.15;
            const cr = cactusBase.r * baseShade;
            const cg = cactusBase.g * baseShade;
            const cb = cactusBase.b * baseShade;

            // Top face - no lines, just prickles, use body scale (not full block)
            if (fi === 0) {
              pushQuad(c0, c1, c2, c3, { r: cr * 0.95, g: cg * 0.95, b: cb * 0.95 }, face.brightness);

              // Prickles on top as X shapes (two crossing thin rectangles)
              const seed1 = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393)) >>> 0);
              const rnd1 = (((seed1 * 1103515245 + 12345) >>> 0) % 1000) / 1000;
              const prickleCount = 2 + Math.floor(rnd1 * 2);
              const prickleSizeW = 0.06;
              const prickleSizeH = 0.025;

              for (let pi = 0; pi < prickleCount; pi++) {
                const seed2 = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (pi * 47)) >>> 0);
                const rnd2 = (((seed2 * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                const rnd3 = (((seed2 * 1103515245 + 67890) >>> 0) % 1000) / 1000;
                const rnd4 = (((seed2 * 1103515245 + 11111) >>> 0) % 1000) / 1000;
                const pu = rnd2 * 0.6 + 0.2;
                const pv = rnd3 * 0.6 + 0.2;
                const prickleColor = { r: 0.35 + rnd4 * 0.15, g: 0.35 + rnd4 * 0.15, b: 0.35 + rnd4 * 0.15 };

                // First line of X
                const p1c: [number, number, number] = [c0[0] + edgeU[0] * pu + edgeV[0] * (pv - prickleSizeH / 2), c0[1] + edgeU[1] * pu + edgeV[1] * (pv - prickleSizeH / 2), c0[2] + edgeU[2] * pu + edgeV[2] * (pv - prickleSizeH / 2)];
                const p2c: [number, number, number] = [c0[0] + edgeU[0] * (pu + prickleSizeW) + edgeV[0] * (pv - prickleSizeH / 2), c0[1] + edgeU[1] * (pu + prickleSizeW) + edgeV[1] * (pv - prickleSizeH / 2), c0[2] + edgeU[2] * (pu + prickleSizeW) + edgeV[2] * (pv - prickleSizeH / 2)];
                const p3c: [number, number, number] = [c0[0] + edgeU[0] * (pu + prickleSizeW) + edgeV[0] * (pv + prickleSizeH / 2), c0[1] + edgeU[1] * (pu + prickleSizeW) + edgeV[1] * (pv + prickleSizeH / 2), c0[2] + edgeU[2] * (pu + prickleSizeW) + edgeV[2] * (pv + prickleSizeH / 2)];
                const p4c: [number, number, number] = [c0[0] + edgeU[0] * pu + edgeV[0] * (pv + prickleSizeH / 2), c0[1] + edgeU[1] * pu + edgeV[1] * (pv + prickleSizeH / 2), c0[2] + edgeU[2] * pu + edgeV[2] * (pv + prickleSizeH / 2)];
                pushQuad(p1c, p2c, p3c, p4c, prickleColor, face.brightness * 0.9);

                // Second line of X
                const q1c: [number, number, number] = [c0[0] + edgeU[0] * pu + edgeV[0] * (pv - prickleSizeH / 2), c0[1] + edgeU[1] * pu + edgeV[1] * (pv - prickleSizeH / 2), c0[2] + edgeU[2] * pu + edgeV[2] * (pv - prickleSizeH / 2)];
                const q2c: [number, number, number] = [c0[0] + edgeU[0] * (pu + prickleSizeW) + edgeV[0] * (pv - prickleSizeH / 2), c0[1] + edgeU[1] * (pu + prickleSizeW) + edgeV[1] * (pv - prickleSizeH / 2), c0[2] + edgeU[2] * (pu + prickleSizeW) + edgeV[2] * (pv - prickleSizeH / 2)];
                const q3c: [number, number, number] = [c0[0] + edgeU[0] * (pu + prickleSizeW) + edgeV[0] * (pv + prickleSizeH / 2), c0[1] + edgeU[1] * (pu + prickleSizeW) + edgeV[1] * (pv + prickleSizeH / 2), c0[2] + edgeU[2] * (pu + prickleSizeW) + edgeV[2] * (pv + prickleSizeH / 2)];
                const q4c: [number, number, number] = [c0[0] + edgeU[0] * pu + edgeV[0] * (pv + prickleSizeH / 2), c0[1] + edgeU[1] * pu + edgeV[1] * (pv + prickleSizeH / 2), c0[2] + edgeU[2] * pu + edgeV[2] * (pv + prickleSizeH / 2)];
                pushQuad(q4c, q3c, q2c, q1c, prickleColor, face.brightness * 0.9);
              }
              continue;
            }

            // Side faces have vertical lines - offset outward from face
            // Use v ranges (horizontal bands) for vertical lines that run bottom-to-top
            const lineOffset = 0.015;
            const lineRects = [
              { v0: 0, v1: margin - lineThickness / 2 },
              { v0: margin - lineThickness / 2, v1: margin + lineThickness / 2 },
              { v0: margin + lineThickness / 2, v1: 0.5 - lineThickness / 2 },
              { v0: 0.5 - lineThickness / 2, v1: 0.5 + lineThickness / 2 },
              { v0: 0.5 + lineThickness / 2, v1: 1.0 - margin - lineThickness / 2 },
              { v0: 1.0 - margin - lineThickness / 2, v1: 1.0 - margin + lineThickness / 2 },
              { v0: 1.0 - margin + lineThickness / 2, v1: 1 },
            ];

            for (let ri = 0; ri < lineRects.length; ri++) {
              const r = lineRects[ri];
              const isLine = (ri === 1 || ri === 3 || ri === 5);
              const shade = isLine ? 0.45 : (0.88 + (((x * 73856093 ^ y * 19349663 ^ z * 83492791 ^ fi * 374761393 ^ ri * 47) >>> 0) % 100) / 500);

              const p00: [number, number, number] = [c0[0] + edgeU[0] * 0 + edgeV[0] * r.v0 + face.dir[0] * lineOffset, c0[1] + edgeU[1] * 0 + edgeV[1] * r.v0 + face.dir[1] * lineOffset, c0[2] + edgeU[2] * 0 + edgeV[2] * r.v0 + face.dir[2] * lineOffset];
              const p10: [number, number, number] = [c0[0] + edgeU[0] * 1 + edgeV[0] * r.v0 + face.dir[0] * lineOffset, c0[1] + edgeU[1] * 1 + edgeV[1] * r.v0 + face.dir[1] * lineOffset, c0[2] + edgeU[2] * 1 + edgeV[2] * r.v0 + face.dir[2] * lineOffset];
              const p11: [number, number, number] = [c0[0] + edgeU[0] * 1 + edgeV[0] * r.v1 + face.dir[0] * lineOffset, c0[1] + edgeU[1] * 1 + edgeV[1] * r.v1 + face.dir[1] * lineOffset, c0[2] + edgeU[2] * 1 + edgeV[2] * r.v1 + face.dir[2] * lineOffset];
              const p01: [number, number, number] = [c0[0] + edgeU[0] * 0 + edgeV[0] * r.v1 + face.dir[0] * lineOffset, c0[1] + edgeU[1] * 0 + edgeV[1] * r.v1 + face.dir[1] * lineOffset, c0[2] + edgeU[2] * 0 + edgeV[2] * r.v1 + face.dir[2] * lineOffset];

              pushQuad(p00, p10, p11, p01, { r: cr * shade, g: cg * shade, b: cb * shade }, face.brightness * (isLine ? 0.7 : 1.0));
            }

            // Side prickles as small boxes protruding from face
            const prickleOffset = 0.025;
            const seed3 = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ 500) >>> 0);
            const rnd5 = (((seed3 * 1103515245 + 12345) >>> 0) % 1000) / 1000;
            const prickleCount = 4 + Math.floor(rnd5 * 3);
            const prickleSizeBase = 0.03;
            const prickleProtrude = 0.04;

            for (let pi = 0; pi < prickleCount; pi++) {
              const seed4 = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (pi * 59)) >>> 0);
              const rnd6 = (((seed4 * 1103515245 + 12345) >>> 0) % 1000) / 1000;
              const rnd7 = (((seed4 * 1103515245 + 67890) >>> 0) % 1000) / 1000;
              const rnd8 = (((seed4 * 1103515245 + 11111) >>> 0) % 1000) / 1000;
              const pu = rnd6 * 0.6 + 0.2;
              const pv = rnd7 * 0.6 + 0.2;
              const prickleColor = { r: 0.35 + rnd8 * 0.15, g: 0.35 + rnd8 * 0.15, b: 0.35 + rnd8 * 0.15 };

              // Base square on face
              const p1c: [number, number, number] = [c0[0] + edgeU[0] * pu + edgeV[0] * pv + face.dir[0] * prickleOffset, c0[1] + edgeU[1] * pu + edgeV[1] * pv + face.dir[1] * prickleOffset, c0[2] + edgeU[2] * pu + edgeV[2] * pv + face.dir[2] * prickleOffset];
              const p2c: [number, number, number] = [c0[0] + edgeU[0] * (pu + prickleSizeBase) + edgeV[0] * pv + face.dir[0] * prickleOffset, c0[1] + edgeU[1] * (pu + prickleSizeBase) + edgeV[1] * pv + face.dir[1] * prickleOffset, c0[2] + edgeU[2] * (pu + prickleSizeBase) + edgeV[2] * pv + face.dir[2] * prickleOffset];
              const p3c: [number, number, number] = [c0[0] + edgeU[0] * (pu + prickleSizeBase) + edgeV[0] * (pv + prickleSizeBase) + face.dir[0] * prickleOffset, c0[1] + edgeU[1] * (pu + prickleSizeBase) + edgeV[1] * (pv + prickleSizeBase) + face.dir[1] * prickleOffset, c0[2] + edgeU[2] * (pu + prickleSizeBase) + edgeV[2] * (pv + prickleSizeBase) + face.dir[2] * prickleOffset];
              const p4c: [number, number, number] = [c0[0] + edgeU[0] * pu + edgeV[0] * (pv + prickleSizeBase) + face.dir[0] * prickleOffset, c0[1] + edgeU[1] * pu + edgeV[1] * (pv + prickleSizeBase) + face.dir[1] * prickleOffset, c0[2] + edgeU[2] * pu + edgeV[2] * (pv + prickleSizeBase) + face.dir[2] * prickleOffset];
              // Tip square (far from face)
              const tipOffset = prickleOffset + prickleProtrude;
              const t1c: [number, number, number] = [c0[0] + edgeU[0] * pu + edgeV[0] * pv + face.dir[0] * tipOffset, c0[1] + edgeU[1] * pu + edgeV[1] * pv + face.dir[1] * tipOffset, c0[2] + edgeU[2] * pu + edgeV[2] * pv + face.dir[2] * tipOffset];
              const t2c: [number, number, number] = [c0[0] + edgeU[0] * (pu + prickleSizeBase) + edgeV[0] * pv + face.dir[0] * tipOffset, c0[1] + edgeU[1] * (pu + prickleSizeBase) + edgeV[1] * pv + face.dir[1] * tipOffset, c0[2] + edgeU[2] * (pu + prickleSizeBase) + edgeV[2] * pv + face.dir[2] * tipOffset];
              const t3c: [number, number, number] = [c0[0] + edgeU[0] * (pu + prickleSizeBase) + edgeV[0] * (pv + prickleSizeBase) + face.dir[0] * tipOffset, c0[1] + edgeU[1] * (pu + prickleSizeBase) + edgeV[1] * (pv + prickleSizeBase) + face.dir[1] * tipOffset, c0[2] + edgeU[2] * (pu + prickleSizeBase) + edgeV[2] * (pv + prickleSizeBase) + face.dir[2] * tipOffset];
              const t4c: [number, number, number] = [c0[0] + edgeU[0] * pu + edgeV[0] * (pv + prickleSizeBase) + face.dir[0] * tipOffset, c0[1] + edgeU[1] * pu + edgeV[1] * (pv + prickleSizeBase) + face.dir[1] * tipOffset, c0[2] + edgeU[2] * pu + edgeV[2] * (pv + prickleSizeBase) + face.dir[2] * tipOffset];
              // Front face of prickle
              pushQuad(p1c, p2c, p3c, p4c, prickleColor, face.brightness * 0.9);
              // Back face of prickle
              pushQuad(t3c, t2c, t1c, t4c, prickleColor, face.brightness * 0.9);
            }

            // Big prickles that stick out further
            const bigPrickleOffset = 0.05;
            const bigSeed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ 999) >>> 0);
            const bigRnd = (((bigSeed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
            const bigPrickleCount = 1 + Math.floor(bigRnd * 2);
            const bigPrickleSizeBase = 0.03;
            const bigPrickleProtrude = 0.07;

            for (let pi = 0; pi < bigPrickleCount; pi++) {
              const bigSeed2 = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (pi * 73)) >>> 0);
              const bigRnd2 = (((bigSeed2 * 1103515245 + 12345) >>> 0) % 1000) / 1000;
              const bigRnd3 = (((bigSeed2 * 1103515245 + 67890) >>> 0) % 1000) / 1000;
              const bigRnd4 = (((bigSeed2 * 1103515245 + 11111) >>> 0) % 1000) / 1000;
              const bigPu = bigRnd2 * 0.5 + 0.25;
              const bigPv = bigRnd3 * 0.5 + 0.25;
              const bigPrickleColor = { r: 0.30 + bigRnd4 * 0.12, g: 0.30 + bigRnd4 * 0.12, b: 0.30 + bigRnd4 * 0.12 };

              // Base square on face
              const bp1c: [number, number, number] = [c0[0] + edgeU[0] * bigPu + edgeV[0] * bigPv + face.dir[0] * bigPrickleOffset, c0[1] + edgeU[1] * bigPu + edgeV[1] * bigPv + face.dir[1] * bigPrickleOffset, c0[2] + edgeU[2] * bigPu + edgeV[2] * bigPv + face.dir[2] * bigPrickleOffset];
              const bp2c: [number, number, number] = [c0[0] + edgeU[0] * (bigPu + bigPrickleSizeBase) + edgeV[0] * bigPv + face.dir[0] * bigPrickleOffset, c0[1] + edgeU[1] * (bigPu + bigPrickleSizeBase) + edgeV[1] * bigPv + face.dir[1] * bigPrickleOffset, c0[2] + edgeU[2] * (bigPu + bigPrickleSizeBase) + edgeV[2] * bigPv + face.dir[2] * bigPrickleOffset];
              const bp3c: [number, number, number] = [c0[0] + edgeU[0] * (bigPu + bigPrickleSizeBase) + edgeV[0] * (bigPv + bigPrickleSizeBase) + face.dir[0] * bigPrickleOffset, c0[1] + edgeU[1] * (bigPu + bigPrickleSizeBase) + edgeV[1] * (bigPv + bigPrickleSizeBase) + face.dir[1] * bigPrickleOffset, c0[2] + edgeU[2] * (bigPu + bigPrickleSizeBase) + edgeV[2] * (bigPv + bigPrickleSizeBase) + face.dir[2] * bigPrickleOffset];
              const bp4c: [number, number, number] = [c0[0] + edgeU[0] * bigPu + edgeV[0] * (bigPv + bigPrickleSizeBase) + face.dir[0] * bigPrickleOffset, c0[1] + edgeU[1] * bigPu + edgeV[1] * (bigPv + bigPrickleSizeBase) + face.dir[1] * bigPrickleOffset, c0[2] + edgeU[2] * bigPu + edgeV[2] * (bigPv + bigPrickleSizeBase) + face.dir[2] * bigPrickleOffset];
              // Tip square (far from face)
              const bTipOffset = bigPrickleOffset + bigPrickleProtrude;
              const bt1c: [number, number, number] = [c0[0] + edgeU[0] * bigPu + edgeV[0] * bigPv + face.dir[0] * bTipOffset, c0[1] + edgeU[1] * bigPu + edgeV[1] * bigPv + face.dir[1] * bTipOffset, c0[2] + edgeU[2] * bigPu + edgeV[2] * bigPv + face.dir[2] * bTipOffset];
              const bt2c: [number, number, number] = [c0[0] + edgeU[0] * (bigPu + bigPrickleSizeBase) + edgeV[0] * bigPv + face.dir[0] * bTipOffset, c0[1] + edgeU[1] * (bigPu + bigPrickleSizeBase) + edgeV[1] * bigPv + face.dir[1] * bTipOffset, c0[2] + edgeU[2] * (bigPu + bigPrickleSizeBase) + edgeV[2] * bigPv + face.dir[2] * bTipOffset];
              const bt3c: [number, number, number] = [c0[0] + edgeU[0] * (bigPu + bigPrickleSizeBase) + edgeV[0] * (bigPv + bigPrickleSizeBase) + face.dir[0] * bTipOffset, c0[1] + edgeU[1] * (bigPu + bigPrickleSizeBase) + edgeV[1] * (bigPv + bigPrickleSizeBase) + face.dir[1] * bTipOffset, c0[2] + edgeU[2] * (bigPu + bigPrickleSizeBase) + edgeV[2] * (bigPv + bigPrickleSizeBase) + face.dir[2] * bTipOffset];
              const bt4c: [number, number, number] = [c0[0] + edgeU[0] * bigPu + edgeV[0] * (bigPv + bigPrickleSizeBase) + face.dir[0] * bTipOffset, c0[1] + edgeU[1] * bigPu + edgeV[1] * (bigPv + bigPrickleSizeBase) + face.dir[1] * bTipOffset, c0[2] + edgeU[2] * bigPu + edgeV[2] * (bigPv + bigPrickleSizeBase) + face.dir[2] * bTipOffset];
              // Front face of prickle
              pushQuad(bp1c, bp2c, bp3c, bp4c, bigPrickleColor, face.brightness * 0.85);
              // Back face of prickle
              pushQuad(bt3c, bt2c, bt1c, bt4c, bigPrickleColor, face.brightness * 0.85);
            }
          }
          continue;
        }

        // Special-case: BAMBOO — render as a tube (like torch but taller, no flame)
        if (blockId === BlockId.BAMBOO) {
          const checkNeighborTransparent = (dx: number, dy: number, dz: number) => {
            const n = getBlockAtWorld(ox + x + dx, y + dy, oz + z + dz);
            return TRANSPARENT_BLOCKS.has(n);
          };
          let visible = false;
          for (const f of FACES) {
            if (checkNeighborTransparent(f.dir[0], f.dir[1], f.dir[2])) { visible = true; break; }
          }
          if (!visible) continue;

          // Bamboo color with biome tint
          const biome = (biomeColumn && biomeColumn.length === CS * CS) ? biomeColumn[z * CS + x] : BiomeId.UNKNOWN;
          const lt = getLeafTint(biome);
          const baseColor = bc;
          const blend = lt.blend || 0;
          const tint = lt.tint;
          const mix = (c: number, t: number | null) => t ? (c * (1 - blend) + t * blend) : c;
          const cr = tint ? mix(baseColor.r, tint.r) : baseColor.r;
          const cg = tint ? mix(baseColor.g, tint.g) : baseColor.g;
          const cb = tint ? mix(baseColor.b, tint.b) : baseColor.b;

          // Bamboo tube dimensions with segmented nodes
          const bx = ox + x + 0.5, bz = oz + z + 0.5, by = y;
          const bambooW = 0.10;
          const bambooH = 1.0;
          const segmentHeight = 0.25;
          const nodeWidth = bambooW * 1.4; // wider at node
          const midWidth = bambooW * 0.85; // narrower between nodes
          const halfNodeW = nodeWidth / 2;
          const halfMidW = midWidth / 2;

          // Build bamboo in segments - wider at node, narrower between
          for (let seg = 0; seg < 4; seg++) {
            const segBottom = seg * segmentHeight;
            const segTop = (seg + 1) * segmentHeight;
            const nodeY = by + segTop;

            // This segment has a node at the top (wider) and narrower middle
            // Lower section (narrower)
            const lowerH = segmentHeight * 0.7;
            const upperH = segmentHeight * 0.3;

            // South face (+Z) - lower narrower part
            pushQuad(
              [bx - halfMidW, by + segBottom, bz + halfNodeW], [bx + halfMidW, by + segBottom, bz + halfNodeW],
              [bx + halfMidW, by + segBottom + lowerH, bz + halfNodeW], [bx - halfMidW, by + segBottom + lowerH, bz + halfNodeW],
              { r: cr, g: cg, b: cb }, 0.8, 1.0, x, y, z, 0, blAdd, oreMarker
            );
            // Upper part (widens to node)
            pushQuad(
              [bx - halfMidW, by + segBottom + lowerH, bz + halfNodeW], [bx + halfMidW, by + segBottom + lowerH, bz + halfNodeW],
              [bx + halfNodeW, nodeY, bz + halfNodeW], [bx - halfNodeW, nodeY, bz + halfNodeW],
              { r: cr, g: cg, b: cb }, 0.85, 1.0, x, y, z, 0, blAdd, oreMarker
            );

            // North face (-Z)
            pushQuad(
              [bx + halfMidW, by + segBottom, bz - halfNodeW], [bx - halfMidW, by + segBottom, bz - halfNodeW],
              [bx - halfMidW, by + segBottom + lowerH, bz - halfNodeW], [bx + halfMidW, by + segBottom + lowerH, bz - halfNodeW],
              { r: cr * 0.9, g: cg * 0.9, b: cb * 0.9 }, 0.8, 1.0, x, y, z, 1, blAdd, oreMarker
            );
            pushQuad(
              [bx + halfMidW, by + segBottom + lowerH, bz - halfNodeW], [bx - halfMidW, by + segBottom + lowerH, bz - halfNodeW],
              [bx - halfNodeW, nodeY, bz - halfNodeW], [bx + halfNodeW, nodeY, bz - halfNodeW],
              { r: cr * 0.9, g: cg * 0.9, b: cb * 0.9 }, 0.85, 1.0, x, y, z, 1, blAdd, oreMarker
            );

            // East face (+X)
            pushQuad(
              [bx + halfNodeW, by + segBottom, bz + halfMidW], [bx + halfNodeW, by + segBottom, bz - halfMidW],
              [bx + halfNodeW, by + segBottom + lowerH, bz - halfMidW], [bx + halfNodeW, by + segBottom + lowerH, bz + halfMidW],
              { r: cr * 0.95, g: cg * 0.95, b: cb * 0.95 }, 0.7, 1.0, x, y, z, 2, blAdd, oreMarker
            );
            pushQuad(
              [bx + halfNodeW, by + segBottom + lowerH, bz + halfMidW], [bx + halfNodeW, by + segBottom + lowerH, bz - halfMidW],
              [bx + halfNodeW, nodeY, bz - halfNodeW], [bx + halfNodeW, nodeY, bz + halfNodeW],
              { r: cr * 0.95, g: cg * 0.95, b: cb * 0.95 }, 0.75, 1.0, x, y, z, 2, blAdd, oreMarker
            );

            // West face (-X)
            pushQuad(
              [bx - halfNodeW, by + segBottom, bz - halfMidW], [bx - halfNodeW, by + segBottom, bz + halfMidW],
              [bx - halfNodeW, by + segBottom + lowerH, bz + halfMidW], [bx - halfNodeW, by + segBottom + lowerH, bz - halfMidW],
              { r: cr * 0.95, g: cg * 0.95, b: cb * 0.95 }, 0.7, 1.0, x, y, z, 3, blAdd, oreMarker
            );
            pushQuad(
              [bx - halfNodeW, by + segBottom + lowerH, bz - halfMidW], [bx - halfNodeW, by + segBottom + lowerH, bz + halfMidW],
              [bx - halfNodeW, nodeY, bz + halfNodeW], [bx - halfNodeW, nodeY, bz - halfNodeW],
              { r: cr * 0.95, g: cg * 0.95, b: cb * 0.95 }, 0.75, 1.0, x, y, z, 3, blAdd, oreMarker
            );
          }

          continue;
        }

        // Special-case: TORCH — a small stick with a flame on top
        if (blockId === BlockId.TORCH) {
          const ttime = (typeof performance !== 'undefined') ? (performance.now() / 1000) : (Date.now() / 1000);
          const tx = ox + x + 0.5, tz = oz + z + 0.5, ty = y;
          const stickW = 0.06;
          const stickH = 0.6;
          const stickC = { r: 0.35, g: 0.22, b: 0.10 };

          // Determine support: prefer floor; otherwise check cardinal walls
          const isTransparentForSupport = (n: number) => {
            return TRANSPARENT_BLOCKS.has(n);
          };

          const below = getBlockAtWorld(ox + x, y - 1, oz + z);
          let sx = 0, sz = 0; // support direction
          if (!isTransparentForSupport(below)) {
            // floor support — vertical torch
            sx = 0; sz = 0;
          } else {
            // check west, east, north, south for wall support
            const west = getBlockAtWorld(ox + x - 1, y, oz + z);
            const east = getBlockAtWorld(ox + x + 1, y, oz + z);
            const north = getBlockAtWorld(ox + x, y, oz + z - 1);
            const south = getBlockAtWorld(ox + x, y, oz + z + 1);
            if (!isTransparentForSupport(west)) { sx = -1; sz = 0; }
            else if (!isTransparentForSupport(east)) { sx = 1; sz = 0; }
            else if (!isTransparentForSupport(north)) { sx = 0; sz = -1; }
            else if (!isTransparentForSupport(south)) { sx = 0; sz = 1; }
            else { sx = 0; sz = 0; }
          }

          // Build stick as rectangular prism along vector from base->top (handles vertical and leaning)
          const baseOffset = (sx === 0 && sz === 0) ? 0.0 : 0.32; // if wall-mounted, move base toward wall
          const baseY = ty + 0.02;
          const Bx = tx + sx * baseOffset;
          const By = baseY;
          const Bz = tz + sz * baseOffset;
          const Tx = tx - sx * 0.08; // top slightly toward center
          const Ty = ty + stickH;
          const Tz = tz - sz * 0.08;

          // direction vector
          const vx = Tx - Bx, vy = Ty - By, vz = Tz - Bz;
          const vlen = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1.0;
          const vnx = vx / vlen, vny = vy / vlen, vnz = vz / vlen;

          // perpendicular vectors
          const upx = 0, upy = 1, upz = 0;
          let px = vny * upz - vnz * upy;
          let py = vnz * upx - vnx * upz;
          let pz = vnx * upy - vny * upx;
          let plen = Math.sqrt(px * px + py * py + pz * pz);
          if (plen < 1e-6) { px = 1; py = 0; pz = 0; plen = 1; }
          px /= plen; py /= plen; pz /= plen;
          // second perp
          let qx = vny * pz - vnz * py;
          let qy = vnz * px - vnx * pz;
          let qz = vnx * py - vny * px;
          let qlen = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1.0;
          qx /= qlen; qy /= qlen; qz /= qlen;

          // base/top corners (4 around cross-section)
          const bw = stickW, qw = stickW;
          const B0 = [Bx + px * bw + qx * qw, By + py * bw + qy * qw, Bz + pz * bw + qz * qw];
          const B1 = [Bx - px * bw + qx * qw, By - py * bw + qy * qw, Bz - pz * bw + qz * qw];
          const B2 = [Bx - px * bw - qx * qw, By - py * bw - qy * qw, Bz - pz * bw - qz * qw];
          const B3 = [Bx + px * bw - qx * qw, By + py * bw - qy * qw, Bz + pz * bw - qz * qw];

          const T0 = [Tx + px * bw + qx * qw, Ty + py * bw + qy * qw, Tz + pz * bw + qz * qw];
          const T1 = [Tx - px * bw + qx * qw, Ty - py * bw + qy * qw, Tz - pz * bw + qz * qw];
          const T2 = [Tx - px * bw - qx * qw, Ty - py * bw - qy * qw, Tz - pz * bw - qz * qw];
          const T3 = [Tx + px * bw - qx * qw, Ty + py * bw - qy * qw, Tz + pz * bw - qz * qw];

          // Push 4 side quads
          pushQuad(B0 as any, B1 as any, T1 as any, T0 as any, stickC, 0.5, 1.0, x, y, z, 0, blAdd, oreMarker);
          pushQuad(B1 as any, B2 as any, T2 as any, T1 as any, { r: stickC.r * 0.9, g: stickC.g * 0.9, b: stickC.b * 0.9 }, 0.5, 1.0, x, y, z, 1, blAdd, oreMarker);
          pushQuad(B2 as any, B3 as any, T3 as any, T2 as any, { r: stickC.r * 0.85, g: stickC.g * 0.85, b: stickC.b * 0.85 }, 0.5, 1.0, x, y, z, 2, blAdd, oreMarker);
          pushQuad(B3 as any, B0 as any, T0 as any, T3 as any, { r: stickC.r * 0.9, g: stickC.g * 0.9, b: stickC.b * 0.9 }, 0.5, 1.0, x, y, z, 3, blAdd, oreMarker);

          // Flame positioned at top point - multiple planes for volume
          const flicker = 0.7 + Math.sin(ttime * 8.0 + x * 1.3 + z * 0.9) * 0.3;
          const fh = 0.22 * flicker;
          const fw = 0.10;
          const fbase = Ty;
          const ftop = fbase + fh;
          const fx = Tx, fz = Tz;
          const leanX = Math.sin(ttime * 3.0) * 0.03;
          const leanZ = Math.cos(ttime * 2.5) * 0.03;
          const flameAlpha = lowEndMode ? 1.0 : 0.75;

          // Base flame planes
          pushQuad([fx - fw, fbase, fz], [fx + fw, fbase, fz], [fx + fw * 0.3 + leanX, ftop, fz + leanZ], [fx - fw * 0.3 + leanX, ftop, fz + leanZ], { r: 1.0, g: 0.6, b: 0.05 }, 1.8, flameAlpha, x, y, z, 4, blAdd, oreMarker);
          pushQuad([fx, fbase, fz - fw], [fx, fbase, fz + fw], [fx + leanX, ftop, fz + fw * 0.3 + leanZ], [fx + leanX, ftop, fz - fw * 0.3 + leanZ], { r: 1.0, g: 0.75, b: 0.1 }, 1.8, flameAlpha, x, y, z, 5, blAdd, oreMarker);
          // Extra diagonal planes for more flame volume
          const dFlicker1 = Math.sin(ttime * 7.0 + x * 0.7 + z * 1.1) * 0.02;
          const dFlicker2 = Math.sin(ttime * 9.0 + x * 1.5 + z * 0.8) * 0.018;
          pushQuad([fx - fw * 0.5, fbase + dFlicker1, fz - fw * 0.5], [fx + fw * 0.5, fbase + dFlicker1, fz + fw * 0.5], [fx + fw * 0.2 + leanX, ftop + dFlicker1, fz + fw * 0.2 + leanZ], [fx - fw * 0.2 + leanX, ftop + dFlicker1, fz - fw * 0.2 + leanZ], { r: 1.0, g: 0.55, b: 0.08 }, 1.6, flameAlpha, x, y, z, 6, blAdd, oreMarker);
          pushQuad([fx + fw * 0.3, fbase + dFlicker1, fz], [fx - fw * 0.3, fbase + dFlicker1, fz], [fx - fw * 0.1 + leanX, ftop + dFlicker1, fz + leanZ], [fx + fw * 0.1 + leanX, ftop + dFlicker1, fz + leanZ], { r: 1.0, g: 0.65, b: 0.12 }, 1.5, flameAlpha, x, y, z, 7, blAdd, oreMarker);
          pushQuad([fx - fw * 0.4, fbase + dFlicker2, fz + fw * 0.3], [fx + fw * 0.4, fbase + dFlicker2, fz - fw * 0.3], [fx + fw * 0.15 + leanX, ftop + dFlicker2, fz - fw * 0.15 + leanZ], [fx - fw * 0.15 + leanX, ftop + dFlicker2, fz + fw * 0.15 + leanZ], { r: 1.0, g: 0.58, b: 0.06 }, 1.7, flameAlpha, x, y, z, 8, blAdd, oreMarker);
          pushQuad([fx + fw * 0.25, fbase + dFlicker2, fz + fw * 0.4], [fx - fw * 0.25, fbase + dFlicker2, fz - fw * 0.4], [fx - fw * 0.1 + leanX, ftop + dFlicker2, fz - fw * 0.1 + leanZ], [fx + fw * 0.1 + leanX, ftop + dFlicker2, fz + fw * 0.1 + leanZ], { r: 1.0, g: 0.62, b: 0.09 }, 1.65, flameAlpha, x, y, z, 9, blAdd, oreMarker);
          continue;
        }

        // Special-case: BONFIRE renders as a proper campfire — crossed logs + stone ring + animated flames
        if (blockId === BlockId.BONFIRE) {
          const time = (typeof performance !== 'undefined') ? (performance.now() / 1000) : (Date.now() / 1000);
          const bx0 = ox + x; // block world origin X
          const bz0 = oz + z; // block world origin Z
          const by0 = y;      // block world origin Y
          const flameAlpha = lowEndMode ? 1.0 : 0.75;

          // Stone ring (8 small flat stones around the base)
          const stoneR = 0.42, stoneH = 0.22;
          const stoneC = { r: 0.42, g: 0.42, b: 0.40 };
          const stoneAngles = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI, 5 * Math.PI / 4, 3 * Math.PI / 2, 7 * Math.PI / 4];
          for (const ang of stoneAngles) {
            const sx = bx0 + 0.5 + Math.cos(ang) * stoneR;
            const sz = bz0 + 0.5 + Math.sin(ang) * stoneR;
            const sw = 0.14, sd = 0.12; // narrower but taller stones
            // Top face of stone
            pushQuad(
              [sx - sw, by0 + stoneH, sz - sd],
              [sx + sw, by0 + stoneH, sz - sd],
              [sx + sw, by0 + stoneH, sz + sd],
              [sx - sw, by0 + stoneH, sz + sd],
              stoneC, 0.9, 1.0, x, y, z, 0, blAdd, oreMarker
            );
            // Front face of stone
            pushQuad(
              [sx - sw, by0, sz - sd],
              [sx + sw, by0, sz - sd],
              [sx + sw, by0 + stoneH, sz - sd],
              [sx - sw, by0 + stoneH, sz - sd],
              { r: stoneC.r * 0.7, g: stoneC.g * 0.7, b: stoneC.b * 0.7 }, 0.85, 1.0, x, y, z, 0, blAdd, oreMarker
            );
            // Back face of stone
            pushQuad(
              [sx + sw, by0, sz + sd],
              [sx - sw, by0, sz + sd],
              [sx - sw, by0 + stoneH, sz + sd],
              [sx + sw, by0 + stoneH, sz + sd],
              { r: stoneC.r * 0.65, g: stoneC.g * 0.65, b: stoneC.b * 0.65 }, 0.8, 1.0, x, y, z, 0, blAdd, oreMarker
            );
            // Left face of stone
            pushQuad(
              [sx - sw, by0, sz + sd],
              [sx - sw, by0, sz - sd],
              [sx - sw, by0 + stoneH, sz - sd],
              [sx - sw, by0 + stoneH, sz + sd],
              { r: stoneC.r * 0.6, g: stoneC.g * 0.6, b: stoneC.b * 0.6 }, 0.75, 1.0, x, y, z, 0, blAdd, oreMarker
            );
            // Right face of stone
            pushQuad(
              [sx + sw, by0, sz - sd],
              [sx + sw, by0, sz + sd],
              [sx + sw, by0 + stoneH, sz + sd],
              [sx + sw, by0 + stoneH, sz - sd],
              { r: stoneC.r * 0.6, g: stoneC.g * 0.6, b: stoneC.b * 0.6 }, 0.75, 1.0, x, y, z, 0, blAdd, oreMarker
            );
          }

          // Two crossed logs in an X pattern
          const logW = 0.26, logH = 0.38, logLen = 0.85; // rounder logs
          const logDark = { r: 0.22, g: 0.13, b: 0.07 };
          const logMid = { r: 0.30, g: 0.18, b: 0.09 };
          const logLight = { r: 0.38, g: 0.24, b: 0.12 };
          const logY = by0 + 0.02;

          // Log 1: runs along Z axis (NW→SE diagonal)
          const l1cx = bx0 + 0.5, l1cz = bz0 + 0.5;
          const l1dx = logLen * 0.5 * 0.707, l1dz = logLen * 0.5 * 0.707;
          // Top face
          pushQuad(
            [l1cx - l1dx - logW * 0.707, logY + logH, l1cz - l1dz + logW * 0.707],
            [l1cx - l1dx + logW * 0.707, logY + logH, l1cz - l1dz - logW * 0.707],
            [l1cx + l1dx + logW * 0.707, logY + logH, l1cz + l1dz - logW * 0.707],
            [l1cx + l1dx - logW * 0.707, logY + logH, l1cz + l1dz + logW * 0.707],
            logMid, 0.85, 1.0, x, y, z, 0, blAdd, oreMarker
          );
          // Front-right face
          pushQuad(
            [l1cx - l1dx + logW * 0.707, logY, l1cz - l1dz - logW * 0.707],
            [l1cx + l1dx + logW * 0.707, logY, l1cz + l1dz - logW * 0.707],
            [l1cx + l1dx + logW * 0.707, logY + logH, l1cz + l1dz - logW * 0.707],
            [l1cx - l1dx + logW * 0.707, logY + logH, l1cz - l1dz - logW * 0.707],
            logDark, 0.75, 1.0, x, y, z, 0, blAdd, oreMarker
          );
          // Back-left face
          pushQuad(
            [l1cx + l1dx - logW * 0.707, logY, l1cz + l1dz + logW * 0.707],
            [l1cx - l1dx - logW * 0.707, logY, l1cz - l1dz + logW * 0.707],
            [l1cx - l1dx - logW * 0.707, logY + logH, l1cz - l1dz + logW * 0.707],
            [l1cx + l1dx - logW * 0.707, logY + logH, l1cz + l1dz + logW * 0.707],
            { r: logDark.r * 0.8, g: logDark.g * 0.8, b: logDark.b * 0.8 }, 0.7, 1.0, x, y, z, 0, blAdd, oreMarker
          );
          // Inner face (visible between logs)
          pushQuad(
            [l1cx - l1dx + logW * 0.707, logY + logH, l1cz - l1dz - logW * 0.707],
            [l1cx + l1dx - logW * 0.707, logY + logH, l1cz + l1dz - logW * 0.707],
            [l1cx + l1dx - logW * 0.707, logY, l1cz + l1dz - logW * 0.707],
            [l1cx - l1dx + logW * 0.707, logY, l1cz - l1dz - logW * 0.707],
            { r: logMid.r * 0.9, g: logMid.g * 0.9, b: logMid.b * 0.9 }, 0.65, 1.0, x, y, z, 0, blAdd, oreMarker
          );

          // Log 2: runs along X axis (NE→SW diagonal)
          const l2dx = logLen * 0.5 * 0.707, l2dz = -logLen * 0.5 * 0.707;
          // Top face
          pushQuad(
            [l1cx - l2dx - logW * 0.707, logY + logH, l1cz - l2dz - logW * 0.707],
            [l1cx - l2dx + logW * 0.707, logY + logH, l1cz - l2dz + logW * 0.707],
            [l1cx + l2dx + logW * 0.707, logY + logH, l1cz + l2dz + logW * 0.707],
            [l1cx + l2dx - logW * 0.707, logY + logH, l1cz + l2dz - logW * 0.707],
            logLight, 0.85, 1.0, x, y, z, 0, blAdd, oreMarker
          );
          // Front-left face
          pushQuad(
            [l1cx - l2dx + logW * 0.707, logY, l1cz - l2dz + logW * 0.707],
            [l1cx + l2dx + logW * 0.707, logY, l1cz + l2dz + logW * 0.707],
            [l1cx + l2dx + logW * 0.707, logY + logH, l1cz + l2dz + logW * 0.707],
            [l1cx - l2dx + logW * 0.707, logY + logH, l1cz - l2dz + logW * 0.707],
            logDark, 0.75, 1.0, x, y, z, 0, blAdd, oreMarker
          );
          // Back-right face
          pushQuad(
            [l1cx + l2dx - logW * 0.707, logY, l1cz + l2dz - logW * 0.707],
            [l1cx - l2dx - logW * 0.707, logY, l1cz - l2dz - logW * 0.707],
            [l1cx - l2dx - logW * 0.707, logY + logH, l1cz - l2dz - logW * 0.707],
            [l1cx + l2dx - logW * 0.707, logY + logH, l1cz + l2dz - logW * 0.707],
            { r: logDark.r * 0.8, g: logDark.g * 0.8, b: logDark.b * 0.8 }, 0.7, 1.0, x, y, z, 0, blAdd, oreMarker
          );
          // Inner face
          pushQuad(
            [l1cx - l2dx + logW * 0.707, logY + logH, l1cz - l2dz + logW * 0.707],
            [l1cx + l2dx - logW * 0.707, logY + logH, l1cz + l2dz + logW * 0.707],
            [l1cx + l2dx - logW * 0.707, logY, l1cz + l2dz + logW * 0.707],
            [l1cx - l2dx + logW * 0.707, logY, l1cz - l2dz + logW * 0.707],
            { r: logLight.r * 0.9, g: logLight.g * 0.9, b: logLight.b * 0.9 }, 0.65, 1.0, x, y, z, 0, blAdd, oreMarker
          );

          // Animated flames — two crossed planes each, multiple flames
          const numFlames = lowEndMode ? 2 : 6;
          const flameBaseY = by0 + logH + 0.06;
          const flameMaxH = 0.75;
          const cx0 = bx0 + 0.5, cz0 = bz0 + 0.5;

          for (let f = 0; f < numFlames; f++) {
            const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (f * 4567)) >>> 0);
            const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
            const rnd2 = (((seed * 22695477 + 1) >>> 0) % 1000) / 1000;

            const flickerPhase = time * (7 + rnd * 4) + f * 1.3;
            const flicker = 0.65 + Math.sin(flickerPhase) * 0.35;
            const fh2 = (0.35 + rnd * 0.45) * flameMaxH * flicker;
            const fw2 = 0.18 + rnd * 0.16;
            const offX = (rnd - 0.5) * 0.18;
            const offZ = (rnd2 - 0.5) * 0.18;
            const fx2 = cx0 + offX, fz2 = cz0 + offZ;
            const ftop2 = flameBaseY + fh2;

            const leanX2 = (rnd - 0.5) * 0.06;
            const leanZ2 = (rnd2 - 0.5) * 0.06;

            const flameRot = (f / numFlames) * Math.PI * 2;
            const ax1 = Math.cos(flameRot), az1 = Math.sin(flameRot);
            const ax2 = Math.cos(flameRot + Math.PI / 2), az2 = Math.sin(flameRot + Math.PI / 2);

            const fireBase = { r: 1.0, g: 0.25 + rnd * 0.25, b: 0.0 };
            const fireMid = { r: 1.0, g: 0.55 + rnd * 0.25, b: 0.0 };
            const fireTop = { r: 1.0, g: 0.85 + rnd * 0.15, b: 0.1 };

            const pushFlame = (ax: number, az: number) => {
              const p0: [number, number, number] = [fx2 - ax * fw2, flameBaseY, fz2 - az * fw2];
              const p1: [number, number, number] = [fx2 + ax * fw2, flameBaseY, fz2 + az * fw2];
              const p2: [number, number, number] = [fx2 + ax * fw2 * 0.4 + leanX2, ftop2, fz2 + az * fw2 * 0.4 + leanZ2];
              const p3: [number, number, number] = [fx2 - ax * fw2 * 0.4 + leanX2, ftop2, fz2 - az * fw2 * 0.4 + leanZ2];
              pushQuad(p0, p1, p2, p3, fireBase, 1.4, flameAlpha, x, y, z, 4, blAdd, oreMarker);
            };

            pushFlame(ax1, az1);
            pushFlame(ax2, az2);
          }

          // Ember glow — small 3D mound at base
          const emberPulse = 0.7 + Math.sin(time * 3.5) * 0.3;
          const eR = 0.18 * emberPulse;
          const eH = 0.08;
          const cx00 = bx0 + 0.5, cz00 = bz0 + 0.5;
          // Top face
          pushQuad([cx00 - eR, by0 + logH + eH, cz00 - eR], [cx00 + eR, by0 + logH + eH, cz00 - eR], [cx00 + eR, by0 + logH + eH, cz00 + eR], [cx00 - eR, by0 + logH + eH, cz00 + eR], { r: 1.0, g: 0.45 * emberPulse, b: 0.05 }, 1.5, 1.0, x, y, z, 0, blAdd, oreMarker);
          // Front face
          pushQuad([cx00 - eR, by0 + logH, cz00 - eR], [cx00 + eR, by0 + logH, cz00 - eR], [cx00 + eR, by0 + logH + eH, cz00 - eR], [cx00 - eR, by0 + logH + eH, cz00 - eR], { r: 1.0, g: 0.35 * emberPulse, b: 0.0 }, 1.3, 1.0, x, y, z, 0, blAdd, oreMarker);
          // Right face
          pushQuad([cx00 + eR, by0 + logH, cz00 - eR], [cx00 + eR, by0 + logH, cz00 + eR], [cx00 + eR, by0 + logH + eH, cz00 + eR], [cx00 + eR, by0 + logH + eH, cz00 - eR], { r: 1.0, g: 0.3 * emberPulse, b: 0.0 }, 1.2, 1.0, x, y, z, 0, blAdd, oreMarker);

          continue;
        }

        // Special-case: WATCH block - shows digital time on top face
        if (blockId === BlockId.WATCH) {
          const watchKey = `${ox + x},${y},${oz + z}`;
          const watchTime = (() => {
            const segmentMs = 10 * 60 * 1000;
            const nowMs = Date.now();
            const posInSeg = nowMs % segmentMs;
            const phase = posInSeg / segmentMs;
            const ticksInSeg = phase * 12000;
            return Math.floor(ticksInSeg);
          })();
          const hour = Math.floor(watchTime / 1000) % 24;
          const minute = Math.floor((watchTime % 1000) / 1000 * 60);
          const displayHour = hour % 12 || 12;
          const timeStr = `${displayHour}:${minute.toString().padStart(2, '0')}`;
          const isPM = hour >= 12;
          const digitsStr = (isPM ? 'P' : 'A') + timeStr.replace(':', '');

          // Simple patterns (reuse small set from renderer)
          const WATCH_PATTERNS: Record<string, string[]> = {
            empty: ['.....', '.....', '.....'],
            '0': ['1.1', '.1.', '1.1', '1.1', '111'],
            '1': ['.1.', '.1.', '.1.', '.1.', '.1.'],
            '2': ['111', '..1', '111', '1..', '111'],
            '3': ['111', '..1', '111', '..1', '111'],
            '4': ['1.1', '1.1', '111', '..1', '..1'],
            '5': ['111', '1..', '111', '..1', '111'],
            '6': ['111', '1..', '111', '1.1', '111'],
            '7': ['111', '..1', '..1', '..1', '..1'],
            '8': ['111', '1.1', '111', '1.1', '111'],
            '9': ['111', '1.1', '111', '..1', '111'],
            'A': ['1.1', '1.1', '111', '1.1', '1.1'],
            'P': ['111', '1.1', '111', '1..', '1..'],
            ':': ['.', '1', '.', '1', '.']
          };

          for (let tfi = 0; tfi < FACES.length; tfi++) {
            const face = FACES[tfi];
            const isTopFace = tfi === 0;
            const nx = x + face.dir[0];
            const ny = y + face.dir[1];
            const nz = z + face.dir[2];
            const neighbor = getBlockAtWorld(ox + nx, ny, oz + nz);
            const isTransparent = TRANSPARENT_BLOCKS.has(neighbor);
            if (!isTransparent) continue;

            const v0 = face.verts[0]; const v1 = face.verts[1]; const v2 = face.verts[2]; const v3 = face.verts[3];
            const c0 = [ox + x + v0[0], y + v0[1], oz + z + v0[2]] as [number, number, number];
            const c1 = [ox + x + v1[0], y + v1[1], oz + z + v1[2]] as [number, number, number];
            const c2 = [ox + x + v2[0], y + v2[1], oz + z + v2[2]] as [number, number, number];
            const c3 = [ox + x + v3[0], y + v3[1], oz + z + v3[2]] as [number, number, number];

            if (isTopFace) {
              // Background
              pushQuad(c0, c1, c2, c3, { r: 0.0, g: 0.0, b: 0.0 }, face.brightness * 0.5, 1.0, x, y, z, tfi, blAdd, oreMarker);

              // Draw 5x3 segments as small cubes
              for (let gx = 0; gx < 5; gx++) {
                const char = digitsStr[gx] ?? '.';
                for (let gy = 0; gy < 3; gy++) {
                  const pattern = WATCH_PATTERNS[char] || WATCH_PATTERNS['empty'];
                  const line = pattern[gy] || '.....';
                  const isLit = line[gx] === '1';

                  const uCenter = (gx + 0.5) / 5;
                  const vCenter = (gy + 0.5) / 3;
                  const lerpX = c0[0] * (1 - uCenter) * (1 - vCenter) + c1[0] * uCenter * (1 - vCenter) + c2[0] * uCenter * vCenter + c3[0] * (1 - uCenter) * vCenter;
                  const lerpY = c0[1] * (1 - uCenter) * (1 - vCenter) + c1[1] * uCenter * (1 - vCenter) + c2[1] * uCenter * vCenter + c3[1] * (1 - uCenter) * vCenter;
                  const lerpZ = c0[2] * (1 - uCenter) * (1 - vCenter) + c1[2] * uCenter * (1 - vCenter) + c2[2] * uCenter * vCenter + c3[2] * (1 - uCenter) * vCenter;

                  const segSize = 0.08;
                  const segColor = isLit ? { r: 0.9, g: 0.15, b: 0.12 } : { r: 0.15, g: 0.10, b: 0.08 };
                  const bx = lerpX - segSize * 0.5;
                  const by = lerpY - segSize * 0.5;
                  const bz = lerpZ - 0.01;

                  const bright = face.brightness * (isLit ? 1.5 : 0.4);
                  // Bottom face
                  positions.push(bx, by, bz); colors.push(segColor.r, segColor.g, segColor.b); brightness.push(bright); alphas.push(1.0);
                  positions.push(bx + segSize, by, bz); colors.push(segColor.r, segColor.g, segColor.b); brightness.push(bright); alphas.push(1.0);
                  positions.push(bx + segSize, by + segSize, bz); colors.push(segColor.r, segColor.g, segColor.b); brightness.push(bright); alphas.push(1.0);
                  positions.push(bx, by + segSize, bz); colors.push(segColor.r, segColor.g, segColor.b); brightness.push(bright); alphas.push(1.0);
                  indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3); vertCount += 4;

                  // Top face
                  positions.push(bx, by, bz + 0.02); colors.push(segColor.r * 1.2, segColor.g * 1.2, segColor.b * 1.2); brightness.push(bright * 1.1); alphas.push(1.0);
                  positions.push(bx + segSize, by, bz + 0.02); colors.push(segColor.r * 1.2, segColor.g * 1.2, segColor.b * 1.2); brightness.push(bright * 1.1); alphas.push(1.0);
                  positions.push(bx + segSize, by + segSize, bz + 0.02); colors.push(segColor.r * 1.2, segColor.g * 1.2, segColor.b * 1.2); brightness.push(bright * 1.1); alphas.push(1.0);
                  positions.push(bx, by + segSize, bz + 0.02); colors.push(segColor.r * 1.2, segColor.g * 1.2, segColor.b * 1.2); brightness.push(bright * 1.1); alphas.push(1.0);
                  indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3); vertCount += 4;
                }
              }
            } else {
              // Side and bottom faces - solid block color
              const sideShade = 0.9 * (face.brightness / 1.0);
              for (let vi = 0; vi < 4; vi++) {
                const v = face.verts[vi];
                positions.push(ox + x + v[0], y + v[1], oz + z + v[2]);
                colors.push(bc.r * sideShade, bc.g * sideShade, bc.b * sideShade);
                brightness.push(face.brightness);
                alphas.push(1.0);
              }
              indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
              vertCount += 4;
            }
          }
          continue;
        }

        // Special-case: CHEST renders as a Minecraft-style chest with base + lid
        if (blockId === BlockId.CHEST) {
          const chestBaseColor = { r: 0.545, g: 0.271, b: 0.075 };
          const chestLidColor = { r: 0.6, g: 0.35, b: 0.12 };
          const chestLockColor = { r: 0.8, g: 0.7, b: 0.5 };

          for (let fi = 0; fi < FACES.length; fi++) {
            const face = FACES[fi];
            const nx = x + face.dir[0];
            const ny = y + face.dir[1];
            const nz = z + face.dir[2];
            const neighbor = getBlockAtWorld(ox + nx, ny, oz + nz);
            const isTransparent = TRANSPARENT_BLOCKS.has(neighbor);
            if (!isTransparent && fi !== 0) continue;

            const v0 = face.verts[0]; const v1 = face.verts[1]; const v2 = face.verts[2]; const v3 = face.verts[3];
            const isTopFace = fi === 0; const isBottomFace = fi === 1;
            const c0 = [ox + x + v0[0], y + v0[1], oz + z + v0[2]] as [number, number, number];
            const c1 = [ox + x + v1[0], y + v1[1], oz + z + v1[2]] as [number, number, number];
            const c2 = [ox + x + v2[0], y + v2[1], oz + z + v2[2]] as [number, number, number];
            const c3 = [ox + x + v3[0], y + v3[1], oz + z + v3[2]] as [number, number, number];
            const edgeU = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
            const edgeV = [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]];

            if (isTopFace) {
              const gridSize = 2; const cellSize = 1 / gridSize;
              for (let gy = 0; gy < gridSize; gy++) {
                for (let gx = 0; gx < gridSize; gx++) {
                  const u0 = gx * cellSize; const v0_ = gy * cellSize; const u1 = u0 + cellSize; const v1_ = v0_ + cellSize;
                  const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy)) >>> 0);
                  const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                  const shade = 0.85 + rnd * 0.25;
                  const cr = chestLidColor.r * shade, cg = chestLidColor.g * shade, cb = chestLidColor.b * shade;
                  const verts = [
                    [c0[0] + edgeU[0] * u0 + edgeV[0] * v0_, c0[1] + edgeU[1] * u0 + edgeV[1] * v0_, c0[2] + edgeU[2] * u0 + edgeV[2] * v0_],
                    [c0[0] + edgeU[0] * u1 + edgeV[0] * v0_, c0[1] + edgeU[1] * u1 + edgeV[1] * v0_, c0[2] + edgeU[2] * u1 + edgeV[2] * v0_],
                    [c0[0] + edgeU[0] * u1 + edgeV[0] * v1_, c0[1] + edgeU[1] * u1 + edgeV[1] * v1_, c0[2] + edgeU[2] * u1 + edgeV[2] * v1_],
                    [c0[0] + edgeU[0] * u0 + edgeV[0] * v1_, c0[1] + edgeU[1] * u0 + edgeV[1] * v1_, c0[2] + edgeU[2] * u0 + edgeV[2] * v1_],
                  ];
                  for (let vi = 0; vi < 4; vi++) { const pv = verts[vi]; const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy + vi * 31)) >>> 0); const vrnd = (((vseed * 1103515245 + 12345) >>> 0) % 1000) / 1000; positions.push(pv[0], pv[1], pv[2]); colors.push(cr, cg, cb); brightness.push(face.brightness * (0.9 + vrnd * 0.15)); alphas.push(1.0); }
                  indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3); vertCount += 4;
                }
              }
            } else if (isBottomFace) {
              const baseColor = { r: chestBaseColor.r * 0.7, g: chestBaseColor.g * 0.7, b: chestBaseColor.b * 0.7 };
              for (let vi = 0; vi < 4; vi++) { const pv = [c0, c1, c2, c3][vi]; positions.push(pv[0], pv[1], pv[2]); colors.push(baseColor.r, baseColor.g, baseColor.b); brightness.push(face.brightness); alphas.push(1.0); }
              indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3); vertCount += 4;
            } else {
              const gridSizeX = 3; const cellSizeX = 1 / gridSizeX; const lidProtrude = 1.0; const baseColor = chestBaseColor;
              for (let gx = 0; gx < gridSizeX; gx++) {
                const u0 = gx * cellSizeX; const u1 = u0 + cellSizeX;
                const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97)) >>> 0);
                const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                const shade = 0.85 + rnd * 0.25; const cr = baseColor.r * shade, cg = baseColor.g * shade, cb = baseColor.b * shade;
                const verts = [
                  [c0[0] + edgeU[0] * u0 + edgeV[0] * 0 * lidProtrude, c0[1] + edgeU[1] * u0 + edgeV[1] * 0 * lidProtrude, c0[2] + edgeU[2] * u0 + edgeV[2] * 0 * lidProtrude],
                  [c0[0] + edgeU[0] * u1 + edgeV[0] * 0 * lidProtrude, c0[1] + edgeU[1] * u1 + edgeV[1] * 0 * lidProtrude, c0[2] + edgeU[2] * u1 + edgeV[2] * 0 * lidProtrude],
                  [c0[0] + edgeU[0] * u1 + edgeV[0] * 1 * lidProtrude, c0[1] + edgeU[1] * u1 + edgeV[1] * 1 * lidProtrude, c0[2] + edgeU[2] * u1 + edgeV[2] * 1 * lidProtrude],
                  [c0[0] + edgeU[0] * u0 + edgeV[0] * 1 * lidProtrude, c0[1] + edgeU[1] * u0 + edgeV[1] * 1 * lidProtrude, c0[2] + edgeU[2] * u0 + edgeV[2] * 1 * lidProtrude],
                ];
                for (let vi = 0; vi < 4; vi++) { const pv = verts[vi]; const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + vi * 31)) >>> 0); const vrnd = (((vseed * 1103515245 + 12345) >>> 0) % 1000) / 1000; positions.push(pv[0], pv[1], pv[2]); colors.push(cr * (0.9 + vrnd * 0.15), cg * (0.9 + vrnd * 0.15), cb * (0.9 + vrnd * 0.15)); brightness.push(face.brightness * (0.9 + vrnd * 0.15)); alphas.push(1.0); }
                indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3); vertCount += 4;

                // Add a small lock/latch detail on the front face (south face = fi===2) - center plank
                if (gx === 1 && fi === 2) {
                  const lockSize = 0.1; const lockProtrude = 0.03; const lockV0 = 0.42; const lockV1 = lockV0 + lockSize; const lockU0 = 0.45; const lockU1 = lockU0 + lockSize;
                  const lockOffset = [ face.dir[0] * lockProtrude, face.dir[1] * lockProtrude, face.dir[2] * lockProtrude ];
                  const lockVerts = [
                    [c0[0] + edgeU[0] * lockU0 + edgeV[0] * lockV0 + lockOffset[0], c0[1] + edgeU[1] * lockU0 + edgeV[1] * lockV0 + lockOffset[1], c0[2] + edgeU[2] * lockU0 + edgeV[2] * lockV0 + lockOffset[2]],
                    [c0[0] + edgeU[0] * lockU1 + edgeV[0] * lockV0 + lockOffset[0], c0[1] + edgeU[1] * lockU1 + edgeV[1] * lockV0 + lockOffset[1], c0[2] + edgeU[2] * lockU1 + edgeV[2] * lockV0 + lockOffset[2]],
                    [c0[0] + edgeU[0] * lockU1 + edgeV[0] * lockV1 + lockOffset[0], c0[1] + edgeU[1] * lockU1 + edgeV[1] * lockV1 + lockOffset[1], c0[2] + edgeU[2] * lockU1 + edgeV[2] * lockV1 + lockOffset[2]],
                    [c0[0] + edgeU[0] * lockU0 + edgeV[0] * lockV1 + lockOffset[0], c0[1] + edgeU[1] * lockU0 + edgeV[1] * lockV1 + lockOffset[1], c0[2] + edgeU[2] * lockU0 + edgeV[2] * lockV1 + lockOffset[2]],
                  ];
                  for (let lvi = 0; lvi < 4; lvi++) { const lpv = lockVerts[lvi]; positions.push(lpv[0], lpv[1], lpv[2]); colors.push(chestLockColor.r, chestLockColor.g, chestLockColor.b); brightness.push(face.brightness * 1.15); alphas.push(1.0); }
                  indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3); vertCount += 4;
                }
              }
            }
          }
          continue;
        }

        // Special-case: FURNACE - stone brick look with opening on front
        if (blockId === BlockId.FURNACE) {
          const furnaceColor = { r: 0.45, g: 0.42, b: 0.40 };
          const furnaceDark = { r: 0.35, g: 0.32, b: 0.30 };
          const furnaceFront = { r: 0.15, g: 0.12, b: 0.10 };

          for (let fi = 0; fi < FACES.length; fi++) {
            const face = FACES[fi];
            const isTopFace = fi === 0; const isFrontFace = fi === 2; const isBottomFace = fi === 1;
            const nx = x + face.dir[0]; const ny = y + face.dir[1]; const nz = z + face.dir[2];
            const neighbor = getBlockAtWorld(ox + nx, ny, oz + nz);
            const isTransparent = TRANSPARENT_BLOCKS.has(neighbor);
            if (!isTransparent && fi !== 0) continue;

            const v0 = face.verts[0]; const v1 = face.verts[1]; const v2 = face.verts[2]; const v3 = face.verts[3];
            const c0 = [ox + x + v0[0], y + v0[1], oz + z + v0[2]] as [number, number, number];
            const c1 = [ox + x + v1[0], y + v1[1], oz + z + v1[2]] as [number, number, number];
            const c2 = [ox + x + v2[0], y + v2[1], oz + z + v2[2]] as [number, number, number];
            const c3 = [ox + x + v3[0], y + v3[1], oz + z + v3[2]] as [number, number, number];
            const edgeU = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
            const edgeV = [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]];

            if (isFrontFace) {
              const gridSize = 3; const cellSize = 1 / gridSize;
              for (let gy = 0; gy < gridSize; gy++) {
                for (let gx = 0; gx < gridSize; gx++) {
                  const u0 = gx * cellSize; const v0_ = gy * cellSize; const u1 = u0 + cellSize; const v1_ = v0_ + cellSize;
                  const isOpening = gx === 1 && gy === 1;
                  const baseColor = isOpening ? furnaceFront : furnaceColor;
                  const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy)) >>> 0);
                  const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000; const shade = 0.85 + rnd * 0.25;
                  const cr = baseColor.r * shade, cg = baseColor.g * shade, cb = baseColor.b * shade;
                  const verts = [
                    [c0[0] + edgeU[0] * u0 + edgeV[0] * v0_, c0[1] + edgeU[1] * u0 + edgeV[1] * v0_, c0[2] + edgeU[2] * u0 + edgeV[2] * v0_],
                    [c0[0] + edgeU[0] * u1 + edgeV[0] * v0_, c0[1] + edgeU[1] * u1 + edgeV[1] * v0_, c0[2] + edgeU[2] * u1 + edgeV[2] * v0_],
                    [c0[0] + edgeU[0] * u1 + edgeV[0] * v1_, c0[1] + edgeU[1] * u1 + edgeV[1] * v1_, c0[2] + edgeU[2] * u1 + edgeV[2] * v1_],
                    [c0[0] + edgeU[0] * u0 + edgeV[0] * v1_, c0[1] + edgeU[1] * u0 + edgeV[1] * v1_, c0[2] + edgeU[2] * u0 + edgeV[2] * v1_],
                  ];
                  for (let vi = 0; vi < 4; vi++) { const pv = verts[vi]; positions.push(pv[0], pv[1], pv[2]); colors.push(cr, cg, cb); brightness.push(face.brightness); alphas.push(1.0); }
                  indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3); vertCount += 4;
                }
              }
              continue;
            }

            // Other faces - simple colored
            const baseColor = isTopFace ? furnaceDark : furnaceColor;
            const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393)) >>> 0);
            const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000; const shade = 0.85 + rnd * 0.25;
            const cr = baseColor.r * shade, cg = baseColor.g * shade, cb = baseColor.b * shade;
            const verts = [c0, c1, c2, c3];
            for (let vi = 0; vi < 4; vi++) { const pv = verts[vi]; positions.push(pv[0], pv[1], pv[2]); colors.push(cr, cg, cb); brightness.push(face.brightness); alphas.push(1.0); }
            indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3); vertCount += 4;
          }
          continue;
        }

        // Special-case: CRAFTING_TABLE - Minecraft-style table with 3x3 grid on front
        if (blockId === BlockId.CRAFTING_TABLE) {
          const tableTopColor = { r: 0.70, g: 0.55, b: 0.30 };
          const tableSideColor = { r: 0.60, g: 0.45, b: 0.22 };
          const tableDark = { r: 0.50, g: 0.38, b: 0.18 };

          for (let fi = 0; fi < FACES.length; fi++) {
            const face = FACES[fi];
            const v0 = face.verts[0]; const v1 = face.verts[1]; const v2 = face.verts[2]; const v3 = face.verts[3];
            const isTopFace = fi === 0; const isBottomFace = fi === 1; const isFrontFace = fi === 2;
            const c0 = [ox + x + v0[0], y + v0[1], oz + z + v0[2]] as [number, number, number];
            const c1 = [ox + x + v1[0], y + v1[1], oz + z + v1[2]] as [number, number, number];
            const c2 = [ox + x + v2[0], y + v2[1], oz + z + v2[2]] as [number, number, number];
            const c3 = [ox + x + v3[0], y + v3[1], oz + z + v3[2]] as [number, number, number];
            const edgeU = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
            const edgeV = [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]];

            if (isTopFace) {
              const gridSize = 2; const cellSize = 1 / gridSize;
              for (let gy = 0; gy < gridSize; gy++) {
                for (let gx = 0; gx < gridSize; gx++) {
                  const u0 = gx * cellSize; const v0_ = gy * cellSize; const u1 = u0 + cellSize; const v1_ = v0_ + cellSize;
                  const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy)) >>> 0);
                  const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000; const shade = 0.85 + rnd * 0.25;
                  const cr = tableTopColor.r * shade, cg = tableTopColor.g * shade, cb = tableTopColor.b * shade;
                  const verts = [
                    [c0[0] + edgeU[0] * u0 + edgeV[0] * v0_, c0[1] + edgeU[1] * u0 + edgeV[1] * v0_, c0[2] + edgeU[2] * u0 + edgeV[2] * v0_],
                    [c0[0] + edgeU[0] * u1 + edgeV[0] * v0_, c0[1] + edgeU[1] * u1 + edgeV[1] * v0_, c0[2] + edgeU[2] * u1 + edgeV[2] * v0_],
                    [c0[0] + edgeU[0] * u1 + edgeV[0] * v1_, c0[1] + edgeU[1] * u1 + edgeV[1] * v1_, c0[2] + edgeU[2] * u1 + edgeV[2] * v1_],
                    [c0[0] + edgeU[0] * u0 + edgeV[0] * v1_, c0[1] + edgeU[1] * u0 + edgeV[1] * v1_, c0[2] + edgeU[2] * u0 + edgeV[2] * v1_],
                  ];
                  for (let vi = 0; vi < 4; vi++) { const pv = verts[vi]; const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy + vi * 31)) >>> 0); const vrnd = (((vseed * 1103515245 + 12345) >>> 0) % 1000) / 1000; positions.push(pv[0], pv[1], pv[2]); colors.push(cr * (0.9 + vrnd * 0.15), cg * (0.9 + vrnd * 0.15), cb * (0.9 + vrnd * 0.15)); brightness.push(face.brightness * (0.9 + vrnd * 0.15)); alphas.push(1.0); }
                  indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3); vertCount += 4;
                }
              }
            } else if (isBottomFace) {
              const baseColor = { r: tableDark.r * 0.7, g: tableDark.g * 0.7, b: tableDark.b * 0.7 };
              for (let vi = 0; vi < 4; vi++) { const pv = [c0, c1, c2, c3][vi]; positions.push(pv[0], pv[1], pv[2]); colors.push(baseColor.r, baseColor.g, baseColor.b); brightness.push(face.brightness); alphas.push(1.0); }
              indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3); vertCount += 4;
            } else if (isFrontFace) {
              const gridSize = 3; const cellSize = 1 / gridSize;
              for (let gy = 0; gy < gridSize; gy++) {
                for (let gx = 0; gx < gridSize; gx++) {
                  const u0 = gx * cellSize; const v0_ = gy * cellSize; const u1 = u0 + cellSize; const v1_ = v0_ + cellSize;
                  const baseColor = tableSideColor; const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy)) >>> 0);
                  const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000; const shade = 0.85 + rnd * 0.25; const cr = baseColor.r * shade, cg = baseColor.g * shade, cb = baseColor.b * shade;
                  const verts = [
                    [c0[0] + edgeU[0] * u0 + edgeV[0] * v0_, c0[1] + edgeU[1] * u0 + edgeV[1] * v0_, c0[2] + edgeU[2] * u0 + edgeV[2] * v0_],
                    [c0[0] + edgeU[0] * u1 + edgeV[0] * v0_, c0[1] + edgeU[1] * u1 + edgeV[1] * v0_, c0[2] + edgeU[2] * u1 + edgeV[2] * v0_],
                    [c0[0] + edgeU[0] * u1 + edgeV[0] * v1_, c0[1] + edgeU[1] * u1 + edgeV[1] * v1_, c0[2] + edgeU[2] * u1 + edgeV[2] * v1_],
                    [c0[0] + edgeU[0] * u0 + edgeV[0] * v1_, c0[1] + edgeU[1] * u0 + edgeV[1] * v1_, c0[2] + edgeU[2] * u0 + edgeV[2] * v1_],
                  ];
                  for (let vi = 0; vi < 4; vi++) { const pv = verts[vi]; const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy + vi * 31)) >>> 0); const vrnd = (((vseed * 1103515245 + 12345) >>> 0) % 1000) / 1000; positions.push(pv[0], pv[1], pv[2]); colors.push(cr * (0.9 + vrnd * 0.15), cg * (0.9 + vrnd * 0.15), cb * (0.9 + vrnd * 0.15)); brightness.push(face.brightness * (0.9 + vrnd * 0.15)); alphas.push(1.0); }
                  indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3); vertCount += 4;
                }
              }
            }
          }
          continue;
        }

        // Special-case: SMITHING_TABLE - dark wood table with diamond pattern on front
        if (blockId === BlockId.SMITHING_TABLE) {
          const tableTopColor = { r: 0.55, g: 0.42, b: 0.30 };
          const tableSideColor = { r: 0.30, g: 0.22, b: 0.18 };
          const tableDark = { r: 0.22, g: 0.16, b: 0.12 };
          const diamondColor = { r: 0.45, g: 0.35, b: 0.28 };

          for (let fi = 0; fi < FACES.length; fi++) {
            const face = FACES[fi];
            const v0 = face.verts[0]; const v1 = face.verts[1]; const v2 = face.verts[2]; const v3 = face.verts[3];
            const isTopFace = fi === 0; const isBottomFace = fi === 1; const isFrontFace = fi === 2;
            const c0 = [ox + x + v0[0], y + v0[1], oz + z + v0[2]] as [number, number, number];
            const c1 = [ox + x + v1[0], y + v1[1], oz + z + v1[2]] as [number, number, number];
            const c2 = [ox + x + v2[0], y + v2[1], oz + z + v2[2]] as [number, number, number];
            const c3 = [ox + x + v3[0], y + v3[1], oz + z + v3[2]] as [number, number, number];
            const edgeU = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
            const edgeV = [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]];

            if (isTopFace) {
              const gridSize = 2; const cellSize = 1 / gridSize;
              for (let gy = 0; gy < gridSize; gy++) {
                for (let gx = 0; gx < gridSize; gx++) {
                  const u0 = gx * cellSize; const v0_ = gy * cellSize; const u1 = u0 + cellSize; const v1_ = v0_ + cellSize;
                  const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy)) >>> 0);
                  const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000; const shade = 0.85 + rnd * 0.2;
                  const cr = tableTopColor.r * shade, cg = tableTopColor.g * shade, cb = tableTopColor.b * shade;
                  const verts = [
                    [c0[0] + edgeU[0] * u0 + edgeV[0] * v0_, c0[1] + edgeU[1] * u0 + edgeV[1] * v0_, c0[2] + edgeU[2] * u0 + edgeV[2] * v0_],
                    [c0[0] + edgeU[0] * u1 + edgeV[0] * v0_, c0[1] + edgeU[1] * u1 + edgeV[1] * v0_, c0[2] + edgeU[2] * u1 + edgeV[2] * v0_],
                    [c0[0] + edgeU[0] * u1 + edgeV[0] * v1_, c0[1] + edgeU[1] * u1 + edgeV[1] * v1_, c0[2] + edgeU[2] * u1 + edgeV[2] * v1_],
                    [c0[0] + edgeU[0] * u0 + edgeV[0] * v1_, c0[1] + edgeU[1] * u0 + edgeV[1] * v1_, c0[2] + edgeU[2] * u0 + edgeV[2] * v1_],
                  ];
                  for (let vi = 0; vi < 4; vi++) { const pv = verts[vi]; const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy + vi * 31)) >>> 0); const vrnd = (((vseed * 1103515245 + 12345) >>> 0) % 1000) / 1000; positions.push(pv[0], pv[1], pv[2]); colors.push(cr * (0.9 + vrnd * 0.15), cg * (0.9 + vrnd * 0.15), cb * (0.9 + vrnd * 0.15)); brightness.push(face.brightness * (0.9 + vrnd * 0.15)); alphas.push(1.0); }
                  indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3); vertCount += 4;
                }
              }
            } else if (isBottomFace) {
              const baseColor = { r: tableDark.r * 0.7, g: tableDark.g * 0.7, b: tableDark.b * 0.7 };
              const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393)) >>> 0);
              const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000; const shade = 0.9 + rnd * 0.15;
              for (let vi = 0; vi < 4; vi++) { const pv = [c0, c1, c2, c3][vi]; positions.push(pv[0], pv[1], pv[2]); colors.push(baseColor.r * shade, baseColor.g * shade, baseColor.b * shade); brightness.push(face.brightness); alphas.push(1.0); }
              indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3); vertCount += 4;
            } else if (isFrontFace) {
              const gridSize = 3; const cellSize = 1 / gridSize;
              for (let gy = 0; gy < gridSize; gy++) {
                for (let gx = 0; gx < gridSize; gx++) {
                  const u0 = gx * cellSize; const v0_ = gy * cellSize; const u1 = u0 + cellSize; const v1_ = v0_ + cellSize;
                  const centerX = 1; const centerY = 1; const distFromCenter = Math.sqrt(Math.pow(gx - centerX, 2) + Math.pow(gy - centerY, 2));
                  const isDiamond = distFromCenter <= 1.0;
                  const baseColor = isDiamond ? diamondColor : tableSideColor;
                  const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy)) >>> 0);
                  const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000; const shade = 0.85 + rnd * 0.25;
                  const cr = baseColor.r * shade, cg = baseColor.g * shade, cb = baseColor.b * shade;
                  const verts = [
                    [c0[0] + edgeU[0] * u0 + edgeV[0] * v0_, c0[1] + edgeU[1] * u0 + edgeV[1] * v0_, c0[2] + edgeU[2] * u0 + edgeV[2] * v0_],
                    [c0[0] + edgeU[0] * u1 + edgeV[0] * v0_, c0[1] + edgeU[1] * u1 + edgeV[1] * v0_, c0[2] + edgeU[2] * u1 + edgeV[2] * v0_],
                    [c0[0] + edgeU[0] * u1 + edgeV[0] * v1_, c0[1] + edgeU[1] * u1 + edgeV[1] * v1_, c0[2] + edgeU[2] * u1 + edgeV[2] * v1_],
                    [c0[0] + edgeU[0] * u0 + edgeV[0] * v1_, c0[1] + edgeU[1] * u0 + edgeV[1] * v1_, c0[2] + edgeU[2] * u0 + edgeV[2] * v1_],
                  ];
                  for (let vi = 0; vi < 4; vi++) { const pv = verts[vi]; const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy + vi * 31)) >>> 0); const vrnd = (((vseed * 1103515245 + 12345) >>> 0) % 1000) / 1000; positions.push(pv[0], pv[1], pv[2]); colors.push(cr * (0.9 + vrnd * 0.15), cg * (0.9 + vrnd * 0.15), cb * (0.9 + vrnd * 0.15)); brightness.push(face.brightness * (0.9 + vrnd * 0.15)); alphas.push(1.0); }
                  indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3); vertCount += 4;
                }
              }
            } else {
              const gridSizeX = 3; const cellSizeX = 1 / gridSizeX;
              for (let gx = 0; gx < gridSizeX; gx++) {
                const u0 = gx * cellSizeX; const u1 = u0 + cellSizeX;
                const baseColor = tableSideColor;
                const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97)) >>> 0);
                const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000; const shade = 0.85 + rnd * 0.25;
                const cr = baseColor.r * shade, cg = baseColor.g * shade, cb = baseColor.b * shade;
                const verts = [
                  [c0[0] + edgeU[0] * u0 + edgeV[0] * 0, c0[1] + edgeU[1] * u0 + edgeV[1] * 0, c0[2] + edgeU[2] * u0 + edgeV[2] * 0],
                  [c0[0] + edgeU[0] * u1 + edgeV[0] * 0, c0[1] + edgeU[1] * u1 + edgeV[1] * 0, c0[2] + edgeU[2] * u1 + edgeV[2] * 0],
                  [c0[0] + edgeU[0] * u1 + edgeV[0] * 1, c0[1] + edgeU[1] * u1 + edgeV[1] * 1, c0[2] + edgeU[2] * u1 + edgeV[2] * 1],
                  [c0[0] + edgeU[0] * u0 + edgeV[0] * 1, c0[1] + edgeU[1] * u0 + edgeV[1] * 1, c0[2] + edgeU[2] * u0 + edgeV[2] * 1],
                ];
                for (let vi = 0; vi < 4; vi++) { const pv = verts[vi]; const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + vi * 31)) >>> 0); const vrnd = (((vseed * 1103515245 + 12345) >>> 0) % 1000) / 1000; positions.push(pv[0], pv[1], pv[2]); colors.push(cr * (0.9 + vrnd * 0.15), cg * (0.9 + vrnd * 0.15), cb * (0.9 + vrnd * 0.15)); brightness.push(face.brightness * (0.9 + vrnd * 0.15)); alphas.push(1.0); }
                indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3); vertCount += 4;
              }
            }
          }
          continue;
        }

        // STALACTITE: hangs from ceiling, wide at top, narrow at tip pointing DOWN
        if (blockId === BlockId.NETHER_STALACTITE) {
          const cr = 0.42, cg = 0.17, cb = 0.11;
          const attachDir = 1;
          let distFromBase = 0;
          for (let k = 1; k <= 8; k++) {
            const ny2 = y + attachDir * k;
            if (ny2 < 0 || ny2 >= WORLD_HEIGHT) break;
            if (getBlockAtWorld(ox + x, ny2, oz + z) !== blockId) break;
            distFromBase++;
          }
          let colLen = distFromBase + 1;
          const tipDir = -attachDir;
          for (let k = 1; k <= 8; k++) {
            const ny2 = y + tipDir * k;
            if (ny2 < 0 || ny2 >= WORLD_HEIGHT) break;
            if (getBlockAtWorld(ox + x, ny2, oz + z) !== blockId) break;
            colLen++;
          }
          const maxR = 0.40; const minR = 0.03;
          const fracBottom = distFromBase / Math.max(1, colLen - 1);
          const fracTop = Math.max(0, distFromBase - 1) / Math.max(1, colLen - 1);
          let rTop = maxR - fracTop * (maxR - minR);
          let rBottom = maxR - fracBottom * (maxR - minR);
          const isTipBlock = (distFromBase === colLen - 1);
          let apexOffset = 0; let enableApex = false;
          if (isTipBlock) { rBottom = 0.01; }
          const cx0 = ox + x + 0.5, cz0 = oz + z + 0.5;
          const yBot = y + 0.0, yTop = y + 1.0; const sides = 8;
          for (let s = 0; s < sides; s++) {
            const a0 = (s / sides) * Math.PI * 2; const a1 = ((s + 1) / sides) * Math.PI * 2;
            const cos0 = Math.cos(a0), sin0 = Math.sin(a0); const cos1 = Math.cos(a1), sin1 = Math.sin(a1);
            const shade = 0.75 + (s % 2) * 0.12;
            const topYForFace = enableApex ? (yTop + apexOffset) : yTop;
            const topRForFace = enableApex ? 0.0 : rTop;
            pushQuad([cx0 + cos0 * rBottom, yBot, cz0 + sin0 * rBottom], [cx0 + cos1 * rBottom, yBot, cz0 + sin1 * rBottom], [cx0 + cos1 * topRForFace, topYForFace, cz0 + sin1 * topRForFace], [cx0 + cos0 * topRForFace, topYForFace, cz0 + sin0 * topRForFace], { r: cr * shade, g: cg * shade, b: cb * shade }, 1.0, 1.0, x, y, z, 0, blAdd, oreMarker);
          }
          const isBaseBlock = (distFromBase === 0);
          if (isBaseBlock) {
            const capY = yTop; const capR = rTop;
            for (let s = 0; s < sides; s++) {
              const a0 = (s / sides) * Math.PI * 2; const a1 = ((s + 1) / sides) * Math.PI * 2;
              pushQuad([cx0, capY, cz0], [cx0 + Math.cos(a0) * capR, capY, cz0 + Math.sin(a0) * capR], [cx0 + Math.cos(a1) * capR, capY, cz0 + Math.sin(a1) * capR], [cx0, capY, cz0], { r: cr * 0.55, g: cg * 0.55, b: cb * 0.55 }, 1.0, 1.0, x, y, z, 0, blAdd, oreMarker);
            }
          }
          if (enableApex) {
            const apexY = yTop + apexOffset;
            for (let s = 0; s < sides; s++) {
              const a0 = (s / sides) * Math.PI * 2; const a1 = ((s + 1) / sides) * Math.PI * 2;
              const v0 = [cx0 + Math.cos(a0) * 0.0001, yTop, cz0 + Math.sin(a0) * 0.0001];
              const v1 = [cx0 + Math.cos(a1) * 0.0001, yTop, cz0 + Math.sin(a1) * 0.0001];
              positions.push(v0[0], v0[1], v0[2]); colors.push(cr * 0.9, cg * 0.9, cb * 0.9); brightness.push(1.0); alphas.push(1.0);
              positions.push(v1[0], v1[1], v1[2]); colors.push(cr * 0.9, cg * 0.9, cb * 0.9); brightness.push(1.0); alphas.push(1.0);
              positions.push(cx0, apexY, cz0); colors.push(cr * 0.9, cg * 0.9, cb * 0.9); brightness.push(1.0); alphas.push(1.0);
              indices.push(vertCount, vertCount + 1, vertCount + 2); vertCount += 3;
            }
          }
          continue;
        }

        // STALAGMITE: grows from floor, wide at bottom, narrow at top pointing UP
        if (blockId === BlockId.NETHER_STALAGMITE) {
          const cr = 0.42, cg = 0.17, cb = 0.11;
          let belowCount = 0; for (let k = 1; k <= 8; k++) { if (y - k < 0) break; if (getBlockAtWorld(ox + x, y - k, oz + z) !== blockId) break; belowCount++; }
          let aboveCount = 0; for (let k = 1; k <= 8; k++) { if (y + k >= WORLD_HEIGHT) break; if (getBlockAtWorld(ox + x, y + k, oz + z) !== blockId) break; aboveCount++; }
          const colLen = belowCount + aboveCount + 1; const idxFromBase = belowCount;
          const maxR = 0.28, minR = 0.03; const n = Math.max(1, colLen);
          const bottomFrac = idxFromBase / n; const topFrac = (idxFromBase + 1) / n; const span = (maxR - minR);
          let rBottom = maxR - bottomFrac * span; let rTop = maxR - topFrac * span;
          const isTipBlock = (idxFromBase === colLen - 1);
          let apexOffset = 0; let enableApex = false;
          if (isTipBlock) {
            const aboveIsAir = (y + 1 < WORLD_HEIGHT) ? (getBlockAtWorld(ox + x, y + 1, oz + z) === BlockId.AIR) : false;
            if (aboveIsAir) { rTop = Math.max(minR * 0.4, rTop * 0.25); apexOffset = Math.min(0.28, 0.06 * colLen + 0.08); enableApex = true; }
          }
          const cx0 = ox + x + 0.5, cz0 = oz + z + 0.5; const yBot = y + 0.0; const yTop = y + 1.0; const sides = 8;
          for (let s = 0; s < sides; s++) {
            const a0 = (s / sides) * Math.PI * 2; const a1 = ((s + 1) / sides) * Math.PI * 2; const cos0 = Math.cos(a0), sin0 = Math.sin(a0); const cos1 = Math.cos(a1), sin1 = Math.sin(a1);
            const shade = 0.75 + (s % 2) * 0.12;
            const topYForFace = enableApex ? (yTop + apexOffset) : yTop; const topRForFace = enableApex ? 0.0 : rTop;
            pushQuad([cx0 + Math.cos(a0) * rBottom, yBot, cz0 + Math.sin(a0) * rBottom], [cx0 + Math.cos(a1) * rBottom, yBot, cz0 + Math.sin(a1) * rBottom], [cx0 + Math.cos(a1) * topRForFace, topYForFace, cz0 + Math.sin(a1) * topRForFace], [cx0 + Math.cos(a0) * topRForFace, topYForFace, cz0 + Math.sin(a0) * topRForFace], { r: cr * shade, g: cg * shade, b: cb * shade }, 1.0, 1.0, x, y, z, 0, blAdd, oreMarker);
          }
          if (enableApex) {
            const apexY = yTop + apexOffset;
            for (let s = 0; s < sides; s++) {
              const a0 = (s / sides) * Math.PI * 2; const a1 = ((s + 1) / sides) * Math.PI * 2;
              const v0 = [cx0 + Math.cos(a0) * 0.0001, yTop, cz0 + Math.sin(a0) * 0.0001]; const v1 = [cx0 + Math.cos(a1) * 0.0001, yTop, cz0 + Math.sin(a1) * 0.0001];
              positions.push(v0[0], v0[1], v0[2]); colors.push(cr * 0.9, cg * 0.9, cb * 0.9); brightness.push(1.0); alphas.push(1.0);
              positions.push(v1[0], v1[1], v1[2]); colors.push(cr * 0.9, cg * 0.9, cb * 0.9); brightness.push(1.0); alphas.push(1.0);
              positions.push(cx0, apexY, cz0); colors.push(cr * 0.9, cg * 0.9, cb * 0.9); brightness.push(1.0); alphas.push(1.0);
              indices.push(vertCount, vertCount + 1, vertCount + 2); vertCount += 3;
            }
          }
          continue;
        }

        for (let fi = 0; fi < FACES.length; fi++) {
          const face = FACES[fi];
          const nx = x + face.dir[0];
          const ny = y + face.dir[1];
          const nz = z + face.dir[2];
          const neighbor = getBlockAtWorld(ox + nx, ny, oz + nz);
          const isTransparentNeighbor = TRANSPARENT_BLOCKS.has(neighbor);
          if (!isTransparentNeighbor) continue;

          // Build world-space verts for this face
          const v0 = face.verts[0]; const v1 = face.verts[1]; const v2 = face.verts[2]; const v3 = face.verts[3];
          const c0: [number, number, number] = [ox + x + v0[0], y + v0[1], oz + z + v0[2]];
          const c1: [number, number, number] = [ox + x + v1[0], y + v1[1], oz + z + v1[2]];
          const c2: [number, number, number] = [ox + x + v2[0], y + v2[1], oz + z + v2[2]];
          const c3: [number, number, number] = [ox + x + v3[0], y + v3[1], oz + z + v3[2]];

          if (blockId === BlockId.WINDOW_OPEN || blockId === BlockId.DOOR_OPEN) {
            continue;
          }

          // Special-case: WINDOW / DOOR should render a wooden frame outline with a transparent center
          if (blockId === BlockId.WINDOW || blockId === BlockId.DOOR) {
            const frameColor = (blockId === BlockId.WINDOW) ? (BLOCK_COLORS[BlockId.PLANK] ?? bc) : bc;
            const t = 0.16; // frame thickness
            const rects = [
              { u0: 0, u1: 1, v0: 1 - t, v1: 1 }, // top
              { u0: 0, u1: 1, v0: 0, v1: t },     // bottom
              { u0: 0, u1: t, v0: t, v1: 1 - t }, // left
              { u0: 1 - t, u1: 1, v0: t, v1: 1 - t } // right
            ];

            const edgeU = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
            const edgeV = [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]];

            let rectIndex = 0;
            for (const r of rects) {
              const p00 = [c0[0] + edgeU[0] * r.u0 + edgeV[0] * r.v0, c0[1] + edgeU[1] * r.u0 + edgeV[1] * r.v0, c0[2] + edgeU[2] * r.u0 + edgeV[2] * r.v0];
              const p10 = [c0[0] + edgeU[0] * r.u1 + edgeV[0] * r.v0, c0[1] + edgeU[1] * r.u1 + edgeV[1] * r.v0, c0[2] + edgeU[2] * r.u1 + edgeV[2] * r.v0];
              const p11 = [c0[0] + edgeU[0] * r.u1 + edgeV[0] * r.v1, c0[1] + edgeU[1] * r.u1 + edgeV[1] * r.v1, c0[2] + edgeU[2] * r.u1 + edgeV[2] * r.v1];
              const p01 = [c0[0] + edgeU[0] * r.u0 + edgeV[0] * r.v1, c0[1] + edgeU[1] * r.u0 + edgeV[1] * r.v1, c0[2] + edgeU[2] * r.u0 + edgeV[2] * r.v1];

              const cr = frameColor.r; const cg = frameColor.g; const cb = frameColor.b;
              const quadVerts = [p00, p10, p11, p01];
              for (let qvi = 0; qvi < 4; qvi++) {
                const pv = quadVerts[qvi];
                const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (rectIndex * 13 + qvi)) >>> 0);
                const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                const jitter = 0.96 + rnd * 0.08;
                positions.push(pv[0], pv[1], pv[2]);
                colors.push(cr * jitter, cg * jitter, cb * jitter);
                brightness.push(face.brightness * (0.9 + rnd * 0.1));
                alphas.push(1.0);
              }
              indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
              vertCount += 4;
              rectIndex++;
            }
            // Damage overlay for window/door faces
            tryPushDamageOverlay(c0, c1, c2, c3, face, x, y, z, blockId);
            continue; // next face
          }

          // Special-case: LEAVES (and amethyst/stone/brick/castle) render as a grid of small squares
          if (blockId === BlockId.LEAVES || blockId === BlockId.AMETHYST_BRICK || blockId === BlockId.STONE_BRICK || blockId === BlockId.BRICK || blockId === BlockId.CASTLE_BRICK) {
            const isAmethystBrick = blockId === BlockId.AMETHYST_BRICK;
            const isStoneBrick = blockId === BlockId.STONE_BRICK;
            const isBrick = blockId === BlockId.BRICK;
            const isCastleBrick = blockId === BlockId.CASTLE_BRICK;
            const gridSize = 2; // 2x2 = 4 squares per face
            const cellSize = 1 / gridSize;
            const baseColor = bc;
            const biome = (biomeColumn && biomeColumn.length === CS * CS) ? biomeColumn[z * CS + x] : BiomeId.UNKNOWN;
            const lt = isAmethystBrick || isStoneBrick || isBrick || isCastleBrick ? { tint: null, blend: 0 } : getLeafTint(biome);

            const edgeU = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
            const edgeV = [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]];

            for (let gy = 0; gy < gridSize; gy++) {
              for (let gx = 0; gx < gridSize; gx++) {
                const u0 = gx * cellSize;
                const v0 = gy * cellSize;
                const u1 = u0 + cellSize;
                const v1 = v0 + cellSize;

                const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy)) >>> 0);
                const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;

                const isTransparent = false;
                const shade = 0.7 + rnd * 0.5;

                const baseBlend = lt.blend || 0;
                const cellBlend = lt.tint ? Math.min(1, baseBlend * (0.6 + rnd * 0.8)) : 0;
                const mixedR = lt.tint ? (baseColor.r * (1 - cellBlend) + lt.tint.r * cellBlend) : baseColor.r;
                const mixedG = lt.tint ? (baseColor.g * (1 - cellBlend) + lt.tint.g * cellBlend) : baseColor.g;
                const mixedB = lt.tint ? (baseColor.b * (1 - cellBlend) + lt.tint.b * cellBlend) : baseColor.b;

                const cr = mixedR * shade;
                const cg = mixedG * shade;
                const cb = mixedB * shade;
                const alpha = isTransparent ? 0.0 : 1.0;
                const brightMult = isTransparent ? 0.3 : 1.0;

                const verts = [
                  [c0[0] + edgeU[0] * u0 + edgeV[0] * v0, c0[1] + edgeU[1] * u0 + edgeV[1] * v0, c0[2] + edgeU[2] * u0 + edgeV[2] * v0],
                  [c0[0] + edgeU[0] * u1 + edgeV[0] * v0, c0[1] + edgeU[1] * u1 + edgeV[1] * v0, c0[2] + edgeU[2] * u1 + edgeV[2] * v0],
                  [c0[0] + edgeU[0] * u1 + edgeV[0] * v1, c0[1] + edgeU[1] * u1 + edgeV[1] * v1, c0[2] + edgeU[2] * u1 + edgeV[2] * v1],
                  [c0[0] + edgeU[0] * u0 + edgeV[0] * v1, c0[1] + edgeU[1] * u0 + edgeV[1] * v1, c0[2] + edgeU[2] * u0 + edgeV[2] * v1],
                ];

                for (let vi = 0; vi < 4; vi++) {
                  const pv = verts[vi];
                  const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy + vi * 31)) >>> 0);
                  const vrnd = (((vseed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                  const vshade = 0.85 + vrnd * 0.2;
                  positions.push(pv[0], pv[1], pv[2]);
                  colors.push(cr * vshade, cg * vshade, cb * vshade);
                  brightness.push(face.brightness * (0.85 + vrnd * 0.15) * brightMult);
                  alphas.push(alpha);
                }
                indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                vertCount += 4;
              }
            }
            // Damage overlay for leaves-like faces
            tryPushDamageOverlay(c0, c1, c2, c3, face, x, y, z, blockId);
            continue;
          }

          // Special-case: GRASS block - solid colours and top grass detail
          if (blockId === BlockId.GRASS) {
            const isTop = fi === 0;
            const isBottom = fi === 1;
            if (isTop) {
              const gridSize = lowEndMode ? 1 : 2;
              const cellSize = 1 / gridSize;
              const grassColors = [
                { r: .30, g: .65, b: .20 },
                { r: .35, g: .70, b: .25 },
                { r: .25, g: .55, b: .15 },
              ];

              const edgeU = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
              const edgeV = [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]];

              for (let gy = 0; gy < gridSize; gy++) {
                for (let gx = 0; gx < gridSize; gx++) {
                  const u0 = gx * cellSize;
                  const v0 = gy * cellSize;
                  const u1 = u0 + cellSize;
                  const v1 = v0 + cellSize;

                  const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (gx * 97 + gy)) >>> 0);
                  const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                  const colorIdx = Math.floor(rnd * 3) % 3;
                  const baseColor = grassColors[colorIdx];
                  const shade = 0.85 + rnd * 0.25;

                  const verts = [
                    [c0[0] + edgeU[0] * u0 + edgeV[0] * v0, c0[1] + edgeU[1] * u0 + edgeV[1] * v0, c0[2] + edgeU[2] * u0 + edgeV[2] * v0],
                    [c0[0] + edgeU[0] * u1 + edgeV[0] * v0, c0[1] + edgeU[1] * u1 + edgeV[1] * v0, c0[2] + edgeU[2] * u1 + edgeV[2] * v0],
                    [c0[0] + edgeU[0] * u1 + edgeV[0] * v1, c0[1] + edgeU[1] * u1 + edgeV[1] * v1, c0[2] + edgeU[2] * u1 + edgeV[2] * v1],
                    [c0[0] + edgeU[0] * u0 + edgeV[0] * v1, c0[1] + edgeU[1] * u0 + edgeV[1] * v1, c0[2] + edgeU[2] * u0 + edgeV[2] * v1],
                  ];

                  for (let vi = 0; vi < 4; vi++) {
                    const pv = verts[vi];
                    const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (gx * 97 + gy + vi * 31)) >>> 0);
                    const vrnd = (((vseed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                    const vshade = shade * (0.9 + vrnd * 0.15);
                    positions.push(pv[0], pv[1], pv[2]);
                    colors.push(baseColor.r * vshade, baseColor.g * vshade, baseColor.b * vshade);
                    brightness.push(face.brightness * (0.95 + vrnd * 0.1));
                    alphas.push(1.0);
                  }
                  indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                  vertCount += 4;
                }
              }
              // After top grass-detail quads, add damage overlay
              tryPushDamageOverlay(c0, c1, c2, c3, face, x, y, z, blockId);
            } else if (!isBottom) {
              const baseColor = { r: .55, g: .36, b: .24 };
              const shade = 0.85;
              for (let vi = 0; vi < 4; vi++) {
                const v = face.verts[vi];
                positions.push(ox + x + v[0], y + v[1], oz + z + v[2]);
                colors.push(baseColor.r * shade, baseColor.g * shade, baseColor.b * shade);
                brightness.push(face.brightness);
                alphas.push(1.0);
              }
              indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
              vertCount += 4;
              tryPushDamageOverlay(c0, c1, c2, c3, face, x, y, z, blockId);
            } else {
              const baseColor = { r: .55, g: .36, b: .24 };
              const shade = 0.75;
              for (let vi = 0; vi < 4; vi++) {
                const v = face.verts[vi];
                positions.push(ox + x + v[0], y + v[1], oz + z + v[2]);
                colors.push(baseColor.r * shade, baseColor.g * shade, baseColor.b * shade);
                brightness.push(face.brightness);
                alphas.push(1.0);
              }
              indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
              vertCount += 4;
              tryPushDamageOverlay(c0, c1, c2, c3, face, x, y, z, blockId);
            }
            continue;
          }

          // Default quad (simple solid face)
          pushQuad(c0, c1, c2, c3, { r: bc.r, g: bc.g, b: bc.b }, face.brightness, 1.0, x, y, z, fi, blAdd, oreMarker);
          // Damage overlay for default faces
          tryPushDamageOverlay(c0, c1, c2, c3, face, x, y, z, blockId);
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
          if (nb === BlockId.WATER) {
            if (fi === 0) continue;
            const nbWorldX = ox + nx;
            const nbWorldZ = oz + nz;
            const nbH = fluidSurfaceHeight(
              getFluidLevelAtWorld(nbWorldX, ny, nbWorldZ),
              isFluidSourceAtWorld(nbWorldX, ny, nbWorldZ),
              getBlockAtWorld(nbWorldX, ny + 1, nbWorldZ) === BlockId.WATER
            );
            if (h <= nbH + 0.025) continue;
          }
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
          if (nb === BlockId.LAVA) {
            if (fi === 0) continue;
            const nbWorldX = ox + nx;
            const nbWorldZ = oz + nz;
            const nbH = fluidSurfaceHeight(
              getFluidLevelAtWorld(nbWorldX, ny, nbWorldZ),
              isFluidSourceAtWorld(nbWorldX, ny, nbWorldZ),
              getBlockAtWorld(nbWorldX, ny + 1, nbWorldZ) === BlockId.LAVA
            );
            if (h <= nbH + 0.025) continue;
          }
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
