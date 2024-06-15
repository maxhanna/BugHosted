import { FileComment } from "./file-comment";
import { FileData } from "./file-data";
import { User } from "./user";
import { Comment } from '../datacontracts/comment'

export class FileEntry {
  id: number;
  fileName: string;
  visibility: string;
  sharedWith: string;
  user: User;
  isFolder: boolean;
  upvotes: number;
  downvotes: number;
  fileComments: Array<Comment>;
  date: Date;
  fileData: FileData;

  constructor(id: number, fileName: string, visibility: string, sharedWith: string, user: User, isFolder: boolean, upvotes: number, downvotes: number, comments: Array<Comment>, date: Date, fileData: FileData) {
    this.id = id;
    this.fileName = fileName;
    this.visibility = visibility;
    this.sharedWith = sharedWith;
    this.user = user;
    this.isFolder = isFolder;
    this.upvotes = upvotes;
    this.downvotes = downvotes;
    this.fileComments = comments;
    this.date = date;
    this.fileData = fileData;
  }
}
