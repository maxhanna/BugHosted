export class FileComment {
  constructor(id: number, fileId: number, userId: number, commentText: string, username: string, upvotes: number, downvotes: number) {
    this.id = id;
    this.fileId = fileId;
    this.userId = userId;
    this.commentText = commentText;
    this.username = username;
    this.upvotes = upvotes;
    this.downvotes = downvotes;
  }

  id: number;
  fileId: number;
  userId: number;
  commentText: string;
  username: string;
  upvotes: number;
  downvotes: number;
}
