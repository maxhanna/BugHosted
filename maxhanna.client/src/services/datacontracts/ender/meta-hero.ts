import { User } from "../user/user"; 
import { Vector2 } from "./vector2";
import { MetaBot } from "./meta-bot";

export class MetaHero {
  id: number;  
  name?: string;
  position: Vector2; 
  speed: number;
  level: number;
  kills: number;
  map: string;
  color?: string; 
  mask?: number;
  created: Date;

  // created may be a Date or an ISO string from the backend
  constructor(id: number, name: string, position: Vector2, speed: number, map: string, color?: string, mask?: number, level: number = 1, kills: number = 0, created?: Date) {
    this.id = id; 
    this.name = name;
    this.position = position; 
    this.speed = speed;
    this.level = level;
    this.kills = kills;
    this.map = map;
    this.color = color; 
    this.mask = mask;
    this.created = created || new Date();
  } 
}
