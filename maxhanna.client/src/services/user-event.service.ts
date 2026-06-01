import { Injectable } from '@angular/core';
import { UserEvent } from './datacontracts/user-event/user-event';

export interface UserEventPreference {
  id?: number;
  userId: number;
  eventType: string;
  isEnabled: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class UserEventService {
  constructor() { }

  async getUserEvents(limit: number = 50, offset: number = 0): Promise<{ events: UserEvent[], totalCount: number }> {
    try {
      const response = await fetch(`/userevent?limit=${limit}&offset=${offset}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.status === 404) return { events: [], totalCount: 0 };
      if (!response.ok) return { events: [], totalCount: 0 };
      const result = await response.json(); return { events: result, totalCount: parseInt(response.headers.get('x-total-count') || '0') };
    } catch (error) {
      console.error('Error fetching user events:', error);
      return { events: [], totalCount: 0 };
    }
  }

  async getAllEventTypes(): Promise<string[]> {
    try {
      const response = await fetch('/userevent/eventtypes', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.status === 404) return [];
      if (!response.ok) return [];
      return await response.json() as string[];
    } catch (error) {
      console.error('Error fetching user event types:', error);
      return [];
    }
  }

  async getUserEventPreferences(userId: number): Promise<UserEventPreference[] | null> {
    try {
      const response = await fetch(`/userevent/preferences/${userId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.status === 404) return null;
      if (!response.ok) return null;
      return await response.json() as UserEventPreference[];
    } catch (error) {
      console.error('Error fetching user event preferences:', error);
      return null;
    }
  }

  async saveUserEventPreferences(preferences: UserEventPreference[]): Promise<boolean> {
    try {
      const response = await fetch('/userevent/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      });
      return response.ok;
    } catch (error) {
      console.error('Error saving user event preferences:', error);
      return false;
    }
  }

  async insertUserEvent(userId: number, eventType: string, eventText: string, referenceId?: number, referenceType?: string): Promise<boolean> {
    try {
      const response = await fetch('/userevent/insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
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
