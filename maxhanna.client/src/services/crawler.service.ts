import { Injectable } from '@angular/core';  
@Injectable({
  providedIn: 'root'
})
export class CrawlerService {
  async searchUrl(url: string, currentPage = 1, pageSize = 10, exactMatch?: boolean, skipScrape?: boolean) {
    try {
      const response = await fetch(`/crawler/searchurl`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Url: url, CurrentPage: currentPage, PageSize: pageSize, ExactMatch: exactMatch, SkipScrape: skipScrape }),
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
  async storageStats() {
    try {
      const response = await fetch(`/crawler/getstoragestats`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async searchYoutube(keyword: string) {
    try {
      const response = await fetch(`/crawler/searchyoutube?keyword=${encodeURIComponent(keyword)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return await response.json();
    } catch (error) {
      console.error("YouTube search failed", error);
      return null;
    }
  }

}
