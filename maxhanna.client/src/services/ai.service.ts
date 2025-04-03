// user.service.ts
import { Injectable } from '@angular/core';
import { User } from './datacontracts/user/user';
import { Observable } from 'rxjs/internal/Observable';
import { HttpClient } from '@angular/common/http';
@Injectable({
  providedIn: 'root'
})
export class AiService { 
  async sendMessage(user: User, message: string) {
    try {
      const response = await fetch('/ai/sendmessagetoai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ User: user, Message: message }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      } 
      return response.json();
    } catch (error) {
      console.error('Error in AI streaming response:', error);
      throw error;
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
