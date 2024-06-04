export class FileEntry {
  id: number;
  name: string;
  visibility: string;
  sharedWith: string;
  userId: number;
  username: string;
  isFolder: boolean;
  upvotes: number;
  downvotes: number;
  commentCount: number;
  date: Date;

  constructor(id: number, name: string, visibility: string, sharedWith: string, userid: number, username: string, isFolder: boolean, upvotes: number, downvotes: number, commentCount: number, date: Date) {
    this.id = id;
    this.name = name;
    this.visibility = visibility;
    this.sharedWith = sharedWith;
    this.username = username;
    this.userId = userid;
    this.isFolder = isFolder;
    this.upvotes = upvotes;
    this.downvotes = downvotes;
    this.commentCount = commentCount;
    this.date = date;
  }
}
