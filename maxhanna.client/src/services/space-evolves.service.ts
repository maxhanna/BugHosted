import { Injectable } from '@angular/core';

export interface SpaceEvolvesRun {
  runId?: string;
  wave: number;
  level: number;
  score: number;
  experience: number;
  nextLevel: number;
  player: any;
  stats: any;
  upgrades: string[];
  /** Kills completed toward the current wave quota — restores the boss
   *  countdown correctly after a refresh. */
  waveKills?: number;
  gameOver: boolean;
}

@Injectable({ providedIn: 'root' })
export class SpaceEvolvesService {
  async getActiveRun(userId: number): Promise<SpaceEvolvesRun | null> {
    if (!userId) return null;
    try {
      const response = await fetch(`/spaceevolves/run/${userId}`, { credentials: 'include' });
      return response.ok ? await response.json() : null;
    } catch { return null; }
  }

  async saveRun(userId: number, run: SpaceEvolvesRun): Promise<boolean> {
    if (!userId || run.gameOver) return false;
    try {
      const response = await fetch('/spaceevolves/run', {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...run, gameOver: false })
      });
      return response.ok;
    } catch { return false; }
  }

  async endRun(userId: number, run: SpaceEvolvesRun): Promise<boolean> {
    if (!userId) return false;
    try {
      const response = await fetch('/spaceevolves/run/end', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...run, gameOver: true })
      });
      return response.ok;
    } catch { return false; }
  }

  async getHighScores(limit = 10): Promise<any[]> {
    try {
      const response = await fetch(`/spaceevolves/highscores?limit=${Math.max(1, Math.min(100, limit))}`);
      return response.ok ? await response.json() : [];
    } catch { return []; }
  }
}
