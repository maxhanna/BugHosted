export class FileEntry {
  name: string;
  visibility: string;
  owner: string;
  isFolder: boolean;

  constructor(name: string, visibility: string, owner: string, isFolder: boolean) {
    this.name = name;
    this.visibility = visibility;
    this.owner = owner;
    this.isFolder = isFolder; 
  }
}
