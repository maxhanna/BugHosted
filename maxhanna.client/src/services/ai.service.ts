// user.service.ts
import { Injectable } from '@angular/core';  
import { User } from './datacontracts/user/user';
@Injectable({
  providedIn: 'root'
})
export class AiService {
  async sendMessage(user: User, message: string) {
    try {
      const response = await fetch(`/ai/sendmessagetoai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ User: user, Message: message }),
      });

      return await response.json();
    } catch (error) {
    }
  }
  async generateImage(user: User, message: string) {
    try {
      const response = await fetch(`/ai/generateimagewithai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ User: user, Message: message }),
      });

      return await response.json();
    } catch (error) {
    }
  }
}
