import { User } from "../user/user"; 
import { Vector2 } from "./vector2";
import { MetaBot } from "./meta-bot";

export class MetaHero {
  id: number;  
  name?: string;
  position: Vector2; 
  speed: number;
  map: string;
  color?: string;
  metabots: MetaBot[];
  mask?: number;

  constructor(id: number, name: string, position: Vector2, speed: number, map: string, metabots: MetaBot[], color?: string, mask?: number) {
    this.id = id; 
    this.name = name;
    this.position = position; 
    this.speed = speed;
    this.map = map;
    this.color = color;
    this.metabots = metabots;
    this.mask = mask;
  } 
}
