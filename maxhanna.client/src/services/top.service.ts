import { Injectable } from '@angular/core';  
import { Topic } from './datacontracts/topics/topic';
@Injectable({
  providedIn: 'root'
})
export class TopService { 
  async addEntryToCategory(topics: Topic[], entry: string, url?: string, userId?: number) {
    try {
      const response = await fetch(`/top/addentrytocategory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Topics: topics, Entry: entry, Url: url, UserId: userId }),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async getTop(category?: string) {
    try {
      const response = await fetch(`/top/gettop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(category),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
}
