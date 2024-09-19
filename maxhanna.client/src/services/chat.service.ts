// user.service.ts
import { Injectable } from '@angular/core'; 
import { User } from './datacontracts/user/user';
import { FileEntry } from './datacontracts/file/file-entry';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  async getMessageHistory(user: User, receivers: User[], chatId?: number, pageNumber?: number, pageSize?: number) {
    console.log("get message history" + pageNumber);
    try {
      const response = await fetch(`/chat/getmessagehistory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ User: user, Receivers: receivers, ChatId: chatId, PageNumber: pageNumber, PageSize: pageSize }),
      });

      return await response.json();  
    } catch (error) { 
    }
  }
  async getChatNotifications(user: User) {
    try {
      const response = await fetch(`/chat/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async getGroupChats(user: User) {
    try {
      const response = await fetch(`/chat/getgroupchats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async getChatNotificationsByUser(user: User) {
    try {
      const response = await fetch(`/chat/notificationsbyuser`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async sendMessage(sender: User, receiver: User[], chatId?: number, content?: string, files?: FileEntry[]) {
    try {
      const response = await fetch(`/chat/sendmessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Sender: sender, Receiver: receiver, ChatId: chatId, Content: content, Files: files }), 
      });

      return await response.json();
    } catch (error) {
      return null; 
    }
  }
  getCommaSeparatedGroupChatUserNames(users: User | User[], currentUser?: User): string {
    let userArray: User[];

    if (Array.isArray(users)) {
      userArray = users;
    } else {
      userArray = [users]; // Convert single user to an array
    }

    return userArray
      .filter(user => user.username !== currentUser?.username) // Exclude matching username
      .map(user => user.username) // Map to usernames
      .join(', '); // Join with commas
  }
}
