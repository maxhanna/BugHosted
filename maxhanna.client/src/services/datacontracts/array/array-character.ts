import { User } from "../user/user";

export class ArrayCharacter {
  characterClass: number | undefined;
  level: number | undefined;
  experience: number | undefined;
  position: number | undefined;
  monstersKilled: number | undefined;
  itemsFound: number | undefined;
  playersKilled: number | undefined;
  user: User | undefined;

  constructor( 
    characterClass: number = 0,
    level: number = 0,
    experience: number = 0,
    position: number = 0,
    monstersKilled: number = 0,
    itemsFound: number = 0,
    playersKilled: number = 0,
    user?: User
  ) { 
    this.characterClass = characterClass;
    this.level = level;
    this.experience = experience;
    this.position = position;
    this.monstersKilled = monstersKilled;
    this.itemsFound = itemsFound;
    this.playersKilled = playersKilled;
    this.user = user;
  }
}
