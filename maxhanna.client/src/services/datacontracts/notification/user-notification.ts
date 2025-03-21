import { User } from "../user/user";

export class UserNotification {
  id?: number | undefined;
  user?: User | undefined;
  fromUser?: User | undefined;
  fileId?: number | undefined;
  storyId?: number | undefined;
  userProfileId?: number | undefined;
  chatId?: number | undefined;
  commentId?: number | undefined;
  isRead?: boolean | undefined;
  text?: string | undefined;
  date?: Date | undefined;
} 
