import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class MastermindService {
  constructor(private http: HttpClient) {}

  getSequence(): Observable<string[]> {
    return this.http.get<string[]>('/mastermind/getsequence');
  }

  submitGuess(guess: string[], sequence: string[]): Observable<{ black: number; white: number }> {
    return this.http.post<{ black: number; white: number }>('/mastermind/submitguess', {
      guess,
      sequence
    });
  }

  getBestScores(): Observable<any[]> {
    return this.http.get<any[]>('/mastermind/getbestscores');
  }
}
