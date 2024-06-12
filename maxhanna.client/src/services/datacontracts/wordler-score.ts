import { User } from "./user";

export interface WordlerScore {
  id?: number;
  user: User;
  score: number;
  time: number;
  submitted?: Date;
  difficulty: number;
}
