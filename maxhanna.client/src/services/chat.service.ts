// user.service.ts
import { Injectable } from '@angular/core';
import { User } from './datacontracts/user/user';
import { FileEntry } from './datacontracts/file/file-entry';
import { Message } from './datacontracts/chat/message'; 

@Injectable({
  providedIn: 'root'
})
export class ChatService {  
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  encryptContent(message: string, password: string = 'defaultPassword'): string {
    try {
      // Convert to byte arrays
      const msgBytes = this.encoder.encode(message);
      const pwdBytes = this.encoder.encode(password);

      // Process each byte
      const result = new Uint8Array(msgBytes.length);
      for (let i = 0; i < msgBytes.length; i++) {
        // Get password byte (cycling through password)
        const pwdByte = pwdBytes[i % pwdBytes.length];

        // Multi-layer transformation
        let transformed = msgBytes[i] ^ pwdByte;  // XOR with password
        transformed = (transformed + 7) % 256;    // Add constant
        transformed = ((transformed << 4) | (transformed >> 4)) & 0xFF;  // Rotate bits

        result[i] = transformed;
      }

      // Convert to hex string for easy storage
      return Array.from(result).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.error('Encryption error:', error);
      return message;
    }
  }

  decryptContent(encryptedHex: string, password: string = 'defaultPassword'): string {
    try {
      // Convert from hex string
      const bytes = new Uint8Array(encryptedHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);

      // Convert password to bytes
      const pwdBytes = this.encoder.encode(password);

      // Reverse the transformation
      const result = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) {
        const pwdByte = pwdBytes[i % pwdBytes.length];

        let transformed = bytes[i];
        transformed = ((transformed >> 4) | (transformed << 4)) & 0xFF;  // Reverse rotation
        transformed = (transformed - 7 + 256) % 256;  // Subtract constant (handle underflow)
        transformed = transformed ^ pwdByte;  // XOR with password

        result[i] = transformed;
      }

      return this.decoder.decode(result);
    } catch (error) {
      console.error('Decryption error:', error);
      return 'Error decrypting message';
    }
  } 
  

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
