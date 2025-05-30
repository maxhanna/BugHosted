import { FileEntry } from "../file/file-entry";
import { UserAbout } from "./user-about";

export class User {
  id: number | undefined;
  username: string | undefined;
  pass: string | undefined;
  displayPictureFile: FileEntry | undefined;
  profileBackgroundPictureFile: FileEntry | undefined;
  about: UserAbout | undefined;
  created: Date | undefined;
  lastSeen: Date | undefined;  
  constructor(id?: number, username?: string, password?: string, displayPictureFile?: FileEntry, profileBackgroundPictureFile?: FileEntry, about?: UserAbout, created?: Date, lastSeen?: Date) {
    this.id = id;
    this.username = username;
    this.pass = password;
    this.displayPictureFile = displayPictureFile;
    this.profileBackgroundPictureFile = profileBackgroundPictureFile;
    this.about = about;
    this.created = created;
    this.lastSeen = lastSeen;
  }
}
