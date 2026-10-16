import { Injectable } from '@angular/core';

export interface D2SaveData {
  exists: boolean;
  gold?: number;
  potions?: number;
  inventory?: string;
  equipped?: string;
  runSnapshot?: string | null;
}

export interface D2SaveRequest {
  userId: number;
  gold: number;
  potions: number;
  inventory: string;
  equipped: string;
  runSnapshot: string | null;
}

export interface D2RecordRunRequest {
  userId: number;
  timeSeconds: number;
  kills: number;
  level: number;
  victory: boolean;
}

export interface D2HighScore {
  id: number;
  userId: number;
  username: string;
  score: number;
  timeSeconds: number;
  kills: number;
  level: number;
  victory: boolean;
  createdAt: string;
}

export interface D2ApiResult<T> {
  ok: boolean;
  data: T | null;
}

@Injectable({
  providedIn: 'root'
})
export class D2SurvivorsService {

  private async post<T>(url: string, body: unknown, sessionToken?: string, keepalive = false): Promise<D2ApiResult<T>> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Encrypted-UserId'] = sessionToken;
      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), keepalive });
      if (!response.ok) return { ok: false, data: null };
      const text = await response.text();
      return { ok: true, data: text ? (JSON.parse(text) as T) : null };
    } catch (error) {
      console.error(`D2 Survivors request failed: ${url}`, error);
      return { ok: false, data: null };
    }
  }

  getSave(userId: number, sessionToken: string) {
    return this.post<D2SaveData>('/d2survivors/getsave', { userId }, sessionToken);
  }

  save(request: D2SaveRequest, sessionToken: string, keepalive = false) {
    return this.post<unknown>('/d2survivors/save', request, sessionToken, keepalive);
  }

  recordRun(request: D2RecordRunRequest, sessionToken: string) {
    return this.post<{ score: number }>('/d2survivors/recordrun', request, sessionToken);
  }

  getHighScores(limit = 10) {
    return this.post<D2HighScore[]>('/d2survivors/highscores', limit);
  }
}
