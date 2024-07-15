import { Reaction } from "../reactions/reaction";
import { User } from "../user/user";
import { FileComment } from "./file-comment";
import { FileData } from "./file-data"; 

export class FileEntry {
  id: number;
  fileName: string;
  directory: string;
  visibility: string;
  sharedWith: string;
  user: User;
  isFolder: boolean;
  fileComments: Array<FileComment>;
  date: Date;
  fileData?: FileData;
  fileSize: number;
  fileType: string;
  reactions?: Array<Reaction>;
    
  constructor(id: number, fileName: string, directory: string, visibility: string, sharedWith: string,
    user: User, isFolder: boolean, comments: Array<FileComment>, date: Date,
    fileSize: number, fileType: string, reactions?: Array<Reaction>, fileData?: FileData) {
    this.id = id;
    this.fileName = fileName;
    this.directory = directory;
    this.visibility = visibility;
    this.sharedWith = sharedWith;
    this.user = user;
    this.isFolder = isFolder; 
    this.fileComments = comments;
    this.date = date;
    this.fileData = fileData;
    this.fileSize = fileSize;
    this.fileType = fileType;
    this.reactions = reactions;
  } 
}
