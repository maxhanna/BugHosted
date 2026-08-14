import { Injectable } from '@angular/core';

/** A Marbles high-score entry (single-player games only). */
export interface MarblesScore {
  id: number;
  userId: number;
  username: string;
  score: number;
  difficulty: number;
  durationSeconds: number;
  submitted: string;
}

/** Payload sent when a single-player (vs Computer) game finishes. */
export interface MarblesScoreRequest {
  userId: number;
  username: string;
  score: number;
  difficulty: number;
  durationSeconds: number;
}

@Injectable({ providedIn: 'root' })
export class MarblesService {
  /** Record a finished single-player game. Returns an error message, or null on success. */
  async addScore(req: MarblesScoreRequest): Promise<string | null> {
    try {
      const response = await fetch('/marbles/addscore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (!response.ok) {
        return `Error adding score: ${response.statusText}`;
      }
      return null;
    } catch (error) {
      console.error(error);
      return (error as Error).message;
    }
  }

  /** All-time leaderboard of single-player scores, plus the caller's own best. */
  async getHighScores(userId?: number): Promise<{ scores: MarblesScore[]; myBest: MarblesScore | null } | null> {
    try {
      const response = await fetch('/marbles/gethighscores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userId ? userId : null),
      });
      if (!response.ok) {
        throw new Error(`Error fetching high scores: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error(error);
      return null;
    }
  }
}
