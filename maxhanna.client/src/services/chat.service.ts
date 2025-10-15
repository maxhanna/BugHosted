// user.service.ts
import { Injectable } from '@angular/core';
import { User } from './datacontracts/user/user';
import { FileEntry } from './datacontracts/file/file-entry';
import { Message } from './datacontracts/chat/message'; 

@Injectable({
  providedIn: 'root'
})
export class ChatService {  
  async getMessageHistory(userId: number = 0, receiverIds: number[], chatId?: number, pageNumber: number = 0, pageSize?: number) { 
    try {
      const response = await fetch(`/chat/getmessagehistory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, ReceiverIds: receiverIds, ChatId: chatId, PageNumber: pageNumber, PageSize: pageSize }),
      });

      return await response.json();
    } catch (error) {
    }
  }
  async getChatNotifications(userId?: number) {
    try {
      const response = await fetch(`/chat/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId ?? 0),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async editMessage(messageId: number, userId?: number, content?: string) {
    try {
      const response = await fetch(`/chat/edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ MessageId: messageId, UserId: userId ?? 0, Content: content ?? '' }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async editMessageFiles(messageId: number, userId?: number, files?: FileEntry[]) {
    try {
      const response = await fetch(`/chat/editfiles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ MessageId: messageId, UserId: userId ?? 0, Files: files ?? [] }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async getGroupChats(userId?: number): Promise<Message[] | undefined> {
    try {
      const response = await fetch(`/chat/getgroupchats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId ?? 0),
      });

      return await response.json();
    } catch (error) {
      return undefined;
    }
  }
  async getChatNotificationsByUser(userId?: number) {
    try {
      const response = await fetch(`/chat/notificationsbyuser`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId ?? 0),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async getChatUsersByChatId(chatId: number) {
    try {
      const response = await fetch(`/chat/getchatusersbychatid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ChatId: chatId }),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async sendMessage(senderId: number, receiverIds: number[], chatId?: number, content?: string, files?: FileEntry[]) {
    try {
      const response = await fetch(`/chat/sendmessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ SenderId: senderId, ReceiverIds: receiverIds, ChatId: chatId, Content: content, Files: files }),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async leaveChat(userId: number, chatId: number) {
    try {
      const response = await fetch(`/chat/leavechat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, ChatId: chatId }),
      });

      return await response.text();
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
