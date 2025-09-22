import { Injectable } from '@angular/core';

export interface Rating {
  id?: number;
  user_id?: number;
  rating: number;
  timestamp?: string;
  file_id?: number;
  search_id?: number;
}

@Injectable({
  providedIn: 'root'
})
export class RatingService {
  async addRating(rating: Rating) {
    try {
      const response = await fetch('/ratings/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(rating),
      });
      if (!response.ok) {
        throw new Error(`Error adding rating: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      return (error as Error).message;
    }
  }

  async getRatingsByUser(userId: number) {
    try {
      const response = await fetch('/ratings/getbyuser', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });
      if (!response.ok) {
        throw new Error(`Error fetching ratings: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      return (error as Error).message;
    }
  }

  async getRatingsByFile(fileId: number) {
    try {
      const response = await fetch('/ratings/getbyfile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fileId),
      });
      if (!response.ok) {
        throw new Error(`Error fetching ratings: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      return (error as Error).message;
    }
  }

  async getRatingsBySearch(searchId: number) {
    try {
      const response = await fetch('/ratings/getbysearch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchId),
      });
      if (!response.ok) {
        throw new Error(`Error fetching ratings: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      return (error as Error).message;
    }
  }
}
