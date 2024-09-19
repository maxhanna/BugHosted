import { User } from "../user/user";
import { MetaHero } from "./meta-hero";

export interface MetaChat {
  hero: MetaHero; 
  content?: string;
  timestamp?: Date;  
}
