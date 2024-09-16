import { FileEntry } from "../file/file-entry";
import { Reaction } from "../reactions/reaction";
import { User } from "../user/user";

 

export class Message {
  id: number;
  chatId: number;
  sender: User;
  receiver: User;
  content: string;
  timestamp: Date;
  reactions?: Reaction[];
  files?: FileEntry[];

  constructor(id: number, chatId: number, sender: User, receiver: User, content: string, timestamp: Date, reactions?: Reaction[], files?: FileEntry[]) {
    this.id = id;
    this.chatId = chatId;
    this.sender = sender;
    this.receiver = receiver;
    this.content = content;
    this.timestamp = timestamp;
    this.reactions = reactions;
    this.files = files;
  }
}
