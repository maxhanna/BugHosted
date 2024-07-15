import { User } from "../user/user";

export class FileComment {
  constructor(id: number, fileId: number, storyId: number, user: User, commentText: string, upvotes: number, downvotes: number) {
    this.id = id;
    this.fileId = fileId;
    this.storyId = storyId;
    this.user = user;
    this.commentText = commentText;
    this.upvotes = upvotes;
    this.downvotes = downvotes;
  }

  id: number;
  fileId: number;
  storyId: number;
  user: User;
  commentText: string; 
  upvotes: number;
  downvotes: number;
}
