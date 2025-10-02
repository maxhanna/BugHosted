import { FileEntry } from "../file/file-entry";
import { Reaction } from "../reactions/reaction";
import { User } from "../user/user";

export interface PollOption {
  id?: string;
  text?: string;
  voteCount?: number;
  percentage?: number;
}

export interface PollVote {
  id?: number;
  userId?: number;
  componentId?: string;
  value?: string;
  timestamp?: Date;
  username?: string;
  displayPicture?: string | null;
}

export interface Poll {
  componentId?: string;
  question?: string;
  options?: PollOption[];
  userVotes?: PollVote[];
  totalVotes?: number;
  createdAt?: Date;
}

 

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
