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
  level?: number;
  exp?: number;
  map: string;
  color?: string;
  mask?: number;
  constructor(id: number, name: string, position: Vector2, speed: number, map: string, color?: string, mask?: number, hp?: number, level?: number, exp?: number, attackSpeed?: number) {
    this.id = id; 
    this.name = name;
    this.position = position; 
    this.speed = speed;
    this.hp = hp ?? 100;
    this.level = level ?? 1;
    this.exp = exp ?? 0;
    this.attackSpeed = attackSpeed ?? 400; // default 400ms
    this.map = map;
    this.color = color;
    this.mask = mask;
  } 
}
