import { Injectable } from '@angular/core';
import { User } from './datacontracts/user';
import { Reaction } from './datacontracts/reaction';

@Injectable({
  providedIn: 'root'
})
export class ReactionService {
  async addReaction(reaction: Reaction) { 
    try {
      const res = await fetch('/reaction/addreaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reaction),
      });

      if (!res.ok) {
        throw new Error('Failed to react');
      }
      return await res.text();
    } catch (error) {
      console.error('Error reacting:', error);
      return (error as Error).message;
    }
  } 
}
