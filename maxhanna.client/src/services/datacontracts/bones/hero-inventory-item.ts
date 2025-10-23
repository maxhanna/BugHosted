import { Skill } from "../../../app/bones/helpers/skill-types"; 

export type PartName = "HELM" | "ARMOR" | "WEAPON";

export class HeroInventoryItem {
  id: number;
  heroId?: number;
  type: number;
  partName: PartName;
  damageMod: number;
  skill: Skill;

  constructor(params: {
    id: number,
    heroId?: number, 
    partName: PartName,
    type?: number,
    damageMod: number,
    skill: Skill
  }) {
    this.id = params.id;
    this.heroId = params.heroId;
    this.partName = params.partName;
    this.type = params.type ?? params.skill.type;
    this.skill = params.skill;
    this.damageMod = params.damageMod;
  }
}

export const HEAD = "HEAD";
export const LEGS = "LEGS";
export const LEFT_ARM = "LEFT_ARM";
export const RIGHT_ARM = "RIGHT_ARM";
