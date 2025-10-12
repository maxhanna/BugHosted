import { Reaction } from "../reactions/reaction";
import { Topic } from "../topics/topic";
import { User } from "../user/user";
import { FileComment } from "./file-comment";
export class FileEntry {
  id: number;
  fileName?: string;
  givenFileName?: string;
  directory?: string;
  visibility?: string;
  sharedWith?: string;
  user?: User;
  lastUpdatedBy?: User;
  isFolder?: boolean;
  fileComments?: Array<FileComment>;
  date?: Date;
  lastUpdated?: Date;
  lastAccess?: Date;
  accessCount?: number;
  fileSize?: number;
  fileType?: string;
  width?: number;
  height?: number;
  reactions?: Array<Reaction>;
  topics?: Array<Topic>;
  favouriteCount?: number;
  isFavourited?: boolean;
  // Indicates the upload attempt resulted in an existing server-side file match
  isDuplicate?: boolean;
  isHidden?: boolean;

  constructor(id: number, fileName?: string, directory?: string, visibility?: string, sharedWith?: string,
    user?: User, isFolder?: boolean, comments?: Array<FileComment>, date?: Date,
    fileSize?: number, fileType?: string, reactions?: Array<Reaction>, lastUpdated?: Date, lastUpdatedBy?: User, givenFileName?: string,
    width?: number, height?: number, lastAccess?: Date, accessCount?: number, isDuplicate?: boolean, isHidden?: boolean) {
    this.id = id;
    this.fileName = fileName;
    this.directory = directory;
    this.visibility = visibility;
    this.sharedWith = sharedWith;
    this.user = user;
    this.isFolder = isFolder;
    this.fileComments = comments;
    this.date = date;
    this.lastUpdated = lastUpdated;
    this.lastUpdatedBy = lastUpdatedBy;
    this.givenFileName = givenFileName;
    this.fileSize = fileSize;
    this.fileType = fileType;
    this.width = width;
    this.height = height;
    this.reactions = reactions;
    this.favouriteCount = 0;
    this.isFavourited = false;
    this.lastAccess = lastAccess;
    this.accessCount = accessCount;
    this.isDuplicate = isDuplicate;
    this.isHidden = isHidden;
  }
}
