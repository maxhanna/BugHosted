import { FileEntry } from "./file-entry";
import { Reaction } from "./reaction";
import { User } from "./user";

export class Comment {
  id!: number;
  user!: User;
  commentText?: string;
  upvotes: number = 0;
  downvotes: number = 0;
  storyId?: number;
  fileId?: number; 
  commentFiles?: FileEntry[];
  date?: Date; 
  reactions?: Array<Reaction> | undefined;
}
