import { FileEntry } from "../file/file-entry";

export class Trophy {
  id: number;
  name?: string;
  file?: FileEntry;

  constructor(id: number, name?: string, file?: FileEntry) {
    this.id = id;
    this.name = name;
    this.file = file;
  }
}
