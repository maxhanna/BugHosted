/**
 * Procedural world generation using seed-based simplex-like noise.
 * Generates 16×64×16 chunks with terrain, ores, trees, and caves.
 */
import { BlockId, CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, DCBlockChange, getBlockHealth } from './digcraft-types';
import { sampleTerrainColumn, surfaceBlockForBiome, treeNoiseThreshold, BiomeId } from './digcraft-biome';

/** Seeded PRNG (mulberry32) */
function mulberry32(seed: number): () => number {
  return (): number => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Simple 2D value noise for terrain height */
function noise2D(seed: number, x: number, z: number, scale: number): number {
  const sx = Math.floor(x / scale);
  const sz = Math.floor(z / scale);
  const fx = (x / scale) - sx;
  const fz = (z / scale) - sz;

  const smooth = (t: number): number => t * t * (3 - 2 * t);
  const sfx = smooth(fx);
  const sfz = smooth(fz);

  const hash = (ix: number, iz: number): number => {
    let h = ((ix * 374761393 + iz * 668265263 + seed * 1274126177) & 0x7fffffff);
    h = ((h ^ (h >> 13)) * 1103515245 + 12345) & 0x7fffffff;
    return (h & 0xffff) / 65536;
  };

  const v00 = hash(sx, sz);
  const v10 = hash(sx + 1, sz);
  const v01 = hash(sx, sz + 1);
  const v11 = hash(sx + 1, sz + 1);

  const a = v00 + (v10 - v00) * sfx;
  const b = v01 + (v11 - v01) * sfx;
  return a + (b - a) * sfz;
}

/** 3D noise for caves / ore veins */
function noise3D(seed: number, x: number, y: number, z: number, scale: number): number {
  const sx = Math.floor(x / scale);
  const sy = Math.floor(y / scale);
  const sz = Math.floor(z / scale);
  const fx = (x / scale) - sx;
  const fy = (y / scale) - sy;
  const fz = (z / scale) - sz;

  const smooth = (t: number): number => t * t * (3 - 2 * t);
  const sfx = smooth(fx);
  const sfy = smooth(fy);
  const sfz = smooth(fz);

  const hash = (ix: number, iy: number, iz: number): number => {
    let h = ((ix * 374761393 + iy * 668265263 + iz * 1274126177 + seed * 285283) & 0x7fffffff);
    h = ((h ^ (h >> 13)) * 1103515245 + 12345) & 0x7fffffff;
    return (h & 0xffff) / 65536;
  };

  const v000 = hash(sx, sy, sz);
  const v100 = hash(sx + 1, sy, sz);
  const v010 = hash(sx, sy + 1, sz);
  const v110 = hash(sx + 1, sy + 1, sz);
  const v001 = hash(sx, sy, sz + 1);
  const v101 = hash(sx + 1, sy, sz + 1);
  const v011 = hash(sx, sy + 1, sz + 1);
  const v111 = hash(sx + 1, sy + 1, sz + 1);

  const a0 = v000 + (v100 - v000) * sfx;
  const b0 = v010 + (v110 - v010) * sfx;
  const c0 = a0 + (b0 - a0) * sfy;

  const a1 = v001 + (v101 - v001) * sfx;
  const b1 = v011 + (v111 - v011) * sfx;
  const c1 = a1 + (b1 - a1) * sfy;

  return c0 + (c1 - c0) * sfz;
}

/** One chunk of block data */
export class Chunk {
  blocks: Uint8Array; // CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE
  blockHealth: Uint8Array; // Parallel array for block health (0 = broken)
  /** Water flow level 1–8 when block is WATER (0 = unset / not water) */
  waterLevel: Uint8Array;
  /** Surface biome per XZ column (BiomeId, see digcraft-biome.ts) */
  biomeColumn: Uint8Array;
  cx: number;
  cz: number;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    this.blockHealth = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    this.waterLevel = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    this.biomeColumn = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  }

  private idx(x: number, y: number, z: number): number {
    return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
  }

  private colIdx(x: number, z: number): number {
    return z * CHUNK_SIZE + x;
  }

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
    const idx = this.idx(x, y, z);
    this.blocks[idx] = id;
    if (id === BlockId.WATER) {
      const level = wl !== undefined ? Math.max(1, Math.min(8, wl)) : 8;
      this.waterLevel[idx] = level;
    } else {
      this.waterLevel[idx] = 0;
    }
    // Set health: if health not provided, use block's max health (or 0 for air)
    if (health !== undefined) {
      this.blockHealth[idx] = health;
    } else if (id === BlockId.AIR) {
      this.blockHealth[idx] = 0;
    } else {
      const maxHealth = getBlockHealth(id);
      this.blockHealth[idx] = maxHealth > 0 ? maxHealth : 0;
    }
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
    // Returns remaining health after damage
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) return 0;
    const idx = this.idx(x, y, z);
    const current = this.blockHealth[idx];
    if (current <= 0) return 0;
    const remaining = Math.max(0, current - amount);
    this.blockHealth[idx] = remaining;
    return remaining;
  }
}

/** Generate a chunk from seed */
export function generateChunk(seed: number, cx: number, cz: number): Chunk {
  const chunk = new Chunk(cx, cz);
  const rng = mulberry32(seed ^ (cx * 73856093) ^ (cz * 19349669));

  // 1) Terrain height + biome column (continental oceans, rivers, lakes, T/H/W classification)
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const worldX = cx * CHUNK_SIZE + lx;
      const worldZ = cz * CHUNK_SIZE + lz;
      const col = sampleTerrainColumn(seed, worldX, worldZ);
      const height = col.height;
      chunk.setBiome(lx, lz, col.biome);
      const surfaceId = surfaceBlockForBiome(col.biome);

      for (let y = 0; y < WORLD_HEIGHT; y++) {
        if (y === 0) {
          chunk.setBlock(lx, y, lz, BlockId.BEDROCK);
        } else if (y < height - 4) {
          chunk.setBlock(lx, y, lz, height > SEA_LEVEL + 25 ? BlockId.STONE_SNOW : BlockId.STONE);
        } else if (y < height) {
          chunk.setBlock(lx, y, lz, height > SEA_LEVEL + 20 ? BlockId.STONE_SNOW : BlockId.DIRT);
        } else if (y === height) {
          if (height > SEA_LEVEL + 20) {
            chunk.setBlock(lx, y, lz, BlockId.STONE_SNOW);
          } else if (height < SEA_LEVEL) {
            chunk.setBlock(lx, y, lz, BlockId.SAND);
          } else {
            chunk.setBlock(lx, y, lz, surfaceId);
          }
        } else if (y <= SEA_LEVEL && height < SEA_LEVEL) {
          chunk.setBlock(lx, y, lz, BlockId.WATER);
        }
      }
    }
  }

  // 2) Ores
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const worldX = cx * CHUNK_SIZE + lx;
      const worldZ = cz * CHUNK_SIZE + lz;
      for (let y = 1; y < 50; y++) {
        if (chunk.getBlock(lx, y, lz) !== BlockId.STONE) continue;
        const v = noise3D(seed + 5000, worldX, y, worldZ, 6);
        if (v > 0.82) chunk.setBlock(lx, y, lz, BlockId.COAL_ORE);
        else if (v > 0.78 && y < 40) chunk.setBlock(lx, y, lz, BlockId.IRON_ORE);
        else if (v > 0.76 && y < 30) chunk.setBlock(lx, y, lz, BlockId.GOLD_ORE);
        else if (v > 0.75 && y < 16) chunk.setBlock(lx, y, lz, BlockId.DIAMOND_ORE);
      }
    }
  }

  // 3) Caves
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const worldX = cx * CHUNK_SIZE + lx;
      const worldZ = cz * CHUNK_SIZE + lz;
      for (let y = 2; y < 45; y++) {
        const cv = noise3D(seed + 9000, worldX, y, worldZ, 10);
        if (cv > 0.72 && chunk.getBlock(lx, y, lz) !== BlockId.BEDROCK) {
          chunk.setBlock(lx, y, lz, BlockId.AIR);
        }
      }
    }
  }

  // 4) Trees (biome-driven density; oak on grass-topped columns)
  for (let lx = 2; lx < CHUNK_SIZE - 2; lx++) {
    for (let lz = 2; lz < CHUNK_SIZE - 2; lz++) {
      const biome = chunk.getBiome(lx, lz);
      const treeTh = treeNoiseThreshold(biome);
      if (treeTh <= 0 || rng() > treeTh) continue;
      // Find surface grass (same log type for all forest biomes until biome-specific logs exist)
      let surfaceY = -1;
      for (let y = WORLD_HEIGHT - 1; y > SEA_LEVEL; y--) {
        if (chunk.getBlock(lx, y, lz) === BlockId.GRASS) { surfaceY = y; break; }
      }
      if (surfaceY < 0) continue;
      const trunkH = 4 + Math.floor(rng() * 3);
      for (let ty = 1; ty <= trunkH; ty++) {
        chunk.setBlock(lx, surfaceY + ty, lz, BlockId.WOOD);
      }
      // Canopy
      const topY = surfaceY + trunkH;
      for (let dy = -1; dy <= 2; dy++) {
        const rad = dy < 1 ? 2 : 1;
        for (let dx = -rad; dx <= rad; dx++) {
          for (let dz = -rad; dz <= rad; dz++) {
            if (dx === 0 && dz === 0 && dy < 1) continue;
            const bx = lx + dx, bz = lz + dz, by = topY + dy;
            if (bx >= 0 && bx < CHUNK_SIZE && bz >= 0 && bz < CHUNK_SIZE && by < WORLD_HEIGHT) {
              if (chunk.getBlock(bx, by, bz) === BlockId.AIR) {
                chunk.setBlock(bx, by, bz, BlockId.LEAVES);
              }
            }
          }
        }
      }
    }
  }

  // 5) Tall grass (on grass blocks surrounded by other grass - not on edges)
  for (let lx = 1; lx < CHUNK_SIZE - 1; lx++) {
    for (let lz = 1; lz < CHUNK_SIZE - 1; lz++) {
      if (rng() > 0.15) continue; // ~15% chance per column
      // Find surface grass block
      let surfaceY = -1;
      for (let y = WORLD_HEIGHT - 1; y > SEA_LEVEL; y--) {
        if (chunk.getBlock(lx, y, lz) === BlockId.GRASS) { surfaceY = y; break; }
      }
      if (surfaceY < 0) continue;
      // Check if space above is empty (and not near other blocks)
      if (surfaceY + 1 >= WORLD_HEIGHT || chunk.getBlock(lx, surfaceY + 1, lz) !== BlockId.AIR) continue;

      // Check no blocks within 1 block radius above
      let nearBlockAbove = false;
      for (let dx = -1; dx <= 1 && !nearBlockAbove; dx++) {
        for (let dz = -1; dz <= 1 && !nearBlockAbove; dz++) {
          for (let dy = 0; dy <= 1 && !nearBlockAbove; dy++) {
            if (dx === 0 && dy === 0 && dz === 0) continue;
            const nx = lx + dx, ny = surfaceY + dy + 1, nz = lz + dz;
            if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE && ny < WORLD_HEIGHT) {
              if (chunk.getBlock(nx, ny, nz) !== BlockId.AIR) {
                nearBlockAbove = true;
              }
            }
          }
        }
      }
      if (nearBlockAbove) continue;

      // // Check that at least 3 of 4 neighbors are grass (not on edge)
      // let grassNeighbors = 0;
      // if (chunk.getBlock(lx - 1, surfaceY, lz) === BlockId.GRASS) grassNeighbors++;
      // if (chunk.getBlock(lx + 1, surfaceY, lz) === BlockId.GRASS) grassNeighbors++;
      // if (chunk.getBlock(lx, surfaceY, lz - 1) === BlockId.GRASS) grassNeighbors++;
      // if (chunk.getBlock(lx, surfaceY, lz + 1) === BlockId.GRASS) grassNeighbors++;

      // if (grassNeighbors >= 3) {
      //   chunk.setBlock(lx, surfaceY + 1, lz, BlockId.TALLGRASS);
      // }
    }
  }

  return chunk;
}

/** Generate a Nether-like chunk (separate generation; seeded differently to mimic Minecraft Nether) */
export function generateNetherChunk(seed: number, cx: number, cz: number): Chunk {
  const chunk = new Chunk(cx, cz);
  // Use a different seed offset so Nether features differ deterministically from overworld
  const netherSeed = (seed ^ 0x9E3779B1) >>> 0;
  const rng = mulberry32(netherSeed ^ (cx * 73856093) ^ (cz * 19349669));

  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;

  // Default fill: netherrack everywhere except bedrock
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        if (y === 0 || y === WORLD_HEIGHT - 1) {
          chunk.setBlock(lx, y, lz, BlockId.BEDROCK);
        } else {
          chunk.setBlock(lx, y, lz, BlockId.NETHERRACK);
        }
      }
    }
  }

  // Carve large caverns using low-frequency 3D noise
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const worldX = ox + lx;
      const worldZ = oz + lz;
      for (let y = 2; y < WORLD_HEIGHT - 2; y++) {
        const cv = noise3D(netherSeed + 30000, worldX, y, worldZ, 18);
        // carve when noise is high to create roomy caverns
        if (cv > 0.68 && chunk.getBlock(lx, y, lz) !== BlockId.BEDROCK) {
          chunk.setBlock(lx, y, lz, BlockId.AIR);
        }
      }
    }
  }

  // Lava seas / rivers: seed 2D mask controls where large lava areas appear
  const lavaBase = Math.floor(WORLD_HEIGHT * 0.22);
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const worldX = ox + lx;
      const worldZ = oz + lz;
      const lavaMask = noise2D(netherSeed + 40000, worldX, worldZ, 28);
      if (lavaMask > 0.72) {
        // variable lava sea height
        const extra = Math.floor(noise2D(netherSeed + 41000, worldX, worldZ, 8) * 8);
        const topLava = Math.max(1, lavaBase + extra - Math.floor(rng() * 6));
        for (let y = 1; y <= topLava; y++) {
          // only set lava where there is air or netherrack (avoid overwriting bedrock)
          const cur = chunk.getBlock(lx, y, lz);
          if (cur === BlockId.AIR || cur === BlockId.NETHERRACK) {
            chunk.setBlock(lx, y, lz, BlockId.LAVA);
          }
        }
      }
    }
  }

  // Basalt deltas / patches: replace clusters of netherrack with basalt
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const worldX = ox + lx;
      const worldZ = oz + lz;
      const bmask = noise2D(netherSeed + 45000, worldX, worldZ, 18);
      if (bmask > 0.78) {
        for (let y = Math.floor(WORLD_HEIGHT * 0.2); y < Math.floor(WORLD_HEIGHT * 0.8); y += 1) {
          if (chunk.getBlock(lx, y, lz) === BlockId.NETHERRACK && rng() > 0.5) {
            chunk.setBlock(lx, y, lz, BlockId.BASALT);
          }
        }
      }
    }
  }

  // Scatter hard netherite rocks in veins
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const worldX = ox + lx;
      const worldZ = oz + lz;
      for (let y = 6; y < WORLD_HEIGHT - 6; y++) {
        if (chunk.getBlock(lx, y, lz) !== BlockId.NETHERRACK) continue;
        const v = noise3D(netherSeed + 52000, worldX, y, worldZ, 6);
        if (v > 0.82) chunk.setBlock(lx, y, lz, BlockId.NETHERITE_ROCK);
      }
    }
  }

  // Stalactites and stalagmites in caverns
  for (let lx = 1; lx < CHUNK_SIZE - 1; lx++) {
    for (let lz = 1; lz < CHUNK_SIZE - 1; lz++) {
      const worldX = ox + lx;
      const worldZ = oz + lz;
      for (let y = 4; y < WORLD_HEIGHT - 4; y++) {
        if (chunk.getBlock(lx, y, lz) !== BlockId.AIR) continue;
        // Stalactite: hanging from solid ceiling
        const above = chunk.getBlock(lx, y + 1, lz);
        if ((above === BlockId.NETHERRACK || above === BlockId.BASALT) && noise2D(netherSeed + 60000, worldX, worldZ, 6) > 0.92) {
          let len = 1 + Math.floor(rng() * 3);
          for (let k = 0; k < len; k++) {
            if (y - k <= 1) break;
            if (chunk.getBlock(lx, y - k, lz) !== BlockId.AIR) break;
            chunk.setBlock(lx, y - k, lz, BlockId.NETHER_STALACTITE);
          }
        }
        // Stalagmite: growing from floor
        const below = chunk.getBlock(lx, y - 1, lz);
        if ((below === BlockId.NETHERRACK || below === BlockId.BASALT) && noise2D(netherSeed + 61000, worldX, worldZ, 6) > 0.92) {
          let len = 1 + Math.floor(rng() * 3);
          for (let k = 0; k < len; k++) {
            if (y + k >= WORLD_HEIGHT - 2) break;
            if (chunk.getBlock(lx, y + k, lz) !== BlockId.AIR) break;
            chunk.setBlock(lx, y + k, lz, BlockId.NETHER_STALAGMITE);
          }
        }
      }
    }
  }

  return chunk;
}

/** Apply server block changes to a chunk */
export function applyChanges(chunk: Chunk, changes: DCBlockChange[]): void {
  for (const c of changes) {
    chunk.setBlock(c.localX, c.localY, c.localZ, c.blockId);
  }
}
