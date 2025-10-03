import { Injectable } from '@angular/core';
@Injectable({
  providedIn: 'root'
})
export class ReactionService {
  async addReaction(reaction: any) {
    try {
      const response = await fetch('/Reaction/AddReaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reaction)
      });
      if (!response.ok) throw new Error(`Error adding reaction: ${response.statusText}`);
      return await response.text();
    } catch (err) {
      return (err as Error).message;
    }
  }

  async deleteReaction(reactionId: number) {
    try {
      const response = await fetch('/Reaction/DeleteReaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reactionId)
      });
      if (!response.ok) throw new Error(`Error deleting reaction: ${response.statusText}`);
      return await response.json();
    } catch (err) {
      return (err as Error).message;
    }
  }
}
