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
}
