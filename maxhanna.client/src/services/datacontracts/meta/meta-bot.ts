import { User } from "../user/user"; 
import { Vector2 } from "./vector2";

export class MetaBot {
  id: number;  
  heroId: number;  
  type: number;
  hp: number = 1;
  exp: number = 0;
  expForNextLevel: number = 100;
  level: number = 0;
  name?: string;
  isDead: boolean;
  position?: Vector2;

  constructor(id: number, heroId: number, type:number, name: string, isDead: boolean, position?: Vector2) {
    this.id = id; 
    this.name = name;
    this.isDead = isDead;
    this.heroId = heroId;
    this.isDead = isDead;
    this.type = type;
    this.position = position; 
  } 
}

export const SPEED_TYPE = 1;
export const STRENGTH_TYPE = 2;
export const ARMOR_TYPE = 3;
export const RANGED_TYPE = 4;
export const STEALTH_TYPE = 5;
export const INTELLIGENCE_TYPE = 6;
