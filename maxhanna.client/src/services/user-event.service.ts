import { Injectable } from '@angular/core';
import { UserEvent } from './datacontracts/user-event/user-event';

@Injectable({
  providedIn: 'root'
})
export class UserEventService {
  constructor() { }

  async getUserEvents(limit: number = 50): Promise<UserEvent[]> {
    try {
      const response = await fetch(`/userevent?limit=${limit}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.status === 404) return [];
      if (!response.ok) return [];
      return await response.json() as UserEvent[];
    } catch (error) {
      console.error('Error fetching user events:', error);
      return [];
    }
  }

  async insertUserEvent(userId: number, username: string | undefined, eventType: string, eventText: string, referenceId?: number, referenceType?: string): Promise<boolean> {
    try {
      const response = await fetch('/userevent/insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          username,
          eventType,
          eventText,
          referenceId,
          referenceType
        }),
      });
      return response.ok;
    } catch (error) {
      console.error('Error inserting user event:', error);
      return false;
    }
  }
}
