// user.service.ts
import { Injectable } from '@angular/core'; 
import { User } from './datacontracts/user/user';
import { FileEntry } from './datacontracts/file/file-entry';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  async getMessageHistory(user1: User | null, user2: User[] | null, pageNumber?: number, pageSize?: number) { 
    try {
      const response = await fetch(`/chat/getmessagehistory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user1, user2, pageNumber, pageSize }),
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
  async sendMessage(sender: User, receiver: User, content?: string, files?: FileEntry[]) {
    try {
      const response = await fetch(`/chat/sendmessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sender, receiver, content, files }), 
      });

      return await response.json();
    } catch (error) {
      return null; 
    }
  } 
}
