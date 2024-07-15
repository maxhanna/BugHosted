import { FileEntry } from "./file/file-entry";
import { Reaction } from "./reactions/reaction";
import { User } from "./user/user";

 


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
