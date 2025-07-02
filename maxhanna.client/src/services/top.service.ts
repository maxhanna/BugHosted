import { Injectable } from '@angular/core';  
import { Topic } from './datacontracts/topics/topic';
@Injectable({
  providedIn: 'root'
})
export class TopService { 
  async addEntryToCategory(topics: Topic[], entry: string, url?: string, text?: string, picture?: number, userId?: number) {
    try {
      const response = await fetch(`/top/addentrytocategory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Topics: topics, Entry: entry, Url: url, Text: text, Picture: picture, UserId: userId }),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  
  async editTop(entryId: number, title?: string, url?: string, text?: string, picture?: number) {
    try {
      const response = await fetch(`/top/edittop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ EntryId: entryId, Title: title, Url: url, Text: text, Picture: picture }),
      });
  
      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async getTop(topics?: Topic[]) {
    try {
      const response = await fetch(`/top/gettop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(topics),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async vote(entryId: number, userId: number, isUpvote: boolean) {
    try {
      const response = await fetch(`/top/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ EntryId: entryId, UserId: userId, IsUpvote: isUpvote }),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async getTopCategories(limit?: number) {
    try {
      const response = await fetch(`/top/gettopcategories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(limit),
      });

      return await response.json();
    } catch (error) {
    }
  }
}
