/**
 * Biome IDs, climate (temperature / humidity / weirdness / continentalness),
 * and terrain column sampling. Kept deterministic from world seed + block coords.
 * Server DigCraftController ports the same formulas.
 */
import { BlockId, SEA_LEVEL } from './digcraft-types';

// ───── Biome IDs (stored per XZ column in chunk, uint8) ─────
export const enum BiomeId {
  UNKNOWN = 0,
  OCEAN = 1,
  DEEP_OCEAN = 2,
  COLD_OCEAN = 3,
  FROZEN_OCEAN = 4,
  LUKWARM_OCEAN = 5,
  WARM_OCEAN = 6,
  RIVER = 7,
  FROZEN_RIVER = 8,
  BEACH = 9,
  SNOWY_BEACH = 10,
  PLAINS = 11,
  SUNFLOWER_PLAINS = 12,
  SNOWY_PLAINS = 13,
  ICE_PLAINS = 14,
  ICE_SPIKE_PLAINS = 15,
  MUSHROOM_FIELD = 16,
  DESERT = 17,
  BADLANDS = 18,
  WOODED_BADLANDS = 19,
  ERODED_BADLANDS = 20,
  FOREST = 21,
  BIRCH_FOREST = 22,
  DARK_FOREST = 23,
  FLOWER_FOREST = 24,
  OLD_GROWTH_BIRCH_FOREST = 25,
  TAIGA = 26,
  SNOWY_TAIGA = 27,
  OLD_GROWTH_SPRUCE_TAIGA = 28,
  OLD_GROWTH_PINE_TAIGA = 29,
  JUNGLE = 30,
  BAMBOO_JUNGLE = 31,
  SPARSE_JUNGLE = 32,
  SWAMP = 33,
  MANGROVE_SWAMP = 34,
  SAVANNA = 35,
  SAVANNA_PLATEAU = 36,
  WINDSWEPT_SAVANNA = 37,
  MEADOW = 38,
  GROVE = 39,
  CHERRY_GROVE = 40,
  PALE_GARDEN = 41,
  DEEP_DARK = 42,
  DRIPSTONE_CAVES = 43,
  LUSH_CAVES = 44,
  JAGGED_PEAKS = 45,
  FROZEN_PEAKS = 46,
  STONY_PEAKS = 47,
  SNOWY_SLOPES = 48,
  WINDSWEPT_HILLS = 49,
  WINDSWEPT_FOREST = 50,
  WINDSWEPT_GRAVELLY_HILLS = 51,
  STONY_SHORE = 52,
  NETHER_WASTES = 53,
  SOUL_SAND_VALLEY = 54,
  BASALT_DELTAS = 55,
  CRIMSON_FOREST = 56,
  WARPED_FOREST = 57,
  THE_END = 58,
  END_BARRENS = 59,
  END_HIGHLANDS = 60,
  END_MIDLANDS = 61,
  SMALL_END_ISLANDS = 62,
  LUKEWARM_OCEAN = 63,
  DEEP_COLD_OCEAN = 64,
  DEEP_FROZEN_OCEAN = 65,
  DEEP_LUKEWARM_OCEAN = 66,
  DEEP_WARM_OCEAN = 67,
}

export const BIOME_NAMES: Record<number, string> = {
  [BiomeId.UNKNOWN]: 'Unknown',
  [BiomeId.OCEAN]: 'Ocean', [BiomeId.DEEP_OCEAN]: 'Deep Ocean', [BiomeId.COLD_OCEAN]: 'Cold Ocean',
  [BiomeId.FROZEN_OCEAN]: 'Frozen Ocean', [BiomeId.LUKWARM_OCEAN]: 'Lukewarm Ocean', [BiomeId.WARM_OCEAN]: 'Warm Ocean',
  [BiomeId.RIVER]: 'River', [BiomeId.FROZEN_RIVER]: 'Frozen River',
  [BiomeId.BEACH]: 'Beach', [BiomeId.SNOWY_BEACH]: 'Snowy Beach',
  [BiomeId.PLAINS]: 'Plains', [BiomeId.SUNFLOWER_PLAINS]: 'Sunflower Plains', [BiomeId.SNOWY_PLAINS]: 'Snowy Plains',
  [BiomeId.ICE_PLAINS]: 'Ice Plains', [BiomeId.ICE_SPIKE_PLAINS]: 'Ice Spike Plains', [BiomeId.MUSHROOM_FIELD]: 'Mushroom Field',
  [BiomeId.DESERT]: 'Desert', [BiomeId.BADLANDS]: 'Badlands', [BiomeId.WOODED_BADLANDS]: 'Wooded Badlands', [BiomeId.ERODED_BADLANDS]: 'Eroded Badlands',
  [BiomeId.FOREST]: 'Forest', [BiomeId.BIRCH_FOREST]: 'Birch Forest', [BiomeId.DARK_FOREST]: 'Dark Forest',
  [BiomeId.FLOWER_FOREST]: 'Flower Forest', [BiomeId.OLD_GROWTH_BIRCH_FOREST]: 'Old Growth Birch Forest',
  [BiomeId.TAIGA]: 'Taiga', [BiomeId.SNOWY_TAIGA]: 'Snowy Taiga', [BiomeId.OLD_GROWTH_SPRUCE_TAIGA]: 'Old Growth Spruce Taiga',
  [BiomeId.OLD_GROWTH_PINE_TAIGA]: 'Old Growth Pine Taiga',
  [BiomeId.JUNGLE]: 'Jungle', [BiomeId.BAMBOO_JUNGLE]: 'Bamboo Jungle', [BiomeId.SPARSE_JUNGLE]: 'Sparse Jungle',
  [BiomeId.SWAMP]: 'Swamp', [BiomeId.MANGROVE_SWAMP]: 'Mangrove Swamp',
  [BiomeId.SAVANNA]: 'Savanna', [BiomeId.SAVANNA_PLATEAU]: 'Savanna Plateau', [BiomeId.WINDSWEPT_SAVANNA]: 'Windswept Savanna',
  [BiomeId.MEADOW]: 'Meadow', [BiomeId.GROVE]: 'Grove', [BiomeId.CHERRY_GROVE]: 'Cherry Grove', [BiomeId.PALE_GARDEN]: 'Pale Garden',
  [BiomeId.DEEP_DARK]: 'Deep Dark', [BiomeId.DRIPSTONE_CAVES]: 'Dripstone Caves', [BiomeId.LUSH_CAVES]: 'Lush Caves',
  [BiomeId.JAGGED_PEAKS]: 'Jagged Peaks', [BiomeId.FROZEN_PEAKS]: 'Frozen Peaks', [BiomeId.STONY_PEAKS]: 'Stony Peaks',
  [BiomeId.SNOWY_SLOPES]: 'Snowy Slopes', [BiomeId.WINDSWEPT_HILLS]: 'Windswept Hills', [BiomeId.WINDSWEPT_FOREST]: 'Windswept Forest',
  [BiomeId.WINDSWEPT_GRAVELLY_HILLS]: 'Windswept Gravelly Hills', [BiomeId.STONY_SHORE]: 'Stony Shore',
  [BiomeId.NETHER_WASTES]: 'Nether Wastes', [BiomeId.SOUL_SAND_VALLEY]: 'Soul Sand Valley', [BiomeId.BASALT_DELTAS]: 'Basalt Deltas',
  [BiomeId.CRIMSON_FOREST]: 'Crimson Forest', [BiomeId.WARPED_FOREST]: 'Warped Forest',
  [BiomeId.THE_END]: 'The End', [BiomeId.END_BARRENS]: 'End Barrens', [BiomeId.END_HIGHLANDS]: 'End Highlands',
  [BiomeId.END_MIDLANDS]: 'End Midlands', [BiomeId.SMALL_END_ISLANDS]: 'Small End Islands',
};

/** 2D value noise [0,1) — same kernel as digcraft-world.ts */
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

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Ridged 0..1 (river channels at high values) */
function ridgedChannel(seed: number, x: number, z: number, scale: number): number {
  const n = noise2D(seed, x, z, scale);
  return 1 - Math.abs(2 * n - 1);
}

export interface TerrainColumnSample {
  height: number;
  biome: BiomeId;
  temperature: number;
  humidity: number;
  weirdness: number;
  continental: number;
  ridge: number;
}

function classifyBiome(
  height: number,
  T: number,
  H: number,
  W: number,
  C: number,
  ridge: number
): BiomeId {
  const deepOcean = height < SEA_LEVEL - 10 || (C < 0.2 && height < SEA_LEVEL - 2);
  const inOcean = height < SEA_LEVEL;

  if (deepOcean) {
    if (T < 0.26) return BiomeId.FROZEN_OCEAN;
    if (T < 0.4) return BiomeId.COLD_OCEAN;
    if (T > 0.72) return BiomeId.WARM_OCEAN;
    if (T > 0.58) return BiomeId.LUKWARM_OCEAN;
    return BiomeId.DEEP_OCEAN;
  }
  if (inOcean) {
    if (T < 0.3) return BiomeId.FROZEN_OCEAN;
    if (T > 0.68) return BiomeId.WARM_OCEAN;
    if (T > 0.55) return BiomeId.LUKWARM_OCEAN;
    if (T < 0.42) return BiomeId.COLD_OCEAN;
    return BiomeId.OCEAN;
  }

  if (ridge > 0.9 && height <= SEA_LEVEL + 4) {
    return T < 0.32 ? BiomeId.FROZEN_RIVER : BiomeId.RIVER;
  }

  if (height >= SEA_LEVEL && height <= SEA_LEVEL + 2 && C < 0.52) {
    return T < 0.28 ? BiomeId.SNOWY_BEACH : BiomeId.BEACH;
  }

  if (C > 0.62 && height >= SEA_LEVEL && height <= SEA_LEVEL + 4 && ridge < 0.4) {
    return BiomeId.STONY_SHORE;
  }

  if (height > SEA_LEVEL + 44) {
    if (T < 0.34) return BiomeId.FROZEN_PEAKS;
    if (T > 0.66) return BiomeId.STONY_PEAKS;
    return BiomeId.JAGGED_PEAKS;
  }
  if (height > SEA_LEVEL + 30) {
    if (T < 0.34) return BiomeId.SNOWY_SLOPES;
    if (H > 0.54 && T > 0.36 && T < 0.62) return BiomeId.WINDSWEPT_FOREST;
    if (W > 0.78) return BiomeId.WINDSWEPT_GRAVELLY_HILLS;
    return BiomeId.WINDSWEPT_HILLS;
  }
  if (height > SEA_LEVEL + 19 && H > 0.46 && T > 0.38 && T < 0.68) {
    return BiomeId.MEADOW;
  }

  if (W > 0.91 && H > 0.48 && T > 0.36 && T < 0.58) {
    return BiomeId.MUSHROOM_FIELD;
  }

  if (H > 0.66 && T > 0.34 && T < 0.62) {
    return (W > 0.74 && T > 0.48) ? BiomeId.MANGROVE_SWAMP : BiomeId.SWAMP;
  }

  if (T < 0.22) {
    if (W > 0.84) return BiomeId.ICE_SPIKE_PLAINS;
    if (H < 0.36) return BiomeId.ICE_PLAINS;
    return BiomeId.SNOWY_PLAINS;
  }
  if (T < 0.32 && H > 0.35) {
    return BiomeId.SNOWY_TAIGA;
  }

  if (T > 0.7 && H < 0.34) {
    if (W > 0.82) return BiomeId.ERODED_BADLANDS;
    if (W > 0.64) return BiomeId.WOODED_BADLANDS;
    return BiomeId.BADLANDS;
  }
  if (T > 0.64 && H < 0.38) {
    return BiomeId.DESERT;
  }

  if (T > 0.56 && H < 0.44 && height > SEA_LEVEL + 14) {
    return W > 0.76 ? BiomeId.WINDSWEPT_SAVANNA : BiomeId.SAVANNA_PLATEAU;
  }
  if (T > 0.54 && H < 0.42) {
    return W > 0.76 ? BiomeId.WINDSWEPT_SAVANNA : BiomeId.SAVANNA;
  }

  if (T > 0.6 && H > 0.6) {
    if (W > 0.78) return BiomeId.BAMBOO_JUNGLE;
    if (W < 0.34) return BiomeId.SPARSE_JUNGLE;
    return BiomeId.JUNGLE;
  }

  if (H > 0.52 && T > 0.34 && T < 0.64) {
    if (W > 0.84) return BiomeId.DARK_FOREST;
    if (W > 0.68) return BiomeId.FLOWER_FOREST;
    if (W > 0.52 || T < 0.44) return BiomeId.BIRCH_FOREST;
    if (W < 0.28 && T > 0.5) return BiomeId.OLD_GROWTH_BIRCH_FOREST;
    return BiomeId.FOREST;
  }

  if (T < 0.46 && H > 0.38) {
    if (height > SEA_LEVEL + 17 && W > 0.62) return BiomeId.OLD_GROWTH_SPRUCE_TAIGA;
    if (height > SEA_LEVEL + 15 && W < 0.36) return BiomeId.OLD_GROWTH_PINE_TAIGA;
    return BiomeId.TAIGA;
  }

  if (height > SEA_LEVEL + 11 && T < 0.42 && H > 0.42 && W > 0.86) {
    return BiomeId.GROVE;
  }
  if (T > 0.47 && T < 0.62 && W > 0.88) {
    return BiomeId.CHERRY_GROVE;
  }
  if (H > 0.54 && T < 0.32 && W > 0.87) {
    return BiomeId.PALE_GARDEN;
  }

  if (W > 0.86 && T > 0.44 && T < 0.58) {
    return BiomeId.SUNFLOWER_PLAINS;
  }
  return BiomeId.PLAINS;
}

/**
 * Full overworld column: continental oceans, ridged rivers, lake basins,
 * then climate T/H/W for biome classification.
 */
export function sampleTerrainColumn(seed: number, worldX: number, worldZ: number): TerrainColumnSample {
  const n1 = noise2D(seed, worldX, worldZ, 48) * 20;
  const n2 = noise2D(seed + 1000, worldX, worldZ, 24) * 10;
  const n3 = noise2D(seed + 2000, worldX, worldZ, 12) * 4;
  const mountainNoise = noise2D(seed + 3000, worldX, worldZ, 200);
  const mountainHeight = mountainNoise > 0.65 ? Math.floor((mountainNoise - 0.65) * 300) : 0;

  const continental = noise2D(seed + 7000, worldX, worldZ, 450);
  // Reduced depression range to create more land (was 30, now 18)
  const depression = smoothstep(0.28, 0.58, 1 - continental) * 18;

  // Slightly higher base height to favor land (was SEA_LEVEL, now +3)
  let height = SEA_LEVEL + 3 + Math.floor(n1 + n2 + n3 + mountainHeight - depression);

  const ridge = ridgedChannel(seed + 8000, worldX, worldZ, 220);
  if (ridge > 0.86) {
    height -= Math.floor((ridge - 0.86) / 0.14 * 9);
  }

  const humidityRaw = noise2D(seed + 6010, worldX, worldZ, 360);
  const lakeSpot = noise2D(seed + 8500, worldX, worldZ, 72);
  // Reduced lake creation to only very low areas
  if (humidityRaw > 0.58 && lakeSpot > 0.82 && height >= SEA_LEVEL - 3 && height <= SEA_LEVEL + 10) {
    height = Math.min(height, SEA_LEVEL - 1);
  }

  let T = noise2D(seed + 6000, worldX, worldZ, 520);
  T -= 0.14 * clamp01((height - SEA_LEVEL) / 44);
  T = clamp01(T);
  const H = clamp01(humidityRaw);
  const W = clamp01(noise2D(seed + 6020, worldX, worldZ, 200));
  const C = clamp01(continental);

  const biome = classifyBiome(height, T, H, W, C, ridge);
  return { height, biome, temperature: T, humidity: H, weirdness: W, continental: C, ridge };
}

/** Surface block for column top (until dedicated biome blocks exist) */
export function surfaceBlockForBiome(biome: BiomeId): number {
  switch (biome) {
    case BiomeId.DESERT:
    case BiomeId.BADLANDS:
    case BiomeId.WOODED_BADLANDS:
    case BiomeId.ERODED_BADLANDS:
    case BiomeId.BEACH:
      return BlockId.SAND;
    case BiomeId.ICE_PLAINS:
    case BiomeId.ICE_SPIKE_PLAINS:
    case BiomeId.SNOWY_PLAINS:
    case BiomeId.SNOWY_BEACH:
    case BiomeId.FROZEN_OCEAN:
    case BiomeId.FROZEN_RIVER:
    case BiomeId.FROZEN_PEAKS:
    case BiomeId.SNOWY_SLOPES:
    case BiomeId.SNOWY_TAIGA:
      return BlockId.STONE_SNOW;
    case BiomeId.MUSHROOM_FIELD:
      return BlockId.DIRT;
    case BiomeId.JAGGED_PEAKS:
    case BiomeId.STONY_PEAKS:
    case BiomeId.STONY_SHORE:
      return BlockId.STONE;
    case BiomeId.WINDSWEPT_GRAVELLY_HILLS:
      return BlockId.GRAVEL;
    default:
      return BlockId.GRASS;
  }
}

/** Tree pass probability per column (sparse in plains, none in desert/ocean) */
export function treeNoiseThreshold(biome: BiomeId): number {
  switch (biome) {
    case BiomeId.DARK_FOREST:
      return 0.05; // Increased from 0.038
    case BiomeId.FOREST:
    case BiomeId.FLOWER_FOREST:
      return 0.05; // Increased from 0.032
    case BiomeId.BIRCH_FOREST:
    case BiomeId.OLD_GROWTH_BIRCH_FOREST:
      return 0.045; // Increased from 0.028
    case BiomeId.TAIGA:
    case BiomeId.SNOWY_TAIGA:
    case BiomeId.OLD_GROWTH_SPRUCE_TAIGA:
    case BiomeId.OLD_GROWTH_PINE_TAIGA:
    case BiomeId.GROVE:
      return 0.04; // Increased from 0.026
    case BiomeId.JUNGLE:
    case BiomeId.BAMBOO_JUNGLE:
    case BiomeId.SPARSE_JUNGLE:
      return 0.055; // Increased from 0.034
    case BiomeId.SWAMP:
    case BiomeId.MANGROVE_SWAMP:
      return 0.04; // Increased from 0.022
    case BiomeId.WOODED_BADLANDS:
      return 0.03; // Increased from 0.018
    case BiomeId.MEADOW:
    case BiomeId.CHERRY_GROVE:
      return 0.025; // Increased from 0.014
    case BiomeId.WINDSWEPT_FOREST:
      return 0.035; // Increased from 0.02
    case BiomeId.PLAINS:
    case BiomeId.SUNFLOWER_PLAINS:
      return 0.02; // Increased from 0.01
    case BiomeId.SAVANNA:
    case BiomeId.SAVANNA_PLATEAU:
    case BiomeId.WINDSWEPT_SAVANNA:
      return 0.025; // Increased from 0.012
    case BiomeId.DESERT:
    case BiomeId.BADLANDS:
    case BiomeId.WOODED_BADLANDS:
    case BiomeId.ERODED_BADLANDS:
    case BiomeId.BEACH:
    case BiomeId.STONY_SHORE:
    case BiomeId.SNOWY_BEACH:
    case BiomeId.OCEAN:
    case BiomeId.DEEP_OCEAN:
    case BiomeId.FROZEN_OCEAN:
    case BiomeId.COLD_OCEAN:
    case BiomeId.WARM_OCEAN:
    case BiomeId.LUKEWARM_OCEAN:
    case BiomeId.DEEP_COLD_OCEAN:
    case BiomeId.DEEP_FROZEN_OCEAN:
    case BiomeId.DEEP_LUKEWARM_OCEAN:
    case BiomeId.DEEP_WARM_OCEAN:
    case BiomeId.RIVER:
    case BiomeId.FROZEN_RIVER:
    case BiomeId.STONY_PEAKS:
    case BiomeId.ICE_SPIKE_PLAINS:
    case BiomeId.SNOWY_PLAINS:
    case BiomeId.ICE_PLAINS:
    case BiomeId.FROZEN_PEAKS:
    case BiomeId.SNOWY_SLOPES:
    case BiomeId.JAGGED_PEAKS:
      return 0.005; // Added trees to previously barren biomes (0.5% chance)
    default:
      return 0.005; // All other biomes get 0.5% chance
  }
}

export function getBiomeAt(seed: number, worldX: number, worldZ: number): BiomeId {
  return sampleTerrainColumn(seed, worldX, worldZ).biome;
}
