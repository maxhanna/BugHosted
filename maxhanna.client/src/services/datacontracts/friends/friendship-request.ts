import { User } from "../user/user";
export interface FriendRequest {
  id: number;
  sender: User;
  receiver: User;
  status: number; // Pending, Accepted, Rejected, Deleted
  createdAt: Date;
  updatedAt: Date;
}
