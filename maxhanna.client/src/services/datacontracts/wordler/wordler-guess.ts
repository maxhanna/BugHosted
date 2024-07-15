import { User } from "../user/user";

 
export interface WordlerGuess {
  user: User;
  attemptNumber: number;
  guess: string;
  difficulty: number;
  date?: Date;
}
