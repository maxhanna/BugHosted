import { User } from "../user/user";

export interface MastermindScore {
  id?: number;
  user: User;
  score: number;
  tries: number;
  time: number;
  submitted?: Date;
  difficulty?: string;
  sequenceLength?: number;
}
