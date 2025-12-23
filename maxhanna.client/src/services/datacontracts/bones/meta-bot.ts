
import { Vector2 } from "./vector2"; 
import { ColorSwap } from "./color-swap";

export class MetaBot {
  id: number;
  heroId: number;
  type: number;
  hp: number;
  exp: number = 0;
  level: number = 1; 
  expForNextLevel: number = (this.level + 1) * 5;
  hasAwardedExp = false
  name?: string;
  spriteName?: string;
  isDeployed?: boolean = false;
  targetHeroId?: number | null = null;
  lastKilled?: Date | null;
  position?: Vector2;
  colorSwap?: ColorSwap;


  constructor(params: {
    id: number, heroId: number, type: number, name: string,
    position?: Vector2, hp?: number, level?: number, spriteName?: string, 
    colorSwap?: ColorSwap, isDeployed?: boolean, lastKilled?: Date | null,
  targetHeroId?: number | null,
  }) {
    this.id = params.id;
    this.name = params.name;
    this.heroId = params.heroId;
    this.type = params.type;
    this.position = params.position;
    this.hp = params.hp ?? 1;
    this.level = params.level ?? 1;
    this.spriteName = params.spriteName;
    this.targetHeroId = params.targetHeroId ?? null;
    this.colorSwap = params.colorSwap;
    this.isDeployed = params.isDeployed;
    this.lastKilled = params.lastKilled;
  } 
} 
