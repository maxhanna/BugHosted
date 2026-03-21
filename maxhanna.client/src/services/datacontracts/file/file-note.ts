import { User } from "../user/user";

export class FileNote {
  user?: User;
  note?: string;

  constructor(user?: User, note?: string) {
    this.user = user;
    this.note = note;
  }
}
