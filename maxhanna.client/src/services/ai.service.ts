// user.service.ts
import { Injectable } from '@angular/core';  
@Injectable({
  providedIn: 'root'
})
export class AiService {
  async sendMessage(message: string) {
    try {
      const response = await fetch(`/ai/sendmessagetoai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Message: message }),
      });

      return await response.json();
    } catch (error) {
    }
  }
  async generateImage(message: string) {
    try {
      const response = await fetch(`/ai/generateimagewithai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Message: message }),
      });

      return await response.json();
    } catch (error) {
    }
  }
}
