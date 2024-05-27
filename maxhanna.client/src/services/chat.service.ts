// user.service.ts
import { Injectable } from '@angular/core';
import { User } from './datacontracts/user';
import { MiningRig } from './datacontracts/mining-rig';
import { MiningRigDevice } from './datacontracts/mining-rig-device';
import { NicehashApiKeys } from './datacontracts/nicehash-api-keys';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  async getMessageHistory(user1: User, user2: User | null) {
    if (!user1 || !user2) { return; }
    try {
      const response = await fetch(`/chat/getmessagehistory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user1, user2 }),
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
  async sendMessage(sender: User, receiver: User, content: string) {
    try {
      const response = await fetch(`/chat/sendmessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sender, receiver, content }), 
      });

      return await response.json();
    } catch (error) {
      return null; 
    }
  } 
}
