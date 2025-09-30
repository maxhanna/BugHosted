import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class MastermindService {
  // Generalized GET method
  async get<T>(url: string): Promise<T> {
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) throw new Error(response.statusText);
    return await response.json();
  }

  // Generalized POST method
  async post<T>(url: string, body?: any): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (!response.ok) throw new Error(response.statusText);
    return await response.json();
  }

  async getSequence(difficulty: string = 'easy', sequenceLength: number = 4): Promise<string[]> {
    return await this.get(`/mastermind/getsequence?difficulty=${difficulty}&sequenceLength=${sequenceLength}`);
  }

  async submitGuess(guess: string[], sequence: string[], userId: number, triesLeft: number, difficulty: string = 'easy', sequenceLength: number = 4): Promise<{ black: number; white: number }> {
    return await this.post('/mastermind/submitguess', {
      guess,
      sequence,
      userId,
      triesLeft,
      difficulty,
      sequenceLength
    });
  }

  async getBestScores(count: number = 10): Promise<any[]> {
    return await this.get(`/mastermind/getbestscores?count=${count}`);
  }

  async getBestScoresToday(count: number = 20): Promise<any[]> {
    return await this.get(`/mastermind/getbestscoresToday?count=${count}`);
  }

  async saveGameState(state: any): Promise<any> {
    return await this.post('/mastermind/savegamestate', state);
  }

  async loadGameState(userId: number): Promise<any> {
    return await this.get(`/mastermind/loadgamestate?userId=${userId}`);
  }

  async exitGame(userId: number): Promise<any> {
    return await this.post('/mastermind/exitgame', userId);
  }

  async getNumberOfGames(userId: number): Promise<number> {
    try {
      // API returns a plain number
      const response = await fetch(`/mastermind/getnumberofgames?userId=${userId}`, { method: 'GET' });
      if (!response.ok) return 0;
      const txt = await response.text();
      const n = parseInt(txt as string);
      return isNaN(n) ? 0 : n;
    } catch (e) {
      return 0;
    }
  }
}
