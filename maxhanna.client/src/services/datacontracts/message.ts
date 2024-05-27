import { User } from "./user";

export class Message {
  id: number;
  sender: User;
  receiver: User;
  content: string;
  timestamp: Date;

  constructor(id: number, sender: User, receiver: User, content: string, timestamp: Date) {
    this.id = id;
    this.sender = sender;
    this.receiver = receiver;
    this.content = content;
    this.timestamp = timestamp;
  }
}
