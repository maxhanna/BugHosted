// user.service.ts
import { Injectable } from '@angular/core';  
import { CalendarEntry } from './datacontracts/calendar/calendar-entry';
import { User } from './datacontracts/user/user';

@Injectable({
  providedIn: 'root'
})
export class CalendarService {

  async getCalendarEntries(userId: number = 0, startDate: Date, endDate: Date) {
    const params = new URLSearchParams({ startDate: startDate.toISOString(), endDate: endDate.toISOString() });
    try {
      const response = await fetch(`/calendar?` + params, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async createCalendarEntries(userId: number = 0, calendarEntry: CalendarEntry) {
    calendarEntry.ownership = userId?.toString();
      
    try {
      const response = await fetch(`/calendar/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, calendarEntry }),
      });

      return await response.json();
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

      return await response.json();
    } catch (error) {
      return null;
    }
  }
}
