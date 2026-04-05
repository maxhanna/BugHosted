import { Injectable } from '@angular/core';

import { User } from './datacontracts/user/user';
export interface Rating {
  id?: number;
  user?: User;
  value: number;
  timestamp?: string;
  file_id?: number;
  search_id?: number;
}

@Injectable({ providedIn: 'root' })
export class RatingsService {
  async getRatingsByFile(fileId: number): Promise<Rating[] | undefined> {
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
      console.error('Failed to fetch ratings by file', error);
      return undefined;
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
  async submitRating(user: User, value: number, fileId?: number, searchId?: number): Promise<any> {
    try {
      const res = await fetch('/ratings/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          User: user,
          Value: value,
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
