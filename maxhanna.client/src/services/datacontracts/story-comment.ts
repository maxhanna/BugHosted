import { User } from "./user";

export class StoryComment {
  id: number | undefined;
  storyId: number | undefined;
  user: User | undefined; 
  text: string | undefined;
  upvotes: number | undefined;
  downvotes: number | undefined;
  date: Date | undefined;
}
