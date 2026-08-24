// user.service.ts
import { Injectable } from '@angular/core';  
import { CalendarEntry } from './datacontracts/calendar/calendar-entry';
import { User } from './datacontracts/user/user';

@Injectable({
  providedIn: 'root'
})
export class CalendarService {

  async getCalendarEntries(userId: number = 0, startDate: Date, endDate: Date, signal?: AbortSignal) {
    const params = new URLSearchParams({ startDate: startDate.toISOString(), endDate: endDate.toISOString() });
    try {
      const response = await fetch(`/calendar?` + params, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
        signal
      });

      return await this.handleResponse(response);
    } catch (error) {
      return null;
    }
  }

  async createCalendarEntries(userId: number = 0, calendarEntry: CalendarEntry, sharedUserIds: number[] = []) {
    calendarEntry.ownership = userId?.toString();
      
    try {
      const response = await fetch(`/calendar/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, calendarEntry, sharedUserIds }),
      });
      return await this.handleResponse(response);
    } catch (error) {
      return null;
    }
  }

  async editCalendarEntry(userId: number = 0, calendarEntry: CalendarEntry) {
    calendarEntry.ownership = userId?.toString();
    try {
      const response = await fetch(`/calendar/edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, calendarEntry }),
      });

      return await this.handleResponse(response);
    } catch (error) {
      return null;
    }
  }

  async createCalendarFeedToken(userId: number): Promise<{ url: string } | null> {
    try {
      const response = await fetch('/calendar/feed-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(userId) });
      if (!response.ok) return null;
      return await response.json();
    } catch { return null; }
  }

  async revokeCalendarFeedToken(userId: number): Promise<boolean> {
    try {
      const response = await fetch(`/calendar/feed-token/${userId}`, { method: 'DELETE' });
      return response.ok;
    } catch { return false; }
  }

  async getNotificationsSent(userId: number = 0) {
    try {
      const response = await fetch(`/calendar/notificationssent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });
      return await this.handleResponse(response);
    } catch (error) {
      return null;
    }
  }

  async deleteCalendarEntry(userId: number = 0, calendarEntry: CalendarEntry) {
    calendarEntry.ownership = userId?.toString();
    try {
      const response = await fetch(`/calendar/${calendarEntry.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      return await this.handleResponse(response);
    } catch (error) {
      return null;
    }
  }
  private async handleResponse(response: Response) {
    const status = response.status;
    let body: any = null;
    try { body = await response.json(); } catch { body = await response.text().catch(() => null); }
    if (!response.ok) throw { status, message: body?.message ?? body ?? response.statusText };
    return body;
  }
}
