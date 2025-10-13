import { Reaction } from "../reactions/reaction";
import { User } from "../user/user";
import { FileEntry } from "./file-entry";
import { Poll } from "../social/poll";

export class FileComment {
  id!: number;
  user!: User;
  commentText?: string;
  upvotes: number = 0;
  downvotes: number = 0;
  storyId?: number;
  commentId?: number;
  fileId?: number;
  userProfileId?: number;
  commentFiles?: FileEntry[];
  date?: Date;
  city?: string;
  country?: string;
  ip?: string;
  reactions?: Array<Reaction> | undefined;
  comments?: Array<FileComment> | undefined;
  // New: polls associated with this comment
  polls?: Array<Poll> | undefined;
  decrypted?: boolean | undefined;
}
