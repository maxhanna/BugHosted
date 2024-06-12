import { FileEntry } from "./file-entry";
import { StoryComment } from "./story-comment";
import { Topic } from "./topic";
import { User } from "./user";

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
  storyComments: Array<StoryComment> | undefined;
  storyTopics: Array<Topic> | undefined;
}


export class MetaData {
  title!: string;
  description!: string;
  imageUrl!: string;
}
