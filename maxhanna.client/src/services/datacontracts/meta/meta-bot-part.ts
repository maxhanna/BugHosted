import { User } from "../user/user";
import { Vector2 } from "./vector2";

export class MetaBotPart {
  id: number;
  metabotId: number;
  type: string;
  damageMod: number;
  skill: string;

  constructor(params: { id: number, metabotId: number, type: string, damageMod: number, skill: string }) {
    this.id = params.id;
    this.metabotId = params.metabotId;
    this.type = params.type;
    this.skill = params.skill;
    this.damageMod = params.damageMod;
  }
}

export const HEAD = "HEAD";
export const LEGS = "LEGS";
export const LEFT_ARM = "LEFT_ARM";
export const RIGHT_ARM = "RIGHT_ARM";
