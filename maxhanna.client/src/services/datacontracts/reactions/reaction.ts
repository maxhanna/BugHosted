import { User } from "../user/user";

export class Reaction {  
  id?: number; 
  commentId?: number;
  storyId?: number;
  messageId?: number;
  fileId?: number;
  userProfileId?: number;
  user?: User;
  type?: string; 
  timestamp?: Date; 
}
