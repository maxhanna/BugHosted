import { Injectable } from '@angular/core'; 
import { User } from './datacontracts/user'; 
import { NewsResponse } from './datacontracts/news-data';

@Injectable({
  providedIn: 'root'
})
export class NewsService { 
  async getAllNews(user: User) {
    try {
      const res = await fetch('/news', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      if (!res.ok) {
        throw new Error('Failed to fetch news');
      }
      const data = await res.json();
      console.log("newz data: " + data);
      return data as NewsResponse | null;
    } catch (error) {
      console.error('Error fetching news:', error);
      return null;
    }
  }

  async searchNews(user: User, keyword: string) {
    var params = new URLSearchParams({ keywords: keyword });

    try {
      const res = await fetch(`/news?${params}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      if (!res.ok) {
        throw new Error('Failed to fetch news');
      }
      const data = await res.json();
      return data as NewsResponse | null;
    } catch (error) {
      console.error('Error fetching news:', error);
      return null;
    }
  }
}