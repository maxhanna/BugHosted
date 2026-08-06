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
};

// Livery accent id -> stripe/trim color (painted on sidepod stripes + exhaust).
export const ACCENT_COLORS: Record<number, [number, number, number]> = {
  601: [0.9, 0.9, 0.9],    // white
  602: [1.0, 0.8, 0.2],    // gold
  603: [0.75, 0.75, 0.8],  // silver
  604: [0.9, 0.15, 0.1],   // red
  605: [0.2, 0.4, 0.95],   // blue
  606: [0.05, 0.05, 0.07], // black
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
  { id: 1, name: 'Stage 1 Engine', category: 'engine', level: 1, maxLevel: 5, cost: 500, description: '+10% Top Speed', statBonus: 10 },
  { id: 2, name: 'Stage 2 Engine', category: 'engine', level: 2, maxLevel: 5, cost: 1500, description: '+20% Top Speed', statBonus: 20 },
  { id: 3, name: 'Stage 3 Engine', category: 'engine', level: 3, maxLevel: 5, cost: 4000, description: '+30% Top Speed', statBonus: 30 },
  { id: 4, name: 'Stage 4 Engine', category: 'engine', level: 4, maxLevel: 5, cost: 10000, description: '+40% Top Speed', statBonus: 40 },
  { id: 5, name: 'Stage 5 Engine', category: 'engine', level: 5, maxLevel: 5, cost: 25000, description: '+50% Top Speed', statBonus: 50 },
  { id: 6, name: 'Sport Tires', category: 'tires', level: 1, maxLevel: 4, cost: 300, description: '+5% Grip', statBonus: 5 },
  { id: 7, name: 'Racing Tires', category: 'tires', level: 2, maxLevel: 4, cost: 800, description: '+12% Grip', statBonus: 12 },
  { id: 8, name: 'Slick Tires', category: 'tires', level: 3, maxLevel: 4, cost: 2000, description: '+20% Grip', statBonus: 20 },
  { id: 9, name: 'Hyper Tires', category: 'tires', level: 4, maxLevel: 4, cost: 6000, description: '+30% Grip', statBonus: 30 },
  { id: 10, name: 'Sport Suspension', category: 'suspension', level: 1, maxLevel: 3, cost: 400, description: '+5% Cornering', statBonus: 5 },
  { id: 11, name: 'Race Suspension', category: 'suspension', level: 2, maxLevel: 3, cost: 1200, description: '+12% Cornering', statBonus: 12 },
  { id: 12, name: 'Pro Suspension', category: 'suspension', level: 3, maxLevel: 3, cost: 3500, description: '+20% Cornering', statBonus: 20 },
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
];

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
  // Glow (neon underglow)
  { id: 501, name: 'Neon Blue', category: 'glow', cost: 1500, owned: false, description: 'Electric blue underglow' },
  { id: 502, name: 'Neon Green', category: 'glow', cost: 1500, owned: false, description: 'Alien green underglow' },
  { id: 503, name: 'Neon Purple', category: 'glow', cost: 1500, owned: false, description: 'Deep violet underglow' },
  { id: 504, name: 'Neon Pink', category: 'glow', cost: 2000, owned: false, description: 'Hot pink underglow' },
  { id: 505, name: 'Neon Cyan', category: 'glow', cost: 2000, owned: false, description: 'Cyan ice underglow' },
  { id: 506, name: 'Lava Red', category: 'glow', cost: 2000, owned: false, description: 'Molten red underglow' },
  { id: 507, name: 'Gold Chrome', category: 'glow', cost: 3500, owned: false, description: 'Golden underglow' },
  // Accent (livery stripe + trim color)
  { id: 601, name: 'White Accent', category: 'accent', cost: 300, owned: false, description: 'White livery stripe & trim' },
  { id: 602, name: 'Gold Accent', category: 'accent', cost: 1000, owned: false, description: 'Gold livery stripe & trim' },
  { id: 603, name: 'Silver Accent', category: 'accent', cost: 800, owned: false, description: 'Silver livery stripe & trim' },
  { id: 604, name: 'Red Accent', category: 'accent', cost: 300, owned: false, description: 'Red livery stripe & trim' },
  { id: 605, name: 'Blue Accent', category: 'accent', cost: 500, owned: false, description: 'Blue livery stripe & trim' },
  { id: 606, name: 'Black Accent', category: 'accent', cost: 300, owned: false, description: 'Black livery stripe & trim' },
];
