import { User } from "../user/user"; 
import { Vector2 } from "./vector2";
import { MetaBot } from "./meta-bot";

export class MetaHero {
  id: number;  
  name?: string;
  position: Vector2; 
  speed: number;
  attackSpeed?: number;  // attackSpeed in milliseconds (minimum time between attacks)
  hp?: number;
  str?: number;
  dex?: number;
  int?: number;
  level?: number;
  exp?: number;
  userId?: number;
  map: string;
  color?: string;
  mask?: number;
  updated?: Date;
  constructor(id: number, name: string, position: Vector2, speed: number, map: string, color?: string, 
    mask?: number, hp?: number, level?: number, exp?: number, attackSpeed?: number, userId?: number, 
    str?: number, dex?: number, int?: number, updated?: Date) {
    this.id = id; 
    this.name = name;
    this.position = position; 
    this.speed = speed;
    this.hp = hp ?? 100;
    this.level = level ?? 1;
    this.exp = exp ?? 0;
    this.attackSpeed = attackSpeed ?? 400; // default 400ms
    this.userId = userId;
    this.map = map;
    this.color = color;
    this.mask = mask;
    this.str = str ?? 0;
    this.dex = dex ?? 0;
    this.int = int ?? 0;
    this.updated = updated;
  } 
}
