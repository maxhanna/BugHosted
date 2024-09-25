import { User } from "../user/user";
import { Sprite } from "./sprite";
import { Vector2 } from "./vector2";

export class MetaHero {
  id: number; 
  user?: User;
  name?: string; 
  coordsX: number;
  coordsY: number;
  speed: number;
  map: number;

  dirty: boolean = false; // Track if the sprite needs to be updated.

  constructor(id: number, user: User, name: string, coordsX: number, coordsY: number, speed: number, map: number) {
    this.id = id;
    this.user = user;
    this.name = name;
    this.coordsX = coordsX;
    this.coordsY = coordsY;
    this.speed = speed;
    this.map = map; 
  }
  resetDirtyFlag() {
    this.dirty = false;
  }
}
