import { Skill } from "../../../app/meta/helpers/skill-types"; 

export class MetaBotPart {
  id: number;
  metabotId?: number;
  type: number;
  partName: "HEAD" | "LEGS" | "LEFT_ARM" | "RIGHT_ARM";
  damageMod: number;
  skill: Skill;

  constructor(params: {
    id: number,
    metabotId?: number, 
    partName: "HEAD" | "LEGS" | "LEFT_ARM" | "RIGHT_ARM",
    type?: number,
    damageMod: number,
    skill: Skill
  }) {
    this.id = params.id;
    this.metabotId = params.metabotId;
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
