import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class MastermindService {
  constructor(private http: HttpClient) { }

  getSequence(difficulty: string = 'easy', sequenceLength: number = 4): Observable<string[]> {
    return this.http.get<string[]>(`/mastermind/getsequence?difficulty=${difficulty}&sequenceLength=${sequenceLength}`);
  }

  submitGuess(guess: string[], sequence: string[], userId: number, triesLeft: number, difficulty: string = 'easy', sequenceLength: number = 4): Observable<{ black: number; white: number }> {
    return this.http.post<{ black: number; white: number }>('/mastermind/submitguess', {
      guess,
      sequence,
      userId,
      triesLeft,
      difficulty,
      sequenceLength
    });
  }

  getBestScores(): Observable<any[]> {
    return this.http.get<any[]>('/mastermind/getbestscores');
  }

  saveGameState(state: any): Observable<any> {
    return this.http.post('/mastermind/savegamestate', state);
  }

  loadGameState(userId: number): Observable<any> {
    return this.http.get(`/mastermind/loadgamestate?userId=${userId}`);
  }

  exitGame(userId: number): Observable<any> {
    return this.http.post('/mastermind/exitgame',  userId);
  }
}
