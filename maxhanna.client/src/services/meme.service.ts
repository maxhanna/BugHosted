import { Injectable } from '@angular/core';
import { User } from './datacontracts/user';
import { HttpClient, HttpEvent, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs/internal/Observable';
import { FileComment } from './datacontracts/file-comment';

@Injectable({
  providedIn: 'root'
})
export class MemeService {
  constructor(private http: HttpClient) { }

  async getMeme(memeId: number) {
    const response = await fetch(`/meme/getmeme/${memeId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`Error fetching meme: ${response.statusText}`);
    }

    const headers: Record<string, string> = {};
    response.headers.forEach((value: string, name: string) => {
      headers[name] = value;
    });

    const blob = await response.blob();
    return { blob, headers };
  }
    

  async getMemes(user: User) {
    try {
      const response = await fetch(`/meme/getmemes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      return await response.json();
    } catch (error) {
      throw error;
    }
  }
  async updateMemeName(user: User, memeId: number, text: string) {
    try {
      const response = await fetch(`/meme/updatememename/${memeId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, text }),
      });

      return await response.text();
    } catch (error) {
      throw error;
    }
  }

  async searchForMemes(user: User, keywords: string) {
    try {
      const response = await fetch(`/meme/searchmemes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, keywords }),
      });

      return await response.json();
    } catch (error) {
      throw error;
    }
  } 
}
