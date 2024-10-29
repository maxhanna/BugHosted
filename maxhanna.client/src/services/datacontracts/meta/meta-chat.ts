import { User } from "../user/user";
import { MetaHero } from "./meta-hero";

export interface MetaChat {
  hero: string; 
  content?: string;
  timestamp?: Date;  
}
