/**
 * Procedural world generation using seed-based simplex-like noise.
 * Generates 16×WORLD_HEIGHT×16 chunks with terrain, ores, trees, caves, and Nether.
 *
 * Y layout (unified, single chunk):
 *   y = 0  .. NETHER_TOP-1  → Nether (netherrack, lava, caverns, stalactites)
 *   y = NETHER_TOP           → Netherrack transition floor (breakable)
 *   y = NETHER_TOP+1 .. top  → Overworld (terrain, biomes, ores, trees)
 *
 * NETHER_TOP = 128  (matches NETHER_DEPTH constant)
 */
import { BlockId, CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, NETHER_DEPTH, DCBlockChange, getBlockHealth } from './digcraft-types';
import { sampleTerrainColumn, surfaceBlockForBiome, treeNoiseThreshold, BiomeId } from './digcraft-biome';

// ── NETHER_TOP: the Y level that separates Nether (below) from Overworld (above) ──
export const NETHER_TOP = NETHER_DEPTH; // 128

/** Seeded PRNG (mulberry32) */
function mulberry32(seed: number): () => number {
  return (): number => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Simple 2D value noise [0,1) */
function noise2D(seed: number, x: number, z: number, scale: number): number {
  const sx = Math.floor(x / scale);
  const sz = Math.floor(z / scale);
  const fx = (x / scale) - sx;
  const fz = (z / scale) - sz;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const sfx = smooth(fx), sfz = smooth(fz);
  const hash = (ix: number, iz: number) => {
    let h = ((ix * 374761393 + iz * 668265263 + seed * 1274126177) & 0x7fffffff);
    h = ((h ^ (h >> 13)) * 1103515245 + 12345) & 0x7fffffff;
    return (h & 0xffff) / 65536;
  };
  const v00 = hash(sx, sz), v10 = hash(sx + 1, sz);
  const v01 = hash(sx, sz + 1), v11 = hash(sx + 1, sz + 1);
  return (v00 + (v10 - v00) * sfx) + ((v01 + (v11 - v01) * sfx) - (v00 + (v10 - v00) * sfx)) * sfz;
}

/** 3D value noise [0,1) */
function noise3D(seed: number, x: number, y: number, z: number, scale: number): number {
  const sx = Math.floor(x / scale), sy = Math.floor(y / scale), sz = Math.floor(z / scale);
  const fx = (x / scale) - sx, fy = (y / scale) - sy, fz = (z / scale) - sz;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const sfx = smooth(fx), sfy = smooth(fy), sfz = smooth(fz);
  const hash = (ix: number, iy: number, iz: number) => {
    let h = ((ix * 374761393 + iy * 668265263 + iz * 1274126177 + seed * 285283) & 0x7fffffff);
    h = ((h ^ (h >> 13)) * 1103515245 + 12345) & 0x7fffffff;
    return (h & 0xffff) / 65536;
  };
  const v000 = hash(sx,sy,sz),     v100 = hash(sx+1,sy,sz);
  const v010 = hash(sx,sy+1,sz),   v110 = hash(sx+1,sy+1,sz);
  const v001 = hash(sx,sy,sz+1),   v101 = hash(sx+1,sy,sz+1);
  const v011 = hash(sx,sy+1,sz+1), v111 = hash(sx+1,sy+1,sz+1);
  const a0 = v000 + (v100-v000)*sfx, b0 = v010 + (v110-v010)*sfx, c0 = a0 + (b0-a0)*sfy;
  const a1 = v001 + (v101-v001)*sfx, b1 = v011 + (v111-v011)*sfx, c1 = a1 + (b1-a1)*sfy;
  return c0 + (c1-c0)*sfz;
}

/** One chunk of block data */
export class Chunk {
  blocks: Uint8Array;
  blockHealth: Uint8Array;
  waterLevel: Uint8Array;
  biomeColumn: Uint8Array;
  cx: number;
  cz: number;

  constructor(cx: number, cz: number) {
    this.cx = cx; this.cz = cz;
    this.blocks      = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    this.blockHealth = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    this.waterLevel  = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    this.biomeColumn = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  }

  private idx(x: number, y: number, z: number): number { return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x; }
  private colIdx(x: number, z: number): number { return z * CHUNK_SIZE + x; }

  getBiome(x: number, z: number): number {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return BiomeId.UNKNOWN;
    return this.biomeColumn[this.colIdx(x, z)];
  }
  setBiome(x: number, z: number, biomeId: number): void {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return;
    this.biomeColumn[this.colIdx(x, z)] = biomeId & 0xff;
  }
  getBlock(x: number, y: number, z: number): number {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) return BlockId.AIR;
    return this.blocks[this.idx(x, y, z)];
  }
  setBlock(x: number, y: number, z: number, id: number, health?: number, wl?: number): void {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) return;
    const i = this.idx(x, y, z);
    this.blocks[i] = id;
    this.waterLevel[i] = (id === BlockId.WATER) ? (wl !== undefined ? Math.max(1, Math.min(8, wl)) : 8) : 0;
    if (health !== undefined) { this.blockHealth[i] = health; }
    else if (id === BlockId.AIR) { this.blockHealth[i] = 0; }
    else { const mh = getBlockHealth(id); this.blockHealth[i] = mh > 0 ? mh : 0; }
  }
  getWaterLevel(x: number, y: number, z: number): number {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) return 0;
    return this.waterLevel[this.idx(x, y, z)];
  }
  setWaterLevel(x: number, y: number, z: number, level: number): void {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) return;
    const i = this.idx(x, y, z);
    if (this.blocks[i] !== BlockId.WATER) return;
    this.waterLevel[i] = Math.max(1, Math.min(8, level));
  }
  getBlockHealth(x: number, y: number, z: number): number {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) return 0;
    return this.blockHealth[this.idx(x, y, z)];
  }
  setBlockHealth(x: number, y: number, z: number, health: number): void {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) return;
    this.blockHealth[this.idx(x, y, z)] = health;
  }
  damageBlock(x: number, y: number, z: number, amount: number): number {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) return 0;
    const i = this.idx(x, y, z);
    const cur = this.blockHealth[i];
    if (cur <= 0) return 0;
    const rem = Math.max(0, cur - amount);
    this.blockHealth[i] = rem;
    return rem;
  }
}

/** Generate a single unified chunk containing both Nether (y<NETHER_TOP) and Overworld (y>=NETHER_TOP). */
export function generateChunk(seed: number, cx: number, cz: number): Chunk {
  const chunk = new Chunk(cx, cz);
  const rng = mulberry32(seed ^ (cx * 73856093) ^ (cz * 19349669));
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const NT = NETHER_TOP; // 128 — boundary between Nether and Overworld

  // ════════════════════════════════════════════════════════
  // NETHER REGION  (y = 0 .. NT-1)
  // ════════════════════════════════════════════════════════
  const netherSeed = (seed ^ 0x9E3779B1) >>> 0;

  // 1) Fill Nether solid: bedrock at y=0 (floor), netherrack everywhere else
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let y = 0; y < NT; y++) {
        chunk.setBlock(lx, y, lz, y === 0 ? BlockId.BEDROCK : y === 1 ? BlockId.LAVA : BlockId.NETHERRACK);
      }
    }
  }

  // 2) Carve Nether caverns — two overlapping noise passes for roomy halls
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = ox + lx, wz = oz + lz;
      for (let y = 2; y < NT - 2; y++) {
        const a = noise3D(netherSeed + 30000, wx, y, wz, 22);
        const b = noise3D(netherSeed + 31000, wx, y, wz, 11);
        if ((a > 0.60 && b > 0.42) || a > 0.76) {
          chunk.setBlock(lx, y, lz, BlockId.AIR);
        }
      }
    }
  }

  // 3) Lava seas in the lower third of the Nether
  const lavaSeaTop = Math.floor(NT * 0.72);
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = ox + lx, wz = oz + lz;
      const lavaMask = noise2D(netherSeed + 40000, wx, wz, 32);
      if (lavaMask > 0.55) {
        const extra = Math.floor(noise2D(netherSeed + 41000, wx, wz, 10) * 12);
        const topLava = Math.min(lavaSeaTop, Math.max(NT - 20, lavaSeaTop - 10 + extra));
        for (let y = NT - 2; y >= topLava; y--) {
          const cur = chunk.getBlock(lx, y, lz);
          if (cur === BlockId.AIR || cur === BlockId.NETHERRACK) chunk.setBlock(lx, y, lz, BlockId.LAVA);
        }
      }
    }
  }

  // 4) Basalt delta patches
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = ox + lx, wz = oz + lz;
      if (noise2D(netherSeed + 45000, wx, wz, 20) > 0.76) {
        for (let y = Math.floor(NT * 0.15); y < Math.floor(NT * 0.85); y++) {
          if (chunk.getBlock(lx, y, lz) === BlockId.NETHERRACK && rng() > 0.45)
            chunk.setBlock(lx, y, lz, BlockId.BASALT);
        }
      }
    }
  }

  // 5) Netherite ore veins
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = ox + lx, wz = oz + lz;
      for (let y = 8; y < NT - 8; y++) {
        if (chunk.getBlock(lx, y, lz) !== BlockId.NETHERRACK) continue;
        if (noise3D(netherSeed + 52000, wx, y, wz, 6) > 0.83) chunk.setBlock(lx, y, lz, BlockId.NETHERITE_ROCK);
      }
    }
  }

  // 6) Stalactites (hang from ceiling) and stalagmites (grow from floor)
  for (let lx = 1; lx < CHUNK_SIZE - 1; lx++) {
    for (let lz = 1; lz < CHUNK_SIZE - 1; lz++) {
      const wx = ox + lx, wz = oz + lz;
      const stalN = noise2D(netherSeed + 60000, wx, wz, 8);
      const stagN = noise2D(netherSeed + 61000, wx, wz, 8);
      for (let y = 3; y < NT - 3; y++) {
        if (chunk.getBlock(lx, y, lz) !== BlockId.AIR) continue;
        const above = chunk.getBlock(lx, y + 1, lz);
        if ((above === BlockId.NETHERRACK || above === BlockId.BASALT) && stalN > 0.72) {
          const len = 1 + Math.floor(rng() * 5);
          for (let k = 0; k < len; k++) {
            if (y - k <= 1 || chunk.getBlock(lx, y - k, lz) !== BlockId.AIR) break;
            chunk.setBlock(lx, y - k, lz, BlockId.NETHER_STALACTITE);
          }
        }
        const below = chunk.getBlock(lx, y - 1, lz);
        if ((below === BlockId.NETHERRACK || below === BlockId.BASALT) && stagN > 0.72) {
          const len = 1 + Math.floor(rng() * 5);
          for (let k = 0; k < len; k++) {
            if (y + k >= NT - 2 || chunk.getBlock(lx, y + k, lz) !== BlockId.AIR) break;
            chunk.setBlock(lx, y + k, lz, BlockId.NETHER_STALAGMITE);
          }
        }
      }
    }
  }

  // 7) Nether ceiling: one layer of breakable netherrack at y=NT-1 (players dig through to enter Nether)
  //    and y=NT is the first overworld layer — set to NETHERRACK so it's clearly the boundary
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      chunk.setBlock(lx, NT - 1, lz, BlockId.NETHERRACK); // breakable ceiling
      chunk.setBlock(lx, NT,     lz, BlockId.NETHERRACK); // overworld floor above Nether
    }
  }

  // ════════════════════════════════════════════════════════
  // OVERWORLD REGION  (y = NT+1 .. WORLD_HEIGHT-1)
  // ════════════════════════════════════════════════════════

  // 8) Terrain height + biome
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const worldX = ox + lx, worldZ = oz + lz;
      const col = sampleTerrainColumn(seed, worldX, worldZ);
      // Shift terrain up so it sits above the Nether region
      const height = col.height + NT + 1;
      chunk.setBiome(lx, lz, col.biome);
      const surfaceId = surfaceBlockForBiome(col.biome);

      for (let y = NT + 1; y < WORLD_HEIGHT; y++) {
        if (y < height - 4) {
          chunk.setBlock(lx, y, lz, col.height > SEA_LEVEL + 25 ? BlockId.STONE_SNOW : BlockId.STONE);
        } else if (y < height) {
          chunk.setBlock(lx, y, lz, col.height > SEA_LEVEL + 20 ? BlockId.STONE_SNOW : BlockId.DIRT);
        } else if (y === height) {
          if (col.height > SEA_LEVEL + 20)      chunk.setBlock(lx, y, lz, BlockId.STONE_SNOW);
          else if (col.height < SEA_LEVEL)       chunk.setBlock(lx, y, lz, BlockId.SAND);
          else                                   chunk.setBlock(lx, y, lz, surfaceId);
        } else if (y <= NT + 1 + SEA_LEVEL && col.height < SEA_LEVEL) {
          chunk.setBlock(lx, y, lz, BlockId.WATER);
        }
      }
    }
  }

  // 9) Ores (in overworld stone layer)
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = ox + lx, wz = oz + lz;
      for (let y = NT + 1; y < NT + 50; y++) {
        if (chunk.getBlock(lx, y, lz) !== BlockId.STONE) continue;
        const v = noise3D(seed + 5000, wx, y, wz, 6);
        if (v > 0.82)                    chunk.setBlock(lx, y, lz, BlockId.COAL_ORE);
        else if (v > 0.78 && y < NT+40) chunk.setBlock(lx, y, lz, BlockId.IRON_ORE);
        else if (v > 0.76 && y < NT+30) chunk.setBlock(lx, y, lz, BlockId.GOLD_ORE);
        else if (v > 0.75 && y < NT+16) chunk.setBlock(lx, y, lz, BlockId.DIAMOND_ORE);
      }
    }
  }

  // 10) Overworld caves
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = ox + lx, wz = oz + lz;
      for (let y = NT + 2; y < NT + 45; y++) {
        const cv = noise3D(seed + 9000, wx, y, wz, 10);
        if (cv > 0.72 && chunk.getBlock(lx, y, lz) !== BlockId.BEDROCK)
          chunk.setBlock(lx, y, lz, BlockId.AIR);
      }
    }
  }

  // 11) Trees
  for (let lx = 2; lx < CHUNK_SIZE - 2; lx++) {
    for (let lz = 2; lz < CHUNK_SIZE - 2; lz++) {
      const biome = chunk.getBiome(lx, lz);
      const treeTh = treeNoiseThreshold(biome);
      if (treeTh <= 0 || rng() > treeTh) continue;
      let surfaceY = -1;
      for (let y = WORLD_HEIGHT - 1; y > NT + SEA_LEVEL; y--) {
        if (chunk.getBlock(lx, y, lz) === BlockId.GRASS) { surfaceY = y; break; }
      }
      if (surfaceY < 0) continue;
      const trunkH = 4 + Math.floor(rng() * 3);
      for (let ty = 1; ty <= trunkH; ty++) chunk.setBlock(lx, surfaceY + ty, lz, BlockId.WOOD);
      const topY = surfaceY + trunkH;
      for (let dy = -1; dy <= 2; dy++) {
        const rad = dy < 1 ? 2 : 1;
        for (let dx = -rad; dx <= rad; dx++) {
          for (let dz = -rad; dz <= rad; dz++) {
            if (dx === 0 && dz === 0 && dy < 1) continue;
            const bx = lx+dx, bz = lz+dz, by = topY+dy;
            if (bx >= 0 && bx < CHUNK_SIZE && bz >= 0 && bz < CHUNK_SIZE && by < WORLD_HEIGHT)
              if (chunk.getBlock(bx, by, bz) === BlockId.AIR) chunk.setBlock(bx, by, bz, BlockId.LEAVES);
          }
        }
      }
    }
  }

  // 12) Tall grass
  for (let lx = 1; lx < CHUNK_SIZE - 1; lx++) {
    for (let lz = 1; lz < CHUNK_SIZE - 1; lz++) {
      if (rng() > 0.15) continue;
      let surfaceY = -1;
      for (let y = WORLD_HEIGHT - 1; y > NT + SEA_LEVEL; y--) {
        if (chunk.getBlock(lx, y, lz) === BlockId.GRASS) { surfaceY = y; break; }
      }
      if (surfaceY < 0 || surfaceY + 1 >= WORLD_HEIGHT) continue;
      if (chunk.getBlock(lx, surfaceY + 1, lz) !== BlockId.AIR) continue;
      let blocked = false;
      for (let dx = -1; dx <= 1 && !blocked; dx++)
        for (let dz = -1; dz <= 1 && !blocked; dz++)
          for (let dy = 0; dy <= 1 && !blocked; dy++) {
            if (dx === 0 && dy === 0 && dz === 0) continue;
            const nx = lx+dx, ny = surfaceY+dy+1, nz = lz+dz;
            if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE && ny < WORLD_HEIGHT)
              if (chunk.getBlock(nx, ny, nz) !== BlockId.AIR) blocked = true;
          }
      // (tall grass placement commented out intentionally — uncomment to enable)
    }
  }

  return chunk;
}

/** Apply server block changes to a chunk */
export function applyChanges(chunk: Chunk, changes: DCBlockChange[]): void {
  for (const c of changes) chunk.setBlock(c.localX, c.localY, c.localZ, c.blockId);
}
