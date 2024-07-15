 import { FileEntry } from "../file/file-entry";
import { User } from "../user/user";

export class ArrayCharacterItem {
  user: User | undefined;
  file: FileEntry | undefined;
  level: bigint | undefined;
  experience: bigint | undefined;

  constructor(user?: User, file?: FileEntry, level?: bigint, experience?: bigint) {
    this.user = user;
    this.file = file;
    this.level = level;
    this.experience = experience;
  }
}
