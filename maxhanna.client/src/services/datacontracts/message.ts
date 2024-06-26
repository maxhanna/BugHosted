import { Reaction } from "./reaction";
import { User } from "./user";

export class Message {
  id: number;
  sender: User;
  receiver: User;
  content: string;
  timestamp: Date;
  reactions?: Reaction[];

  constructor(id: number, sender: User, receiver: User, content: string, timestamp: Date, reactions?: Reaction[]) {
    this.id = id;
    this.sender = sender;
    this.receiver = receiver;
    this.content = content;
    this.timestamp = timestamp;
    this.reactions = reactions;
  }
}
