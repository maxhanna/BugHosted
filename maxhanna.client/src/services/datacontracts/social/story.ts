import { FileComment } from "../file/file-comment";
import { FileEntry } from "../file/file-entry";
import { Reaction } from "../reactions/reaction";
import { Topic } from "../topics/topic";
import { User } from "../user/user"; 

export class Story {
  id: number | undefined;
  user!: User; 
  storyText: string | undefined;
  fileId: number | null | undefined;
  date: Date | undefined;
  upvotes: number | undefined;
  downvotes: number | undefined;
  commentsCount: number | undefined;
  metadata: Array<MetaData> | undefined;
  storyFiles: Array<FileEntry> | undefined;
  storyComments: Array<FileComment> | undefined;
  storyTopics: Array<Topic> | undefined;
  profileUserId?: number | undefined;
  city?: string | undefined;
  country?: string | undefined;
  reactions?: Array<Reaction> | undefined;
  timeSince?: string; 
  hidden?: boolean; 
}


export class MetaData {
  url!: string;
  title!: string;
  description!: string;
  imageUrl!: string;
}
