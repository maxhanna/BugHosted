import { User } from "../user/user";

export class UserNotification {
  id: number | undefined;
  user: User | undefined;
  fromUser: User | undefined;
  fileId: number | undefined;
  storyId: number | undefined;
  text: string | undefined;
  date: Date | undefined;
} 
