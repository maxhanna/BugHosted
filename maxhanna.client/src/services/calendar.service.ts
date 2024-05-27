// user.service.ts
import { Injectable } from '@angular/core';
import { User } from './datacontracts/user';
import { CalendarEntry } from './datacontracts/calendar-entry';

@Injectable({
  providedIn: 'root'
})
export class CalendarService {

  async getCalendarEntries(user: User, startDate: Date, endDate: Date) {
    var params = new URLSearchParams({ startDate: startDate.toISOString(), endDate: endDate.toISOString() });
    try {
      const response = await fetch(`/calendar?` + params, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async createCalendarEntries(user: User, calendarEntry: CalendarEntry) {
    calendarEntry.ownership = user.id?.toString();
      
    try {
      const response = await fetch(`/calendar/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, calendarEntry }),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async deleteCalendarEntry(user: User, calendarEntry: CalendarEntry) {
    calendarEntry.ownership = user.id?.toString();
    try {
      const response = await fetch(`/calendar/${calendarEntry.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
}
