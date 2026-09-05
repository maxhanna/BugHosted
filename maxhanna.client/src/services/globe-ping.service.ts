import { Injectable } from '@angular/core';

/** A user-placed ping on the globe — shared with everyone. */
export interface GlobeUserPing {
  id: number;
  userId: number;
  username: string;
  lat: number;
  lon: number;
  label?: string | null;
  createdUtc?: string;
}

@Injectable({ providedIn: 'root' })
export class GlobePingService {
  /** Every ping saved by any user — the globe is a shared board. */
  async getAll(): Promise<GlobeUserPing[]> {
    try {
      const response = await fetch('/globepings/all');
      if (!response.ok) return [];
      return (await response.json()) as GlobeUserPing[];
    } catch (error) {
      console.error('Error fetching globe pings:', error);
      return [];
    }
  }

  async create(userId: number, lat: number, lon: number, label?: string, sessionToken?: string): Promise<GlobeUserPing | null> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Encrypted-UserId'] = sessionToken;
      const response = await fetch('/globepings/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId, lat, lon, label: label || null }),
      });
      if (!response.ok) return null;
      const data = await response.json() as { id: number };
      return { id: data.id, userId, username: '', lat, lon, label: label || null };
    } catch (error) {
      console.error('Error creating globe ping:', error);
      return null;
    }
  }

  async remove(id: number, userId: number): Promise<boolean> {
    try {
      const response = await fetch(`/globepings/${id}?userId=${userId}`, { method: 'DELETE' });
      return response.ok;
    } catch (error) {
      console.error('Error deleting globe ping:', error);
      return false;
    }
  }
}
