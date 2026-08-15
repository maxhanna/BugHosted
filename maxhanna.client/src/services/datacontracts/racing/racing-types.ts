export interface RacingCarUpgrade {
  id: number;
  name: string;
  category: 'engine' | 'tires' | 'suspension' | 'brakes' | 'body';
  level: number;
  maxLevel: number;
  cost: number;
  description: string;
  statBonus: number; // percentage or flat value
}

export interface RacingCarSkin {
  id: number;
  name: string;
  color: string; // hex color
  cost: number;
  owned: boolean;
  finish: 'gloss' | 'metallic' | 'matte' | 'pearl'; // paint finish — drives the 3D specular
}

export interface RacingAppearancePart {
  id: number;
  name: string;
  category: 'spoiler' | 'rims' | 'exhaust' | 'decal' | 'glow' | 'accent';
  cost: number;
  owned: boolean;
  description: string;
}

// Per-car 3D appearance passed to the renderer (drives rim tint, livery
// accent, decal stripes, neon underglow and the paint finish's specular).
export interface RacingCarAppearance {
  id?: string;                  // stable car identity for per-car renderer state (brake heat)
  rimStyle?: number;            // APPEARANCE_PARTS rims id
  spoilerId?: number;           // APPEARANCE_PARTS spoiler id (rear-wing element)
  exhaustId?: number;           // APPEARANCE_PARTS exhaust id (tail tips)
  accent?: [number, number, number];
  decalStyle?: number;          // APPEARANCE_PARTS decal id
  glow?: [number, number, number];
  glowIntensity?: number;       // 0 (subtle) .. 100 (blinding) — scales the neon underglow
  metallic?: number;            // 0 matte .. 1 mirror polish (from skin finish)
  skin?: [number, number, number]; // paint rgb (used for the player's own car in the mirror)
}

// Rim style id -> 3D tint color (applied to the rim barrel + branded ring).
export const RIM_TINTS: Record<number, [number, number, number]> = {
  201: [0.72, 0.72, 0.75],  // Alloy
  202: [0.28, 0.28, 0.31],  // Deep dish
  203: [1.0, 0.78, 0.2],    // Gold forged
  204: [0.88, 0.88, 0.93],  // Chrome polish
  205: [0.66, 0.47, 0.28],  // Bronze BBS
  206: [0.9, 0.9, 0.88],    // White OZ
  207: [0.15, 0.15, 0.17],  // Black steel
  208: [0.22, 0.38, 0.9],   // Blue forged
  209: [0.1, 0.75, 0.35],   // Emerald
  210: [0.55, 0.25, 0.95],  // Violet
  211: [0.9, 0.12, 0.18],   // Crimson
  212: [1.0, 0.5, 0.1],     // Sunset orange
  213: [0.8, 0.5, 0.25],    // Copper
  214: [0.05, 0.7, 0.7],    // Teal
  215: [0.95, 0.9, 0.75],   // White gold
  216: [0.45, 0.48, 0.52],  // Matte grey
};

// Decal id -> stripe/livery color painted onto the engine-cover decal mesh.
export const DECAL_COLORS: Record<number, [number, number, number]> = {
  401: [0.85, 0.1, 0.1],    // racing stripes
  402: [1.0, 0.45, 0.05],   // flame
  403: [0.13, 0.13, 0.15],  // carbon wrap
  404: [0.95, 0.95, 0.95],  // #44 plate
  405: [0.95, 0.95, 0.95],  // checkered
  406: [0.95, 0.8, 0.1],    // lightning
  407: [0.9, 0.9, 0.9],     // skull
  408: [1.0, 0.75, 0.1],    // lion crest
  409: [0.95, 0.95, 0.95],  // #7
  410: [0.95, 0.95, 0.95],  // #27
  411: [0.95, 0.95, 0.95],  // #99
  412: [0.85, 0.85, 0.9],   // sponsor stripes
  413: [0.5, 0.55, 0.35],   // camo wrap
  414: [0.95, 0.75, 0.2],   // cheetah spots
  415: [0.9, 0.15, 0.1],    // rising sun
  416: [0.2, 0.8, 0.6],     // circuit board
  417: [0.95, 0.25, 0.2],   // bullseye
  418: [0.2, 0.35, 0.8],    // union jack
  419: [0.25, 1.0, 0.9],    // cyber grid
  420: [0.95, 0.95, 0.95],  // zen kanji
  421: [0.85, 0.15, 0.1],   // dragon flame
  422: [0.95, 0.8, 0.1],    // bumble bee stripes
  423: [1.0, 0.5, 0.1],     // tiger stripes
  424: [1.0, 0.85, 0.2],    // starburst
  425: [1.0, 0.25, 0.5],    // heart
  426: [0.95, 0.95, 0.95],  // arrow chevrons
  427: [0.2, 0.6, 1.0],     // ocean wave
  428: [0.95, 0.9, 0.85],   // crescent moon
  429: [0.05, 0.05, 0.06],  // zebra stripes (near-black)
  430: [0.38, 0.22, 0.08],  // leopard rosettes (dark brown)
};

// Neon underglow id -> additive glow color.
export const GLOW_COLORS: Record<number, [number, number, number]> = {
  501: [0.2, 0.5, 1.0],
  502: [0.2, 1.0, 0.4],
  503: [0.7, 0.3, 1.0],
  504: [1.0, 0.3, 0.7],
  505: [0.3, 1.0, 1.0],
  506: [1.0, 0.25, 0.1],
  507: [1.0, 0.8, 0.2],
  508: [1.0, 0.45, 0.05],
  509: [0.95, 0.95, 1.0],
  510: [0.5, 0.15, 1.0],
  511: [0.7, 1.0, 0.1],
  512: [0.1, 0.9, 0.7],
  513: [1.0, 0.1, 0.6],
  514: [1.0, 0.9, 0.15],
  515: [0.15, 0.3, 1.0],
  516: [0.05, 0.9, 0.5],
  517: [0.85, 0.05, 0.2],
  518: [0.5, 1.0, 0.7],
  519: [0.85, 0.5, 1.0],
  520: [0.5, 0.8, 1.0],
  521: [0.85, 0.6, 0.25],
  522: [0.3, 0.15, 0.85],
  523: [0.75, 0.8, 0.9],
  // Accent-matched neon (pairs with accent ids 613-620 so livery + glow match).
  524: [0.95, 0.55, 0.22], // copper
  525: [0.05, 0.85, 0.85], // teal
  526: [0.75, 0.1, 0.3],   // burgundy
  527: [0.1, 0.2, 0.75],   // navy
  528: [0.4, 1.0, 0.75],   // mint
  529: [1.0, 0.5, 0.4],    // coral
  530: [1.0, 0.9, 0.65],   // champagne
  531: [0.5, 0.6, 0.7],    // gunmetal
};

// Livery accent id -> stripe/trim color (painted on sidepod stripes + exhaust).
export const ACCENT_COLORS: Record<number, [number, number, number]> = {
  601: [0.9, 0.9, 0.9],    // white
  602: [1.0, 0.8, 0.2],    // gold
  603: [0.75, 0.75, 0.8],  // silver
  604: [0.9, 0.15, 0.1],   // red
  605: [0.2, 0.4, 0.95],   // blue
  606: [0.05, 0.05, 0.07], // black
  607: [0.2, 0.8, 0.35],   // green
  608: [1.0, 0.55, 0.15],  // orange
  609: [0.65, 0.25, 1.0],  // purple
  610: [1.0, 0.35, 0.7],   // pink
  611: [0.2, 0.9, 1.0],    // cyan
  612: [0.7, 1.0, 0.2],    // lime
  613: [0.78, 0.44, 0.18], // copper
  614: [0.08, 0.62, 0.62], // teal
  615: [0.55, 0.05, 0.2],  // burgundy
  616: [0.07, 0.12, 0.42], // navy
  617: [0.35, 0.9, 0.7],   // mint
  618: [1.0, 0.45, 0.35],  // coral
  619: [0.95, 0.85, 0.6],  // champagne
  620: [0.35, 0.42, 0.5],  // gunmetal
};

// Paint finish -> specular/metallic factor for the 3D shader.
export const SKIN_FINISH_FACTOR: Record<string, number> = {
  matte: 0,
  gloss: 0.45,
  pearl: 0.8,
  metallic: 1.0,
};

export interface RacingPlayerCar {
  userId: number;
  playerName: string;
  upgrades: RacingCarUpgrade[];
  skinId: number;
  spoilerId: number;
  rimId: number;
  exhaustId: number;
  decalId: number;
  glowId: number;
  accentId: number;
  glowIntensity: number; // 0 (subtle) .. 100 (blinding) neon underglow strength
  totalRaces: number;
  wins: number;
  money: number;
  bestLap: number; // ms — overall best across all tracks (legacy/display)
  bestLapsByTrack?: Record<number, number>; // trackId -> best lap ms
  totalEarnings: number;
}

export interface RaceResult {
  position: number;
  playerId: number;
  playerName: string;
  lapTime: number; // ms
  totalTime: number;
  moneyEarned: number;
  isBot: boolean;
  botDifficulty?: string;
  trackId?: number;
}

export interface RaceState {
  raceId: number;
  trackId: number;
  trackName: string;
  laps: number;
  status: 'waiting' | 'countdown' | 'racing' | 'finished';
  racers: RaceRacerState[];
  currentLap: number;
  totalLaps: number;
  countdown: number;
}

export interface RaceRacerState {
  playerId: number;
  playerName: string;
  position: number;
  currentLap: number;
  distance: number;
  speed: number;
  isBot: boolean;
  colorR: number;
  colorG: number;
  colorB: number;
}

export interface TrackDefinition {
  id: number;
  name: string;
  difficulty: 'easy' | 'medium' | 'hard';
  laps: number;
  length: number; // meters
  description: string;
  entryFee: number;
  prizePool: number;
  bestTime: number; // ms, 0 if no record
}

export interface RacingBotConfig {
  difficulty: 'easy' | 'medium' | 'hard';
  speedBase: number;
  speedVariance: number;
  cornerSkill: number; // 0-1, higher = better cornering
  aggression: number; // 0-1
  mistakeChance: number; // 0-1
}

export const BOT_CONFIGS: Record<string, RacingBotConfig> = {
  easy: { difficulty: 'easy', speedBase: 30, speedVariance: 8, cornerSkill: 0.3, aggression: 0.1, mistakeChance: 0.3 },
  medium: { difficulty: 'medium', speedBase: 45, speedVariance: 6, cornerSkill: 0.55, aggression: 0.35, mistakeChance: 0.15 },
  hard: { difficulty: 'hard', speedBase: 60, speedVariance: 4, cornerSkill: 0.8, aggression: 0.6, mistakeChance: 0.05 },
};

export const UPGRADE_DEFS: RacingCarUpgrade[] = [
  { id: 1, name: 'Stage 1 Engine', category: 'engine', level: 1, maxLevel: 5, cost: 250, description: '+5% Top Speed', statBonus: 5 },
  { id: 2, name: 'Stage 2 Engine', category: 'engine', level: 2, maxLevel: 5, cost: 750, description: '+10% Top Speed', statBonus: 10 },
  { id: 3, name: 'Stage 3 Engine', category: 'engine', level: 3, maxLevel: 5, cost: 2000, description: '+15% Top Speed', statBonus: 15 },
  { id: 4, name: 'Stage 4 Engine', category: 'engine', level: 4, maxLevel: 5, cost: 6000, description: '+20% Top Speed', statBonus: 20 },
  { id: 5, name: 'Stage 5 Engine', category: 'engine', level: 5, maxLevel: 5, cost: 18000, description: '+25% Top Speed', statBonus: 25 },
  // Tire grip bonuses are deliberately half of what they used to be — the old
  // +30% Hyper Tires pushed effective grip (0.85 base) to 1.15, which made a
  // fully-upgraded car snap across the track from a small steering input.
  { id: 6, name: 'Sport Tires', category: 'tires', level: 1, maxLevel: 4, cost: 300, description: '+2.5% Grip', statBonus: 2.5 },
  { id: 7, name: 'Racing Tires', category: 'tires', level: 2, maxLevel: 4, cost: 800, description: '+6% Grip', statBonus: 6 },
  { id: 8, name: 'Slick Tires', category: 'tires', level: 3, maxLevel: 4, cost: 2000, description: '+10% Grip', statBonus: 10 },
  { id: 9, name: 'Hyper Tires', category: 'tires', level: 4, maxLevel: 4, cost: 6000, description: '+15% Grip', statBonus: 15 },
  // Suspension cornering bonuses are halved like the tire grip curve above, so
  // handling upgrades stay proportional to the new tire payoff.
  { id: 10, name: 'Sport Suspension', category: 'suspension', level: 1, maxLevel: 3, cost: 400, description: '+2.5% Cornering', statBonus: 2.5 },
  { id: 11, name: 'Race Suspension', category: 'suspension', level: 2, maxLevel: 3, cost: 1200, description: '+6% Cornering', statBonus: 6 },
  { id: 12, name: 'Pro Suspension', category: 'suspension', level: 3, maxLevel: 3, cost: 3500, description: '+10% Cornering', statBonus: 10 },
  { id: 13, name: 'Stage 1 Brakes', category: 'brakes', level: 1, maxLevel: 3, cost: 250, description: '+10% Braking', statBonus: 10 },
  { id: 14, name: 'Stage 2 Brakes', category: 'brakes', level: 2, maxLevel: 3, cost: 700, description: '+20% Braking', statBonus: 20 },
  { id: 15, name: 'Stage 3 Brakes', category: 'brakes', level: 3, maxLevel: 3, cost: 1800, description: '+30% Braking', statBonus: 30 },
  { id: 16, name: 'Carbon Body', category: 'body', level: 1, maxLevel: 2, cost: 1000, description: '-5% Weight', statBonus: 5 },
  { id: 17, name: 'Aero Body', category: 'body', level: 2, maxLevel: 2, cost: 3000, description: '-12% Weight', statBonus: 12 },
];

export const TRACKS: TrackDefinition[] = [
  { id: 1, name: 'Sunset Circuit', difficulty: 'easy', laps: 3, length: 1200, description: 'A simple coastal circuit with wide corners', entryFee: 0, prizePool: 300, bestTime: 0 },
  { id: 2, name: 'Mountain Pass', difficulty: 'medium', laps: 3, length: 1800, description: 'Twisty mountain roads with elevation changes', entryFee: 500, prizePool: 1500, bestTime: 0 },
  { id: 3, name: 'Downtown GP', difficulty: 'hard', laps: 5, length: 2500, description: 'Technical city circuit with tight corners', entryFee: 2000, prizePool: 8000, bestTime: 0 },
  { id: 4, name: 'Alpine Snow', difficulty: 'hard', laps: 4, length: 2200, description: 'High-altitude snow circuit through pine forests', entryFee: 1500, prizePool: 6000, bestTime: 0 },
  { id: 5, name: 'Marrakech GP', difficulty: 'medium', laps: 4, length: 2000, description: 'Desert street circuit winding through ancient medinas', entryFee: 1000, prizePool: 4000, bestTime: 0 },
  { id: 6, name: 'Monte Carlo', difficulty: 'hard', laps: 5, length: 2600, description: 'Iconic Monaco street circuit with tight hairpins and tunnel', entryFee: 3000, prizePool: 12000, bestTime: 0 },
  { id: 7, name: 'Circuit Montreal', difficulty: 'medium', laps: 4, length: 2100, description: 'Riverside circuit with fast chicanes and island park', entryFee: 1500, prizePool: 5000, bestTime: 0 },
  { id: 8, name: 'Monza', difficulty: 'hard', laps: 5, length: 2800, description: 'Temple of speed — long straights, chicanes, and curva grande', entryFee: 4000, prizePool: 15000, bestTime: 0 },
  { id: 9, name: 'Monte Carlo — Night', difficulty: 'hard', laps: 5, length: 2600, description: 'Monaco after dark — moonlit bay, glowing canyon towers and streetlit straights', entryFee: 3000, prizePool: 14000, bestTime: 0 },
  { id: 10, name: 'Japan Pass', difficulty: 'hard', laps: 4, length: 2200, description: 'Initial D style downhill touge — cedar forests, hairpins and a misty valley drop', entryFee: 2500, prizePool: 10000, bestTime: 0 },
];

export const CAR_SKINS: RacingCarSkin[] = [
  // Starter gloss paints
  { id: 1, name: 'Classic Red', color: '#cc0000', cost: 0, owned: true, finish: 'gloss' },
  { id: 2, name: 'Midnight Blue', color: '#1a237e', cost: 500, owned: false, finish: 'gloss' },
  { id: 3, name: 'Emerald Green', color: '#1b5e20', cost: 500, owned: false, finish: 'gloss' },
  // Metallic flake paints
  { id: 4, name: 'Gold Rush', color: '#ffd600', cost: 1500, owned: false, finish: 'metallic' },
  { id: 5, name: 'Cyber Purple', color: '#7b1fa2', cost: 2000, owned: false, finish: 'metallic' },
  { id: 6, name: 'Blizzard White', color: '#ffffff', cost: 3000, owned: false, finish: 'pearl' },
  { id: 7, name: 'Carbon Black', color: '#212121', cost: 5000, owned: false, finish: 'matte' },
  { id: 8, name: 'Chrome Silver', color: '#9e9e9e', cost: 8000, owned: false, finish: 'metallic' },
  // ── New: 16 more paints ──
  { id: 9, name: 'Ferrari Rosso', color: '#e10600', cost: 2500, owned: false, finish: 'gloss' },
  { id: 10, name: 'Gulf Teal', color: '#00a99d', cost: 2500, owned: false, finish: 'gloss' },
  { id: 11, name: 'Sakura Pink', color: '#ff5fa2', cost: 3500, owned: false, finish: 'pearl' },
  { id: 12, name: 'British Racing Green', color: '#004225', cost: 3500, owned: false, finish: 'gloss' },
  { id: 13, name: 'Lava Orange', color: '#ff6a00', cost: 3500, owned: false, finish: 'metallic' },
  { id: 14, name: 'Arctic Ice Blue', color: '#8fd8ff', cost: 4500, owned: false, finish: 'pearl' },
  { id: 15, name: 'Violet Nebula', color: '#5e35b1', cost: 4500, owned: false, finish: 'metallic' },
  { id: 16, name: 'Matte Military', color: '#4b5320', cost: 5000, owned: false, finish: 'matte' },
  { id: 17, name: 'Bronze Age', color: '#8a5a2b', cost: 5500, owned: false, finish: 'metallic' },
  { id: 18, name: 'Rose Gold', color: '#e8b4a0', cost: 6000, owned: false, finish: 'metallic' },
  { id: 19, name: 'Neon Lime', color: '#9dff00', cost: 6500, owned: false, finish: 'gloss' },
  { id: 20, name: 'Midnight Purple', color: '#2d1b4e', cost: 7000, owned: false, finish: 'matte' },
  { id: 21, name: 'Candy Apple', color: '#b3000b', cost: 7500, owned: false, finish: 'gloss' },
  { id: 22, name: 'Titanium Grey', color: '#6b7280', cost: 8000, owned: false, finish: 'metallic' },
  { id: 23, name: 'Star Sapphire', color: '#0b2e59', cost: 9000, owned: false, finish: 'pearl' },
  { id: 24, name: 'Obsidian Chrome', color: '#111114', cost: 12000, owned: false, finish: 'metallic' },
  // ── New: 8 more paints ──
  { id: 25, name: 'Speed Yellow', color: '#ffe800', cost: 3000, owned: false, finish: 'gloss' },
  { id: 26, name: 'Lime Burst', color: '#aaff00', cost: 4000, owned: false, finish: 'gloss' },
  { id: 27, name: 'Deep Teal', color: '#00695c', cost: 4000, owned: false, finish: 'gloss' },
  { id: 28, name: 'Racing Orange', color: '#ff6d00', cost: 5000, owned: false, finish: 'metallic' },
  { id: 29, name: 'Sky Pearl', color: '#64b5f6', cost: 5500, owned: false, finish: 'pearl' },
  { id: 30, name: 'Burgundy Wine', color: '#880e4f', cost: 6000, owned: false, finish: 'gloss' },
  { id: 31, name: 'Gunmetal Stealth', color: '#37474f', cost: 7500, owned: false, finish: 'matte' },
  { id: 32, name: 'Spectral Violet', color: '#6200ea', cost: 10000, owned: false, finish: 'metallic' },
  // ── New: 12 more paints ──
  { id: 33, name: 'Titanium Silver', color: '#c0c0c8', cost: 8500, owned: false, finish: 'metallic' },
  { id: 34, name: 'Mint Frost', color: '#98ff98', cost: 6500, owned: false, finish: 'gloss' },
  { id: 35, name: 'Amethyst Pearl', color: '#9b59b6', cost: 9500, owned: false, finish: 'pearl' },
  { id: 36, name: 'Amber Glow', color: '#ffbf00', cost: 6000, owned: false, finish: 'gloss' },
  { id: 37, name: 'Black Pearl', color: '#0d0d12', cost: 11000, owned: false, finish: 'pearl' },
  { id: 38, name: 'Coral Reef', color: '#ff7f50', cost: 7000, owned: false, finish: 'gloss' },
  { id: 39, name: 'Racing Grey', color: '#a8a8ad', cost: 5500, owned: false, finish: 'matte' },
  { id: 40, name: 'Electric Blue', color: '#00bfff', cost: 8000, owned: false, finish: 'metallic' },
  { id: 41, name: 'Champagne', color: '#f7e7ce', cost: 9000, owned: false, finish: 'pearl' },
  { id: 42, name: 'Inferno Orange', color: '#ff4500', cost: 7500, owned: false, finish: 'metallic' },
  { id: 43, name: 'Frozen White', color: '#f0f4f8', cost: 6500, owned: false, finish: 'matte' },
  { id: 44, name: 'Deep Forest', color: '#0b3d2e', cost: 8500, owned: false, finish: 'gloss' },
];

// Downforce bonus (%) granted by each spoiler variant — roughly ordered by the
// wing's height/element count (taller, stacked wings press harder). Folded into
// the cornering factor alongside suspension, so buying aero visibly improves
// handling. 0 = no spoiler equipped (stock wing adds nothing).
export const SPOILER_DOWNFORCE: Record<number, number> = {
  101: 8,   // Carbon Wing — single tall element
  102: 10,  // Dual Wing — two stacked elements
  103: 4,   // DRS Wing — low-downforce split plane
  104: 7,   // Gurney Flap — trailing lip
  105: 12,  // Whale Tail — long swept chord
  106: 15,  // Bi-Plane — double deck
  107: 18,  // Aero DRS+ — triple stack, top tier
};

// Top-speed drag penalty (%) per spoiler — the gameplay cost of big aero.
// Whale tail and bi-plane cap top speed noticeably, the active DRS+ a little
// (its DRS opens at speed), and the DRS wing none at all (low drag is its
// whole point). Multiplied into getMaxSpeed so the HUD reflects it.
export const SPOILER_DRAG: Record<number, number> = {
  101: 0,   // Carbon Wing — modest single element
  102: 1,   // Dual Wing — stacked elements catch a little air
  103: 0,   // DRS Wing — low drag by design
  104: 0,   // Gurney Flap — trailing lip, no frontal area
  105: 4,   // Whale Tail — big swept plank = real drag
  106: 5,   // Bi-Plane — double deck = most drag
  107: 2.5, // Aero DRS+ — active aero opens up at speed
};

export const APPEARANCE_PARTS: RacingAppearancePart[] = [
  // Spoilers
  { id: 101, name: 'Carbon Wing', category: 'spoiler', cost: 2000, owned: false, description: 'Aggressive carbon-fiber rear wing' },
  { id: 102, name: 'Dual Wing', category: 'spoiler', cost: 5000, owned: false, description: 'Pro-level dual element aero' },
  { id: 103, name: 'DRS Wing', category: 'spoiler', cost: 10000, owned: false, description: 'Drag Reduction System wing' },
  { id: 104, name: 'Gurney Flap', category: 'spoiler', cost: 3500, owned: false, description: 'Extra downforce lip on the main plane' },
  { id: 105, name: 'Whale Tail', category: 'spoiler', cost: 8000, owned: false, description: 'Classic swept-back whale-tail wing' },
  { id: 106, name: 'Bi-Plane', category: 'spoiler', cost: 15000, owned: false, description: 'Double-deck high downforce wing' },
  { id: 107, name: 'Aero DRS+', category: 'spoiler', cost: 25000, owned: false, description: 'Next-gen active aero package' },
  // Rims
  { id: 201, name: 'Alloy Rims', category: 'rims', cost: 800, owned: false, description: 'Lightweight silver alloy wheels' },
  { id: 202, name: 'Deep Dish', category: 'rims', cost: 2000, owned: false, description: 'Deep dish black racing wheels' },
  { id: 203, name: 'Gold Forged', category: 'rims', cost: 5000, owned: false, description: 'Forged gold racing rims' },
  { id: 204, name: 'Chrome Polish', category: 'rims', cost: 4000, owned: false, description: 'Mirror-polished chrome wheels' },
  { id: 205, name: 'Bronze BBS', category: 'rims', cost: 6000, owned: false, description: 'Classic bronze BBS motorsport wheels' },
  { id: 206, name: 'White OZ', category: 'rims', cost: 4500, owned: false, description: 'White-painted rally-style wheels' },
  { id: 207, name: 'Black Steel', category: 'rims', cost: 2500, owned: false, description: 'Sleek matte black steelies' },
  { id: 208, name: 'Blue Forged', category: 'rims', cost: 7000, owned: false, description: 'Anodized blue forged wheels' },
  { id: 209, name: 'Emerald Forged', category: 'rims', cost: 4500, owned: false, description: 'Anodized emerald green wheels' },
  { id: 210, name: 'Violet Forged', category: 'rims', cost: 5500, owned: false, description: 'Deep violet anodized wheels' },
  { id: 211, name: 'Crimson Forged', category: 'rims', cost: 6000, owned: false, description: 'Hot crimson race wheels' },
  { id: 212, name: 'Sunset Forged', category: 'rims', cost: 6500, owned: false, description: 'Blazing sunset orange wheels' },
  { id: 213, name: 'Copper Forged', category: 'rims', cost: 7000, owned: false, description: 'Warm copper forged wheels — pairs with Copper Accent' },
  { id: 214, name: 'Teal Forged', category: 'rims', cost: 7200, owned: false, description: 'Deep teal anodized wheels — pairs with Teal Accent' },
  { id: 215, name: 'White Gold', category: 'rims', cost: 7500, owned: false, description: 'Elegant white-gold race wheels — pairs with Champagne Accent' },
  { id: 216, name: 'Matte Grey', category: 'rims', cost: 5500, owned: false, description: 'Flat gunmetal-grey wheels — pairs with Gunmetal Accent' },
  // Exhaust
  { id: 301, name: 'Sport Exhaust', category: 'exhaust', cost: 600, owned: false, description: 'Chrome-tipped sport exhaust' },
  { id: 302, name: 'Titanium Tips', category: 'exhaust', cost: 2500, owned: false, description: 'Titanium blue-burn tips' },
  { id: 303, name: 'Twin Tips', category: 'exhaust', cost: 1500, owned: false, description: 'Dual chrome tailpipes' },
  { id: 304, name: 'Quad Exhaust', category: 'exhaust', cost: 4000, owned: false, description: 'Quad-barrel monster exhaust' },
  { id: 305, name: 'Carbon Tips', category: 'exhaust', cost: 5500, owned: false, description: 'Forged carbon tailpipes' },
  // Decals
  { id: 401, name: 'Racing Stripes', category: 'decal', cost: 400, owned: false, description: 'Classic twin racing stripes' },
  { id: 402, name: 'Flame Decal', category: 'decal', cost: 800, owned: false, description: 'Hot rod flame graphics' },
  { id: 403, name: 'Carbon Wrap', category: 'decal', cost: 3000, owned: false, description: 'Full carbon-fiber wrap' },
  { id: 404, name: '#44 Number', category: 'decal', cost: 500, owned: false, description: 'Race number 44 plate' },
  { id: 405, name: 'Checkered Flag', category: 'decal', cost: 700, owned: false, description: 'Finish-line checkered livery' },
  { id: 406, name: 'Lightning Bolt', category: 'decal', cost: 900, owned: false, description: 'Electric yellow bolt graphics' },
  { id: 407, name: 'Skull Racer', category: 'decal', cost: 1500, owned: false, description: 'Skull-and-crossbones nose art' },
  { id: 408, name: 'Lion Crest', category: 'decal', cost: 2000, owned: false, description: 'Golden lion emblem' },
  { id: 409, name: '#7 Number', category: 'decal', cost: 500, owned: false, description: 'Race number 7 plate' },
  { id: 410, name: '#27 Number', category: 'decal', cost: 600, owned: false, description: 'Race number 27 plate' },
  { id: 411, name: '#99 Number', category: 'decal', cost: 700, owned: false, description: 'Race number 99 plate' },
  { id: 412, name: 'Sponsor Stripes', category: 'decal', cost: 1200, owned: false, description: 'Pro sponsor livery bands' },
  { id: 413, name: 'Camo Wrap', category: 'decal', cost: 3500, owned: false, description: 'Military jungle camo wrap' },
  { id: 414, name: 'Cheetah Spots', category: 'decal', cost: 2500, owned: false, description: 'Golden cheetah spot graphics' },
  { id: 415, name: 'Rising Sun', category: 'decal', cost: 1800, owned: false, description: 'Red rising-sun disc emblem' },
  { id: 416, name: 'Circuit Board', category: 'decal', cost: 3000, owned: false, description: 'Glowing PCB trace graphics' },
  { id: 417, name: 'Bullseye', category: 'decal', cost: 1600, owned: false, description: 'Concentric target rings' },
  { id: 418, name: 'Union Jack', category: 'decal', cost: 2200, owned: false, description: 'Crossed-flag livery stripes' },
  { id: 419, name: 'Cyber Grid', category: 'decal', cost: 3800, owned: false, description: 'Tron-style glowing grid' },
  { id: 420, name: 'Zen Kanji', category: 'decal', cost: 5000, owned: false, description: 'White kanji calligraphy emblem' },
  { id: 421, name: 'Dragon Flame', category: 'decal', cost: 4200, owned: false, description: 'Fiery red dragon swoosh' },
  { id: 422, name: 'Bumble Bee', category: 'decal', cost: 1900, owned: false, description: 'Black & gold bee stripes' },
  { id: 423, name: 'Tiger Fury', category: 'decal', cost: 2800, owned: false, description: 'Orange tiger stripe livery' },
  { id: 424, name: 'Starburst', category: 'decal', cost: 2100, owned: false, description: 'Golden star burst burst' },
  { id: 425, name: 'Heartbreaker', category: 'decal', cost: 1700, owned: false, description: 'Hot pink heart emblem' },
  { id: 426, name: 'Arrow Chevrons', category: 'decal', cost: 2400, owned: false, description: 'Speed chevron arrows' },
  { id: 427, name: 'Ocean Wave', category: 'decal', cost: 2600, owned: false, description: 'Blue wave crest graphic' },
  { id: 428, name: 'Crescent Moon', category: 'decal', cost: 3600, owned: false, description: 'Night-sky crescent emblem' },
  { id: 429, name: 'Zebra Wrap', category: 'decal', cost: 3200, owned: false, description: 'Black zebra stripe wrap' },
  { id: 430, name: 'Leopard Print', category: 'decal', cost: 3400, owned: false, description: 'Jungle leopard rosette wrap' },
  // Glow (neon underglow)
  { id: 501, name: 'Neon Blue', category: 'glow', cost: 1500, owned: false, description: 'Electric blue underglow' },
  { id: 502, name: 'Neon Green', category: 'glow', cost: 1500, owned: false, description: 'Alien green underglow' },
  { id: 503, name: 'Neon Purple', category: 'glow', cost: 1500, owned: false, description: 'Deep violet underglow' },
  { id: 504, name: 'Neon Pink', category: 'glow', cost: 2000, owned: false, description: 'Hot pink underglow' },
  { id: 505, name: 'Neon Cyan', category: 'glow', cost: 2000, owned: false, description: 'Cyan ice underglow' },
  { id: 506, name: 'Lava Red', category: 'glow', cost: 2000, owned: false, description: 'Molten red underglow' },
  { id: 507, name: 'Gold Chrome', category: 'glow', cost: 3500, owned: false, description: 'Golden underglow' },
  { id: 508, name: 'Neon Orange', category: 'glow', cost: 2500, owned: false, description: 'Blazing orange underglow' },
  { id: 509, name: 'White Ice', category: 'glow', cost: 3000, owned: false, description: 'Crisp cold-white underglow' },
  { id: 510, name: 'Ultraviolet', category: 'glow', cost: 3000, owned: false, description: 'Deep UV violet underglow' },
  { id: 511, name: 'Neon Lime', category: 'glow', cost: 2500, owned: false, description: 'Electric lime underglow' },
  { id: 512, name: 'Aqua Teal', category: 'glow', cost: 3000, owned: false, description: 'Tropical aqua underglow' },
  { id: 513, name: 'Hot Magenta', category: 'glow', cost: 3500, owned: false, description: 'Vivid magenta underglow' },
  { id: 514, name: 'Sun Yellow', category: 'glow', cost: 3000, owned: false, description: 'Solar yellow underglow' },
  { id: 515, name: 'Cobalt Blue', category: 'glow', cost: 3500, owned: false, description: 'Deep cobalt underglow' },
  { id: 516, name: 'Emerald', category: 'glow', cost: 3500, owned: false, description: 'Vivid emerald underglow' },
  { id: 517, name: 'Crimson', category: 'glow', cost: 3000, owned: false, description: 'Dark crimson underglow' },
  { id: 518, name: 'Mint Frost', category: 'glow', cost: 2800, owned: false, description: 'Soft mint underglow' },
  { id: 519, name: 'Orchid', category: 'glow', cost: 3800, owned: false, description: 'Bright orchid underglow' },
  { id: 520, name: 'Ice Blue', category: 'glow', cost: 3200, owned: false, description: 'Pale ice-blue underglow' },
  { id: 521, name: 'Bronze', category: 'glow', cost: 3400, owned: false, description: 'Warm bronze underglow' },
  { id: 522, name: 'Indigo', category: 'glow', cost: 3600, owned: false, description: 'Deep indigo underglow' },
  { id: 523, name: 'Slate Silver', category: 'glow', cost: 3000, owned: false, description: 'Cool slate-silver underglow' },
  { id: 524, name: 'Copper Neon', category: 'glow', cost: 3600, owned: false, description: 'Warm copper underglow — pairs with Copper Accent' },
  { id: 525, name: 'Teal Neon', category: 'glow', cost: 3600, owned: false, description: 'Deep teal underglow — pairs with Teal Accent' },
  { id: 526, name: 'Burgundy Neon', category: 'glow', cost: 3600, owned: false, description: 'Rich burgundy underglow — pairs with Burgundy Accent' },
  { id: 527, name: 'Navy Neon', category: 'glow', cost: 3600, owned: false, description: 'Dark navy underglow — pairs with Navy Accent' },
  { id: 528, name: 'Mint Neon', category: 'glow', cost: 3600, owned: false, description: 'Fresh mint underglow — pairs with Mint Accent' },
  { id: 529, name: 'Coral Neon', category: 'glow', cost: 3600, owned: false, description: 'Vivid coral underglow — pairs with Coral Accent' },
  { id: 530, name: 'Champagne Neon', category: 'glow', cost: 3600, owned: false, description: 'Elegant champagne underglow — pairs with Champagne Accent' },
  { id: 531, name: 'Gunmetal Neon', category: 'glow', cost: 3600, owned: false, description: 'Steel gunmetal underglow — pairs with Gunmetal Accent' },
  // Accent (livery stripe + trim color)
  { id: 601, name: 'White Accent', category: 'accent', cost: 300, owned: false, description: 'White livery stripe & trim' },
  { id: 602, name: 'Gold Accent', category: 'accent', cost: 1000, owned: false, description: 'Gold livery stripe & trim' },
  { id: 603, name: 'Silver Accent', category: 'accent', cost: 800, owned: false, description: 'Silver livery stripe & trim' },
  { id: 604, name: 'Red Accent', category: 'accent', cost: 300, owned: false, description: 'Red livery stripe & trim' },
  { id: 605, name: 'Blue Accent', category: 'accent', cost: 500, owned: false, description: 'Blue livery stripe & trim' },
  { id: 606, name: 'Black Accent', category: 'accent', cost: 300, owned: false, description: 'Black livery stripe & trim' },
  { id: 607, name: 'Green Accent', category: 'accent', cost: 600, owned: false, description: 'Green livery stripe & trim' },
  { id: 608, name: 'Orange Accent', category: 'accent', cost: 800, owned: false, description: 'Orange livery stripe & trim' },
  { id: 609, name: 'Purple Accent', category: 'accent', cost: 900, owned: false, description: 'Purple livery stripe & trim' },
  { id: 610, name: 'Pink Accent', category: 'accent', cost: 1000, owned: false, description: 'Hot pink livery stripe & trim' },
  { id: 611, name: 'Cyan Accent', category: 'accent', cost: 1100, owned: false, description: 'Cyan livery stripe & trim' },
  { id: 612, name: 'Lime Accent', category: 'accent', cost: 1200, owned: false, description: 'Acid lime livery stripe & trim' },
  { id: 613, name: 'Copper Accent', category: 'accent', cost: 1400, owned: false, description: 'Warm copper livery stripe & trim' },
  { id: 614, name: 'Teal Accent', category: 'accent', cost: 1500, owned: false, description: 'Deep teal livery stripe & trim' },
  { id: 615, name: 'Burgundy Accent', category: 'accent', cost: 1300, owned: false, description: 'Rich burgundy livery stripe & trim' },
  { id: 616, name: 'Navy Accent', category: 'accent', cost: 1400, owned: false, description: 'Dark navy livery stripe & trim' },
  { id: 617, name: 'Mint Accent', category: 'accent', cost: 1600, owned: false, description: 'Fresh mint livery stripe & trim' },
  { id: 618, name: 'Coral Accent', category: 'accent', cost: 1700, owned: false, description: 'Vivid coral livery stripe & trim' },
  { id: 619, name: 'Champagne Accent', category: 'accent', cost: 1800, owned: false, description: 'Elegant champagne livery stripe & trim' },
  { id: 620, name: 'Gunmetal Accent', category: 'accent', cost: 1900, owned: false, description: 'Steel gunmetal livery stripe & trim' },
];
