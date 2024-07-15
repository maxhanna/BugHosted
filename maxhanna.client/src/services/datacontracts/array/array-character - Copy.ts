import { User } from "../user/user";

 
export class ArrayCharacter {
  characterClass: number | undefined;
  level: bigint | undefined;
  experience: bigint | undefined;
  position: bigint | undefined;
  monstersKilled: bigint | undefined;
  itemsFound: bigint | undefined;
  playersKilled: number | undefined;
  user: User | undefined;

  constructor( 
    characterClass: number = 0,
    level: bigint = 0n,
    experience: bigint = 0n,
    position: bigint = 0n,
    monstersKilled: bigint = 0n,
    itemsFound: bigint = 0n,
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
