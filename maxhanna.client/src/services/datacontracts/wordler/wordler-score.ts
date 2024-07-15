import { User } from "../user/user";

export interface WordlerScore {
  id?: number;
  user: User;
  score: number;
  time: number;
  submitted?: Date;
  difficulty: number;
}
