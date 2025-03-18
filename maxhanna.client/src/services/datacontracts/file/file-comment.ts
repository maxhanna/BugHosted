import { Reaction } from "../reactions/reaction";
import { User } from "../user/user";
import { FileEntry } from "./file-entry";

export class FileComment {
  id!: number;
  user!: User;
  commentText?: string;
  upvotes: number = 0;
  downvotes: number = 0;
  storyId?: number;
  commentId?: number;
  fileId?: number;
  commentFiles?: FileEntry[];
  date?: Date;
  city?: string;
  country?: string;
  ip?: string;
  reactions?: Array<Reaction> | undefined;
}
