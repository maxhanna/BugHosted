
import { Vector2 } from "./vector2";
import { HEAD, LEFT_ARM, LEGS, MetaBotPart, RIGHT_ARM } from "./meta-bot-part";
import { ColorSwap } from "./color-swap";

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
  spriteName?: string;
  isDeployed?: boolean = false;
  targetHeroId?: number | null = null;
  position?: Vector2;
  colorSwap?: ColorSwap;


  constructor(params: {
    id: number, heroId: number, type: number, name: string,
    position?: Vector2, hp?: number, level?: number, spriteName?: string,
    leftArm?: MetaBotPart, rightArm?: MetaBotPart, legs?: MetaBotPart,
    head?: MetaBotPart, colorSwap?: ColorSwap, isDeployed?: boolean,
  targetHeroId?: number | null,
  }) {
    this.id = params.id;
    this.name = params.name;
    this.heroId = params.heroId;
    this.type = params.type;
    this.position = params.position;
    this.hp = params.hp ?? 1;
    this.level = params.level ?? 1;
    this.spriteName = params.spriteName;
    this.targetHeroId = params.targetHeroId ?? null;
    this.colorSwap = params.colorSwap;
    this.isDeployed = params.isDeployed;
  }

//   generateReward(): MetaBotPart {
//     //const parts = [this.head, this.legs, this.leftArm, this.rightArm].filter(part => part !== undefined) as MetaBotPart[];
//    // const randomPart = parts[Math.floor(Math.random() * parts.length)];
//     //const randomDamageMod = Math.floor(Math.random() * randomPart.damageMod) + 1;

// //return new MetaBotPart({ id: 0, metabotId: 0, skill: randomPart.skill, type: randomPart.type, damageMod: randomDamageMod, partName: randomPart.partName });
//   }
} 
