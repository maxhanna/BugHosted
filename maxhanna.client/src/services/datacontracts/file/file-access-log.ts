import { User } from "../user/user";

export class FileAccessLog {
  fileId: number;
  lastAccess?: Date;
  accessCount?: number;
  user: User;

  constructor(fileId: number, lastAccess: Date | undefined, accessCount: number | undefined, user: User) {
    this.fileId = fileId;
    this.lastAccess = lastAccess;
    this.accessCount = accessCount;
    this.user = user;
  }
}
