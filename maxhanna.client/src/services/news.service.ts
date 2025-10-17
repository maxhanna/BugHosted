import { Injectable } from '@angular/core';  
import { ArticlesResult, Article, Statuses } from './datacontracts/news/news-data';
import { User } from './datacontracts/user/user';

@Injectable({
  providedIn: 'root'
})
export class NewsService { 
  async searchNews(keywords: string, page: number = 1, pageSize: number = 10): Promise<ArticlesResult | null> {
    const params = new URLSearchParams({
      q: keywords,
      page: page.toString(),
      pageSize: pageSize.toString(),
    });

    try {
      const res = await fetch(`/news?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch news');
      }

      const data = await res.json();
      return data as ArticlesResult;
    } catch (error) {
      console.error('Error fetching news:', error);
      return null;
    }
  }

  async getAllNews(page: number = 1, pageSize: number = 50): Promise<ArticlesResult | null> {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    });

    try {
      const res = await fetch(`/news?${params.toString()}`, {
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
        return null;
      }
      return await res.text(); 
    } catch (error) { 
      return null;
    }
  }

  async getNegativeToday(sessionToken: string = ''): Promise<ArticlesResult | null> {
    try {
      const res = await fetch('/news/negative-today', {
        method: 'GET',
        headers: sessionToken ? { 'Authorization': sessionToken } : undefined,
      });
      if (!res.ok) return null;
      const arr = await res.json() as Article[];
      return { articles: arr || [], totalResults: (arr || []).length, status: Statuses.OK } as ArticlesResult;
    } catch (err) {
      console.error('Error fetching negative today:', err);
      return null;
    }
  }

  async getCryptoToday(sessionToken: string = ''): Promise<ArticlesResult | null> {
    try {
      const res = await fetch('/news/crypto-today', {
        method: 'GET',
        headers: sessionToken ? { 'Authorization': sessionToken } : undefined,
      });
      if (!res.ok) return null;
      const arr = await res.json() as Article[];
      return { articles: arr || [], totalResults: (arr || []).length, status: Statuses.OK } as ArticlesResult;
    } catch (err) {
      console.error('Error fetching crypto today:', err);
      return null;
    }
  }

  async getNewsCount(): Promise<number> {
    try {
      const res = await fetch('/news/count', { method: 'GET' });
      if (!res.ok) return 0;
      const obj = await res.json();
      return obj?.count ?? 0;
    } catch (err) {
      console.error('Error fetching news count:', err);
      return 0;
    }
  }
}
