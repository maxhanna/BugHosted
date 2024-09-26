import { User } from "../user/user"; 
import { Vector2 } from "./vector2";

export class MetaHero {
  id: number; 
  user?: User;
  name?: string;
  position: Vector2; 
  speed: number;
  map: number;
   

  constructor(id: number, user: User, name: string, position: Vector2, speed: number, map: number) {
    this.id = id;
    this.user = user;
    this.name = name;
    this.position = position; 
    this.speed = speed;
    this.map = map; 
  } 
}
