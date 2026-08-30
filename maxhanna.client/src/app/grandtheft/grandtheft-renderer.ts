import { CityMesh, CityChunk, GltfAnimation, BuildingPlacement } from "../../services/grandtheft.service";
const LOCAL_VEHICLE_GROUND_OFFSET = 0.4;
import { HumanVariant, Role, pickVariant, createHumanSkeleton } from './grandtheft-human-model';
const CHUNK_SIZE = 80;
const GRID_PITCH = 80;
const BLOCK_SIZE = 30;
const SIDEWALK_SIZE = 48;
const ROAD_HALF_WIDTH = (GRID_PITCH - SIDEWALK_SIZE) / 2; 
const BIOME_RADIUS_MOUNTAIN = 30;
// Coastal land is intentionally more common than mountain terrain. Mountains
// use the explicit eastern chain below rather than the old random rural roll.
const BEACH_CHANCE_DENOMINATOR = 3;
const BRIDGE_DECK_Y = 12.0;
interface IslandDef {
  cx: number; cz: number;
  cityR: number;
  suburbR: number;
  ruralR: number;
}
const ISLANDS: IslandDef[] = [
  { cx: 0, cz: 0, cityR: 2.5, suburbR: 3.5, ruralR: 3.5 },     
  { cx: 10, cz: 0, cityR: 5, suburbR: 7, ruralR: 8 },           
  { cx: 24, cz: 0, cityR: 3, suburbR: 6, ruralR: 8 },           
  { cx: 41, cz: 0, cityR: 5, suburbR: 8, ruralR: 11 },          
  { cx: -10, cz: 0, cityR: 0, suburbR: 0, ruralR: 6 },          
  { cx: 61, cz: 0, cityR: 0, suburbR: 0, ruralR: 11 },          
  { cx: -18, cz: 0, cityR: 0, suburbR: 0, ruralR: 5 },          
  { cx: 75, cz: 0, cityR: 0, suburbR: 0, ruralR: 9 },           
];
interface BridgeDef {
  startCx: number; endCx: number; startCz: number; endCz: number;
}
const BRIDGES: BridgeDef[] = [
  { startCx: 4, endCx: 5, startCz: 0, endCz: 0 },     
  { startCx: 16, endCx: 17, startCz: 0, endCz: 0 },   
  { startCx: 31, endCx: 32, startCz: 0, endCz: 0 },   
];
const BRIDGE_CONNECTORS: { cx: number; cz: number }[] = [];
for (const br of BRIDGES) {
  BRIDGE_CONNECTORS.push({ cx: br.startCx - 1, cz: br.startCz });
  BRIDGE_CONNECTORS.push({ cx: br.endCx + 1, cz: br.endCz });
}
function getBridgeAtWorldPos(x: number, z: number): BridgeDef | null {
  const bridgeW = (ROAD_HALF_WIDTH * 2) + 10; 
  for (const br of BRIDGE_RANGES) {
    const roadCenterZ = br.startCz * 80;
    if (Math.abs(z - roadCenterZ) > bridgeW / 2) continue;
    const rampStartX = (br.startCx - 1) * 80;
    const rampEndX = (br.endCx + 2) * 80;
    if (x < rampStartX || x > rampEndX) continue;
    return br;
  }
  return null;
}
function isNearBridgeRoad(x: number, z: number, margin: number): boolean {
  const bridgeW = (ROAD_HALF_WIDTH * 2) + 10;
  for (const br of BRIDGE_RANGES) {
    const roadCenterZ = br.startCz * 80;
    if (Math.abs(z - roadCenterZ) > bridgeW / 2 + margin) continue;
    const rampStartX = (br.startCx - 1) * 80 - margin;
    const rampEndX = (br.endCx + 2) * 80 + margin;
    if (x < rampStartX || x > rampEndX) continue;
    return true;
  }
  return false;
}
function isInAnyIsland(cx: number, cz: number): boolean {
  for (const isl of ISLANDS) {
    const dx = cx - isl.cx, dz = cz - isl.cz;
    if (dx * dx + dz * dz < isl.ruralR * isl.ruralR) return true;
  }
  return false;
}

// The eastern rural islands form one deterministic mountain chain. Like the
// bridges, the chain has a clear beginning and end that sit on the same level
// as the surrounding ground, and it rises smoothly to full height across many
// chunks — no isolated cliffs popping out of flat land.
const MOUNTAIN_CHAIN_WEST = 36 * CHUNK_SIZE;  // first foothills (world x)
const MOUNTAIN_CHAIN_EAST = 86 * CHUNK_SIZE;  // last foothills (world x)
const MOUNTAIN_CHAIN_RAMP = 6 * CHUNK_SIZE;   // smooth gain/loss span (world units)
const MOUNTAIN_FOOTHILL_WIDTH = 11;           // biome cells across the ridge belt
const MOUNTAIN_CORE_WIDTH = 5;                 // high interior cells

/** 0→1→0 envelope along the chain length, ramping up/down like a bridge approach. */
function mountainLongitudinal(x: number): number {
  if (x <= MOUNTAIN_CHAIN_WEST || x >= MOUNTAIN_CHAIN_EAST) return 0;
  const smooth = (t: number) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
  if (x < MOUNTAIN_CHAIN_WEST + MOUNTAIN_CHAIN_RAMP) {
    return smooth((x - MOUNTAIN_CHAIN_WEST) / MOUNTAIN_CHAIN_RAMP);
  }
  if (x > MOUNTAIN_CHAIN_EAST - MOUNTAIN_CHAIN_RAMP) {
    return smooth((MOUNTAIN_CHAIN_EAST - x) / MOUNTAIN_CHAIN_RAMP);
  }
  return 1;
}

/** Ridge centre-line (chunk coords). Single source so the biome band, the
 * height field, and the switchback road all track the same winding centre. */
function getMountainRidgeCenter(cx: number): number {
  return 6 + 2.6 * Math.sin((cx - 41) * 0.26);
}

function getMountainBand(cx: number, cz: number): 0 | 1 | 2 {
  // The belt is contiguous across the eastern islands. Chunks sit within a
  // lateral band around the winding ridge centre-line, and only appear where
  // the longitudinal ramp has actually begun (so the first foothill chunk is
  // low, not a full-height cliff).
  if (!isInAnyIsland(cx, cz)) return 0;
  if (mountainLongitudinal(cx * CHUNK_SIZE + CHUNK_SIZE / 2) <= 0.001) return 0;
  const distance = Math.abs(cz - getMountainRidgeCenter(cx));
  if (distance <= MOUNTAIN_CORE_WIDTH) return 2;
  if (distance <= MOUNTAIN_FOOTHILL_WIDTH) return 1;
  return 0;
}

function getMountainHeight(x: number, z: number): number {
  // A continuous world-space height field. The broad ridge is deliberately
  // tapered at both sides so lowland/city chunks meet real foothills instead
  // of exposing a vertical cliff at the biome classification boundary.
  const chainX = x / CHUNK_SIZE - 41;
  const ridgeCenterZ = (6 + 2.6 * Math.sin(chainX * 0.26)) * CHUNK_SIZE + CHUNK_SIZE / 2;
  const ridgeDistance = z - ridgeCenterZ;
  const mainRidge = Math.exp(-(ridgeDistance * ridgeDistance) / (2 * 330 * 330));
  const shoulderDistance = z - (ridgeCenterZ + 128 + 38 * Math.sin(x / 230));
  const shoulder = Math.exp(-(shoulderDistance * shoulderDistance) / (2 * 115 * 115));
  const detail = 0.82 + 0.18 * Math.sin(x / 115 + Math.sin(z / 190) * 1.4);
  const profile = Math.max(0, mainRidge * (12 + 42 * detail) + shoulder * 10);
  // Keep a broad, low foothill apron so the terrain reaches street level over
  // several cells instead of ending at the first mountain tile.
  const lateral = Math.max(0, Math.min(1, (Math.abs(ridgeDistance) - 520) / 300));
  const edgeFade = 1 - lateral * lateral * (3 - 2 * lateral);
  return profile * edgeFade * mountainLongitudinal(x);
}

function getMountainRoadHeight(x: number, z: number): number {
  // Roads are cut into the same height field rather than floating at sea level.
  // The small lift keeps the road surface above the sampled ground mesh.
  return getMountainHeight(x, z) + 0.08;
}

function getMountainSwitchbackZ(x: number): number {
  const chainX = x / CHUNK_SIZE - 41;
  const ridgeCenterZ = (6 + 2.6 * Math.sin(chainX * 0.26)) * CHUNK_SIZE + CHUNK_SIZE / 2;
  // A long, deterministic shelf road follows the chain rather than making
  // isolated loops inside each mountain chunk.
  return ridgeCenterZ + 118 * Math.sin(x / 175 + 0.7);
}

// Biome classification is a pure function of (cx, cz) and static world data,
// so results are memoized. The in-flight set is the recursion guard: while a
// chunk's beach classification is still being decided, re-entrant queries from
// its neighbours receive the neighbour-independent biome instead of recursing.
// Without this guard, two adjacent coastal chunks ping-pong forever through
// hasRoadNeighbour -> getBiome -> hasRoadNeighbour (chunk A asks B, B's west
// neighbour is ocean so B then asks A back, A asks B again, ...) and the stack
// overflows with RangeError: Maximum call stack size exceeded during world
// setup. Memoization also stops the island scans from re-running for every
// terrain/height query.
const biomeCache = new Map<string, string>();
const biomeInFlight = new Set<string>();
const BIOME_CACHE_LIMIT = 250000;

/** Island/bridge/ocean/aeroport classification with no neighbour-dependent logic. Never recurses. */
function biomeWithoutBeach(cx: number, cz: number): string {
  if (cx >= 0 && cx <= 3 && cz >= -3 && cz <= -1) return 'aeroport';
  if (cx >= 8 && cx <= 15 && cz >= -6 && cz <= -4) return 'aeroport';
  if (cx >= 22 && cx <= 30 && cz >= -8 && cz <= -6) return 'aeroport';
  if (cx >= 36 && cx <= 46 && cz >= -11 && cz <= -9) return 'aeroport';
  if (cx >= 33 && cx <= 46 && cz >= 12 && cz <= 16) return 'aeroport';
  for (const br of BRIDGES) {
    if (cx >= br.startCx && cx <= br.endCx && cz >= br.startCz && cz <= br.endCz) return 'bridge';
  }
  for (const conn of BRIDGE_CONNECTORS) {
    if (cx === conn.cx && cz === conn.cz) return 'bridge_connector';
  }
  if (isBridgeChunk(cx, cz + 1)) return 'ocean';
  if (isBridgeChunk(cx, cz - 1)) return 'ocean';
  const isParkingPatch = () => {
    const h = ((Math.imul(cx, 100003) + Math.imul(cz, 70001)) >>> 0);
    return (h % 9) === 0;
  };
  let bestIsl: IslandDef | null = null;
  let bestDist = Infinity;
  for (const isl of ISLANDS) {
    const dx = cx - isl.cx, dz = cz - isl.cz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < isl.ruralR && dist < bestDist) { bestIsl = isl; bestDist = dist; }
  }
  if (!bestIsl) return 'ocean';
  const isl = bestIsl;
  const dist = bestDist;
  const mountainBand = getMountainBand(cx, cz);
  if (mountainBand === 2) return 'rural_mountain';
  if (mountainBand === 1) return 'rural_hills';
  if (dist < isl.cityR) {
    return isParkingPatch() ? 'parking_lot' : 'city';
  } else if (dist < isl.suburbR) {
    return isParkingPatch() ? 'parking_lot' : 'suburb';
  } else {
    const hr = ((Math.imul(cx, 100003) + Math.imul(cz, 70001)) >>> 0);
    // Keep random mountain tiles out of the biome picker: the explicit chain
    // above is the only source of mountains, so every mountain area is a real
    // connected group instead of isolated spikes. Beaches remain common on
    // coastal boundaries and ordinary rural terrain stays varied.
    const rv = hr % 6;
    if (rv === 0) return 'rural_farm';
    if (rv === 1) return 'rural_hills';
    if (rv === 2) return 'rural_lakes';
    if (rv === 3) return 'rural_desert';
    if (rv === 4) return 'rural_farm';
    return 'rural_hills';
  }
}

export function getBiome(cx: number, cz: number): string {
  const key = `${cx},${cz}`;
  const cached = biomeCache.get(key);
  if (cached !== undefined) return cached;
  // Re-entrant guard: a neighbouring chunk is asking about us while our own
  // beach decision is still on the stack. Return the recursion-free base biome
  // so the A<->B ping-pong terminates instead of exhausting the stack.
  if (biomeInFlight.has(key)) return biomeWithoutBeach(cx, cz);
  biomeInFlight.add(key);
  try {
    const base = biomeWithoutBeach(cx, cz);
    let result = base;
    if (base !== 'ocean' && base !== 'aeroport' && base !== 'bridge' && base !== 'bridge_connector') {
      // Keep the outer shoreline classification, but never let it split an
      // inland road tile. Boundary roads are explicit connectors and must
      // remain drivable on both sides of a biome seam.
      const isRoadBiome = (b: string) => b === 'city' || b === 'suburb' || b === 'parking_lot'
        || b === 'rural_farm' || b === 'rural_hills' || b === 'rural_mountain'
        || b === 'rural_lakes' || b === 'rural_desert' || b === 'bridge_connector';
      const hasRoadNeighbour = (dx: number, dz: number) => isRoadBiome(getBiome(cx + dx, cz + dz));
      const shoreline = !isInAnyIsland(cx + 1, cz) || !isInAnyIsland(cx - 1, cz)
        || !isInAnyIsland(cx, cz + 1) || !isInAnyIsland(cx, cz - 1);
      const shorelineHash = (Math.imul(cx, 100003) ^ Math.imul(cz, 70001)) >>> 0;
      if (shoreline && (shorelineHash % BEACH_CHANCE_DENOMINATOR !== 0
        || (!hasRoadNeighbour(-1, 0) && !hasRoadNeighbour(1, 0)
          && !hasRoadNeighbour(0, -1) && !hasRoadNeighbour(0, 1)))) result = 'beach';
    }
    if (biomeCache.size >= BIOME_CACHE_LIMIT) biomeCache.clear();
    biomeCache.set(key, result);
    return result;
  } finally {
    biomeInFlight.delete(key);
  }
}
export function isAeroportParkingChunk(cx: number, cz: number): boolean {
  if (cx >= 0 && cx <= 3 && cz === -3) return true;
  if (cx >= 8 && cx <= 15 && cz === -6) return true;
  if (cx >= 22 && cx <= 30 && cz === -8) return true;
  if (cx >= 36 && cx <= 46 && cz === -11) return true;
  if (cx >= 33 && cx <= 46 && cz === 16) return true;
  return false;
}
function isBridgeChunk(cx: number, cz: number): boolean {
  for (const br of BRIDGES) {
    if (cx >= br.startCx && cx <= br.endCx && cz >= br.startCz && cz <= br.endCz) return true;
  }
  return false;
}
const BRIDGE_RANGES = BRIDGES;
const SIDEWALK_RAISE = 0.3;
/** Sidewalk zone: inner 55×55 of each 80×80 block in applicable biomes. */
function isOnSidewalk(x: number, z: number): boolean {
  const cx = Math.floor(x / 80);
  const cz = Math.floor(z / 80);
  const biome = getBiome(cx, cz);
  if (biome === 'beach' || biome === 'aeroport' || biome === 'bridge' || biome === 'bridge_connector' || biome === 'rural_farm' || biome === 'rural_hills' || biome === 'rural_mountain' || biome === 'rural_lakes' || biome === 'rural_desert') return false;
  const localX = ((x - cx * 80) + 80) % 80;
  const localZ = ((z - cz * 80) + 80) % 80;
  const halfRoad = (80 - 55) / 2; 
  return localX >= halfRoad && localX < 80 - halfRoad &&
    localZ >= halfRoad && localZ < 80 - halfRoad;
}
function bridgeYAt(x: number, br: BridgeDef): number {
  const rampStartX = (br.startCx - 1) * 80;
  const rampEndX = (br.endCx + 2) * 80;
  const deckStartX = br.startCx * 80;
  const deckEndX = (br.endCx + 1) * 80;
  if (x <= rampStartX) return 0;
  if (x >= rampEndX) return 0;
  if (x >= deckStartX && x <= deckEndX) return BRIDGE_DECK_Y;
  if (x < deckStartX) {
    const t = (x - rampStartX) / (deckStartX - rampStartX);
    return t * t * (3 - 2 * t) * BRIDGE_DECK_Y;
  } else {
    const t = (rampEndX - x) / (rampEndX - deckEndX);
    return t * t * (3 - 2 * t) * BRIDGE_DECK_Y;
  }
}
function getBeachHeight(x: number, z: number): number {
  const cx = Math.floor(x / 80);
  const cz = Math.floor(z / 80);
  const CHUNK = 80;
  let minDist = CHUNK;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dz] of dirs) {
    if (getBiome(cx + dx, cz + dz) === 'ocean') {
      const boundary = dx !== 0
        ? (dx > 0 ? (cx + 1) * CHUNK : cx * CHUNK)
        : (dz > 0 ? (cz + 1) * CHUNK : cz * CHUNK);
      const dist = dx !== 0 ? Math.abs(x - boundary) : Math.abs(z - boundary);
      if (dist < minDist) minDist = dist;
    }
  }
  // A broad, smooth tidal shelf: the shoreline reaches the waterline over
  // 44 world units instead of dropping at the beach/ocean biome seam. The
  // ocean surface sits at -2.5, so shallow water remains drivable before the
  // vehicle gradually becomes submerged.
  const shelfWidth = 44;
  const t = Math.max(0, Math.min(1, minDist / shelfWidth));
  const smooth = t * t * (3 - 2 * t);
  return -2.5 * (1 - smooth);
}
function isOnRoadGrid(x: number, z: number): boolean {
  const roadHalf = ROAD_HALF_WIDTH;
  const grid = GRID_PITCH;
  const nearGrid = (v: number) => {
    const frac = ((v % grid) + grid) % grid;
    return frac <= roadHalf || frac >= grid - roadHalf;
  };
  return nearGrid(x) || nearGrid(z);
}
export function getTerrainHeight(x: number, z: number, currentY?: number, forceBridgeDeck = false): number {
  const bridgeHit = getBridgeAtWorldPos(x, z);
  if (bridgeHit) {
    const deckY = bridgeYAt(x, bridgeHit);
    // Movement on foot and in a road vehicle must follow the raised roadway,
    // even while the previous frame's Y is still near sea level on a ramp.
    // Callers that are genuinely below the bridge (boats/helicopters) leave
    // forceBridgeDeck false so they continue to use the water beneath it.
    // Ground vehicles and pedestrians should always resolve to the bridge
    // profile while inside its collision corridor. Using the previous frame's
    // Y here caused a one-frame water fallback when crossing chunk seams.
    if (!forceBridgeDeck && currentY !== undefined && currentY < deckY - 1.5) {
      const deckStartX = bridgeHit.startCx * 80;
      const deckEndX = (bridgeHit.endCx + 1) * 80;
      if (x >= deckStartX && x <= deckEndX) return deckY;
    }
    return deckY;
  }
  const cx = Math.floor(x / 80);
  const cz = Math.floor(z / 80);
  const biome = getBiome(cx, cz);
  if (biome === 'bridge') {
    // Only the deck corridor is elevated. A sample off the corridor (grass or
    // water beside the bridge) must not snap to deck height just because it
    // sits near a road grid line — that lifted players walking next to the
    // bridge as if they were already on it.
    const bridge = BRIDGE_RANGES.find(br => cx >= br.startCx && cx <= br.endCx && cz >= br.startCz && cz <= br.endCz);
    const roadCenterZ = cz * CHUNK_SIZE;
    const corridorHalf = (ROAD_HALF_WIDTH * 2 + 10) / 2;
    if (bridge && Math.abs(z - roadCenterZ) <= corridorHalf && isOnRoadGrid(x, z)) {
      return bridgeYAt(x, bridge);
    }
    return -2.5;
  }
  if (biome === 'bridge_connector') {
    const bridge = BRIDGE_RANGES.find(br =>
      (cx === br.startCx - 1 && cz === br.startCz) ||
      (cx === br.endCx + 1 && cz === br.endCz));
    if (!bridge) return 0.0;
    // Same corridor rule as the deck: the approach ramp only carries traffic
    // inside its width; the rest of the connector chunk is flat ground.
    const roadCenterZ = cz * CHUNK_SIZE;
    const corridorHalf = (ROAD_HALF_WIDTH * 2 + 10) / 2;
    if (Math.abs(z - roadCenterZ) > corridorHalf) return 0.0;
    return bridgeYAt(x, bridge);
  }
  if (biome === 'ocean') {
    if (isOnRoadGrid(x, z)) return 0.0;
    // Keep the first ocean band as a continuation of the beach shelf. This
    // prevents the beach/ocean tile boundary from becoming a sheer drop.
    const adjacentBeach = getBiome(cx + 1, cz) === 'beach' || getBiome(cx - 1, cz) === 'beach'
      || getBiome(cx, cz + 1) === 'beach' || getBiome(cx, cz - 1) === 'beach';
    if (adjacentBeach) {
      const localX = x - cx * 80;
      const localZ = z - cz * 80;
      const edge = Math.min(localX, 80 - localX, localZ, 80 - localZ);
      const shelfT = Math.max(0, Math.min(1, edge / 32));
      return -2.5 * (1 - shelfT * shelfT * (3 - 2 * shelfT));
    }
    return -2.5;
  }
  if ((biome === 'rural_hills' || biome === 'rural_mountain') && isOnRoadGrid(x, z)) {
    return getMountainRoadHeight(x, z);
  }
  // Sample the same continuous foothill field in the adjacent lowland band.
  // This prevents a player/camera from switching from height 0 to full ridge
  // height on the first mountain chunk boundary.
  if (biome === 'city' || biome === 'suburb' || biome === 'parking_lot' || biome === 'beach' || biome === 'rural_farm' || biome === 'rural_lakes' || biome === 'rural_desert') {
    const nearbyMountain = getMountainHeight(x, z);
    if (nearbyMountain > 0.02) return nearbyMountain;
  }
  if ((biome === 'beach' || biome.startsWith('rural')) && isOnRoadGrid(x, z)) {
    // Mountain roads are cut into the continuous height field, while ordinary
    // rural roads stay at the shared lowland datum.
    if (biome === 'rural_hills' || biome === 'rural_mountain') return getMountainRoadHeight(x, z);
    return 0.0;
  }
  if (biome === 'rural_hills' || biome === 'rural_mountain') return getMountainHeight(x, z);
  if (biome === 'beach') {
    const base = getBeachHeight(x, z);
    if (isOnSidewalk(x, z)) return Math.max(base + SIDEWALK_RAISE, 0);
    return Math.max(base, 0);  
  }
  if (isOnSidewalk(x, z)) return SIDEWALK_RAISE;
  return 0.0;
}
export function isBoulevard(gridCoord: number): boolean {
  return ((gridCoord % 4) + 4) % 4 === 0;
}
export interface RoadNode { x: number; z: number; }
export interface RoadEdge { from: number; to: number; }
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
export interface EntityAnimator {
  currentAnimation: string;        
  time: number;                    
  loop: boolean;                   
  speed: number;                   
}
export interface EntityAnimatorSkeleton {
  boneParents: Int32Array;
  boneLocalMatrices: Float32Array;
  inverseBindMatrices: Float32Array;
  skinRootWorld: Float32Array;
  nodeToBoneIdx: Map<number, number>;
  boneCount: number;
  nodeNames: string[];
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
  private fogStartLoc: WebGLUniformLocation | null = null;
  private fogEndLoc: WebGLUniformLocation | null = null;
  private lightSpaceLoc: WebGLUniformLocation | null = null;
  private shadowMapLoc: WebGLUniformLocation | null = null;
  private numPointLightsLoc: WebGLUniformLocation | null = null;
  private pointLightPosLoc: WebGLUniformLocation | null = null;
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
  private skyViewMatrix = mat4.create();
  projMatrix = mat4.create();
  private modelMatrix = mat4.create();
  private chunkCache = new Map<string, CityChunk>();
  private meshCache = new Map<string, CityMesh>();
  private gltfCache = new Map<string, Promise<CityMesh[] | null>>();
  private _scratchNormalMat = new Float32Array(9);
  private _scratchTranslate: [number, number, number] = [0, 0, 0];
  // Reuse CPU-skinning buffers. Allocating and copying a full VBO for every
  // human on every frame creates heavy garbage-collection spikes.
  private readonly _skinScratch = new Map<CityMesh, Float32Array>();
  private readonly _jointScratch = new Map<number, Float32Array>();
  private _lastSkinTime = 0;
  private static readonly HUMAN_SKIN_INTERVAL = 1 / 30;
  private _scratchScale: [number, number, number] = [1, 1, 1];
  public playerMesh: CityMesh | CityMesh[] | null = null;
  public lampMesh: CityMesh | CityMesh[] | null = null;
  public npcMesh: CityMesh | CityMesh[] | null = null;
  public npcMeshes: CityMesh[][] = [];
  public busMesh: CityMesh[] | null = null;
  /** Procedural cop meshes are generated by the same animated human rig as pedestrians. */
  public carMeshes: CityMesh[][] = [];
  public boatMeshes: CityMesh[][] = [];
  public helicopterMeshes: CityMesh[][] = [];
  private proceduralHelicopterMeshes: { regular: CityMesh[]; police: CityMesh[] } | null = null;
  private proceduralHelicopterRotorMesh: CityMesh | null = null;
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
    'ecds_old_building_06', 'ecds_old_building_07',
    'low_polly_building', 'low_poly_apartment_building_2', 'low_poly_apartment_building_3',
    'low_poly_cinema', 'low_poly_city_hall', 'low_poly_hotel_1', 'low_poly_hotel_2',
    'low_poly_pharmacy', 'low_poly_police_station', 'low_poly_school', 'low_poly_shopping_center',
    'panel_apartment_placeholder', 'pyaterochka_3d',
    'abandoned_building_gameready', 'building_1_low_poly',
    'psx_japanese_warehouse', 'low_poly_apartment_building_1',
    'fatboys_diner', 'brooklyn_street_building_low_poly', 'brooklyn_street_cornerhouse_low_poly',
    'okraglak_round_office_building_poznan',
    'psxprop_-_old_warehouse',
  ];
  static SUBURB_BUILDING_NAMES = [
    'brooklynCornerhouse', 'brooklynStreetBuilding', 'cabin',
    'hungry_jacks_restaurant_low_poly',
    'low_poly_burger_restaurant', 'low_poly_cafe', 'low_poly_generic_restaurant', 'low_poly_generic_shop',
    'low_poly_house_2', 'low_poly_house_3', 'low_poly_house_4', 'low_poly_house_5',
    'low_poly_pizza_restaurant', 'low_poly_wooden_cabine', 'ichijoushi_002',
    'low_poly_apartment_building_1', 'low_poly_house_1', 'fatboys_diner', 'psxprop_-_old_warehouse',
  ];
  public trafficLightMesh: CityMesh[] | null = null;
  public hydrantMesh: CityMesh[] | null = null;
  public benchMeshes: CityMesh[][] = [];
  public barrelMesh: CityMesh[] | null = null;
  public jumpRampMesh: CityMesh | null = null;
  public jumpRamps: { id: number; x: number; z: number; yaw: number }[] = [];
  public chickenMesh: CityMesh[] | null = null;
  public palmTreeMesh: CityMesh[] | null = null;
  public cityTreeMesh: CityMesh[] | null = null;
  public cylindricalTowerMesh: CityMesh[] | null = null;
  public tropicalShopMesh: CityMesh[] | null = null;
  public ruralShopMesh: CityMesh[] | null = null;
  public tatamiRoomMesh: CityMesh[] | null = null;
  public woodenCabineMesh: CityMesh[] | null = null;
  public balloonMesh: CityMesh[] | null = null;
  /** Lightweight procedural station shell; the forecourt stays open for cars. */
  public gasStationMesh: CityMesh[] | null = null;
  /** Procedural convenience-store interior/exterior model. */
  public convenienceStoreMesh: CityMesh[] | null = null;
  public convenienceStoreDoorOpen = false;
  public explodedBarrels: Set<string> = new Set();
  public explodedGasStations: Set<string> = new Set();
  public explodedGasStationTimers: Map<string, number> = new Map();
  public deadChickens: Set<string> = new Set();
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
  getNearbyChickens(x: number, z: number, radius: number): { x: number; z: number }[] {
    const result: { x: number; z: number }[] = [];
    const pcx = Math.floor(x / CHUNK_SIZE);
    const pcz = Math.floor(z / CHUNK_SIZE);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.getCityChunk(pcx + dx, pcz + dz);
        if (!chunk) continue;
        for (const chicken of chunk.chickens) {
          const key = `${chicken.x},${chicken.z}`;
          if (this.deadChickens.has(key)) continue;
          if (Math.hypot(chicken.x - x, chicken.z - z) < radius) {
            result.push(chicken);
          }
        }
      }
    }
    return result;
  }
  /**
   * Street-facing half-depth (world units) of a supermarket building, used to
   * place its front door. Matches the component's building-collision extents.
   */
  private supermarketHalfDepth(model: CityMesh[], scale: [number, number, number], yaw: number): number {
    let mx = 0, mz = 0;
    for (const m of model) {
      if (m.minX === undefined || m.maxX === undefined || m.minZ === undefined || m.maxZ === undefined) continue;
      mx = Math.max(mx, (m.maxX - m.minX) / 2);
      mz = Math.max(mz, (m.maxZ - m.minZ) / 2);
    }
    const rs = model.length > 0 ? (model[0].renderScale ?? 1) : 1;
    const hw = mx * (scale[0] ?? 1) * rs;
    const hd = mz * (scale[2] ?? 1) * rs;
    const rot = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const swap = Math.abs(rot - Math.PI / 2) < 0.01 || Math.abs(rot - Math.PI * 3 / 2) < 0.01;
    return swap ? hw : hd;
  }
  getNearbySupermarkets(x: number, z: number, radius: number): { x: number; z: number; yaw: number; hd: number; isConvenience?: boolean }[] {
    const result: { x: number; z: number; yaw: number; hd: number; isConvenience?: boolean }[] = [];
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
  private createConvenienceStoreMesh(): CityMesh[] {
    const verts: number[] = [];
    const indices: number[] = [];
    let offset = 0;
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, r: number, g: number, b: number) => {
      this.addBox(verts, indices, x, y, z, w, h, d, r, g, b, 1, offset);
      offset += 24;
    };
    // A low shell with a generous front opening: the player can enter without
    // fighting a solid GLTF collision box. Layered walls and a roof lip give
    // the shop a more believable storefront silhouette.
    box(0, 3.5, 11, 28, 7, 5, 0.16, 0.18, 0.20);
    box(-12.5, 3.5, 0, 3, 7, 22, 0.18, 0.20, 0.22);
    box(12.5, 3.5, 0, 3, 7, 22, 0.18, 0.20, 0.22);
    box(0, 7.2, 0, 28, 0.8, 24, 0.20, 0.22, 0.24);
    box(0, 7.68, 0, 29, 0.22, 24.5, 0.78, 0.08, 0.04);
    box(0, 7.84, 0, 28.4, 0.12, 23.8, 0.12, 0.14, 0.16);
    // Bright fascia and front sign, with an inset sign face and corner bands.
    box(0, 6.8, -11.2, 25, 1.4, 0.35, 0.86, 0.12, 0.04);
    box(0, 6.85, -11.42, 15, 0.45, 0.08, 1.0, 0.82, 0.18);
    box(-10.2, 6.85, -11.48, 3.2, 0.55, 0.1, 0.95, 0.2, 0.06);
    box(10.2, 6.85, -11.48, 3.2, 0.55, 0.1, 0.95, 0.2, 0.06);
    // Large front windows make the open entrance visually readable from the street.
    box(-8.2, 3.6, -11.05, 5.8, 4.2, 0.1, 0.04, 0.16, 0.22);
    box(8.2, 3.6, -11.05, 5.8, 4.2, 0.1, 0.04, 0.16, 0.22);
    box(-8.2, 3.6, -11.13, 5.3, 0.12, 0.12, 0.12, 0.45, 0.58);
    box(8.2, 3.6, -11.13, 5.3, 0.12, 0.12, 0.12, 0.45, 0.58);
    // Shelves, products, and a checkout counter around the register.
    for (const x of [-8, -2, 4]) {
      box(x, 1.8, 2, 1.0, 3.2, 10, 0.35, 0.24, 0.15);
      box(x, 3.5, 2, 1.25, 0.15, 10.4, 0.62, 0.42, 0.22);
      for (let row = 0; row < 3; row++) box(x, 1.0 + row * 0.85, -2.3, 0.65, 0.45, 0.3, 0.85, 0.30 + row * 0.08, 0.10);
    }
    box(8, 1.1, -5, 5.5, 1.8, 1.2, 0.42, 0.20, 0.10);
    box(8, 2.15, -5, 0.8, 0.5, 0.55, 0.08, 0.08, 0.07);
    // Door frame and an animated door panel. Open state is rendered as a
    // separate visual transform in render(), while the opening stays passable.
    box(-3, 2.8, -11, 0.35, 5.6, 0.35, 0.75, 0.78, 0.80);
    box(3, 2.8, -11, 0.35, 5.6, 0.35, 0.75, 0.78, 0.80);
    box(0, 0.18, -11.28, 7.0, 0.28, 0.8, 0.24, 0.25, 0.26);
    const mesh = this.createMesh(verts, indices);
    mesh.carName = 'convenience_store_procedural';
    mesh.minX = -14; mesh.maxX = 14; mesh.minZ = -12; mesh.maxZ = 14;
    return [mesh];
  }
  getConvenienceStoreMesh(): CityMesh[] {
    if (!this.convenienceStoreMesh) this.convenienceStoreMesh = this.createConvenienceStoreMesh();
    return this.convenienceStoreMesh;
  }
  private createGasStationMesh(): CityMesh[] {
    const verts: number[] = [];
    const indices: number[] = [];
    let offset = 0;
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, r: number, g: number, b: number) => {
      this.addBox(verts, indices, x, y, z, w, h, d, r, g, b, 1, offset);
      offset += 24;
    };
    // Service building: layered fascia, windows and a recessed entrance make
    // the silhouette read as a small real convenience store rather than one
    // untextured block. The footprint stays unchanged for collision safety.
    box(0, 3.5, 13, 24, 7, 7, 0.16, 0.18, 0.20);
    box(0, 6.55, 9.35, 22.8, 0.35, 0.18, 0.82, 0.12, 0.04);
    box(-6.8, 3.35, 9.35, 3.2, 2.4, 0.12, 0.05, 0.18, 0.24);
    box(6.8, 3.35, 9.35, 3.2, 2.4, 0.12, 0.05, 0.18, 0.24);
    box(0, 2.5, 9.35, 2.8, 4.4, 0.14, 0.04, 0.05, 0.06);
    box(0, 4.9, 9.25, 1.0, 0.16, 0.18, 0.9, 0.9, 0.82);
    box(0, 7.5, 2, 30, 0.8, 25, 0.12, 0.14, 0.16);
    for (const x of [-13, 13]) for (const z of [-8, 12]) {
      box(x, 3.8, z, 0.65, 7.2, 0.65, 0.82, 0.84, 0.86);
      box(x, 7.25, z, 0.92, 0.18, 0.92, 0.95, 0.95, 0.92);
    }
    for (const x of [-7, 0, 7]) {
      box(x, 0.65, -1, 1.2, 1.3, 2.2, 0.85, 0.18, 0.08);
      box(x, 1.45, -1, 0.9, 0.25, 1.8, 0.94, 0.94, 0.88);
      box(x, 1.73, -1, 0.62, 0.08, 1.45, 0.12, 0.14, 0.16);
    }
    // Branded canopy trim and a taller pylon sign.
    box(0, 7.98, 2, 30.4, 0.16, 25.4, 0.95, 0.13, 0.04);
    box(0, 7.82, 2, 29.6, 0.12, 24.6, 1.0, 0.78, 0.12);
    box(0, 11, 14, 2.2, 7, 0.7, 0.18, 0.20, 0.22);
    box(0, 14.5, 14, 7.5, 1.8, 0.8, 0.92, 0.12, 0.04);
    box(0, 14.5, 13.5, 5.5, 0.35, 0.82, 1.0, 0.78, 0.12);
    const mesh = this.createMesh(verts, indices);
    mesh.carName = 'gas_station_procedural';
    mesh.minX = -15; mesh.maxX = 15; mesh.minZ = -10; mesh.maxZ = 17;
    return [mesh];
  }
  getGasStationMesh(): CityMesh[] {
    if (!this.gasStationMesh) this.gasStationMesh = this.createGasStationMesh();
    return this.gasStationMesh;
  }
  getNearbyGasStations(x: number, z: number, radius: number): { x: number; z: number }[] {
    const result: { x: number; z: number }[] = [];
    const pcx = Math.floor(x / CHUNK_SIZE);
    const pcz = Math.floor(z / CHUNK_SIZE);
    // Scan every chunk that could fall inside the radius (the minimap queries
    // a wide area, the repair scan a tight one — both share this method).
    const cr = Math.max(1, Math.ceil(radius / CHUNK_SIZE));
    for (let dz = -cr; dz <= cr; dz++) {
      for (let dx = -cr; dx <= cr; dx++) {
        const chunk = this.getCityChunk(pcx + dx, pcz + dz);
        if (!chunk) continue;
        for (const bld of chunk.buildings) {
          const key = `${bld.x},${bld.z}`;
          if (this.explodedGasStations.has(key)) continue;
          if (!bld.model || bld.model.length === 0) continue;
          if (!bld.model[0].carName || !bld.model[0].carName.includes('gas_station')) continue;
          if (Math.hypot(bld.x - x, bld.z - z) < radius) {
            result.push({ x: bld.x, z: bld.z });
          }
        }
      }
    }
    return result;
  }
  /** Nearest police-station building within the radius (or null) — used for
   *  the arrest respawn so a busted player wakes up at the station. Includes
   *  the building's yaw and street-facing half-depth so the caller can place
   *  the spawn at the front door instead of the building's center. */
  getNearestPoliceStation(x: number, z: number, radius: number): { x: number; z: number; yaw: number; hd: number } | null {
    let best: { x: number; z: number; yaw: number; hd: number } | null = null;
    let bestDist = Infinity;
    const pcx = Math.floor(x / CHUNK_SIZE);
    const pcz = Math.floor(z / CHUNK_SIZE);
    const cr = Math.max(1, Math.ceil(radius / CHUNK_SIZE));
    for (let dz = -cr; dz <= cr; dz++) {
      for (let dx = -cr; dx <= cr; dx++) {
        const chunk = this.getCityChunk(pcx + dx, pcz + dz);
        if (!chunk) continue;
        for (const bld of chunk.buildings) {
          if (!bld.model || bld.model.length === 0) continue;
          if (!bld.model[0].carName || !bld.model[0].carName.includes('police_station')) continue;
          const d = Math.hypot(bld.x - x, bld.z - z);
          if (d < bestDist) {
            bestDist = d;
            best = { x: bld.x, z: bld.z, yaw: bld.yaw ?? 0, hd: this.supermarketHalfDepth(bld.model, bld.scale, bld.yaw ?? 0) };
          }
        }
      }
    }
    return best;
  }
  /** All police-station buildings within the radius (each with the building's
   *  yaw and street-facing half-depth so callers can compute front-door
   *  positions) — used for the ambient station-cop spawns. */
  getPoliceStationsNear(x: number, z: number, radius: number): { x: number; z: number; yaw: number; hd: number }[] {
    const result: { x: number; z: number; yaw: number; hd: number }[] = [];
    const pcx = Math.floor(x / CHUNK_SIZE);
    const pcz = Math.floor(z / CHUNK_SIZE);
    const cr = Math.max(1, Math.ceil(radius / CHUNK_SIZE));
    for (let dz = -cr; dz <= cr; dz++) {
      for (let dx = -cr; dx <= cr; dx++) {
        const chunk = this.getCityChunk(pcx + dx, pcz + dz);
        if (!chunk) continue;
        for (const bld of chunk.buildings) {
          if (!bld.model || bld.model.length === 0) continue;
          if (!bld.model[0].carName || !bld.model[0].carName.includes('police_station')) continue;
          if (Math.hypot(bld.x - x, bld.z - z) > radius) continue;
          result.push({ x: bld.x, z: bld.z, yaw: bld.yaw ?? 0, hd: this.supermarketHalfDepth(bld.model, bld.scale, bld.yaw ?? 0) });
        }
      }
    }
    return result;
  }
  isGasPumpAtPoint(x: number, z: number, radius: number): boolean {
    const stations = this.getNearbyGasStations(x, z, radius + 20);
    for (const station of stations) {
      for (const px of [-7, 0, 7]) {
        // Include the complete pump housing, not only its center point. This
        // keeps the left and right pump collision footprints consistent with
        // the middle pump when a vehicle clips them at an angle.
        if (Math.hypot(x - (station.x + px), z - (station.z - 1)) <= radius + 0.55) return true;
      }
    }
    return false;
  }
  getGasStationAtPoint(x: number, z: number): { x: number; z: number } | null {
    const pcx = Math.floor(x / CHUNK_SIZE);
    const pcz = Math.floor(z / CHUNK_SIZE);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.getCityChunk(pcx + dx, pcz + dz);
        if (!chunk) continue;
        for (const bld of chunk.buildings) {
          const key = `${bld.x},${bld.z}`;
          if (this.explodedGasStations.has(key)) continue;
          if (!bld.model || bld.model.length === 0) continue;
          if (!bld.model[0].carName || !bld.model[0].carName.includes('gas_station')) continue;
          let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
          const meshes = Array.isArray(bld.model) ? bld.model : [bld.model];
          for (const m of meshes) {
            const rs = m.renderScale ?? 1;
            const sx = bld.scale[0] * rs;
            const sz = bld.scale[2] * rs;
            const hw = (m.maxX !== undefined && m.minX !== undefined) ? (m.maxX - m.minX) / 2 * sx : 8;
            const hd = (m.maxZ !== undefined && m.minZ !== undefined) ? (m.maxZ - m.minZ) / 2 * sz : 8;
            const rot = bld.yaw;
            const cos = Math.cos(rot), sin = Math.sin(rot);
            for (const c of [{ x: -hw, z: -hd }, { x: hw, z: -hd }, { x: hw, z: hd }, { x: -hw, z: hd }]) {
              const wx = bld.x + c.x * cos - c.z * sin;
              const wz = bld.z + c.x * sin + c.z * cos;
              if (wx < minX) minX = wx;
              if (wx > maxX) maxX = wx;
              if (wz < minZ) minZ = wz;
              if (wz > maxZ) maxZ = wz;
            }
          }
          if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
            return { x: bld.x, z: bld.z };
          }
        }
      }
    }
    return null;
  }
  public currentModelUrl: string | null = null;
  public droppedWeapons: any[] = [];
  public carFireElapsed = 0;
  public firstPersonArmsMesh: CityMesh[] | null = null;
  public firstPersonArmsSkeleton: {
    boneParents: Int32Array;
    boneLocalMatrices: Float32Array;      
    inverseBindMatrices: Float32Array;
    skinRootWorld: Float32Array;
    nodeToBoneIdx: Map<number, number>;
    boneCount: number;
    nodeNames: string[];                  
  } | null = null;
  private _fpArmsPunchOverride = false;
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
  private _mark23AnimTime = 0;
  private _mark23AnimName = '';
  public entityAnimators: Map<number, EntityAnimator> = new Map();
  private _meshAnimData: WeakMap<CityMesh, { animations: GltfAnimation[] | null; skeleton: EntityAnimatorSkeleton | null }> = new WeakMap();
  public skelBoneParents: Int32Array | null = null;
  public skelBoneLocalMatrices: Float32Array | null = null;
  public skelInverseBindMatrices: Float32Array | null = null;
  public skelBoneCount = 0;
  public skelNodeToBoneIdx: Map<number, number> | null = null;
  public skelJointMatrices: Float32Array | null = null;
  public skelBindWorldMatrices: Float32Array | null = null;
  public skelBindJointMatrices: Float32Array | null = null;
  public skelSkinRootWorld: Float32Array | null = null;
  public skelNodeNames: string[] = [];
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
  public playerAttack: 'punch' | 'kick' = 'punch';
  public playerWeapon = 0;
  public playerFireWeapon = 0;
  public playerFireTime = 0;
  public playerAimPitch = 0;
  /** Camera aim direction (yaw) the crosshair/bullets use; the drawn weapon
   * rotates toward this so the gun visibly points where you shoot. */
  public playerAimYaw = 0;
  // Smoothed third-person gun pitch: eases up to point the muzzle at the
  // crosshair while firing, then relaxes back to a calm resting aim so the gun
  // visibly "aims then resets" on each shot instead of being frozen to aimPitch.
  public weaponPitch = 0;
  /** Smoothed third-person gun yaw — eases toward the aim direction so the
   * barrel swings to the crosshair instead of staying locked to the walk facing. */
  public weaponYaw = 0;
  public playerIsInCar = false;
  public playerVehicleMesh: CityMesh | CityMesh[] | null = null;
  public playerVehicleType: string = 'car';
  private _playerSkinAccumulator = 0;
  /** Per-entity punch/swing timers (keyed by entity id, seconds remaining). */
  public punchTimers = new Map<number, number>();
  /** Entities currently held in the arrest grab pose (arm extended toward the
   *  victim while a foot cop books the caught player). */
  public arrestingEntities = new Set<number>();
  /** Ducking peds (gunfire reaction) held in the crouch-and-cover pose. */
  public duckingEntities = new Set<number>();
  /** Per-entity flinch timers (a landed punch squashes the victim briefly). */
  public flinchTimers = new Map<number, number>();
  public playerCarSpeed = 0;
  public playerSteerInput = 0;
  private _mopedWheelMesh: CityMesh | null = null;
  private _mopedSpin = 0;
  private _mopedFrontSteer = 0;
  private sunDir = [0.3, 0.8, 0.3];
  private moonDir = [0, -1, 0];
  private dayBlend = 1.0;
  // Stable daylight fill keeps low-poly vertex colors readable on every face.
  private lightColor = [0.82, 0.84, 0.88];
  private ambientColor = [0.82, 0.84, 0.90];
  private skyColor = [0.7, 0.8, 0.9];
  private dayBlendLoc: WebGLUniformLocation | null = null;
  public isMobile = false;
  private shadowMapSize = 2048;
  reduceShadowMap() { this.shadowMapSize = 1024; this.setupShadowFBO(); }
  private setupShadowFBO() {
    const gl = this.gl;
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
  }
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
uniform float uFogStart;
uniform float uFogEnd;
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
  vec3 L = normalize(uLightDir);
  float diff = max(dot(N, L), 0.0);
  vec3 R = reflect(-L, N);
  float spec = pow(max(dot(R, V), 0.0), 32.0);
  // Keep direct lighting deliberately restrained and use a strong fill light.
  // This removes harsh black faces while retaining enough directional shading
  // for depth and readable silhouettes.
  vec3 ambient = uAmbientColor * baseColor.rgb;
  vec3 diffuse = (1.0 - shadow * 0.35) * diff * uLightColor * baseColor.rgb * 0.72;
  vec3 specular = (1.0 - shadow * 0.25) * spec * uLightColor * vec3(0.35);
  vec3 pointLightContribution = vec3(0.0);
  for(int i = 0; i < MAX_POINT_LIGHTS; i++) {
    if(i >= uNumPointLights) break;
    vec3 lightVec = uPointLightPos[i] - vWorldPos;
    float dist = length(lightVec);
    if(dist < 80.0) {
      float atten = 1.0 - (dist / 80.0);
      atten = atten * atten; 
      vec3 pL = lightVec / dist;
      float pDiff = max(dot(N, pL), 0.0);
      pointLightContribution += pDiff * vec3(1.0, 0.85, 0.5) * atten * baseColor.rgb * 0.5;
      vec3 pR = reflect(-pL, N);
      float pSpec = pow(max(dot(pR, V), 0.0), 16.0);
      pointLightContribution += pSpec * vec3(1.0, 0.85, 0.5) * atten * 0.8;
    }
  }
  vec3 color = ambient + diffuse + specular + pointLightContribution;
  // Reliable daylight floor: materials stay readable even when the shadow map
  // or a face normal points away from the sun.    color = max(color, baseColor.rgb * 0.58);
  color += baseColor.rgb * 0.10;
  float fog = clamp((vDepth - uFogStart) / max(uFogEnd - uFogStart, 1.0), 0.0, 1.0);
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
    this.fogStartLoc = gl.getUniformLocation(this.program, 'uFogStart');
    this.fogEndLoc = gl.getUniformLocation(this.program, 'uFogEnd');
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
    this.setupShadowFBO();
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
    // Keep the authored/procedural sky readable even when a texture is still
    // loading or contains dark pixels; the gradient supplies the daylight fill.
    vec3 skyColor = mix(texColor, gradColor, 0.62);
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
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aColor;
layout(location = 3) in vec2 aUV;
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
    gl.disable(gl.BLEND);

    // The authored sky asset is a camera-sized cube. Keep it centered on the
    // camera so its world-space origin cannot leave the view after driving away
    // from spawn. Fall back to the procedural sky when the texture is absent.
    const texturedSky = this.skyboxMesh?.some(m => !!m.texture);
    // A partially loaded/invalid authored sky must not replace the reliable
    // procedural sky with an empty draw. Require an actual drawable mesh.
    const drawableSky = this.skyboxMesh?.some(m => !!m.texture && !!m.vao && m.indexCount > 0);
    if (texturedSky && drawableSky && this.gltfSkyProgram && this.skyboxMesh) {
      gl.useProgram(this.gltfSkyProgram);
      gl.uniformMatrix4fv(this.gltfSkyProjLoc, false, this.projMatrix);
      mat4.identity(this.modelMatrix);
      // This asset is authored at a very large world scale (its embedded node
      // transform still leaves a roughly 250,000-unit cube). Bring it down to
      // a camera-sized shell instead of multiplying it by 500, which pushed
      // the vertices beyond useful depth/precision and left only the clear
      // color visible.
      // loadGLTF already normalizes imported models to a camera-sized mesh.
      // Applying another 0.001 scale shrinks this sky cube out of view.
      mat4.scale(this.modelMatrix, this.modelMatrix, [1, 1, 1]);
      for (const mesh of this.skyboxMesh) {
        if (!mesh.texture || !mesh.vao || mesh.indexCount <= 0) continue;
        gl.uniformMatrix4fv(this.gltfSkyViewLoc, false, this.skyViewMatrix);
        gl.uniformMatrix4fv(this.gltfSkyModelLoc, false, this.modelMatrix);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, mesh.texture);
        gl.uniform1i(this.gltfSkyTexLoc, 0);
        gl.bindVertexArray(mesh.vao);
        gl.drawElements(gl.TRIANGLES, mesh.indexCount, mesh.indexType || gl.UNSIGNED_SHORT, 0);
      }
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
    } else {
      gl.useProgram(this.skyProgram);
      gl.uniformMatrix4fv(this.skyProjLoc, false, this.projMatrix);
      gl.uniformMatrix4fv(this.skyViewLoc, false, this.skyViewMatrix);
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
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.depthMask(true);
  }
  async initPlayerModel(modelUrl?: string, needsFlip: boolean = true, appearanceRole: Role = 'generic', appearanceSeed: number | string = 1, appearanceGender?: string): Promise<void> {
    // All humanoids use the shared procedural rig; modelUrl is retained only
    // for API compatibility with older callers and is intentionally ignored.
    this.currentModelUrl = null;
    this.skelNodeNames = [];
    this.skelIsReady = false;
    this.playerMesh = this.getPlayerMesh([0.2, 0.5, 0.8], appearanceRole, appearanceSeed, appearanceGender);
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
    outLocal.set(skeleton.boneLocalMatrices);
    let time = t;
    if (anim.duration > 0) time = time % anim.duration;
    for (const ch of anim.channels) {
      const boneIdx = skeleton.nodeToBoneIdx.get(ch.nodeIndex);
      if (boneIdx === undefined) continue;
      const s = ch.sampler;
      const n = s.input.length;
      if (n === 0) continue;
      let i = 0;
      while (i < n - 1 && s.input[i + 1] <= time) i++;
      const comp = ch.path === 'rotation' ? 4 : 3;
      const interp = s.interpolation;
      const cubic = interp === 'CUBICSPLINE';   
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
        v1 = v0;   
      }
      const mOff = boneIdx * 16;
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
        outLocal[mOff + 0] = x;
        outLocal[mOff + 5] = y;
        outLocal[mOff + 10] = z;
      } else if (ch.path === 'rotation') {
        let qx = v0[0], qy = v0[1], qz = v0[2], qw = v0[3];
        if (interp !== 'STEP') {
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
    outJoint: Float32Array        
  ): void {
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
      if (!mesh.restPositions || !mesh.jointIndices || !mesh.jointWeights || !mesh.vertexCount) continue;
      if (!mesh.originalVBO) continue;
      const vCount = mesh.vertexCount;
      let newData = this._skinScratch.get(mesh);
      if (!newData || newData.length !== mesh.originalVBO.length) {
        newData = new Float32Array(mesh.originalVBO.length);
        this._skinScratch.set(mesh, newData);
      }
      newData.set(mesh.originalVBO);
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
  /** Find the best animation matching a desired state (idle, walk, run) */
  matchAnimationName(animations: GltfAnimation[], state: 'idle' | 'walk' | 'run' | 'drive'): string | null {
    if (!animations || animations.length === 0) return null;
    const keywords: Record<string, string[]> = {
      idle: ['idle', 'idle_', '_idle', 'standing', 'breathing'],
      walk: ['walk', 'walking', 'walk_', '_walk', 'jog', 'jogging'],
      run: ['run', 'running', 'sprint', 'sprinting'],
      drive: ['drive', 'driving', 'steer', 'steering'],
    };
    const targets = keywords[state];
    const lowerTargets = targets.map(t => t.toLowerCase());
    let best: { name: string; score: number } | null = null;
    for (const anim of animations) {
      const name = anim.name.toLowerCase();
      for (let i = 0; i < lowerTargets.length; i++) {
        if (name === lowerTargets[i]) {
          const score = 100 - i;
          if (!best || score > best.score) best = { name: anim.name, score };
        }
      }
      for (let i = 0; i < lowerTargets.length; i++) {
        if (name.includes(lowerTargets[i])) {
          const score = 50 - i;
          if (!best || score > best.score) best = { name: anim.name, score };
        }
      }
    }
    if (!best && animations.length > 0) {
      best = { name: animations[0].name, score: 0 };
    }
    return best ? best.name : null;
  }
  /**
   * Update an entity's animation state and CPU-skin its mesh.
   * Returns true if the mesh was skinned (caller should then drawMesh).
   * For entities without skeleton data, this is a no-op (returns false).
   */
  animateAndSkinEntity(
    entityId: number,
    entityMesh: CityMesh | CityMesh[],
    state: 'idle' | 'walk' | 'run' | 'drive',
    dt: number,
    speed: number = 1
  ): boolean {
    const meshes = Array.isArray(entityMesh) ? entityMesh : [entityMesh];
    // Distant characters are visually negligible but still expensive to CPU
    // skin. Their last pose is retained until they return to the near field.
    const anyMesh = meshes[0] as any;
    const distanceSq = anyMesh?._lastAnimDistanceSq;
    if (typeof distanceSq === 'number' && distanceSq > 220 * 220) return false;
    if (meshes.length === 0) return false;
    let animData = this._meshAnimData.get(meshes[0]);
    if (!animData) {
      const src = meshes.find(m => m.skeleton);
      if (!src || !src.skeleton) return false;
      animData = { animations: src.animations ?? null, skeleton: src.skeleton ?? null };
      meshes.forEach(m => this._meshAnimData.set(m, animData!));
    }
    const { animations, skeleton } = animData;
    if (!skeleton || skeleton.boneCount === 0) return false;
    // ——— Procedural lifelike humans (no baked clips) — walk / run / punch / fire via math ———
    const isHuman = (meshes[0] as any).isHuman;      if (isHuman && (!animations || animations.length === 0)) {

      // maintain per-entity walk phase
      let animator = this.entityAnimators.get(entityId);
      if (!animator) {
        animator = { currentAnimation: state, time: 0, loop: true, speed: 1 };
        this.entityAnimators.set(entityId, animator);
      }
      if (animator.currentAnimation !== state) { animator.currentAnimation = state; animator.time = 0; }
      animator.time += dt * speed * (state === 'run' ? 1.6 : 1);
      let localMatrices = this._jointScratch.get(entityId);
      if (!localMatrices || localMatrices.length !== skeleton.boneCount * 16) {
        localMatrices = new Float32Array(skeleton.boneCount * 16);
        this._jointScratch.set(entityId, localMatrices);
      }
      localMatrices.set(skeleton.boneLocalMatrices);
      // walk cycle — hips bob + thigh/shin + arm swing
      if (state === 'walk' || state === 'run') {
        const swing = state === 'run' ? 0.46 : 0.30;
        const variation = 0.88 + ((entityId * 17) % 23) / 100;
        const gait = Math.max(0.75, Math.min(1.18, speed * variation));
        const t = animator.time * (state === 'run' ? 5.2 : 3.4) * gait;
        const thighL = 13, shinL = 14, thighR = 16, shinR = 17;
        const armL = 6, foreL = 7, armR = 10, foreR = 11;
        const hips = 0;
        const applyX = (bone:number, ang:number) => {
          if (bone <0 || bone >= skeleton.boneCount) return;
          const m = new Float32Array(localMatrices.buffer, bone*64, 16);
          const qx = Math.sin(ang/2), qw = Math.cos(ang/2);
          const rot = new Float32Array([1,0,0,0, 0,qw, qx,0, 0,-qx,qw,0, 0,0,0,1]);
          // multiply: m = m * rot  (approx, local space)
          const tmp = new Float32Array(16);
          for(let r=0;r<4;r++) for(let c=0;c<4;c++){ let v=0; for(let k=0;k<4;k++) v+=m[r*4+k]*rot[k*4+c]; tmp[r*4+c]=v; }
          for(let i=0;i<16;i++) m[i]=tmp[i];
        };
        applyX(thighL, Math.sin(t)*swing);
        applyX(shinL, Math.max(0, -Math.sin(t))*0.42);
        applyX(thighR, Math.sin(t+Math.PI)*swing);
        applyX(shinR, Math.max(0, -Math.sin(t+Math.PI))*0.42);
        applyX(armL, Math.sin(t+Math.PI)*swing*0.55);
        applyX(foreL, -0.08);
        applyX(armR, Math.sin(t)*swing*0.55);
        applyX(foreR, -0.08);
        if (hips>=0){ const hm = new Float32Array(localMatrices.buffer, hips*64,16); hm[13] += Math.abs(Math.sin(t))* -0.03; hm[12] += Math.sin(t * 0.5) * 0.012; }
        // A small counter-rotation through the chest and head makes the gait
        // feel less mechanical while keeping the feet planted.
        const chest = 2, neck = 3, head = 4;
        applyX(chest, Math.sin(t + Math.PI / 2) * 0.045);
        applyX(neck, Math.sin(t + Math.PI / 2) * -0.025);
        applyX(head, Math.sin(t + Math.PI / 2) * -0.018);
      } else if (state === 'drive') {
        const armL=6, foreL=7, armR=10, foreR=11, thighL=13, thighR=16;
        const applyX = (bone:number, ang:number)=>{ if(bone<0) return; const m=new Float32Array(localMatrices.buffer,bone*64,16); const qx=Math.sin(ang/2),qw=Math.cos(ang/2); const rot=new Float32Array([1,0,0,0,0,qw,qx,0,0,-qx,qw,0,0,0,0,1]); const tmp=new Float32Array(16); for(let r=0;r<4;r++) for(let c=0;c<4;c++){let v=0; for(let k=0;k<4;k++) v+=m[r*4+k]*rot[k*4+c]; tmp[r*4+c]=v;} for(let i=0;i<16;i++) m[i]=tmp[i]; };
        applyX(armL,-0.55); applyX(foreL,-0.85); applyX(armR,-0.55); applyX(foreR,-0.85);
        const thighLIdx=13, thighRIdx=16;
        applyX(thighLIdx, -1.05); applyX(thighRIdx, -1.05);
      }
      // punch / fire overrides (visible to peers)
      const punchLeft = this.punchTimers.get(entityId) ?? 0;
      if (punchLeft > 0) {
        const t = punchLeft/0.3; const a = t<0.5? t*2 : 2 - t*2;
        const armR=10, foreR=11;
        const applyX2 = (bone:number, ang:number)=>{ if(bone<0) return; const m=new Float32Array(localMatrices.buffer,bone*64,16); const qx=Math.sin(ang/2),qw=Math.cos(ang/2); const rot=new Float32Array([1,0,0,0,0,qw,qx,0,0,-qx,qw,0,0,0,0,1]); const tmp=new Float32Array(16); for(let r=0;r<4;r++) for(let c=0;c<4;c++){let v=0; for(let k=0;k<4;k++) v+=m[r*4+k]*rot[k*4+c]; tmp[r*4+c]=v;} for(let i=0;i<16;i++) m[i]=tmp[i]; };
        applyX2(armR, -1.0*a); applyX2(foreR, -0.85*a);
        this.punchTimers.set(entityId, Math.max(0, punchLeft - dt));
      }
      const jointMatrices = new Float32Array(skeleton.boneCount*16);
      this.computeJointMatrices(skeleton, localMatrices, jointMatrices);
      this.skinMeshGeneric(meshes, skeleton, jointMatrices);
      return true;
    }
    if (!animations || skeleton.boneCount === 0) return false;
    const desiredAnim = this.matchAnimationName(animations, state);
    if (!desiredAnim) return false;
    let animator = this.entityAnimators.get(entityId);
    if (!animator) {
      animator = { currentAnimation: desiredAnim, time: 0, loop: true, speed: 1 };
      this.entityAnimators.set(entityId, animator);
    }
    if (animator.currentAnimation !== desiredAnim) {
      animator.currentAnimation = desiredAnim;
      animator.time = 0;
    }
    const anim = animations.find(a => a.name === desiredAnim);
    if (!anim || anim.duration <= 0) return false;
    animator.time += dt * speed;
    if (animator.loop && anim.duration > 0) {
      animator.time = animator.time % anim.duration;
    }
    const localMatrices = new Float32Array(skeleton.boneCount * 16);
    this.sampleAnimation(anim, animator.time, skeleton, localMatrices);
    // Visible punch/swing: when a ped throws a punch (triggerPunch), override the
    // right arm with the same 0.3s extend-and-recover pose the player's punch uses,
    // so a brawl reads as swings instead of just health loss.
    const punchLeft = this.punchTimers.get(entityId) ?? 0;
    if (punchLeft > 0) {
      if (skeleton.boneCount > 35) {
        const t = punchLeft / 0.3;
        const punchAmount = t < 0.5 ? t * 2 : 2 - t * 2;
        const extendAngle = -0.8 * punchAmount;
        const m33 = new Float32Array(localMatrices.buffer, 33 * 16 * 4, 16);
        quatToMat4([Math.sin(extendAngle / 2), 0, 0, Math.cos(extendAngle / 2)], m33);
        m33[12] = 0; m33[13] = 0.709; m33[14] = 0;
        const m34 = new Float32Array(localMatrices.buffer, 34 * 16 * 4, 16);
        quatToMat4([0, 0, 0, 1], m34);
        m34[12] = 0; m34[13] = 1.142; m34[14] = 0;
        const m35 = new Float32Array(localMatrices.buffer, 35 * 16 * 4, 16);
        quatToMat4([0, 0, 0, 1], m35);
        m35[12] = 0; m35[13] = 1.434; m35[14] = 0;
      }
      this.punchTimers.set(entityId, Math.max(0, punchLeft - dt));
    }
    // Arrest grab: while a cop holds a caught player, keep its arm fully
    // extended toward the victim (the same straight-arm pose the punch uses at
    // full extension) so the takedown reads as a grab, not a jab.
    if (this.arrestingEntities.has(entityId) && skeleton.boneCount > 35) {
      const m33 = new Float32Array(localMatrices.buffer, 33 * 16 * 4, 16);
      quatToMat4([Math.sin(-0.8 / 2), 0, 0, Math.cos(-0.8 / 2)], m33);
      m33[12] = 0; m33[13] = 0.709; m33[14] = 0;
      const m34 = new Float32Array(localMatrices.buffer, 34 * 16 * 4, 16);
      quatToMat4([0, 0, 0, 1], m34);
      m34[12] = 0; m34[13] = 1.142; m34[14] = 0;
      const m35 = new Float32Array(localMatrices.buffer, 35 * 16 * 4, 16);
      quatToMat4([0, 0, 0, 1], m35);
      m35[12] = 0; m35[13] = 1.434; m35[14] = 0;
    }
    // Crouch-and-cover: a ducking ped bends into a low stance instead of the
    // generic idle — hips drop, thighs flex, knees bend deep. Bone indices vary
    // per model (mixamorig:*, char29 L_Thigh, jessica Hips), so bones are
    // matched by name and the pose degrades to the plain squash on skeletons
    // with no recognizable leg bones.
    if (this.duckingEntities.has(entityId)) {
      const names = skeleton.nodeNames;
      if (names && names.length === skeleton.boneCount) {
        const thighs: number[] = [];
        const calves: number[] = [];
        let hips = -1;
        for (let b = 0; b < names.length; b++) {
          const n = names[b].toLowerCase();
          if (hips < 0 && (n.includes('hip') || n.includes('pelvis'))) hips = b;
          if (n.includes('thigh') || n.includes('upleg')) thighs.push(b);
          else if (n.includes('calf') || (n.includes('leg') && !n.includes('toe'))) calves.push(b);
        }
        const temp = new Float32Array(16);
        const rot = new Float32Array(16);
        const applyRotX = (bone: number, angle: number) => {
          const m = new Float32Array(localMatrices.buffer, bone * 16 * 4, 16);
          mat4.identity(rot); mat4.rotateX(rot, rot, angle);
          mat4.multiply(temp, m, rot);
          for (let i = 0; i < 16; i++) m[i] = temp[i];
        };
        for (const t of thighs) applyRotX(t, 0.45);
        for (const c of calves) applyRotX(c, -0.7);
        if (hips >= 0) {
          const hm = new Float32Array(localMatrices.buffer, hips * 16 * 4, 16);
          hm[13] -= 0.22;
        }
      }
    }
    const jointMatrices = new Float32Array(skeleton.boneCount * 16);
    this.computeJointMatrices(skeleton, localMatrices, jointMatrices);
    this.skinMeshGeneric(meshes, skeleton, jointMatrices);
    return true;
  }
  /** Prune animators for entities no longer in the active set. Call periodically. */
  cleanupAnimators(activeEntityIds: Set<number>) {
    for (const id of this.entityAnimators.keys()) {
      if (!activeEntityIds.has(id)) {
        this.entityAnimators.delete(id);
      }
    }
    for (const id of this.punchTimers.keys()) {
      if (!activeEntityIds.has(id)) {
        this.punchTimers.delete(id);
      }
    }
    for (const id of this.arrestingEntities) {
      if (!activeEntityIds.has(id)) {
        this.arrestingEntities.delete(id);
      }
    }
    for (const id of this.duckingEntities) {
      if (!activeEntityIds.has(id)) {
        this.duckingEntities.delete(id);
      }
    }
    for (const id of this.flinchTimers.keys()) {
      if (!activeEntityIds.has(id)) {
        this.flinchTimers.delete(id);
      }
    }
  }
  /** Queue a visible punch/swing animation for an entity (0.3s arm extend). */
  triggerPunch(entityId: number): void {
    this.punchTimers.set(entityId, 0.3);
  }
  /** Brief recoil squash when an entity is hit (0.18s), read by the draw loops. */
  triggerFlinch(entityId: number): void {
    this.flinchTimers.set(entityId, 0.18);
  }
  private playerBone(...tokens: string[]): number {
    const names = this.skelNodeNames;
    const normalized = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '');
    const wanted = tokens.map(normalized);
    for (let i = 0; i < names.length; i++) {
      const name = normalized(names[i]);
      if (wanted.some(token => name.includes(token))) return i;
    }
    return -1;
  }
  private applyPlayerPose(animLocal: Float32Array): void {
    const hips = this.playerBone('hips', 'pelvis');
    const leftArm = this.playerBone('leftarm', 'leftupperarm');
    const leftForearm = this.playerBone('leftforearm', 'leftlowerarm');
    const rightArm = this.playerBone('rightarm', 'rightupperarm');
    const rightForearm = this.playerBone('rightforearm', 'rightlowerarm');
    const rightHand = this.playerBone('righthand');
    const leftThigh = this.playerBone('leftupleg', 'leftthigh');
    const leftCalf = this.playerBone('leftleg', 'leftcalf');
    const rightThigh = this.playerBone('rightupleg', 'rightthigh');
    const rightCalf = this.playerBone('rightleg', 'rightcalf');
    const temp = new Float32Array(16);
    const rot = new Float32Array(16);
    const applyRot = (bone: number, x: number, y = 0, z = 0) => {
      if (bone < 0) return;
      const m = new Float32Array(animLocal.buffer, bone * 16 * 4, 16);
      mat4.identity(rot);
      if (x) mat4.rotateX(rot, rot, x);
      if (y) mat4.rotateY(rot, rot, y);
      if (z) mat4.rotateZ(rot, rot, z);
      mat4.multiply(temp, m, rot);
      for (let i = 0; i < 16; i++) m[i] = temp[i];
    };
    const t = Math.max(0, Math.min(1, this.punchTime / 0.38));
    const attack = t < 0.5 ? t * 2 : 2 - t * 2;
    if (this.punchTime > 0) {
      if (this.playerAttack === 'kick') {
        applyRot(rightThigh, -0.9 * attack, 0, 0.12 * attack);
        applyRot(rightCalf, 1.15 * attack);
        applyRot(leftArm, -0.25 * attack, 0, 0.15);
        applyRot(rightArm, 0.25 * attack, 0, -0.15);
      } else {
        applyRot(rightArm, -0.95 * attack, 0, -0.15);
        applyRot(rightForearm, -0.75 * attack);
        applyRot(rightHand, -0.2 * attack);
        applyRot(leftArm, 0.25 * attack, 0, 0.15);
      }
    } else if (this.playerFireWeapon > 0 && this.playerFireTime > 0) {
      applyRot(rightArm, -0.75, 0.1, -0.18);
      applyRot(rightForearm, -0.65);
      applyRot(rightHand, -0.2);
      applyRot(leftArm, -0.55, -0.15, 0.2);
      applyRot(leftForearm, -0.45);
    } else if (this.playerWeapon > 0 && this.armOverrideActive) {
      applyRot(rightArm, -0.65, 0.08, -0.15);
      applyRot(rightForearm, -0.55);
      applyRot(rightHand, -0.16);
      applyRot(leftArm, -0.45, -0.12, 0.18);
      applyRot(leftForearm, -0.35);
    }
    if (hips >= 0 && this.walkSpeed <= 0.1 && this.punchTime <= 0) {
      const hm = new Float32Array(animLocal.buffer, hips * 16 * 4, 16);
      hm[13] += Math.sin(this.walkTime * 0.7) * 0.01;
    }
  }
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
      if (this.isMobile) {
        this._playerSkinAccumulator += Math.max(0, dt);
        const actionActive = this.punchTime > 0 || this.playerFireTime > 0;
        if (!actionActive && this._playerSkinAccumulator < 1 / 30) return;
        this._playerSkinAccumulator = 0;
      }
      if (this.walkSpeed > 0.1) {
        this.walkTime += dt * Math.min(this.walkSpeed * 0.15, 2.0);
      }
      if (this.walkSpeed > 0.1 && this.punchTime <= 0) {
        this.applyWalkAnimation(animLocal);
      }
      this.applyPlayerPose(animLocal);
      if (this.playerFireTime > 0) this.playerFireTime = Math.max(0, this.playerFireTime - dt);
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
        const existing = new Float32Array(mesh.originalVBO!);  
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
    const hips = this.playerBone('hips', 'pelvis');
    const leftArm = this.playerBone('leftarm', 'leftupperarm');
    const leftForearm = this.playerBone('leftforearm', 'leftlowerarm');
    const rightArm = this.playerBone('rightarm', 'rightupperarm');
    const rightForearm = this.playerBone('rightforearm', 'rightlowerarm');
    const leftThigh = this.playerBone('leftupleg', 'leftthigh');
    const leftKnee = this.playerBone('leftleg', 'leftcalf');
    const rightThigh = this.playerBone('rightupleg', 'rightthigh');
    const rightKnee = this.playerBone('rightleg', 'rightcalf');
    const temp = new Float32Array(16), rot = new Float32Array(16);
    const applyRotX = (bone: number, angle: number) => {
      if (bone < 0) return;
      const m = new Float32Array(animLocal.buffer, bone * 16 * 4, 16);
      mat4.identity(rot); mat4.rotateX(rot, rot, angle);
      mat4.multiply(temp, m, rot);
      for (let i = 0; i < 16; i++) m[i] = temp[i];
    };
    const leftPhase = t, rightPhase = t + Math.PI;
    const stride = 0.40;
    const kneeBend = 0.22;
    applyRotX(leftThigh, Math.sin(leftPhase) * stride);
    applyRotX(leftKnee, Math.max(0, -Math.sin(leftPhase)) * kneeBend);
    applyRotX(rightThigh, Math.sin(rightPhase) * stride);
    applyRotX(rightKnee, Math.max(0, -Math.sin(rightPhase)) * kneeBend);
    if (this.punchTime <= 0 && this.playerWeapon <= 0) {
      applyRotX(leftArm, Math.sin(leftPhase + Math.PI) * 0.4);
      applyRotX(leftForearm, Math.abs(Math.sin(leftPhase + Math.PI)) * -0.15);
      applyRotX(rightArm, Math.sin(rightPhase + Math.PI) * 0.4);
      applyRotX(rightForearm, Math.abs(Math.sin(rightPhase + Math.PI)) * -0.15);
    } else if (this.punchTime <= 0) {
      applyRotX(leftArm, -0.35);
      applyRotX(leftForearm, -0.18);
    }
    if (hips >= 0) {
      const hm = new Float32Array(animLocal.buffer, hips * 16 * 4, 16);
      hm[13] += Math.abs(Math.sin(t)) * -0.045;
      hm[12] += Math.sin(t * 0.5) * 0.008;
      mat4.identity(rot); mat4.rotateY(rot, rot, Math.sin(t) * 0.05);
      mat4.multiply(temp, hm, rot);
      for (let i = 0; i < 16; i++) hm[i] = temp[i];
    }
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
  private createMesh(verts: number[], indices: number[], texture: WebGLTexture | null = null, storeOriginal: boolean = false): CityMesh {
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
    const originalVBO = storeOriginal ? new Float32Array(interleaved) : undefined;
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
  private addMountainGround(
    verts: number[], indices: number[], worldOriginX: number, worldOriginZ: number,
    idxOffset: number, segments = 8
  ): number {
    const step = CHUNK_SIZE / segments;
    for (let zi = 0; zi <= segments; zi++) {
      for (let xi = 0; xi <= segments; xi++) {
        const x = worldOriginX + Math.min(xi * step, CHUNK_SIZE - 0.01);
        const z = worldOriginZ + Math.min(zi * step, CHUNK_SIZE - 0.01);
        const y = isOnRoadGrid(x, z) ? getMountainRoadHeight(x, z) : getMountainHeight(x, z);
        const shade = Math.max(0.22, Math.min(0.62, 0.38 + y * 0.004));
        const rock = y > 18 ? 0.10 : 0.16;
        verts.push(x, y, z, shade, shade + 0.03, rock, 1);
      }
    }
    for (let zi = 0; zi < segments; zi++) {
      for (let xi = 0; xi < segments; xi++) {
        const row = segments + 1;
        const a = idxOffset + zi * row + xi;
        indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
      }
    }
    return idxOffset + (segments + 1) * (segments + 1);
  }

  private addMountainRock(
    verts: number[], indices: number[], x: number, y: number, z: number,
    radius: number, height: number, r: number, g: number, b: number, idxOffset: number
  ): number {
    const sides = 6;
    const topY = y + height;
    for (let ring = 0; ring < 2; ring++) {
      const ringRadius = ring === 0 ? radius : radius * 0.2;
      const ringY = ring === 0 ? y : topY;
      for (let side = 0; side < sides; side++) {
        const angle = side / sides * Math.PI * 2;
        const wobble = 0.85 + 0.15 * Math.sin(side * 2.7 + x * 0.03 + z * 0.02);
        verts.push(
          x + Math.cos(angle) * ringRadius * wobble,
          ringY,
          z + Math.sin(angle) * ringRadius * wobble,
          r * (0.85 + side * 0.025), g * (0.85 + side * 0.02), b * (0.85 + side * 0.015), 1
        );
      }
    }
    for (let side = 0; side < sides; side++) {
      const next = (side + 1) % sides;
      indices.push(idxOffset + side, idxOffset + sides + side, idxOffset + next);
      indices.push(idxOffset + next, idxOffset + sides + side, idxOffset + sides + next);
    }
    return idxOffset + sides * 2;
  }

  private addMountainRoadSurface(
    verts: number[], indices: number[],
    x1: number, z1: number, x2: number, z2: number,
    width: number, idxOffset: number
  ): number {
    const length = Math.hypot(x2 - x1, z2 - z1) || 1;
    const segments = Math.max(4, Math.ceil(length / 12));
    for (let segment = 0; segment < segments; segment++) {
      const t0 = segment / segments;
      const t1 = (segment + 1) / segments;
      const ax = x1 + (x2 - x1) * t0;
      const az = z1 + (z2 - z1) * t0;
      const bx = x1 + (x2 - x1) * t1;
      const bz = z1 + (z2 - z1) * t1;
      const dx = bx - ax;
      const dz = bz - az;
      const segmentLength = Math.hypot(dx, dz) || 1;
      const px = -dz / segmentLength * width / 2;
      const pz = dx / segmentLength * width / 2;
      const ay = getMountainRoadHeight(ax, az) + 0.04;
      const by = getMountainRoadHeight(bx, bz) + 0.04;
      const r = 0.13, g = 0.14, b = 0.12;
      verts.push(
        ax + px, ay, az + pz, r, g, b, 1,
        bx + px, by, bz + pz, r, g, b, 1,
        bx - px, by, bz - pz, r, g, b, 1,
        ax - px, ay, az - pz, r, g, b, 1
      );
      indices.push(idxOffset, idxOffset + 1, idxOffset + 2, idxOffset, idxOffset + 2, idxOffset + 3);
      idxOffset += 4;
    }
    return idxOffset;
  }

  private addBeachGround(
    verts: number[], indices: number[], worldOriginX: number, worldOriginZ: number,
    idxOffset: number, segments = 12
  ): number {
    const sand = [0.76, 0.70, 0.51];
    const wetSand = [0.50, 0.57, 0.50];
    const step = CHUNK_SIZE / segments;
    for (let zi = 0; zi <= segments; zi++) {
      for (let xi = 0; xi <= segments; xi++) {
        const x = worldOriginX + Math.min(xi * step, CHUNK_SIZE - 0.01);
        const z = worldOriginZ + Math.min(zi * step, CHUNK_SIZE - 0.01);
      const base = getBeachHeight(x, z);
      const y = isOnRoadGrid(x, z)
          ? 0
          : isOnSidewalk(x, z)
            ? Math.max(base + SIDEWALK_RAISE, 0)
            : base;
        const wet = Math.max(0, Math.min(1, -base / 2.5));
        const r = sand[0] * (1 - wet) + wetSand[0] * wet;
        const g = sand[1] * (1 - wet) + wetSand[1] * wet;
        const b = sand[2] * (1 - wet) + wetSand[2] * wet;
        verts.push(x, y, z, r, g, b, 1);
      }
    }
    for (let zi = 0; zi < segments; zi++) {
      for (let xi = 0; xi < segments; xi++) {
        const row = segments + 1;
        const a = idxOffset + zi * row + xi;
        indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
      }
    }
    return idxOffset + (segments + 1) * (segments + 1);
  }
  private addShoreStrip(
    verts: number[], indices: number[],
    boundary: number, fixed: number, direction: 'x' | 'z', directionSign: 1 | -1,
    inward: number, outward: number, width: number,
    idxOffset: number, segments = 16, foam = false
  ): number {
    const sand = foam ? [0.86, 0.88, 0.78] : [0.76, 0.69, 0.48];
    const wetSand = foam ? [0.58, 0.72, 0.70] : [0.47, 0.55, 0.48];
    const vertexAt = (distance: number, across: number) => {
      const t = Math.max(0, Math.min(1, (distance + inward) / inward));
      const smooth = t * t * (3 - 2 * t);
      // Shore geometry must remain below the beach plane. The old outward
      // interpolation could invert at a chunk edge and create a huge vertical
      // face when the renderer viewed the strip from behind.
      const y = foam ? -2.35 : -2.5 * smooth;
      const r = sand[0] * (1 - smooth) + wetSand[0] * smooth;
      const g = sand[1] * (1 - smooth) + wetSand[1] * smooth;
      const b = sand[2] * (1 - smooth) + wetSand[2] * smooth;
      return direction === 'x'
        ? [boundary + directionSign * distance, fixed + across, y, r, g, b, 1]
        : [fixed + across, boundary + directionSign * distance, y, r, g, b, 1];
    };
    for (let i = 0; i <= segments; i++) {
      const d = -inward + (inward + outward) * (i / segments);
      verts.push(...vertexAt(d, -width / 2), ...vertexAt(d, width / 2));
    }
    for (let i = 0; i < segments; i++) {
      const a = idxOffset + i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    return idxOffset + (segments + 1) * 2;
  }
  private addShoreCorner(
    verts: number[], indices: number[], cornerX: number, cornerZ: number,
    dx: number, dz: number, idxOffset: number, segments = 10
  ): number {
    const innerRadius = 10;
    const outerRadius = 12;
    const sand = [0.72, 0.66, 0.46];
    const wetSand = [0.42, 0.51, 0.46];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = (Math.PI / 2) * t;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      for (const radius of [innerRadius, outerRadius]) {
        const x = cornerX - dx * cos * radius;
        const z = cornerZ - dz * sin * radius;
        const wet = radius === outerRadius ? 1 : 0;
        const r = sand[0] * (1 - wet) + wetSand[0] * wet;
        const g = sand[1] * (1 - wet) + wetSand[1] * wet;
        const b = sand[2] * (1 - wet) + wetSand[2] * wet;
        const y = -2.5 * wet;
        verts.push(x, y, z, r, g, b, 1);
      }
    }
    for (let i = 0; i < segments; i++) {
      const a = idxOffset + i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    return idxOffset + (segments + 1) * 2;
  }
  // Generate (and cache) every chunk in a square radius around a chunk
  // coordinate so raising the view-distance slider doesn't hitch mid-frame.
  prewarmChunks(cx: number, cz: number, radius: number) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        this.getCityChunk(cx + dx, cz + dz);
      }
    }
  }

  /** Build a bounded chunk batch without monopolizing the main thread. */
  prewarmChunksBatch(cx: number, cz: number, radius: number, budget = 2): boolean {
    const pending: { cx: number; cz: number }[] = [];
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const chunkX = cx + dx;
        const chunkZ = cz + dz;
        if (!this.chunkCache.has(`${chunkX},${chunkZ}`)) pending.push({ cx: chunkX, cz: chunkZ });
      }
    }
    for (let i = 0; i < Math.min(Math.max(1, budget), pending.length); i++) {
      this.getCityChunk(pending[i].cx, pending[i].cz);
    }
    return pending.length <= budget;
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
    const supermarkets: { x: number; z: number; yaw: number; hd: number; isConvenience?: boolean }[] = [];
    const tatami: { x: number; z: number; yaw: number }[] = [];
    const cabins: { x: number; z: number; yaw: number }[] = [];
    const lighthouses: { x: number; z: number; yaw: number }[] = [];
    const tropicalShops: { x: number; z: number; yaw: number }[] = [];
    const decorativeAircraft: { x: number; z: number; yaw: number; type: string; model?: CityMesh | CityMesh[] }[] = [];
    const worldOriginX = cx * CHUNK_SIZE;
    const worldOriginZ = cz * CHUNK_SIZE;
    const biome = getBiome(cx, cz);
    const seed = (cx * 100003 + cz * 70001) >>> 0;
    const rng = this.mulberry32(seed);
    if (biome === 'ocean') {
      const cx2 = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
      const cz2 = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
      this.addPlane(verts, indices, cx2, -2.5, cz2, CHUNK_SIZE, CHUNK_SIZE, 0.0, 0.10, 0.30, 0.85, idxOffset); idxOffset += 4;
      this.addPlane(verts, indices, cx2, -2.2, cz2, CHUNK_SIZE, CHUNK_SIZE, 0.05, 0.25, 0.45, 0.55, idxOffset); idxOffset += 4;
      this.addPlane(verts, indices, cx2, -1.9, cz2, CHUNK_SIZE, CHUNK_SIZE, 0.15, 0.40, 0.60, 0.40, idxOffset); idxOffset += 4;
      if ((isBridgeChunk(cx, cz + 1) || isBridgeChunk(cx, cz - 1)) && this.boatMeshes.length > 0) {
        for (let bi = 0; bi < 2; bi++) {
          const boatModel = this.boatMeshes[Math.floor(rng() * this.boatMeshes.length)];
          const bx = cx * CHUNK_SIZE + 10 + rng() * (CHUNK_SIZE - 20);
          const bz = cz * CHUNK_SIZE + 5 + bi * 25;
          buildings.push({ model: boatModel, x: bx, y: -1.5, z: bz, yaw: rng() * Math.PI * 2, scale: [1, 1, 1] });
          decorativeAircraft.push({ x: bx, z: bz, yaw: 0, type: 'boat', model: boatModel });
        }
      }
      const mesh = this.createMesh(verts, indices);
      const chunk: CityChunk = { mesh, cx, cz, lamps: [], hydrants: [], buildings, benches: [], barrels: [], chickens: [], trees: [], supermarkets: [], tatami: [], cabins: [], lighthouses: [], tropicalShops: [], decorativeAircraft };
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
    const isBridgeConnector = biome === 'bridge_connector';
    const isAeroport = biome === 'aeroport';
    const isParkingLot = biome === 'parking_lot';
    const isMountain = biome === 'mountain';
    const isRuralFarm = biome === 'rural_farm';
    const isRuralHills = biome === 'rural_hills';
    const isRuralMountain = biome === 'rural_mountain';
    const isRuralLakes = biome === 'rural_lakes';
    const isRuralDesert = biome === 'rural_desert';
    const isRural = isRuralFarm || isRuralHills || isRuralMountain || isRuralLakes || isRuralDesert;
    const blocksPerChunk = CHUNK_SIZE / GRID_PITCH;
    if (isBeach) {
      idxOffset = this.addBeachGround(verts, indices, worldOriginX, worldOriginZ, idxOffset);
      if (isWaterAdjacent()) {
        const cx2 = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
        const cz2 = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]] as const;
        const oceanSides: [number, number][] = [];
        const slopeInward = 28;
        for (const [ddx, ddz] of dirs) {
          if (getBiome(cx + ddx, cz + ddz) !== 'ocean') continue;
          oceanSides.push([ddx, ddz]);
          if (ddx !== 0) {
            const boundary = ddx > 0 ? (cx + 1) * CHUNK_SIZE : cx * CHUNK_SIZE;
            idxOffset = this.addShoreStrip(
              verts, indices, boundary, cz2, 'x', ddx, slopeInward, 0,
              CHUNK_SIZE, idxOffset
            );
            // A thin foam line follows the same continuous shoreline rather than
            // being built from floating cubes.
            idxOffset = this.addShoreStrip(
              verts, indices, boundary, cz2, 'x', ddx, 0.8, 0.8,
              CHUNK_SIZE, idxOffset, 12, true
            );
          } else {
            const boundary = ddz > 0 ? (cz + 1) * CHUNK_SIZE : cz * CHUNK_SIZE;
            idxOffset = this.addShoreStrip(
              verts, indices, boundary, cx2, 'z', ddz, slopeInward, 0,
              CHUNK_SIZE, idxOffset
            );
            idxOffset = this.addShoreStrip(
              verts, indices, boundary, cx2, 'z', ddz, 0.8, 0.8,
              CHUNK_SIZE, idxOffset, 12, true
            );
          }
        }
        for (let i = 0; i < oceanSides.length; i++) {
          for (let j = i + 1; j < oceanSides.length; j++) {
            const [dx1, dz1] = oceanSides[i];
            const [dx2, dz2] = oceanSides[j];
            if (dx1 * dx2 + dz1 * dz2 !== 0) continue;
            const cornerX = cx * CHUNK_SIZE + (dx1 > 0 || dx2 > 0 ? CHUNK_SIZE : 0);
            const cornerZ = cz * CHUNK_SIZE + (dz1 > 0 || dz2 > 0 ? CHUNK_SIZE : 0);
            idxOffset = this.addShoreCorner(verts, indices, cornerX, cornerZ, dx1, dz2, idxOffset);
          }
        }
        // Wet-sand streaks and small shell/rock clusters give the waterline a
        // natural transition while remaining part of the chunk mesh.
        for (let detail = 0; detail < 5; detail++) {
          const side = oceanSides[Math.floor(rng() * oceanSides.length)];
          if (!side) break;
          const [ddx, ddz] = side;
          const along = 10 + rng() * (CHUNK_SIZE - 20);
          const depth = 13 + rng() * 8;
          const px = ddx !== 0
            ? (ddx > 0 ? (cx + 1) * CHUNK_SIZE - depth : cx * CHUNK_SIZE + depth)
            : worldOriginX + along;
          const pz = ddz !== 0
            ? worldOriginZ + along
            : (ddz > 0 ? (cz + 1) * CHUNK_SIZE - depth : cz * CHUNK_SIZE + depth);
          const wetY = -0.04;
          this.addBox(verts, indices, px, wetY, pz, ddx !== 0 ? 5 + rng() * 7 : 0.8, 0.025, ddz !== 0 ? 0.8 : 5 + rng() * 7, 0.78, 0.76, 0.58, 0.8, idxOffset); idxOffset += 24;
          const shellX = px + (ddx !== 0 ? 0 : (rng() - 0.5) * 4);
          const shellZ = pz + (ddz !== 0 ? 0 : (rng() - 0.5) * 4);
          this.addBox(verts, indices, shellX, 0.12, shellZ, 0.35, 0.18, 0.35, 0.92, 0.84, 0.62, 1.0, idxOffset); idxOffset += 24;
          if (detail % 2 === 0) {
            const logLength = 2.8 + rng() * 2.5;
            this.addBox(verts, indices, px + (ddx !== 0 ? 0 : 1.5), 0.18, pz + (ddz !== 0 ? 1.5 : 0), ddx !== 0 ? 0.35 : logLength, 0.3, ddz !== 0 ? 0.35 : logLength, 0.30, 0.20, 0.10, 1.0, idxOffset); idxOffset += 24;
          }
          for (let grass = 0; grass < 2; grass++) {
            const gx = px + (ddx !== 0 ? (rng() - 0.5) * 3 : grass * 0.7);
            const gz = pz + (ddz !== 0 ? grass * 0.7 : (rng() - 0.5) * 3);
            this.addBox(verts, indices, gx, 0.28, gz, 0.12, 0.55, 0.12, 0.18, 0.38, 0.12, 1.0, idxOffset); idxOffset += 24;
          }
        }
      }
    }
    else if (isBridge) {
      const cx2 = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
      const cz2 = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
      this.addPlane(verts, indices, cx2, -2.5, cz2, CHUNK_SIZE, CHUNK_SIZE, 0.0, 0.10, 0.30, 0.85, idxOffset); idxOffset += 4;
      this.addPlane(verts, indices, cx2, -2.0, cz2, CHUNK_SIZE, CHUNK_SIZE, 0.10, 0.30, 0.50, 0.55, idxOffset); idxOffset += 4;
      const bridge = BRIDGE_RANGES.find(br => cx >= br.startCx && cx <= br.endCx && cz >= br.startCz && cz <= br.endCz);
      if (bridge) {
        const roadCenterZ = cz * CHUNK_SIZE;
        const roadW = ROAD_HALF_WIDTH * 2;       // 32 — two lanes
        const bridgeW = roadW + 10;              // 42 — deck spans wider than the road
        const surfaceYAt = (x: number) => bridgeYAt(x, bridge);
        const deckStartX = bridge.startCx * GRID_PITCH;
        const deckEndX = (bridge.endCx + 1) * GRID_PITCH;
        // Finer slices keep the deck profile smooth at chunk boundaries and
        // prevent visible step-like gaps between neighboring bridge chunks.
        const numSlices = 32;
        const sliceW = CHUNK_SIZE / numSlices;
        const overlap = 1.08;
        for (let si = 0; si < numSlices; si++) {
          const sx = worldOriginX + si * sliceW + sliceW / 2;
          const surfY = surfaceYAt(sx);
          const nextX = sx + sliceW;
          const nextY = surfaceYAt(nextX);
          const avgY = (surfY + nextY) / 2;
          const pillarH = Math.max(surfY, nextY);
          const sliceLen = sliceW * overlap;
          if (si % 4 === 0) {
            // Each pier is a continuous structural stack: the shafts extend
            // below the waterline into the seabed, while the cap overlaps the
            // deck slab and edge girders so it cannot read as a floating prop.
            const seabedY = -5.5;
            // Lift the pier cap into the underside of the deck. The previous
            // cap stopped below the slab, leaving a visible floating gap from
            // oblique camera angles and at ramp/deck seams.
            const deckBottomY = avgY - 0.65;
            const capTopY = deckBottomY + 0.22;
            const capHeight = 1.65;
            const capCenterY = capTopY - capHeight / 2;
            const shaftTopY = capTopY - capHeight + 0.12;
            const shaftHeight = Math.max(0.5, shaftTopY - seabedY);
            const shaftCenterY = seabedY + shaftHeight / 2;
            const pierPositions = [-bridgeW / 2 + 5, 0, bridgeW / 2 - 5];
            for (const pz of pierPositions) {
              this.addBox(verts, indices, sx, shaftCenterY, roadCenterZ + pz, 2.4, shaftHeight, 2.6, 0.32, 0.32, 0.34, 1.0, idxOffset); idxOffset += 24;
              // Wider footing keeps the column visually planted rather than
              // ending at the water surface.
              this.addBox(verts, indices, sx, seabedY - 0.2, roadCenterZ + pz, 3.6, 0.45, 3.8, 0.28, 0.28, 0.30, 1.0, idxOffset); idxOffset += 24;
            }
            // One broad cap beam ties all three shafts together and overlaps
            // the underside of the bridge deck across its full width.
            this.addBox(verts, indices, sx, capCenterY, roadCenterZ, 3.4, capHeight, bridgeW + 1.0, 0.32, 0.32, 0.34, 1.0, idxOffset); idxOffset += 24;
            // A broad neck penetrates the slab underside, visually joining all
            // three supports to the bridge rather than ending underneath it.
            this.addBox(verts, indices, sx, deckBottomY + 0.18, roadCenterZ, 2.0, 0.55, bridgeW - 4.0, 0.36, 0.36, 0.38, 1.0, idxOffset); idxOffset += 24;
          }
          // Deck slab — full width with a visible underside so the deck reads
          // as a real structure instead of a floating plate.
          this.addBox(verts, indices, sx, avgY - 0.3, roadCenterZ, sliceLen, 0.7, bridgeW, 0.26, 0.26, 0.28, 1.0, idxOffset); idxOffset += 24;
          // Road surface
          this.addBox(verts, indices, sx, avgY + 0.07, roadCenterZ, sliceLen, 0.14, roadW, 0.13, 0.13, 0.14, 1.0, idxOffset); idxOffset += 24;
          // Sidewalks between the road and the parapet, with a curb at the road edge
          for (const side of [-1, 1]) {
            const sz = roadCenterZ + side * (roadW / 2 + 2.5);
            this.addBox(verts, indices, sx, avgY + 0.24, sz, sliceLen, 0.2, 5, 0.52, 0.52, 0.54, 1.0, idxOffset); idxOffset += 24;
            const curbZ = roadCenterZ + side * (roadW / 2);
            this.addBox(verts, indices, sx, avgY + 0.34, curbZ, sliceLen, 0.18, 0.14, 0.42, 0.42, 0.44, 1.0, idxOffset); idxOffset += 24;
          }
          // Lane markings — dashed yellow center line + solid white edge lines,
          // so the two directions read as separate lanes.
          if (si % 2 === 0) {
            this.addBox(verts, indices, sx, avgY + 0.16, roadCenterZ, sliceW * 0.7, 0.02, 0.3, 0.9, 0.75, 0.15, 1.0, idxOffset); idxOffset += 24;
          }
          for (const side of [-1, 1]) {
            const lz = roadCenterZ + side * (roadW / 2 - 1.5);
            this.addBox(verts, indices, sx, avgY + 0.16, lz, sliceLen, 0.02, 0.22, 0.85, 0.85, 0.85, 0.9, idxOffset); idxOffset += 24;
          }
          // Parapet guardrail walls along the deck edges
          for (const side of [-1, 1]) {
            const pz = roadCenterZ + side * (bridgeW / 2 - 0.45);
            // Parapet rests ON the deck slab (slab top = avgY + 0.05) instead
            // of hovering 0.55 above it, and the cap sits on the parapet top.
            this.addBox(verts, indices, sx, avgY + 0.5, pz, sliceLen, 0.9, 0.5, 0.5, 0.5, 0.52, 1.0, idxOffset); idxOffset += 24;
            this.addBox(verts, indices, sx, avgY + 1.0, pz, sliceLen, 0.1, 0.12, 0.68, 0.68, 0.7, 1.0, idxOffset); idxOffset += 24;
          }
          // Deep edge girders under the deck so the span reads as a real
          // girder/truss bridge from the side and below, not a floating slab.
          for (const side of [-1, 1]) {
            const gz = roadCenterZ + side * (bridgeW / 2 - 1.9);
            this.addBox(verts, indices, sx, avgY - 1.5, gz, sliceLen, 1.8, 0.55, 0.30, 0.30, 0.33, 1.0, idxOffset); idxOffset += 24;
          }
          if (si % 2 === 0) {
            // Truss ladder cross-beams stay below the deck, where they are
            // structural detail rather than obstacles in the driving lane.
            // The cross-beam reaches the side girders instead of stopping
            // 0.3 units short of them.
            this.addBox(verts, indices, sx, avgY - 1.15, roadCenterZ, sliceLen, 0.4, bridgeW - 3.6, 0.27, 0.27, 0.30, 1.0, idxOffset); idxOffset += 24;
            // Railing posts rise from the parapet top to the handrail
            for (const side of [-1, 1]) {
              const pz = roadCenterZ + side * (bridgeW / 2 - 0.45);
              this.addBox(verts, indices, sx, avgY + 1.43, pz, 0.18, 1.05, 0.18, 0.55, 0.55, 0.58, 1.0, idxOffset); idxOffset += 24;
            }
          }
          // Handrail running along the parapet top, carried by the posts
          for (const side of [-1, 1]) {
            const pz = roadCenterZ + side * (bridgeW / 2 - 0.45);
            this.addBox(verts, indices, sx, avgY + 1.95, pz, sliceLen, 0.1, 0.14, 0.68, 0.68, 0.7, 1.0, idxOffset); idxOffset += 24;
          }
          // Lamp masts over the sidewalk every few slices. The mast base sits
          // on the sidewalk surface (top = avgY + 0.24) and the arm reaches
          // back to the mast instead of floating 2 units away from it.
          if (si % 4 === 2) {
            for (const side of [-1, 1]) {
              const pz = roadCenterZ + side * (bridgeW / 2 - 0.45);
              this.addBox(verts, indices, sx, avgY + 2.04, pz, 0.24, 3.6, 0.24, 0.22, 0.22, 0.24, 1.0, idxOffset); idxOffset += 24;
              const az = roadCenterZ + side * (bridgeW / 2 - 1.75);
              this.addBox(verts, indices, sx, avgY + 3.7, az, 0.16, 0.15, 2.6, 0.32, 0.32, 0.35, 1.0, idxOffset); idxOffset += 24;
            }
          }
        }
        // Suspension towers + cables — one tower pair per span end (not per
        // chunk), with the main span cable sagging between them and back-stay
        // cables down to the deck ends, so the bridge reads as a real
        // suspension structure.
        const towerXs = [deckStartX + 40, deckEndX - 40];
        const spanCenterX = (deckStartX + deckEndX) / 2;
        const deckY = BRIDGE_DECK_Y;
        for (const tx of towerXs) {
          if (Math.floor(tx / GRID_PITCH) !== cx) continue; // build each tower only in its own chunk
          const tz = roadCenterZ;
          const baseY = surfaceYAt(tx);
          const towerH = 26;
          const legZ = bridgeW / 2 - 2.2; // legs sit on the deck edges, clear of traffic
          for (const lz of [tz - legZ, tz + legZ]) {
            this.addBox(verts, indices, tx - 1.4, baseY + towerH / 2, lz, 1.1, towerH, 1.1, 0.4, 0.4, 0.42, 1.0, idxOffset); idxOffset += 24;
            this.addBox(verts, indices, tx + 1.4, baseY + towerH / 2, lz, 1.1, towerH, 1.1, 0.4, 0.4, 0.42, 1.0, idxOffset); idxOffset += 24;
            for (let by = 7; by < towerH; by += 7) {
              this.addBox(verts, indices, tx, baseY + by, lz, 4.2, 0.7, 1.1, 0.45, 0.45, 0.47, 1.0, idxOffset); idxOffset += 24;
            }
            this.addBox(verts, indices, tx, baseY + towerH + 0.8, lz, 4.2, 1.6, 1.1, 0.45, 0.45, 0.47, 1.0, idxOffset); idxOffset += 24;
          }
          // Portal frames connecting both legs — one at the top, one just
          // above the deck — the classic suspension-tower silhouette.
          // Keep the tower's cross-members above the traffic envelope. The
          // lower portal and plinth used to span the roadway at head/vehicle
          // height, which appeared as horizontal bars cutting through the road.
          // The legs still provide the support silhouette while the clear span
          // remains open for cars.
          this.addBox(verts, indices, tx, baseY + towerH + 1.0, tz, 1.2, 2.6, legZ * 2 - 0.4, 0.42, 0.42, 0.45, 1.0, idxOffset); idxOffset += 24;
          // Pedestals are placed under each leg rather than across the street.
          for (const lz of [tz - legZ, tz + legZ]) {
            this.addBox(verts, indices, tx, baseY + 0.55, lz, 3.0, 1.1, 2.0, 0.36, 0.36, 0.39, 1.0, idxOffset); idxOffset += 24;
          }
          const topY = baseY + towerH;
          // Main span cable: from this tower toward the span center (each
          // tower builds its own half, so the span is never doubled).
          const cableEndX = spanCenterX;
          const cableSegs = 4;
          for (let s = 0; s < cableSegs; s++) {
            const t0 = s / cableSegs;
            const t1 = (s + 1) / cableSegs;
            const x0 = tx + (cableEndX - tx) * t0;
            const x1 = tx + (cableEndX - tx) * t1;
            const y0 = topY - 5.5 * (t0 * t0);
            const y1 = topY - 5.5 * (t1 * t1);
            for (const lz of [tz - legZ, tz + legZ]) {
              this.addBox(verts, indices, (x0 + x1) / 2, (y0 + y1) / 2, lz, Math.abs(x1 - x0) + 0.4, 0.35, 0.35, 0.55, 0.55, 0.57, 1.0, idxOffset); idxOffset += 24;
            }
          }
          // Back-stay cable: from the tower top down to the nearer deck end
          const stayEndX = tx < spanCenterX ? deckStartX : deckEndX;
          const staySegs = 3;
          for (let s = 0; s < staySegs; s++) {
            const t0 = s / staySegs;
            const t1 = (s + 1) / staySegs;
            const x0 = tx + (stayEndX - tx) * t0;
            const x1 = tx + (stayEndX - tx) * t1;
            const y0 = topY - (topY - deckY) * (t0 * t0);
            const y1 = topY - (topY - deckY) * (t1 * t1);
            for (const lz of [tz - legZ, tz + legZ]) {
              this.addBox(verts, indices, (x0 + x1) / 2, (y0 + y1) / 2, lz, Math.abs(x1 - x0) + 0.4, 0.3, 0.3, 0.5, 0.5, 0.52, 1.0, idxOffset); idxOffset += 24;
            }
          }
          // Hangers: thin verticals from the main cable down to the deck,
          // only inside this chunk so neighboring chunks don't double them.
          const hDir = cableEndX > tx ? 1 : -1;
          for (let hi = 1; hi < 9; hi++) {
            const hx = tx + hDir * hi * 10;
            if ((hDir > 0 && hx >= cableEndX - 2) || (hDir < 0 && hx <= cableEndX + 2)) break;
            if (hx < worldOriginX || hx >= worldOriginX + CHUNK_SIZE) continue;
            const t = (hx - tx) / (cableEndX - tx);
            const hy = topY - 5.5 * (t * t);
            for (const lz of [tz - legZ, tz + legZ]) {
              this.addBox(verts, indices, hx, (hy + deckY) / 2, lz, 0.16, Math.max(0.5, hy - deckY), 0.16, 0.5, 0.5, 0.52, 1.0, idxOffset); idxOffset += 24;
            }
          }
        }
      }
    }
    else if (isBridgeConnector) {
      const gv = (rng() - 0.5) * 0.08;
      this.addPlane(verts, indices, worldOriginX + CHUNK_SIZE / 2, 0.0, worldOriginZ + CHUNK_SIZE / 2, CHUNK_SIZE, CHUNK_SIZE, 0.30 + gv, 0.52 + gv, 0.13 + gv, 1.0, idxOffset); idxOffset += 4;
      const bridge = BRIDGE_RANGES.find(br =>
        (cx === br.startCx - 1 && cz === br.startCz) ||
        (cx === br.endCx + 1 && cz === br.endCz)
      );
      if (bridge) {
        const roadCenterZ = cz * CHUNK_SIZE;
        const roadW = ROAD_HALF_WIDTH * 2;
        const bridgeW = roadW + 10; 
        const segments = 16;
        const segW = CHUNK_SIZE / segments;
        for (let s = 0; s < segments; s++) {
          const x1 = worldOriginX + s * segW;
          const x2 = worldOriginX + (s + 1) * segW;
          const y1 = bridgeYAt(x1, bridge);
          const y2 = bridgeYAt(x2, bridge);
          // Filled approach embankment: a solid graded mass under the ramp.
          // It stays within the road corridor (deck + 1 unit lip per side)
          // instead of jutting 8 units past the sidewalk as a free-standing
          // concrete wall beside the approach.
          this.addFilledRamp(verts, indices, x1, y1 - 0.32, x2, y2 - 0.32,
            roadCenterZ, bridgeW + 2, -2.5, 0.22, 0.22, 0.24, 1.0, idxOffset); idxOffset += 24;
          // Deck slab under the ramp, offset to match the deck chunk's slab
          // exactly (top = y + 0.05, bottom = y - 0.65) so the ramp/deck seam
          // has no visible step or gap.
          this.addRamp(verts, indices, x1, y1 + 0.05, x2, y2 + 0.05, roadCenterZ, bridgeW, 0.7, 0.26, 0.26, 0.28, 1.0, idxOffset); idxOffset += 24;
          this.addRamp(verts, indices, x1, y1 + 0.14, x2, y2 + 0.14, roadCenterZ, roadW, 0.14, 0.13, 0.13, 0.14, 1.0, idxOffset); idxOffset += 24;
          if (s % 2 === 0) {
            this.addRamp(verts, indices, x1, y1 + 0.16, x2, y2 + 0.16, roadCenterZ, 0.3, 0.02, 0.9, 0.75, 0.15, 0.8, idxOffset); idxOffset += 24;
          }
          for (const side of [-1, 1]) {
            // Solid white edge line + sidewalk + parapet, matching the deck
            const lz = roadCenterZ + side * (roadW / 2 - 1.5);
            this.addRamp(verts, indices, x1, y1 + 0.16, x2, y2 + 0.16, lz, 0.22, 0.02, 0.85, 0.85, 0.85, 0.9, idxOffset); idxOffset += 24;
            const sz = roadCenterZ + side * (roadW / 2 + 2.5);
            this.addRamp(verts, indices, x1, y1 + 0.24, x2, y2 + 0.24, sz, 5, 0.2, 0.52, 0.52, 0.54, 1.0, idxOffset); idxOffset += 24;
            const pz = roadCenterZ + side * (bridgeW / 2 - 0.45);
            // Parapet base rests on the ramp slab (slab top = y + 0.05), with
            // cap and handrail stacked on it — no floating rails.
            this.addRamp(verts, indices, x1, y1 + 0.95, x2, y2 + 0.95, pz, 0.5, 0.9, 0.5, 0.5, 0.52, 1.0, idxOffset); idxOffset += 24;
            this.addRamp(verts, indices, x1, y1 + 1.05, x2, y2 + 1.05, pz, 0.12, 0.1, 0.68, 0.68, 0.7, 1.0, idxOffset); idxOffset += 24;
            // Matching deep girder under the ramp edge and handrail on top.
            // The girder top matches the deck girder exactly at the seam.
            const gz = roadCenterZ + side * (bridgeW / 2 - 1.9);
            this.addRamp(verts, indices, x1, y1 - 0.6, x2, y2 - 0.6, gz, 0.55, 1.8, 0.30, 0.30, 0.33, 1.0, idxOffset); idxOffset += 24;
            // Handrail at the deck rail's exact height, carried by posts like
            // the deck rail, so the ramp-to-deck transition is seamless.
            this.addRamp(verts, indices, x1, y1 + 2.0, x2, y2 + 2.0, pz, 0.14, 0.1, 0.68, 0.68, 0.7, 1.0, idxOffset); idxOffset += 24;
            if (s % 2 === 0) {
              const xm = (x1 + x2) / 2;
              const ym = bridgeYAt(xm, bridge);
              this.addBox(verts, indices, xm, ym + 1.43, pz, 0.18, 1.05, 0.18, 0.55, 0.55, 0.58, 1.0, idxOffset); idxOffset += 24;
            }
          }
        }
      }
    }
    else if (isAeroport) {
      this.addPlane(verts, indices, worldOriginX + CHUNK_SIZE / 2, 0.0, worldOriginZ + CHUNK_SIZE / 2, CHUNK_SIZE, CHUNK_SIZE, 0.22, 0.22, 0.24, 1.0, idxOffset); idxOffset += 4;
      for (const entry of GrandTheftRenderer.AIRPORT_ENTRY_ROADS) {
        const minGz = Math.min(entry.gzStart, entry.gzEnd);
        const maxGz = Math.max(entry.gzStart, entry.gzEnd);
        if (entry.gx === cx && cz >= minGz && cz <= maxGz) {
          const roadX = entry.gx * GRID_PITCH;
          this.addBox(verts, indices, roadX, 0.05, worldOriginZ + CHUNK_SIZE / 2, ROAD_HALF_WIDTH * 2, 0.1, CHUNK_SIZE, 0.12, 0.12, 0.13, 1.0, idxOffset); idxOffset += 24;
        }
      }
    }
    else if (isParkingLot) {
      this.addPlane(verts, indices, worldOriginX + CHUNK_SIZE / 2, 0.0, worldOriginZ + CHUNK_SIZE / 2, CHUNK_SIZE, CHUNK_SIZE, 0.10, 0.10, 0.11, 1.0, idxOffset); idxOffset += 4;
      for (const gridX of [cx, cx + 1]) {
        const worldX = gridX * GRID_PITCH;
        this.addBox(verts, indices, worldX, 0.04, worldOriginZ + CHUNK_SIZE / 2, ROAD_HALF_WIDTH * 2, 0.08, CHUNK_SIZE, 0.12, 0.12, 0.13, 1.0, idxOffset); idxOffset += 24;
        idxOffset = this.addRoadMarkings(verts, indices, idxOffset, false, worldX, 0.10, worldOriginZ, worldOriginZ + CHUNK_SIZE);
      }
      for (const gridZ of [cz, cz + 1]) {
        const worldZ = gridZ * GRID_PITCH;
        this.addBox(verts, indices, worldOriginX + CHUNK_SIZE / 2, 0.04, worldZ, CHUNK_SIZE, 0.08, ROAD_HALF_WIDTH * 2, 0.12, 0.12, 0.13, 1.0, idxOffset); idxOffset += 24;
        idxOffset = this.addRoadMarkings(verts, indices, idxOffset, true, worldZ, 0.10, worldOriginX, worldOriginX + CHUNK_SIZE);
      }
    }
    else if (isRural) {
      const gv = (rng() - 0.5) * 0.08;
      let gr = 0.30, gg = 0.50, gb = 0.13;
      if (isRuralFarm) { gr = 0.25 + gv; gg = 0.55 + gv; gb = 0.12 + gv; }
      else if (isRuralHills) { gr = 0.35 + gv; gg = 0.50 + gv; gb = 0.15 + gv; }
      else if (isRuralMountain) { gr = 0.30 + gv; gg = 0.32 + gv; gb = 0.20 + gv; }
      else if (isRuralLakes) { gr = 0.20 + gv; gg = 0.45 + gv; gb = 0.18 + gv; }
      else if (isRuralDesert) { gr = 0.72 + gv * 0.5; gg = 0.65 + gv * 0.5; gb = 0.35 + gv * 0.5; }
      if (isRuralHills || isRuralMountain || getMountainHeight(worldOriginX + CHUNK_SIZE / 2, worldOriginZ + CHUNK_SIZE / 2) > 0.02) {
        idxOffset = this.addMountainGround(verts, indices, worldOriginX, worldOriginZ, idxOffset, this.isMobile ? 8 : 10);
      } else {
        this.addPlane(verts, indices, worldOriginX + CHUNK_SIZE / 2, 0.0, worldOriginZ + CHUNK_SIZE / 2, CHUNK_SIZE, CHUNK_SIZE, gr, gg, gb, 1.0, idxOffset); idxOffset += 4;
      }
      if (isRuralLakes) {
        this.addPlane(verts, indices, worldOriginX + CHUNK_SIZE / 2, -1.5, worldOriginZ + CHUNK_SIZE / 2, CHUNK_SIZE * 0.5, CHUNK_SIZE * 0.5, 0.05, 0.30, 0.55, 0.75, idxOffset); idxOffset += 4;
        this.addPlane(verts, indices, worldOriginX + CHUNK_SIZE / 2, -1.2, worldOriginZ + CHUNK_SIZE / 2, CHUNK_SIZE * 0.4, CHUNK_SIZE * 0.4, 0.10, 0.40, 0.60, 0.50, idxOffset); idxOffset += 4;
      }
    } else {
      const groundShade = isSuburb ? 0.12 : 0.08;
      this.addPlane(verts, indices, worldOriginX + CHUNK_SIZE / 2, 0.0, worldOriginZ + CHUNK_SIZE / 2, CHUNK_SIZE, CHUNK_SIZE, groundShade, groundShade, groundShade, 1.0, idxOffset); idxOffset += 4;
      for (const gridX of [cx, cx + 1]) {
        const worldX = gridX * GRID_PITCH;
        this.addBox(verts, indices, worldX, 0.04, worldOriginZ + CHUNK_SIZE / 2, ROAD_HALF_WIDTH * 2, 0.08, CHUNK_SIZE, 0.12, 0.12, 0.13, 1.0, idxOffset); idxOffset += 24;
        idxOffset = this.addRoadMarkings(verts, indices, idxOffset, false, worldX, 0.10, worldOriginZ, worldOriginZ + CHUNK_SIZE);
      }
      for (const gridZ of [cz, cz + 1]) {
        const worldZ = gridZ * GRID_PITCH;
        this.addBox(verts, indices, worldOriginX + CHUNK_SIZE / 2, 0.04, worldZ, CHUNK_SIZE, 0.08, ROAD_HALF_WIDTH * 2, 0.12, 0.12, 0.13, 1.0, idxOffset); idxOffset += 24;
        idxOffset = this.addRoadMarkings(verts, indices, idxOffset, true, worldZ, 0.10, worldOriginX, worldOriginX + CHUNK_SIZE);
      }
    }
    if (isBeach || isRural) {
      const nb = (dx: number, dz: number) => getBiome(cx + dx, cz + dz);
      const isRoad = (b: string) => b === 'city' || b === 'suburb' || b === 'parking_lot' || b === 'bridge' || b === 'bridge_connector';
      if (isRoad(nb(-1, 0))) {
        this.addBox(verts, indices, cx * GRID_PITCH, 0.04, worldOriginZ + CHUNK_SIZE / 2, ROAD_HALF_WIDTH * 2, 0.08, CHUNK_SIZE, 0.12, 0.12, 0.13, 1.0, idxOffset); idxOffset += 24;
      }
      // Add a short blended apron at every non-ocean road seam. It overlaps
      // both chunk meshes by a small amount, eliminating visible gaps when a
      // city, rural, beach, or connector tile meets another biome.
      const seamRoad = (dx: number, dz: number) => {
        const b = nb(dx, dz);
        return isRoad(b) || b.startsWith('rural') || b === 'beach';
      };
      if (seamRoad(-1, 0)) this.addBox(verts, indices, cx * CHUNK_SIZE, 0.045, worldOriginZ + CHUNK_SIZE / 2, ROAD_HALF_WIDTH * 2 + 1.5, 0.09, CHUNK_SIZE, 0.13, 0.13, 0.14, 1.0, idxOffset), idxOffset += 24;
      if (seamRoad(1, 0)) this.addBox(verts, indices, (cx + 1) * CHUNK_SIZE, 0.045, worldOriginZ + CHUNK_SIZE / 2, ROAD_HALF_WIDTH * 2 + 1.5, 0.09, CHUNK_SIZE, 0.13, 0.13, 0.14, 1.0, idxOffset), idxOffset += 24;
      if (seamRoad(0, -1)) this.addBox(verts, indices, worldOriginX + CHUNK_SIZE / 2, 0.045, cz * CHUNK_SIZE, CHUNK_SIZE, 0.09, ROAD_HALF_WIDTH * 2 + 1.5, 0.13, 0.13, 0.14, 1.0, idxOffset), idxOffset += 24;
      if (seamRoad(0, 1)) this.addBox(verts, indices, worldOriginX + CHUNK_SIZE / 2, 0.045, (cz + 1) * CHUNK_SIZE, CHUNK_SIZE, 0.09, ROAD_HALF_WIDTH * 2 + 1.5, 0.13, 0.13, 0.14, 1.0, idxOffset), idxOffset += 24;
      if (isRoad(nb(1, 0))) {
        this.addBox(verts, indices, (cx + 1) * GRID_PITCH, 0.04, worldOriginZ + CHUNK_SIZE / 2, ROAD_HALF_WIDTH * 2, 0.08, CHUNK_SIZE, 0.12, 0.12, 0.13, 1.0, idxOffset); idxOffset += 24;
      }
      if (isRoad(nb(0, -1))) {
        this.addBox(verts, indices, worldOriginX + CHUNK_SIZE / 2, 0.04, cz * GRID_PITCH, CHUNK_SIZE, 0.08, ROAD_HALF_WIDTH * 2, 0.12, 0.12, 0.13, 1.0, idxOffset); idxOffset += 24;
      }
      if (isRoad(nb(0, 1))) {
        this.addBox(verts, indices, worldOriginX + CHUNK_SIZE / 2, 0.04, (cz + 1) * GRID_PITCH, CHUNK_SIZE, 0.08, ROAD_HALF_WIDTH * 2, 0.12, 0.12, 0.13, 1.0, idxOffset); idxOffset += 24;
      }
    }
    if (!isBeach && !isBridge && !isBridgeConnector && !isAeroport) {
      const gap = ROAD_HALF_WIDTH + 1; 
      const segLen = CHUNK_SIZE - (gap * 2); 
      for (const [ddx, ddz] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
        if (getBiome(cx + ddx, cz + ddz) !== 'ocean') continue;
        let isNearBridge = false;
        for (const br of BRIDGES) {
          if (Math.abs(cx - br.startCx) <= 2 && Math.abs(cz - br.startCz) <= 2) isNearBridge = true;
          if (Math.abs(cx - br.endCx) <= 2 && Math.abs(cz - br.endCz) <= 2) isNearBridge = true;
        }
        if (isNearBridge) continue;
        if (ddx !== 0) {
          const wx = (cx + 0.5 + ddx * 0.49) * CHUNK_SIZE;
          this.addBox(verts, indices, wx, 1.25, worldOriginZ + CHUNK_SIZE / 2, 2, 2.5, segLen, 0.45, 0.45, 0.47, 1.0, idxOffset); idxOffset += 24;
        } else {
          const wz = (cz + 0.5 + ddz * 0.49) * CHUNK_SIZE;
          this.addBox(verts, indices, worldOriginX + CHUNK_SIZE / 2, 1.25, wz, segLen, 2.5, 2, 0.45, 0.45, 0.47, 1.0, idxOffset); idxOffset += 24;
        }
      }
    }
    for (let by = 0; by < blocksPerChunk; by++) {
      for (let bx = 0; bx < blocksPerChunk; bx++) {
        const gx = cx * blocksPerChunk + bx;
        const gz = cz * blocksPerChunk + by;
        const blockWorldX = gx * GRID_PITCH + GRID_PITCH / 2;
        const blockWorldZ = gz * GRID_PITCH + GRID_PITCH / 2;
        if (isParkingLot) {
          const rowSpacing = 6;
          const stallW = 3, stallD = 5;
          for (let row = 0; row < 5; row++) {
            const rz = blockWorldZ - 14 + row * rowSpacing;
            if (row === 2) continue;
            for (let col = 0; col < 7; col++) {
              const rx = blockWorldX - 9 + col * 3;
              this.addBox(verts, indices, rx - stallW / 2, 0.02, rz, 0.15, 0.04, stallD, 0.9, 0.9, 0.9, 1.0, idxOffset); idxOffset += 24;
              this.addBox(verts, indices, rx + stallW / 2, 0.02, rz, 0.15, 0.04, stallD, 0.9, 0.9, 0.9, 1.0, idxOffset); idxOffset += 24;
              this.addBox(verts, indices, rx, 0.02, rz - stallD / 2, stallW, 0.04, 0.15, 0.9, 0.9, 0.9, 1.0, idxOffset); idxOffset += 24;
            }
          }
          this.addBox(verts, indices, blockWorldX, 0.1, blockWorldZ - 18, 38, 0.2, 0.6, 0.3, 0.3, 0.32, 1.0, idxOffset); idxOffset += 24;
          this.addBox(verts, indices, blockWorldX, 0.1, blockWorldZ + 18, 38, 0.2, 0.6, 0.3, 0.3, 0.32, 1.0, idxOffset); idxOffset += 24;
          continue;
        }
        if (!isBeach && !isAeroport && !isBridge && !isBridgeConnector && !isRural) {
          const swShade = 0.38 + (rng() * 0.08);
          const swHalf = SIDEWALK_SIZE / 2;
          this.addBox(verts, indices, blockWorldX, 0.15, blockWorldZ, SIDEWALK_SIZE, 0.3, SIDEWALK_SIZE, swShade, swShade, swShade, 1.0, idxOffset); idxOffset += 24;
          const curbH = 0.1, curbW = 0.6;
          const roadDist = GRID_PITCH / 2 - swHalf;
          for (const side of [-1, 1]) {
            const cz_ = blockWorldZ + side * swHalf;
            this.addBox(verts, indices, blockWorldX, 0.35, cz_, SIDEWALK_SIZE, curbH, curbW, 0.5 + swShade * 0.3, 0.5 + swShade * 0.3, 0.5 + swShade * 0.3, 1.0, idxOffset); idxOffset += 24;
          }
          for (const side of [-1, 1]) {
            const cx_ = blockWorldX + side * swHalf;
            this.addBox(verts, indices, cx_, 0.35, blockWorldZ, curbW, curbH, SIDEWALK_SIZE, 0.5 + swShade * 0.3, 0.5 + swShade * 0.3, 0.5 + swShade * 0.3, 1.0, idxOffset); idxOffset += 24;
          }
        }
        if (isBeach) {
          const halfSW = SIDEWALK_SIZE / 2;
          const tatamiPositions: { x: number; z: number }[] = [];
          for (const t of tatami) tatamiPositions.push({ x: t.x, z: t.z });
          // Layer several inexpensive beach props so the sand reads as a
          // lived-in shoreline rather than an empty flat tile.
          for (let i = 0; i < 6; i++) {
            let px: number, pz: number, valid: boolean;
            let attempts = 0;
            do {
              px = blockWorldX + (rng() - 0.5) * (SIDEWALK_SIZE - 10);
              pz = blockWorldZ + (rng() - 0.5) * (SIDEWALK_SIZE - 10);
              valid = true;
              for (const tp of tatamiPositions) {
                if (Math.hypot(px - tp.x, pz - tp.z) < 10) { valid = false; break; }
              }
              attempts++;
            } while (!valid && attempts < 10);
            if (this.palmTreeMesh) {
              trees.push({ x: px, z: pz, yaw: rng() * 0.4 - 0.2, scale: 9 + rng() * 1.8 });
            } else {
              const ph = 5 + rng() * 3;
              this.addBox(verts, indices, px, ph / 2, pz, 0.4, ph, 0.4, 0.3, 0.18, 0.05, 1.0, idxOffset); idxOffset += 24;
              this.addBox(verts, indices, px, ph + 0.5, pz, 3, 0.6, 3, 0.1, 0.45, 0.05, 1.0, idxOffset); idxOffset += 24;
            }
          }
          for (let i = 0; i < 5; i++) {
            if (rng() < 0.72) {
              const ux = blockWorldX - 12 + rng() * 24;
              const uz = blockWorldZ - 12 + rng() * 24;
              const palette = [[1, 0.2, 0.2], [0.2, 0.5, 1], [1, 1, 0.2], [0.9, 0.4, 0.7]];
              const col = palette[Math.floor(rng() * palette.length)];
              this.addBox(verts, indices, ux, 1.5, uz, 0.1, 2.5, 0.1, 0.4, 0.3, 0.2, 1.0, idxOffset); idxOffset += 24; 
              this.addBox(verts, indices, ux, 2.6, uz, 3, 0.2, 3, col[0], col[1], col[2], 1.0, idxOffset); idxOffset += 24; 
            }
          }
          if (rng() < 0.3) {
            const lx = blockWorldX + halfSW - 5;
            const lz = blockWorldZ + halfSW - 5;
            this.addBox(verts, indices, lx, 1.0, lz, 1.2, 0.15, 1.2, 0.7, 0.5, 0.3, 1.0, idxOffset); idxOffset += 24; 
            this.addBox(verts, indices, lx, 2.0, lz - 0.5, 0.15, 2, 0.15, 0.7, 0.5, 0.3, 1.0, idxOffset); idxOffset += 24; 
            this.addBox(verts, indices, lx, 0.8, lz + 0.5, 0.15, 1.6, 0.15, 0.7, 0.5, 0.3, 1.0, idxOffset); idxOffset += 24; 
            this.addBox(verts, indices, lx, 2.2, lz, 0.15, 0.8, 1.2, 0.7, 0.5, 0.3, 1.0, idxOffset); idxOffset += 24; 
          }
          if (rng() < 0.55 && !isAeroport) {
            benches.push({ x: blockWorldX, z: blockWorldZ + halfSW - 3, yaw: Math.PI });
          }
          // Low-cost beach furniture, litter, driftwood, and umbrella poles.
          for (let prop = 0; prop < 5; prop++) {
            const px = blockWorldX + (rng() - 0.5) * 26;
            const pz = blockWorldZ + (rng() - 0.5) * 26;
            if (isOnRoadGrid(px, pz)) continue;
            const kind = Math.floor(rng() * 4);
            if (kind === 0) {
              this.addBox(verts, indices, px, 0.35, pz, 1.8, 0.12, 0.55, 0.88, 0.84, 0.72, 1.0, idxOffset); idxOffset += 24;
              this.addBox(verts, indices, px, 0.65, pz, 0.12, 0.7, 0.12, 0.72, 0.42, 0.20, 1.0, idxOffset); idxOffset += 24;
            } else if (kind === 1) {
              this.addBox(verts, indices, px, 0.16, pz, 1.6 + rng() * 1.8, 0.12, 0.18, 0.38, 0.24, 0.12, 1.0, idxOffset); idxOffset += 24;
            } else if (kind === 2) {
              this.addBox(verts, indices, px, 0.12, pz, 0.35, 0.22, 0.35, 0.78, 0.78, 0.68, 1.0, idxOffset); idxOffset += 24;
            } else {
              this.addBox(verts, indices, px, 1.25, pz, 0.10, 2.5, 0.10, 0.55, 0.32, 0.16, 1.0, idxOffset); idxOffset += 24;
              this.addBox(verts, indices, px, 2.45, pz, 2.5, 0.12, 2.5, 0.95, 0.25 + rng() * 0.5, 0.18, 0.85, idxOffset); idxOffset += 24;
            }
          }
          if (this.tatamiRoomMesh) {
            for (let i = 0; i < 2; i++) {
              if (rng() < 0.5) {
                const tx = blockWorldX - halfSW + 6 + i * (SIDEWALK_SIZE / 2.5) + rng() * 3;
                const tz = blockWorldZ - halfSW + 3;
                tatami.push({ x: tx, z: tz, yaw: 0 });
              }
            }
          }
          if (this.woodenCabineMesh && rng() < 0.4) {
            const cx = blockWorldX + (rng() - 0.5) * 20;
            const cz = blockWorldZ + halfSW - 5;
            cabins.push({ x: cx, z: cz, yaw: rng() > 0.5 ? 0 : Math.PI });
          }
          if (this.tropicalShopMesh && rng() < 0.15) {
            const sx = blockWorldX + (rng() - 0.5) * 22;
            const sz = blockWorldZ + halfSW - 4;
            tropicalShops.push({ x: sx, z: sz, yaw: rng() > 0.5 ? 0 : Math.PI });
          }
          if (this.cylindricalTowerMesh && rng() < 0.03) {
            const corner = Math.floor(rng() * 4);
            const cx = corner < 2 ? blockWorldX - halfSW + 2 : blockWorldX + halfSW - 2;
            const cz = corner % 2 === 0 ? blockWorldZ - halfSW + 2 : blockWorldZ + halfSW - 2;
            lighthouses.push({ x: cx, z: cz, yaw: corner * Math.PI / 2 });
          }
          continue;
        }
        if (isAeroport) {
          const isParkingZone = isAeroportParkingChunk(cx, cz);
          if (isParkingZone) {
            const rowSpacing = 6;
            const stallW = 3, stallD = 5;
            for (let row = 0; row < 5; row++) {
              const rz = blockWorldZ - 14 + row * rowSpacing;
              if (row === 2) continue;
              for (let col = 0; col < 7; col++) {
                const rx = blockWorldX - 9 + col * 3;
                this.addBox(verts, indices, rx - stallW / 2, 0.02, rz, 0.15, 0.04, stallD, 0.9, 0.9, 0.9, 1.0, idxOffset); idxOffset += 24;
                this.addBox(verts, indices, rx + stallW / 2, 0.02, rz, 0.15, 0.04, stallD, 0.9, 0.9, 0.9, 1.0, idxOffset); idxOffset += 24;
                this.addBox(verts, indices, rx, 0.02, rz - stallD / 2, stallW, 0.04, 0.15, 0.9, 0.9, 0.9, 1.0, idxOffset); idxOffset += 24;
                if ((col + row) % 2 === 0 && this.carMeshes.length > 0) {
                  buildings.push({ model: this.carMeshes[Math.floor(rng() * this.carMeshes.length)], x: rx, y: 0.15, z: rz, yaw: 0, scale: [1, 1, 1] });
                }
              }
            }
            this.addBox(verts, indices, blockWorldX, 0.1, blockWorldZ - 18, 38, 0.2, 0.6, 0.3, 0.3, 0.32, 1.0, idxOffset); idxOffset += 24;
            this.addBox(verts, indices, blockWorldX, 0.1, blockWorldZ + 18, 38, 0.2, 0.6, 0.3, 0.3, 0.32, 1.0, idxOffset); idxOffset += 24;
            const dCz = (cx >= 33 && cx <= 46 && cz >= 10) ? 1 : -1;
            const nextCz = cz + dCz;
            const biomeNext = getBiome(cx, nextCz);
            if (biomeNext === 'aeroport' && !isAeroportParkingChunk(cx, nextCz)) {
              const wallZ = dCz > 0 ? blockWorldZ + GRID_PITCH / 2 : blockWorldZ - GRID_PITCH / 2;
              const entryRoad = GrandTheftRenderer.AIRPORT_ENTRY_ROADS.find(e => e.gx === gx);
              if (entryRoad) {
                const roadX = entryRoad.gx * GRID_PITCH;
                const entryGap = 20;
                const halfSpan = GRID_PITCH / 2;
                const segWidth = halfSpan - entryGap / 2;
                this.addBox(verts, indices, roadX - entryGap / 2 - segWidth / 2, 1.5, wallZ, segWidth, 3, 0.4, 0.35, 0.35, 0.37, 1.0, idxOffset); idxOffset += 24;
                this.addBox(verts, indices, roadX + entryGap / 2 + segWidth / 2, 1.5, wallZ, segWidth, 3, 0.4, 0.35, 0.35, 0.37, 1.0, idxOffset); idxOffset += 24;
                const pillarH = 6, pillarW = 1;
                this.addBox(verts, indices, roadX - entryGap / 2 - pillarW / 2, pillarH / 2, wallZ, pillarW, pillarH, pillarW, 0.5, 0.5, 0.52, 1.0, idxOffset); idxOffset += 24;
                this.addBox(verts, indices, roadX + entryGap / 2 + pillarW / 2, pillarH / 2, wallZ, pillarW, pillarH, pillarW, 0.5, 0.5, 0.52, 1.0, idxOffset); idxOffset += 24;
                this.addBox(verts, indices, roadX, pillarH - 0.3, wallZ, entryGap + pillarW * 2, 0.6, 0.8, 0.6, 0.6, 0.62, 1.0, idxOffset); idxOffset += 24;
                const boothW = 2, boothD = 2.5, boothH = 2.5;
                this.addBox(verts, indices, roadX - entryGap / 2 - 2, 0.05, wallZ - 5, boothW, 0.1, boothD, 0.25, 0.25, 0.27, 1.0, idxOffset); idxOffset += 24;
                this.addBox(verts, indices, roadX - entryGap / 2 - 2, boothH / 2, wallZ - 5, boothW, boothH, boothD, 0.3, 0.3, 0.32, 1.0, idxOffset); idxOffset += 24;
                this.addBox(verts, indices, roadX - entryGap / 2 - 2, boothH * 0.55, wallZ - 5, boothW * 0.9, boothH * 0.35, boothD * 0.05, 0.6, 0.8, 1.0, 0.6, idxOffset); idxOffset += 24;
                this.addBox(verts, indices, roadX + entryGap / 2 + 2, 0.05, wallZ - 5, boothW, 0.1, boothD, 0.25, 0.25, 0.27, 1.0, idxOffset); idxOffset += 24;
                this.addBox(verts, indices, roadX + entryGap / 2 + 2, boothH / 2, wallZ - 5, boothW, boothH, boothD, 0.3, 0.3, 0.32, 1.0, idxOffset); idxOffset += 24;
                this.addBox(verts, indices, roadX + entryGap / 2 + 2, boothH * 0.55, wallZ - 5, boothW * 0.9, boothH * 0.35, boothD * 0.05, 0.6, 0.8, 1.0, 0.6, idxOffset); idxOffset += 24;
              } else {
                this.addBox(verts, indices, blockWorldX, 1.5, wallZ, GRID_PITCH, 3, 0.4, 0.35, 0.35, 0.37, 1.0, idxOffset); idxOffset += 24;
              }
            }
            continue;
          }
          this.addBox(verts, indices, blockWorldX, 0.1, blockWorldZ, 8, 0.2, GRID_PITCH, 0.12, 0.12, 0.13, 1.0, idxOffset); idxOffset += 24;
          for (let dz = -GRID_PITCH / 2 + 4; dz < GRID_PITCH / 2; dz += 8) {
            this.addBox(verts, indices, blockWorldX, 0.11, blockWorldZ + dz, 0.5, 0.05, 3, 1, 1, 1, 0.8, idxOffset); idxOffset += 24;
          }
          const aRole = rng();
          const hasTerminal = aRole < 0.02;            // Every airport apron gets a helipad. The old probabilistic branch
            // left most airport chunks without a helicopter at all, making the
            // airport feel empty and making visibility depend on chunk luck.
            const hasHelipad = aRole >= 0.02 && aRole < 0.32;
          const HS = 2.5;
          if (hasTerminal && this.airportBuildingMeshes.length > 0) {
            const term = this.airportBuildingMeshes[Math.floor(rng() * this.airportBuildingMeshes.length)];
            const bMinY = this.getModelMinY(term);
            const bx_ = blockWorldX - 24;
            const bz_ = blockWorldZ + (rng() - 0.5) * 14;
            buildings.push({ model: term, x: bx_, y: -bMinY * 3 + 0.15, z: bz_, yaw: Math.PI / 2, scale: [3, 3, 3] });
            for (let pi = 0; pi < 5; pi++) {
              const sz = bz_ - 9 + pi * 3.5;
              this.addBox(verts, indices, bx_ + 8, 0.02, sz, 0.15, 0.04, 5, 0.9, 0.9, 0.9, 1.0, idxOffset); idxOffset += 24;
              this.addBox(verts, indices, bx_ + 12, 0.02, sz, 0.15, 0.04, 5, 0.9, 0.9, 0.9, 1.0, idxOffset); idxOffset += 24;
              this.addBox(verts, indices, bx_ + 10, 0.02, sz - 2.5, 4, 0.04, 0.15, 0.9, 0.9, 0.9, 1.0, idxOffset); idxOffset += 24;
              if (pi % 2 === 0 && this.carMeshes.length > 0) {
                buildings.push({ model: this.carMeshes[Math.floor(rng() * this.carMeshes.length)], x: bx_ + 10, y: 0.15, z: sz, yaw: 0, scale: [1, 1, 1] });
              }
            }
            if (this.airportHangarMesh) {
              const hm = this.airportHangarMesh;
              buildings.push({ model: hm, x: blockWorldX + 35, y: -this.getModelMinY(hm) * HS + 0.15, z: blockWorldZ, yaw: -Math.PI / 2, scale: [HS, HS, HS] });
            }
          } else if (hasHelipad) {
            // Keep the complete pad inside the airport's active 40×40 block;
            // the previous -25 offset put its west edge outside the apron.
            const padX = blockWorldX - 18;
            const padZ = blockWorldZ;
            this.addBox(verts, indices, padX, 0.05, padZ, 14, 0.1, 14, 0.4, 0.4, 0.42, 1.0, idxOffset); idxOffset += 24;
            this.addBox(verts, indices, padX - 7, 0.06, padZ, 0.3, 0.05, 14, 0.9, 0.8, 0.1, 1.0, idxOffset); idxOffset += 24;
            this.addBox(verts, indices, padX + 7, 0.06, padZ, 0.3, 0.05, 14, 0.9, 0.8, 0.1, 1.0, idxOffset); idxOffset += 24;
            this.addBox(verts, indices, padX, 0.06, padZ - 7, 14, 0.05, 0.3, 0.9, 0.8, 0.1, 1.0, idxOffset); idxOffset += 24;
            this.addBox(verts, indices, padX, 0.06, padZ + 7, 14, 0.05, 0.3, 0.9, 0.8, 0.1, 1.0, idxOffset); idxOffset += 24;
            const hw = 0.8, hh = 4;
            this.addBox(verts, indices, padX - 2.5, 0.06, padZ, hw, 0.06, hh, 1, 1, 1, 0.9, idxOffset); idxOffset += 24;
            this.addBox(verts, indices, padX + 2.5, 0.06, padZ, hw, 0.06, hh, 1, 1, 1, 0.9, idxOffset); idxOffset += 24;
            this.addBox(verts, indices, padX, 0.06, padZ, hh * 0.6, 0.06, hw, 1, 1, 1, 0.9, idxOffset); idxOffset += 24;
            // Park a helicopter on the pad. Prefer any loaded GLTF models, but
            // those were retired — fall back to the always-available procedural
            // helicopter so helipads are never left empty.
            const heli: CityMesh[] = this.helicopterMeshes.length > 0
              ? this.helicopterMeshes[Math.floor(rng() * this.helicopterMeshes.length)]
              : this.getProceduralHelicopterMeshes().regular;
            // Keep a stable, explicit aircraft placement record as well as the
            // building placement. The render pass uses this record for culling
            // and rotor animation; it must survive chunk construction.
            const heliYaw = rng() * Math.PI * 2;
            buildings.push({ model: heli, x: padX, y: -this.getModelMinY(heli) + 0.18, z: padZ, yaw: heliYaw, scale: [1, 1, 1] });
            decorativeAircraft.push({ x: padX, z: padZ, yaw: heliYaw, type: 'helicopter', model: heli });
            if (this.airportHangarMesh) {
              buildings.push({ model: this.airportHangarMesh, x: blockWorldX + 35, y: -this.getModelMinY(this.airportHangarMesh) * HS + 0.15, z: blockWorldZ, yaw: -Math.PI / 2, scale: [HS, HS, HS] });
              if (this.planeMeshes.length > 0) {
                const planeModel = this.planeMeshes[Math.floor(rng() * this.planeMeshes.length)];
                buildings.push({ model: planeModel, x: blockWorldX + 35, y: 0.15, z: blockWorldZ + 18, yaw: Math.PI, scale: [1, 1, 1] });
                decorativeAircraft.push({ x: blockWorldX + 35, z: blockWorldZ + 18, yaw: Math.PI, type: 'plane', model: planeModel });
              }
            }
          } else {
            if (this.airportHangarMesh) {
              const hx = blockWorldX;
              const hz = blockWorldZ;
              buildings.push({
                model: this.airportHangarMesh,
                x: hx, y: -this.getModelMinY(this.airportHangarMesh) * HS + 0.15, z: hz,
                yaw: rng() > 0.5 ? -Math.PI / 2 : Math.PI / 2,
                scale: [HS, HS, HS]
              });
              if (this.planeMeshes.length > 0) {
                const planeModel = this.planeMeshes[Math.floor(rng() * this.planeMeshes.length)];
                buildings.push({ model: planeModel, x: hx, y: 0.15, z: hz - 14, yaw: Math.PI, scale: [1, 1, 1] });
                decorativeAircraft.push({ x: hx, z: hz - 14, yaw: Math.PI, type: 'plane', model: planeModel });
              }
            }
          }
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
        if (isRural) {
          if (isRuralMountain || isRuralHills) {
            const roadClear = 14;
            const rockCount = (this.isMobile ? 2 : 3) + Math.floor(rng() * (this.isMobile ? 2 : 4));
            for (let rock = 0; rock < rockCount; rock++) {
              const rx = blockWorldX + (rng() - 0.5) * 55;
              const rz = blockWorldZ + (rng() - 0.5) * 55;
              const distGX = Math.min(Math.abs(rx - cx * CHUNK_SIZE), Math.abs(rx - (cx + 1) * CHUNK_SIZE));
              const distGZ = Math.min(Math.abs(rz - cz * CHUNK_SIZE), Math.abs(rz - (cz + 1) * CHUNK_SIZE));
              if (distGX < roadClear || distGZ < roadClear) continue;
              const rockY = getMountainHeight(rx, rz);
              idxOffset = this.addMountainRock(
                verts, indices, rx, rockY + 0.02, rz,
                1.5 + rng() * 3.5, 1.2 + rng() * 3.8,
                0.22 + rng() * 0.10, 0.23 + rng() * 0.10, 0.20 + rng() * 0.08, idxOffset
              );
            }
            for (let ti = 0; ti < 3 + Math.floor(rng() * 3); ti++) {
              if (this.palmTreeMesh) {
                const tx = blockWorldX + (rng() - 0.5) * 55;
                const tz = blockWorldZ + (rng() - 0.5) * 55;
                const distGX = Math.min(Math.abs(tx - cx * CHUNK_SIZE), Math.abs(tx - (cx + 1) * CHUNK_SIZE));
                const distGZ = Math.min(Math.abs(tz - cz * CHUNK_SIZE), Math.abs(tz - (cz + 1) * CHUNK_SIZE));
                if (distGX < roadClear || distGZ < roadClear) continue;
                trees.push({ x: tx, z: tz, yaw: rng() * 0.3, scale: 3.0 + rng() * 1.8 });
              }
            }
          }
          else if (isRuralDesert) {
            for (let ci = 0; ci < 4 + Math.floor(rng() * 4); ci++) {
              const cx = blockWorldX + (rng() - 0.5) * 55;
              const cz = blockWorldZ + (rng() - 0.5) * 55;
              const ch = 2 + rng() * 3;
              this.addBox(verts, indices, cx, ch / 2, cz, 0.3, ch, 0.3, 0.15, 0.40, 0.08, 1.0, idxOffset); idxOffset += 24;
              if (rng() < 0.4) {
                this.addBox(verts, indices, cx + (rng() - 0.5) * 1.5, ch + 0.3, cz + (rng() - 0.5) * 1.5, 0.3, 0.8, 0.3, 0.12, 0.35, 0.06, 1.0, idxOffset); idxOffset += 24;
              }
            }
            if (rng() < 0.2 && this.ruralShopMesh) {
              const bx = blockWorldX + (rng() - 0.5) * 40;
              const bz = blockWorldZ + (rng() - 0.5) * 40;
              const bMinY = this.getModelMinY(this.ruralShopMesh);
              buildings.push({ model: this.ruralShopMesh, x: bx, y: -bMinY * 2.5 + 0.15, z: bz, yaw: Math.floor(rng() * 4) * Math.PI / 2, scale: [2.5, 2.5, 2.5] });
            }
          }
          else if (isRuralLakes) {
            for (let ti = 0; ti < 3 + Math.floor(rng() * 4); ti++) {
              if (this.palmTreeMesh) {
                const tx = blockWorldX + (rng() - 0.5) * 40;
                const tz = blockWorldZ + (rng() - 0.5) * 40;
                if (Math.abs(tx - blockWorldX) < 15 && Math.abs(tz - blockWorldZ) < 15) continue;
                trees.push({ x: tx, z: tz, yaw: rng() * 0.3, scale: 2.4 + rng() * 1.5 });
              }
            }
          }
          else {
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
                const bx = blockWorldX + (rng() - 0.5) * 40;
                const bz = blockWorldZ + (rng() - 0.5) * 40;
                const bYaw = Math.floor(rng() * 4) * Math.PI / 2;
                const bScale = this.isHungryJacksModel(model)
                  ? this.hungryJacksScale(model, 32, 32, bYaw)
                  : (useHouse ? 2.5 + rng() * 2 : 3 + rng() * 2);
                const bMinY = this.getModelMinY(model);
                buildings.push({ model, x: bx, y: -bMinY * bScale + 0.15, z: bz, yaw: bYaw, scale: [bScale, bScale, bScale] });
                for (let ci = 0; ci < 3 + Math.floor(rng() * 4); ci++) {
                  chickens.push({ x: bx + (rng() - 0.5) * 12, z: bz + (rng() - 0.5) * 12, yaw: rng() * Math.PI * 2 });
                }
              }
            }
            for (let ti = 0; ti < 8 + Math.floor(rng() * 6); ti++) {
              if (this.palmTreeMesh && rng() < 0.7) {
                const tx = blockWorldX + (rng() - 0.5) * 60;
                const tz = blockWorldZ + (rng() - 0.5) * 60;
                trees.push({ x: tx, z: tz, yaw: rng() * 0.3, scale: 2.4 + rng() * 1.8 });
              }
            }
            if (isRuralFarm && rng() < 0.6) {
              for (let ri = 0; ri < 4 + Math.floor(rng() * 4); ri++) {
                const cx = blockWorldX + (rng() - 0.5) * 50;
                const cz = blockWorldZ + (rng() - 0.5) * 50;
                this.addBox(verts, indices, cx, 0.15, cz, 1.5 + rng() * 3, 0.3 + rng() * 0.2, 0.5, 0.6 + rng() * 0.3, 0.5 + rng() * 0.2, 0.1, 1.0, idxOffset); idxOffset += 24;
              }
            }
            if (rng() < 0.4) {
              chickens.push({ x: blockWorldX + (rng() - 0.5) * 50, z: blockWorldZ + (rng() - 0.5) * 50, yaw: rng() * Math.PI * 2 });
            }
          }
          continue;
        }
        if (isBridge || isBridgeConnector) continue;
        const grassG = isSuburb ? 0.42 : 0.10;
        this.addBox(verts, indices, blockWorldX, 0.075, blockWorldZ, BLOCK_SIZE, 0.15, BLOCK_SIZE, 0.08, grassG, 0.08, 1.0, idxOffset); idxOffset += 24;
        if ((cx === 0 && cz === 0) || (cx === 1 && cz === 0)) continue;
        const halfSW = SIDEWALK_SIZE / 2;
        const edges = [
          { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
          { dx: 1, dz: 0 }, { dx: -1, dz: 0 }
        ];
        const placedAABBs: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
        const modelWorldAABB = (model: CityMesh | CityMesh[], px: number, pz: number, scale: [number, number, number], yaw: number): { minX: number; maxX: number; minZ: number; maxZ: number } | null => {
          const arr = Array.isArray(model) ? model : [model];
          let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
          for (const m of arr) {
            if (m.minX === undefined || m.maxX === undefined || m.minZ === undefined || m.maxZ === undefined) return null;
            const rs = m.renderScale ?? 1;
            const sx = scale[0] * rs, sz = scale[2] * rs;
            const rot = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            const corners = [[m.minX, m.minZ], [m.minX, m.maxZ], [m.maxX, m.minZ], [m.maxX, m.maxZ]];
            for (const corner of corners) {
              const lx = corner[0] * sx, lz = corner[1] * sz;
              const wx = px + lx * Math.cos(rot) + lz * Math.sin(rot);
              const wz = pz - lx * Math.sin(rot) + lz * Math.cos(rot);
              minX = Math.min(minX, wx); maxX = Math.max(maxX, wx);
              minZ = Math.min(minZ, wz); maxZ = Math.max(maxZ, wz);
            }
          }
          return { minX, maxX, minZ, maxZ };
        };
        const overlapsExisting = (bb: { minX: number; maxX: number; minZ: number; maxZ: number }): boolean => {
          const gap = 2.0;
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
        const nativeBounds = (model: CityMesh | CityMesh[]) => {
          const arr = Array.isArray(model) ? model : [model];
          let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
          for (const m of arr) {
            const rs = m.renderScale ?? 1;
            if (m.minX === undefined || m.maxX === undefined || m.minZ === undefined || m.maxZ === undefined) return null;
            minX = Math.min(minX, m.minX * rs); maxX = Math.max(maxX, m.maxX * rs);
            minZ = Math.min(minZ, m.minZ * rs); maxZ = Math.max(maxZ, m.maxZ * rs);
          }
          return { minX, maxX, minZ, maxZ };
        };
        if (isSuburb) {
          if (rng() < 0.25 && this.suburbBuildingMeshes.length > 0) {
            const poiModels = this.suburbBuildingMeshes.filter((_, i) => i % 3 === 0);
            if (poiModels.length > 0) {
              const model = poiModels[Math.floor(rng() * poiModels.length)];
              const pyaw = Math.floor(rng() * 4) * Math.PI / 2;
              const poiScale = this.isHungryJacksModel(model)
                ? this.hungryJacksScale(model, SIDEWALK_SIZE - 8, SIDEWALK_SIZE - 8, pyaw)
                : 5 + rng() * 2;
              const poiMinY = this.getModelMinY(model);
              const sc: [number, number, number] = [poiScale, poiScale, poiScale];
              if (tryPlace(model, blockWorldX, blockWorldZ, sc, pyaw)) {
                buildings.push({ model, x: blockWorldX, y: -poiMinY * poiScale + 0.15, z: blockWorldZ, yaw: pyaw, scale: sc });
              }
            }
          }
          for (const edge of edges) {
            const numHouses = 1 + Math.floor(rng() * 2);
            const houseWidth = (SIDEWALK_SIZE - 12) / numHouses; 
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
                let nativeMinX = 0, nativeMaxX = 1, nativeMinZ = 0, nativeMaxZ = 1;
                { let mnX = Infinity, mxX = -Infinity, mnZ = Infinity, mxZ = -Infinity;
                  for (const m of (Array.isArray(model) ? model : [model])) {
                    const rs = m.renderScale ?? 1;
                    if (m.minX !== undefined) mnX = Math.min(mnX, m.minX * rs); if (m.maxX !== undefined) mxX = Math.max(mxX, m.maxX * rs);
                    if (m.minZ !== undefined) mnZ = Math.min(mnZ, m.minZ * rs); if (m.maxZ !== undefined) mxZ = Math.max(mxZ, m.maxZ * rs);
                  }
                  if (isFinite(mnX)) { nativeMinX = mnX; nativeMaxX = mxX; nativeMinZ = mnZ; nativeMaxZ = mxZ; } }
              const nativeWidth = (edge.dx === 0) ? (nativeMaxX - nativeMinX) : (nativeMaxZ - nativeMinZ);
              const nativeDepth = (edge.dx === 0) ? (nativeMaxZ - nativeMinZ) : (nativeMaxX - nativeMinX);
                const scVal = this.isHungryJacksModel(model)
                  ? this.hungryJacksScale(model, w, SIDEWALK_SIZE - 2, yaw)
                  : (nativeWidth > 0.01 ? w / nativeWidth : 1);
                const actualDepth = nativeDepth * scVal;
                if (edge.dx === 0) {
                  px = blockWorldX - halfSW + 6 + houseWidth / 2 + i * houseWidth;
                  pz = blockWorldZ + edge.dz * (halfSW - 1 - actualDepth / 2);
                } else {
                  pz = blockWorldZ - halfSW + 6 + houseWidth / 2 + i * houseWidth;
                  px = blockWorldX + edge.dx * (halfSW - 1 - actualDepth / 2);
                }
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
          if (rng() < 0.3) {
            chickens.push({ x: blockWorldX + (rng() - 0.5) * 20, z: blockWorldZ + (rng() - 0.5) * 20, yaw: rng() * Math.PI * 2 });
          }
        } else {
          const isBoulevardEdgeX = isBoulevard(gx);    
          const isBoulevardEdgeZ = isBoulevard(gz);    
          for (const edge of edges) {
            const numStores = 2 + Math.floor(rng() * 2);
            const storeWidth = (SIDEWALK_SIZE - 8) / numStores;
            for (let i = 0; i < numStores; i++) {
              if (rng() >= 0.78) {
                if (rng() < 0.4) {
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
              // Gas stations are generated locally so the forecourt and drive
              // lanes remain open instead of inheriting an opaque GLTF shell.
              const models = this.cityBuildingMeshes;
              const gasStationChance = isCity || isSuburb ? 0.10 : 0;
              if (gasStationChance > 0 && rng() < gasStationChance && i === 0) {
                const station = this.getGasStationMesh();
                const stationScale: [number, number, number] = [1, 1, 1];
                const stationY = 0.15;
                if (tryPlace(station, blockWorldX, blockWorldZ, stationScale, 0)) {
                  buildings.push({ model: station, x: blockWorldX, y: stationY, z: blockWorldZ, yaw: 0, scale: stationScale });
                }
                continue;
              }
              if (models.length > 0) {
                const model = models[Math.floor(rng() * models.length)];
                let nativeMinX = 0, nativeMaxX = 1, nativeMinZ = 0, nativeMaxZ = 1;
                { let mnX = Infinity, mxX = -Infinity, mnZ = Infinity, mxZ = -Infinity;
                  for (const m of (Array.isArray(model) ? model : [model])) {
                    const rs = m.renderScale ?? 1;
                    if (m.minX !== undefined) mnX = Math.min(mnX, m.minX * rs); if (m.maxX !== undefined) mxX = Math.max(mxX, m.maxX * rs);
                    if (m.minZ !== undefined) mnZ = Math.min(mnZ, m.minZ * rs); if (m.maxZ !== undefined) mxZ = Math.max(mxZ, m.maxZ * rs);
                  }
                  if (isFinite(mnX)) { nativeMinX = mnX; nativeMaxX = mxX; nativeMinZ = mnZ; nativeMaxZ = mxZ; } }
              const nativeWidth = (edge.dx === 0) ? (nativeMaxX - nativeMinX) : (nativeMaxZ - nativeMinZ);
              const nativeDepth = (edge.dx === 0) ? (nativeMaxZ - nativeMinZ) : (nativeMaxX - nativeMinX);
                let scVal = nativeWidth > 0.01 ? w / nativeWidth : 1;
                if (model.length > 0 && model[0].carName && model[0].carName.includes('skyscraper')) scVal *= 10;
                const actualDepth = nativeDepth * scVal;
                if (edge.dx === 0) {
                  px = blockWorldX - halfSW + 4 + storeWidth / 2 + i * storeWidth;
                  pz = blockWorldZ + edge.dz * (halfSW - 1 - actualDepth / 2);
                } else {
                  pz = blockWorldZ - halfSW + 4 + storeWidth / 2 + i * storeWidth;
                  px = blockWorldX + edge.dx * (halfSW - 1 - actualDepth / 2);
                }
                const sc: [number, number, number] = [scVal, scVal, scVal];
                const cityMinY = this.getModelMinY(model);
                if (tryPlace(model, px, pz, sc, yaw)) {
                  buildings.push({ model, x: px, y: -cityMinY * scVal + 0.15, z: pz, yaw, scale: sc });
                  if (model.length > 0 && model[0].carName && model[0].carName.includes('supermarket')) {
                    supermarkets.push({ x: px, z: pz, yaw, hd: this.supermarketHalfDepth(model, sc, yaw) });
                  }
                }
              } else {
                const r = 0.4 + rng() * 0.4, g = 0.4 + rng() * 0.4, b = 0.4 + rng() * 0.4;
                const h = 12 + rng() * 35;
                this.addBox(verts, indices, px, h / 2 + 0.04, pz, w, h, d, r, g, b, 1.0, idxOffset); idxOffset += 24;
                if (rng() < 0.4) {
                  this.addBox(verts, indices, px, h * 0.6, pz + edge.dz * (d / 2 + 0.05), w * 0.7, h * 0.2, 0.1, 1.0, 0.9, 0.4, 0.7, idxOffset); idxOffset += 24;
                }
              }
            }
          }
          if ((isBoulevardEdgeX || isBoulevardEdgeZ) && rng() < 0.5) {
          }
        }
      }
    }
    const INTERSECTION_CLEAR_RADIUS = ROAD_HALF_WIDTH + 2;
    const distanceToNearestGridNode = (x: number, z: number) => {
      const nx = Math.round(x / 80) * 80;
      const nz = Math.round(z / 80) * 80;
      return Math.hypot(x - nx, z - nz);
    };
    if (!isBeach && !isAeroport && !isBridge && !isBridgeConnector && !isParkingLot) {
      for (const gridX of [cx, cx + 1]) {
        if (!isBoulevard(gridX)) continue;
        const worldX = gridX * GRID_PITCH;
        const gap = INTERSECTION_CLEAR_RADIUS;
        const segLen = CHUNK_SIZE - (gap * 2);
        this.addBox(verts, indices, worldX, 0.15, worldOriginZ + CHUNK_SIZE / 2, 6, 0.3, segLen, 0.12, 0.30, 0.10, 1.0, idxOffset); idxOffset += 24;
        for (let z = worldOriginZ + gap; z < worldOriginZ + CHUNK_SIZE - gap; z += 16) {
          if (distanceToNearestGridNode(worldX, z) < gap) continue;
          if (this.cityTreeMesh && Math.floor((z - worldOriginZ) / 16) % 3 === 0) {
            trees.push({ x: worldX, z, yaw: 0, scale: 4.5 + rng() * 1.2 });
          } else if (this.palmTreeMesh) {
            trees.push({ x: worldX, z, yaw: 0, scale: 7.2 + rng() * 1.8 });
          } else {
            this.addBox(verts, indices, worldX, 3, z, 0.4, 6, 0.4, 0.3, 0.18, 0.05, 1.0, idxOffset); idxOffset += 24;
            this.addBox(verts, indices, worldX, 6.2, z, 3, 0.7, 3, 0.1, 0.45, 0.05, 1.0, idxOffset); idxOffset += 24;
          }
          if (Math.floor((z - worldOriginZ) / 16) % 2 === 0) {
            if (distanceToNearestGridNode(worldX + 18, z) < gap) continue;
            benches.push({ x: worldX + 18, z, yaw: Math.PI / 2 });
          }
        }
      }
      for (const gridZ of [cz, cz + 1]) {
        if (!isBoulevard(gridZ)) continue;
        const worldZ = gridZ * GRID_PITCH;
        const gap = INTERSECTION_CLEAR_RADIUS;
        const segLen = CHUNK_SIZE - (gap * 2);
        this.addBox(verts, indices, worldOriginX + CHUNK_SIZE / 2, 0.15, worldZ, segLen, 0.3, 6, 0.12, 0.30, 0.10, 1.0, idxOffset); idxOffset += 24;
        for (let x = worldOriginX + gap; x < worldOriginX + CHUNK_SIZE - gap; x += 16) {
          if (distanceToNearestGridNode(x, worldZ) < gap) continue;
          if (this.cityTreeMesh && Math.floor((x - worldOriginX) / 16) % 3 === 0) {
            trees.push({ x, z: worldZ, yaw: 0, scale: 4.5 + rng() * 1.2 });
          } else if (this.palmTreeMesh) {
            trees.push({ x, z: worldZ, yaw: 0, scale: 7.2 + rng() * 1.8 });
          } else {
            this.addBox(verts, indices, x, 3, worldZ, 0.4, 6, 0.4, 0.3, 0.18, 0.05, 1.0, idxOffset); idxOffset += 24;
            this.addBox(verts, indices, x, 6.2, worldZ, 3, 0.7, 3, 0.1, 0.45, 0.05, 1.0, idxOffset); idxOffset += 24;
          }
          if (Math.floor((x - worldOriginX) / 16) % 2 === 0) {
            if (distanceToNearestGridNode(x, worldZ + 18) < gap) continue;
            benches.push({ x, z: worldZ + 18, yaw: 0 });
          }
        }
      }
    }
    if (!isMountain && !isBeach && !isAeroport && !isBridge && !isBridgeConnector && !isParkingLot && !isRural) {
      const dashLen = 1.5, dashWid = 0.3, dashH = 0.02, dashSpacing = 4, dashOffset = 2;
      for (let ri = 0; ri < 2; ri++) {
        const roadZ = cz * CHUNK_SIZE + ri * GRID_PITCH;
        if (isBoulevard(cz * blocksPerChunk + ri)) continue;
        for (let x = cx * CHUNK_SIZE + dashOffset; x <= cx * CHUNK_SIZE + CHUNK_SIZE - dashOffset; x += dashSpacing) {
          this.addBox(verts, indices, x, 0.145, roadZ, dashLen, dashH, dashWid, 1, 1, 1, 0.8, idxOffset); idxOffset += 24;
        }
      }
      for (let ri = 0; ri < 2; ri++) {
        const roadX = cx * CHUNK_SIZE + ri * GRID_PITCH;
        if (isBoulevard(cx * blocksPerChunk + ri)) continue;
        for (let z = cz * CHUNK_SIZE + dashOffset; z <= cz * CHUNK_SIZE + CHUNK_SIZE - dashOffset; z += dashSpacing) {
          this.addBox(verts, indices, roadX, 0.145, z, dashWid, dashH, dashLen, 1, 1, 1, 0.8, idxOffset); idxOffset += 24;
        }
      }
    }
    if (isRuralMountain || isRuralHills) {
      const roadW = isRuralMountain ? 14 : 16;
      const roadHalf = roadW / 2;
      const roadStartX = worldOriginX;
      const roadEndX = worldOriginX + CHUNK_SIZE;
      const roadStartZ = worldOriginZ;
      const roadEndZ = worldOriginZ + CHUNK_SIZE;
      for (const ri of [0, 1]) {
        const roadZ = cz * CHUNK_SIZE + ri * GRID_PITCH;
        idxOffset = this.addMountainRoadSurface(
          verts, indices, roadStartX, roadZ, roadEndX, roadZ,
          roadW, idxOffset
        );
        for (const side of [-1, 1]) {
          const rz = roadZ + side * (roadHalf + 0.7);
          for (let px = roadStartX + 8; px < roadEndX; px += 16) {
            const py = getMountainRoadHeight(px, rz) + 0.055;
            this.addBox(verts, indices, px, py, rz, 0.18, 0.45, 0.18, 0.42, 0.43, 0.40, 1.0, idxOffset); idxOffset += 24;
          }
        }
      }
      for (const ri of [0, 1]) {
        const roadX = cx * CHUNK_SIZE + ri * GRID_PITCH;
        idxOffset = this.addMountainRoadSurface(
          verts, indices, roadX, roadStartZ, roadX, roadEndZ,
          roadW, idxOffset
        );
        for (const side of [-1, 1]) {
          const rx = roadX + side * (roadHalf + 0.7);
          for (let pz = roadStartZ + 8; pz < roadEndZ; pz += 16) {
            const py = getMountainRoadHeight(rx, pz) + 0.055;
            this.addBox(verts, indices, rx, py, pz, 0.18, 0.45, 0.18, 0.42, 0.43, 0.40, 1.0, idxOffset); idxOffset += 24;
          }
        }
      }
      // A second, deterministic pass follows the ridge with switchbacks. It
      // is intentionally segmented at chunk boundaries so the route remains
      // continuous and cheap to render on touch devices.
      if (cx >= 41) {
        const switchbackSegments = this.isMobile ? 5 : 8;
        const switchbackStep = CHUNK_SIZE / switchbackSegments;
        for (let segment = 0; segment < switchbackSegments; segment++) {
          const sx1 = roadStartX + segment * switchbackStep;
          const sx2 = roadStartX + (segment + 1) * switchbackStep;
          const sz1 = getMountainSwitchbackZ(sx1);
          const sz2 = getMountainSwitchbackZ(sx2);
          if (Math.max(sz1, sz2) < roadStartZ - 18 || Math.min(sz1, sz2) > roadEndZ + 18) continue;
          idxOffset = this.addMountainRoadSurface(verts, indices, sx1, sz1, sx2, sz2, roadW, idxOffset);
          for (const end of [0, 1]) {
            const tx = end === 0 ? sx1 : sx2;
            const tz = end === 0 ? sz1 : sz2;
            const py = getMountainRoadHeight(tx, tz) + 0.055;
            this.addBox(verts, indices, tx, py, tz + (end === 0 ? roadHalf + 0.8 : -roadHalf - 0.8), 0.18, 0.5, 0.18, 0.42, 0.43, 0.40, 1.0, idxOffset); idxOffset += 24;
          }
        }
      }
    }
    if (isParkingLot) {
    }
    const mesh = this.createMesh(verts, indices);
    const lamps: { x: number; z: number }[] = [];
    const hydrants: { x: number; z: number }[] = [];
    if (!isMountain && !isBeach && !isAeroport && !isBridge && !isBridgeConnector && !isRuralMountain) {
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
      if (isParkingLot) {
        for (let i = 0; i < 4; i++) {
          const fx = worldOriginX + 15 + (i % 2) * 50;
          const fz = worldOriginZ + 15 + Math.floor(i / 2) * 50;
          lamps.push({ x: fx, z: fz });
        }
      }
    }
    const isBridgeConnectorAdjacent = () => {
      for (const conn of BRIDGE_CONNECTORS) if (Math.abs(cx - conn.cx) <= 1 && cz === conn.cz) return true;
      return false;
    };
    if (!isMountain && !isAeroport && !isBridge && !isBridgeConnector && !isBridgeConnectorAdjacent()) {
      // Never place explosive barrels on the street itself — reject any spot
      // that falls inside a road strip (within ROAD_HALF_WIDTH of a grid line).
      const barrelCount = 1 + Math.floor(rng() * 2);
      let barrelPlaced = 0;
      let barrelGuard = 0;
      while (barrelPlaced < barrelCount && barrelGuard++ < 12) {
        const bx = worldOriginX + 6 + rng() * (CHUNK_SIZE - 12);
        const bz = worldOriginZ + 6 + rng() * (CHUNK_SIZE - 12);
        if (isOnRoadGrid(bx, bz)) continue;
        barrels.push({ x: bx, z: bz, yaw: rng() * Math.PI * 2 });
        barrelPlaced++;
      }
    }
    if (isSuburb && rng() < 0.3) {
      chickens.push({ x: worldOriginX + 5 + rng() * (CHUNK_SIZE - 10), z: worldOriginZ + 5 + rng() * (CHUNK_SIZE - 10), yaw: rng() * Math.PI * 2 });
    }
    if ((isCity || isSuburb) && this.cityBuildingMeshes.length > 0) {
      if (rng() < 0.16) {
        const store = this.getConvenienceStoreMesh();
        const sx = worldOriginX + 40, sz = worldOriginZ + 40;
        const storeScale: [number, number, number] = [1, 1, 1];
        buildings.push({ model: store, x: sx, y: 0.15, z: sz, yaw: 0, scale: storeScale });
        supermarkets.push({ x: sx, z: sz, yaw: 0, hd: 13.4, isConvenience: true });
      }
      const smModel = this.cityBuildingMeshes.find(m => m.length > 0 && m[0].carName && m[0].carName.includes('supermarket'));
      if (smModel && supermarkets.length < 1 && rng() < 0.20) {
        const blockWorldX = worldOriginX + 40;
        const blockWorldZ = worldOriginZ + 40;
        const halfSW = SIDEWALK_SIZE / 2;
        const setback = 8;
        const edges = [
          { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
          { dx: 1, dz: 0 }, { dx: -1, dz: 0 }
        ];
        const edge = edges[Math.floor(rng() * edges.length)];
        const w = 8 + rng() * 6;
        const d = 8 + rng() * (SIDEWALK_SIZE * 0.18);
        let px, pz, yaw;
        if (edge.dx === 0) {
          px = blockWorldX - halfSW + 4 + rng() * (SIDEWALK_SIZE - 8);
          pz = blockWorldZ + edge.dz * (halfSW - setback - d / 2);
          yaw = edge.dz > 0 ? Math.PI : 0;
        } else {
          pz = blockWorldZ - halfSW + 4 + rng() * (SIDEWALK_SIZE - 8);
          px = blockWorldX + edge.dx * (halfSW - setback - d / 2);
          yaw = edge.dx > 0 ? -Math.PI / 2 : Math.PI / 2;
        }
        const scale = Math.max(w, d) / 18 * 3.5;
        const cityMinY = this.getModelMinY(smModel);
        const scArr: [number, number, number] = [scale, scale, scale];
        buildings.push({ model: smModel, x: px, y: -cityMinY * scale + 0.15, z: pz, yaw, scale: scArr });
        supermarkets.push({ x: px, z: pz, yaw, hd: this.supermarketHalfDepth(smModel, scArr, yaw) });
      }
    }
    for (const entry of GrandTheftRenderer.AIRPORT_ENTRY_ROADS) {
      const minGz = Math.min(entry.gzStart, entry.gzEnd);
      const maxGz = Math.max(entry.gzStart, entry.gzEnd);
      if (cx !== entry.gx || cz < minGz || cz > maxGz) continue;
      const roadX = entry.gx * GRID_PITCH;
      const roadW = 20;
      const halfW = roadW / 2;
      this.addBox(verts, indices, roadX, 0.05, worldOriginZ + CHUNK_SIZE / 2, roadW, 0.1, CHUNK_SIZE, 0.15, 0.15, 0.16, 1.0, idxOffset); idxOffset += 24;
      this.addBox(verts, indices, roadX, 0.06, worldOriginZ + CHUNK_SIZE / 2, 0.3, 0.05, CHUNK_SIZE - 2, 1, 1, 1, 0.9, idxOffset); idxOffset += 24;
      for (const side of [-4.5, 4.5]) {
        for (let dz = -CHUNK_SIZE / 2 + 4; dz < CHUNK_SIZE / 2; dz += 10) {
          this.addBox(verts, indices, roadX + side, 0.06, worldOriginZ + CHUNK_SIZE / 2 + dz, 0.3, 0.05, 4, 1, 1, 1, 0.7, idxOffset); idxOffset += 24;
        }
      }
      this.addBox(verts, indices, roadX - halfW + 0.3, 0.3, worldOriginZ + CHUNK_SIZE / 2, 0.6, 0.6, CHUNK_SIZE, 0.4, 0.4, 0.42, 1.0, idxOffset); idxOffset += 24;
      this.addBox(verts, indices, roadX + halfW - 0.3, 0.3, worldOriginZ + CHUNK_SIZE / 2, 0.6, 0.6, CHUNK_SIZE, 0.4, 0.4, 0.42, 1.0, idxOffset); idxOffset += 24;
    }
    const chunk: CityChunk = { mesh, cx, cz, lamps, hydrants, buildings, benches, barrels, chickens, trees, supermarkets, tatami, cabins, lighthouses, tropicalShops, decorativeAircraft };
    this.chunkCache.set(key, chunk);
    return chunk;
  }
  static readonly AIRPORT_ENTRY_ROADS: { gx: number; gzStart: number; gzEnd: number }[] = [
    { gx: 2, gzStart: -1, gzEnd: -3 },   
    { gx: 12, gzStart: -4, gzEnd: -6 },  
    { gx: 26, gzStart: -7, gzEnd: -8 },  
    { gx: 41, gzStart: -7, gzEnd: -11 }, 
    { gx: 39, gzStart: 7, gzEnd: 16 },   
  ];
  isRoadNode(gx: number, gz: number): boolean {
    const cx = Math.floor(gx * GRID_PITCH / CHUNK_SIZE);
    const cz = Math.floor(gz * GRID_PITCH / CHUNK_SIZE);
    const b = getBiome(cx, cz);
    if (b === 'ocean' || b === 'beach' || b === 'mountain') {
      // A boundary node is still valid when the neighboring chunk exposes a
      // road. This gives the path graph the same seam-crossing connectors as
      // the rendered road mesh instead of terminating at the biome border.
      return getBiome(cx - 1, cz) !== 'ocean' && getBiome(cx + 1, cz) !== 'ocean'
        || getBiome(cx, cz - 1) !== 'ocean' && getBiome(cx, cz + 1) !== 'ocean';
    }
    if (b === 'aeroport') {
      return GrandTheftRenderer.AIRPORT_ENTRY_ROADS.some(e =>
        e.gx === gx && gz >= Math.min(e.gzStart, e.gzEnd) && gz <= Math.max(e.gzStart, e.gzEnd));
    }
    return true;
  }
  getRoadNodesInRadius(cx: number, cz: number, radius: number): { x: number; z: number }[] {
    const nodes: { x: number; z: number }[] = [];
    const seen = new Set<string>();
    const blocksPerChunk = CHUNK_SIZE / GRID_PITCH;
    const startGx = Math.floor((cx * CHUNK_SIZE) / GRID_PITCH) - radius;
    const startGz = Math.floor((cz * CHUNK_SIZE) / GRID_PITCH) - radius;
    const endGx = Math.ceil((cx * CHUNK_SIZE + CHUNK_SIZE) / GRID_PITCH) + radius;
    const endGz = Math.ceil((cz * CHUNK_SIZE + CHUNK_SIZE) / GRID_PITCH) + radius;
    for (let gx = startGx; gx <= endGx; gx++) {
      for (let gz = startGz; gz <= endGz; gz++) {
        if (!this.isRoadNode(gx, gz)) continue;
        const key = gx + ',' + gz;
        if (seen.has(key)) continue;
        seen.add(key);
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

  /**
   * Road lane markings: solid white edge lines plus a dashed yellow center
   * line — the same language as the bridge decks, so the whole road network
   * reads consistently. `runsAlongX` is true when the road follows the X
   * axis (grid line in z); `grid` is the line the road is centered on;
   * `start`/`end` bound the segment along the road within this chunk.
   * Returns the updated index offset.
   */
  private addRoadMarkings(
    verts: number[], indices: number[], idxOffset: number,
    runsAlongX: boolean, grid: number, y: number, start: number, end: number
  ): number {
    // Flat-road markings must sit just above the actual road slab. Keeping the
    // offset here prevents them from floating when callers use different slab
    // heights, while retaining enough separation to avoid z-fighting.
    y = y + 0.035;
    const edgeOff = ROAD_HALF_WIDTH - 1.5;
    const dashLen = 8;
    const dashGap = 16;
    if (runsAlongX) {
      const midX = (start + end) / 2;
      for (const side of [-1, 1]) {
        this.addBox(verts, indices, midX, y, grid + side * edgeOff, end - start, 0.02, 0.22, 0.85, 0.85, 0.85, 0.9, idxOffset); idxOffset += 24;
      }
      for (let dx = start + dashLen / 2; dx < end; dx += dashGap) {
        this.addBox(verts, indices, dx, y, grid, dashLen, 0.02, 0.3, 0.9, 0.75, 0.15, 1.0, idxOffset); idxOffset += 24;
      }
    } else {
      const midZ = (start + end) / 2;
      for (const side of [-1, 1]) {
        this.addBox(verts, indices, grid + side * edgeOff, y, midZ, 0.22, 0.02, end - start, 0.85, 0.85, 0.85, 0.9, idxOffset); idxOffset += 24;
      }
      for (let dz = start + dashLen / 2; dz < end; dz += dashGap) {
        this.addBox(verts, indices, grid, y, dz, 0.3, 0.02, dashLen, 0.9, 0.75, 0.15, 1.0, idxOffset); idxOffset += 24;
      }
    }
    return idxOffset;
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
  // ---- Lifelike human variant cache (cheap, vertex-color, 19-bone rig) ----
  private humanMeshCache = new Map<string, CityMesh>();
  private getHumanVariantMesh(role: Role, seed: number | string, genderHint?: string): CityMesh {
    const v = pickVariant(role, seed, genderHint);
    const key = `human_${v.role}_${v.bodyType}_${v.gender}_${v.skin.join(',')}_${v.hair.join(',')}_${v.outfitA.join(',')}_${v.outfitB.join(',')}_${v.shirtStyle ?? 0}_${v.pantsStyle ?? 0}_${v.hasBeard ? 1:0}_${v.hasCap?1:0}`;
    if (this.humanMeshCache.has(key)) return this.humanMeshCache.get(key)!;
    const mesh = this.createLifelikeHumanMesh(v);
    this.humanMeshCache.set(key, mesh);
    // also prime meshCache for legacy lookups
    this.meshCache.set(key, mesh as any);
    return mesh;
  }
  getPlayerMesh(color: [number, number, number], appearanceRole: Role = 'generic', appearanceSeed: number | string = 1, appearanceGender?: string): CityMesh {
    // The local player uses the same deterministic NPC generator. The seed and
    // role are supplied by the component and persisted/sent to the server.
    const key = `player_${appearanceRole}_${appearanceSeed}_${appearanceGender ?? ''}`;
    if (this.humanMeshCache.has(key)) return this.humanMeshCache.get(key)!;
    const variant = pickVariant(appearanceRole, appearanceSeed, appearanceGender);
    // Override Franklin colors to be stable regardless of input color (keeps multiplayer tint for nameplate only)
    variant.outfitA = [0.16, 0.52, 0.22]; variant.outfitB = [0.14,0.14,0.16]; variant.accent = [0.92,0.92,0.96];
    const mesh = this.createLifelikeHumanMesh(variant);
    this.humanMeshCache.set(key, mesh);
    return mesh;
  }
  getOtherPlayerMesh(color: [number, number, number]): CityMesh {
    // Remote player — same Franklin rig but tinted by passed color as accent so friends are recognizable
    const key = `other_${color.join(',')}`;
    if (this.humanMeshCache.has(key)) return this.humanMeshCache.get(key)!;
    const v = pickVariant('franklin', key, 'male');
    v.accent = [color[0], color[1], color[2]];
    const mesh = this.createLifelikeHumanMesh(v);
    this.humanMeshCache.set(key, mesh);
    return mesh;
  }
  getPedestrianMesh(gender: string, seed: number | string = 0): CityMesh | CityMesh[] {
    // Hookers use the same procedural, skinned human system as every other NPC.
    // The seed drives stable appearance variation, so they remain recognizable
    // without loading a separate GLTF asset.
    if (gender === 'hooker') {
      return this.getHumanVariantMesh('hooker', `hooker:${seed}`, 'female');
    }
    // Infer lifelike role from gender + seed distribution — ensures every street has
    // cops, taxi drivers, pizza boys, hillbillies, women, fat & dwarf variants visible
    const h = hashSeed(seed);
    const roll = h % 100;
    let role: Role = 'generic';
    const g = (gender||'').toLowerCase();
    if (g === 'female') role = 'female';
    else if (g === 'cop') role = 'cop';
    else if (roll < 10) role = 'cop';
    else if (roll < 15) role = 'taxi';
    else if (roll < 20) role = 'pizza';
    else if (roll < 30) role = 'hillbilly';
    else if (roll < 38) role = 'fat';
    else if (roll < 43) role = 'dwarf';
    else if (roll < 58) role = 'female';
    // fallback generic covers the rest
    return this.getHumanVariantMesh(role, seed, gender);
  }
  private createLifelikeHumanMesh(variant: HumanVariant): CityMesh {
    const skeleton = createHumanSkeleton();
    const verts: number[] = [];
    const indices: number[] = [];
    const jIndices: number[] = [];
    const jWeights: number[] = [];
    const restPos: number[] = [];
    const restNrm: number[] = [];
    const addBox = (cx:number, cy:number, cz:number, w:number, h:number, d:number, col:[number,number,number], bone:number) => {
      const hw=w/2, hh=h/2, hd=d/2;
      const faces = [
        { n:[0,1,0], pts:[[-hw, hh,-hd],[hw, hh,-hd],[hw, hh,hd],[-hw, hh,hd]] },
        { n:[0,-1,0], pts:[[-hw,-hh,-hd],[hw,-hh,-hd],[hw,-hh,hd],[-hw,-hh,hd]] },
        { n:[0,0,1], pts:[[-hw, hh,hd],[-hw,-hh,hd],[hw,-hh,hd],[hw, hh,hd]] },
        { n:[0,0,-1], pts:[[hw, hh,-hd],[hw,-hh,-hd],[-hw,-hh,-hd],[-hw, hh,-hd]] },
        { n:[-1,0,0], pts:[[-hw, hh,-hd],[-hw,-hh,-hd],[-hw,-hh,hd],[-hw, hh,hd]] },
        { n:[1,0,0], pts:[[hw, hh,hd],[hw,-hh,hd],[hw,-hh,-hd],[hw, hh,-hd]] },
      ];
      const base = verts.length/12;
      for (const f of faces) {
        const start = verts.length/12;
        for (let k=0;k<4;k++) {
          const p = f.pts[k] as number[];
          verts.push(cx+p[0], cy+p[1], cz+p[2], f.n[0], f.n[1], f.n[2], col[0], col[1], col[2], 1, 0, 0);
          restPos.push(cx+p[0], cy+p[1], cz+p[2]);
          restNrm.push(f.n[0], f.n[1], f.n[2]);
          jIndices.push(bone,0,0,0); jWeights.push(1,0,0,0);
        }
        indices.push(start, start+1, start+2, start, start+2, start+3);
      }
    };
    let torsoW=0.32, torsoH=0.38, torsoD=0.18, legLen=0.42, armLen=0.42, headR=0.13;
    if (variant.bodyType==='fat'){ torsoW*=1.55; torsoD*=1.3; legLen*=0.92; }
    if (variant.bodyType==='dwarf'){ torsoH*=0.85; legLen*=0.68; armLen*=0.72; headR*=1.08; }
    if (variant.gender==='female'){ torsoW*=0.88; torsoD*=0.92; }
    const addRounded = (cx:number, cy:number, cz:number, rx:number, ry:number, rz:number, col:[number,number,number], bone:number) => {
      // Higher tessellation keeps joints and silhouettes round at the close
      // third-person camera distance instead of reading as faceted boxes.
      // Dense enough to remove the toy-like bubble silhouette, while still
      // keeping the shared human mesh bounded for crowded scenes.
      // One shared anatomical surface resolution is used for players and NPCs.
      // Keep it high enough for close third-person silhouettes without the
      // extreme per-part tessellation that caused startup stalls.
      const rings = this.isMobile ? 12 : 20, slices = this.isMobile ? 18 : 30;
      const start = restPos.length / 3;
      for (let iy = 0; iy <= rings; iy++) {
        const phi = (iy / rings) * Math.PI;
        for (let ix = 0; ix <= slices; ix++) {
          const theta = (ix / slices) * Math.PI * 2;
          const nx = Math.sin(phi) * Math.cos(theta);
          const ny = Math.cos(phi);
          const nz = Math.sin(phi) * Math.sin(theta);
          const px = cx + nx * rx, py = cy + ny * ry, pz = cz + nz * rz;
          verts.push(px, py, pz, nx, ny, nz, col[0], col[1], col[2], 1, 0, 0);
          restPos.push(px, py, pz); restNrm.push(nx, ny, nz);
          jIndices.push(bone, 0, 0, 0); jWeights.push(1, 0, 0, 0);
        }
      }
      const width = slices + 1;
      for (let iy = 0; iy < rings; iy++) for (let ix = 0; ix < slices; ix++) {
        const a = start + iy * width + ix, b = a + 1, c = a + width, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    };
    // Rounded anatomical volumes replace the old box-only silhouette. Slightly
    // overlapping neighboring volumes keep the silhouette watertight while each
    // limb remains independently skinnable.
    // Shape the torso with an upper chest, waist, and pelvis instead of one
    // inflated blob; all volumes use the same shared skeleton.
    addRounded(0, 0.20, 0, torsoW * 0.58, torsoH * 0.56, torsoD * 0.58, variant.outfitA, 2);
    addRounded(0, 0.30, 0.005, torsoW * 0.47, torsoH * 0.22, torsoD * 0.52, variant.outfitA, 2);
    addRounded(0, 0.08, 0.008, torsoW * 0.40, torsoH * 0.18, torsoD * 0.43, variant.outfitA, 0);
    // Anatomical contour bands: these are deliberately separate, skinned
    // volumes rather than a single sphere, giving the torso a ribcage, waist,
    // and pelvis profile. Each call contributes real indexed vertices.
    addRounded(0, 0.31, 0.005, torsoW * 0.53, torsoH * 0.28, torsoD * 0.54, variant.outfitA, 2);
    addRounded(0, 0.08, 0.008, torsoW * 0.43, torsoH * 0.22, torsoD * 0.47, variant.outfitA, 0);
    // Shoulder and hip transition volumes bridge independently skinned limbs to
    // the torso, preventing visible gaps when the gait rotates the limbs.
    addRounded(-0.16, 0.22, 0, 0.14, 0.14, 0.13, variant.outfitA, 2);
    addRounded(0.16, 0.22, 0, 0.14, 0.14, 0.13, variant.outfitA, 2);
    addRounded(-0.09, -0.08, 0, 0.11, 0.11, 0.11, variant.outfitB, 2);
    addRounded(0.09, -0.08, 0, 0.11, 0.11, 0.11, variant.outfitB, 2);
    addBox(0,0.02,0, torsoW*1.02,0.05,torsoD*1.05, [0.15,0.12,0.10], 2);
    addRounded(0,0.42,0,0.055,0.055,0.055, variant.skin, 3);
    addRounded(0,0.55,0,headR*1.04,headR*1.08,headR*0.96, variant.skin, 4);
    // Cheekbones, temples, and jaw contour replace the perfectly spherical head
    // with a more human outline while remaining attached to the head bone.
    addRounded(-headR * 0.44, 0.54, 0.02, headR * 0.58, headR * 0.52, headR * 0.78, variant.skin, 4);
    addRounded(headR * 0.44, 0.54, 0.02, headR * 0.58, headR * 0.52, headR * 0.78, variant.skin, 4);
    addRounded(0, 0.46, 0.045, headR * 0.52, headR * 0.24, headR * 0.58, variant.skin, 4);
    // Ears, jaw/chin and a rounded hair cap give the player a readable face
    // silhouette rather than a floating sphere with a flat slab on top.
    addRounded(-headR*0.92,0.55,0,0.028,0.045,0.035,variant.skin,4);
    addRounded(headR*0.92,0.55,0,0.028,0.045,0.035,variant.skin,4);
    addRounded(0,0.47,0.045,headR*0.48,headR*0.22,headR*0.55,variant.skin,4);
    addRounded(0,0.65,-0.005,headR*0.98,headR*0.34,headR*0.90, variant.hair, 4);    if(variant.gender==='female') addBox(0,0.50,-0.14,0.10,0.18,0.08,variant.hair,4);
    // Small face details and varied hairline/neck accents make repeated NPCs
    // read as individuals without adding a texture or extra draw call.
    if ((variant.shirtStyle ?? 0) % 2 === 1) addBox(0,0.46,0.10,0.12,0.025,0.012,variant.outfitA,3);
    addBox(-0.04,0.56,0.11,0.04,0.02,0.01,[1,1,1],4); addBox(0.04,0.56,0.11,0.04,0.02,0.01,[1,1,1],4);
    addBox(-0.04,0.56,0.115,0.018,0.018,0.005,[0.05,0.05,0.05],4); addBox(0.04,0.56,0.115,0.018,0.018,0.005,[0.05,0.05,0.05],4);
    if (variant.hasBeard) addBox(0,0.48,0.10,0.12,0.08,0.06,variant.hair,4);
    if (variant.hasCap){
      const capCol: [number,number,number]= variant.role==='cop'?[0.08,0.12,0.42]: variant.role==='pizza'?[0.92,0.08,0.08]:[0.30,0.22,0.12];
      addBox(0,0.68,0,headR*1.5,0.06,headR*1.4,capCol,4); addBox(0,0.64,0.10,headR*1.3,0.02,0.10,capCol,4);
      if(variant.role==='cop') addBox(0,0.67,0.08,0.06,0.05,0.01,[0.88,0.70,0.12],4);
      if(variant.role==='pizza') addBox(0,0.67,0.08,0.10,0.06,0.01,[1,0.95,0.85],4);
    }
    const armW = variant.bodyType==='fat'?0.10:(variant.bodyType==='muscular'?0.085:0.075);
    const shoulder = (variant.shoulderWidth ?? 1) * (variant.bodyType === 'muscular' ? 1.08 : 1);
    const hipsWidth = variant.hipWidth ?? 1;
    const armX = 0.20 * shoulder;
    addRounded(-armX,0.18,0,armW*0.62,armLen*0.27,armW*0.62,variant.skin,6); addRounded(-armX,-0.04,0,armW*0.58,armLen*0.27,armW*0.58,variant.skin,7); addRounded(-armX,-0.24,0,0.045,0.055,0.045,variant.skin,8);
    addRounded(armX,0.18,0,armW*0.62,armLen*0.27,armW*0.62,variant.skin,10); addRounded(armX,-0.04,0,armW*0.58,armLen*0.27,armW*0.58,variant.skin,11); addRounded(armX,-0.24,0,0.045,0.055,0.045,variant.skin,12);
    // Collar and armpit blend volumes overlap the shoulder joints so the
    // animated arms never expose a gap while swinging or aiming.
    addRounded(-armX * 0.72, 0.25, 0, armW * 0.82, 0.12, armW * 0.82, variant.outfitA, 2);
    addRounded(armX * 0.72, 0.25, 0, armW * 0.82, 0.12, armW * 0.82, variant.outfitA, 2);
    addRounded(-armX,0.20,0,armW*0.76,0.09,armW*0.76,variant.outfitA,6); addRounded(armX,0.20,0,armW*0.76,0.09,armW*0.76,variant.outfitA,10);
    const legW = variant.bodyType==='fat'?0.15:(variant.bodyType==='muscular'?0.12:0.11); const thighH=legLen*0.48, shinH=legLen*0.48; const hipOff=0.09 * hipsWidth;
    const pantTone: [number, number, number] = (variant.pantsStyle ?? 0) % 2 === 0
      ? variant.outfitB
      : [Math.min(1, variant.outfitB[0] * 1.18), Math.min(1, variant.outfitB[1] * 1.12), Math.min(1, variant.outfitB[2] * 1.08)];
    // Pelvis/upper-thigh transition volumes overlap the torso and thighs,
    // eliminating the floating-leg appearance during gait and ragdoll poses.
    addRounded(-hipOff, -0.08, 0, legW * 0.72, 0.11, legW * 0.72, pantTone, 2);
    addRounded(hipOff, -0.08, 0, legW * 0.72, 0.11, legW * 0.72, pantTone, 2);
    addRounded(-hipOff,-0.12,0,legW*0.52,thighH*0.52,legW*0.52,pantTone,13); addRounded(-hipOff,-0.12-thighH,0,legW*0.48,shinH*0.52,legW*0.48,pantTone,14); addRounded(-hipOff,-0.12-thighH-shinH+0.04,0.04,0.07,0.035,0.10,[0.12,0.08,0.06],15);
    // Knee and calf shaping keeps the legs cylindrical but not balloon-like.
    addRounded(-hipOff, -0.12 - thighH * 0.92, 0.005, legW * 0.54, legW * 0.34, legW * 0.54, pantTone, 14);
    addRounded(-hipOff, -0.12 - thighH - shinH * 0.58, 0.006, legW * 0.50, shinH * 0.34, legW * 0.50, pantTone, 14);
    addRounded(hipOff,-0.12,0,legW*0.52,thighH*0.52,legW*0.52,pantTone,16); addRounded(hipOff,-0.12-thighH,0,legW*0.48,shinH*0.52,legW*0.48,pantTone,17); addRounded(hipOff,-0.12-thighH-shinH+0.04,0.04,0.07,0.035,0.10,[0.12,0.08,0.06],18);
    addRounded(hipOff, -0.12 - thighH * 0.92, 0.005, legW * 0.54, legW * 0.34, legW * 0.54, pantTone, 17);
    addRounded(hipOff, -0.12 - thighH - shinH * 0.58, 0.006, legW * 0.50, shinH * 0.34, legW * 0.50, pantTone, 17);
    if (variant.role==='cop' && variant.accent) addBox(0.08,0.22,0.10,0.06,0.06,0.01,variant.accent,2);
    if (variant.role==='hooker' && variant.accent) {
      addBox(0,0.28,0.105,0.18,0.035,0.012,variant.accent,2);
      addBox(0.16,0.10,0.04,0.035,0.10,0.035,variant.accent,10);
    }
    if (variant.role==='pizza') addBox(0,0.18,-0.12,0.22,0.28,0.08,[0.95,0.85,0.65],2);
    return this.finalizeSkinnedMesh(verts, indices, jIndices, jWeights, restPos, restNrm, skeleton);
  }

  /**
   * Build or return the procedural first-person arms. The old first_person_arms
   * GLTF is gone; these are a small skinned rig (shoulder/upper/forearm/hand on
   * each side) so the fists can actually punch in first person.
   */
  ensureFirstPersonArms(): void {
    if (this.firstPersonArmsMesh && this.firstPersonArmsSkeleton) return;
    const skeleton = createHumanSkeleton();
    const verts: number[] = [];
    const indices: number[] = [];
    const jIndices: number[] = [];
    const jWeights: number[] = [];
    const restPos: number[] = [];
    const restNrm: number[] = [];
    // Arm bones in the human skeleton: 5 l_shoulder,6 l_arm,7 l_forearm,8 l_hand
    //                            9 r_shoulder,10 r_arm,11 r_forearm,12 r_hand
    const skin: [number, number, number] = [0.82, 0.60, 0.42];
    const sleeve: [number, number, number] = [0.16, 0.52, 0.22]; // franklin green polo
    const addBox = (cx:number, cy:number, cz:number, w:number, h:number, d:number, col:[number,number,number], bone:number) => {
      const hw=w/2, hh=h/2, hd=d/2;
      const faces = [
        { n:[0,1,0], pts:[[-hw, hh,-hd],[hw, hh,-hd],[hw, hh,hd],[-hw, hh,hd]] },
        { n:[0,-1,0], pts:[[-hw,-hh,-hd],[hw,-hh,-hd],[hw,-hh,hd],[-hw,-hh,hd]] },
        { n:[0,0,1], pts:[[-hw, hh,hd],[-hw,-hh,hd],[hw,-hh,hd],[hw, hh,hd]] },
        { n:[0,0,-1], pts:[[hw, hh,-hd],[hw,-hh,-hd],[-hw,-hh,-hd],[-hw, hh,-hd]] },
        { n:[-1,0,0], pts:[[-hw, hh,-hd],[-hw,-hh,-hd],[-hw,-hh,hd],[-hw, hh,hd]] },
        { n:[1,0,0], pts:[[hw, hh,hd],[hw,-hh,hd],[hw,-hh,-hd],[hw, hh,-hd]] },
      ];
      const start = verts.length/12;
      for (const f of faces) {
        const base = verts.length/12;
        for (let k=0;k<4;k++) {
          const p = f.pts[k] as number[];
          verts.push(cx+p[0], cy+p[1], cz+p[2], f.n[0], f.n[1], f.n[2], col[0], col[1], col[2], 1, 0, 0);
          restPos.push(cx+p[0], cy+p[1], cz+p[2]);
          restNrm.push(f.n[0], f.n[1], f.n[2]);
          jIndices.push(bone,0,0,0); jWeights.push(1,0,0,0);
        }
        indices.push(base, base+1, base+2, base, base+2, base+3);
      }
    };
    // Arms hang forward/down toward the fists. y is the vertical, z reaches
    // forward toward the camera. Two arms, each: shoulder cap + sleeve,
    // upper arm, forearm, hand.
    for (const side of [-1, 1]) {
      const sh = side === -1 ? 5 : 9;
      const ar = side === -1 ? 6 : 10;
      const fo = side === -1 ? 7 : 11;
      const ha = side === -1 ? 8 : 12;
      const x = side * 0.24;
      const shoulderY = 0.42, armLen = 0.42;
      // Shoulder cap + short sleeve (outfit color)
      addBox(x, shoulderY - 0.02, 0.02, 0.20, 0.12, 0.20, sleeve, sh);
      // Upper arm
      addBox(x, shoulderY - 0.16, 0.05, 0.11, armLen*0.5, 0.12, sleeve, ar);
      // Forearm (skin)
      addBox(x, shoulderY - 0.38, 0.07, 0.09, armLen*0.5, 0.095, skin, fo);
      // Fist/hand
      addBox(x, shoulderY - 0.57, 0.10, 0.085, 0.10, 0.10, skin, ha);
    }
    this.firstPersonArmsMesh = [this.finalizeSkinnedMesh(verts, indices, jIndices, jWeights, restPos, restNrm, skeleton)];
    this.firstPersonArmsSkeleton = skeleton;
  }

  /**
   * Pose + CPU-skin the first-person arms for this frame. When the player
   * punches (punchTime > 0) the right arm jabs forward like the third-person
   * attack; otherwise arms hang in a relaxed rest pose.
   */
  private skinFirstPersonArms(dt: number): void {
    const skel = this.firstPersonArmsSkeleton;
    const mesh = this.firstPersonArmsMesh;
    if (!skel || !mesh) return;
    const localMatrices = new Float32Array(skel.boneLocalMatrices);
    const punch = this.punchTime;
    if (punch > 0) {
      // Mirror the third-person jab: right shoulder + forearm extend forward
      // and recover over ~0.38s. bone 10 = r_arm, 11 = r_forearm, 8 = l_hand pull-back.
      const t = Math.max(0, Math.min(1, punch / 0.38));
      const attack = t < 0.5 ? t * 2 : 2 - t * 2;
      const temp = new Float32Array(16), rot = new Float32Array(16);
      const applyRotX = (bone: number, angle: number) => {
        if (bone < 0 || bone >= skel.boneCount) return;
        const m = new Float32Array(localMatrices.buffer, bone * 16 * 4, 16);
        mat4.identity(rot); mat4.rotateX(rot, rot, angle);
        mat4.multiply(temp, m, rot);
        for (let i = 0; i < 16; i++) m[i] = temp[i];
      };
      applyRotX(10, -0.95 * attack);
      applyRotX(11, -0.75 * attack);
      applyRotX(6, 0.20 * attack); // left arm counter-swing
    }
    const jointMatrices = new Float32Array(skel.boneCount * 16);
    this.computeJointMatrices(skel, localMatrices, jointMatrices);
    this.skinMeshGeneric(mesh, skel, jointMatrices);
  }
  private finalizeSkinnedMesh(verts:number[], indices:number[], jIndices:number[], jWeights:number[], restPos:number[], restNrm:number[], skeleton:any): CityMesh {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    const vbo = gl.createBuffer()!;
    const ibo = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    const interleaved = new Float32Array(verts);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    // Do not spread a large externally-generated index buffer into Math.max:
    // that creates one argument per triangle and overflows the JS call stack.
    let maxIdx = 0;
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] > maxIdx) maxIdx = indices[i];
    }
    const use32 = maxIdx > 0xffff;
    if(use32) gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
    else gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    const stride = 12*4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,stride,0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,stride,12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,4,gl.FLOAT,false,stride,24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3,2,gl.FLOAT,false,stride,40);
    gl.bindVertexArray(null);
    const vCount = restPos.length/3;
    let minY=Infinity, maxY=-Infinity, minX=Infinity, maxX=-Infinity, minZ=Infinity, maxZ=-Infinity;
    for(let i=0;i<vCount;i++){ const x=restPos[i*3], y=restPos[i*3+1], z=restPos[i*3+2]; if(y<minY)minY=y; if(y>maxY)maxY=y; if(x<minX)minX=x; if(x>maxX)maxX=x; if(z<minZ)minZ=z; if(z>maxZ)maxZ=z; }
    const mesh: CityMesh = { vao, vbo, ibo, indexCount: indices.length, indexType: use32? gl.UNSIGNED_INT: gl.UNSIGNED_SHORT, vertexCount: vCount, restPositions: new Float32Array(restPos), restNormals: new Float32Array(restNrm), jointIndices: new Uint16Array(jIndices), jointWeights: new Float32Array(jWeights), skeleton, animations: null, originalVBO: new Float32Array(interleaved), minY, maxY, minX, maxX, minZ, maxZ } as any;
    (mesh as any).isHuman = true;
    return mesh;
  }
  getBoatMesh(seed: number | string = 0): CityMesh | CityMesh[] {
    if (this.boatMeshes.length > 0) {
      if (this.boatMeshes.length === 1) return this.boatMeshes[0];
      return this.boatMeshes[hashSeed(seed) % this.boatMeshes.length];
    }
    return this.getNPCCarMesh([0.5, 0.5, 0.5], seed);
  }
  getHelicopterMesh(seed: number | string = 0, police = false): CityMesh | CityMesh[] {
    const meshes = this.getProceduralHelicopterMeshes();
    return police ? meshes.police : meshes.regular;
  }
  private getProceduralHelicopterMeshes(): { regular: CityMesh[]; police: CityMesh[] } {
    if (this.proceduralHelicopterMeshes) return this.proceduralHelicopterMeshes;
    const make = (police: boolean): CityMesh[] => {
      const verts: number[] = [], indices: number[] = [];
      const box = (x:number,y:number,z:number,w:number,h:number,d:number,c:[number,number,number]) => this.addBox(verts,indices,x,y,z,w,h,d,c[0],c[1],c[2],1,0);
      const body: [number,number,number] = police ? [0.06,0.10,0.20] : [0.16,0.36,0.58];
      const trim: [number,number,number] = police ? [0.88,0.90,0.94] : [0.72,0.88,0.98];
      const glass: [number,number,number] = police ? [0.08,0.16,0.24] : [0.04,0.18,0.28];
      // The previous airframe was extremely flat and mostly hidden by the
      // oversized rotor. Build a complete fuselage with a tapered nose,
      // cabin glazing, tail boom, vertical fin, and landing skids.
      box(0,1.08,0,1.42,0.88,1.92,body);
      box(0,1.20,-1.03,1.24,0.78,1.02,body);
      box(0,1.48,-1.12,1.06,0.42,0.66,glass);
      box(-0.52,1.35,-0.82,0.08,0.36,0.72,glass); box(0.52,1.35,-0.82,0.08,0.36,0.72,glass);
      box(0,1.16,1.15,0.42,0.42,2.5,body);
      box(0,1.48,2.55,0.76,0.18,0.44,trim);
      box(0,1.56,2.82,0.18,0.98,0.20,body);
      box(-0.18,1.92,2.78,0.12,0.32,0.16,trim); box(0.18,1.92,2.78,0.12,0.32,0.16,trim);
      box(-0.52,1.22,0,0.12,0.12,2.7,trim); box(0.52,1.22,0,0.12,0.12,2.7,trim);
      box(-0.62,0.55,0,0.12,0.12,2.25,trim); box(0.62,0.55,0,0.12,0.12,2.25,trim);
      box(-0.62,0.48,-0.75,0.1,0.1,0.18,trim); box(0.62,0.48,-0.75,0.1,0.1,0.18,trim);
      box(0,2.02,0,0.2,0.12,0.2,[0.08,0.08,0.08]);
      box(0,1.75,0.15,0.62,0.12,0.10,trim);
      box(-0.72,0.68,-0.55,0.08,0.08,0.55,body); box(0.72,0.68,-0.55,0.08,0.08,0.55,body);
      if (police) { box(0,1.68,0.2,0.85,0.12,0.18,[0.95,0.1,0.08]); box(0,1.68,-0.2,0.85,0.12,0.18,[0.08,0.2,0.95]); }
      return [this.createMesh(verts,indices)];
    };
    this.proceduralHelicopterMeshes = { regular: make(false), police: make(true) };
    return this.proceduralHelicopterMeshes;
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
    const meshes = Array.isArray(mesh) ? mesh : [mesh];  
    mat4.identity(this.modelMatrix);
    this._scratchTranslate[0] = x; this._scratchTranslate[1] = y; this._scratchTranslate[2] = z;
    mat4.translate(this.modelMatrix, this.modelMatrix, this._scratchTranslate);
    if (roll) mat4.rotateZ(this.modelMatrix, this.modelMatrix, roll);
    if (pitch) mat4.rotateX(this.modelMatrix, this.modelMatrix, pitch);
    mat4.rotateY(this.modelMatrix, this.modelMatrix, yaw);
    let yo = 0;
    let needsFlip = false;
    let isMotorcycle = false;
    let maxRenderScale = 1;
    for (let i = 0; i < meshes.length; i++) {
      const m = meshes[i];
      if (!yo && m.yawOffset) yo = m.yawOffset;
      if (!needsFlip && m.needsFlip) needsFlip = true;
      if (!isMotorcycle && m.texture) {
        isMotorcycle = (m as any)._isMotorcycle || false;
      }
      const rs = m.renderScale ?? 1;
      if (rs > maxRenderScale) maxRenderScale = rs;
    }
    if (yo) mat4.rotateY(this.modelMatrix, this.modelMatrix, yo);
    if (needsFlip) {
      mat4.rotateX(this.modelMatrix, this.modelMatrix, Math.PI);
      mat4.rotateY(this.modelMatrix, this.modelMatrix, Math.PI);
      mat4.translate(this.modelMatrix, this.modelMatrix, [0, -2, 0]); 
    }
    if (isMotorcycle) mat4.rotateY(this.modelMatrix, this.modelMatrix, Math.PI);
    if (maxRenderScale !== 1) {
      this._scratchScale[0] = scale[0] * maxRenderScale;
      this._scratchScale[1] = scale[1] * maxRenderScale;
      this._scratchScale[2] = scale[2] * maxRenderScale;
      mat4.scale(this.modelMatrix, this.modelMatrix, this._scratchScale);
    } else {
      mat4.scale(this.modelMatrix, this.modelMatrix, scale);
    }
    if (isShadowPass) {
      // Shadow draws use a different shader contract. Bind it here rather than
      // relying on the caller's previous program state; otherwise the depth
      // uniform locations belong to the wrong program and WebGL rejects them.
      this.gl.useProgram(this.depthProgram);
      this.gl.uniformMatrix4fv(this.depthModelLoc, false, this.modelMatrix);
    } else {
      this.gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
      this.gl.uniform4f(this.colorLoc, color[0], color[1], color[2], color[3]);
      if (this.normalMatrixLoc) { 
        this.computeNormalMatrix(this._scratchNormalMat, this.modelMatrix);
        this.gl.uniformMatrix3fv(this.normalMatrixLoc, false, this._scratchNormalMat);
      }
    }
    for (let i = 0; i < meshes.length; i++) {
      const m = meshes[i];
      if (!isShadowPass) {
        if (m.texture) {
          this.gl.uniform1i(this.useTextureLoc, 1);
          this.gl.activeTexture(this.gl.TEXTURE0);
          this.gl.bindTexture(this.gl.TEXTURE_2D, m.texture);
          this.gl.uniform1i(this.textureLoc, 0);
        } else {
          this.gl.uniform1i(this.useTextureLoc, 0);
        }
      }
      this.gl.bindVertexArray(m.vao);
      this.gl.drawElements(this.gl.TRIANGLES, m.indexCount, m.indexType || this.gl.UNSIGNED_SHORT, 0);
    }
  }
  // A chunky pizza-moped wheel: a flat disc (rim ring + spokes + hub) in the YZ plane so it
  // spins around the X axle via the pitch argument, and turns with the front yaw offset.
  getMopedWheelMesh(): CityMesh {
    if (this._mopedWheelMesh) return this._mopedWheelMesh;
    const verts: number[] = [];
    const indices: number[] = [];
    const R = 0.44;
    const T = 0.1;
    const N = 14;
    const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number, r: number, g: number, b: number) => {
      verts.push(x, y, z, nx, ny, nz, r, g, b, 1);
    };
    // rim ring (tire side walls, closed cylinder so it reads from both sides)
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      push(-T / 2, Math.cos(a) * R, Math.sin(a) * R, Math.cos(a), 0, Math.sin(a), 0.05, 0.05, 0.06);
      push(T / 2, Math.cos(a) * R, Math.sin(a) * R, Math.cos(a), 0, Math.sin(a), 0.05, 0.05, 0.06);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b, b, c, d);
    }
    // Spokes radiating from the hub so rotation is clearly visible, both faces.
    const addFace = (sign: number) => {
      const x = sign * T / 2;
      const spokeCount = 5;
      for (let s = 0; s < spokeCount; s++) {
        const a0 = (s / spokeCount) * Math.PI * 2;
        const a1 = a0 + 0.14;
        const inner = 0.1;
        const outer = R - 0.02;
        const v = verts.length / 10;
        push(x, Math.cos(a0) * inner, Math.sin(a0) * inner, sign, 0, 0, 0.5, 0.45, 0.4);
        push(x, Math.cos(a1) * inner, Math.sin(a1) * inner, sign, 0, 0, 0.5, 0.45, 0.4);
        push(x, Math.cos(a1) * outer, Math.sin(a1) * outer, sign, 0, 0, 0.5, 0.45, 0.4);
        push(x, Math.cos(a0) * outer, Math.sin(a0) * outer, sign, 0, 0, 0.5, 0.45, 0.4);
        if (sign > 0) indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
        else indices.push(v, v + 3, v + 2, v, v + 2, v + 1);
      }
      // Solid hub cap covering the spoke centre.
      const base = verts.length / 10;
      push(x, 0, 0, sign, 0, 0, 0.3, 0.28, 0.25);
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        push(x, Math.cos(a) * 0.14, Math.sin(a) * 0.14, sign, 0, 0, 0.3, 0.28, 0.25);
      }
      for (let i = 0; i < N; i++) {
        if (sign > 0) indices.push(base, base + 1 + i, base + 2 + i);
        else indices.push(base, base + 2 + i, base + 1 + i);
      }
    };
    addFace(1);
    addFace(-1);
    const mesh = this.createMesh(verts, indices);
    this._mopedWheelMesh = mesh;
    return mesh;
  }
  render(
    camX: number, camY: number, camZ: number, camYaw: number, camPitch: number, aspect: number,
    targetX: number, targetY: number, targetZ: number, carYaw: number,

    serverNPCs: any[], otherPlayers: any[], serverPedestrians: any[], parkedCars: any[],
    dt: number = 0,
    tracers: any[], muzzleFlashes: any[], rockets: any[], explosions: any[], bloodSplats: any[],
    bloodPools: any[],
    bulletSmoke: any[],
    carSmoke: any[],
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
    // Record the player's aim direction so the drawn weapon can rotate to the
    // crosshair. Bullets/tracers already travel along camYaw; the visible gun
    // must match so it looks like it's actually firing where you point.
    this.playerAimYaw = camYaw;
    const PICKUP_SCALE = 0.2;
    const PICKUP_SPIN_SPEED = 1.5;
    const pickupYaw = (now / 1000) * PICKUP_SPIN_SPEED;
    const pcx = Math.floor(camX / CHUNK_SIZE);
    const pcz = Math.floor(camZ / CHUNK_SIZE);
    const nearbyLamps: { x: number; y: number; z: number }[] = [];
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
          const chunkCenterX = (pcx + dx) * CHUNK_SIZE + CHUNK_SIZE / 2;
          const chunkCenterZ = (pcz + dz) * CHUNK_SIZE + CHUNK_SIZE / 2;
          const ddx = chunkCenterX - camX, ddz = chunkCenterZ - camZ;
          const distSq = ddx * ddx + ddz * ddz;
          if (distSq > 200 * 200) continue;  
          const fwdX = Math.sin(camYaw), fwdZ = Math.cos(camYaw);
          if (ddx * fwdX + ddz * fwdZ < -CHUNK_SIZE) continue; 
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
        // Always draw the local character in third-person. `playerIsInCar`
        // only controls whether the vehicle is rendered; hiding the player
        // here made the on-foot model disappear after leaving a car.
        this.drawMesh(playerMesh, targetX, targetY, targetZ, carYaw, [1, 1, 1], [1, 1, 1, 1], true, 0, carRoll);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
      gl.viewport(0, 0, this.shadowMapSize, this.shadowMapSize);
      gl.clear(gl.DEPTH_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    // Keep a visible dusk-blue fallback while the procedural sky and optional
    // skybox texture are loading (or if the skybox asset fails).
    gl.clearColor(0.10, 0.20, 0.38, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const far = farPlane ?? 500.0;
    mat4.perspective(this.projMatrix, Math.PI / 4, aspect, 0.1, far);
    const dirX = Math.sin(camYaw) * Math.cos(camPitch);
    const dirY = -Math.sin(camPitch);
    const dirZ = Math.cos(camYaw) * Math.cos(camPitch);
    mat4.lookAt(this.viewMatrix, [camX, camY, camZ], [camX + dirX, camY + dirY, camZ + dirZ], [0, 1, 0]);
    this.skyViewMatrix.set(this.viewMatrix);
    // Sky geometry is centered on the camera and must not inherit world
    // translation. Keeping only camera rotation prevents it disappearing after
    // the player travels away from the origin.
    this.skyViewMatrix[12] = 0;
    this.skyViewMatrix[13] = 0;
    this.skyViewMatrix[14] = 0;
    // Draw the procedural sky before the world. The old sky pass was never
    // called from the main render path, leaving the clear color (black) as the
    // entire background whenever the optional GLTF sky asset was unavailable.
    // This pass gives the scene a reliable blue daylight/dusk backdrop and
    // keeps the horizon visible while assets stream in.
    this.renderSkybox();
    gl.enable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.projLoc, false, this.projMatrix);
    gl.uniformMatrix4fv(this.viewLoc, false, this.viewMatrix);
    // Use a normalized, slightly camera-independent daylight direction. Keeping
    // it above the horizon avoids the all-black fallback seen after disabling
    // the old dynamic-light path.
    const sunLen = Math.hypot(this.sunDir[0], this.sunDir[1], this.sunDir[2]) || 1;
    gl.uniform3f(this.lightDirLoc, this.sunDir[0] / sunLen, Math.max(0.35, this.sunDir[1] / sunLen), this.sunDir[2] / sunLen);
    gl.uniform3f(this.lightColorLoc, 0.95, 0.92, 0.86);
    // Lift the fill without flattening the scene: shaded faces retain gentle
    // contrast, but no material can collapse into near-black after shadows.
    gl.uniform3f(this.ambientColorLoc, 0.62, 0.66, 0.74);
    gl.uniform3f(this.fogColorLoc, this.skyColor[0], this.skyColor[1], this.skyColor[2]);
    // Fog tied to the view distance: starts at ~16% and is fully opaque at
    // ~66% of the far plane (the old hardcoded 80->330 range at the 500 default).
    gl.uniform1f(this.fogStartLoc, far * 0.16);
    gl.uniform1f(this.fogEndLoc, far * 0.66);
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
    // Draw chunks out to the configured view distance (capped so the far
    // settings can't nuke the frame rate). The shadow pass stays 3x3.
    //
    // Distance-based LOD: the near 3×3 ring keeps full detail (small props,
    // trees, chickens — everything), the next ring keeps the skyline and
    // mid-size structures but drops the tiny clutter, and the outer rings
    // keep only the chunk ground/roads/water mesh plus large buildings, so
    // the extra chunks at high view distance stay cheap on weaker machines.
    const chunkRadius = Math.max(1, Math.min(4, Math.round(far / 250)));
    for (let dz = -chunkRadius; dz <= chunkRadius; dz++) {
      for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
        const chunk = this.getCityChunk(pcx + dx, pcz + dz);
        const ring = Math.max(Math.abs(dx), Math.abs(dz));
        this.drawMesh(chunk.mesh, 0, 0, 0, 0, [1, 1, 1], [1, 1, 1, 1]);
        if (this.lampMesh && ring <= 1) {
          const lampModels = Array.isArray(this.lampMesh) ? this.lampMesh : [this.lampMesh];
          for (const lamp of chunk.lamps) {
            const mi = Math.abs(Math.floor(lamp.x * 7 + lamp.z * 13)) % lampModels.length;
            this.drawMesh(lampModels[mi], lamp.x, 0, lamp.z, 0, [1, 1, 1], [0.25, 0.3, 0.22, 1]);
          }
        }
        if (this.hydrantMesh && ring <= 1) {
          for (const hydrant of chunk.hydrants) {
            this.drawMesh(this.hydrantMesh, hydrant.x, 0, hydrant.z, 0, [1, 1, 1], [1, 0, 0, 1]);
          }
        }
        if ((this.palmTreeMesh || this.cityTreeMesh) && ring <= 1) {
          for (const tree of chunk.trees) {
            if (isNearBridgeRoad(tree.x, tree.z, tree.scale * 2)) continue;
            const treeBiome = getBiome(Math.floor(tree.x / CHUNK_SIZE), Math.floor(tree.z / CHUNK_SIZE));
            const isMountainTree = treeBiome === 'rural_hills' || treeBiome === 'rural_mountain';
            // Use the regular 3D tree model everywhere. The old mountain "conifer"
            // (psx_tree_low_poly_no_black_background) read as a flat picture cutout,
            // so it is retired in favour of the palmTreeMesh used on every other tile.
            const treeModels = this.palmTreeMesh;
            if (!treeModels || treeModels.length === 0) continue;
            const treeY = isMountainTree ? getTerrainHeight(tree.x, tree.z) : 0;
            const model = treeModels[Math.abs(Math.floor(tree.x * 7 + tree.z * 13)) % treeModels.length];
            this.drawMesh(model, tree.x, treeY, tree.z, tree.yaw, [tree.scale, tree.scale, tree.scale], [1, 1, 1, 1]);
          }
        }
        if (this.benchMeshes.length > 0 && ring <= 1) {
          for (const bench of chunk.benches) {
            const bm = this.benchMeshes[Math.abs((bench.x * 100 + bench.z) | 0) % this.benchMeshes.length];
            this.drawMesh(bm, bench.x, 0, bench.z, bench.yaw, [0.8, 0.8, 0.8], [1, 1, 1, 1]);
          }
        }
        if (this.tatamiRoomMesh && ring <= 1) {
          for (const t of chunk.tatami) {
            this.drawMesh(this.tatamiRoomMesh, t.x, 0, t.z, t.yaw, [1, 1, 1], [0.9, 0.8, 0.6, 1]);
          }
        }
        if (this.woodenCabineMesh && ring <= 1) {
          for (const c of chunk.cabins) {
            this.drawMesh(this.woodenCabineMesh, c.x, 0, c.z, c.yaw, [2.5, 2.5, 2.5]);
          }
        }
        if (this.cylindricalTowerMesh && ring <= 2) {
          for (const l of chunk.lighthouses) {
            this.drawMesh(this.cylindricalTowerMesh, l.x, 0, l.z, l.yaw, [1, 1, 1]);
          }
        }
        if (this.tropicalShopMesh && ring <= 2) {
          for (const s of chunk.tropicalShops) {
            this.drawMesh(this.tropicalShopMesh, s.x, 0, s.z, s.yaw, [1, 1, 1]);
          }
        }
        if (this.barrelMesh && ring <= 1) {
          for (const barrel of chunk.barrels) {
            const key = `${barrel.x},${barrel.z}`;
            if (this.explodedBarrels.has(key)) continue;
            this.drawMesh(this.barrelMesh, barrel.x, 0, barrel.z, barrel.yaw, [0.5, 0.5, 0.5], [1, 1, 1, 1]);
          }
        }
        if (this.chickenMesh && ring <= 1) {
          for (const chicken of chunk.chickens) {
            const key = `${chicken.x},${chicken.z}`;
            if (this.deadChickens.has(key)) continue;
            this.drawMesh(this.chickenMesh, chicken.x, 0, chicken.z, chicken.yaw, [0.3, 0.3, 0.3], [1, 1, 1, 1]);
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
          const isDome = bld.model && bld.model.length > 0 && bld.model[0].carName?.includes('domeStructure');
          // Outer rings: skip small-footprint buildings — they're sub-pixel
          // at this range and only bloat the draw call count. The large
          // buildings (skyscrapers, hotels, supermarkets...) keep the skyline.
          if (ring >= 3 && bld.model && bld.model.length > 0) {
            const m0 = bld.model[0];
            if (m0 && m0.minX !== undefined && m0.maxX !== undefined) {
              const width = (m0.maxX - m0.minX) * (bld.scale[0] ?? 1) * (m0.renderScale ?? 1);
              if (width < 8) continue;
            }
          }
          const isStore = bld.model && bld.model.length > 0 && bld.model[0].carName?.includes('convenience_store_procedural');
          const doorOpen = isStore && this.convenienceStoreDoorOpen;
          this.drawMesh(bld.model, bld.x, bld.y, bld.z, bld.yaw, bld.scale, isDome ? [0.25, 0.3, 0.22, 1] : [1, 1, 1, 1]);
          if (doorOpen) {
            this.drawMesh(this.getBoxMesh(5.2, 0.08, 0.12), bld.x, bld.y + 0.08, bld.z - 11.35, 0, [1, 1, 1], [0.16, 0.8, 0.35, 0.8]);
          }
        }
      }
    }
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
      // Traffic-light cull tracks the view distance (capped at the world-NPC
      // cull) so distant intersections keep their lights on visible roads.
      const lightCull = Math.min(far, 650);
      const lightCullSq = lightCull * lightCull;
      if (this.trafficLightMesh) {
        for (const node of trafficNodes) {
          const ndx = node.x - camX, ndz = node.z - camZ;
          if (ndx * ndx + ndz * ndz > lightCullSq) continue;
          for (let ci = 0; ci < corners.length; ci++) {
            this.drawMesh(this.trafficLightMesh, node.x + corners[ci][0], 0, node.z + corners[ci][1], yawCorner[ci], [2, 2, 2], [0.25, 0.3, 0.22, 1]);
          }
        }
        const redOn = lightPhase === 0;
        for (const node of trafficNodes) {
          const ndx = node.x - camX, ndz = node.z - camZ;
          if (ndx * ndx + ndz * ndz > lightCullSq) continue;
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
          if (ndx * ndx + ndz * ndz > lightCullSq) continue;
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
    for (const chunk of this.chunkCache.values()) {
      for (const aircraft of chunk.decorativeAircraft ?? []) {
        const dx = aircraft.x - camX;
        const dz = aircraft.z - camZ;
        if (dx * dx + dz * dz > 320 * 320 || !aircraft.model) continue;
        const aircraftMesh = aircraft.model;
        const aircraftY = aircraft.type === 'helicopter' ? -this.getModelMinY(aircraftMesh as CityMesh[]) + 0.32 : 0.15;
        this.drawMesh(aircraftMesh, aircraft.x, aircraftY, aircraft.z, aircraft.yaw);
        if (aircraft.type === 'helicopter') {
          const spin = now * 0.02;
          const rotor = this.getRotorBladeMesh();
          this.drawMesh(rotor, aircraft.x, aircraftY + 2.02, aircraft.z, aircraft.yaw + spin, [0.58, 0.58, 0.58], [0.18, 0.2, 0.22, 0.82]);
          const tailX = aircraft.x + Math.sin(aircraft.yaw) * 2.65;
          const tailZ = aircraft.z + Math.cos(aircraft.yaw) * 2.65;
          this.drawMesh(rotor, tailX, aircraftY + 1.2, tailZ, aircraft.yaw + spin * 2.75, [0.18, 0.18, 0.18], [0.2, 0.22, 0.24, 0.8]);
        }
      }
    }
    for (const pc of parkedCars) {
      const biome = getBiome(Math.floor(pc.x / 80), Math.floor(pc.z / 80));
      const isBoat = pc.type === 'boat';
      const submergeY = biome === 'ocean' ? (isBoat ? 0 : -1.5) : getTerrainHeight(pc.x, pc.z);
      this.drawMesh(pc.mesh, pc.x, pc.y ?? (pc as any)._expY ?? submergeY, pc.z, pc.yaw);
    }
    for (const npc of serverNPCs) {
      const npcSpeed = npc.speed ?? 0;
      const isHumanNpc = npc.type !== 'helicopter' && npc.type !== 'plane' && npc.type !== 'car' && npc.type !== 'bus' && npc.type !== 'taxi' && npc.type !== 'police' && npc.type !== 'boat';
      const npcState = isHumanNpc && npcSpeed > 0.08 ? 'walk' : 'idle';
      // Animation LOD: entities beyond ~220 units keep their last-skinned pose
      // (drawn as-is) instead of re-skinning every frame — with the cull radius
      // now spanning the whole view distance, distant traffic/peds would
      // otherwise burn the CPU on bone math for pixels you can barely see.
      if (npc.isArresting) this.arrestingEntities.add(npc.id);
      else this.arrestingEntities.delete(npc.id);
      if (npc.isDucking) this.duckingEntities.add(npc.id);
      else this.duckingEntities.delete(npc.id);
      const flinchLeft = this.flinchTimers.get(npc.id) ?? 0;
      if (flinchLeft > 0) this.flinchTimers.set(npc.id, Math.max(0, flinchLeft - dt));
      const npcDx = npc.x - camX, npcDz = npc.z - camZ;
      (npc.mesh as any)._lastAnimDistanceSq = npcDx * npcDx + npcDz * npcDz;
      // Keep animation work in a tighter near-field than draw culling; distant
      // NPCs retain their last pose while still contributing to the skyline.
      if (isHumanNpc) {
        // Keep the procedural rig advancing for every visible NPC. The old
        // distance gate left walk phases frozen as soon as a pedestrian crossed
        // the 180-unit animation radius, which made walking NPCs look like
        // sliding statues when they came back into view.
        const animationSpeed = npcState === 'walk'
          ? Math.max(0.75, Math.min(2.2, npcSpeed * 2.2 || 1))
          : 1;
        if (npcDx * npcDx + npcDz * npcDz <= 220 * 220) {
          this.animateAndSkinEntity(npc.id, npc.mesh, npcState, dt, animationSpeed);
        }
      }
      const biome = getBiome(Math.floor(npc.x / 80), Math.floor(npc.z / 80));
      const submerged = biome === 'ocean';
      const isAircraft = npc.type === 'helicopter' || npc.type === 'plane';
      const terrainY = submerged ? -1.5 : getTerrainHeight(npc.x, npc.z);
      const expY = isAircraft ? (npc.y || 0) : (npc as any)._expY ?? terrainY;
      if (npc.type === 'helicopter') {
        const copHeli = !!(npc as any).isPolice || !!(npc as any).isCop;
        const heliMesh = copHeli ? this.getHelicopterMesh(npc.id, true) : this.getHelicopterMesh(npc.id, false);
        this.drawMesh(heliMesh, npc.x, expY, npc.z, npc.yaw);
        const rotorMesh = this.getRotorBladeMesh();
        const now = performance.now() / 1000;
        const mainRotorY = expY + 2.02;  
        const mainSpin = now * 20;       
        this.drawMesh(rotorMesh, npc.x, mainRotorY, npc.z, npc.yaw + mainSpin, [0.58, 0.58, 0.58], [0.55, 0.55, 0.55, 0.5]);
        const tailOffX = Math.sin(npc.yaw) * 2.65;
        const tailOffZ = Math.cos(npc.yaw) * 2.65;
        const tailSpin = now * 55;       
        this.drawMesh(rotorMesh, npc.x + tailOffX, expY + 1.2, npc.z + tailOffZ, npc.yaw + tailSpin, [0.18, 0.18, 0.18], [0.4, 0.4, 0.4, 0.45]);
      } else {
        const isSwimming = !!npc.isSwimming && submerged;
        const npcScale: [number, number, number] = isSwimming
          ? [1.05, 0.48, 1.05]
          : (flinchLeft > 0 ? [1.05, 0.88, 1.05] : [1, 1, 1]);
        const npcY = isSwimming ? -1.35 : expY;
        const reaction = (this as any).npcImpactReactions?.get(npc.id);
        const reactionProgress = reaction ? Math.min(1, reaction.age / reaction.duration) : 0;
        const reactionLift = reaction ? Math.sin(reactionProgress * Math.PI) * Math.min(2.2, Math.hypot(reaction.vx, reaction.vz) * 0.12) : 0;
      const reactionTime = reaction ? Math.max(0, reaction.age - dt) : 0;
      const reactionX = reaction ? npc.x + reaction.vx * reactionTime : npc.x;
      const reactionZ = reaction ? npc.z + reaction.vz * reactionTime : npc.z;
      const reactionYaw = reaction ? npc.yaw + reaction.spin * reactionTime * 8 : npc.yaw;
        const reactionScale: [number, number, number] = reaction
          ? [1.08, Math.max(0.72, 1 - reactionProgress * 0.28), 1.08]
          : npcScale;
        this.drawMesh(npc.mesh, reactionX, npcY + reactionLift, reactionZ, reactionYaw, reactionScale);
      }
      if (npc.hasDriver !== false && npc.type !== 'cop') {
        const dMesh = this.getPedestrianMesh(npc.gender || 'male', npc.id);
        // Lifelike driver — drive pose, visible to all peers, cheap LOD
        const ddx = npc.x - camX, ddz = npc.z - camZ;
        if (ddx*ddx+ddz*ddz < 220*220) this.animateAndSkinEntity(npc.id+900000, dMesh, 'drive', dt, 1);
        const sinY = Math.sin(npc.yaw), cosY = Math.cos(npc.yaw);
        const dOffX = 0.3, dOffZ = 0.2;
        const dwx = npc.x + (dOffX * cosY + dOffZ * sinY);
        const dwz = npc.z + (-dOffX * sinY + dOffZ * cosY);
        const driverY = expY - 0.3;
        this.drawMesh(dMesh, dwx, driverY, dwz, npc.yaw, [0.85, 0.85, 0.85]);
        if ((npc.passengerCount || 0) > 0) {
          const pMesh = this.getPedestrianMesh('female', npc.id + 1);
          const pOffX = -0.3, pOffZ = 0.2;
          const pwx = npc.x + (pOffX * cosY + pOffZ * sinY);
          const pwz = npc.z + (-pOffX * sinY + pOffZ * cosY);
          this.drawMesh(pMesh, pwx, driverY, pwz, npc.yaw, [0.7, 0.7, 0.7]);
        }
      }
      if (npc.type === 'police') {
        const isRed = (performance.now() / 300) % 2 < 1;
        const lightColor: [number, number, number, number] = isRed ? [1, 0, 0, 1] : [0, 0, 1, 1];
        this.drawMesh(this.getBoxMesh(0.8, 0.2, 0.4), npc.x, expY + 1.2, npc.z, npc.yaw, [1, 1, 1], lightColor);
      }
      if (npc.state === 'stop') {
        this.drawMesh(this.getBoxMesh(0.4, 0.2, 0.3), npc.x, expY + 1.0, npc.z, npc.yaw, [1, 1, 1], [1, 0, 0, 1]);
      }
    }
    for (const ped of serverPedestrians) {
      const pedSpeed = ped.speed ?? 0;
      // Server speeds are world units per second; even slow pedestrians need a
      // walk pose or the procedural rig falls back to a motionless idle.
      const pedState = pedSpeed > 0.08 ? 'walk' : 'idle';
      // Animation LOD — see the NPC loop above: skin only what's close enough
      // to notice, draw the rest at their last pose.
      if (ped.isArresting) this.arrestingEntities.add(ped.id);
      else this.arrestingEntities.delete(ped.id);
      if (ped.isDucking) this.duckingEntities.add(ped.id);
      else this.duckingEntities.delete(ped.id);
      const pedFlinch = this.flinchTimers.get(ped.id) ?? 0;
      if (pedFlinch > 0) this.flinchTimers.set(ped.id, Math.max(0, pedFlinch - dt));
      const pedDx = ped.x - camX, pedDz = ped.z - camZ;
      (ped.mesh as any)._lastAnimDistanceSq = pedDx * pedDx + pedDz * pedDz;
      // Hookers use a slower, confident walk. Their procedural female rig is
      // still the same shared human rig, but the speed makes them readable
      // from the street without adding another asset or animation clip.
      const animationSpeed = ped.type === 'hooker' || ped.gender === 'hooker'
        ? 1.45
        : (pedState === 'walk' ? Math.max(0.75, Math.min(2.2, pedSpeed * 2.2 || 1)) : 1);
      if (pedDx * pedDx + pedDz * pedDz <= 220 * 220) {
        this.animateAndSkinEntity(ped.id, ped.mesh, pedState, dt, animationSpeed);
      }
      // Ducking (gunfire reaction): the crouch-and-cover pose (bent legs, low
      // hips) does the lowering — this mild squash is the fallback for distant
      // peds that skip skinning, and keeps the "hit the deck" read. A flinching
      // ped (a landed punch) gets an extra brief recoil squash on top.
      const isSwimming = !!ped.isSwimming && getBiome(Math.floor(ped.x / 80), Math.floor(ped.z / 80)) === 'ocean';
      const pedTerrainY = getTerrainHeight(ped.x, ped.z);
      let pedScale: [number, number, number] = isSwimming
        ? [1.05, 0.42, 1.05]
        : (ped.isDucking ? [0.95, 0.75, 0.95] : [1, 1, 1]);
      if (pedFlinch > 0 && !isSwimming) pedScale = [1.05, pedScale[1] * 0.92, 1.05];        // Keep the rig's foot contact readable: the walk cycle is intentionally
        // subtle and the lower body remains grounded while the hips bob.
      const impactReaction = (this as any).npcImpactReactions?.get(ped.id);
      const impactProgress = impactReaction ? Math.min(1, impactReaction.age / impactReaction.duration) : 0;
      const impactLift = impactReaction
        ? (impactReaction.region === 'head'
          ? Math.sin(impactProgress * Math.PI) * 0.9
          : impactReaction.region === 'legs' ? 0.08 : Math.sin(impactProgress * Math.PI) * 0.35)
        : 0;
      const impactTime = impactReaction ? Math.max(0, impactReaction.age - dt) : 0;
      const impactX = impactReaction ? ped.x + impactReaction.vx * impactTime : ped.x;
      const impactZ = impactReaction ? ped.z + impactReaction.vz * impactTime : ped.z;
      const impactYaw = impactReaction ? ped.yaw + impactReaction.spin * impactTime * 8 : ped.yaw;
      const finalScale: [number, number, number] = impactReaction
        ? [1.08, Math.max(0.72, 1 - impactProgress * 0.28), 1.08]
        : pedScale;
      this.drawMesh(ped.mesh, impactX, (isSwimming ? -1.35 : pedTerrainY) + impactLift, impactZ, impactYaw, finalScale);
    }
    if (dt > 0 && Math.random() < 0.05) {
      const activeIds = new Set<number>();
      activeIds.add(-1); 
      for (const npc of serverNPCs) activeIds.add(npc.id);
      for (const ped of serverPedestrians) activeIds.add(ped.id);
      this.cleanupAnimators(activeIds);
    }
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
        // Lifelike remote player — walk/idle + visible firing/punch for peers
        const dx = p.posX - ((p as any)._prevX ?? p.posX), dz = p.posZ - ((p as any)._prevZ ?? p.posZ);
        const moved = Math.hypot(dx, dz);
        const state = p.isShooting ? 'walk' as const : (moved > 0.015 ? 'walk' as const : 'idle' as const);
        (p as any)._prevX = p.posX; (p as any)._prevZ = p.posZ;
        if (p.isShooting) this.punchTimers.set(p.userId, 0.18);
        const ddx2 = p.posX - camX, ddz2 = p.posZ - camZ;
        if (ddx2*ddx2+ddz2*ddz2 < 220*220) this.animateAndSkinEntity(p.userId, p.mesh, state, dt, 1.2);
        this.drawMesh(p.mesh, p.posX, p.posY, p.posZ, p.yaw);
      }
    }
    if (this.hospitalMesh) this.drawMesh(this.hospitalMesh, 40, 0.06, 40, 0, [15, 10, 15]);
    if (this.homeBaseMesh) this.drawMesh(this.homeBaseMesh, 120, 0, 40, 0, [10, 10, 10]);
    if (this.jumpRamps.length) {
      if (!this.jumpRampMesh) this.getJumpRampMesh();
      if (this.jumpRampMesh) {
        for (const jr of this.jumpRamps) {
          const jdx = jr.x - camX, jdz = jr.z - camZ;
          if (jdx * jdx + jdz * jdz > 300 * 300) continue;
          this.drawMesh(this.jumpRampMesh, jr.x, 0, jr.z, jr.yaw, [1, 1, 1], [1, 1, 1, 1]);
        }
      }
    }
    if (this.garageCarMesh) this.drawMesh(this.garageCarMesh, 120, 0, 42, 0);
    if (this.vendingMachineMesh) {
      for (const vm of vendingMachines) {
        this.drawMesh(this.vendingMachineMesh, vm.x, 0, vm.z, vm.yaw);
      }
    }
    if (this.playerIsInCar && this.playerVehicleMesh) {
      // The local vehicle is not part of the remote-NPC list. Draw it here for
      // every vehicle type; previously only helicopters had a local pass, so
      // cars disappeared as soon as the player entered them.
      const vehicleY = (this.playerVehicleType === 'helicopter' || this.playerVehicleType === 'plane')
        ? targetY
        : targetY - LOCAL_VEHICLE_GROUND_OFFSET;
      const localVehicleMesh = this.playerVehicleType === 'helicopter'
        ? this.getHelicopterMesh(0, false)
        : this.playerVehicleMesh;
      if (localVehicleMesh) this.drawMesh(localVehicleMesh, targetX, vehicleY, targetZ, carYaw, [1, 1, 1], [1, 1, 1, 1], false, 0, carRoll);
      if (this.playerVehicleType === 'helicopter') {
        const rotor = this.getRotorBladeMesh();
        const spin = performance.now() * 0.02;
        this.drawMesh(rotor, targetX, vehicleY + 2.02, targetZ, carYaw + spin, [0.58, 0.58, 0.58], [0.55, 0.55, 0.55, 0.5]);
        const tailX = targetX + Math.sin(carYaw) * 2.65;
        const tailZ = targetZ + Math.cos(carYaw) * 2.65;
        this.drawMesh(rotor, tailX, vehicleY + 1.2, tailZ, carYaw + spin * 2.75, [0.18, 0.18, 0.18], [0.4, 0.4, 0.4, 0.45]);
      }
    }
    if (playerMesh && !this.playerIsInCar) {
      // Franklin has a verified full-body skeleton but no embedded clips, so
      // use the procedural player pose path rather than the NPC clip matcher.
      this.skinPlayerMesh(playerMesh, dt);
      this.drawMesh(playerMesh, targetX, targetY, targetZ, carYaw, [1, 1, 1], [1, 1, 1, 1], false, 0, carRoll);
      this.updateWeaponPitch(dt);
      this.drawPlayerWeapon(targetX, targetY, targetZ, carYaw);
    }
    // Moped wheel animation: rear wheel spins with speed, front wheel also steers.
    const mopedArr = Array.isArray(playerMesh) ? playerMesh : (playerMesh ? [playerMesh] : []);
    if (mopedArr.length > 0 && (mopedArr[0] as any)._isMotorcycle) {
      if (dt > 0) {
        // The wheel is authored in the YZ plane and rolls around the X axle.
        // The model's forward direction is -Z, so forward motion requires the
        // opposite pitch sign from the vehicle speed.
        this._mopedSpin -= this.playerCarSpeed * dt * 2.4;
        this._mopedFrontSteer += (this.playerSteerInput - this._mopedFrontSteer) * Math.min(1, 10 * dt);
      }
      const wm = this.getMopedWheelMesh();
      const sinY = Math.sin(carYaw), cosY = Math.cos(carYaw);
      // Wheel centre sits at the tire radius above the ground (baked tire bottoms at y=0).
      const wy = targetY + 0.44;
      const d = 0.97;
      // Draw over the baked GLTF wheels: depth-test on, but depth-write off so the thin disc
      // never z-fights the baked sidewall and always reads as the spinning tire.
      gl.depthMask(false);
      // rear wheel
      this.drawMesh(wm, targetX - d * sinY, wy, targetZ - d * cosY, carYaw, [1, 1, 1], [1, 1, 1, 1], false, this._mopedSpin, carRoll);
      // front wheel (spins + steers)
      this.drawMesh(wm, targetX + d * sinY, wy, targetZ + d * cosY, carYaw + this._mopedFrontSteer * 0.45, [1, 1, 1], [1, 1, 1, 1], false, this._mopedSpin, carRoll);
      gl.depthMask(true);
    }
    if (attachedMeshes && attachedMeshes.length > 0) {
      const sinY = Math.sin(carYaw), cosY = Math.cos(carYaw);
      for (const am of attachedMeshes) {
        const wx = targetX + (am.offsetX * cosY + am.offsetZ * sinY);
        const wz = targetZ + (-am.offsetX * sinY + am.offsetZ * cosY);
        const s = am.scale ?? 1;
        this.drawMesh(am.mesh, wx, targetY + am.offsetY, wz, carYaw + am.yaw, [s, s, s]);
      }
    }
    // Effects are transparent, but remain depth-tested so opaque world geometry
    // occludes them. Only depth writes are disabled; disabling depth testing
    // here made smoke, flashes and explosions visible through buildings.
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    for (const b of bloodSplats) {
      const t = b.age / b.lifetime;
      const alpha = 1.0 - t;
      const sz = b.size * (1.0 - t * 0.3);
      const tint = 0.85 - t * 0.25;
      this.drawMesh(this.getBloodMesh(), b.x, b.y, b.z, 0, [sz, sz, sz], [tint, 0.0, 0.0, alpha]);
    }
    const smokeMesh = this.getSphereMesh(0.5);
    for (const s of bulletSmoke) {
      const t = s.age / s.lifetime;
      const alpha = (1.0 - t) * 0.35;
      const sz = s.size;
      this.drawMesh(smokeMesh, s.x, s.y, s.z, 0, [sz, sz, sz], [0.7, 0.7, 0.75, alpha]);
    }
    for (const s of carSmoke) {
      const t = s.age / s.lifetime;
      const alpha = (1.0 - t) * 0.45;
      const sz = s.size;
      const sr = s.colorR ?? 0.25;
      const sg = s.colorG ?? 0.25;
      const sb = s.colorB ?? 0.28;
      this.drawMesh(smokeMesh, s.x, s.y, s.z, 0, [sz, sz, sz], [sr, sg, sb, alpha]);
    }
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
      const elapsed = (performance.now() / 1000) - db.deathTime;
      const fadeAlpha = Math.max(0.4, 1.0 - elapsed / 30);
      if (!isHuman) {
        this.drawMesh(db.mesh, db.x, 0.02, db.z, -db.yaw, [1, 1, 1], [0.4, 0.4, 0.4, fadeAlpha]);
        continue;
      }
      // Ragdoll fall: instead of snapping instantly flat, the human tilts over
      // from standing to the ground over ~0.35s with a flop, a sideways tumble,
      // and a short backward slide — reading as a body knocked over by the shot.
      // After the fall it settles flat and fades like before.
      const fallDur = 0.35;
      const ft = Math.max(0, Math.min(1, elapsed / fallDur));
      const eased = ft * ft * (3 - 2 * ft); // smoothstep
      const seed = Math.abs((db.id * 1.7 + db.deathTime * 3.1) % (Math.PI * 2));
      // Pitch from upright to flat with a slight over-rotation flop.
      const flop = -(Math.PI / 2) * eased - Math.PI * 0.10 * Math.sin(Math.PI * ft);
      // Tumble sideways early, settling to a stable rest roll as it lands.
      const tumble = Math.sin(seed) * 0.45 * Math.sin(Math.PI * ft);
      // Body slides a short way opposite its facing while falling.
      const slide = 0.9 * eased;
      const sx = db.x - Math.sin(-db.yaw) * slide;
      const sz = db.z - Math.cos(-db.yaw) * slide;
      this.drawMesh(db.mesh, sx, 0.02, sz, -db.yaw, [1, 1, 1], [0.4, 0.4, 0.4, fadeAlpha], false, flop, tumble);
    }
    // Keep projectile effects behind walls as well. They use the regular
    // program and therefore can participate in the world's depth buffer.
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
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
      // Optional per-explosion multiplier: gas-station blasts render (and
      // damage) several times larger than a barrel or car explosion.
      const s = e.scale ?? 1;
      const coreScale = (1 + progress * 4) * s;
      const coreAlpha = (1.0 - progress) * 1.2;
      this.drawMesh(this.getExplosionMesh(), e.x, e.y + 0.5 * s, e.z, 0, [coreScale, coreScale, coreScale], [1, 1, 1, Math.min(1, coreAlpha)]);
      const fireScale = (2 + progress * 8) * s;
      const fireAlpha = (1.0 - progress) * 0.8;
      this.drawMesh(this.getExplosionMesh(), e.x, e.y + 1.0 * s, e.z, 0, [fireScale, fireScale * 0.8, fireScale], [1, 0.5, 0.0, fireAlpha]);
      const smokeScale = (3 + progress * 12) * s;
      const smokeAlpha = (1.0 - progress) * 0.5;
      this.drawMesh(this.getExplosionMesh(), e.x, e.y + 2.0 * s + progress * 3 * s, e.z, 0, [smokeScale, smokeScale, smokeScale], [0.2, 0.2, 0.2, smokeAlpha]);
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
      const markerDistSq = 150 * 150;
      const markerFadeDistSq = 100 * 100;
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(false);
      for (const m of markers) {
        if (m.type === 'destination') {
          const dx = m.x - camX, dz = m.z - camZ;
          const dSq = dx * dx + dz * dz;
          if (dSq > markerDistSq) continue;
          const alpha = dSq > markerFadeDistSq ? 1 - (dSq - markerFadeDistSq) / (markerDistSq - markerFadeDistSq) : 1;
          const pulse = 1.0 + 0.15 * Math.sin(performance.now() / 250);
          this.drawMesh(this.getDestinationMarkerMesh(), m.x, 0.02, m.z, 0, [pulse, 1, pulse], [1.0, 1.0, 1.0, alpha]);
        }
      }
      gl.depthMask(true);
      gl.disable(gl.DEPTH_TEST);
      for (const m of markers) {
        if (m.type === 'hail') {
          const dx = m.x - camX, dz = m.z - camZ;
          const dSq = dx * dx + dz * dz;
          if (dSq > markerDistSq) continue;
          const alpha = dSq > markerFadeDistSq ? 1 - (dSq - markerFadeDistSq) / (markerDistSq - markerFadeDistSq) : 1;
          const bob = Math.sin(performance.now() / 300 + (m.phase || 0)) * 0.3;
          this.drawMesh(this.getHailMarkerMesh(), m.x, 3.2 + bob, m.z, performance.now() / 600, [1.4, 1.4, 1.4], [1.0, 1.0, 1.0, alpha]);
        } else if (m.type === 'beam') {
          const dx = m.x - camX, dz = m.z - camZ;
          const dSq = dx * dx + dz * dz;
          if (dSq > markerDistSq) continue;
          const alpha = dSq > markerFadeDistSq ? 1 - (dSq - markerFadeDistSq) / (markerDistSq - markerFadeDistSq) : 1;
          const pulse = 0.8 + 0.2 * Math.sin(performance.now() / 200);
          this.drawMesh(this.getDestinationBeamMesh(), m.x, 0, m.z, 0, [1, 1, 1], [1.0, 1.0, 1.0, pulse * alpha]);
        }
      }
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
    }
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
    gl.depthMask(true);
    if (this.droppedWeapons && this.droppedWeapons.length > 0) {
      const haloMesh = this.getSphereMesh(0.8);
      for (const dw of this.droppedWeapons) {
        if (dw == null || dw.weaponType == null) continue;
        const hover = Math.sin((now / 1000) * 3 + (dw.id || 0)) * 0.15;
        const pickupY = 1.0 + hover;
        const pulse = 0.82 + 0.18 * Math.sin((now / 1000) * 4 + (dw.id || 0));
        // Draw a soft gold beacon behind the pickup first. It is deliberately
        // translucent and slightly larger than the weapon so it remains easy
        // to spot against asphalt and buildings without adding particles.
        this.drawMesh(
          haloMesh,
          dw.posX, pickupY, dw.posZ,
          0,
          [0.7 + pulse * 0.18, 0.7 + pulse * 0.18, 0.7 + pulse * 0.18],
          [1.0, 0.72, 0.08, 0.24]
        );
        this.drawMesh(
          this.getWeaponPickupMesh(dw.weaponType),
          dw.posX, pickupY, dw.posZ,
          pickupYaw + (dw.id || 0),
          [PICKUP_SCALE, PICKUP_SCALE, PICKUP_SCALE],
          [1, 1, 1, 1]
        );
      }
    }
    gl.enable(gl.DEPTH_TEST);
    // The procedural sky is the authoritative background. Do not draw the
    // optional GLTF sky after the world: its depth-disabled pass can cover the
    // already-lit scene with a black/untextured material when its texture has
    // not loaded. The asset can still be loaded for compatibility, but the
    // reliable gradient remains visible on every device.
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
  /** Procedural rotor blade - a flat elongated diamond shape that spins on Y axis */
  getRotorBladeMesh(): CityMesh {
    if (this.meshCache.has('rotor_blade')) return this.meshCache.get('rotor_blade')!;
    const verts: number[] = [], indices: number[] = [];
    this.addBox(verts, indices, 0, 0, 0, 5.0, 0.08, 0.5, 0.15, 0.15, 0.15, 0.9, 0);
    this.addBox(verts, indices, 0, 0, 0, 0.5, 0.08, 5.0, 0.15, 0.15, 0.15, 0.9, 24);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('rotor_blade', mesh);
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
        let source: TexImageSource = img;
        if (this.isMobile) {
          const maxDim = 256;
          let w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            const scale = Math.min(maxDim / w, maxDim / h);
            w = Math.floor(w * scale);
            h = Math.floor(h * scale);
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const ctx = c.getContext('2d');
            if (ctx) {
              ctx.imageSmoothingEnabled = true;
              ctx.drawImage(img, 0, 0, w, h);
              source = c;
            }
          }
          this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, source);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        } else {
          this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img);
          this.gl.generateMipmap(this.gl.TEXTURE_2D);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        }
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.REPEAT);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.REPEAT);
        resolve(tex);
      };
      img.onerror = () => { console.error('Failed to load texture:', url); resolve(null); };
      img.src = (url.startsWith('blob:') || url.startsWith('data:')) ? url : url;
    });
  }
  // Eases the held gun's pitch toward the crosshair aim while a shot is live,
  // then relaxes it back to a soft resting aim so each shot reads as the gun
  // swinging up to point at the crosshairs and settling back. The attack is
  // fast (snaps up on trigger) and the return is slower (a calm reset).
  private updateWeaponPitch(dt: number): void {
    if (dt <= 0) return;
    const firing = this.playerFireTime > 0;
    const target = firing ? this.playerAimPitch : this.playerAimPitch * 0.3;
    const ratePerSec = firing ? 30 : 9;
    const k = Math.min(1, ratePerSec * dt);
    this.weaponPitch += (target - this.weaponPitch) * k;
    // Blend the drawn gun's yaw toward the aim direction (camera/crosshair)
    // rather than leaving it snapped to the walk-facing. Use the shortest-angle
    // wrap so the barrel swings the correct way when the camera crosses 0/2π.
    let yawDiff = this.playerAimYaw - this.weaponYaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    const targetYaw = this.playerAimYaw;
    // Aim settles quickly while firing; when the player only draws a weapon it
    // still eases to the crosshair so the muzzle faces the aim.
    const yawRate = firing ? 20 : 12;
    const ky = Math.min(1, yawRate * dt);
    this.weaponYaw += yawDiff * ky;
  }
  private drawPlayerWeapon(x: number, y: number, z: number, yaw: number): void {
    const weaponType = this.playerWeapon > 0 ? this.playerWeapon
      : (this.playerFireTime > 0 ? this.playerFireWeapon : 0);
    if (this.playerIsInCar || weaponType <= 0) return;
    let weapon: CityMesh[] | null = null;
    let scale = 0.24;
    if (weaponType === 1) weapon = this.coltMesh;
    else if (weaponType === 2) { weapon = this.m4a1Mesh; scale = 0.3; }
    else if (weaponType === 3) { weapon = this.shotgunMesh; scale = 0.3; }
    else if (weaponType === 4) { weapon = this.rocketLauncherMesh; scale = 0.34; }
    if (!weapon) return;
    // Aim the barrel at the crosshair (camera) direction rather than the walk
    // facing: bullets/tracers/rockets all travel along this.playerAimYaw, so the
    // visible gun must face the same way to line up the muzzle with the shot.
    // The eased weaponYaw lets the gun swing smoothly to the aim instead of
    // snapping, and stays at the walk facing when idling without a weapon out.
    const aimYaw = this.playerWeapon > 0 ? this.weaponYaw : yaw;
    const forward = 0.62;
    const side = 0.22;
    const fx = Math.sin(aimYaw), fz = Math.cos(aimYaw);
    const rx = Math.cos(aimYaw), rz = -Math.sin(aimYaw);
    const recoil = this.playerFireTime > 0 ? -0.08 : 0;
    this.drawMesh(
      weapon,
      x + fx * forward + rx * side,
      y + 1.18,
      z + fz * forward + rz * side,
      aimYaw,
      [scale, scale, scale],
      [1, 1, 1, 1],
      false,
      this.weaponPitch + recoil
    );
  }
  renderFirstPersonWeapon(
    camX: number, camY: number, camZ: number,
    camYaw: number, camPitch: number,
    weapon: number,
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
    this.ensureFirstPersonArms();
    if (this.firstPersonArmsMesh && this.firstPersonArmsSkeleton) {
      // Skin the procedural arms with a live punch (only when unarmed) so the
      // fists actually jab instead of sitting static.
      if (weapon <= 0) this.skinFirstPersonArms(dt);
      const ax = camX + fx * 0.2 + rightX * 0.06;
      const ay = camY + fy * 0.2 - 1.5;
      const az = camZ + fz * 1.2 + rightZ * 0.06;
      this.drawMesh(this.firstPersonArmsMesh, ax, ay, az, camYaw + Math.PI, [0.42, 0.42, 0.42], [1, 1, 1, 1]);
    }
    if (weapon === 1 && this.mark23Mesh) {
      if (this.mark23Animations && this.mark23Skeleton) {
        const skel = this.mark23Skeleton;
        const anims = this.mark23Animations;
        const mAnimName = mark23Anim ?? '';
        if (mAnimName !== this._mark23AnimName) {
          this._mark23AnimName = mAnimName;
          this._mark23AnimTime = 0;
        }
        const anim = anims.find(a => a.name === mAnimName) ?? anims[0];
        if (anim && anim.duration > 0) {
          this._mark23AnimTime += dt;
          if (this._mark23AnimTime > anim.duration) this._mark23AnimTime %= anim.duration;
          const localMatrices = new Float32Array(skel.boneCount * 16);
          this.sampleAnimation(anim, this._mark23AnimTime, skel, localMatrices);
          const jointMatrices = new Float32Array(skel.boneCount * 16);
          this.computeJointMatrices(skel, localMatrices, jointMatrices);
          this.skinMeshGeneric(this.mark23Mesh, skel, jointMatrices);
        }
      }
      const mx = camX + fx * 0.4 + rightX * 0.06;
      const my = camY + fy * 2.4 - 2.2;
      const mz = camZ + fz * 3.4 + rightZ * 0.06;
      this.drawMesh(this.mark23Mesh, mx, my, mz, camYaw, [1, 1, 1], [1, 1, 1, 1]);
    }
    // First-person viewmodel for the other weapons. Weapon 1 (mark23) has its
    // own dedicated model above; the M4 (2), shotgun (3), and rocket launcher
    // (4) reuse their standard meshes held in front of the camera so the gun
    // is visible in first person instead of only bare arms.
    if (weapon >= 2) {
      let fpWeapon: CityMesh[] | null = null;
      let fpScale = 0.3;
      let fpDown = 2.0;   // how deep the model sits below the camera eye
      let fpFwd = 2.6;    // how far forward the model reaches
      if (weapon === 2) { fpWeapon = this.m4a1Mesh; fpScale = 0.55; fpDown = 1.9; fpFwd = 3.0; }
      else if (weapon === 3) { fpWeapon = this.shotgunMesh; fpScale = 0.55; fpDown = 1.9; fpFwd = 3.0; }
      else if (weapon === 4) { fpWeapon = this.rocketLauncherMesh; fpScale = 0.6; fpDown = 1.7; fpFwd = 3.2; }
      if (fpWeapon && fpWeapon.length > 0) {
        const recoil = this.playerFireTime > 0 ? -0.06 : 0;
        const wx = camX + fx * 0.3 + rightX * 0.08;
        const wy = camY + fy * fpDown - 2.2 + recoil;
        const wz = camZ + fz * fpFwd + rightZ * 0.08;
        this.drawMesh(fpWeapon, wx, wy, wz, camYaw, [fpScale, fpScale, fpScale], [1, 1, 1, 1]);
      }
    }
    gl.enable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
  }
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
        const times = new Float32Array(inView);   
        for (let i = 0; i < inCount; i++) if (times[i] > maxTime) maxTime = times[i];
        const outAcc = json.accessors[samplerDef.output];
        const outBV = json.bufferViews[outAcc.bufferView];
        const outBuf = buffers[outBV.buffer];
        const outOff = (outBV.byteOffset || 0) + (outAcc.byteOffset || 0);
        let comp = 3;
        if (ch.path === 'rotation') comp = 4;
        if (ch.path === 'weights') continue;                 
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
    const boneLocalTf = new Float32Array(numBones * 16);
    const parents = new Int32Array(numBones);
    parents.fill(-1);
    // Iterative parent assignment (explicit stack, first visit wins). The old
    // path-guarded recursion still trusted the call stack; a cyclic node graph
    // in a skinned asset must not be able to exhaust it.
    const parentVisited = new Set<number>();
    const parentStack: { idx: number; parent: number }[] = [];
    const skeletonGraphRoots = json.scenes[json.scene ?? 0]?.nodes || [];
    for (let r = skeletonGraphRoots.length - 1; r >= 0; r--) {
      parentStack.push({ idx: skeletonGraphRoots[r], parent: -1 });
    }
    while (parentStack.length > 0) {
      const frame = parentStack.pop()!;
      if (parentVisited.has(frame.idx)) continue;
      const node = json.nodes[frame.idx];
      if (!node) continue;
      parentVisited.add(frame.idx);
      (node as any).parent = frame.parent;
      const kids = node.children;
      if (kids) for (let k = kids.length - 1; k >= 0; k--) parentStack.push({ idx: kids[k], parent: frame.idx });
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
    let skeletonRootNodeIdx = -1;
    for (let b = 0; b < numBones; b++) {
      if (parents[b] < 0) { skeletonRootNodeIdx = jointNodes[b]; break; }
    }
    let skinRootWorld = mat4.identity(mat4.create());
    if (skeletonRootNodeIdx >= 0) {
      const rootParentIdx = json.nodes[skeletonRootNodeIdx].parent ?? -1;
      if (rootParentIdx >= 0) {
        // Iterative world-transform walk with a visited set. This closure had
        // no cycle protection at all — a cyclic node graph in a skinned asset
        // (first-person arms/mark23) recursed until the stack overflowed.
        const nodeWorld = new Map<number, Float32Array>();
        const worldVisited = new Set<number>();
        const skeletonWorldStack: { idx: number; parentWorld: Float32Array }[] = [];
        const skeletonWorldRoots = json.scenes[json.scene ?? 0]?.nodes || [];
        for (let r = skeletonWorldRoots.length - 1; r >= 0; r--) {
          skeletonWorldStack.push({ idx: skeletonWorldRoots[r], parentWorld: mat4.identity(mat4.create()) });
        }
        while (skeletonWorldStack.length > 0) {
          const frame = skeletonWorldStack.pop()!;
          if (worldVisited.has(frame.idx)) continue;
          const n = json.nodes[frame.idx];
          if (!n) continue;
          worldVisited.add(frame.idx);
          const local = mat4.identity(mat4.create());
          if (n.matrix) { for (let i = 0; i < 16; i++) local[i] = n.matrix[i]; }
          else if (n.rotation || n.translation) {
            const q = n.rotation || [0, 0, 0, 1], t = n.translation || [0, 0, 0], s = n.scale || [1, 1, 1];
            quatPosScaleToMat4([q[0], q[1], q[2], q[3]], [t[0], t[1], t[2]], [s[0], s[1], s[2]], local);
          }
          const w = mat4.create(); mat4.multiply(w, frame.parentWorld, local);
          nodeWorld.set(frame.idx, w);
          const kids = n.children;
          if (kids) for (let k = kids.length - 1; k >= 0; k--) skeletonWorldStack.push({ idx: kids[k], parentWorld: w });
        }
        const pw = nodeWorld.get(rootParentIdx);
        if (pw) skinRootWorld = new Float32Array(pw);
      }
    }
    // Bone-indexed joint names: json.nodes holds every scene node, but the
    // skeleton only exposes bones 0..boneCount-1 in joint order, so map the
    // joint node names directly (nodeNames[b] = name of bone b).
    const nodeNames: string[] = jointNodes.map((j: number) => (json.nodes[j]?.name || ''));
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
      let raw = await (await fetch(url)).arrayBuffer();
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
      let buffers: ArrayBuffer[] = [];
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
      let primitiveData: { verts: number[]; indices: number[]; texture: WebGLTexture | null; restPos?: Float32Array; restNrm?: Float32Array; jointIdx?: Uint16Array; jointWgt?: Float32Array; vCount: number; isSkinned?: boolean; meshName?: string }[] = [];
      let globalMinX = Infinity, globalMaxX = -Infinity;
      let globalMinY = Infinity, globalMaxY = -Infinity;
      let globalMinZ = Infinity, globalMaxZ = -Infinity;
      const textureCache = new Map<number, WebGLTexture | null>();
      const entries: { meshIndex: number; transform: Float32Array; nodeIndex: number; nodeName?: string }[] = [];
      if (json.nodes && json.nodes.length > 0 && json.scenes) {
        const identity = mat4.identity(mat4.create());
        // Iterative pre-order DFS with an explicit stack. glTF node graphs come
        // from external assets, so traversal must never depend on the JS call
        // stack: a cyclic or pathologically deep graph would overflow it
        // (RangeError) before the first frame renders. A visited set gives
        // first-seen-wins semantics for shared/diamond node references and
        // terminates cycles.
        const visited = new Set<number>();
        const stack: { nodeIdx: number; parentWorld: Float32Array }[] = [];
        const scene = json.scenes[json.scene ?? 0];
        if (scene?.nodes) {
          for (let r = scene.nodes.length - 1; r >= 0; r--) {
            stack.push({ nodeIdx: scene.nodes[r], parentWorld: identity });
          }
        }
        let warnedCyclicRef = false;
        while (stack.length > 0) {
          const frame = stack.pop()!;
          const nodeIdx = frame.nodeIdx;
          if (visited.has(nodeIdx)) {
            if (!warnedCyclicRef) {
              warnedCyclicRef = true;
              console.warn('Ignoring cyclic/duplicate glTF node reference', url, nodeIdx);
            }
            continue;
          }
          const node = json.nodes[nodeIdx];
          if (!node) continue;
          visited.add(nodeIdx);
          const local = mat4.identity(mat4.create());
          if (node.matrix) { for (let i = 0; i < 16; i++) local[i] = node.matrix[i]; }
          else if (node.rotation || node.translation) {
            const q = node.rotation || [0, 0, 0, 1];
            const t = node.translation || [0, 0, 0];
            const s = node.scale || [1, 1, 1];
            quatPosScaleToMat4([q[0], q[1], q[2], q[3]], [t[0], t[1], t[2]], [s[0], s[1], s[2]], local);
          }
          const world = mat4.create();
          mat4.multiply(world, frame.parentWorld, local);
          if (node.mesh !== undefined) entries.push({ meshIndex: node.mesh, transform: world, nodeIndex: nodeIdx });
          // Push children reversed so the stack pops them in original order,
          // preserving the recursive pre-order entry sequence for tree graphs.
          const kids = node.children;
          if (kids) for (let k = kids.length - 1; k >= 0; k--) stack.push({ nodeIdx: kids[k], parentWorld: world });
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
        // Iterative parent assignment over an explicit stack (same rationale as
        // the scene traversal above). First visit wins for shared nodes.
        const parentVisited = new Set<number>();
        const parentStack: { idx: number; parent: number }[] = [];
        const skinGraphRoots = json.scenes[json.scene ?? 0]?.nodes || [];
        for (let r = skinGraphRoots.length - 1; r >= 0; r--) {
          parentStack.push({ idx: skinGraphRoots[r], parent: -1 });
        }
        while (parentStack.length > 0) {
          const frame = parentStack.pop()!;
          if (parentVisited.has(frame.idx)) continue;
          const node = json.nodes[frame.idx];
          if (!node) continue;
          parentVisited.add(frame.idx);
          node.parent = frame.parent;
          const kids = node.children;
          if (kids) for (let k = kids.length - 1; k >= 0; k--) parentStack.push({ idx: kids[k], parent: frame.idx });
        }
        // Iterative world-transform walk (explicit stack, visited-guarded):
        // identical results to the old recursive walk for valid graphs, but
        // immune to stack overflow on cyclic or extremely deep node chains.
        const nodeVisited = new Set<number>();
        const worldStack: { idx: number; parentWorld: Float32Array }[] = [];
        const skinWorldRoots = json.scenes[json.scene ?? 0]?.nodes || [];
        for (let r = skinWorldRoots.length - 1; r >= 0; r--) {
          worldStack.push({ idx: skinWorldRoots[r], parentWorld: mat4.identity(mat4.create()) });
        }
        while (worldStack.length > 0) {
          const frame = worldStack.pop()!;
          if (nodeVisited.has(frame.idx)) continue;
          const node = json.nodes[frame.idx];
          if (!node) continue;
          nodeVisited.add(frame.idx);
          const local = mat4.identity(mat4.create());
          if (node.matrix) { for (let i = 0; i < 16; i++) local[i] = node.matrix[i]; }
          else if (node.rotation || node.translation) {
            const q = node.rotation || [0, 0, 0, 1];
            const t = node.translation || [0, 0, 0];
            const s = node.scale || [1, 1, 1];
            quatPosScaleToMat4([q[0], q[1], q[2], q[3]], [t[0], t[1], t[2]], [s[0], s[1], s[2]], local);
          }
          const world = mat4.create();
          mat4.multiply(world, frame.parentWorld, local);
          nodeWorldTransforms.set(frame.idx, world);
          const kids = node.children;
          if (kids) for (let k = kids.length - 1; k >= 0; k--) worldStack.push({ idx: kids[k], parentWorld: world });
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
        if (skeletonRootNodeIdx >= 0) {
          const rootNode = json.nodes[skeletonRootNodeIdx];
          const rootParentIdx = rootNode.parent ?? -1;
          const parentWorld = rootParentIdx >= 0 ? nodeWorldTransforms.get(rootParentIdx) : undefined;
          skinRootWorld = parentWorld ? new Float32Array(parentWorld) : mat4.identity(mat4.create());
        } else {
          skinRootWorld = mat4.identity(mat4.create());
        }
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
          this.skelNodeNames = jointNodes.map((j: number) => json.nodes[j]?.name || '');
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
            if (jiAcc.componentType === 5123) {
              const jiView = new Uint16Array(jiBuf, 0, jiBuf.byteLength / 2);
              const start = jiByteOff / 2;
              const step = jiStride / 2;
              for (let i = 0; i < vCount; i++) {
                const offset = start + i * step;
                jointIdx[i * 4] = jiView[offset];
                jointIdx[i * 4 + 1] = jiView[offset + 1];
                jointIdx[i * 4 + 2] = jiView[offset + 2];
                jointIdx[i * 4 + 3] = jiView[offset + 3];
              }
            } else if (jiAcc.componentType === 5121) {
              const jiView = new Uint8Array(jiBuf, 0, jiBuf.byteLength);
              const start = jiByteOff;
              const step = jiStride;
              for (let i = 0; i < vCount; i++) {
                const offset = start + i * step;
                jointIdx[i * 4] = jiView[offset];
                jointIdx[i * 4 + 1] = jiView[offset + 1];
                jointIdx[i * 4 + 2] = jiView[offset + 2];
                jointIdx[i * 4 + 3] = jiView[offset + 3];
              }
            } else if (jiAcc.componentType === 5125) {
              const jiView = new Uint32Array(jiBuf, 0, jiBuf.byteLength / 4);
              const start = jiByteOff / 4;
              const step = jiStride / 4;
              for (let i = 0; i < vCount; i++) {
                const offset = start + i * step;
                jointIdx[i * 4] = jiView[offset];
                jointIdx[i * 4 + 1] = jiView[offset + 1];
                jointIdx[i * 4 + 2] = jiView[offset + 2];
                jointIdx[i * 4 + 3] = jiView[offset + 3];
              }
            }
            const wgtAcc = json.accessors[prim.attributes.WEIGHTS_0];
            const wgtBufView = json.bufferViews[wgtAcc.bufferView];
            const wgtBuf = buffers[wgtBufView.buffer];
            const wgtByteOff = (wgtBufView.byteOffset || 0) + (wgtAcc.byteOffset || 0);
            const wgtStride = wgtBufView.byteStride || 16;
            jointWgt = new Float32Array(vCount * 4);
            const wgtView = new Float32Array(wgtBuf, 0, wgtBuf.byteLength / 4);
            const wgtStart = wgtByteOff / 4;
            const wgtStep = wgtStride / 4;
            for (let i = 0; i < vCount; i++) {
              const offset = wgtStart + i * wgtStep;
              jointWgt[i * 4] = wgtView[offset];
              jointWgt[i * 4 + 1] = wgtView[offset + 1];
              jointWgt[i * 4 + 2] = wgtView[offset + 2];
              jointWgt[i * 4 + 3] = wgtView[offset + 3];
            }
          }
          for (let i = 0; i < vCount; i++) {
            const pi = (posOffset / 4) + i * posStride;
            let x = posData[pi], y = posData[pi + 1], z = posData[pi + 2];
            if (!isSkinned && !identityTf) {
              let w = tf[3] * x + tf[7] * y + tf[11] * z + tf[15];
              let invW = w !== 0 ? 1 / w : 1;
              let nx = (tf[0] * x + tf[4] * y + tf[8] * z + tf[12]) * invW;
              let ny = (tf[1] * x + tf[5] * y + tf[9] * z + tf[13]) * invW;
              let nz = (tf[2] * x + tf[6] * y + tf[10] * z + tf[14]) * invW;
              x = nx; y = ny; z = nz;
            }
            verts.push(x, y, z);
            if (x < globalMinX) globalMinX = x; if (x > globalMaxX) globalMaxX = x;
            if (y < globalMinY) globalMinY = y; if (y > globalMaxY) globalMaxY = y;
            if (z < globalMinZ) globalMinZ = z; if (z > globalMaxZ) globalMaxZ = z;
            if (normData) {
              const ni = (normOffset / 4) + i * normStride;
              let nx = normData[ni], ny = normData[ni + 1], nz = normData[ni + 2];
              if (!identityTf) {
                let tnx = tf[0] * nx + tf[4] * ny + tf[8] * nz;
                let tny = tf[1] * nx + tf[5] * ny + tf[9] * nz;
                let tnz = tf[2] * nx + tf[6] * ny + tf[10] * nz;
                let len = Math.hypot(tnx, tny, tnz);
                if (len > 0.00001) {
                  nx = tnx / len; ny = tny / len; nz = tnz / len;
                }
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
                if (!texInfo && mat.extensions && mat.extensions.KHR_materials_pbrSpecularGlossiness) {
                  texInfo = mat.extensions.KHR_materials_pbrSpecularGlossiness.diffuseTexture;
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
      const needsYFlip = url.includes("crownVic") || url.includes("maleNPC")
        || url.includes('taxi') || url.includes('hilux') || url.includes("toyota_corsa_b");
      // pizzaMoped raw model faces +X. The 90° Y rotation below (needsY90) plus the
      // shared motorcycle 180° draw-time flip in drawMesh orient it to face +Z
      // (the game's forward axis). A second load-time flip previously lived here,
      // which net-rotated the model 180° so the moped drove backwards — removed.
      const needsY90 = url.includes('pizzaMoped');
      const needsYFlipMoped = false;
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
          if (x < rotMinX) rotMinX = x; if (x > rotMaxX) rotMaxX = x;
          if (y < rotMinY) rotMinY = y; if (y > rotMaxY) rotMaxY = y;
          if (z < rotMinZ) rotMinZ = z; if (z > rotMaxZ) rotMaxZ = z;
        }
      }
      const finalHeight = rotMaxY - rotMinY;
      const targetHeight = url.includes('citylight') ? 5.0 : 2.0;
      const scaleFactor = targetHeight / Math.max(0.001, finalHeight);
      const centerX = (rotMinX + rotMaxX) / 2;
      // Skyboxes must surround the camera. Ordinary models sit on the ground,
      // but using their minimum Y here leaves the camera above the normalized
      // sky cube and makes the authored texture disappear.
      const centerY = url.includes('skybox_skydays_3')
        ? (rotMinY + rotMaxY) / 2
        : rotMinY;
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
        const mesh = this.createMesh(verts, indices, texture, isSkinned);
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
        if (rawName.includes('motorcycle') || rawName.includes('pizzaMoped')) {
          for (const m of meshes) (m as any)._isMotorcycle = true;
        }
      }
      const anims = this.extractGltfAnimations(json, buffers);
      const skel = this.extractGltfSkeleton(json, buffers);
      if (out) {
        out.animations = anims;
        out.skeleton = skel;
      }
      if (meshes.length > 0) {
        if (anims) meshes[0].animations = anims;
        if (skel) meshes[0].skeleton = skel;
      }
      json = null;
      buffers = [];
      raw = new ArrayBuffer;
      binBuffer = null;
      primitiveData = [];
      return meshes.length > 0 ? meshes : null;
    } catch (e) {
      console.error('Failed to load glTF', url, e);
      return null;
    }
  }
  private getJumpRampMesh(): CityMesh | null {
    if (this.jumpRampMesh) return this.jumpRampMesh;
    // A finished launch ramp, sized to the jump trigger box (|along| < 6.5,
    // |lateral| < 3.5 → 13 long × ~7 wide): a solid wedge with a wide asphalt
    // launch apron, painted slope markings, a striped tail face, a raised
    // launch lip, side skirts and corner footings.
    const L = 6.5, W = 3.4, H = 1.5, y0 = 0.12;
    const verts: number[] = [];
    const idx: number[] = [];
    const addFace = (pts: number[][], cr: number, cg: number, cb: number) => {
      const base = verts.length / 7;
      for (const p of pts) verts.push(p[0], p[1], p[2], cr, cg, cb, 1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const addTri = (pts: number[][], cr: number, cg: number, cb: number) => {
      const base = verts.length / 7;
      for (const p of pts) verts.push(p[0], p[1], p[2], cr, cg, cb, 1);
      idx.push(base, base + 1, base + 2);
    };
    const slope = (z: number) => y0 + H * (z + L) / (2 * L);
    const APRON = W + 2.4, APRON_Z = L + 1.2;
    // 1. Wide asphalt apron the approach road widens into.
    addFace([[-APRON, y0, -APRON_Z], [APRON, y0, -APRON_Z], [APRON, y0, APRON_Z], [-APRON, y0, APRON_Z]], 0.24, 0.24, 0.26);
    // 2. Yellow safety ring around the apron.
    const ringY = y0 + 0.02;
    addFace([[-APRON, ringY, -APRON_Z], [APRON, ringY, -APRON_Z], [APRON, ringY, -APRON_Z + 0.35], [-APRON, ringY, -APRON_Z + 0.35]], 0.92, 0.78, 0.2);
    addFace([[-APRON, ringY, APRON_Z - 0.35], [APRON, ringY, APRON_Z - 0.35], [APRON, ringY, APRON_Z], [-APRON, ringY, APRON_Z]], 0.92, 0.78, 0.2);
    addFace([[-APRON, ringY, -APRON_Z], [-APRON + 0.35, ringY, -APRON_Z], [-APRON + 0.35, ringY, APRON_Z], [-APRON, ringY, APRON_Z]], 0.92, 0.78, 0.2);
    addFace([[APRON - 0.35, ringY, -APRON_Z], [APRON, ringY, -APRON_Z], [APRON, ringY, APRON_Z], [APRON - 0.35, ringY, APRON_Z]], 0.92, 0.78, 0.2);
    // 3. The wedge body — slope, underside slab, both painted side skirts.
    addFace([[-W, slope(-L), -L], [W, slope(-L), -L], [W, slope(L), L], [-W, slope(L), L]], 0.92, 0.46, 0.12);
    addFace([[-W, y0, -L], [W, y0, -L], [W, y0, L], [-W, y0, L]], 0.14, 0.14, 0.16);
    addFace([[-W, y0, -L], [-W, slope(-L), -L], [-W, slope(L), L], [-W, y0, L]], 0.5, 0.5, 0.55);
    addFace([[W, y0, -L], [W, slope(L), L], [W, slope(-L), -L], [W, y0, L]], 0.56, 0.56, 0.6);
    // 4. Launch zone painted on the top near the tip + centre guide stripe.
    addFace([[-W, slope(4.4), 4.4], [W, slope(4.4), 4.4], [W, slope(L), L], [-W, slope(L), L]], 0.95, 0.82, 0.2);
    addFace([[-0.4, slope(0.4), 0.4], [0.4, slope(0.4), 0.4], [0.4, slope(4.2), 4.2], [-0.4, slope(4.2), 4.2]], 0.94, 0.94, 0.88);
    // 5. Striped tail face (the launch end) + raised kicker lip.
    for (let s = 0; s < 4; s++) {
      const x0 = -W + (2 * W / 4) * s, x1 = x0 + 2 * W / 4;
      const stripe = s % 2 === 0 ? [0.12, 0.12, 0.13] : [0.95, 0.95, 0.9];
      addFace([[x0, y0, L], [x1, y0, L], [x1, slope(L), L], [x0, slope(L), L]], stripe[0], stripe[1], stripe[2]);
    }
    const lipZ1 = L, lipZ2 = L + 0.3, lipY = slope(L) + 0.14;
    addFace([[-W - 0.5, lipY, lipZ1], [W + 0.5, lipY, lipZ1], [W + 0.5, lipY, lipZ2], [-W - 0.5, lipY, lipZ2]], 0.95, 0.95, 0.9);
    addFace([[-W - 0.5, slope(L), lipZ2], [W + 0.5, slope(L), lipZ2], [W + 0.5, lipY, lipZ2], [-W - 0.5, lipY, lipZ2]], 0.75, 0.75, 0.7);
    addFace([[-W - 0.5, slope(L), lipZ1], [W + 0.5, slope(L), lipZ1], [W + 0.5, lipY, lipZ1], [-W - 0.5, lipY, lipZ1]], 0.2, 0.2, 0.22);
    addTri([[-W - 0.5, lipY, lipZ1], [-W - 0.5, slope(L), lipZ1], [-W - 0.5, lipY, lipZ2]], 0.6, 0.6, 0.63);
    addTri([[W + 0.5, lipY, lipZ1], [W + 0.5, lipY, lipZ2], [W + 0.5, slope(L), lipZ1]], 0.6, 0.6, 0.63);
    // 6. Corner footer blocks anchoring the whole thing to the ground.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const fx = sx * (APRON - 0.9), fz = sz * (APRON_Z - 0.9);
        addFace([[fx - 0.6, y0, fz - 0.6], [fx + 0.6, y0, fz - 0.6], [fx + 0.6, y0, fz + 0.6], [fx - 0.6, y0, fz + 0.6]], 0.58, 0.58, 0.62);
        addFace([[fx - 0.6, y0, fz - 0.6], [fx + 0.6, y0, fz - 0.6], [fx + 0.6, y0 + 0.45, fz - 0.6], [fx - 0.6, y0 + 0.45, fz - 0.6]], 0.5, 0.5, 0.54);
        addFace([[fx - 0.6, y0, fz + 0.6], [fx + 0.6, y0, fz + 0.6], [fx + 0.6, y0 + 0.45, fz + 0.6], [fx - 0.6, y0 + 0.45, fz + 0.6]], 0.5, 0.5, 0.54);
        addFace([[fx - 0.6, y0, fz - 0.6], [fx - 0.6, y0, fz + 0.6], [fx - 0.6, y0 + 0.45, fz + 0.6], [fx - 0.6, y0 + 0.45, fz - 0.6]], 0.62, 0.62, 0.66);
        addFace([[fx + 0.6, y0, fz - 0.6], [fx + 0.6, y0, fz + 0.6], [fx + 0.6, y0 + 0.45, fz + 0.6], [fx + 0.6, y0 + 0.45, fz - 0.6]], 0.62, 0.62, 0.66);
        addTri([[fx - 0.6, y0 + 0.45, fz + 0.6], [fx + 0.6, y0 + 0.45, fz + 0.6], [fx - 0.6, y0 + 0.45, fz - 0.6]], 0.66, 0.66, 0.7);
        addTri([[fx + 0.6, y0 + 0.45, fz + 0.6], [fx - 0.6, y0 + 0.45, fz - 0.6], [fx + 0.6, y0 + 0.45, fz - 0.6]], 0.66, 0.66, 0.7);
      }
    }
    this.jumpRampMesh = this.createMesh(verts, idx);
    return this.jumpRampMesh;
  }
  private addFilledRamp(
    verts: number[], indices: number[],
    x1: number, y1: number, x2: number, y2: number,
    z: number, width: number, bottomY: number,
    r: number, g: number, b: number, a: number, idxOffset: number
  ) {
    const z1 = z - width / 2;
    const z2 = z + width / 2;
    const top = [
      [x1, y1, z1], [x2, y2, z1], [x2, y2, z2], [x1, y1, z2],
    ];
    const bottom = [
      [x1, bottomY, z1], [x2, bottomY, z1], [x2, bottomY, z2], [x1, bottomY, z2],
    ];
    let nextIndex = idxOffset;
    const face = (points: number[][], shade: number, reverse = false) => {
      const base = nextIndex;
      for (const p of points) verts.push(p[0], p[1], p[2], r * shade, g * shade, b * shade, a);
      if (reverse) indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
      else indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      nextIndex += 4;
    };
    face(top, 0.8);
    face(bottom, 0.55, true);
    face([top[0], top[3], bottom[3], bottom[0]], 0.68, true);
    face([top[1], bottom[1], bottom[2], top[2]], 0.68);
    face([top[0], bottom[0], bottom[1], top[1]], 0.72);
    face([top[3], top[2], bottom[2], bottom[3]], 0.72, true);
  }
  private addRamp(
    verts: number[], indices: number[],
    x1: number, y1: number, x2: number, y2: number,
    z: number, width: number, thickness: number,
    r: number, g: number, b: number, a: number, idxOffset: number
  ) {
    const z1 = z - width / 2;
    const z2 = z + width / 2;
    const y1b = y1 - thickness;
    const y2b = y2 - thickness;
    verts.push(
      x1, y1, z1, r * 0.8, g * 0.8, b * 0.8, a,
      x2, y2, z1, r * 0.8, g * 0.8, b * 0.8, a,
      x2, y2, z2, r * 0.8, g * 0.8, b * 0.8, a,
      x1, y1, z2, r * 0.8, g * 0.8, b * 0.8, a
    );
    indices.push(idxOffset, idxOffset + 1, idxOffset + 2, idxOffset, idxOffset + 2, idxOffset + 3);
    verts.push(
      x1, y1b, z1, r * 0.6, g * 0.6, b * 0.6, a,
      x2, y2b, z1, r * 0.6, g * 0.6, b * 0.6, a,
      x2, y2b, z2, r * 0.6, g * 0.6, b * 0.6, a,
      x1, y1b, z2, r * 0.6, g * 0.6, b * 0.6, a
    );
    indices.push(idxOffset + 4, idxOffset + 6, idxOffset + 5, idxOffset + 4, idxOffset + 7, idxOffset + 6);
    verts.push(
      x1, y1, z1, r * 0.7, g * 0.7, b * 0.7, a,
      x2, y2, z1, r * 0.7, g * 0.7, b * 0.7, a,
      x2, y2b, z1, r * 0.7, g * 0.7, b * 0.7, a,
      x1, y1b, z1, r * 0.7, g * 0.7, b * 0.7, a
    );
    indices.push(idxOffset + 8, idxOffset + 11, idxOffset + 10, idxOffset + 8, idxOffset + 10, idxOffset + 9);
    verts.push(
      x1, y1, z2, r * 0.7, g * 0.7, b * 0.7, a,
      x2, y2, z2, r * 0.7, g * 0.7, b * 0.7, a,
      x2, y2b, z2, r * 0.7, g * 0.7, b * 0.7, a,
      x1, y1b, z2, r * 0.7, g * 0.7, b * 0.7, a
    );
    indices.push(idxOffset + 12, idxOffset + 14, idxOffset + 15, idxOffset + 12, idxOffset + 13, idxOffset + 14);
    verts.push(
      x1, y1, z1, r * 0.9, g * 0.9, b * 0.9, a,
      x1, y1, z2, r * 0.9, g * 0.9, b * 0.9, a,
      x1, y1b, z2, r * 0.9, g * 0.9, b * 0.9, a,
      x1, y1b, z1, r * 0.9, g * 0.9, b * 0.9, a
    );
    indices.push(idxOffset + 16, idxOffset + 18, idxOffset + 19, idxOffset + 16, idxOffset + 17, idxOffset + 18);
    verts.push(
      x2, y2, z1, r * 0.9, g * 0.9, b * 0.9, a,
      x2, y2, z2, r * 0.9, g * 0.9, b * 0.9, a,
      x2, y2b, z2, r * 0.9, g * 0.9, b * 0.9, a,
      x2, y2b, z1, r * 0.9, g * 0.9, b * 0.9, a
    );
    indices.push(idxOffset + 20, idxOffset + 23, idxOffset + 22, idxOffset + 20, idxOffset + 22, idxOffset + 21);
  }
  clearChunkCache() {
    this.chunkCache.clear();
  }
  getWeaponPickupMesh(weaponType: number): CityMesh | CityMesh[] {
    if (weaponType === 1 && this.coltMesh) return this.coltMesh;             
    if (weaponType === 2 && this.m4a1Mesh) return this.m4a1Mesh;             
    if (weaponType === 3 && this.shotgunMesh) return this.shotgunMesh;       
    if (weaponType === 4 && this.rocketLauncherMesh) return this.rocketLauncherMesh; 
    if (!this._warnedPickups) this._warnedPickups = new Set();
    if (!this._warnedPickups.has(weaponType)) {
      console.warn('[PICKUP] No GLTF model for weaponType', weaponType,
        '— using box fallback. (colt=' + !!this.coltMesh,
        'm4a1=' + !!this.m4a1Mesh,
        'rocketLauncher=' + !!this.rocketLauncherMesh + ')');
      this._warnedPickups.add(weaponType);
    }
    return this.getPickupMesh();                                             
  }
  private getModelMinY(meshes: CityMesh[]): number {
    let minY = 0;
    for (const m of meshes) {
      if (m.minY !== undefined && m.minY < minY) minY = m.minY;
    }
    return minY;
  }
  private isHungryJacksModel(model: CityMesh | CityMesh[]): boolean {
    const meshes = Array.isArray(model) ? model : [model];
    return meshes.some(m => m.carName?.includes('hungry_jacks_restaurant_low_poly'));
  }
  /** Keep the Hungry Jack's asset at a consistent restaurant scale across placement paths. */
  private hungryJacksScale(
    model: CityMesh | CityMesh[],
    maxFrontage: number,
    maxDepth: number,
    yaw = 0
  ): number {
    const meshes = Array.isArray(model) ? model : [model];
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const m of meshes) {
      const rs = m.renderScale ?? 1;
      if (m.minX !== undefined) minX = Math.min(minX, m.minX * rs);
      if (m.maxX !== undefined) maxX = Math.max(maxX, m.maxX * rs);
      if (m.minY !== undefined) minY = Math.min(minY, m.minY * rs);
      if (m.maxY !== undefined) maxY = Math.max(maxY, m.maxY * rs);
      if (m.minZ !== undefined) minZ = Math.min(minZ, m.minZ * rs);
      if (m.maxZ !== undefined) maxZ = Math.max(maxZ, m.maxZ * rs);
    }
    const width = Math.max(0.01, maxX - minX);
    const height = Math.max(0.01, maxY - minY);
    const depth = Math.max(0.01, maxZ - minZ);
    const quarterTurn = Math.abs(Math.sin(yaw)) > 0.5;
    const frontage = quarterTurn ? depth : width;
    const footprintDepth = quarterTurn ? width : depth;
    const targetHeight = 5.2;
    let scale = targetHeight / height;
    scale = Math.min(scale, maxFrontage / frontage, maxDepth / footprintDepth);
    return Math.max(0.75, Math.min(4, scale));
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
  clearGltfCache() {
    this.gltfCache.clear();
  }
}