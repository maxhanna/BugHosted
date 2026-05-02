import { BlockId, BLOCK_COLORS, CHUNK_SIZE, WORLD_HEIGHT, getBlockHealth } from './digcraft-types';
import { BiomeId } from './digcraft-biome';

// NOTE: previous simple lighting function (no expensive neighborhood cache).

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
        
        // Special-case: CACTUS rendered as a thin solid column (slim cube)
        if (blockId === BlockId.CACTUS) {
          const inset = 0.18;
          const minX = ox + x + inset, maxX = ox + x + 1 - inset;
          const minZ = oz + z + inset, maxZ = oz + z + 1 - inset;
          const y0 = y, y1 = y + 1;
          // top
          pushQuad([minX, y1, minZ], [maxX, y1, minZ], [maxX, y1, maxZ], [minX, y1, maxZ], { r: bc.r, g: bc.g, b: bc.b }, 1.0, 1.0, x, y, z, 0, blAdd, oreMarker);
          // bottom
          pushQuad([minX, y0, maxZ], [maxX, y0, maxZ], [maxX, y0, minZ], [minX, y0, minZ], { r: bc.r * 0.8, g: bc.g * 0.8, b: bc.b * 0.8 }, 0.5, 1.0, x, y, z, 1, blAdd, oreMarker);
          // sides
          pushQuad([maxX, y0, minZ], [maxX, y1, minZ], [maxX, y1, maxZ], [maxX, y0, maxZ], { r: bc.r, g: bc.g, b: bc.b }, 0.7, 1.0, x, y, z, 2, blAdd, oreMarker);
          pushQuad([minX, y0, maxZ], [minX, y1, maxZ], [minX, y1, minZ], [minX, y0, minZ], { r: bc.r, g: bc.g, b: bc.b }, 0.7, 1.0, x, y, z, 3, blAdd, oreMarker);
          pushQuad([minX, y0, minZ], [maxX, y0, minZ], [maxX, y1, minZ], [minX, y1, minZ], { r: bc.r, g: bc.g, b: bc.b }, 0.8, 1.0, x, y, z, 4, blAdd, oreMarker);
          pushQuad([maxX, y0, maxZ], [minX, y0, maxZ], [minX, y1, maxZ], [maxX, y1, maxZ], { r: bc.r, g: bc.g, b: bc.b }, 0.8, 1.0, x, y, z, 5, blAdd, oreMarker);
          // Damage overlay (approximate) — apply to one face
          tryPushDamageOverlay([minX, y1, minZ], [maxX, y1, minZ], [maxX, y1, maxZ], [minX, y1, maxZ], FACES[0], x, y, z, blockId);
          continue;
        }

        // Special-case: BAMBOO — render as crossed quads (like plants)
        if (blockId === BlockId.BAMBOO) {
          // Only draw plant geometry if at least one neighbor face is visible
          const checkNeighborTransparent = (dx: number, dy: number, dz: number) => {
            const n = getBlockAtWorld(ox + x + dx, y + dy, oz + z + dz);
            return n === BlockId.AIR || n === BlockId.WATER || n === BlockId.LEAVES
              || n === BlockId.GLASS || n === BlockId.WINDOW_OPEN || n === BlockId.DOOR_OPEN
              || n === BlockId.TALLGRASS || n === BlockId.CHEST || n === BlockId.BONFIRE
              || n === BlockId.SEAWEED || n === BlockId.TORCH || n === BlockId.CAULDRON
              || n === BlockId.CAULDRON_LAVA || n === BlockId.CAULDRON_WATER
              || n === BlockId.NETHER_STALACTITE || n === BlockId.NETHER_STALAGMITE
              || (n === BlockId.LAVA && !lowEndMode) || (n === BlockId.BAMBOO);
          };
          let visible = false;
          for (const f of FACES) {
            if (checkNeighborTransparent(f.dir[0], f.dir[1], f.dir[2])) { visible = true; break; }
          }
          if (!visible) continue;

          // two crossed quads (diagonals)
          const pA0: [number, number, number] = [ox + x + 0.0, y + 0, oz + z + 0.0];
          const pA1: [number, number, number] = [ox + x + 1.0, y + 0, oz + z + 1.0];
          const pA2: [number, number, number] = [ox + x + 1.0, y + 1, oz + z + 1.0];
          const pA3: [number, number, number] = [ox + x + 0.0, y + 1, oz + z + 0.0];

          const pB0: [number, number, number] = [ox + x + 1.0, y + 0, oz + z + 0.0];
          const pB1: [number, number, number] = [ox + x + 0.0, y + 0, oz + z + 1.0];
          const pB2: [number, number, number] = [ox + x + 0.0, y + 1, oz + z + 1.0];
          const pB3: [number, number, number] = [ox + x + 1.0, y + 1, oz + z + 0.0];

          // Tint leaves by biome
          const biome = (biomeColumn && biomeColumn.length === CS * CS) ? biomeColumn[z * CS + x] : BiomeId.UNKNOWN;
          const lt = getLeafTint(biome);
          const baseColor = bc;
          const blend = lt.blend || 0;
          const tint = lt.tint;
          const mix = (c: number, t: number | null) => t ? (c * (1 - blend) + t * blend) : c;
          const cr = tint ? mix(baseColor.r, tint.r) : baseColor.r;
          const cg = tint ? mix(baseColor.g, tint.g) : baseColor.g;
          const cb = tint ? mix(baseColor.b, tint.b) : baseColor.b;

          pushQuad(pA0, pA1, pA2, pA3, { r: cr, g: cg, b: cb }, 0.95, 1.0, x, y, z, 0, blAdd, oreMarker);
          pushQuad(pB0, pB1, pB2, pB3, { r: cr, g: cg, b: cb }, 0.95, 1.0, x, y, z, 1, blAdd, oreMarker);
          continue;
        }

        for (let fi = 0; fi < FACES.length; fi++) {
          const face = FACES[fi];
          const nx = x + face.dir[0];
          const ny = y + face.dir[1];
          const nz = z + face.dir[2];
          const neighbor = getBlockAtWorld(ox + nx, ny, oz + nz);
          const isTransparentNeighbor = neighbor === BlockId.AIR || neighbor === BlockId.WATER || neighbor === BlockId.LEAVES
            || neighbor === BlockId.GLASS
            || neighbor === BlockId.WINDOW_OPEN
            || neighbor === BlockId.DOOR_OPEN
            || neighbor === BlockId.TALLGRASS
            || neighbor === BlockId.CHEST
            || neighbor === BlockId.BONFIRE
            || neighbor === BlockId.SEAWEED
            || neighbor === BlockId.TORCH
            || neighbor === BlockId.CAULDRON || neighbor === BlockId.CAULDRON_LAVA || neighbor === BlockId.CAULDRON_WATER
            || neighbor === BlockId.NETHER_STALACTITE || neighbor === BlockId.NETHER_STALAGMITE
            || (neighbor === BlockId.LAVA && !lowEndMode)
            || neighbor === BlockId.BAMBOO;
          if (!isTransparentNeighbor) continue;

          // Build world-space verts for this face
          const v0 = face.verts[0]; const v1 = face.verts[1]; const v2 = face.verts[2]; const v3 = face.verts[3];
          const c0: [number, number, number] = [ox + x + v0[0], y + v0[1], oz + z + v0[2]];
          const c1: [number, number, number] = [ox + x + v1[0], y + v1[1], oz + z + v1[2]];
          const c2: [number, number, number] = [ox + x + v2[0], y + v2[1], oz + z + v2[2]];
          const c3: [number, number, number] = [ox + x + v3[0], y + v3[1], oz + z + v3[2]];

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

          // Special-case: LEAVES (and amethyst/stone/brick) render as a grid of small squares
          if (blockId === BlockId.LEAVES || blockId === BlockId.AMETHYST_BRICK || blockId === BlockId.STONE_BRICK || blockId === BlockId.BRICK) {
            const isAmethystBrick = blockId === BlockId.AMETHYST_BRICK;
            const isStoneBrick = blockId === BlockId.STONE_BRICK;
            const isBrick = blockId === BlockId.BRICK;
            const gridSize = 2; // 2x2 = 4 squares per face
            const cellSize = 1 / gridSize;
            const baseColor = bc;
            const biome = (biomeColumn && biomeColumn.length === CS * CS) ? biomeColumn[z * CS + x] : BiomeId.UNKNOWN;
            const lt = isAmethystBrick || isStoneBrick || isBrick ? { tint: null, blend: 0 } : getLeafTint(biome);

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
