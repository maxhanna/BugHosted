// user.service.ts
import { Injectable } from '@angular/core'; 

@Injectable({
  providedIn: 'root'
})
export class PollService {
  async vote(userId: number = 0, value: string, component_id: string) { 
    try {
      const response = await fetch(`/poll/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, Value: value, ComponentId: component_id }),
      });

      return await response.json();
    } catch (error) {
    }
  } 
  async deleteVote(userId: number = 0, component_id: string) : Promise<string> {
    try {
      const response = await fetch(`/poll/deletevote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, ComponentId: component_id }),
      });

      return await response.text();
    } catch (error) {
      return 'An error occurred while deleting the vote.';
    }
  }
}
