// user.service.ts
import { Injectable } from '@angular/core';
import { User } from './datacontracts/user/user';
import { FileEntry } from './datacontracts/file/file-entry';
import { Message } from './datacontracts/chat/message';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  async getMessageHistory(user: User, receivers: User[], chatId?: number, pageNumber: number = 0, pageSize?: number) { 
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
  async getGroupChats(user: User): Promise<Message[] | undefined> {
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
      return undefined;
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
  async getChatUsersByChatId(user: User, chatId: number) {
    try {
      const response = await fetch(`/chat/getchatusersbychatid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ChatId: chatId, User: user }),
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
  getCommaSeparatedGroupChatUserNames(users: User | User[], currentUser?: User, includeCurrentUser: boolean = false): string {
    let userArray: User[];

    if (Array.isArray(users)) {
      userArray = users;
    } else {
      userArray = [users]; // Convert single user to an array
    }

    let hasExcludedCurrentUser = false;

    return userArray
      .filter(user => {
        if (includeCurrentUser) {
          return true;  
        }  
        if (!hasExcludedCurrentUser && user.id === (currentUser?.id ?? 0)) {
          hasExcludedCurrentUser = true;
          return false;  
        }

        return true;  
      })
      .map(user => user.username)
      .join(', ');
  }
}
