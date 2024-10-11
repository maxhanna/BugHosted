import { User } from "../user/user";
import { Vector2 } from "./vector2";
import { HEAD, LEGS, LEFT_ARM, RIGHT_ARM } from "./meta-bot-part";

export class MetaBotChip {
  id: number;
  metabotId: number;
  part: string;
  type: string;
  damageMod: number;
  skill: string;
  created: Date;

  constructor(params: { id: number, metabotId: number, part: string, type: string, damageMod: number, skill: string, created: Date }) {
    this.id = params.id;
    this.metabotId = params.metabotId;
    this.part = params.part;
    this.type = params.type;
    this.skill = params.skill;
    this.damageMod = params.damageMod;
    this.created = params.created;
  }
} 
