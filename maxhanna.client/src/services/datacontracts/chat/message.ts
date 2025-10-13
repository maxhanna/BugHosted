import { FileEntry } from "../file/file-entry";
import { Reaction } from "../reactions/reaction";
import { Poll } from "../social/poll";
import { User } from "../user/user"; 

export class Message {
  id: number;
  chatId: number;
  sender: User;
  receiver: User[];
  content: string;
  timestamp: Date;
  reactions?: Reaction[];
  files?: FileEntry[];
  seen?: string;
  editDate?: Date;
  polls?: Poll[];
  decrypted?: string;

  constructor(id: number, chatId: number, sender: User, receiver: User[], content: string, timestamp: Date, 
    reactions?: Reaction[], files?: FileEntry[], seen?: string, editDate?: Date) {
    this.id = id;
    this.chatId = chatId;
    this.sender = sender;
    this.receiver = receiver;
    this.seen = seen;
    this.content = content;
    this.timestamp = timestamp;
    this.reactions = reactions;
    this.files = files;
    this.editDate = editDate;
  }
}
