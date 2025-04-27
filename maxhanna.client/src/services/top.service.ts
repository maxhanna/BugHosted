import { Injectable } from '@angular/core';  
@Injectable({
  providedIn: 'root'
})
export class TopService { 
  async addEntryToCategory(category: string, entry: string, userId: number) {
    try {
      const response = await fetch(`/top/addentrytocategory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Category: category, Entry: entry, UserId: userId }),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
}
