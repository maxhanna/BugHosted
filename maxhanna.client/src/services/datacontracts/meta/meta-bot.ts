import { User } from "../user/user"; 
import { Vector2 } from "./vector2";
import { MetaBotPart } from "./meta-bot-part";

export class MetaBot {
  id: number;
  heroId: number;
  type: number;
  hp: number;
  exp: number = 0;
  level: number = 1; 
  expForNextLevel: number = (this.level + 1) * 5;
  hasAwardedExp = false
  name?: string; 
  isDeployed: boolean = false;
  position?: Vector2;
  head?: MetaBotPart;
  legs?: MetaBotPart;
  leftArm?: MetaBotPart;
  rightArm?: MetaBotPart;


  constructor(params: { id: number, heroId: number, type: number, name: string, position?: Vector2, hp?: number }) {
    this.id = params.id; 
    this.name = params.name; 
    this.heroId = params.heroId; 
    this.type = params.type; 
    this.position = params.position;
    this.hp = params.hp ?? 1;
    this.head = new MetaBotPart({ id: 0, metabotId: this.id, type: "Normal", skill: "Headbutt", damageMod: 1 })
    this.legs = new MetaBotPart({ id: 0, metabotId: this.id, type: "Normal", skill: "Kick", damageMod: 1 })
    this.leftArm = new MetaBotPart({ id: 0, metabotId: this.id, type: "Normal", skill: "Left punch", damageMod: 1 })
    this.rightArm = new MetaBotPart({ id: 0, metabotId: this.id, type: "Normal", skill: "Right punch", damageMod: 1 }) 
  }

  calculateExpForNextLevel() {
    console.log("calculateExpForNextLevel ");
    this.expForNextLevel = (this.level + 1) * 5;
    return this.expForNextLevel; // For example, require 100 * level experience to level up
  }
}


export const SPEED_TYPE = 1;
export const STRENGTH_TYPE = 2;
export const ARMOR_TYPE = 3;
export const RANGED_TYPE = 4;
export const STEALTH_TYPE = 5;
export const INTELLIGENCE_TYPE = 6;
