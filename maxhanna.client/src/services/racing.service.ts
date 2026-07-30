import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RaceResult, RacingPlayerCar, RaceState, TrackDefinition } from './datacontracts/racing/racing-types';

@Injectable({
  providedIn: 'root'
})
export class RacingService {
  private baseUrl = '/racing';

  constructor(private http: HttpClient) { }

  async getPlayerCar(userId: number): Promise<RacingPlayerCar | null> {
    try {
      return await this.http.get<RacingPlayerCar>(`${this.baseUrl}/car/${userId}`).toPromise() ?? null;
    } catch { return null; }
  }

  async savePlayerCar(car: RacingPlayerCar): Promise<boolean> {
    try {
      await this.http.post(`${this.baseUrl}/car/save`, car).toPromise();
      return true;
    } catch { return false; }
  }

  async buyUpgrade(userId: number, upgradeId: number): Promise<RacingPlayerCar | null> {
    try {
      return await this.http.post<RacingPlayerCar>(`${this.baseUrl}/car/upgrade`, { userId, upgradeId }).toPromise() ?? null;
    } catch { return null; }
  }

  async buySkin(userId: number, skinId: number): Promise<RacingPlayerCar | null> {
    try {
      return await this.http.post<RacingPlayerCar>(`${this.baseUrl}/car/skin`, { userId, skinId }).toPromise() ?? null;
    } catch { return null; }
  }

  async submitRaceResult(userId: number, result: RaceResult): Promise<any> {
    try {
      return await this.http.post(`${this.baseUrl}/race/result`, { userId, result }).toPromise();
    } catch { return null; }
  }

  async getRaceState(raceId: number): Promise<RaceState | null> {
    try {
      return await this.http.get<RaceState>(`${this.baseUrl}/race/${raceId}`).toPromise() ?? null;
    } catch { return null; }
  }

  async getLeaderboard(trackId: number): Promise<RaceResult[]> {
    try {
      return await this.http.get<RaceResult[]>(`${this.baseUrl}/leaderboard/${trackId}`).toPromise() ?? [];
    } catch { return []; }
  }

  async joinRace(userId: number, trackId: number): Promise<any> {
    try {
      return await this.http.post(`${this.baseUrl}/race/join`, { userId, trackId }).toPromise();
    } catch { return null; }
  }

  async getTracks(): Promise<TrackDefinition[]> {
    try {
      return await this.http.get<TrackDefinition[]>(`${this.baseUrl}/tracks`).toPromise() ?? [];
    } catch { return []; }
  }
}
