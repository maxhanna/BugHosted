import { User } from "../user/user";

export interface MetaHero {
  id: number; 
  user?: User;
  name?: string; 
  coordsX: number;
  coordsY: number;
  speed: number;
}
