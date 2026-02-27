import { Injectable } from '@angular/core';

export interface Rating {
  id?: number;
  user_id?: number;
  rating: number;
  timestamp?: string;
  file_id?: number;
  search_id?: number;
}

@Injectable({ providedIn: 'root' })
export class RatingsService {
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
        throw new Error(`Error fetching ratings by file: ${response.statusText}`);
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
        throw new Error(`Error fetching ratings by search: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      return (error as Error).message;
    }
  }
  async submitRating(userId: number, rating: number, fileId?: number, searchId?: number): Promise<any> {
    try {
      const res = await fetch('/ratings/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          UserId: userId,
          RatingValue: rating,
          FileId: fileId ?? null,
          SearchId: searchId ?? null
        })
      });
      if (!res.ok) {
        throw new Error(`Error submitting rating: ${res.statusText}`);
      }
      return await res.json();
    } catch (error) {
      console.error('Failed to submit rating', error);
      return null;
    }
  }
}
