import { User } from "../user/user";
export interface FriendRequest {
  id: number;
  sender: User;
  receiver: User;
  status: string; // Pending, Accepted, Rejected
  createdAt: Date;
  updatedAt: Date;
}
