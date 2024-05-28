export class FileEntry {
  id: number;
  name: string;
  visibility: string;
  owner: string;
  isFolder: boolean;

  constructor(id: number, name: string, visibility: string, owner: string, isFolder: boolean) {
    this.id = id;
    this.name = name;
    this.visibility = visibility;
    this.owner = owner;
    this.isFolder = isFolder; 
  }
}
