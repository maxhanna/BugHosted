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
}

export interface RacingPlayerCar {
  userId: number;
  upgrades: RacingCarUpgrade[];
  skinId: number;
  totalRaces: number;
  wins: number;
  money: number;
  bestLap: number; // ms
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
  { id: 1, name: 'Sunset Circuit', difficulty: 'easy', laps: 3, length: 1200, description: 'A simple coastal circuit with wide corners', entryFee: 100, prizePool: 300, bestTime: 0 },
  { id: 2, name: 'Mountain Pass', difficulty: 'medium', laps: 3, length: 1800, description: 'Twisty mountain roads with elevation changes', entryFee: 500, prizePool: 1500, bestTime: 0 },
  { id: 3, name: 'Downtown GP', difficulty: 'hard', laps: 5, length: 2500, description: 'Technical city circuit with tight corners', entryFee: 2000, prizePool: 8000, bestTime: 0 },
];

export const CAR_SKINS: RacingCarSkin[] = [
  { id: 1, name: 'Classic Red', color: '#cc0000', cost: 0, owned: true },
  { id: 2, name: 'Midnight Blue', color: '#1a237e', cost: 500, owned: false },
  { id: 3, name: 'Emerald Green', color: '#1b5e20', cost: 500, owned: false },
  { id: 4, name: 'Gold Rush', color: '#ffd600', cost: 1500, owned: false },
  { id: 5, name: 'Cyber Purple', color: '#7b1fa2', cost: 2000, owned: false },
  { id: 6, name: 'Racing Stripe', color: '#ffffff', cost: 3000, owned: false },
  { id: 7, name: 'Carbon Black', color: '#212121', cost: 5000, owned: false },
  { id: 8, name: 'Chrome Silver', color: '#9e9e9e', cost: 8000, owned: false },
];
