import { Injectable } from '@angular/core';

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
  // Replace with actual backend API endpoint
  private apiUrl = '/api/ratings';

  async submitRating(userId: number, rating: number): Promise<any> {
    // Example POST request
    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, rating })
    });
    return res.json();
  }

  async getRating(userId: number): Promise<number> {
    // Example GET request
    const res = await fetch(`${this.apiUrl}?userId=${userId}`);
    const data = await res.json();
    return data.rating;
  }
}
