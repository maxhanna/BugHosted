import { User } from "../user/user"; 
import { Vector2 } from "./vector2";
import { MetaBot } from "./meta-bot";

export class MetaHero {
  id: number;  
  name?: string;
  type?: string;
  position: Vector2; 
  speed: number;
  attackSpeed?: number;  // attackSpeed in milliseconds (minimum time between attacks)
  hp?: number;
  mp?: number;
  // legacy stats removed
  // New stats
  attackDmg?: number;
  critRate?: number; // 0.0 - 1.0
  critDmg?: number; // multiplier
  health?: number;
  regen?: number; // hp per second
  mana?: number;
  mana_regen?: number;
  // persisted skill allocations (optional)
  skills?: { skillA: number; skillB: number; skillC: number };
  // Number of mana points allocated (UI-facing 'points' into Mana). Starts at 0.
  maxMana?: number;
  // Current mana spent/consumed (0..maxMana). This value can be decreased by mana regeneration or items.
  manaSpent?: number;
  level?: number;
  exp?: number;
  userId?: number;
  map: string;
  color?: string;
  mask?: number;
  updated?: Date;
  constructor(id: number, name: string, type: string, position: Vector2, speed: number, map: string, color?: string, 
    mask?: number, hp?: number, mp?: number, regen?: number, mana_regen?: number, level?: number, exp?: number, attackSpeed?: number, userId?: number, updated?: Date) {
    this.id = id; 
    this.name = name;
    this.type = type;
    this.position = position; 
    this.speed = speed;
    this.hp = hp ?? 100;
    this.mp = mp ?? 100;
    this.regen = regen ?? 0;
    this.mana_regen = mana_regen ?? 0;
    this.level = level ?? 1;
    this.exp = exp ?? 0;
    this.attackSpeed = attackSpeed ?? 400; // default 400ms
    this.userId = userId;
    this.mana = 0;
    this.maxMana = 0;
    this.manaSpent = 0;
    // initialize skill allocations to zero by default
    this.skills = { skillA: 0, skillB: 0, skillC: 0 };
    this.map = map;
    this.color = color;
    this.mask = mask; 
    this.updated = updated;
  } 
}
