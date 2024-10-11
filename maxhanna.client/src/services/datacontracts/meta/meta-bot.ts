import { User } from "../user/user"; 
import { Vector2 } from "./vector2";
import { MetaBotPart } from "./meta-bot-part";

export class MetaBot {
  id: number;  
  parentId: number;  
  type: number;
  hp: number = 1;
  exp: number = 0;
  level: number = 1;
  expForNextLevel: number = this.level * 5;
  hasAwardedExp = false
  name?: string;
  isDead: boolean;
  isDeployed: boolean = false;
  position?: Vector2;
  head?: MetaBotPart;
  legs?: MetaBotPart;
  leftArm?: MetaBotPart;
  rightArm?: MetaBotPart;


  constructor(id: number, parentId: number, type:number, name: string, isDead: boolean, position?: Vector2) {
    this.id = id; 
    this.name = name;
    this.isDead = isDead;
    this.parentId = parentId;
    this.isDead = isDead;
    this.type = type;
    this.position = position;
    this.head = new MetaBotPart({ id: 0, metabotId: this.id, type: "Normal", skill: "Headbutt", damageMod: 1 })
    this.legs = new MetaBotPart({ id: 0, metabotId: this.id, type: "Normal", skill: "Kick", damageMod: 1 })
    this.leftArm = new MetaBotPart({ id: 0, metabotId: this.id, type: "Normal", skill: "Left punch", damageMod: 1 })
    this.rightArm = new MetaBotPart({ id: 0, metabotId: this.id, type: "Normal", skill: "Right punch", damageMod: 1 })
  } 
}

export const SPEED_TYPE = 1;
export const STRENGTH_TYPE = 2;
export const ARMOR_TYPE = 3;
export const RANGED_TYPE = 4;
export const STEALTH_TYPE = 5;
export const INTELLIGENCE_TYPE = 6;
