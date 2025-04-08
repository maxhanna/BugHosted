import { Injectable } from '@angular/core';  
import { ArticlesResult } from './datacontracts/news/news-data';
import { User } from './datacontracts/user/user';

@Injectable({
  providedIn: 'root'
})
export class NewsService { 
  async getAllNews() {
    try {
      const res = await fetch('/news', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }, 
      });

      if (!res.ok) {
        throw new Error('Failed to fetch news');
      }
      return await res.json() as ArticlesResult;
    } catch (error) {
      console.error('Error fetching news:', error);
      return null;
    }
  }

  async searchNews(keyword: string) {
    const params = new URLSearchParams({ keywords: keyword });

    try {
      const res = await fetch(`/news?${params}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }, 
      });

      if (!res.ok) {
        throw new Error('Failed to fetch news');
      }
      const data = await res.json();
      return data as ArticlesResult | null;
    } catch (error) {
      console.error('Error fetching news:', error);
      return null;
    }
  }


  async saveDefaultSearch(userId: number, search: string) {
    try {
      const res = await fetch(`/news/savedefaultsearch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, Search: search }),
      });

      if (!res.ok) {
        throw new Error('Fail to save default search');
      }
      return await res.text(); 
    } catch (error) {
      console.error('Error saving default search :', error);
      return null;
    }
  }

  async getDefaultSearch(userId: number) {
    try {
      const res = await fetch(`/news/getdefaultsearch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify( userId ),
      });

      if (!res.ok) {
        throw new Error('Fail to get default search');
      }
      return await res.text(); 
    } catch (error) {
      console.error('Error getting default search :', error);
      return null;
    }
  }
}
