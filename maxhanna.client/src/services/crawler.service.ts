import { Injectable } from '@angular/core';  
@Injectable({
  providedIn: 'root'
})
export class CrawlerService {
  async searchUrl(url: string) {
    try {
      const response = await fetch(`/crawler/searchurl`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Url: url }),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async indexLink(url: string) { 
    try {
      const response = await fetch(`/crawler/indexlinks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(url)
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async indexCount() {
    try {
      const response = await fetch(`/crawler/indexcount`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
}
