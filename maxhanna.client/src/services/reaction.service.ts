import { Injectable } from '@angular/core';  
import { Reaction } from './datacontracts/reactions/reaction';

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

  async deleteReaction(reactionId: number, userId: number = 0) {
    try {
  const res = await fetch('/reaction/deletereaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: userId ?? 0, reactionId }),
      });

      if (!res.ok) {
        throw new Error('Failed to delete reaction');
      }
      return await res.json();
    } catch (error) {
      console.error('Error deleting reaction:', error);
      return (error as Error).message;
    }
  }

  async getReactionsCount(userId: number) {
    try {
      const res = await fetch(`/reaction/getreactionscount?userId=${userId}`);
      if (!res.ok) throw new Error('Failed to get reactions count');
      const text = await res.text();
      return parseInt(text) || 0;
    } catch (error) {
      console.error('Error getting reactions count:', error);
      return 0;
    }
  }
}
