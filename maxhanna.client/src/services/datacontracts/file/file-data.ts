import { User } from "./user";

export class FileData {
  fileId: number;
  givenFileName: string;
  description: string;
  lastUpdated: Date;

  constructor(fileId: number, givenFileName: string, description: string, lastUpdated: Date) {
    this.fileId = fileId;
    this.givenFileName = givenFileName;
    this.description = description;
    this.lastUpdated = lastUpdated;
  }
}
