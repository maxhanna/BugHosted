import { FileEntry } from "../file/file-entry";
import { Reaction } from "../reactions/reaction";
import { Topic } from "../topic";
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
  metadata: MetaData | undefined;
  storyFiles: Array<FileEntry> | undefined;
  storyComments: Array<Comment> | undefined;
  storyTopics: Array<Topic> | undefined;
  profileUserId?: number | undefined;
  reactions?: Array<Reaction> | undefined;
}


export class MetaData {
  title!: string;
  description!: string;
  imageUrl!: string;
}
