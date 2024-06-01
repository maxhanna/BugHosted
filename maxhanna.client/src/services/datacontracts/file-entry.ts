export class FileEntry {
  id: number;
  name: string;
  visibility: string;
  owner: string;
  userId: string;
  username: string;
  isFolder: boolean;
  upvotes: number;
  downvotes: number;
  commentCount: number;
  date: Date;

  constructor(id: number, name: string, visibility: string, owner: string, userid: string, username: string, isFolder: boolean, upvotes: number, downvotes: number, commentCount: number, date: Date) {
    this.id = id;
    this.name = name;
    this.visibility = visibility;
    this.owner = owner;
    this.username = username;
    this.userId = userid;
    this.isFolder = isFolder;
    this.upvotes = upvotes;
    this.downvotes = downvotes;
    this.commentCount = commentCount;
    this.date = date;
  }
}
